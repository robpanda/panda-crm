#!/usr/bin/env node
// Migrate Invoices from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const INVOICE_FIELDS = [
  'Id',
  'Name',
  'fw1__Account__c',
  'fw1__Opportunity__c',
  'Service_Contract__c',
  'fw1__Status__c',
  'fw1__Invoice_Date__c',
  'fw1__Due_Date__c',
  'fw1__Terms__c',
  // Financial fields
  'fw1__Total_Invoice_Amount__c',
  'fw1__Balance_Due__c',
  'fw1__Total_Paid_Amount__c',
  'fw1__Tax_Amount__c',
  'fw1__Net_Amount__c',
  // Custom fields
  'PM_Invoice__c',
  'CreatedDate',
  'LastModifiedDate',
];

// Map Salesforce status to Prisma InvoiceStatus enum
function mapInvoiceStatus(sfStatus) {
  // Valid: DRAFT, PENDING, SENT, PARTIAL, PAID, OVERDUE, VOID
  const statusMap = {
    'Draft': 'DRAFT',
    'Open': 'PENDING',
    'Sent': 'SENT',
    'Overdue': 'OVERDUE',
    'Paid': 'PAID',
    'Partially Paid': 'PARTIAL',
    'Canceled': 'VOID',
    'Void': 'VOID',
    'Written Off': 'VOID',
  };
  return statusMap[sfStatus] || 'DRAFT';
}

// Generate invoice number if missing
let invoiceCounter = 0;
function generateInvoiceNumber() {
  invoiceCounter++;
  return `INV-MIGRATED-${String(invoiceCounter).padStart(6, '0')}`;
}

function transformInvoice(sfInvoice, accountIdMap, opportunityIdMap, contractIdMap) {
  const accountId = accountIdMap.get(sfInvoice.fw1__Account__c) || undefined;
  const opportunityId = opportunityIdMap.get(sfInvoice.fw1__Opportunity__c) || undefined;
  const serviceContractId = contractIdMap.get(sfInvoice.Service_Contract__c) || undefined;

  // Only include fields that exist in the Prisma schema
  const invoice = {
    salesforceId: sfInvoice.Id,
    invoiceNumber: sfInvoice.Name || generateInvoiceNumber(),
    status: mapInvoiceStatus(sfInvoice.fw1__Status__c),
    invoiceDate: sfInvoice.fw1__Invoice_Date__c ? new Date(sfInvoice.fw1__Invoice_Date__c) : undefined,
    dueDate: sfInvoice.fw1__Due_Date__c ? new Date(sfInvoice.fw1__Due_Date__c) : undefined,
    terms: sfInvoice.fw1__Terms__c ? parseInt(sfInvoice.fw1__Terms__c) : 30,
    subtotal: sfInvoice.fw1__Net_Amount__c ? parseFloat(sfInvoice.fw1__Net_Amount__c) : 0,
    tax: sfInvoice.fw1__Tax_Amount__c ? parseFloat(sfInvoice.fw1__Tax_Amount__c) : 0,
    total: sfInvoice.fw1__Total_Invoice_Amount__c ? parseFloat(sfInvoice.fw1__Total_Invoice_Amount__c) : 0,
    amountPaid: sfInvoice.fw1__Total_Paid_Amount__c ? parseFloat(sfInvoice.fw1__Total_Paid_Amount__c) : 0,
    balanceDue: sfInvoice.fw1__Balance_Due__c ? parseFloat(sfInvoice.fw1__Balance_Due__c) : 0,
    isPmInvoice: sfInvoice.PM_Invoice__c || false,
    createdAt: new Date(sfInvoice.CreatedDate),
    updatedAt: new Date(sfInvoice.LastModifiedDate),
  };

  // Only add foreign keys if we have valid mappings
  if (accountId) {
    invoice.accountId = accountId;
  }
  if (opportunityId) {
    invoice.opportunityId = opportunityId;
  }
  if (serviceContractId) {
    invoice.serviceContractId = serviceContractId;
  }

  return invoice;
}

async function buildIdMaps() {
  const prisma = getPrismaClient();

  const accounts = await prisma.account.findMany({
    select: { id: true, salesforceId: true },
  });
  const accountIdMap = new Map();
  accounts.forEach((acc) => {
    if (acc.salesforceId) {
      accountIdMap.set(acc.salesforceId, acc.id);
    }
  });

  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true },
  });
  const opportunityIdMap = new Map();
  opportunities.forEach((opp) => {
    if (opp.salesforceId) {
      opportunityIdMap.set(opp.salesforceId, opp.id);
    }
  });

  // Service Contracts may not exist yet - create empty map if table doesn't exist
  let contractIdMap = new Map();
  try {
    const contracts = await prisma.serviceContract.findMany({
      select: { id: true, salesforceId: true },
    });
    contracts.forEach((c) => {
      if (c.salesforceId) {
        contractIdMap.set(c.salesforceId, c.id);
      }
    });
  } catch (e) {
    console.log('  Service contracts table not available, skipping contract mapping');
  }

  console.log(`Built ID maps: ${accountIdMap.size} accounts, ${opportunityIdMap.size} opportunities, ${contractIdMap.size} contracts`);
  return { accountIdMap, opportunityIdMap, contractIdMap };
}

async function migrateInvoices() {
  console.log('=== Starting Invoice Migration ===');

  try {
    // Build ID maps first
    const { accountIdMap, opportunityIdMap, contractIdMap } = await buildIdMaps();

    // Query Salesforce
    const soql = `SELECT ${INVOICE_FIELDS.join(', ')} FROM fw1__Invoice__c ORDER BY CreatedDate ASC`;
    console.log('Querying Salesforce invoices...');

    const sfInvoices = await querySalesforce(soql);
    console.log(`Found ${sfInvoices.length} invoices to migrate`);

    // Transform records - filter out those without valid accountId (required field)
    const allInvoices = sfInvoices.map((inv) => transformInvoice(inv, accountIdMap, opportunityIdMap, contractIdMap));
    const invoices = allInvoices.filter((inv) => inv.accountId);
    const skippedCount = allInvoices.length - invoices.length;
    if (skippedCount > 0) {
      console.log(`Skipping ${skippedCount} invoices without valid account mapping`);
    }

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const results = await batchUpsert('invoice', invoices, 'salesforceId', 100);

    console.log('=== Migration Complete ===');
    console.log(`Processed: ${invoices.length}`);
    console.log(`Errors: ${results.errors.length}`);

    // Status breakdown
    const statusCounts = {};
    invoices.forEach((inv) => {
      statusCounts[inv.status] = (statusCounts[inv.status] || 0) + 1;
    });
    console.log('Status breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    // Financial summary
    const totalBilled = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalPaid = invoices.reduce((sum, inv) => sum + (inv.amountPaid || 0), 0);
    const totalBalance = invoices.reduce((sum, inv) => sum + (inv.balanceDue || 0), 0);
    console.log('\nFinancial Summary:');
    console.log(`  Total Billed: $${totalBilled.toLocaleString()}`);
    console.log(`  Total Paid: $${totalPaid.toLocaleString()}`);
    console.log(`  Total Balance Due: $${totalBalance.toLocaleString()}`);

    if (results.errors.length > 0) {
      console.log('Sample errors:');
      results.errors.slice(0, 5).forEach((e) => {
        console.log(`  - ${e.record.invoiceNumber}: ${e.error}`);
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
  migrateInvoices()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migrateInvoices, transformInvoice };
