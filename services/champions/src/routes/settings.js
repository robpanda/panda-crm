/**
 * Settings Routes
 * Referral program settings management
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../services/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

// GET /api/referral-settings - Get current settings
router.get('/', async (req, res) => {
  try {
    let settings = await prisma.referralSettings.findFirst();

    // Create default settings if none exist
    if (!settings) {
      settings = await prisma.referralSettings.create({
        data: {
          codePrefix: 'PANDA',
          codeLength: 6,
          duplicateWindowDays: 90,
          duplicateCheckPhone: true,
          duplicateCheckAddress: true,
          requireApproval: false,
          defaultMinimumPayout: 25,
          signupBonusEnabled: true,
          qualifiedBonusEnabled: true,
          closedBonusEnabled: true,
        },
      });
    }

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    logger.error('Error getting settings', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: error.message },
    });
  }
});

// PUT /api/referral-settings - Update settings
router.put('/', async (req, res) => {
  try {
    const {
      codePrefix,
      codeLength,
      duplicateWindowDays,
      duplicateCheckPhone,
      duplicateCheckAddress,
      requireApproval,
      defaultMinimumPayout,
      signupBonusEnabled,
      qualifiedBonusEnabled,
      closedBonusEnabled,
      termsAndConditions,
      privacyPolicy,
    } = req.body;

    let settings = await prisma.referralSettings.findFirst();

    if (!settings) {
      // Create settings if they don't exist
      settings = await prisma.referralSettings.create({
        data: {
          codePrefix: codePrefix || 'PANDA',
          codeLength: codeLength || 6,
          duplicateWindowDays: duplicateWindowDays || 90,
          duplicateCheckPhone: duplicateCheckPhone !== false,
          duplicateCheckAddress: duplicateCheckAddress !== false,
          requireApproval: requireApproval || false,
          defaultMinimumPayout: defaultMinimumPayout || 25,
          signupBonusEnabled: signupBonusEnabled !== false,
          qualifiedBonusEnabled: qualifiedBonusEnabled !== false,
          closedBonusEnabled: closedBonusEnabled !== false,
          termsAndConditions,
          privacyPolicy,
        },
      });
    } else {
      // Update existing settings
      settings = await prisma.referralSettings.update({
        where: { id: settings.id },
        data: {
          codePrefix,
          codeLength,
          duplicateWindowDays,
          duplicateCheckPhone,
          duplicateCheckAddress,
          requireApproval,
          defaultMinimumPayout,
          signupBonusEnabled,
          qualifiedBonusEnabled,
          closedBonusEnabled,
          termsAndConditions,
          privacyPolicy,
        },
      });
    }

    logger.info('Referral settings updated', { settingsId: settings.id });

    res.json({
      success: true,
      data: settings,
    });
  } catch (error) {
    logger.error('Error updating settings', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_ERROR', message: error.message },
    });
  }
});

// GET /api/referral-settings/payout-tiers - Get all payout tiers
router.get('/payout-tiers', async (req, res) => {
  try {
    const tiers = await prisma.championPayoutTier.findMany({
      orderBy: [
        { type: 'asc' },
        { createdAt: 'asc' },
      ],
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

// POST /api/referral-settings/payout-tiers - Create payout tier
router.post('/payout-tiers', async (req, res) => {
  try {
    const { type, name, amount, description, isActive } = req.body;

    if (!type || !name || amount === undefined) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'type, name, and amount are required' },
      });
    }

    const tier = await prisma.championPayoutTier.create({
      data: {
        type,
        name,
        amount,
        description,
        isActive: isActive !== false,
      },
    });

    logger.info('Payout tier created', { tierId: tier.id, type: tier.type });

    res.status(201).json({
      success: true,
      data: tier,
    });
  } catch (error) {
    logger.error('Error creating payout tier', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'CREATE_ERROR', message: error.message },
    });
  }
});

// PUT /api/referral-settings/payout-tiers/:id - Update payout tier
router.put('/payout-tiers/:id', async (req, res) => {
  try {
    const { name, amount, description, isActive } = req.body;

    const tier = await prisma.championPayoutTier.update({
      where: { id: req.params.id },
      data: {
        name,
        amount,
        description,
        isActive,
      },
    });

    logger.info('Payout tier updated', { tierId: tier.id });

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

// DELETE /api/referral-settings/payout-tiers/:id - Delete payout tier
router.delete('/payout-tiers/:id', async (req, res) => {
  try {
    // Check if any payouts use this tier
    const payoutCount = await prisma.championPayout.count({
      where: { tierId: req.params.id },
    });

    if (payoutCount > 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'IN_USE',
          message: `Cannot delete tier - ${payoutCount} payouts use this tier. Deactivate it instead.`,
        },
      });
    }

    await prisma.championPayoutTier.delete({
      where: { id: req.params.id },
    });

    logger.info('Payout tier deleted', { tierId: req.params.id });

    res.json({
      success: true,
      message: 'Payout tier deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting payout tier', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_ERROR', message: error.message },
    });
  }
});

// GET /api/referral-settings/stats - Get referral program statistics
router.get('/stats', async (req, res) => {
  try {
    const [
      totalChampions,
      activeChampions,
      totalReferrals,
      qualifiedReferrals,
      closedReferrals,
      totalPaid,
      pendingPayouts,
    ] = await Promise.all([
      prisma.champion.count({ where: { deletedAt: null } }),
      prisma.champion.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.championReferral.count(),
      prisma.championReferral.count({ where: { isQualified: true } }),
      prisma.championReferral.count({ where: { closedWon: true } }),
      prisma.championPayout.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
      prisma.championPayout.aggregate({
        where: { status: 'PENDING' },
        _sum: { amount: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        champions: {
          total: totalChampions,
          active: activeChampions,
        },
        referrals: {
          total: totalReferrals,
          qualified: qualifiedReferrals,
          closed: closedReferrals,
          conversionRate: totalReferrals > 0
            ? ((closedReferrals / totalReferrals) * 100).toFixed(1) + '%'
            : '0%',
        },
        payouts: {
          totalPaid: totalPaid._sum.amount || 0,
          pendingAmount: pendingPayouts._sum.amount || 0,
        },
      },
    });
  } catch (error) {
    logger.error('Error getting stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'STATS_ERROR', message: error.message },
    });
  }
});

export default router;
