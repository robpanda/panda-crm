import { getSalesforceConnection } from './salesforce-client.js';

async function describeAdobeSign() {
  const conn = await getSalesforceConnection();
  const meta = await conn.describe('echosign_dev1__SIGN_Agreement__c');
  
  console.log('Adobe Sign Agreement Fields:');
  meta.fields
    .filter(f => f.name.startsWith('echosign') || ['Id', 'Name', 'OwnerId', 'CreatedDate', 'LastModifiedDate'].includes(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(f => console.log(`  ${f.name}: ${f.type}`));
}

describeAdobeSign().catch(console.error);
