#!/usr/bin/env node
/**
 * Adobe Sign Document Migration Script
 *
 * Pulls signed documents from Adobe Sign API and stores them in S3,
 * then updates the Panda CRM agreement records with the document URLs.
 *
 * Prerequisites:
 * - Adobe Sign Integration Key (API Key)
 * - AWS credentials configured
 * - Agreements already migrated to Panda CRM
 *
 * Usage:
 *   node migrate-adobe-sign-documents.js [--dry-run] [--limit N]
 *
 * Environment:
 *   ADOBE_SIGN_API_KEY - Integration key from Adobe Sign
 *   AWS_REGION - AWS region (default: us-east-2)
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Client } from 'pg';
import jsforce from 'jsforce';
import https from 'https';
import dotenv from 'dotenv';

dotenv.config();

// Disable SSL certificate validation for self-signed certificates
// This is needed for connections to RDS and Salesforce through some network configurations
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Parse arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;

// Adobe Sign API Configuration
const ADOBE_SIGN_API_KEY = process.env.ADOBE_SIGN_API_KEY || '3AAABLblqZhAi9k7PzuRFwf7xkJRAAPTEBXLbPiuSgFeN6VlasR2vqXP4L1VrQQpAPm-JHPCcH6Vw-_W3NFGXRYFRwpFXbjqA';
let ADOBE_SIGN_BASE_URL = 'https://api.na1.adobesign.com/api/rest/v6'; // Will be updated after baseUris call

// S3 Configuration
const S3_BUCKET = 'pandasign-documents';
const S3_REGION = process.env.AWS_REGION || 'us-east-2';

const s3Client = new S3Client({ region: S3_REGION });

/**
 * Discover the correct API base URL for this account
 * Adobe Sign requires calling /baseUris first to get the correct shard endpoint
 */
async function discoverBaseUrl() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.na1.adobesign.com',
      path: '/api/rest/v6/baseUris',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${ADOBE_SIGN_API_KEY}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode === 200 && result.apiAccessPoint) {
            // apiAccessPoint is like "https://api.na2.adobesign.com/"
            // We need to append "api/rest/v6"
            const baseUrl = result.apiAccessPoint.replace(/\/$/, '') + '/api/rest/v6';
            console.log(`Discovered Adobe Sign API endpoint: ${baseUrl}`);
            resolve(baseUrl);
          } else {
            console.error('Failed to discover base URL:', result);
            reject(new Error(result.message || 'Failed to discover Adobe Sign base URL'));
          }
        } catch (e) {
          console.error('Failed to parse baseUris response:', data);
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Make Adobe Sign API request with retry logic for throttling
 */
async function adobeSignRequest(endpoint, method = 'GET', retries = 3) {
  const makeRequest = () => new Promise((resolve, reject) => {
    const url = new URL(`${ADOBE_SIGN_BASE_URL}${endpoint}`);

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: {
        'Authorization': `Bearer ${ADOBE_SIGN_API_KEY}`,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';

      if (res.headers['content-type']?.includes('application/pdf')) {
        // Handle binary PDF response
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({
          statusCode: res.statusCode,
          data: Buffer.concat(chunks),
          isPdf: true,
          headers: res.headers
        }));
      } else {
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(data), headers: res.headers });
          } catch (e) {
            resolve({ statusCode: res.statusCode, data, headers: res.headers });
          }
        });
      }
    });

    req.on('error', reject);
    req.end();
  });

  for (let attempt = 1; attempt <= retries; attempt++) {
    const response = await makeRequest();

    // Handle throttling (HTTP 429)
    if (response.statusCode === 429) {
      const retryAfter = response.data?.retryAfter || response.headers?.['retry-after'] || 5;
      console.log(`  Throttled by Adobe Sign. Waiting ${retryAfter}s before retry ${attempt}/${retries}...`);
      await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
      continue;
    }

    return response;
  }

  return { statusCode: 429, data: { code: 'MAX_RETRIES', message: 'Max retries exceeded' } };
}

/**
 * Download signed document from Adobe Sign
 */
async function downloadSignedDocument(agreementId) {
  try {
    // Get the combined document (signed PDF + audit trail)
    const response = await adobeSignRequest(
      `/agreements/${agreementId}/combinedDocument?attachAuditReport=true`
    );

    if (response.statusCode === 200 && response.isPdf) {
      return response.data;
    }

    // Log the error response for debugging
    if (response.statusCode !== 200) {
      console.error(`  Adobe Sign API error (${response.statusCode}):`, JSON.stringify(response.data));
    }

    // If combined doesn't work, try getting individual document
    const docsResponse = await adobeSignRequest(`/agreements/${agreementId}/documents`);
    if (docsResponse.statusCode === 200 && docsResponse.data.documents?.length > 0) {
      const mainDoc = docsResponse.data.documents[0];
      const docResponse = await adobeSignRequest(
        `/agreements/${agreementId}/documents/${mainDoc.id}`
      );
      if (docResponse.statusCode === 200 && docResponse.isPdf) {
        return docResponse.data;
      }
    }

    console.error(`Failed to download document for ${agreementId}:`, response.data);
    return null;
  } catch (error) {
    console.error(`Error downloading document ${agreementId}:`, error.message);
    return null;
  }
}

/**
 * Upload document to S3
 */
async function uploadToS3(pdfBuffer, agreementNumber, opportunityName) {
  const timestamp = Date.now();
  const safeName = opportunityName.replace(/[^a-zA-Z0-9-]/g, '_').substring(0, 50);
  const key = `signed-agreements/${agreementNumber}/${safeName}-signed-${timestamp}.pdf`;

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: pdfBuffer,
    ContentType: 'application/pdf',
    Metadata: {
      'agreement-number': agreementNumber,
      'migrated-from': 'adobe-sign',
      'migration-date': new Date().toISOString(),
    },
  });

  await s3Client.send(command);

  // Return the S3 URL
  return `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${key}`;
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
 * Query Adobe Sign agreements in batches to avoid HTTP 431 error
 */
async function queryAdobeSignInBatches(sf, oppIds, batchSize = 100) {
  const adobeSignMap = new Map();
  const batches = [];

  // Split into batches
  for (let i = 0; i < oppIds.length; i += batchSize) {
    batches.push(oppIds.slice(i, i + batchSize));
  }

  console.log(`Querying Adobe Sign in ${batches.length} batches of up to ${batchSize}...`);

  let totalFound = 0;
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const idsString = batch.map(id => `'${id}'`).join(',');

    const query = `
      SELECT
        Id,
        Name,
        echosign_dev1__Document_Key__c,
        echosign_dev1__Status__c,
        echosign_dev1__Opportunity__c,
        echosign_dev1__Opportunity__r.Name
      FROM echosign_dev1__SIGN_Agreement__c
      WHERE echosign_dev1__Opportunity__c IN (${idsString})
      AND echosign_dev1__Status__c = 'Signed'
      AND echosign_dev1__Document_Key__c != null
    `;

    try {
      const result = await sf.query(query);
      totalFound += result.totalSize;

      result.records.forEach(record => {
        const oppId = record.echosign_dev1__Opportunity__c;
        if (!adobeSignMap.has(oppId)) {
          adobeSignMap.set(oppId, []);
        }
        adobeSignMap.get(oppId).push({
          id: record.Id,
          name: record.Name,
          documentKey: record.echosign_dev1__Document_Key__c,
        });
      });

      process.stdout.write(`\r  Batch ${i + 1}/${batches.length} - Found ${totalFound} Adobe Sign agreements so far`);
    } catch (err) {
      console.error(`\n  Batch ${i + 1} failed:`, err.message);
    }

    // Small delay to avoid rate limiting
    if (i < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`\nTotal Adobe Sign agreements found: ${totalFound}\n`);
  return adobeSignMap;
}

/**
 * Main migration function
 */
async function migrateDocuments() {
  console.log('='.repeat(60));
  console.log('Adobe Sign Document Migration');
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('*** DRY RUN MODE - No documents will be uploaded ***\n');
  }

  // First, discover the correct API endpoint for this account
  console.log('Discovering Adobe Sign API endpoint...');
  try {
    ADOBE_SIGN_BASE_URL = await discoverBaseUrl();
  } catch (error) {
    console.error('Failed to discover Adobe Sign API endpoint:', error.message);
    console.error('Make sure your Integration Key is valid.');
    return;
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
      ${limitArg ? `LIMIT ${limitArg}` : ''}
    `);

    console.log(`Found ${agreementsResult.rows.length} signed agreements without documents\n`);

    if (agreementsResult.rows.length === 0) {
      console.log('No agreements to process.');
      return;
    }

    // Get unique Salesforce opportunity IDs
    const oppIds = [...new Set(
      agreementsResult.rows
        .map(a => a.opp_sf_id)
        .filter(Boolean)
    )];

    if (oppIds.length === 0) {
      console.log('No Salesforce IDs found for agreements.');
      return;
    }

    console.log(`Found ${oppIds.length} unique Salesforce opportunity IDs`);

    // Query Adobe Sign agreements in batches
    const adobeSignMap = await queryAdobeSignInBatches(sf, oppIds);

    // Process each agreement
    let processed = 0;
    let downloaded = 0;
    let uploaded = 0;
    let skipped = 0;
    let errors = [];

    for (const agreement of agreementsResult.rows) {
      processed++;

      const adobeSignDocs = adobeSignMap.get(agreement.opp_sf_id);
      if (!adobeSignDocs || adobeSignDocs.length === 0) {
        skipped++;
        if (processed <= 10 || processed % 100 === 0) {
          console.log(`[${processed}/${agreementsResult.rows.length}] ${agreement.agreement_number}: No Adobe Sign document found`);
        }
        continue;
      }

      // Use the first matching document (usually there's only one per opportunity)
      const adobeDoc = adobeSignDocs[0];

      console.log(`[${processed}/${agreementsResult.rows.length}] ${agreement.agreement_number}: Downloading from Adobe Sign...`);

      if (dryRun) {
        console.log(`  Would download: ${adobeDoc.documentKey}`);
        downloaded++;
        continue;
      }

      try {
        // Download from Adobe Sign
        const pdfBuffer = await downloadSignedDocument(adobeDoc.documentKey);

        if (!pdfBuffer) {
          errors.push({ agreement: agreement.agreement_number, error: 'Failed to download PDF' });
          continue;
        }

        downloaded++;
        console.log(`  Downloaded ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

        // Upload to S3
        const s3Url = await uploadToS3(pdfBuffer, agreement.agreement_number, agreement.name);
        uploaded++;
        console.log(`  Uploaded to S3: ${s3Url}`);

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

      // Rate limiting - Adobe Sign has API limits
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total agreements processed: ${processed}`);
    console.log(`Skipped (no Adobe Sign doc): ${skipped}`);
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
