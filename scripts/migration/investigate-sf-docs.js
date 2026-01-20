import { querySalesforce } from './salesforce-client.js';

async function investigateDocuments() {
  try {
    console.log('=== INVESTIGATING SALESFORCE DOCUMENTS ===\n');
    
    // 1. Check ContentVersion (the actual file version of ContentDocument)
    console.log('1. ContentVersion count:');
    const cvCount = await querySalesforce('SELECT COUNT() FROM ContentVersion');
    console.log(`   Total ContentVersions: ${cvCount.totalSize}\n`);
    
    // 2. Check ContentDocumentLink (links documents to records)
    console.log('2. ContentDocumentLink count:');
    const cdlCount = await querySalesforce('SELECT COUNT() FROM ContentDocumentLink');
    console.log(`   Total ContentDocumentLinks: ${cdlCount.totalSize}\n`);
    
    // 3. Sample ContentDocumentLinks to see what they link to
    console.log('3. ContentDocumentLinks - sample by LinkedEntityId type:');
    const cdlSample = await querySalesforce(`
      SELECT ContentDocumentId, LinkedEntityId, ShareType, Visibility 
      FROM ContentDocumentLink 
      WHERE LinkedEntityId != null 
      LIMIT 100
    `);
    
    // Group by entity prefix (001=Account, 006=Opportunity, etc)
    const prefixCounts = {};
    cdlSample.records.forEach(link => {
      const prefix = link.LinkedEntityId.substring(0, 3);
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    });
    
    console.log('   Entity type distribution (sample of 100):');
    Object.entries(prefixCounts).forEach(([prefix, count]) => {
      const type = 
        prefix === '001' ? 'Account' :
        prefix === '006' ? 'Opportunity' :
        prefix === '003' ? 'Contact' :
        prefix === '005' ? 'User' :
        prefix === 'a1P' ? 'Adobe Sign Agreement' :
        'Unknown';
      console.log(`     ${prefix} (${type}): ${count}`);
    });
    
    // 4. Check Attachments
    console.log('\n4. Attachments (legacy):');
    const attCount = await querySalesforce('SELECT COUNT() FROM Attachment');
    console.log(`   Total Attachments: ${attCount.totalSize}`);
    
    if (attCount.totalSize > 0) {
      const attSample = await querySalesforce(`
        SELECT Id, Name, ParentId, ContentType, BodyLength 
        FROM Attachment 
        LIMIT 10
      `);
      console.log('   Sample Attachments:');
      attSample.records.forEach(att => {
        const parentPrefix = att.ParentId.substring(0, 3);
        const parentType = 
          parentPrefix === '001' ? 'Account' :
          parentPrefix === '006' ? 'Opportunity' :
          parentPrefix === '003' ? 'Contact' :
          'Other';
        console.log(`     - ${att.Name} (${att.ContentType}) -> ${parentType}`);
      });
    }
    
    // 5. Check Files object (Salesforce Files)
    console.log('\n5. ContentDocument (Files):');
    const cdCount = await querySalesforce('SELECT COUNT() FROM ContentDocument');
    console.log(`   Total ContentDocuments: ${cdCount.totalSize}`);
    
    // 6. Get breakdown of ContentDocumentLinks by entity type
    console.log('\n6. Getting full breakdown of ContentDocumentLinks by entity...');
    const allLinks = await querySalesforce(`
      SELECT LinkedEntityId 
      FROM ContentDocumentLink 
      WHERE LinkedEntityId != null
    `);
    
    const allPrefixCounts = {};
    allLinks.records.forEach(link => {
      const prefix = link.LinkedEntityId.substring(0, 3);
      allPrefixCounts[prefix] = (allPrefixCounts[prefix] || 0) + 1;
    });
    
    console.log(`   Total links fetched: ${allLinks.records.length}`);
    console.log('   Distribution by entity type:');
    Object.entries(allPrefixCounts).sort((a, b) => b[1] - a[1]).forEach(([prefix, count]) => {
      const type = 
        prefix === '001' ? 'Account' :
        prefix === '006' ? 'Opportunity' :
        prefix === '003' ? 'Contact' :
        prefix === '005' ? 'User' :
        prefix === '00Q' ? 'Lead' :
        prefix === '500' ? 'Case' :
        prefix === '0WO' ? 'WorkOrder' :
        prefix === 'a1P' ? 'Adobe Sign Agreement' :
        `Unknown (${prefix})`;
      console.log(`     ${type}: ${count}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  }
}

investigateDocuments();
