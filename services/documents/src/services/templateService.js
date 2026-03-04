// Template Processing Service - DOCX and PDF template support
import { prisma } from '../lib/prisma.js';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import mammoth from 'mammoth';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middleware/logger.js';
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });

const S3_BUCKET = process.env.DOCUMENTS_BUCKET || 'panda-crm-documents';

/**
 * Available merge fields from database entities
 */
export const AVAILABLE_MERGE_FIELDS = {
  opportunity: [
    { field: 'name', label: 'Project Name', type: 'text' },
    { field: 'jobId', label: 'Job ID', type: 'text' },
    { field: 'amount', label: 'Contract Amount', type: 'currency' },
    { field: 'contractTotal', label: 'Contract Total', type: 'currency' },
    { field: 'street', label: 'Street Address', type: 'text' },
    { field: 'city', label: 'City', type: 'text' },
    { field: 'state', label: 'State', type: 'text' },
    { field: 'postalCode', label: 'Postal Code', type: 'text' },
    { field: 'fullAddress', label: 'Full Address', type: 'computed' },
    { field: 'workType', label: 'Work Type', type: 'text' },
    { field: 'description', label: 'Description', type: 'text' },
    { field: 'scheduledDate', label: 'Scheduled Date', type: 'date' },
    // Insurance fields
    { field: 'claimNumber', label: 'Claim Number', type: 'text' },
    { field: 'insuranceCarrier', label: 'Insurance Carrier', type: 'text' },
    { field: 'rcvAmount', label: 'RCV Amount', type: 'currency' },
    { field: 'acvAmount', label: 'ACV Amount', type: 'currency' },
    { field: 'deductible', label: 'Deductible', type: 'currency' },
    { field: 'recoverableDepreciation', label: 'Recoverable Depreciation', type: 'currency' },
    { field: 'adjusterName', label: 'Adjuster Name', type: 'text' },
    { field: 'adjusterEmail', label: 'Adjuster Email', type: 'email' },
    { field: 'adjusterPhone', label: 'Adjuster Phone', type: 'phone' },
    { field: 'dateOfLoss', label: 'Date of Loss', type: 'date' },
  ],
  specs: [
    // Roofing Specs
    { field: 'roofingSystem', label: 'Roofing System', type: 'text' },
    { field: 'shingleManufacturer', label: 'Shingle Manufacturer', type: 'text' },
    { field: 'shingleStyle', label: 'Shingle Style', type: 'text' },
    { field: 'shingleColor', label: 'Shingle Color', type: 'text' },
    { field: 'predominantPitch', label: 'Predominant Pitch', type: 'text' },
    { field: 'stories', label: 'Stories', type: 'number' },
    { field: 'totalSquares', label: 'Total Squares', type: 'number' },
    { field: 'ridgeCapColor', label: 'Ridge Cap Color', type: 'text' },
    { field: 'dripEdgeColor', label: 'Drip Edge Color', type: 'text' },
    { field: 'underlaymentType', label: 'Underlayment Type', type: 'text' },
    { field: 'ventilationType', label: 'Ventilation Type', type: 'text' },
    // Siding Specs
    { field: 'sidingManufacturer', label: 'Siding Manufacturer', type: 'text' },
    { field: 'sidingStyle', label: 'Siding Style', type: 'text' },
    { field: 'sidingColor', label: 'Siding Color', type: 'text' },
    { field: 'sidingSquares', label: 'Siding Squares', type: 'number' },
    // Gutter Specs
    { field: 'gutterSize', label: 'Gutter Size', type: 'text' },
    { field: 'gutterColor', label: 'Gutter Color', type: 'text' },
    { field: 'downspoutSize', label: 'Downspout Size', type: 'text' },
    { field: 'gutterLinearFeet', label: 'Gutter Linear Feet', type: 'number' },
  ],
  measurements: [
    // Linear Measurements
    { field: 'ridgeLength', label: 'Ridge Length (LF)', type: 'number' },
    { field: 'hipLength', label: 'Hip Length (LF)', type: 'number' },
    { field: 'valleyLength', label: 'Valley Length (LF)', type: 'number' },
    { field: 'eaveLength', label: 'Eave Length (LF)', type: 'number' },
    { field: 'rakeLength', label: 'Rake Length (LF)', type: 'number' },
    { field: 'stepFlashingLength', label: 'Step Flashing (LF)', type: 'number' },
    { field: 'wallFlashingLength', label: 'Wall Flashing (LF)', type: 'number' },
    { field: 'dripEdgeLength', label: 'Drip Edge (LF)', type: 'number' },
    // Area Measurements
    { field: 'totalRoofArea', label: 'Total Roof Area (SF)', type: 'number' },
    { field: 'totalRoofSquares', label: 'Total Roof Squares', type: 'number' },
    { field: 'lowSlopeArea', label: 'Low Slope Area (SF)', type: 'number' },
    { field: 'steepSlopeArea', label: 'Steep Slope Area (SF)', type: 'number' },
  ],
  accessories: [
    { field: 'pipeCollars', label: 'Pipe Collars', type: 'number' },
    { field: 'ridgeVent', label: 'Ridge Vent (LF)', type: 'number' },
    { field: 'powerAtticFan', label: 'Power Attic Fan', type: 'number' },
    { field: 'turbineVents', label: 'Turbine Vents', type: 'number' },
    { field: 'staticVents', label: 'Static Vents', type: 'number' },
    { field: 'skylights', label: 'Skylights', type: 'number' },
    { field: 'skylightFlashing', label: 'Skylight Flashing', type: 'number' },
    { field: 'chimneyFlashing', label: 'Chimney Flashing', type: 'number' },
    { field: 'satelliteDishes', label: 'Satellite Dishes', type: 'number' },
    { field: 'solarPanels', label: 'Solar Panels', type: 'number' },
  ],
  workOrder: [
    { field: 'workOrderNumber', label: 'Work Order Number', type: 'text' },
    { field: 'subject', label: 'Subject', type: 'text' },
    { field: 'description', label: 'Description', type: 'text' },
    { field: 'crewInstructions', label: 'Crew Instructions', type: 'text' },
    { field: 'startDate', label: 'Start Date', type: 'date' },
    { field: 'endDate', label: 'End Date', type: 'date' },
    { field: 'status', label: 'Status', type: 'text' },
    { field: 'priority', label: 'Priority', type: 'text' },
    // Pricing from line items
    { field: 'totalPrice', label: 'Total Price', type: 'currency' },
    { field: 'laborTotal', label: 'Labor Total', type: 'currency' },
    { field: 'materialTotal', label: 'Material Total', type: 'currency' },
    { field: 'lineItems', label: 'Line Items', type: 'table' },
  ],
  contact: [
    { field: 'firstName', label: 'First Name', type: 'text' },
    { field: 'lastName', label: 'Last Name', type: 'text' },
    { field: 'fullName', label: 'Full Name', type: 'computed' },
    { field: 'email', label: 'Email', type: 'email' },
    { field: 'phone', label: 'Phone', type: 'phone' },
    { field: 'mobilePhone', label: 'Mobile Phone', type: 'phone' },
    { field: 'mailingStreet', label: 'Mailing Street', type: 'text' },
    { field: 'mailingCity', label: 'Mailing City', type: 'text' },
    { field: 'mailingState', label: 'Mailing State', type: 'text' },
    { field: 'mailingPostalCode', label: 'Mailing Postal Code', type: 'text' },
  ],
  account: [
    { field: 'name', label: 'Account Name', type: 'text' },
    { field: 'phone', label: 'Account Phone', type: 'phone' },
    { field: 'billingStreet', label: 'Billing Street', type: 'text' },
    { field: 'billingCity', label: 'Billing City', type: 'text' },
    { field: 'billingState', label: 'Billing State', type: 'text' },
    { field: 'billingPostalCode', label: 'Billing Postal Code', type: 'text' },
  ],
  user: [
    { field: 'name', label: 'Sales Rep Name', type: 'text' },
    { field: 'email', label: 'Sales Rep Email', type: 'email' },
    { field: 'phone', label: 'Sales Rep Phone', type: 'phone' },
    { field: 'title', label: 'Sales Rep Title', type: 'text' },
  ],
  system: [
    { field: 'currentDate', label: 'Current Date', type: 'date' },
    { field: 'currentDateTime', label: 'Current Date & Time', type: 'datetime' },
    { field: 'companyName', label: 'Company Name', type: 'text', default: 'Panda Exteriors' },
    { field: 'companyPhone', label: 'Company Phone', type: 'phone', default: '(888) 997-2632' },
    { field: 'companyEmail', label: 'Company Email', type: 'email', default: 'info@pandaexteriors.com' },
    { field: 'companyWebsite', label: 'Company Website', type: 'text', default: 'www.pandaexteriors.com' },
    { field: 'rescissionClause', label: 'Rescission Clause', type: 'text' },
  ],
  rescission: [
    { field: 'clause', label: 'Rescission Clause', type: 'text' },
  ],
};

/**
 * Field placement types for visual editor
 */
export const FIELD_TYPES = {
  SIGNATURE: 'signature',
  INITIALS: 'initials',
  DATE: 'date',
  TEXT: 'text',
  CHECKBOX: 'checkbox',
  NUMBER: 'number',
  DROPDOWN: 'dropdown',
  RADIO: 'radio',
};

/**
 * Signer roles
 */
export const SIGNER_ROLES = {
  CUSTOMER: 'CUSTOMER',
  AGENT: 'AGENT',
  WITNESS: 'WITNESS',
  CO_SIGNER: 'CO_SIGNER',
};

/**
 * Template Service - Handles DOCX and PDF template processing
 */
export const templateService = {
  /**
   * Get all available merge fields
   */
  getAvailableMergeFields() {
    return AVAILABLE_MERGE_FIELDS;
  },

  /**
   * Upload and process a DOCX template
   * @param {Buffer} fileBuffer - The DOCX file buffer
   * @param {Object} metadata - Template metadata (name, description, category)
   * @param {string} userId - User ID uploading the template
   */
  async uploadDocxTemplate(fileBuffer, metadata, userId) {
    logger.info(`Uploading DOCX template: ${metadata.name}`);

    try {
      // Extract merge fields from DOCX
      const { mergeFields, htmlContent } = await this.parseDocx(fileBuffer);

      // Generate unique filename
      const templateId = uuidv4();
      const s3Key = `templates/${templateId}/source.docx`;

      // Upload original DOCX to S3
      await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        Metadata: {
          'template-id': templateId,
          'uploaded-by': userId,
          'upload-date': new Date().toISOString(),
        },
      }));

      const sourceDocumentUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/${s3Key}`;

      // Create template record
      const template = await prisma.agreementTemplate.create({
        data: {
          id: templateId,
          name: metadata.name,
          description: metadata.description,
          category: metadata.category || 'CONTRACT',
          sourceDocumentUrl,
          sourceDocumentType: 'DOCX',
          mergeFields,
          content: htmlContent,
          isActive: true,
          signingOrder: metadata.signingOrder || 'SEQUENTIAL',
          signerRoles: metadata.signerRoles || [
            { role: 'CUSTOMER', order: 1 },
            { role: 'AGENT', order: 2 },
          ],
        },
      });

      logger.info(`DOCX template created: ${template.id}`);

      return {
        id: template.id,
        name: template.name,
        mergeFields,
        sourceDocumentUrl,
        sourceDocumentType: 'DOCX',
      };
    } catch (error) {
      logger.error('Error uploading DOCX template:', error);
      throw error;
    }
  },

  /**
   * Upload and process a PDF template
   * @param {Buffer} fileBuffer - The PDF file buffer
   * @param {Object} metadata - Template metadata (name, description, category)
   * @param {string} userId - User ID uploading the template
   */
  async uploadPdfTemplate(fileBuffer, metadata, userId) {
    logger.info(`Uploading PDF template: ${metadata.name}`);

    try {
      // Get page info from PDF
      const pdfDoc = await PDFDocument.load(fileBuffer);
      const pageCount = pdfDoc.getPageCount();
      const pages = [];

      for (let i = 0; i < pageCount; i++) {
        const page = pdfDoc.getPage(i);
        const { width, height } = page.getSize();
        pages.push({ page: i + 1, width, height });
      }

      // Generate unique filename
      const templateId = uuidv4();
      const s3Key = `templates/${templateId}/source.pdf`;

      // Upload original PDF to S3
      await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: 'application/pdf',
        Metadata: {
          'template-id': templateId,
          'uploaded-by': userId,
          'upload-date': new Date().toISOString(),
          'page-count': String(pageCount),
        },
      }));

      const sourceDocumentUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/${s3Key}`;

      // Create template record
      const template = await prisma.agreementTemplate.create({
        data: {
          id: templateId,
          name: metadata.name,
          description: metadata.description,
          category: metadata.category || 'CONTRACT',
          sourceDocumentUrl,
          documentUrl: sourceDocumentUrl, // For PDFs, source = document
          sourceDocumentType: 'PDF',
          mergeFields: [], // PDFs don't auto-extract merge fields
          isActive: true,
          signingOrder: metadata.signingOrder || 'SEQUENTIAL',
          signerRoles: metadata.signerRoles || [
            { role: 'CUSTOMER', order: 1 },
            { role: 'AGENT', order: 2 },
          ],
          signatureFields: { pages, fieldPlacements: [] },
        },
      });

      logger.info(`PDF template created: ${template.id}`);

      return {
        id: template.id,
        name: template.name,
        pages,
        sourceDocumentUrl,
        sourceDocumentType: 'PDF',
      };
    } catch (error) {
      logger.error('Error uploading PDF template:', error);
      throw error;
    }
  },

  /**
   * Replace the document for an existing template
   * @param {string} templateId - Template ID
   * @param {Buffer} fileBuffer - The new file buffer
   * @param {string} fileType - 'docx' or 'pdf'
   * @param {string} userId - User ID making the change
   */
  async replaceTemplateDocument(templateId, fileBuffer, fileType, userId) {
    logger.info(`Replacing document for template: ${templateId} with ${fileType.toUpperCase()}`);

    try {
      // Get existing template
      const existingTemplate = await prisma.agreementTemplate.findUnique({
        where: { id: templateId },
      });

      if (!existingTemplate) {
        throw new Error('Template not found');
      }

      const extension = fileType.toLowerCase() === 'docx' ? 'docx' : 'pdf';
      const contentType = fileType.toLowerCase() === 'docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : 'application/pdf';
      const sourceDocumentType = fileType.toUpperCase();

      // Generate new S3 key (use same template ID, just replace the file)
      const s3Key = `templates/${templateId}/source.${extension}`;

      // Upload new document to S3
      await s3Client.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: contentType,
        Metadata: {
          'template-id': templateId,
          'replaced-by': userId,
          'replace-date': new Date().toISOString(),
        },
      }));

      const sourceDocumentUrl = `https://${S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/${s3Key}`;

      // Prepare update data
      const updateData = {
        sourceDocumentUrl,
        sourceDocumentType,
        updatedAt: new Date(),
      };

      // For PDF, also update documentUrl and get page info
      if (sourceDocumentType === 'PDF') {
        const pdfDoc = await PDFDocument.load(fileBuffer);
        const pageCount = pdfDoc.getPageCount();
        const pages = [];

        for (let i = 0; i < pageCount; i++) {
          const page = pdfDoc.getPage(i);
          const { width, height } = page.getSize();
          pages.push({ page: i + 1, width, height });
        }

        updateData.documentUrl = sourceDocumentUrl;
        updateData.signatureFields = {
          pages,
          fieldPlacements: existingTemplate.fieldPlacements || [],
        };
        // Clear merge fields for PDF templates
        updateData.mergeFields = [];
        updateData.content = null;
      }

      // For DOCX, extract merge fields and HTML content
      if (sourceDocumentType === 'DOCX') {
        const { mergeFields, htmlContent } = await this.parseDocx(fileBuffer);
        updateData.mergeFields = mergeFields;
        updateData.content = htmlContent;
      }

      // Update template record
      const template = await prisma.agreementTemplate.update({
        where: { id: templateId },
        data: updateData,
      });

      logger.info(`Template document replaced: ${templateId}`);

      return {
        id: template.id,
        name: template.name,
        sourceDocumentUrl,
        sourceDocumentType,
        mergeFields: template.mergeFields,
        pages: sourceDocumentType === 'PDF' ? updateData.signatureFields?.pages : undefined,
      };
    } catch (error) {
      logger.error('Error replacing template document:', error);
      throw error;
    }
  },

  /**
   * Parse DOCX file to extract merge fields and HTML content
   * @param {Buffer} fileBuffer - The DOCX file buffer
   */
  async parseDocx(fileBuffer) {
    logger.info('Parsing DOCX file');

    try {
      // Convert DOCX to HTML using mammoth
      const { value: htmlContent, messages } = await mammoth.convertToHtml({ buffer: fileBuffer });

      if (messages.length > 0) {
        logger.warn('DOCX conversion warnings:', messages);
      }

      // Extract merge fields using regex ({{fieldName}} pattern)
      const mergeFieldRegex = /\{\{([^}]+)\}\}/g;
      const mergeFields = [];
      let match;

      while ((match = mergeFieldRegex.exec(htmlContent)) !== null) {
        const fieldPath = match[1].trim();
        if (!mergeFields.includes(fieldPath)) {
          mergeFields.push(fieldPath);
        }
      }

      // Also check original DOCX content using docxtemplater
      const zip = new PizZip(fileBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      // Get all tags from the template
      const tags = doc.getFullText().match(mergeFieldRegex) || [];
      tags.forEach(tag => {
        const fieldPath = tag.replace(/\{\{|\}\}/g, '').trim();
        if (!mergeFields.includes(fieldPath)) {
          mergeFields.push(fieldPath);
        }
      });

      logger.info(`Found ${mergeFields.length} merge fields:`, mergeFields);

      return { mergeFields, htmlContent };
    } catch (error) {
      logger.error('Error parsing DOCX:', error);
      throw error;
    }
  },

  /**
   * Fill DOCX template with merge data and convert to PDF
   * @param {string} templateId - Template ID
   * @param {Object} mergeData - Data to merge into template
   */
  async fillDocxTemplate(templateId, mergeData) {
    logger.info(`Filling DOCX template: ${templateId}`);

    try {
      // Get template
      const template = await prisma.agreementTemplate.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        throw new Error('Template not found');
      }

      if (template.sourceDocumentType !== 'DOCX') {
        throw new Error('Template is not a DOCX file');
      }

      // Download source DOCX from S3
      const { bucket, key: s3Key } = parseS3Url(template.sourceDocumentUrl);
      if (!bucket || !s3Key) {
        throw new Error(`Invalid S3 URL format: ${template.sourceDocumentUrl}`);
      }

      const getCommand = new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      });

      const response = await s3Client.send(getCommand);
      const chunks = [];
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);

      // Fill template using docxtemplater
      const zip = new PizZip(fileBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        nullGetter: () => '', // Return empty string for missing values
      });

      // Prepare merge data with computed fields
      const preparedData = this.prepareMergeData(mergeData);

      doc.render(preparedData);

      // Get filled DOCX buffer
      const filledDocxBuffer = doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });

      return filledDocxBuffer;
    } catch (error) {
      logger.error('Error filling DOCX template:', error);
      throw error;
    }
  },

  /**
   * Prepare merge data with computed fields
   * @param {Object} rawData - Raw merge data
   */
  prepareMergeData(rawData) {
    const data = { ...rawData };

    // Add system fields
    data.system = {
      currentDate: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      currentDateTime: new Date().toLocaleString('en-US'),
      companyName: 'Panda Exteriors',
      companyPhone: '(888) 997-2632',
      companyEmail: 'info@pandaexteriors.com',
      companyWebsite: 'www.pandaexteriors.com',
    };

    // Compute full address if opportunity data exists
    if (data.opportunity) {
      const opp = data.opportunity;
      if (opp.street || opp.city || opp.state || opp.postalCode) {
        opp.fullAddress = [opp.street, opp.city, opp.state, opp.postalCode]
          .filter(Boolean)
          .join(', ');
      }

      // Format currency fields
      if (opp.amount) {
        opp.amountFormatted = this.formatCurrency(opp.amount);
      }
      if (opp.contractTotal) {
        opp.contractTotalFormatted = this.formatCurrency(opp.contractTotal);
  }
}

function parseS3Url(s3Url) {
  try {
    const url = new URL(s3Url);
    const host = url.hostname;
    const pathname = url.pathname.replace(/^\/+/, '');

    const virtualHostMatch = host.match(/^([^.]+)\.s3(?:[.-][^.]+)?\.amazonaws\.com$/);
    if (virtualHostMatch) {
      return { bucket: virtualHostMatch[1], key: pathname };
    }

    const pathStyleMatch = host.match(/^s3(?:[.-][^.]+)?\.amazonaws\.com$/);
    if (pathStyleMatch) {
      const [bucket, ...rest] = pathname.split('/');
      return { bucket, key: rest.join('/') };
    }
  } catch (error) {
    return { bucket: null, key: null };
  }

  return { bucket: null, key: null };
}

    // Compute full name if contact data exists
    if (data.contact) {
      const contact = data.contact;
      if (contact.firstName || contact.lastName) {
        contact.fullName = [contact.firstName, contact.lastName]
          .filter(Boolean)
          .join(' ');
      }
    }

    return data;
  },

  /**
   * Format a number as currency
   */
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  },

  /**
   * Update field placements for a template
   * @param {string} templateId - Template ID
   * @param {Array} fieldPlacements - Array of field placement objects
   */
  async updateFieldPlacements(templateId, fieldPlacements) {
    logger.info(`Updating field placements for template: ${templateId}`);

    try {
      // Validate field placements
      for (const field of fieldPlacements) {
        if (!field.id || !field.type) {
          throw new Error('Invalid field placement: missing required fields (id, type)');
        }

        // Page is optional - default to 1 if not provided
        if (field.page !== undefined && field.page !== null && typeof field.page !== 'number') {
          throw new Error('Invalid field placement: page must be a number');
        }

        if (!Object.values(FIELD_TYPES).includes(field.type)) {
          // Allow unknown field types for extensibility - just log a warning
          logger.warn(`Unknown field type: ${field.type} - allowing for extensibility`);
        }

        if (field.signerRole && !Object.values(SIGNER_ROLES).includes(field.signerRole)) {
          // Allow unknown signer roles - just log a warning
          logger.warn(`Unknown signer role: ${field.signerRole} - allowing for extensibility`);
        }
      }

      const template = await prisma.agreementTemplate.update({
        where: { id: templateId },
        data: {
          fieldPlacements,
          updatedAt: new Date(),
        },
      });

      logger.info(`Field placements updated for template: ${templateId}`);

      return template;
    } catch (error) {
      logger.error('Error updating field placements:', error);
      throw error;
    }
  },

  /**
   * Update signer configuration for a template
   * @param {string} templateId - Template ID
   * @param {string} signingOrder - SEQUENTIAL, PARALLEL, or AGENT_FIRST
   * @param {Array} signerRoles - Array of signer role configurations
   */
  async updateSignerConfig(templateId, signingOrder, signerRoles) {
    logger.info(`Updating signer config for template: ${templateId}`);

    try {
      // Validate signing order
      const validOrders = ['SEQUENTIAL', 'PARALLEL', 'AGENT_FIRST'];
      if (!validOrders.includes(signingOrder)) {
        throw new Error(`Invalid signing order: ${signingOrder}`);
      }

      // Validate signer roles
      for (const signer of signerRoles) {
        if (!signer.role || typeof signer.order !== 'number') {
          throw new Error('Invalid signer role configuration');
        }
      }

      const template = await prisma.agreementTemplate.update({
        where: { id: templateId },
        data: {
          signingOrder,
          signerRoles,
          updatedAt: new Date(),
        },
      });

      logger.info(`Signer config updated for template: ${templateId}`);

      return template;
    } catch (error) {
      logger.error('Error updating signer config:', error);
      throw error;
    }
  },

  /**
   * Generate preview of a template with sample or actual data
   * @param {string} templateId - Template ID
   * @param {string} opportunityId - Optional opportunity ID for actual data
   */
  async generatePreview(templateId, opportunityId = null) {
    logger.info(`Generating preview for template: ${templateId}`);

    try {
      const template = await prisma.agreementTemplate.findUnique({
        where: { id: templateId },
      });

      if (!template) {
        throw new Error('Template not found');
      }

      let mergeData = {};

      if (opportunityId) {
        // Get actual data from opportunity
        mergeData = await this.getMergeDataFromOpportunity(opportunityId);
      } else {
        // Use sample data for preview
        mergeData = this.getSampleMergeData();
      }

      // For DOCX templates, fill and convert
      if (template.sourceDocumentType === 'DOCX') {
        const filledDocx = await this.fillDocxTemplate(templateId, mergeData);

        // For preview, we'll generate HTML content
        const { value: htmlContent } = await mammoth.convertToHtml({ buffer: filledDocx });

        return {
          templateId,
          previewType: 'html',
          content: htmlContent,
          mergeData,
          fieldPlacements: template.fieldPlacements || [],
        };
      }

      // For PDF templates, return the source PDF URL with field overlay info
      if (template.sourceDocumentType === 'PDF') {
        return {
          templateId,
          previewType: 'pdf',
          documentUrl: template.sourceDocumentUrl,
          mergeData,
          fieldPlacements: template.fieldPlacements || [],
        };
      }

      // For legacy templates without sourceDocumentType, return content-based preview
      if (template.content) {
        // Interpolate merge fields in the content
        let previewContent = template.content;
        for (const [key, value] of Object.entries(mergeData)) {
          const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'gi');
          previewContent = previewContent.replace(regex, value || '');
        }

        return {
          templateId,
          previewType: 'html',
          content: previewContent,
          mergeData,
          fieldPlacements: template.fieldPlacements || [],
        };
      }

      // For templates with documentUrl (legacy PDF), return that
      if (template.documentUrl) {
        return {
          templateId,
          previewType: 'pdf',
          documentUrl: template.documentUrl,
          mergeData,
          fieldPlacements: template.fieldPlacements || [],
        };
      }

      // No content available - return basic info
      return {
        templateId,
        previewType: 'none',
        content: `<div><h3>${template.name}</h3><p>${template.description || 'No preview available'}</p></div>`,
        mergeData,
        fieldPlacements: [],
      };
    } catch (error) {
      logger.error('Error generating preview:', error);
      throw error;
    }
  },

  /**
   * Get merge data from an opportunity
   * @param {string} opportunityId - Opportunity ID
   */
  async getMergeDataFromOpportunity(opportunityId) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        account: true,
        contact: true,
        owner: true,
      },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    // Fall back to account address if opportunity address is empty
    const street = opportunity.street || opportunity.account?.billingStreet || '';
    const city = opportunity.city || opportunity.account?.billingCity || '';
    const state = opportunity.state || opportunity.account?.billingState || '';
    const postalCode = opportunity.postalCode || opportunity.account?.billingPostalCode || '';
    const fullAddress = [street, city, state, postalCode].filter(Boolean).join(', ');

    return {
      opportunity: {
        name: opportunity.name,
        jobId: opportunity.jobId,
        amount: opportunity.amount,
        contractTotal: opportunity.contractTotal,
        street,
        city,
        state,
        postalCode,
        fullAddress,
        workType: opportunity.workType,
        description: opportunity.description,
        scheduledDate: opportunity.scheduledDate,
      },
      contact: opportunity.contact ? {
        firstName: opportunity.contact.firstName,
        lastName: opportunity.contact.lastName,
        email: opportunity.contact.email,
        phone: opportunity.contact.phone,
        mobilePhone: opportunity.contact.mobilePhone,
        mailingStreet: opportunity.contact.mailingStreet,
        mailingCity: opportunity.contact.mailingCity,
        mailingState: opportunity.contact.mailingState,
        mailingPostalCode: opportunity.contact.mailingPostalCode,
      } : {},
      account: opportunity.account ? {
        name: opportunity.account.name,
        phone: opportunity.account.phone,
        billingStreet: opportunity.account.billingStreet,
        billingCity: opportunity.account.billingCity,
        billingState: opportunity.account.billingState,
        billingPostalCode: opportunity.account.billingPostalCode,
      } : {},
      user: opportunity.owner ? {
        name: `${opportunity.owner.firstName || ''} ${opportunity.owner.lastName || ''}`.trim(),
        email: opportunity.owner.email,
        phone: opportunity.owner.phone,
        title: opportunity.owner.title,
      } : {},
    };
  },

  /**
   * Get sample merge data for preview
   */
  getSampleMergeData() {
    return {
      opportunity: {
        name: 'Sample Roofing Project',
        jobId: 'JOB-12345',
        amount: 15000,
        contractTotal: 15000,
        street: '123 Main Street',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        workType: 'Insurance',
        description: 'Complete roof replacement with GAF Timberline HDZ shingles',
        scheduledDate: new Date().toISOString(),
      },
      contact: {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        phone: '(512) 555-1234',
        mobilePhone: '(512) 555-5678',
        mailingStreet: '123 Main Street',
        mailingCity: 'Austin',
        mailingState: 'TX',
        mailingPostalCode: '78701',
      },
      account: {
        name: 'Doe Residence',
        phone: '(512) 555-1234',
        billingStreet: '123 Main Street',
        billingCity: 'Austin',
        billingState: 'TX',
        billingPostalCode: '78701',
      },
      user: {
        name: 'Jane Smith',
        email: 'jane.smith@pandaexteriors.com',
        phone: '(888) 997-2632',
        title: 'Sales Representative',
      },
    };
  },

  /**
   * Get template by ID
   * @param {string} templateId - Template ID
   */
  async getTemplate(templateId) {
    return prisma.agreementTemplate.findUnique({
      where: { id: templateId },
    });
  },

  /**
   * List all templates with optional filtering
   */
  async listTemplates(filters = {}) {
    const where = {};

    if (filters.category) {
      where.category = filters.category;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.sourceDocumentType) {
      where.sourceDocumentType = filters.sourceDocumentType;
    }

    return prisma.agreementTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Delete a template
   * @param {string} templateId - Template ID
   */
  async deleteTemplate(templateId) {
    logger.info(`Deleting template: ${templateId}`);

    // Check if template has any agreements
    const agreementCount = await prisma.agreement.count({
      where: { templateId },
    });

    if (agreementCount > 0) {
      // Don't delete, just deactivate
      return prisma.agreementTemplate.update({
        where: { id: templateId },
        data: { isActive: false },
      });
    }

    // Delete template
    return prisma.agreementTemplate.delete({
      where: { id: templateId },
    });
  },
};

export default templateService;
