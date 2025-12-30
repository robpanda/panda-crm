#!/usr/bin/env node
// Migrate Service Territories from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const SERVICE_TERRITORY_FIELDS = [
  'Id',
  'Name',
  'Description',
  'IsActive',
  'OperatingHours.Name',
  'OperatingHours.TimeZone',
  'Street',
  'City',
  'State',
  'PostalCode',
  'Country',
  'CreatedDate',
  'LastModifiedDate',
];

function transformServiceTerritory(sfTerritory) {
  return {
    salesforceId: sfTerritory.Id,
    name: sfTerritory.Name,
    description: sfTerritory.Description || null,
    isActive: sfTerritory.IsActive,
    city: sfTerritory.City || null,
    state: sfTerritory.State || null,
    postalCodes: sfTerritory.PostalCode ? [sfTerritory.PostalCode] : [],
    createdAt: new Date(sfTerritory.CreatedDate),
    updatedAt: new Date(sfTerritory.LastModifiedDate),
  };
}

async function migrateServiceTerritories() {
  console.log('Starting Service Territory migration...');

  const query = `
    SELECT ${SERVICE_TERRITORY_FIELDS.join(', ')}
    FROM ServiceTerritory
    WHERE IsActive = true
    ORDER BY Name
  `;

  console.log('Fetching Service Territories from Salesforce...');
  const sfTerritories = await querySalesforce(query);
  console.log(`Found ${sfTerritories.length} active Service Territories`);

  // Transform records
  const territories = sfTerritories.map(transformServiceTerritory);

  // Upsert to database
  console.log('Upserting to PostgreSQL...');
  const results = await batchUpsert('serviceTerritory', territories, 'salesforceId', 50);

  console.log('\nMigration Results:');
  console.log(`  Processed: ${results.created}`);
  console.log(`  Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(e => {
      console.log(`  - ${e.record.name}: ${e.error}`);
    });
  }

  // Also migrate operating hours if they exist
  await migrateOperatingHours();

  await disconnect();
  console.log('\nService Territory migration complete!');
}

async function migrateOperatingHours() {
  console.log('\nFetching Operating Hours...');

  const query = `
    SELECT Id, Name, TimeZone
    FROM OperatingHours
  `;

  const sfHours = await querySalesforce(query);
  console.log(`Found ${sfHours.length} Operating Hours records`);

  if (sfHours.length === 0) return;

  const prisma = getPrismaClient();

  for (const hours of sfHours) {
    try {
      await prisma.operatingHours.upsert({
        where: { id: hours.Id },
        update: {
          name: hours.Name,
          timeZone: hours.TimeZone || 'America/New_York',
        },
        create: {
          id: hours.Id,
          name: hours.Name,
          timeZone: hours.TimeZone || 'America/New_York',
        },
      });
    } catch (error) {
      console.error(`Error upserting operating hours ${hours.Name}: ${error.message}`);
    }
  }

  console.log('Operating Hours migrated');
}

migrateServiceTerritories().catch(console.error);
