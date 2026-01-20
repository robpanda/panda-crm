/**
 * Service Contract Migration Script
 * Migrates ServiceContract records from Salesforce to PostgreSQL
 *
 * Prerequisites:
 * - Accounts must be migrated first (migrate-accounts.js)
 * - Contacts must be migrated first (migrate-contacts.js)
 * - Opportunities must be migrated first (migrate-opportunities.js)
 * - Quotes must be migrated first (migrate-quotes.js)
 *
 * Usage: node migrate-contracts.js [--limit N] [--dry-run]
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, batchUpsert, disconnect } from './prisma-client.js';

// Salesforce fields to query
const SERVICE_CONTRACT_FIELDS = [
  'Id',
  'Name',
  'ContractNumber',
  'AccountId',
  'ContactId',
  'Opportunity__c',
  'Quote__c',
  'ApprovalStatus',
  'Status',
  'Description',
  'StartDate',
  'EndDate',
  'Term',
  'ActivationDate',
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
  // Financial fields (custom fields only - standard financial fields not on ServiceContract)
  // Note: TotalPrice, Discount, AdditionalDiscount, GrandTotal are NOT standard ServiceContract fields
  'Sales_Total_Price__c',
  'Contract_Grand_Total__c',
  'X30_of_Contract__c',
  // Supplement fields
  'Supplements_Subtotal__c',
  'Supplements_Total_Price__c',
  'Sum_of_Supplements__c',
  'Supplements_Outstanding_Total__c',
  'Supplement_Outstanding_Total__c',
  'Supplements_Closed__c',
  'Supplement_Increase__c',
  'Supplementor__c',
  // Commission fields
  'Company_Lead_Rate__c',
  'Self_Gen_Rate__c',
  'Pre_Commission_Rate__c',
  'Commission_Rate__c',
  'Pre_Commission_Amount__c',
  'Pre_Commission_Paid__c',
  'Commission_Paid__c',
  'Back_End_Commission_Ready__c',
  // PC Flip fields
  'PC_Flip_Closed_Total__c',
  'PC_Flip_Outstanding_Total__c',
  'PC_Flip_Request_Total__c',
  // Hierarchy fields
  'ParentServiceContractId',
  'RootServiceContractId',
  'Manager__c',
  'Regional_Manager__c',
  'Manager_Override__c',
  'PM_Contract__c',
  'OwnerId',
  'CreatedDate',
  'LastModifiedDate'
];

// Map Salesforce approval status to Prisma ApprovalStatus enum
function mapApprovalStatus(sfStatus) {
  const statusMap = {
    'Draft': 'DRAFT',
    'Pending': 'PENDING',
    'In Review': 'IN_REVIEW',
    'Approved': 'APPROVED',
    'Rejected': 'REJECTED',
    'Activated': 'ACTIVATED',
    'Expired': 'EXPIRED',
    'Canceled': 'CANCELED'
  };
  return statusMap[sfStatus] || 'DRAFT';
}

// Map Salesforce Status to Prisma ContractStatus enum
function mapContractStatus(sfStatus) {
  const statusMap = {
    'Draft': 'DRAFT',
    'In Approval Process': 'PENDING_APPROVAL',
    'Activated': 'ACTIVE',
    'Expired': 'EXPIRED',
    'Terminated': 'TERMINATED',
    'Canceled': 'CANCELLED'
  };
  return statusMap[sfStatus] || 'DRAFT';
}

// Transform Salesforce ServiceContract to Prisma format
// Note: This schema has REQUIRED fields: contractNumber, name, contractTotal, opportunityId, accountId
function transformServiceContract(sfContract, accountIdMap, opportunityIdMap, userIdMap) {
  // Resolve required foreign keys
  const accountId = sfContract.AccountId ? accountIdMap.get(sfContract.AccountId) : null;
  const opportunityId = sfContract.Opportunity__c ? opportunityIdMap.get(sfContract.Opportunity__c) : null;

  // Skip records without required foreign keys
  if (!accountId || !opportunityId) {
    return null;
  }

  return {
    salesforceId: sfContract.Id,
    name: sfContract.Name || 'Unnamed Contract',
    contractNumber: sfContract.ContractNumber,
    status: mapContractStatus(sfContract.Status),

    // Dates
    startDate: sfContract.StartDate ? new Date(sfContract.StartDate) : null,
    endDate: sfContract.EndDate ? new Date(sfContract.EndDate) : null,

    // Required foreign keys
    accountId: accountId,
    opportunityId: opportunityId,
    ownerId: sfContract.OwnerId ? userIdMap.get(sfContract.OwnerId) || null : null,

    // Manager references
    managerId: sfContract.Manager__c ? userIdMap.get(sfContract.Manager__c) || null : null,
    regionalManagerId: sfContract.Regional_Manager__c ? userIdMap.get(sfContract.Regional_Manager__c) || null : null,

    // Financial fields - contractTotal is REQUIRED
    contractTotal: sfContract.Contract_Grand_Total__c ? parseFloat(sfContract.Contract_Grand_Total__c) : 0,
    salesTotalPrice: sfContract.Sales_Total_Price__c ? parseFloat(sfContract.Sales_Total_Price__c) : null,
    supplementsClosedTotal: sfContract.Supplements_Closed__c ? parseFloat(sfContract.Supplements_Closed__c) : null,

    // Commission rate fields
    companyLeadRate: sfContract.Company_Lead_Rate__c ? parseFloat(sfContract.Company_Lead_Rate__c) : null,
    selfGenRate: sfContract.Self_Gen_Rate__c ? parseFloat(sfContract.Self_Gen_Rate__c) : null,
    preCommissionRate: sfContract.Pre_Commission_Rate__c ? parseFloat(sfContract.Pre_Commission_Rate__c) : null,
    commissionRate: sfContract.Commission_Rate__c ? parseFloat(sfContract.Commission_Rate__c) : null,
    managerOverride: sfContract.Manager_Override__c ? parseFloat(sfContract.Manager_Override__c) : null,

    // Booleans
    backEndCommissionReady: sfContract.Back_End_Commission_Ready__c || false,
    isPmContract: sfContract.PM_Contract__c || false,
    x5050Split: false,
    supplementsCommissionable: false,

    // Timestamps
    createdAt: sfContract.CreatedDate ? new Date(sfContract.CreatedDate) : new Date(),
    updatedAt: sfContract.LastModifiedDate ? new Date(sfContract.LastModifiedDate) : new Date()
  };
}

// Build ID maps for foreign key resolution
async function buildIdMaps() {
  console.log('Building ID maps for foreign key resolution...');

  // Get accounts
  const accounts = await prisma.account.findMany({
    select: { id: true, salesforceId: true },
  });
  const accountIdMap = new Map(accounts.map(a => [a.salesforceId, a.id]));
  console.log(`  Loaded ${accountIdMap.size} accounts`);

  // Get contacts
  const contacts = await prisma.contact.findMany({
    select: { id: true, salesforceId: true },
  });
  // Get opportunities - required for ServiceContract
  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true },
  });
  const opportunityIdMap = new Map(opportunities.map(o => [o.salesforceId, o.id]));
  console.log(`  Loaded ${opportunityIdMap.size} opportunities`);

  // Get users
  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const userIdMap = new Map(users.map(u => [u.salesforceId, u.id]));
  console.log(`  Loaded ${userIdMap.size} users`);

  return { accountIdMap, opportunityIdMap, userIdMap };
}

// Note: Contract hierarchy (parent/root references) not supported in current schema
// The resolveHierarchy function was removed - schema doesn't have parentContractSalesforceId or rootContractSalesforceId fields

// Main migration function
async function migrateServiceContracts(options = {}) {
  const { limit, dryRun = false } = options;

  console.log('='.repeat(60));
  console.log('SERVICE CONTRACT MIGRATION');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  if (limit) console.log(`Limit: ${limit} records`);
  console.log('');

  try {
    // Connect to Salesforce
    const conn = await getSalesforceConnection();

    // Build ID maps
    const { accountIdMap, opportunityIdMap, userIdMap } = await buildIdMaps();

    // Build query
    const fields = SERVICE_CONTRACT_FIELDS.join(', ');
    let query = `SELECT ${fields} FROM ServiceContract WHERE IsDeleted = false`;
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    console.log('Querying Salesforce for ServiceContract records...');
    const contracts = await querySalesforce(conn, query);
    console.log(`Found ${contracts.length} ServiceContract records`);

    // Transform records (returns null for records missing required fields)
    console.log('Transforming records...');
    const allTransformed = contracts.map(sc =>
      transformServiceContract(sc, accountIdMap, opportunityIdMap, userIdMap)
    );

    // Filter out null records (those missing required accountId or opportunityId)
    const transformedRecords = allTransformed.filter(r => r !== null);
    const skippedCount = allTransformed.length - transformedRecords.length;

    // Stats
    const pmContracts = transformedRecords.filter(r => r.isPmContract).length;
    const withContractTotal = transformedRecords.filter(r => r.contractTotal && r.contractTotal > 0).length;

    console.log('');
    console.log('Transformation stats:');
    console.log(`  Total from Salesforce: ${contracts.length}`);
    console.log(`  Valid records: ${transformedRecords.length}`);
    console.log(`  Skipped (missing required opportunity/account): ${skippedCount}`);
    console.log(`  PM Contracts: ${pmContracts}/${transformedRecords.length}`);
    console.log(`  With Contract Total > 0: ${withContractTotal}/${transformedRecords.length}`);
    console.log('');

    if (dryRun) {
      console.log('DRY RUN - Skipping database insert');
      console.log('Sample transformed record:');
      console.log(JSON.stringify(transformedRecords[0], null, 2));
    } else {
      // Upsert records
      console.log('Upserting records to PostgreSQL...');
      await batchUpsert('serviceContract', transformedRecords, 'salesforceId', 100);
      console.log(`Successfully migrated ${transformedRecords.length} service contracts`);

      // Note: resolveHierarchy() removed - schema doesn't support parent/root contract references
    }

    return transformedRecords.length;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

// Run if called directly
const options = parseArgs();
migrateServiceContracts(options)
  .then(count => {
    console.log(`\nMigration complete. Processed ${count} records.`);
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

export { migrateServiceContracts };
