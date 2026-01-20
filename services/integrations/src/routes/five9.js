// Five9 Call Center Integration Routes
import { Router } from 'express';
import { five9Service } from '../services/five9Service.js';
import { logger } from '../middleware/logger.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

// ==========================================
// Call Sync & Logging
// ==========================================

/**
 * POST /five9/sync - Sync call data from Five9
 */
router.post('/sync', authMiddleware, requireRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const { startDate, endDate, campaignId } = req.body;

    const result = await five9Service.syncCallData({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      campaignId,
    });

    logger.info(`Five9 sync completed: ${result.synced} calls by ${req.user.email}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /five9/calls - Log a new call
 */
router.post('/calls', authMiddleware, async (req, res, next) => {
  try {
    const call = await five9Service.logCall({
      ...req.body,
      agentId: req.body.agentId || req.user.id,
    });

    logger.info(`Call logged: ${call.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: call });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /five9/calls - List call logs
 */
router.get('/calls', authMiddleware, async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 50,
      opportunityId,
      accountId,
      contactId,
      leadId,
      agentId,
      direction,
      startDate,
      endDate,
    } = req.query;

    const result = await five9Service.getCallLogs({
      page: parseInt(page),
      limit: parseInt(limit),
      opportunityId,
      accountId,
      contactId,
      leadId,
      agentId,
      direction,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /five9/calls/:id - Get single call log
 */
router.get('/calls/:id', authMiddleware, async (req, res, next) => {
  try {
    const call = await five9Service.getCallById(req.params.id);

    if (!call) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Call log not found' },
      });
    }

    res.json({ success: true, data: call });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /five9/calls/:id - Update call log
 */
router.put('/calls/:id', authMiddleware, async (req, res, next) => {
  try {
    const call = await five9Service.updateCall(req.params.id, req.body);

    logger.info(`Call updated: ${req.params.id} by ${req.user.email}`);

    res.json({ success: true, data: call });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Recording & Transcription
// ==========================================

/**
 * POST /five9/calls/:id/transcribe - Request transcription
 */
router.post('/calls/:id/transcribe', authMiddleware, async (req, res, next) => {
  try {
    const result = await five9Service.requestTranscription(req.params.id);

    logger.info(`Transcription requested for call ${req.params.id}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /five9/calls/:id/recording - Get recording URL
 */
router.get('/calls/:id/recording', authMiddleware, async (req, res, next) => {
  try {
    const call = await five9Service.getCallById(req.params.id);

    if (!call) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Call log not found' },
      });
    }

    if (!call.recordingUrl) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No recording available for this call' },
      });
    }

    res.json({ success: true, data: { recordingUrl: call.recordingUrl } });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Statistics & Analytics
// ==========================================

/**
 * GET /five9/stats - Get call statistics
 */
router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const { startDate, endDate, agentId, territoryId } = req.query;

    const stats = await five9Service.getCallStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      agentId,
      territoryId,
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /five9/stats/agent/:agentId - Get agent-specific stats
 */
router.get('/stats/agent/:agentId', authMiddleware, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const stats = await five9Service.getCallStats({
      agentId: req.params.agentId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Record Linking
// ==========================================

/**
 * POST /five9/calls/:id/link - Link call to record
 */
router.post('/calls/:id/link', authMiddleware, async (req, res, next) => {
  try {
    const { opportunityId, accountId, contactId, leadId } = req.body;

    if (!opportunityId && !accountId && !contactId && !leadId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'At least one record ID is required' },
      });
    }

    const call = await five9Service.updateCall(req.params.id, {
      opportunityId,
      accountId,
      contactId,
      leadId,
    });

    logger.info(`Call ${req.params.id} linked to records by ${req.user.email}`);

    res.json({ success: true, data: call });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Webhook
// ==========================================

/**
 * POST /five9/webhook - Handle Five9 webhooks
 */
router.post('/webhook', async (req, res, next) => {
  try {
    // Verify webhook signature if Five9 provides one
    const signature = req.headers['x-five9-signature'];
    // TODO: Implement signature verification

    await five9Service.handleWebhook(req.body);

    res.sendStatus(200);
  } catch (error) {
    logger.error('Five9 webhook error:', error);
    res.sendStatus(500);
  }
});

export default router;
