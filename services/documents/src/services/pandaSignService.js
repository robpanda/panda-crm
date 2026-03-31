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
const PANDASIGN_V2_SETTINGS_CATEGORY = 'pandasign_v2';
const PANDASIGN_V2_SETTING_KEYS = {
  BRANDING_ITEMS: 'pandasign_v2.branding_items',
  DYNAMIC_CONTENT_ITEMS: 'pandasign_v2.dynamic_content_items',
  TERRITORY_PROFILES: 'pandasign_v2.territory_profiles',
};
const PANDASIGN_V2_TERRITORIES = ['DE', 'MD', 'NJ', 'PA', 'NC', 'VA', 'FL', 'DEFAULT'];
const PANDASIGN_V2_DOCUMENT_TYPES = ['CONTRACT', 'CHANGE_ORDER', 'WORK_ORDER', 'FINANCING', 'OTHER'];
const DEFAULT_TEMPLATE_STATUS = 'DRAFT';
const DEFAULT_SIGNER_ROLES = [
  { role: 'CUSTOMER', label: 'Customer', required: true, order: 1 },
  { role: 'AGENT', label: 'Agent', required: true, order: 2 },
];

function deepCloneJson(value, fallback) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeJsonObjects(base, override) {
  if (!isPlainObject(base)) return deepCloneJson(override, override);
  if (!isPlainObject(override)) return deepCloneJson(base, base);

  const result = deepCloneJson(base, {});
  Object.entries(override).forEach(([key, value]) => {
    if (value === undefined) return;
    if (isPlainObject(result[key]) && isPlainObject(value)) {
      result[key] = mergeJsonObjects(result[key], value);
      return;
    }
    result[key] = deepCloneJson(value, value);
  });
  return result;
}

function getValueAtPath(data, fieldPath) {
  return String(fieldPath || '')
    .split('.')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce((value, part) => {
      if (value === null || value === undefined) return undefined;
      return value[part];
    }, data);
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return true;
}

function joinAddressParts(...parts) {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
}

function toPlainNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value?.toNumber === 'function') return value.toNumber();
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getContactDisplayName(contact) {
  return (
    contact?.fullName ||
    `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() ||
    ''
  );
}

function normalizeTerritory(value) {
  const normalized = String(value || 'DEFAULT').trim().toUpperCase();
  return PANDASIGN_V2_TERRITORIES.includes(normalized) ? normalized : 'DEFAULT';
}

function normalizeTemplateStatus(value) {
  const normalized = String(value || DEFAULT_TEMPLATE_STATUS).trim().toUpperCase();
  if (normalized === 'PUBLISHED' || normalized === 'ARCHIVED') return normalized;
  return DEFAULT_TEMPLATE_STATUS;
}

function normalizeDocumentType(value, fallback = 'CONTRACT') {
  const normalized = String(value || fallback || 'CONTRACT').trim().toUpperCase();
  return PANDASIGN_V2_DOCUMENT_TYPES.includes(normalized) ? normalized : 'OTHER';
}

function getDefaultTerritoryProfiles() {
  return PANDASIGN_V2_TERRITORIES.map((territory) => ({
    id: `territory-${territory.toLowerCase()}`,
    territory,
    company_name: territory === 'DEFAULT' ? 'Panda Exteriors' : '',
    company_phone: '',
    company_address: '',
    company_email: '',
    company_license: '',
  }));
}

function parseJsonSettingValue(setting, fallback) {
  if (!setting?.value) return deepCloneJson(fallback, fallback);
  try {
    return JSON.parse(setting.value);
  } catch {
    return deepCloneJson(fallback, fallback);
  }
}

function decodeHtmlEntities(text) {
  if (!text) return text;

  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'");
}

function renderHtmlToDocumentText(content) {
  if (!content) return '';

  const normalizedInput = String(content).replace(/\r\n?/g, '\n');
  const hasMarkup = /<[^>]+>/.test(normalizedInput);

  if (!hasMarkup) {
    return decodeHtmlEntities(normalizedInput)
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return decodeHtmlEntities(normalizedInput)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer|blockquote|h[1-6])>/gi, '\n\n')
    .replace(/<(p|div|section|article|header|footer|blockquote|h[1-6])[^>]*>/gi, '')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(ul|ol)>/gi, '\n')
    .replace(/<(ul|ol)[^>]*>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<tr[^>]*>/gi, '')
    .replace(/<\/t[dh]>/gi, ' ')
    .replace(/<t[dh][^>]*>/gi, '')
    .replace(/<hr\s*\/?>/gi, '\n--------------------\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTemplateMetadata(signatureFields) {
  if (Array.isArray(signatureFields)) {
    return {
      schemaVersion: 1,
      status: 'PUBLISHED',
      territory: 'DEFAULT',
      documentType: 'CONTRACT',
      signerRoles: deepCloneJson(DEFAULT_SIGNER_ROLES, []),
      requiredFieldsConfig: [],
      branding: { headerId: '', footerId: '' },
      dynamicContentRefs: [],
      signingOrder: 'SEQUENTIAL',
      fields: deepCloneJson(signatureFields, []),
    };
  }

  if (signatureFields && typeof signatureFields === 'object') {
    const fields = Array.isArray(signatureFields.fields)
      ? signatureFields.fields
      : Array.isArray(signatureFields.signatureFields)
        ? signatureFields.signatureFields
        : [];

    return {
      schemaVersion: signatureFields.schemaVersion || 2,
      status: normalizeTemplateStatus(signatureFields.status),
      territory: normalizeTerritory(signatureFields.territory),
      documentType: normalizeDocumentType(signatureFields.documentType || signatureFields.category),
      signerRoles: normalizeSignerRoles(signatureFields.signerRoles),
      requiredFieldsConfig: normalizeRequiredFieldsConfig(signatureFields.requiredFieldsConfig),
      branding: normalizeBrandingSelection(signatureFields.branding),
      dynamicContentRefs: normalizeDynamicContentRefs(signatureFields.dynamicContentRefs),
      signingOrder: String(signatureFields.signingOrder || 'SEQUENTIAL').toUpperCase(),
      fields: normalizeSignatureFieldLayout(fields, signatureFields.signerRoles),
    };
  }

  return {
    schemaVersion: 2,
    status: DEFAULT_TEMPLATE_STATUS,
    territory: 'DEFAULT',
    documentType: 'CONTRACT',
    signerRoles: deepCloneJson(DEFAULT_SIGNER_ROLES, []),
    requiredFieldsConfig: [],
    branding: { headerId: '', footerId: '' },
    dynamicContentRefs: [],
    signingOrder: 'SEQUENTIAL',
    fields: buildDefaultSignatureFieldLayout(DEFAULT_SIGNER_ROLES),
  };
}

function normalizeSignerRoles(signerRoles) {
  const roles = Array.isArray(signerRoles) && signerRoles.length > 0 ? signerRoles : DEFAULT_SIGNER_ROLES;
  return roles.map((role, index) => ({
    role: String(role?.role || role || '').trim().toUpperCase() || `SIGNER_${index + 1}`,
    label: String(role?.label || role?.role || role || `Signer ${index + 1}`).trim(),
    required: role?.required !== false,
    order: Number.isFinite(Number(role?.order)) ? Number(role.order) : index + 1,
  }));
}

function normalizeRequiredFieldsConfig(requiredFieldsConfig) {
  if (!Array.isArray(requiredFieldsConfig)) return [];
  return requiredFieldsConfig
    .map((field, index) => {
      if (!field || typeof field !== 'object') return null;
      const role = String(field.role || '').trim().toUpperCase();
      const type = String(field.type || '').trim().toUpperCase();
      const label = String(field.label || field.name || '').trim();
      if (!role || !type || !label) return null;
      return {
        id: field.id || `required-field-${index + 1}`,
        role,
        type,
        label,
        required: field.required !== false,
      };
    })
    .filter(Boolean);
}

function normalizeBrandingSelection(branding) {
  return {
    headerId: String(branding?.headerId || '').trim(),
    footerId: String(branding?.footerId || '').trim(),
  };
}

function normalizeDynamicContentRefs(dynamicContentRefs) {
  if (!Array.isArray(dynamicContentRefs)) return [];
  return [...new Set(dynamicContentRefs.map((value) => String(value || '').trim()).filter(Boolean))];
}

function buildDefaultSignatureFieldLayout(signerRoles) {
  const normalizedRoles = normalizeSignerRoles(signerRoles);
  const baseY = 150;
  return normalizedRoles.flatMap((signer, index) => {
    const isAgent = signer.role === 'AGENT';
    const signatureName = isAgent ? 'host_signature' : `${signer.role.toLowerCase()}_signature`;
    const initialName = isAgent ? 'host_initials' : `${signer.role.toLowerCase()}_initials`;
    const x = isAgent ? 350 : 100;
    const y = baseY - (index > 1 ? (index - 1) * 70 : 0);

    return [
      {
        name: signatureName,
        role: signer.role,
        type: 'SIGNATURE',
        page: 1,
        x,
        y,
        width: 200,
        height: 50,
      },
      {
        name: initialName,
        role: signer.role,
        type: 'INITIAL',
        page: 1,
        x,
        y: y - 35,
        width: 80,
        height: 24,
      },
    ];
  });
}

function normalizeSignatureFieldLayout(fields, signerRoles) {
  if (!Array.isArray(fields) || fields.length === 0) {
    return buildDefaultSignatureFieldLayout(signerRoles);
  }

  return fields.map((field, index) => ({
    name: field.name || `signature_field_${index + 1}`,
    role: String(field.role || 'CUSTOMER').trim().toUpperCase(),
    type: String(field.type || 'SIGNATURE').trim().toUpperCase(),
    page: Number.isFinite(Number(field.page)) ? Number(field.page) : 1,
    x: Number.isFinite(Number(field.x)) ? Number(field.x) : 100,
    y: Number.isFinite(Number(field.y)) ? Number(field.y) : 150,
    width: Number.isFinite(Number(field.width)) ? Number(field.width) : 200,
    height: Number.isFinite(Number(field.height)) ? Number(field.height) : 50,
  }));
}

function getTemplateSignatureFields(templateOrSignatureFields) {
  const signatureFields = templateOrSignatureFields?.signatureFields ?? templateOrSignatureFields;
  return extractTemplateMetadata(signatureFields).fields;
}

function extractMergeFieldsFromContent(content) {
  const matches = String(content || '').match(/\{\{[^}]+\}\}/g) || [];
  return [...new Set(matches.map((match) => match.slice(2, -2).trim()).filter(Boolean))];
}

function normalizeBrandingItem(item, kind) {
  return {
    id: item?.id || crypto.randomUUID(),
    kind: String(item?.kind || kind || 'HEADER').trim().toUpperCase(),
    name: String(item?.name || '').trim(),
    territory: normalizeTerritory(item?.territory),
    content: String(item?.content || '').trim(),
    description: String(item?.description || '').trim(),
    isActive: item?.isActive !== false,
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function normalizeDynamicContentItem(item) {
  return {
    id: item?.id || crypto.randomUUID(),
    key: String(item?.key || '').trim(),
    name: String(item?.name || item?.key || '').trim(),
    territory: normalizeTerritory(item?.territory),
    content: String(item?.content || '').trim(),
    description: String(item?.description || '').trim(),
    isActive: item?.isActive !== false,
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function mapTerritoryProfileValues(profile) {
  return {
    territory: normalizeTerritory(profile?.territory),
    company_name: String(profile?.company_name || '').trim(),
    company_phone: String(profile?.company_phone || '').trim(),
    company_address: String(profile?.company_address || '').trim(),
    company_email: String(profile?.company_email || '').trim(),
    company_license: String(profile?.company_license || '').trim(),
  };
}

function normalizeTerritoryProfiles(profiles) {
  const byTerritory = new Map(
    getDefaultTerritoryProfiles().map((profile) => [profile.territory, profile])
  );

  if (Array.isArray(profiles)) {
    profiles.forEach((profile) => {
      const normalized = mapTerritoryProfileValues(profile);
      byTerritory.set(normalized.territory, {
        ...byTerritory.get(normalized.territory),
        ...normalized,
      });
    });
  }

  return PANDASIGN_V2_TERRITORIES.map((territory) => ({
    id: byTerritory.get(territory)?.id || `territory-${territory.toLowerCase()}`,
    ...byTerritory.get(territory),
  }));
}

function serializeTemplate(template) {
  const metadata = extractTemplateMetadata(template.signatureFields);
  const signatureFields = metadata.fields;
  return {
    ...template,
    category: metadata.documentType || template.category,
    documentType: metadata.documentType || template.category || 'CONTRACT',
    territory: metadata.territory,
    status: metadata.status,
    signerRoles: metadata.signerRoles,
    requiredFieldsConfig: metadata.requiredFieldsConfig,
    branding: metadata.branding,
    dynamicContentRefs: metadata.dynamicContentRefs,
    signingOrder: metadata.signingOrder,
    signatureFields,
    templateConfig: metadata,
  };
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

    const resolvedMergeData = await this.resolveAgreementMergeData({
      template,
      opportunityId,
      accountId,
      contactId,
      mergeData,
    });

    // Generate agreement number
    const agreementNumber = `AGR-${Date.now()}-${uuidv4().slice(0, 4).toUpperCase()}`;

    // Generate signing token (used for secure access to signing page)
    const signingToken = crypto.randomBytes(32).toString('hex');

    // Create agreement record
    const agreement = await prisma.agreement.create({
      data: {
        agreementNumber,
        name: this.interpolateText(template.name, resolvedMergeData),
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
        mergeData: resolvedMergeData,
        createdById: userId,
      },
    });

    // Generate PDF document
    const pdfUrl = await this.generateDocument(agreement, template, resolvedMergeData);

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
    const templateDocumentUrl = template.documentUrl;

    if (templateDocumentUrl) {
      // Load existing PDF template
      const response = await fetch(templateDocumentUrl);
      const pdfBytes = await response.arrayBuffer();
      pdfDoc = await PDFDocument.load(pdfBytes);
    } else {
      // Create new PDF from scratch
      pdfDoc = await PDFDocument.create();
    }

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // If no template, create basic document
    if (!templateDocumentUrl) {
      let page = pdfDoc.addPage([612, 792]); // Letter size
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
      const content = await this.buildTemplateDocumentText(template, mergeData);
      const lines = this.wrapText(content, 80);
      let y = height - 120;

      for (const line of lines) {
        if (y < 100) {
          // Add new page if needed
          page = pdfDoc.addPage([612, 792]);
          y = page.getSize().height - 50;
        }
        if (line) {
          page.drawText(line, {
            x: 50,
            y,
            size: 10,
            font,
          });
        }
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
    const signatureFields = getTemplateSignatureFields(template) || [
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

    // Determine if agreement is now complete (change orders have agent signature already)
    const hasAgentSignature = agreement.agentSignedAt || agreement.agentSignerName;
    const finalStatus = hasAgentSignature ? 'COMPLETED' : 'SIGNED';

    // Update agreement status
    const updated = await prisma.agreement.update({
      where: { id: agreement.id },
      data: {
        status: finalStatus,
        signedAt: new Date(),
        signedDocumentUrl,
        ...(hasAgentSignature && { completedAt: new Date() }),
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
    const signatureFields = getTemplateSignatureFields(agreement.template) || [
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
      const value = getValueAtPath(data, fieldPath);
      return value !== undefined ? value : '';
    });
  },

  async getAgreementContextData({ opportunityId, accountId, contactId } = {}) {
    let opportunity = null;
    let account = null;
    let contact = null;

    if (opportunityId) {
      opportunity = await prisma.opportunity.findUnique({
        where: { id: opportunityId },
        include: {
          account: true,
          contact: true,
        },
      });
      account = opportunity?.account || null;
      contact = opportunity?.contact || null;
    }

    if (!account && accountId) {
      account = await prisma.account.findUnique({
        where: { id: accountId },
      });
    }

    if (!contact && contactId) {
      contact = await prisma.contact.findUnique({
        where: { id: contactId },
      });
    }

    const customerName = getContactDisplayName(contact) || account?.name || '';
    const customerEmail = contact?.email || account?.email || '';
    const customerPhone = contact?.mobilePhone || contact?.phone || account?.phone || '';

    const propertyStreet = opportunity?.street || account?.billingStreet || '';
    const propertyCity = opportunity?.city || account?.billingCity || '';
    const propertyState = opportunity?.state || account?.billingState || '';
    const propertyPostalCode = opportunity?.postalCode || account?.billingPostalCode || '';
    const propertyCountry = account?.billingCountry || '';
    const propertyAddress = joinAddressParts(
      propertyStreet,
      propertyCity,
      propertyState,
      propertyPostalCode
    );

    return {
      customerName,
      customer_name: customerName,
      customerEmail,
      customer_email: customerEmail,
      customerPhone,
      customer_phone: customerPhone,
      projectName: opportunity?.name || '',
      project_name: opportunity?.name || '',
      projectAddress: propertyAddress,
      project_address: propertyAddress,
      jobId: opportunity?.jobId || '',
      job_id: opportunity?.jobId || '',
      opportunityId: opportunity?.id || opportunityId || '',
      opportunity_id: opportunity?.id || opportunityId || '',
      accountId: account?.id || accountId || '',
      account_id: account?.id || accountId || '',
      contactId: contact?.id || contactId || '',
      contact_id: contact?.id || contactId || '',
      customer: {
        name_full: customerName,
        first_name: contact?.firstName || '',
        last_name: contact?.lastName || '',
        email: customerEmail,
        phone: customerPhone,
      },
      account: {
        id: account?.id || accountId || '',
        name: account?.name || '',
        email: account?.email || '',
        phone: account?.phone || '',
        billing_street: account?.billingStreet || '',
        billing_city: account?.billingCity || '',
        billing_state: account?.billingState || '',
        billing_postal_code: account?.billingPostalCode || '',
        billing_country: account?.billingCountry || '',
        address_full: joinAddressParts(
          account?.billingStreet,
          account?.billingCity,
          account?.billingState,
          account?.billingPostalCode
        ),
      },
      contact: {
        id: contact?.id || contactId || '',
        first_name: contact?.firstName || '',
        last_name: contact?.lastName || '',
        full_name: customerName,
        email: customerEmail,
        phone: contact?.phone || '',
        mobile_phone: contact?.mobilePhone || '',
      },
      opportunity: {
        id: opportunity?.id || opportunityId || '',
        job_id: opportunity?.jobId || '',
        name: opportunity?.name || '',
        stage: opportunity?.stage || '',
        status: opportunity?.status || '',
        amount: toPlainNumber(opportunity?.amount),
        insurance_carrier: opportunity?.insuranceCarrier || '',
        claim_number: opportunity?.claimNumber || '',
        claim_filed_date: opportunity?.claimFiledDate || null,
        date_of_loss: opportunity?.dateOfLoss || null,
        damage_location: opportunity?.damageLocation || '',
        street: propertyStreet,
        city: propertyCity,
        state: propertyState,
        postal_code: propertyPostalCode,
        country: propertyCountry,
        address_full: propertyAddress,
      },
      job: {
        id: opportunity?.id || opportunityId || '',
        job_id: opportunity?.jobId || '',
        name: opportunity?.name || '',
        stage: opportunity?.stage || '',
        status: opportunity?.status || '',
        amount: toPlainNumber(opportunity?.amount),
        street: propertyStreet,
        city: propertyCity,
        state: propertyState,
        postal_code: propertyPostalCode,
        country: propertyCountry,
        address_full: propertyAddress,
        customer: {
          name_full: customerName,
          first_name: contact?.firstName || '',
          last_name: contact?.lastName || '',
          email: customerEmail,
          phone: customerPhone,
        },
      },
    };
  },

  async resolveAgreementMergeData({
    template,
    opportunityId,
    accountId,
    contactId,
    mergeData = {},
  }) {
    const contextData = await this.getAgreementContextData({
      opportunityId,
      accountId,
      contactId,
    });

    const mergedMergeData = mergeJsonObjects(contextData, deepCloneJson(mergeData, {}));
    return this.buildTemplateMergeData(template, mergedMergeData);
  },

  async getJsonSetting(key, fallback) {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    return parseJsonSettingValue(setting, fallback);
  },

  async upsertJsonSetting(key, value, userId, description = null) {
    const serialized = JSON.stringify(value);
    await prisma.systemSetting.upsert({
      where: { key },
      update: {
        value: serialized,
        description: description || undefined,
        category: PANDASIGN_V2_SETTINGS_CATEGORY,
        updatedById: userId || undefined,
      },
      create: {
        key,
        value: serialized,
        description: description || undefined,
        category: PANDASIGN_V2_SETTINGS_CATEGORY,
        createdById: userId || undefined,
        updatedById: userId || undefined,
      },
    });
  },

  async getBrandingItems() {
    const items = await this.getJsonSetting(PANDASIGN_V2_SETTING_KEYS.BRANDING_ITEMS, []);
    return Array.isArray(items)
      ? items.map((item) => normalizeBrandingItem(item, item?.kind))
      : [];
  },

  async getDynamicContentItems() {
    const items = await this.getJsonSetting(PANDASIGN_V2_SETTING_KEYS.DYNAMIC_CONTENT_ITEMS, []);
    return Array.isArray(items)
      ? items.map((item) => normalizeDynamicContentItem(item))
      : [];
  },

  getSignatureFields(templateOrSignatureFields) {
    return getTemplateSignatureFields(templateOrSignatureFields);
  },

  async getTerritoryProfiles() {
    const profiles = await this.getJsonSetting(
      PANDASIGN_V2_SETTING_KEYS.TERRITORY_PROFILES,
      getDefaultTerritoryProfiles()
    );
    return normalizeTerritoryProfiles(profiles);
  },

  async buildTemplateMergeData(template, mergeData = {}) {
    const metadata = extractTemplateMetadata(template.signatureFields);
    const [brandingItems, dynamicContentItems, territoryProfiles] = await Promise.all([
      this.getBrandingItems(),
      this.getDynamicContentItems(),
      this.getTerritoryProfiles(),
    ]);

    const territory = metadata.territory || 'DEFAULT';
    const territoryProfile =
      territoryProfiles.find((profile) => profile.territory === territory) ||
      territoryProfiles.find((profile) => profile.territory === 'DEFAULT') ||
      {};

    const dynamicContent = {};
    const activeItems = dynamicContentItems.filter((item) => item.isActive !== false);
    const referencedKeys = metadata.dynamicContentRefs.length > 0
      ? metadata.dynamicContentRefs
      : activeItems.map((item) => item.key);

    referencedKeys.forEach((key) => {
      const match = activeItems.find((item) => item.key === key && item.territory === territory)
        || activeItems.find((item) => item.key === key && item.territory === 'DEFAULT')
        || null;
      if (match) {
        dynamicContent[key] = this.interpolateText(match.content, mergeData);
      }
    });

    const territoryData = {
      company_name: territoryProfile.company_name || '',
      company_phone: territoryProfile.company_phone || '',
      company_address: territoryProfile.company_address || '',
      company_email: territoryProfile.company_email || '',
      company_license: territoryProfile.company_license || '',
    };

    return {
      ...deepCloneJson(mergeData, {}),
      territory: territoryData,
      dynamic: dynamicContent,
      job: {
        ...(mergeData.job || {}),
        customer: {
          ...((mergeData.job && mergeData.job.customer) || {}),
          name_full:
            mergeData.job?.customer?.name_full ||
            mergeData.customerName ||
            mergeData.customer_name ||
            '',
        },
      },
      _pandaSignBranding: brandingItems.filter((item) => item.isActive !== false),
      _pandaSignTemplateMeta: metadata,
    };
  },

  async verifyRequiredFields(payload = {}) {
    const templateId = payload.templateId;
    if (!templateId) {
      throw new Error('templateId is required');
    }

    const context = payload.context || {};
    const template = await this.getTemplateById(templateId);
    const resolvedMergeData = await this.resolveAgreementMergeData({
      template,
      opportunityId: context.opportunityId || payload.opportunityId,
      accountId: context.accountId || payload.accountId,
      contactId: context.contactId || payload.contactId,
      mergeData: payload.mergeData || {},
    });

    const metadata = extractTemplateMetadata(template.signatureFields);
    const mergeFields = Array.isArray(template.mergeFields) && template.mergeFields.length > 0
      ? template.mergeFields
      : [
          ...new Set([
            ...extractMergeFieldsFromContent(template.name),
            ...extractMergeFieldsFromContent(template.content),
          ]),
        ];

    const missingTokens = mergeFields
      .filter((fieldPath) => !hasValue(getValueAtPath(resolvedMergeData, fieldPath)))
      .map((token) => ({ token }));

    const signerRoles = normalizeSignerRoles(metadata.signerRoles);
    const requiresCustomer = signerRoles.some((role) => role.role === 'CUSTOMER' && role.required !== false);
    const requiresAgent = signerRoles.some((role) => role.role === 'AGENT' && role.required !== false);
    const customerEmail =
      payload.customerEmail ||
      payload.emails?.customer ||
      payload.recipientEmail ||
      resolvedMergeData.customerEmail ||
      resolvedMergeData.contact?.email ||
      '';
    const agentEmail = payload.agentEmail || payload.emails?.agent || '';

    const requiredFieldFailures = [];
    if (requiresCustomer && !hasValue(customerEmail)) {
      requiredFieldFailures.push({
        field: 'customerEmail',
        role: 'CUSTOMER',
        message: 'Customer email is required',
      });
    }
    if (requiresAgent && !hasValue(agentEmail)) {
      requiredFieldFailures.push({
        field: 'agentEmail',
        role: 'AGENT',
        message: 'Agent email is required',
      });
    }

    const checklist = [
      { id: 'template', label: 'Template selected', status: 'COMPLETE' },
      {
        id: 'merge-fields',
        label: 'Template merge fields',
        status: missingTokens.length > 0 ? 'MISSING' : 'COMPLETE',
        missing: missingTokens.map((item) => item.token),
      },
      ...(requiresCustomer
        ? [{ id: 'customer-email', label: 'Customer email', status: hasValue(customerEmail) ? 'COMPLETE' : 'MISSING' }]
        : []),
      ...(requiresAgent
        ? [{ id: 'agent-email', label: 'Agent email', status: hasValue(agentEmail) ? 'COMPLETE' : 'MISSING' }]
        : []),
    ];

    return {
      checklist,
      validationChecklist: checklist,
      missingTokens,
      requiredFieldFailures,
      signaturePlaceholders: metadata.fields,
      fieldMapReport: {
        fields: metadata.fields,
        missingTokens,
      },
    };
  },

  async previewTemplate(payload = {}) {
    const templateId = payload.templateId;
    if (!templateId) {
      throw new Error('templateId is required');
    }

    const context = payload.context || {};
    const template = await this.getTemplateById(templateId);
    const resolvedMergeData = await this.resolveAgreementMergeData({
      template,
      opportunityId: context.opportunityId || payload.opportunityId,
      accountId: context.accountId || payload.accountId,
      contactId: context.contactId || payload.contactId,
      mergeData: payload.mergeData || {},
    });
    const verification = await this.verifyRequiredFields(payload);

    const previewAgreement = {
      id: `preview-${uuidv4()}`,
      agreementNumber: `PREVIEW-${Date.now()}`,
      name: this.interpolateText(template.name, resolvedMergeData),
      recipientName: resolvedMergeData.customerName || payload.recipientName || 'Customer',
    };

    const previewUrl = await this.generateDocument(previewAgreement, template, resolvedMergeData);
    const previewHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ templateId, mergeData: resolvedMergeData }))
      .digest('hex');

    return {
      previewUrl,
      documentUrl: previewUrl,
      previewHash,
      documentHash: previewHash,
      missingTokens: verification.missingTokens,
      signaturePlaceholders: verification.signaturePlaceholders,
      fieldMapReport: verification.fieldMapReport,
      previewReport: {
        missingTokens: verification.missingTokens,
        warnings: [],
      },
    };
  },

  async sendAgreementV2(payload = {}) {
    const templateId = payload.templateId;
    if (!templateId) {
      throw new Error('templateId is required');
    }

    const context = payload.context || {};
    const contextData = await this.getAgreementContextData({
      opportunityId: context.opportunityId || payload.opportunityId,
      accountId: context.accountId || payload.accountId,
      contactId: context.contactId || payload.contactId,
    });

    const recipientEmail =
      payload.recipientEmail ||
      payload.customerEmail ||
      payload.emails?.customer ||
      contextData.customerEmail;
    const recipientName =
      payload.recipientName ||
      contextData.customerName ||
      'Customer';

    if (!recipientEmail) {
      throw new Error('recipientEmail is required');
    }

    const agreement = await this.createAgreement({
      templateId,
      opportunityId: context.opportunityId || payload.opportunityId,
      accountId: context.accountId || payload.accountId,
      contactId: context.contactId || payload.contactId,
      recipientEmail,
      recipientName,
      mergeData: payload.mergeData || {},
      userId: payload.userId,
    });

    if (payload.instantSign) {
      return agreement;
    }

    const sentAgreement = await this.sendForSignature(agreement.id, payload.userId);
    return {
      ...agreement,
      ...sentAgreement,
    };
  },

  async buildTemplateDocumentText(template, mergeData = {}) {
    const metadata = extractTemplateMetadata(template.signatureFields);
    const [brandingItems, resolvedMergeData] = await Promise.all([
      this.getBrandingItems(),
      this.buildTemplateMergeData(template, mergeData),
    ]);

    const activeBranding = brandingItems.filter((item) => item.isActive !== false);
    const header = activeBranding.find(
      (item) => item.id === metadata.branding.headerId && item.kind === 'HEADER'
    );
    const footer = activeBranding.find(
      (item) => item.id === metadata.branding.footerId && item.kind === 'FOOTER'
    );

    return [
      header ? renderHtmlToDocumentText(this.interpolateText(header.content, resolvedMergeData)) : '',
      renderHtmlToDocumentText(this.interpolateText(template.content || '', resolvedMergeData)),
      footer ? renderHtmlToDocumentText(this.interpolateText(footer.content, resolvedMergeData)) : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  },

  /**
   * Wrap text for PDF rendering
   */
  wrapText(text, maxCharsPerLine) {
    const lines = [];
    const paragraphs = String(text || '').split('\n');

    for (const paragraph of paragraphs) {
      const trimmedParagraph = paragraph.trim();
      if (!trimmedParagraph) {
        lines.push('');
        continue;
      }

      const words = trimmedParagraph.split(/\s+/);
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
    }

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
    const signatureFields = getTemplateSignatureFields(agreement.template) || [];
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
  async getTemplates(filters = {}) {
    const templates = await prisma.agreementTemplate.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    return templates
      .map((template) => serializeTemplate(template))
      .filter((template) => {
        if (filters.category && template.category !== filters.category) return false;
        if (filters.documentType && template.documentType !== normalizeDocumentType(filters.documentType, template.documentType)) return false;
        if (filters.territory && template.territory !== normalizeTerritory(filters.territory)) return false;
        if (filters.status && template.status !== normalizeTemplateStatus(filters.status)) return false;
        if (filters.isActive !== undefined && template.isActive !== (String(filters.isActive) === 'true')) return false;
        if (filters.q) {
          const query = String(filters.q).toLowerCase();
          const haystack = [template.name, template.description, template.category, template.documentType, template.territory]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(query)) return false;
        }
        return true;
      });
  },

  async getTemplateById(id) {
    const template = await prisma.agreementTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    return serializeTemplate(template);
  },

  async getAdminResources() {
    const [brandingItems, dynamicContentItems, territoryProfiles] = await Promise.all([
      this.getBrandingItems(),
      this.getDynamicContentItems(),
      this.getTerritoryProfiles(),
    ]);

    return {
      brandingItems,
      dynamicContentItems,
      territoryProfiles,
      territories: PANDASIGN_V2_TERRITORIES,
      documentTypes: PANDASIGN_V2_DOCUMENT_TYPES,
    };
  },

  async updateTerritoryProfiles(profiles, userId) {
    const normalizedProfiles = normalizeTerritoryProfiles(profiles);
    await this.upsertJsonSetting(
      PANDASIGN_V2_SETTING_KEYS.TERRITORY_PROFILES,
      normalizedProfiles,
      userId,
      'PandaSign V2 territory merge values'
    );
    return normalizedProfiles;
  },

  async listBrandingItems(filters = {}) {
    return (await this.getBrandingItems()).filter((item) => {
      if (filters.kind && item.kind !== String(filters.kind).trim().toUpperCase()) return false;
      if (filters.territory && item.territory !== normalizeTerritory(filters.territory)) return false;
      if (filters.isActive !== undefined && item.isActive !== (String(filters.isActive) === 'true')) return false;
      return true;
    });
  },

  async upsertBrandingItem(data, userId) {
    const kind = String(data?.kind || '').trim().toUpperCase();
    if (kind !== 'HEADER' && kind !== 'FOOTER') {
      throw new Error('Branding item kind must be HEADER or FOOTER');
    }

    const normalizedItem = normalizeBrandingItem(data, kind);
    if (!normalizedItem.name) {
      throw new Error('Branding item name is required');
    }
    if (!normalizedItem.content) {
      throw new Error('Branding item content is required');
    }

    const items = await this.getBrandingItems();
    const nextItems = items.some((item) => item.id === normalizedItem.id)
      ? items.map((item) => (item.id === normalizedItem.id ? { ...item, ...normalizedItem } : item))
      : [...items, normalizedItem];

    await this.upsertJsonSetting(
      PANDASIGN_V2_SETTING_KEYS.BRANDING_ITEMS,
      nextItems,
      userId,
      'PandaSign V2 reusable branding items'
    );

    return normalizedItem;
  },

  async listDynamicContentItems(filters = {}) {
    return (await this.getDynamicContentItems()).filter((item) => {
      if (filters.territory && item.territory !== normalizeTerritory(filters.territory)) return false;
      if (filters.isActive !== undefined && item.isActive !== (String(filters.isActive) === 'true')) return false;
      if (filters.key && item.key !== String(filters.key).trim()) return false;
      return true;
    });
  },

  async upsertDynamicContentItem(data, userId) {
    const normalizedItem = normalizeDynamicContentItem(data);
    if (!normalizedItem.key) {
      throw new Error('Dynamic content key is required');
    }
    if (!normalizedItem.content) {
      throw new Error('Dynamic content content is required');
    }

    const items = await this.getDynamicContentItems();
    const nextItems = items.some((item) => item.id === normalizedItem.id)
      ? items.map((item) => (item.id === normalizedItem.id ? { ...item, ...normalizedItem } : item))
      : [...items, normalizedItem];

    await this.upsertJsonSetting(
      PANDASIGN_V2_SETTING_KEYS.DYNAMIC_CONTENT_ITEMS,
      nextItems,
      userId,
      'PandaSign V2 dynamic content blocks'
    );

    return normalizedItem;
  },

  async validateTemplateForPublish(templateLike) {
    const template = serializeTemplate(templateLike);
    const [brandingItems] = await Promise.all([
      this.getBrandingItems(),
    ]);

    const errors = [];

    if (!template.name?.trim()) errors.push('Template name is required.');
    if (!template.content?.trim()) errors.push('Template body content is required.');
    if (!template.documentType) errors.push('Document type is required.');
    if (!template.territory) errors.push('Territory is required.');
    if (!Array.isArray(template.signerRoles) || template.signerRoles.length === 0) {
      errors.push('At least one signer role is required.');
    }
    if (!Array.isArray(template.requiredFieldsConfig)) {
      errors.push('Required field configuration is invalid.');
    }
    if (!template.branding?.headerId || !template.branding?.footerId) {
      errors.push('A header and footer must be selected before publishing.');
    }

    const activeBrandingItems = brandingItems.filter((item) => item.isActive !== false);
    if (
      template.branding?.headerId &&
      !activeBrandingItems.find((item) => item.id === template.branding.headerId && item.kind === 'HEADER')
    ) {
      errors.push('Selected header is not valid.');
    }
    if (
      template.branding?.footerId &&
      !activeBrandingItems.find((item) => item.id === template.branding.footerId && item.kind === 'FOOTER')
    ) {
      errors.push('Selected footer is not valid.');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  },

  /**
   * Create or update agreement template (admin)
   */
  async upsertTemplate(data) {
    const existing = data.id
      ? await prisma.agreementTemplate.findUnique({ where: { id: data.id } })
      : null;
    const existingMetadata = extractTemplateMetadata(existing?.signatureFields);

    const signerRoles = normalizeSignerRoles(data.signerRoles || existingMetadata.signerRoles);
    const normalizedMetadata = {
      schemaVersion: 2,
      status: normalizeTemplateStatus(data.status || existingMetadata.status || DEFAULT_TEMPLATE_STATUS),
      territory: normalizeTerritory(data.territory || existingMetadata.territory),
      documentType: normalizeDocumentType(data.documentType || data.category || existingMetadata.documentType),
      signerRoles,
      requiredFieldsConfig: normalizeRequiredFieldsConfig(
        data.requiredFieldsConfig !== undefined ? data.requiredFieldsConfig : existingMetadata.requiredFieldsConfig
      ),
      branding: normalizeBrandingSelection(data.branding || existingMetadata.branding),
      dynamicContentRefs: normalizeDynamicContentRefs(
        data.dynamicContentRefs !== undefined ? data.dynamicContentRefs : existingMetadata.dynamicContentRefs
      ),
      signingOrder: String(data.signingOrder || existingMetadata.signingOrder || 'SEQUENTIAL').toUpperCase(),
      fields: normalizeSignatureFieldLayout(data.signatureFields || existingMetadata.fields, signerRoles),
    };

    const payload = {
      name: data.name,
      description: data.description || '',
      category: normalizedMetadata.documentType,
      content: data.content,
      documentUrl: data.documentUrl || data.pdfTemplateUrl || existing?.documentUrl || null,
      signatureFields: normalizedMetadata,
      mergeFields: data.mergeFields || extractMergeFieldsFromContent(data.content),
      isActive: normalizedMetadata.status !== 'ARCHIVED',
    };

    if (data.id) {
      const updated = await prisma.agreementTemplate.update({
        where: { id: data.id },
        data: payload,
      });
      return serializeTemplate(updated);
    }

    const created = await prisma.agreementTemplate.create({
      data: payload,
    });
    return serializeTemplate(created);
  },

  async publishTemplate(id) {
    const existing = await prisma.agreementTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Template not found');
    }

    const validation = await this.validateTemplateForPublish(existing);
    if (!validation.valid) {
      const error = new Error('Template validation failed');
      error.validationErrors = validation.errors;
      throw error;
    }

    const metadata = extractTemplateMetadata(existing.signatureFields);
    const updated = await prisma.agreementTemplate.update({
      where: { id },
      data: {
        isActive: true,
        signatureFields: {
          ...metadata,
          status: 'PUBLISHED',
        },
      },
    });

    return serializeTemplate(updated);
  },

  async archiveTemplate(id) {
    const existing = await prisma.agreementTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Template not found');
    }

    const metadata = extractTemplateMetadata(existing.signatureFields);
    const updated = await prisma.agreementTemplate.update({
      where: { id },
      data: {
        isActive: false,
        signatureFields: {
          ...metadata,
          status: 'ARCHIVED',
        },
      },
    });

    return serializeTemplate(updated);
  },
};

export default pandaSignService;
