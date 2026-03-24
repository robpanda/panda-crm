// Message Template Routes - Admin management of SMS/Email templates
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { messagingService } from '../services/messagingService.js';
import { logger } from '../middleware/logger.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

const DEFAULT_PANDASIGN_TEMPLATES = [
  {
    name: 'PandaSign - Sign Request',
    type: 'EMAIL',
    category: 'PANDASIGN_SIGN_REQUEST',
    subject: 'Please sign: {{agreement.name}}',
    body: `
<!DOCTYPE html>
<html>
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #111827; line-height: 1.6;">
    <div style="max-width: 640px; margin: 0 auto; padding: 24px;">
      <h2 style="margin-bottom: 16px;">Hello {{recipient.name}},</h2>
      <p>You have a document waiting for your signature:</p>
      <p><strong>{{agreement.name}}</strong></p>
      <p>Please click the button below to review and sign the document:</p>
      <p style="margin: 24px 0;">
        <a href="{{links.signingUrl}}" style="display: inline-block; background: #4f46e5; color: #ffffff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Review &amp; Sign Document</a>
      </p>
      <p>This link will expire in 30 days.</p>
      <p>If you have any questions, please contact us at <a href="tel:{{company.phoneRaw}}">{{company.phone}}</a>.</p>
      <p style="margin-top: 32px; color: #6b7280; font-size: 13px;">{{company.name}}<br/>{{company.email}}</p>
    </div>
  </body>
</html>
    `.trim(),
  },
  {
    name: 'PandaSign - Customer Signed',
    type: 'EMAIL',
    category: 'PANDASIGN_SIGNED_CONFIRMATION',
    subject: 'Signed: {{agreement.name}}',
    body: `
<p>Your signature has been recorded for <strong>{{agreement.name}}</strong>.</p>
<p>You can download your signed document here:</p>
<p><a href="{{links.signedDocumentUrl}}">{{links.signedDocumentUrl}}</a></p>
<p>Thank you for choosing {{company.name}}.</p>
    `.trim(),
  },
  {
    name: 'PandaSign - Customer Signed (Internal)',
    type: 'EMAIL',
    category: 'PANDASIGN_SIGNED_INTERNAL',
    subject: 'Document Signed: {{agreement.name}}',
    body: `
<p>Document signed by {{recipient.name}} ({{recipient.email}}).</p>
<p><strong>Agreement #:</strong> {{agreement.agreementNumber}}<br/>
<strong>Signed at:</strong> {{agreement.signedAt}}</p>
<p><a href="{{links.signedDocumentUrl}}">View signed document</a></p>
    `.trim(),
  },
  {
    name: 'PandaSign - Fully Executed (Customer)',
    type: 'EMAIL',
    category: 'PANDASIGN_COMPLETED_CUSTOMER',
    subject: 'Completed: {{agreement.name}}',
    body: `
<p>Your document has been fully executed: <strong>{{agreement.name}}</strong>.</p>
<p>All parties have signed. You can download your completed document here:</p>
<p><a href="{{links.completedDocumentUrl}}">{{links.completedDocumentUrl}}</a></p>
<p>Thank you for choosing {{company.name}}.</p>
    `.trim(),
  },
  {
    name: 'PandaSign - Fully Executed (Agent)',
    type: 'EMAIL',
    category: 'PANDASIGN_COMPLETED_AGENT',
    subject: 'Document Completed: {{agreement.name}}',
    body: `
<p>Your signature has been recorded on <strong>{{agreement.name}}</strong>.</p>
<p>Customer: {{recipient.name}}</p>
<p>Completed at: {{agreement.completedAt}}</p>
<p>Download completed document:</p>
<p><a href="{{links.completedDocumentUrl}}">{{links.completedDocumentUrl}}</a></p>
    `.trim(),
  },
  {
    name: 'PandaSign - Fully Executed (Internal)',
    type: 'EMAIL',
    category: 'PANDASIGN_COMPLETED_INTERNAL',
    subject: 'Document Fully Executed: {{agreement.name}}',
    body: `
<p>Document fully executed with all signatures.</p>
<p><strong>Document:</strong> {{agreement.name}}<br/>
<strong>Agreement #:</strong> {{agreement.agreementNumber}}<br/>
<strong>Customer:</strong> {{recipient.name}} ({{recipient.email}})<br/>
<strong>Host/Agent:</strong> {{hostSigner.name}} ({{hostSigner.email}})</p>
<p><strong>Completed at:</strong> {{agreement.completedAt}}</p>
<p><a href="{{links.completedDocumentUrl}}">View completed document</a></p>
    `.trim(),
  },
];

function normalizeTemplateType(input) {
  const normalized = String(input || '').trim().toUpperCase();
  return normalized === 'EMAIL' ? 'EMAIL' : 'SMS';
}

function extractTemplateVariables(...content) {
  return [...new Set(
    content
      .flatMap((value) => String(value || '').match(/\{\{([^}]+)\}\}/g) || [])
      .map((value) => value.replace(/[{}]/g, '').trim())
      .filter(Boolean)
  )];
}

async function ensureDefaultPandaSignTemplates() {
  for (const template of DEFAULT_PANDASIGN_TEMPLATES) {
    const existing = await prisma.messageTemplate.findFirst({
      where: {
        category: template.category,
        type: template.type,
      },
      select: { id: true },
    });

    if (existing) continue;

    await prisma.messageTemplate.create({
      data: {
        name: template.name,
        type: template.type,
        category: template.category,
        subject: template.subject,
        body: template.body,
        variables: extractTemplateVariables(template.subject, template.body),
        isSystem: false,
        isActive: true,
      },
    });
  }
}

// All routes require authentication
router.use(authMiddleware);

/**
 * GET /templates - List all message templates
 */
router.get('/', async (req, res, next) => {
  try {
    await ensureDefaultPandaSignTemplates();

    const type = req.query.type || req.query.channel;
    const { category, isSystem } = req.query;

    const where = {};
    if (type) where.type = normalizeTemplateType(type);
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
    const { name, subject, body, variables, category, isSystem, isActive } = req.body;
    const type = req.body.type || req.body.channel;

    if (!name || !type || !body) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name, type, and body are required' },
      });
    }

    // Extract variables from body if not provided
    const allVariables = [...new Set([...(variables || []), ...extractTemplateVariables(subject, body)])];

    const template = await prisma.messageTemplate.create({
      data: {
        name,
        type: normalizeTemplateType(type),
        subject,
        body,
        variables: allVariables,
        category,
        isSystem: isSystem || false,
        isActive: isActive ?? true,
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
    const { name, subject, body, variables, category, isSystem, isActive } = req.body;
    const type = req.body.type || req.body.channel;

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
    let allVariables = variables ?? existing.variables;
    if ((body && body !== existing.body) || (subject && subject !== existing.subject)) {
      allVariables = [...new Set([...(variables || []), ...extractTemplateVariables(subject || existing.subject, body || existing.body)])];
    }

    const template = await prisma.messageTemplate.update({
      where: { id: req.params.id },
      data: {
        name,
        type: type ? normalizeTemplateType(type) : existing.type,
        subject,
        body,
        variables: allVariables,
        category,
        isSystem,
        isActive,
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
        isActive: original.isActive,
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

const TEMPLATE_CATEGORIES = [
  { value: 'ONBOARDING', label: 'Onboarding', description: 'New project onboarding messages' },
  { value: 'SCHEDULING', label: 'Scheduling', description: 'Appointment and scheduling messages' },
  { value: 'INSTALLATION', label: 'Installation', description: 'Installation-related messages' },
  { value: 'PAYMENT', label: 'Payment', description: 'Payment reminders and confirmations' },
  { value: 'FOLLOW_UP', label: 'Follow-up', description: 'Post-service follow-up messages' },
  { value: 'REVIEW_REQUEST', label: 'Review Request', description: 'Review request messages' },
  { value: 'MARKETING', label: 'Marketing', description: 'Marketing and promotional messages' },
  { value: 'INTERNAL', label: 'Internal', description: 'Internal team notifications' },
  { value: 'PANDASIGN_SIGN_REQUEST', label: 'PandaSign - Sign Request', description: 'Initial email requesting a signature' },
  { value: 'PANDASIGN_SIGNED_CONFIRMATION', label: 'PandaSign - Signed Confirmation', description: 'Confirmation email sent after the customer signs' },
  { value: 'PANDASIGN_SIGNED_INTERNAL', label: 'PandaSign - Signed Internal', description: 'Internal notification when a customer signature is recorded' },
  { value: 'PANDASIGN_COMPLETED_CUSTOMER', label: 'PandaSign - Completed Customer', description: 'Final executed-document email sent to the customer' },
  { value: 'PANDASIGN_COMPLETED_AGENT', label: 'PandaSign - Completed Agent', description: 'Final executed-document email sent to the host/agent signer' },
  { value: 'PANDASIGN_COMPLETED_INTERNAL', label: 'PandaSign - Completed Internal', description: 'Internal notification for fully executed agreements' },
  { value: 'OTHER', label: 'Other', description: 'Miscellaneous messages' },
];

/**
 * GET /templates/categories - Get available categories
 */
router.get(['/meta/categories', '/categories'], (req, res) => {
  const categories = [
    ...TEMPLATE_CATEGORIES,
  ];

  res.json({ success: true, data: categories });
});

/**
 * GET /templates/variables - Get available template variables
 */
router.get(['/meta/variables', '/variables'], (req, res) => {
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

    // PandaSign
    { name: 'agreement.name', label: 'Agreement Name', object: 'Agreement' },
    { name: 'agreement.agreementNumber', label: 'Agreement Number', object: 'Agreement' },
    { name: 'agreement.signedAt', label: 'Agreement Signed At', object: 'Agreement' },
    { name: 'agreement.completedAt', label: 'Agreement Completed At', object: 'Agreement' },
    { name: 'recipient.name', label: 'Recipient Name', object: 'Agreement Recipient' },
    { name: 'recipient.email', label: 'Recipient Email', object: 'Agreement Recipient' },
    { name: 'hostSigner.name', label: 'Host Signer Name', object: 'Agreement Host Signer' },
    { name: 'hostSigner.email', label: 'Host Signer Email', object: 'Agreement Host Signer' },
    { name: 'links.signingUrl', label: 'Signing URL', object: 'Agreement Links' },
    { name: 'links.signedDocumentUrl', label: 'Signed Document URL', object: 'Agreement Links' },
    { name: 'links.completedDocumentUrl', label: 'Completed Document URL', object: 'Agreement Links' },
    { name: 'projectName', label: 'Project Name', object: 'Order Contract' },
    { name: 'jobNumber', label: 'Job Number', object: 'Order Contract' },
    { name: 'projectAddress', label: 'Project Address', object: 'Order Contract' },
    { name: 'customerName', label: 'Customer Name', object: 'Order Contract' },
    { name: 'customerEmail', label: 'Customer Email', object: 'Order Contract' },
    { name: 'salesRepName', label: 'Sales Rep Name', object: 'Order Contract' },
  ];

  res.json({ success: true, data: variables });
});

export default router;
