import express from 'express';
import { PrismaClient } from '@prisma/client';
import { stripeService } from '../services/stripeService.js';
import { quickbooksService } from '../services/quickbooksService.js';
import { logger } from '../middleware/logger.js';

// Workflows service URL for commission triggers
const WORKFLOWS_SERVICE_URL = process.env.WORKFLOWS_SERVICE_URL || 'http://panda-crm-workflows.panda-crm-cluster.local:3008';

// Commission triggers wrapper - calls workflows service via HTTP
const commissionTriggers = {
  async onJobPaidInFull(serviceContractId) {
    try {
      const response = await fetch(`${WORKFLOWS_SERVICE_URL}/api/commissions/trigger/job-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceContractId }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        logger.error('Failed to trigger commission via workflows service', { serviceContractId, error: errorText });
        return null;
      }
      const result = await response.json();
      logger.info('Commission triggered via workflows service', { serviceContractId, result });
      return result;
    } catch (error) {
      logger.error('Error calling workflows service for commission trigger', { serviceContractId, error: error.message });
      return null;
    }
  }
};

const router = express.Router();
const prisma = new PrismaClient();

// ============================================================================
// HELPER FUNCTIONS FOR CONTRACT-INVOICE AUTOMATIONS
// These replace Salesforce flows: Trigger_Invoice_Roll_Up, BackEnd_Commission_Ready
// ============================================================================

/**
 * Update account rollup fields when invoice balances change
 * Replaces Salesforce: Trigger_Invoice_Roll_Up flow
 */
async function updateAccountRollups(accountId) {
  if (!accountId) return;

  try {
    // Get all invoices for this account (excluding PM invoices for separate calculation)
    const invoices = await prisma.invoice.findMany({
      where: { accountId },
    });

    // Calculate rollups
    let totalInvoiceAmount = 0;
    let totalPaidAmount = 0;
    let balanceDue = 0;
    let invoiceCount = 0;
    let overdueInvoiceCount = 0;
    let totalOverdueAmount = 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const invoice of invoices) {
      invoiceCount++;
      totalInvoiceAmount += parseFloat(invoice.total || 0);
      totalPaidAmount += parseFloat(invoice.amountPaid || 0);
      balanceDue += parseFloat(invoice.balanceDue || 0);

      // Check if overdue
      if (invoice.dueDate && new Date(invoice.dueDate) < today && parseFloat(invoice.balanceDue) > 0) {
        overdueInvoiceCount++;
        totalOverdueAmount += parseFloat(invoice.balanceDue);
      }
    }

    // Calculate collected percent
    const collectedPercent = totalInvoiceAmount > 0
      ? (totalPaidAmount / totalInvoiceAmount) * 100
      : 0;

    // Get last payment date
    let lastPaymentDate = null;
    const lastPayment = await prisma.payment.findFirst({
      where: {
        invoice: { accountId },
        status: 'SETTLED',
      },
      orderBy: { paymentDate: 'desc' },
    });

    if (lastPayment) {
      lastPaymentDate = lastPayment.paymentDate;
    }

    // Update account with rollup values
    await prisma.account.update({
      where: { id: accountId },
      data: {
        totalInvoiceAmount: Math.round(totalInvoiceAmount * 100) / 100,
        totalPaidAmount: Math.round(totalPaidAmount * 100) / 100,
        balanceDue: Math.round(balanceDue * 100) / 100,
        invoiceCount,
        overdueInvoiceCount,
        totalOverdueAmount: Math.round(totalOverdueAmount * 100) / 100,
        collectedPercent: Math.round(collectedPercent * 100) / 100,
        lastPaymentDate,
      },
    });

    logger.info('Account rollups updated', { accountId, invoiceCount, totalPaidAmount, balanceDue });
  } catch (error) {
    logger.error('Failed to update account rollups', { accountId, error: error.message });
  }
}

/**
 * Trigger commission creation when invoice is paid in full
 * Replaces Salesforce: BackEnd_Commission_Ready flow
 */
async function triggerCommissionOnPaidInFull(invoice) {
  if (!invoice || parseFloat(invoice.balanceDue) > 0) return;

  try {
    // Find the service contract linked to this invoice
    let serviceContract = null;

    // First, try direct link
    if (invoice.serviceContractId) {
      serviceContract = await prisma.serviceContract.findUnique({
        where: { id: invoice.serviceContractId },
      });
    }

    // If no direct link, try to find via opportunity
    if (!serviceContract && invoice.opportunityId) {
      serviceContract = await prisma.serviceContract.findFirst({
        where: { opportunityId: invoice.opportunityId },
      });
    }

    // If still no service contract, try to find via account
    if (!serviceContract && invoice.accountId) {
      // Get the most recent service contract for this account that doesn't have back-end commission ready
      serviceContract = await prisma.serviceContract.findFirst({
        where: {
          accountId: invoice.accountId,
          backEndCommissionReady: false,
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (serviceContract) {
      // Check if commission already triggered
      if (!serviceContract.backEndCommissionReady) {
        logger.info('Triggering back-end commission for paid invoice', {
          invoiceId: invoice.id,
          serviceContractId: serviceContract.id,
        });

        await commissionTriggers.onJobPaidInFull(serviceContract.id);
      } else {
        logger.info('Back-end commission already triggered for this contract', {
          serviceContractId: serviceContract.id,
        });
      }
    } else {
      logger.info('No service contract found for paid invoice', { invoiceId: invoice.id });
    }
  } catch (error) {
    logger.error('Failed to trigger commission on paid invoice', {
      invoiceId: invoice.id,
      error: error.message,
    });
  }
}

/**
 * Sync payment to QuickBooks
 * Creates a QB Payment record linked to the QB Invoice
 */
async function syncPaymentToQuickBooks(payment, invoice) {
  if (!payment || !invoice) return;

  try {
    // Check if QB is configured and invoice has QB ID
    if (!process.env.QB_REALM_ID || !invoice.qbInvoiceId) {
      logger.info('Skipping QB sync - not configured or invoice not in QB', {
        paymentId: payment.id,
        hasQbRealm: !!process.env.QB_REALM_ID,
        hasQbInvoice: !!invoice.qbInvoiceId,
      });
      return;
    }

    // Check if payment already synced
    if (payment.qbPaymentId) {
      logger.info('Payment already synced to QuickBooks', { paymentId: payment.id, qbPaymentId: payment.qbPaymentId });
      return;
    }

    // Get account for QB customer ID
    const account = await prisma.account.findUnique({
      where: { id: invoice.accountId },
    });

    if (!account?.qbCustomerId) {
      logger.info('Account not synced to QuickBooks', { accountId: invoice.accountId });
      return;
    }

    // Sync payment to QuickBooks
    const qbPayment = await quickbooksService.syncPaymentFromStripe({
      paymentId: payment.id,
      invoiceId: invoice.id,
      qbInvoiceId: invoice.qbInvoiceId,
      qbCustomerId: account.qbCustomerId,
      amount: parseFloat(payment.amount),
      paymentDate: payment.paymentDate,
      paymentMethod: payment.paymentMethod,
      referenceNumber: payment.stripePaymentIntentId || payment.paymentNumber,
    });

    if (qbPayment?.Id) {
      // Update payment with QB ID
      await prisma.payment.update({
        where: { id: payment.id },
        data: { qbPaymentId: qbPayment.Id },
      });

      logger.info('Payment synced to QuickBooks', {
        paymentId: payment.id,
        qbPaymentId: qbPayment.Id,
      });
    }
  } catch (error) {
    logger.error('Failed to sync payment to QuickBooks', {
      paymentId: payment.id,
      error: error.message,
    });
    // Don't throw - QB sync failure shouldn't block payment processing
  }
}

/**
 * Update service contract collection tracking when payment received
 * This tracks the collected percent for 30% trigger (SALES_FLIP commission)
 */
async function updateContractCollectionTracking(invoice) {
  if (!invoice) return;

  try {
    // Find the service contract
    let serviceContract = null;

    if (invoice.serviceContractId) {
      serviceContract = await prisma.serviceContract.findUnique({
        where: { id: invoice.serviceContractId },
      });
    } else if (invoice.opportunityId) {
      serviceContract = await prisma.serviceContract.findFirst({
        where: { opportunityId: invoice.opportunityId },
      });
    }

    if (serviceContract) {
      const contractTotal = parseFloat(serviceContract.contractTotal || 0);
      const paidAmount = parseFloat(invoice.amountPaid || 0);
      const collectedPercent = contractTotal > 0 ? (paidAmount / contractTotal) * 100 : 0;

      await prisma.serviceContract.update({
        where: { id: serviceContract.id },
        data: {
          paidAmount: Math.round(paidAmount * 100) / 100,
          balanceDue: Math.round(parseFloat(invoice.balanceDue || 0) * 100) / 100,
          collectedPercent: Math.round(collectedPercent * 100) / 100,
        },
      });

      // Check if 30% collected - trigger SALES_FLIP commission for PandaClaims
      if (collectedPercent >= 30) {
        await commissionTriggers.onCollectionUpdated(serviceContract.id, collectedPercent);
      }

      logger.info('Service contract collection tracking updated', {
        serviceContractId: serviceContract.id,
        collectedPercent: Math.round(collectedPercent * 100) / 100,
      });
    }
  } catch (error) {
    logger.error('Failed to update contract collection tracking', {
      invoiceId: invoice.id,
      error: error.message,
    });
  }
}

// Stripe webhook endpoint
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripeService.constructWebhookEvent(req.body, sig, endpointSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed', { error: err.message });
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  logger.info('Stripe webhook received', { type: event.type, id: event.id });

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;

      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(event.data.object);
        break;

      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case 'charge.refunded':
        await handleChargeRefunded(event.data.object);
        break;

      case 'customer.created':
      case 'customer.updated':
        await handleCustomerUpdated(event.data.object);
        break;

      // Subscription events
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'customer.subscription.paused':
        await handleSubscriptionPaused(event.data.object);
        break;

      case 'customer.subscription.resumed':
        await handleSubscriptionResumed(event.data.object);
        break;

      case 'customer.subscription.trial_will_end':
        await handleSubscriptionTrialWillEnd(event.data.object);
        break;

      default:
        logger.info('Unhandled webhook event type', { type: event.type });
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Webhook handler error', { type: event.type, error: error.message });
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

// Payment intent succeeded
async function handlePaymentIntentSucceeded(paymentIntent) {
  const { id, amount, metadata, charges } = paymentIntent;

  logger.info('Payment intent succeeded', { paymentIntentId: id, amount });

  const charge = charges?.data?.[0];
  const invoiceId = metadata?.invoiceId;
  const accountId = metadata?.accountId;

  if (!invoiceId) {
    logger.info('No invoice ID in metadata, skipping payment record');
    return;
  }

  // Check if payment already recorded
  const existingPayment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: id },
  });

  if (existingPayment) {
    logger.info('Payment already recorded', { paymentId: existingPayment.id });
    return;
  }

  // Generate payment number
  const lastPayment = await prisma.payment.findFirst({
    orderBy: { paymentNumber: 'desc' },
  });
  const nextNumber = lastPayment
    ? parseInt(lastPayment.paymentNumber.replace('PAY-', '')) + 1
    : 1;
  const paymentNumber = `PAY-${String(nextNumber).padStart(6, '0')}`;

  // Create payment record
  const payment = await prisma.payment.create({
    data: {
      paymentNumber,
      amount: amount / 100,
      paymentDate: new Date(),
      paymentMethod: 'CREDIT_CARD',
      status: 'SETTLED',
      invoiceId,
      stripePaymentIntentId: id,
      stripeChargeId: charge?.id,
      stripeReceiptUrl: charge?.receipt_url,
      stripePaymentMethodId: paymentIntent.payment_method,
    },
  });

  // Update invoice
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
  });

  if (invoice) {
    const newAmountPaid = parseFloat(invoice.amountPaid) + (amount / 100);
    const newBalanceDue = parseFloat(invoice.total) - newAmountPaid;

    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid: newAmountPaid,
        balanceDue: newBalanceDue,
        status: newBalanceDue <= 0 ? 'PAID' : invoice.status,
      },
    });

    // ========================================================================
    // CONTRACT-INVOICE AUTOMATIONS (Replaces Salesforce Flows)
    // ========================================================================

    // 1. Update Account rollups (Trigger_Invoice_Roll_Up equivalent)
    await updateAccountRollups(invoice.accountId);

    // 2. Update Service Contract collection tracking
    await updateContractCollectionTracking(updatedInvoice);

    // 3. Trigger back-end commission if invoice is now paid in full (BackEnd_Commission_Ready equivalent)
    if (newBalanceDue <= 0) {
      await triggerCommissionOnPaidInFull(updatedInvoice);
    }

    // 4. Sync payment to QuickBooks
    await syncPaymentToQuickBooks(payment, updatedInvoice);
  }

  logger.info('Payment recorded from webhook', { paymentId: payment.id, invoiceId });
}

// Payment intent failed
async function handlePaymentIntentFailed(paymentIntent) {
  const { id, metadata, last_payment_error } = paymentIntent;

  logger.warn('Payment intent failed', {
    paymentIntentId: id,
    error: last_payment_error?.message,
  });

  // Check for existing pending payment
  const existingPayment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId: id },
  });

  if (existingPayment) {
    await prisma.payment.update({
      where: { id: existingPayment.id },
      data: {
        status: 'FAILED',
        stripeFailureCode: last_payment_error?.code,
        stripeFailureMessage: last_payment_error?.message,
      },
    });
  }
}

// Checkout session completed
async function handleCheckoutSessionCompleted(session) {
  const { id, payment_intent, amount_total, metadata } = session;

  logger.info('Checkout session completed', { sessionId: id, paymentIntentId: payment_intent });

  // Payment will be handled by payment_intent.succeeded webhook
}

// Invoice paid (Stripe Invoice, not our Invoice model)
async function handleInvoicePaid(stripeInvoice) {
  const { id, customer, amount_paid, metadata } = stripeInvoice;

  logger.info('Stripe invoice paid', { stripeInvoiceId: id, amount: amount_paid });

  // Find our invoice by Stripe ID
  const invoice = await prisma.invoice.findUnique({
    where: { stripeInvoiceId: id },
  });

  if (invoice) {
    const updatedInvoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        status: 'PAID',
        amountPaid: amount_paid / 100,
        balanceDue: 0,
      },
    });

    logger.info('Invoice marked as paid', { invoiceId: invoice.id });

    // ========================================================================
    // CONTRACT-INVOICE AUTOMATIONS (Replaces Salesforce Flows)
    // ========================================================================

    // 1. Update Account rollups (Trigger_Invoice_Roll_Up equivalent)
    await updateAccountRollups(invoice.accountId);

    // 2. Update Service Contract collection tracking
    await updateContractCollectionTracking(updatedInvoice);

    // 3. Trigger back-end commission (BackEnd_Commission_Ready equivalent)
    await triggerCommissionOnPaidInFull(updatedInvoice);
  }
}

// Invoice payment failed
async function handleInvoicePaymentFailed(stripeInvoice) {
  const { id, customer, last_finalization_error } = stripeInvoice;

  logger.warn('Stripe invoice payment failed', { stripeInvoiceId: id });

  const invoice = await prisma.invoice.findUnique({
    where: { stripeInvoiceId: id },
  });

  if (invoice) {
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        qbSyncError: last_finalization_error?.message || 'Payment failed',
      },
    });
  }
}

// Charge refunded
async function handleChargeRefunded(charge) {
  const { id, payment_intent, amount_refunded, refunds } = charge;

  logger.info('Charge refunded', { chargeId: id, amountRefunded: amount_refunded });

  // Find payment by charge or payment intent
  const payment = await prisma.payment.findFirst({
    where: {
      OR: [
        { stripeChargeId: id },
        { stripePaymentIntentId: payment_intent },
      ],
    },
  });

  if (payment) {
    const latestRefund = refunds?.data?.[0];
    const isFullRefund = amount_refunded >= (parseFloat(payment.amount) * 100);

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        stripeRefundId: latestRefund?.id,
      },
    });

    // Update invoice balance
    if (payment.invoiceId) {
      const invoice = await prisma.invoice.findUnique({
        where: { id: payment.invoiceId },
      });

      if (invoice) {
        const refundAmount = amount_refunded / 100;
        const updatedInvoice = await prisma.invoice.update({
          where: { id: payment.invoiceId },
          data: {
            amountPaid: Math.max(0, parseFloat(invoice.amountPaid) - refundAmount),
            balanceDue: parseFloat(invoice.balanceDue) + refundAmount,
            status: 'SENT',
          },
        });

        // Update Account rollups after refund
        await updateAccountRollups(invoice.accountId);

        // Update Service Contract collection tracking after refund
        await updateContractCollectionTracking(updatedInvoice);
      }
    }

    logger.info('Payment updated from refund webhook', { paymentId: payment.id });
  }
}

// ==================== SUBSCRIPTION WEBHOOK HANDLERS ====================

// Subscription created
async function handleSubscriptionCreated(subscription) {
  const { id, customer, status, current_period_start, current_period_end, cancel_at_period_end, items, metadata } = subscription;

  logger.info('Subscription created in Stripe', { subscriptionId: id, status });

  // Check if subscription already exists in database
  const existing = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: id },
  });

  if (existing) {
    logger.info('Subscription already exists in database', { subscriptionId: id });
    return;
  }

  // Get price ID from items
  const priceId = items?.data?.[0]?.price?.id;

  try {
    await prisma.subscription.create({
      data: {
        stripeSubscriptionId: id,
        stripeCustomerId: typeof customer === 'string' ? customer : customer.id,
        stripePriceId: priceId || null,
        accountId: metadata?.accountId || null,
        status: status.toUpperCase(),
        currentPeriodStart: new Date(current_period_start * 1000),
        currentPeriodEnd: new Date(current_period_end * 1000),
        cancelAtPeriodEnd: cancel_at_period_end || false,
        metadata: metadata || {},
      },
    });

    logger.info('Subscription record created', { subscriptionId: id });
  } catch (error) {
    logger.error('Failed to create subscription record', { subscriptionId: id, error: error.message });
  }
}

// Subscription updated
async function handleSubscriptionUpdated(subscription) {
  const { id, status, current_period_start, current_period_end, cancel_at_period_end, canceled_at, items, metadata } = subscription;

  logger.info('Subscription updated in Stripe', { subscriptionId: id, status });

  const priceId = items?.data?.[0]?.price?.id;

  try {
    const updateResult = await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: id },
      data: {
        status: status.toUpperCase(),
        stripePriceId: priceId || undefined,
        currentPeriodStart: new Date(current_period_start * 1000),
        currentPeriodEnd: new Date(current_period_end * 1000),
        cancelAtPeriodEnd: cancel_at_period_end || false,
        canceledAt: canceled_at ? new Date(canceled_at * 1000) : null,
        metadata: metadata || {},
      },
    });

    if (updateResult.count === 0) {
      // Subscription doesn't exist locally, create it
      logger.info('Subscription not found locally, creating from webhook', { subscriptionId: id });
      await handleSubscriptionCreated(subscription);
    } else {
      logger.info('Subscription record updated', { subscriptionId: id });
    }
  } catch (error) {
    logger.error('Failed to update subscription record', { subscriptionId: id, error: error.message });
  }
}

// Subscription deleted (canceled immediately)
async function handleSubscriptionDeleted(subscription) {
  const { id } = subscription;

  logger.info('Subscription deleted in Stripe', { subscriptionId: id });

  try {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: id },
      data: {
        status: 'CANCELED',
        canceledAt: new Date(),
      },
    });

    logger.info('Subscription marked as canceled', { subscriptionId: id });
  } catch (error) {
    logger.error('Failed to mark subscription as canceled', { subscriptionId: id, error: error.message });
  }
}

// Subscription paused
async function handleSubscriptionPaused(subscription) {
  const { id } = subscription;

  logger.info('Subscription paused in Stripe', { subscriptionId: id });

  try {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: id },
      data: {
        status: 'PAUSED',
      },
    });

    logger.info('Subscription marked as paused', { subscriptionId: id });
  } catch (error) {
    logger.error('Failed to mark subscription as paused', { subscriptionId: id, error: error.message });
  }
}

// Subscription resumed
async function handleSubscriptionResumed(subscription) {
  const { id, status, current_period_start, current_period_end } = subscription;

  logger.info('Subscription resumed in Stripe', { subscriptionId: id });

  try {
    await prisma.subscription.updateMany({
      where: { stripeSubscriptionId: id },
      data: {
        status: status.toUpperCase(),
        currentPeriodStart: new Date(current_period_start * 1000),
        currentPeriodEnd: new Date(current_period_end * 1000),
      },
    });

    logger.info('Subscription marked as resumed', { subscriptionId: id });
  } catch (error) {
    logger.error('Failed to mark subscription as resumed', { subscriptionId: id, error: error.message });
  }
}

// Subscription trial will end soon
async function handleSubscriptionTrialWillEnd(subscription) {
  const { id, customer, trial_end, metadata } = subscription;

  logger.info('Subscription trial will end soon', {
    subscriptionId: id,
    trialEnd: trial_end ? new Date(trial_end * 1000).toISOString() : null,
  });

  // This is primarily for notification purposes
  // Could trigger an email or notification to the customer/account
  // For now, just log it - can be expanded later for notification integration

  if (metadata?.accountId) {
    logger.info('Trial ending notification for account', {
      accountId: metadata.accountId,
      subscriptionId: id,
      trialEndDate: trial_end ? new Date(trial_end * 1000).toISOString() : null,
    });
  }
}

// Customer updated
async function handleCustomerUpdated(customer) {
  const { id, email, name, metadata } = customer;

  logger.info('Customer updated in Stripe', { customerId: id, email });

  // Update account if metadata contains accountId
  if (metadata?.accountId) {
    await prisma.account.update({
      where: { id: metadata.accountId },
      data: { stripeCustomerId: id },
    });
  }
}

export default router;
