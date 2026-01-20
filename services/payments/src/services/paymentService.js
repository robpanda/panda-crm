// Payment Service - Core payment operations including Stripe sync
import { PrismaClient } from '@prisma/client';
import { stripeService } from './stripeService.js';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

export const paymentService = {
  /**
   * Sync payments from Stripe into the CRM database
   * Pulls charges from Stripe and creates payment records for any that don't exist
   * Uses stripeChargeId and stripePaymentIntentId to prevent duplicates
   *
   * @param {Object} options
   * @param {number} options.daysBack - Number of days to look back (default: 30)
   * @param {number} options.limit - Maximum number of charges to process (default: 100)
   * @returns {Object} Sync results with counts
   */
  async syncStripePayments({ daysBack = 30, limit = 100 } = {}) {
    logger.info('Starting Stripe payment sync', { daysBack, limit });

    // Calculate the date range
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const created = { gte: Math.floor(startDate.getTime() / 1000) };

    // Fetch charges from Stripe
    const charges = await stripeService.listCharges({ limit, created });

    let created_count = 0;
    let skipped = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];

    for (const charge of charges.data) {
      try {
        // Skip if not succeeded
        if (charge.status !== 'succeeded') {
          skipped++;
          continue;
        }

        // Check if payment already exists (by stripeChargeId or stripePaymentIntentId)
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

        // Generate payment number with proper NaN handling
        const lastPayment = await prisma.payment.findFirst({
          where: {
            paymentNumber: {
              startsWith: 'PAY-',
            },
          },
          orderBy: { paymentNumber: 'desc' },
        });
        let nextNumber = 1;
        if (lastPayment && lastPayment.paymentNumber) {
          const parsed = parseInt(lastPayment.paymentNumber.replace('PAY-', ''), 10);
          nextNumber = isNaN(parsed) ? 1 : parsed + 1;
        }
        const paymentNumber = `PAY-${String(nextNumber).padStart(6, '0')}`;

        // Map Stripe payment method type to valid PaymentMethod enum
        // Valid values: CHECK, CREDIT_CARD, ACH, WIRE, CASH, INSURANCE_CHECK, FINANCING
        const stripeMethodType = charge.payment_method_details?.type;
        let paymentMethod = 'CHECK'; // Default fallback
        if (stripeMethodType === 'card') {
          paymentMethod = 'CREDIT_CARD';
        } else if (stripeMethodType === 'us_bank_account' || stripeMethodType === 'ach_debit' || stripeMethodType === 'ach_credit_transfer') {
          paymentMethod = 'ACH';
        } else if (stripeMethodType === 'wire_transfer') {
          paymentMethod = 'WIRE';
        }

        // Create the payment record (invoiceId is now optional)
        const payment = await prisma.payment.create({
          data: {
            paymentNumber,
            amount: charge.amount / 100, // Convert from cents
            paymentDate: new Date(charge.created * 1000),
            paymentMethod,
            status: 'SETTLED',
            invoiceId: invoiceId || null,
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

        created_count++;
        logger.info('Synced Stripe charge', {
          chargeId: charge.id,
          paymentId: payment.id,
          amount: charge.amount / 100,
        });
      } catch (err) {
        failed++;
        errors.push({ chargeId: charge.id, error: err.message });
        logger.error('Failed to sync charge', { chargeId: charge.id, error: err.message });
      }
    }

    logger.info('Stripe payment sync completed', {
      created: created_count,
      updated,
      skipped,
      failed,
      total: charges.data.length,
    });

    return {
      created: created_count,
      updated,
      skipped,
      failed,
      total: charges.data.length,
      hasMore: charges.has_more,
      errors: errors.length > 0 ? errors : undefined,
    };
  },

  /**
   * Get a payment by ID
   */
  async getPayment(id) {
    return prisma.payment.findUnique({
      where: { id },
      include: {
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            total: true,
          },
        },
      },
    });
  },

  /**
   * List payments with pagination and filters
   */
  async listPayments({ page = 1, limit = 20, invoiceId, status, startDate, endDate } = {}) {
    const where = {};

    if (invoiceId) where.invoiceId = invoiceId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.paymentDate = {};
      if (startDate) where.paymentDate.gte = new Date(startDate);
      if (endDate) where.paymentDate.lte = new Date(endDate);
    }

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { paymentDate: 'desc' },
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
            },
          },
        },
      }),
      prisma.payment.count({ where }),
    ]);

    return {
      payments,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
};

export default paymentService;
