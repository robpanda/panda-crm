// Attention Queue Routes
import express from 'express';
import { attentionService } from '../services/attentionService.js';

const router = express.Router();

// ============================================================================
// ATTENTION ITEMS
// ============================================================================

/**
 * GET /api/attention
 * Get attention items with filters
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || req.query.userId;
    const {
      status,
      type,
      category,
      urgency,
      priority,
      opportunityId,
      accountId,
      includeCompleted,
      includeDismissed,
      includeSnoozed,
      page = 1,
      limit = 50,
      sortBy = 'urgency',
      sortOrder = 'desc',
    } = req.query;

    const result = await attentionService.getAttentionItems({
      userId: req.query.all === 'true' ? null : userId,
      status,
      type,
      category,
      urgency,
      priority,
      opportunityId,
      accountId,
      includeCompleted: includeCompleted === 'true',
      includeDismissed: includeDismissed === 'true',
      includeSnoozed: includeSnoozed !== 'false',
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
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
 * GET /api/attention/stats
 * Get attention queue statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const userId = req.query.all === 'true' ? null : (req.headers['x-user-id'] || req.query.userId);
    const stats = await attentionService.getStats(userId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/attention/refresh
 * Refresh the attention queue by running all generators
 */
router.post('/refresh', async (req, res, next) => {
  try {
    const result = await attentionService.refreshQueue();

    res.json({
      success: true,
      message: `Created ${result.created} attention items`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/attention/cleanup
 * Clean up old completed/dismissed items
 */
router.post('/cleanup', async (req, res, next) => {
  try {
    const { olderThanDays = 30 } = req.body;
    const count = await attentionService.cleanupOldItems(parseInt(olderThanDays));

    res.json({
      success: true,
      message: `Cleaned up ${count} old items`,
      data: { deleted: count },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/attention/:id
 * Get a specific attention item
 */
router.get('/:id', async (req, res, next) => {
  try {
    const item = await attentionService.getAttentionItemById(req.params.id);

    if (!item) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Attention item not found' },
      });
    }

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/attention
 * Create a new attention item (manual creation)
 */
router.post('/', async (req, res, next) => {
  try {
    const {
      title,
      description,
      type,
      category,
      priority,
      urgency,
      sourceType,
      sourceId,
      opportunityId,
      accountId,
      contactId,
      leadId,
      workOrderId,
      quoteId,
      invoiceId,
      caseId,
      assignedToId,
      dueDate,
      actionType,
      actionUrl,
    } = req.body;

    if (!title || !type || !sourceType) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'title, type, and sourceType are required',
        },
      });
    }

    const item = await attentionService.createAttentionItem({
      title,
      description,
      type,
      category: category || 'TASK',
      priority: priority || 'NORMAL',
      urgency: urgency || 'MEDIUM',
      sourceType,
      sourceId,
      opportunityId,
      accountId,
      contactId,
      leadId,
      workOrderId,
      quoteId,
      invoiceId,
      caseId,
      assignedToId: assignedToId || req.headers['x-user-id'],
      dueDate: dueDate ? new Date(dueDate) : null,
      actionType,
      actionUrl,
    });

    res.status(201).json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/attention/:id
 * Update an attention item
 */
router.put('/:id', async (req, res, next) => {
  try {
    const item = await attentionService.updateAttentionItem(req.params.id, req.body);

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/attention/:id
 * Delete an attention item
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await attentionService.deleteAttentionItem(req.params.id);

    res.json({
      success: true,
      message: 'Item deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ACTIONS
// ============================================================================

/**
 * POST /api/attention/:id/complete
 * Mark an attention item as complete
 */
router.post('/:id/complete', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || req.body.userId;
    const item = await attentionService.completeItem(req.params.id, userId);

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/attention/:id/dismiss
 * Dismiss an attention item
 */
router.post('/:id/dismiss', async (req, res, next) => {
  try {
    const userId = req.headers['x-user-id'] || req.body.userId;
    const { reason } = req.body;
    const item = await attentionService.dismissItem(req.params.id, userId, reason);

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/attention/:id/snooze
 * Snooze an attention item
 */
router.post('/:id/snooze', async (req, res, next) => {
  try {
    const { duration = '1d' } = req.body; // 1h, 4h, 1d, 3d, 1w, or Date
    const item = await attentionService.snoozeItem(req.params.id, duration);

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/attention/:id/assign
 * Assign an attention item to a user
 */
router.post('/:id/assign', async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'userId is required' },
      });
    }

    const item = await attentionService.assignItem(req.params.id, userId);

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/attention/:id/start
 * Mark an attention item as in progress
 */
router.post('/:id/start', async (req, res, next) => {
  try {
    const item = await attentionService.startItem(req.params.id);

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// BULK ACTIONS
// ============================================================================

/**
 * POST /api/attention/bulk/complete
 * Complete multiple items
 */
router.post('/bulk/complete', async (req, res, next) => {
  try {
    const { ids } = req.body;
    const userId = req.headers['x-user-id'] || req.body.userId;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'ids array is required' },
      });
    }

    const results = await Promise.all(
      ids.map((id) => attentionService.completeItem(id, userId).catch((e) => ({ error: e.message, id })))
    );

    res.json({
      success: true,
      data: {
        completed: results.filter((r) => !r.error).length,
        failed: results.filter((r) => r.error).length,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/attention/bulk/dismiss
 * Dismiss multiple items
 */
router.post('/bulk/dismiss', async (req, res, next) => {
  try {
    const { ids, reason } = req.body;
    const userId = req.headers['x-user-id'] || req.body.userId;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'ids array is required' },
      });
    }

    const results = await Promise.all(
      ids.map((id) => attentionService.dismissItem(id, userId, reason).catch((e) => ({ error: e.message, id })))
    );

    res.json({
      success: true,
      data: {
        dismissed: results.filter((r) => !r.error).length,
        failed: results.filter((r) => r.error).length,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/attention/bulk/snooze
 * Snooze multiple items
 */
router.post('/bulk/snooze', async (req, res, next) => {
  try {
    const { ids, duration = '1d' } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'ids array is required' },
      });
    }

    const results = await Promise.all(
      ids.map((id) => attentionService.snoozeItem(id, duration).catch((e) => ({ error: e.message, id })))
    );

    res.json({
      success: true,
      data: {
        snoozed: results.filter((r) => !r.error).length,
        failed: results.filter((r) => r.error).length,
        results,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// METADATA ENDPOINTS
// ============================================================================

/**
 * GET /api/attention/types
 * Get list of attention item types with descriptions
 * Useful for filtering UI
 */
router.get('/types', async (req, res, next) => {
  try {
    const types = {
      // Customer-facing action items
      OVERDUE_INVOICE: { label: 'Overdue Invoice', category: 'FINANCIAL', icon: 'currency-dollar' },
      STALLED_DEAL: { label: 'Stalled Deal', category: 'TASK', icon: 'clock' },
      APPROVAL_NEEDED: { label: 'Approval Needed', category: 'APPROVAL', icon: 'check-circle' },
      LEAD_AGING: { label: 'Aging Lead', category: 'TASK', icon: 'user-plus' },
      QUOTE_EXPIRING: { label: 'Quote Expiring', category: 'TASK', icon: 'document-text' },
      UNREAD_MESSAGE: { label: 'Unread Message', category: 'COMMUNICATION', icon: 'chat-bubble' },
      CASE_ESCALATION: { label: 'Case Escalation', category: 'ESCALATION', icon: 'exclamation-triangle' },
      CUSTOMER_COMPLAINT: { label: 'Customer Complaint', category: 'ESCALATION', icon: 'user-exclamation' },
      CUSTOMER_FOLLOW_UP: { label: 'Customer Follow-up', category: 'TASK', icon: 'phone' },
      PAYMENT_DUE: { label: 'Payment Due', category: 'FINANCIAL', icon: 'credit-card' },
    };

    res.json({
      success: true,
      data: types,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/attention/categories
 * Get list of attention item categories
 */
router.get('/categories', async (req, res, next) => {
  try {
    const categories = {
      TASK: { label: 'Tasks', icon: 'check-square', color: 'blue' },
      FINANCIAL: { label: 'Financial', icon: 'currency-dollar', color: 'green' },
      APPROVAL: { label: 'Approvals', icon: 'check-circle', color: 'purple' },
      COMMUNICATION: { label: 'Communication', icon: 'chat-bubble', color: 'yellow' },
      ESCALATION: { label: 'Escalations', icon: 'exclamation-triangle', color: 'red' },
    };

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
