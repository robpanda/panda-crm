#!/usr/bin/env node
// Check record counts in PostgreSQL with owner data

import { getPrismaClient, disconnect } from './prisma-client.js';

async function main() {
  const prisma = getPrismaClient();

  console.log('=== PostgreSQL Record Counts ===');

  // Leads
  const leadsTotal = await prisma.lead.count();
  const leadsWithOwner = await prisma.lead.count({ where: { ownerId: { not: null } } });
  console.log(`Leads: ${leadsTotal} total, ${leadsWithOwner} with owner (${Math.round(leadsWithOwner/leadsTotal*100)}%)`);

  // Accounts
  const accountsTotal = await prisma.account.count();
  const accountsWithOwner = await prisma.account.count({ where: { ownerId: { not: null } } });
  console.log(`Accounts: ${accountsTotal} total, ${accountsWithOwner} with owner (${Math.round(accountsWithOwner/accountsTotal*100)}%)`);

  // Contacts
  const contactsTotal = await prisma.contact.count();
  const contactsWithCreator = await prisma.contact.count({ where: { createdById: { not: null } } });
  console.log(`Contacts: ${contactsTotal} total, ${contactsWithCreator} with createdBy (${Math.round(contactsWithCreator/contactsTotal*100)}%)`);

  // Opportunities
  const oppsTotal = await prisma.opportunity.count();
  const oppsWithOwner = await prisma.opportunity.count({ where: { ownerId: { not: null } } });
  console.log(`Opportunities: ${oppsTotal} total, ${oppsWithOwner} with owner (${Math.round(oppsWithOwner/oppsTotal*100)}%)`);

  // Users
  const usersTotal = await prisma.user.count();
  console.log(`Users: ${usersTotal}`);

  // Tasks
  const tasksTotal = await prisma.task.count();
  const tasksWithAssignee = await prisma.task.count({ where: { assignedToId: { not: null } } });
  console.log(`Tasks: ${tasksTotal} total, ${tasksWithAssignee} with assignee (${Math.round(tasksWithAssignee/tasksTotal*100)}%)`);

  // Events
  const eventsTotal = await prisma.event.count();
  const eventsWithOwner = await prisma.event.count({ where: { ownerId: { not: null } } });
  console.log(`Events: ${eventsTotal} total, ${eventsWithOwner} with owner (${Math.round(eventsWithOwner/eventsTotal*100)}%)`);

  await disconnect();
}

main().catch(console.error);
