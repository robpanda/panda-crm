// Workflow Routes - Admin management of workflows
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { workflowEngine } from '../services/workflowEngine.js';
import { logger } from '../middleware/logger.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /workflows - List all workflows
 */
router.get('/', async (req, res, next) => {
  try {
    const { isActive, triggerObject } = req.query;

    const where = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (triggerObject) where.triggerObject = triggerObject;

    const workflows = await prisma.workflow.findMany({
      where,
      include: {
        actions: {
          orderBy: { actionOrder: 'asc' },
          include: { messageTemplate: { select: { id: true, name: true, type: true } } },
        },
        _count: { select: { executions: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json({
      success: true,
      data: workflows,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /workflows/:id - Get single workflow with details
 */
router.get('/:id', async (req, res, next) => {
  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
      include: {
        actions: {
          orderBy: { actionOrder: 'asc' },
          include: { messageTemplate: true },
        },
        executions: {
          take: 50,
          orderBy: { startedAt: 'desc' },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Workflow not found' },
      });
    }

    res.json({ success: true, data: workflow });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /workflows - Create new workflow
 */
router.post('/', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const {
      name,
      description,
      triggerObject,
      triggerEvent,
      triggerConditions,
      isActive = false,
      actions = [],
    } = req.body;

    // Validate required fields
    if (!name || !triggerObject || !triggerEvent) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name, triggerObject, and triggerEvent are required' },
      });
    }

    const workflow = await prisma.workflow.create({
      data: {
        name,
        description,
        triggerObject,
        triggerEvent,
        triggerConditions,
        isActive,
        createdById: req.user.id,
        actions: {
          create: actions.map((action, index) => ({
            actionType: action.actionType,
            actionOrder: action.actionOrder ?? index,
            messageTemplateId: action.messageTemplateId,
            delayMinutes: action.delayMinutes,
            condition: action.condition,
            config: action.config,
          })),
        },
      },
      include: {
        actions: { orderBy: { actionOrder: 'asc' } },
      },
    });

    logger.info(`Workflow created: ${workflow.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: workflow });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /workflows/:id - Update workflow
 */
router.put('/:id', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      triggerObject,
      triggerEvent,
      triggerConditions,
      isActive,
      actions,
    } = req.body;

    // Check if workflow exists
    const existing = await prisma.workflow.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Workflow not found' },
      });
    }

    // Update workflow
    const workflow = await prisma.workflow.update({
      where: { id },
      data: {
        name,
        description,
        triggerObject,
        triggerEvent,
        triggerConditions,
        isActive,
        updatedAt: new Date(),
      },
    });

    // Update actions if provided
    if (actions) {
      // Delete existing actions
      await prisma.workflowAction.deleteMany({ where: { workflowId: id } });

      // Create new actions
      await prisma.workflowAction.createMany({
        data: actions.map((action, index) => ({
          workflowId: id,
          actionType: action.actionType,
          actionOrder: action.actionOrder ?? index,
          messageTemplateId: action.messageTemplateId,
          delayMinutes: action.delayMinutes,
          condition: action.condition,
          config: action.config,
        })),
      });
    }

    const updated = await prisma.workflow.findUnique({
      where: { id },
      include: { actions: { orderBy: { actionOrder: 'asc' } } },
    });

    logger.info(`Workflow updated: ${id} by ${req.user.email}`);

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /workflows/:id - Delete workflow
 */
router.delete('/:id', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.workflow.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Workflow not found' },
      });
    }

    // Delete actions first
    await prisma.workflowAction.deleteMany({ where: { workflowId: id } });

    // Delete workflow
    await prisma.workflow.delete({ where: { id } });

    logger.info(`Workflow deleted: ${id} by ${req.user.email}`);

    res.json({ success: true, message: 'Workflow deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /workflows/:id/activate - Activate workflow
 */
router.post('/:id/activate', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const workflow = await prisma.workflow.update({
      where: { id: req.params.id },
      data: { isActive: true },
    });

    logger.info(`Workflow activated: ${workflow.id} by ${req.user.email}`);

    res.json({ success: true, data: workflow });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /workflows/:id/deactivate - Deactivate workflow
 */
router.post('/:id/deactivate', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const workflow = await prisma.workflow.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    logger.info(`Workflow deactivated: ${workflow.id} by ${req.user.email}`);

    res.json({ success: true, data: workflow });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /workflows/:id/test - Test workflow with sample data
 */
router.post('/:id/test', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { sampleRecord, previousRecord } = req.body;

    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
      include: { actions: { include: { messageTemplate: true } } },
    });

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Workflow not found' },
      });
    }

    // Evaluate conditions
    const conditionsMet = workflowEngine.evaluateConditions(
      workflow.triggerConditions,
      sampleRecord,
      previousRecord
    );

    // Preview action results (without actually executing)
    const actionPreviews = workflow.actions.map(action => {
      const template = action.messageTemplate;
      let preview = null;

      if (template && (action.actionType === 'SEND_SMS' || action.actionType === 'SEND_EMAIL')) {
        preview = workflowEngine.interpolateTemplate(template.body, sampleRecord);
      }

      return {
        actionType: action.actionType,
        order: action.actionOrder,
        wouldExecute: conditionsMet && (!action.condition ||
          workflowEngine.evaluateConditions(action.condition, sampleRecord, previousRecord)),
        preview,
      };
    });

    res.json({
      success: true,
      data: {
        conditionsMet,
        wouldExecute: conditionsMet,
        actionPreviews,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /workflows/:id/executions - Get workflow execution history
 */
router.get('/:id/executions', async (req, res, next) => {
  try {
    const { limit = 50, offset = 0, status } = req.query;

    const where = { workflowId: req.params.id };
    if (status) where.status = status;

    const [executions, total] = await Promise.all([
      prisma.workflowExecution.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.workflowExecution.count({ where }),
    ]);

    res.json({
      success: true,
      data: executions,
      pagination: { total, limit: parseInt(limit), offset: parseInt(offset) },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /workflows/trigger - Manually trigger a workflow
 */
router.post('/trigger', async (req, res, next) => {
  try {
    const { triggerObject, triggerEvent, record, previousRecord } = req.body;

    if (!triggerObject || !triggerEvent || !record) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'triggerObject, triggerEvent, and record are required' },
      });
    }

    const results = await workflowEngine.processTrigger(
      triggerObject,
      triggerEvent,
      record,
      previousRecord,
      req.user.id
    );

    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /workflows/objects - Get available trigger objects
 */
router.get('/meta/objects', async (req, res) => {
  const objects = [
    { name: 'Opportunity', label: 'Opportunity', description: 'Sales opportunity/project' },
    { name: 'Account', label: 'Account', description: 'Customer account' },
    { name: 'Contact', label: 'Contact', description: 'Contact person' },
    { name: 'Lead', label: 'Lead', description: 'Sales lead' },
    { name: 'Quote', label: 'Quote', description: 'Price quote' },
    { name: 'Order', label: 'Order', description: 'Material order' },
    { name: 'WorkOrder', label: 'Work Order', description: 'Work order/job' },
    { name: 'ServiceAppointment', label: 'Service Appointment', description: 'Scheduled appointment' },
    { name: 'Invoice', label: 'Invoice', description: 'Customer invoice' },
    { name: 'Commission', label: 'Commission', description: 'Sales commission' },
    { name: 'ServiceContract', label: 'Service Contract', description: 'Service contract' },
    { name: 'Agreement', label: 'Agreement', description: 'Document agreement' },
  ];

  res.json({ success: true, data: objects });
});

/**
 * GET /workflows/events - Get available trigger events
 */
router.get('/meta/events', async (req, res) => {
  const events = [
    { name: 'CREATE', label: 'Record Created', description: 'When a new record is created' },
    { name: 'UPDATE', label: 'Record Updated', description: 'When a record is modified' },
    { name: 'DELETE', label: 'Record Deleted', description: 'When a record is deleted' },
    { name: 'FIELD_CHANGE', label: 'Field Changed', description: 'When a specific field changes' },
    { name: 'STAGE_CHANGE', label: 'Stage Changed', description: 'When opportunity stage changes' },
    { name: 'STATUS_CHANGE', label: 'Status Changed', description: 'When status field changes' },
    { name: 'SCHEDULED', label: 'Scheduled', description: 'Time-based trigger' },
  ];

  res.json({ success: true, data: events });
});

/**
 * GET /workflows/actions - Get available action types
 */
router.get('/meta/actions', async (req, res) => {
  const actions = [
    { name: 'SEND_SMS', label: 'Send SMS', description: 'Send SMS message via Riley', requiresTemplate: true },
    { name: 'SEND_EMAIL', label: 'Send Email', description: 'Send email via SendGrid', requiresTemplate: true },
    { name: 'UPDATE_FIELD', label: 'Update Field', description: 'Update a field on the record' },
    { name: 'CREATE_RECORD', label: 'Create Record', description: 'Create a new record' },
    { name: 'CREATE_TASK', label: 'Create Task', description: 'Create a task/to-do' },
    { name: 'CREATE_COMMISSION', label: 'Create Commission', description: 'Create commission record' },
    { name: 'CALL_WEBHOOK', label: 'Call Webhook', description: 'Send HTTP request to external system' },
    { name: 'SCHEDULE_APPOINTMENT', label: 'Schedule Appointment', description: 'Create service appointment' },
    { name: 'SEND_AGREEMENT', label: 'Send Agreement', description: 'Send document for signature' },
    { name: 'DELAY', label: 'Delay', description: 'Wait before next action' },
  ];

  res.json({ success: true, data: actions });
});

export default router;
