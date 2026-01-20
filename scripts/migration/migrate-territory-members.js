#!/usr/bin/env node
// Migrate ServiceTerritoryMember relationships from Salesforce to PostgreSQL
// Links Service Resources (Crews) to their assigned Territories
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

const TERRITORY_MEMBER_FIELDS = [
  'Id',
  'ServiceTerritoryId',
  'ServiceResourceId',
  'TerritoryType',
  'EffectiveStartDate',
  'EffectiveEndDate',
];

async function migrateTerritoryMembers() {
  console.log('Starting ServiceTerritoryMember migration...\n');

  const prisma = getPrismaClient();

  // First, get all territories and resources from local DB to map SF IDs
  console.log('Loading existing territories and resources from database...');
  const territories = await prisma.serviceTerritory.findMany({
    select: { id: true, salesforceId: true, name: true },
  });
  const resources = await prisma.serviceResource.findMany({
    select: { id: true, salesforceId: true, name: true },
  });

  const territoryMap = new Map(territories.map(t => [t.salesforceId, t]));
  const resourceMap = new Map(resources.map(r => [r.salesforceId, r]));

  console.log(`  Territories: ${territories.length}`);
  console.log(`  Resources: ${resources.length}`);

  // Query Salesforce for ServiceTerritoryMember records
  const query = `
    SELECT ${TERRITORY_MEMBER_FIELDS.join(', ')}
    FROM ServiceTerritoryMember
    ORDER BY ServiceTerritoryId, ServiceResourceId
  `;

  console.log('\nFetching ServiceTerritoryMember from Salesforce...');
  const sfMembers = await querySalesforce(query);
  console.log(`Found ${sfMembers.length} territory membership records`);

  let created = 0;
  let skipped = 0;
  let errors = [];

  for (const member of sfMembers) {
    const territory = territoryMap.get(member.ServiceTerritoryId);
    const resource = resourceMap.get(member.ServiceResourceId);

    if (!territory) {
      skipped++;
      continue; // Territory not in our DB (maybe inactive)
    }

    if (!resource) {
      skipped++;
      continue; // Resource not in our DB (maybe inactive)
    }

    // Check if membership already exists
    const existing = await prisma.serviceTerritoryMember.findUnique({
      where: {
        territoryId_resourceId: {
          territoryId: territory.id,
          resourceId: resource.id,
        },
      },
    });

    if (existing) {
      skipped++;
      continue;
    }

    try {
      await prisma.serviceTerritoryMember.create({
        data: {
          territoryId: territory.id,
          resourceId: resource.id,
          isPrimary: member.TerritoryType === 'P', // 'P' = Primary, 'S' = Secondary, 'R' = Relocation
          effectiveStartDate: member.EffectiveStartDate ? new Date(member.EffectiveStartDate) : null,
          effectiveEndDate: member.EffectiveEndDate ? new Date(member.EffectiveEndDate) : null,
        },
      });
      created++;

      if (created % 50 === 0) {
        console.log(`  Created ${created} memberships...`);
      }
    } catch (error) {
      errors.push({ territory: territory.name, resource: resource.name, error: error.message });
    }
  }

  console.log('\n='.repeat(50));
  console.log('Migration Results:');
  console.log('='.repeat(50));
  console.log(`  Created: ${created}`);
  console.log(`  Skipped (already exists or missing reference): ${skipped}`);
  console.log(`  Errors: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.slice(0, 10).forEach(e => {
      console.log(`  - ${e.resource} → ${e.territory}: ${e.error}`);
    });
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more errors`);
    }
  }

  // Show summary of territory memberships
  console.log('\nTerritory Membership Summary:');
  const membershipCounts = await prisma.serviceTerritoryMember.groupBy({
    by: ['territoryId'],
    _count: { id: true },
  });

  for (const count of membershipCounts) {
    const territory = territories.find(t => t.id === count.territoryId);
    console.log(`  ${territory?.name || count.territoryId}: ${count._count.id} crews`);
  }

  await disconnect();
  console.log('\nServiceTerritoryMember migration complete!');
}

migrateTerritoryMembers().catch(console.error);
