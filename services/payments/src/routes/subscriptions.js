import express from 'express';
import { PrismaClient } from '@prisma/client';
import { stripeService } from '../services/stripeService.js';
import { logger } from '../middleware/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

// ==================== PRODUCTS ====================

// List all products
router.get('/products', async (req, res, next) => {
  try {
    const { active, limit = 100 } = req.query;
    const products = await stripeService.listProducts({
      active: active === 'true' ? true : active === 'false' ? false : undefined,
      limit: parseInt(limit, 10),
    });
    res.json({ success: true, data: products });
  } catch (error) {
    logger.error('Error listing products', { error: error.message });
    next(error);
  }
});

// Get single product
router.get('/products/:productId', async (req, res, next) => {
  try {
    const product = await stripeService.getProduct(req.params.productId);
    res.json({ success: true, data: product });
  } catch (error) {
    logger.error('Error getting product', { productId: req.params.productId, error: error.message });
    next(error);
  }
});

// Create product
router.post('/products', async (req, res, next) => {
  try {
    const { name, description, metadata } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'Product name is required' });
    }

    const product = await stripeService.createProduct({ name, description, metadata });
    res.status(201).json({ success: true, data: product });
  } catch (error) {
    logger.error('Error creating product', { error: error.message });
    next(error);
  }
});

// Update product
router.put('/products/:productId', async (req, res, next) => {
  try {
    const { name, description, active, metadata } = req.body;
    const product = await stripeService.updateProduct(req.params.productId, {
      name,
      description,
      active,
      metadata,
    });
    res.json({ success: true, data: product });
  } catch (error) {
    logger.error('Error updating product', { productId: req.params.productId, error: error.message });
    next(error);
  }
});

// ==================== PRICES ====================

// List prices (optionally for a specific product)
router.get('/prices', async (req, res, next) => {
  try {
    const { productId, active, limit = 100 } = req.query;
    const prices = await stripeService.listPrices({
      productId,
      active: active === 'true' ? true : active === 'false' ? false : undefined,
      limit: parseInt(limit, 10),
    });
    res.json({ success: true, data: prices });
  } catch (error) {
    logger.error('Error listing prices', { error: error.message });
    next(error);
  }
});

// Get single price
router.get('/prices/:priceId', async (req, res, next) => {
  try {
    const price = await stripeService.getPrice(req.params.priceId);
    res.json({ success: true, data: price });
  } catch (error) {
    logger.error('Error getting price', { priceId: req.params.priceId, error: error.message });
    next(error);
  }
});

// Create price for a product
router.post('/prices', async (req, res, next) => {
  try {
    const { productId, unitAmount, currency, interval, intervalCount, metadata } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, error: 'Product ID is required' });
    }
    if (!unitAmount || unitAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Unit amount must be greater than 0' });
    }
    if (!interval || !['day', 'week', 'month', 'year'].includes(interval)) {
      return res.status(400).json({ success: false, error: 'Invalid interval. Must be day, week, month, or year' });
    }

    const price = await stripeService.createPrice({
      productId,
      unitAmount: Math.round(unitAmount), // Amount in cents
      currency: currency || 'usd',
      interval,
      intervalCount: intervalCount || 1,
      metadata,
    });

    res.status(201).json({ success: true, data: price });
  } catch (error) {
    logger.error('Error creating price', { error: error.message });
    next(error);
  }
});

// Update price (limited - can only update active status and metadata)
router.put('/prices/:priceId', async (req, res, next) => {
  try {
    const { active, metadata } = req.body;
    const price = await stripeService.updatePrice(req.params.priceId, { active, metadata });
    res.json({ success: true, data: price });
  } catch (error) {
    logger.error('Error updating price', { priceId: req.params.priceId, error: error.message });
    next(error);
  }
});

// ==================== SUBSCRIPTIONS ====================

// List subscriptions
router.get('/', async (req, res, next) => {
  try {
    const { customerId, status, limit = 100 } = req.query;
    const subscriptions = await stripeService.listSubscriptions({
      customerId,
      status,
      limit: parseInt(limit, 10),
    });
    res.json({ success: true, data: subscriptions });
  } catch (error) {
    logger.error('Error listing subscriptions', { error: error.message });
    next(error);
  }
});

// Get single subscription
router.get('/:subscriptionId', async (req, res, next) => {
  try {
    const subscription = await stripeService.getSubscription(req.params.subscriptionId);
    res.json({ success: true, data: subscription });
  } catch (error) {
    logger.error('Error getting subscription', { subscriptionId: req.params.subscriptionId, error: error.message });
    next(error);
  }
});

// Create subscription (payment plan)
router.post('/', async (req, res, next) => {
  try {
    const {
      customerId,
      accountId,
      priceId,
      paymentMethodId,
      trialPeriodDays,
      collectionMethod,
      metadata,
      // For creating a new product+price inline
      planName,
      planDescription,
      amount,
      interval,
      intervalCount,
    } = req.body;

    let stripeCustomerId = customerId;
    let stripePriceId = priceId;

    // If accountId is provided, get or create Stripe customer
    if (accountId && !stripeCustomerId) {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        include: { contacts: { take: 1 } },
      });

      if (!account) {
        return res.status(404).json({ success: false, error: 'Account not found' });
      }

      if (account.stripeCustomerId) {
        stripeCustomerId = account.stripeCustomerId;
      } else {
        // Create Stripe customer
        const primaryContact = account.contacts[0];
        const customer = await stripeService.createCustomer({
          email: primaryContact?.email || `${account.id}@panda-crm.internal`,
          name: account.name,
          phone: account.phone,
          metadata: { accountId: account.id },
        });
        stripeCustomerId = customer.id;

        // Update account with Stripe customer ID
        await prisma.account.update({
          where: { id: accountId },
          data: { stripeCustomerId: customer.id },
        });
      }
    }

    if (!stripeCustomerId) {
      return res.status(400).json({ success: false, error: 'Customer ID or Account ID is required' });
    }

    // If no priceId provided, create a product and price inline
    if (!stripePriceId) {
      if (!planName || !amount || !interval) {
        return res.status(400).json({
          success: false,
          error: 'Either priceId OR (planName, amount, interval) are required',
        });
      }

      if (!['day', 'week', 'month', 'year'].includes(interval)) {
        return res.status(400).json({ success: false, error: 'Invalid interval. Must be day, week, month, or year' });
      }

      // Create product
      const product = await stripeService.createProduct({
        name: planName,
        description: planDescription,
        metadata: { accountId, source: 'panda-crm-payment-plan' },
      });

      // Create price
      const price = await stripeService.createPrice({
        productId: product.id,
        unitAmount: Math.round(amount * 100), // Convert dollars to cents
        currency: 'usd',
        interval,
        intervalCount: intervalCount || 1,
        metadata: { accountId },
      });

      stripePriceId = price.id;
    }

    // Create the subscription
    const subscription = await stripeService.createSubscription({
      customerId: stripeCustomerId,
      priceId: stripePriceId,
      paymentMethodId,
      trialPeriodDays,
      collectionMethod,
      metadata: {
        accountId,
        ...metadata,
      },
    });

    // Store subscription in local database
    try {
      await prisma.subscription.create({
        data: {
          stripeSubscriptionId: subscription.id,
          stripeCustomerId: stripeCustomerId,
          stripePriceId: stripePriceId,
          accountId: accountId || null,
          status: subscription.status,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          metadata: metadata || {},
        },
      });
    } catch (dbError) {
      // Log but don't fail - subscription was created in Stripe
      logger.warn('Failed to store subscription in database', { subscriptionId: subscription.id, error: dbError.message });
    }

    res.status(201).json({
      success: true,
      data: {
        subscription,
        clientSecret: subscription.latest_invoice?.payment_intent?.client_secret,
      },
    });
  } catch (error) {
    logger.error('Error creating subscription', { error: error.message });
    next(error);
  }
});

// Update subscription
router.put('/:subscriptionId', async (req, res, next) => {
  try {
    const { priceId, metadata, cancelAtPeriodEnd, paymentMethodId } = req.body;
    const subscription = await stripeService.updateSubscription(req.params.subscriptionId, {
      priceId,
      metadata,
      cancelAtPeriodEnd,
      paymentMethodId,
    });

    // Update local database
    try {
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: req.params.subscriptionId },
        data: {
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        },
      });
    } catch (dbError) {
      logger.warn('Failed to update subscription in database', { subscriptionId: req.params.subscriptionId, error: dbError.message });
    }

    res.json({ success: true, data: subscription });
  } catch (error) {
    logger.error('Error updating subscription', { subscriptionId: req.params.subscriptionId, error: error.message });
    next(error);
  }
});

// Cancel subscription
router.post('/:subscriptionId/cancel', async (req, res, next) => {
  try {
    const { immediately = false } = req.body;
    const subscription = await stripeService.cancelSubscription(req.params.subscriptionId, { immediately });

    // Update local database
    try {
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: req.params.subscriptionId },
        data: {
          status: subscription.status,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          canceledAt: immediately ? new Date() : null,
        },
      });
    } catch (dbError) {
      logger.warn('Failed to update canceled subscription in database', { subscriptionId: req.params.subscriptionId, error: dbError.message });
    }

    res.json({ success: true, data: subscription });
  } catch (error) {
    logger.error('Error canceling subscription', { subscriptionId: req.params.subscriptionId, error: error.message });
    next(error);
  }
});

// Resume subscription (uncancel)
router.post('/:subscriptionId/resume', async (req, res, next) => {
  try {
    const subscription = await stripeService.resumeSubscription(req.params.subscriptionId);

    // Update local database
    try {
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: req.params.subscriptionId },
        data: {
          status: subscription.status,
          cancelAtPeriodEnd: false,
        },
      });
    } catch (dbError) {
      logger.warn('Failed to update resumed subscription in database', { subscriptionId: req.params.subscriptionId, error: dbError.message });
    }

    res.json({ success: true, data: subscription });
  } catch (error) {
    logger.error('Error resuming subscription', { subscriptionId: req.params.subscriptionId, error: error.message });
    next(error);
  }
});

// Pause subscription
router.post('/:subscriptionId/pause', async (req, res, next) => {
  try {
    const subscription = await stripeService.pauseSubscription(req.params.subscriptionId);

    // Update local database
    try {
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: req.params.subscriptionId },
        data: {
          status: 'paused',
        },
      });
    } catch (dbError) {
      logger.warn('Failed to update paused subscription in database', { subscriptionId: req.params.subscriptionId, error: dbError.message });
    }

    res.json({ success: true, data: subscription });
  } catch (error) {
    logger.error('Error pausing subscription', { subscriptionId: req.params.subscriptionId, error: error.message });
    next(error);
  }
});

// Unpause subscription
router.post('/:subscriptionId/unpause', async (req, res, next) => {
  try {
    const subscription = await stripeService.unpauseSubscription(req.params.subscriptionId);

    // Update local database
    try {
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: req.params.subscriptionId },
        data: {
          status: subscription.status,
        },
      });
    } catch (dbError) {
      logger.warn('Failed to update unpaused subscription in database', { subscriptionId: req.params.subscriptionId, error: dbError.message });
    }

    res.json({ success: true, data: subscription });
  } catch (error) {
    logger.error('Error unpausing subscription', { subscriptionId: req.params.subscriptionId, error: error.message });
    next(error);
  }
});

// Get upcoming invoice preview
router.get('/:subscriptionId/upcoming-invoice', async (req, res, next) => {
  try {
    // First get the subscription to get the customer ID
    const subscription = await stripeService.getSubscription(req.params.subscriptionId);
    const upcomingInvoice = await stripeService.getUpcomingInvoice(
      subscription.customer,
      req.params.subscriptionId
    );
    res.json({ success: true, data: upcomingInvoice });
  } catch (error) {
    logger.error('Error getting upcoming invoice', { subscriptionId: req.params.subscriptionId, error: error.message });
    next(error);
  }
});

// ==================== SUBSCRIPTION SCHEDULES ====================

// Create subscription schedule (for future-dated subscriptions)
router.post('/schedules', async (req, res, next) => {
  try {
    const { customerId, accountId, priceId, startDate, phases, metadata } = req.body;

    let stripeCustomerId = customerId;

    // If accountId is provided, get Stripe customer ID
    if (accountId && !stripeCustomerId) {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
      });

      if (!account) {
        return res.status(404).json({ success: false, error: 'Account not found' });
      }

      if (!account.stripeCustomerId) {
        return res.status(400).json({ success: false, error: 'Account does not have a Stripe customer ID' });
      }

      stripeCustomerId = account.stripeCustomerId;
    }

    if (!stripeCustomerId) {
      return res.status(400).json({ success: false, error: 'Customer ID or Account ID is required' });
    }

    const schedule = await stripeService.createSubscriptionSchedule({
      customerId: stripeCustomerId,
      priceId,
      startDate,
      phases,
      metadata: { accountId, ...metadata },
    });

    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    logger.error('Error creating subscription schedule', { error: error.message });
    next(error);
  }
});

// Cancel subscription schedule
router.post('/schedules/:scheduleId/cancel', async (req, res, next) => {
  try {
    const schedule = await stripeService.cancelSubscriptionSchedule(req.params.scheduleId);
    res.json({ success: true, data: schedule });
  } catch (error) {
    logger.error('Error canceling subscription schedule', { scheduleId: req.params.scheduleId, error: error.message });
    next(error);
  }
});

export default router;
