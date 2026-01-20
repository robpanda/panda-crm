import express from 'express';
import { PrismaClient } from '@prisma/client';
import { stripeService } from '../services/stripeService.js';
import quickbooksService from '../services/quickbooksService.js';
import { logger } from '../middleware/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

// Get payments with optional filtering by opportunityId or invoiceId
router.get('/', async (req, res, next) => {
  try {
    const { opportunityId, invoiceId, status, limit = 50, page = 1 } = req.query;
    const where = {};

    // Filter by invoiceId directly
    if (invoiceId) {
      where.invoiceId = invoiceId;
    }
    // Filter by opportunityId through the invoice relationship
    else if (opportunityId) {
      where.invoice = { opportunityId };
    }

    // Filter by status if provided
    if (status) {
      where.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              total: true,
              balanceDue: true,
              status: true,
            },
          },
        },
        orderBy: { paymentDate: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.payment.count({ where }),
    ]);

    res.json({
      success: true,
      data: payments,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    logger.error('Error fetching payments:', error);
    next(error);
  }
});

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

// Generate payment link for invoice (for easy customer payment)
// This creates a shareable link that customers can use to pay their invoice
router.post('/invoices/:invoiceId/payment-link', async (req, res, next) => {
  try {
    const { invoiceId } = req.params;
    const { expiresIn } = req.body; // Optional: hours until expiration

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        account: {
          include: { contacts: { take: 1, orderBy: { isPrimary: 'desc' } } },
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

    if (parseFloat(invoice.balanceDue) <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_PAID', message: 'This invoice has already been paid' },
      });
    }

    // Check for existing active payment link
    const existingLink = await prisma.paymentLink.findFirst({
      where: {
        invoiceId,
        status: 'ACTIVE',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
    });

    if (existingLink) {
      logger.info('Returning existing payment link', { paymentLinkId: existingLink.id });
      return res.json({
        success: true,
        data: {
          id: existingLink.id,
          url: existingLink.url,
          amount: parseFloat(existingLink.amount),
          expiresAt: existingLink.expiresAt,
          existing: true,
        },
      });
    }

    // Create or get Stripe customer
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

    const amount = parseFloat(invoice.balanceDue);
    const baseUrl = process.env.PAYMENT_PORTAL_URL || 'https://pay.pandaexteriors.com';

    // Create Stripe payment link
    const stripeLink = await stripeService.createPaymentLink({
      amount: Math.round(amount * 100), // Convert to cents
      description: `Invoice ${invoice.invoiceNumber} - ${invoice.account?.name || 'Payment'}`,
      metadata: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        accountId: invoice.accountId || '',
      },
      afterCompletionUrl: `${baseUrl}/success?invoice=${invoice.invoiceNumber}`,
    });

    // Calculate expiration
    let expiresAt = null;
    if (expiresIn) {
      expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + parseInt(expiresIn));
    }

    // Save payment link to database
    const paymentLink = await prisma.paymentLink.create({
      data: {
        stripePaymentLinkId: stripeLink.id,
        url: stripeLink.url,
        amount,
        description: `Invoice ${invoice.invoiceNumber}`,
        status: 'ACTIVE',
        expiresAt,
        accountId: invoice.accountId,
        invoiceId: invoice.id,
      },
    });

    // Update invoice with payment link
    await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        stripePaymentLinkId: stripeLink.id,
        stripePaymentLinkUrl: stripeLink.url,
      },
    });

    logger.info('Payment link created for invoice', {
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      paymentLinkId: paymentLink.id,
      amount,
    });

    res.status(201).json({
      success: true,
      data: {
        id: paymentLink.id,
        url: paymentLink.url,
        amount,
        expiresAt: paymentLink.expiresAt,
        invoiceNumber: invoice.invoiceNumber,
        customerEmail: invoice.account?.contacts?.[0]?.email,
      },
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

// Get Stripe configuration (publishable key)
router.get('/config', async (req, res) => {
  try {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

    if (!publishableKey) {
      return res.status(500).json({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Stripe publishable key not configured' },
      });
    }

    res.json({
      success: true,
      data: {
        publishableKey,
      },
    });
  } catch (error) {
    logger.error('Error getting Stripe config', error);
    res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to get Stripe configuration' },
    });
  }
});

// Sync payments from Stripe
router.post('/sync-stripe', async (req, res, next) => {
  try {
    const { daysBack = 30, limit = 100 } = req.body;

    logger.info('Starting Stripe payment sync', { daysBack, limit });

    // Calculate the date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const created = { gte: Math.floor(startDate.getTime() / 1000) };

    // Fetch charges from Stripe
    const charges = await stripeService.listCharges({ limit, created });

    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    for (const charge of charges.data) {
      try {
        // Skip if not succeeded
        if (charge.status !== 'succeeded') {
          skipped++;
          continue;
        }

        // Check if payment already exists (by stripeChargeId)
        const existingPayment = await prisma.payment.findFirst({
          where: {
            OR: [
              { stripeChargeId: charge.id },
              { stripePaymentIntentId: charge.payment_intent },
            ],
          },
        });

        if (existingPayment) {
          skipped++;
          continue;
        }

        // Try to find the account by Stripe customer ID
        let accountId = null;
        let invoiceId = null;

        if (charge.customer) {
          const account = await prisma.account.findFirst({
            where: { stripeCustomerId: charge.customer },
          });
          if (account) {
            accountId = account.id;
          }
        }

        // Try to find invoice from metadata
        if (charge.metadata?.invoiceId) {
          const invoice = await prisma.invoice.findUnique({
            where: { id: charge.metadata.invoiceId },
          });
          if (invoice) {
            invoiceId = invoice.id;
            accountId = accountId || invoice.accountId;
          }
        }

        // Generate payment number
        const lastPayment = await prisma.payment.findFirst({
          orderBy: { paymentNumber: 'desc' },
        });
        const nextNumber = lastPayment
          ? parseInt(lastPayment.paymentNumber.replace('PAY-', '')) + 1
          : 1;
        const paymentNumber = `PAY-${String(nextNumber).padStart(6, '0')}`;

        // Create the payment record
        const payment = await prisma.payment.create({
          data: {
            paymentNumber,
            amount: charge.amount / 100, // Convert from cents
            paymentDate: new Date(charge.created * 1000),
            paymentMethod: charge.payment_method_details?.type === 'card' ? 'CREDIT_CARD' : 'OTHER',
            status: 'SETTLED',
            invoiceId,
            stripeChargeId: charge.id,
            stripePaymentIntentId: charge.payment_intent || null,
            stripeReceiptUrl: charge.receipt_url,
            stripePaymentMethodId: charge.payment_method || null,
            notes: `Synced from Stripe. ${charge.description || ''}`.trim(),
          },
        });

        // Update invoice balances if linked
        if (invoiceId) {
          const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
          });

          if (invoice) {
            const newAmountPaid = parseFloat(invoice.amountPaid) + (charge.amount / 100);
            const newBalanceDue = parseFloat(invoice.total) - newAmountPaid;

            await prisma.invoice.update({
              where: { id: invoiceId },
              data: {
                amountPaid: newAmountPaid,
                balanceDue: Math.max(0, newBalanceDue),
                status: newBalanceDue <= 0 ? 'PAID' : invoice.status,
              },
            });
          }
        }

        synced++;
        logger.info('Synced Stripe charge', {
          chargeId: charge.id,
          paymentId: payment.id,
          amount: charge.amount / 100
        });
      } catch (err) {
        failed++;
        errors.push({ chargeId: charge.id, error: err.message });
        logger.error('Failed to sync charge', { chargeId: charge.id, error: err.message });
      }
    }

    logger.info('Stripe payment sync completed', { synced, skipped, failed, total: charges.data.length });

    res.json({
      success: true,
      data: {
        synced,
        skipped,
        failed,
        total: charges.data.length,
        hasMore: charges.has_more,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get Stripe payments (not yet synced)
router.get('/stripe-charges', async (req, res, next) => {
  try {
    const { limit = 50, startingAfter, daysBack = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(daysBack));
    const created = { gte: Math.floor(startDate.getTime() / 1000) };

    const charges = await stripeService.listCharges({
      limit: parseInt(limit),
      startingAfter,
      created,
    });

    // Check which ones are already synced
    const chargesWithSyncStatus = await Promise.all(
      charges.data.map(async (charge) => {
        const existingPayment = await prisma.payment.findFirst({
          where: {
            OR: [
              { stripeChargeId: charge.id },
              { stripePaymentIntentId: charge.payment_intent },
            ],
          },
          select: { id: true, paymentNumber: true },
        });

        return {
          id: charge.id,
          amount: charge.amount / 100,
          status: charge.status,
          created: new Date(charge.created * 1000),
          description: charge.description,
          customer: charge.customer,
          receiptUrl: charge.receipt_url,
          paymentMethod: charge.payment_method_details?.type,
          cardBrand: charge.payment_method_details?.card?.brand,
          cardLast4: charge.payment_method_details?.card?.last4,
          metadata: charge.metadata,
          synced: !!existingPayment,
          paymentId: existingPayment?.id,
          paymentNumber: existingPayment?.paymentNumber,
        };
      })
    );

    res.json({
      success: true,
      data: {
        charges: chargesWithSyncStatus,
        hasMore: charges.has_more,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Sync payments FROM QuickBooks
router.post('/sync-quickbooks', async (req, res, next) => {
  try {
    const { daysBack = 30, limit = 100 } = req.body;

    logger.info('Starting QuickBooks payment sync', { daysBack, limit });

    // Calculate the date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Format dates for QB query (YYYY-MM-DD)
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Fetch payments from QuickBooks
    const qbPayments = await quickbooksService.listPayments({
      startDate: startDateStr,
      endDate: endDateStr,
      limit,
    });

    let synced = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    for (const qbPayment of qbPayments) {
      try {
        // Check if payment already exists (by qbPaymentId)
        const existingPayment = await prisma.payment.findFirst({
          where: { qbPaymentId: qbPayment.Id },
        });

        if (existingPayment) {
          skipped++;
          continue;
        }

        // Try to find the account by QB customer ID
        let accountId = null;
        let invoiceId = null;

        if (qbPayment.CustomerRef?.value) {
          const account = await prisma.account.findFirst({
            where: { qbCustomerId: qbPayment.CustomerRef.value },
          });
          if (account) {
            accountId = account.id;
          }
        }

        // Try to find linked invoice
        if (qbPayment.Line && qbPayment.Line.length > 0) {
          for (const line of qbPayment.Line) {
            if (line.LinkedTxn) {
              for (const linkedTxn of line.LinkedTxn) {
                if (linkedTxn.TxnType === 'Invoice') {
                  const invoice = await prisma.invoice.findFirst({
                    where: { qbInvoiceId: linkedTxn.TxnId },
                  });
                  if (invoice) {
                    invoiceId = invoice.id;
                    accountId = accountId || invoice.accountId;
                    break;
                  }
                }
              }
            }
            if (invoiceId) break;
          }
        }

        // Generate payment number
        const lastPayment = await prisma.payment.findFirst({
          orderBy: { paymentNumber: 'desc' },
        });
        const nextNumber = lastPayment
          ? parseInt(lastPayment.paymentNumber.replace('PAY-', '')) + 1
          : 1;
        const paymentNumber = `PAY-${String(nextNumber).padStart(6, '0')}`;

        // Determine payment method from QB
        let paymentMethod = 'OTHER';
        if (qbPayment.PaymentMethodRef?.name) {
          const methodName = qbPayment.PaymentMethodRef.name.toLowerCase();
          if (methodName.includes('credit') || methodName.includes('card')) {
            paymentMethod = 'CREDIT_CARD';
          } else if (methodName.includes('check')) {
            paymentMethod = 'CHECK';
          } else if (methodName.includes('cash')) {
            paymentMethod = 'CASH';
          } else if (methodName.includes('ach') || methodName.includes('bank')) {
            paymentMethod = 'ACH';
          }
        }

        // Create the payment record
        const payment = await prisma.payment.create({
          data: {
            paymentNumber,
            amount: parseFloat(qbPayment.TotalAmt) || 0,
            paymentDate: qbPayment.TxnDate ? new Date(qbPayment.TxnDate) : new Date(),
            paymentMethod,
            status: 'SETTLED',
            invoiceId,
            qbPaymentId: qbPayment.Id,
            notes: `Synced from QuickBooks. ${qbPayment.PrivateNote || ''}`.trim(),
          },
        });

        // Update invoice balances if linked
        if (invoiceId) {
          const invoice = await prisma.invoice.findUnique({
            where: { id: invoiceId },
          });

          if (invoice) {
            const newAmountPaid = parseFloat(invoice.amountPaid) + parseFloat(qbPayment.TotalAmt);
            const newBalanceDue = parseFloat(invoice.total) - newAmountPaid;

            await prisma.invoice.update({
              where: { id: invoiceId },
              data: {
                amountPaid: newAmountPaid,
                balanceDue: Math.max(0, newBalanceDue),
                status: newBalanceDue <= 0 ? 'PAID' : invoice.status,
              },
            });
          }
        }

        synced++;
        logger.info('Synced QuickBooks payment', {
          qbPaymentId: qbPayment.Id,
          paymentId: payment.id,
          amount: qbPayment.TotalAmt,
        });
      } catch (err) {
        failed++;
        errors.push({ qbPaymentId: qbPayment.Id, error: err.message });
        logger.error('Failed to sync QB payment', { qbPaymentId: qbPayment.Id, error: err.message });
      }
    }

    logger.info('QuickBooks payment sync completed', { synced, skipped, failed, total: qbPayments.length });

    res.json({
      success: true,
      data: {
        synced,
        skipped,
        failed,
        total: qbPayments.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get QuickBooks payments (for preview before sync)
router.get('/quickbooks-payments', async (req, res, next) => {
  try {
    const { limit = 50, daysBack = 30 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(daysBack));

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const qbPayments = await quickbooksService.listPayments({
      startDate: startDateStr,
      endDate: endDateStr,
      limit: parseInt(limit),
    });

    // Check which ones are already synced
    const paymentsWithSyncStatus = await Promise.all(
      qbPayments.map(async (qbPayment) => {
        const existingPayment = await prisma.payment.findFirst({
          where: { qbPaymentId: qbPayment.Id },
          select: { id: true, paymentNumber: true },
        });

        // Get customer name if available
        let customerName = null;
        if (qbPayment.CustomerRef?.value) {
          const account = await prisma.account.findFirst({
            where: { qbCustomerId: qbPayment.CustomerRef.value },
            select: { name: true },
          });
          customerName = account?.name;
        }

        return {
          id: qbPayment.Id,
          amount: parseFloat(qbPayment.TotalAmt) || 0,
          txnDate: qbPayment.TxnDate,
          customerName: customerName || qbPayment.CustomerRef?.name || 'Unknown',
          paymentMethodName: qbPayment.PaymentMethodRef?.name,
          referenceNumber: qbPayment.PaymentRefNum,
          note: qbPayment.PrivateNote,
          synced: !!existingPayment,
          paymentId: existingPayment?.id,
          paymentNumber: existingPayment?.paymentNumber,
        };
      })
    );

    res.json({
      success: true,
      data: {
        payments: paymentsWithSyncStatus,
        total: qbPayments.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================
// QUICKBOOKS INVOICE SYNC ENDPOINTS
// ============================================

// Get QuickBooks invoices (for preview before sync)
router.get('/quickbooks-invoices', async (req, res, next) => {
  try {
    const { limit = 50, daysBack = 30 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(daysBack));

    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    const qbInvoices = await quickbooksService.listInvoices({
      startDate: startDateStr,
      endDate: endDateStr,
      limit: parseInt(limit),
    });

    // Check which ones are already synced
    const invoicesWithSyncStatus = await Promise.all(
      qbInvoices.map(async (qbInvoice) => {
        const existingInvoice = await prisma.invoice.findFirst({
          where: { qbInvoiceId: qbInvoice.Id },
          select: { id: true, invoiceNumber: true },
        });

        // Get customer name if available
        let customerName = null;
        let accountId = null;
        if (qbInvoice.CustomerRef?.value) {
          const account = await prisma.account.findFirst({
            where: { qbCustomerId: qbInvoice.CustomerRef.value },
            select: { id: true, name: true },
          });
          customerName = account?.name;
          accountId = account?.id;
        }

        return {
          id: qbInvoice.Id,
          docNumber: qbInvoice.DocNumber,
          total: parseFloat(qbInvoice.TotalAmt) || 0,
          balance: parseFloat(qbInvoice.Balance) || 0,
          txnDate: qbInvoice.TxnDate,
          dueDate: qbInvoice.DueDate,
          customerName: customerName || qbInvoice.CustomerRef?.name || 'Unknown',
          email: qbInvoice.BillEmail?.Address,
          synced: !!existingInvoice,
          invoiceId: existingInvoice?.id,
          invoiceNumber: existingInvoice?.invoiceNumber,
          accountId,
        };
      })
    );

    res.json({
      success: true,
      data: {
        invoices: invoicesWithSyncStatus,
        total: qbInvoices.length,
        syncedCount: invoicesWithSyncStatus.filter(i => i.synced).length,
        unsyncedCount: invoicesWithSyncStatus.filter(i => !i.synced).length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Sync invoices FROM QuickBooks
router.post('/sync-quickbooks-invoices', async (req, res, next) => {
  try {
    const { daysBack = 30, limit = 500 } = req.body;

    logger.info('Starting QuickBooks invoice sync', { daysBack, limit });

    // Calculate the date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Format dates for QB query (YYYY-MM-DD)
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Fetch invoices from QuickBooks
    const qbInvoices = await quickbooksService.listInvoices({
      startDate: startDateStr,
      endDate: endDateStr,
      limit,
    });

    let synced = 0;
    let skipped = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];

    for (const qbInvoice of qbInvoices) {
      try {
        // Check if invoice already exists (by qbInvoiceId)
        const existingInvoice = await prisma.invoice.findFirst({
          where: { qbInvoiceId: qbInvoice.Id },
        });

        if (existingInvoice) {
          // Update existing invoice with latest QB data (balance, status)
          const qbBalance = parseFloat(qbInvoice.Balance) || 0;
          const qbTotal = parseFloat(qbInvoice.TotalAmt) || 0;
          const newAmountPaid = qbTotal - qbBalance;

          // Determine status from QB balance
          let newStatus = existingInvoice.status;
          if (qbBalance <= 0) {
            newStatus = 'PAID';
          } else if (qbBalance < qbTotal) {
            newStatus = 'PARTIAL';
          }

          // Only update if there are changes
          if (
            existingInvoice.balanceDue !== qbBalance ||
            existingInvoice.amountPaid !== newAmountPaid ||
            existingInvoice.status !== newStatus
          ) {
            await prisma.invoice.update({
              where: { id: existingInvoice.id },
              data: {
                balanceDue: qbBalance,
                amountPaid: newAmountPaid,
                status: newStatus,
              },
            });
            updated++;
          } else {
            skipped++;
          }
          continue;
        }

        // Try to find the account by QB customer ID
        let accountId = null;
        let opportunityId = null;

        if (qbInvoice.CustomerRef?.value) {
          const account = await prisma.account.findFirst({
            where: { qbCustomerId: qbInvoice.CustomerRef.value },
            include: {
              opportunities: {
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          });
          if (account) {
            accountId = account.id;
            // Link to most recent opportunity if available
            if (account.opportunities?.length > 0) {
              opportunityId = account.opportunities[0].id;
            }
          }
        }

        // Generate invoice number
        const lastInvoice = await prisma.invoice.findFirst({
          where: {
            invoiceNumber: { startsWith: 'INV-' },
          },
          orderBy: { invoiceNumber: 'desc' },
        });
        let nextNumber = 1;
        if (lastInvoice?.invoiceNumber) {
          const num = parseInt(lastInvoice.invoiceNumber.replace('INV-', ''));
          if (!isNaN(num)) {
            nextNumber = num + 1;
          }
        }
        const invoiceNumber = `INV-${String(nextNumber).padStart(8, '0')}`;

        // Parse QB amounts
        const total = parseFloat(qbInvoice.TotalAmt) || 0;
        const balance = parseFloat(qbInvoice.Balance) || 0;
        const amountPaid = total - balance;

        // Determine status from QB data
        let status = 'PENDING';
        if (balance <= 0) {
          status = 'PAID';
        } else if (balance < total) {
          status = 'PARTIAL';
        } else if (qbInvoice.DueDate && new Date(qbInvoice.DueDate) < new Date()) {
          status = 'OVERDUE';
        }

        // Create the invoice record
        const invoice = await prisma.invoice.create({
          data: {
            invoiceNumber,
            accountId,
            opportunityId,
            total,
            subtotal: total, // QB doesn't always break out subtotal
            tax: 0,
            amountPaid,
            balanceDue: balance,
            status,
            invoiceDate: qbInvoice.TxnDate ? new Date(qbInvoice.TxnDate) : new Date(),
            dueDate: qbInvoice.DueDate ? new Date(qbInvoice.DueDate) : null,
            qbInvoiceId: qbInvoice.Id,
            notes: `Synced from QuickBooks. Doc #${qbInvoice.DocNumber || 'N/A'}. ${qbInvoice.CustomerMemo?.value || ''}`.trim(),
          },
        });

        synced++;
        logger.info('Synced QuickBooks invoice', {
          qbInvoiceId: qbInvoice.Id,
          invoiceId: invoice.id,
          total: qbInvoice.TotalAmt,
          docNumber: qbInvoice.DocNumber,
        });
      } catch (err) {
        failed++;
        errors.push({ qbInvoiceId: qbInvoice.Id, docNumber: qbInvoice.DocNumber, error: err.message });
        logger.error('Failed to sync QB invoice', { qbInvoiceId: qbInvoice.Id, error: err.message });
      }
    }

    logger.info('QuickBooks invoice sync completed', { synced, updated, skipped, failed, total: qbInvoices.length });

    res.json({
      success: true,
      data: {
        synced,
        updated,
        skipped,
        failed,
        total: qbInvoices.length,
        errors: errors.length > 0 ? errors : undefined,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
