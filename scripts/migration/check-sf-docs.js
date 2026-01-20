import { getSalesforceConnection } from './salesforce-client.js';

async function main() {
  const conn = await getSalesforceConnection();
  
  const accountSfId = '001Ps00000mkXAQIA2';
  const oppSfId = '006Ps00000U4LeIIAV';
  
  console.log('\n=== Checking Salesforce Documents for Account:', accountSfId);
  console.log('=== and Opportunity:', oppSfId);
  
  // Check ContentDocumentLinks for this account
  const accountLinks = await conn.query(`
    SELECT Id, ContentDocumentId, LinkedEntityId, ShareType, Visibility
    FROM ContentDocumentLink 
    WHERE LinkedEntityId = '${accountSfId}'
  `);
  console.log('\n=== ContentDocumentLinks for Account ===');
  console.log('Count:', accountLinks.totalSize);
  
  // Check ContentDocumentLinks for this opportunity
  const oppLinks = await conn.query(`
    SELECT Id, ContentDocumentId, LinkedEntityId, ShareType, Visibility
    FROM ContentDocumentLink 
    WHERE LinkedEntityId = '${oppSfId}'
  `);
  console.log('\n=== ContentDocumentLinks for Opportunity ===');
  console.log('Count:', oppLinks.totalSize);
  if (oppLinks.totalSize > 0) {
    console.log('Sample documents:');
    for (const link of oppLinks.records.slice(0, 10)) {
      // Get the document title
      const doc = await conn.query(`
        SELECT Id, Title, FileType, ContentSize 
        FROM ContentDocument 
        WHERE Id = '${link.ContentDocumentId}'
      `);
      if (doc.records.length > 0) {
        console.log('  -', doc.records[0].Title, '|', doc.records[0].FileType, '| Size:', doc.records[0].ContentSize);
      }
    }
  }
  
  // Also check Adobe Sign agreements
  const adobeAgreements = await conn.query(`
    SELECT Id, Name, echosign_dev1__Agreement_Type__c, echosign_dev1__Status__c,
           echosign_dev1__Account__c, echosign_dev1__Opportunity__c
    FROM echosign_dev1__SIGN_Agreement__c
    WHERE echosign_dev1__Account__c = '${accountSfId}'
    OR echosign_dev1__Opportunity__c = '${oppSfId}'
  `);
  console.log('\n=== Adobe Sign Agreements ===');
  console.log('Count:', adobeAgreements.totalSize);
  if (adobeAgreements.totalSize > 0) {
    console.log('Agreements:');
    for (const agr of adobeAgreements.records.slice(0, 5)) {
      console.log('  -', agr.Name, '| Status:', agr.echosign_dev1__Status__c);
    }
  }
  
  // Get total ContentDocumentLink count
  const totalLinks = await conn.query(`SELECT COUNT(Id) cnt FROM ContentDocumentLink`);
  console.log('\n=== Total ContentDocumentLinks in Salesforce ===');
  console.log('Count:', totalLinks.records[0].cnt);
}

main().catch(console.error);
