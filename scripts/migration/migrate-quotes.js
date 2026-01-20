#!/usr/bin/env node
// Migrate Quotes from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const QUOTE_FIELDS = [
  'Id',
  'Name',
  'QuoteNumber',
  'OpportunityId',
  'Status',
  'ExpirationDate',
  'Subtotal',
  'Discount',
  'Tax',
  'GrandTotal',
  'isPM__c',
  'Pricebook2Id',
  'CreatedDate',
  'LastModifiedDate',
];

// Map Salesforce status to Prisma QuoteStatus enum
function mapQuoteStatus(sfStatus) {
  // Valid: DRAFT, NEEDS_REVIEW, IN_REVIEW, APPROVED, REJECTED, ACCEPTED, EXPIRED
  const statusMap = {
    'Draft': 'DRAFT',
    'Needs Review': 'NEEDS_REVIEW',
    'In Review': 'IN_REVIEW',
    'Approved': 'APPROVED',
    'Rejected': 'REJECTED',
    'Presented': 'APPROVED', // Map Presented to APPROVED
    'Accepted': 'ACCEPTED',
    'Denied': 'REJECTED', // Map Denied to REJECTED
    'Expired': 'EXPIRED',
  };
  return statusMap[sfStatus] || 'DRAFT';
}

// Generate quote number if missing
let quoteCounter = 0;
function generateQuoteNumber() {
  quoteCounter++;
  return `QT-MIGRATED-${String(quoteCounter).padStart(6, '0')}`;
}

function transformQuote(sfQuote, opportunityIdMap) {
  const opportunityId = opportunityIdMap.get(sfQuote.OpportunityId) || undefined;

  // Only include fields that exist in the Prisma schema
  const quote = {
    salesforceId: sfQuote.Id,
    quoteNumber: sfQuote.QuoteNumber || generateQuoteNumber(),
    name: sfQuote.Name || 'Unnamed Quote',
    status: mapQuoteStatus(sfQuote.Status),
    expirationDate: sfQuote.ExpirationDate ? new Date(sfQuote.ExpirationDate) : undefined,
    subtotal: sfQuote.Subtotal ? parseFloat(sfQuote.Subtotal) : 0,
    discount: sfQuote.Discount ? parseFloat(sfQuote.Discount) : 0,
    tax: sfQuote.Tax ? parseFloat(sfQuote.Tax) : 0,
    total: sfQuote.GrandTotal ? parseFloat(sfQuote.GrandTotal) : 0,
    isPmQuote: sfQuote.isPM__c || false,
    createdAt: new Date(sfQuote.CreatedDate),
    updatedAt: new Date(sfQuote.LastModifiedDate),
  };

  // Only add opportunityId if we have a valid mapping (required field)
  if (opportunityId) {
    quote.opportunityId = opportunityId;
  }

  return quote;
}

async function buildIdMaps() {
  const prisma = getPrismaClient();

  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true },
  });
  const opportunityIdMap = new Map();
  opportunities.forEach((opp) => {
    if (opp.salesforceId) {
      opportunityIdMap.set(opp.salesforceId, opp.id);
    }
  });

  console.log(`Built ID maps: ${opportunityIdMap.size} opportunities`);
  return { opportunityIdMap };
}

async function migrateQuotes() {
  console.log('=== Starting Quote Migration ===');

  try {
    // Build ID maps first
    const { opportunityIdMap } = await buildIdMaps();

    // Query Salesforce
    const soql = `SELECT ${QUOTE_FIELDS.join(', ')} FROM Quote ORDER BY CreatedDate ASC`;
    console.log('Querying Salesforce quotes...');

    const sfQuotes = await querySalesforce(soql);
    console.log(`Found ${sfQuotes.length} quotes to migrate`);

    // Transform records - filter out those without valid opportunityId (required field)
    const allQuotes = sfQuotes.map((q) => transformQuote(q, opportunityIdMap));
    const quotes = allQuotes.filter((q) => q.opportunityId);
    const skippedCount = allQuotes.length - quotes.length;
    if (skippedCount > 0) {
      console.log(`Skipping ${skippedCount} quotes without valid opportunity mapping`);
    }

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const results = await batchUpsert('quote', quotes, 'salesforceId', 100);

    console.log('=== Migration Complete ===');
    console.log(`Processed: ${quotes.length}`);
    console.log(`Errors: ${results.errors.length}`);

    // Status breakdown
    const statusCounts = {};
    quotes.forEach((q) => {
      statusCounts[q.status] = (statusCounts[q.status] || 0) + 1;
    });
    console.log('Status breakdown:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });

    // Accepted quotes (important metric)
    const acceptedQuotes = quotes.filter((q) => q.status === 'ACCEPTED').length;
    console.log(`\nAccepted quotes: ${acceptedQuotes}`);

    // Total value
    const totalValue = quotes.reduce((sum, q) => sum + (q.total || 0), 0);
    console.log(`Total quote value: $${totalValue.toLocaleString()}`);

    if (results.errors.length > 0) {
      console.log('Sample errors:');
      results.errors.slice(0, 5).forEach((e) => {
        console.log(`  - ${e.record.quoteNumber}: ${e.error}`);
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
  migrateQuotes()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migrateQuotes, transformQuote };
