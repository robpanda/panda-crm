#!/usr/bin/env node
/**
 * Refresh Call Lists Script
 * - Removes items that no longer match the filter criteria
 * - Adds new items that match
 * - Updates counts
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function refreshLists() {
  console.log('Fetching call lists...\n');

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

      if (!filterCriteria) {
        console.log('  Skipping - no filter criteria');
        continue;
      }

      // Get current matching records
      let matchingIds = new Set();

      if (targetObject === 'Lead') {
        const leads = await prisma.lead.findMany({
          where: filterCriteria,
          select: { id: true },
          take: 1000
        });
        matchingIds = new Set(leads.map(l => l.id));
        console.log('  Found', leads.length, 'matching leads');
      } else if (targetObject === 'Opportunity') {
        const opps = await prisma.opportunity.findMany({
          where: filterCriteria,
          select: { id: true },
          take: 1000
        });
        matchingIds = new Set(opps.map(o => o.id));
        console.log('  Found', opps.length, 'matching opportunities');
      }

      // Get existing items
      const existingItems = await prisma.callListItem.findMany({
        where: { callListId: list.id },
        select: { id: true, leadId: true, opportunityId: true }
      });

      // Find items to remove (no longer match)
      const itemsToRemove = existingItems.filter(item => {
        const recordId = item.leadId || item.opportunityId;
        return !matchingIds.has(recordId);
      });

      // Remove non-matching items
      if (itemsToRemove.length > 0) {
        await prisma.callListItem.deleteMany({
          where: { id: { in: itemsToRemove.map(i => i.id) } }
        });
        console.log('  Removed', itemsToRemove.length, 'non-matching items');
      }

      // Get updated existing IDs
      const currentIds = new Set(existingItems
        .filter(i => !itemsToRemove.includes(i))
        .map(i => i.leadId || i.opportunityId)
        .filter(Boolean));

      // Find new items to add
      let newItems = [];

      if (targetObject === 'Lead') {
        const leads = await prisma.lead.findMany({
          where: {
            ...filterCriteria,
            id: { notIn: Array.from(currentIds) }
          },
          take: 500
        });

        for (const lead of leads) {
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
            addedReason: 'refresh_script',
            priority: list.priority,
          });
        }
      } else if (targetObject === 'Opportunity') {
        const opps = await prisma.opportunity.findMany({
          where: {
            ...filterCriteria,
            id: { notIn: Array.from(currentIds) }
          },
          include: {
            account: { select: { billingState: true, billingCity: true, phone: true } },
            contact: { select: { phone: true, mobilePhone: true } }
          },
          take: 500
        });

        for (const opp of opps) {
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
            addedReason: 'refresh_script',
            priority: list.priority,
          });
        }
      }

      if (newItems.length > 0) {
        await prisma.callListItem.createMany({ data: newItems, skipDuplicates: true });
        console.log('  Added', newItems.length, 'new items');
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

      console.log('  Total:', total, 'Pending:', pending, '\n');

    } catch (err) {
      console.error('  ERROR:', err.message, '\n');
    }
  }
}

refreshLists().then(() => {
  console.log('Done!');
  prisma.$disconnect();
}).catch(err => {
  console.error('Fatal error:', err);
  prisma.$disconnect();
});
