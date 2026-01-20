/**
 * Document Migration Script
 * Migrates documents from Salesforce to PostgreSQL
 *
 * Salesforce Document Sources:
 * 1. ContentDocument/ContentVersion (96) - Modern files
 * 2. Adobe Sign Agreements (7,210) - Signed contracts linked to Accounts/Opportunities
 * 3. Attachments (290) - Legacy file attachments
 *
 * Prerequisites:
 * - Accounts must be migrated first
 * - Opportunities must be migrated first
 * - Contacts must be migrated first
 *
 * Note: This does NOT download file binary data. It migrates metadata only.
 * Files are accessed via Salesforce API when needed.
 *
 * Usage: node migrate-documents.js [--limit N] [--dry-run] [--type content|adobe|attachment|all]
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
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

// Adobe Sign Agreement fields
const ADOBE_SIGN_FIELDS = [
  'Id',
  'Name',
  'echosign_dev1__Account__c',
  'echosign_dev1__Opportunity__c',
  'echosign_dev1__Status__c',
  'echosign_dev1__Document_Key__c',
  'echosign_dev1__SignedPDF__c',  // URL to signed PDF
  'echosign_dev1__Agreement_Type__c',
  'echosign_dev1__DateSent__c',
  'echosign_dev1__DateSigned__c',
  'OwnerId',
  'CreatedDate',
  'LastModifiedDate'
];

// Attachment fields
const ATTACHMENT_FIELDS = [
  'Id',
  'ParentId',
  'Name',
  'ContentType',
  'BodyLength',
  'Description',
  'OwnerId',
  'CreatedDate',
  'LastModifiedDate',
  'IsPrivate'
];

// Transform ContentDocument to Prisma Document format
function transformDocument(sfDoc, sfVersion, userIdMap) {
  let versionNum = null;
  if (sfVersion?.VersionNumber) {
    const parsed = parseInt(sfVersion.VersionNumber, 10);
    versionNum = isNaN(parsed) ? null : parsed;
  }

  return {
    salesforceId: sfDoc.Id,
    title: sfDoc.Title || sfVersion?.Title || 'Untitled',
    description: sfVersion?.Description || null,
    fileName: sfVersion?.PathOnClient || sfDoc.Title || null,
    fileType: sfDoc.FileType || sfVersion?.FileType || null,
    fileExtension: sfDoc.FileExtension || sfVersion?.FileExtension || null,
    contentSize: sfDoc.ContentSize || sfVersion?.ContentSize || null,
    contentUrl: sfVersion?.ContentUrl || null,
    versionNumber: versionNum,
    isArchived: sfDoc.IsArchived || false,
    archivedDate: sfDoc.ArchivedDate ? new Date(sfDoc.ArchivedDate) : null,
    archivedById: sfDoc.ArchivedById ? userIdMap.get(sfDoc.ArchivedById) || null : null,
    latestVersionSalesforceId: sfDoc.LatestPublishedVersionId || null,
    ownerId: sfDoc.OwnerId ? userIdMap.get(sfDoc.OwnerId) || null : null,
    contentModifiedDate: sfVersion?.ContentModifiedDate ? new Date(sfVersion.ContentModifiedDate) : null,
    createdAt: sfDoc.CreatedDate ? new Date(sfDoc.CreatedDate) : new Date(),
    updatedAt: sfDoc.LastModifiedDate ? new Date(sfDoc.LastModifiedDate) : new Date(),
    sourceType: 'CONTENT_DOCUMENT'
  };
}

// Transform Adobe Sign Agreement to Prisma Document format
function transformAdobeSign(sfSign, userIdMap, accountIdMap, opportunityIdMap) {
  return {
    salesforceId: sfSign.Id,
    title: sfSign.Name || 'Adobe Sign Agreement',
    description: sfSign.echosign_dev1__Agreement_Type__c || null,
    fileName: sfSign.Name ? `${sfSign.Name}.pdf` : 'agreement.pdf',
    fileType: 'PDF',
    fileExtension: 'pdf',
    contentSize: null, // Adobe Sign doesn't expose file size in metadata
    contentUrl: null,
    versionNumber: 1,
    isArchived: false,
    archivedDate: null,
    archivedById: null,
    latestVersionSalesforceId: null,
    ownerId: sfSign.OwnerId ? userIdMap.get(sfSign.OwnerId) || null : null,
    contentModifiedDate: sfSign.echosign_dev1__DateSigned__c ? new Date(sfSign.echosign_dev1__DateSigned__c) : null,
    createdAt: sfSign.CreatedDate ? new Date(sfSign.CreatedDate) : new Date(),
    updatedAt: sfSign.LastModifiedDate ? new Date(sfSign.LastModifiedDate) : new Date(),
    sourceType: 'ADOBE_SIGN',
    // Additional Adobe Sign metadata stored as JSON
    metadata: JSON.stringify({
      status: sfSign.echosign_dev1__Status__c,
      documentKey: sfSign.echosign_dev1__Document_Key__c,
      dateSent: sfSign.echosign_dev1__DateSent__c,
      dateSigned: sfSign.echosign_dev1__DateSigned__c,
      agreementType: sfSign.echosign_dev1__Agreement_Type__c
    }),
    // Store linked record IDs for document links
    _linkedAccountId: sfSign.echosign_dev1__Account__c,
    _linkedOpportunityId: sfSign.echosign_dev1__Opportunity__c
  };
}

// Transform Attachment to Prisma Document format
function transformAttachment(sfAtt, userIdMap) {
  // Get file extension from content type or name
  let fileExtension = null;
  if (sfAtt.Name) {
    const parts = sfAtt.Name.split('.');
    if (parts.length > 1) {
      fileExtension = parts[parts.length - 1].toLowerCase();
    }
  }

  // Get file type from content type
  let fileType = null;
  if (sfAtt.ContentType) {
    if (sfAtt.ContentType.includes('pdf')) fileType = 'PDF';
    else if (sfAtt.ContentType.includes('image')) fileType = 'IMAGE';
    else if (sfAtt.ContentType.includes('word')) fileType = 'WORD';
    else if (sfAtt.ContentType.includes('excel') || sfAtt.ContentType.includes('spreadsheet')) fileType = 'EXCEL';
    else fileType = sfAtt.ContentType.split('/')[1]?.toUpperCase() || 'UNKNOWN';
  }

  return {
    salesforceId: sfAtt.Id,
    title: sfAtt.Name || 'Untitled Attachment',
    description: sfAtt.Description || null,
    fileName: sfAtt.Name || null,
    fileType: fileType,
    fileExtension: fileExtension,
    contentSize: sfAtt.BodyLength || null,
    contentUrl: null,
    versionNumber: 1,
    isArchived: false,
    archivedDate: null,
    archivedById: null,
    latestVersionSalesforceId: null,
    ownerId: sfAtt.OwnerId ? userIdMap.get(sfAtt.OwnerId) || null : null,
    contentModifiedDate: null,
    createdAt: sfAtt.CreatedDate ? new Date(sfAtt.CreatedDate) : new Date(),
    updatedAt: sfAtt.LastModifiedDate ? new Date(sfAtt.LastModifiedDate) : new Date(),
    sourceType: 'ATTACHMENT',
    // Store parent ID for creating links
    _parentId: sfAtt.ParentId
  };
}

// Transform ContentDocumentLink to Prisma DocumentLink format
function transformDocumentLink(sfLink, documentIdMap, accountIdMap, opportunityIdMap, contactIdMap) {
  const linkedEntityId = sfLink.LinkedEntityId;
  let linkedRecordId = null;
  let linkedRecordType = null;

  if (linkedEntityId) {
    const prefix = linkedEntityId.substring(0, 3);
    if (prefix === '001') {
      linkedRecordId = accountIdMap.get(linkedEntityId) || null;
      linkedRecordType = 'ACCOUNT';
    } else if (prefix === '006') {
      linkedRecordId = opportunityIdMap.get(linkedEntityId) || null;
      linkedRecordType = 'OPPORTUNITY';
    } else if (prefix === '003') {
      linkedRecordId = contactIdMap.get(linkedEntityId) || null;
      linkedRecordType = 'CONTACT';
    } else if (prefix === '500') {
      linkedRecordType = 'CASE';
    } else if (prefix === '0WO') {
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

  const accounts = await prisma.account.findMany({
    select: { id: true, salesforceId: true },
  });
  const accountIdMap = new Map(accounts.map(a => [a.salesforceId, a.id]));
  console.log(`  Loaded ${accountIdMap.size} accounts`);

  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true },
  });
  const opportunityIdMap = new Map(opportunities.map(o => [o.salesforceId, o.id]));
  console.log(`  Loaded ${opportunityIdMap.size} opportunities`);

  const contacts = await prisma.contact.findMany({
    select: { id: true, salesforceId: true },
  });
  const contactIdMap = new Map(contacts.map(c => [c.salesforceId, c.id]));
  console.log(`  Loaded ${contactIdMap.size} contacts`);

  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const userIdMap = new Map(users.map(u => [u.salesforceId, u.id]));
  console.log(`  Loaded ${userIdMap.size} users`);

  return { accountIdMap, opportunityIdMap, contactIdMap, userIdMap };
}

// Migrate ContentDocuments
async function migrateContentDocuments(conn, idMaps, options = {}) {
  const { limit, dryRun = false } = options;
  const { accountIdMap, opportunityIdMap, contactIdMap, userIdMap } = idMaps;

  console.log('\n' + '='.repeat(60));
  console.log('MIGRATING CONTENT DOCUMENTS');
  console.log('='.repeat(60));

  // Query ContentDocuments
  const docFields = CONTENT_DOCUMENT_FIELDS.join(', ');
  let docQuery = `SELECT ${docFields} FROM ContentDocument WHERE IsDeleted = false`;
  if (limit) docQuery += ` LIMIT ${limit}`;

  const documents = await querySalesforce(conn, docQuery);
  console.log(`Found ${documents.length} ContentDocument records`);

  if (documents.length === 0) return 0;

  // Query ContentVersions
  console.log('Querying ContentVersion records...');
  const docIds = documents.map(d => d.Id);
  const versionFields = CONTENT_VERSION_FIELDS.join(', ');
  const versions = [];
  for (let i = 0; i < docIds.length; i += 100) {
    const batch = docIds.slice(i, i + 100);
    const versionQuery = `SELECT ${versionFields} FROM ContentVersion WHERE ContentDocumentId IN ('${batch.join("','")}') AND IsLatest = true`;
    try {
      const batchVersions = await querySalesforce(conn, versionQuery);
      versions.push(...batchVersions);
    } catch (err) {
      console.warn(`  Warning: Error querying versions batch: ${err.message}`);
    }
  }
  const versionMap = new Map(versions.map(v => [v.ContentDocumentId, v]));

  // Transform
  const transformedDocs = documents.map(doc =>
    transformDocument(doc, versionMap.get(doc.Id), userIdMap)
  );

  if (!dryRun) {
    await batchUpsert('document', transformedDocs, 'salesforceId', 100);
    console.log(`Migrated ${transformedDocs.length} ContentDocuments`);
  }

  return transformedDocs.length;
}

// Migrate Adobe Sign Agreements
async function migrateAdobeSign(conn, idMaps, options = {}) {
  const { limit, dryRun = false } = options;
  const { accountIdMap, opportunityIdMap, contactIdMap, userIdMap } = idMaps;

  console.log('\n' + '='.repeat(60));
  console.log('MIGRATING ADOBE SIGN AGREEMENTS');
  console.log('='.repeat(60));

  // Query Adobe Sign Agreements
  const fields = ADOBE_SIGN_FIELDS.join(', ');
  let query = `SELECT ${fields} FROM echosign_dev1__SIGN_Agreement__c`;
  if (limit) query += ` LIMIT ${limit}`;

  const agreements = await querySalesforce(conn, query);
  console.log(`Found ${agreements.length} Adobe Sign Agreement records`);

  if (agreements.length === 0) return 0;

  // Transform agreements
  const transformedDocs = agreements.map(sign =>
    transformAdobeSign(sign, userIdMap, accountIdMap, opportunityIdMap)
  );

  // Stats by status
  const byStatus = {};
  agreements.forEach(s => {
    const status = s.echosign_dev1__Status__c || 'Unknown';
    byStatus[status] = (byStatus[status] || 0) + 1;
  });
  console.log('\nBy Status:');
  Object.entries(byStatus).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });

  if (!dryRun) {
    // Remove internal fields before upserting
    const docsToUpsert = transformedDocs.map(({ _linkedAccountId, _linkedOpportunityId, ...doc }) => doc);
    await batchUpsert('document', docsToUpsert, 'salesforceId', 100);
    console.log(`Migrated ${docsToUpsert.length} Adobe Sign Agreements`);

    // Create document links for Adobe Sign
    console.log('\nCreating document links for Adobe Sign Agreements...');
    const documentRecords = await prisma.document.findMany({
      select: { id: true, salesforceId: true },
      where: { sourceType: 'ADOBE_SIGN' }
    });
    const documentIdMap = new Map(documentRecords.map(d => [d.salesforceId, d.id]));

    const links = [];
    for (const doc of transformedDocs) {
      const docId = documentIdMap.get(doc.salesforceId);
      if (!docId) continue;

      // Link to Account
      if (doc._linkedAccountId) {
        const accountId = accountIdMap.get(doc._linkedAccountId);
        if (accountId) {
          links.push({
            salesforceId: `ADOBESIGN_ACC_${doc.salesforceId}`,
            documentId: docId,
            linkedEntitySalesforceId: doc._linkedAccountId,
            linkedRecordType: 'ACCOUNT',
            accountId: accountId,
            opportunityId: null,
            contactId: null,
            shareType: 'V',
            visibility: 'AllUsers',
            createdAt: doc.createdAt
          });
        }
      }

      // Link to Opportunity
      if (doc._linkedOpportunityId) {
        const opportunityId = opportunityIdMap.get(doc._linkedOpportunityId);
        if (opportunityId) {
          links.push({
            salesforceId: `ADOBESIGN_OPP_${doc.salesforceId}`,
            documentId: docId,
            linkedEntitySalesforceId: doc._linkedOpportunityId,
            linkedRecordType: 'OPPORTUNITY',
            accountId: null,
            opportunityId: opportunityId,
            contactId: null,
            shareType: 'V',
            visibility: 'AllUsers',
            createdAt: doc.createdAt
          });
        }
      }
    }

    if (links.length > 0) {
      await batchUpsert('documentLink', links, 'salesforceId', 100);
      console.log(`Created ${links.length} document links for Adobe Sign Agreements`);
    }
  }

  return transformedDocs.length;
}

// Migrate Attachments
async function migrateAttachments(conn, idMaps, options = {}) {
  const { limit, dryRun = false } = options;
  const { accountIdMap, opportunityIdMap, contactIdMap, userIdMap } = idMaps;

  console.log('\n' + '='.repeat(60));
  console.log('MIGRATING ATTACHMENTS');
  console.log('='.repeat(60));

  // Query Attachments
  const fields = ATTACHMENT_FIELDS.join(', ');
  let query = `SELECT ${fields} FROM Attachment`;
  if (limit) query += ` LIMIT ${limit}`;

  const attachments = await querySalesforce(conn, query);
  console.log(`Found ${attachments.length} Attachment records`);

  if (attachments.length === 0) return 0;

  // Transform
  const transformedDocs = attachments.map(att =>
    transformAttachment(att, userIdMap)
  );

  // Stats by parent type
  const byParentType = {};
  attachments.forEach(a => {
    const prefix = a.ParentId ? a.ParentId.substring(0, 3) : 'null';
    let type = prefix;
    if (prefix === '001') type = 'Account';
    else if (prefix === '003') type = 'Contact';
    else if (prefix === '006') type = 'Opportunity';
    else if (prefix === 'a1P') type = 'Adobe Sign Agreement';
    byParentType[type] = (byParentType[type] || 0) + 1;
  });
  console.log('\nBy Parent Type:');
  Object.entries(byParentType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });

  if (!dryRun) {
    // Remove internal fields before upserting
    const docsToUpsert = transformedDocs.map(({ _parentId, ...doc }) => doc);
    await batchUpsert('document', docsToUpsert, 'salesforceId', 100);
    console.log(`Migrated ${docsToUpsert.length} Attachments`);

    // Create document links for Attachments
    console.log('\nCreating document links for Attachments...');
    const documentRecords = await prisma.document.findMany({
      select: { id: true, salesforceId: true },
      where: { sourceType: 'ATTACHMENT' }
    });
    const documentIdMap = new Map(documentRecords.map(d => [d.salesforceId, d.id]));

    const links = [];
    for (const doc of transformedDocs) {
      const docId = documentIdMap.get(doc.salesforceId);
      if (!docId || !doc._parentId) continue;

      const parentPrefix = doc._parentId.substring(0, 3);
      let linkedRecordType = null;
      let accountId = null;
      let opportunityId = null;
      let contactId = null;

      if (parentPrefix === '001') {
        linkedRecordType = 'ACCOUNT';
        accountId = accountIdMap.get(doc._parentId);
      } else if (parentPrefix === '006') {
        linkedRecordType = 'OPPORTUNITY';
        opportunityId = opportunityIdMap.get(doc._parentId);
      } else if (parentPrefix === '003') {
        linkedRecordType = 'CONTACT';
        contactId = contactIdMap.get(doc._parentId);
      }

      if (linkedRecordType && (accountId || opportunityId || contactId)) {
        links.push({
          salesforceId: `ATTACHMENT_${doc.salesforceId}`,
          documentId: docId,
          linkedEntitySalesforceId: doc._parentId,
          linkedRecordType: linkedRecordType,
          accountId: accountId,
          opportunityId: opportunityId,
          contactId: contactId,
          shareType: 'V',
          visibility: 'AllUsers',
          createdAt: doc.createdAt
        });
      }
    }

    if (links.length > 0) {
      await batchUpsert('documentLink', links, 'salesforceId', 100);
      console.log(`Created ${links.length} document links for Attachments`);
    }
  }

  return transformedDocs.length;
}

// Migrate ContentDocumentLinks (for ContentDocuments only)
async function migrateContentDocumentLinks(conn, idMaps, options = {}) {
  const { dryRun = false } = options;
  const { accountIdMap, opportunityIdMap, contactIdMap } = idMaps;

  console.log('\n' + '='.repeat(60));
  console.log('MIGRATING CONTENT DOCUMENT LINKS');
  console.log('='.repeat(60));

  // Get document ID map for ContentDocuments only
  const documentRecords = await prisma.document.findMany({
    select: { id: true, salesforceId: true },
    where: { sourceType: 'CONTENT_DOCUMENT' }
  });
  const documentIdMap = new Map(documentRecords.map(d => [d.salesforceId, d.id]));

  if (documentIdMap.size === 0) {
    console.log('No ContentDocuments to link. Skipping.');
    return 0;
  }

  const linkFields = CONTENT_DOCUMENT_LINK_FIELDS.join(', ');
  const allLinks = [];

  // Query links for Accounts
  const accountSfIds = Array.from(accountIdMap.keys());
  console.log(`Querying links for ${accountSfIds.length} accounts...`);
  for (let i = 0; i < accountSfIds.length; i += 100) {
    const batch = accountSfIds.slice(i, i + 100);
    const batchQuery = `SELECT ${linkFields} FROM ContentDocumentLink WHERE LinkedEntityId IN ('${batch.join("','")}')`;
    try {
      const batchLinks = await querySalesforce(conn, batchQuery);
      allLinks.push(...batchLinks);
    } catch (err) {
      console.warn(`  Warning: Error querying batch: ${err.message}`);
    }
  }

  // Query links for Opportunities
  const opportunitySfIds = Array.from(opportunityIdMap.keys());
  console.log(`Querying links for ${opportunitySfIds.length} opportunities...`);
  for (let i = 0; i < opportunitySfIds.length; i += 100) {
    const batch = opportunitySfIds.slice(i, i + 100);
    const batchQuery = `SELECT ${linkFields} FROM ContentDocumentLink WHERE LinkedEntityId IN ('${batch.join("','")}')`;
    try {
      const batchLinks = await querySalesforce(conn, batchQuery);
      allLinks.push(...batchLinks);
    } catch (err) {
      console.warn(`  Warning: Error querying batch: ${err.message}`);
    }
  }

  // Query links for Contacts
  const contactSfIds = Array.from(contactIdMap.keys());
  console.log(`Querying links for ${contactSfIds.length} contacts...`);
  for (let i = 0; i < contactSfIds.length; i += 100) {
    const batch = contactSfIds.slice(i, i + 100);
    const batchQuery = `SELECT ${linkFields} FROM ContentDocumentLink WHERE LinkedEntityId IN ('${batch.join("','")}')`;
    try {
      const batchLinks = await querySalesforce(conn, batchQuery);
      allLinks.push(...batchLinks);
    } catch (err) {
      console.warn(`  Warning: Error querying batch: ${err.message}`);
    }
  }

  // Deduplicate
  const uniqueLinks = [];
  const seenLinkIds = new Set();
  for (const link of allLinks) {
    if (!seenLinkIds.has(link.Id)) {
      seenLinkIds.add(link.Id);
      uniqueLinks.push(link);
    }
  }

  // Filter to only links for migrated documents
  const docSfIds = new Set(documentIdMap.keys());
  const links = uniqueLinks.filter(l => docSfIds.has(l.ContentDocumentId));
  console.log(`Found ${links.length} ContentDocumentLink records`);

  if (!dryRun && links.length > 0) {
    const transformedLinks = links.map(link =>
      transformDocumentLink(link, documentIdMap, accountIdMap, opportunityIdMap, contactIdMap)
    ).filter(link => link.documentId !== null);

    await batchUpsert('documentLink', transformedLinks, 'salesforceId', 100);
    console.log(`Migrated ${transformedLinks.length} ContentDocumentLinks`);
  }

  return links.length;
}

// Main migration function
async function migrateDocuments(options = {}) {
  const { limit, dryRun = false, type = 'all' } = options;

  console.log('='.repeat(60));
  console.log('DOCUMENT MIGRATION');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Type: ${type}`);
  if (limit) console.log(`Limit: ${limit} records per type`);
  console.log('');

  try {
    const conn = await getSalesforceConnection();
    const idMaps = await buildIdMaps();

    let totalMigrated = 0;

    if (type === 'all' || type === 'content') {
      totalMigrated += await migrateContentDocuments(conn, idMaps, options);
    }

    if (type === 'all' || type === 'adobe') {
      totalMigrated += await migrateAdobeSign(conn, idMaps, options);
    }

    if (type === 'all' || type === 'attachment') {
      totalMigrated += await migrateAttachments(conn, idMaps, options);
    }

    if ((type === 'all' || type === 'content') && !dryRun) {
      await migrateContentDocumentLinks(conn, idMaps, options);
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));

    const docCounts = await prisma.document.groupBy({
      by: ['sourceType'],
      _count: true
    });
    console.log('\nDocuments by Source Type:');
    docCounts.forEach(c => console.log(`  ${c.sourceType || 'Unknown'}: ${c._count}`));

    const totalDocs = await prisma.document.count();
    console.log(`\nTotal Documents: ${totalDocs}`);

    const totalLinks = await prisma.documentLink.count();
    console.log(`Total Document Links: ${totalLinks}`);

    const linkCounts = await prisma.documentLink.groupBy({
      by: ['linkedRecordType'],
      _count: true
    });
    console.log('\nLinks by Record Type:');
    linkCounts.forEach(c => console.log(`  ${c.linkedRecordType || 'Unknown'}: ${c._count}`));

    return totalMigrated;
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
    } else if (args[i] === '--type' && args[i + 1]) {
      options.type = args[i + 1];
      i++;
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
