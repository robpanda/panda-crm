#!/usr/bin/env node
// Migrate Payments from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const PAYMENT_FIELDS = [
  'Id',
  'Name',
  'fw1__Invoice__c',
  'fw1__Status__c',
  'fw1__Amount__c',
  'fw1__Payment_Date__c',
  'fw1__Payment_Method__c',
  'fw1__Reference_Number__c',
  'CreatedDate',
  'LastModifiedDate',
];

// Map Salesforce status to Prisma PaymentStatus enum
function mapPaymentStatus(sfStatus) {
  // Valid: PENDING, PROCESSING, SETTLED, FAILED, REFUNDED, PARTIALLY_REFUNDED
  const statusMap = {
    'Pending': 'PENDING',
    'Processing': 'PROCESSING',
    'Captured': 'SETTLED',
    'Settled': 'SETTLED',
    'Settled Successfully': 'SETTLED',
    'Completed': 'SETTLED',
    'Success': 'SETTLED',
    'Failed': 'FAILED',
    'Declined': 'FAILED',
    'Error': 'FAILED',
    'Refunded': 'REFUNDED',
    'Partial Refund': 'PARTIALLY_REFUNDED',
    'Cancelled': 'FAILED', // Map to FAILED since CANCELLED doesn't exist
    'Canceled': 'FAILED',
    'Voided': 'FAILED',
  };
  return statusMap[sfStatus] || 'SETTLED';
}

// Map Salesforce payment method to Prisma PaymentMethod enum
function mapPaymentMethod(sfMethod) {
  // Valid: CHECK, CREDIT_CARD, ACH, WIRE, CASH, INSURANCE_CHECK, FINANCING
  const methodMap = {
    'Credit Card': 'CREDIT_CARD',
    'CreditCard': 'CREDIT_CARD',
    'Card': 'CREDIT_CARD',
    'ACH': 'ACH',
    'Bank Transfer': 'ACH',
    'EFT': 'ACH',
    'Check': 'CHECK',
    'Cheque': 'CHECK',
    'Cash': 'CASH',
    'Wire': 'WIRE',
    'Wire Transfer': 'WIRE',
    'Insurance Check': 'INSURANCE_CHECK',
    'Financing': 'FINANCING',
  };
  return methodMap[sfMethod] || 'CHECK'; // Default to CHECK instead of OTHER
}

// Generate payment number if missing
let paymentCounter = 0;
function generatePaymentNumber() {
  paymentCounter++;
  return `PAY-MIGRATED-${String(paymentCounter).padStart(6, '0')}`;
}

function transformPayment(sfPayment, invoiceIdMap) {
  const invoiceId = invoiceIdMap.get(sfPayment.fw1__Invoice__c);

  // Skip payments without a valid invoice mapping
  if (!invoiceId) {
    return null;
  }

  const payment = {
    salesforceId: sfPayment.Id,
    paymentNumber: sfPayment.Name || generatePaymentNumber(),
    amount: sfPayment.fw1__Amount__c ? parseFloat(sfPayment.fw1__Amount__c) : 0,
    paymentDate: sfPayment.fw1__Payment_Date__c ? new Date(sfPayment.fw1__Payment_Date__c) : new Date(sfPayment.CreatedDate),
    paymentMethod: mapPaymentMethod(sfPayment.fw1__Payment_Method__c),
    status: mapPaymentStatus(sfPayment.fw1__Status__c),
    referenceNumber: sfPayment.fw1__Reference_Number__c || undefined,
    invoiceId: invoiceId,
    createdAt: new Date(sfPayment.CreatedDate),
    updatedAt: new Date(sfPayment.LastModifiedDate),
  };

  return payment;
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

async function migratePayments() {
  console.log('=== Starting Payment Migration ===');

  try {
    // Build ID maps first
    const { invoiceIdMap } = await buildIdMaps();

    // Query Salesforce
    const soql = `SELECT ${PAYMENT_FIELDS.join(', ')} FROM fw1__Payment__c WHERE fw1__Invoice__c != null ORDER BY CreatedDate ASC`;
    console.log('Querying Salesforce payments...');

    const sfPayments = await querySalesforce(soql);
    console.log(`Found ${sfPayments.length} payments to migrate`);

    // Transform records - filter out nulls (those without valid invoice mapping)
    const payments = sfPayments
      .map((pmt) => transformPayment(pmt, invoiceIdMap))
      .filter((pmt) => pmt !== null);

    const skippedCount = sfPayments.length - payments.length;
    if (skippedCount > 0) {
      console.log(`Skipping ${skippedCount} payments without valid invoice mapping`);
    }

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const results = await batchUpsert('payment', payments, 'salesforceId', 100);

    console.log('=== Migration Complete ===');
    console.log(`Processed: ${payments.length}`);
    console.log(`Errors: ${results.errors.length}`);

    // Status breakdown
    const statusCounts = {};
    payments.forEach((pmt) => {
      statusCounts[pmt.status] = (statusCounts[pmt.status] || 0) + 1;
    });
    console.log('Status breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    // Method breakdown
    const methodCounts = {};
    payments.forEach((pmt) => {
      methodCounts[pmt.paymentMethod] = (methodCounts[pmt.paymentMethod] || 0) + 1;
    });
    console.log('Payment method breakdown:');
    Object.entries(methodCounts).forEach(([method, count]) => {
      console.log(`  ${method}: ${count}`);
    });

    // Financial summary
    const totalAmount = payments.reduce((sum, pmt) => sum + (pmt.amount || 0), 0);
    console.log(`\nTotal Payment Amount: $${totalAmount.toLocaleString()}`);

    if (results.errors.length > 0) {
      console.log('Sample errors:');
      results.errors.slice(0, 5).forEach((e) => {
        console.log(`  - ${e.record.paymentNumber}: ${e.error}`);
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
  migratePayments()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migratePayments, transformPayment };
