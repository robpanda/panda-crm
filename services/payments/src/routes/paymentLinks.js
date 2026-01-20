import express from 'express';
import { PrismaClient } from '@prisma/client';
import { stripeService } from '../services/stripeService.js';
import { logger } from '../middleware/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

// Create payment link
router.post('/', async (req, res, next) => {
  try {
    const { accountId, invoiceId, jobId, workOrderId, amount, description, expiresAt, maxUses } = req.body;

    // Get account for metadata
    let account = null;
    if (accountId) {
      account = await prisma.account.findUnique({ where: { id: accountId } });
    }

    // Create Stripe payment link
    const successUrl = `${process.env.PAYMENT_PORTAL_URL || 'https://pay.pandaexteriors.com'}/success?session_id={CHECKOUT_SESSION_ID}`;

    const stripeLink = await stripeService.createPaymentLink({
      amount,
      description: description || `Payment for ${account?.name || 'Services'}`,
      metadata: {
        accountId: accountId || '',
        invoiceId: invoiceId || '',
        jobId: jobId || '',
        workOrderId: workOrderId || '',
      },
      afterCompletionUrl: successUrl,
    });

    // Save to database
    const paymentLink = await prisma.paymentLink.create({
      data: {
        stripePaymentLinkId: stripeLink.id,
        url: stripeLink.url,
        amount,
        description,
        status: 'ACTIVE',
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        maxUses,
        accountId,
        invoiceId,
        opportunityId: jobId || null,
        workOrderId: workOrderId || null,
      },
    });

    logger.info('Payment link created', {
      paymentLinkId: paymentLink.id,
      stripeId: stripeLink.id,
      amount,
    });

    res.status(201).json({
      success: true,
      data: {
        id: paymentLink.id,
        url: paymentLink.url,
        amount: paymentLink.amount,
        description: paymentLink.description,
        expiresAt: paymentLink.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Get payment link
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const paymentLink = await prisma.paymentLink.findUnique({
      where: { id },
    });

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Payment link not found' },
      });
    }

    res.json({
      success: true,
      data: paymentLink,
    });
  } catch (error) {
    next(error);
  }
});

// List payment links for account
router.get('/account/:accountId', async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const { status } = req.query;

    const where = { accountId };
    if (status) where.status = status;

    const paymentLinks = await prisma.paymentLink.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: paymentLinks,
    });
  } catch (error) {
    next(error);
  }
});

// Deactivate payment link
router.post('/:id/deactivate', async (req, res, next) => {
  try {
    const { id } = req.params;

    const paymentLink = await prisma.paymentLink.findUnique({
      where: { id },
    });

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Payment link not found' },
      });
    }

    // Deactivate in Stripe
    await stripeService.deactivatePaymentLink(paymentLink.stripePaymentLinkId);

    // Update database
    const updated = await prisma.paymentLink.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });

    logger.info('Payment link deactivated', { paymentLinkId: id });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    next(error);
  }
});

// Create payment intent for a payment link (for Payment Element flow)
router.post('/:id/create-intent', async (req, res, next) => {
  try {
    const { id } = req.params;

    const paymentLink = await prisma.paymentLink.findUnique({
      where: { id },
      include: {
        account: true,
        invoice: true,
      },
    });

    if (!paymentLink) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Payment link not found' },
      });
    }

    // Check if expired
    if (paymentLink.expiresAt && new Date() > paymentLink.expiresAt) {
      await prisma.paymentLink.update({
        where: { id },
        data: { status: 'EXPIRED' },
      });
      return res.status(400).json({
        success: false,
        error: { code: 'EXPIRED', message: 'Payment link has expired' },
      });
    }

    // Check if already paid
    if (paymentLink.status === 'PAID') {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_PAID', message: 'This payment link has already been used' },
      });
    }

    // Check max uses
    if (paymentLink.maxUses && paymentLink.useCount >= paymentLink.maxUses) {
      return res.status(400).json({
        success: false,
        error: { code: 'MAX_USES_REACHED', message: 'Payment link has reached maximum uses' },
      });
    }

    // Create payment intent
    const paymentIntent = await stripeService.createPaymentIntent({
      amount: Math.round(paymentLink.amount * 100), // Convert to cents
      currency: 'usd',
      metadata: {
        paymentLinkId: paymentLink.id,
        accountId: paymentLink.accountId || '',
        invoiceId: paymentLink.invoiceId || '',
        jobId: paymentLink.opportunityId || '',
        workOrderId: paymentLink.workOrderId || '',
      },
      description: paymentLink.description || `Payment for ${paymentLink.account?.name || 'Services'}`,
    });

    logger.info('Payment intent created for link', {
      paymentLinkId: id,
      paymentIntentId: paymentIntent.id,
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

// Create checkout session (alternative to payment link)
router.post('/checkout-session', async (req, res, next) => {
  try {
    const { accountId, invoiceId, jobId, workOrderId, amount, description } = req.body;

    // Get or create Stripe customer
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

    const baseUrl = process.env.PAYMENT_PORTAL_URL || 'https://pay.pandaexteriors.com';

    const session = await stripeService.createCheckoutSession({
      customerId: stripeCustomerId,
      amount,
      description: description || `Payment for ${account.name}`,
      successUrl: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/cancel`,
      metadata: {
        accountId,
        invoiceId: invoiceId || '',
        jobId: jobId || '',
        workOrderId: workOrderId || '',
      },
    });

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
