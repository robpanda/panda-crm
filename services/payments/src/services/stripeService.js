import Stripe from 'stripe';
import { logger } from '../middleware/logger.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const stripeService = {
  // ==================== CUSTOMERS ====================

  async createCustomer({ email, name, phone, metadata = {} }) {
    logger.info('Creating Stripe customer', { email, name });

    const customer = await stripe.customers.create({
      email,
      name,
      phone,
      metadata: {
        source: 'panda-crm',
        ...metadata,
      },
    });

    logger.info('Stripe customer created', { customerId: customer.id });
    return customer;
  },

  async updateCustomer(customerId, { email, name, phone, metadata }) {
    logger.info('Updating Stripe customer', { customerId });

    const updateData = {};
    if (email) updateData.email = email;
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (metadata) updateData.metadata = metadata;

    return stripe.customers.update(customerId, updateData);
  },

  async getCustomer(customerId) {
    return stripe.customers.retrieve(customerId);
  },

  async deleteCustomer(customerId) {
    return stripe.customers.del(customerId);
  },

  // ==================== PAYMENT INTENTS ====================

  async createPaymentIntent({ amount, currency = 'usd', customerId, metadata = {}, description }) {
    logger.info('Creating payment intent', { amount, customerId });

    const paymentIntentData = {
      amount: Math.round(amount), // Amount should be in cents
      currency,
      description,
      metadata: {
        source: 'panda-crm',
        ...metadata,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    };

    // Only add customer if provided
    if (customerId) {
      paymentIntentData.customer = customerId;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    logger.info('Payment intent created', { paymentIntentId: paymentIntent.id });
    return paymentIntent;
  },

  async confirmPaymentIntent(paymentIntentId, paymentMethodId) {
    logger.info('Confirming payment intent', { paymentIntentId });

    return stripe.paymentIntents.confirm(paymentIntentId, {
      payment_method: paymentMethodId,
    });
  },

  async capturePaymentIntent(paymentIntentId) {
    return stripe.paymentIntents.capture(paymentIntentId);
  },

  async cancelPaymentIntent(paymentIntentId) {
    return stripe.paymentIntents.cancel(paymentIntentId);
  },

  async getPaymentIntent(paymentIntentId) {
    return stripe.paymentIntents.retrieve(paymentIntentId);
  },

  // ==================== PAYMENT LINKS ====================

  async createPaymentLink({ amount, currency = 'usd', description, metadata = {}, afterCompletionUrl }) {
    logger.info('Creating payment link', { amount, description });

    // First create a price for this amount
    const price = await stripe.prices.create({
      unit_amount: Math.round(amount * 100),
      currency,
      product_data: {
        name: description || 'Payment',
      },
    });

    const paymentLinkOptions = {
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        source: 'panda-crm',
        ...metadata,
      },
    };

    if (afterCompletionUrl) {
      paymentLinkOptions.after_completion = {
        type: 'redirect',
        redirect: { url: afterCompletionUrl },
      };
    }

    const paymentLink = await stripe.paymentLinks.create(paymentLinkOptions);

    logger.info('Payment link created', { paymentLinkId: paymentLink.id, url: paymentLink.url });
    return paymentLink;
  },

  async deactivatePaymentLink(paymentLinkId) {
    return stripe.paymentLinks.update(paymentLinkId, { active: false });
  },

  async getPaymentLink(paymentLinkId) {
    return stripe.paymentLinks.retrieve(paymentLinkId);
  },

  // ==================== INVOICES ====================

  async createInvoice({ customerId, items, dueDate, metadata = {} }) {
    logger.info('Creating Stripe invoice', { customerId, itemCount: items.length });

    // Create invoice
    const invoice = await stripe.invoices.create({
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: dueDate ? Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24)) : 30,
      metadata: {
        source: 'panda-crm',
        ...metadata,
      },
    });

    // Add line items
    for (const item of items) {
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount: Math.round(item.amount * 100),
        currency: 'usd',
        description: item.description,
      });
    }

    logger.info('Invoice created with items', { invoiceId: invoice.id });
    return invoice;
  },

  async finalizeInvoice(invoiceId) {
    return stripe.invoices.finalizeInvoice(invoiceId);
  },

  async sendInvoice(invoiceId) {
    return stripe.invoices.sendInvoice(invoiceId);
  },

  async voidInvoice(invoiceId) {
    return stripe.invoices.voidInvoice(invoiceId);
  },

  async getInvoice(invoiceId) {
    return stripe.invoices.retrieve(invoiceId);
  },

  async payInvoice(invoiceId, { paymentMethodId }) {
    return stripe.invoices.pay(invoiceId, {
      payment_method: paymentMethodId,
    });
  },

  // ==================== REFUNDS ====================

  async createRefund({ paymentIntentId, chargeId, amount, reason, metadata = {} }) {
    logger.info('Creating refund', { paymentIntentId, chargeId, amount });

    const refundData = {
      metadata: {
        source: 'panda-crm',
        ...metadata,
      },
    };

    if (paymentIntentId) refundData.payment_intent = paymentIntentId;
    if (chargeId) refundData.charge = chargeId;
    if (amount) refundData.amount = Math.round(amount * 100);
    if (reason) refundData.reason = reason;

    const refund = await stripe.refunds.create(refundData);

    logger.info('Refund created', { refundId: refund.id });
    return refund;
  },

  async getRefund(refundId) {
    return stripe.refunds.retrieve(refundId);
  },

  // ==================== PAYMENT METHODS ====================

  async listCustomerPaymentMethods(customerId, type = 'card') {
    return stripe.paymentMethods.list({
      customer: customerId,
      type,
    });
  },

  async attachPaymentMethod(paymentMethodId, customerId) {
    return stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });
  },

  async detachPaymentMethod(paymentMethodId) {
    return stripe.paymentMethods.detach(paymentMethodId);
  },

  async getPaymentMethod(paymentMethodId) {
    return stripe.paymentMethods.retrieve(paymentMethodId);
  },

  // ==================== CHARGES ====================

  async getCharge(chargeId) {
    return stripe.charges.retrieve(chargeId);
  },

  // ==================== CHECKOUT SESSIONS ====================

  async createCheckoutSession({ customerId, amount, description, successUrl, cancelUrl, metadata = {} }) {
    logger.info('Creating checkout session', { customerId, amount });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card', 'us_bank_account'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: description || 'Payment',
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        source: 'panda-crm',
        ...metadata,
      },
    });

    logger.info('Checkout session created', { sessionId: session.id });
    return session;
  },

  async getCheckoutSession(sessionId) {
    return stripe.checkout.sessions.retrieve(sessionId);
  },

  // ==================== WEBHOOKS ====================

  constructWebhookEvent(payload, signature, endpointSecret) {
    return stripe.webhooks.constructEvent(payload, signature, endpointSecret);
  },

  // ==================== PRODUCTS (for Subscriptions) ====================

  async createProduct({ name, description, metadata = {} }) {
    logger.info('Creating Stripe product', { name });

    const product = await stripe.products.create({
      name,
      description,
      metadata: {
        source: 'panda-crm',
        ...metadata,
      },
    });

    logger.info('Stripe product created', { productId: product.id });
    return product;
  },

  async getProduct(productId) {
    return stripe.products.retrieve(productId);
  },

  async updateProduct(productId, { name, description, active, metadata }) {
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (active !== undefined) updateData.active = active;
    if (metadata) updateData.metadata = metadata;

    return stripe.products.update(productId, updateData);
  },

  async listProducts({ active, limit = 100 } = {}) {
    const params = { limit };
    if (active !== undefined) params.active = active;
    return stripe.products.list(params);
  },

  // ==================== PRICES (for Subscriptions) ====================

  async createPrice({ productId, unitAmount, currency = 'usd', interval, intervalCount = 1, metadata = {} }) {
    logger.info('Creating Stripe price', { productId, unitAmount, interval });

    const price = await stripe.prices.create({
      product: productId,
      unit_amount: Math.round(unitAmount), // Amount in cents
      currency,
      recurring: {
        interval, // 'day', 'week', 'month', 'year'
        interval_count: intervalCount,
      },
      metadata: {
        source: 'panda-crm',
        ...metadata,
      },
    });

    logger.info('Stripe price created', { priceId: price.id });
    return price;
  },

  async getPrice(priceId) {
    return stripe.prices.retrieve(priceId);
  },

  async updatePrice(priceId, { active, metadata }) {
    const updateData = {};
    if (active !== undefined) updateData.active = active;
    if (metadata) updateData.metadata = metadata;

    return stripe.prices.update(priceId, updateData);
  },

  async listPrices({ productId, active, limit = 100 } = {}) {
    const params = { limit };
    if (productId) params.product = productId;
    if (active !== undefined) params.active = active;
    return stripe.prices.list(params);
  },

  // ==================== SUBSCRIPTIONS ====================

  async createSubscription({ customerId, priceId, paymentMethodId, metadata = {}, trialPeriodDays, collectionMethod = 'charge_automatically' }) {
    logger.info('Creating Stripe subscription', { customerId, priceId });

    const subscriptionData = {
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        source: 'panda-crm',
        ...metadata,
      },
      collection_method: collectionMethod,
    };

    // Attach payment method if provided
    if (paymentMethodId) {
      // First attach the payment method to the customer
      await this.attachPaymentMethod(paymentMethodId, customerId);
      // Set as default payment method
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
      subscriptionData.default_payment_method = paymentMethodId;
    }

    if (trialPeriodDays) {
      subscriptionData.trial_period_days = trialPeriodDays;
    }

    const subscription = await stripe.subscriptions.create(subscriptionData);

    logger.info('Stripe subscription created', { subscriptionId: subscription.id, status: subscription.status });
    return subscription;
  },

  async getSubscription(subscriptionId) {
    return stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice.payment_intent', 'customer', 'default_payment_method'],
    });
  },

  async updateSubscription(subscriptionId, { priceId, metadata, cancelAtPeriodEnd, paymentMethodId }) {
    logger.info('Updating Stripe subscription', { subscriptionId });

    const updateData = {};
    if (priceId) {
      // Get current subscription to find the item ID
      const subscription = await this.getSubscription(subscriptionId);
      updateData.items = [{
        id: subscription.items.data[0].id,
        price: priceId,
      }];
    }
    if (metadata) updateData.metadata = metadata;
    if (cancelAtPeriodEnd !== undefined) updateData.cancel_at_period_end = cancelAtPeriodEnd;
    if (paymentMethodId) updateData.default_payment_method = paymentMethodId;

    return stripe.subscriptions.update(subscriptionId, updateData);
  },

  async cancelSubscription(subscriptionId, { immediately = false } = {}) {
    logger.info('Canceling Stripe subscription', { subscriptionId, immediately });

    if (immediately) {
      return stripe.subscriptions.cancel(subscriptionId);
    }
    // Cancel at period end (graceful cancellation)
    return stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  },

  async resumeSubscription(subscriptionId) {
    logger.info('Resuming Stripe subscription', { subscriptionId });
    return stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
  },

  async listSubscriptions({ customerId, status, limit = 100 } = {}) {
    const params = { limit };
    if (customerId) params.customer = customerId;
    if (status) params.status = status; // 'active', 'past_due', 'canceled', 'unpaid', 'all'
    return stripe.subscriptions.list(params);
  },

  async pauseSubscription(subscriptionId) {
    logger.info('Pausing Stripe subscription', { subscriptionId });
    return stripe.subscriptions.update(subscriptionId, {
      pause_collection: { behavior: 'mark_uncollectible' },
    });
  },

  async unpauseSubscription(subscriptionId) {
    logger.info('Unpausing Stripe subscription', { subscriptionId });
    return stripe.subscriptions.update(subscriptionId, {
      pause_collection: '',
    });
  },

  // Get upcoming invoice for a subscription (preview next charge)
  async getUpcomingInvoice(customerId, subscriptionId) {
    const params = { customer: customerId };
    if (subscriptionId) params.subscription = subscriptionId;
    return stripe.invoices.retrieveUpcoming(params);
  },

  // ==================== SUBSCRIPTION SCHEDULES (for future-dated plans) ====================

  async createSubscriptionSchedule({ customerId, priceId, startDate, phases, metadata = {} }) {
    logger.info('Creating Stripe subscription schedule', { customerId, startDate });

    const scheduleData = {
      customer: customerId,
      start_date: startDate ? Math.floor(new Date(startDate).getTime() / 1000) : 'now',
      end_behavior: 'release',
      phases: phases || [{
        items: [{ price: priceId }],
        iterations: 1,
      }],
      metadata: {
        source: 'panda-crm',
        ...metadata,
      },
    };

    const schedule = await stripe.subscriptionSchedules.create(scheduleData);

    logger.info('Stripe subscription schedule created', { scheduleId: schedule.id });
    return schedule;
  },

  async cancelSubscriptionSchedule(scheduleId) {
    return stripe.subscriptionSchedules.cancel(scheduleId);
  },

  // ==================== CHARGE & PAYMENT LISTING (for sync) ====================

  async listCharges({ limit = 100, startingAfter = null, created = null } = {}) {
    logger.info('Listing Stripe charges', { limit, startingAfter, created });

    const params = { limit };
    if (startingAfter) params.starting_after = startingAfter;
    if (created) params.created = created;

    const charges = await stripe.charges.list(params);
    logger.info('Retrieved Stripe charges', { count: charges.data.length, hasMore: charges.has_more });
    return charges;
  },

  async listPaymentIntents({ limit = 100, startingAfter = null, created = null } = {}) {
    logger.info('Listing Stripe payment intents', { limit, startingAfter, created });

    const params = { limit };
    if (startingAfter) params.starting_after = startingAfter;
    if (created) params.created = created;

    const paymentIntents = await stripe.paymentIntents.list(params);
    logger.info('Retrieved Stripe payment intents', { count: paymentIntents.data.length, hasMore: paymentIntents.has_more });
    return paymentIntents;
  },

  async getCharge(chargeId) {
    return stripe.charges.retrieve(chargeId);
  },

  async getBalanceTransactions({ limit = 100, startingAfter = null, created = null, type = null } = {}) {
    logger.info('Listing Stripe balance transactions', { limit, type });

    const params = { limit };
    if (startingAfter) params.starting_after = startingAfter;
    if (created) params.created = created;
    if (type) params.type = type;

    const transactions = await stripe.balanceTransactions.list(params);
    return transactions;
  },
};

export default stripeService;
