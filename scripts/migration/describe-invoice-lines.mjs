import { getSalesforceConnection } from './salesforce-client.js';

async function describeInvoiceLines() {
  const conn = await getSalesforceConnection();
  
  const metadata = await conn.sobject('fw1__Invoice_Line__c').describe();
  
  console.log('Invoice Line fields:');
  metadata.fields.forEach(f => {
    if (!f.name.endsWith('__c') || f.name.startsWith('fw1__')) {
      console.log(`  ${f.name} (${f.type})`);
    }
  });
}

describeInvoiceLines().catch(console.error);
