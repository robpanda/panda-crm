import express from 'express';
import { PrismaClient } from '@prisma/client';
import { stripeService } from '../services/stripeService.js';
import { logger } from '../middleware/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

// Create or get Stripe customer for account
router.post('/sync/:accountId', async (req, res, next) => {
  try {
    const { accountId } = req.params;

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

    // If already has Stripe customer, update it
    if (account.stripeCustomerId) {
      const primaryContact = account.contacts[0];
      await stripeService.updateCustomer(account.stripeCustomerId, {
        email: primaryContact?.email,
        name: account.name,
        phone: primaryContact?.phone,
      });

      return res.json({
        success: true,
        data: { stripeCustomerId: account.stripeCustomerId, action: 'updated' },
      });
    }

    // Create new Stripe customer
    const primaryContact = account.contacts[0];
    const customer = await stripeService.createCustomer({
      email: primaryContact?.email || `${account.id}@panda-crm.local`,
      name: account.name,
      phone: primaryContact?.phone,
      metadata: {
        accountId: account.id,
        salesforceId: account.salesforceId || '',
      },
    });

    // Save to account
    await prisma.account.update({
      where: { id: accountId },
      data: { stripeCustomerId: customer.id },
    });

    logger.info('Stripe customer synced', { accountId, stripeCustomerId: customer.id });

    res.json({
      success: true,
      data: { stripeCustomerId: customer.id, action: 'created' },
    });
  } catch (error) {
    next(error);
  }
});

// Get customer payment methods
router.get('/:accountId/payment-methods', async (req, res, next) => {
  try {
    const { accountId } = req.params;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Account not found' },
      });
    }

    if (!account.stripeCustomerId) {
      return res.json({
        success: true,
        data: [],
      });
    }

    const paymentMethods = await stripeService.listCustomerPaymentMethods(
      account.stripeCustomerId
    );

    res.json({
      success: true,
      data: paymentMethods.data.map(pm => ({
        id: pm.id,
        type: pm.type,
        card: pm.card ? {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        } : null,
        bankAccount: pm.us_bank_account ? {
          bankName: pm.us_bank_account.bank_name,
          last4: pm.us_bank_account.last4,
          accountType: pm.us_bank_account.account_type,
        } : null,
      })),
    });
  } catch (error) {
    next(error);
  }
});

// Attach payment method to customer
router.post('/:accountId/payment-methods', async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const { paymentMethodId } = req.body;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Account not found' },
      });
    }

    if (!account.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_CUSTOMER', message: 'Account does not have a Stripe customer' },
      });
    }

    await stripeService.attachPaymentMethod(paymentMethodId, account.stripeCustomerId);

    res.json({
      success: true,
      data: { paymentMethodId, attached: true },
    });
  } catch (error) {
    next(error);
  }
});

// Remove payment method
router.delete('/:accountId/payment-methods/:paymentMethodId', async (req, res, next) => {
  try {
    const { paymentMethodId } = req.params;

    await stripeService.detachPaymentMethod(paymentMethodId);

    res.json({
      success: true,
      data: { paymentMethodId, detached: true },
    });
  } catch (error) {
    next(error);
  }
});

// Get customer billing portal URL
router.post('/:accountId/portal-session', async (req, res, next) => {
  try {
    const { accountId } = req.params;
    const { returnUrl } = req.body;

    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account?.stripeCustomerId) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_CUSTOMER', message: 'Account does not have a Stripe customer' },
      });
    }

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    const session = await stripe.billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: returnUrl || process.env.PAYMENT_PORTAL_URL || 'https://pay.pandaexteriors.com',
    });

    res.json({
      success: true,
      data: { url: session.url },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
