import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

// Validation schemas
const createPaymentSchema = z.object({
  invoiceId: z.string(),
  amount: z.number().positive(),
  paymentDate: z.string().datetime().optional(),
  paymentMethod: z.enum(['CHECK', 'CREDIT_CARD', 'ACH', 'WIRE', 'CASH', 'OTHER']),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
});

const updatePaymentSchema = z.object({
  paymentDate: z.string().datetime().optional(),
  paymentMethod: z.enum(['CHECK', 'CREDIT_CARD', 'ACH', 'WIRE', 'CASH', 'OTHER']).optional(),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REFUNDED']).optional(),
});

// Generate payment number
async function generatePaymentNumber() {
  const count = await prisma.payment.count();
  const num = count + 1;
  return `PMT-${String(num).padStart(7, '0')}`;
}

// List payments
export async function listPayments(req, res, next) {
  try {
    const {
      invoiceId,
      accountId,
      status,
      paymentMethod,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
      sortBy = 'paymentDate',
      sortOrder = 'desc',
    } = req.query;

    const where = {};

    if (invoiceId) where.invoiceId = invoiceId;
    if (status) where.status = status;
    if (paymentMethod) where.paymentMethod = paymentMethod;

    if (accountId) {
      where.invoice = { accountId };
    }

    if (dateFrom || dateTo) {
      where.paymentDate = {};
      if (dateFrom) where.paymentDate.gte = new Date(dateFrom);
      if (dateTo) where.paymentDate.lte = new Date(dateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              account: { select: { id: true, name: true } },
            },
          },
        },
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({
      data: payments,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    next(error);
  }
}

// Get single payment
export async function getPayment(req, res, next) {
  try {
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: {
          include: {
            account: true,
            lineItems: true,
          },
        },
      },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    next(error);
  }
}

// Create payment (record payment on invoice)
export async function createPayment(req, res, next) {
  try {
    const data = createPaymentSchema.parse(req.body);

    // Verify invoice exists and get current balance
    const invoice = await prisma.invoice.findUnique({
      where: { id: data.invoiceId },
      include: { account: true },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status === 'VOID') {
      return res.status(400).json({ error: 'Cannot apply payment to voided invoice' });
    }

    if (invoice.status === 'PAID') {
      return res.status(400).json({ error: 'Invoice is already fully paid' });
    }

    const balanceDue = invoice.balanceDue.toNumber();
    if (data.amount > balanceDue) {
      return res.status(400).json({
        error: `Payment amount ($${data.amount}) exceeds balance due ($${balanceDue})`,
      });
    }

    const paymentNumber = await generatePaymentNumber();

    // Create payment and update invoice in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create payment record
      const payment = await tx.payment.create({
        data: {
          paymentNumber,
          invoiceId: data.invoiceId,
          amount: data.amount,
          paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
          paymentMethod: data.paymentMethod,
          referenceNumber: data.referenceNumber,
          notes: data.notes,
          status: 'COMPLETED',
        },
      });

      // Update invoice
      const newAmountPaid = new Decimal(invoice.amountPaid).plus(data.amount).toNumber();
      const newBalanceDue = new Decimal(invoice.total).minus(newAmountPaid).toNumber();

      let newStatus = invoice.status;
      if (newBalanceDue <= 0) {
        newStatus = 'PAID';
      } else if (newAmountPaid > 0) {
        newStatus = 'PARTIAL';
      }

      const updatedInvoice = await tx.invoice.update({
        where: { id: data.invoiceId },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: newBalanceDue,
          status: newStatus,
        },
      });

      return { payment, invoice: updatedInvoice };
    });

    res.status(201).json({
      payment: result.payment,
      invoice: {
        id: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
        status: result.invoice.status,
        amountPaid: result.invoice.amountPaid,
        balanceDue: result.invoice.balanceDue,
      },
    });
  } catch (error) {
    next(error);
  }
}

// Update payment
export async function updatePayment(req, res, next) {
  try {
    const { id } = req.params;
    const data = updatePaymentSchema.parse(req.body);

    const existing = await prisma.payment.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Don't allow updating refunded payments
    if (existing.status === 'REFUNDED') {
      return res.status(400).json({ error: 'Cannot update refunded payment' });
    }

    const payment = await prisma.payment.update({
      where: { id },
      data: {
        ...data,
        paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
      },
      include: {
        invoice: {
          select: { id: true, invoiceNumber: true },
        },
      },
    });

    res.json(payment);
  } catch (error) {
    next(error);
  }
}

// Refund payment
export async function refundPayment(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const payment = await prisma.payment.findUnique({
      where: { id },
      include: { invoice: true },
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status === 'REFUNDED') {
      return res.status(400).json({ error: 'Payment already refunded' });
    }

    if (payment.status !== 'COMPLETED') {
      return res.status(400).json({ error: 'Can only refund completed payments' });
    }

    // Refund and update invoice in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update payment status
      const refundedPayment = await tx.payment.update({
        where: { id },
        data: {
          status: 'REFUNDED',
          notes: payment.notes
            ? `${payment.notes}\n\nRefund Reason: ${reason || 'Not specified'}`
            : `Refund Reason: ${reason || 'Not specified'}`,
        },
      });

      // Update invoice - reverse the payment
      const invoice = payment.invoice;
      const newAmountPaid = new Decimal(invoice.amountPaid).minus(payment.amount).toNumber();
      const newBalanceDue = new Decimal(invoice.total).minus(newAmountPaid).toNumber();

      let newStatus = 'PENDING';
      if (newAmountPaid > 0) {
        newStatus = 'PARTIAL';
      }
      // Check if overdue
      if (invoice.dueDate && invoice.dueDate < new Date()) {
        newStatus = 'OVERDUE';
      }

      const updatedInvoice = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: newBalanceDue,
          status: newStatus,
        },
      });

      return { payment: refundedPayment, invoice: updatedInvoice };
    });

    res.json({
      payment: result.payment,
      invoice: {
        id: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
        status: result.invoice.status,
        amountPaid: result.invoice.amountPaid,
        balanceDue: result.invoice.balanceDue,
      },
      message: 'Payment refunded successfully',
    });
  } catch (error) {
    next(error);
  }
}

// Delete payment (only pending payments)
export async function deletePayment(req, res, next) {
  try {
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({ where: { id } });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    if (payment.status !== 'PENDING') {
      return res.status(400).json({
        error: 'Can only delete pending payments. Use refund for completed payments.',
      });
    }

    await prisma.payment.delete({ where: { id } });

    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// Get payments by invoice
export async function getPaymentsByInvoice(req, res, next) {
  try {
    const { invoiceId } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        amountPaid: true,
        balanceDue: true,
        status: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const payments = await prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { paymentDate: 'desc' },
    });

    res.json({
      invoice,
      payments,
      summary: {
        totalPayments: payments.length,
        completedPayments: payments.filter((p) => p.status === 'COMPLETED').length,
        refundedPayments: payments.filter((p) => p.status === 'REFUNDED').length,
      },
    });
  } catch (error) {
    next(error);
  }
}

// Get payment statistics
export async function getPaymentStats(req, res, next) {
  try {
    const { dateFrom, dateTo, accountId } = req.query;

    const where = { status: 'COMPLETED' };

    if (dateFrom || dateTo) {
      where.paymentDate = {};
      if (dateFrom) where.paymentDate.gte = new Date(dateFrom);
      if (dateTo) where.paymentDate.lte = new Date(dateTo);
    }

    if (accountId) {
      where.invoice = { accountId };
    }

    const [total, byMethod, aggregates] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.groupBy({
        by: ['paymentMethod'],
        where,
        _count: { paymentMethod: true },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where,
        _sum: { amount: true },
        _avg: { amount: true },
        _max: { amount: true },
        _min: { amount: true },
      }),
    ]);

    // Get refunds separately
    const refunds = await prisma.payment.aggregate({
      where: { ...where, status: 'REFUNDED' },
      _sum: { amount: true },
      _count: true,
    });

    res.json({
      total,
      byMethod: byMethod.reduce((acc, m) => {
        acc[m.paymentMethod] = {
          count: m._count.paymentMethod,
          total: m._sum.amount?.toNumber() || 0,
        };
        return acc;
      }, {}),
      totals: {
        collected: aggregates._sum.amount?.toNumber() || 0,
        average: aggregates._avg.amount?.toNumber() || 0,
        largest: aggregates._max.amount?.toNumber() || 0,
        smallest: aggregates._min.amount?.toNumber() || 0,
      },
      refunds: {
        count: refunds._count || 0,
        total: refunds._sum.amount?.toNumber() || 0,
      },
    });
  } catch (error) {
    next(error);
  }
}

// Batch payment (pay multiple invoices at once)
export async function batchPayment(req, res, next) {
  try {
    const schema = z.object({
      payments: z.array(
        z.object({
          invoiceId: z.string(),
          amount: z.number().positive(),
        })
      ),
      paymentMethod: z.enum(['CHECK', 'CREDIT_CARD', 'ACH', 'WIRE', 'CASH', 'OTHER']),
      referenceNumber: z.string().optional(),
      paymentDate: z.string().datetime().optional(),
      notes: z.string().optional(),
    });

    const data = schema.parse(req.body);

    // Verify all invoices exist and calculate total
    const invoiceIds = data.payments.map((p) => p.invoiceId);
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: invoiceIds } },
    });

    if (invoices.length !== invoiceIds.length) {
      return res.status(404).json({ error: 'One or more invoices not found' });
    }

    // Check for voided/paid invoices
    const invalid = invoices.filter((i) => i.status === 'VOID' || i.status === 'PAID');
    if (invalid.length > 0) {
      return res.status(400).json({
        error: 'Cannot apply payments to voided or paid invoices',
        invalidInvoices: invalid.map((i) => i.invoiceNumber),
      });
    }

    // Process all payments in transaction
    const results = await prisma.$transaction(async (tx) => {
      const processed = [];

      for (const paymentData of data.payments) {
        const invoice = invoices.find((i) => i.id === paymentData.invoiceId);
        const paymentNumber = await generatePaymentNumber();

        // Create payment
        const payment = await tx.payment.create({
          data: {
            paymentNumber,
            invoiceId: paymentData.invoiceId,
            amount: paymentData.amount,
            paymentDate: data.paymentDate ? new Date(data.paymentDate) : new Date(),
            paymentMethod: data.paymentMethod,
            referenceNumber: data.referenceNumber,
            notes: data.notes,
            status: 'COMPLETED',
          },
        });

        // Update invoice
        const newAmountPaid = new Decimal(invoice.amountPaid).plus(paymentData.amount).toNumber();
        const newBalanceDue = new Decimal(invoice.total).minus(newAmountPaid).toNumber();

        let newStatus = invoice.status;
        if (newBalanceDue <= 0) {
          newStatus = 'PAID';
        } else if (newAmountPaid > 0) {
          newStatus = 'PARTIAL';
        }

        const updatedInvoice = await tx.invoice.update({
          where: { id: paymentData.invoiceId },
          data: {
            amountPaid: newAmountPaid,
            balanceDue: newBalanceDue,
            status: newStatus,
          },
        });

        processed.push({
          payment,
          invoice: {
            id: updatedInvoice.id,
            invoiceNumber: updatedInvoice.invoiceNumber,
            status: updatedInvoice.status,
            balanceDue: updatedInvoice.balanceDue,
          },
        });
      }

      return processed;
    });

    const totalAmount = data.payments.reduce((sum, p) => sum + p.amount, 0);

    res.status(201).json({
      message: `Batch payment processed: ${results.length} invoices`,
      totalAmount,
      payments: results,
    });
  } catch (error) {
    next(error);
  }
}
