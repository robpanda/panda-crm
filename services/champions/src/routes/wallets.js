/**
 * Wallets Routes
 * Champion wallet management and Stripe Connect operations
 */

import express from 'express';
import { walletService } from '../services/walletService.js';
import { logger } from '../services/logger.js';

const router = express.Router();

// GET /api/wallets/:championId - Get champion's wallet
router.get('/:championId', async (req, res) => {
  try {
    const wallet = await walletService.getWallet(req.params.championId);

    if (!wallet) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Wallet not found' },
      });
    }

    res.json({
      success: true,
      data: wallet,
    });
  } catch (error) {
    logger.error('Error getting wallet', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: error.message },
    });
  }
});

// GET /api/wallets/:championId/transactions - Get wallet transactions
router.get('/:championId/transactions', async (req, res) => {
  try {
    const { page, limit } = req.query;

    const result = await walletService.getTransactions(req.params.championId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });

    res.json({
      success: true,
      data: result.transactions,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error getting transactions', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: error.message },
    });
  }
});

// POST /api/wallets/:championId/stripe-connect - Create Stripe Connect account
router.post('/:championId/stripe-connect', async (req, res) => {
  try {
    const account = await walletService.createStripeConnectAccount(req.params.championId);

    res.status(201).json({
      success: true,
      data: account,
    });
  } catch (error) {
    logger.error('Error creating Stripe Connect account', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'STRIPE_ERROR', message: error.message },
    });
  }
});

// GET /api/wallets/:championId/onboarding-link - Get Stripe onboarding link
router.get('/:championId/onboarding-link', async (req, res) => {
  try {
    const { returnUrl, refreshUrl } = req.query;
    const link = await walletService.getOnboardingLink(req.params.championId, returnUrl, refreshUrl);

    res.json({
      success: true,
      data: { url: link.url, expiresAt: link.expires_at },
    });
  } catch (error) {
    logger.error('Error getting onboarding link', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'STRIPE_ERROR', message: error.message },
    });
  }
});

// GET /api/wallets/:championId/stripe-status - Check Stripe account status
router.get('/:championId/stripe-status', async (req, res) => {
  try {
    const status = await walletService.checkStripeAccountStatus(req.params.championId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('Error getting Stripe status', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'STRIPE_ERROR', message: error.message },
    });
  }
});

// POST /api/wallets/:championId/request-payout - Request a payout
router.post('/:championId/request-payout', async (req, res) => {
  try {
    const { amount, method } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Valid amount is required' },
      });
    }

    const payout = await walletService.requestPayout(req.params.championId, amount, method);

    res.status(201).json({
      success: true,
      data: payout,
    });
  } catch (error) {
    logger.error('Error requesting payout', { error: error.message });

    const status = error.message.includes('Insufficient') ? 400 : 500;
    res.status(status).json({
      success: false,
      error: { code: 'PAYOUT_ERROR', message: error.message },
    });
  }
});

// GET /api/wallets/:championId/stripe-login - Get Stripe dashboard login link
router.get('/:championId/stripe-login', async (req, res) => {
  try {
    const loginLink = await walletService.getStripeLoginLink(req.params.championId);

    res.json({
      success: true,
      data: { url: loginLink.url },
    });
  } catch (error) {
    logger.error('Error getting Stripe login link', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'STRIPE_ERROR', message: error.message },
    });
  }
});

// POST /api/wallets/stripe-webhook - Handle Stripe webhook events
router.post('/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];
    await walletService.handleStripeWebhook(req.body, sig);

    res.json({ received: true });
  } catch (error) {
    logger.error('Error handling Stripe webhook', { error: error.message });
    res.status(400).json({
      success: false,
      error: { code: 'WEBHOOK_ERROR', message: error.message },
    });
  }
});

export default router;
