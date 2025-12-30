#!/usr/bin/env node
// Migrate Service Resources (Crews/Technicians) from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const SERVICE_RESOURCE_FIELDS = [
  'Id',
  'Name',
  'ResourceType',
  'IsActive',
  'RelatedRecord.Email',
  'RelatedRecord.Phone',
  'RelatedRecord.Name',
  'Description',
  'CreatedDate',
  'LastModifiedDate',
];

function mapResourceType(sfType) {
  const typeMap = {
    'T': 'TECHNICIAN',
    'C': 'CREW',
    'D': 'DISPATCHER',
    'A': 'AGENT',
  };
  return typeMap[sfType] || 'TECHNICIAN';
}

function transformServiceResource(sfResource) {
  return {
    salesforceId: sfResource.Id,
    name: sfResource.Name,
    resourceType: mapResourceType(sfResource.ResourceType),
    isActive: sfResource.IsActive,
    email: sfResource.RelatedRecord?.Email || null,
    phone: sfResource.RelatedRecord?.Phone || null,
    createdAt: new Date(sfResource.CreatedDate),
    updatedAt: new Date(sfResource.LastModifiedDate),
  };
}

async function migrateServiceResources() {
  console.log('Starting Service Resource migration...');

  const query = `
    SELECT ${SERVICE_RESOURCE_FIELDS.join(', ')}
    FROM ServiceResource
    WHERE IsActive = true
    ORDER BY Name
  `;

  console.log('Fetching Service Resources from Salesforce...');
  const sfResources = await querySalesforce(query);
  console.log(`Found ${sfResources.length} active Service Resources`);

  // Transform records
  const resources = sfResources.map(transformServiceResource);

  // Upsert to database
  console.log('Upserting to PostgreSQL...');
  const results = await batchUpsert('serviceResource', resources, 'salesforceId', 50);

  console.log('\nMigration Results:');
  console.log(`  Processed: ${results.created}`);
  console.log(`  Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.slice(0, 5).forEach(e => {
      console.log(`  - ${e.record.name}: ${e.error}`);
    });
    if (results.errors.length > 5) {
      console.log(`  ... and ${results.errors.length - 5} more errors`);
    }
  }

  await disconnect();
  console.log('\nService Resource migration complete!');
}

migrateServiceResources().catch(console.error);
