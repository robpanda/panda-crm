/**
 * Payouts Routes
 * Admin operations for managing champion payouts
 */

import express from 'express';
import { walletService } from '../services/walletService.js';
import { PrismaClient } from '@prisma/client';
import { logger } from '../services/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/payouts - List all payouts (admin)
router.get('/', async (req, res) => {
  try {
    const { championId, status, type, page, limit } = req.query;

    const where = {};

    if (championId) {
      where.championId = championId;
    }

    if (status) {
      where.status = status;
    }

    if (type) {
      where.type = type;
    }

    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 50;

    const [payouts, total] = await Promise.all([
      prisma.championPayout.findMany({
        where,
        include: {
          champion: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          referral: {
            select: { id: true, firstName: true, lastName: true },
          },
          tier: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.championPayout.count({ where }),
    ]);

    res.json({
      success: true,
      data: payouts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    logger.error('Error listing payouts', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'LIST_ERROR', message: error.message },
    });
  }
});

// GET /api/payouts/pending - Get pending payouts summary
router.get('/pending', async (req, res) => {
  try {
    const pendingPayouts = await prisma.championPayout.findMany({
      where: { status: 'PENDING' },
      include: {
        champion: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        tier: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const totalAmount = pendingPayouts.reduce((sum, p) => sum + Number(p.amount), 0);

    res.json({
      success: true,
      data: {
        payouts: pendingPayouts,
        count: pendingPayouts.length,
        totalAmount,
      },
    });
  } catch (error) {
    logger.error('Error getting pending payouts', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: error.message },
    });
  }
});

// GET /api/payouts/:id - Get single payout
router.get('/:id', async (req, res) => {
  try {
    const payout = await prisma.championPayout.findUnique({
      where: { id: req.params.id },
      include: {
        champion: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        referral: true,
        tier: true,
        processedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    if (!payout) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Payout not found' },
      });
    }

    res.json({
      success: true,
      data: payout,
    });
  } catch (error) {
    logger.error('Error getting payout', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: error.message },
    });
  }
});

// POST /api/payouts/approve - Approve pending payouts (bulk)
router.post('/approve', async (req, res) => {
  try {
    const { payoutIds } = req.body;
    const processedById = req.user?.id;

    if (!payoutIds || !Array.isArray(payoutIds) || payoutIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'payoutIds array is required' },
      });
    }

    const results = await walletService.approvePayouts(payoutIds, processedById);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger.error('Error approving payouts', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'APPROVE_ERROR', message: error.message },
    });
  }
});

// POST /api/payouts/process - Process approved payouts via Stripe
router.post('/process', async (req, res) => {
  try {
    const { payoutIds } = req.body;
    const processedById = req.user?.id;

    if (!payoutIds || !Array.isArray(payoutIds) || payoutIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'payoutIds array is required' },
      });
    }

    const results = await walletService.processPayouts(payoutIds, processedById);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    logger.error('Error processing payouts', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'PROCESS_ERROR', message: error.message },
    });
  }
});

// PUT /api/payouts/:id/hold - Put a payout on hold
router.put('/:id/hold', async (req, res) => {
  try {
    const { reason } = req.body;

    const payout = await prisma.championPayout.update({
      where: { id: req.params.id },
      data: {
        status: 'ON_HOLD',
        notes: reason ? `On Hold: ${reason}` : 'Put on hold',
      },
    });

    res.json({
      success: true,
      data: payout,
    });
  } catch (error) {
    logger.error('Error holding payout', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'HOLD_ERROR', message: error.message },
    });
  }
});

// PUT /api/payouts/:id/cancel - Cancel a payout
router.put('/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;

    const payout = await prisma.championPayout.findUnique({
      where: { id: req.params.id },
    });

    if (!payout) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Payout not found' },
      });
    }

    if (payout.status === 'PAID') {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Cannot cancel a paid payout' },
      });
    }

    // Reverse the pending balance if it was in pending
    if (payout.status === 'PENDING') {
      await prisma.championWallet.update({
        where: { championId: payout.championId },
        data: {
          pendingBalance: { decrement: payout.amount },
        },
      });

      // Update champion pending earnings
      await prisma.champion.update({
        where: { id: payout.championId },
        data: {
          pendingEarnings: { decrement: payout.amount },
          totalEarnings: { decrement: payout.amount },
        },
      });
    }

    const updated = await prisma.championPayout.update({
      where: { id: req.params.id },
      data: {
        status: 'CANCELLED',
        notes: reason ? `Cancelled: ${reason}` : 'Cancelled',
      },
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    logger.error('Error cancelling payout', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'CANCEL_ERROR', message: error.message },
    });
  }
});

// GET /api/payouts/tiers - Get payout tiers
router.get('/tiers', async (req, res) => {
  try {
    const tiers = await prisma.championPayoutTier.findMany({
      orderBy: { type: 'asc' },
    });

    res.json({
      success: true,
      data: tiers,
    });
  } catch (error) {
    logger.error('Error getting payout tiers', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: error.message },
    });
  }
});

// PUT /api/payouts/tiers/:id - Update payout tier
router.put('/tiers/:id', async (req, res) => {
  try {
    const { name, amount, isActive } = req.body;

    const tier = await prisma.championPayoutTier.update({
      where: { id: req.params.id },
      data: {
        name,
        amount,
        isActive,
      },
    });

    res.json({
      success: true,
      data: tier,
    });
  } catch (error) {
    logger.error('Error updating payout tier', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_ERROR', message: error.message },
    });
  }
});

export default router;
