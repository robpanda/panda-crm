// Mobile App Foundation Routes
import { Router } from 'express';
import { mobileService } from '../services/mobileService.js';
import { logger } from '../middleware/logger.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// ==========================================
// Session Management
// ==========================================

/**
 * POST /mobile/register - Register mobile device
 */
router.post('/register', authMiddleware, async (req, res, next) => {
  try {
    const session = await mobileService.registerDevice({
      ...req.body,
      userId: req.user.id,
    });

    logger.info(`Mobile device registered for user ${req.user.email}`);

    res.status(201).json({ success: true, data: session });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /mobile/validate - Validate session token
 */
router.post('/validate', async (req, res, next) => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'sessionToken is required' },
      });
    }

    const result = await mobileService.validateSession(sessionToken);

    if (!result.valid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_SESSION', message: 'Session is invalid or expired' },
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /mobile/logout - End mobile session
 */
router.post('/logout', async (req, res, next) => {
  try {
    const { sessionToken } = req.body;

    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'sessionToken is required' },
      });
    }

    await mobileService.endSession(sessionToken);

    res.json({ success: true, message: 'Session ended successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /mobile/push-token - Update push notification token
 */
router.put('/push-token', authMiddleware, async (req, res, next) => {
  try {
    const { sessionId, pushToken } = req.body;

    if (!sessionId || !pushToken) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'sessionId and pushToken are required' },
      });
    }

    await mobileService.updatePushToken(sessionId, pushToken);

    res.json({ success: true, message: 'Push token updated' });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Activity Tracking
// ==========================================

/**
 * POST /mobile/activity - Log mobile activity
 */
router.post('/activity', authMiddleware, async (req, res, next) => {
  try {
    const activity = await mobileService.logActivity({
      ...req.body,
      userId: req.user.id,
    });

    res.status(201).json({ success: true, data: activity });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /mobile/activity - Get user's activities
 */
router.get('/activity', authMiddleware, async (req, res, next) => {
  try {
    const { limit, activityTypes } = req.query;

    const activities = await mobileService.getUserActivities(req.user.id, {
      limit: parseInt(limit) || 50,
      activityTypes: activityTypes ? activityTypes.split(',') : undefined,
    });

    res.json({ success: true, data: activities });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Offline Sync
// ==========================================

/**
 * GET /mobile/sync - Get data for offline caching
 */
router.get('/sync', authMiddleware, async (req, res, next) => {
  try {
    const {
      lastSyncAt,
      includeOpportunities,
      includeAccounts,
      includeContacts,
      includeAppointments,
    } = req.query;

    const data = await mobileService.getOfflineData(req.user.id, {
      lastSyncAt,
      includeOpportunities: includeOpportunities !== 'false',
      includeAccounts: includeAccounts !== 'false',
      includeContacts: includeContacts !== 'false',
      includeAppointments: includeAppointments !== 'false',
    });

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /mobile/sync - Sync offline changes
 */
router.post('/sync', authMiddleware, async (req, res, next) => {
  try {
    const { changes } = req.body;

    if (!changes || !Array.isArray(changes)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'changes array is required' },
      });
    }

    const result = await mobileService.syncOfflineChanges(req.user.id, changes);

    logger.info(`Offline sync: ${result.success.length} changes synced for ${req.user.email}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Dashboard & Data
// ==========================================

/**
 * GET /mobile/dashboard - Get mobile dashboard data
 */
router.get('/dashboard', authMiddleware, async (req, res, next) => {
  try {
    const data = await mobileService.getDashboardData(req.user.id);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /mobile/opportunities/:id - Get opportunity detail for mobile
 */
router.get('/opportunities/:id', authMiddleware, async (req, res, next) => {
  try {
    const opportunity = await mobileService.getOpportunityDetail(
      req.params.id,
      req.user.id
    );

    res.json({ success: true, data: opportunity });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Push Notifications
// ==========================================

/**
 * POST /mobile/test-push - Send test push notification (dev only)
 */
router.post('/test-push', authMiddleware, async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Not available in production' },
      });
    }

    const result = await mobileService.sendPushNotification(req.user.id, {
      title: 'Test Notification',
      body: 'This is a test push notification from Panda CRM',
      data: { type: 'TEST' },
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Admin Routes
// ==========================================

/**
 * GET /mobile/stats - Get mobile usage statistics
 */
router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const stats = await mobileService.getUsageStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });

    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /mobile/cleanup - Clean up stale sessions
 */
router.post('/cleanup', authMiddleware, async (req, res, next) => {
  try {
    const { daysOld = 30 } = req.body;

    const result = await mobileService.cleanupStaleSessions(parseInt(daysOld));

    logger.info(`Mobile session cleanup: ${result.count} sessions deactivated`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
