#!/usr/bin/env node
/**
 * Daily Signed Document Sync
 *
 * Syncs new signed documents from Salesforce Adobe Sign to Panda CRM.
 * Designed to run as a scheduled Lambda function or cron job.
 *
 * What it does:
 * 1. Finds agreements in Panda CRM without document URLs
 * 2. Checks if corresponding signed PDFs exist in Salesforce
 * 3. Downloads and uploads to S3
 * 4. Updates agreement records with URLs
 *
 * Usage:
 *   node sync-signed-documents.js [--days N]
 *
 * Options:
 *   --days N    Only process agreements created in last N days (default: 30)
 *
 * For Lambda deployment, export the handler function.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Client } from 'pg';
import jsforce from 'jsforce';
import dotenv from 'dotenv';

dotenv.config();

// Parse arguments
const args = process.argv.slice(2);
const daysArg = args.includes('--days') ? parseInt(args[args.indexOf('--days') + 1]) : 30;

// S3 Configuration
const S3_BUCKET = process.env.S3_BUCKET || 'pandasign-documents';
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
      'synced-from': 'salesforce-adobe-sign',
      'sync-date': new Date().toISOString(),
    },
  });

  await s3Client.send(command);
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
 * Main sync function - can be called from Lambda handler
 */
export async function syncDocuments(options = {}) {
  const days = options.days || daysArg;
  const startTime = new Date();

  console.log('='.repeat(60));
  console.log('Signed Document Sync');
  console.log(`Started: ${startTime.toISOString()}`);
  console.log(`Looking back: ${days} days`);
  console.log('='.repeat(60));

  const db = await getDbConnection();
  const sf = await getSalesforceConnection();

  const results = {
    processed: 0,
    downloaded: 0,
    uploaded: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // Calculate date range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Get agreements without documents created in the date range
    const agreementsResult = await db.query(`
      SELECT a.id, a.agreement_number, a.name, a.status, a.opportunity_id,
             o.salesforce_id as opp_sf_id, a.created_at
      FROM agreements a
      LEFT JOIN opportunities o ON a.opportunity_id = o.id
      WHERE a.signed_document_url IS NULL
      AND a.status = 'SIGNED'
      AND o.salesforce_id IS NOT NULL
      AND a.created_at >= $1
      ORDER BY a.created_at DESC
    `, [cutoffDate]);

    console.log(`\nFound ${agreementsResult.rows.length} agreements without documents (last ${days} days)\n`);

    if (agreementsResult.rows.length === 0) {
      console.log('No new agreements to process.');
      return results;
    }

    // Get Opportunity IDs for batch query
    const oppIds = agreementsResult.rows
      .map(a => a.opp_sf_id)
      .filter(Boolean);

    // Query Adobe Sign agreements in Salesforce
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
    for (const agreement of agreementsResult.rows) {
      results.processed++;

      const docInfo = docMap.get(agreement.opp_sf_id);
      if (!docInfo || docInfo.contentDocumentIds.length === 0) {
        results.skipped++;
        continue;
      }

      // Get the ContentVersion for the signed PDF
      const contentDocIds = docInfo.contentDocumentIds.map(id => `'${id}'`).join(',');

      let versionResult;
      try {
        // First try to find signed PDF
        versionResult = await sf.query(`
          SELECT Id, Title, ContentDocumentId, FileExtension, ContentSize
          FROM ContentVersion
          WHERE ContentDocumentId IN (${contentDocIds})
          AND IsLatest = true
          AND (Title LIKE '%signed%' OR Title LIKE '%Signed%')
          AND FileExtension = 'pdf'
          ORDER BY ContentSize DESC
          LIMIT 1
        `);

        // Fallback to any PDF if no signed version found
        if (versionResult.records.length === 0) {
          versionResult = await sf.query(`
            SELECT Id, Title, ContentDocumentId, FileExtension, ContentSize
            FROM ContentVersion
            WHERE ContentDocumentId IN (${contentDocIds})
            AND IsLatest = true
            AND FileExtension = 'pdf'
            ORDER BY ContentSize DESC
            LIMIT 1
          `);
        }
      } catch (e) {
        results.errors.push({ agreement: agreement.agreement_number, error: e.message });
        continue;
      }

      if (versionResult.records.length === 0) {
        results.skipped++;
        continue;
      }

      const contentVersion = versionResult.records[0];
      const fileSizeKB = (contentVersion.ContentSize / 1024).toFixed(1);

      console.log(`[${results.processed}] ${agreement.agreement_number}: Downloading "${contentVersion.Title}" (${fileSizeKB} KB)...`);

      try {
        // Download from Salesforce
        const pdfBuffer = await downloadFromSalesforce(sf, contentVersion.Id);
        results.downloaded++;

        // Upload to S3
        const fileName = `${contentVersion.Title}.pdf`;
        const s3Url = await uploadToS3(pdfBuffer, agreement.agreement_number, fileName);
        results.uploaded++;

        // Update database
        await db.query(`
          UPDATE agreements
          SET signed_document_url = $1, updated_at = NOW()
          WHERE id = $2
        `, [s3Url, agreement.id]);

        console.log(`  ✓ Uploaded and updated`);

      } catch (error) {
        results.errors.push({ agreement: agreement.agreement_number, error: error.message });
        console.error(`  ✗ Error: ${error.message}`);
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    // Summary
    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(1);

    console.log('\n' + '='.repeat(60));
    console.log('Sync Summary');
    console.log('='.repeat(60));
    console.log(`Duration: ${duration}s`);
    console.log(`Processed: ${results.processed}`);
    console.log(`Downloaded: ${results.downloaded}`);
    console.log(`Uploaded to S3: ${results.uploaded}`);
    console.log(`Skipped (no documents): ${results.skipped}`);
    console.log(`Errors: ${results.errors.length}`);

    if (results.errors.length > 0) {
      console.log('\nErrors:');
      results.errors.slice(0, 5).forEach(e => {
        console.log(`  - ${e.agreement}: ${e.error}`);
      });
    }

    return results;

  } finally {
    await db.end();
  }
}

/**
 * Lambda handler for scheduled execution
 */
export async function handler(event) {
  console.log('Lambda invoked with event:', JSON.stringify(event));

  try {
    const results = await syncDocuments({ days: 7 }); // Look back 7 days for daily sync

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Document sync completed',
        results,
      }),
    };
  } catch (error) {
    console.error('Sync failed:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
}

// Run if executed directly (not imported as module)
if (process.argv[1].includes('sync-signed-documents')) {
  syncDocuments()
    .then((results) => {
      console.log('\nSync complete!');
      process.exit(results.errors.length > 0 ? 1 : 0);
    })
    .catch((error) => {
      console.error('\nSync failed:', error);
      process.exit(1);
    });
}
