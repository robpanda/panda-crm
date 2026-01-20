// Approval Workflow Routes
import express from 'express';
import { approvalService } from '../services/approvalService.js';

const router = express.Router();

// ============================================================================
// APPROVAL REQUESTS
// ============================================================================

/**
 * GET /api/workflows/approvals
 * Get approval requests with filters
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      status,
      type,
      requesterId,
      approverId,
      opportunityId,
      includeExpired,
      page = 1,
      limit = 20,
    } = req.query;

    const result = await approvalService.getApprovalRequests({
      status,
      type,
      requesterId,
      approverId,
      opportunityId,
      includeExpired: includeExpired === 'true',
      page: parseInt(page),
      limit: parseInt(limit),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/workflows/approvals/pending
 * Get approvals pending for the current user
 */
router.get('/pending', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER', message: 'User ID is required' },
      });
    }

    const result = await approvalService.getPendingForApprover(userId, {
      page: parseInt(req.query.page || 1),
      limit: parseInt(req.query.limit || 20),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/workflows/approvals/submitted
 * Get approvals submitted by the current user
 */
router.get('/submitted', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER', message: 'User ID is required' },
      });
    }

    const result = await approvalService.getSubmittedByUser(userId, {
      page: parseInt(req.query.page || 1),
      limit: parseInt(req.query.limit || 20),
    });

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/workflows/approvals/stats
 * Get approval statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const userId = req.query.userId;
    const stats = await approvalService.getApprovalStats(userId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/workflows/approvals/:id
 * Get a specific approval request
 */
router.get('/:id', async (req, res, next) => {
  try {
    const approvalRequest = await approvalService.getApprovalRequestById(req.params.id);

    if (!approvalRequest) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Approval request not found' },
      });
    }

    res.json({
      success: true,
      data: approvalRequest,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/workflows/approvals
 * Create a new approval request
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      type,
      subject,
      description,
      requesterId,
      requestedValue,
      originalValue,
      discountType,
      discountPercent,
      discountAmount,
      opportunityId,
      quoteId,
      commissionId,
      orderId,
      dueDate,
      metadata,
    } = req.body;

    // Validation
    if (!type || !subject || !requesterId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'type, subject, and requesterId are required',
        },
      });
    }

    const approvalRequest = await approvalService.createApprovalRequest({
      type,
      subject,
      description,
      requesterId,
      requestedValue: requestedValue ? parseFloat(requestedValue) : null,
      originalValue: originalValue ? parseFloat(originalValue) : null,
      discountType,
      discountPercent: discountPercent ? parseFloat(discountPercent) : null,
      discountAmount: discountAmount ? parseFloat(discountAmount) : null,
      opportunityId,
      quoteId,
      commissionId,
      orderId,
      dueDate: dueDate ? new Date(dueDate) : null,
      metadata,
    });

    res.status(201).json({
      success: true,
      data: approvalRequest,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/workflows/approvals/:id/decide
 * Submit a decision on an approval request
 */
router.post('/:id/decide', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { decision, decisionReason, decisionNotes } = req.body;
    const decidedById = req.headers['x-user-id'] || req.body.decidedById;

    if (!decision) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'decision is required' },
      });
    }

    if (!decidedById) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER', message: 'User ID is required' },
      });
    }

    const validDecisions = ['APPROVE', 'REJECT', 'REQUEST_CHANGES', 'DELEGATE'];
    if (!validDecisions.includes(decision)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DECISION',
          message: `Decision must be one of: ${validDecisions.join(', ')}`,
        },
      });
    }

    const result = await approvalService.processDecision(id, {
      decision,
      decisionReason,
      decisionNotes,
      decidedById,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('Cannot process')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: error.message },
      });
    }
    next(error);
  }
});

/**
 * POST /api/workflows/approvals/:id/comments
 * Add a comment to an approval request
 */
router.post('/:id/comments', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, isInternal } = req.body;
    const authorId = req.headers['x-user-id'] || req.body.authorId;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'content is required' },
      });
    }

    if (!authorId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER', message: 'User ID is required' },
      });
    }

    const comment = await approvalService.addComment(id, {
      content,
      authorId,
      isInternal: isInternal === true,
    });

    res.status(201).json({
      success: true,
      data: comment,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/workflows/approvals/:id/cancel
 * Cancel an approval request
 */
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const { id } = req.params;
    const requesterId = req.headers['x-user-id'] || req.body.requesterId;

    if (!requesterId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER', message: 'User ID is required' },
      });
    }

    const result = await approvalService.cancelRequest(id, requesterId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('Only the requester')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: error.message },
      });
    }
    next(error);
  }
});

/**
 * POST /api/workflows/approvals/:id/escalate
 * Escalate an approval request
 */
router.post('/:id/escalate', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { escalateToId, escalationReason } = req.body;
    const escalatedById = req.headers['x-user-id'] || req.body.escalatedById;

    if (!escalatedById) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER', message: 'User ID is required' },
      });
    }

    const result = await approvalService.escalateRequest(id, {
      escalateToId,
      escalationReason,
      escalatedById,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('No escalation')) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: error.message },
      });
    }
    next(error);
  }
});

// ============================================================================
// APPROVAL RULES (Admin)
// ============================================================================

/**
 * GET /api/workflows/approvals/rules
 * Get all approval rules
 */
router.get('/rules/list', async (req, res, next) => {
  try {
    const activeOnly = req.query.active === 'true';
    const rules = await approvalService.getApprovalRules(activeOnly);

    res.json({
      success: true,
      data: rules,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/workflows/approvals/rules
 * Create a new approval rule
 */
router.post('/rules', async (req, res, next) => {
  try {
    const {
      name,
      description,
      type,
      minAmount,
      maxAmount,
      minDiscountPercent,
      approverRoles,
      approverIds,
      requireAllApprovers,
      escalationHours,
      escalateToId,
      priority,
    } = req.body;

    if (!name || !type) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'name and type are required' },
      });
    }

    const rule = await approvalService.createApprovalRule({
      name,
      description,
      type,
      minAmount: minAmount ? parseFloat(minAmount) : null,
      maxAmount: maxAmount ? parseFloat(maxAmount) : null,
      minDiscountPercent: minDiscountPercent ? parseFloat(minDiscountPercent) : null,
      approverRoles: approverRoles || [],
      approverIds: approverIds || [],
      requireAllApprovers: requireAllApprovers === true,
      escalationHours: escalationHours ? parseInt(escalationHours) : null,
      escalateToId,
      priority: priority ? parseInt(priority) : 0,
    });

    res.status(201).json({
      success: true,
      data: rule,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/workflows/approvals/rules/:id
 * Update an approval rule
 */
router.put('/rules/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Parse numeric fields
    if (updateData.minAmount) updateData.minAmount = parseFloat(updateData.minAmount);
    if (updateData.maxAmount) updateData.maxAmount = parseFloat(updateData.maxAmount);
    if (updateData.minDiscountPercent) updateData.minDiscountPercent = parseFloat(updateData.minDiscountPercent);
    if (updateData.escalationHours) updateData.escalationHours = parseInt(updateData.escalationHours);
    if (updateData.priority) updateData.priority = parseInt(updateData.priority);

    const rule = await approvalService.updateApprovalRule(id, updateData);

    res.json({
      success: true,
      data: rule,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/workflows/approvals/rules/:id
 * Delete an approval rule
 */
router.delete('/rules/:id', async (req, res, next) => {
  try {
    await approvalService.deleteApprovalRule(req.params.id);

    res.json({
      success: true,
      message: 'Rule deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
