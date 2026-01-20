/**
 * Referrals Routes
 * CRUD operations for champion referral management
 */

import express from 'express';
import { referralService } from '../services/referralService.js';
import { logger } from '../services/logger.js';

const router = express.Router();

// GET /api/referrals - List all referrals
router.get('/', async (req, res) => {
  try {
    const { championId, status, page, limit } = req.query;

    const result = await referralService.getReferrals({
      championId,
      status,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });

    res.json({
      success: true,
      data: result.referrals,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error listing referrals', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'LIST_ERROR', message: error.message },
    });
  }
});

// GET /api/referrals/:id - Get single referral
router.get('/:id', async (req, res) => {
  try {
    const referral = await referralService.getReferralById(req.params.id);

    if (!referral) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Referral not found' },
      });
    }

    res.json({
      success: true,
      data: referral,
    });
  } catch (error) {
    logger.error('Error getting referral', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: error.message },
    });
  }
});

// POST /api/referrals - Submit a new referral (from mobile app or web)
router.post('/', async (req, res) => {
  try {
    const referral = await referralService.submitReferral(req.body);

    res.status(201).json({
      success: true,
      data: referral,
    });
  } catch (error) {
    logger.error('Error submitting referral', { error: error.message });

    const status = error.message.includes('Invalid') ? 400 : 500;
    res.status(status).json({
      success: false,
      error: { code: 'SUBMIT_ERROR', message: error.message },
    });
  }
});

// PUT /api/referrals/:id/status - Update referral status
router.put('/:id/status', async (req, res) => {
  try {
    const { status, notes } = req.body;
    const userId = req.user?.id;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Status is required' },
      });
    }

    const referral = await referralService.updateStatus(req.params.id, status, notes, userId);

    res.json({
      success: true,
      data: referral,
    });
  } catch (error) {
    logger.error('Error updating referral status', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'STATUS_ERROR', message: error.message },
    });
  }
});

// POST /api/referrals/sync-from-lead - Sync referral status from Lead updates
router.post('/sync-from-lead', async (req, res) => {
  try {
    const { leadId, leadStatus, opportunityId, closedWon } = req.body;

    if (!leadId || !leadStatus) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'leadId and leadStatus are required' },
      });
    }

    const referral = await referralService.syncFromLead(leadId, leadStatus, opportunityId, closedWon);

    res.json({
      success: true,
      data: referral,
    });
  } catch (error) {
    logger.error('Error syncing from lead', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'SYNC_ERROR', message: error.message },
    });
  }
});

export default router;
