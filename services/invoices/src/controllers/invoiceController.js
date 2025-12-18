import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { addDays, differenceInDays, format, parseISO } from 'date-fns';

const prisma = new PrismaClient();

// Validation schemas
const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().positive().default(1),
  unitPrice: z.number().nonnegative(),
});

const createInvoiceSchema = z.object({
  accountId: z.string(),
  invoiceDate: z.string().datetime().optional(),
  terms: z.number().int().positive().default(30),
  tax: z.number().nonnegative().default(0),
  lineItems: z.array(lineItemSchema),
});

const updateInvoiceSchema = z.object({
  invoiceDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  terms: z.number().int().positive().optional(),
  tax: z.number().nonnegative().optional(),
  status: z.enum(['DRAFT', 'PENDING', 'SENT', 'PARTIAL', 'PAID', 'OVERDUE', 'VOID']).optional(),
});

// Generate invoice number
async function generateInvoiceNumber() {
  const count = await prisma.invoice.count();
  const num = count + 1;
  return `INV-${String(num).padStart(7, '0')}`;
}

// Calculate invoice totals
function calculateTotals(lineItems, taxAmount = 0) {
  let subtotal = new Decimal(0);

  const processedItems = lineItems.map((item) => {
    const itemTotal = new Decimal(item.quantity).times(item.unitPrice);
    subtotal = subtotal.plus(itemTotal);

    return {
      ...item,
      totalPrice: itemTotal.toNumber(),
    };
  });

  const tax = new Decimal(taxAmount);
  const total = subtotal.plus(tax);

  return {
    lineItems: processedItems,
    subtotal: subtotal.toNumber(),
    tax: tax.toNumber(),
    total: total.toNumber(),
  };
}

// List invoices
export async function listInvoices(req, res, next) {
  try {
    const {
      accountId,
      status,
      isOverdue,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const where = {};

    if (accountId) where.accountId = accountId;
    if (status) where.status = status;

    if (isOverdue === 'true') {
      where.status = { in: ['PENDING', 'SENT', 'PARTIAL'] };
      where.dueDate = { lt: new Date() };
    }

    if (dateFrom || dateTo) {
      where.invoiceDate = {};
      if (dateFrom) where.invoiceDate.gte = new Date(dateFrom);
      if (dateTo) where.invoiceDate.lte = new Date(dateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          account: { select: { id: true, name: true } },
          payments: { select: { id: true, amount: true, paymentDate: true, status: true } },
          lineItems: true,
        },
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.invoice.count({ where }),
    ]);

    // Add calculated fields
    const invoicesWithCalc = invoices.map((inv) => ({
      ...inv,
      daysOverdue: inv.dueDate && inv.status !== 'PAID' && inv.status !== 'VOID'
        ? Math.max(0, differenceInDays(new Date(), inv.dueDate))
        : 0,
      paymentCount: inv.payments.length,
    }));

    res.json({
      data: invoicesWithCalc,
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

// Get single invoice
export async function getInvoice(req, res, next) {
  try {
    const { id } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        account: true,
        payments: {
          orderBy: { paymentDate: 'desc' },
        },
        lineItems: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Calculate overdue info
    const daysOverdue = invoice.dueDate && invoice.status !== 'PAID' && invoice.status !== 'VOID'
      ? Math.max(0, differenceInDays(new Date(), invoice.dueDate))
      : 0;

    res.json({
      ...invoice,
      daysOverdue,
      isOverdue: daysOverdue > 0,
    });
  } catch (error) {
    next(error);
  }
}

// Create invoice
export async function createInvoice(req, res, next) {
  try {
    const data = createInvoiceSchema.parse(req.body);
    const invoiceNumber = await generateInvoiceNumber();

    // Verify account exists
    const account = await prisma.account.findUnique({
      where: { id: data.accountId },
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Calculate totals
    const { lineItems, subtotal, tax, total } = calculateTotals(data.lineItems, data.tax);

    const invoiceDate = data.invoiceDate ? new Date(data.invoiceDate) : new Date();
    const dueDate = addDays(invoiceDate, data.terms);

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        accountId: data.accountId,
        status: 'DRAFT',
        invoiceDate,
        dueDate,
        terms: data.terms,
        subtotal,
        tax,
        total,
        amountPaid: 0,
        balanceDue: total,
        lineItems: {
          create: lineItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
          })),
        },
      },
      include: {
        account: { select: { id: true, name: true } },
        lineItems: true,
      },
    });

    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
}

// Update invoice
export async function updateInvoice(req, res, next) {
  try {
    const { id } = req.params;
    const data = updateInvoiceSchema.parse(req.body);

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    // Don't allow updates to paid or void invoices
    if (existing.status === 'PAID' || existing.status === 'VOID') {
      return res.status(400).json({ error: `Cannot update ${existing.status.toLowerCase()} invoice` });
    }

    const updateData = { ...data };

    // Recalculate due date if terms or invoice date changed
    if (data.invoiceDate || data.terms) {
      const invoiceDate = data.invoiceDate
        ? new Date(data.invoiceDate)
        : existing.invoiceDate;
      const terms = data.terms || existing.terms;
      updateData.dueDate = addDays(invoiceDate, terms);
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        ...updateData,
        invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : undefined,
        dueDate: updateData.dueDate,
      },
      include: {
        account: { select: { id: true, name: true } },
        lineItems: true,
        payments: true,
      },
    });

    res.json(invoice);
  } catch (error) {
    next(error);
  }
}

// Delete invoice
export async function deleteInvoice(req, res, next) {
  try {
    const { id } = req.params;

    const existing = await prisma.invoice.findUnique({
      where: { id },
      include: { payments: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (existing.payments.length > 0) {
      return res.status(400).json({ error: 'Cannot delete invoice with payments' });
    }

    // Delete line items first (cascade should handle this, but being explicit)
    await prisma.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
    await prisma.invoice.delete({ where: { id } });

    res.json({ message: 'Invoice deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// Send invoice (mark as sent)
export async function sendInvoice(req, res, next) {
  try {
    const { id } = req.params;

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (existing.status !== 'DRAFT' && existing.status !== 'PENDING') {
      return res.status(400).json({ error: 'Invoice already sent or processed' });
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: { status: 'SENT' },
      include: {
        account: { select: { id: true, name: true, email: true } },
        lineItems: true,
      },
    });

    // In production, this would trigger email sending
    // For now, just return the updated invoice
    res.json({
      invoice,
      message: 'Invoice marked as sent',
    });
  } catch (error) {
    next(error);
  }
}

// Void invoice
export async function voidInvoice(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const existing = await prisma.invoice.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (existing.status === 'PAID') {
      return res.status(400).json({ error: 'Cannot void paid invoice' });
    }

    if (existing.status === 'VOID') {
      return res.status(400).json({ error: 'Invoice already voided' });
    }

    const invoice = await prisma.invoice.update({
      where: { id },
      data: {
        status: 'VOID',
        // Store void reason in a note or custom field if needed
      },
    });

    res.json({
      invoice,
      message: 'Invoice voided',
      reason,
    });
  } catch (error) {
    next(error);
  }
}

// Apply late fee (replicates Late Fee Flow)
export async function applyLateFee(req, res, next) {
  try {
    const { id } = req.params;
    const { rate = 1.5 } = req.body; // 1.5% default

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { lineItems: true },
    });

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.status === 'PAID' || invoice.status === 'VOID') {
      return res.status(400).json({ error: 'Cannot apply late fee to this invoice' });
    }

    if (!invoice.dueDate || invoice.dueDate > new Date()) {
      return res.status(400).json({ error: 'Invoice is not overdue' });
    }

    // Calculate late fee
    const lateFee = new Decimal(invoice.balanceDue).times(rate / 100).toNumber();

    // Add late fee as line item
    await prisma.invoiceLineItem.create({
      data: {
        invoiceId: id,
        description: `Late Fee (${rate}%)`,
        quantity: 1,
        unitPrice: lateFee,
        totalPrice: lateFee,
      },
    });

    // Update invoice totals
    const newSubtotal = new Decimal(invoice.subtotal).plus(lateFee).toNumber();
    const newTotal = new Decimal(invoice.total).plus(lateFee).toNumber();
    const newBalanceDue = new Decimal(invoice.balanceDue).plus(lateFee).toNumber();

    const updatedInvoice = await prisma.invoice.update({
      where: { id },
      data: {
        subtotal: newSubtotal,
        total: newTotal,
        balanceDue: newBalanceDue,
        status: 'OVERDUE',
      },
      include: {
        account: { select: { id: true, name: true } },
        lineItems: true,
      },
    });

    res.json({
      invoice: updatedInvoice,
      lateFeeApplied: lateFee,
      rate,
    });
  } catch (error) {
    next(error);
  }
}

// Get invoices by account
export async function getInvoicesByAccount(req, res, next) {
  try {
    const { accountId } = req.params;

    const invoices = await prisma.invoice.findMany({
      where: { accountId },
      include: {
        payments: { select: { amount: true, status: true } },
        lineItems: true,
      },
      orderBy: { invoiceDate: 'desc' },
    });

    // Summary stats
    const stats = {
      total: invoices.length,
      byStatus: {},
      totalBilled: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      overdueAmount: 0,
    };

    invoices.forEach((inv) => {
      stats.byStatus[inv.status] = (stats.byStatus[inv.status] || 0) + 1;
      stats.totalBilled += inv.total.toNumber();
      stats.totalPaid += inv.amountPaid.toNumber();
      stats.totalOutstanding += inv.balanceDue.toNumber();

      if (inv.status === 'OVERDUE' || (inv.dueDate && inv.dueDate < new Date() && inv.balanceDue.toNumber() > 0)) {
        stats.overdueAmount += inv.balanceDue.toNumber();
      }
    });

    res.json({
      accountId,
      stats,
      invoices,
    });
  } catch (error) {
    next(error);
  }
}

// Get invoice statistics
export async function getInvoiceStats(req, res, next) {
  try {
    const { dateFrom, dateTo } = req.query;

    const where = {};
    if (dateFrom || dateTo) {
      where.invoiceDate = {};
      if (dateFrom) where.invoiceDate.gte = new Date(dateFrom);
      if (dateTo) where.invoiceDate.lte = new Date(dateTo);
    }

    const [total, byStatus, aggregates] = await Promise.all([
      prisma.invoice.count({ where }),
      prisma.invoice.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
        _sum: { total: true, balanceDue: true },
      }),
      prisma.invoice.aggregate({
        where,
        _sum: { total: true, amountPaid: true, balanceDue: true },
        _avg: { total: true },
      }),
    ]);

    // Count overdue
    const overdue = await prisma.invoice.count({
      where: {
        ...where,
        status: { in: ['PENDING', 'SENT', 'PARTIAL'] },
        dueDate: { lt: new Date() },
      },
    });

    res.json({
      total,
      overdue,
      byStatus: byStatus.reduce((acc, s) => {
        acc[s.status] = {
          count: s._count.status,
          totalAmount: s._sum.total?.toNumber() || 0,
          balanceDue: s._sum.balanceDue?.toNumber() || 0,
        };
        return acc;
      }, {}),
      totals: {
        billed: aggregates._sum.total?.toNumber() || 0,
        paid: aggregates._sum.amountPaid?.toNumber() || 0,
        outstanding: aggregates._sum.balanceDue?.toNumber() || 0,
        average: aggregates._avg.total?.toNumber() || 0,
      },
    });
  } catch (error) {
    next(error);
  }
}

// Check and update overdue status (batch job)
export async function updateOverdueStatus(req, res, next) {
  try {
    const result = await prisma.invoice.updateMany({
      where: {
        status: { in: ['PENDING', 'SENT', 'PARTIAL'] },
        dueDate: { lt: new Date() },
      },
      data: { status: 'OVERDUE' },
    });

    res.json({
      message: 'Overdue status updated',
      updatedCount: result.count,
    });
  } catch (error) {
    next(error);
  }
}
