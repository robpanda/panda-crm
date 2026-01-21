// Agreement Routes - PandaSign document management
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { pandaSignService } from '../services/pandaSignService.js';
import { logger } from '../middleware/logger.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /agreements - List agreements (authenticated)
 */
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const {
      status,
      opportunityId,
      accountId,
      limit = 50,
      offset = 0,
    } = req.query;

    const where = {};
    if (status) where.status = status;
    if (opportunityId) where.opportunityId = opportunityId;
    if (accountId) where.accountId = accountId;

    const [agreements, total] = await Promise.all([
      prisma.agreement.findMany({
        where,
        include: {
          template: { select: { id: true, name: true, category: true } },
          opportunity: { select: { id: true, name: true } },
          account: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          signatures: { select: { id: true, signerName: true, signedAt: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
      }),
      prisma.agreement.count({ where }),
    ]);

    res.json({
      success: true,
      data: agreements,
      pagination: { total, limit: parseInt(limit), offset: parseInt(offset) },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /agreements/:id - Get single agreement (authenticated)
 */
router.get('/:id', authMiddleware, async (req, res, next) => {
  try {
    const agreement = await prisma.agreement.findUnique({
      where: { id: req.params.id },
      include: {
        template: true,
        opportunity: true,
        account: true,
        contact: true,
        signatures: true,
        createdBy: { select: { id: true, name: true } },
        sentBy: { select: { id: true, name: true } },
      },
    });

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Agreement not found' },
      });
    }

    res.json({ success: true, data: agreement });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /agreements - Create new agreement (authenticated)
 */
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const {
      templateId,
      opportunityId,
      accountId,
      contactId,
      recipientEmail,
      recipientName,
      mergeData,
    } = req.body;

    if (!templateId || !recipientEmail || !recipientName) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'templateId, recipientEmail, and recipientName are required' },
      });
    }

    const agreement = await pandaSignService.createAgreement({
      templateId,
      opportunityId,
      accountId,
      contactId,
      recipientEmail,
      recipientName,
      mergeData: mergeData || {},
      userId: req.user.id,
    });

    logger.info(`Agreement created: ${agreement.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: agreement });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /agreements/:id/send - Send agreement for signature (authenticated)
 */
router.post('/:id/send', authMiddleware, async (req, res, next) => {
  try {
    const agreement = await pandaSignService.sendForSignature(req.params.id, req.user.id);

    logger.info(`Agreement sent: ${agreement.id} by ${req.user.email}`);

    res.json({ success: true, data: agreement });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /agreements/:id/resend - Resend signing email (authenticated)
 */
router.post('/:id/resend', authMiddleware, async (req, res, next) => {
  try {
    const agreement = await prisma.agreement.findUnique({
      where: { id: req.params.id },
      include: { template: true },
    });

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Agreement not found' },
      });
    }

    if (!['SENT', 'VIEWED'].includes(agreement.status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_STATUS', message: 'Can only resend sent or viewed agreements' },
      });
    }

    await pandaSignService.sendSigningEmail(agreement);

    logger.info(`Agreement resent: ${agreement.id} by ${req.user.email}`);

    res.json({ success: true, message: 'Signing email resent' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /agreements/:id/void - Void an agreement (authenticated)
 */
router.post('/:id/void', authMiddleware, async (req, res, next) => {
  try {
    const { reason } = req.body;

    const agreement = await prisma.agreement.findUnique({
      where: { id: req.params.id },
    });

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Agreement not found' },
      });
    }

    if (agreement.status === 'SIGNED' || agreement.status === 'COMPLETED') {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_VOID', message: 'Cannot void a signed agreement' },
      });
    }

    const updated = await prisma.agreement.update({
      where: { id: req.params.id },
      data: {
        status: 'VOIDED',
        voidedAt: new Date(),
        voidedById: req.user.id,
        voidReason: reason,
      },
    });

    await prisma.auditLog.create({
      data: {
        tableName: 'agreements',
        recordId: req.params.id,
        action: 'VOIDED',
        oldValues: { status: agreement.status },
        newValues: { status: 'VOIDED', reason },
        userId: req.user.id,
        source: 'agreement_api',
      },
    });

    logger.info(`Agreement voided: ${agreement.id} by ${req.user.email}`);

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /agreements/:id - Delete draft agreement (authenticated)
 */
router.delete('/:id', authMiddleware, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const agreement = await prisma.agreement.findUnique({
      where: { id: req.params.id },
    });

    if (!agreement) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Agreement not found' },
      });
    }

    if (agreement.status !== 'DRAFT') {
      return res.status(400).json({
        success: false,
        error: { code: 'CANNOT_DELETE', message: 'Can only delete draft agreements' },
      });
    }

    await prisma.agreement.delete({ where: { id: req.params.id } });

    logger.info(`Agreement deleted: ${req.params.id} by ${req.user.email}`);

    res.json({ success: true, message: 'Agreement deleted' });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Host Signing Routes (authenticated - in-person counter-signing)
// ==========================================

/**
 * POST /agreements/:id/host-sign - Initiate host signing session (authenticated)
 * This creates an embedded signing session for in-person counter-signing by agent
 */
router.post('/:id/host-sign', authMiddleware, async (req, res, next) => {
  try {
    const { hostName, hostEmail } = req.body;

    if (!hostName) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'hostName is required' },
      });
    }

    const result = await pandaSignService.initiateHostSigning(
      req.params.id,
      {
        name: hostName,
        email: hostEmail || req.user.email,
      },
      req.user.id
    );

    logger.info(`Host signing initiated: ${req.params.id} by ${req.user.email}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /agreements/host-sign/:token - Get agreement for host signing (public - embedded)
 * Used for in-person signing on agent's device
 */
router.get('/host-sign/:token', async (req, res, next) => {
  try {
    const agreement = await pandaSignService.getAgreementByHostToken(req.params.token);

    res.json({
      success: true,
      data: {
        id: agreement.id,
        name: agreement.name,
        status: agreement.status,
        hostSignerName: agreement.hostSignerName,
        documentUrl: agreement.signedDocumentUrl || agreement.documentUrl,
        signatureFields: agreement.template?.signatureFields,
        customerSignedAt: agreement.signedAt,
        customerName: agreement.recipientName,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /agreements/host-sign/:token - Apply host signature (public - embedded)
 * Called from in-person signing interface on agent's device
 */
router.post('/host-sign/:token', async (req, res, next) => {
  try {
    const { signatureData, signerName, signerEmail } = req.body;

    if (!signatureData) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Signature data is required' },
      });
    }

    const result = await pandaSignService.applyHostSignature({
      hostToken: req.params.token,
      signatureData,
      signerName,
      signerEmail,
      ipAddress: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      data: {
        agreementId: result.agreement.id,
        status: result.agreement.status,
        completedAt: result.agreement.completedAt,
        signedDocumentUrl: result.agreement.signedDocumentUrl,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Public Signing Routes (no auth required)
// ==========================================

/**
 * GET /agreements/sign/:token - Get agreement for signing (public)
 */
router.get('/sign/:token', async (req, res, next) => {
  try {
    const agreement = await pandaSignService.getAgreementByToken(req.params.token);

    // Don't expose sensitive data
    res.json({
      success: true,
      data: {
        id: agreement.id,
        name: agreement.name,
        status: agreement.status,
        recipientName: agreement.recipientName,
        documentUrl: agreement.documentUrl,
        signatureFields: agreement.template?.signatureFields,
        expiresAt: agreement.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /agreements/sign/:token - Apply signature (public)
 */
router.post('/sign/:token', async (req, res, next) => {
  try {
    const { signatureData, signerName, signerEmail } = req.body;

    if (!signatureData) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Signature data is required' },
      });
    }

    const result = await pandaSignService.applySignature({
      token: req.params.token,
      signatureData,
      signerName,
      signerEmail,
      ipAddress: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      data: {
        agreementId: result.agreement.id,
        status: result.agreement.status,
        signedAt: result.agreement.signedAt,
        signedDocumentUrl: result.agreement.signedDocumentUrl,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Agreement Templates (Admin)
// ==========================================

/**
 * GET /agreements/templates - List templates (authenticated)
 */
router.get('/templates', authMiddleware, async (req, res, next) => {
  try {
    const { category, isActive } = req.query;

    const where = {};
    if (category) where.category = category;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const templates = await prisma.agreementTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    res.json({ success: true, data: templates });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /agreements/templates/:id - Get single template (authenticated)
 */
router.get('/templates/:id', authMiddleware, async (req, res, next) => {
  try {
    const template = await prisma.agreementTemplate.findUnique({
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
 * POST /agreements/templates - Create template (admin)
 */
router.post('/templates', authMiddleware, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const template = await pandaSignService.upsertTemplate(req.body);

    logger.info(`Agreement template created: ${template.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /agreements/templates/:id - Update template (admin)
 */
router.put('/templates/:id', authMiddleware, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    const template = await pandaSignService.upsertTemplate({
      ...req.body,
      id: req.params.id,
    });

    logger.info(`Agreement template updated: ${template.id} by ${req.user.email}`);

    res.json({ success: true, data: template });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /agreements/templates/:id - Delete template (admin)
 */
router.delete('/templates/:id', authMiddleware, requireRole('admin', 'super_admin'), async (req, res, next) => {
  try {
    // Check if template is in use
    const inUse = await prisma.agreement.count({
      where: { templateId: req.params.id },
    });

    if (inUse > 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'TEMPLATE_IN_USE', message: `Template is used by ${inUse} agreements` },
      });
    }

    await prisma.agreementTemplate.delete({ where: { id: req.params.id } });

    logger.info(`Agreement template deleted: ${req.params.id} by ${req.user.email}`);

    res.json({ success: true, message: 'Template deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /agreements/stats - Get agreement statistics (authenticated)
 */
router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const where = startDate || endDate ? { createdAt: dateFilter } : {};

    const [draft, sent, viewed, signed, voided, total] = await Promise.all([
      prisma.agreement.count({ where: { ...where, status: 'DRAFT' } }),
      prisma.agreement.count({ where: { ...where, status: 'SENT' } }),
      prisma.agreement.count({ where: { ...where, status: 'VIEWED' } }),
      prisma.agreement.count({ where: { ...where, status: 'SIGNED' } }),
      prisma.agreement.count({ where: { ...where, status: 'VOIDED' } }),
      prisma.agreement.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        draft,
        sent,
        viewed,
        signed,
        voided,
        total,
        signedRate: total > 0 ? ((signed / total) * 100).toFixed(1) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Signable Document Integration (Invoice/Quote/WorkOrder)
// ==========================================

/**
 * POST /agreements/signable/invoice/:invoiceId - Create signable invoice
 */
router.post('/signable/invoice/:invoiceId', authMiddleware, async (req, res, next) => {
  try {
    const { recipientEmail, recipientName, sendImmediately } = req.body;

    const result = await pandaSignService.createSignableInvoice(req.params.invoiceId, {
      recipientEmail,
      recipientName,
      userId: req.user.id,
    });

    // Optionally send for signature immediately
    if (sendImmediately && result.agreement) {
      await pandaSignService.sendForSignature(result.agreement.id, req.user.id);
      result.agreement.status = 'SENT';
    }

    logger.info(`Signable invoice created: ${result.agreement.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /agreements/signable/quote/:quoteId - Create signable quote
 */
router.post('/signable/quote/:quoteId', authMiddleware, async (req, res, next) => {
  try {
    const { recipientEmail, recipientName, sendImmediately } = req.body;

    const result = await pandaSignService.createSignableQuote(req.params.quoteId, {
      recipientEmail,
      recipientName,
      userId: req.user.id,
    });

    if (sendImmediately && result.agreement) {
      await pandaSignService.sendForSignature(result.agreement.id, req.user.id);
      result.agreement.status = 'SENT';
    }

    logger.info(`Signable quote created: ${result.agreement.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /agreements/signable/workorder/:workOrderId - Create signable work order
 */
router.post('/signable/workorder/:workOrderId', authMiddleware, async (req, res, next) => {
  try {
    const { recipientEmail, recipientName, sendImmediately } = req.body;

    const result = await pandaSignService.createSignableWorkOrder(req.params.workOrderId, {
      recipientEmail,
      recipientName,
      userId: req.user.id,
    });

    if (sendImmediately && result.agreement) {
      await pandaSignService.sendForSignature(result.agreement.id, req.user.id);
      result.agreement.status = 'SENT';
    }

    logger.info(`Signable work order created: ${result.agreement.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /agreements/signable/pdf - Create signable document from any PDF URL
 */
router.post('/signable/pdf', authMiddleware, async (req, res, next) => {
  try {
    const {
      pdfUrl,
      name,
      recipientEmail,
      recipientName,
      accountId,
      contactId,
      opportunityId,
      category,
      expiresInDays,
      mergeData,
      sendImmediately,
    } = req.body;

    if (!pdfUrl || !name || !recipientEmail || !recipientName) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'pdfUrl, name, recipientEmail, and recipientName are required' },
      });
    }

    const result = await pandaSignService.createSignableFromPdf({
      pdfUrl,
      name,
      recipientEmail,
      recipientName,
      accountId,
      contactId,
      opportunityId,
      category,
      userId: req.user.id,
      expiresInDays,
      mergeData,
    });

    if (sendImmediately && result.agreement) {
      await pandaSignService.sendForSignature(result.agreement.id, req.user.id);
      result.agreement.status = 'SENT';
    }

    logger.info(`Signable PDF created: ${result.agreement.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /agreements/signable/generate-and-send - Generate PDF and send for signature in one step
 */
router.post('/signable/generate-and-send', authMiddleware, async (req, res, next) => {
  try {
    const { type, id, recipientEmail, recipientName, sendImmediately = true } = req.body;

    if (!type || !id) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'type and id are required' },
      });
    }

    const validTypes = ['invoice', 'quote', 'workorder'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_TYPE', message: `type must be one of: ${validTypes.join(', ')}` },
      });
    }

    const result = await pandaSignService.generateAndSendSignable({
      type,
      id,
      recipientEmail,
      recipientName,
      userId: req.user.id,
      sendImmediately,
    });

    logger.info(`Generated and sent signable ${type}: ${result.agreement.id} by ${req.user.email}`);

    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Workflows service URL for trigger execution
const WORKFLOWS_SERVICE_URL = process.env.WORKFLOWS_SERVICE_URL || 'http://workflows-service:3009';

/**
 * POST /agreements/change-order - Create and send change order for price changes/upgrades
 *
 * This endpoint creates a change order document with line items showing
 * upgrade products, original contract amount, amendment amount, and new total.
 *
 * Enhanced workflow (based on Scribe documentation):
 * 1. Agent signs as "Authorized Agent" (in-person)
 * 2. Customer signs remotely via email
 * 3. Case auto-created when change order is sent
 * 4. Case auto-resolved when fully signed
 */
router.post('/change-order', authMiddleware, async (req, res, next) => {
  try {
    const {
      opportunityId,
      accountId,
      recipientName,
      recipientEmail,
      originalAmount,
      amendmentAmount,
      newTotal,
      changeDescription,
      lineItems,
      agentSignature,
      sendImmediately = true,
      createCase = true,
    } = req.body;

    // Validate required fields
    if (!opportunityId || !recipientEmail || !recipientName) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId, recipientEmail, and recipientName are required' },
      });
    }

    if (!lineItems || lineItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'At least one line item is required for a change order' },
      });
    }

    // Get opportunity with account and contact info
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        account: true,
        contact: true,
      },
    });

    if (!opportunity) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Opportunity not found' },
      });
    }

    // Find or create Change Order template
    let template = await prisma.agreementTemplate.findFirst({
      where: { name: { contains: 'Change Order', mode: 'insensitive' } },
    });

    if (!template) {
      // Create a basic change order template if none exists
      template = await prisma.agreementTemplate.create({
        data: {
          name: 'Change Order',
          category: 'CONTRACT_AMENDMENT',
          type: 'CHANGE_ORDER',
          description: 'Contract amendment for price changes and upgrades',
          isActive: true,
          requiredFields: ['originalAmount', 'amendmentAmount', 'newTotal', 'changeDescription'],
        },
      });
    }

    // Format line items for display
    const formattedLineItems = lineItems.map(item => ({
      name: item.name,
      quantity: item.quantity,
      unitPrice: parseFloat(item.unitPrice).toFixed(2),
      total: (item.quantity * item.unitPrice).toFixed(2),
    }));

    // Create merge data for the document
    const mergeData = {
      // Customer Info
      customerName: recipientName,
      customerEmail: recipientEmail,
      accountName: opportunity.account?.name || '',
      propertyAddress: [
        opportunity.account?.billingStreet,
        opportunity.account?.billingCity,
        opportunity.account?.billingState,
        opportunity.account?.billingPostalCode,
      ].filter(Boolean).join(', '),

      // Contract Info
      opportunityName: opportunity.name,
      jobId: opportunity.jobId || opportunity.id,

      // Financial Summary
      originalAmount: parseFloat(originalAmount || 0).toFixed(2),
      amendmentAmount: parseFloat(amendmentAmount || 0).toFixed(2),
      newTotal: parseFloat(newTotal || 0).toFixed(2),

      // Change Details
      changeDescription: changeDescription || '',
      lineItems: formattedLineItems,
      lineItemsHtml: formattedLineItems.map(item =>
        `<tr><td>${item.name}</td><td>${item.quantity}</td><td>$${item.unitPrice}</td><td>$${item.total}</td></tr>`
      ).join(''),

      // Dates
      changeOrderDate: new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
    };

    // Create the agreement
    const agreement = await pandaSignService.createAgreement({
      templateId: template.id,
      opportunityId,
      accountId: accountId || opportunity.accountId,
      contactId: opportunity.contactId,
      recipientEmail,
      recipientName,
      mergeData,
      userId: req.user.id,
      type: 'CHANGE_ORDER',
    });

    // Apply agent signature if provided (agent signs first as "Authorized Agent")
    if (agentSignature && agentSignature.signatureData) {
      logger.info(`Applying agent signature to change order ${agreement.id}`);

      // Create signature record for agent
      await prisma.signature.create({
        data: {
          agreementId: agreement.id,
          signerName: agentSignature.signerName || 'Authorized Agent',
          signerEmail: agentSignature.signerEmail || req.user.email,
          signatureData: agentSignature.signatureData,
          role: agentSignature.role || 'Authorized Agent',
          signedAt: new Date(),
          ipAddress: req.ip || req.headers['x-forwarded-for'],
          userAgent: req.headers['user-agent'],
        },
      });

      // Update agreement to reflect agent has signed
      await prisma.agreement.update({
        where: { id: agreement.id },
        data: {
          agentSignedAt: new Date(),
          agentSignerName: agentSignature.signerName,
          agentSignerEmail: agentSignature.signerEmail,
        },
      });
    }

    // Update opportunity with change order info
    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        changeOrderPending: true,
        changeOrderAmount: parseFloat(amendmentAmount),
        changeOrderDate: new Date(),
      },
    });

    // Send for signature if requested (customer still needs to sign)
    if (sendImmediately && agreement) {
      await pandaSignService.sendForSignature(agreement.id, req.user.id);
      agreement.status = 'SENT';
    }

    // Create case for tracking change order (auto-resolve when fully signed)
    let caseRecord = null;
    if (createCase) {
      try {
        logger.info(`Creating case for change order ${agreement.id}`);

        // Create case via cases service or directly
        caseRecord = await prisma.case.create({
          data: {
            caseNumber: `CO-${Date.now().toString(36).toUpperCase()}`,
            subject: `Change Order - ${opportunity.name || 'Contract Amendment'}`,
            description: `Change order created for ${recipientName}.\n\nAmendment Amount: $${parseFloat(amendmentAmount).toFixed(2)}\nNew Contract Total: $${parseFloat(newTotal).toFixed(2)}\n\nDescription: ${changeDescription}`,
            status: 'WORKING',
            priority: 'NORMAL',
            type: 'Change Order',
            accountId: accountId || opportunity.accountId,
            opportunityId,
            createdById: req.user.id,
          },
        });

        logger.info(`Case created: ${caseRecord.id} for change order ${agreement.id}`);

        // Trigger change order workflow (async)
        try {
          await fetch(`${WORKFLOWS_SERVICE_URL}/api/triggers/change-order-sent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              agreementId: agreement.id,
              caseId: caseRecord.id,
              opportunityId,
              amendmentAmount,
              newTotal,
              userId: req.user.id,
            }),
          });
        } catch (triggerErr) {
          logger.warn('Failed to trigger change order workflow:', triggerErr.message);
        }
      } catch (caseErr) {
        logger.error('Failed to create case for change order:', caseErr);
        // Non-fatal - continue without case
      }
    }

    // Create audit log
    await prisma.auditLog.create({
      data: {
        tableName: 'agreements',
        recordId: agreement.id,
        action: 'CHANGE_ORDER_CREATED',
        newValues: {
          opportunityId,
          originalAmount,
          amendmentAmount,
          newTotal,
          lineItems: lineItems.length,
          agentSigned: !!agentSignature?.signatureData,
          caseId: caseRecord?.id,
        },
        userId: req.user.id,
        source: 'change_order_api',
      },
    });

    logger.info(`Change order created: ${agreement.id} for opportunity ${opportunityId} by ${req.user.email}`);

    res.status(201).json({
      success: true,
      data: {
        agreement,
        changeOrder: {
          originalAmount,
          amendmentAmount,
          newTotal,
          lineItems: formattedLineItems,
        },
        case: caseRecord,
      },
    });
  } catch (error) {
    logger.error('Error creating change order:', error);
    next(error);
  }
});

export default router;
