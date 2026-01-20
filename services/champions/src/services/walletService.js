/**
 * Wallet Service
 * Handles champion wallet operations and Stripe Connect
 */

import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { logger } from './logger.js';

const prisma = new PrismaClient();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const walletService = {
  /**
   * Get wallet for a champion
   */
  async getWallet(championId) {
    const wallet = await prisma.championWallet.findUnique({
      where: { championId },
      include: {
        champion: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            stripeConnectAccountId: true,
            stripeOnboardingComplete: true,
          },
        },
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    return wallet;
  },

  /**
   * Get wallet transactions
   */
  async getTransactions(championId, { page = 1, limit = 50 } = {}) {
    const wallet = await prisma.championWallet.findUnique({
      where: { championId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.walletTransaction.count({
        where: { walletId: wallet.id },
      }),
    ]);

    return {
      transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Create Stripe Connect account for a champion
   */
  async createStripeConnectAccount(championId) {
    const champion = await prisma.champion.findUnique({
      where: { id: championId },
    });

    if (!champion) {
      throw new Error('Champion not found');
    }

    if (champion.stripeConnectAccountId) {
      throw new Error('Champion already has a Stripe Connect account');
    }

    // Create Stripe Connect Express account
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: champion.email,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: 'individual',
      business_profile: {
        product_description: 'Panda Exteriors Champion Referral Program',
      },
      metadata: {
        championId: champion.id,
        referralCode: champion.referralCode,
      },
    });

    // Update champion with Stripe account ID
    await prisma.champion.update({
      where: { id: championId },
      data: {
        stripeConnectAccountId: account.id,
        stripeOnboardingComplete: false,
      },
    });

    logger.info('Stripe Connect account created', {
      championId,
      stripeAccountId: account.id,
    });

    return account;
  },

  /**
   * Get Stripe Connect onboarding link
   */
  async getOnboardingLink(championId, returnUrl, refreshUrl) {
    const champion = await prisma.champion.findUnique({
      where: { id: championId },
    });

    if (!champion) {
      throw new Error('Champion not found');
    }

    let stripeAccountId = champion.stripeConnectAccountId;

    // Create account if doesn't exist
    if (!stripeAccountId) {
      const account = await this.createStripeConnectAccount(championId);
      stripeAccountId = account.id;
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: refreshUrl || `${process.env.APP_URL}/champion/wallet?refresh=true`,
      return_url: returnUrl || `${process.env.APP_URL}/champion/wallet?onboarding=complete`,
      type: 'account_onboarding',
    });

    return accountLink;
  },

  /**
   * Check Stripe Connect account status
   */
  async checkStripeAccountStatus(championId) {
    const champion = await prisma.champion.findUnique({
      where: { id: championId },
    });

    if (!champion || !champion.stripeConnectAccountId) {
      return { connected: false, onboardingComplete: false };
    }

    try {
      const account = await stripe.accounts.retrieve(champion.stripeConnectAccountId);

      const onboardingComplete = account.details_submitted && account.payouts_enabled;

      // Update champion if status changed
      if (onboardingComplete !== champion.stripeOnboardingComplete) {
        await prisma.champion.update({
          where: { id: championId },
          data: {
            stripeOnboardingComplete: onboardingComplete,
            stripeBankAccountLast4: account.external_accounts?.data[0]?.last4,
          },
        });

        if (onboardingComplete) {
          await prisma.championActivity.create({
            data: {
              championId,
              type: 'BANK_CONNECTED',
              description: 'Bank account connected for payouts',
            },
          });
        }
      }

      return {
        connected: true,
        onboardingComplete,
        payoutsEnabled: account.payouts_enabled,
        chargesEnabled: account.charges_enabled,
        detailsSubmitted: account.details_submitted,
        bankLast4: account.external_accounts?.data[0]?.last4,
      };
    } catch (error) {
      logger.error('Error checking Stripe account status', {
        championId,
        error: error.message,
      });
      return { connected: false, error: error.message };
    }
  },

  /**
   * Request a payout (withdrawal)
   */
  async requestPayout(championId, amount = null) {
    const wallet = await prisma.championWallet.findUnique({
      where: { championId },
      include: { champion: true },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const champion = wallet.champion;

    // Check if Stripe Connect is set up
    if (!champion.stripeConnectAccountId || !champion.stripeOnboardingComplete) {
      throw new Error('Please complete bank account setup before requesting a payout');
    }

    // Default to full available balance
    const payoutAmount = amount || Number(wallet.availableBalance);

    // Validate amount
    if (payoutAmount <= 0) {
      throw new Error('No available balance to withdraw');
    }

    if (payoutAmount > Number(wallet.availableBalance)) {
      throw new Error('Insufficient available balance');
    }

    if (payoutAmount < Number(wallet.minimumPayout)) {
      throw new Error(`Minimum payout amount is $${wallet.minimumPayout}`);
    }

    // Create payout record
    const payout = await prisma.championPayout.create({
      data: {
        championId,
        type: 'ADJUSTMENT', // Using ADJUSTMENT for manual withdrawal requests
        amount: payoutAmount,
        status: 'PROCESSING',
        notes: 'Withdrawal request',
      },
    });

    try {
      // Transfer to connected account
      const transfer = await stripe.transfers.create({
        amount: Math.round(payoutAmount * 100), // Convert to cents
        currency: 'usd',
        destination: champion.stripeConnectAccountId,
        metadata: {
          championId: champion.id,
          payoutId: payout.id,
        },
      });

      // Update payout with transfer ID
      await prisma.championPayout.update({
        where: { id: payout.id },
        data: {
          status: 'PAID',
          processedAt: new Date(),
          stripeTransferId: transfer.id,
        },
      });

      // Update wallet
      await prisma.championWallet.update({
        where: { championId },
        data: {
          availableBalance: { decrement: payoutAmount },
          lifetimePayouts: { increment: payoutAmount },
        },
      });

      // Update champion
      await prisma.champion.update({
        where: { id: championId },
        data: {
          paidEarnings: { increment: payoutAmount },
        },
      });

      // Record transaction
      const updatedWallet = await prisma.championWallet.findUnique({
        where: { championId },
      });

      await prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT_WITHDRAWAL',
          amount: -payoutAmount,
          balanceAfter: updatedWallet.availableBalance,
          description: 'Withdrawal to bank account',
          payoutId: payout.id,
        },
      });

      // Log activity
      await prisma.championActivity.create({
        data: {
          championId,
          type: 'PAYOUT_PROCESSED',
          description: `Payout of $${payoutAmount} sent to bank account`,
          metadata: { payoutId: payout.id, transferId: transfer.id },
        },
      });

      logger.info('Payout processed', {
        championId,
        payoutId: payout.id,
        amount: payoutAmount,
        transferId: transfer.id,
      });

      return payout;
    } catch (error) {
      // Update payout as failed
      await prisma.championPayout.update({
        where: { id: payout.id },
        data: {
          status: 'FAILED',
          failureReason: error.message,
        },
      });

      logger.error('Payout failed', {
        championId,
        payoutId: payout.id,
        error: error.message,
      });

      throw error;
    }
  },

  /**
   * Process approved payouts via Stripe transfers
   */
  async processPayouts(payoutIds, userId) {
    const results = [];

    for (const payoutId of payoutIds) {
      const payout = await prisma.championPayout.findUnique({
        where: { id: payoutId },
        include: { champion: true },
      });

      if (!payout) {
        results.push({ payoutId, success: false, error: 'Payout not found' });
        continue;
      }

      if (payout.status !== 'APPROVED') {
        results.push({ payoutId, success: false, error: 'Payout must be approved first' });
        continue;
      }

      const champion = payout.champion;

      // Check if champion has Stripe Connect set up
      if (!champion.stripeConnectAccountId || !champion.stripeOnboardingComplete) {
        results.push({ payoutId, success: false, error: 'Champion has not completed bank setup' });
        continue;
      }

      try {
        // Create Stripe transfer
        const transfer = await stripe.transfers.create({
          amount: Math.round(Number(payout.amount) * 100), // Convert to cents
          currency: 'usd',
          destination: champion.stripeConnectAccountId,
          metadata: {
            championId: champion.id,
            payoutId: payout.id,
            type: payout.type,
          },
        });

        // Update payout status
        await prisma.championPayout.update({
          where: { id: payoutId },
          data: {
            status: 'PAID',
            processedAt: new Date(),
            processedById: userId,
            stripeTransferId: transfer.id,
          },
        });

        // Get wallet for this champion
        const wallet = await prisma.championWallet.findUnique({
          where: { championId: champion.id },
        });

        // Update wallet balance
        await prisma.championWallet.update({
          where: { championId: champion.id },
          data: {
            availableBalance: { decrement: payout.amount },
            lifetimePayouts: { increment: payout.amount },
          },
        });

        // Update champion paid earnings
        await prisma.champion.update({
          where: { id: champion.id },
          data: {
            paidEarnings: { increment: payout.amount },
          },
        });

        // Create wallet transaction record
        const updatedWallet = await prisma.championWallet.findUnique({
          where: { championId: champion.id },
        });

        await prisma.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'DEBIT_WITHDRAWAL',
            amount: -Number(payout.amount),
            balanceAfter: updatedWallet.availableBalance,
            description: `Payout for ${payout.type.replace('_', ' ').toLowerCase()}`,
            payoutId: payout.id,
          },
        });

        // Log activity
        await prisma.championActivity.create({
          data: {
            championId: champion.id,
            type: 'PAYOUT_PROCESSED',
            description: `Payout of $${payout.amount} sent to bank account`,
            metadata: { payoutId: payout.id, transferId: transfer.id },
          },
        });

        results.push({ payoutId, success: true, transferId: transfer.id });

        logger.info('Payout processed via Stripe', {
          payoutId,
          championId: champion.id,
          amount: payout.amount,
          transferId: transfer.id,
        });
      } catch (error) {
        // Update payout as failed
        await prisma.championPayout.update({
          where: { id: payoutId },
          data: {
            status: 'FAILED',
            failureReason: error.message,
          },
        });

        results.push({ payoutId, success: false, error: error.message });

        logger.error('Payout processing failed', {
          payoutId,
          championId: champion.id,
          error: error.message,
        });
      }
    }

    return results;
  },

  /**
   * Handle Stripe webhook events for Connect
   */
  async handleStripeWebhook(payload, signature) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err) {
      logger.error('Stripe webhook signature verification failed', { error: err.message });
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    logger.info('Stripe webhook received', { type: event.type });

    switch (event.type) {
      case 'account.updated': {
        const account = event.data.object;
        const championId = account.metadata?.championId;

        if (championId) {
          const onboardingComplete = account.details_submitted && account.payouts_enabled;

          await prisma.champion.update({
            where: { id: championId },
            data: {
              stripeOnboardingComplete: onboardingComplete,
              stripeBankAccountLast4: account.external_accounts?.data[0]?.last4,
            },
          });

          if (onboardingComplete) {
            // Check if we haven't already logged this event
            const existingActivity = await prisma.championActivity.findFirst({
              where: {
                championId,
                type: 'BANK_CONNECTED',
              },
            });

            if (!existingActivity) {
              await prisma.championActivity.create({
                data: {
                  championId,
                  type: 'BANK_CONNECTED',
                  description: 'Bank account connected for payouts',
                },
              });
            }
          }

          logger.info('Champion Stripe account updated', { championId, onboardingComplete });
        }
        break;
      }

      case 'transfer.created': {
        const transfer = event.data.object;
        const payoutId = transfer.metadata?.payoutId;

        if (payoutId) {
          logger.info('Transfer created for payout', { payoutId, transferId: transfer.id });
        }
        break;
      }

      case 'transfer.failed': {
        const transfer = event.data.object;
        const payoutId = transfer.metadata?.payoutId;

        if (payoutId) {
          await prisma.championPayout.update({
            where: { id: payoutId },
            data: {
              status: 'FAILED',
              failureReason: 'Transfer failed on Stripe',
            },
          });

          logger.error('Transfer failed for payout', { payoutId, transferId: transfer.id });
        }
        break;
      }

      case 'payout.paid': {
        // This is when the money actually hits the connected account's bank
        const payout = event.data.object;
        logger.info('Payout to connected account completed', {
          payoutId: payout.id,
          destination: payout.destination,
        });
        break;
      }

      case 'payout.failed': {
        const payout = event.data.object;
        logger.error('Payout to connected account failed', {
          payoutId: payout.id,
          failureCode: payout.failure_code,
          failureMessage: payout.failure_message,
        });
        break;
      }

      default:
        logger.info('Unhandled Stripe webhook event', { type: event.type });
    }

    return { received: true };
  },

  /**
   * Get Stripe Connect login link for existing connected accounts
   */
  async getStripeLoginLink(championId) {
    const champion = await prisma.champion.findUnique({
      where: { id: championId },
    });

    if (!champion || !champion.stripeConnectAccountId) {
      throw new Error('Champion does not have a Stripe Connect account');
    }

    const loginLink = await stripe.accounts.createLoginLink(champion.stripeConnectAccountId);
    return loginLink;
  },

  /**
   * Move pending balance to available (after approval)
   */
  async approvePayouts(payoutIds, userId) {
    const results = [];

    for (const payoutId of payoutIds) {
      const payout = await prisma.championPayout.findUnique({
        where: { id: payoutId },
        include: { champion: true },
      });

      if (!payout || payout.status !== 'PENDING') {
        results.push({ payoutId, success: false, error: 'Invalid or already processed' });
        continue;
      }

      // Update payout status
      await prisma.championPayout.update({
        where: { id: payoutId },
        data: {
          status: 'APPROVED',
          processedAt: new Date(),
          processedById: userId,
        },
      });

      // Move from pending to available in wallet
      const wallet = await prisma.championWallet.findUnique({
        where: { championId: payout.championId },
      });

      await prisma.championWallet.update({
        where: { championId: payout.championId },
        data: {
          pendingBalance: { decrement: payout.amount },
          availableBalance: { increment: payout.amount },
        },
      });

      // Update champion
      await prisma.champion.update({
        where: { id: payout.championId },
        data: {
          pendingEarnings: { decrement: payout.amount },
        },
      });

      results.push({ payoutId, success: true });

      logger.info('Payout approved', { payoutId, championId: payout.championId });
    }

    return results;
  },
};

export default walletService;
