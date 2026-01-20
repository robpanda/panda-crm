// Migrate ContentDocumentLinks from Salesforce to Panda CRM
// This links documents to their parent records (Accounts, Opportunities, Contacts, etc.)

import { getSalesforceConnection } from './salesforce-client.js';
import { prisma, batchUpsert } from './prisma-client.js';

const BATCH_SIZE = 1000;

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('CONTENT DOCUMENT LINKS MIGRATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Started:', new Date().toISOString());

  const conn = await getSalesforceConnection();

  // Build lookup maps for Panda CRM records
  console.log('\nBuilding lookup maps...');

  // Get all documents by Salesforce ID
  const docs = await prisma.document.findMany({
    select: { id: true, salesforceId: true }
  });
  const docMap = new Map(docs.map(d => [d.salesforceId, d.id]));
  console.log('  Documents:', docMap.size);

  // Get all accounts by Salesforce ID
  const accounts = await prisma.account.findMany({
    select: { id: true, salesforceId: true }
  });
  const accountMap = new Map(accounts.map(a => [a.salesforceId, a.id]));
  console.log('  Accounts:', accountMap.size);

  // Get all opportunities by Salesforce ID
  const opps = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true }
  });
  const oppMap = new Map(opps.map(o => [o.salesforceId, o.id]));
  console.log('  Opportunities:', oppMap.size);

  // Get all contacts by Salesforce ID
  const contacts = await prisma.contact.findMany({
    select: { id: true, salesforceId: true }
  });
  const contactMap = new Map(contacts.map(c => [c.salesforceId, c.id]));
  console.log('  Contacts:', contactMap.size);

  // Get all work orders by Salesforce ID
  const workOrders = await prisma.workOrder.findMany({
    select: { id: true, salesforceId: true }
  });
  const woMap = new Map(workOrders.map(w => [w.salesforceId, w.id]));
  console.log('  WorkOrders:', woMap.size);

  // Get existing document links to avoid duplicates
  const existingLinks = await prisma.documentLink.findMany({
    select: { salesforceId: true }
  });
  const existingLinkSet = new Set(existingLinks.map(l => l.salesforceId));
  console.log('  Existing Links:', existingLinkSet.size);

  // Entity prefix mappings for determining record type
  const prefixToType = {
    '001': 'ACCOUNT',
    '003': 'CONTACT',
    '006': 'OPPORTUNITY',
    '500': 'CASE',
    '0WO': 'WORK_ORDER',
    '00P': 'ATTACHMENT', // ContentDocument parent
    '00U': 'EVENT',
    '00T': 'TASK',
    '800': 'SERVICE_CONTRACT',
  };

  // Process ContentDocumentLinks in batches by linked entity type
  // Salesforce requires filtering by LinkedEntityId, so we'll query per entity

  let totalProcessed = 0;
  let totalCreated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Process Account-linked documents
  console.log('\n─── Processing Account-linked documents ───');
  const accountIds = Array.from(accountMap.keys()).filter(id => id && id.length > 0);
  console.log(`  Total accounts with valid SF IDs: ${accountIds.length}`);
  for (let i = 0; i < accountIds.length; i += 100) {
    const batchIds = accountIds.slice(i, i + 100).filter(id => id && id.startsWith('001'));
    if (batchIds.length === 0) continue;
    const idList = batchIds.map(id => `'${id}'`).join(',');

    try {
      const links = await conn.query(`
        SELECT Id, ContentDocumentId, LinkedEntityId, ShareType, Visibility
        FROM ContentDocumentLink
        WHERE LinkedEntityId IN (${idList})
      `);

      const linksToInsert = [];
      for (const link of links.records) {
        if (existingLinkSet.has(link.Id)) {
          totalSkipped++;
          continue;
        }

        const documentId = docMap.get(link.ContentDocumentId);
        const accountId = accountMap.get(link.LinkedEntityId);

        if (!documentId) {
          // Document doesn't exist in our system
          totalSkipped++;
          continue;
        }

        linksToInsert.push({
          salesforceId: link.Id,
          documentId: documentId,
          linkedEntitySalesforceId: link.LinkedEntityId,
          linkedRecordType: 'ACCOUNT',
          accountId: accountId || null,
          shareType: link.ShareType,
          visibility: link.Visibility,
        });
        existingLinkSet.add(link.Id);
      }

      if (linksToInsert.length > 0) {
        const result = await batchUpsert('documentLink', linksToInsert, 'salesforceId');
        totalCreated += result.created;
        totalErrors += result.errors;
      }

      totalProcessed += links.totalSize;
    } catch (err) {
      console.error('Error processing account batch:', err.message);
    }

    if ((i + 100) % 1000 === 0 || i + 100 >= accountIds.length) {
      console.log(`  Processed ${Math.min(i + 100, accountIds.length)}/${accountIds.length} accounts... Created: ${totalCreated}`);
    }
  }

  // Process Opportunity-linked documents
  console.log('\n─── Processing Opportunity-linked documents ───');
  const oppIds = Array.from(oppMap.keys()).filter(id => id && id.length > 0 && id.startsWith('006'));
  console.log(`  Total opportunities with valid SF IDs: ${oppIds.length}`);
  for (let i = 0; i < oppIds.length; i += 100) {
    const batchIds = oppIds.slice(i, i + 100);
    if (batchIds.length === 0) continue;
    const idList = batchIds.map(id => `'${id}'`).join(',');

    try {
      const links = await conn.query(`
        SELECT Id, ContentDocumentId, LinkedEntityId, ShareType, Visibility
        FROM ContentDocumentLink
        WHERE LinkedEntityId IN (${idList})
      `);

      const linksToInsert = [];
      for (const link of links.records) {
        if (existingLinkSet.has(link.Id)) {
          totalSkipped++;
          continue;
        }

        const documentId = docMap.get(link.ContentDocumentId);
        const opportunityId = oppMap.get(link.LinkedEntityId);

        if (!documentId) {
          totalSkipped++;
          continue;
        }

        linksToInsert.push({
          salesforceId: link.Id,
          documentId: documentId,
          linkedEntitySalesforceId: link.LinkedEntityId,
          linkedRecordType: 'OPPORTUNITY',
          opportunityId: opportunityId || null,
          shareType: link.ShareType,
          visibility: link.Visibility,
        });
        existingLinkSet.add(link.Id);
      }

      if (linksToInsert.length > 0) {
        const result = await batchUpsert('documentLink', linksToInsert, 'salesforceId');
        totalCreated += result.created;
        totalErrors += result.errors;
      }

      totalProcessed += links.totalSize;
    } catch (err) {
      console.error('Error processing opportunity batch:', err.message);
    }

    if ((i + 100) % 1000 === 0 || i + 100 >= oppIds.length) {
      console.log(`  Processed ${Math.min(i + 100, oppIds.length)}/${oppIds.length} opportunities... Created: ${totalCreated}`);
    }
  }

  // Process Contact-linked documents
  console.log('\n─── Processing Contact-linked documents ───');
  const contactIds = Array.from(contactMap.keys()).filter(id => id && id.length > 0 && id.startsWith('003'));
  console.log(`  Total contacts with valid SF IDs: ${contactIds.length}`);
  for (let i = 0; i < contactIds.length; i += 100) {
    const batchIds = contactIds.slice(i, i + 100);
    if (batchIds.length === 0) continue;
    const idList = batchIds.map(id => `'${id}'`).join(',');

    try {
      const links = await conn.query(`
        SELECT Id, ContentDocumentId, LinkedEntityId, ShareType, Visibility
        FROM ContentDocumentLink
        WHERE LinkedEntityId IN (${idList})
      `);

      const linksToInsert = [];
      for (const link of links.records) {
        if (existingLinkSet.has(link.Id)) {
          totalSkipped++;
          continue;
        }

        const documentId = docMap.get(link.ContentDocumentId);
        const contactId = contactMap.get(link.LinkedEntityId);

        if (!documentId) {
          totalSkipped++;
          continue;
        }

        linksToInsert.push({
          salesforceId: link.Id,
          documentId: documentId,
          linkedEntitySalesforceId: link.LinkedEntityId,
          linkedRecordType: 'CONTACT',
          contactId: contactId || null,
          shareType: link.ShareType,
          visibility: link.Visibility,
        });
        existingLinkSet.add(link.Id);
      }

      if (linksToInsert.length > 0) {
        const result = await batchUpsert('documentLink', linksToInsert, 'salesforceId');
        totalCreated += result.created;
        totalErrors += result.errors;
      }

      totalProcessed += links.totalSize;
    } catch (err) {
      console.error('Error processing contact batch:', err.message);
    }

    if ((i + 100) % 1000 === 0 || i + 100 >= contactIds.length) {
      console.log(`  Processed ${Math.min(i + 100, contactIds.length)}/${contactIds.length} contacts... Created: ${totalCreated}`);
    }
  }

  // Process WorkOrder-linked documents
  console.log('\n─── Processing WorkOrder-linked documents ───');
  const woIds = Array.from(woMap.keys()).filter(id => id && id.length > 0 && id.startsWith('0WO'));
  console.log(`  Total work orders with valid SF IDs: ${woIds.length}`);
  for (let i = 0; i < woIds.length; i += 100) {
    const batchIds = woIds.slice(i, i + 100);
    if (batchIds.length === 0) continue;
    const idList = batchIds.map(id => `'${id}'`).join(',');

    try {
      const links = await conn.query(`
        SELECT Id, ContentDocumentId, LinkedEntityId, ShareType, Visibility
        FROM ContentDocumentLink
        WHERE LinkedEntityId IN (${idList})
      `);

      const linksToInsert = [];
      for (const link of links.records) {
        if (existingLinkSet.has(link.Id)) {
          totalSkipped++;
          continue;
        }

        const documentId = docMap.get(link.ContentDocumentId);
        const workOrderId = woMap.get(link.LinkedEntityId);

        if (!documentId) {
          totalSkipped++;
          continue;
        }

        linksToInsert.push({
          salesforceId: link.Id,
          documentId: documentId,
          linkedEntitySalesforceId: link.LinkedEntityId,
          linkedRecordType: 'WORK_ORDER',
          workOrderId: workOrderId || null,
          shareType: link.ShareType,
          visibility: link.Visibility,
        });
        existingLinkSet.add(link.Id);
      }

      if (linksToInsert.length > 0) {
        const result = await batchUpsert('documentLink', linksToInsert, 'salesforceId');
        totalCreated += result.created;
        totalErrors += result.errors;
      }

      totalProcessed += links.totalSize;
    } catch (err) {
      console.error('Error processing workorder batch:', err.message);
    }

    if ((i + 100) % 1000 === 0 || i + 100 >= woIds.length) {
      console.log(`  Processed ${Math.min(i + 100, woIds.length)}/${woIds.length} work orders... Created: ${totalCreated}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('MIGRATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Total Links Processed:', totalProcessed);
  console.log('Total Created:', totalCreated);
  console.log('Total Skipped (existing or no doc):', totalSkipped);
  console.log('Total Errors:', totalErrors);
  console.log('Finished:', new Date().toISOString());

  // Verify the specific job
  console.log('\n─── Verifying Panda Ext-16532 Bao Le ───');
  const testOpp = await prisma.opportunity.findFirst({
    where: { name: { contains: '16532' } },
    select: { id: true, name: true }
  });

  if (testOpp) {
    const testLinks = await prisma.documentLink.findMany({
      where: { opportunityId: testOpp.id },
      include: { document: { select: { title: true, fileType: true } } }
    });
    console.log(`Opportunity: ${testOpp.name}`);
    console.log(`Document Links: ${testLinks.length}`);
    for (const link of testLinks) {
      console.log(`  - ${link.document.title} (${link.document.fileType})`);
    }
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
