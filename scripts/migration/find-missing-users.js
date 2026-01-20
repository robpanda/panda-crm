#!/usr/bin/env node
// Find Salesforce users that are owners but not in our CRM

import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

async function findMissingUsers() {
  console.log('=== Finding Missing Users ===');

  const prisma = getPrismaClient();

  // Get existing user salesforce IDs
  const users = await prisma.user.findMany({
    select: { salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const existingUserIds = new Set(users.map((u) => u.salesforceId));
  console.log(`Existing users in CRM: ${existingUserIds.size}`);

  // Query Salesforce for all unique owner IDs from Leads without owner in CRM
  const leadSoql = `SELECT OwnerId, Owner.Name, Owner.Email, Owner.IsActive, COUNT(Id) cnt
                    FROM Lead
                    GROUP BY OwnerId, Owner.Name, Owner.Email, Owner.IsActive
                    ORDER BY COUNT(Id) DESC`;

  const leadOwners = await querySalesforce(leadSoql);

  console.log('\n=== Missing Lead Owners ===');
  let missingCount = 0;
  for (const owner of leadOwners) {
    if (!existingUserIds.has(owner.OwnerId)) {
      console.log(`${owner.Owner?.Name || 'Unknown'} (${owner.Owner?.Email || 'no email'}) - ${owner.cnt} leads - Active: ${owner.Owner?.IsActive}`);
      missingCount++;
      if (missingCount >= 20) {
        console.log('... (showing top 20)');
        break;
      }
    }
  }

  // Query Salesforce for all unique owner IDs from Accounts without owner in CRM
  const accountSoql = `SELECT OwnerId, Owner.Name, Owner.Email, Owner.IsActive, COUNT(Id) cnt
                       FROM Account
                       GROUP BY OwnerId, Owner.Name, Owner.Email, Owner.IsActive
                       ORDER BY COUNT(Id) DESC`;

  const accountOwners = await querySalesforce(accountSoql);

  console.log('\n=== Missing Account Owners ===');
  missingCount = 0;
  for (const owner of accountOwners) {
    if (!existingUserIds.has(owner.OwnerId)) {
      console.log(`${owner.Owner?.Name || 'Unknown'} (${owner.Owner?.Email || 'no email'}) - ${owner.cnt} accounts - Active: ${owner.Owner?.IsActive}`);
      missingCount++;
      if (missingCount >= 20) {
        console.log('... (showing top 20)');
        break;
      }
    }
  }

  await disconnect();
}

findMissingUsers().catch(console.error);
