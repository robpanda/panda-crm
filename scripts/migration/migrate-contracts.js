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

import { getSalesforceConnection, queryAllRecords } from './salesforce-client.js';
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
  // Financial fields
  'TotalPrice',
  'Discount',
  'AdditionalDiscount',
  'GrandTotal',
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

// Transform Salesforce ServiceContract to Prisma format
function transformServiceContract(sfContract, accountIdMap, contactIdMap, opportunityIdMap, quoteIdMap, userIdMap) {
  return {
    salesforceId: sfContract.Id,
    name: sfContract.Name,
    contractNumber: sfContract.ContractNumber,
    approvalStatus: mapApprovalStatus(sfContract.ApprovalStatus),
    status: sfContract.Status || null,
    description: sfContract.Description || null,

    // Dates
    startDate: sfContract.StartDate ? new Date(sfContract.StartDate) : null,
    endDate: sfContract.EndDate ? new Date(sfContract.EndDate) : null,
    activationDate: sfContract.ActivationDate ? new Date(sfContract.ActivationDate) : null,
    term: sfContract.Term || null,

    // Foreign keys - resolve from ID maps
    accountId: sfContract.AccountId ? accountIdMap.get(sfContract.AccountId) || null : null,
    contactId: sfContract.ContactId ? contactIdMap.get(sfContract.ContactId) || null : null,
    opportunityId: sfContract.Opportunity__c ? opportunityIdMap.get(sfContract.Opportunity__c) || null : null,
    quoteId: sfContract.Quote__c ? quoteIdMap.get(sfContract.Quote__c) || null : null,
    ownerId: sfContract.OwnerId ? userIdMap.get(sfContract.OwnerId) || null : null,

    // Manager references
    managerId: sfContract.Manager__c ? userIdMap.get(sfContract.Manager__c) || null : null,
    regionalManagerId: sfContract.Regional_Manager__c ? userIdMap.get(sfContract.Regional_Manager__c) || null : null,
    supplementorId: sfContract.Supplementor__c ? userIdMap.get(sfContract.Supplementor__c) || null : null,

    // Store Salesforce IDs for hierarchy (self-referencing)
    parentContractSalesforceId: sfContract.ParentServiceContractId || null,
    rootContractSalesforceId: sfContract.RootServiceContractId || null,

    // Financial fields
    totalPrice: sfContract.TotalPrice ? parseFloat(sfContract.TotalPrice) : null,
    discount: sfContract.Discount ? parseFloat(sfContract.Discount) : null,
    additionalDiscount: sfContract.AdditionalDiscount ? parseFloat(sfContract.AdditionalDiscount) : null,
    grandTotal: sfContract.GrandTotal ? parseFloat(sfContract.GrandTotal) : null,
    salesTotalPrice: sfContract.Sales_Total_Price__c ? parseFloat(sfContract.Sales_Total_Price__c) : null,
    contractGrandTotal: sfContract.Contract_Grand_Total__c ? parseFloat(sfContract.Contract_Grand_Total__c) : null,
    thirtyPercentOfContract: sfContract.X30_of_Contract__c ? parseFloat(sfContract.X30_of_Contract__c) : null,

    // Supplement fields
    supplementsSubtotal: sfContract.Supplements_Subtotal__c ? parseFloat(sfContract.Supplements_Subtotal__c) : null,
    supplementsTotalPrice: sfContract.Supplements_Total_Price__c ? parseFloat(sfContract.Supplements_Total_Price__c) : null,
    sumOfSupplements: sfContract.Sum_of_Supplements__c ? parseFloat(sfContract.Sum_of_Supplements__c) : null,
    supplementsOutstandingTotal: sfContract.Supplements_Outstanding_Total__c ? parseFloat(sfContract.Supplements_Outstanding_Total__c) : null,
    supplementOutstandingTotal: sfContract.Supplement_Outstanding_Total__c ? parseFloat(sfContract.Supplement_Outstanding_Total__c) : null,
    supplementsClosed: sfContract.Supplements_Closed__c ? parseFloat(sfContract.Supplements_Closed__c) : null,
    supplementIncrease: sfContract.Supplement_Increase__c ? parseFloat(sfContract.Supplement_Increase__c) : null,

    // Commission rate fields
    companyLeadRate: sfContract.Company_Lead_Rate__c ? parseFloat(sfContract.Company_Lead_Rate__c) : null,
    selfGenRate: sfContract.Self_Gen_Rate__c ? parseFloat(sfContract.Self_Gen_Rate__c) : null,
    preCommissionRate: sfContract.Pre_Commission_Rate__c ? parseFloat(sfContract.Pre_Commission_Rate__c) : null,
    commissionRate: sfContract.Commission_Rate__c ? parseFloat(sfContract.Commission_Rate__c) : null,
    managerOverride: sfContract.Manager_Override__c ? parseFloat(sfContract.Manager_Override__c) : null,

    // Commission status fields
    preCommissionAmount: sfContract.Pre_Commission_Amount__c ? parseFloat(sfContract.Pre_Commission_Amount__c) : null,
    preCommissionPaid: sfContract.Pre_Commission_Paid__c || false,
    commissionPaid: sfContract.Commission_Paid__c || false,
    backEndCommissionReady: sfContract.Back_End_Commission_Ready__c || false,

    // PC Flip fields
    pcFlipClosedTotal: sfContract.PC_Flip_Closed_Total__c ? parseFloat(sfContract.PC_Flip_Closed_Total__c) : null,
    pcFlipOutstandingTotal: sfContract.PC_Flip_Outstanding_Total__c ? parseFloat(sfContract.PC_Flip_Outstanding_Total__c) : null,
    pcFlipRequestTotal: sfContract.PC_Flip_Request_Total__c ? parseFloat(sfContract.PC_Flip_Request_Total__c) : null,

    // PM flag
    pmContract: sfContract.PM_Contract__c || false,

    // Billing address
    billingStreet: sfContract.BillingStreet || null,
    billingCity: sfContract.BillingCity || null,
    billingState: sfContract.BillingState || null,
    billingPostalCode: sfContract.BillingPostalCode || null,
    billingCountry: sfContract.BillingCountry || null,

    // Shipping address
    shippingStreet: sfContract.ShippingStreet || null,
    shippingCity: sfContract.ShippingCity || null,
    shippingState: sfContract.ShippingState || null,
    shippingPostalCode: sfContract.ShippingPostalCode || null,
    shippingCountry: sfContract.ShippingCountry || null,

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
  const contactIdMap = new Map(contacts.map(c => [c.salesforceId, c.id]));
  console.log(`  Loaded ${contactIdMap.size} contacts`);

  // Get opportunities
  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true },
  });
  const opportunityIdMap = new Map(opportunities.map(o => [o.salesforceId, o.id]));
  console.log(`  Loaded ${opportunityIdMap.size} opportunities`);

  // Get quotes
  const quotes = await prisma.quote.findMany({
    select: { id: true, salesforceId: true },
  });
  const quoteIdMap = new Map(quotes.map(q => [q.salesforceId, q.id]));
  console.log(`  Loaded ${quoteIdMap.size} quotes`);

  // Get users
  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const userIdMap = new Map(users.map(u => [u.salesforceId, u.id]));
  console.log(`  Loaded ${userIdMap.size} users`);

  return { accountIdMap, contactIdMap, opportunityIdMap, quoteIdMap, userIdMap };
}

// Resolve self-referencing hierarchy after initial migration
async function resolveHierarchy() {
  console.log('Resolving contract hierarchy (parent/root references)...');

  // Get all contracts with hierarchy Salesforce IDs
  const contracts = await prisma.serviceContract.findMany({
    select: {
      id: true,
      salesforceId: true,
      parentContractSalesforceId: true,
      rootContractSalesforceId: true,
    },
    where: {
      OR: [
        { parentContractSalesforceId: { not: null } },
        { rootContractSalesforceId: { not: null } },
      ],
    },
  });

  // Build lookup map
  const contractIdMap = new Map(contracts.map(c => [c.salesforceId, c.id]));

  let updated = 0;
  for (const contract of contracts) {
    const parentId = contract.parentContractSalesforceId
      ? contractIdMap.get(contract.parentContractSalesforceId) || null
      : null;
    const rootId = contract.rootContractSalesforceId
      ? contractIdMap.get(contract.rootContractSalesforceId) || null
      : null;

    if (parentId || rootId) {
      await prisma.serviceContract.update({
        where: { id: contract.id },
        data: {
          parentContractId: parentId,
          rootContractId: rootId,
        },
      });
      updated++;
    }
  }

  console.log(`  Updated ${updated} contracts with hierarchy references`);
}

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
    const { accountIdMap, contactIdMap, opportunityIdMap, quoteIdMap, userIdMap } = await buildIdMaps();

    // Build query
    const fields = SERVICE_CONTRACT_FIELDS.join(', ');
    let query = `SELECT ${fields} FROM ServiceContract WHERE IsDeleted = false`;
    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    console.log('Querying Salesforce for ServiceContract records...');
    const contracts = await queryAllRecords(conn, query);
    console.log(`Found ${contracts.length} ServiceContract records`);

    // Transform records
    console.log('Transforming records...');
    const transformedRecords = contracts.map(sc =>
      transformServiceContract(sc, accountIdMap, contactIdMap, opportunityIdMap, quoteIdMap, userIdMap)
    );

    // Stats
    const withAccount = transformedRecords.filter(r => r.accountId).length;
    const withOpportunity = transformedRecords.filter(r => r.opportunityId).length;
    const withQuote = transformedRecords.filter(r => r.quoteId).length;
    const pmContracts = transformedRecords.filter(r => r.pmContract).length;
    const withGrandTotal = transformedRecords.filter(r => r.contractGrandTotal && r.contractGrandTotal > 0).length;

    console.log('');
    console.log('Transformation stats:');
    console.log(`  With Account: ${withAccount}/${transformedRecords.length}`);
    console.log(`  With Opportunity: ${withOpportunity}/${transformedRecords.length}`);
    console.log(`  With Quote: ${withQuote}/${transformedRecords.length}`);
    console.log(`  PM Contracts: ${pmContracts}/${transformedRecords.length}`);
    console.log(`  With Grand Total: ${withGrandTotal}/${transformedRecords.length}`);
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

      // Resolve hierarchy
      await resolveHierarchy();
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
