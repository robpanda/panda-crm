#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function populateLists() {
  console.log('Fetching call lists...');

  const lists = await prisma.callList.findMany({
    where: { listType: 'DYNAMIC', isActive: true },
    select: { id: true, name: true, filterCriteria: true, targetObject: true, priority: true }
  });

  console.log('Found', lists.length, 'dynamic lists\n');

  for (const list of lists) {
    console.log('Processing:', list.name);

    try {
      const targetObject = list.targetObject || 'Lead';
      const filterCriteria = typeof list.filterCriteria === 'string'
        ? JSON.parse(list.filterCriteria)
        : list.filterCriteria;

      // Get existing items
      const existingItems = await prisma.callListItem.findMany({
        where: { callListId: list.id },
        select: { leadId: true, opportunityId: true }
      });
      const existingIds = new Set([
        ...existingItems.map(i => i.leadId).filter(Boolean),
        ...existingItems.map(i => i.opportunityId).filter(Boolean)
      ]);

      let newItems = [];

      if (targetObject === 'Lead') {
        const leads = await prisma.lead.findMany({
          where: filterCriteria,
          take: 500
        });

        console.log('  Found', leads.length, 'matching leads');

        for (const lead of leads) {
          if (existingIds.has(lead.id)) continue;
          const phone = lead.mobilePhone || lead.phone;
          if (!phone) continue;

          newItems.push({
            callListId: list.id,
            leadId: lead.id,
            phoneNumber: phone.replace(/\D/g, ''),
            formattedPhone: phone,
            displayName: ((lead.firstName || '') + ' ' + (lead.lastName || '')).trim() || 'Unknown',
            displayAddress: lead.city && lead.state ? `${lead.city}, ${lead.state}` : null,
            displayStatus: lead.status,
            addedReason: 'population_script',
            priority: list.priority,
          });
        }
      } else if (targetObject === 'Opportunity') {
        const opps = await prisma.opportunity.findMany({
          where: filterCriteria,
          include: {
            account: { select: { billingState: true, billingCity: true, phone: true } },
            contact: { select: { phone: true, mobilePhone: true } }
          },
          take: 500
        });

        console.log('  Found', opps.length, 'matching opportunities');

        for (const opp of opps) {
          if (existingIds.has(opp.id)) continue;
          const phone = opp.contact?.mobilePhone || opp.contact?.phone || opp.account?.phone;
          if (!phone) continue;

          newItems.push({
            callListId: list.id,
            opportunityId: opp.id,
            accountId: opp.accountId,
            phoneNumber: phone.replace(/\D/g, ''),
            formattedPhone: phone,
            displayName: opp.name,
            displayAddress: opp.account ? ((opp.account.billingCity || '') + ', ' + (opp.account.billingState || '')).trim() : null,
            displayStatus: opp.stage,
            addedReason: 'population_script',
            priority: list.priority,
          });
        }
      }

      if (newItems.length > 0) {
        await prisma.callListItem.createMany({ data: newItems, skipDuplicates: true });
        console.log('  Added', newItems.length, 'items');
      } else {
        console.log('  No new items to add');
      }

      // Update counts
      const [total, pending] = await Promise.all([
        prisma.callListItem.count({ where: { callListId: list.id } }),
        prisma.callListItem.count({ where: { callListId: list.id, status: 'PENDING' } })
      ]);

      await prisma.callList.update({
        where: { id: list.id },
        data: { lastRefreshedAt: new Date(), totalItems: total, pendingItems: pending }
      });

      console.log('  Total:', total, 'Pending:', pending);

    } catch (err) {
      console.error('  ERROR:', err.message);
    }
  }
}

populateLists().then(() => {
  console.log('\nDone!');
  prisma.$disconnect();
}).catch(err => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
});
