// Message Template Routes - Admin management of SMS/Email templates
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { messagingService } from '../services/messagingService.js';
import { logger } from '../middleware/logger.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /templates - List all message templates
 */
router.get('/', async (req, res, next) => {
  try {
    const { type, category, isSystem } = req.query;

    const where = {};
    if (type) where.type = type;
    if (category) where.category = category;
    if (isSystem !== undefined) where.isSystem = isSystem === 'true';

    const templates = await prisma.messageTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    res.json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /templates/:id - Get single template
 */
router.get('/:id', async (req, res, next) => {
  try {
    const template = await prisma.messageTemplate.findUnique({
      where: { id: req.params.id },
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /templates - Create new template
 */
router.post('/', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { name, type, subject, body, variables, category, isSystem } = req.body;

    if (!name || !type || !body) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name, type, and body are required' },
      });
    }

    // Extract variables from body if not provided
    const extractedVars = body.match(/\{\{([^}]+)\}\}/g)?.map(v => v.replace(/[{}]/g, '').trim()) || [];
    const allVariables = [...new Set([...(variables || []), ...extractedVars])];

    const template = await prisma.messageTemplate.create({
      data: {
        name,
        type,
        subject,
        body,
        variables: allVariables,
        category,
        isSystem: isSystem || false,
        createdById: req.user.id,
      },
    });

    logger.info(`Template created: ${template.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /templates/:id - Update template
 */
router.put('/:id', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { name, type, subject, body, variables, category, isSystem } = req.body;

    const existing = await prisma.messageTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    // Prevent editing system templates unless super_admin
    if (existing.isSystem && req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot edit system templates' },
      });
    }

    // Extract variables from body if body changed
    let allVariables = variables;
    if (body && body !== existing.body) {
      const extractedVars = body.match(/\{\{([^}]+)\}\}/g)?.map(v => v.replace(/[{}]/g, '').trim()) || [];
      allVariables = [...new Set([...(variables || []), ...extractedVars])];
    }

    const template = await prisma.messageTemplate.update({
      where: { id: req.params.id },
      data: {
        name,
        type,
        subject,
        body,
        variables: allVariables,
        category,
        isSystem,
        updatedAt: new Date(),
      },
    });

    logger.info(`Template updated: ${template.id} by ${req.user.email}`);

    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /templates/:id - Delete template
 */
router.delete('/:id', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const existing = await prisma.messageTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    // Prevent deleting system templates
    if (existing.isSystem) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Cannot delete system templates' },
      });
    }

    // Check if template is used by workflows
    const usedByWorkflows = await prisma.workflowAction.count({
      where: { messageTemplateId: req.params.id },
    });

    if (usedByWorkflows > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'TEMPLATE_IN_USE', message: `Template is used by ${usedByWorkflows} workflow actions` },
      });
    }

    await prisma.messageTemplate.delete({ where: { id: req.params.id } });

    logger.info(`Template deleted: ${req.params.id} by ${req.user.email}`);

    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /templates/:id/duplicate - Duplicate a template
 */
router.post('/:id/duplicate', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const original = await prisma.messageTemplate.findUnique({ where: { id: req.params.id } });
    if (!original) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    const duplicate = await prisma.messageTemplate.create({
      data: {
        name: `${original.name} (Copy)`,
        type: original.type,
        subject: original.subject,
        body: original.body,
        variables: original.variables,
        category: original.category,
        isSystem: false,
        createdById: req.user.id,
      },
    });

    logger.info(`Template duplicated: ${original.id} -> ${duplicate.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: duplicate });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /templates/:id/preview - Preview template with sample data
 */
router.post('/:id/preview', async (req, res, next) => {
  try {
    const { sampleData } = req.body;

    const template = await prisma.messageTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    // Interpolate template with sample data
    const previewBody = messagingService.interpolateTemplate(template.body, sampleData || {});
    const previewSubject = template.subject
      ? messagingService.interpolateTemplate(template.subject, sampleData || {})
      : null;

    // Calculate SMS segment count
    let segments = null;
    if (template.type === 'SMS') {
      const length = previewBody.length;
      if (length <= 160) {
        segments = 1;
      } else {
        segments = Math.ceil(length / 153);
      }
    }

    res.json({
      success: true,
      data: {
        subject: previewSubject,
        body: previewBody,
        characterCount: previewBody.length,
        segments,
        variables: template.variables,
        missingVariables: template.variables.filter(v => !sampleData || sampleData[v] === undefined),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /templates/:id/send-test - Send test message
 */
router.post('/:id/send-test', requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const { recipient, sampleData } = req.body;

    if (!recipient) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Recipient is required' },
      });
    }

    const template = await prisma.messageTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    // Send test message
    let result;
    if (template.type === 'SMS') {
      result = await messagingService.sendSMS({
        template,
        record: sampleData || {},
        recipient,
        userId: req.user.id,
      });
    } else {
      result = await messagingService.sendEmail({
        template,
        record: sampleData || {},
        recipient,
        userId: req.user.id,
      });
    }

    logger.info(`Test message sent: ${template.id} to ${recipient} by ${req.user.email}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /templates/categories - Get available categories
 */
router.get('/meta/categories', (req, res) => {
  const categories = [
    { value: 'ONBOARDING', label: 'Onboarding', description: 'New project onboarding messages' },
    { value: 'SCHEDULING', label: 'Scheduling', description: 'Appointment and scheduling messages' },
    { value: 'INSTALLATION', label: 'Installation', description: 'Installation-related messages' },
    { value: 'PAYMENT', label: 'Payment', description: 'Payment reminders and confirmations' },
    { value: 'FOLLOW_UP', label: 'Follow-up', description: 'Post-service follow-up messages' },
    { value: 'REVIEW_REQUEST', label: 'Review Request', description: 'Review request messages' },
    { value: 'MARKETING', label: 'Marketing', description: 'Marketing and promotional messages' },
    { value: 'INTERNAL', label: 'Internal', description: 'Internal team notifications' },
    { value: 'OTHER', label: 'Other', description: 'Miscellaneous messages' },
  ];

  res.json({ success: true, data: categories });
});

/**
 * GET /templates/variables - Get available template variables
 */
router.get('/meta/variables', (req, res) => {
  const variables = [
    // Contact/Customer
    { name: 'contact.firstName', label: 'Contact First Name', object: 'Contact' },
    { name: 'contact.lastName', label: 'Contact Last Name', object: 'Contact' },
    { name: 'contact.fullName', label: 'Contact Full Name', object: 'Contact' },
    { name: 'contact.phone', label: 'Contact Phone', object: 'Contact' },
    { name: 'contact.email', label: 'Contact Email', object: 'Contact' },

    // Account
    { name: 'account.name', label: 'Account Name', object: 'Account' },
    { name: 'account.billingAddress', label: 'Billing Address', object: 'Account' },
    { name: 'account.phone', label: 'Account Phone', object: 'Account' },

    // Opportunity/Project
    { name: 'opportunity.name', label: 'Project Name', object: 'Opportunity' },
    { name: 'opportunity.stage', label: 'Stage', object: 'Opportunity' },
    { name: 'opportunity.amount', label: 'Amount', object: 'Opportunity' },
    { name: 'opportunity.closeDate', label: 'Close Date', object: 'Opportunity' },

    // Appointment
    { name: 'appointment.date', label: 'Appointment Date', object: 'ServiceAppointment' },
    { name: 'appointment.time', label: 'Appointment Time', object: 'ServiceAppointment' },
    { name: 'appointment.address', label: 'Appointment Address', object: 'ServiceAppointment' },

    // Crew/Technician
    { name: 'crew.name', label: 'Crew Name', object: 'ServiceResource' },
    { name: 'crew.phone', label: 'Crew Phone', object: 'ServiceResource' },

    // Sales Rep
    { name: 'salesRep.name', label: 'Sales Rep Name', object: 'User' },
    { name: 'salesRep.phone', label: 'Sales Rep Phone', object: 'User' },
    { name: 'salesRep.email', label: 'Sales Rep Email', object: 'User' },

    // Company
    { name: 'company.name', label: 'Company Name', object: 'Company' },
    { name: 'company.phone', label: 'Company Phone', object: 'Company' },
    { name: 'company.website', label: 'Company Website', object: 'Company' },
  ];

  res.json({ success: true, data: variables });
});

export default router;
