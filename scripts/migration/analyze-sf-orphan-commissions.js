#!/usr/bin/env node
/**
 * Analyze orphan commissions in Salesforce to understand their relationships
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, disconnect } from './prisma-client.js';

async function analyze() {
  const conn = await getSalesforceConnection();

  // Get a sample of orphan commission salesforce IDs from PostgreSQL
  console.log('Fetching orphan commission SF IDs from PostgreSQL...');
  const orphans = await prisma.$queryRaw`
    SELECT salesforce_id
    FROM commissions
    WHERE opportunity_id IS NULL AND salesforce_id IS NOT NULL
    LIMIT 50
  `;

  const sfIds = orphans.map(o => o.salesforce_id);
  console.log('Sample SF IDs:', sfIds.slice(0, 5));

  // Query Salesforce for these commissions with all relationship fields
  console.log('\nQuerying Salesforce for commission details...');
  const sfQuery = `
    SELECT Id, Name,
           Service_Contract__c,
           Service_Contract__r.Name,
           Service_Contract__r.AccountId,
           Service_Contract__r.Opportunity__c,
           Invoice__c,
           Customer_Name__c
    FROM Commission__c
    WHERE Id IN ('${sfIds.join("','")}')
    LIMIT 50
  `;

  try {
    const sfResults = await querySalesforce(conn, sfQuery);
    console.log('Found', sfResults.length, 'commissions in SF');

    // Analyze relationships
    let hasContract = 0;
    let hasContractOpp = 0;
    let hasContractAccount = 0;
    let hasInvoice = 0;
    let hasCustomerName = 0;

    console.log('\nSample records:');
    for (const r of sfResults.slice(0, 10)) {
      console.log('---');
      console.log('  SF ID:', r.Id);
      console.log('  Name:', r.Name);
      console.log('  Service_Contract__c:', r.Service_Contract__c || 'NULL');
      console.log('  SC.Opportunity__c:', r.Service_Contract__r?.Opportunity__c || 'NULL');
      console.log('  SC.AccountId:', r.Service_Contract__r?.AccountId || 'NULL');
      console.log('  Invoice__c:', r.Invoice__c || 'NULL');
      console.log('  Customer_Name__c:', r.Customer_Name__c || 'NULL');
    }

    for (const r of sfResults) {
      if (r.Service_Contract__c) hasContract++;
      if (r.Service_Contract__r?.Opportunity__c) hasContractOpp++;
      if (r.Service_Contract__r?.AccountId) hasContractAccount++;
      if (r.Invoice__c) hasInvoice++;
      if (r.Customer_Name__c) hasCustomerName++;
    }

    console.log('\nRelationship analysis (out of', sfResults.length, '):');
    console.log('  Has Service_Contract:', hasContract);
    console.log('  Has SC.Opportunity:', hasContractOpp);
    console.log('  Has SC.Account:', hasContractAccount);
    console.log('  Has Invoice:', hasInvoice);
    console.log('  Has Customer_Name (Account):', hasCustomerName);

  } catch (e) {
    console.log('Error:', e.message);
  }

  await disconnect();
}

analyze().catch(console.error);
