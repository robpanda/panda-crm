/**
 * Champions Routes
 * CRUD operations for champion management
 */

import express from 'express';
import { championService } from '../services/championService.js';
import { logger } from '../services/logger.js';

const router = express.Router();

// GET /api/champions - List all champions
router.get('/', async (req, res) => {
  try {
    const { status, assignedRepId, search, page, limit } = req.query;

    const result = await championService.getChampions({
      status,
      assignedRepId,
      search,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
    });

    res.json({
      success: true,
      data: result.champions,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error listing champions', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'LIST_ERROR', message: error.message },
    });
  }
});

// GET /api/champions/stats - Get champion statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await championService.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error('Error getting stats', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'STATS_ERROR', message: error.message },
    });
  }
});

// GET /api/champions/by-code/:code - Get champion by referral code
router.get('/by-code/:code', async (req, res) => {
  try {
    const champion = await championService.getChampionByReferralCode(req.params.code);

    if (!champion) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Champion not found' },
      });
    }

    res.json({
      success: true,
      data: champion,
    });
  } catch (error) {
    logger.error('Error getting champion by code', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: error.message },
    });
  }
});

// GET /api/champions/:id - Get single champion
router.get('/:id', async (req, res) => {
  try {
    const champion = await championService.getChampionById(req.params.id);

    if (!champion) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Champion not found' },
      });
    }

    res.json({
      success: true,
      data: champion,
    });
  } catch (error) {
    logger.error('Error getting champion', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: error.message },
    });
  }
});

// POST /api/champions - Create new champion (admin)
router.post('/', async (req, res) => {
  try {
    const invitedById = req.user?.id; // From auth middleware

    const champion = await championService.createChampion(req.body, invitedById);

    res.status(201).json({
      success: true,
      data: champion,
    });
  } catch (error) {
    logger.error('Error creating champion', { error: error.message });

    const status = error.message.includes('already exists') ? 409 : 500;
    res.status(status).json({
      success: false,
      error: { code: 'CREATE_ERROR', message: error.message },
    });
  }
});

// POST /api/champions/invite - Create invite for new champion
router.post('/invite', async (req, res) => {
  try {
    const { email, assignedRepId } = req.body;
    const invitedById = req.user?.id;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email is required' },
      });
    }

    const result = await championService.createInvite(email, assignedRepId, invitedById);

    res.status(201).json({
      success: true,
      data: {
        champion: result.champion,
        inviteUrl: result.inviteUrl,
      },
    });
  } catch (error) {
    logger.error('Error creating invite', { error: error.message });

    const status = error.message.includes('already exists') ? 409 : 500;
    res.status(status).json({
      success: false,
      error: { code: 'INVITE_ERROR', message: error.message },
    });
  }
});

// GET /api/champions/invite/:token - Get invite details (public)
router.get('/invite/:token', async (req, res) => {
  try {
    const champion = await championService.getChampionByInviteToken(req.params.token);

    if (!champion) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Invalid invite token' },
      });
    }

    if (champion.inviteExpires && champion.inviteExpires < new Date()) {
      return res.status(400).json({
        success: false,
        error: { code: 'EXPIRED', message: 'Invite has expired' },
      });
    }

    if (champion.status !== 'PENDING') {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_USED', message: 'Invite has already been used' },
      });
    }

    res.json({
      success: true,
      data: {
        email: champion.email,
        firstName: champion.firstName || '',
        lastName: champion.lastName || '',
        inviteExpires: champion.inviteExpires,
      },
    });
  } catch (error) {
    logger.error('Error getting invite details', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: error.message },
    });
  }
});

// POST /api/champions/complete-invite/:token - Complete invite registration
router.post('/complete-invite/:token', async (req, res) => {
  try {
    const champion = await championService.completeInvite(req.params.token, req.body);

    res.json({
      success: true,
      data: champion,
    });
  } catch (error) {
    logger.error('Error completing invite', { error: error.message });

    const status = error.message.includes('Invalid') || error.message.includes('expired') ? 400 : 500;
    res.status(status).json({
      success: false,
      error: { code: 'INVITE_ERROR', message: error.message },
    });
  }
});

// PUT /api/champions/:id - Update champion
router.put('/:id', async (req, res) => {
  try {
    const champion = await championService.updateChampion(req.params.id, req.body);

    res.json({
      success: true,
      data: champion,
    });
  } catch (error) {
    logger.error('Error updating champion', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'UPDATE_ERROR', message: error.message },
    });
  }
});

// PUT /api/champions/:id/status - Update champion status
router.put('/:id/status', async (req, res) => {
  try {
    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Status is required' },
      });
    }

    const champion = await championService.updateStatus(req.params.id, status, reason);

    res.json({
      success: true,
      data: champion,
    });
  } catch (error) {
    logger.error('Error updating status', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'STATUS_ERROR', message: error.message },
    });
  }
});

// DELETE /api/champions/:id - Soft delete champion
router.delete('/:id', async (req, res) => {
  try {
    await championService.deleteChampion(req.params.id);

    res.json({
      success: true,
      message: 'Champion deleted successfully',
    });
  } catch (error) {
    logger.error('Error deleting champion', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_ERROR', message: error.message },
    });
  }
});

export default router;
