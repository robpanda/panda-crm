import { getSalesforceConnection } from './salesforce-client.js';

async function describe() {
  const conn = await getSalesforceConnection();

  // Describe ServiceContract
  console.log('=== ServiceContract fields ===');
  const scMeta = await conn.describe('ServiceContract');
  const scFields = scMeta.fields.filter(f =>
    f.name.includes('Account') || f.name.includes('Opportunity') || f.name === 'Id'
  );
  scFields.forEach(f => console.log(`  ${f.name} (${f.type})`));

  // Describe Commission__c
  console.log('\n=== Commission__c fields ===');
  const commMeta = await conn.describe('Commission__c');
  const commFields = commMeta.fields.filter(f =>
    f.name.includes('Account') ||
    f.name.includes('Opportunity') ||
    f.name.includes('Service_Contract') ||
    f.name.includes('Invoice') ||
    f.name === 'Id' || f.name === 'Name'
  );
  commFields.forEach(f => console.log(`  ${f.name} (${f.type}) - ${f.label}`));
}

describe().catch(console.error);
