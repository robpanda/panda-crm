// Tasks Routes
import { Router } from 'express';
import { query, body, param, validationResult } from 'express-validator';
import taskService from '../services/taskService.js';
import { logger } from '../middleware/logger.js';

const router = Router();

// Validation middleware
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: errors.array() },
    });
  }
  next();
};

// ============================================================================
// STATIC ROUTES - Must come BEFORE /:id routes
// ============================================================================

/**
 * GET /api/tasks/my-tasks
 * Get current user's open tasks for dashboard/home page
 */
router.get('/my-tasks', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User ID required' },
      });
    }

    const result = await taskService.getMyTasks(userId, {
      limit: parseInt(req.query.limit) || 20,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tasks/subjects
 * Get list of task subject options
 */
router.get('/subjects', (req, res) => {
  res.json({
    success: true,
    data: {
      subjects: taskService.TASK_SUBJECTS,
      subtypes: taskService.TASK_SUBTYPES,
    },
  });
});

/**
 * GET /api/tasks/opportunity/:opportunityId
 * Get tasks for a specific opportunity
 */
router.get('/opportunity/:opportunityId', async (req, res, next) => {
  try {
    const tasks = await taskService.getOpportunityTasks(req.params.opportunityId, {
      showCompleted: req.query.showCompleted === 'true',
    });
    res.json({ success: true, data: tasks });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/tasks/lead/:leadId
 * Get tasks for a specific lead
 */
router.get('/lead/:leadId', async (req, res, next) => {
  try {
    const tasks = await taskService.getLeadTasks(req.params.leadId, {
      showCompleted: req.query.showCompleted === 'true',
    });
    res.json({ success: true, data: tasks });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// LIST TASKS
// ============================================================================

/**
 * GET /api/tasks
 * List tasks with filtering and pagination
 */
router.get(
  '/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('status').optional().isIn(['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'DEFERRED']),
    query('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']),
    query('assignedToId').optional().isString(),
    query('opportunityId').optional().isString(),
    query('leadId').optional().isString(),
    query('showCompleted').optional().isBoolean().toBoolean(),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const result = await taskService.listTasks({
        page: req.query.page || 1,
        limit: req.query.limit || 50,
        status: req.query.status,
        priority: req.query.priority,
        assignedToId: req.query.assignedToId,
        opportunityId: req.query.opportunityId,
        leadId: req.query.leadId,
        search: req.query.search,
        sortBy: req.query.sortBy || 'dueDate',
        sortOrder: req.query.sortOrder || 'asc',
        showCompleted: req.query.showCompleted || false,
      });

      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * POST /api/tasks
 * Create a new task
 */
router.post(
  '/',
  [
    body('subject').notEmpty().withMessage('Subject is required'),
    body('status').optional().isIn(['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'DEFERRED']),
    body('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']),
    body('dueDate').optional().isISO8601(),
    body('assignedToId').optional().isString(),
    body('opportunityId').optional().isString(),
    body('leadId').optional().isString(),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const task = await taskService.createTask(req.body, req.user?.id);
      res.status(201).json({ success: true, data: task });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/tasks/:id
 * Get a single task by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const task = await taskService.getTask(req.params.id);
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/tasks/:id
 * Update a task
 */
router.put(
  '/:id',
  [
    body('subject').optional().notEmpty(),
    body('status').optional().isIn(['NOT_STARTED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'DEFERRED']),
    body('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']),
    body('dueDate').optional(),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const task = await taskService.updateTask(req.params.id, req.body, req.user?.id);
      res.json({ success: true, data: task });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/tasks/:id
 * Delete a task
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await taskService.deleteTask(req.params.id);
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ACTION ROUTES
// ============================================================================

/**
 * POST /api/tasks/:id/complete
 * Mark a task as completed
 */
router.post('/:id/complete', async (req, res, next) => {
  try {
    const task = await taskService.completeTask(req.params.id, req.user?.id);
    res.json({ success: true, data: task, message: 'Task marked as completed' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/tasks/:id/follow-up
 * Create a follow-up task from an existing task
 */
router.post(
  '/:id/follow-up',
  [
    body('subject').optional().notEmpty(),
    body('description').optional(),
    body('dueDate').optional().isISO8601(),
    body('assignedToId').optional().isString(),
    body('priority').optional().isIn(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']),
    handleValidation,
  ],
  async (req, res, next) => {
    try {
      const task = await taskService.createFollowUpTask(req.params.id, req.body, req.user?.id);
      res.status(201).json({ success: true, data: task, message: 'Follow-up task created' });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
