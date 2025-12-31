// RingCentral Call Center Integration Routes
import { Router } from 'express';
import { ringCentralService } from '../services/ringCentralService.js';
import { logger } from '../middleware/logger.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

// ==========================================
// Connection Status
// ==========================================

/**
 * GET /ringcentral/status - Get RingCentral connection status
 */
router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    const status = await ringCentralService.getConnectionStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    // Return disconnected status on error
    res.json({
      success: true,
      data: {
        connected: false,
        error: error.message,
      },
    });
  }
});

// ==========================================
// Call Sync & Logging
// ==========================================

/**
 * POST /ringcentral/sync - Sync call data from RingCentral
 */
router.post('/sync', authMiddleware, requireRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const { startDate, endDate, extensionId } = req.body;

    const result = await ringCentralService.syncCallData({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      extensionId,
    });

    logger.info(`RingCentral sync completed: ${result.synced} calls by ${req.user.email}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/calls - Log a new call manually
 */
router.post('/calls', authMiddleware, async (req, res, next) => {
  try {
    const call = await ringCentralService.logCall({
      ...req.body,
      userId: req.body.userId || req.user.id,
    });

    logger.info(`Call logged: ${call.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: call });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/calls - List call logs
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
      userId,
      direction,
      startDate,
      endDate,
    } = req.query;

    // Build filter
    const where = {};
    if (opportunityId) where.opportunityId = opportunityId;
    if (accountId) where.accountId = accountId;
    if (contactId) where.contactId = contactId;
    if (leadId) where.leadId = leadId;
    if (userId) where.userId = userId;
    if (direction) where.direction = direction;
    if (startDate || endDate) {
      where.startTime = {};
      if (startDate) where.startTime.gte = new Date(startDate);
      if (endDate) where.startTime.lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [calls, total] = await Promise.all([
      ringCentralService.prisma?.callLog?.findMany({
        where,
        skip,
        take,
        orderBy: { startTime: 'desc' },
        include: {
          opportunity: { select: { id: true, name: true } },
          account: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
          lead: { select: { id: true, firstName: true, lastName: true } },
          user: { select: { id: true, firstName: true, lastName: true } },
        },
      }) || [],
      ringCentralService.prisma?.callLog?.count({ where }) || 0,
    ]);

    res.json({
      success: true,
      data: {
        calls: calls || [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total || 0,
          pages: Math.ceil((total || 0) / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/calls/:id - Get single call log
 */
router.get('/calls/:id', authMiddleware, async (req, res, next) => {
  try {
    const call = await ringCentralService.getCallById(req.params.id);

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
 * PUT /ringcentral/calls/:id - Update call log
 */
router.put('/calls/:id', authMiddleware, async (req, res, next) => {
  try {
    const call = await ringCentralService.updateCall(req.params.id, req.body);

    logger.info(`Call updated: ${req.params.id} by ${req.user.email}`);

    res.json({ success: true, data: call });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Click-to-Call (RingOut)
// ==========================================

/**
 * POST /ringcentral/ringout - Initiate an outbound call
 */
router.post('/ringout', authMiddleware, async (req, res, next) => {
  try {
    const { fromNumber, toNumber, extensionId } = req.body;

    if (!fromNumber || !toNumber) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'fromNumber and toNumber are required' },
      });
    }

    const result = await ringCentralService.initiateCall(fromNumber, toNumber, extensionId);

    logger.info(`RingOut initiated by ${req.user.email}: ${fromNumber} -> ${toNumber}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/ringout/:id - Get RingOut status
 */
router.get('/ringout/:id', authMiddleware, async (req, res, next) => {
  try {
    const { extensionId } = req.query;
    const result = await ringCentralService.getRingOutStatus(req.params.id, extensionId);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /ringcentral/ringout/:id - Cancel an active RingOut
 */
router.delete('/ringout/:id', authMiddleware, async (req, res, next) => {
  try {
    const { extensionId } = req.query;
    const result = await ringCentralService.cancelRingOut(req.params.id, extensionId);

    logger.info(`RingOut cancelled: ${req.params.id} by ${req.user.email}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Phone System & Device Management
// ==========================================

/**
 * GET /ringcentral/phone-numbers - Get all phone numbers
 */
router.get('/phone-numbers', authMiddleware, async (req, res, next) => {
  try {
    const phoneNumbers = await ringCentralService.getPhoneNumbers();
    res.json({ success: true, data: phoneNumbers });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/extensions/:id/phone-numbers - Get extension phone numbers
 */
router.get('/extensions/:id/phone-numbers', authMiddleware, async (req, res, next) => {
  try {
    const phoneNumbers = await ringCentralService.getExtensionPhoneNumbers(req.params.id);
    res.json({ success: true, data: phoneNumbers });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/extensions/:id - Get extension details
 */
router.get('/extensions/:id', authMiddleware, async (req, res, next) => {
  try {
    const extension = await ringCentralService.getExtensionDetails(req.params.id);
    if (!extension) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Extension not found' },
      });
    }
    res.json({ success: true, data: extension });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/extensions/:id/devices - Get extension devices
 */
router.get('/extensions/:id/devices', authMiddleware, async (req, res, next) => {
  try {
    const devices = await ringCentralService.getExtensionDevices(req.params.id);
    res.json({ success: true, data: devices });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/extensions/:id/presence - Get presence status
 */
router.get('/extensions/:id/presence', authMiddleware, async (req, res, next) => {
  try {
    const presence = await ringCentralService.getPresence(req.params.id);
    res.json({ success: true, data: presence });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /ringcentral/extensions/:id/presence - Update presence status
 */
router.put('/extensions/:id/presence', authMiddleware, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['Available', 'Busy', 'DoNotDisturb', 'Offline'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid status. Use: Available, Busy, DoNotDisturb, or Offline' },
      });
    }
    const presence = await ringCentralService.updatePresence(req.params.id, status);
    res.json({ success: true, data: presence });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/extensions/:id/active-calls - Get active calls
 */
router.get('/extensions/:id/active-calls', authMiddleware, async (req, res, next) => {
  try {
    const calls = await ringCentralService.getActiveCalls(req.params.id);
    res.json({ success: true, data: calls });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/extensions/:id/caller-id - Get caller ID settings
 */
router.get('/extensions/:id/caller-id', authMiddleware, async (req, res, next) => {
  try {
    const settings = await ringCentralService.getCallerIdSettings(req.params.id);
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /ringcentral/extensions/:id/caller-id - Update caller ID settings
 */
router.put('/extensions/:id/caller-id', authMiddleware, requireRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const settings = await ringCentralService.updateCallerIdSettings(req.params.id, req.body);
    logger.info(`Caller ID updated for extension ${req.params.id} by ${req.user.email}`);
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/extensions/:id/forwarding - Get forwarding numbers
 */
router.get('/extensions/:id/forwarding', authMiddleware, async (req, res, next) => {
  try {
    const numbers = await ringCentralService.getForwardingNumbers(req.params.id);
    res.json({ success: true, data: numbers });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/extensions/:id/rules - Get call handling rules
 */
router.get('/extensions/:id/rules', authMiddleware, async (req, res, next) => {
  try {
    const rules = await ringCentralService.getCallHandlingRules(req.params.id);
    res.json({ success: true, data: rules });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Call Queues & IVR
// ==========================================

/**
 * GET /ringcentral/queues - Get all call queues
 */
router.get('/queues', authMiddleware, async (req, res, next) => {
  try {
    const queues = await ringCentralService.getCallQueues();
    res.json({ success: true, data: queues });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/queues/:id/members - Get queue members
 */
router.get('/queues/:id/members', authMiddleware, async (req, res, next) => {
  try {
    const members = await ringCentralService.getCallQueueMembers(req.params.id);
    res.json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/ivr-menus - Get IVR menus
 */
router.get('/ivr-menus', authMiddleware, requireRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const menus = await ringCentralService.getIvrMenus();
    res.json({ success: true, data: menus });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Voicemail
// ==========================================

/**
 * GET /ringcentral/voicemails - Get voicemail messages
 */
router.get('/voicemails', authMiddleware, async (req, res, next) => {
  try {
    const { extensionId = '~', limit, readStatus } = req.query;
    const voicemails = await ringCentralService.getVoicemails(extensionId, { limit: parseInt(limit) || 50, readStatus });
    res.json({ success: true, data: voicemails });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/voicemails/:messageId/content/:attachmentId - Get voicemail audio URL
 */
router.get('/voicemails/:messageId/content/:attachmentId', authMiddleware, async (req, res, next) => {
  try {
    const { extensionId = '~' } = req.query;
    const url = await ringCentralService.getVoicemailContentUrl(
      req.params.messageId,
      req.params.attachmentId,
      extensionId
    );
    if (!url) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Voicemail content not found' },
      });
    }
    res.json({ success: true, data: { url } });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// AI Features
// ==========================================

/**
 * GET /ringcentral/ai/features - List available AI features
 */
router.get('/ai/features', authMiddleware, async (req, res, next) => {
  try {
    const features = ringCentralService.getAiFeatures();
    res.json({ success: true, data: features });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/calls/:id/analyze - Full AI analysis of a call
 */
router.post('/calls/:id/analyze', authMiddleware, async (req, res, next) => {
  try {
    const result = await ringCentralService.analyzeCallWithAi(req.params.id);
    logger.info(`AI analysis requested for call ${req.params.id} by ${req.user.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/calls/:id/coaching - Get coaching insights
 */
router.get('/calls/:id/coaching', authMiddleware, requireRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const insights = await ringCentralService.getCoachingInsights(req.params.id);
    res.json({ success: true, data: insights });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/calls/:id/compliance - Check compliance
 */
router.get('/calls/:id/compliance', authMiddleware, requireRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const { scriptId } = req.query;
    const result = await ringCentralService.checkCompliance(req.params.id, scriptId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Recording & Transcription
// ==========================================

/**
 * POST /ringcentral/calls/:id/transcribe - Request transcription
 */
router.post('/calls/:id/transcribe', authMiddleware, async (req, res, next) => {
  try {
    const result = await ringCentralService.requestTranscription(req.params.id);

    logger.info(`Transcription requested for call ${req.params.id}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/calls/:id/recording - Get recording URL
 */
router.get('/calls/:id/recording', authMiddleware, async (req, res, next) => {
  try {
    const call = await ringCentralService.getCallById(req.params.id);

    if (!call) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Call log not found' },
      });
    }

    if (!call.recordingId) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'No recording available for this call' },
      });
    }

    const recordingUrl = await ringCentralService.getRecordingUrl(call.recordingId);

    res.json({ success: true, data: { recordingUrl } });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Statistics & Analytics
// ==========================================

/**
 * GET /ringcentral/stats - Get call statistics
 * Supports dateRange param: 1d, 7d, 30d, 90d
 */
router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const { startDate, endDate, dateRange, userId } = req.query;

    // Parse dateRange into start/end dates
    let computedStartDate = startDate ? new Date(startDate) : undefined;
    let computedEndDate = endDate ? new Date(endDate) : new Date();

    if (dateRange && !startDate) {
      const now = new Date();
      const days = parseInt(dateRange) || 7;
      computedStartDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      computedEndDate = now;
    }

    const stats = await ringCentralService.getCallStats({
      startDate: computedStartDate,
      endDate: computedEndDate,
      userId,
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/stats/user/:userId - Get user-specific stats
 */
router.get('/stats/user/:userId', authMiddleware, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const stats = await ringCentralService.getCallStats({
      userId: req.params.userId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Extensions
// ==========================================

/**
 * GET /ringcentral/extensions - Get all extensions (users)
 */
router.get('/extensions', authMiddleware, async (req, res, next) => {
  try {
    const extensions = await ringCentralService.getExtensions();

    res.json({ success: true, data: extensions });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Record Linking
// ==========================================

/**
 * POST /ringcentral/calls/:id/link - Link call to record
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

    const call = await ringCentralService.updateCall(req.params.id, {
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
// Webhook Subscription
// ==========================================

/**
 * POST /ringcentral/subscriptions - Create webhook subscription
 */
router.post('/subscriptions', authMiddleware, requireRole(['admin']), async (req, res, next) => {
  try {
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'webhookUrl is required' },
      });
    }

    const subscription = await ringCentralService.createWebhookSubscription(webhookUrl);

    res.json({ success: true, data: subscription });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/subscriptions/:id/renew - Renew webhook subscription
 */
router.post('/subscriptions/:id/renew', authMiddleware, requireRole(['admin']), async (req, res, next) => {
  try {
    const subscription = await ringCentralService.renewSubscription(req.params.id);

    res.json({ success: true, data: subscription });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Webhook
// ==========================================

/**
 * POST /ringcentral/webhook - Handle RingCentral webhooks
 */
router.post('/webhook', async (req, res, next) => {
  try {
    // Handle validation request (RingCentral sends this on subscription creation)
    const validationToken = req.headers['validation-token'];
    if (validationToken) {
      res.set('Validation-Token', validationToken);
      return res.sendStatus(200);
    }

    await ringCentralService.handleWebhook(req.body);

    res.sendStatus(200);
  } catch (error) {
    logger.error('RingCentral webhook error:', error);
    res.sendStatus(500);
  }
});

export default router;
