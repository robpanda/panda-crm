// Lead Assignment Routes - API endpoints for lead routing and assignment
import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { handleValidation } from '../middleware/validation.js';
import { leadAssignmentService } from '../services/leadAssignmentService.js';

const router = Router();

// ============================================================================
// GLOBAL SETTINGS
// ============================================================================

// Get all assignment settings
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await leadAssignmentService.getAssignmentSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

// Toggle round-robin on/off
router.post('/settings/round-robin',
  body('enabled').isBoolean().withMessage('enabled (true/false) is required'),
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await leadAssignmentService.toggleRoundRobin(req.body.enabled, req.user?.id);
      res.json({
        success: true,
        message: `Round-robin assignment ${req.body.enabled ? 'enabled' : 'disabled'}`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// Toggle all auto-assignment on/off
router.post('/settings/auto-assignment',
  body('enabled').isBoolean().withMessage('enabled (true/false) is required'),
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await leadAssignmentService.toggleAutoAssignment(req.body.enabled, req.user?.id);
      res.json({
        success: true,
        message: `Auto-assignment ${req.body.enabled ? 'enabled' : 'disabled'}`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// ASSIGNMENT RULES CRUD
// ============================================================================

// Get all assignment rules
router.get('/rules', async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const rules = await leadAssignmentService.getRules(includeInactive);
    res.json({ success: true, data: rules });
  } catch (error) {
    next(error);
  }
});

// Get single rule by ID
router.get('/rules/:id',
  param('id').isString().notEmpty(),
  handleValidation,
  async (req, res, next) => {
    try {
      const rule = await leadAssignmentService.getRuleById(req.params.id);
      if (!rule) {
        return res.status(404).json({ success: false, error: 'Rule not found' });
      }
      res.json({ success: true, data: rule });
    } catch (error) {
      next(error);
    }
  }
);

// Create new rule
router.post('/rules',
  body('name').isString().notEmpty().withMessage('Rule name is required'),
  body('assignmentType').optional().isIn(['SPECIFIC_USER', 'ROUND_ROBIN', 'TEAM', 'QUEUE', 'TERRITORY']),
  body('priority').optional().isInt({ min: 0, max: 1000 }),
  body('workType').optional().isString(),
  body('stage').optional().isString(),
  body('status').optional().isString(),
  body('leadSource').optional().isString(),
  body('state').optional().isString(),
  body('autoCreateOpportunity').optional().isBoolean(),
  body('notifyAssignee').optional().isBoolean(),
  handleValidation,
  async (req, res, next) => {
    try {
      const rule = await leadAssignmentService.createRule(req.body, req.user?.id);
      res.status(201).json({ success: true, data: rule });
    } catch (error) {
      next(error);
    }
  }
);

// Update rule
router.put('/rules/:id',
  param('id').isString().notEmpty(),
  handleValidation,
  async (req, res, next) => {
    try {
      const rule = await leadAssignmentService.updateRule(req.params.id, req.body, req.user?.id);
      res.json({ success: true, data: rule });
    } catch (error) {
      next(error);
    }
  }
);

// Delete rule
router.delete('/rules/:id',
  param('id').isString().notEmpty(),
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await leadAssignmentService.deleteRule(req.params.id, req.user?.id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

// Toggle rule active status
router.post('/rules/:id/toggle',
  param('id').isString().notEmpty(),
  handleValidation,
  async (req, res, next) => {
    try {
      const rule = await leadAssignmentService.toggleRuleStatus(req.params.id, req.user?.id);
      res.json({ success: true, data: rule });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// LEAD ASSIGNMENT OPERATIONS
// ============================================================================

// Auto-assign a single lead based on rules
router.post('/assign/:leadId',
  param('leadId').isString().notEmpty(),
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await leadAssignmentService.assignLead(req.params.leadId, {
        assignedById: req.user?.id,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

// Manually assign a lead to a specific user
router.post('/assign/:leadId/manual',
  param('leadId').isString().notEmpty(),
  body('assignToUserId').isString().notEmpty().withMessage('assignToUserId is required'),
  body('notes').optional().isString(),
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await leadAssignmentService.manualAssign(
        req.params.leadId,
        req.body.assignToUserId,
        req.user?.id,
        req.body.notes
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

// Bulk assign multiple leads
router.post('/assign/bulk',
  body('leadIds').isArray({ min: 1 }).withMessage('leadIds array is required'),
  body('leadIds.*').isString().notEmpty(),
  handleValidation,
  async (req, res, next) => {
    try {
      const result = await leadAssignmentService.bulkAssignLeads(req.body.leadIds, {
        assignedById: req.user?.id,
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

// Get assignment history for a lead
router.get('/history/:leadId',
  param('leadId').isString().notEmpty(),
  handleValidation,
  async (req, res, next) => {
    try {
      const history = await leadAssignmentService.getLeadAssignmentHistory(req.params.leadId);
      res.json({ success: true, data: history });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// ANALYTICS
// ============================================================================

// Get assignment statistics
router.get('/stats',
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  handleValidation,
  async (req, res, next) => {
    try {
      const stats = await leadAssignmentService.getAssignmentStats({
        startDate: req.query.startDate,
        endDate: req.query.endDate,
      });
      res.json({ success: true, data: stats });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// ADMIN OPERATIONS
// ============================================================================

// Seed default rules (admin only)
router.post('/rules/seed',
  async (req, res, next) => {
    try {
      const rules = await leadAssignmentService.seedDefaultRules(req.user?.id);
      res.json({
        success: true,
        message: `Seeded ${rules.length} default rules`,
        data: rules,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
