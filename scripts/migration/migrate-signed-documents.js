#!/usr/bin/env node
/**
 * Signed Document Migration Script
 *
 * Downloads signed documents from Salesforce ContentVersion (where Adobe Sign stores them)
 * and uploads to S3, then updates Panda CRM agreement records.
 *
 * This approach doesn't require Adobe Sign API access - it pulls directly from Salesforce.
 *
 * Usage:
 *   node migrate-signed-documents.js [--dry-run] [--limit N]
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Client } from 'pg';
import jsforce from 'jsforce';
import dotenv from 'dotenv';

dotenv.config();

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;

// S3 Configuration
const S3_BUCKET = 'pandasign-documents';
const S3_REGION = process.env.AWS_REGION || 'us-east-2';

const s3Client = new S3Client({ region: S3_REGION });

/**
 * Upload document to S3
 */
async function uploadToS3(pdfBuffer, agreementNumber, documentName) {
  const timestamp = Date.now();
  const safeName = documentName.replace(/[^a-zA-Z0-9-_.]/g, '_').substring(0, 100);
  const key = `signed-agreements/${agreementNumber}/${safeName}`;

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: pdfBuffer,
    ContentType: 'application/pdf',
    Metadata: {
      'agreement-number': agreementNumber,
      'migrated-from': 'salesforce-adobe-sign',
      'migration-date': new Date().toISOString(),
    },
  });

  await s3Client.send(command);

  // Return the S3 URL
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${encodeURIComponent(key)}`;
}

/**
 * Get database connection
 */
async function getDbConnection() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL ||
      'postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm',
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  return client;
}

/**
 * Get Salesforce connection
 */
async function getSalesforceConnection() {
  const conn = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
  });

  await conn.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + process.env.SF_SECURITY_TOKEN
  );

  return conn;
}

/**
 * Download file from Salesforce ContentVersion
 */
async function downloadFromSalesforce(conn, contentVersionId) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    conn.sobject('ContentVersion')
      .record(contentVersionId)
      .blob('VersionData')
      .on('data', (chunk) => chunks.push(chunk))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .on('error', reject);
  });
}

/**
 * Main migration function
 */
async function migrateDocuments() {
  console.log('='.repeat(60));
  console.log('Signed Document Migration (from Salesforce)');
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('*** DRY RUN MODE - No documents will be uploaded ***\n');
  }

  const db = await getDbConnection();
  const sf = await getSalesforceConnection();

  try {
    // Get agreements from Panda CRM that need documents
    const agreementsResult = await db.query(`
      SELECT a.id, a.agreement_number, a.name, a.status, a.opportunity_id, o.salesforce_id as opp_sf_id
      FROM agreements a
      LEFT JOIN opportunities o ON a.opportunity_id = o.id
      WHERE a.signed_document_url IS NULL
      AND a.status = 'SIGNED'
      AND o.salesforce_id IS NOT NULL
      ${limitArg ? `LIMIT ${limitArg}` : ''}
    `);

    console.log(`Found ${agreementsResult.rows.length} signed agreements without documents\n`);

    if (agreementsResult.rows.length === 0) {
      console.log('No agreements to process.');
      return;
    }

    // Get Adobe Sign agreements with their ContentDocumentLinks
    const oppIds = agreementsResult.rows
      .map(a => a.opp_sf_id)
      .filter(Boolean);

    // Query in batches to avoid SOQL limits
    const batchSize = 50;
    const allAdobeSignRecords = [];

    for (let i = 0; i < oppIds.length; i += batchSize) {
      const batchIds = oppIds.slice(i, i + batchSize).map(id => `'${id}'`).join(',');

      const query = `
        SELECT
          Id,
          Name,
          echosign_dev1__Status__c,
          echosign_dev1__Opportunity__c,
          (SELECT ContentDocumentId FROM ContentDocumentLinks)
        FROM echosign_dev1__SIGN_Agreement__c
        WHERE echosign_dev1__Opportunity__c IN (${batchIds})
        AND echosign_dev1__Status__c = 'Signed'
      `;

      const result = await sf.query(query);
      allAdobeSignRecords.push(...result.records);
    }

    console.log(`Found ${allAdobeSignRecords.length} Adobe Sign agreements in Salesforce\n`);

    // Create mapping: Opportunity SF ID -> ContentDocumentIds
    const docMap = new Map();
    for (const record of allAdobeSignRecords) {
      const oppId = record.echosign_dev1__Opportunity__c;
      const docLinks = record.ContentDocumentLinks?.records || [];

      if (docLinks.length > 0 && !docMap.has(oppId)) {
        docMap.set(oppId, {
          agreementName: record.Name,
          contentDocumentIds: docLinks.map(l => l.ContentDocumentId),
        });
      }
    }

    // Process each agreement
    let processed = 0;
    let downloaded = 0;
    let uploaded = 0;
    let errors = [];

    for (const agreement of agreementsResult.rows) {
      processed++;

      const docInfo = docMap.get(agreement.opp_sf_id);
      if (!docInfo || docInfo.contentDocumentIds.length === 0) {
        console.log(`[${processed}/${agreementsResult.rows.length}] ${agreement.agreement_number}: No documents found`);
        continue;
      }

      // Get the ContentVersion for the signed PDF (look for "-signed.pdf")
      const contentDocIds = docInfo.contentDocumentIds.map(id => `'${id}'`).join(',');
      const versionQuery = `
        SELECT Id, Title, ContentDocumentId, FileExtension, ContentSize
        FROM ContentVersion
        WHERE ContentDocumentId IN (${contentDocIds})
        AND IsLatest = true
        AND (Title LIKE '%signed%' OR Title LIKE '%Signed%')
        AND FileExtension = 'pdf'
        ORDER BY ContentSize DESC
        LIMIT 1
      `;

      let versionResult;
      try {
        versionResult = await sf.query(versionQuery);
      } catch (e) {
        console.log(`[${processed}/${agreementsResult.rows.length}] ${agreement.agreement_number}: Error querying documents: ${e.message}`);
        errors.push({ agreement: agreement.agreement_number, error: e.message });
        continue;
      }

      if (versionResult.records.length === 0) {
        // Try without the "signed" filter
        const fallbackQuery = `
          SELECT Id, Title, ContentDocumentId, FileExtension, ContentSize
          FROM ContentVersion
          WHERE ContentDocumentId IN (${contentDocIds})
          AND IsLatest = true
          AND FileExtension = 'pdf'
          ORDER BY ContentSize DESC
          LIMIT 1
        `;
        versionResult = await sf.query(fallbackQuery);
      }

      if (versionResult.records.length === 0) {
        console.log(`[${processed}/${agreementsResult.rows.length}] ${agreement.agreement_number}: No PDF found`);
        continue;
      }

      const contentVersion = versionResult.records[0];
      const fileSizeKB = (contentVersion.ContentSize / 1024).toFixed(1);

      console.log(`[${processed}/${agreementsResult.rows.length}] ${agreement.agreement_number}: Downloading "${contentVersion.Title}" (${fileSizeKB} KB)...`);

      if (dryRun) {
        downloaded++;
        continue;
      }

      try {
        // Download from Salesforce
        const pdfBuffer = await downloadFromSalesforce(sf, contentVersion.Id);
        downloaded++;
        console.log(`  Downloaded ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

        // Upload to S3
        const fileName = `${contentVersion.Title}.pdf`;
        const s3Url = await uploadToS3(pdfBuffer, agreement.agreement_number, fileName);
        uploaded++;
        console.log(`  Uploaded to S3`);

        // Update database
        await db.query(`
          UPDATE agreements
          SET signed_document_url = $1, updated_at = NOW()
          WHERE id = $2
        `, [s3Url, agreement.id]);

        console.log(`  Updated agreement record`);

      } catch (error) {
        errors.push({ agreement: agreement.agreement_number, error: error.message });
        console.error(`  Error: ${error.message}`);
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total agreements processed: ${processed}`);
    console.log(`Documents downloaded: ${downloaded}`);
    console.log(`Documents uploaded to S3: ${uploaded}`);
    console.log(`Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.slice(0, 10).forEach(e => {
        console.log(`  - ${e.agreement}: ${e.error}`);
      });
      if (errors.length > 10) {
        console.log(`  ... and ${errors.length - 10} more`);
      }
    }

    if (dryRun) {
      console.log('\n*** DRY RUN - No changes were made ***');
    }

  } finally {
    await db.end();
  }
}

// Run migration
migrateDocuments()
  .then(() => {
    console.log('\nDocument migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration failed:', error);
    process.exit(1);
  });
