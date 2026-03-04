/**
 * Slate Documents API Routes (v2)
 *
 * API endpoints for the new WYSIWYG-first document system.
 * Uses Slate.js templates and Gotenberg PDF generation.
 */

import express from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import authMiddleware from '../middleware/auth.js';
import { resolveTokens, validateTokens, extractTokenPaths, findUnresolvedTokens } from '../services/tokenResolver.js';
import { render, extractSignatureAnchorsFromContent } from '../services/slateToHtml.js';
// Use Gotenberg for stable PDF generation (containerized Chromium)
import { generatePdf, generatePreviewPdf, generateForSigning, healthCheck as gotenbergHealthCheck } from '../services/gotenbergPdfGenerator.js';
// DocuSign-style text anchor detection for normalized signature coordinates
import { detectSignatureAnchors, extractAnchorPatternsFromSlate } from '../services/anchorDetectionService.js';
import pandaSignService from '../services/pandaSignService.js';
import { AVAILABLE_MERGE_FIELDS, FIELD_TYPES, SIGNER_ROLES } from '../services/templateService.js';
import { buildAgreementFilenameParts, buildAgreementFolderName, buildContentDisposition } from '../utils/documentNaming.js';
import logger from '../utils/logger.js';

const router = express.Router();

// S3 client for document storage
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET || 'panda-crm-documents';
const PANDASIGN_V2_ENABLED = process.env.PANDASIGN_V2_ENABLED !== 'false';
const DEBUG_ENABLED = process.env.PANDASIGN_DEBUG === 'true';
const DEBUG_TOKEN = process.env.PANDASIGN_DEBUG_TOKEN;
const DEFAULT_OPERATING_STATES = ['MD', 'DE', 'VA', 'PA', 'NJ', 'NC', 'SC'];

function isAdminUser(user) {
  const role = user?.role || user?.roles?.[0] || null;
  return ['ADMIN', 'SUPER_ADMIN', 'OWNER'].includes(String(role || '').toUpperCase());
}

function isDebugEnabled(req) {
  if (!DEBUG_ENABLED) return false;
  if (String(req.query?.debug) !== '1') return false;
  if (isAdminUser(req.user)) return true;
  const headerToken = req.get('x-pandasign-debug-token');
  if (DEBUG_TOKEN && headerToken && headerToken === DEBUG_TOKEN) return true;
  return false;
}

function extractPageMargins(html) {
  const match = html.match(/@page\s*{[\s\S]*?}/i);
  if (!match) return null;
  const block = match[0];
  const getPx = (prop) => {
    const m = block.match(new RegExp(`${prop}\\s*:\\s*([0-9.]+)px`, 'i'));
    return m ? Number(m[1]) : null;
  };
  return {
    topPx: getPx('margin-top'),
    bottomPx: getPx('margin-bottom'),
    leftPx: getPx('margin-left'),
    rightPx: getPx('margin-right'),
  };
}

function extractCssHeight(html, selector) {
  const match = html.match(new RegExp(`${selector}\\s*\\{[\\s\\S]*?height\\s*:\\s*([0-9.]+)px`, 'i'));
  return match ? Number(match[1]) : null;
}

function extractFooterSnippet(html) {
  const footerMatch = html.match(/<footer[^>]*id=["']panda-footer["'][^>]*>([\s\S]*?)<\/footer>/i);
  const footerHtml = footerMatch ? footerMatch[1] : '';
  if (!footerHtml) return null;
  const idx = footerHtml.search(/pageNumber|totalPages/i);
  if (idx === -1) return footerHtml.slice(0, 200);
  return footerHtml.slice(Math.max(0, idx - 100), idx + 200);
}

// Feature-flag all v2 endpoints
router.use((req, res, next) => {
  if (!PANDASIGN_V2_ENABLED) {
    return res.status(503).json({
      success: false,
      error: { code: 'PANDASIGN_V2_DISABLED', message: 'PandaSign v2 is disabled.' },
    });
  }
  return next();
});

/**
 * Helper: Generate unique ID for templates
 */
function generateTemplateId() {
  return `tpl_${Date.now().toString(36)}_${uuidv4().slice(0, 8)}`;
}

/**
 * Helper: Generate unique ID for agreements
 */
function generateAgreementId() {
  return `agr_${Date.now().toString(36)}_${uuidv4().slice(0, 8)}`;
}

/**
 * Helper: Generate agreement number (human-readable)
 */
function generateAgreementNumber() {
  const year = new Date().getFullYear();
  const timestamp = Date.now().toString(36).toUpperCase();
  return `AGR-${year}-${timestamp}`;
}

/**
 * Helper: Generate signing token
 */
function generateSigningToken() {
  return uuidv4().replace(/-/g, '');
}

/**
 * Helper: Upload PDF to S3
 */
async function uploadPdfToS3(pdfBuffer, key) {
  await s3Client.send(new PutObjectCommand({
    Bucket: DOCUMENTS_BUCKET,
    Key: key,
    Body: pdfBuffer,
    ContentType: 'application/pdf',
    // Note: ACL not used - bucket has "bucket owner enforced" mode
  }));

  // Return the S3 key for storage - presigned URLs will be generated on-demand
  return key;
}

/**
 * Helper: Get presigned URL for PDF
 */
async function getPresignedPdfUrl(key, expiresIn = 3600, filename) {
  const command = new GetObjectCommand({
    Bucket: DOCUMENTS_BUCKET,
    Key: key,
    ...(filename ? { ResponseContentDisposition: buildContentDisposition(filename, 'inline') } : {}),
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Helper: Create audit trail entry
 */
async function createAuditEntry(data) {
  return prisma.documentAuditTrail.create({
    data: {
      id: `aud_${Date.now().toString(36)}_${uuidv4().slice(0, 8)}`,
      ...data,
      createdAt: new Date(),
    },
  });
}

// ============================================================================
// DIAGNOSTIC ENDPOINTS
// ============================================================================

/**
 * GET /api/documents/v2/playwright-health
 * Test if Gotenberg PDF generator is reachable (legacy path kept for compatibility)
 */
router.get('/playwright-health', async (req, res) => {
  try {
    logger.info('Testing Gotenberg PDF generator health...');
    const result = await gotenbergHealthCheck();

    if (result.healthy) {
      logger.info('Gotenberg health check passed');
      res.json({
        success: true,
        data: {
          gotenberg: 'healthy',
          message: 'Gotenberg PDF generator is available',
        },
      });
    } else {
      logger.error('Gotenberg health check failed', { error: result.error });
      res.status(500).json({
        success: false,
        error: {
          code: 'GOTENBERG_UNHEALTHY',
          message: result.error || 'Gotenberg is unavailable',
        },
      });
    }
  } catch (error) {
    logger.error('Gotenberg health check error', {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: {
        code: 'GOTENBERG_ERROR',
        message: error.message,
        details: error.stack,
      },
    });
  }
});

// ============================================================================
// TEMPLATE ENDPOINTS
// ============================================================================

/**
 * POST /api/documents/v2/templates
 * Create a new Slate-based template
 */
router.post('/templates', authMiddleware, async (req, res, next) => {
  try {

    const {
      name,
      description,
      category,
      territories,
      content,
      tokenSchema,
      signatureAnchors,
      signerRoles,
      signingOrder = 'SEQUENTIAL',
      brandingProfileId,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    // Extract anchors from content if not provided
    const anchors = signatureAnchors || extractSignatureAnchorsFromContent(content || []);

    const normalizedTerritories = Array.isArray(territories)
      ? Array.from(new Set(
        territories
          .map(state => String(state || '').trim().toUpperCase())
          .filter(Boolean)
      ))
      : [];

    const template = await prisma.documentTemplateV2.create({
      data: {
        id: generateTemplateId(),
        name,
        description,
        category,
        territories: normalizedTerritories,
        content: content || [],
        tokenSchema,
        signatureAnchors: anchors,
        signerRoles: signerRoles || anchors.map(a => a.role),
        signingOrder,
        brandingProfileId,
        createdById: req.user.userId,
        status: 'DRAFT',
        version: 1,
        schemaVersion: '1.0',
        editorType: 'slate',
      },
    });

    logger.info('Created Slate template', { templateId: template.id, name });

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    logger.error('Failed to create template', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/documents/v2/templates
 * List all Slate templates
 */
router.get('/templates', authMiddleware, async (req, res, next) => {
  try {
    const { status, category, search, limit = 50, offset = 0 } = req.query;

    const where = {
      editorType: 'slate',
    };

    if (status) {
      where.status = status;
    }
    if (category) {
      where.category = category;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [templates, total] = await Promise.all([
      prisma.documentTemplateV2.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
        include: {
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          brandingProfile: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.documentTemplateV2.count({ where }),
    ]);

    res.json({
      success: true,
      data: templates,
      pagination: {
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    logger.error('Failed to list templates', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/documents/v2/templates/:id
 * Get a single template with full content
 */
router.get('/templates/:id', authMiddleware, async (req, res, next) => {
  try {
    const template = await prisma.documentTemplateV2.findUnique({
      where: { id: req.params.id },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        brandingProfile: true,
      },
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    logger.error('Failed to get template', { error: error.message });
    next(error);
  }
});

/**
 * PUT /api/documents/v2/templates/:id
 * Update a template (creates new version)
 */
router.put('/templates/:id', authMiddleware, async (req, res, next) => {
  try {

    const { id } = req.params;
    const {
      name,
      description,
      category,
      territories,
      content,
      tokenSchema,
      signatureAnchors,
      signerRoles,
      signingOrder,
      brandingProfileId,
      status,
    } = req.body;

    const existing = await prisma.documentTemplateV2.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Create version snapshot before updating
    await prisma.documentTemplateVersionV2.create({
      data: {
        id: `ver_${Date.now().toString(36)}_${uuidv4().slice(0, 8)}`,
        templateId: id,
        version: existing.version,
        content: existing.content,
        tokenSchema: existing.tokenSchema,
        signatureAnchors: existing.signatureAnchors,
        territories: existing.territories || [],
        createdById: req.user.userId,
      },
    });

    // Update template
    const updateData = {
      version: existing.version + 1,
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (territories !== undefined) {
      updateData.territories = Array.isArray(territories)
        ? Array.from(new Set(
          territories
            .map(state => String(state || '').trim().toUpperCase())
            .filter(Boolean)
        ))
        : [];
    }
    if (content !== undefined) {
      updateData.content = content;
      // Re-extract anchors from updated content
      updateData.signatureAnchors = signatureAnchors || extractSignatureAnchorsFromContent(content);
    }
    if (tokenSchema !== undefined) updateData.tokenSchema = tokenSchema;
    if (signatureAnchors !== undefined) updateData.signatureAnchors = signatureAnchors;
    if (signerRoles !== undefined) updateData.signerRoles = signerRoles;
    if (signingOrder !== undefined) updateData.signingOrder = signingOrder;
    if (brandingProfileId !== undefined) updateData.brandingProfileId = brandingProfileId;
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'PUBLISHED' && !existing.publishedAt) {
        updateData.publishedAt = new Date();
      }
    }

    const template = await prisma.documentTemplateV2.update({
      where: { id },
      data: updateData,
    });

    logger.info('Updated Slate template', { templateId: id, version: template.version });

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    logger.error('Failed to update template', { error: error.message });
    next(error);
  }
});

// ============================================================================
// AGREEMENT & STATS ENDPOINTS (V2)
// ============================================================================

/**
 * GET /api/documents/v2/agreements
 * List v2 agreements (authenticated)
 */
router.get('/agreements', authMiddleware, async (req, res, next) => {
  try {
    const {
      status,
      opportunityId,
      accountId,
      limit = 50,
      page = 1,
      offset,
      search,
    } = req.query;

    const take = Math.max(1, parseInt(limit, 10) || 50);
    const skip = offset !== undefined ? parseInt(offset, 10) || 0 : (Math.max(1, parseInt(page, 10) || 1) - 1) * take;

    const where = {
      slateTemplateId: { not: null },
    };

    if (status) {
      where.status = String(status).toUpperCase();
    }
    if (opportunityId) where.opportunityId = String(opportunityId);
    if (accountId) where.accountId = String(accountId);

    if (search) {
      const searchTerm = String(search);
      where.OR = [
        { name: { contains: searchTerm, mode: 'insensitive' } },
        { agreementNumber: { contains: searchTerm, mode: 'insensitive' } },
        { recipient_name: { contains: searchTerm, mode: 'insensitive' } },
        { recipient_email: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const [agreements, total] = await Promise.all([
      prisma.agreement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
        skip,
      }),
      prisma.agreement.count({ where }),
    ]);

    const templateIds = [...new Set(agreements.map((agr) => agr.slateTemplateId).filter(Boolean))];
    const templates = templateIds.length
      ? await prisma.documentTemplateV2.findMany({
        where: { id: { in: templateIds } },
        select: { id: true, name: true },
      })
      : [];
    const templateMap = templates.reduce((acc, t) => {
      acc[t.id] = t.name;
      return acc;
    }, {});

    const mappedAgreements = agreements.map((agr) => {
      const rawStatus = agr.status ? String(agr.status).toLowerCase() : agr.status;
      const normalizedStatus = rawStatus === 'completed'
        ? 'signed'
        : rawStatus === 'partially_signed'
          ? 'sent'
          : rawStatus;
      return {
        ...agr,
        status: normalizedStatus,
        signerName: agr.recipient_name || null,
        signerEmail: agr.recipient_email || null,
        templateName: templateMap[agr.slateTemplateId] || agr.name,
      };
    });

    res.json({
      success: true,
      data: mappedAgreements,
      pagination: {
        total,
        limit: take,
        offset: skip,
        totalPages: Math.max(1, Math.ceil(total / take)),
      },
    });
  } catch (error) {
    logger.error('Failed to list v2 agreements', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/documents/v2/stats
 * Agreement stats for v2
 */
router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const baseWhere = { slateTemplateId: { not: null } };
    const pendingStatuses = ['SENT', 'VIEWED', 'PARTIALLY_SIGNED'];

    const [total, sent, signed, pending] = await Promise.all([
      prisma.agreement.count({ where: baseWhere }),
      prisma.agreement.count({ where: { ...baseWhere, status: 'SENT' } }),
      prisma.agreement.count({ where: { ...baseWhere, status: 'SIGNED' } }),
      prisma.agreement.count({ where: { ...baseWhere, status: { in: pendingStatuses } } }),
    ]);

    res.json({
      success: true,
      stats: {
        total,
        sent,
        signed,
        pending,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch v2 stats', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/documents/v2/merge-fields/available
 * List available merge fields for v2
 */
router.get('/merge-fields/available', authMiddleware, async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        fields: AVAILABLE_MERGE_FIELDS,
        fieldTypes: FIELD_TYPES,
        signerRoles: SIGNER_ROLES,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch merge fields', { error: error.message });
    next(error);
  }
});

// ============================================================================
// PREVIEW ENDPOINT
// ============================================================================

/**
 * POST /api/documents/v2/preview
 * Generate a preview PDF with resolved tokens
 *
 * Supports:
 * - editableRegions: { [regionId]: content } - Runtime customization values
 * - mergeOverrides: { [field]: value } - Override resolved merge field values
 *
 * Returns previewHash for dirty tracking (must match on send)
 */
router.post('/preview', authMiddleware, async (req, res, next) => {
  const startTime = Date.now();
  let step = 'init';
  const debug = isDebugEnabled(req);

  try {
    const {
      templateId,
      context = {},
      returnUrl = true,
      editableRegions = {},
      mergeOverrides = {},
    } = req.body;

    logger.info('Preview request received', {
      templateId,
      context,
      returnUrl,
      hasEditableRegions: Object.keys(editableRegions).length > 0,
      hasMergeOverrides: Object.keys(mergeOverrides).length > 0,
    });

    if (!templateId) {
      return res.status(400).json({ error: 'templateId is required' });
    }

    // Get template
    step = 'fetch_template';
    logger.info('Fetching template...', { templateId });
    const template = await prisma.documentTemplateV2.findUnique({
      where: { id: templateId },
      include: { brandingProfile: true },
    });

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    logger.info('Template fetched', {
      name: template.name,
      version: template.version,
      contentLength: JSON.stringify(template.content).length,
    });

    // Validate editable regions if provided
    step = 'validate_editable_regions';
    if (Object.keys(editableRegions).length > 0) {
      const { validateAllEditableRegions, validateNoProtectedElements } = await import('../services/editableRegionValidator.js');

      // Validate against template's editable region definitions
      const regionValidation = validateAllEditableRegions(editableRegions, template.editableRegions || []);
      if (!regionValidation.valid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_EDITABLE_REGIONS',
            message: 'Editable region validation failed',
            details: regionValidation.errors,
          },
        });
      }

      // Security check: Ensure no protected elements
      for (const [regionId, content] of Object.entries(editableRegions)) {
        if (Array.isArray(content)) {
          const protectedCheck = validateNoProtectedElements(content);
          if (!protectedCheck.valid) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'PROTECTED_ELEMENT_VIOLATION',
                message: `Editable region '${regionId}' contains protected elements`,
                details: protectedCheck.errors,
              },
            });
          }
        }
      }
    }

    // Resolve tokens
    step = 'resolve_tokens';
    const contextWithBranding = { ...context, brandingProfileId: template.brandingProfileId };
    logger.info('Resolving tokens...', { context: contextWithBranding });
    const { resolvedContent, resolvedTokens, contextData } = await resolveTokens(
      template.content,
      contextWithBranding
    );
    logger.info('Tokens resolved', { tokenCount: Object.keys(resolvedTokens).length });

    const opportunityType = String(contextData?.opportunity?.type || '').toUpperCase();
    const isRetail = opportunityType === 'RETAIL';

    if (!isRetail && Array.isArray(template.territories) && template.territories.length > 0) {
      const customerState = String(
        contextData?.opportunity?.state ||
        contextData?.account?.billingState ||
        contextData?.contact?.mailingState ||
        'DEFAULT'
      ).toUpperCase().trim();
      if (customerState && customerState !== 'DEFAULT' && !template.territories.includes(customerState)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TERRITORY_MISMATCH',
            message: `Template is restricted to ${template.territories.join(', ')}. Job state is ${customerState}.`,
          },
        });
      }
    }

    const unresolvedTokensRaw = findUnresolvedTokens(template.content, contextData);
    const retailIgnoredTokens = isRetail
      ? new Set(['opportunity.claimNumber', 'opportunity.insuranceCarrier'])
      : null;
    const unresolvedTokens = unresolvedTokensRaw.filter(
      token => !Object.prototype.hasOwnProperty.call(mergeOverrides, token)
        && !(retailIgnoredTokens && retailIgnoredTokens.has(token))
    );
    if (unresolvedTokens.length > 0) {
      logger.warn('Unresolved tokens detected during preview', {
        templateId,
        unresolvedTokens,
      });
    }

    // Apply merge overrides to resolved tokens
    const finalResolvedTokens = { ...resolvedTokens, ...mergeOverrides };

    // TODO: Apply editable region content to resolvedContent
    // This requires walking the Slate AST and replacing editable region nodes
    // For now, editable regions are passed separately to the renderer

    // Render to HTML with embedded header/footer (PHASE 1: headers/footers in HTML body)
    step = 'render_html';
    logger.info('Rendering HTML...');
    const { html, branding, pageNumbersEnabled } = await render(resolvedContent, {
      brandingProfileId: template.brandingProfileId,
      title: template.name,
      editableRegions, // Pass to renderer for substitution
      contextData,
    });
    logger.info('HTML rendered', { htmlLength: html.length, hasBranding: !!branding });

    // Generate preview PDF - headers/footers are now embedded in HTML
    step = 'generate_pdf';
    logger.info('Generating PDF with Gotenberg (headers/footers embedded in HTML)...');
    const { pdfBuffer, pageCount } = await generatePreviewPdf(html, { showPageNumbers: pageNumbersEnabled });
    logger.info('PDF generated', { pdfSize: pdfBuffer.length, pageCount });
    const pdfSha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // Generate preview hash for dirty tracking
    step = 'generate_hash';
    const { generatePreviewHash } = await import('../services/editableRegionValidator.js');
    const previewHash = generatePreviewHash({
      templateId,
      templateVersion: template.version,
      resolvedContent,
      editableRegions,
      mergeOverrides,
    });
    logger.info('Preview hash generated', { previewHash: previewHash.slice(0, 16) + '...' });

    if (returnUrl) {
      // Upload to S3 and return presigned URL
      step = 'upload_s3';
      logger.info('Uploading to S3...');
      const key = `previews/${Date.now()}-${templateId}.pdf`;
      await uploadPdfToS3(pdfBuffer, key);

      step = 'get_presigned_url';
      const url = await getPresignedPdfUrl(key, 3600); // 1 hour expiry
      logger.info('Preview complete', { duration: Date.now() - startTime, url: url.slice(0, 100) + '...' });

      const debugPayload = debug ? {
        htmlPreviewFirst2kb: html.slice(0, 2048),
        hasHeader: html.includes('id="panda-header"'),
        hasFooter: html.includes('id="panda-footer"'),
        pageCssMargins: extractPageMargins(html),
        headerHeightPx: extractCssHeight(html, '#panda-header'),
        footerHeightPx: extractCssHeight(html, '#panda-footer'),
        footerHtmlSnippet: extractFooterSnippet(html),
        unresolvedTokens,
        pdfByteLength: pdfBuffer.length,
        pdfSha256,
        s3Key: key,
      } : undefined;

      res.json({
        success: true,
        data: {
          previewUrl: url,
          pageCount,
          resolvedTokens: finalResolvedTokens,
          unresolvedTokens,
          previewHash, // CRITICAL: Client must send this back on /send
          templateVersion: template.version,
        },
        ...(debug ? { debug: debugPayload } : {}),
      });
    } else {
      // Return PDF directly (no hash in response for direct mode)
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="preview-${templateId}.pdf"`);
      res.setHeader('X-Preview-Hash', previewHash);
      res.setHeader('X-Template-Version', String(template.version));
      res.send(pdfBuffer);
    }
  } catch (error) {
    logger.error('Preview generation failed', {
      step,
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime,
    });

    // Return detailed error for debugging
    res.status(500).json({
      success: false,
      error: {
        code: 'PREVIEW_FAILED',
        message: error.message,
        step,
        details: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
      },
    });
  }
});

// ============================================================================
// SEND ENDPOINT
// ============================================================================

/**
 * POST /api/documents/v2/send
 * Send a document for signature
 *
 * CRITICAL: This endpoint enforces document integrity via:
 * 1. previewHash verification - ensures document matches last preview
 * 2. editableRegions validation - validates content doesn't contain protected elements
 * 3. templateVersion snapshotting - locks the template version at send time
 *
 * Request body:
 * - templateId: string (required)
 * - context: { opportunityId, accountId, contactId, ... }
 * - recipientEmail: string (required for single signer)
 * - recipientName: string
 * - recipients: { [role]: { email, name } } (for multi-signer)
 * - message: string
 * - expiresInDays: number (default: 30)
 * - previewHash: string (REQUIRED if preview was generated)
 * - editableRegions: { [regionId]: content }
 * - mergeOverrides: { [field]: value }
 * - instantSign: boolean (for host signing flow)
 */
router.post('/send', authMiddleware, async (req, res, next) => {
  const debug = isDebugEnabled(req);
  try {
    const {
      templateId,
      context = {},
      recipientEmail,
      recipientName,
      recipients, // Multi-signer: { CUSTOMER: { email, name }, AGENT: { email, name } }
      message,
      expiresInDays = 30,
      previewHash, // CRITICAL: Must match preview hash
      editableRegions: rawEditableRegions,
      mergeOverrides: rawMergeOverrides,
      instantSign = false,
    } = req.body;

    // CRITICAL: Normalize undefined to {} for editableRegions and mergeOverrides
    // JavaScript destructuring defaults only apply when key is MISSING, not when value is undefined
    // Frontend may send { editableRegions: undefined } which bypasses the default
    const editableRegions = rawEditableRegions ?? {};
    const mergeOverrides = rawMergeOverrides ?? {};

    // Basic validation
    if (!templateId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_TEMPLATE_ID', message: 'templateId is required' },
      });
    }

    // Require at least one recipient
    const hasRecipients = recipients && Object.keys(recipients).length > 0;
    const hasSingleRecipient = recipientEmail;
    if (!hasRecipients && !hasSingleRecipient) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_RECIPIENT', message: 'recipientEmail or recipients is required' },
      });
    }

    // Determine primary recipient (used for naming and email)
    let primaryEmail = recipientEmail;
    let primaryName = recipientName;
    if (hasRecipients) {
      const firstRole = Object.keys(recipients)[0];
      primaryEmail = recipients[firstRole]?.email;
      primaryName = recipients[firstRole]?.name;
    }

    if (!primaryEmail) {
      logger.error('No primary email determined', {
        recipientEmail,
        hasRecipients,
        recipients,
      });
      return res.status(400).json({
        success: false,
        error: { code: 'NO_PRIMARY_EMAIL', message: 'Could not determine primary recipient email' },
      });
    }

    // Get template with current version
    const template = await prisma.documentTemplateV2.findUnique({
      where: { id: templateId },
      include: { brandingProfile: true },
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: { code: 'TEMPLATE_NOT_FOUND', message: `Template with id '${templateId}' not found` },
      });
    }

    logger.info('Send request received (FULL DEBUG)', {
      templateId,
      templateVersion: template.version,
      hasPreviewHash: !!previewHash,
      previewHashPrefix: previewHash?.slice(0, 16),
      hasEditableRegions: Object.keys(editableRegions).length > 0,
      editableRegionsKeys: Object.keys(editableRegions),
      hasMergeOverrides: Object.keys(mergeOverrides).length > 0,
      mergeOverridesKeys: Object.keys(mergeOverrides),
      hasMultipleRecipients: hasRecipients,
      recipientsKeys: hasRecipients ? Object.keys(recipients) : null,
      recipientEmail,
      recipientName,
      instantSign,
      context,
    });

    // Import validation utilities
    const {
      validateAllEditableRegions,
      validateNoProtectedElements,
      verifyPreviewHash,
      generatePreviewHash,
    } = await import('../services/editableRegionValidator.js');

    // CRITICAL: Validate editable regions before processing
    if (Object.keys(editableRegions).length > 0) {
      // Validate against template's editable region definitions
      const regionValidation = validateAllEditableRegions(editableRegions, template.editableRegions || []);
      if (!regionValidation.valid) {
        logger.warn('Editable region validation failed', { errors: regionValidation.errors });
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_EDITABLE_REGIONS',
            message: 'Editable region validation failed',
            details: regionValidation.errors,
          },
        });
      }

      // Security check: Ensure no protected elements (signatures, tokens)
      for (const [regionId, content] of Object.entries(editableRegions)) {
        if (Array.isArray(content)) {
          const protectedCheck = validateNoProtectedElements(content);
          if (!protectedCheck.valid) {
            logger.error('Protected element violation detected', {
              regionId,
              errors: protectedCheck.errors,
            });
            return res.status(400).json({
              success: false,
              error: {
                code: 'PROTECTED_ELEMENT_VIOLATION',
                message: `Editable region '${regionId}' contains protected elements`,
                details: protectedCheck.errors,
              },
            });
          }
        }
      }
    }

    const contextWithBranding = { ...context, brandingProfileId: template.brandingProfileId };

    // Validate tokens can be resolved
    // Note: We no longer block on missing tokens - we log a warning and proceed
    // The frontend shows missing fields so users can make informed decisions
    let validation;
    try {
      validation = await validateTokens(template.content, contextWithBranding);
      if (!validation.isValid) {
        logger.warn('Some tokens have empty values - proceeding anyway', {
          missingTokens: validation.missing,
          templateId,
          context: contextWithBranding,
        });
        // We continue - empty tokens will be rendered as empty strings
      }
    } catch (validationError) {
      logger.error('Token validation crashed', { error: validationError.message, stack: validationError.stack });
      return res.status(500).json({
        success: false,
        error: { code: 'TOKEN_VALIDATION_ERROR', message: 'Token validation failed', details: validationError.message },
      });
    }

    // Resolve tokens
    let resolvedContent, resolvedTokens, contextData;
    try {
      const resolved = await resolveTokens(template.content, contextWithBranding);
      resolvedContent = resolved.resolvedContent;
      resolvedTokens = resolved.resolvedTokens;
      contextData = resolved.contextData;
      logger.info('Tokens resolved successfully', { tokenCount: Object.keys(resolvedTokens || {}).length });
    } catch (resolveError) {
      logger.error('Token resolution crashed', { error: resolveError.message, stack: resolveError.stack });
      return res.status(500).json({
        success: false,
        error: { code: 'TOKEN_RESOLUTION_ERROR', message: 'Token resolution failed', details: resolveError.message },
      });
    }

    const opportunityType = String(contextData?.opportunity?.type || '').toUpperCase();
    const isRetail = opportunityType === 'RETAIL';

    if (!isRetail && Array.isArray(template.territories) && template.territories.length > 0) {
      const customerState = String(
        contextData?.opportunity?.state ||
        contextData?.account?.billingState ||
        contextData?.contact?.mailingState ||
        'DEFAULT'
      ).toUpperCase().trim();
      if (customerState && customerState !== 'DEFAULT' && !template.territories.includes(customerState)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'TERRITORY_MISMATCH',
            message: `Template is restricted to ${template.territories.join(', ')}. Job state is ${customerState}.`,
          },
        });
      }
    }

    const unresolvedTokensRaw = findUnresolvedTokens(template.content, contextData);
    const retailIgnoredTokens = isRetail
      ? new Set(['opportunity.claimNumber', 'opportunity.insuranceCarrier'])
      : null;
    const unresolvedTokens = unresolvedTokensRaw.filter(
      token => !Object.prototype.hasOwnProperty.call(mergeOverrides, token)
        && !(retailIgnoredTokens && retailIgnoredTokens.has(token))
    );
    if (unresolvedTokens.length > 0) {
      logger.warn('Unresolved tokens detected during send', {
        templateId,
        unresolvedTokens,
      });
    }

    // Apply merge overrides
    const finalResolvedTokens = { ...resolvedTokens, ...mergeOverrides };

    // CRITICAL: Verify preview hash if provided
    // This ensures the document being sent matches what was previewed
    if (previewHash) {
      const hashParams = {
        templateId,
        templateVersion: template.version,
        resolvedContent,
        editableRegions,
        mergeOverrides,
      };

      const isHashValid = verifyPreviewHash(previewHash, hashParams);
      if (!isHashValid) {
        logger.warn('Preview hash mismatch - document may have changed since preview', {
          providedHash: previewHash?.slice(0, 16) + '...',
        });
        // Generate new hash for comparison
        const currentHash = generatePreviewHash(hashParams);
        return res.status(400).json({
          success: false,
          error: {
            code: 'PREVIEW_HASH_MISMATCH',
            message: 'Document has changed since preview. Please preview again before sending.',
            details: {
              expectedHash: currentHash.slice(0, 16) + '...',
              providedHash: previewHash.slice(0, 16) + '...',
            },
          },
        });
      }
      logger.info('Preview hash verified successfully');
    }

    // Render to HTML with embedded header/footer (PHASE 1: headers/footers in HTML body)
    let html, branding;
    let pageNumbersEnabled = false;
    try {
      logger.info('Starting HTML render...');
      const renderResult = await render(resolvedContent, {
        brandingProfileId: template.brandingProfileId,
        title: template.name,
        editableRegions, // Pass for substitution
        contextData,
      });
      html = renderResult.html;
      branding = renderResult.branding;
      pageNumbersEnabled = renderResult.pageNumbersEnabled;
      logger.info('HTML render completed', { htmlLength: html?.length, hasBranding: !!branding });
    } catch (renderError) {
      logger.error('HTML render crashed', { error: renderError.message, stack: renderError.stack });
      return res.status(500).json({
        success: false,
        error: { code: 'RENDER_ERROR', message: 'HTML rendering failed', details: renderError.message },
      });
    }

    // Generate PDF with Gotenberg - headers/footers are now embedded in HTML
    let pdfBuffer, documentHash, signaturePositions, pageCount;
    let anchorDebugInfo = null;
    try {
      logger.info('🔷 [v2/send] Starting PDF generation via Gotenberg (headers/footers embedded in HTML)...', {
        htmlLength: html?.length,
        hasBranding: !!branding,
      });
      const pdfResult = await generateForSigning(html, { showPageNumbers: pageNumbersEnabled });
      pdfBuffer = pdfResult.pdfBuffer;
      documentHash = pdfResult.documentHash;
      pageCount = pdfResult.pageCount;
      logger.info('🔷 [v2/send] PDF generation completed', {
        pageCount,
        pdfSize: pdfBuffer?.length,
        documentHashPrefix: documentHash?.slice(0, 16),
      });

      // =============================================
      // DOCUSIGN-STYLE: Detect text anchors in generated PDF
      // This finds [[SIG_ROLE_ANCHORID]] markers and returns normalized coords
      // =============================================
      try {
        logger.info('🔷 [v2/send] Starting anchor detection in generated PDF...');
        signaturePositions = await detectSignatureAnchors(pdfBuffer, resolvedContent, {
          debug,
          onDebug: (info) => {
            anchorDebugInfo = info;
            logger.info('🔷 [v2/send][debug] Anchor detection info', info);
          },
        });
        logger.info('🔷 [v2/send] Anchor detection completed', {
          signaturePositionCount: signaturePositions?.length,
          anchors: signaturePositions?.map(p => ({
            anchorId: p.anchorId,
            role: p.role,
            page: p.page,
            normalizedX: p.normalizedX?.toFixed(4),
            normalizedY: p.normalizedY?.toFixed(4),
          })),
        });
      } catch (anchorError) {
        logger.warn('🟡 [v2/send] Anchor detection failed, falling back to template positions', {
          error: anchorError.message,
        });
        // Fallback to template's signature anchors if detection fails
        signaturePositions = extractSignatureAnchorsFromContent(resolvedContent) || [];
      }
    } catch (pdfError) {
      logger.error('🔴 [v2/send] PDF generation crashed', { error: pdfError.message, stack: pdfError.stack });
      return res.status(500).json({
        success: false,
        error: { code: 'PDF_GENERATION_ERROR', message: 'PDF generation failed', details: pdfError.message },
      });
    }

    // Ensure every anchor has an entry; missing anchors get a fallback placeholder.
    const expectedAnchors = extractSignatureAnchorsFromContent(resolvedContent) || [];
    if (expectedAnchors.length > 0) {
      const foundIds = new Set((signaturePositions || []).map((pos) => pos.anchorId));
      const missingAnchors = expectedAnchors.filter((anchor) => !foundIds.has(anchor.anchorId));
      if (missingAnchors.length > 0) {
        logger.warn('🟡 [v2/send] Missing anchor detections, adding fallback placeholders', {
          missingCount: missingAnchors.length,
          missingAnchors: missingAnchors.map((a) => ({ anchorId: a.anchorId, role: a.role, label: a.label })),
        });
        signaturePositions = [
          ...(signaturePositions || []),
          ...missingAnchors.map((anchor) => ({
            anchorId: anchor.anchorId,
            role: anchor.role || 'CUSTOMER',
            signerRole: anchor.role || 'CUSTOMER',
            label: anchor.label || `${anchor.role || 'Customer'} Signature`,
            page: anchor.page || 1,
            required: anchor.required !== false,
            resolutionMethod: 'fallback_coordinates',
          })),
        ];
      }
    }

    if (debug) {
      (signaturePositions || []).forEach((pos) => {
        logger.info('🔷 [v2/send][field]', {
          anchorId: pos.anchorId,
          label: pos.label,
          role: pos.role || pos.signerRole,
          page: pos.page,
          method: pos.resolutionMethod || 'unknown',
          x: pos.x,
          y: pos.y,
          width: pos.width,
          height: pos.height,
          normalizedX: pos.normalizedX,
          normalizedY: pos.normalizedY,
        });
      });
    }

    // Upload PDF to S3 (use human-friendly naming)
    const agreementId = generateAgreementId();
    const jobNumber = contextData?.opportunity?.jobId;
    const customerName = contextData?.contact?.fullName || primaryName || contextData?.account?.name;
    const { displayName, keyName } = buildAgreementFilenameParts({
      jobNumber,
      agreementName: template.name,
      customerName,
    });
    const folderName = buildAgreementFolderName(jobNumber, agreementId);
    const pdfKey = `agreements/${folderName}/${keyName}.pdf`;
    let documentUrl;
    try {
      logger.info('🔷 [v2/send] Starting S3 upload...', {
        bucket: DOCUMENTS_BUCKET,
        key: pdfKey,
        pdfSize: pdfBuffer?.length,
      });
      documentUrl = await uploadPdfToS3(pdfBuffer, pdfKey);
      logger.info('🔷 [v2/send] S3 upload completed', {
        bucket: DOCUMENTS_BUCKET,
        documentUrl,
        key: pdfKey,
      });
    } catch (s3Error) {
      logger.error('🔴 [v2/send] S3 upload crashed', {
        error: s3Error.message,
        stack: s3Error.stack,
        bucket: DOCUMENTS_BUCKET,
        key: pdfKey,
      });
      return res.status(500).json({
        success: false,
        error: { code: 'S3_UPLOAD_ERROR', message: 'PDF upload failed', details: s3Error.message },
      });
    }

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    // Generate signing token
    const signingToken = generateSigningToken();

    logger.info('Recipient determined', {
      primaryEmail,
      primaryName,
      fromMultiRecipients: hasRecipients,
    });

    // Create agreement record with version snapshotting
    const agreementNumber = generateAgreementNumber();
    let agreement;
    try {
      logger.info('🔷 [v2/send] Creating agreement record...', {
        agreementId,
        agreementNumber,
        templateId: template.id,
        documentUrl,
        signingToken,
        primaryEmail,
        hasSignaturePositions: !!signaturePositions?.length,
      });
      // CRITICAL: Field names must match Prisma schema exactly
      // - Fields with @map use camelCase (e.g., agreementNumber, templateId)
      // - Fields without @map use snake_case (e.g., recipient_email, sent_by_id)
      agreement = await prisma.agreement.create({
        data: {
          id: agreementId,
          agreementNumber, // Required field - has @map
          name: template.name,
          templateId: template.legacyTemplateId, // Link to legacy if exists - has @map
          slateTemplateId: template.id, // has @map
          slateTemplateVersion: template.version, // CRITICAL: Snapshot template version - has @map
          status: 'SENT',
          // CRITICAL: These fields have NO @map, so use snake_case
          recipient_email: primaryEmail,
          recipient_name: primaryName || primaryEmail?.split('@')[0],
          sent_by_id: req.user.userId,
          // Note: 'message' field does NOT exist in schema - removed
          documentUrl, // has @map
          signingToken, // has @map
          signingUrl: `${process.env.FRONTEND_URL || 'https://crm.pandaadmin.com'}/sign/${signingToken}`, // has @map
          expiresAt, // has @map
          sentAt: new Date(), // has @map
          opportunityId: context.opportunityId, // has @map
          accountId: context.accountId, // has @map
          // Slate-specific fields (all have @map)
          slateContent: resolvedContent,
          resolvedTokens: finalResolvedTokens,
          documentHash,
          signaturePositions,
          previewHash, // Store the verified preview hash
          editableRegionValues: Object.keys(editableRegions).length > 0 ? editableRegions : undefined,
          recipientsConfig: hasRecipients ? recipients : undefined,
        },
      });
      logger.info('Agreement record created', { agreementId: agreement.id });
    } catch (prismaError) {
      logger.error('Prisma agreement create failed', {
        error: prismaError.message,
        code: prismaError.code,
        meta: prismaError.meta,
        stack: prismaError.stack,
      });
      return res.status(500).json({
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Failed to create agreement record', details: prismaError.message },
      });
    }

    // Create audit trail entry
    try {
      await createAuditEntry({
        documentId: agreementId,
        action: 'SENT',
        actorType: 'USER',
        actorId: req.user.userId,
        actorEmail: req.user.email,
        documentHash,
        details: {
          recipientEmail: primaryEmail,
          pageCount,
          signatureCount: signaturePositions?.length || 0,
        },
      });
    } catch (auditError) {
      // Don't fail the whole request for audit errors
      logger.error('Audit entry creation failed (non-fatal)', { error: auditError.message });
    }

    // Send signing email (non-blocking, don't fail request if email fails)
    try {
      logger.info('🔷 [v2/send] Sending signing email...', {
        agreementId,
        recipientEmail: primaryEmail,
        signingUrl: agreement.signingUrl,
      });
      // Build agreement object with expected field names for sendSigningEmail
      const agreementForEmail = {
        id: agreement.id,
        name: agreement.name,
        signingUrl: agreement.signingUrl,
        recipientEmail: primaryEmail,
        recipientName: primaryName || primaryEmail?.split('@')[0],
      };
      await pandaSignService.sendSigningEmail(agreementForEmail);
      logger.info('🔷 [v2/send] Signing email sent successfully', { agreementId, recipientEmail: primaryEmail });
    } catch (emailError) {
      // Log but don't fail the request - agreement was created successfully
      logger.error('🔴 [v2/send] Failed to send signing email (non-fatal)', {
        error: emailError.message,
        stack: emailError.stack,
        code: emailError.code,
        agreementId,
        recipientEmail: primaryEmail,
      });
    }

    logger.info('🔷 [v2/send] Agreement sent for signature successfully', {
      agreementId,
      recipientEmail: primaryEmail,
      templateId,
      signingUrl: agreement.signingUrl,
    });

    const debugPayload = debug ? {
      htmlPreviewFirst2kb: html.slice(0, 2048),
      hasHeader: html.includes('id="panda-header"'),
      hasFooter: html.includes('id="panda-footer"'),
      pageCssMargins: extractPageMargins(html),
      headerHeightPx: extractCssHeight(html, '#panda-header'),
      footerHeightPx: extractCssHeight(html, '#panda-footer'),
      footerHtmlSnippet: extractFooterSnippet(html),
      unresolvedTokens,
      pdfByteLength: pdfBuffer?.length || null,
      pdfSha256: pdfBuffer ? crypto.createHash('sha256').update(pdfBuffer).digest('hex') : null,
      s3Key: pdfKey,
      anchorsFoundCount: anchorDebugInfo?.anchorsFoundCount,
      anchorsFound: anchorDebugInfo?.anchorsFound,
      page1TextSample: anchorDebugInfo?.page1TextSample,
    } : undefined;

    res.status(201).json({
      success: true,
      data: {
        agreement: {
          id: agreement.id,
          agreementNumber: agreement.agreementNumber,
          name: agreement.name,
          status: agreement.status,
          recipientEmail: agreement.recipientEmail,
          recipientName: agreement.recipientName,
          signingToken: agreement.signingToken,
          signingUrl: agreement.signingUrl,
          expiresAt: agreement.expiresAt,
        },
        agreementId,
        signingUrl: agreement.signingUrl,
        signingToken: agreement.signingToken,
        expiresAt,
        documentHash,
        signaturePositions,
        unresolvedTokens,
      },
      ...(debug ? { debug: debugPayload } : {}),
    });
  } catch (error) {
    logger.error('Send failed with unhandled error', { error: error.message, stack: error.stack });
    next(error);
  }
});

// ============================================================================
// SIGNING ENDPOINTS (Public - No Auth)
// ============================================================================

/**
 * GET /api/documents/v2/sign/:token
 * Get agreement info for signing UI (public endpoint)
 */
router.get('/sign/:token', async (req, res, next) => {
  try {
    const debug = isDebugEnabled(req);
    const { token } = req.params;

    const agreement = await prisma.agreement.findFirst({
      where: { signingToken: token },
      include: {
        opportunity: {
          select: { id: true, name: true, jobId: true },
        },
      },
    });

    if (!agreement) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (agreement.status === 'SIGNED' || agreement.status === 'COMPLETED') {
      return res.status(400).json({ error: 'Agreement already signed' });
    }

    if (agreement.status === 'VOIDED' || agreement.status === 'EXPIRED') {
      return res.status(400).json({ error: 'Agreement is no longer valid' });
    }

    if (agreement.expiresAt && new Date() > new Date(agreement.expiresAt)) {
      // Mark as expired
      await prisma.agreement.update({
        where: { id: agreement.id },
        data: { status: 'EXPIRED' },
      });
      return res.status(400).json({ error: 'Agreement has expired' });
    }

    // Get presigned URL for viewing
    // Handle both old s3:// URLs and new key-only storage
    let pdfKey = agreement.documentUrl;
    if (pdfKey.startsWith('s3://')) {
      pdfKey = pdfKey.replace(`s3://${DOCUMENTS_BUCKET}/`, '');
    } else if (pdfKey.startsWith('https://')) {
      // Already a valid URL, use as-is
      pdfKey = null;
    }
    const { displayName } = buildAgreementFilenameParts({
      jobNumber: agreement.opportunity?.jobId,
      agreementName: agreement.name,
      customerName: agreement.recipientName || agreement.recipientEmail,
    });
    const viewUrl = pdfKey
      ? await getPresignedPdfUrl(pdfKey, 3600, displayName ? `${displayName}.pdf` : undefined)
      : agreement.documentUrl;

    // Record view
    if (!agreement.viewedAt) {
      await prisma.agreement.update({
        where: { id: agreement.id },
        data: { viewedAt: new Date() },
      });

      await createAuditEntry({
        documentId: agreement.id,
        action: 'VIEWED',
        actorType: 'SIGNER',
        actorEmail: agreement.recipientEmail,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        documentHash: agreement.documentHash,
      });
    }

    const signaturePositions = Array.isArray(agreement.signaturePositions)
      ? agreement.signaturePositions.map((pos) => {
        if (!pos || (pos.x != null && pos.y != null)) {
          return pos;
        }

        const pageWidth = pos.pageWidth || 612;
        const pageHeight = pos.pageHeight || 792;
        const normalizedWidth = pos.normalizedWidth ?? (200 / pageWidth);
        const normalizedHeight = pos.normalizedHeight ?? (50 / pageHeight);
        const x = (pos.normalizedX ?? 0) * pageWidth;
        const y = (pos.normalizedY ?? 0) * pageHeight;
        const width = normalizedWidth * pageWidth;
        const height = normalizedHeight * pageHeight;

        return {
          ...pos,
          x,
          y,
          width,
          height,
          pageWidth,
          pageHeight,
        };
      })
      : [];

    const fieldPlacements = signaturePositions.map((pos, index) => ({
      id: pos.anchorId || pos.id || `field_${index}`,
      signerRole: pos.role || pos.signerRole || 'CUSTOMER',
      role: pos.role || pos.signerRole || 'CUSTOMER',
      type: (pos.type || 'signature').toLowerCase(),
      label: pos.label,
      required: pos.required !== false,
      page: pos.page,
      x: pos.x,
      y: pos.y,
      width: pos.width,
      height: pos.height,
      normalizedX: pos.normalizedX,
      normalizedY: pos.normalizedY,
      normalizedWidth: pos.normalizedWidth,
      normalizedHeight: pos.normalizedHeight,
      resolutionMethod: pos.resolutionMethod,
    }));

    const debugPayload = debug ? {
      fieldsLength: fieldPlacements.length,
      firstField: fieldPlacements[0] || null,
      pdfUrl: viewUrl,
      pdfS3Key: pdfKey,
    } : undefined;

    if (debug) {
      logger.info('🔷 [v2/sign][debug] Fields to UI', debugPayload);
    }

    res.json({
      success: true,
      data: {
        agreementId: agreement.id,
        name: agreement.name,
        recipientName: agreement.recipientName,
        recipientEmail: agreement.recipientEmail,
        message: agreement.message,
        documentUrl: viewUrl,
        signaturePositions,
        fieldPlacements,
        documentHash: agreement.documentHash,
        opportunity: agreement.opportunity,
      },
      ...(debug ? { debug: debugPayload } : {}),
    });
  } catch (error) {
    logger.error('Get signing info failed', { error: error.message });
    next(error);
  }
});

/**
 * POST /api/documents/v2/sign/:token
 * Submit signature (public endpoint)
 */
router.post('/sign/:token', async (req, res, next) => {
  try {
    const { token } = req.params;
    const {
      signatureData, // Base64 encoded signature image or typed name
      signatureType = 'DRAWN', // DRAWN, TYPED, UPLOADED
      signedFields, // Array of anchorIds that were signed
      signatureFieldsNormalized, // Normalized positions (0-1 range) from signing UI
    } = req.body;

    if (!signatureData) {
      return res.status(400).json({ error: 'signatureData is required' });
    }

    const agreement = await prisma.agreement.findFirst({
      where: { signingToken: token },
    });

    if (!agreement) {
      return res.status(404).json({ error: 'Agreement not found' });
    }

    if (agreement.status !== 'SENT') {
      return res.status(400).json({ error: 'Agreement cannot be signed' });
    }

    // Verify document integrity
    // (In production, would re-generate PDF and compare hash)

    // Create signature record
    const signature = await prisma.signature.create({
      data: {
        id: `sig_${Date.now().toString(36)}_${uuidv4().slice(0, 8)}`,
        agreementId: agreement.id,
        signerEmail: agreement.recipientEmail,
        signerName: agreement.recipientName,
        signatureType,
        signatureData,
        signedAt: new Date(),
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });

    if (Array.isArray(signatureFieldsNormalized) && signatureFieldsNormalized.length > 0) {
      try {
        // Replace existing fields to keep positions in sync with the signing UI
        await prisma.signatureField.deleteMany({
          where: { agreementId: agreement.id },
        });

        await prisma.signatureField.createMany({
          data: signatureFieldsNormalized.map((field) => ({
            agreementId: agreement.id,
            role: (field.signerRole || field.role || 'CUSTOMER').toUpperCase(),
            page: field.page || 1,
            xPct: field.xPct ?? 0,
            yPct: field.yPct ?? 0,
            widthPct: field.widthPct ?? 0.33,
            heightPct: field.heightPct ?? 0.065,
            fieldType: (field.type || 'SIGNATURE').toString().toUpperCase(),
            label: field.label || null,
            required: field.required !== false,
            signed: false,
          })),
        });
      } catch (fieldErr) {
        logger.error('Failed to store signature field positions (non-fatal)', {
          error: fieldErr.message,
          agreementId: agreement.id,
        });
      }
    }

    // Update agreement status
    await prisma.agreement.update({
      where: { id: agreement.id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
      },
    });

    // Create audit trail entry
    await createAuditEntry({
      documentId: agreement.id,
      action: 'SIGNED',
      actorType: 'SIGNER',
      actorEmail: agreement.recipientEmail,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      documentHash: agreement.documentHash,
      details: {
        signatureType,
        signedFields,
      },
    });

    // Generate signed PDF with embedded signature
    let signedDocumentUrl = null;
    let finalStatus = 'SIGNED';
    try {
      logger.info('🔷 [v2/sign] Finalizing signed agreement...', { agreementId: agreement.id });
      const finalizeResult = await pandaSignService.finalizeSignedAgreement(agreement.id);
      signedDocumentUrl = finalizeResult?.signedDocumentUrl;
      finalStatus = 'COMPLETED';
      logger.info('🔷 [v2/sign] Agreement finalized successfully', {
        agreementId: agreement.id,
        signedDocumentUrl,
      });
    } catch (finalizeError) {
      // Log but don't fail - the signature was recorded
      logger.error('🔴 [v2/sign] Failed to finalize signed PDF (non-fatal)', {
        error: finalizeError.message,
        agreementId: agreement.id,
      });
    }

    // Send confirmation email
    try {
      logger.info('🔷 [v2/sign] Sending completion email...', { agreementId: agreement.id });
      // Re-fetch agreement to get updated data
      const finalizedAgreement = await prisma.agreement.findUnique({
        where: { id: agreement.id },
      });
      await pandaSignService.sendCompletionEmails(finalizedAgreement, signature);
      logger.info('🔷 [v2/sign] Completion email sent', { agreementId: agreement.id });
    } catch (emailError) {
      logger.error('🔴 [v2/sign] Failed to send completion email (non-fatal)', {
        error: emailError.message,
        agreementId: agreement.id,
      });
    }

    logger.info('🔷 [v2/sign] Agreement signed', {
      agreementId: agreement.id,
      signerEmail: agreement.recipientEmail,
      finalStatus,
    });

    res.json({
      success: true,
      data: {
        agreementId: agreement.id,
        signedAt: signature.signedAt,
        status: finalStatus,
        signedDocumentUrl,
        isCompleted: finalStatus === 'COMPLETED',
      },
    });
  } catch (error) {
    logger.error('Signing failed', { error: error.message });
    next(error);
  }
});

// ============================================================================
// IMAGE UPLOAD ENDPOINT
// ============================================================================

/**
 * POST /api/documents/v2/upload-image
 * Upload an image for use in branding profiles or templates
 */
router.post('/upload-image', authMiddleware, async (req, res, next) => {
  try {
    const { filename, contentType, content } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'No image content provided',
      });
    }

    // Validate content type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    const mimeType = contentType || 'image/png';
    if (!allowedTypes.includes(mimeType)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid image type. Allowed: JPEG, PNG, GIF, WebP, SVG',
      });
    }

    // Decode base64 content
    const buffer = Buffer.from(content, 'base64');

    // Validate size (max 5MB)
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({
        success: false,
        error: 'Image too large. Maximum size is 5MB.',
      });
    }

    // Generate unique key
    const ext = mimeType.split('/')[1] === 'svg+xml' ? 'svg' : mimeType.split('/')[1];
    const key = `branding-images/${Date.now()}-${filename || `image.${ext}`}`;

    // Upload to S3 (without ACL - bucket may have public access blocked)
    await s3Client.send(new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }));

    // Generate a presigned URL that expires in 1 year (effectively public for our use case)
    const presignedUrl = await getSignedUrl(s3Client, new GetObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: key,
    }), { expiresIn: 31536000 }); // 1 year

    logger.info('Image uploaded', { key, size: buffer.length, contentType: mimeType });

    res.json({
      success: true,
      data: { url: presignedUrl },
    });
  } catch (error) {
    logger.error('Image upload failed', { error: error.message });
    next(error);
  }
});

// ============================================================================
// BRANDING PROFILE ENDPOINTS
// ============================================================================

/**
 * GET /api/documents/v2/branding-profiles
 * List branding profiles
 */
router.get('/branding-profiles', authMiddleware, async (req, res, next) => {
  try {
    const profiles = await prisma.brandingProfile.findMany({
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    res.json({
      success: true,
      data: profiles,
    });
  } catch (error) {
    logger.error('Failed to list branding profiles', { error: error.message });
    next(error);
  }
});

/**
 * POST /api/documents/v2/branding-profiles
 * Create a branding profile
 */
router.post('/branding-profiles', authMiddleware, async (req, res, next) => {
  try {

    const {
      name,
      logoUrl,
      logoWidth,
      logoHeight,
      primaryColor,
      secondaryColor,
      accentColor,
      textColor,
      headingFont,
      bodyFont,
      fontSize,
      lineHeight,
      pageSize,
      marginTop,
      marginBottom,
      marginLeft,
      marginRight,
      headerHtml,
      footerHtml,
      showPageNumbers,
      isDefault,
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      companyWebsite,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Profile name is required' });
    }

    // If setting as default, unset other defaults
    if (isDefault) {
      await prisma.brandingProfile.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const profile = await prisma.brandingProfile.create({
      data: {
        id: `brnd_${Date.now().toString(36)}_${uuidv4().slice(0, 8)}`,
        name,
        logoUrl,
        logoWidth,
        logoHeight,
        primaryColor,
        secondaryColor,
        accentColor,
        textColor,
        headingFont,
        bodyFont,
        fontSize,
        lineHeight,
        pageSize,
        marginTop,
        marginBottom,
        marginLeft,
        marginRight,
        headerHtml,
        footerHtml,
        showPageNumbers,
        isDefault: isDefault || false,
        companyName,
        companyAddress,
        companyPhone,
        companyEmail,
        companyWebsite,
      },
    });

    res.status(201).json({
      success: true,
      data: profile,
    });
  } catch (error) {
    logger.error('Failed to create branding profile', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/documents/v2/branding-profiles/:id
 * Get a single branding profile
 */
router.get('/branding-profiles/:id', authMiddleware, async (req, res, next) => {
  try {
    const profile = await prisma.brandingProfile.findUnique({
      where: { id: req.params.id },
    });

    if (!profile) {
      return res.status(404).json({ error: 'Branding profile not found' });
    }

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    logger.error('Failed to get branding profile', { error: error.message });
    next(error);
  }
});

/**
 * PUT /api/documents/v2/branding-profiles/:id
 * Update a branding profile
 */
router.put('/branding-profiles/:id', authMiddleware, async (req, res, next) => {
  try {

    const { id } = req.params;
    const {
      name,
      logoUrl,
      logoWidth,
      logoHeight,
      primaryColor,
      secondaryColor,
      accentColor,
      textColor,
      headingFont,
      bodyFont,
      fontSize,
      lineHeight,
      pageSize,
      marginTop,
      marginBottom,
      marginLeft,
      marginRight,
      headerHtml,
      footerHtml,
      showPageNumbers,
      isDefault,
      companyName,
      companyAddress,
      companyPhone,
      companyEmail,
      companyWebsite,
    } = req.body;

    const existing = await prisma.brandingProfile.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Branding profile not found' });
    }

    // If setting as default, unset other defaults
    if (isDefault && !existing.isDefault) {
      await prisma.brandingProfile.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
    if (logoWidth !== undefined) updateData.logoWidth = logoWidth;
    if (logoHeight !== undefined) updateData.logoHeight = logoHeight;
    if (primaryColor !== undefined) updateData.primaryColor = primaryColor;
    if (secondaryColor !== undefined) updateData.secondaryColor = secondaryColor;
    if (accentColor !== undefined) updateData.accentColor = accentColor;
    if (textColor !== undefined) updateData.textColor = textColor;
    if (headingFont !== undefined) updateData.headingFont = headingFont;
    if (bodyFont !== undefined) updateData.bodyFont = bodyFont;
    if (fontSize !== undefined) updateData.fontSize = fontSize;
    if (lineHeight !== undefined) updateData.lineHeight = lineHeight;
    if (pageSize !== undefined) updateData.pageSize = pageSize;
    if (marginTop !== undefined) updateData.marginTop = marginTop;
    if (marginBottom !== undefined) updateData.marginBottom = marginBottom;
    if (marginLeft !== undefined) updateData.marginLeft = marginLeft;
    if (marginRight !== undefined) updateData.marginRight = marginRight;
    if (headerHtml !== undefined) updateData.headerHtml = headerHtml;
    if (footerHtml !== undefined) updateData.footerHtml = footerHtml;
    if (showPageNumbers !== undefined) updateData.showPageNumbers = showPageNumbers;
    if (isDefault !== undefined) updateData.isDefault = isDefault;
    if (companyName !== undefined) updateData.companyName = companyName;
    if (companyAddress !== undefined) updateData.companyAddress = companyAddress;
    if (companyPhone !== undefined) updateData.companyPhone = companyPhone;
    if (companyEmail !== undefined) updateData.companyEmail = companyEmail;
    if (companyWebsite !== undefined) updateData.companyWebsite = companyWebsite;

    const profile = await prisma.brandingProfile.update({
      where: { id },
      data: updateData,
    });

    logger.info('Updated branding profile', { profileId: id });

    res.json({
      success: true,
      data: profile,
    });
  } catch (error) {
    logger.error('Failed to update branding profile', { error: error.message });
    next(error);
  }
});

/**
 * DELETE /api/documents/v2/branding-profiles/:id
 * Delete a branding profile
 */
router.delete('/branding-profiles/:id', authMiddleware, async (req, res, next) => {
  try {

    const { id } = req.params;

    const existing = await prisma.brandingProfile.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Branding profile not found' });
    }

    // Check if this profile is in use by any templates
    const templatesUsingProfile = await prisma.documentTemplateV2.count({
      where: { brandingProfileId: id },
    });

    if (templatesUsingProfile > 0) {
      return res.status(400).json({
        error: `Cannot delete - this profile is used by ${templatesUsingProfile} template(s)`,
      });
    }

    await prisma.brandingProfile.delete({
      where: { id },
    });

    logger.info('Deleted branding profile', { profileId: id });

    res.json({
      success: true,
      message: 'Branding profile deleted',
    });
  } catch (error) {
    logger.error('Failed to delete branding profile', { error: error.message });
    next(error);
  }
});

// ============================================================================
// TOKEN/MERGE FIELD ENDPOINTS
// ============================================================================

/**
 * GET /api/documents/v2/merge-fields
 * Get available merge fields for template tokens
 */
router.get('/merge-fields', authMiddleware, async (req, res, next) => {
  try {
    const mergeFields = {
      // System fields (always available)
      system: {
        label: 'System',
        fields: [
          { path: 'system.currentDate', label: 'Current Date', type: 'date', example: 'January 28, 2026' },
          { path: 'system.currentTime', label: 'Current Time', type: 'time', example: '2:30 PM' },
          { path: 'system.currentDateTime', label: 'Current Date & Time', type: 'datetime', example: 'January 28, 2026 2:30 PM' },
          { path: 'system.companyName', label: 'Company Name', type: 'text', example: 'Panda Exteriors' },
          { path: 'system.companyPhone', label: 'Company Phone', type: 'text', example: '(888) 555-0123' },
          { path: 'system.companyEmail', label: 'Company Email', type: 'text', example: 'info@pandaexteriors.com' },
          { path: 'system.companyAddress', label: 'Company Address', type: 'text', example: '123 Main Street, Baltimore, MD 21201' },
          { path: 'system.companyLogo', label: 'Company Logo URL', type: 'url', example: 'https://...' },
          { path: 'system.officeName', label: 'Office Name (by job state)', type: 'text', example: 'Panda Exteriors - Maryland' },
          { path: 'system.officePhone', label: 'Office Phone (by job state)', type: 'text', example: '(410) 555-0101' },
          { path: 'system.officeEmail', label: 'Office Email (by job state)', type: 'text', example: 'md@pandaexteriors.com' },
          { path: 'system.officeAddress', label: 'Office Address (by job state)', type: 'text', example: '123 Main St, Baltimore, MD 21201' },
          { path: 'system.officeWebsite', label: 'Office Website (by job state)', type: 'text', example: 'https://pandaexteriors.com' },
          { path: 'system.officeState', label: 'Office State (by job state)', type: 'text', example: 'MD' },
          { path: 'system.rescissionClause', label: 'Rescission Clause', type: 'text', example: 'State-specific rescission language...' },
        ],
      },
      rescission: {
        label: 'Rescission',
        fields: [
          { path: 'rescission.clause', label: 'Rescission Clause', type: 'text', example: 'State-specific rescission language...' },
        ],
      },
      // Opportunity/Job fields
      opportunity: {
        label: 'Job/Opportunity',
        fields: [
          { path: 'opportunity.name', label: 'Job Name', type: 'text', example: 'Smith Roof Replacement' },
          { path: 'opportunity.jobId', label: 'Job ID', type: 'text', example: 'JOB-2026-0001' },
          { path: 'opportunity.amount', label: 'Contract Amount', type: 'currency', example: '$15,000.00' },
          { path: 'opportunity.stage', label: 'Stage', type: 'text', example: 'Contract Signed' },
          { path: 'opportunity.workType', label: 'Work Type', type: 'text', example: 'Insurance Roofing' },
          { path: 'opportunity.street', label: 'Job Street', type: 'text', example: '456 Oak Ave' },
          { path: 'opportunity.city', label: 'Job City', type: 'text', example: 'Baltimore' },
          { path: 'opportunity.state', label: 'Job State', type: 'text', example: 'MD' },
          { path: 'opportunity.postalCode', label: 'Job ZIP', type: 'text', example: '21224' },
          { path: 'opportunity.fullAddress', label: 'Full Job Address', type: 'text', example: '456 Oak Ave, Baltimore, MD 21224' },
          { path: 'opportunity.claimNumber', label: 'Claim Number', type: 'text', example: 'CLM-123456' },
          { path: 'opportunity.insuranceCarrier', label: 'Insurance Carrier', type: 'text', example: 'State Farm' },
          { path: 'opportunity.deductible', label: 'Deductible', type: 'currency', example: '$1,000.00' },
          { path: 'opportunity.dateOfLoss', label: 'Date of Loss', type: 'date', example: 'March 15, 2026' },
          { path: 'opportunity.closeDate', label: 'Close Date', type: 'date', example: 'January 30, 2026' },
          { path: 'opportunity.description', label: 'Description', type: 'text', example: 'Full roof replacement...' },
        ],
      },
      // Contact fields
      contact: {
        label: 'Contact',
        fields: [
          { path: 'contact.firstName', label: 'First Name', type: 'text', example: 'John' },
          { path: 'contact.lastName', label: 'Last Name', type: 'text', example: 'Smith' },
          { path: 'contact.fullName', label: 'Full Name', type: 'text', example: 'John Smith' },
          { path: 'contact.email', label: 'Email', type: 'email', example: 'john.smith@email.com' },
          { path: 'contact.phone', label: 'Phone', type: 'phone', example: '(555) 123-4567' },
          { path: 'contact.mobilePhone', label: 'Mobile Phone', type: 'phone', example: '(555) 987-6543' },
          { path: 'contact.title', label: 'Title', type: 'text', example: 'Homeowner' },
        ],
      },
      // Account fields
      account: {
        label: 'Account',
        fields: [
          { path: 'account.name', label: 'Account Name', type: 'text', example: 'Smith Residence' },
          { path: 'account.phone', label: 'Account Phone', type: 'phone', example: '(555) 123-4567' },
          { path: 'account.billingStreet', label: 'Billing Street', type: 'text', example: '456 Oak Ave' },
          { path: 'account.billingCity', label: 'Billing City', type: 'text', example: 'Baltimore' },
          { path: 'account.billingState', label: 'Billing State', type: 'text', example: 'MD' },
          { path: 'account.billingPostalCode', label: 'Billing ZIP', type: 'text', example: '21224' },
          { path: 'account.billingAddress', label: 'Full Billing Address', type: 'text', example: '456 Oak Ave, Baltimore, MD 21224' },
        ],
      },
      // Work Order fields
      workOrder: {
        label: 'Work Order',
        fields: [
          { path: 'workOrder.workOrderNumber', label: 'Work Order Number', type: 'text', example: 'WO-2026-0001' },
          { path: 'workOrder.subject', label: 'Subject', type: 'text', example: 'Roof Installation' },
          { path: 'workOrder.description', label: 'Description', type: 'text', example: 'Install new architectural shingles...' },
          { path: 'workOrder.totalPrice', label: 'Total Price', type: 'currency', example: '$15,000.00' },
          { path: 'workOrder.laborTotal', label: 'Labor Total', type: 'currency', example: '$8,000.00' },
          { path: 'workOrder.materialTotal', label: 'Material Total', type: 'currency', example: '$7,000.00' },
          { path: 'workOrder.startDate', label: 'Start Date', type: 'date', example: 'February 1, 2026' },
          { path: 'workOrder.endDate', label: 'End Date', type: 'date', example: 'February 3, 2026' },
          { path: 'workOrder.lineItemsList', label: 'Line Items (formatted)', type: 'html', example: '• Item 1: $100.00\n• Item 2: $200.00' },
        ],
      },
      // User/Rep fields
      user: {
        label: 'Sales Rep / User',
        fields: [
          { path: 'user.firstName', label: 'Rep First Name', type: 'text', example: 'Mike' },
          { path: 'user.lastName', label: 'Rep Last Name', type: 'text', example: 'Johnson' },
          { path: 'user.fullName', label: 'Rep Full Name', type: 'text', example: 'Mike Johnson' },
          { path: 'user.email', label: 'Rep Email', type: 'email', example: 'mike@pandaexteriors.com' },
          { path: 'user.phone', label: 'Rep Phone', type: 'phone', example: '(555) 555-0199' },
          { path: 'user.title', label: 'Rep Title', type: 'text', example: 'Sales Representative' },
        ],
      },
      // Quote fields
      quote: {
        label: 'Quote',
        fields: [
          { path: 'quote.quoteNumber', label: 'Quote Number', type: 'text', example: 'QT-2026-0001' },
          { path: 'quote.totalAmount', label: 'Total Amount', type: 'currency', example: '$15,000.00' },
          { path: 'quote.discount', label: 'Discount', type: 'currency', example: '$500.00' },
          { path: 'quote.subtotal', label: 'Subtotal', type: 'currency', example: '$14,500.00' },
          { path: 'quote.validUntil', label: 'Valid Until', type: 'date', example: 'February 15, 2026' },
          { path: 'quote.lineItemsList', label: 'Line Items (formatted)', type: 'html', example: '• Item 1: $100.00\n• Item 2: $200.00' },
        ],
      },
    };

    res.json({
      success: true,
      data: mergeFields,
    });
  } catch (error) {
    logger.error('Failed to get merge fields', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/documents/v2/operating-states
 * Return active operating states for PandaSign/location mapping
 */
router.get('/operating-states', authMiddleware, async (req, res, next) => {
  try {
    const includeDefault = req.query.includeDefault !== 'false';

    const territories = await prisma.territory.findMany({
      where: { isActive: true },
      select: { states: true },
    });

    const statesSet = new Set();
    for (const territory of territories) {
      (territory.states || []).forEach((state) => {
        if (state) statesSet.add(state.toUpperCase().trim());
      });
    }

    if (statesSet.size === 0) {
      const envStates = (process.env.OPERATING_STATES || '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      envStates.forEach((s) => statesSet.add(s));
    }

    if (statesSet.size === 0) {
      DEFAULT_OPERATING_STATES.forEach((s) => statesSet.add(s));
    }

    let states = Array.from(statesSet).filter(Boolean).sort();
    if (includeDefault) {
      states = ['DEFAULT', ...states.filter((s) => s !== 'DEFAULT')];
    }

    res.json({
      success: true,
      data: states,
    });
  } catch (error) {
    logger.error('Failed to get operating states', { error: error.message });
    next(error);
  }
});

export default router;
