// Lead Routes
import { Router } from 'express';
import { body, query } from 'express-validator';
import { leadService } from '../services/leadService.js';

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
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['all', 'NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'NURTURING']),
  query('ownerFilter').optional().isIn(['mine', 'all']),
];

// ============================================================================
// STATIC ROUTES - Must come BEFORE /:id routes
// ============================================================================

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
    const counts = await leadService.getLeadCounts(req.user?.id);
    res.json({ success: true, data: counts });
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
    const result = await leadService.getLeads({
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      status: req.query.status,
      ownerId: req.query.ownerId,
      ownerFilter: req.query.ownerFilter,
      source: req.query.source,
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
    const lead = await leadService.updateLead(req.params.id, req.body);
    res.json({ success: true, data: lead });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const lead = await leadService.updateLead(req.params.id, req.body);
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

export default router;
