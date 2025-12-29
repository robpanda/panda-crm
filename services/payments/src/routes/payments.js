import express from 'express';
import { PrismaClient } from '@prisma/client';
import { stripeService } from '../services/stripeService.js';
import { logger } from '../middleware/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get payment statistics
router.get('/stats', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const where = {};
    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate) where.paymentDate.gte = new Date(startDate);
      if (endDate) where.paymentDate.lte = new Date(endDate);
    }

    // Get total count and amount
    const totals = await prisma.payment.aggregate({
      where,
      _count: { id: true },
      _sum: { amount: true },
    });

    // Get counts by status
    const byStatus = await prisma.payment.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
      _sum: { amount: true },
    });

    // Get counts by payment method
    const byMethod = await prisma.payment.groupBy({
      by: ['paymentMethod'],
      where,
      _count: { id: true },
      _sum: { amount: true },
    });

    // Get recent payments (last 30 days) for trend
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentPayments = await prisma.payment.aggregate({
      where: {
        ...where,
        paymentDate: { gte: thirtyDaysAgo },
        status: 'SETTLED',
      },
      _count: { id: true },
      _sum: { amount: true },
    });

    res.json({
      success: true,
      data: {
        total: {
          count: totals._count.id || 0,
          amount: parseFloat(totals._sum.amount || 0),
        },
        byStatus: byStatus.reduce((acc, item) => {
          acc[item.status] = {
            count: item._count.id,
            amount: parseFloat(item._sum.amount || 0),
          };
          return acc;
        }, {}),
        byMethod: byMethod.reduce((acc, item) => {
          acc[item.paymentMethod] = {
            count: item._count.id,
            amount: parseFloat(item._sum.amount || 0),
          };
          return acc;
        }, {}),
        last30Days: {
          count: recentPayments._count.id || 0,
          amount: parseFloat(recentPayments._sum.amount || 0),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create payment intent for an invoice
router.post('/intent', async (req, res, next) => {
  try {
    const { invoiceId, amount, accountId, description } = req.body;

    // Get account to find or create Stripe customer
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { contacts: { take: 1 } },
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Account not found' },
      });
    }

    // Create Stripe customer if doesn't exist
    let stripeCustomerId = account.stripeCustomerId;
    if (!stripeCustomerId) {
      const primaryContact = account.contacts[0];
      const customer = await stripeService.createCustomer({
        email: primaryContact?.email || `${account.id}@panda-crm.local`,
        name: account.name,
        phone: primaryContact?.phone,
        metadata: { accountId: account.id },
      });

      stripeCustomerId = customer.id;

      await prisma.account.update({
        where: { id: accountId },
        data: { stripeCustomerId },
      });
    }

    // Create payment intent
    const paymentIntent = await stripeService.createPaymentIntent({
      amount,
      customerId: stripeCustomerId,
      description: description || `Payment for ${account.name}`,
      metadata: {
        accountId,
        invoiceId: invoiceId || '',
      },
    });

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount / 100,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get payment intent status
router.get('/intent/:paymentIntentId', async (req, res, next) => {
  try {
    const { paymentIntentId } = req.params;

    const paymentIntent = await stripeService.getPaymentIntent(paymentIntentId);

    res.json({
      success: true,
      data: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Cancel payment intent
router.post('/intent/:paymentIntentId/cancel', async (req, res, next) => {
  try {
    const { paymentIntentId } = req.params;

    const paymentIntent = await stripeService.cancelPaymentIntent(paymentIntentId);

    res.json({
      success: true,
      data: { id: paymentIntent.id, status: paymentIntent.status },
    });
  } catch (error) {
    next(error);
  }
});

// Record a payment (after successful Stripe payment)
router.post('/', async (req, res, next) => {
  try {
    const {
      invoiceId,
      amount,
      paymentMethod,
      stripePaymentIntentId,
      stripeChargeId,
      stripeReceiptUrl,
      stripePaymentMethodId,
      referenceNumber,
      notes,
    } = req.body;

    // Generate payment number
    const lastPayment = await prisma.payment.findFirst({
      orderBy: { paymentNumber: 'desc' },
    });
    const nextNumber = lastPayment
      ? parseInt(lastPayment.paymentNumber.replace('PAY-', '')) + 1
      : 1;
    const paymentNumber = `PAY-${String(nextNumber).padStart(6, '0')}`;

    const payment = await prisma.payment.create({
      data: {
        paymentNumber,
        amount,
        paymentDate: new Date(),
        paymentMethod: paymentMethod || 'CREDIT_CARD',
        status: 'SETTLED',
        invoiceId,
        stripePaymentIntentId,
        stripeChargeId,
        stripeReceiptUrl,
        stripePaymentMethodId,
        referenceNumber,
        notes,
      },
    });

    // Update invoice balances
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (invoice) {
      const newAmountPaid = parseFloat(invoice.amountPaid) + parseFloat(amount);
      const newBalanceDue = parseFloat(invoice.total) - newAmountPaid;

      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaid: newAmountPaid,
          balanceDue: newBalanceDue,
          status: newBalanceDue <= 0 ? 'PAID' : invoice.status,
        },
      });
    }

    logger.info('Payment recorded', { paymentId: payment.id, invoiceId, amount });

    res.status(201).json({
      success: true,
      data: payment,
    });
  } catch (error) {
    next(error);
  }
});

// Get public invoice details (for payment portal)
router.get('/invoices/:invoiceId/public', async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        account: {
          select: { id: true, name: true },
        },
        lineItems: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Invoice not found' },
      });
    }

    res.json({
      success: true,
      data: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        status: invoice.status,
        subtotal: parseFloat(invoice.subtotal),
        tax: parseFloat(invoice.tax),
        total: parseFloat(invoice.total),
        amountPaid: parseFloat(invoice.amountPaid),
        balanceDue: parseFloat(invoice.balanceDue),
        account: invoice.account,
        lineItems: invoice.lineItems.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unitPrice),
          amount: parseFloat(item.totalPrice),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

// Create payment intent for invoice (for payment portal)
router.post('/invoices/:invoiceId/create-intent', async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const { amount } = req.body;

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        account: {
          include: { contacts: { take: 1 } },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Invoice not found' },
      });
    }

    const paymentAmount = amount || parseFloat(invoice.balanceDue);

    if (paymentAmount <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_AMOUNT', message: 'Payment amount must be greater than 0' },
      });
    }

    if (paymentAmount > parseFloat(invoice.balanceDue)) {
      return res.status(400).json({
        success: false,
        error: { code: 'AMOUNT_EXCEEDS_BALANCE', message: 'Payment amount exceeds balance due' },
      });
    }

    // Create Stripe customer if doesn't exist
    let stripeCustomerId = invoice.account?.stripeCustomerId;
    if (!stripeCustomerId && invoice.account) {
      const primaryContact = invoice.account.contacts[0];
      const customer = await stripeService.createCustomer({
        email: primaryContact?.email || `${invoice.account.id}@panda-crm.local`,
        name: invoice.account.name,
        phone: primaryContact?.phone,
        metadata: { accountId: invoice.account.id },
      });

      stripeCustomerId = customer.id;

      await prisma.account.update({
        where: { id: invoice.accountId },
        data: { stripeCustomerId },
      });
    }

    // Create payment intent
    const paymentIntent = await stripeService.createPaymentIntent({
      amount: Math.round(paymentAmount * 100), // Convert to cents
      currency: 'usd',
      customerId: stripeCustomerId,
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        accountId: invoice.accountId || '',
      },
      description: `Payment for Invoice ${invoice.invoiceNumber}`,
    });

    logger.info('Payment intent created for invoice', {
      invoiceId,
      paymentIntentId: paymentIntent.id,
      amount: paymentAmount,
    });

    res.json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get payment status
router.get('/status/:paymentIntentId', async (req, res, next) => {
  try {
    const { paymentIntentId } = req.params;

    const paymentIntent = await stripeService.getPaymentIntent(paymentIntentId);

    let paymentMethod = null;
    if (paymentIntent.payment_method) {
      try {
        paymentMethod = await stripeService.getPaymentMethod(paymentIntent.payment_method);
      } catch (e) {
        // Payment method might not be accessible
      }
    }

    const charge = paymentIntent.latest_charge
      ? await stripeService.getCharge(paymentIntent.latest_charge)
      : null;

    res.json({
      success: true,
      data: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        paymentMethod: paymentMethod
          ? {
              type: paymentMethod.type,
              card: paymentMethod.card
                ? {
                    brand: paymentMethod.card.brand,
                    last4: paymentMethod.card.last4,
                    expMonth: paymentMethod.card.exp_month,
                    expYear: paymentMethod.card.exp_year,
                  }
                : null,
            }
          : null,
        receiptUrl: charge?.receipt_url,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get payments for an invoice
router.get('/invoice/:invoiceId', async (req, res, next) => {
  try {
    const { invoiceId } = req.params;

    const payments = await prisma.payment.findMany({
      where: { invoiceId },
      orderBy: { paymentDate: 'desc' },
    });

    res.json({
      success: true,
      data: payments,
    });
  } catch (error) {
    next(error);
  }
});

// Create refund
router.post('/:paymentId/refund', async (req, res, next) => {
  try {
    const { paymentId } = req.params;
    const { amount, reason } = req.body;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Payment not found' },
      });
    }

    if (!payment.stripePaymentIntentId && !payment.stripeChargeId) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_REFUNDABLE', message: 'This payment cannot be refunded via Stripe' },
      });
    }

    const refundAmount = amount || parseFloat(payment.amount);

    const refund = await stripeService.createRefund({
      paymentIntentId: payment.stripePaymentIntentId,
      chargeId: payment.stripeChargeId,
      amount: refundAmount,
      reason,
      metadata: { paymentId, originalAmount: payment.amount.toString() },
    });

    // Update payment record
    const isFullRefund = refundAmount >= parseFloat(payment.amount);
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        stripeRefundId: refund.id,
      },
    });

    // Update invoice balance
    if (payment.invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: payment.invoiceId },
      });

      if (invoice) {
        await prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            amountPaid: parseFloat(invoice.amountPaid) - refundAmount,
            balanceDue: parseFloat(invoice.balanceDue) + refundAmount,
            status: 'SENT', // Reset status since balance is due
          },
        });
      }
    }

    logger.info('Refund processed', { paymentId, refundId: refund.id, amount: refundAmount });

    res.json({
      success: true,
      data: {
        refundId: refund.id,
        amount: refundAmount,
        status: refund.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
