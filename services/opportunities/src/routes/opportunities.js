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
  query('invoiceStatus').optional().isIn(['all', 'NOT_READY', 'READY', 'INVOICED', 'FOLLOW_UP_SCHEDULED', 'PAID']),
];

// ============================================================================
// STATIC ROUTES - Must come BEFORE /:id routes
// ============================================================================

// Admin: Get deleted opportunities (for restore page) - must be before /:id
router.get('/deleted', async (req, res, next) => {
  try {
    const result = await opportunityService.getDeletedOpportunities({
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      search: req.query.search,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Get stage counts for dashboard
router.get('/counts', async (req, res, next) => {
  try {
    // Parse ownerIds if provided (comma-separated string)
    const ownerIds = req.query.ownerIds
      ? req.query.ownerIds.split(',').filter(id => id.trim())
      : [];
    // If single ownerId is provided, convert to array
    if (req.query.ownerId && !ownerIds.length) {
      ownerIds.push(req.query.ownerId);
    }
    const counts = await opportunityService.getStageCounts(req.user?.id, req.query.ownerFilter, ownerIds);
    res.json({ success: true, data: counts });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// BULK REASSIGNMENT ENDPOINTS - Contact Center feature
// ============================================================================

/**
 * GET /assignable-users
 * Get list of users who can be assigned as job owners
 */
router.get('/assignable-users', async (req, res, next) => {
  try {
    const users = await opportunityService.getAssignableUsers();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /bulk-reassign
 * Bulk reassign multiple jobs to a new owner
 * Body: { opportunityIds: string[], newOwnerId: string }
 */
router.post('/bulk-reassign', async (req, res, next) => {
  try {
    const { opportunityIds, newOwnerId } = req.body;
    const result = await opportunityService.bulkReassignJobs(opportunityIds, newOwnerId, {
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
 * POST /bulk-update-stage
 * Bulk update stage for multiple opportunities
 * Body: { opportunityIds: string[], stage: string }
 */
router.post('/bulk-update-stage', async (req, res, next) => {
  try {
    const { opportunityIds, stage } = req.body;
    if (!opportunityIds || !Array.isArray(opportunityIds) || opportunityIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityIds array is required' },
      });
    }
    if (!stage) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'stage is required' },
      });
    }
    const result = await opportunityService.bulkUpdateStage(opportunityIds, stage, {
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
 * Bulk delete (soft delete) multiple opportunities
 * Body: { opportunityIds: string[] }
 */
router.post('/bulk-delete', async (req, res, next) => {
  try {
    const { opportunityIds } = req.body;
    if (!opportunityIds || !Array.isArray(opportunityIds) || opportunityIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityIds array is required' },
      });
    }
    const result = await opportunityService.bulkDeleteOpportunities(opportunityIds, {
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
// JOB APPROVAL ENDPOINTS - PandaClaims Unapproved Jobs Workflow
// Must come BEFORE /:id routes
// ============================================================================

/**
 * GET /unapproved
 * Get list of unapproved jobs for the unapproved jobs dashboard
 * Supports filtering by owner, stage, and search
 */
router.get('/unapproved', async (req, res, next) => {
  try {
    const result = await opportunityService.getUnapprovedJobs({
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      ownerId: req.query.ownerId,
      ownerFilter: req.query.ownerFilter || 'all',
      stage: req.query.stage,
      search: req.query.search,
      sortBy: req.query.sortBy || 'createdAt',
      sortOrder: req.query.sortOrder || 'desc',
      userId: req.user?.id,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /unapproved/stats
 * Get statistics for unapproved jobs dashboard
 */
router.get('/unapproved/stats', async (req, res, next) => {
  try {
    const stats = await opportunityService.getUnapprovedJobsStats(req.user?.id, req.query.ownerFilter);
    res.json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// PROJECT EXPEDITING ROUTES
// ============================================================================

/**
 * GET /expediting-queue
 * Get jobs ready for project expediting (onboarding complete but expediting not started)
 */
router.get('/expediting-queue', async (req, res, next) => {
  try {
    const { status = 'not-started', page = 1, limit = 50 } = req.query;

    // Build filter based on status
    let whereClause = {
      onboardingCompleteDate: { not: null }, // Must have completed onboarding
      deletedAt: null,
    };

    if (status === 'not-started') {
      whereClause.projectExpeditingStartDate = null;
    } else if (status === 'in-progress') {
      whereClause.projectExpeditingStartDate = { not: null };
      // Add condition for expediting not complete (you might want a completedDate field)
    } else if (status === 'complete') {
      // Filter for completed expediting
      whereClause.projectExpeditingStartDate = { not: null };
    }

    const result = await opportunityService.getOpportunities({
      page: parseInt(page),
      limit: parseInt(limit),
      where: whereClause,
      currentUserId: req.user?.id,
      sortBy: 'onboardingCompleteDate',
      sortOrder: 'desc',
    });

    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /expediting-stats
 * Get statistics for project expediting dashboard
 */
router.get('/expediting-stats', async (req, res, next) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const [notStarted, inProgress, total] = await Promise.all([
      // Not started: onboarding complete but no expediting start date
      prisma.opportunity.count({
        where: {
          onboardingCompleteDate: { not: null },
          projectExpeditingStartDate: null,
          deletedAt: null,
        },
      }),
      // In progress: has expediting start date
      prisma.opportunity.count({
        where: {
          projectExpeditingStartDate: { not: null },
          deletedAt: null,
        },
      }),
      // Total with completed onboarding
      prisma.opportunity.count({
        where: {
          onboardingCompleteDate: { not: null },
          deletedAt: null,
        },
      }),
    ]);

    await prisma.$disconnect();

    res.json({
      success: true,
      data: {
        notStarted,
        inProgress,
        total,
        readyForExpediting: notStarted,
      },
    });
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
      invoiceStatus: req.query.invoiceStatus, // Filter for Finance team "Invoice Ready" view
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

// Assign Job ID to opportunity (POST /:id/assign-job-id)
router.post('/:id/assign-job-id', async (req, res, next) => {
  try {
    const result = await opportunityService.assignJobId(req.params.id);
    res.json({ success: true, ...result });
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

// Generate AI summary for activity/message content
router.post('/:id/activity/summarize', async (req, res, next) => {
  try {
    const { content, activityId } = req.body;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }
    const summary = await opportunityService.generateActivitySummary(content, activityId);
    res.json({ success: true, data: { summary } });
  } catch (error) {
    next(error);
  }
});

// Generate AI summary for entire conversation
router.post('/:id/conversation/summarize', async (req, res, next) => {
  try {
    const summary = await opportunityService.generateConversationSummary(req.params.id);
    res.json({ success: true, data: { summary } });
  } catch (error) {
    next(error);
  }
});

// Add reply with @mentions (creates note and sends notifications)
router.post('/:id/replies', async (req, res, next) => {
  try {
    const { content, parentId, mentions, channel } = req.body;
    if (!content && (!mentions || mentions.length === 0)) {
      return res.status(400).json({ success: false, error: 'Content or mentions required' });
    }
    const reply = await opportunityService.addReplyWithMentions(
      req.params.id,
      { content, parentId, mentions, channel },
      req.user
    );
    res.json({ success: true, data: reply });
  } catch (error) {
    next(error);
  }
});

// Get threaded conversation
router.get('/:id/conversation/threaded', async (req, res, next) => {
  try {
    const threaded = await opportunityService.getThreadedConversation(req.params.id);
    res.json({ success: true, data: threaded });
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

// ============================================================================
// SPECS PREPARATION ENDPOINTS
// ============================================================================

/**
 * POST /:id/specs/complete
 * Mark specs preparation as complete and trigger workflow
 * Creates WorkOrderLineItem and Contract Signing appointment
 */
router.post('/:id/specs/complete', async (req, res, next) => {
  try {
    const { specsData } = req.body;
    const opportunityId = req.params.id;
    const userId = req.user?.id;

    // Map selectedTrades array to individual trade checkbox fields
    const selectedTrades = specsData?.selectedTrades || [];
    const tradeFields = {
      roofingTrade: selectedTrades.includes('roofing'),
      guttersTrade: selectedTrades.includes('gutters'),
      sidingTrade: selectedTrades.includes('siding'),
      trimCappingTrade: selectedTrades.includes('trim_capping'),
      solarTrade: selectedTrades.includes('solar'),
      skylightTrade: selectedTrades.includes('skylight'),
      interiorTrade: selectedTrades.includes('interior'),
      insulationTrade: selectedTrades.includes('insulation'),
      timbersteelTrade: selectedTrades.includes('timbersteel'),
    };

    // Update opportunity with specs data and trade checkboxes
    const opportunity = await opportunityService.updateOpportunity(opportunityId, {
      specsPrepped: true,
      specsPrepDate: new Date(),
      specsData: specsData ? JSON.stringify(specsData) : null,
      status: 'Specs Prepped',
      ...tradeFields, // Set individual trade checkbox fields
    });

    // Call workflows service to trigger automations
    const WORKFLOWS_SERVICE_URL = process.env.WORKFLOWS_SERVICE_URL || 'http://localhost:3008';

    try {
      const triggerResponse = await fetch(`${WORKFLOWS_SERVICE_URL}/api/triggers/specs/prepped`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityId,
          specsData,
          userId,
        }),
      });

      if (triggerResponse.ok) {
        const triggerResult = await triggerResponse.json();
        res.json({
          success: true,
          data: {
            opportunity,
            workflowResults: triggerResult.data,
          },
        });
      } else {
        // Workflow trigger failed but specs were saved
        console.warn('Specs workflow trigger failed:', await triggerResponse.text());
        res.json({
          success: true,
          data: {
            opportunity,
            workflowResults: null,
            warning: 'Specs saved but workflow trigger failed',
          },
        });
      }
    } catch (workflowError) {
      // Workflow service unavailable but specs were saved
      console.warn('Specs workflow service unavailable:', workflowError.message);
      res.json({
        success: true,
        data: {
          opportunity,
          workflowResults: null,
          warning: 'Specs saved but workflow service unavailable',
        },
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * GET /:id/specs
 * Get specs data for an opportunity
 */
router.get('/:id/specs', async (req, res, next) => {
  try {
    const opportunity = await opportunityService.getOpportunityById(req.params.id);

    if (!opportunity) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Opportunity not found' },
      });
    }

    let specsData = null;
    try {
      if (opportunity.specsData) {
        specsData = JSON.parse(opportunity.specsData);
      }
    } catch (e) {
      specsData = opportunity.specsData;
    }

    res.json({
      success: true,
      data: {
        specsPrepped: opportunity.specsPrepped,
        specsPrepDate: opportunity.specsPrepDate,
        specsData,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Restore a soft-deleted opportunity
router.post('/:id/restore', async (req, res, next) => {
  try {
    const result = await opportunityService.restoreOpportunity(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// INVOICE WORKFLOW ENDPOINTS
// For Finance team to manage invoice status on opportunities
// ============================================================================

/**
 * PUT /:id/invoice-status
 * Update the invoice workflow status on an opportunity
 * Body: { invoiceStatus: 'READY' | 'INVOICED' | 'FOLLOW_UP_SCHEDULED' | 'PAID', followUpDate?: string }
 */
router.put('/:id/invoice-status', async (req, res, next) => {
  try {
    const { invoiceStatus, followUpDate } = req.body;

    if (!invoiceStatus) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'invoiceStatus is required' },
      });
    }

    const validStatuses = ['NOT_READY', 'READY', 'INVOICED', 'FOLLOW_UP_SCHEDULED', 'PAID'];
    if (!validStatuses.includes(invoiceStatus)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: `invoiceStatus must be one of: ${validStatuses.join(', ')}` },
      });
    }

    // Build update data based on the status
    const updateData = { invoiceStatus };

    if (invoiceStatus === 'READY' && !followUpDate) {
      updateData.invoiceReadyDate = new Date();
    } else if (invoiceStatus === 'INVOICED') {
      updateData.invoicedDate = new Date();
    } else if (invoiceStatus === 'FOLLOW_UP_SCHEDULED' && followUpDate) {
      updateData.followUpDate = new Date(followUpDate);
    }

    const result = await opportunityService.updateOpportunity(req.params.id, updateData, req.user?.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /:id/mark-invoice-ready
 * Quick action to mark a job as invoice ready
 */
router.post('/:id/mark-invoice-ready', async (req, res, next) => {
  try {
    const result = await opportunityService.updateOpportunity(req.params.id, {
      invoiceStatus: 'READY',
      invoiceReadyDate: new Date(),
    }, req.user?.id);
    res.json({ success: true, data: result, message: 'Job marked as invoice ready' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// NOTES ENDPOINTS
// ============================================================================

/**
 * GET /:id/notes
 * Get all notes for an opportunity with pinned note first
 */
router.get('/:id/notes', async (req, res, next) => {
  try {
    const notes = await opportunityService.getOpportunityNotes(req.params.id);
    res.json({ success: true, data: notes });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /:id/notes
 * Create a new note for an opportunity
 */
router.post('/:id/notes', async (req, res, next) => {
  try {
    const { title, body, isPinned } = req.body;
    if (!body || body.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Note body is required' },
      });
    }
    const note = await opportunityService.createOpportunityNote(req.params.id, {
      title,
      body,
      isPinned: isPinned || false,
      createdById: req.user?.id,
    });
    res.status(201).json({ success: true, data: note });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /:id/notes/:noteId
 * Update a note
 */
router.put('/:id/notes/:noteId', async (req, res, next) => {
  try {
    const { title, body, isPinned } = req.body;
    const note = await opportunityService.updateOpportunityNote(req.params.noteId, {
      title,
      body,
      isPinned,
    });
    res.json({ success: true, data: note });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /:id/notes/:noteId
 * Delete a note
 */
router.delete('/:id/notes/:noteId', async (req, res, next) => {
  try {
    await opportunityService.deleteOpportunityNote(req.params.noteId);
    res.json({ success: true, message: 'Note deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /:id/notes/:noteId/pin
 * Pin/unpin a note (only one pinned note allowed per opportunity)
 */
router.post('/:id/notes/:noteId/pin', async (req, res, next) => {
  try {
    const note = await opportunityService.togglePinNote(req.params.id, req.params.noteId);
    res.json({ success: true, data: note });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// JOB APPROVAL ACTIONS - /:id based routes
// ============================================================================

/**
 * POST /:id/request-approval
 * Submit a job for approval - creates an approval request
 * Body: { reason?: string, priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' }
 */
router.post('/:id/request-approval', async (req, res, next) => {
  try {
    const { reason, priority } = req.body;
    const result = await opportunityService.requestJobApproval(
      req.params.id,
      req.user?.id,
      { reason, priority }
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /:id/approve
 * Approve a job - marks isApproved = true and closes any pending approval requests
 * Body: { reason?: string }
 */
router.post('/:id/approve', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const result = await opportunityService.approveJob(
      req.params.id,
      req.user?.id,
      reason
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /:id/reject-approval
 * Reject a job approval - keeps isApproved = false and marks approval request as rejected
 * Body: { reason: string }
 */
router.post('/:id/reject-approval', async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Rejection reason is required' },
      });
    }
    const result = await opportunityService.rejectJobApproval(
      req.params.id,
      req.user?.id,
      reason
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /:id/start-expediting
 * Start project expediting for an opportunity
 * Body: { projectExpeditorId?: string }
 */
router.post('/:id/start-expediting', async (req, res, next) => {
  try {
    const { projectExpeditorId } = req.body;
    const result = await opportunityService.updateOpportunity(
      req.params.id,
      {
        projectExpeditingStartDate: new Date().toISOString(),
        projectExpeditorId: projectExpeditorId || req.user?.id,
      },
      req.user?.id
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /:id/expediting
 * Update project expediting fields for an opportunity
 * Body: expediting fields (flatRoof, lineDrop, supplementRequired, etc.)
 */
router.patch('/:id/expediting', async (req, res, next) => {
  try {
    const allowedFields = [
      'projectExpeditingStartDate',
      'projectExpeditorId',
      'projectExpeditorNotes',
      'vetoInstallNotReady',
      'jobComplexityPhotosReviewed',
      'jobComplexityNotes',
      'flatRoof',
      'lineDrop',
      'supplementRequired',
      'supplementHoldsJob',
      // Also allow updating onboarding fields during expediting
      'hoaRequired',
      'hoaApproved',
      'permitRequired',
      'permitObtained',
      'piiComplete',
      'changeOrderSigned',
      'solarDnrRequired',
      'notInstallReady',
      'notInstallReadyNotes',
    ];

    // Filter to only allowed fields
    const updateData = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No valid expediting fields provided' },
      });
    }

    const result = await opportunityService.updateOpportunity(
      req.params.id,
      updateData,
      req.user?.id
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /:id/approval-history
 * Get approval history for a job including all approval requests and decisions
 */
router.get('/:id/approval-history', async (req, res, next) => {
  try {
    const history = await opportunityService.getJobApprovalHistory(req.params.id);
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /:id/related-cases
 * Get cases related to this job for context during approval review
 */
router.get('/:id/related-cases', async (req, res, next) => {
  try {
    const cases = await opportunityService.getRelatedCases(req.params.id);
    res.json({ success: true, data: cases });
  } catch (error) {
    next(error);
  }
});

export default router;
