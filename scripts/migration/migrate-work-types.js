#!/usr/bin/env node
// Migrate Work Types from Salesforce to PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const WORK_TYPE_FIELDS = [
  'Id',
  'Name',
  'Description',
  'EstimatedDuration', // Duration in minutes
  'DurationType', // Hours, Minutes, Days
  'DurationInMinutes',
  'MinimumCrewSize',
  'RecommendedCrewSize',
];

function transformWorkType(sfWorkType) {
  // Convert duration to minutes
  let estimatedDuration = sfWorkType.EstimatedDuration || 60;
  if (sfWorkType.DurationType === 'Hours') {
    estimatedDuration *= 60;
  } else if (sfWorkType.DurationType === 'Days') {
    estimatedDuration *= 60 * 8; // 8 hour workday
  }

  return {
    salesforceId: sfWorkType.Id,
    name: sfWorkType.Name,
    description: sfWorkType.Description || null,
    estimatedDuration: Math.round(estimatedDuration),
  };
}

async function migrateWorkTypes() {
  console.log('Starting Work Type migration...');

  const query = `
    SELECT ${WORK_TYPE_FIELDS.join(', ')}
    FROM WorkType
    ORDER BY Name
  `;

  console.log('Fetching Work Types from Salesforce...');
  const sfWorkTypes = await querySalesforce(query);
  console.log(`Found ${sfWorkTypes.length} Work Types`);

  // Transform records
  const workTypes = sfWorkTypes.map(transformWorkType);

  // Upsert to database
  console.log('Upserting to PostgreSQL...');
  const results = await batchUpsert('workType', workTypes, 'salesforceId', 50);

  console.log('\nMigration Results:');
  console.log(`  Processed: ${results.created}`);
  console.log(`  Errors: ${results.errors.length}`);

  if (results.errors.length > 0) {
    console.log('\nErrors:');
    results.errors.forEach(e => {
      console.log(`  - ${e.record.name}: ${e.error}`);
    });
  }

  await disconnect();
  console.log('\nWork Type migration complete!');
}

migrateWorkTypes().catch(console.error);
