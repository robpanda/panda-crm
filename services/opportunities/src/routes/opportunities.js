// Opportunity Routes
import { Router } from 'express';
import { body, query } from 'express-validator';
import { opportunityService } from '../services/opportunityService.js';

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
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('accountId').notEmpty().withMessage('Account ID is required'),
  body('type').optional().isIn(['INSURANCE', 'RETAIL', 'COMMERCIAL']),
  body('stage').optional().isIn([
    'LEAD_UNASSIGNED', 'LEAD_ASSIGNED', 'SCHEDULED', 'INSPECTED',
    'CLAIM_FILED', 'APPROVED', 'CONTRACT_SIGNED', 'IN_PRODUCTION',
    'COMPLETED', 'CLOSED_WON', 'CLOSED_LOST',
  ]),
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 5000 }).toInt(),
  query('stage').optional(),
  query('type').optional().isIn(['all', 'INSURANCE', 'RETAIL', 'COMMERCIAL']),
  query('ownerFilter').optional().isIn(['mine', 'all']),
];

// ============================================================================
// STATIC ROUTES - Must come BEFORE /:id routes
// ============================================================================

// Get stage counts for dashboard
router.get('/counts', async (req, res, next) => {
  try {
    const counts = await opportunityService.getStageCounts(req.user?.id, req.query.ownerFilter);
    res.json({ success: true, data: counts });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// CALL CENTER ENDPOINTS - Must come BEFORE /:id routes
// ============================================================================

/**
 * GET /call-center/unscheduled
 * Returns opportunities that have been converted from leads but don't have
 * a scheduled service appointment yet (need to book appointment)
 */
router.get('/call-center/unscheduled', async (req, res, next) => {
  try {
    const { startDate, endDate, sortBy = 'tentativeAppointmentDate', sortOrder = 'asc' } = req.query;

    const result = await opportunityService.getUnscheduledAppointments({
      startDate,
      endDate,
      sortBy,
      sortOrder,
    });

    res.json({
      success: true,
      data: result.opportunities,
      pagination: {
        total: result.total,
        page: 1,
        limit: result.total,
        totalPages: 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SERVICE REQUEST ENDPOINTS - Must come BEFORE /:id routes
// Per Creating A Service Request SOP - service requests live on jobs (opportunities)
// ============================================================================

/**
 * GET /service-requests
 * Get all opportunities with active service requests
 */
router.get('/service-requests', async (req, res, next) => {
  try {
    const result = await opportunityService.getServiceRequests({
      status: req.query.status, // 'pending', 'complete', 'all'
      projectManagerId: req.query.projectManagerId,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// LIST & CREATE ROUTES
// ============================================================================

// List opportunities
router.get('/', validatePagination, handleValidation, async (req, res, next) => {
  try {
    const result = await opportunityService.getOpportunities({
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      stage: req.query.stage,
      type: req.query.type,
      ownerId: req.query.ownerId,
      ownerFilter: req.query.ownerFilter,
      accountId: req.query.accountId,
      search: req.query.search,
      sortBy: req.query.sortBy || 'createdAt',
      sortOrder: req.query.sortOrder || 'desc',
      currentUserId: req.user?.id,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Create opportunity
router.post('/', validateCreate, handleValidation, async (req, res, next) => {
  try {
    const opportunity = await opportunityService.createOpportunity({
      ...req.body,
      ownerId: req.body.ownerId || req.user?.id,
    });
    res.status(201).json({ success: true, data: opportunity });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// DYNAMIC :id ROUTES - Must come AFTER static routes
// ============================================================================

// Get opportunity details (HUB view)
router.get('/:id', async (req, res, next) => {
  try {
    const opportunity = await opportunityService.getOpportunityDetails(req.params.id);
    res.json({ success: true, data: opportunity });
  } catch (error) {
    next(error);
  }
});

// Get work orders and service appointments
router.get('/:id/work-orders', async (req, res, next) => {
  try {
    const workOrders = await opportunityService.getOpportunityWorkOrders(req.params.id);
    res.json({ success: true, data: workOrders });
  } catch (error) {
    next(error);
  }
});

// Get quotes
router.get('/:id/quotes', async (req, res, next) => {
  try {
    const quotes = await opportunityService.getOpportunityQuotes(req.params.id);
    res.json({ success: true, data: quotes });
  } catch (error) {
    next(error);
  }
});

// Get contacts
router.get('/:id/contacts', async (req, res, next) => {
  try {
    const contacts = await opportunityService.getOpportunityContacts(req.params.id);
    res.json({ success: true, data: contacts });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// OPPORTUNITY HUB ENDPOINTS
// These endpoints power the Opportunity Hub view - the central project dashboard
// ============================================================================

// Get hub summary - overview of all related records with counts
router.get('/:id/summary', async (req, res, next) => {
  try {
    const summary = await opportunityService.getOpportunitySummary(req.params.id);
    res.json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
});

// Get service appointments (via WorkOrders)
router.get('/:id/appointments', async (req, res, next) => {
  try {
    const appointments = await opportunityService.getOpportunityAppointments(req.params.id);
    res.json({ success: true, data: appointments });
  } catch (error) {
    next(error);
  }
});

// Get service contract
router.get('/:id/contract', async (req, res, next) => {
  try {
    const contract = await opportunityService.getOpportunityContract(req.params.id);
    res.json({ success: true, data: contract });
  } catch (error) {
    next(error);
  }
});

// Get invoices and payments
router.get('/:id/invoices', async (req, res, next) => {
  try {
    const invoices = await opportunityService.getOpportunityInvoices(req.params.id);
    res.json({ success: true, data: invoices });
  } catch (error) {
    next(error);
  }
});

// Get commissions
router.get('/:id/commissions', async (req, res, next) => {
  try {
    const commissions = await opportunityService.getOpportunityCommissions(req.params.id);
    res.json({ success: true, data: commissions });
  } catch (error) {
    next(error);
  }
});

// Get unified activity timeline (notes, tasks, events)
router.get('/:id/activity', async (req, res, next) => {
  try {
    const activity = await opportunityService.getOpportunityActivity(req.params.id, {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      type: req.query.type, // 'note', 'task', or undefined for all
    });
    res.json({ success: true, data: activity });
  } catch (error) {
    next(error);
  }
});

// Get documents/agreements
router.get('/:id/documents', async (req, res, next) => {
  try {
    const documents = await opportunityService.getOpportunityDocuments(req.params.id);
    res.json({ success: true, data: documents });
  } catch (error) {
    next(error);
  }
});

// Update opportunity
router.put('/:id', async (req, res, next) => {
  try {
    const opportunity = await opportunityService.updateOpportunity(req.params.id, req.body);
    res.json({ success: true, data: opportunity });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const opportunity = await opportunityService.updateOpportunity(req.params.id, req.body);
    res.json({ success: true, data: opportunity });
  } catch (error) {
    next(error);
  }
});

// Delete opportunity
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await opportunityService.deleteOpportunity(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// APPOINTMENT MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * POST /:id/appointments/book
 * Book a service appointment for an opportunity
 */
router.post('/:id/appointments/book', async (req, res, next) => {
  try {
    const { scheduledStart, scheduledEnd, workTypeId, notes } = req.body;
    const result = await opportunityService.bookAppointment(req.params.id, {
      scheduledStart,
      scheduledEnd,
      workTypeId,
      notes,
      bookedBy: req.user?.id,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /:id/appointments/:appointmentId/reschedule
 * Reschedule an existing appointment
 */
router.put('/:id/appointments/:appointmentId/reschedule', async (req, res, next) => {
  try {
    const { scheduledStart, scheduledEnd, notes } = req.body;
    const result = await opportunityService.rescheduleAppointment(
      req.params.id,
      req.params.appointmentId,
      { scheduledStart, scheduledEnd, notes, rescheduledBy: req.user?.id }
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /:id/appointments/:appointmentId/cancel
 * Cancel an existing appointment
 */
router.post('/:id/appointments/:appointmentId/cancel', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await opportunityService.cancelAppointment(
      req.params.id,
      req.params.appointmentId,
      { reason, cancelledBy: req.user?.id }
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /:id/messages
 * Add a job message/note to an opportunity
 */
router.post('/:id/messages', async (req, res, next) => {
  try {
    const { message } = req.body;
    const result = await opportunityService.addJobMessage(req.params.id, {
      message,
      createdBy: req.user?.id,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// SERVICE REQUEST ENDPOINTS (on specific opportunity)
// ============================================================================

/**
 * POST /:id/service-request
 * Create a service request on an opportunity
 */
router.post('/:id/service-request', async (req, res, next) => {
  try {
    const { projectManagerId, serviceNotes } = req.body;
    const result = await opportunityService.createServiceRequest(req.params.id, {
      projectManagerId,
      serviceNotes,
      createdBy: req.user?.id,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /:id/service-request
 * Update a service request on an opportunity
 */
router.put('/:id/service-request', async (req, res, next) => {
  try {
    const { serviceComplete, serviceNotes, projectManagerId } = req.body;
    const result = await opportunityService.updateServiceRequest(req.params.id, {
      serviceComplete,
      serviceNotes,
      projectManagerId,
      updatedBy: req.user?.id,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /:id/service-request/complete
 * Mark a service request as complete
 */
router.post('/:id/service-request/complete', async (req, res, next) => {
  try {
    const { notes } = req.body;
    const result = await opportunityService.completeServiceRequest(req.params.id, {
      notes,
      completedBy: req.user?.id,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
