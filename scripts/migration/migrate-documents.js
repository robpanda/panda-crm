/**
 * Document Migration Script
 * Migrates ContentDocument/ContentVersion/ContentDocumentLink records from Salesforce to PostgreSQL
 *
 * This migration handles Salesforce Files (ContentDocument) and their links to records.
 *
 * Salesforce Structure:
 * - ContentDocument: The file container
 * - ContentVersion: The actual file content (can have multiple versions)
 * - ContentDocumentLink: Links files to Accounts, Opportunities, etc.
 *
 * Prerequisites:
 * - Accounts must be migrated first
 * - Opportunities must be migrated first
 * - Contacts must be migrated first
 *
 * Note: This does NOT download file binary data. It migrates metadata only.
 * Files are accessed via Salesforce API when needed.
 *
 * Usage: node migrate-documents.js [--limit N] [--dry-run]
 */

import { getSalesforceConnection, queryAllRecords } from './salesforce-client.js';
import { prisma, batchUpsert, disconnect } from './prisma-client.js';

// ContentDocument fields
const CONTENT_DOCUMENT_FIELDS = [
  'Id',
  'Title',
  'OwnerId',
  'IsArchived',
  'ArchivedById',
  'ArchivedDate',
  'FileType',
  'FileExtension',
  'ContentSize',
  'LatestPublishedVersionId',
  'CreatedDate',
  'LastModifiedDate'
];

// ContentVersion fields for latest version
const CONTENT_VERSION_FIELDS = [
  'Id',
  'ContentDocumentId',
  'Title',
  'Description',
  'PathOnClient',
  'FileType',
  'FileExtension',
  'ContentSize',
  'ContentUrl',
  'VersionNumber',
  'IsLatest',
  'ContentModifiedDate',
  'ContentModifiedById',
  'OwnerId',
  'CreatedDate'
];

// ContentDocumentLink fields
const CONTENT_DOCUMENT_LINK_FIELDS = [
  'Id',
  'ContentDocumentId',
  'LinkedEntityId',
  'ShareType',
  'Visibility',
  'SystemModstamp'
];

// Transform ContentDocument to Prisma Document format
function transformDocument(sfDoc, sfVersion, userIdMap) {
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

    // Latest version reference
    latestVersionSalesforceId: sfDoc.LatestPublishedVersionId || null,

    // Owner
    ownerId: sfDoc.OwnerId ? userIdMap.get(sfDoc.OwnerId) || null : null,

    // Timestamps
    contentModifiedDate: sfVersion?.ContentModifiedDate ? new Date(sfVersion.ContentModifiedDate) : null,
    createdAt: sfDoc.CreatedDate ? new Date(sfDoc.CreatedDate) : new Date(),
    updatedAt: sfDoc.LastModifiedDate ? new Date(sfDoc.LastModifiedDate) : new Date()
  };
}

// Transform ContentDocumentLink to Prisma DocumentLink format
function transformDocumentLink(sfLink, documentIdMap, accountIdMap, opportunityIdMap, contactIdMap) {
  const linkedEntityId = sfLink.LinkedEntityId;
  let linkedRecordId = null;
  let linkedRecordType = null;

  // Determine linked record type by prefix
  if (linkedEntityId) {
    const prefix = linkedEntityId.substring(0, 3);
    if (prefix === '001') {
      // Account
      linkedRecordId = accountIdMap.get(linkedEntityId) || null;
      linkedRecordType = 'ACCOUNT';
    } else if (prefix === '006') {
      // Opportunity
      linkedRecordId = opportunityIdMap.get(linkedEntityId) || null;
      linkedRecordType = 'OPPORTUNITY';
    } else if (prefix === '003') {
      // Contact
      linkedRecordId = contactIdMap.get(linkedEntityId) || null;
      linkedRecordType = 'CONTACT';
    } else if (prefix === '500') {
      // Case
      linkedRecordType = 'CASE';
    } else if (prefix === '0WO') {
      // WorkOrder
      linkedRecordType = 'WORK_ORDER';
    }
  }

  return {
    salesforceId: sfLink.Id,
    documentId: documentIdMap.get(sfLink.ContentDocumentId) || null,
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

// Build ID maps for foreign key resolution
async function buildIdMaps() {
  console.log('Building ID maps for foreign key resolution...');

  // Get accounts
  const accounts = await prisma.account.findMany({
    select: { id: true, salesforceId: true },
  });
  const accountIdMap = new Map(accounts.map(a => [a.salesforceId, a.id]));
  console.log(`  Loaded ${accountIdMap.size} accounts`);

  // Get opportunities
  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true },
  });
  const opportunityIdMap = new Map(opportunities.map(o => [o.salesforceId, o.id]));
  console.log(`  Loaded ${opportunityIdMap.size} opportunities`);

  // Get contacts
  const contacts = await prisma.contact.findMany({
    select: { id: true, salesforceId: true },
  });
  const contactIdMap = new Map(contacts.map(c => [c.salesforceId, c.id]));
  console.log(`  Loaded ${contactIdMap.size} contacts`);

  // Get users
  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const userIdMap = new Map(users.map(u => [u.salesforceId, u.id]));
  console.log(`  Loaded ${userIdMap.size} users`);

  return { accountIdMap, opportunityIdMap, contactIdMap, userIdMap };
}

// Main migration function
async function migrateDocuments(options = {}) {
  const { limit, dryRun = false } = options;

  console.log('='.repeat(60));
  console.log('DOCUMENT MIGRATION');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  if (limit) console.log(`Limit: ${limit} records`);
  console.log('');

  try {
    // Connect to Salesforce
    const conn = await getSalesforceConnection();

    // Build ID maps
    const { accountIdMap, opportunityIdMap, contactIdMap, userIdMap } = await buildIdMaps();

    // Step 1: Query ContentDocuments
    console.log('Querying Salesforce for ContentDocument records...');
    const docFields = CONTENT_DOCUMENT_FIELDS.join(', ');
    let docQuery = `SELECT ${docFields} FROM ContentDocument WHERE IsDeleted = false`;
    if (limit) {
      docQuery += ` LIMIT ${limit}`;
    }
    const documents = await queryAllRecords(conn, docQuery);
    console.log(`Found ${documents.length} ContentDocument records`);

    // Step 2: Query ContentVersions for latest versions
    console.log('Querying Salesforce for ContentVersion records...');
    const docIds = documents.map(d => d.Id).join("','");
    const versionFields = CONTENT_VERSION_FIELDS.join(', ');
    const versionQuery = `SELECT ${versionFields} FROM ContentVersion WHERE ContentDocumentId IN ('${docIds}') AND IsLatest = true`;
    const versions = await queryAllRecords(conn, versionQuery);
    console.log(`Found ${versions.length} ContentVersion records`);

    // Build version map
    const versionMap = new Map(versions.map(v => [v.ContentDocumentId, v]));

    // Step 3: Transform documents
    console.log('Transforming document records...');
    const transformedDocs = documents.map(doc =>
      transformDocument(doc, versionMap.get(doc.Id), userIdMap)
    );

    // Stats
    const withOwner = transformedDocs.filter(d => d.ownerId).length;
    const archived = transformedDocs.filter(d => d.isArchived).length;
    const byType = {};
    transformedDocs.forEach(d => {
      const type = d.fileType || 'Unknown';
      byType[type] = (byType[type] || 0) + 1;
    });

    console.log('');
    console.log('Document stats:');
    console.log(`  With Owner: ${withOwner}/${transformedDocs.length}`);
    console.log(`  Archived: ${archived}/${transformedDocs.length}`);
    console.log('');
    console.log('By File Type (top 10):');
    Object.entries(byType).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    console.log('');

    if (!dryRun) {
      // Upsert documents
      console.log('Upserting document records to PostgreSQL...');
      await batchUpsert('document', transformedDocs, 'salesforceId', 100);
      console.log(`Successfully migrated ${transformedDocs.length} documents`);

      // Build document ID map for links
      const documentRecords = await prisma.document.findMany({
        select: { id: true, salesforceId: true },
      });
      const documentIdMap = new Map(documentRecords.map(d => [d.salesforceId, d.id]));

      // Step 4: Query ContentDocumentLinks
      console.log('');
      console.log('Querying Salesforce for ContentDocumentLink records...');
      const linkFields = CONTENT_DOCUMENT_LINK_FIELDS.join(', ');
      // Only get links for Account, Opportunity, Contact (001, 006, 003 prefixes)
      const linkQuery = `SELECT ${linkFields} FROM ContentDocumentLink WHERE ContentDocumentId IN ('${docIds}') AND IsDeleted = false`;
      const links = await queryAllRecords(conn, linkQuery);
      console.log(`Found ${links.length} ContentDocumentLink records`);

      // Transform links
      console.log('Transforming link records...');
      const transformedLinks = links.map(link =>
        transformDocumentLink(link, documentIdMap, accountIdMap, opportunityIdMap, contactIdMap)
      ).filter(link => link.documentId !== null); // Only include links where document was migrated

      console.log(`  Valid links (with document): ${transformedLinks.length}`);

      // Count by linked record type
      const byRecordType = {};
      transformedLinks.forEach(l => {
        const type = l.linkedRecordType || 'Other';
        byRecordType[type] = (byRecordType[type] || 0) + 1;
      });

      console.log('');
      console.log('Links by Record Type:');
      Object.entries(byRecordType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
      console.log('');

      // Upsert links
      console.log('Upserting document link records to PostgreSQL...');
      await batchUpsert('documentLink', transformedLinks, 'salesforceId', 100);
      console.log(`Successfully migrated ${transformedLinks.length} document links`);
    } else {
      console.log('DRY RUN - Skipping database insert');
      console.log('Sample transformed document:');
      console.log(JSON.stringify(transformedDocs[0], null, 2));
    }

    return transformedDocs.length;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

// Run if called directly
const options = parseArgs();
migrateDocuments(options)
  .then(count => {
    console.log(`\nMigration complete. Processed ${count} documents.`);
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

export { migrateDocuments };
