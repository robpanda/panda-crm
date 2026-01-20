#!/usr/bin/env node
import { getSalesforceConnection } from './salesforce-client.js';

async function describe() {
  const conn = await getSalesforceConnection();
  const meta = await conn.describe('Commission__c');
  console.log('Commission__c fields (reference types):');
  meta.fields.forEach(f => {
    if (f.type === 'reference' || f.name === 'Name' || f.name === 'Id') {
      const refs = f.referenceTo ? f.referenceTo.join(', ') : '-';
      console.log(`  ${f.name} (${f.type}) -> ${refs}`);
    }
  });
  console.log('\nAll fields with Account/Opportunity/Contract/Invoice in name:');
  meta.fields.forEach(f => {
    if (f.name.includes('Account') || f.name.includes('Opportunity') ||
        f.name.includes('Service') || f.name.includes('Invoice') ||
        f.name.includes('Contract') || f.name.includes('Owner')) {
      console.log(`  ${f.name} (${f.type})`);
    }
  });
}
describe().catch(console.error);
