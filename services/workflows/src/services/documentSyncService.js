// Document Sync Service - Syncs signed documents from Salesforce to S3
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import jsforce from 'jsforce';
import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

// S3 Configuration
const S3_BUCKET = process.env.S3_BUCKET || 'pandasign-documents';
const S3_REGION = process.env.AWS_REGION || 'us-east-2';

const s3Client = new S3Client({ region: S3_REGION });

/**
 * Document Sync Service
 * Syncs signed documents from Salesforce Adobe Sign to Panda CRM
 */
export const documentSyncService = {
  /**
   * Get Salesforce connection
   */
  async getSalesforceConnection() {
    const conn = new jsforce.Connection({
      loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
    });

    await conn.login(
      process.env.SF_USERNAME,
      process.env.SF_PASSWORD + process.env.SF_SECURITY_TOKEN
    );

    return conn;
  },

  /**
   * Download file from Salesforce ContentVersion
   */
  async downloadFromSalesforce(conn, contentVersionId) {
    return new Promise((resolve, reject) => {
      const chunks = [];

      conn.sobject('ContentVersion')
        .record(contentVersionId)
        .blob('VersionData')
        .on('data', (chunk) => chunks.push(chunk))
        .on('end', () => resolve(Buffer.concat(chunks)))
        .on('error', reject);
    });
  },

  /**
   * Upload document to S3
   */
  async uploadToS3(pdfBuffer, agreementNumber, documentName) {
    const safeName = documentName.replace(/[^a-zA-Z0-9-_.]/g, '_').substring(0, 100);
    const key = `signed-agreements/${agreementNumber}/${safeName}`;

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        'agreement-number': agreementNumber,
        'synced-from': 'salesforce-adobe-sign',
        'sync-date': new Date().toISOString(),
      },
    });

    await s3Client.send(command);
    return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${encodeURIComponent(key)}`;
  },

  /**
   * Sync documents for a specific agreement
   */
  async syncAgreementDocument(agreementId) {
    logger.info(`Syncing document for agreement: ${agreementId}`);

    try {
      // Get agreement with opportunity
      const agreement = await prisma.agreement.findUnique({
        where: { id: agreementId },
        include: {
          opportunity: {
            select: { id: true, salesforceId: true, name: true },
          },
        },
      });

      if (!agreement) {
        return { success: false, error: 'Agreement not found' };
      }

      if (agreement.signedDocumentUrl) {
        return { success: true, skipped: true, reason: 'Document already synced' };
      }

      if (!agreement.opportunity?.salesforceId) {
        return { success: false, error: 'No Salesforce ID for opportunity' };
      }

      const sf = await this.getSalesforceConnection();

      // Find Adobe Sign agreement
      const adobeSignResult = await sf.query(`
        SELECT Id, Name,
          (SELECT ContentDocumentId FROM ContentDocumentLinks)
        FROM echosign_dev1__SIGN_Agreement__c
        WHERE echosign_dev1__Opportunity__c = '${agreement.opportunity.salesforceId}'
        AND echosign_dev1__Status__c = 'Signed'
        LIMIT 1
      `);

      if (adobeSignResult.records.length === 0) {
        return { success: false, error: 'No signed Adobe Sign agreement found' };
      }

      const adobeSign = adobeSignResult.records[0];
      const docLinks = adobeSign.ContentDocumentLinks?.records || [];

      if (docLinks.length === 0) {
        return { success: false, error: 'No documents linked to Adobe Sign agreement' };
      }

      // Get ContentVersion for signed PDF
      const contentDocIds = docLinks.map(l => `'${l.ContentDocumentId}'`).join(',');
      const versionResult = await sf.query(`
        SELECT Id, Title, ContentSize
        FROM ContentVersion
        WHERE ContentDocumentId IN (${contentDocIds})
        AND IsLatest = true
        AND (Title LIKE '%signed%' OR Title LIKE '%Signed%')
        AND FileExtension = 'pdf'
        ORDER BY ContentSize DESC
        LIMIT 1
      `);

      if (versionResult.records.length === 0) {
        return { success: false, error: 'No signed PDF found' };
      }

      const contentVersion = versionResult.records[0];

      // Download and upload
      const pdfBuffer = await this.downloadFromSalesforce(sf, contentVersion.Id);
      const s3Url = await this.uploadToS3(pdfBuffer, agreement.agreementNumber, `${contentVersion.Title}.pdf`);

      // Update agreement
      await prisma.agreement.update({
        where: { id: agreementId },
        data: { signedDocumentUrl: s3Url },
      });

      logger.info(`Document synced for agreement ${agreement.agreementNumber}: ${s3Url}`);

      return {
        success: true,
        agreementNumber: agreement.agreementNumber,
        documentUrl: s3Url,
        fileSize: pdfBuffer.length,
      };

    } catch (error) {
      logger.error(`Error syncing document for agreement ${agreementId}:`, error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Sync all pending documents (for scheduled job)
   */
  async syncAllPendingDocuments(options = {}) {
    const { days = 30, limit = 100 } = options;

    logger.info(`Starting document sync - looking back ${days} days, limit ${limit}`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    try {
      // Get agreements without documents
      const agreements = await prisma.agreement.findMany({
        where: {
          signedDocumentUrl: null,
          status: 'SIGNED',
          createdAt: { gte: cutoffDate },
          opportunity: {
            salesforceId: { not: null },
          },
        },
        include: {
          opportunity: {
            select: { id: true, salesforceId: true },
          },
        },
        take: limit,
        orderBy: { createdAt: 'desc' },
      });

      logger.info(`Found ${agreements.length} agreements to sync`);

      if (agreements.length === 0) {
        return { processed: 0, synced: 0, errors: [] };
      }

      const sf = await this.getSalesforceConnection();
      const results = { processed: 0, synced: 0, skipped: 0, errors: [] };

      // Get all Opportunity SF IDs
      const oppIds = agreements.map(a => a.opportunity.salesforceId).filter(Boolean);
      const oppIdList = oppIds.map(id => `'${id}'`).join(',');

      // Batch query Adobe Sign agreements
      const adobeSignResult = await sf.query(`
        SELECT Id, Name, echosign_dev1__Opportunity__c,
          (SELECT ContentDocumentId FROM ContentDocumentLinks)
        FROM echosign_dev1__SIGN_Agreement__c
        WHERE echosign_dev1__Opportunity__c IN (${oppIdList})
        AND echosign_dev1__Status__c = 'Signed'
      `);

      // Map: Opportunity SF ID -> ContentDocumentIds
      const docMap = new Map();
      for (const record of adobeSignResult.records) {
        const oppId = record.echosign_dev1__Opportunity__c;
        const docLinks = record.ContentDocumentLinks?.records || [];
        if (docLinks.length > 0 && !docMap.has(oppId)) {
          docMap.set(oppId, docLinks.map(l => l.ContentDocumentId));
        }
      }

      // Process each agreement
      for (const agreement of agreements) {
        results.processed++;

        const contentDocIds = docMap.get(agreement.opportunity.salesforceId);
        if (!contentDocIds || contentDocIds.length === 0) {
          results.skipped++;
          continue;
        }

        try {
          const contentDocIdList = contentDocIds.map(id => `'${id}'`).join(',');
          const versionResult = await sf.query(`
            SELECT Id, Title, ContentSize
            FROM ContentVersion
            WHERE ContentDocumentId IN (${contentDocIdList})
            AND IsLatest = true
            AND (Title LIKE '%signed%' OR Title LIKE '%Signed%')
            AND FileExtension = 'pdf'
            ORDER BY ContentSize DESC
            LIMIT 1
          `);

          if (versionResult.records.length === 0) {
            results.skipped++;
            continue;
          }

          const contentVersion = versionResult.records[0];
          const pdfBuffer = await this.downloadFromSalesforce(sf, contentVersion.Id);
          const s3Url = await this.uploadToS3(pdfBuffer, agreement.agreementNumber, `${contentVersion.Title}.pdf`);

          await prisma.agreement.update({
            where: { id: agreement.id },
            data: { signedDocumentUrl: s3Url },
          });

          results.synced++;
          logger.info(`Synced ${agreement.agreementNumber}`);

        } catch (error) {
          results.errors.push({ agreementId: agreement.id, error: error.message });
          logger.error(`Error syncing ${agreement.agreementNumber}: ${error.message}`);
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      logger.info(`Sync complete: ${results.synced} synced, ${results.skipped} skipped, ${results.errors.length} errors`);
      return results;

    } catch (error) {
      logger.error('Document sync failed:', error);
      throw error;
    }
  },
};

export default documentSyncService;
