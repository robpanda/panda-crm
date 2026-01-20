// PandaSign Service - Document generation and e-signature
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middleware/logger.js';
import { pdfService } from './pdfService.js';

const prisma = new PrismaClient();
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-2' });

const S3_BUCKET = process.env.DOCUMENTS_BUCKET || 'panda-crm-documents';
const SIGNING_BASE_URL = process.env.SIGNING_BASE_URL || 'https://sign.pandaexteriors.com';

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
        recipientEmail,
        recipientName,
        signingToken,
        signingUrl: `${SIGNING_BASE_URL}/sign/${signingToken}`,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        mergeData,
        createdById: userId,
      },
    });

    // Generate PDF document
    const pdfUrl = await this.generateDocument(agreement, template, mergeData);

    // Update agreement with document URL
    await prisma.agreement.update({
      where: { id: agreement.id },
      data: { documentUrl: pdfUrl },
    });

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
   */
  async generateDocument(agreement, template, mergeData) {
    let pdfDoc;

    if (template.pdfTemplateUrl) {
      // Load existing PDF template
      const response = await fetch(template.pdfTemplateUrl);
      const pdfBytes = await response.arrayBuffer();
      pdfDoc = await PDFDocument.load(pdfBytes);
    } else {
      // Create new PDF from scratch
      pdfDoc = await PDFDocument.create();
    }

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // If no template, create basic document
    if (!template.pdfTemplateUrl) {
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
      page.drawText(agreement.name, {
        x: 50,
        y: height - 80,
        size: 16,
        font: boldFont,
      });

      // Add document content from template
      const content = this.interpolateText(template.content || '', mergeData);
      const lines = this.wrapText(content, 80);
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

      page.drawText(`Name: ${agreement.recipientName || ''}`, {
        x: 50,
        y: 130,
        size: 10,
        font,
      });
    }

    // Add signature fields metadata
    const signatureFields = template.signatureFields || [
      { name: 'primary_signature', page: 1, x: 100, y: 150, width: 200, height: 50 },
    ];

    // Save document to S3
    const pdfBytes = await pdfDoc.save();
    const s3Key = `agreements/${agreement.id}/document.pdf`;

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: pdfBytes,
      ContentType: 'application/pdf',
      Metadata: {
        agreementId: agreement.id,
        agreementNumber: agreement.agreementNumber,
      },
    }));

    // Return presigned URL for viewing
    const url = await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key }),
      { expiresIn: 3600 * 24 * 7 } // 7 days
    );

    return url;
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
        sentById: userId,
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
      Source: process.env.FROM_EMAIL || 'documents@pandaexteriors.com',
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

    await sesClient.send(new SendEmailCommand(emailParams));
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
      Bucket: S3_BUCKET,
      Key: signatureKey,
      Body: signatureBuffer,
      ContentType: 'image/png',
    }));

    const signatureUrl = `https://${S3_BUCKET}.s3.amazonaws.com/${signatureKey}`;

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

    // Update agreement status
    const updated = await prisma.agreement.update({
      where: { id: agreement.id },
      data: {
        status: 'SIGNED',
        signedAt: new Date(),
        signedDocumentUrl,
      },
    });

    // Create audit log
    await this.createAuditLog(agreement.id, 'SIGNED', {
      status: 'VIEWED',
    }, {
      status: 'SIGNED',
      signerName: signature.signerName,
      ipAddress,
    }, null);

    // Send confirmation emails
    await this.sendCompletionEmails(updated, signature);

    logger.info(`Agreement signed: ${agreement.id}`);

    return {
      agreement: updated,
      signature,
    };
  },

  /**
   * Embed signature into PDF and generate Certificate of Completion
   */
  async embedSignature(agreement, signatureData) {
    // Load the original document
    const s3Key = `agreements/${agreement.id}/document.pdf`;
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    }));

    const pdfBytes = await response.Body.transformToByteArray();
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Embed signature image
    const signatureBuffer = Buffer.from(signatureData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const signatureImage = await pdfDoc.embedPng(signatureBuffer);

    // Get first page (or page specified in template)
    const pages = pdfDoc.getPages();
    const page = pages[0];

    // Add signature at the signature field location
    const signatureFields = agreement.template?.signatureFields || [
      { x: 100, y: 150, width: 200, height: 50 },
    ];

    const field = signatureFields[0];
    page.drawImage(signatureImage, {
      x: field.x,
      y: field.y,
      width: field.width,
      height: field.height,
    });

    // Add Certificate of Completion page
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

    // Document details
    const details = [
      `Document ID: ${agreement.agreementNumber}`,
      `Document Name: ${agreement.name}`,
      ``,
      `Signer: ${agreement.recipientName}`,
      `Email: ${agreement.recipientEmail}`,
      `Signed At: ${new Date().toISOString()}`,
      ``,
      `Document Hash: ${this.generateDocumentHash(pdfBytes)}`,
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

    // Audit trail
    certPage.drawText('AUDIT TRAIL', {
      x: 50,
      y: y - 30,
      size: 14,
      font: boldFont,
    });

    const auditLogs = await prisma.auditLog.findMany({
      where: { recordId: agreement.id, tableName: 'agreements' },
      orderBy: { createdAt: 'asc' },
    });

    y -= 60;
    for (const log of auditLogs) {
      certPage.drawText(`${log.createdAt.toISOString()} - ${log.action}`, {
        x: 50,
        y,
        size: 9,
        font,
      });
      y -= 15;
    }

    // Legal statement
    certPage.drawText('This document was signed electronically in accordance with the ESIGN Act and UETA.', {
      x: 50,
      y: 80,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });

    // Save signed document
    const signedPdfBytes = await pdfDoc.save();
    const signedKey = `agreements/${agreement.id}/signed-document.pdf`;

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: signedKey,
      Body: signedPdfBytes,
      ContentType: 'application/pdf',
      Metadata: {
        agreementId: agreement.id,
        signedAt: new Date().toISOString(),
      },
    }));

    // Return presigned URL
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: signedKey }),
      { expiresIn: 3600 * 24 * 365 } // 1 year
    );
  },

  /**
   * Send completion emails to all parties
   */
  async sendCompletionEmails(agreement, signature) {
    // Send to signer
    await sesClient.send(new SendEmailCommand({
      Source: process.env.FROM_EMAIL || 'documents@pandaexteriors.com',
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
    }));

    // Send to internal notification
    const internalEmail = process.env.INTERNAL_NOTIFICATION_EMAIL || 'sales@pandaexteriors.com';
    await sesClient.send(new SendEmailCommand({
      Source: process.env.FROM_EMAIL || 'documents@pandaexteriors.com',
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
    }));
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
        recipientEmail: options.recipientEmail || invoice.account?.email || invoice.account?.primaryContact?.email,
        recipientName: options.recipientName || invoice.account?.primaryContact?.name || invoice.account?.name,
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
        createdById: options.userId,
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
        recipientEmail: options.recipientEmail || contact?.email || account?.email,
        recipientName: options.recipientName || `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() || account?.name,
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
        createdById: options.userId,
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
        recipientEmail: options.recipientEmail || contact?.email || account?.email,
        recipientName: options.recipientName || `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() || account?.name,
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
        createdById: options.userId,
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
        recipientEmail,
        recipientName,
        signingToken,
        signingUrl: `${SIGNING_BASE_URL}/sign/${signingToken}`,
        expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
        documentUrl: pdfUrl,
        mergeData,
        createdById: userId,
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
        hostSigningToken,
        hostSignerName: hostInfo.name,
        hostSignerEmail: hostInfo.email,
        hostSigningInitiatedAt: new Date(),
        hostSigningInitiatedById: userId,
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
      where: { hostSigningToken: token },
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
      Bucket: S3_BUCKET,
      Key: signatureKey,
      Body: signatureBuffer,
      ContentType: 'image/png',
    }));

    const signatureUrl = `https://${S3_BUCKET}.s3.amazonaws.com/${signatureKey}`;

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
        completedAt: new Date(),
        signedDocumentUrl,
        hostSignedAt: new Date(),
        // Clear the host signing token after use
        hostSigningToken: null,
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
    const s3Key = agreement.signedDocumentUrl
      ? `agreements/${agreement.id}/signed-document.pdf`
      : `agreements/${agreement.id}/document.pdf`;

    const response = await s3Client.send(new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    }));

    const pdfBytes = await response.Body.transformToByteArray();
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Embed host signature image
    const signatureBuffer = Buffer.from(signatureData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    const signatureImage = await pdfDoc.embedPng(signatureBuffer);

    // Get the page for host signature (typically same page or designated page)
    const pages = pdfDoc.getPages();
    const page = pages[0];

    // Add host signature at second signature field location
    // (positioned to the right or below customer signature)
    const signatureFields = agreement.template?.signatureFields || [];
    const hostField = signatureFields.find(f => f.name === 'host_signature') || {
      x: 350, // Right side of page
      y: 150,
      width: 200,
      height: 50,
    };

    page.drawImage(signatureImage, {
      x: hostField.x,
      y: hostField.y,
      width: hostField.width,
      height: hostField.height,
    });

    // Add "Host/Agent Signature" label
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    page.drawText('Agent/Representative:', {
      x: hostField.x,
      y: hostField.y + hostField.height + 5,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Update Certificate of Completion with host signature info
    const certPageIndex = pdfDoc.getPageCount() - 1;
    const certPage = pages[certPageIndex];

    if (certPage) {
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // Find position after existing audit trail (around y=300)
      certPage.drawText('HOST/AGENT SIGNATURE', {
        x: 50,
        y: 250,
        size: 12,
        font: boldFont,
        color: rgb(0.25, 0.31, 0.71),
      });

      certPage.drawText(`Host Signer: ${agreement.hostSignerName || 'Agent'}`, {
        x: 50,
        y: 230,
        size: 10,
        font,
      });

      certPage.drawText(`Signed At: ${new Date().toISOString()}`, {
        x: 50,
        y: 215,
        size: 10,
        font,
      });
    }

    // Save completed document
    const completedPdfBytes = await pdfDoc.save();
    const completedKey = `agreements/${agreement.id}/completed-document.pdf`;

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: completedKey,
      Body: completedPdfBytes,
      ContentType: 'application/pdf',
      Metadata: {
        agreementId: agreement.id,
        completedAt: new Date().toISOString(),
        signatureCount: '2',
      },
    }));

    // Return presigned URL
    return await getSignedUrl(
      s3Client,
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: completedKey }),
      { expiresIn: 3600 * 24 * 365 } // 1 year
    );
  },

  /**
   * Send completion emails after host signing
   */
  async sendHostSigningCompletionEmails(agreement, hostSignature) {
    // Send to original customer
    await sesClient.send(new SendEmailCommand({
      Source: process.env.FROM_EMAIL || 'documents@pandaexteriors.com',
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
    }));

    // Send to host signer
    if (hostSignature.signerEmail) {
      await sesClient.send(new SendEmailCommand({
        Source: process.env.FROM_EMAIL || 'documents@pandaexteriors.com',
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
      }));
    }

    // Send to internal notification
    const internalEmail = process.env.INTERNAL_NOTIFICATION_EMAIL || 'sales@pandaexteriors.com';
    await sesClient.send(new SendEmailCommand({
      Source: process.env.FROM_EMAIL || 'documents@pandaexteriors.com',
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
    }));
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
};

export default pandaSignService;
