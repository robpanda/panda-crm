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
  'isPandaClaims__c',
  'Total_Sales_Volume__c',
  'fw1__Total_Paid_Amount__c',
];

function mapAccountStatus(sfStatus) {
  const statusMap = {
    'Prospect': 'PROSPECT',
    'Active': 'ACTIVE',
    'Onboarding': 'ONBOARDING',
    'In Production': 'IN_PRODUCTION',
    'Completed': 'COMPLETED',
    'Inactive': 'INACTIVE',
    'Closed': 'CLOSED',
  };
  return statusMap[sfStatus] || 'PROSPECT';
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
  return {
    salesforceId: sfAccount.Id,
    name: sfAccount.Name,
    phone: sfAccount.Phone,
    billingStreet: sfAccount.BillingStreet,
    billingCity: sfAccount.BillingCity,
    billingState: sfAccount.BillingState,
    billingPostalCode: sfAccount.BillingPostalCode,
    billingCountry: sfAccount.BillingCountry || 'USA',
    shippingStreet: sfAccount.ShippingStreet,
    shippingCity: sfAccount.ShippingCity,
    shippingState: sfAccount.ShippingState,
    shippingPostalCode: sfAccount.ShippingPostalCode,
    shippingCountry: sfAccount.ShippingCountry,
    website: sfAccount.Website,
    industry: sfAccount.Industry,
    description: sfAccount.Description,
    status: mapAccountStatus(sfAccount.Account_Status__c),
    type: mapAccountType(sfAccount.Type),
    isPandaClaims: sfAccount.isPandaClaims__c || false,
    totalSalesVolume: sfAccount.Total_Sales_Volume__c || 0,
    totalPaidAmount: sfAccount.fw1__Total_Paid_Amount__c || 0,
    sfOwnerId: sfAccount.OwnerId,
    createdAt: new Date(sfAccount.CreatedDate),
    updatedAt: new Date(sfAccount.LastModifiedDate),
  };
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
