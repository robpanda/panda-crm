// Integration Routes - CompanyCam, Google Calendar, and other integrations
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { companyCamService } from '../services/companyCamService.js';
import { googleCalendarService } from '../services/googleCalendarService.js';
import { logger } from '../middleware/logger.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// ==========================================
// CompanyCam Routes
// ==========================================

/**
 * GET /companycam/projects - List CompanyCam projects
 */
router.get('/companycam/projects', authMiddleware, async (req, res, next) => {
  try {
    const { page, perPage, search, status } = req.query;

    const result = await companyCamService.getProjects({
      page: parseInt(page) || 1,
      perPage: parseInt(perPage) || 50,
      search,
      status,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /companycam/projects/:id - Get single CompanyCam project
 */
router.get('/companycam/projects/:id', authMiddleware, async (req, res, next) => {
  try {
    const project = await companyCamService.getProject(req.params.id);
    res.json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /companycam/projects - Create CompanyCam project
 */
router.post('/companycam/projects', authMiddleware, async (req, res, next) => {
  try {
    const project = await companyCamService.createProject(req.body);

    logger.info(`CompanyCam project created: ${project.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: project });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /companycam/projects/:id/photos - Get project photos
 */
router.get('/companycam/projects/:id/photos', authMiddleware, async (req, res, next) => {
  try {
    const { page, perPage, tag, startDate, endDate } = req.query;

    const result = await companyCamService.getProjectPhotos(req.params.id, {
      page: parseInt(page) || 1,
      perPage: parseInt(perPage) || 50,
      tag,
      startDate,
      endDate,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /companycam/projects/:id/sync - Sync project photos
 */
router.post('/companycam/projects/:id/sync', authMiddleware, async (req, res, next) => {
  try {
    const result = await companyCamService.syncProjectPhotos(req.params.id);

    logger.info(`CompanyCam sync complete: ${result.synced} photos for project ${req.params.id}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /companycam/projects/:id/link - Link project to opportunity
 */
router.post('/companycam/projects/:id/link', authMiddleware, async (req, res, next) => {
  try {
    const { opportunityId } = req.body;

    if (!opportunityId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId is required' },
      });
    }

    const result = await companyCamService.linkToOpportunity(req.params.id, opportunityId);

    logger.info(`Linked CompanyCam project ${req.params.id} to opportunity ${opportunityId}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /companycam/local - Get locally synced projects
 */
router.get('/companycam/local', authMiddleware, async (req, res, next) => {
  try {
    const { opportunityId, syncStatus } = req.query;

    const projects = await companyCamService.getLocalProjects({
      opportunityId,
      syncStatus,
    });

    res.json({ success: true, data: projects });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /companycam/opportunity/:opportunityId/photos - Get photos for opportunity
 */
router.get('/companycam/opportunity/:opportunityId/photos', authMiddleware, async (req, res, next) => {
  try {
    const result = await companyCamService.getOpportunityPhotos(req.params.opportunityId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /companycam/activity - Get recent activity
 */
router.get('/companycam/activity', authMiddleware, async (req, res, next) => {
  try {
    const { limit } = req.query;
    const activity = await companyCamService.getRecentActivity(parseInt(limit) || 20);
    res.json({ success: true, data: activity });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /companycam/webhook - Handle CompanyCam webhooks
 */
router.post('/companycam/webhook', async (req, res, next) => {
  try {
    // Verify webhook signature if needed
    const signature = req.headers['x-companycam-signature'];
    // TODO: Implement signature verification

    await companyCamService.handleWebhook(req.body);

    res.sendStatus(200);
  } catch (error) {
    logger.error('CompanyCam webhook error:', error);
    res.sendStatus(500);
  }
});

// ==========================================
// Google Calendar Routes
// ==========================================

/**
 * GET /google/auth - Get authorization URL
 */
router.get('/google/auth', authMiddleware, async (req, res, next) => {
  try {
    const { serviceResourceId } = req.query;

    if (!serviceResourceId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'serviceResourceId is required' },
      });
    }

    const authUrl = await googleCalendarService.getAuthUrl(serviceResourceId, {
      userId: req.user.id,
    });

    res.json({ success: true, data: { authUrl } });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /google/callback - OAuth callback
 */
router.get('/google/callback', async (req, res, next) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Missing code or state' },
      });
    }

    const parsedState = JSON.parse(state);
    const { serviceResourceId } = parsedState;

    await googleCalendarService.exchangeCode(code, serviceResourceId);

    // Redirect to success page
    res.redirect(`${process.env.FRONTEND_URL}/integrations/google/success`);
  } catch (error) {
    logger.error('Google OAuth callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/integrations/google/error`);
  }
});

/**
 * GET /google/status/:serviceResourceId - Get sync status
 */
router.get('/google/status/:serviceResourceId', authMiddleware, async (req, res, next) => {
  try {
    const status = await googleCalendarService.getSyncStatus(req.params.serviceResourceId);
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /google/sync/:serviceResourceId - Sync appointments
 */
router.post('/google/sync/:serviceResourceId', authMiddleware, async (req, res, next) => {
  try {
    const result = await googleCalendarService.syncAppointments(req.params.serviceResourceId);

    logger.info(`Google Calendar sync for ${req.params.serviceResourceId}: ${result.synced} synced`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /google/availability/:serviceResourceId - Get availability
 */
router.get('/google/availability/:serviceResourceId', authMiddleware, async (req, res, next) => {
  try {
    const { startDate, endDate, duration } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'startDate and endDate are required' },
      });
    }

    const slots = await googleCalendarService.findAvailableSlots(
      req.params.serviceResourceId,
      startDate,
      endDate,
      parseInt(duration) || 60
    );

    res.json({ success: true, data: slots });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /google/toggle/:serviceResourceId - Toggle sync enabled
 */
router.post('/google/toggle/:serviceResourceId', authMiddleware, async (req, res, next) => {
  try {
    const { enabled } = req.body;

    const result = await googleCalendarService.toggleSync(
      req.params.serviceResourceId,
      enabled
    );

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /google/:serviceResourceId - Disconnect Google Calendar
 */
router.delete('/google/:serviceResourceId', authMiddleware, async (req, res, next) => {
  try {
    await googleCalendarService.disconnect(req.params.serviceResourceId);

    logger.info(`Google Calendar disconnected for ${req.params.serviceResourceId}`);

    res.json({ success: true, message: 'Google Calendar disconnected' });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Integration Status Overview
// ==========================================

/**
 * GET /status - Get overview of all integration statuses
 */
router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    // Get CompanyCam status
    let companyCamStatus = { connected: false };
    try {
      const projects = await companyCamService.getProjects({ perPage: 1 });
      companyCamStatus = { connected: true, projectCount: projects.pagination.total };
    } catch (e) {
      companyCamStatus = { connected: false, error: e.message };
    }

    // Get Google Calendar connections
    const googleConnections = await prisma.googleCalendarSync.count();

    res.json({
      success: true,
      data: {
        companyCam: companyCamStatus,
        googleCalendar: {
          connectedResources: googleConnections,
        },
        // Add other integration statuses here
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
