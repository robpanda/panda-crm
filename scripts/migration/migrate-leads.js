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
    'New': 'NEW',
    'Open - Not Contacted': 'NEW',
    'Working - Contacted': 'CONTACTED',
    'Contacted': 'CONTACTED',
    'Qualified': 'QUALIFIED',
    'Unqualified': 'UNQUALIFIED',
    'Closed - Converted': 'CONVERTED',
    'Converted': 'CONVERTED',
    'Closed - Not Converted': 'UNQUALIFIED',
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
  return {
    salesforceId: sfLead.Id,
    firstName: sfLead.FirstName,
    lastName: sfLead.LastName,
    email: sfLead.Email,
    phone: sfLead.Phone,
    mobilePhone: sfLead.MobilePhone,
    company: sfLead.Company,
    title: sfLead.Title,
    street: sfLead.Street,
    city: sfLead.City,
    state: sfLead.State,
    postalCode: sfLead.PostalCode,
    country: sfLead.Country || 'USA',
    description: sfLead.Description,
    status: mapLeadStatus(sfLead.Status),
    leadSource: sfLead.LeadSource,
    rating: mapLeadRating(sfLead.Rating),
    industry: sfLead.Industry,
    isConverted: sfLead.IsConverted || false,
    convertedDate: sfLead.ConvertedDate ? new Date(sfLead.ConvertedDate) : null,
    sfConvertedAccountId: sfLead.ConvertedAccountId,
    sfConvertedContactId: sfLead.ConvertedContactId,
    sfConvertedOpportunityId: sfLead.ConvertedOpportunityId,
    sfOwnerId: sfLead.OwnerId,
    createdAt: new Date(sfLead.CreatedDate),
    updatedAt: new Date(sfLead.LastModifiedDate),
  };
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
