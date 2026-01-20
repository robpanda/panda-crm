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
// Google Calendar Event Cache
// ==========================================
// In-memory cache for Google Calendar events with TTL
const calendarEventCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const SERVICE_RESOURCES_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes for resource list

// Cache for service resources with Google Calendar enabled (changes less frequently)
let serviceResourcesCache = null;
let serviceResourcesCacheTime = null;

/**
 * Generate cache key for calendar events
 */
function getCalendarCacheKey(email, startDate, endDate) {
  // Normalize dates to day boundaries for better cache hits
  const start = new Date(startDate).toISOString().split('T')[0];
  const end = new Date(endDate).toISOString().split('T')[0];
  return `${email}:${start}:${end}`;
}

/**
 * Get cached calendar events or fetch fresh
 */
async function getCachedCalendarEvents(email, startDate, endDate) {
  const cacheKey = getCalendarCacheKey(email, startDate, endDate);
  const cached = calendarEventCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug(`Cache HIT for ${email} calendar events`);
    return { events: cached.events, fromCache: true };
  }

  logger.debug(`Cache MISS for ${email} - fetching from Google Calendar`);
  const events = await googleCalendarService.getEvents(email, new Date(startDate), new Date(endDate));

  // Store in cache
  calendarEventCache.set(cacheKey, {
    events,
    timestamp: Date.now(),
  });

  return { events, fromCache: false };
}

/**
 * Get cached service resources with Google Calendar enabled
 */
async function getCachedServiceResources(resourceFilter = {}) {
  // Only use cache for full list (no filter)
  const useCache = Object.keys(resourceFilter).length === 0;

  if (useCache && serviceResourcesCache && Date.now() - serviceResourcesCacheTime < SERVICE_RESOURCES_CACHE_TTL_MS) {
    logger.debug('Service resources cache HIT');
    return serviceResourcesCache;
  }

  const resources = await prisma.serviceResource.findMany({
    where: {
      ...resourceFilter,
      isActive: true,
      userId: { not: null },
    },
    select: {
      id: true,
      name: true,
      userId: true,
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          googleCalendarEmail: true,
          googleCalendarSyncEnabled: true,
        },
      },
    },
  });

  // Filter to only resources with Google Calendar enabled
  const resourcesWithCalendar = resources.filter(
    r => r.user?.googleCalendarEmail && r.user?.googleCalendarSyncEnabled
  );

  // Store in cache if full list
  if (useCache) {
    serviceResourcesCache = resourcesWithCalendar;
    serviceResourcesCacheTime = Date.now();
    logger.debug(`Cached ${resourcesWithCalendar.length} service resources with Google Calendar`);
  }

  return resourcesWithCalendar;
}

/**
 * Clear calendar event cache (call when events change)
 */
function clearCalendarCache(email = null) {
  if (email) {
    // Clear cache entries for specific email
    for (const key of calendarEventCache.keys()) {
      if (key.startsWith(`${email}:`)) {
        calendarEventCache.delete(key);
      }
    }
    logger.info(`Cleared calendar cache for ${email}`);
  } else {
    // Clear all
    calendarEventCache.clear();
    logger.info('Cleared all calendar cache');
  }
}

/**
 * Clear service resources cache
 */
function clearServiceResourcesCache() {
  serviceResourcesCache = null;
  serviceResourcesCacheTime = null;
  logger.info('Cleared service resources cache');
}

// Periodic cache cleanup (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of calendarEventCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      calendarEventCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug(`Cleaned ${cleaned} expired calendar cache entries`);
  }
}, 10 * 60 * 1000);

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
 * Supports pagination with ?page=1&limit=100
 * Supports tag filtering with ?tag=BEFORE or ?tag=AFTER
 */
router.get('/companycam/opportunity/:opportunityId/photos', authMiddleware, async (req, res, next) => {
  try {
    const { page, limit, tag } = req.query;
    const options = {
      page: parseInt(page) || 1,
      limit: Math.min(parseInt(limit) || 100, 500), // Max 500 per request
      tag: tag || undefined, // Filter by tag (e.g., 'BEFORE', 'AFTER')
    };
    const result = await companyCamService.getOpportunityPhotos(req.params.opportunityId, options);
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
// CompanyCam Crew Access Management
// ==========================================

/**
 * POST /companycam/crew/ensure-access - Ensure a crew member has access to a project
 * Creates CompanyCam account if needed, adds as collaborator to project
 */
router.post('/companycam/crew/ensure-access', authMiddleware, async (req, res, next) => {
  try {
    const { email, firstName, lastName, phone, companyCamProjectId, opportunityId } = req.body;

    if (!email || !firstName || !lastName || !companyCamProjectId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'email, firstName, lastName, and companyCamProjectId are required',
        },
      });
    }

    const result = await companyCamService.ensureCrewAccess({
      email,
      firstName,
      lastName,
      phone,
      companyCamProjectId,
      opportunityId,
    });

    logger.info(`Crew access granted: ${email} -> project ${companyCamProjectId}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /companycam/crew/revoke-access - Revoke crew access from a project
 */
router.post('/companycam/crew/revoke-access', authMiddleware, async (req, res, next) => {
  try {
    const { email, companyCamProjectId } = req.body;

    if (!email || !companyCamProjectId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'email and companyCamProjectId are required',
        },
      });
    }

    const result = await companyCamService.revokeCrewAccess({
      email,
      companyCamProjectId,
    });

    logger.info(`Crew access revoked: ${email} -> project ${companyCamProjectId}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /companycam/projects/:id/collaborators - Get all collaborators on a project
 */
router.get('/companycam/projects/:id/collaborators', authMiddleware, async (req, res, next) => {
  try {
    const collaborators = await companyCamService.getProjectCollaborators(req.params.id);
    res.json({ success: true, data: collaborators });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /companycam/users - Get all CompanyCam users
 */
router.get('/companycam/users', authMiddleware, async (req, res, next) => {
  try {
    const users = await companyCamService.getUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /companycam/users/search - Search for CompanyCam user by email
 */
router.get('/companycam/users/search', authMiddleware, async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'email query parameter is required' },
      });
    }

    const user = await companyCamService.findUserByEmail(email);
    res.json({
      success: true,
      data: user || null,
      found: !!user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /companycam/users - Create a new CompanyCam user (for third-party contractors)
 */
router.post('/companycam/users', authMiddleware, requireRole(['admin', 'super_admin', 'manager']), async (req, res, next) => {
  try {
    const { email, firstName, lastName, phone, role } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'email, firstName, and lastName are required',
        },
      });
    }

    const user = await companyCamService.createUser({
      email,
      firstName,
      lastName,
      phone,
      role: role || 'standard',
    });

    logger.info(`CompanyCam user created: ${email} by ${req.user.email}`);

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// CompanyCam Photo Tag Management Routes (Local DB)
// ==========================================

/**
 * POST /companycam/photos/:id/tags - Add a tag to a photo
 */
router.post('/companycam/photos/:id/tags', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tag } = req.body;

    if (!tag || typeof tag !== 'string' || tag.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'tag is required and must be a non-empty string',
        },
      });
    }

    const photo = await companyCamService.addPhotoTagLocal(id, tag.trim());

    logger.info(`Tag "${tag}" added to photo ${id} by ${req.user.email}`);

    res.json({ success: true, data: photo });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /companycam/photos/:id/tags/:tag - Remove a tag from a photo
 */
router.delete('/companycam/photos/:id/tags/:tag', authMiddleware, async (req, res, next) => {
  try {
    const { id, tag } = req.params;

    if (!tag) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'tag parameter is required',
        },
      });
    }

    const photo = await companyCamService.removePhotoTagLocal(id, decodeURIComponent(tag));

    logger.info(`Tag "${tag}" removed from photo ${id} by ${req.user.email}`);

    res.json({ success: true, data: photo });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /companycam/photos/:id/tags - Set/replace all tags on a photo
 */
router.put('/companycam/photos/:id/tags', authMiddleware, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'tags must be an array of strings',
        },
      });
    }

    // Filter and sanitize tags
    const sanitizedTags = tags
      .filter(t => typeof t === 'string' && t.trim().length > 0)
      .map(t => t.trim());

    const photo = await companyCamService.setPhotoTagsLocal(id, sanitizedTags);

    logger.info(`Tags set on photo ${id} by ${req.user.email}: [${sanitizedTags.join(', ')}]`);

    res.json({ success: true, data: photo });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /companycam/tags - Get all tags with usage counts
 */
router.get('/companycam/tags', authMiddleware, async (req, res, next) => {
  try {
    const tags = await companyCamService.getAllTagsWithCounts();

    res.json({ success: true, data: tags });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /companycam/projects/:projectId/tags - Get all unique tags in a project
 */
router.get('/companycam/projects/:projectId/tags', authMiddleware, async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const tags = await companyCamService.getProjectTagsLocal(projectId);

    res.json({ success: true, data: tags });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /companycam/photos/bulk-tags - Bulk add or remove tags from multiple photos
 * Body: { photoIds: string[], tag: string, action: 'add' | 'remove' }
 */
router.post('/companycam/photos/bulk-tags', authMiddleware, async (req, res, next) => {
  try {
    const { photoIds, tag, action } = req.body;

    if (!Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'photoIds must be a non-empty array',
        },
      });
    }

    if (!tag || typeof tag !== 'string' || tag.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'tag is required and must be a non-empty string',
        },
      });
    }

    if (!['add', 'remove'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'action must be either "add" or "remove"',
        },
      });
    }

    let result;
    if (action === 'add') {
      result = await companyCamService.bulkAddTag(photoIds, tag.trim());
      logger.info(`Bulk tag add "${tag}" to ${photoIds.length} photos by ${req.user.email}`);
    } else {
      result = await companyCamService.bulkRemoveTag(photoIds, tag.trim());
      logger.info(`Bulk tag remove "${tag}" from ${photoIds.length} photos by ${req.user.email}`);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Google Calendar Routes (Domain-Wide Delegation)
// ==========================================

/**
 * GET /google/test - Test connection with Domain-Wide Delegation
 */
router.get('/google/test', authMiddleware, async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'email is required (Google Workspace email to test)' },
      });
    }

    const result = await googleCalendarService.testConnection(email);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /google/users - Get all users and their calendar sync status
 */
router.get('/google/users', authMiddleware, async (req, res, next) => {
  try {
    const users = await googleCalendarService.getAllUsersCalendarStatus();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /google/users/:userId/status - Get calendar connection status for a user
 */
router.get('/google/users/:userId/status', authMiddleware, async (req, res, next) => {
  try {
    const result = await googleCalendarService.getConnectionStatus(req.params.userId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /google/users/:userId/link - Link a user to their Google Calendar email
 */
router.post('/google/users/:userId/link', authMiddleware, async (req, res, next) => {
  try {
    const { googleCalendarEmail, enableSync } = req.body;

    if (!googleCalendarEmail) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'googleCalendarEmail is required' },
      });
    }

    const result = await googleCalendarService.linkUserToGoogleCalendar(
      req.params.userId,
      googleCalendarEmail,
      enableSync !== false // Default to true
    );

    logger.info(`Linked user ${req.params.userId} to Google Calendar ${googleCalendarEmail}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /google/events/:userId - Get calendar events for a user
 */
router.get('/google/events/:userId', authMiddleware, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    // Get user's Google Calendar email
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { googleCalendarEmail: true }
    });

    if (!user?.googleCalendarEmail) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'User does not have a Google Calendar linked' },
      });
    }

    const events = await googleCalendarService.getEvents(
      user.googleCalendarEmail,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    res.json({ success: true, data: events });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /google/freebusy - Get free/busy info for multiple users
 */
router.get('/google/freebusy', authMiddleware, async (req, res, next) => {
  try {
    const { userIds, startDate, endDate } = req.query;

    if (!userIds || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'userIds, startDate, and endDate are required' },
      });
    }

    const userIdArray = Array.isArray(userIds) ? userIds : userIds.split(',');

    // Get Google Calendar emails for all requested users
    const users = await prisma.user.findMany({
      where: {
        id: { in: userIdArray },
        googleCalendarEmail: { not: null },
        googleCalendarSyncEnabled: true
      },
      select: { id: true, googleCalendarEmail: true, firstName: true, lastName: true }
    });

    const emails = users.map(u => u.googleCalendarEmail);

    if (emails.length === 0) {
      return res.json({ success: true, data: { users: [], freeBusy: {} } });
    }

    const freeBusy = await googleCalendarService.getFreeBusyMultiple(
      emails,
      new Date(startDate),
      new Date(endDate)
    );

    res.json({
      success: true,
      data: {
        users: users.map(u => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.googleCalendarEmail })),
        freeBusy
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /google/sync/:userId - Sync appointments for a specific user
 */
router.post('/google/sync/:userId', authMiddleware, async (req, res, next) => {
  try {
    const result = await googleCalendarService.syncAppointmentsForUser(req.params.userId);

    logger.info(`Google Calendar sync for user ${req.params.userId}: ${result.synced} synced`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /google/sync-all - Sync appointments for all enabled users
 */
router.post('/google/sync-all', authMiddleware, async (req, res, next) => {
  try {
    const result = await googleCalendarService.syncAllUsers();

    logger.info(`Google Calendar sync-all: ${result.totalSynced} appointments synced across ${result.usersProcessed} users`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /google/appointment - Create a calendar event for an appointment
 */
router.post('/google/appointment', authMiddleware, async (req, res, next) => {
  try {
    const { userId, appointment } = req.body;

    if (!userId || !appointment) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'userId and appointment are required' },
      });
    }

    // Get user's Google Calendar email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { googleCalendarEmail: true, googleCalendarSyncEnabled: true }
    });

    if (!user?.googleCalendarEmail || !user.googleCalendarSyncEnabled) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'User does not have Google Calendar sync enabled' },
      });
    }

    const event = await googleCalendarService.createAppointmentEvent(
      user.googleCalendarEmail,
      appointment
    );

    logger.info(`Created Google Calendar event for user ${userId}: ${event.id}`);

    res.json({ success: true, data: event });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /google/toggle/:userId - Toggle sync enabled for a user
 */
router.post('/google/toggle/:userId', authMiddleware, async (req, res, next) => {
  try {
    const { enabled } = req.body;

    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: { googleCalendarSyncEnabled: enabled === true },
      select: { id: true, firstName: true, lastName: true, googleCalendarEmail: true, googleCalendarSyncEnabled: true }
    });

    logger.info(`Google Calendar sync ${enabled ? 'enabled' : 'disabled'} for user ${req.params.userId}`);

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /google/users/:userId - Unlink Google Calendar from user
 */
router.delete('/google/users/:userId', authMiddleware, async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.userId },
      data: {
        googleCalendarEmail: null,
        googleCalendarSyncEnabled: false,
        googleCalendarLastSyncAt: null
      },
      select: { id: true, firstName: true, lastName: true }
    });

    logger.info(`Google Calendar unlinked for user ${req.params.userId}`);

    res.json({ success: true, message: 'Google Calendar unlinked', data: user });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Google Calendar Events for Service Resources (Schedule Integration)
// ==========================================

/**
 * GET /google/resource-events - Get calendar events for all service resources
 * This endpoint fetches Google Calendar events for service resources that have
 * linked Google Calendar accounts, for display in the unified Schedule view
 *
 * OPTIMIZED: Uses caching and parallel fetching for better performance
 */
router.get('/google/resource-events', authMiddleware, async (req, res, next) => {
  try {
    const { startDate, endDate, resourceIds } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'startDate and endDate are required' },
      });
    }

    const fetchStartTime = Date.now();

    // Use cached service resources list for better performance
    let resourceFilter = {};
    if (resourceIds) {
      const ids = Array.isArray(resourceIds) ? resourceIds : resourceIds.split(',');
      resourceFilter = { id: { in: ids } };
    }

    const resourcesWithCalendar = await getCachedServiceResources(resourceFilter);

    if (resourcesWithCalendar.length === 0) {
      return res.json({
        success: true,
        data: {
          resources: [],
          events: [],
          message: 'No service resources have Google Calendar enabled',
          cacheInfo: { resourceCount: 0, fetchTimeMs: Date.now() - fetchStartTime },
        },
      });
    }

    // Fetch calendar events for all resources IN PARALLEL with caching
    const fetchPromises = resourcesWithCalendar.map(async (resource) => {
      try {
        const { events, fromCache } = await getCachedCalendarEvents(
          resource.user.googleCalendarEmail,
          startDate,
          endDate
        );

        // Transform events to include resource info and consistent format
        const resourceEvents = events.map(event => ({
          id: event.id,
          googleEventId: event.id,
          resourceId: resource.id,
          resourceName: resource.name,
          userId: resource.userId,
          title: event.summary || 'Busy',
          description: event.description || '',
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          allDay: !event.start?.dateTime,
          location: event.location || '',
          status: event.status,
          source: 'google_calendar',
          color: event.colorId || null,
          isExternalEvent: true,
        }));

        return {
          success: true,
          resource,
          events: resourceEvents,
          fromCache,
        };
      } catch (error) {
        logger.warn(`Failed to fetch calendar for resource ${resource.id}:`, error.message);
        return {
          success: false,
          resource,
          events: [],
          error: error.message,
        };
      }
    });

    // Wait for all fetches to complete in parallel
    const results = await Promise.all(fetchPromises);

    // Aggregate results
    const allEvents = [];
    const resourceSummary = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    for (const result of results) {
      const { resource, events, fromCache, success, error } = result;

      allEvents.push(...events);

      if (fromCache) cacheHits++;
      else if (success) cacheMisses++;

      resourceSummary.push({
        resourceId: resource.id,
        resourceName: resource.name,
        googleEmail: resource.user.googleCalendarEmail,
        eventCount: events.length,
        fromCache: fromCache || false,
        ...(error && { error }),
      });
    }

    const fetchTimeMs = Date.now() - fetchStartTime;

    logger.info(`Google Calendar events fetched in ${fetchTimeMs}ms - ${cacheHits} cache hits, ${cacheMisses} cache misses, ${allEvents.length} total events`);

    res.json({
      success: true,
      data: {
        resources: resourceSummary,
        events: allEvents,
        totalEvents: allEvents.length,
        dateRange: { startDate, endDate },
        cacheInfo: {
          resourceCount: resourcesWithCalendar.length,
          cacheHits,
          cacheMisses,
          fetchTimeMs,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /google/cache/clear - Clear Google Calendar cache (admin only)
 */
router.post('/google/cache/clear', authMiddleware, async (req, res, next) => {
  try {
    const { email } = req.body;

    clearCalendarCache(email || null);
    if (!email) {
      clearServiceResourcesCache();
    }

    res.json({
      success: true,
      message: email ? `Cache cleared for ${email}` : 'All calendar cache cleared',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /google/resource/:resourceId/events - Get calendar events for a specific service resource
 */
router.get('/google/resource/:resourceId/events', authMiddleware, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'startDate and endDate are required' },
      });
    }

    // Find the service resource and its linked user
    const resource = await prisma.serviceResource.findUnique({
      where: { id: req.params.resourceId },
      include: {
        user: {
          select: {
            googleCalendarEmail: true,
            googleCalendarSyncEnabled: true,
          },
        },
      },
    });

    if (!resource) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Service resource not found' },
      });
    }

    if (!resource.user?.googleCalendarEmail || !resource.user?.googleCalendarSyncEnabled) {
      return res.status(400).json({
        success: false,
        error: { code: 'NOT_CONFIGURED', message: 'This resource does not have Google Calendar enabled' },
      });
    }

    const events = await googleCalendarService.getEvents(
      resource.user.googleCalendarEmail,
      new Date(startDate),
      new Date(endDate)
    );

    const transformedEvents = events.map(event => ({
      id: event.id,
      googleEventId: event.id,
      resourceId: resource.id,
      resourceName: resource.name,
      title: event.summary || 'Busy',
      description: event.description || '',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
      allDay: !event.start?.dateTime,
      location: event.location || '',
      status: event.status,
      source: 'google_calendar',
      isExternalEvent: true,
    }));

    res.json({
      success: true,
      data: transformedEvents,
    });
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

    // Get Google Calendar connections (users with calendar linked)
    const googleUsersLinked = await prisma.user.count({
      where: { googleCalendarEmail: { not: null } }
    });
    const googleUsersEnabled = await prisma.user.count({
      where: { googleCalendarSyncEnabled: true }
    });

    res.json({
      success: true,
      data: {
        companyCam: companyCamStatus,
        googleCalendar: {
          usesServiceAccount: true, // Domain-Wide Delegation
          usersLinked: googleUsersLinked,
          usersEnabled: googleUsersEnabled,
        },
        // Add other integration statuses here
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
