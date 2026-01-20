import { querySalesforce, getSalesforceConnection } from './salesforce-client.js';

async function checkInvoiceLines() {
  const conn = await getSalesforceConnection();
  
  // Get 5 sample records
  const soql = `SELECT Id, Name, fw1__Invoice__c, fw1__Product__c, fw1__Quantity__c, fw1__Unit_Price__c, fw1__Amount__c, CreatedDate, LastModifiedDate FROM fw1__Invoice_Line__c LIMIT 5`;
  const records = await querySalesforce(soql);
  
  console.log('Sample Invoice Line records:');
  console.log(JSON.stringify(records, null, 2));
}

checkInvoiceLines().catch(console.error);
