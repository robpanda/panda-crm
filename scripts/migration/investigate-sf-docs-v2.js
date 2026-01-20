import { querySalesforce, bulkQuery } from './salesforce-client.js';

async function investigateDocuments() {
  try {
    console.log('=== INVESTIGATING SALESFORCE DOCUMENTS ===\n');

    // 1. Check ContentDocument (Files)
    console.log('1. ContentDocument (Files):');
    const cdResult = await querySalesforce('SELECT COUNT() FROM ContentDocument');
    console.log(`   Total ContentDocuments: ${cdResult.totalSize}`);

    if (cdResult.totalSize > 0) {
      const cdSample = await querySalesforce(`
        SELECT Id, Title, FileType, FileExtension, ContentSize, CreatedDate
        FROM ContentDocument
        ORDER BY CreatedDate DESC
        LIMIT 10
      `);
      console.log('   Recent files:');
      cdSample.records.forEach(doc => {
        console.log(`     - ${doc.Title}.${doc.FileExtension} (${doc.FileType}, ${(doc.ContentSize/1024).toFixed(1)}KB)`);
      });
    }

    // 2. Check Attachments (legacy)
    console.log('\n2. Attachments (legacy):');
    const attResult = await querySalesforce('SELECT COUNT() FROM Attachment');
    console.log(`   Total Attachments: ${attResult.totalSize}`);

    if (attResult.totalSize > 0) {
      const attSample = await querySalesforce(`
        SELECT Id, Name, ParentId, ContentType, BodyLength
        FROM Attachment
        ORDER BY CreatedDate DESC
        LIMIT 10
      `);
      console.log('   Recent attachments:');
      attSample.records.forEach(att => {
        const parentPrefix = att.ParentId?.substring(0, 3) || 'N/A';
        const parentType =
          parentPrefix === '001' ? 'Account' :
          parentPrefix === '006' ? 'Opportunity' :
          parentPrefix === '003' ? 'Contact' :
          parentPrefix === '500' ? 'Case' :
          'Other';
        console.log(`     - ${att.Name} (${att.ContentType}, ${(att.BodyLength/1024).toFixed(1)}KB) on ${parentType}`);
      });
    }

    // 3. To see what's linked to Accounts/Opportunities, query from those objects
    console.log('\n3. Documents linked to Accounts:');
    const acctWithDocs = await querySalesforce(`
      SELECT Id, Name,
        (SELECT ContentDocumentId, ContentDocument.Title, ContentDocument.FileExtension
         FROM ContentDocumentLinks
         LIMIT 3)
      FROM Account
      WHERE Id IN (
        SELECT LinkedEntityId FROM ContentDocumentLink WHERE LinkedEntityId LIKE '001%'
      )
      LIMIT 5
    `);

    console.log(`   Found ${acctWithDocs.totalSize} Accounts with documents`);
    acctWithDocs.records.forEach(acc => {
      if (acc.ContentDocumentLinks && acc.ContentDocumentLinks.records) {
        console.log(`   ${acc.Name}: ${acc.ContentDocumentLinks.records.length} files`);
        acc.ContentDocumentLinks.records.forEach(link => {
          console.log(`     - ${link.ContentDocument.Title}.${link.ContentDocument.FileExtension}`);
        });
      }
    });

    // 4. Documents linked to Opportunities
    console.log('\n4. Documents linked to Opportunities:');
    const oppWithDocs = await querySalesforce(`
      SELECT Id, Name,
        (SELECT ContentDocumentId, ContentDocument.Title, ContentDocument.FileExtension
         FROM ContentDocumentLinks
         LIMIT 3)
      FROM Opportunity
      WHERE Id IN (
        SELECT LinkedEntityId FROM ContentDocumentLink WHERE LinkedEntityId LIKE '006%'
      )
      LIMIT 5
    `);

    console.log(`   Found ${oppWithDocs.totalSize} Opportunities with documents`);
    oppWithDocs.records.forEach(opp => {
      if (opp.ContentDocumentLinks && opp.ContentDocumentLinks.records) {
        console.log(`   ${opp.Name}: ${opp.ContentDocumentLinks.records.length} files`);
        opp.ContentDocumentLinks.records.forEach(link => {
          console.log(`     - ${link.ContentDocument.Title}.${link.ContentDocument.FileExtension}`);
        });
      }
    });

    // 5. Get total counts of what we've migrated vs what exists
    console.log('\n5. SUMMARY:');
    console.log(`   ContentDocuments in Salesforce: ${cdResult.totalSize}`);
    console.log(`   Attachments in Salesforce: ${attResult.totalSize}`);
    console.log(`   Accounts with documents: ${acctWithDocs.totalSize}`);
    console.log(`   Opportunities with documents: ${oppWithDocs.totalSize}`);

  } catch (error) {
    console.error('Error:', error.message);
  }
}

investigateDocuments();
