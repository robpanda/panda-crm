#!/usr/bin/env node
// Update converted leads with their Account/Contact/Job (Opportunity) links
// The original migration didn't map these fields

import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

async function updateConvertedLeadLinks() {
  console.log('=== Updating Converted Lead Links ===');

  const prisma = getPrismaClient();

  // Get all converted leads from Salesforce with their links
  console.log('Querying Salesforce for converted leads with links...');
  const sfLeads = await querySalesforce(`
    SELECT Id, ConvertedAccountId, ConvertedContactId, ConvertedOpportunityId
    FROM Lead
    WHERE IsConverted = true
    AND ConvertedAccountId != null
  `);
  console.log(`Found ${sfLeads.length} converted leads with Account links`);

  // Build lookup maps for Account, Contact, Opportunity salesforceId -> id
  console.log('Building lookup maps...');

  const accounts = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true }
  });
  const accountMap = new Map(accounts.map(a => [a.salesforceId, a.id]));
  console.log(`  Accounts: ${accountMap.size}`);

  const contacts = await prisma.contact.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true }
  });
  const contactMap = new Map(contacts.map(c => [c.salesforceId, c.id]));
  console.log(`  Contacts: ${contactMap.size}`);

  const opportunities = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true }
  });
  const opportunityMap = new Map(opportunities.map(o => [o.salesforceId, o.id]));
  console.log(`  Jobs (Opportunities): ${opportunityMap.size}`);

  // Update leads in batches
  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (let i = 0; i < sfLeads.length; i++) {
    const sfLead = sfLeads[i];

    // Look up the lead by Salesforce ID
    const lead = await prisma.lead.findFirst({
      where: { salesforceId: sfLead.Id },
      select: { id: true }
    });

    if (!lead) {
      notFound++;
      continue;
    }

    // Map Salesforce IDs to Panda CRM IDs
    const convertedAccountId = sfLead.ConvertedAccountId ? accountMap.get(sfLead.ConvertedAccountId) : null;
    const convertedContactId = sfLead.ConvertedContactId ? contactMap.get(sfLead.ConvertedContactId) : null;
    const convertedOpportunityId = sfLead.ConvertedOpportunityId ? opportunityMap.get(sfLead.ConvertedOpportunityId) : null;

    // Skip if no links can be resolved
    if (!convertedAccountId && !convertedContactId && !convertedOpportunityId) {
      skipped++;
      continue;
    }

    // Update the lead
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        convertedAccountId: convertedAccountId || undefined,
        convertedContactId: convertedContactId || undefined,
        convertedOpportunityId: convertedOpportunityId || undefined,
        updatedAt: new Date()
      }
    });

    updated++;

    if ((i + 1) % 500 === 0) {
      console.log(`Processed ${i + 1}/${sfLeads.length} - Updated: ${updated}, Skipped: ${skipped}, Not Found: ${notFound}`);
    }
  }

  console.log('\n=== Update Complete ===');
  console.log(`Total processed: ${sfLeads.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (no resolvable links): ${skipped}`);
  console.log(`Lead not found in DB: ${notFound}`);

  await disconnect();
}

updateConvertedLeadLinks().catch(console.error);
