#!/usr/bin/env node
// Migrate Invoice Line Items from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const INVOICE_LINE_FIELDS = [
  'Id',
  'Name',
  'fw1__Invoice__c',
  'fw1__Item_Description__c',
  'fw1__Quantity__c',
  'fw1__Unit_Price__c',
  'fw1__Amount__c',
  'fw1__Discount_Amount__c',
  'fw1__Net_Amount__c',
  'CreatedDate',
  'LastModifiedDate',
];

function transformInvoiceLine(sfLine, invoiceIdMap) {
  const invoiceId = invoiceIdMap.get(sfLine.fw1__Invoice__c);

  // Skip lines without a valid invoice mapping
  if (!invoiceId) {
    return null;
  }

  const quantity = sfLine.fw1__Quantity__c ? parseFloat(sfLine.fw1__Quantity__c) : 1;
  const unitPrice = sfLine.fw1__Unit_Price__c ? parseFloat(sfLine.fw1__Unit_Price__c) : 0;
  const totalPrice = sfLine.fw1__Amount__c
    ? parseFloat(sfLine.fw1__Amount__c)
    : quantity * unitPrice;

  return {
    salesforceId: sfLine.Id,
    invoiceId: invoiceId,
    description: sfLine.fw1__Item_Description__c || sfLine.Name || 'Line Item',
    quantity: quantity,
    unitPrice: unitPrice,
    totalPrice: totalPrice,
    createdAt: new Date(sfLine.CreatedDate),
    updatedAt: new Date(sfLine.LastModifiedDate),
  };
}

async function buildIdMaps() {
  const prisma = getPrismaClient();

  const invoices = await prisma.invoice.findMany({
    select: { id: true, salesforceId: true },
  });
  const invoiceIdMap = new Map();
  invoices.forEach((inv) => {
    if (inv.salesforceId) {
      invoiceIdMap.set(inv.salesforceId, inv.id);
    }
  });

  console.log(`Built ID maps: ${invoiceIdMap.size} invoices`);
  return { invoiceIdMap };
}

async function migrateInvoiceLines() {
  console.log('=== Starting Invoice Line Items Migration ===');

  try {
    // Build ID maps first
    const { invoiceIdMap } = await buildIdMaps();

    // Query Salesforce
    const soql = `SELECT ${INVOICE_LINE_FIELDS.join(', ')} FROM fw1__Invoice_Line__c WHERE fw1__Invoice__c != null ORDER BY CreatedDate ASC`;
    console.log('Querying Salesforce invoice line items...');

    const sfLines = await querySalesforce(soql);
    console.log(`Found ${sfLines.length} invoice line items to migrate`);

    // Transform records - filter out nulls (those without valid invoice mapping)
    const lines = sfLines
      .map((line) => transformInvoiceLine(line, invoiceIdMap))
      .filter((line) => line !== null);

    const skippedCount = sfLines.length - lines.length;
    if (skippedCount > 0) {
      console.log(`Skipping ${skippedCount} lines without valid invoice mapping`);
    }

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const results = await batchUpsert('invoiceLineItem', lines, 'salesforceId', 100);

    console.log('=== Migration Complete ===');
    console.log(`Processed: ${lines.length}`);
    console.log(`Errors: ${results.errors.length}`);

    // Financial summary
    const totalAmount = lines.reduce((sum, line) => sum + (line.totalPrice || 0), 0);
    console.log(`\nTotal Line Item Amount: $${totalAmount.toLocaleString()}`);

    if (results.errors.length > 0) {
      console.log('Sample errors:');
      results.errors.slice(0, 5).forEach((e) => {
        console.log(`  - ${e.record.salesforceId}: ${e.error}`);
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
  migrateInvoiceLines()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migrateInvoiceLines, transformInvoiceLine };
