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

export default router;
