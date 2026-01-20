/**
 * Commission Migration Script
 * Migrates Commission__c records from Salesforce to PostgreSQL
 *
 * Prerequisites:
 * - Accounts must be migrated first (migrate-accounts.js)
 * - ServiceContracts must be migrated first (migrate-contracts.js)
 * - Invoices must be migrated first (migrate-invoices.js)
 * - Users must be migrated first
 *
 * Usage: node migrate-commissions.js [--limit N] [--dry-run]
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, batchUpsert, disconnect } from './prisma-client.js';

// Salesforce fields to query
const COMMISSION_FIELDS = [
  'Id',
  'Name',
  'Commission_Type__c',
  'Status__c',
  'Status_Code__c',
  'Service_Contract__c',
  'Invoice__c',
  'Customer_Name__c',
  'Commission_Name__c',
  'User_Profle__c',
  // Financial fields
  'Commission_Value__c',
  'Contract_Value__c',
  'Commission_Rate__c',
  'Commission_Rate_of_Pay__c',
  'Invoice_Total__c',
  'Paid_Amount__c',
  'Requested_Amount__c',
  'RequestedAmount__c',
  'Collected__c',
  'Payroll_Difference__c',
  // Status flags
  'Commission_Paid__c',
  'Pre_Commission_Paid__c',
  'Keep_the_Cash_Promo__c',
  // Dates
  'Payroll_Update_Date__c',
  'CreatedDate',
  'LastModifiedDate'
];

// Map Salesforce commission type to Prisma CommissionType enum
// Valid enum values: PRE_COMMISSION, BACK_END, SALES_OP, SUPPLEMENT_OVERRIDE,
// PM_COMMISSION, MANAGER_OVERRIDE, REGIONAL_MANAGER_OVERRIDE, DIRECTOR_OVERRIDE,
// EXECUTIVE_OVERRIDE, SALES_FLIP, PAYROLL_ADJUSTMENT, COMPANY_LEAD, SELF_GEN
function mapCommissionType(sfType) {
  const typeMap = {
    'Pre-Commission': 'PRE_COMMISSION',
    'Back-End Commission': 'BACK_END',
    'Company Lead': 'COMPANY_LEAD',
    'Self-Gen': 'SELF_GEN',
    'Manager Override': 'MANAGER_OVERRIDE',
    'Regional Override': 'REGIONAL_MANAGER_OVERRIDE',
    'Supplement Override': 'SUPPLEMENT_OVERRIDE',
    'Sales Op Commission': 'SALES_OP',
    'Draw': 'PAYROLL_ADJUSTMENT',        // Map Draw to PAYROLL_ADJUSTMENT
    'Bonus': 'PAYROLL_ADJUSTMENT',       // Map Bonus to PAYROLL_ADJUSTMENT
    'Adjustment': 'PAYROLL_ADJUSTMENT',
    'PM Commission': 'PM_COMMISSION',
    'Director Override': 'DIRECTOR_OVERRIDE',
    'Executive Override': 'EXECUTIVE_OVERRIDE',
    'Sales Flip': 'SALES_FLIP'
  };
  return typeMap[sfType] || 'BACK_END';  // Default to BACK_END
}

// Map Salesforce status to Prisma CommissionStatus enum
// Valid enum values: NEW, REQUESTED, APPROVED, HOLD, PAID, DENIED
function mapCommissionStatus(sfStatus) {
  const statusMap = {
    'Pending': 'NEW',         // Map Pending to NEW
    'Requested': 'REQUESTED',
    'Approved': 'APPROVED',
    'Paid': 'PAID',
    'Rejected': 'DENIED',     // Map Rejected to DENIED
    'On Hold': 'HOLD',        // Map On Hold to HOLD
    'Canceled': 'DENIED',     // Map Canceled to DENIED
    'New': 'NEW'
  };
  return statusMap[sfStatus] || 'NEW';  // Default to NEW
}

// Transform Salesforce Commission to Prisma format
function transformCommission(sfCommission, accountIdMap, contractIdMap, invoiceIdMap, userIdMap) {
  // Commission_Name__c is a user reference (the person earning the commission)
  const commissionOwnerId = sfCommission.User_Profle__c || sfCommission.Commission_Name__c;
  const resolvedOwnerId = commissionOwnerId ? userIdMap.get(commissionOwnerId) : null;

  // ownerId is REQUIRED - skip record if we can't resolve it
  if (!resolvedOwnerId) {
    return null;
  }

  // Parse financial values (all REQUIRED in schema)
  const commissionValue = sfCommission.Commission_Value__c ? parseFloat(sfCommission.Commission_Value__c) : 0;
  const commissionRate = sfCommission.Commission_Rate__c ? parseFloat(sfCommission.Commission_Rate__c) : 0;
  // commissionAmount = value * rate / 100
  const commissionAmount = (commissionValue * commissionRate) / 100;

  return {
    salesforceId: sfCommission.Id,
    name: sfCommission.Name,
    type: mapCommissionType(sfCommission.Commission_Type__c),  // Field is 'type' not 'commissionType'
    status: mapCommissionStatus(sfCommission.Status__c),

    // Foreign keys - resolve from ID maps
    serviceContractId: sfCommission.Service_Contract__c ? contractIdMap.get(sfCommission.Service_Contract__c) || null : null,
    ownerId: resolvedOwnerId,  // REQUIRED - already validated above
    opportunityId: null,  // Will need to link via serviceContract if needed

    // Financial fields (REQUIRED)
    commissionValue: commissionValue,
    commissionRate: commissionRate,
    commissionAmount: commissionAmount,

    // Optional financial fields
    requestedAmount: (sfCommission.RequestedAmount__c || sfCommission.Requested_Amount__c) ? parseFloat(sfCommission.RequestedAmount__c || sfCommission.Requested_Amount__c) : null,
    paidAmount: sfCommission.Paid_Amount__c ? parseFloat(sfCommission.Paid_Amount__c) : null,

    // Boolean fields
    isCompanyLead: sfCommission.Commission_Type__c === 'Company Lead',
    isSelfGen: sfCommission.Commission_Type__c === 'Self-Gen',

    // Dates
    payroll_update_date: sfCommission.Payroll_Update_Date__c ? new Date(sfCommission.Payroll_Update_Date__c) : null,
    paidDate: sfCommission.Commission_Paid__c ? new Date(sfCommission.LastModifiedDate) : null,

    // Timestamps
    createdAt: sfCommission.CreatedDate ? new Date(sfCommission.CreatedDate) : new Date(),
    updatedAt: sfCommission.LastModifiedDate ? new Date(sfCommission.LastModifiedDate) : new Date()
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

  // Get service contracts
  const contracts = await prisma.serviceContract.findMany({
    select: { id: true, salesforceId: true },
  });
  const contractIdMap = new Map(contracts.map(c => [c.salesforceId, c.id]));
  console.log(`  Loaded ${contractIdMap.size} service contracts`);

  // Get invoices
  const invoices = await prisma.invoice.findMany({
    select: { id: true, salesforceId: true },
  });
  const invoiceIdMap = new Map(invoices.map(i => [i.salesforceId, i.id]));
  console.log(`  Loaded ${invoiceIdMap.size} invoices`);

  // Get users
  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const userIdMap = new Map(users.map(u => [u.salesforceId, u.id]));
  console.log(`  Loaded ${userIdMap.size} users`);

  return { accountIdMap, contractIdMap, invoiceIdMap, userIdMap };
}

// Main migration function
async function migrateCommissions(options = {}) {
  const { limit, dryRun = false } = options;

  console.log('='.repeat(60));
  console.log('COMMISSION MIGRATION');
  console.log('='.repeat(60));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  if (limit) console.log(`Limit: ${limit} records`);
  console.log('');

  try {
    // Connect to Salesforce
    const conn = await getSalesforceConnection();

    // Build ID maps
    const { accountIdMap, contractIdMap, invoiceIdMap, userIdMap } = await buildIdMaps();

    // Build query
    const fields = COMMISSION_FIELDS.join(', ');
    let query = `SELECT ${fields} FROM Commission__c WHERE IsDeleted = false`;
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    console.log('Querying Salesforce for Commission records...');
    const commissions = await querySalesforce(conn, query);
    console.log(`Found ${commissions.length} Commission records`);

    // Transform records (filter out nulls - records without valid owner)
    console.log('Transforming records...');
    const allTransformed = commissions.map(comm =>
      transformCommission(comm, accountIdMap, contractIdMap, invoiceIdMap, userIdMap)
    );
    const transformedRecords = allTransformed.filter(r => r !== null);
    const skippedNoOwner = allTransformed.length - transformedRecords.length;
    console.log(`  Skipped (missing required owner): ${skippedNoOwner}`);

    // Stats
    const withContract = transformedRecords.filter(r => r.serviceContractId).length;
    const withInvoice = transformedRecords.filter(r => r.invoiceId).length;
    const withOwner = transformedRecords.filter(r => r.ownerId).length;
    const paid = transformedRecords.filter(r => r.commissionPaid).length;
    const totalValue = transformedRecords.reduce((sum, r) => sum + (r.commissionValue || 0), 0);

    // Count by type
    const typeCount = {};
    transformedRecords.forEach(r => {
      typeCount[r.commissionType] = (typeCount[r.commissionType] || 0) + 1;
    });

    console.log('');
    console.log('Transformation stats:');
    console.log(`  With Service Contract: ${withContract}/${transformedRecords.length}`);
    console.log(`  With Invoice: ${withInvoice}/${transformedRecords.length}`);
    console.log(`  With Owner: ${withOwner}/${transformedRecords.length}`);
    console.log(`  Paid: ${paid}/${transformedRecords.length}`);
    console.log(`  Total Commission Value: $${totalValue.toLocaleString()}`);
    console.log('');
    console.log('By Commission Type:');
    Object.entries(typeCount).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });
    console.log('');

    if (dryRun) {
      console.log('DRY RUN - Skipping database insert');
      console.log('Sample transformed record:');
      console.log(JSON.stringify(transformedRecords[0], null, 2));
    } else {
      // Upsert records
      console.log('Upserting records to PostgreSQL...');
      await batchUpsert('commission', transformedRecords, 'salesforceId', 100);
      console.log(`Successfully migrated ${transformedRecords.length} commissions`);
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
migrateCommissions(options)
  .then(count => {
    console.log(`\nMigration complete. Processed ${count} records.`);
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

export { migrateCommissions };
