#!/usr/bin/env node
/**
 * Bidirectional Document Sync Script
 *
 * Syncs Document records (ContentDocument/ContentVersion) between Salesforce and PostgreSQL.
 *
 * Note: This syncs METADATA only, not file binary data. Files remain in Salesforce
 * and are accessed via API when needed.
 *
 * Salesforce Structure:
 * - ContentDocument: File container
 * - ContentVersion: Actual file content (versions)
 * - ContentDocumentLink: Links files to records
 *
 * Modes:
 *   --pull     Pull from Salesforce to PostgreSQL (default)
 *   --push     Push from PostgreSQL to Salesforce (limited - metadata only)
 *   --sync     Full bidirectional sync with conflict resolution
 *
 * Options:
 *   --dry-run  Preview changes without applying
 *   --limit N  Limit number of records
 *   --since    Only sync records modified since last sync
 *   --force    Ignore last sync timestamp, sync all records
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, batchUpsert, disconnect } from './prisma-client.js';
import {
  getLastSyncTime,
  saveLastSyncTime,
  buildReverseIdMaps,
  pushToSalesforce
} from './sync-utils.js';

// Salesforce ContentDocument fields
const DOCUMENT_FIELDS = [
  'Id', 'Title', 'OwnerId',
  'IsArchived', 'ArchivedById', 'ArchivedDate',
  'FileType', 'FileExtension', 'ContentSize',
  'LatestPublishedVersionId',
  'CreatedDate', 'LastModifiedDate'
];

// ContentVersion fields for file details
const VERSION_FIELDS = [
  'Id', 'ContentDocumentId', 'Title', 'Description',
  'PathOnClient', 'FileType', 'FileExtension', 'ContentSize',
  'ContentUrl', 'VersionNumber', 'IsLatest',
  'ContentModifiedDate', 'ContentModifiedById', 'OwnerId',
  'CreatedDate'
];

// ContentDocumentLink fields for linking to records
const LINK_FIELDS = [
  'Id', 'ContentDocumentId', 'LinkedEntityId',
  'ShareType', 'Visibility', 'SystemModstamp'
];

/**
 * Transform Salesforce ContentDocument to Prisma format
 */
function transformDocument(sfDoc, sfVersion, idMaps) {
  const { userIdMap } = idMaps;

  return {
    salesforceId: sfDoc.Id,
    title: sfDoc.Title || sfVersion?.Title || 'Untitled',
    description: sfVersion?.Description || null,
    fileName: sfVersion?.PathOnClient || sfDoc.Title || null,
    fileType: sfDoc.FileType || sfVersion?.FileType || null,
    fileExtension: sfDoc.FileExtension || sfVersion?.FileExtension || null,
    contentSize: sfDoc.ContentSize || sfVersion?.ContentSize || null,
    contentUrl: sfVersion?.ContentUrl || null,
    versionNumber: sfVersion?.VersionNumber || null,
    isArchived: sfDoc.IsArchived || false,
    archivedDate: sfDoc.ArchivedDate ? new Date(sfDoc.ArchivedDate) : null,
    archivedById: sfDoc.ArchivedById ? userIdMap.get(sfDoc.ArchivedById) || null : null,
    latestVersionSalesforceId: sfDoc.LatestPublishedVersionId || null,
    ownerId: sfDoc.OwnerId ? userIdMap.get(sfDoc.OwnerId) || null : null,
    contentModifiedDate: sfVersion?.ContentModifiedDate ? new Date(sfVersion.ContentModifiedDate) : null,
    createdAt: sfDoc.CreatedDate ? new Date(sfDoc.CreatedDate) : new Date(),
    updatedAt: sfDoc.LastModifiedDate ? new Date(sfDoc.LastModifiedDate) : new Date()
  };
}

/**
 * Transform ContentDocumentLink to DocumentLink format
 */
function transformDocumentLink(sfLink, idMaps) {
  const { documentIdMap, accountIdMap, opportunityIdMap, contactIdMap } = idMaps;

  const linkedEntityId = sfLink.LinkedEntityId;
  let linkedRecordId = null;
  let linkedRecordType = null;

  // Determine record type by Salesforce ID prefix
  if (linkedEntityId) {
    const prefix = linkedEntityId.substring(0, 3);
    if (prefix === '001') {
      linkedRecordId = accountIdMap.get(linkedEntityId);
      linkedRecordType = 'ACCOUNT';
    } else if (prefix === '006') {
      linkedRecordId = opportunityIdMap.get(linkedEntityId);
      linkedRecordType = 'OPPORTUNITY';
    } else if (prefix === '003') {
      linkedRecordId = contactIdMap.get(linkedEntityId);
      linkedRecordType = 'CONTACT';
    } else if (prefix === '500') {
      linkedRecordType = 'CASE';
    } else if (prefix === '0WO') {
      linkedRecordType = 'WORK_ORDER';
    }
  }

  return {
    salesforceId: sfLink.Id,
    documentId: sfLink.ContentDocumentId ? documentIdMap.get(sfLink.ContentDocumentId) : null,
    linkedEntitySalesforceId: linkedEntityId,
    linkedRecordType: linkedRecordType,
    accountId: linkedRecordType === 'ACCOUNT' ? linkedRecordId : null,
    opportunityId: linkedRecordType === 'OPPORTUNITY' ? linkedRecordId : null,
    contactId: linkedRecordType === 'CONTACT' ? linkedRecordId : null,
    shareType: sfLink.ShareType || null,
    visibility: sfLink.Visibility || null,
    createdAt: sfLink.SystemModstamp ? new Date(sfLink.SystemModstamp) : new Date()
  };
}

/**
 * Build ID maps for foreign key resolution
 */
async function buildIdMaps() {
  console.log('Building ID maps for foreign key resolution...');

  const accounts = await prisma.account.findMany({
    select: { id: true, salesforceId: true }
  });
  const accountIdMap = new Map(accounts.map(a => [a.salesforceId, a.id]));
  console.log(`  Accounts: ${accountIdMap.size}`);

  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true }
  });
  const opportunityIdMap = new Map(opportunities.map(o => [o.salesforceId, o.id]));
  console.log(`  Opportunities: ${opportunityIdMap.size}`);

  const contacts = await prisma.contact.findMany({
    select: { id: true, salesforceId: true }
  });
  const contactIdMap = new Map(contacts.map(c => [c.salesforceId, c.id]));
  console.log(`  Contacts: ${contactIdMap.size}`);

  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } }
  });
  const userIdMap = new Map(users.map(u => [u.salesforceId, u.id]));
  console.log(`  Users: ${userIdMap.size}`);

  return { accountIdMap, opportunityIdMap, contactIdMap, userIdMap };
}

/**
 * Pull Documents from Salesforce to PostgreSQL
 */
async function pullFromSalesforce(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PULL DOCUMENTS: Salesforce → PostgreSQL');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    const conn = await getSalesforceConnection();
    const idMaps = await buildIdMaps();

    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('Document', 'sf_to_pg');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Query ContentDocuments
    let docQuery = `SELECT ${DOCUMENT_FIELDS.join(', ')} FROM ContentDocument WHERE IsDeleted = false`;
    if (lastSync) {
      docQuery += ` AND LastModifiedDate > ${lastSync.toISOString()}`;
    }
    if (limit) {
      docQuery += ` LIMIT ${limit}`;
    }

    console.log('\nQuerying Salesforce for ContentDocuments...');
    const documents = await querySalesforce(conn, docQuery);
    console.log(`Found ${documents.length} ContentDocument records`);

    if (documents.length === 0) {
      console.log('No new documents to sync');
      return { synced: 0, errors: 0 };
    }

    // Query ContentVersions for these documents
    const docIds = documents.map(d => `'${d.Id}'`).join(',');
    const versionQuery = `SELECT ${VERSION_FIELDS.join(', ')} FROM ContentVersion WHERE ContentDocumentId IN (${docIds}) AND IsLatest = true`;
    console.log('Querying ContentVersions...');
    const versions = await querySalesforce(conn, versionQuery);
    console.log(`Found ${versions.length} ContentVersion records`);

    const versionMap = new Map(versions.map(v => [v.ContentDocumentId, v]));

    // Transform documents
    console.log('Transforming records...');
    const transformed = documents.map(doc =>
      transformDocument(doc, versionMap.get(doc.Id), idMaps)
    );

    // Stats
    const withOwner = transformed.filter(d => d.ownerId).length;
    const archived = transformed.filter(d => d.isArchived).length;
    const byType = {};
    transformed.forEach(d => {
      const type = d.fileType || 'Unknown';
      byType[type] = (byType[type] || 0) + 1;
    });

    console.log('\nStats:');
    console.log(`  With Owner: ${withOwner}/${transformed.length}`);
    console.log(`  Archived: ${archived}/${transformed.length}`);
    console.log('  By File Type (top 10):');
    Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([type, count]) => {
      console.log(`    ${type}: ${count}`);
    });

    if (!dryRun) {
      console.log('\nUpserting documents to PostgreSQL...');
      await batchUpsert('document', transformed, 'salesforceId', 100);
      console.log(`Successfully synced ${transformed.length} Documents`);

      // Now sync document links
      console.log('\nQuerying ContentDocumentLinks...');
      const linkQuery = `SELECT ${LINK_FIELDS.join(', ')} FROM ContentDocumentLink WHERE ContentDocumentId IN (${docIds}) AND IsDeleted = false`;
      const links = await querySalesforce(conn, linkQuery);
      console.log(`Found ${links.length} ContentDocumentLink records`);

      if (links.length > 0) {
        // Get document ID map after upsert
        const documentRecords = await prisma.document.findMany({
          select: { id: true, salesforceId: true }
        });
        const documentIdMap = new Map(documentRecords.map(d => [d.salesforceId, d.id]));

        const linkIdMaps = { documentIdMap, ...idMaps };
        const transformedLinks = links.map(link => transformDocumentLink(link, linkIdMaps))
          .filter(link => link.documentId !== null);

        console.log('Upserting document links...');
        await batchUpsert('documentLink', transformedLinks, 'salesforceId', 100);
        console.log(`Successfully synced ${transformedLinks.length} Document Links`);
      }

      // Save sync timestamp
      saveLastSyncTime('Document', 'sf_to_pg');
    } else {
      console.log('\nDRY RUN - Sample record:');
      console.log(JSON.stringify(transformed[0], null, 2));
    }

    return { synced: transformed.length, errors: 0 };
  } catch (error) {
    console.error('Pull failed:', error);
    throw error;
  }
}

/**
 * Push Documents from PostgreSQL to Salesforce
 *
 * Note: Limited functionality - can only update metadata (title, archive status)
 * Cannot create new documents or upload file content via this sync
 */
async function pushToSalesforceSync(options = {}) {
  const { limit, dryRun = false, since = null, force = false } = options;

  console.log('\n' + '='.repeat(60));
  console.log('PUSH DOCUMENTS: PostgreSQL → Salesforce');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('Note: Only metadata updates (title, archive status) are supported');

  try {
    // Determine sync timestamp
    let lastSync = null;
    if (!force) {
      lastSync = since || getLastSyncTime('Document', 'pg_to_sf');
    }
    console.log(`Last sync: ${lastSync ? lastSync.toISOString() : 'Full sync'}`);

    // Get modified records from Postgres (only those with salesforceId - can't create new)
    let where = {
      salesforceId: { not: null },
      ...(lastSync ? { updatedAt: { gt: lastSync } } : {})
    };
    let modifiedRecords;
    if (limit) {
      modifiedRecords = await prisma.document.findMany({
        where,
        take: limit
      });
    } else {
      modifiedRecords = await prisma.document.findMany({ where });
    }

    console.log(`Found ${modifiedRecords.length} modified records in PostgreSQL`);

    if (modifiedRecords.length === 0) {
      console.log('No changes to push');
      return { updated: 0, created: 0, errors: [] };
    }

    // Build reverse ID maps
    const idMaps = await buildReverseIdMaps();

    // Push to Salesforce (limited - metadata only)
    const result = await pushToSalesforce(
      'document',
      'ContentDocument',
      modifiedRecords,
      idMaps,
      { dryRun, batchSize: 200 }
    );

    if (!dryRun && result.errors.length === 0) {
      saveLastSyncTime('Document', 'pg_to_sf');
    }

    return result;
  } catch (error) {
    console.error('Push failed:', error);
    throw error;
  }
}

/**
 * Full bidirectional sync
 */
async function syncBidirectional(options = {}) {
  console.log('\n' + '='.repeat(60));
  console.log('BIDIRECTIONAL SYNC: Documents');
  console.log('='.repeat(60));

  // First pull from Salesforce
  const pullResult = await pullFromSalesforce(options);

  // Then push local changes to Salesforce
  const pushResult = await pushToSalesforceSync(options);

  console.log('\n' + '='.repeat(60));
  console.log('SYNC COMPLETE');
  console.log('='.repeat(60));
  console.log(`Pulled from SF: ${pullResult.synced}`);
  console.log(`Pushed to SF: ${pushResult.updated} updated, ${pushResult.created} created`);
  console.log(`Errors: ${pushResult.errors.length}`);

  return { pullResult, pushResult };
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: 'pull',
    dryRun: false,
    limit: null,
    since: false,
    force: false
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pull': options.mode = 'pull'; break;
      case '--push': options.mode = 'push'; break;
      case '--sync': options.mode = 'sync'; break;
      case '--dry-run': options.dryRun = true; break;
      case '--limit': options.limit = parseInt(args[++i], 10); break;
      case '--since': options.since = true; break;
      case '--force': options.force = true; break;
    }
  }

  return options;
}

// Main execution
async function main() {
  const options = parseArgs();

  try {
    switch (options.mode) {
      case 'pull': await pullFromSalesforce(options); break;
      case 'push': await pushToSalesforceSync(options); break;
      case 'sync': await syncBidirectional(options); break;
    }
  } catch (error) {
    console.error('Sync failed:', error);
    process.exit(1);
  } finally {
    await disconnect();
  }
}

main();

export { pullFromSalesforce, pushToSalesforceSync, syncBidirectional };
