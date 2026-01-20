// RingCentral Call Center Integration Routes
import { Router } from 'express';
import { ringCentralService } from '../services/ringCentralService.js';
import { logger } from '../middleware/logger.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

// ==========================================
// Connection Status & Authentication
// ==========================================

/**
 * GET /ringcentral/status - Get RingCentral connection status
 */
router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    const status = await ringCentralService.getConnectionStatus();
    res.json({
      success: true,
      data: {
        ...status,
        features: {
          clickToCall: true,
          callLogging: true,
          voicemail: true,
          presence: true,
          aiAnalysis: true,
        },
      },
    });
  } catch (error) {
    // Return disconnected status on error
    res.json({
      success: true,
      data: {
        connected: false,
        error: error.message,
        features: {
          clickToCall: true,
          callLogging: true,
          voicemail: true,
          presence: true,
          aiAnalysis: true,
        },
      },
    });
  }
});

/**
 * GET /ringcentral/auth - Get OAuth authorization URL
 */
router.get('/auth', authMiddleware, async (req, res, next) => {
  try {
    const authUrl = await ringCentralService.getAuthorizationUrl();

    res.json({
      success: true,
      data: {
        authUrl,
        message: 'Redirect user to this URL to authorize RingCentral',
      },
    });
  } catch (error) {
    // Return configuration status instead of throwing
    res.json({
      success: false,
      data: {
        configured: false,
        message: 'RingCentral integration not configured. Use the embedded widget for calling.',
        useEmbeddable: true,
        embeddableClientId: '9SphzQfJPE1fyyeZUL0eIr',
      },
    });
  }
});

/**
 * GET /ringcentral/auth/callback - OAuth callback handler
 */
router.get('/auth/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_CODE', message: 'Authorization code is required' },
      });
    }

    const result = await ringCentralService.handleAuthCallback(code, state);

    logger.info('RingCentral OAuth completed successfully');

    // Redirect to frontend settings page
    res.redirect('/settings/integrations?ringcentral=connected');
  } catch (error) {
    logger.error('RingCentral OAuth callback error:', error);
    res.redirect('/settings/integrations?ringcentral=error');
  }
});

/**
 * POST /ringcentral/auth/disconnect - Disconnect RingCentral (clear OAuth tokens)
 */
router.post('/auth/disconnect', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
  try {
    await ringCentralService.clearTokens();

    logger.info(`RingCentral disconnected by ${req.user.email}`);

    res.json({
      success: true,
      data: { disconnected: true, message: 'RingCentral has been disconnected' },
    });
  } catch (error) {
    logger.error('RingCentral disconnect error:', error);
    next(error);
  }
});

// ==========================================
// Call Sync & Logging
// ==========================================

/**
 * POST /ringcentral/sync - Sync call data from RingCentral
 */
router.post('/sync', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
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
router.put('/extensions/:id/caller-id', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
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
router.get('/ivr-menus', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
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
 * GET /ringcentral/ai/ringsense/:recordingId - Get RingSense AI insights for a recording
 * Uses RingCentral's RingSense API for transcription, sentiment, and summaries
 * @query domain - Optional domain type: 'pbx' (default), 'rcv' (video), 'engage' (RingCX)
 */
router.get('/ai/ringsense/:recordingId', authMiddleware, async (req, res, next) => {
  try {
    const { recordingId } = req.params;
    const domain = req.query.domain || 'pbx';

    const insights = await ringCentralService.getRingSenseInsights(recordingId, domain);

    if (!insights) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'RingSense insights not available for this recording. Ensure RingSense is enabled for your account.',
        },
      });
    }

    logger.info(`RingSense insights retrieved for recording ${recordingId} by ${req.user.email}`);
    res.json({ success: true, data: insights });
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
router.get('/calls/:id/coaching', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
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
router.get('/calls/:id/compliance', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
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
      // Handle formats like "7d", "30d", or just "7"
      const days = parseInt(dateRange.replace(/d$/i, '')) || 7;
      computedStartDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      computedEndDate = now;
    }

    // Default to last 7 days if no date params
    if (!computedStartDate) {
      const now = new Date();
      computedStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      computedEndDate = now;
    }

    const stats = await ringCentralService.getCallStats({
      startDate: computedStartDate,
      endDate: computedEndDate,
      userId,
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    // Return empty stats if RingCentral not configured
    res.json({
      success: true,
      data: {
        totalCalls: 0,
        inboundCalls: 0,
        outboundCalls: 0,
        missedCalls: 0,
        avgDuration: 0,
        totalDuration: 0,
        connectedCalls: 0,
        connectionRate: 0,
        callsByDay: [],
        configured: false,
        message: 'RingCentral backend not configured. Call stats are tracked via the embedded widget.',
      },
    });
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
// Find Contact & Create Call Log (for Embeddable Widget)
// ==========================================

/**
 * GET /ringcentral/find-contact - Find contact or lead by phone number
 * Used by RingCentral Embeddable for call pop
 */
router.get('/find-contact', authMiddleware, async (req, res, next) => {
  try {
    const { phoneNumber } = req.query;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'phoneNumber is required' },
      });
    }

    // Clean phone number - remove non-digits except leading +
    const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
    // Also try without country code
    const numberWithoutCountry = cleanNumber.replace(/^\+?1/, '');

    const contacts = [];

    // Search Contacts by phone
    const contactResults = await ringCentralService.prisma.contact.findMany({
      where: {
        OR: [
          { phone: { contains: numberWithoutCountry } },
          { mobilePhone: { contains: numberWithoutCountry } },
          { homePhone: { contains: numberWithoutCountry } },
        ],
      },
      take: 5,
      include: {
        account: { select: { id: true, name: true } },
      },
    });

    for (const contact of contactResults) {
      contacts.push({
        id: contact.id,
        type: 'Contact',
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        phone: contact.phone || contact.mobilePhone,
        accountId: contact.accountId,
        accountName: contact.account?.name,
      });
    }

    // Search Leads by phone
    const leadResults = await ringCentralService.prisma.lead.findMany({
      where: {
        OR: [
          { phone: { contains: numberWithoutCountry } },
          { mobilePhone: { contains: numberWithoutCountry } },
        ],
      },
      take: 5,
    });

    for (const lead of leadResults) {
      contacts.push({
        id: lead.id,
        type: 'Lead',
        name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
        phone: lead.phone || lead.mobilePhone,
        status: lead.status,
      });
    }

    res.json({
      success: true,
      data: {
        contacts,
        total: contacts.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/create-call-log - Create call log from Embeddable widget
 * Called automatically when calls end via RingCentral Embeddable
 */
router.post('/create-call-log', authMiddleware, async (req, res, next) => {
  try {
    const {
      contactId,
      contactType,
      direction,
      fromNumber,
      toNumber,
      startTime,
      duration,
      result,
      opportunityId,
      rcCallId,
    } = req.body;

    // Determine leadId vs contactId based on type
    let leadId = null;
    let actualContactId = null;

    if (contactType === 'Lead') {
      leadId = contactId;
    } else if (contactType === 'Contact') {
      actualContactId = contactId;
    }

    // Create call log entry
    const callLog = await ringCentralService.prisma.callLog.create({
      data: {
        direction: direction?.toUpperCase() || 'OUTBOUND',
        fromNumber: typeof fromNumber === 'object' ? fromNumber.phoneNumber : fromNumber,
        toNumber: typeof toNumber === 'object' ? toNumber.phoneNumber : toNumber,
        startTime: startTime ? new Date(startTime) : new Date(),
        duration: parseInt(duration) || 0,
        result: result || 'completed',
        rcCallId: rcCallId,
        userId: req.user?.id,
        contactId: actualContactId,
        leadId: leadId,
        opportunityId: opportunityId,
      },
    });

    // Create Activity record for timeline
    if (actualContactId || leadId || opportunityId) {
      await ringCentralService.prisma.activity.create({
        data: {
          type: direction?.toUpperCase() === 'INBOUND' ? 'CALL_RECEIVED' : 'CALL_MADE',
          subject: `${direction || 'Outbound'} call - ${duration ? Math.floor(duration / 60) + 'm ' + (duration % 60) + 's' : 'No answer'}`,
          description: `Phone call ${direction === 'inbound' ? 'from' : 'to'} ${typeof toNumber === 'object' ? toNumber.phoneNumber : toNumber}`,
          occurredAt: startTime ? new Date(startTime) : new Date(),
          userId: req.user?.id,
          contactId: actualContactId,
          leadId: leadId,
          opportunityId: opportunityId,
          sourceType: 'RINGCENTRAL',
          externalId: rcCallId,
        },
      });
    }

    logger.info(`Call logged from Embeddable: ${callLog.id} by ${req.user?.email}`);

    res.status(201).json({ success: true, data: callLog });
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
router.post('/subscriptions', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res, next) => {
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
router.post('/subscriptions/:id/renew', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res, next) => {
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

// ==========================================
// RingCX Voice APIs (Contact Center)
// ==========================================

/**
 * GET /ringcentral/ringcx/test - Test RingCX connection (no auth required, for debugging)
 */
router.get('/ringcx/test', async (req, res, next) => {
  try {
    const testResult = {
      accountId: process.env.RINGCX_ACCOUNT_ID || 'not set',
      apiTokenSet: !!process.env.RINGCX_API_TOKEN,
      digitalTokenSet: !!process.env.RINGCX_DIGITAL_TOKEN,
      jwtTokenSet: !!process.env.RINGCENTRAL_JWT_TOKEN,
    };

    // Check if we have an RC OAuth token
    let oauthTokenInfo = null;
    try {
      await ringCentralService.loadTokensFromDatabase();
      const hasOAuthToken = !!ringCentralService.accessToken;
      oauthTokenInfo = {
        hasOAuthToken,
        tokenLength: ringCentralService.accessToken?.length || 0,
        isJwtFormat: ringCentralService.accessToken?.split('.').length === 3,
        tokenPrefix: ringCentralService.accessToken?.substring(0, 20) || null,
      };
    } catch (e) {
      oauthTokenInfo = { error: e.message };
    }

    // Try to get a RingCX token via exchange (this is the key step)
    let ringCxTokenInfo = null;
    try {
      const ringCxToken = await ringCentralService.getRingCxAccessToken();
      ringCxTokenInfo = {
        success: true,
        tokenLength: ringCxToken?.length || 0,
        isJwtFormat: ringCxToken?.split('.').length === 3,
        tokenPrefix: ringCxToken?.substring(0, 20) || null,
      };
    } catch (e) {
      ringCxTokenInfo = {
        success: false,
        error: e.message,
      };
    }

    // Try to get RingCX status
    const status = await ringCentralService.getRingCxStatus();

    res.json({
      success: true,
      data: {
        config: testResult,
        rcOAuthToken: oauthTokenInfo,
        ringCxToken: ringCxTokenInfo,
        status,
      },
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      config: {
        accountId: process.env.RINGCX_ACCOUNT_ID || 'not set',
        apiTokenSet: !!process.env.RINGCX_API_TOKEN,
        digitalTokenSet: !!process.env.RINGCX_DIGITAL_TOKEN,
        jwtTokenSet: !!process.env.RINGCENTRAL_JWT_TOKEN,
      },
    });
  }
});

/**
 * GET /ringcentral/ringcx/status - Get RingCX connection status
 */
router.get('/ringcx/status', authMiddleware, async (req, res, next) => {
  try {
    const status = await ringCentralService.getRingCxStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.json({
      success: true,
      data: {
        connected: false,
        configured: false,
        error: error.message,
        message: 'RingCX Voice APIs not configured. Set RINGCX_ACCOUNT_ID and RINGCX_API_TOKEN environment variables.',
      },
    });
  }
});

// ==========================================
// RingCX Agent Management
// ==========================================

/**
 * GET /ringcentral/ringcx/agent-groups - List all agent groups
 */
router.get('/ringcx/agent-groups', authMiddleware, async (req, res, next) => {
  try {
    const groups = await ringCentralService.getRingCxAgentGroups();
    res.json({ success: true, data: groups });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/ringcx/agent-groups/:groupId/agents - List agents in a group
 */
router.get('/ringcx/agent-groups/:groupId/agents', authMiddleware, async (req, res, next) => {
  try {
    const agents = await ringCentralService.getRingCxAgents(req.params.groupId);
    res.json({ success: true, data: agents });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/agent-groups/:groupId/agents - Create a new agent
 */
router.post('/ringcx/agent-groups/:groupId/agents', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res, next) => {
  try {
    const agent = await ringCentralService.createRingCxAgent(req.params.groupId, req.body);
    logger.info(`RingCX agent created: ${agent.agentId} by ${req.user.email}`);
    res.status(201).json({ success: true, data: agent });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /ringcentral/ringcx/agent-groups/:groupId/agents/:agentId - Update an agent
 */
router.put('/ringcx/agent-groups/:groupId/agents/:agentId', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res, next) => {
  try {
    const agent = await ringCentralService.updateRingCxAgent(req.params.groupId, req.params.agentId, req.body);
    logger.info(`RingCX agent updated: ${req.params.agentId} by ${req.user.email}`);
    res.json({ success: true, data: agent });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /ringcentral/ringcx/agent-groups/:groupId/agents/:agentId - Delete an agent
 */
router.delete('/ringcx/agent-groups/:groupId/agents/:agentId', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res, next) => {
  try {
    await ringCentralService.deleteRingCxAgent(req.params.groupId, req.params.agentId);
    logger.info(`RingCX agent deleted: ${req.params.agentId} by ${req.user.email}`);
    res.json({ success: true, message: 'Agent deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/ringcx/agents/:agentId/state - Get agent state
 */
router.get('/ringcx/agents/:agentId/state', authMiddleware, async (req, res, next) => {
  try {
    const state = await ringCentralService.getRingCxAgentState(req.params.agentId);
    res.json({ success: true, data: state });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /ringcentral/ringcx/agents/:agentId/state - Update agent state
 */
router.put('/ringcx/agents/:agentId/state', authMiddleware, async (req, res, next) => {
  try {
    const { state, stateLabel } = req.body;
    if (!state) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'state is required (AVAILABLE, AWAY, ON_BREAK, LUNCH, LOGGED_OUT)' },
      });
    }
    const result = await ringCentralService.updateRingCxAgentState(req.params.agentId, state, stateLabel);
    logger.info(`RingCX agent state updated: ${req.params.agentId} to ${state} by ${req.user.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// RingCX Inbound Queues (Gates)
// ==========================================

/**
 * GET /ringcentral/ringcx/gate-groups - List all gate groups (inbound queue groups)
 */
router.get('/ringcx/gate-groups', authMiddleware, async (req, res, next) => {
  try {
    const groups = await ringCentralService.getRingCxGateGroups();
    res.json({ success: true, data: groups });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/ringcx/gate-groups/:groupId/gates - List gates in a group
 */
router.get('/ringcx/gate-groups/:groupId/gates', authMiddleware, async (req, res, next) => {
  try {
    const gates = await ringCentralService.getRingCxGates(req.params.groupId);
    res.json({ success: true, data: gates });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/gate-groups/:groupId/gates - Create a new gate (queue)
 */
router.post('/ringcx/gate-groups/:groupId/gates', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res, next) => {
  try {
    const gate = await ringCentralService.createRingCxGate(req.params.groupId, req.body);
    logger.info(`RingCX gate created: ${gate.gateId} by ${req.user.email}`);
    res.status(201).json({ success: true, data: gate });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /ringcentral/ringcx/gate-groups/:groupId/gates/:gateId - Update a gate
 */
router.put('/ringcx/gate-groups/:groupId/gates/:gateId', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res, next) => {
  try {
    const gate = await ringCentralService.updateRingCxGate(req.params.groupId, req.params.gateId, req.body);
    logger.info(`RingCX gate updated: ${req.params.gateId} by ${req.user.email}`);
    res.json({ success: true, data: gate });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /ringcentral/ringcx/gate-groups/:groupId/gates/:gateId - Delete a gate
 */
router.delete('/ringcx/gate-groups/:groupId/gates/:gateId', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res, next) => {
  try {
    await ringCentralService.deleteRingCxGate(req.params.groupId, req.params.gateId);
    logger.info(`RingCX gate deleted: ${req.params.gateId} by ${req.user.email}`);
    res.json({ success: true, message: 'Gate deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/ringcx/gates/:gateId/stats - Get stats for a specific gate (queue)
 */
router.get('/ringcx/gates/:gateId/stats', authMiddleware, async (req, res, next) => {
  try {
    const stats = await ringCentralService.getRingCxGateStats(req.params.gateId);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/ringcx/skills - List all skills
 */
router.get('/ringcx/skills', authMiddleware, async (req, res, next) => {
  try {
    const skills = await ringCentralService.getRingCxSkills();
    res.json({ success: true, data: skills });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/skills - Create a new skill
 */
router.post('/ringcx/skills', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res, next) => {
  try {
    const skill = await ringCentralService.createRingCxSkill(req.body);
    logger.info(`RingCX skill created: ${skill.skillId} by ${req.user.email}`);
    res.status(201).json({ success: true, data: skill });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// RingCX Outbound Campaigns (Dial Groups)
// ==========================================

/**
 * GET /ringcentral/ringcx/dial-groups - List all dial groups
 */
router.get('/ringcx/dial-groups', authMiddleware, async (req, res, next) => {
  try {
    const groups = await ringCentralService.getRingCxDialGroups();
    res.json({ success: true, data: groups });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/ringcx/dial-groups/:dialGroupId - Get dial group details
 */
router.get('/ringcx/dial-groups/:dialGroupId', authMiddleware, async (req, res, next) => {
  try {
    const group = await ringCentralService.getRingCxDialGroup(req.params.dialGroupId);
    res.json({ success: true, data: group });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/ringcx/dial-groups/:dialGroupId/campaigns - List campaigns in dial group
 */
router.get('/ringcx/dial-groups/:dialGroupId/campaigns', authMiddleware, async (req, res, next) => {
  try {
    const campaigns = await ringCentralService.getRingCxCampaigns(req.params.dialGroupId);
    res.json({ success: true, data: campaigns });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/dial-groups/:dialGroupId/campaigns - Create a new campaign
 */
router.post('/ringcx/dial-groups/:dialGroupId/campaigns', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res, next) => {
  try {
    const campaign = await ringCentralService.createRingCxCampaign(req.params.dialGroupId, req.body);
    logger.info(`RingCX campaign created: ${campaign.campaignId} by ${req.user.email}`);
    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /ringcentral/ringcx/dial-groups/:dialGroupId/campaigns/:campaignId - Update a campaign
 */
router.put('/ringcx/dial-groups/:dialGroupId/campaigns/:campaignId', authMiddleware, requireRole(['super_admin', 'admin']), async (req, res, next) => {
  try {
    const campaign = await ringCentralService.updateRingCxCampaign(req.params.dialGroupId, req.params.campaignId, req.body);
    logger.info(`RingCX campaign updated: ${req.params.campaignId} by ${req.user.email}`);
    res.json({ success: true, data: campaign });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/dial-groups/:dialGroupId/campaigns/:campaignId/start - Start a campaign
 */
router.post('/ringcx/dial-groups/:dialGroupId/campaigns/:campaignId/start', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
  try {
    const result = await ringCentralService.startRingCxCampaign(req.params.dialGroupId, req.params.campaignId);
    logger.info(`RingCX campaign started: ${req.params.campaignId} by ${req.user.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/dial-groups/:dialGroupId/campaigns/:campaignId/pause - Pause a campaign
 */
router.post('/ringcx/dial-groups/:dialGroupId/campaigns/:campaignId/pause', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
  try {
    const result = await ringCentralService.pauseRingCxCampaign(req.params.dialGroupId, req.params.campaignId);
    logger.info(`RingCX campaign paused: ${req.params.campaignId} by ${req.user.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/dial-groups/:dialGroupId/campaigns/:campaignId/stop - Stop a campaign
 */
router.post('/ringcx/dial-groups/:dialGroupId/campaigns/:campaignId/stop', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
  try {
    const result = await ringCentralService.stopRingCxCampaign(req.params.dialGroupId, req.params.campaignId);
    logger.info(`RingCX campaign stopped: ${req.params.campaignId} by ${req.user.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// RingCX Lead Management
// ==========================================

/**
 * GET /ringcentral/ringcx/campaigns/:campaignId/leads - Get campaign leads
 */
router.get('/ringcx/campaigns/:campaignId/leads', authMiddleware, async (req, res, next) => {
  try {
    const { page = 1, limit = 100, status } = req.query;
    const leads = await ringCentralService.getRingCxLeads(req.params.campaignId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
    });
    res.json({ success: true, data: leads });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/campaigns/:campaignId/leads - Add leads to a campaign
 */
router.post('/ringcx/campaigns/:campaignId/leads', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
  try {
    const { leads } = req.body;
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'leads array is required' },
      });
    }
    const result = await ringCentralService.addRingCxLeads(req.params.campaignId, leads);
    logger.info(`RingCX leads added to campaign ${req.params.campaignId}: ${leads.length} leads by ${req.user.email}`);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /ringcentral/ringcx/campaigns/:campaignId/leads/:leadId - Update a lead
 */
router.put('/ringcx/campaigns/:campaignId/leads/:leadId', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
  try {
    const lead = await ringCentralService.updateRingCxLead(req.params.campaignId, req.params.leadId, req.body);
    logger.info(`RingCX lead updated: ${req.params.leadId} by ${req.user.email}`);
    res.json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /ringcentral/ringcx/campaigns/:campaignId/leads/:leadId - Delete a lead
 */
router.delete('/ringcx/campaigns/:campaignId/leads/:leadId', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
  try {
    await ringCentralService.deleteRingCxLead(req.params.campaignId, req.params.leadId);
    logger.info(`RingCX lead deleted: ${req.params.leadId} by ${req.user.email}`);
    res.json({ success: true, message: 'Lead deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/campaigns/:campaignId/leads/bulk - Bulk upload leads to campaign
 */
router.post('/ringcx/campaigns/:campaignId/leads/bulk', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
  try {
    const { leads, listName, duplicateAction } = req.body;
    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'leads array is required' },
      });
    }
    const result = await ringCentralService.bulkUploadRingCxLeads(req.params.campaignId, leads, {
      listName,
      duplicateAction,
    });
    logger.info(`RingCX bulk leads uploaded to campaign ${req.params.campaignId}: ${leads.length} leads by ${req.user.email}`);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/campaigns/:campaignId/sync-from-crm - Sync leads from Panda CRM
 * Body can contain:
 *   - leadIds: array of lead IDs to sync
 *   - callListId: call list ID to sync all pending items from
 *   - filters: additional filters
 */
router.post('/ringcx/campaigns/:campaignId/sync-from-crm', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
  try {
    const { leadIds, callListId, filters } = req.body;

    // Validate that at least one source is provided
    if (!leadIds?.length && !callListId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Either leadIds or callListId is required' },
      });
    }

    const result = await ringCentralService.syncLeadsToRingCxCampaign(req.params.campaignId, { leadIds, callListId, filters });
    logger.info(`RingCX leads synced from CRM to campaign ${req.params.campaignId}: ${result.synced} leads (source: ${result.source || 'unknown'}) by ${req.user.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// RingCX Active Calls Control
// ==========================================

/**
 * GET /ringcentral/ringcx/active-calls - Get all active calls
 */
router.get('/ringcx/active-calls', authMiddleware, async (req, res, next) => {
  try {
    const { agentId, gateId, campaignId, page = 1, limit = 100 } = req.query;
    const calls = await ringCentralService.getRingCxActiveCalls({
      agentId,
      gateId,
      campaignId,
      page: parseInt(page),
      limit: parseInt(limit),
    });
    res.json({ success: true, data: calls });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/ringcx/active-calls/:sessionId - Get specific active call
 */
router.get('/ringcx/active-calls/:sessionId', authMiddleware, async (req, res, next) => {
  try {
    const call = await ringCentralService.getRingCxActiveCall(req.params.sessionId);
    if (!call) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Active call not found' },
      });
    }
    res.json({ success: true, data: call });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/active-calls/:sessionId/barge - Barge into a call
 */
router.post('/ringcx/active-calls/:sessionId/barge', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
  try {
    const { supervisorAgentId, mode = 'FULL' } = req.body;
    if (!supervisorAgentId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'supervisorAgentId is required' },
      });
    }
    const result = await ringCentralService.bargeRingCxCall(req.params.sessionId, supervisorAgentId, mode);
    logger.info(`RingCX call barged: ${req.params.sessionId} by supervisor ${supervisorAgentId} (${req.user.email})`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/active-calls/:sessionId/coach - Coach on a call (whisper to agent)
 */
router.post('/ringcx/active-calls/:sessionId/coach', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
  try {
    const { supervisorAgentId } = req.body;
    if (!supervisorAgentId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'supervisorAgentId is required' },
      });
    }
    const result = await ringCentralService.coachRingCxCall(req.params.sessionId, supervisorAgentId);
    logger.info(`RingCX call coaching started: ${req.params.sessionId} by supervisor ${supervisorAgentId} (${req.user.email})`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/active-calls/:sessionId/monitor - Silent monitor a call
 */
router.post('/ringcx/active-calls/:sessionId/monitor', authMiddleware, requireRole(['super_admin', 'admin', 'manager']), async (req, res, next) => {
  try {
    const { supervisorAgentId } = req.body;
    if (!supervisorAgentId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'supervisorAgentId is required' },
      });
    }
    const result = await ringCentralService.monitorRingCxCall(req.params.sessionId, supervisorAgentId);
    logger.info(`RingCX call monitoring started: ${req.params.sessionId} by supervisor ${supervisorAgentId} (${req.user.email})`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/active-calls/:sessionId/transfer - Transfer a call
 */
router.post('/ringcx/active-calls/:sessionId/transfer', authMiddleware, async (req, res, next) => {
  try {
    const { destination, destinationType = 'AGENT' } = req.body;
    if (!destination) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'destination is required (agentId, gateId, or phone number)' },
      });
    }
    const result = await ringCentralService.transferRingCxCall(req.params.sessionId, destination, destinationType);
    logger.info(`RingCX call transferred: ${req.params.sessionId} to ${destination} by ${req.user.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/active-calls/:sessionId/hold - Put call on hold
 */
router.post('/ringcx/active-calls/:sessionId/hold', authMiddleware, async (req, res, next) => {
  try {
    const result = await ringCentralService.holdRingCxCall(req.params.sessionId);
    logger.info(`RingCX call put on hold: ${req.params.sessionId} by ${req.user.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/active-calls/:sessionId/resume - Resume call from hold
 */
router.post('/ringcx/active-calls/:sessionId/resume', authMiddleware, async (req, res, next) => {
  try {
    const result = await ringCentralService.resumeRingCxCall(req.params.sessionId);
    logger.info(`RingCX call resumed: ${req.params.sessionId} by ${req.user.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/active-calls/:sessionId/hangup - End a call
 */
router.post('/ringcx/active-calls/:sessionId/hangup', authMiddleware, async (req, res, next) => {
  try {
    const result = await ringCentralService.hangupRingCxCall(req.params.sessionId);
    logger.info(`RingCX call ended: ${req.params.sessionId} by ${req.user.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/active-calls/:sessionId/record - Start/stop recording
 */
router.post('/ringcx/active-calls/:sessionId/record', authMiddleware, async (req, res, next) => {
  try {
    const { action = 'start' } = req.body;
    if (!['start', 'stop', 'pause', 'resume'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'action must be one of: start, stop, pause, resume' },
      });
    }
    const result = await ringCentralService.recordRingCxCall(req.params.sessionId, action);
    logger.info(`RingCX call recording ${action}: ${req.params.sessionId} by ${req.user.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /ringcentral/ringcx/dial - Initiate an outbound call via RingCX
 */
router.post('/ringcx/dial', authMiddleware, async (req, res, next) => {
  try {
    const { agentId, phoneNumber, campaignId, leadId, callerId } = req.body;
    if (!agentId || !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'agentId and phoneNumber are required' },
      });
    }
    const result = await ringCentralService.dialRingCxCall(agentId, phoneNumber, {
      campaignId,
      leadId,
      callerId,
    });
    logger.info(`RingCX outbound call initiated: ${phoneNumber} by agent ${agentId} (${req.user.email})`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// RingCX Statistics & Reports
// ==========================================

/**
 * GET /ringcentral/ringcx/stats/agents - Get agent statistics
 */
router.get('/ringcx/stats/agents', authMiddleware, async (req, res, next) => {
  try {
    const { agentGroupId, startDate, endDate } = req.query;
    const stats = await ringCentralService.getRingCxAgentStats({
      agentGroupId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/ringcx/stats/queues - Get queue statistics
 */
router.get('/ringcx/stats/queues', authMiddleware, async (req, res, next) => {
  try {
    const { gateGroupId, gateId, startDate, endDate } = req.query;
    const stats = await ringCentralService.getRingCxQueueStats({
      gateGroupId,
      gateId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /ringcentral/ringcx/stats/campaigns - Get campaign statistics
 */
router.get('/ringcx/stats/campaigns', authMiddleware, async (req, res, next) => {
  try {
    const { dialGroupId, campaignId, startDate, endDate } = req.query;
    const stats = await ringCentralService.getRingCxCampaignStats({
      dialGroupId,
      campaignId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

export default router;
