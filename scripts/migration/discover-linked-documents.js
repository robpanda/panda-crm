// Discover all ContentDocuments linked to Accounts and Opportunities
import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma } from './prisma-client.js';

async function discoverLinkedDocuments() {
  try {
    console.log('Discovering all ContentDocuments linked to Accounts and Opportunities...\n');

    // Get all Account and Opportunity Salesforce IDs from our database
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

    console.log(`Found ${accountIds.length} Account IDs and ${opportunityIds.length} Opportunity IDs in database\n`);

    const conn = await getSalesforceConnection();

    // Query ContentDocumentLink in batches (Salesforce allows up to 200 IDs in WHERE IN)
    const batchSize = 200;
    const allContentDocumentIds = new Set();

    // Process Account links
    console.log('Querying ContentDocumentLinks for Accounts...');
    for (let i = 0; i < accountIds.length; i += batchSize) {
      const batch = accountIds.slice(i, i + batchSize);
      const query = `SELECT ContentDocumentId, LinkedEntityId FROM ContentDocumentLink WHERE LinkedEntityId IN ('${batch.join("','")}')`;

      try {
        const links = await querySalesforce(conn, query);
        links.forEach(link => allContentDocumentIds.add(link.ContentDocumentId));
        console.log(`  Batch ${Math.floor(i / batchSize) + 1}: Found ${links.length} links (${allContentDocumentIds.size} unique docs so far)`);
      } catch (error) {
        console.error(`  Error in batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      }
    }

    // Process Opportunity links
    console.log('\nQuerying ContentDocumentLinks for Opportunities...');
    for (let i = 0; i < opportunityIds.length; i += batchSize) {
      const batch = opportunityIds.slice(i, i + batchSize);
      const query = `SELECT ContentDocumentId, LinkedEntityId FROM ContentDocumentLink WHERE LinkedEntityId IN ('${batch.join("','")}')`;

      try {
        const links = await querySalesforce(conn, query);
        links.forEach(link => allContentDocumentIds.add(link.ContentDocumentId));
        console.log(`  Batch ${Math.floor(i / batchSize) + 1}: Found ${links.length} links (${allContentDocumentIds.size} unique docs so far)`);
      } catch (error) {
        console.error(`  Error in batch ${Math.floor(i / batchSize) + 1}:`, error.message);
      }
    }

    console.log(`\n✓ Total unique ContentDocuments linked to Accounts/Opportunities: ${allContentDocumentIds.size}\n`);

    // Check which ContentDocuments we've already migrated
    const migratedDocs = await prisma.document.findMany({
      where: {
        sourceType: 'CONTENT_DOCUMENT',
        salesforceId: { not: null }
      },
      select: { salesforceId: true },
    });

    const migratedIds = new Set(migratedDocs.map(d => d.salesforceId));
    console.log(`✓ Already migrated: ${migratedIds.size} ContentDocuments\n`);

    // Find missing documents
    const missingIds = [...allContentDocumentIds].filter(id => !migratedIds.has(id));
    console.log(`✗ Missing from migration: ${missingIds.length} ContentDocuments\n`);

    if (missingIds.length > 0) {
      console.log('Sample of missing ContentDocument IDs:');
      missingIds.slice(0, 10).forEach((id, i) => {
        console.log(`  ${i + 1}. ${id}`);
      });

      // Query details of first few missing documents
      if (missingIds.length > 0) {
        const sampleIds = missingIds.slice(0, 5);
        console.log('\nDetails of first 5 missing documents:');
        const query = `SELECT Id, Title, FileType, FileExtension, ContentSize, CreatedDate FROM ContentDocument WHERE Id IN ('${sampleIds.join("','")}')`;
        const sampleDocs = await querySalesforce(conn, query);
        sampleDocs.forEach(doc => {
          const size = (doc.ContentSize || 0) / 1024;
          console.log(`  - ${doc.Title}.${doc.FileExtension} (${doc.FileType}, ${size.toFixed(1)}KB, created ${doc.CreatedDate})`);
        });
      }
    } else {
      console.log('✓ All linked ContentDocuments have been migrated!');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

discoverLinkedDocuments();
