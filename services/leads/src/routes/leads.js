// Lead Routes
import { Router } from 'express';
import { body, query } from 'express-validator';
import { leadService } from '../services/leadService.js';
import { leadScoringService } from '../services/leadScoringService.js';

const router = Router();

// Validation error handler
const handleValidation = async (req, res, next) => {
  const { validationResult } = await import('express-validator');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors.array() },
    });
  }
  next();
};

// Validation rules
const validateCreate = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 500 }),
  query('status').optional().isIn(['all', 'NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'NURTURING']),
  query('ownerFilter').optional().isIn(['mine', 'all']),
  query('ownerId').optional().isString(),
  query('ownerIds').optional().isString(),
  query('search').optional().isString(),
  query('sortBy').optional().isString(),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

// ============================================================================
// STATIC ROUTES - Must come BEFORE /:id routes
// ============================================================================

// Admin: Get deleted leads (for restore page) - must be before /:id
router.get('/deleted', async (req, res, next) => {
  try {
    const result = await leadService.getDeletedLeads({
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      search: req.query.search,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Get lead statuses
router.get('/statuses', (req, res) => {
  res.json({ success: true, data: leadService.getLeadStatuses() });
});

// Get lead sources
router.get('/sources', (req, res) => {
  res.json({ success: true, data: leadService.getLeadSources() });
});

// Get lead counts
router.get('/counts', async (req, res, next) => {
  try {
    // Parse ownerIds if provided (comma-separated string)
    const ownerIds = req.query.ownerIds
      ? req.query.ownerIds.split(',').filter(id => id.trim())
      : [];
    // If single ownerId is provided, use it
    const ownerId = req.query.ownerId || null;
    const counts = await leadService.getLeadCounts(req.user?.id, ownerId, ownerIds);
    res.json({ success: true, data: counts });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// MOBILE APP - DOOR KNOCKER ENDPOINTS
// ============================================================================

/**
 * GET /my-pins
 * Get leads created by current user for map pins (Door Knocker experience)
 * Used for displaying pins on the mobile app map
 * Query params: date, territoryId, startDate, endDate, latitude, longitude, radius
 */
router.get('/my-pins', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { date, territoryId, startDate, endDate, latitude, longitude, radius } = req.query;
    const pins = await leadService.getMyPins({
      userId,
      date,
      territoryId,
      startDate,
      endDate,
      latitude: latitude ? parseFloat(latitude) : undefined,
      longitude: longitude ? parseFloat(longitude) : undefined,
      radius: radius ? parseFloat(radius) : undefined,
    });
    res.json({ success: true, data: pins });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /scoreboard
 * Get lead stats for scoreboard (Door Knocker experience)
 * Returns personal stats and team leaderboard
 * Query params: period (today/week/month) OR startDate/endDate, userId, teamId
 */
router.get('/scoreboard', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { period, startDate, endDate, teamId, userId: queryUserId } = req.query;
    const scoreboard = await leadService.getScoreboard({
      userId: queryUserId || userId,
      period: period || 'today',
      startDate,
      endDate,
      teamId,
    });
    res.json({ success: true, data: scoreboard });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /quick-pin
 * Quick create a lead pin from mobile app (Door Knocker experience)
 * Simplified lead creation for door knockers
 */
router.post('/quick-pin', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const { latitude, longitude, street, city, state, postalCode, status, notes } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Latitude and longitude are required' },
      });
    }

    const lead = await leadService.createQuickPin({
      createdById: userId,
      ownerId: userId,
      latitude,
      longitude,
      street,
      city,
      state,
      postalCode,
      status: status || 'NEW',
      notes,
    });

    res.json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// BULK REASSIGNMENT ENDPOINTS
// ============================================================================

/**
 * GET /assignable-users
 * Get list of users who can be assigned leads
 */
router.get('/assignable-users', async (req, res, next) => {
  try {
    const users = await leadService.getAssignableUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /bulk-reassign
 * Bulk reassign multiple leads to a new owner
 * Body: { leadIds: string[], newOwnerId: string }
 */
router.post('/bulk-reassign', async (req, res, next) => {
  try {
    const { leadIds, newOwnerId } = req.body;
    const result = await leadService.bulkReassignLeads(leadIds, newOwnerId, {
      userId: req.user?.id,
      userEmail: req.user?.email,
      ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
      userAgent: req.headers['user-agent'],
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /bulk-update-status
 * Bulk update status for multiple leads
 * Body: { leadIds: string[], status: string, disposition?: string }
 */
router.post('/bulk-update-status', async (req, res, next) => {
  try {
    const { leadIds, status, disposition } = req.body;
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'leadIds array is required' },
      });
    }
    if (!status) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'status is required' },
      });
    }
    const result = await leadService.bulkUpdateStatus(leadIds, status, disposition, {
      userId: req.user?.id,
      userEmail: req.user?.email,
      ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
      userAgent: req.headers['user-agent'],
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /bulk-delete
 * Bulk delete multiple leads (soft delete)
 * Body: { leadIds: string[] }
 */
router.post('/bulk-delete', async (req, res, next) => {
  try {
    const { leadIds } = req.body;
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'leadIds array is required' },
      });
    }
    const result = await leadService.bulkDeleteLeads(leadIds, {
      userId: req.user?.id,
      userEmail: req.user?.email,
      ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
      userAgent: req.headers['user-agent'],
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// MOBILE APP ENDPOINTS - Door Knocker features
// ============================================================================

/**
 * GET /pins
 * Get map pins with house scores for mobile app
 * Query: ?lat={latitude}&lng={longitude}&radius={miles}&limit={count}
 *
 * Returns pins in format compatible with Panda Mobile app:
 * {
 *   pins: [{
 *     id, leadId, latitude, longitude, status,
 *     address, customerName, notes, createdAt,
 *     houseScore, houseScoreRank, scoreFactors
 *   }],
 *   total, center, radius
 * }
 */
router.get('/pins', async (req, res, next) => {
  try {
    const { lat, lng, radius, limit } = req.query;

    const result = await leadService.getScoredPins({
      latitude: lat ? parseFloat(lat) : undefined,
      longitude: lng ? parseFloat(lng) : undefined,
      radius: radius ? parseFloat(radius) : 5, // Default 5 miles
      limit: limit ? parseInt(limit) : 500,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// NOTE: /scoreboard and /my-pins routes are defined above in MOBILE APP section
// The /territory/:territoryId/pins route is also defined above

/**
 * GET /territory/:territoryId/pins
 * Get all map pins within a territory
 */
router.get('/territory/:territoryId/pins', async (req, res, next) => {
  try {
    const { territoryId } = req.params;

    const result = await leadService.getTerritoryPins(territoryId);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /:id/pin-status
 * Quick update pin status (for mobile map interactions)
 * Body: { status: 'NA' | 'NI' | 'NP' | 'GBL' | 'INFO' | 'SET' | 'JOB' | 'PROS' }
 */
router.patch('/:id/pin-status', async (req, res, next) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'status is required' },
      });
    }

    const result = await leadService.updatePinStatus(req.params.id, status, {
      userId: req.user?.id,
      userEmail: req.user?.email,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// CALL CENTER ENDPOINTS - Must come BEFORE /:id routes
// ============================================================================

/**
 * GET /call-center/leaderboard
 * Get call center agent leaderboard for leads set this month
 */
router.get('/call-center/leaderboard', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const result = await leadService.getCallCenterLeaderboard({ startDate, endDate });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /call-center/my-stats
 * Get current user's call center stats
 */
router.get('/call-center/my-stats', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { startDate, endDate } = req.query;
    const result = await leadService.getMyCallCenterStats(userId, { startDate, endDate });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /call-center/team-totals
 * Get team-wide call center totals
 */
router.get('/call-center/team-totals', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const result = await leadService.getCallCenterTeamTotals({ startDate, endDate });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /call-center/unconfirmed
 * Get unconfirmed leads (leads set but not yet confirmed/scheduled)
 */
router.get('/call-center/unconfirmed', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await leadService.getUnconfirmedLeads({
      page: parseInt(page),
      limit: parseInt(limit),
      currentUserId: req.user?.id,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /call-center/unscheduled
 * Get leads with tentative appointments but no scheduled service appointment
 */
router.get('/call-center/unscheduled', async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await leadService.getUnscheduledAppointments({
      page: parseInt(page),
      limit: parseInt(limit),
      currentUserId: req.user?.id,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// LIST & CRUD ROUTES
// ============================================================================

// List leads
router.get('/', validatePagination, handleValidation, async (req, res, next) => {
  try {
    // Parse ownerIds from comma-separated string for team/multi-owner filtering
    const ownerIds = req.query.ownerIds
      ? req.query.ownerIds.split(',').filter(id => id.trim())
      : [];

    const result = await leadService.getLeads({
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      status: req.query.status,
      ownerId: req.query.ownerId,
      ownerIds, // Support multiple owner IDs for team filtering
      ownerFilter: req.query.ownerFilter,
      source: req.query.source,
      leadSource: req.query.leadSource, // Alias for source
      disposition: req.query.disposition,
      workType: req.query.workType,
      search: req.query.search,
      sortBy: req.query.sortBy || 'createdAt',
      sortOrder: req.query.sortOrder || 'desc',
      currentUserId: req.user?.id,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Create lead
router.post('/', validateCreate, handleValidation, async (req, res, next) => {
  try {
    const lead = await leadService.createLead({
      ...req.body,
      ownerId: req.body.ownerId || req.user?.id,
      // Audit context
      _auditContext: {
        userId: req.user?.id,
        userEmail: req.user?.email,
        ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
        userAgent: req.headers['user-agent'],
      },
    });
    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DYNAMIC :id ROUTES - Must come AFTER static routes
// ============================================================================

// Get lead by ID
router.get('/:id', async (req, res, next) => {
  try {
    const lead = await leadService.getLeadById(req.params.id);
    res.json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
});

// Update lead
router.put('/:id', async (req, res, next) => {
  try {
    const lead = await leadService.updateLead(req.params.id, {
      ...req.body,
      _auditContext: {
        userId: req.user?.id,
        userEmail: req.user?.email,
        ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
        userAgent: req.headers['user-agent'],
      },
    });
    res.json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const lead = await leadService.updateLead(req.params.id, {
      ...req.body,
      _auditContext: {
        userId: req.user?.id,
        userEmail: req.user?.email,
        ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
        userAgent: req.headers['user-agent'],
      },
    });
    res.json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
});

// Convert lead
router.post('/:id/convert', async (req, res, next) => {
  try {
    const result = await leadService.convertLead(req.params.id, {
      accountName: req.body.accountName,
      opportunityName: req.body.opportunityName,
      opportunityType: req.body.opportunityType,
      closeDate: req.body.closeDate,
      createOpportunity: req.body.createOpportunity !== false,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Delete lead
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await leadService.deleteLead(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Get notes for a lead
router.get('/:id/notes', async (req, res, next) => {
  try {
    const notes = await leadService.getLeadNotes(req.params.id);
    res.json({ success: true, data: notes });
  } catch (error) {
    next(error);
  }
});

// Add a note to a lead
router.post('/:id/notes', async (req, res, next) => {
  try {
    const { note, title } = req.body;
    const result = await leadService.addLeadNote(req.params.id, {
      note,
      title,
      createdBy: req.user?.id,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// LEAD SCORING / INTELLIGENCE ENDPOINTS
// ============================================================================

/**
 * POST /scoring/score/:id
 * Score a single lead
 */
router.post('/scoring/score/:id', async (req, res, next) => {
  try {
    const { enrichDemographics = true, useML = false } = req.body;
    const result = await leadScoringService.scoreLead(req.params.id, {
      enrichDemographics,
      useML,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /scoring/batch
 * Score multiple leads
 * Body: { leadIds: string[], enrichDemographics?: boolean, useML?: boolean }
 */
router.post('/scoring/batch', async (req, res, next) => {
  try {
    const { leadIds, enrichDemographics = true, useML = false } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'leadIds array is required' },
      });
    }

    if (leadIds.length > 500) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Maximum 500 leads per batch' },
      });
    }

    const result = await leadScoringService.scoreLeadsBatch(leadIds, {
      enrichDemographics,
      useML,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /scoring/score-unscored
 * Score all leads that haven't been scored yet
 * Query: ?limit=100 (default 100, max 500)
 */
router.post('/scoring/score-unscored', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await leadScoringService.scoreUnscoredLeads(limit);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /scoring/stats
 * Get scoring statistics and distribution
 */
router.get('/scoring/stats', async (req, res, next) => {
  try {
    const stats = await leadScoringService.getScoringStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /scoring/rules
 * Get all active scoring rules
 */
router.get('/scoring/rules', async (req, res, next) => {
  try {
    const rules = await leadScoringService.getScoringRules();
    res.json({ success: true, data: rules });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /scoring/enrich/:id
 * Enrich a lead with Census demographic data (without full scoring)
 */
router.get('/scoring/enrich/:id', async (req, res, next) => {
  try {
    const lead = await leadService.getLeadById(req.params.id);
    if (!lead.postalCode) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Lead has no postal code for enrichment' },
      });
    }

    const enrichment = await leadScoringService.enrichWithCensusData(lead);
    if (enrichment) {
      await leadScoringService.updateLeadEnrichment(req.params.id, enrichment);
    }

    res.json({
      success: true,
      data: {
        leadId: req.params.id,
        enrichment,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Restore a soft-deleted lead
router.post('/:id/restore', async (req, res, next) => {
  try {
    const result = await leadService.restoreLead(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
