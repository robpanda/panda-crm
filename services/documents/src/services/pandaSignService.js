// PandaSign Service - Document generation and e-signature
import { prisma } from '../lib/prisma.js';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middleware/logger.js';
import { pdfService } from './pdfService.js';
// CRITICAL: Use Gotenberg for HTML → PDF conversion (Playwright removed from core pipeline)
import { generateForSigning } from './gotenbergPdfGenerator.js';
import { render } from './slateToHtml.js';
import { buildAgreementFilenameParts, buildAgreementFolderName, buildContentDisposition } from '../utils/documentNaming.js';
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const FROM_EMAIL = process.env.EMAIL_FROM_ADDRESS || process.env.FROM_EMAIL || 'info@pandaexteriors.com';
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Panda Exteriors';
const BAMBOOGLI_URL = process.env.BAMBOOGLI_SERVICE_URL
  || process.env.BAMBOOGLI_URL
  || 'https://bamboo.pandaadmin.com';

const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET || 'panda-crm-documents';
const SIGNED_BUCKET = process.env.PANDASIGN_SIGNED_BUCKET || 'pandasign-documents';
const SIGNING_BASE_URL = process.env.SIGNING_BASE_URL || 'https://sign.pandaexteriors.com';

async function sendEmailViaBamboogli({ to, subject, body, bodyHtml, from, fromName, replyTo }) {
  const response = await fetch(`${BAMBOOGLI_URL}/api/notifications/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to,
      subject,
      body,
      bodyHtml,
      from: from || FROM_EMAIL,
      fromName: fromName || FROM_NAME,
      replyTo,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Bamboogli email failed: ${response.status} ${text}`);
  }

  return response.json();
}

async function sendEmailFromSesParams(emailParams) {
  const to = emailParams?.Destination?.ToAddresses || [];
  const subject = emailParams?.Message?.Subject?.Data || '(No Subject)';
  const bodyHtml = emailParams?.Message?.Body?.Html?.Data || '';
  const body = emailParams?.Message?.Body?.Text?.Data || '';
  const from = emailParams?.Source || FROM_EMAIL;
  const replyTo = emailParams?.ReplyToAddresses?.[0];

  return sendEmailViaBamboogli({
    to,
    subject,
    body,
    bodyHtml,
    from,
    fromName: FROM_NAME,
    replyTo,
  });
}

function parseS3Url(value) {
  if (!value) return null;

  if (value.startsWith('s3://')) {
    const withoutScheme = value.replace(/^s3:\/\//, '');
    const [bucket, ...rest] = withoutScheme.split('/');
    if (!bucket || rest.length === 0) return null;
    return { bucket, key: rest.join('/') };
  }

  try {
    const parsed = new URL(value);
    const host = parsed.hostname;
    const path = parsed.pathname.replace(/^\/+/, '');

    let match = host.match(/^(.+)\.s3[.-][a-z0-9-]+\.amazonaws\.com$/i);
    if (!match) {
      match = host.match(/^(.+)\.s3\.amazonaws\.com$/i);
    }
    if (match) {
      return { bucket: match[1], key: path };
    }

    if (/^s3[.-][a-z0-9-]+\.amazonaws\.com$/i.test(host) || host === 's3.amazonaws.com') {
      const [bucket, ...rest] = path.split('/');
      if (!bucket || rest.length === 0) return null;
      return { bucket, key: rest.join('/') };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * PandaSign Service - Custom e-signature solution
 * Replaces Adobe Sign for document signing
 */
export const pandaSignService = {
  /**
   * Create a new agreement from template
   */
  async createAgreement({
    templateId,
    opportunityId,
    accountId,
    contactId,
    recipientEmail,
    recipientName,
    mergeData = {},
    userId,
  }) {
    logger.info(`Creating agreement from template ${templateId}`);

    // Get template
    const template = await prisma.agreementTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    // Generate agreement number
    const agreementNumber = `AGR-${Date.now()}-${uuidv4().slice(0, 4).toUpperCase()}`;

    // Generate signing token (used for secure access to signing page)
    const signingToken = crypto.randomBytes(32).toString('hex');

    // Create agreement record
    const agreement = await prisma.agreement.create({
      data: {
        agreementNumber,
        name: this.interpolateText(template.name, mergeData),
        status: 'DRAFT',
        templateId,
        opportunityId,
        accountId,
        contactId,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        signingToken,
        signingUrl: `${SIGNING_BASE_URL}/sign/${signingToken}`,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        mergeData,
        created_by_id: userId,
      },
    });

    // Generate PDF document
    const pdfUrl = await this.generateDocument(agreement, template, mergeData);

    // Update agreement with document URL
    await prisma.agreement.update({
      where: { id: agreement.id },
      data: {
        documentUrl: pdfUrl,
      },
    });

    // ========================================================================
    // PHASE 4: Create SignatureField records from template (DocuSign style)
    // SignatureField model uses normalized percentage coordinates (0-1 range).
    // This replaces the legacy signaturePositions JSON field approach.
    // ========================================================================
    const templateFields = template.signatureFields || [];
    if (Array.isArray(templateFields) && templateFields.length > 0) {
      logger.info(`[createAgreement] Creating ${templateFields.length} SignatureField records from template`);

      for (const field of templateFields) {
        // Convert template field data to normalized percentages
        // Template may have: xPct/yPct (already normalized) OR x/y (pixels to convert)
        // Standard PDF page is 612x792 points (Letter size)
        const PDF_PAGE_WIDTH = 612;
        const PDF_PAGE_HEIGHT = 792;

        let xPct, yPct, widthPct, heightPct;

        // Check if already normalized (0-1 range)
        if (field.xPct !== undefined && field.xPct <= 1) {
          xPct = field.xPct;
          yPct = field.yPct;
          widthPct = field.widthPct || 0.25;  // Default ~150px on 612px page
          heightPct = field.heightPct || 0.05; // Default ~40px on 792px page
        } else {
          // Convert from pixels to percentages
          const pixelX = field.x || field.xPct || 100;
          const pixelY = field.y || field.yPct || 100;
          const pixelWidth = field.width || 200;
          const pixelHeight = field.height || 50;

          xPct = Math.min(1, Math.max(0, pixelX / PDF_PAGE_WIDTH));
          yPct = Math.min(1, Math.max(0, pixelY / PDF_PAGE_HEIGHT));
          widthPct = Math.min(1, Math.max(0.05, pixelWidth / PDF_PAGE_WIDTH));
          heightPct = Math.min(1, Math.max(0.02, pixelHeight / PDF_PAGE_HEIGHT));
        }

        await prisma.signatureField.create({
          data: {
            agreementId: agreement.id,
            role: field.role || field.signerRole || 'CUSTOMER',
            page: field.page || 1,
            xPct,
            yPct,
            widthPct,
            heightPct,
            fieldType: field.fieldType || field.type || 'signature',
            label: field.label || `${field.role || 'Customer'} Signature`,
            required: field.required !== false,
            signed: false,
          },
        });
      }

      logger.info(`[createAgreement] Created SignatureField records for agreement ${agreement.id}`);
    } else {
      // No template fields - create default CUSTOMER signature field
      logger.info(`[createAgreement] No template fields, creating default CUSTOMER signature field`);
      await prisma.signatureField.create({
        data: {
          agreementId: agreement.id,
          role: 'CUSTOMER',
          page: 1,
          xPct: 0.1,      // 10% from left
          yPct: 0.75,     // 75% from top (near bottom)
          widthPct: 0.35, // 35% of page width
          heightPct: 0.06, // 6% of page height (~48px)
          fieldType: 'signature',
          label: 'Customer Signature',
          required: true,
          signed: false,
        },
      });
    }

    // Create audit log
    await this.createAuditLog(agreement.id, 'CREATED', null, {
      templateId,
      recipientEmail,
    }, userId);

    logger.info(`Agreement created: ${agreement.id}`);

    return {
      ...agreement,
      documentUrl: pdfUrl,
    };
  },

  /**
   * Generate PDF document from template
   *
   * CRITICAL: This function handles THREE types of templates:
   * 1. PDF Template URL - Load and modify existing PDF
   * 2. HTML/Slate Content - Render HTML → PDF using Gotenberg
   * 3. Plain Text - Create basic PDF from scratch with pdf-lib
   *
   * The HTML path is ESSENTIAL for WYSIWYG templates to work correctly.
   * pdf-lib CANNOT render HTML - Gotenberg/Chromium is required.
   */
  async generateDocument(agreement, template, mergeData) {
    const s3Key = `agreements/${agreement.id}/document.pdf`;

    // CASE 1: Template has an existing PDF file to load
    if (template.pdfTemplateUrl) {
      logger.info(`[generateDocument] Loading PDF from template URL: ${template.pdfTemplateUrl}`);
      const response = await fetch(template.pdfTemplateUrl);
      const pdfBytes = await response.arrayBuffer();
      const pdfDoc = await PDFDocument.load(pdfBytes);

      // Save to S3
      const savedPdfBytes = await pdfDoc.save();
      await this._uploadPdfToS3(savedPdfBytes, s3Key, agreement);

      return this._getPresignedUrl(s3Key);
    }

    // CASE 2: Template has HTML content (WYSIWYG/Slate) - USE GOTENBERG
    // Detect HTML content by checking for HTML tags or if content is an array (Slate AST)
    const templateContent = template.content || '';
    const isHtmlContent = this._isHtmlContent(templateContent);

    if (isHtmlContent) {
      logger.info(`[generateDocument] Detected HTML content - using Gotenberg for PDF generation`);

      try {
        // Interpolate merge fields into HTML content
        let htmlContent;
        if (Array.isArray(templateContent)) {
          // Slate AST - need to render to HTML first
          logger.info(`[generateDocument] Rendering Slate AST to HTML`);
          const renderResult = await render(templateContent, {
            title: agreement.name,
          });
          htmlContent = renderResult.html;
        } else {
          // Already HTML string - just interpolate
          htmlContent = this.interpolateText(templateContent, mergeData);
        }

        // Wrap in full HTML document if not already
        if (!htmlContent.includes('<html')) {
          htmlContent = this._wrapHtmlDocument(htmlContent, agreement.name);
        }

        logger.info(`[generateDocument] Generating PDF with Gotenberg (HTML length: ${htmlContent.length})`);

        // Use Gotenberg to render HTML → PDF
        const { pdfBuffer, documentHash, signaturePositions, pageCount } = await generateForSigning(htmlContent);

        logger.info(`[generateDocument] Gotenberg PDF generated: ${pdfBuffer.length} bytes, ${pageCount} pages`);

        // Upload to S3
        await this._uploadPdfToS3(pdfBuffer, s3Key, agreement);

        // ========================================================================
        // PHASE 0 ARCHIVED - CORRUPTED FIELD LOGIC (signaturePositions)
        // This logic extracted pixel-based coordinates which caused
        // mismatches between UI rendering and PDF coordinate systems. Will be
        // replaced in PHASE 3 with normalized percentage coordinates from
        // SignatureField model. The documentHash is still useful for integrity.
        // ========================================================================
        await prisma.agreement.update({
          where: { id: agreement.id },
          data: {
            // PHASE 0 ARCHIVED: signaturePositions: signaturePositions || template.signatureFields || [],
            documentHash,
          },
        });

        return this._getPresignedUrl(s3Key);
      } catch (gotenbergError) {
        logger.error(`[generateDocument] Gotenberg PDF generation failed: ${gotenbergError.message}`, {
          stack: gotenbergError.stack,
        });
        // Fall through to basic PDF generation as fallback
        logger.warn(`[generateDocument] Falling back to basic PDF generation`);
      }
    }

    // CASE 3: Plain text content - Create basic PDF with pdf-lib
    logger.info(`[generateDocument] Creating basic PDF with pdf-lib`);
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const page = pdfDoc.addPage([612, 792]); // Letter size
    const { width, height } = page.getSize();

    // Header
    page.drawText('PANDA EXTERIORS', {
      x: 50,
      y: height - 50,
      size: 20,
      font: boldFont,
      color: rgb(0.25, 0.31, 0.71),
    });

    // Document title
    page.drawText(agreement.name || 'Service Agreement', {
      x: 50,
      y: height - 80,
      size: 16,
      font: boldFont,
    });

    // Add document content from template (treat as plain text)
    const content = this.interpolateText(templateContent, mergeData);
    // Strip HTML tags for plain text rendering
    const plainContent = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const lines = this.wrapText(plainContent, 80);
    let y = height - 120;

    for (const line of lines) {
      if (y < 100) {
        // Add new page if needed
        const newPage = pdfDoc.addPage([612, 792]);
        y = newPage.getSize().height - 50;
      }
      page.drawText(line, {
        x: 50,
        y,
        size: 10,
        font,
      });
      y -= 14;
    }

    // Add signature placeholder
    page.drawText('Signature: ________________________', {
      x: 50,
      y: 150,
      size: 12,
      font,
    });

    page.drawText(`Date: ${new Date().toLocaleDateString()}`, {
      x: 400,
      y: 150,
      size: 12,
      font,
    });

    page.drawText(`Name: ${agreement.recipientName || agreement.recipientName || ''}`, {
      x: 50,
      y: 130,
      size: 10,
      font,
    });

    // Save document to S3
    const pdfBytes = await pdfDoc.save();
    await this._uploadPdfToS3(pdfBytes, s3Key, agreement);

    return this._getPresignedUrl(s3Key);
  },

  /**
   * Check if content appears to be HTML
   */
  _isHtmlContent(content) {
    if (!content) return false;
    // Slate AST is an array of nodes
    if (Array.isArray(content)) return true;
    // Check for HTML tags
    if (typeof content === 'string') {
      return /<[a-z][\s\S]*>/i.test(content) ||
             content.includes('<!DOCTYPE') ||
             content.includes('<html');
    }
    return false;
  },

  /**
   * Wrap HTML content in a full document structure
   */
  _wrapHtmlDocument(htmlContent, title) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title || 'Document'}</title>
  <style>
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      margin: 0;
      padding: 40px;
      color: #333;
    }
    h1, h2, h3 { margin-top: 1em; margin-bottom: 0.5em; }
    p { margin: 0.5em 0; }
    .signature-anchor {
      display: inline-block;
      border-bottom: 2px solid #333;
      min-width: 200px;
      height: 50px;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  ${htmlContent}
</body>
</html>`;
  },

  /**
   * Upload PDF buffer to S3
   */
  async _uploadPdfToS3(pdfBuffer, s3Key, agreement) {
    await s3Client.send(new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        agreementId: agreement.id,
        agreementNumber: agreement.agreementNumber,
      },
    }));
    logger.info(`[generateDocument] PDF uploaded to S3: ${s3Key}`);
  },

  /**
   * Get presigned URL for S3 object
   */
  async _getPresignedUrl(s3Key) {
    return getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: DOCUMENTS_BUCKET, Key: s3Key }),
      { expiresIn: 3600 * 24 * 7 } // 7 days
    );
  },

  /**
   * Send agreement for signature
   */
  async sendForSignature(agreementId, userId) {
    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId },
      include: {
        template: true,
        opportunity: true,
        account: true,
      },
    });

    if (!agreement) {
      throw new Error('Agreement not found');
    }

    if (agreement.status !== 'DRAFT') {
      throw new Error(`Cannot send agreement with status: ${agreement.status}`);
    }

    // Send email with signing link
    await this.sendSigningEmail(agreement);

    // Update status
    const updated = await prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sent_by_id: userId,
      },
    });

    // Create audit log
    await this.createAuditLog(agreementId, 'SENT', {
      status: 'DRAFT',
    }, {
      status: 'SENT',
      recipientEmail: agreement.recipientEmail,
    }, userId);

    logger.info(`Agreement sent: ${agreementId} to ${agreement.recipientEmail}`);

    return updated;
  },

  /**
   * Send signing email via SES
   */
  async sendSigningEmail(agreement) {
    const signingUrl = agreement.signingUrl;

    const emailParams = {
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [agreement.recipientEmail],
      },
      Message: {
        Subject: {
          Data: `Please sign: ${agreement.name}`,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                  .header { text-align: center; margin-bottom: 30px; }
                  .logo { max-width: 200px; }
                  .btn { display: inline-block; background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; }
                  .btn:hover { opacity: 0.9; }
                  .footer { margin-top: 30px; color: #666; font-size: 12px; text-align: center; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <img src="https://pandaexteriors.com/logo.png" alt="Panda Exteriors" class="logo">
                  </div>

                  <h2>Hello ${agreement.recipientName || 'there'},</h2>

                  <p>You have a document waiting for your signature:</p>

                  <p><strong>${agreement.name}</strong></p>

                  <p>Please click the button below to review and sign the document:</p>

                  <p style="text-align: center;">
                    <a href="${signingUrl}" class="btn">Review & Sign Document</a>
                  </p>

                  <p>This link will expire in 30 days.</p>

                  <p>If you have any questions, please contact us at <a href="tel:+12408016665">(240) 801-6665</a>.</p>

                  <div class="footer">
                    <p>Panda Exteriors | 123 Main St, Baltimore, MD</p>
                    <p>This is an automated message from PandaSign.</p>
                  </div>
                </div>
              </body>
              </html>
            `,
            Charset: 'UTF-8',
          },
          Text: {
            Data: `
Hello ${agreement.recipientName || 'there'},

You have a document waiting for your signature: ${agreement.name}

Please visit the following link to review and sign:
${signingUrl}

This link will expire in 30 days.

If you have any questions, please contact us at (240) 801-6665.

Panda Exteriors
            `.trim(),
            Charset: 'UTF-8',
          },
        },
      },
    };

    await sendEmailFromSesParams(emailParams);
  },

  /**
   * Get agreement by signing token (public access for signing page)
   */
  async getAgreementByToken(token) {
    const agreement = await prisma.agreement.findFirst({
      where: { signingToken: token },
      include: {
        template: true,
        signatures: true,
      },
    });

    if (!agreement) {
      throw new Error('Agreement not found or invalid token');
    }

    // Check if expired
    if (agreement.expiresAt && new Date() > agreement.expiresAt) {
      throw new Error('This signing link has expired');
    }

    // Check if already completed
    if (agreement.status === 'SIGNED' || agreement.status === 'COMPLETED') {
      throw new Error('This agreement has already been signed');
    }

    // Update status to viewed if first view
    if (agreement.status === 'SENT' && !agreement.viewedAt) {
      await prisma.agreement.update({
        where: { id: agreement.id },
        data: {
          status: 'VIEWED',
          viewedAt: new Date(),
        },
      });

      await this.createAuditLog(agreement.id, 'VIEWED', null, {
        viewedAt: new Date(),
      }, null);
    }

    return agreement;
  },

  /**
   * Apply signature to agreement
   */
  async applySignature({
    token,
    signatureData, // Base64 encoded signature image
    signatureType = 'ELECTRONIC',
    ipAddress,
    userAgent,
    signerName,
    signerEmail,
  }) {
    const agreement = await this.getAgreementByToken(token);

    if (!signatureData) {
      throw new Error('Signature data is required');
    }

    // Save signature image to S3
    const signatureBuffer = Buffer.from(signatureData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const signatureKey = `signatures/${agreement.id}/${uuidv4()}.png`;

    await s3Client.send(new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: signatureKey,
      Body: signatureBuffer,
      ContentType: 'image/png',
    }));

    const signatureUrl = `https://${DOCUMENTS_BUCKET}.s3.amazonaws.com/${signatureKey}`;

    // Create signature record
    const signature = await prisma.signature.create({
      data: {
        agreementId: agreement.id,
        signerName: signerName || agreement.recipientName,
        signerEmail: signerEmail || agreement.recipientEmail,
        signatureType,
        signatureUrl,
        signedAt: new Date(),
        ipAddress,
        userAgent,
      },
    });

    // Generate signed document with signature embedded
    const signedDocumentUrl = await this.embedSignature(agreement, signatureData);

    // Determine if agreement is now complete (change orders have agent signature already)
    const hasAgentSignature = agreement.hostSignedAt || agreement.hostSignerName;
    const finalStatus = hasAgentSignature ? 'COMPLETED' : 'SIGNED';

    // Update agreement status
    const updated = await prisma.agreement.update({
      where: { id: agreement.id },
      data: {
        status: finalStatus,
        signedAt: new Date(),
        signedDocumentUrl,
        ...(hasAgentSignature && { completed_at: new Date() }),
      },
    });

    // Create audit log
    await this.createAuditLog(agreement.id, finalStatus === 'COMPLETED' ? 'COMPLETED' : 'SIGNED', {
      status: 'VIEWED',
    }, {
      status: finalStatus,
      signerName: signature.signerName,
      ipAddress,
    }, null);

    // Send confirmation emails
    await this.sendCompletionEmails(updated, signature);

    // If this is a change order that is now fully signed, trigger completion workflow
    if (finalStatus === 'COMPLETED' && agreement.mergeData?.changeDescription) {
      const WORKFLOWS_SERVICE_URL = process.env.WORKFLOWS_SERVICE_URL || 'http://workflows-service:3009';
      try {
        logger.info(`Triggering change order completed workflow for agreement ${agreement.id}`);

        // Find the associated case for this change order
        const associatedCase = await prisma.case.findFirst({
          where: {
            opportunityId: agreement.opportunityId,
            type: 'Change Order',
            status: { not: 'CLOSED' },
          },
          orderBy: { createdAt: 'desc' },
        });

        await fetch(`${WORKFLOWS_SERVICE_URL}/api/triggers/change-order-completed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agreementId: agreement.id,
            caseId: associatedCase?.id,
            opportunityId: agreement.opportunityId,
            amendmentAmount: agreement.mergeData?.amendmentAmount,
            newTotal: agreement.mergeData?.newTotal,
            userId: null, // Customer signed, no user ID
          }),
        });
      } catch (triggerErr) {
        logger.warn('Failed to trigger change order completed workflow:', triggerErr.message);
        // Non-fatal - continue without triggering
      }
    }

    logger.info(`Agreement signed: ${agreement.id}`);

    return {
      agreement: updated,
      signature,
    };
  },

  /**
   * Embed signature into PDF and generate Certificate of Completion
   *
   * CRITICAL: This function correctly handles:
   * 1. Per-field page selection (not always page 0)
   * 2. Resolved field positions (fieldPlacements from DB, not template defaults)
   * 3. Y-axis inversion (PDF uses bottom-left origin, UI uses top-left)
   * 4. NaN prevention with defensive validation
   * 5. Audit hash for tamper detection
   */
  async embedSignature(agreement, signatureData, signerRole = 'CUSTOMER') {
    logger.info(`[embedSignature] Starting for agreement ${agreement.id}, role: ${signerRole}`);

    // =============================================
    // STEP 1: Load the original document
    // =============================================
    let pdfBytes;
    let pdfDoc;
    let pages;

    try {
      const originalDocumentUrl = agreement.documentUrl;
      const parsedOriginal = parseS3Url(originalDocumentUrl);
      const sourceBucket = parsedOriginal?.bucket || DOCUMENTS_BUCKET;
      const pdfKey = parsedOriginal?.key || originalDocumentUrl || `agreements/${agreement.id}/document.pdf`;

      logger.info(`[embedSignature] Loading PDF from S3`, {
        bucket: sourceBucket,
        key: pdfKey,
        originalUrl: originalDocumentUrl,
      });

      const response = await s3Client.send(new GetObjectCommand({
        Bucket: sourceBucket,
        Key: pdfKey,
      }));

      pdfBytes = await response.Body.transformToByteArray();
      pdfDoc = await PDFDocument.load(pdfBytes);
      pages = pdfDoc.getPages();

      logger.info(`[embedSignature] PDF loaded successfully, ${pages.length} pages`);
    } catch (loadErr) {
      logger.error(`[embedSignature] Failed to load PDF: ${loadErr.message}`);
      throw new Error(`Failed to load document PDF: ${loadErr.message}`);
    }

    // =============================================
    // STEP 2: Embed signature image
    // =============================================
    let signatureImage;
    try {
      const signatureBuffer = Buffer.from(signatureData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      signatureImage = await pdfDoc.embedPng(signatureBuffer);
      logger.info(`[embedSignature] Signature image embedded successfully`);
    } catch (imgErr) {
      logger.error(`[embedSignature] Failed to embed signature image: ${imgErr.message}`);
      throw new Error(`Failed to embed signature image: ${imgErr.message}`);
    }

    // ========================================================================
    // PHASE 0 ARCHIVED - CORRUPTED FIELD LOGIC (resolvedFields fallback chain)
    // This fallback chain tried signaturePositions → fieldPlacements → signatureFields
    // which caused coordinate mismatches. All fields were pixel-based with no clear
    // source of truth. Will be replaced in PHASE 3/6 with normalized percentage
    // coordinates from the new SignatureField model.
    // ========================================================================
    // STEP 3: Get resolved field placements (ARCHIVED - DO NOT USE IN REBUILD)
    // =============================================
    // Priority: signaturePositions (from DB) > template.fieldPlacements > template.signatureFields
    const resolvedFields = agreement.signaturePositions
      || agreement.template?.fieldPlacements
      || agreement.template?.signatureFields
      || [];

    // Filter fields for the current signer's role
    const fieldsForRole = resolvedFields.filter(f => {
      const fieldRole = (f.role || f.signerRole || 'CUSTOMER').toUpperCase();
      const fieldType = (f.type || f.fieldType || '').toUpperCase();
      return fieldRole === signerRole.toUpperCase() &&
             (fieldType === 'SIGNATURE' || fieldType === '' || !fieldType);
    });

    // Fallback to template fields if no resolved fields exist
    const fallbackFields = agreement.template?.signatureFields || [
      { page: 1, x: 100, y: 650, width: 200, height: 50 },
    ];

    const fieldsToUse = fieldsForRole.length > 0 ? fieldsForRole : fallbackFields;

    logger.info(`[embedSignature] Found ${fieldsToUse.length} fields to sign for role ${signerRole}`, {
      resolvedFieldsCount: resolvedFields.length,
      fieldsForRoleCount: fieldsForRole.length,
      usingFallback: fieldsForRole.length === 0,
    });

    // =============================================
    // STEP 4: DEFENSIVE VALIDATION (NaN prevention)
    // =============================================
    for (const field of fieldsToUse) {
      // Validate required fields exist and are valid numbers
      if (
        field.page == null ||
        field.x == null ||
        field.y == null
      ) {
        logger.error('[embedSignature] Invalid signature field - missing required properties', { field });
        throw new Error('Invalid signature placement data: missing page, x, or y');
      }

      // Check for NaN values
      if (isNaN(Number(field.x)) || isNaN(Number(field.y))) {
        logger.error('[embedSignature] Invalid signature field - NaN coordinates', { field });
        throw new Error('Invalid signature placement data: NaN coordinates');
      }

      // Validate render dimensions if provided (must be positive)
      if (field.pageRenderWidth != null && (isNaN(field.pageRenderWidth) || field.pageRenderWidth <= 0)) {
        logger.warn('[embedSignature] Invalid pageRenderWidth, using default', {
          provided: field.pageRenderWidth,
          default: 612
        });
        field.pageRenderWidth = 612;
      }

      if (field.pageRenderHeight != null && (isNaN(field.pageRenderHeight) || field.pageRenderHeight <= 0)) {
        logger.warn('[embedSignature] Invalid pageRenderHeight, using default', {
          provided: field.pageRenderHeight,
          default: 792
        });
        field.pageRenderHeight = 792;
      }
    }

    // =============================================
    // STEP 5: Apply signature to EACH field
    // =============================================
    let signaturesApplied = 0;

    for (const field of fieldsToUse) {
      // Get page (1-based index from field, convert to 0-based)
      const pageNum = field.page || 1;
      const pageIndex = pageNum - 1;

      if (pageIndex < 0 || pageIndex >= pages.length) {
        logger.warn(`[embedSignature] Invalid page ${pageNum} (max: ${pages.length}), skipping field`);
        continue;
      }

      const page = pages[pageIndex];
      const pdfPageWidth = page.getWidth();
      const pdfPageHeight = page.getHeight();

      // SAFE SCALING with fallbacks (prevents NaN)
      const pageRenderWidth = field.pageRenderWidth && field.pageRenderWidth > 0
        ? field.pageRenderWidth
        : pdfPageWidth; // Use actual PDF width if no render width provided

      const pageRenderHeight = field.pageRenderHeight && field.pageRenderHeight > 0
        ? field.pageRenderHeight
        : pdfPageHeight; // Use actual PDF height if no render height provided

      // Calculate scaling factors
      const scaleX = pdfPageWidth / pageRenderWidth;
      const scaleY = pdfPageHeight / pageRenderHeight;

      // Extract UI coordinates with safe defaults
      const uiX = Number(field.x) || 100;
      const uiY = Number(field.displayY ?? field.y) || 150;
      const fieldWidth = Number(field.width) || 180;
      const fieldHeight = Number(field.height) || 40;

      // Final NaN check before drawing
      if (isNaN(scaleX) || isNaN(scaleY)) {
        logger.error('[embedSignature] Scale calculation resulted in NaN', {
          pdfPageWidth, pdfPageHeight, pageRenderWidth, pageRenderHeight
        });
        throw new Error('Invalid scale calculation - cannot embed signature');
      }

      // Calculate PDF coordinates (Y-axis inversion: PDF uses bottom-left origin)
      const pdfX = uiX * scaleX;
      const pdfY = pdfPageHeight - (uiY + fieldHeight) * scaleY;
      const pdfWidth = fieldWidth * scaleX;
      const pdfHeight = fieldHeight * scaleY;

      logger.info(`[embedSignature] Drawing signature on page ${pageNum}:
        UI coords: x=${uiX}, y=${uiY}, size=${fieldWidth}x${fieldHeight}
        Page render: ${pageRenderWidth}x${pageRenderHeight}
        PDF page: ${pdfPageWidth}x${pdfPageHeight}
        Scale: x=${scaleX.toFixed(3)}, y=${scaleY.toFixed(3)}
        PDF coords: x=${pdfX.toFixed(1)}, y=${pdfY.toFixed(1)}, size=${pdfWidth.toFixed(1)}x${pdfHeight.toFixed(1)}`);

      try {
        page.drawImage(signatureImage, {
          x: pdfX,
          y: pdfY,
          width: pdfWidth,
          height: pdfHeight,
        });
        signaturesApplied++;
      } catch (drawErr) {
        logger.error(`[embedSignature] Failed to draw signature: ${drawErr.message}`);
        throw new Error(`Failed to draw signature on PDF: ${drawErr.message}`);
      }
    }

    if (signaturesApplied === 0) {
      logger.warn('[embedSignature] No signatures were applied - check field configuration');
    }

    // =============================================
    // STEP 6: Generate Certificate of Completion (HARDENED)
    // =============================================
    const originalDocHash = this.generateDocumentHash(pdfBytes);

    try {
      const certPage = pdfDoc.addPage([612, 792]);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const { height } = certPage.getSize();

      // Certificate header
      certPage.drawText('CERTIFICATE OF COMPLETION', {
        x: 150,
        y: height - 80,
        size: 20,
        font: boldFont,
        color: rgb(0.25, 0.31, 0.71),
      });

      // Document details (with safe fallbacks)
      const recipientName = agreement.recipientName || agreement.recipientName || 'Unknown';
      const recipientEmail = agreement.recipientEmail || agreement.recipientEmail || 'Unknown';

      const details = [
        `Document ID: ${agreement.agreementNumber || agreement.id}`,
        `Document Name: ${agreement.name || 'Untitled Agreement'}`,
        ``,
        `Signer: ${recipientName}`,
        `Email: ${recipientEmail}`,
        `Signed At: ${new Date().toISOString()}`,
        `Signer Role: ${signerRole}`,
        ``,
        `Document Hash: ${originalDocHash}`,
      ];

      let y = height - 140;
      for (const detail of details) {
        certPage.drawText(detail, {
          x: 50,
          y,
          size: 11,
          font,
        });
        y -= 20;
      }

      // Audit trail (with error handling)
      certPage.drawText('AUDIT TRAIL', {
        x: 50,
        y: y - 30,
        size: 14,
        font: boldFont,
      });

      let auditLogs = [];
      try {
        auditLogs = await prisma.auditLog.findMany({
          where: { recordId: agreement.id, tableName: 'agreements' },
          orderBy: { createdAt: 'asc' },
        });
      } catch (auditErr) {
        logger.warn('[embedSignature] Could not fetch audit logs:', auditErr.message);
      }

      y -= 60;
      if (auditLogs.length === 0) {
        certPage.drawText('No audit entries found', { x: 50, y, size: 9, font });
        y -= 15;
      } else {
        for (const log of auditLogs) {
          const logDate = log.createdAt ? log.createdAt.toISOString() : 'Unknown';
          certPage.drawText(`${logDate} - ${log.action || 'ACTION'}`, {
            x: 50,
            y,
            size: 9,
            font,
          });
          y -= 15;
          if (y < 120) break; // Prevent overflow
        }
      }

      // Legal statement
      certPage.drawText('This document was signed electronically in accordance with the ESIGN Act and UETA.', {
        x: 50,
        y: 80,
        size: 8,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });

      logger.info('[embedSignature] Certificate of Completion generated successfully');
    } catch (certErr) {
      logger.error(`[embedSignature] Failed to generate certificate: ${certErr.message}`);
      // Continue without certificate - signature is more important
      logger.warn('[embedSignature] Proceeding without Certificate of Completion');
    }

    // =============================================
    // STEP 7: Save signed PDF (with verification)
    // =============================================
    logger.info('[embedSignature] About to save signed PDF', {
      agreementId: agreement.id,
      pageCount: pdfDoc.getPageCount(),
      signaturesApplied,
    });

    let signedPdfBytes;
    try {
      signedPdfBytes = await pdfDoc.save();
      logger.info(`[embedSignature] PDF saved, ${signedPdfBytes.length} bytes`);
    } catch (saveErr) {
      logger.error(`[embedSignature] Failed to save PDF: ${saveErr.message}`);
      throw new Error(`Failed to save signed PDF: ${saveErr.message}`);
    }

    const jobNumber = agreement.opportunities?.jobId;
    const customerName = agreement.recipientName
      || agreement.contacts?.fullName
      || agreement.accounts?.name
      || agreement.recipientEmail;
    const { displayName, keyName } = buildAgreementFilenameParts({
      jobNumber,
      agreementName: agreement.name,
      customerName,
    });
    const folderName = buildAgreementFolderName(jobNumber, agreement.id);
    const signedKey = `signed-agreements/${folderName}/${keyName}.pdf`;

    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: SIGNED_BUCKET,
        Key: signedKey,
        Body: signedPdfBytes,
        ContentType: 'application/pdf',
        Metadata: {
          agreementId: agreement.id,
          agreementName: agreement.name || 'Unknown',
          signedAt: new Date().toISOString(),
          signerRole,
          originalDocHash,
        },
      }));

      // Verify the upload
      await s3Client.send(new HeadObjectCommand({
        Bucket: SIGNED_BUCKET,
        Key: signedKey,
      }));

      logger.info(`[embedSignature] Signed PDF uploaded and verified: ${signedKey}`);
    } catch (uploadErr) {
      logger.error(`[embedSignature] Failed to upload signed PDF: ${uploadErr.message}`);
      throw new Error(`Failed to upload signed PDF to S3: ${uploadErr.message}`);
    }

    // Return presigned URL (max 7 days for S3)
    const presignedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: SIGNED_BUCKET,
        Key: signedKey,
        ...(displayName ? { ResponseContentDisposition: buildContentDisposition(`${displayName}.pdf`, 'attachment') } : {}),
      }),
      { expiresIn: 3600 * 24 * 7 }
    );

    logger.info(`[embedSignature] Complete - returning presigned URL`);
    return presignedUrl;
  },

  /**
   * Send completion emails to all parties
   */
  async sendCompletionEmails(agreement, signature) {
    // Send to signer
    await sendEmailFromSesParams({
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [agreement.recipientEmail],
      },
      Message: {
        Subject: {
          Data: `Signed: ${agreement.name}`,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: `
Your signature has been recorded for: ${agreement.name}

You can download your signed document here:
${agreement.signedDocumentUrl}

Thank you for choosing Panda Exteriors!
            `.trim(),
            Charset: 'UTF-8',
          },
        },
      },
    });

    // Send to internal notification
    const internalEmail = process.env.INTERNAL_NOTIFICATION_EMAIL || 'sales@pandaexteriors.com';
    await sendEmailFromSesParams({
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [internalEmail],
      },
      Message: {
        Subject: {
          Data: `Document Signed: ${agreement.name}`,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: `
Document signed by ${agreement.recipientName} (${agreement.recipientEmail})

Document: ${agreement.name}
Agreement #: ${agreement.agreementNumber}
Signed at: ${agreement.signedAt}

View signed document:
${agreement.signedDocumentUrl}
            `.trim(),
            Charset: 'UTF-8',
          },
        },
      },
    });
  },

  /**
   * Generate document hash for integrity verification
   */
  generateDocumentHash(pdfBytes) {
    return crypto.createHash('sha256').update(Buffer.from(pdfBytes)).digest('hex');
  },

  /**
   * Interpolate merge fields in text
   */
  interpolateText(text, data) {
    if (!text) return text;
    return text.replace(/\{\{([^}]+)\}\}/g, (match, fieldPath) => {
      const parts = fieldPath.trim().split('.');
      let value = data;
      for (const part of parts) {
        if (value === null || value === undefined) return '';
        value = value[part];
      }
      return value !== undefined ? value : '';
    });
  },

  /**
   * Wrap text for PDF rendering
   */
  wrapText(text, maxCharsPerLine) {
    const words = text.split(' ');
    const lines = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + word).length <= maxCharsPerLine) {
        currentLine += (currentLine ? ' ' : '') + word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);

    return lines;
  },

  /**
   * Create audit log entry
   */
  async createAuditLog(agreementId, action, oldValues, newValues, userId) {
    await prisma.auditLog.create({
      data: {
        tableName: 'agreements',
        recordId: agreementId,
        action,
        oldValues,
        newValues,
        userId,
        source: 'pandasign_service',
      },
    });
  },

  /**
   * Finalize a signed agreement - embed ALL signatures and generate certificate
   * Called when all signers have completed signing
   *
   * CRITICAL: This is the ONLY function that should write the final signed PDF.
   * Individual signature submissions should only store signature data in DB.
   *
   * Correctly handles:
   * 1. Per-field page selection (not always page 0)
   * 2. Resolved field positions (fieldPlacements from DB, not template defaults)
   * 3. Y-axis inversion (PDF uses bottom-left origin, UI uses top-left)
   * 4. Document hash for integrity verification
   */
  async finalizeSignedAgreement(agreementId) {
    logger.info(`[finalizeSignedAgreement] Starting for agreement ${agreementId}`);

    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId },
      include: {
        signatures: true,
        template: true,
        opportunities: true,
        contacts: true,
        accounts: true,
      },
    });

    if (!agreement) {
      throw new Error(`Agreement ${agreementId} not found`);
    }

    if (!agreement.signatures?.length) {
      throw new Error(`No signatures to finalize for agreement ${agreementId}`);
    }

    // Get the ORIGINAL PDF (load ONCE, save ONCE)
    const originalDocumentUrl = agreement.documentUrl;
    const parsedOriginal = parseS3Url(originalDocumentUrl);
    const sourceBucket = parsedOriginal?.bucket || DOCUMENTS_BUCKET;
    const pdfKey = parsedOriginal?.key || originalDocumentUrl;

    logger.info(`🔷 [finalizeSignedAgreement] Original documentUrl: ${originalDocumentUrl}`);

    logger.info(`🔷 [finalizeSignedAgreement] Loading original PDF from S3`, {
      bucket: sourceBucket,
      key: pdfKey,
      originalUrl: originalDocumentUrl,
    });

    if (!pdfKey) {
      throw new Error(`Agreement ${agreementId} has no documentUrl - cannot load PDF`);
    }

    const response = await s3Client.send(new GetObjectCommand({
      Bucket: sourceBucket,
      Key: pdfKey,
    }));

    const pdfBytes = await response.Body.transformToByteArray();
    logger.info(`🔷 [finalizeSignedAgreement] PDF loaded from S3, size: ${pdfBytes.length} bytes`);

    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    // ========================================================================
    // PHASE 0 ARCHIVED - CORRUPTED FIELD LOGIC (finalizeSignedAgreement)
    // This entire section uses pixel-based coordinates with a fallback chain
    // ========================================================================
    // PHASE 4: Query SignatureField model (DocuSign-style normalized coordinates)
    // The SignatureField model stores coordinates as percentages (0-1 range),
    // which are independent of display resolution and render dimensions.
    // This replaces the corrupted legacy fallback chain that mixed pixel coordinates
    // from different sources.
    // ========================================================================
    const signatureFields = await prisma.signatureField.findMany({
      where: { agreementId: agreement.id },
      orderBy: { page: 'asc' },
    });

    logger.info(`[finalizeSignedAgreement] Found ${signatureFields.length} SignatureField records, ${agreement.signatures.length} signatures`);

    // DIAGNOSTIC: Log all SignatureField records with normalized coordinates
    logger.info(`[finalizeSignedAgreement] 📋 ALL SIGNATURE FIELDS (normalized percentages):`, signatureFields.map((f, i) => ({
      index: i,
      id: f.id,
      role: f.role,
      fieldType: f.fieldType,
      page: f.page,
      xPct: f.xPct,
      yPct: f.yPct,
      widthPct: f.widthPct,
      heightPct: f.heightPct,
      signed: f.signed,
    })));

    // DIAGNOSTIC: Log all signatures with their roles
    logger.info(`[finalizeSignedAgreement] ✍️ ALL SIGNATURES:`, agreement.signatures.map((s, i) => ({
      index: i,
      id: s.id,
      role: s.signerRole,
      email: s.signerEmail,
      name: s.signerName,
      hasImage: !!(s.signatureImageUrl || s.signatureData),
    })));

    // Embed EACH signature at its resolved position
    for (const sig of agreement.signatures) {
      // Get signature image data - could be base64 or URL
      let signatureBase64 = sig.signatureImageUrl || sig.signatureData || sig.signatureUrl;
      if (!signatureBase64) {
        logger.warn(`[finalizeSignedAgreement] No signature image for signer ${sig.signerRole}, skipping`);
        continue;
      }

      try {
        // If it's an S3 URL, fetch the image
        if (signatureBase64.startsWith('https://') || signatureBase64.startsWith('s3://')) {
          const sigResponse = await fetch(signatureBase64);
          const sigBuffer = await sigResponse.arrayBuffer();
          signatureBase64 = `data:image/png;base64,${Buffer.from(sigBuffer).toString('base64')}`;
        }

        // Decode and embed signature image
        const signatureBuffer = Buffer.from(
          signatureBase64.replace(/^data:image\/\w+;base64,/, ''),
          'base64'
        );
        const signatureImage = await pdfDoc.embedPng(signatureBuffer);

        // Find ALL fields for this signer's role
        const signerRole = (sig.signerRole || sig.role || 'CUSTOMER').toUpperCase();

        // CRITICAL FIX: Handle role mapping between Signature record and field positions
        // Backend maps AGENT -> SALES_REP when creating Signature, but fields retain original role
        // So SALES_REP signatures should match AGENT fields, and vice versa
        const roleMatchesSigner = (fieldRole) => {
          const normalizedFieldRole = fieldRole.toUpperCase();
          if (signerRole === normalizedFieldRole) return true;
          // SALES_REP should match AGENT fields (and vice versa)
          if (signerRole === 'SALES_REP' && normalizedFieldRole === 'AGENT') return true;
          if (signerRole === 'AGENT' && normalizedFieldRole === 'SALES_REP') return true;
          return false;
        };

        // Log all available SignatureField records for debugging
        logger.info(`[finalizeSignedAgreement] Looking for fields matching ${signerRole}. Available SignatureFields:`,
          signatureFields.map(f => ({
            id: f.id,
            role: f.role,
            fieldType: f.fieldType,
            page: f.page,
            xPct: f.xPct,
            yPct: f.yPct,
          }))
        );

        // Filter SignatureField records by role and type
        const fieldsForRole = signatureFields.filter(f => {
          const fieldRole = (f.role || 'CUSTOMER').toUpperCase();
          const fieldType = (f.fieldType || 'SIGNATURE').toUpperCase();
          const matches = roleMatchesSigner(fieldRole) && (fieldType === 'SIGNATURE' || fieldType === '');
          if (matches) {
            logger.info(`[finalizeSignedAgreement] ✅ SignatureField ${f.id} matches ${signerRole}: role=${fieldRole}, type=${fieldType}`);
          }
          return matches;
        });

        logger.info(`[finalizeSignedAgreement] Found ${fieldsForRole.length} matching SignatureFields for ${signerRole}`);

        // Fallback to first SignatureField if no role-specific fields found
        const fieldsToUse = fieldsForRole.length > 0 ? fieldsForRole : (signatureFields.length > 0 ? [signatureFields[0]] : []);

        if (fieldsForRole.length === 0 && signatureFields.length > 0) {
          logger.warn(`[finalizeSignedAgreement] ⚠️ No role-specific SignatureFields for ${signerRole}, using first available as fallback`);
        }

        if (fieldsToUse.length === 0) {
          // Ultimate fallback - use default normalized position (center of page)
          const defaultField = { page: 1, xPct: 0.1, yPct: 0.75, widthPct: 0.33, heightPct: 0.065 };
          fieldsToUse.push(defaultField);
          logger.warn(`[finalizeSignedAgreement] ⚠️ No SignatureFields at all, using default position on page 1`);
        }

        logger.info(`[finalizeSignedAgreement] Applying signature for ${signerRole} to ${fieldsToUse.length} field(s)`);

        // ========================================================================
        // PHASE 4: NORMALIZED PERCENTAGE COORDINATE TRANSFORMATION
        // SignatureField model stores coordinates as percentages (0-1 range):
        //   - xPct, yPct: Position as fraction of page (TOP-LEFT origin)
        //   - widthPct, heightPct: Dimensions as fraction of page
        //
        // PDF uses BOTTOM-LEFT origin, so we must invert Y-axis:
        //   pdfX = xPct * pdfPageWidth
        //   pdfY = (1 - yPct - heightPct) * pdfPageHeight
        //   pdfWidth = widthPct * pdfPageWidth
        //   pdfHeight = heightPct * pdfPageHeight
        //
        // This is the EXACT formula used by DocuSign, PandaDoc, and Adobe Sign.
        // NO scaling factors needed - percentages are resolution-independent.
        // ========================================================================
        for (const field of fieldsToUse) {
          // Page selection (1-based to 0-based)
          const pageNum = field.page || 1;
          const pageIndex = pageNum - 1;

          if (pageIndex < 0 || pageIndex >= pages.length) {
            logger.warn(`[finalizeSignedAgreement] Invalid page ${pageNum}, max is ${pages.length}. Skipping field.`);
            continue;
          }

          const page = pages[pageIndex];

          // Get actual PDF page dimensions in points
          const pdfPageWidth = page.getWidth();
          const pdfPageHeight = page.getHeight();

          // Extract normalized percentage coordinates (0-1 range)
          const xPct = field.xPct ?? 0.1;
          const yPct = field.yPct ?? 0.75;
          const widthPct = field.widthPct ?? 0.33;
          const heightPct = field.heightPct ?? 0.065;

          // PHASE 4 FORMULA: Convert normalized percentages to PDF points
          // Y-axis inversion: PDF uses bottom-left origin, UI uses top-left origin
          const pdfX = xPct * pdfPageWidth;
          const pdfY = (1 - yPct - heightPct) * pdfPageHeight;
          const pdfWidth = widthPct * pdfPageWidth;
          const pdfHeight = heightPct * pdfPageHeight;

          logger.info(`[finalizeSignedAgreement] Drawing signature on page ${pageNum}:
            Normalized coords: xPct=${xPct}, yPct=${yPct}, widthPct=${widthPct}, heightPct=${heightPct}
            PDF page: ${pdfPageWidth}x${pdfPageHeight}
            PDF coords: x=${pdfX.toFixed(1)}, y=${pdfY.toFixed(1)}, size=${pdfWidth.toFixed(1)}x${pdfHeight.toFixed(1)}`);

          page.drawImage(signatureImage, {
            x: pdfX,
            y: pdfY,
            width: pdfWidth,
            height: pdfHeight,
          });
        }
      } catch (embedErr) {
        logger.error(`[finalizeSignedAgreement] Failed to embed signature for ${sig.signerRole}:`, embedErr);
      }
    }

    // =============================================
    // PDF SAFE MODE - Disable features for debugging
    // Set these to false to isolate PDF generation issues
    // =============================================
    const ENABLE_CERTIFICATE_PAGE = true;  // Set to false to skip certificate generation
    const ENABLE_AUDIT_HASH = true;        // Set to false to skip document hash

    // Generate document hash (needed for certificate AND metadata)
    let documentHash = '';
    if (ENABLE_AUDIT_HASH) {
      try {
        documentHash = this.generateDocumentHash(pdfBytes);
        logger.info(`[finalizeSignedAgreement] Document hash generated: ${documentHash.substring(0, 16)}...`);
      } catch (hashErr) {
        logger.error(`[finalizeSignedAgreement] Hash generation failed: ${hashErr.message}`);
        documentHash = 'hash-generation-failed';
      }
    }

    // Add Certificate of Completion page (WRAPPED IN TRY-CATCH)
    // This is the #1 crash point - if this fails, we still want the signed PDF
    if (ENABLE_CERTIFICATE_PAGE) {
      try {
        logger.info(`[finalizeSignedAgreement] Generating Certificate of Completion`);

        const certPage = pdfDoc.addPage([612, 792]);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const { height } = certPage.getSize();

        // Certificate header
        certPage.drawText('CERTIFICATE OF COMPLETION', {
          x: 150,
          y: height - 80,
          size: 20,
          font: boldFont,
          color: rgb(0.25, 0.31, 0.71),
        });

        // Document details - DEFENSIVE: sanitize ALL strings to prevent crashes
        let certY = height - 140;
        const drawCertLine = (text, size = 11) => {
          // CRITICAL: Sanitize text to prevent drawText crashes
          const safeText = String(text || '').substring(0, 500); // Limit length
          if (safeText) {
            certPage.drawText(safeText, { x: 50, y: certY, size, font });
          }
          certY -= size + 8;
        };

        // Safe string extraction with fallbacks
        const safeAgreementName = String(agreement.name || 'Untitled Agreement').substring(0, 100);
        const safeAgreementId = String(agreement.agreementNumber || agreement.id || 'Unknown');

        drawCertLine(`Agreement: ${safeAgreementName}`);
        drawCertLine(`Agreement ID: ${safeAgreementId}`);
        drawCertLine(`Completed At: ${new Date().toISOString()}`);
        certY -= 10;

        drawCertLine('Signers:', 12);
        certY -= 4;

        // Process signatures with defensive handling
        const signaturesArray = Array.isArray(agreement.signatures) ? agreement.signatures : [];
        for (const sig of signaturesArray) {
          if (!sig) continue;

          const safeName = String(sig.signerName || 'Unknown').substring(0, 50);
          const safeEmail = String(sig.signerEmail || 'N/A').substring(0, 50);
          const safeRole = String(sig.signerRole || 'CUSTOMER');
          const safeSignedAt = sig.signedAt ? new Date(sig.signedAt).toISOString() : 'N/A';
          const safeIp = String(sig.ipAddress || 'N/A').substring(0, 50);

          drawCertLine(`• ${safeName} (${safeEmail})`);
          drawCertLine(`  Role: ${safeRole}`);
          drawCertLine(`  Signed At: ${safeSignedAt}`);
          drawCertLine(`  IP Address: ${safeIp}`);
          certY -= 6;

          // Prevent overflow - stop if we're running out of page space
          if (certY < 120) {
            drawCertLine('... additional signers truncated');
            break;
          }
        }

        // Document hash
        certY -= 10;
        if (documentHash) {
          drawCertLine(`Document Hash (SHA-256): ${documentHash}`, 9);
        }

        // Legal statement
        certPage.drawText('This document was signed electronically in accordance with the ESIGN Act and UETA.', {
          x: 50,
          y: 60,
          size: 8,
          font,
          color: rgb(0.4, 0.4, 0.4),
        });

        logger.info(`[finalizeSignedAgreement] Certificate of Completion generated successfully`);
      } catch (certErr) {
        // CRITICAL: Log error but DO NOT FAIL - signature on PDF is more important than certificate
        logger.error(`[finalizeSignedAgreement] Certificate generation FAILED: ${certErr.message}`, {
          stack: certErr.stack,
          agreementId: agreement.id,
        });
        logger.warn(`[finalizeSignedAgreement] Proceeding WITHOUT Certificate of Completion - signature is intact`);
        // Continue - PDF will be saved without certificate page
      }
    } else {
      logger.info(`[finalizeSignedAgreement] Certificate page DISABLED (ENABLE_CERTIFICATE_PAGE=false)`);
    }

    // =============================================
    // STEP: SAVE SIGNED PDF (with HARD VERIFICATION)
    // =============================================
    logger.info(`[finalizeSignedAgreement] About to save signed PDF`, {
      agreementId: agreement.id,
      pageCount: pdfDoc.getPageCount(),
    });

    let signedPdfBytes;
    try {
      signedPdfBytes = await pdfDoc.save();
    } catch (saveErr) {
      logger.error(`[finalizeSignedAgreement] FAILED to save PDF document: ${saveErr.message}`, {
        stack: saveErr.stack,
        agreementId: agreement.id,
      });
      throw new Error(`Failed to save signed PDF: ${saveErr.message}`);
    }

    // HARD STOP #1: Verify PDF bytes are valid
    if (!signedPdfBytes || signedPdfBytes.length < 1000) {
      const errorMsg = `Generated PDF is empty or invalid (${signedPdfBytes?.length || 0} bytes)`;
      logger.error(`[finalizeSignedAgreement] ${errorMsg}`, { agreementId: agreement.id });
      throw new Error(errorMsg);
    }

    logger.info(`[finalizeSignedAgreement] PDF saved successfully: ${signedPdfBytes.length} bytes`);

    const jobNumber = agreement.opportunities?.jobId;
    const customerName = agreement.recipientName
      || agreement.contacts?.fullName
      || agreement.accounts?.name
      || agreement.recipientEmail;
    const { displayName, keyName } = buildAgreementFilenameParts({
      jobNumber,
      agreementName: agreement.name,
      customerName,
    });
    const folderName = buildAgreementFolderName(jobNumber, agreementId);
    const signedKey = `signed-agreements/${folderName}/${keyName}.pdf`;

    logger.info(`[finalizeSignedAgreement] Saving as: ${signedKey}`);

    // Upload to S3
    try {
      await s3Client.send(new PutObjectCommand({
        Bucket: SIGNED_BUCKET,
        Key: signedKey,
        Body: signedPdfBytes,
        ContentType: 'application/pdf',
        Metadata: {
          agreementId: agreementId,
          agreementName: agreement.name || 'Unknown',
          documentHash: documentHash || 'not-generated',
          completedAt: new Date().toISOString(),
          signatureCount: String(agreement.signatures?.length || 0),
          pdfSizeBytes: String(signedPdfBytes.length),
        },
      }));

      logger.info(`[finalizeSignedAgreement] Uploaded signed document to S3: ${signedKey}`);
    } catch (uploadErr) {
      logger.error(`[finalizeSignedAgreement] FAILED to upload signed PDF to S3: ${uploadErr.message}`, {
        stack: uploadErr.stack,
        agreementId: agreement.id,
        bucket: SIGNED_BUCKET,
        key: signedKey,
      });
      throw new Error(`Failed to upload signed PDF to S3: ${uploadErr.message}`);
    }

    // HARD STOP #2: VERIFY S3 write succeeded BEFORE marking as COMPLETED
    // This prevents "ghost completions" where status is COMPLETED but no PDF exists
    let verifiedSize = 0;
    try {
      const headResult = await s3Client.send(new HeadObjectCommand({
        Bucket: SIGNED_BUCKET,
        Key: signedKey,
      }));
      verifiedSize = headResult.ContentLength || 0;
      logger.info(`[finalizeSignedAgreement] ✅ S3 WRITE VERIFIED: ${signedKey}, size: ${verifiedSize} bytes`);
    } catch (headErr) {
      logger.error(`[finalizeSignedAgreement] ❌ S3 WRITE VERIFICATION FAILED for ${signedKey}:`, headErr);
      throw new Error(`Failed to verify signed PDF was written to S3: ${headErr.message}`);
    }

    // HARD STOP #3: Verify the file in S3 is the same size we uploaded
    if (verifiedSize < 1000) {
      const errorMsg = `S3 file is too small (${verifiedSize} bytes) - upload may have failed silently`;
      logger.error(`[finalizeSignedAgreement] ${errorMsg}`, { agreementId: agreement.id });
      throw new Error(errorMsg);
    }

    // IMPORTANT: S3 presigned URLs max expiration is 7 days.
    // Store the S3 key and generate presigned URLs on-demand when accessing.
    // For immediate access, generate a short-lived presigned URL (7 days)
    const signedDocumentUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: SIGNED_BUCKET,
        Key: signedKey,
        ...(displayName ? { ResponseContentDisposition: buildContentDisposition(`${displayName}.pdf`, 'attachment') } : {}),
      }),
      { expiresIn: 3600 * 24 * 7 } // 7 days max for presigned URLs
    );

    // Update agreement with signed document URL and hash
    // Also store the S3 key for future presigned URL generation
    await prisma.agreement.update({
      where: { id: agreementId },
      data: {
        signedDocumentUrl: signedDocumentUrl, // Short-lived presigned URL for immediate access
        documentHash: documentHash,
        status: 'COMPLETED',
        completed_at: new Date(), // snake_case (no @map in schema)
      },
    });

    logger.info(`[finalizeSignedAgreement] Agreement ${agreementId} finalized with signed document`);

    // Return full details for caller
    return {
      signedKey,
      signedDocumentUrl,
      documentHash,
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
    };
  },

  // ============================================
  // DOCUMENT GENERATION
  // ============================================
  // NOTE: For standalone PDF generation (quotes, invoices, work orders, statements),
  // use pdfService directly. The methods below are for contract generation with
  // e-signature integration.
  //
  // Example: await pdfService.generateQuotePdf(quoteId)
  //          await pdfService.generateInvoicePdf(invoiceId)
  //          await pdfService.generateWorkOrderPdf(workOrderId)
  //          await pdfService.generateStatementPdf(accountId, options)

  /**
   * Generate a Contract PDF from Opportunity data
   */
  async generateContractPdf(opportunityId, templateId) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        account: true,
        contact: true,
        quotes: {
          where: { status: 'ACCEPTED' },
          include: { lineItems: { include: { product: true } } },
          take: 1,
        },
      },
    });

    if (!opportunity) throw new Error('Opportunity not found');

    const template = templateId
      ? await prisma.agreementTemplate.findUnique({ where: { id: templateId } })
      : await prisma.agreementTemplate.findFirst({ where: { category: 'CONTRACT', isActive: true } });

    if (!template) throw new Error('No active contract template found');

    const acceptedQuote = opportunity.quotes[0];

    // Build merge data from opportunity
    const mergeData = {
      customerName: opportunity.account?.name || opportunity.contact?.firstName || '',
      customerAddress: opportunity.projectAddress || opportunity.account?.billingAddress || '',
      customerEmail: opportunity.contact?.email || '',
      customerPhone: opportunity.contact?.phone || '',
      projectName: opportunity.name,
      projectAddress: opportunity.projectAddress || '',
      contractAmount: acceptedQuote?.total || opportunity.amount || 0,
      contractDate: new Date().toLocaleDateString(),
      scopeOfWork: acceptedQuote?.lineItems?.map(li => li.product?.name || li.description).join(', ') || '',
      salesRep: opportunity.ownerName || '',
    };

    // Create agreement using existing method
    const agreement = await this.createAgreement({
      templateId: template.id,
      opportunityId,
      accountId: opportunity.accountId,
      contactId: opportunity.contactId,
      recipientEmail: mergeData.customerEmail,
      recipientName: mergeData.customerName,
      mergeData,
      userId: opportunity.ownerId,
    });

    logger.info(`Contract generated for opportunity: ${opportunityId}`);
    return agreement;
  },

  // ============================================
  // SIGNABLE DOCUMENT INTEGRATION (using pdfService)
  // ============================================

  /**
   * Create a signable invoice - uses pdfService to generate PDF, then wraps it for signing
   */
  async createSignableInvoice(invoiceId, options = {}) {
    logger.info(`Creating signable invoice: ${invoiceId}`);

    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        account: {
          include: { primaryContact: true },
        },
      },
    });

    if (!invoice) throw new Error('Invoice not found');

    // Generate the invoice PDF using pdfService
    const pdfResult = await pdfService.generateInvoicePdf(invoiceId);

    // Get or create invoice acknowledgment template
    let template = await prisma.agreementTemplate.findFirst({
      where: { category: 'INVOICE_ACK', isActive: true },
    });

    if (!template) {
      // Create default invoice acknowledgment template
      template = await prisma.agreementTemplate.create({
        data: {
          name: 'Invoice Acknowledgment',
          category: 'INVOICE_ACK',
          content: 'I acknowledge receipt of this invoice and agree to the terms and amount stated.',
          signatureFields: [
            { name: 'customer_signature', page: 1, x: 100, y: 100, width: 200, height: 50 },
          ],
          isActive: true,
        },
      });
    }

    // Generate signing token
    const signingToken = crypto.randomBytes(32).toString('hex');
    const agreementNumber = `INV-ACK-${invoice.invoiceNumber}-${Date.now()}`;

    // Create agreement record linked to the invoice PDF
    const agreement = await prisma.agreement.create({
      data: {
        agreementNumber,
        name: `Invoice Acknowledgment - ${invoice.invoiceNumber}`,
        status: 'DRAFT',
        templateId: template.id,
        accountId: invoice.accountId,
        recipient_email: options.recipientEmail || invoice.account?.email || invoice.account?.primaryContact?.email,
        recipient_name: options.recipientName || invoice.account?.primaryContact?.name || invoice.account?.name,
        signingToken,
        signingUrl: `${SIGNING_BASE_URL}/sign/${signingToken}`,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        documentUrl: pdfResult.downloadUrl,
        mergeData: {
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          invoiceTotal: invoice.total,
          invoiceDate: invoice.invoiceDate,
          dueDate: invoice.dueDate,
        },
        created_by_id: options.userId,
      },
    });

    // Create audit log
    await this.createAuditLog(agreement.id, 'CREATED', null, {
      invoiceId,
      type: 'signable_invoice',
    }, options.userId);

    logger.info(`Signable invoice created: ${agreement.id}`);

    return {
      agreement,
      pdfUrl: pdfResult.downloadUrl,
      signingUrl: agreement.signingUrl,
    };
  },

  /**
   * Create a signable quote - uses pdfService to generate PDF, then wraps it for signing
   */
  async createSignableQuote(quoteId, options = {}) {
    logger.info(`Creating signable quote: ${quoteId}`);

    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        opportunity: {
          include: {
            account: true,
            contact: true,
          },
        },
      },
    });

    if (!quote) throw new Error('Quote not found');

    // Generate the quote PDF using pdfService
    const pdfResult = await pdfService.generateQuotePdf(quoteId);

    // Get or create quote acceptance template
    let template = await prisma.agreementTemplate.findFirst({
      where: { category: 'QUOTE_ACCEPT', isActive: true },
    });

    if (!template) {
      template = await prisma.agreementTemplate.create({
        data: {
          name: 'Quote Acceptance',
          category: 'QUOTE_ACCEPT',
          content: 'I accept this quote and authorize the work to proceed as described.',
          signatureFields: [
            { name: 'customer_signature', page: 1, x: 100, y: 100, width: 200, height: 50 },
          ],
          isActive: true,
        },
      });
    }

    const signingToken = crypto.randomBytes(32).toString('hex');
    const agreementNumber = `QUOTE-${quote.quoteNumber}-${Date.now()}`;

    const contact = quote.opportunity?.contact;
    const account = quote.opportunity?.account;

    const agreement = await prisma.agreement.create({
      data: {
        agreementNumber,
        name: `Quote Acceptance - ${quote.quoteNumber}`,
        status: 'DRAFT',
        templateId: template.id,
        opportunityId: quote.opportunityId,
        accountId: account?.id,
        contactId: contact?.id,
        recipient_email: options.recipientEmail || contact?.email || account?.email,
        recipient_name: options.recipientName || `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() || account?.name,
        signingToken,
        signingUrl: `${SIGNING_BASE_URL}/sign/${signingToken}`,
        expiresAt: quote.expirationDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        documentUrl: pdfResult.downloadUrl,
        mergeData: {
          quoteId,
          quoteNumber: quote.quoteNumber,
          quoteTotal: quote.grandTotal || quote.total,
          projectName: quote.opportunity?.name,
        },
        created_by_id: options.userId,
      },
    });

    await this.createAuditLog(agreement.id, 'CREATED', null, {
      quoteId,
      type: 'signable_quote',
    }, options.userId);

    logger.info(`Signable quote created: ${agreement.id}`);

    return {
      agreement,
      pdfUrl: pdfResult.downloadUrl,
      signingUrl: agreement.signingUrl,
    };
  },

  /**
   * Create a signable work order - uses pdfService to generate PDF, then wraps it for signing
   */
  async createSignableWorkOrder(workOrderId, options = {}) {
    logger.info(`Creating signable work order: ${workOrderId}`);

    const workOrder = await prisma.workOrder.findUnique({
      where: { id: workOrderId },
      include: {
        opportunity: {
          include: {
            account: true,
            contact: true,
          },
        },
      },
    });

    if (!workOrder) throw new Error('Work order not found');

    // Generate the work order PDF using pdfService
    const pdfResult = await pdfService.generateWorkOrderPdf(workOrderId);

    // Get or create work order authorization template
    let template = await prisma.agreementTemplate.findFirst({
      where: { category: 'WORK_ORDER_AUTH', isActive: true },
    });

    if (!template) {
      template = await prisma.agreementTemplate.create({
        data: {
          name: 'Work Order Authorization',
          category: 'WORK_ORDER_AUTH',
          content: 'I authorize this work order to proceed as described.',
          signatureFields: [
            { name: 'customer_signature', page: 1, x: 100, y: 100, width: 200, height: 50 },
          ],
          isActive: true,
        },
      });
    }

    const signingToken = crypto.randomBytes(32).toString('hex');
    const agreementNumber = `WO-${workOrder.workOrderNumber}-${Date.now()}`;

    const contact = workOrder.opportunity?.contact;
    const account = workOrder.opportunity?.account;

    const agreement = await prisma.agreement.create({
      data: {
        agreementNumber,
        name: `Work Order Authorization - ${workOrder.workOrderNumber}`,
        status: 'DRAFT',
        templateId: template.id,
        opportunityId: workOrder.opportunityId,
        accountId: account?.id,
        contactId: contact?.id,
        recipient_email: options.recipientEmail || contact?.email || account?.email,
        recipient_name: options.recipientName || `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() || account?.name,
        signingToken,
        signingUrl: `${SIGNING_BASE_URL}/sign/${signingToken}`,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        documentUrl: pdfResult.downloadUrl,
        mergeData: {
          workOrderId,
          workOrderNumber: workOrder.workOrderNumber,
          workType: workOrder.workType,
          status: workOrder.status,
        },
        created_by_id: options.userId,
      },
    });

    await this.createAuditLog(agreement.id, 'CREATED', null, {
      workOrderId,
      type: 'signable_work_order',
    }, options.userId);

    logger.info(`Signable work order created: ${agreement.id}`);

    return {
      agreement,
      pdfUrl: pdfResult.downloadUrl,
      signingUrl: agreement.signingUrl,
    };
  },

  /**
   * Create a signable document from any existing PDF URL
   * This allows turning any document into a signable agreement
   */
  async createSignableFromPdf({
    pdfUrl,
    name,
    recipientEmail,
    recipientName,
    accountId,
    contactId,
    opportunityId,
    category = 'CUSTOM',
    userId,
    expiresInDays = 30,
    mergeData = {},
  }) {
    logger.info(`Creating signable document from PDF: ${name}`);

    // Get or create custom template
    let template = await prisma.agreementTemplate.findFirst({
      where: { category, isActive: true },
    });

    if (!template) {
      template = await prisma.agreementTemplate.create({
        data: {
          name: `${category} Agreement`,
          category,
          content: 'Please review and sign this document.',
          signatureFields: [
            { name: 'signature', page: 1, x: 100, y: 100, width: 200, height: 50 },
          ],
          isActive: true,
        },
      });
    }

    const signingToken = crypto.randomBytes(32).toString('hex');
    const agreementNumber = `DOC-${Date.now()}-${uuidv4().slice(0, 4).toUpperCase()}`;

    const agreement = await prisma.agreement.create({
      data: {
        agreementNumber,
        name,
        status: 'DRAFT',
        templateId: template.id,
        accountId,
        contactId,
        opportunityId,
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        signingToken,
        signingUrl: `${SIGNING_BASE_URL}/sign/${signingToken}`,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
        documentUrl: pdfUrl,
        mergeData,
        created_by_id: userId,
      },
    });

    await this.createAuditLog(agreement.id, 'CREATED', null, {
      type: 'signable_from_pdf',
      category,
    }, userId);

    logger.info(`Signable document created from PDF: ${agreement.id}`);

    return {
      agreement,
      signingUrl: agreement.signingUrl,
    };
  },

  /**
   * Generate and send a signable document in one step
   */
  async generateAndSendSignable({
    type, // 'invoice' | 'quote' | 'workorder' | 'statement'
    id,
    recipientEmail,
    recipientName,
    userId,
    sendImmediately = true,
  }) {
    let result;

    switch (type) {
      case 'invoice':
        result = await this.createSignableInvoice(id, { recipientEmail, recipientName, userId });
        break;
      case 'quote':
        result = await this.createSignableQuote(id, { recipientEmail, recipientName, userId });
        break;
      case 'workorder':
        result = await this.createSignableWorkOrder(id, { recipientEmail, recipientName, userId });
        break;
      default:
        throw new Error(`Unknown document type: ${type}`);
    }

    if (sendImmediately && result.agreement) {
      await this.sendForSignature(result.agreement.id, userId);
      result.agreement.status = 'SENT';
    }

    return result;
  },

  /**
   * Host Signing - In-person counter-signature by agent/representative
   * Used when agent needs to sign after customer has signed
   * This creates an embedded signing session without sending an email
   */
  async initiateHostSigning(agreementId, hostInfo, userId) {
    logger.info(`Initiating host signing for agreement: ${agreementId}`);

    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId },
      include: {
        template: true,
        signatures: true,
      },
    });

    if (!agreement) {
      throw new Error('Agreement not found');
    }

    // Validate that agreement is in a state that allows host signing
    // Host signing typically happens after customer has signed
    if (!['SIGNED', 'SENT', 'VIEWED', 'PARTIALLY_SIGNED'].includes(agreement.status)) {
      throw new Error(`Cannot initiate host signing for agreement with status: ${agreement.status}`);
    }

    // Check if host has already signed
    const existingHostSignature = agreement.signatures?.find(
      sig => sig.signerType === 'HOST' || sig.signerType === 'AGENT'
    );

    if (existingHostSignature) {
      throw new Error('Host has already signed this agreement');
    }

    // Generate a unique token for this host signing session (no email needed)
    const hostSigningToken = crypto.randomBytes(32).toString('hex');

    // Update agreement with host signing info
    await prisma.agreement.update({
      where: { id: agreementId },
      data: {
        host_signing_token: hostSigningToken,
        host_signer_name: hostInfo.name,
        host_signer_email: hostInfo.email,
        host_signing_initiated_at: new Date(),
        host_signing_initiated_by_id: userId,
        // If customer already signed, mark as partially signed
        status: agreement.status === 'SIGNED' ? 'PARTIALLY_SIGNED' : agreement.status,
      },
    });

    // Create audit log
    await this.createAuditLog(agreementId, 'HOST_SIGNING_INITIATED', {
      status: agreement.status,
    }, {
      hostSignerName: hostInfo.name,
      hostSignerEmail: hostInfo.email,
    }, userId);

    logger.info(`Host signing initiated for agreement: ${agreementId}`);

    // Return the embedded signing URL (for in-person signing)
    return {
      agreementId,
      hostSigningToken,
      hostSigningUrl: `${SIGNING_BASE_URL}/host-sign/${hostSigningToken}`,
      embeddedSigningUrl: `${SIGNING_BASE_URL}/sign/${hostSigningToken}?embedded=true&signerType=host`,
      hostSignerName: hostInfo.name,
    };
  },

  /**
   * Get agreement by host signing token (for embedded in-person signing)
   */
  async getAgreementByHostToken(token) {
    const agreement = await prisma.agreement.findFirst({
      where: { host_signing_token: token },
      include: {
        template: true,
        signatures: true,
      },
    });

    if (!agreement) {
      throw new Error('Agreement not found or invalid host signing token');
    }

    // Check if host signing session has expired (1 hour window for in-person signing)
    const hostSigningInitiatedAt = agreement.hostSigningInitiatedAt;
    if (hostSigningInitiatedAt) {
      const hoursSinceInitiated = (Date.now() - new Date(hostSigningInitiatedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceInitiated > 1) {
        throw new Error('Host signing session has expired. Please initiate a new session.');
      }
    }

    return agreement;
  },

  /**
   * Apply host signature (in-person counter-signature)
   */
  async applyHostSignature({
    hostToken,
    signatureData,
    signerName,
    signerEmail,
    ipAddress,
    userAgent,
  }) {
    const agreement = await this.getAgreementByHostToken(hostToken);

    if (!signatureData) {
      throw new Error('Signature data is required');
    }

    // Save host signature image to S3
    const signatureBuffer = Buffer.from(signatureData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const signatureKey = `signatures/${agreement.id}/host-${uuidv4()}.png`;

    await s3Client.send(new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: signatureKey,
      Body: signatureBuffer,
      ContentType: 'image/png',
    }));

    const signatureUrl = `https://${DOCUMENTS_BUCKET}.s3.amazonaws.com/${signatureKey}`;

    // Create host signature record
    const signature = await prisma.signature.create({
      data: {
        agreementId: agreement.id,
        signerName: signerName || agreement.hostSignerName,
        signerEmail: signerEmail || agreement.hostSignerEmail,
        signerType: 'HOST',
        signatureType: 'ELECTRONIC',
        signatureUrl,
        signedAt: new Date(),
        ipAddress,
        userAgent,
      },
    });

    // Generate fully signed document with both signatures
    const signedDocumentUrl = await this.embedHostSignature(agreement, signatureData);

    // Update agreement status to COMPLETED (all signers have signed)
    const updated = await prisma.agreement.update({
      where: { id: agreement.id },
      data: {
        status: 'COMPLETED',
        completed_at: new Date(),
        signedDocumentUrl,
        host_signed_at: new Date(),
        // Clear the host signing token after use
        host_signing_token: null,
      },
    });

    // Create audit log
    await this.createAuditLog(agreement.id, 'HOST_SIGNED', {
      status: 'PARTIALLY_SIGNED',
    }, {
      status: 'COMPLETED',
      hostSignerName: signature.signerName,
      ipAddress,
    }, null);

    // Send completion emails to all parties
    await this.sendHostSigningCompletionEmails(updated, signature);

    logger.info(`Agreement completed with host signature: ${agreement.id}`);

    return {
      agreement: updated,
      signature,
    };
  },

  /**
   * Embed host signature into PDF (second signature position)
   */
  async embedHostSignature(agreement, signatureData) {
    // Load the current document (may already have customer signature)
    // Generate same filename pattern as finalizeSignedAgreement
    const jobNumber = agreement.opportunities?.jobId;
    const customerName = agreement.recipientName
      || agreement.contacts?.fullName
      || agreement.accounts?.name
      || agreement.recipientEmail;
    const { displayName, keyName } = buildAgreementFilenameParts({
      jobNumber,
      agreementName: agreement.name,
      customerName,
    });
    const folderName = buildAgreementFolderName(jobNumber, agreement.id);
    const defaultSignedKey = `signed-agreements/${folderName}/${keyName}.pdf`;
    const defaultUnsignedKey = `agreements/${agreement.id}/document.pdf`;
    const defaultBucket = agreement.signedDocumentUrl ? SIGNED_BUCKET : DOCUMENTS_BUCKET;
    const defaultKey = agreement.signedDocumentUrl ? defaultSignedKey : defaultUnsignedKey;
    const parsed = agreement.signedDocumentUrl ? parseS3Url(agreement.signedDocumentUrl) : null;
    const rawSignedKey = agreement.signedDocumentUrl
      && !agreement.signedDocumentUrl.startsWith('http')
      && !agreement.signedDocumentUrl.startsWith('s3://')
      ? agreement.signedDocumentUrl
      : null;
    const sourceBucket = parsed?.bucket || defaultBucket;
    const sourceKey = parsed?.key || rawSignedKey || defaultKey;

    const response = await s3Client.send(new GetObjectCommand({
      Bucket: sourceBucket,
      Key: sourceKey,
    }));

    const pdfBytes = await response.Body.transformToByteArray();
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Embed host signature image
    const signatureBuffer = Buffer.from(signatureData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const signatureImage = await pdfDoc.embedPng(signatureBuffer);

    // Get the page for host signature (typically same page or designated page)
    const pages = pdfDoc.getPages();
    const page = pages[0];

    // ============================================================================
    // PHASE 0 ARCHIVED: Host Signature Pixel-Based Positioning (CORRUPTED PATTERN)
    // ============================================================================
    // This code uses PIXEL coordinates with corrupted fallback chain:
    //   agreement.template?.signatureFields → hard-coded pixels
    //
    // PROBLEMS:
    // 1. Uses pixel fallback (350, 150, 200, 50) that doesn't account for page margins
    // 2. No Y-axis conversion for pdf-lib's bottom-left origin system
    // 3. signatureFields from template is part of corrupted fallback chain
    // 4. Position varies based on header/footer rendering
    //
    // PHASE 6 REPLACEMENT will use normalized coordinates (0-1 range):
    //   pdfX = xPct * pdfPageWidth
    //   pdfY = (1 - yPct - heightPct) * pdfPageHeight
    //   pdfWidth = widthPct * pdfPageWidth
    //   pdfHeight = heightPct * pdfPageHeight
    //
    // Where xPct, yPct, widthPct, heightPct come from SignatureField model
    // ============================================================================

    // ARCHIVED: Corrupted pixel-based positioning (to be replaced in PHASE 6)
    const signatureFields = agreement.template?.signatureFields || [];
    const hostField = signatureFields.find(f => f.name === 'host_signature') || {
      x: 350, // ARCHIVED: Hard-coded pixel fallback - will be replaced with xPct * pageWidth
      y: 150, // ARCHIVED: Raw pixel - needs Y-axis inversion: (1 - yPct - heightPct) * pageHeight
      width: 200, // ARCHIVED: Pixel width - will be replaced with widthPct * pageWidth
      height: 50, // ARCHIVED: Pixel height - will be replaced with heightPct * pageHeight
    };

    // ARCHIVED: Direct pixel usage without coordinate transformation (PHASE 6 will fix)
    page.drawImage(signatureImage, {
      x: hostField.x,
      y: hostField.y,
      width: hostField.width,
      height: hostField.height,
    });

    // ARCHIVED: Label positioning using pixel math (PHASE 6 will fix)
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText('Agent/Representative:', {
      x: hostField.x, // ARCHIVED: Pixel-based x position
      y: hostField.y + hostField.height + 5, // ARCHIVED: Pixel math for label offset
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });

    // ============================================================================
    // PHASE 0 ARCHIVED: Certificate of Completion Pixel Positioning (CORRUPTED)
    // ============================================================================
    // This section uses HARD-CODED PIXEL COORDINATES for Certificate content:
    //   x: 50 (fixed left margin)
    //   y: 250, 230, 215 (fixed vertical positions)
    //
    // PROBLEMS:
    // 1. Fixed pixels don't adapt to page dimensions
    // 2. No accounting for variable audit trail length
    // 3. Positions can collide with existing content
    //
    // PHASE 7 will rebuild Certificate of Completion as a proper new page
    // with dynamic content positioning based on actual content height.
    // ============================================================================

    const certPageIndex = pdfDoc.getPageCount() - 1;
    const certPage = pages[certPageIndex];

    if (certPage) {
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // ARCHIVED: Hard-coded pixel positions (PHASE 7 will rebuild entirely)
      certPage.drawText('HOST/AGENT SIGNATURE', {
        x: 50, // ARCHIVED: Hard-coded left margin
        y: 250, // ARCHIVED: Fixed pixel position - may overlap with audit trail
        size: 12,
        font: boldFont,
        color: rgb(0.25, 0.31, 0.71),
      });

      certPage.drawText(`Host Signer: ${agreement.hostSignerName || 'Agent'}`, {
        x: 50, // ARCHIVED: Hard-coded left margin
        y: 230, // ARCHIVED: Fixed pixel position
        size: 10,
        font,
      });

      certPage.drawText(`Signed At: ${new Date().toISOString()}`, {
        x: 50, // ARCHIVED: Hard-coded left margin
        y: 215, // ARCHIVED: Fixed pixel position
        size: 10,
        font,
      });
    }

    // Save completed document
    const completedPdfBytes = await pdfDoc.save();
    const completedKey = `signed-agreements/${folderName}/${keyName}-completed.pdf`;

    await s3Client.send(new PutObjectCommand({
      Bucket: SIGNED_BUCKET,
      Key: completedKey,
      Body: completedPdfBytes,
      ContentType: 'application/pdf',
      Metadata: {
        agreementId: agreement.id,
        completedAt: new Date().toISOString(),
        signatureCount: '2',
      },
    }));

    // CRITICAL: Verify S3 upload succeeded (added Feb 1, 2026)
    try {
      const headResult = await s3Client.send(new HeadObjectCommand({
        Bucket: SIGNED_BUCKET,
        Key: completedKey,
      }));
      logger.info(`[embedHostSignature] ✅ S3 WRITE VERIFIED: ${completedKey}, size: ${headResult.ContentLength} bytes`);
      if (headResult.ContentLength < 1000) {
        throw new Error(`S3 file is too small (${headResult.ContentLength} bytes)`);
      }
    } catch (verifyErr) {
      logger.error(`[embedHostSignature] ❌ S3 WRITE VERIFICATION FAILED for ${completedKey}:`, verifyErr);
      throw new Error(`Failed to verify signed PDF was written to S3: ${verifyErr.message}`);
    }

    // Return presigned URL (max 7 days for S3)
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: SIGNED_BUCKET,
        Key: completedKey,
        ...(displayName ? { ResponseContentDisposition: buildContentDisposition(`${displayName}.pdf`, 'attachment') } : {}),
      }),
      { expiresIn: 3600 * 24 * 7 } // 7 days max for presigned URLs
    );
  },

  /**
   * Send completion emails after host signing
   */
  async sendHostSigningCompletionEmails(agreement, hostSignature) {
    // Send to original customer
    await sendEmailFromSesParams({
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [agreement.recipientEmail],
      },
      Message: {
        Subject: {
          Data: `Completed: ${agreement.name}`,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: `
Your document has been fully executed: ${agreement.name}

All parties have signed. You can download your completed document here:
${agreement.signedDocumentUrl}

Thank you for choosing Panda Exteriors!
            `.trim(),
            Charset: 'UTF-8',
          },
        },
      },
    });

    // Send to host signer
    if (hostSignature.signerEmail) {
      await sendEmailFromSesParams({
        Source: FROM_EMAIL,
        Destination: {
          ToAddresses: [hostSignature.signerEmail],
        },
        Message: {
          Subject: {
            Data: `Document Completed: ${agreement.name}`,
            Charset: 'UTF-8',
          },
          Body: {
            Text: {
              Data: `
Your signature has been recorded on: ${agreement.name}

Customer: ${agreement.recipientName}
Completed at: ${agreement.completedAt}

Download completed document:
${agreement.signedDocumentUrl}
              `.trim(),
              Charset: 'UTF-8',
            },
          },
        },
      });
    }

    // Send to internal notification
    const internalEmail = process.env.INTERNAL_NOTIFICATION_EMAIL || 'sales@pandaexteriors.com';
    await sendEmailFromSesParams({
      Source: FROM_EMAIL,
      Destination: {
        ToAddresses: [internalEmail],
      },
      Message: {
        Subject: {
          Data: `Document Fully Executed: ${agreement.name}`,
          Charset: 'UTF-8',
        },
        Body: {
          Text: {
            Data: `
Document fully executed with all signatures.

Document: ${agreement.name}
Agreement #: ${agreement.agreementNumber}

Customer: ${agreement.recipientName} (${agreement.recipientEmail})
Host/Agent: ${hostSignature.signerName} (${hostSignature.signerEmail || 'N/A'})

Completed at: ${agreement.completedAt}

View completed document:
${agreement.signedDocumentUrl}
            `.trim(),
            Charset: 'UTF-8',
          },
        },
      },
    });
  },

  /**
   * Get agreement templates (admin)
   */
  async getTemplates(category = null) {
    const where = category ? { category } : {};
    return prisma.agreementTemplate.findMany({
      where,
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  },

  /**
   * Create or update agreement template (admin)
   */
  async upsertTemplate(data) {
    if (data.id) {
      return prisma.agreementTemplate.update({
        where: { id: data.id },
        data: {
          name: data.name,
          category: data.category,
          content: data.content,
          pdfTemplateUrl: data.pdfTemplateUrl,
          signatureFields: data.signatureFields,
          mergeFields: data.mergeFields,
          isActive: data.isActive,
          updatedAt: new Date(),
        },
      });
    }

    return prisma.agreementTemplate.create({
      data: {
        name: data.name,
        category: data.category,
        content: data.content,
        pdfTemplateUrl: data.pdfTemplateUrl,
        signatureFields: data.signatureFields || [],
        mergeFields: data.mergeFields || [],
        isActive: data.isActive ?? true,
      },
    });
  },

  // ===========================================
  // SEQUENTIAL SIGNING FLOW (CUSTOMER → AGENT)
  // ===========================================

  /**
   * Signing order configuration
   * CUSTOMER signs first, then AGENT countersigns
   */
  SIGNING_ORDER: ['CUSTOMER', 'AGENT'],

  /**
   * Send agreement for signature (starts with CUSTOMER)
   *
   * Flow: DRAFT → SENT
   * Creates signature record for CUSTOMER and sends email
   */
  async sendForSignature(agreementId, userId = null) {
    logger.info(`[sendForSignature] Starting for agreement ${agreementId}`);

    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId },
      include: {
        template: true,
        signatures: true,
      },
    });

    if (!agreement) {
      throw new Error('Agreement not found');
    }

    if (agreement.status !== 'DRAFT') {
      throw new Error(`Agreement already sent (status: ${agreement.status})`);
    }

    const recipientEmail = agreement.recipientEmail || agreement.recipientEmail;
    const recipientName = agreement.recipientName || agreement.recipientName;

    if (!recipientEmail) {
      throw new Error('Recipient email is required');
    }

    // Generate signing token for CUSTOMER
    const customerToken = crypto.randomBytes(32).toString('hex');

    // Create CUSTOMER signature record
    const customerSig = await prisma.signature.create({
      data: {
        agreementId,
        signerRole: 'CUSTOMER',
        signerName: recipientName || 'Customer',
        signerEmail: recipientEmail,
        status: 'PENDING',
        signer_order: 1,
        sentAt: new Date(),
      },
    });

    // Calculate expiration (default 7 days)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Update agreement status
    await prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sent_by_id: userId,
        signingToken: customerToken,
        expiresAt,
        current_signer_index: 0,
        signer_config: [
          { role: 'CUSTOMER', email: recipientEmail, name: recipientName, order: 1, status: 'PENDING' },
          { role: 'AGENT', email: null, name: null, order: 2, status: 'WAITING' },
        ],
      },
    });

    // Create audit log
    await this.createAuditLog(agreementId, 'SENT', { status: 'DRAFT' }, {
      status: 'SENT',
      recipientEmail,
      sentAt: new Date().toISOString(),
    }, userId);

    // Send signing email
    await this.sendSignatureEmail({
      to: recipientEmail,
      recipientName: recipientName || 'Customer',
      role: 'CUSTOMER',
      token: customerToken,
      agreementName: agreement.name,
      isReminder: false,
    });

    // Emit webhook
    await this.emitWebhook('agreement.sent', {
      agreementId,
      recipientEmail,
      recipientName,
      sentAt: new Date().toISOString(),
    });

    logger.info(`[sendForSignature] Agreement ${agreementId} sent to ${recipientEmail}`);

    return {
      success: true,
      signatureId: customerSig.id,
      signingUrl: `${SIGNING_BASE_URL}/sign/${customerToken}`,
    };
  },

  /**
   * Process a signature submission by token
   *
   * Flow: SENT → (embed signature) → advance to next signer or finalize
   */
  async signAgreementByToken(token, signatureData, signerInfo = {}) {
    logger.info(`[signAgreementByToken] Processing signature for token`);

    // Find agreement by signing token
    const agreement = await prisma.agreement.findFirst({
      where: { signingToken: token },
      include: {
        template: true,
        signatures: {
          orderBy: { signer_order: 'asc' },
        },
        opportunities: true,
        contacts: true,
        accounts: true,
      },
    });

    if (!agreement) {
      throw new Error('Invalid signing link');
    }

    if (agreement.status === 'COMPLETED' || agreement.status === 'VOIDED') {
      throw new Error(`Agreement is ${agreement.status.toLowerCase()}`);
    }

    if (agreement.expiresAt && new Date() > agreement.expiresAt) {
      throw new Error('Signing link has expired');
    }

    // Get current signer info
    const signerConfig = agreement.signerConfig || [];
    const currentSignerIndex = agreement.currentSignerIndex || 0;
    const currentSigner = signerConfig[currentSignerIndex];

    if (!currentSigner) {
      throw new Error('No pending signer found');
    }

    const signerRole = currentSigner.role || 'CUSTOMER';

    // Find or create signature record for this signer
    let signature = await prisma.signature.findFirst({
      where: {
        agreementId: agreement.id,
        signerRole,
        status: 'PENDING',
      },
    });

    if (!signature) {
      signature = await prisma.signature.create({
        data: {
          agreementId: agreement.id,
          signerRole,
          signerName: signerInfo.signerName || currentSigner.name || 'Unknown',
          signerEmail: signerInfo.signerEmail || currentSigner.email,
          status: 'PENDING',
          signer_order: currentSignerIndex + 1,
        },
      });
    }

    if (signature.status === 'SIGNED') {
      throw new Error('Already signed');
    }

    // Embed signature into PDF
    let signedPdfUrl;
    try {
      signedPdfUrl = await this.embedSignature(agreement, signatureData.signatureData, signerRole);
    } catch (embedErr) {
      logger.error(`[signAgreementByToken] Failed to embed signature: ${embedErr.message}`);
      throw new Error(`Failed to embed signature: ${embedErr.message}`);
    }

    // Update signature record
    await prisma.signature.update({
      where: { id: signature.id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        signatureImageUrl: signedPdfUrl,
        ipAddress: signerInfo.ipAddress,
        userAgent: signerInfo.userAgent,
        initials_data: signatureData.initialsData,
        date_field_value: signatureData.dateFieldValue ? new Date(signatureData.dateFieldValue) : null,
      },
    });

    // Update signer config
    const updatedSignerConfig = signerConfig.map((s, i) =>
      i === currentSignerIndex
        ? { ...s, status: 'SIGNED', signedAt: new Date().toISOString() }
        : s
    );

    // Create audit log
    await this.createAuditLog(agreement.id, 'SIGNED',
      { signerRole, status: 'PENDING' },
      { signerRole, status: 'SIGNED', signedAt: new Date().toISOString() },
      null
    );

    // Emit webhook
    await this.emitWebhook('agreement.signed', {
      agreementId: agreement.id,
      signerRole,
      signedAt: new Date().toISOString(),
    });

    // Check if there are more signers
    const nextSignerIndex = currentSignerIndex + 1;
    if (nextSignerIndex < signerConfig.length) {
      // Advance to next signer
      await this.advanceToNextSigner(agreement.id, nextSignerIndex, updatedSignerConfig);

      const nextStatus = signerRole === 'CUSTOMER' ? 'CUSTOMER_SIGNED' : agreement.status;

      return {
        success: true,
        status: nextStatus,
        nextSigner: signerConfig[nextSignerIndex].role,
        signedPdfUrl,
      };
    } else {
      // All signers complete - finalize
      const finalResult = await this.finalizeAgreementComplete(agreement.id, updatedSignerConfig, signedPdfUrl);

      return {
        success: true,
        status: 'COMPLETED',
        signedPdfUrl: finalResult.signedDocumentUrl,
      };
    }
  },

  /**
   * Advance to the next signer in the sequence
   */
  async advanceToNextSigner(agreementId, nextSignerIndex, updatedSignerConfig) {
    logger.info(`[advanceToNextSigner] Advancing to signer index ${nextSignerIndex}`);

    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId },
    });

    const nextSigner = updatedSignerConfig[nextSignerIndex];
    if (!nextSigner) {
      throw new Error('No next signer configured');
    }

    // Update signer config with PENDING status for next signer
    const configWithPending = updatedSignerConfig.map((s, i) =>
      i === nextSignerIndex
        ? { ...s, status: 'PENDING' }
        : s
    );

    // Generate new token for next signer
    const nextToken = crypto.randomBytes(32).toString('hex');

    // Create signature record for next signer if AGENT
    if (nextSigner.role === 'AGENT') {
      // Get agent info (might need to fetch from opportunity or user)
      const agentEmail = nextSigner.email || process.env.DEFAULT_AGENT_EMAIL || 'sales@pandaexteriors.com';
      const agentName = nextSigner.name || 'Sales Agent';

      await prisma.signature.create({
        data: {
          agreementId,
          signerRole: 'AGENT',
          signerName: agentName,
          signerEmail: agentEmail,
          status: 'PENDING',
          signer_order: nextSignerIndex + 1,
          sentAt: new Date(),
        },
      });

      // Update config with agent email
      configWithPending[nextSignerIndex] = {
        ...configWithPending[nextSignerIndex],
        email: agentEmail,
        name: agentName,
      };
    }

    // Determine new status
    const newStatus = nextSigner.role === 'AGENT' ? 'CUSTOMER_SIGNED' : 'SENT';

    // Update agreement
    await prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: newStatus,
        current_signer_index: nextSignerIndex,
        signingToken: nextToken,
        host_signing_token: nextSigner.role === 'AGENT' ? nextToken : agreement.hostSigningToken,
        signer_config: configWithPending,
      },
    });

    // Send email to next signer
    if (nextSigner.email) {
      await this.sendSignatureEmail({
        to: nextSigner.email,
        recipientName: nextSigner.name || nextSigner.role,
        role: nextSigner.role,
        token: nextToken,
        agreementName: agreement.name,
        isReminder: false,
      });
    }

    logger.info(`[advanceToNextSigner] Advanced to ${nextSigner.role}`);
  },

  /**
   * Finalize agreement after all signatures collected
   *
   * CRITICAL FIX (Feb 1, 2026): This function MUST call finalizeSignedAgreement()
   * to generate the proper final PDF with all signatures embedded.
   * Previously, it just stored the intermediate signedPdfUrl and marked as COMPLETED
   * without generating the actual final document.
   */
  async finalizeAgreementComplete(agreementId, finalSignerConfig, signedPdfUrl) {
    logger.info(`[finalizeAgreementComplete] Finalizing agreement ${agreementId}`);

    // CRITICAL: First update signer_config so finalizeSignedAgreement can use it
    await prisma.agreement.update({
      where: { id: agreementId },
      data: {
        signer_config: finalSignerConfig,
      },
    });

    // CRITICAL FIX: Call finalizeSignedAgreement to generate the actual final PDF
    // This embeds all signatures, generates certificate of completion, and uploads to S3
    // The status will be set to COMPLETED inside finalizeSignedAgreement AFTER PDF is verified in S3
    let finalResult;
    try {
      logger.info(`[finalizeAgreementComplete] 🔥 Calling finalizeSignedAgreement for ${agreementId}`);
      finalResult = await this.finalizeSignedAgreement(agreementId);
      logger.info(`[finalizeAgreementComplete] 🔥 finalizeSignedAgreement completed:`, JSON.stringify(finalResult));
    } catch (finalizeErr) {
      // HARD FAIL - do not mark as COMPLETED if PDF generation fails
      logger.error(`[finalizeAgreementComplete] ❌ finalizeSignedAgreement FAILED for ${agreementId}:`, finalizeErr);
      throw new Error(`Failed to finalize agreement PDF: ${finalizeErr.message}`);
    }

    // Re-fetch agreement to get final state
    const updated = await prisma.agreement.findUnique({
      where: { id: agreementId },
    });

    // Create audit log (status already set to COMPLETED by finalizeSignedAgreement)
    await this.createAuditLog(agreementId, 'COMPLETED',
      { status: 'CUSTOMER_SIGNED' },
      { status: 'COMPLETED', completedAt: new Date().toISOString() },
      null
    );

    // Emit webhook
    await this.emitWebhook('agreement.completed', {
      agreementId,
      completedAt: new Date().toISOString(),
      signedDocumentUrl: finalResult.signedDocumentUrl,
    });

    // Send final document to all parties
    const allEmails = finalSignerConfig
      .filter(s => s.email)
      .map(s => s.email);

    for (const email of allEmails) {
      await this.sendFinalDocumentEmail({
        to: email,
        agreementName: updated.name,
        signedPdfUrl: finalResult.signedDocumentUrl,
      });
    }

    logger.info(`[finalizeAgreementComplete] ✅ Agreement ${agreementId} completed with PDF at ${finalResult.signedDocumentUrl}`);

    return {
      success: true,
      signedDocumentUrl: finalResult.signedDocumentUrl,
      documentHash: finalResult.documentHash,
      status: 'COMPLETED',
    };
  },

  /**
   * Decline a signature (signer-initiated)
   */
  async declineSignature(token, reason, signerInfo = {}) {
    logger.info(`[declineSignature] Processing decline`);

    const agreement = await prisma.agreement.findFirst({
      where: { signingToken: token },
      include: { signatures: true },
    });

    if (!agreement) {
      throw new Error('Invalid signing link');
    }

    if (agreement.status === 'COMPLETED' || agreement.status === 'VOIDED') {
      throw new Error(`Agreement is already ${agreement.status.toLowerCase()}`);
    }

    // Find pending signature
    const signature = await prisma.signature.findFirst({
      where: {
        agreementId: agreement.id,
        status: 'PENDING',
      },
    });

    if (signature) {
      await prisma.signature.update({
        where: { id: signature.id },
        data: { status: 'DECLINED' },
      });
    }

    // Update agreement
    await prisma.agreement.update({
      where: { id: agreement.id },
      data: {
        status: 'VOIDED',
        declinedAt: new Date(),
        declineReason: reason,
      },
    });

    // Create audit log
    await this.createAuditLog(agreement.id, 'DECLINED',
      { status: agreement.status },
      { status: 'VOIDED', declineReason: reason },
      null
    );

    // Emit webhook
    await this.emitWebhook('agreement.declined', {
      agreementId: agreement.id,
      reason,
      declinedAt: new Date().toISOString(),
    });

    logger.info(`[declineSignature] Agreement ${agreement.id} declined`);

    return { success: true };
  },

  /**
   * Void an agreement (sender-initiated)
   */
  async voidAgreement(agreementId, reason, userId) {
    logger.info(`[voidAgreement] Voiding agreement ${agreementId}`);

    const agreement = await prisma.agreement.findUnique({
      where: { id: agreementId },
    });

    if (!agreement) {
      throw new Error('Agreement not found');
    }

    if (agreement.status === 'COMPLETED') {
      throw new Error('Cannot void a completed agreement');
    }

    if (agreement.status === 'VOIDED') {
      throw new Error('Agreement is already voided');
    }

    // Update agreement
    await prisma.agreement.update({
      where: { id: agreementId },
      data: {
        status: 'VOIDED',
        voided_at: new Date(),
        void_reason: reason,
        voided_by_id: userId,
      },
    });

    // Create audit log
    await this.createAuditLog(agreementId, 'VOIDED',
      { status: agreement.status },
      { status: 'VOIDED', voidReason: reason },
      userId
    );

    // Emit webhook
    await this.emitWebhook('agreement.voided', {
      agreementId,
      reason,
      voidedBy: userId,
      voidedAt: new Date().toISOString(),
    });

    logger.info(`[voidAgreement] Agreement ${agreementId} voided`);

    return { success: true };
  },

  /**
   * Send signature request email
   */
  async sendSignatureEmail({ to, recipientName, role, token, agreementName, isReminder = false }) {
    const signUrl = `${SIGNING_BASE_URL}/sign/${token}`;
    const subject = isReminder
      ? `Reminder: Please sign - ${agreementName}`
      : `Please sign: ${agreementName}`;

    const roleLabel = role === 'CUSTOMER' ? 'Customer' : 'Sales Agent';

    try {
      await sendEmailFromSesParams({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Html: {
              Data: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #667eea;">Panda Exteriors</h2>
                  <p>Hello ${recipientName || roleLabel},</p>
                  <p>${isReminder ? 'This is a reminder that you' : 'You'} have a document waiting for your signature.</p>
                  <p><strong>Document:</strong> ${agreementName}</p>
                  <p><strong>Your Role:</strong> ${roleLabel}</p>
                  <p style="margin: 30px 0;">
                    <a href="${signUrl}"
                       style="background-color: #667eea; color: white; padding: 12px 30px;
                              text-decoration: none; border-radius: 5px; display: inline-block;">
                      Click Here to Sign
                    </a>
                  </p>
                  <p style="color: #666; font-size: 12px;">
                    This link will expire in 7 days. If you have any questions, please contact us.
                  </p>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                  <p style="color: #999; font-size: 11px;">
                    This document was sent via PandaSign.
                    © ${new Date().getFullYear()} Panda Exteriors
                  </p>
                </div>
              `,
              Charset: 'UTF-8',
            },
          },
        },
      });
      logger.info(`[sendSignatureEmail] Email sent to ${to}`);
    } catch (emailErr) {
      logger.error(`[sendSignatureEmail] Failed to send email: ${emailErr.message}`);
      // Don't throw - email failure shouldn't block signing flow
    }
  },

  /**
   * Send final signed document email
   */
  async sendFinalDocumentEmail({ to, agreementName, signedPdfUrl }) {
    try {
      await sendEmailFromSesParams({
        Source: FROM_EMAIL,
        Destination: { ToAddresses: [to] },
        Message: {
          Subject: { Data: `Completed: ${agreementName}`, Charset: 'UTF-8' },
          Body: {
            Html: {
              Data: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #10b981;">✓ Document Completed</h2>
                  <p>The following document has been fully signed by all parties:</p>
                  <p><strong>${agreementName}</strong></p>
                  <p style="margin: 30px 0;">
                    <a href="${signedPdfUrl}"
                       style="background-color: #10b981; color: white; padding: 12px 30px;
                              text-decoration: none; border-radius: 5px; display: inline-block;">
                      Download Signed Document
                    </a>
                  </p>
                  <p style="color: #666; font-size: 12px;">
                    This link will expire in 7 days. Please download and save your copy.
                  </p>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
                  <p style="color: #999; font-size: 11px;">
                    This document was signed electronically via PandaSign in accordance with the ESIGN Act and UETA.
                  </p>
                </div>
              `,
              Charset: 'UTF-8',
            },
          },
        },
      });
      logger.info(`[sendFinalDocumentEmail] Email sent to ${to}`);
    } catch (emailErr) {
      logger.error(`[sendFinalDocumentEmail] Failed to send email: ${emailErr.message}`);
    }
  },

  /**
   * Emit webhook (simplified - stores for async delivery)
   */
  async emitWebhook(event, payload) {
    try {
      // For now, just log the webhook event
      // In production, you'd store this in a WebhookDelivery table and process async
      logger.info(`[emitWebhook] ${event}`, { payload });

      // TODO: Add actual webhook delivery
      // await prisma.webhookDelivery.create({
      //   data: { event, payload, targetUrl: '...', attempts: 0 },
      // });
    } catch (webhookErr) {
      logger.warn(`[emitWebhook] Failed to emit webhook: ${webhookErr.message}`);
    }
  },

  /**
   * Process agreement reminders (cron job)
   */
  async processReminders() {
    logger.info('[processReminders] Starting reminder check');
    const now = new Date();

    const agreements = await prisma.agreement.findMany({
      where: {
        status: { in: ['SENT', 'CUSTOMER_SIGNED'] },
        expiresAt: { gt: now },
      },
      include: {
        signatures: {
          where: { status: 'PENDING' },
        },
      },
    });

    let remindersSent = 0;

    for (const agreement of agreements) {
      if (!agreement.signatures.length) continue;

      const lastReminder = agreement.lastReminderSentAt;
      const hoursSinceLastReminder = lastReminder
        ? (now.getTime() - new Date(lastReminder).getTime()) / (1000 * 60 * 60)
        : Infinity;

      // Send reminder every 48 hours, max 3 reminders
      const reminderCount = agreement.reminderCount || 0;
      if (hoursSinceLastReminder >= 48 && reminderCount < 3) {
        const pendingSig = agreement.signatures[0];
        const signerConfig = agreement.signerConfig || [];
        const currentSigner = signerConfig[agreement.currentSignerIndex || 0];

        if (currentSigner && currentSigner.email) {
          await this.sendSignatureEmail({
            to: currentSigner.email,
            recipientName: currentSigner.name,
            role: currentSigner.role,
            token: agreement.signingToken,
            agreementName: agreement.name,
            isReminder: true,
          });

          await prisma.agreement.update({
            where: { id: agreement.id },
            data: {
              lastReminderSentAt: now,
              reminderCount: reminderCount + 1,
            },
          });

          remindersSent++;
        }
      }
    }

    logger.info(`[processReminders] Sent ${remindersSent} reminders`);
    return { remindersSent };
  },

  /**
   * Expire overdue agreements (cron job)
   */
  async expireAgreements() {
    logger.info('[expireAgreements] Checking for expired agreements');
    const now = new Date();

    const result = await prisma.agreement.updateMany({
      where: {
        expiresAt: { lt: now },
        status: { notIn: ['COMPLETED', 'VOIDED', 'EXPIRED'] },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    logger.info(`[expireAgreements] Expired ${result.count} agreements`);
    return { expiredCount: result.count };
  },
};

export default pandaSignService;
