#!/usr/bin/env node
// Update owner data on Leads that are missing it

import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

async function updateLeadOwners() {
  console.log('=== Updating Lead Owners ===');

  const prisma = getPrismaClient();

  // Get user ID map
  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const userIdMap = new Map();
  users.forEach((u) => {
    userIdMap.set(u.salesforceId, u.id);
  });
  console.log(`Loaded ${userIdMap.size} users`);

  // Get leads without owner
  const leadsWithoutOwner = await prisma.lead.findMany({
    select: { id: true, salesforceId: true },
    where: {
      salesforceId: { not: null },
      ownerId: null,
    },
  });
  console.log(`Found ${leadsWithoutOwner.length} leads without owner`);

  if (leadsWithoutOwner.length === 0) {
    console.log('All leads have owners assigned!');
    await disconnect();
    return;
  }

  // Get salesforce IDs to query
  const sfIds = leadsWithoutOwner.map((l) => l.salesforceId);

  // Query Salesforce for owner data in batches
  const batchSize = 200;
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < sfIds.length; i += batchSize) {
    const batch = sfIds.slice(i, i + batchSize);
    const idList = batch.map((id) => `'${id}'`).join(',');
    const soql = `SELECT Id, OwnerId FROM Lead WHERE Id IN (${idList})`;

    try {
      const sfLeads = await querySalesforce(soql);

      for (const sfLead of sfLeads) {
        const ownerId = userIdMap.get(sfLead.OwnerId);
        if (ownerId) {
          await prisma.lead.updateMany({
            where: { salesforceId: sfLead.Id },
            data: { ownerId: ownerId, updatedAt: new Date() },
          });
          updated++;
        } else {
          skipped++;
        }
      }

      console.log(`Processed ${Math.min(i + batchSize, sfIds.length)}/${sfIds.length} - Updated: ${updated}, Skipped (no user): ${skipped}`);
    } catch (error) {
      console.error(`Error processing batch: ${error.message}`);
    }
  }

  console.log('=== Update Complete ===');
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (owner not in system): ${skipped}`);

  await disconnect();
}

updateLeadOwners().catch(console.error);
