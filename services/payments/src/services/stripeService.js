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
};

export default stripeService;
