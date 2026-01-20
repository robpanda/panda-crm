#!/usr/bin/env node
/**
 * Salesforce Schema Discovery Script
 *
 * Queries all Salesforce objects and counts records in each.
 * This helps map Salesforce data to Panda CRM schema.
 */

const jsforce = require('jsforce');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });

async function getSalesforceConnection() {
  const command = new GetSecretValueCommand({ SecretId: 'salesforce-api-credentials' });
  const response = await secretsClient.send(command);
  const secrets = JSON.parse(response.SecretString);

  const conn = new jsforce.Connection({
    instanceUrl: secrets.instance_url || 'https://ability-saas-2460.my.salesforce.com',
  });

  // Use username/password authentication
  await conn.login(
    secrets.username,
    secrets.password + (secrets.security_token || '')
  );

  console.log('Connected to Salesforce:', conn.instanceUrl);
  return conn;
}

async function main() {
  const conn = await getSalesforceConnection();

  const describeGlobal = await conn.describeGlobal();

  // Filter to queryable objects, excluding system objects
  const queryableObjects = describeGlobal.sobjects.filter(obj => {
    const name = obj.name;
    return obj.queryable &&
      name.indexOf('__History') === -1 &&
      name.indexOf('__Feed') === -1 &&
      name.indexOf('__Share') === -1 &&
      name.indexOf('__ChangeEvent') === -1 &&
      name.indexOf('__Tag') === -1 &&
      name.indexOf('AI') !== 0;
  });

  console.log('Checking', queryableObjects.length, 'queryable objects...\n');

  const results = [];

  for (let i = 0; i < queryableObjects.length; i++) {
    const obj = queryableObjects[i];
    try {
      const countResult = await conn.query('SELECT COUNT() FROM ' + obj.name);
      if (countResult.totalSize > 0) {
        results.push({
          name: obj.name,
          label: obj.label,
          count: countResult.totalSize,
          custom: obj.custom
        });
      }
      // Progress indicator
      if ((i + 1) % 50 === 0) {
        process.stdout.write(`  Checked ${i + 1}/${queryableObjects.length} objects...\r`);
      }
    } catch (e) {
      // Some objects may not be accessible, skip them
    }
  }

  // Sort by record count descending
  results.sort((a, b) => b.count - a.count);

  console.log('\n');
  console.log('SALESFORCE OBJECTS WITH DATA');
  console.log('='.repeat(75));
  console.log('Object Name'.padEnd(45) + 'Records'.padStart(12) + '  Custom');
  console.log('-'.repeat(75));

  for (const r of results) {
    console.log(
      r.name.padEnd(45) +
      r.count.toLocaleString().padStart(12) +
      '  ' + (r.custom ? 'Yes' : '')
    );
  }

  console.log('-'.repeat(75));
  const totalRecords = results.reduce((sum, r) => sum + r.count, 0);
  console.log('Total: ' + results.length + ' objects with ' + totalRecords.toLocaleString() + ' records');

  // Output grouped by category
  console.log('\n\nOBJECTS BY CATEGORY:');
  console.log('='.repeat(75));

  const standardCRM = results.filter(r => ['Account', 'Contact', 'Lead', 'Opportunity', 'Case', 'Task', 'Event', 'Campaign', 'CampaignMember'].includes(r.name));
  const fsl = results.filter(r => ['WorkOrder', 'WorkOrderLineItem', 'ServiceAppointment', 'ServiceResource', 'ServiceTerritory', 'AssignedResource', 'ResourceAbsence', 'Shift', 'ServiceTerritoryMember', 'OperatingHours', 'WorkType'].includes(r.name));
  const quotes = results.filter(r => ['Quote', 'QuoteLineItem', 'Order', 'OrderItem', 'Product2', 'PricebookEntry', 'Pricebook2'].includes(r.name));
  const customObjects = results.filter(r => r.custom && r.name.endsWith('__c'));

  console.log('\n-- Standard CRM Objects --');
  for (const r of standardCRM) {
    console.log('  ' + r.name.padEnd(40) + r.count.toLocaleString().padStart(12));
  }

  console.log('\n-- Field Service (FSL) Objects --');
  for (const r of fsl) {
    console.log('  ' + r.name.padEnd(40) + r.count.toLocaleString().padStart(12));
  }

  console.log('\n-- Quotes & Products --');
  for (const r of quotes) {
    console.log('  ' + r.name.padEnd(40) + r.count.toLocaleString().padStart(12));
  }

  console.log('\n-- Custom Objects --');
  for (const r of customObjects.slice(0, 30)) { // Top 30 custom objects
    console.log('  ' + r.name.padEnd(40) + r.count.toLocaleString().padStart(12));
  }
  if (customObjects.length > 30) {
    console.log('  ... and ' + (customObjects.length - 30) + ' more custom objects');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
