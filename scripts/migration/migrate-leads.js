#!/usr/bin/env node
// Migrate Leads from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const LEAD_FIELDS = [
  'Id',
  'FirstName',
  'LastName',
  'Email',
  'Phone',
  'MobilePhone',
  'Company',
  'Title',
  'Street',
  'City',
  'State',
  'PostalCode',
  'Country',
  'Description',
  'Status',
  'LeadSource',
  'Rating',
  'Industry',
  'OwnerId',
  'IsConverted',
  'ConvertedDate',
  'ConvertedAccountId',
  'ConvertedContactId',
  'ConvertedOpportunityId',
  'CreatedDate',
  'LastModifiedDate',
];

function mapLeadStatus(sfStatus) {
  const statusMap = {
    // New/Not Contacted statuses -> NEW
    'New': 'NEW',
    'Open - Not Contacted': 'NEW',
    'Raw lead': 'NEW',
    'Not Home/No Answer': 'NEW',
    'Not Set': 'NEW',

    // Working/Contacted statuses -> CONTACTED
    'Working - Contacted': 'CONTACTED',
    'Contacted': 'CONTACTED',
    'Working': 'CONTACTED',
    'Lead Not Set': 'CONTACTED',  // Attempted contact but not set

    // Qualified/Set statuses -> QUALIFIED
    'Qualified': 'QUALIFIED',
    'Lead Set': 'QUALIFIED',  // Appointment set = qualified
    'Inspection Scheduled': 'QUALIFIED',
    'Service Agreement': 'QUALIFIED',  // Has agreement = qualified

    // Unqualified/Canceled statuses -> UNQUALIFIED
    'Unqualified': 'UNQUALIFIED',
    'Canceled': 'UNQUALIFIED',
    'Closed - Not Converted': 'UNQUALIFIED',

    // Converted/Completed statuses -> CONVERTED
    'Closed - Converted': 'CONVERTED',
    'Converted': 'CONVERTED',
    'Completed': 'CONVERTED',  // Completed = converted
  };
  return statusMap[sfStatus] || 'NEW';
}

function mapLeadRating(sfRating) {
  const ratingMap = {
    'Hot': 'HOT',
    'Warm': 'WARM',
    'Cold': 'COLD',
  };
  return ratingMap[sfRating] || null;
}

function transformLead(sfLead) {
  // Build lead object with all Salesforce fields mapped to schema fields
  const lead = {
    salesforceId: sfLead.Id,
    firstName: sfLead.FirstName || 'Unknown',
    lastName: sfLead.LastName || 'Lead',
    email: sfLead.Email || undefined,
    phone: sfLead.Phone || undefined,
    mobilePhone: sfLead.MobilePhone || undefined,
    company: sfLead.Company || undefined,
    title: sfLead.Title || undefined,
    street: sfLead.Street || undefined,
    city: sfLead.City || undefined,
    state: sfLead.State || undefined,
    postalCode: sfLead.PostalCode || undefined,
    country: sfLead.Country || undefined,
    description: sfLead.Description || undefined,
    status: mapLeadStatus(sfLead.Status),
    source: sfLead.LeadSource || undefined,
    rating: mapLeadRating(sfLead.Rating),
    industry: sfLead.Industry || undefined,
    isConverted: sfLead.IsConverted || false,
    convertedDate: sfLead.ConvertedDate ? new Date(sfLead.ConvertedDate) : undefined,
    createdAt: new Date(sfLead.CreatedDate),
    updatedAt: new Date(sfLead.LastModifiedDate),
  };

  return lead;
}

async function migrateLeads() {
  console.log('=== Starting Lead Migration ===');

  try {
    // Query Salesforce - only non-converted leads for active migration
    // Include converted for historical record
    const soql = `SELECT ${LEAD_FIELDS.join(', ')} FROM Lead ORDER BY CreatedDate ASC`;
    console.log('Querying Salesforce leads...');

    const sfLeads = await querySalesforce(soql);
    console.log(`Found ${sfLeads.length} leads to migrate`);

    // Transform records
    const leads = sfLeads.map(transformLead);

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const results = await batchUpsert('lead', leads, 'salesforceId', 100);

    console.log('=== Migration Complete ===');
    console.log(`Processed: ${leads.length}`);
    console.log(`Errors: ${results.errors.length}`);

    // Summary stats
    const converted = leads.filter((l) => l.isConverted).length;
    const active = leads.filter((l) => !l.isConverted).length;
    console.log(`Active leads: ${active}`);
    console.log(`Converted leads: ${converted}`);

    if (results.errors.length > 0) {
      console.log('Sample errors:');
      results.errors.slice(0, 5).forEach((e) => {
        console.log(`  - ${e.record.firstName} ${e.record.lastName}: ${e.error}`);
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
  migrateLeads()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migrateLeads, transformLead };
