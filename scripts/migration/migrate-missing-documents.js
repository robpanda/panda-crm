// Migrate Missing ContentDocuments
// This script migrates the 92,396 ContentDocuments that were discovered but not previously migrated
import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, batchUpsert, disconnect } from './prisma-client.js';

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

async function migrateMissingDocuments() {
  try {
    console.log('Migrating missing ContentDocuments...\n');

    // Get all Account and Opportunity Salesforce IDs
    const accounts = await prisma.account.findMany({
      where: { salesforceId: { not: null } },
      select: { salesforceId: true },
    });

    const opportunities = await prisma.opportunity.findMany({
      where: { salesforceId: { not: null } },
      select: { salesforceId: true },
    });

    const accountIds = accounts.map(a => a.salesforceId).filter(Boolean);
    const opportunityIds = opportunities.map(o => o.salesforceId).filter(Boolean);

    console.log(`Found ${accountIds.length} Account IDs and ${opportunityIds.length} Opportunity IDs\n`);

    const conn = await getSalesforceConnection();

    // Step 1: Discover all ContentDocumentLinks
    const batchSize = 200;
    const allContentDocumentIds = new Set();

    console.log('Step 1/4: Discovering ContentDocumentLinks for Accounts...');
    for (let i = 0; i < accountIds.length; i += batchSize) {
      const batch = accountIds.slice(i, i + batchSize);
      const query = `SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId IN ('${batch.join("','")}')`;
      const links = await querySalesforce(conn, query);
      links.forEach(link => allContentDocumentIds.add(link.ContentDocumentId));

      if ((i / batchSize + 1) % 50 === 0) {
        console.log(`  Processed ${i + batchSize} accounts (${allContentDocumentIds.size} unique docs so far)`);
      }
    }

    console.log('\nStep 2/4: Discovering ContentDocumentLinks for Opportunities...');
    for (let i = 0; i < opportunityIds.length; i += batchSize) {
      const batch = opportunityIds.slice(i, i + batchSize);
      const query = `SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId IN ('${batch.join("','")}')`;
      const links = await querySalesforce(conn, query);
      links.forEach(link => allContentDocumentIds.add(link.ContentDocumentId));

      if ((i / batchSize + 1) % 50 === 0) {
        console.log(`  Processed ${i + batchSize} opportunities (${allContentDocumentIds.size} unique docs so far)`);
      }
    }

    console.log(`\n✓ Total unique ContentDocuments discovered: ${allContentDocumentIds.size}\n`);

    // Step 2: Find missing documents
    const migratedDocs = await prisma.document.findMany({
      where: {
        sourceType: 'CONTENT_DOCUMENT',
        salesforceId: { not: null }
      },
      select: { salesforceId: true },
    });

    const migratedIds = new Set(migratedDocs.map(d => d.salesforceId));
    const missingIds = [...allContentDocumentIds].filter(id => !migratedIds.has(id));

    console.log(`Already migrated: ${migratedIds.size} ContentDocuments`);
    console.log(`Missing: ${missingIds.length} ContentDocuments\n`);

    if (missingIds.length === 0) {
      console.log('✓ All ContentDocuments already migrated!');
      return;
    }

    // Step 3: Query missing ContentDocuments in batches
    console.log(`Step 3/4: Querying details for ${missingIds.length} missing documents...\n`);

    const queryBatchSize = 200;
    const allDocuments = [];

    for (let i = 0; i < missingIds.length; i += queryBatchSize) {
      const batch = missingIds.slice(i, i + queryBatchSize);
      const docFields = CONTENT_DOCUMENT_FIELDS.join(', ');
      const query = `SELECT ${docFields} FROM ContentDocument WHERE Id IN ('${batch.join("','")}')`;

      try {
        const docs = await querySalesforce(conn, query);
        allDocuments.push(...docs);
        console.log(`  Batch ${Math.floor(i / queryBatchSize) + 1}/${Math.ceil(missingIds.length / queryBatchSize)}: Fetched ${docs.length} documents (total: ${allDocuments.length})`);
      } catch (error) {
        console.error(`  Error in batch ${Math.floor(i / queryBatchSize) + 1}:`, error.message);
      }
    }

    console.log(`\n✓ Fetched ${allDocuments.length} ContentDocument records from Salesforce\n`);

    // Step 4: Insert into database
    console.log('Step 4/4: Inserting documents into database...\n');

    const documentsToInsert = allDocuments.map(sf => ({
      salesforceId: sf.Id,
      title: sf.Title || 'Untitled',  // Schema uses 'title' not 'name'
      fileType: sf.FileType || null,
      fileExtension: sf.FileExtension || null,
      contentSize: sf.ContentSize || null,  // Schema uses 'contentSize' not 'fileSizeBytes'
      sourceType: 'CONTENT_DOCUMENT',
      isArchived: sf.IsArchived || false,
      archivedDate: sf.ArchivedDate ? new Date(sf.ArchivedDate) : null,
      latestVersionSalesforceId: sf.LatestPublishedVersionId || null,
      metadata: JSON.stringify({
        ownerId: sf.OwnerId,
        archivedById: sf.ArchivedById,
        createdDate: sf.CreatedDate,
        lastModifiedDate: sf.LastModifiedDate
      }),
      createdAt: sf.CreatedDate ? new Date(sf.CreatedDate) : new Date(),
      updatedAt: sf.LastModifiedDate ? new Date(sf.LastModifiedDate) : new Date(),
    }));

    // Insert in batches of 1000
    const insertBatchSize = 1000;
    let inserted = 0;

    for (let i = 0; i < documentsToInsert.length; i += insertBatchSize) {
      const batch = documentsToInsert.slice(i, i + insertBatchSize);

      try {
        // batchUpsert signature: (model, records, idField = 'salesforceId')
        const result = await batchUpsert('document', batch, 'salesforceId');

        inserted += batch.length;
        console.log(`  Inserted batch ${Math.floor(i / insertBatchSize) + 1}/${Math.ceil(documentsToInsert.length / insertBatchSize)}: ${inserted}/${documentsToInsert.length} documents (created: ${result.created}, errors: ${result.errors.length})`);

        if (result.errors.length > 0) {
          console.error(`  Batch had ${result.errors.length} errors. First error:`, result.errors[0].error);
        }
      } catch (error) {
        console.error(`  Error inserting batch:`, error.message);
      }
    }

    console.log(`\n✓ Migration complete! Inserted ${inserted} ContentDocuments\n`);

    // Verify
    const finalCount = await prisma.document.count({
      where: { sourceType: 'CONTENT_DOCUMENT' }
    });
    console.log(`Total ContentDocuments in database: ${finalCount}`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await disconnect();
  }
}

migrateMissingDocuments();
