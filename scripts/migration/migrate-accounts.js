#!/usr/bin/env node
// Migrate Accounts from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const ACCOUNT_FIELDS = [
  'Id',
  'Name',
  'Phone',
  'BillingStreet',
  'BillingCity',
  'BillingState',
  'BillingPostalCode',
  'BillingCountry',
  'ShippingStreet',
  'ShippingCity',
  'ShippingState',
  'ShippingPostalCode',
  'ShippingCountry',
  'Website',
  'Industry',
  'Description',
  'OwnerId',
  'CreatedDate',
  'LastModifiedDate',
  'Account_Status__c',
  'Type',
  'isSureClaims__c',
  'Total_Job_Value__c',
  'fw1__Total_Paid_Amount__c',
];

function mapAccountStatus(sfStatus) {
  // Valid AccountStatus values: NEW, ACTIVE, ONBOARDING, IN_PRODUCTION, COMPLETED, INACTIVE
  const statusMap = {
    'Prospect': 'NEW',
    'Active': 'ACTIVE',
    'Onboarding': 'ONBOARDING',
    'In Production': 'IN_PRODUCTION',
    'Completed': 'COMPLETED',
    'Inactive': 'INACTIVE',
    'Closed': 'INACTIVE',
  };
  return statusMap[sfStatus] || 'NEW';
}

function mapAccountType(sfType) {
  const typeMap = {
    'Insurance': 'INSURANCE',
    'Retail': 'RETAIL',
    'Commercial': 'COMMERCIAL',
    'Residential': 'RESIDENTIAL',
  };
  return typeMap[sfType] || 'RESIDENTIAL';
}

function transformAccount(sfAccount) {
  // Build account object with all Salesforce fields mapped to schema fields
  const account = {
    salesforceId: sfAccount.Id,
    name: sfAccount.Name || 'Unnamed Account',
    phone: sfAccount.Phone || undefined,
    billingStreet: sfAccount.BillingStreet || undefined,
    billingCity: sfAccount.BillingCity || undefined,
    billingState: sfAccount.BillingState || undefined,
    billingPostalCode: sfAccount.BillingPostalCode || undefined,
    billingCountry: sfAccount.BillingCountry || undefined,
    shippingStreet: sfAccount.ShippingStreet || undefined,
    shippingCity: sfAccount.ShippingCity || undefined,
    shippingState: sfAccount.ShippingState || undefined,
    shippingPostalCode: sfAccount.ShippingPostalCode || undefined,
    shippingCountry: sfAccount.ShippingCountry || undefined,
    website: sfAccount.Website || undefined,
    industry: sfAccount.Industry || undefined,
    description: sfAccount.Description || undefined,
    status: mapAccountStatus(sfAccount.Account_Status__c),
    type: mapAccountType(sfAccount.Type),
    isPandaClaims: sfAccount.isSureClaims__c || false,
    totalSalesVolume: sfAccount.Total_Job_Value__c || undefined,
    totalPaidAmount: sfAccount.fw1__Total_Paid_Amount__c || undefined,
    createdAt: new Date(sfAccount.CreatedDate),
    updatedAt: new Date(sfAccount.LastModifiedDate),
  };

  return account;
}

async function migrateAccounts() {
  console.log('=== Starting Account Migration ===');

  try {
    // Query Salesforce
    const soql = `SELECT ${ACCOUNT_FIELDS.join(', ')} FROM Account ORDER BY CreatedDate ASC`;
    console.log('Querying Salesforce accounts...');

    const sfAccounts = await querySalesforce(soql);
    console.log(`Found ${sfAccounts.length} accounts to migrate`);

    // Transform records
    const accounts = sfAccounts.map(transformAccount);

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const results = await batchUpsert('account', accounts, 'salesforceId', 100);

    console.log('=== Migration Complete ===');
    console.log(`Processed: ${accounts.length}`);
    console.log(`Errors: ${results.errors.length}`);

    if (results.errors.length > 0) {
      console.log('Sample errors:');
      results.errors.slice(0, 5).forEach((e) => {
        console.log(`  - ${e.record.name}: ${e.error}`);
      });
    }

    return results;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateAccounts()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migrateAccounts, transformAccount };
