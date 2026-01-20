#!/usr/bin/env node
// Migrate Events from Salesforce to PostgreSQL
// Includes owner data for tracking and reporting

import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';

const EVENT_FIELDS = [
  'Id',
  'Subject',
  'Description',
  'Location',
  'StartDateTime',
  'EndDateTime',
  'IsAllDayEvent',
  'IsRecurrence',
  'RecurrenceType',
  'RecurrenceEndDateOnly',
  'OwnerId',               // Event owner (required)
  'WhoId',                 // Contact/Lead ID
  'WhatId',                // Related to (Account, Opportunity, etc.)
  'CreatedDate',
  'LastModifiedDate',
];

// Map Salesforce recurrence type to iCal RRULE format (simplified)
function mapRecurrenceRule(sfRecurrenceType) {
  if (!sfRecurrenceType) return null;
  // This is a simplified mapping - full RRULE conversion would be more complex
  const ruleMap = {
    'RecursDaily': 'FREQ=DAILY',
    'RecursWeekly': 'FREQ=WEEKLY',
    'RecursMonthly': 'FREQ=MONTHLY',
    'RecursYearly': 'FREQ=YEARLY',
    'RecursMonthlyNth': 'FREQ=MONTHLY',
    'RecursEveryWeekday': 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  };
  return ruleMap[sfRecurrenceType] || null;
}

function transformEvent(sfEvent, userIdMap, leadIdMap, opportunityIdMap, accountIdMap, contactIdMap) {
  // Get owner from OwnerId (required field)
  const ownerId = sfEvent.OwnerId ? userIdMap.get(sfEvent.OwnerId) : undefined;

  // Skip events without a valid owner in our system
  if (!ownerId) {
    return null;
  }

  // Determine related records from WhatId (Opportunity, Account, etc.) or WhoId (Contact, Lead)
  let leadId = undefined;
  let opportunityId = undefined;
  let accountId = undefined;
  let contactId = undefined;

  if (sfEvent.WhoId) {
    // WhoId can be Contact (003) or Lead (00Q)
    const prefix = sfEvent.WhoId.substring(0, 3);
    if (prefix === '00Q') {
      leadId = leadIdMap.get(sfEvent.WhoId);
    } else if (prefix === '003') {
      contactId = contactIdMap.get(sfEvent.WhoId);
    }
  }

  if (sfEvent.WhatId) {
    // WhatId can be Account (001), Opportunity (006), etc.
    const prefix = sfEvent.WhatId.substring(0, 3);
    if (prefix === '006') {
      opportunityId = opportunityIdMap.get(sfEvent.WhatId);
    } else if (prefix === '001') {
      accountId = accountIdMap.get(sfEvent.WhatId);
    }
  }

  const event = {
    salesforceId: sfEvent.Id,
    subject: sfEvent.Subject || 'Untitled Event',
    description: sfEvent.Description || undefined,
    location: sfEvent.Location || undefined,
    startDateTime: new Date(sfEvent.StartDateTime),
    endDateTime: new Date(sfEvent.EndDateTime),
    isAllDay: sfEvent.IsAllDayEvent || false,
    isRecurring: sfEvent.IsRecurrence || false,
    recurrenceRule: mapRecurrenceRule(sfEvent.RecurrenceType),
    recurrenceEndDate: sfEvent.RecurrenceEndDateOnly ? new Date(sfEvent.RecurrenceEndDateOnly) : undefined,
    ownerId: ownerId,
    createdAt: new Date(sfEvent.CreatedDate),
    updatedAt: new Date(sfEvent.LastModifiedDate),
  };

  // Add optional foreign keys if valid
  if (leadId) {
    event.leadId = leadId;
  }
  if (opportunityId) {
    event.opportunityId = opportunityId;
  }
  if (accountId) {
    event.accountId = accountId;
  }
  if (contactId) {
    event.contactId = contactId;
  }

  return event;
}

async function buildIdMaps() {
  const prisma = getPrismaClient();

  // Get users
  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const userIdMap = new Map();
  users.forEach((u) => {
    userIdMap.set(u.salesforceId, u.id);
  });

  // Get leads
  const leads = await prisma.lead.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const leadIdMap = new Map();
  leads.forEach((l) => {
    leadIdMap.set(l.salesforceId, l.id);
  });

  // Get opportunities
  const opportunities = await prisma.opportunity.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const opportunityIdMap = new Map();
  opportunities.forEach((o) => {
    opportunityIdMap.set(o.salesforceId, o.id);
  });

  // Get accounts
  const accounts = await prisma.account.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const accountIdMap = new Map();
  accounts.forEach((a) => {
    accountIdMap.set(a.salesforceId, a.id);
  });

  // Get contacts
  const contacts = await prisma.contact.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const contactIdMap = new Map();
  contacts.forEach((c) => {
    contactIdMap.set(c.salesforceId, c.id);
  });

  console.log(`Built ID maps: ${userIdMap.size} users, ${leadIdMap.size} leads, ${opportunityIdMap.size} opportunities, ${accountIdMap.size} accounts, ${contactIdMap.size} contacts`);
  return { userIdMap, leadIdMap, opportunityIdMap, accountIdMap, contactIdMap };
}

async function migrateEvents() {
  console.log('=== Starting Event Migration ===');

  try {
    // Build ID maps first
    const { userIdMap, leadIdMap, opportunityIdMap, accountIdMap, contactIdMap } = await buildIdMaps();

    // Query Salesforce
    const soql = `SELECT ${EVENT_FIELDS.join(', ')} FROM Event ORDER BY CreatedDate ASC`;
    console.log('Querying Salesforce events...');

    const sfEvents = await querySalesforce(soql);
    console.log(`Found ${sfEvents.length} events to migrate`);

    // Transform records - filter out null (no valid owner)
    const allEvents = sfEvents.map((e) => transformEvent(e, userIdMap, leadIdMap, opportunityIdMap, accountIdMap, contactIdMap));
    const events = allEvents.filter((e) => e !== null);
    const skippedCount = allEvents.length - events.length;
    if (skippedCount > 0) {
      console.log(`Skipping ${skippedCount} events without valid owner mapping`);
    }

    // Count with related records
    const withOpportunity = events.filter((e) => e.opportunityId).length;
    const withAccount = events.filter((e) => e.accountId).length;
    const withLead = events.filter((e) => e.leadId).length;
    const withContact = events.filter((e) => e.contactId).length;
    console.log(`Events linked to: Opportunities=${withOpportunity}, Accounts=${withAccount}, Leads=${withLead}, Contacts=${withContact}`);

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const results = await batchUpsert('event', events, 'salesforceId', 100);

    console.log('=== Migration Complete ===');
    console.log(`Processed: ${events.length}`);
    console.log(`Errors: ${results.errors.length}`);

    // All-day vs timed events
    const allDayCount = events.filter((e) => e.isAllDay).length;
    const recurringCount = events.filter((e) => e.isRecurring).length;
    console.log(`All-day events: ${allDayCount}`);
    console.log(`Recurring events: ${recurringCount}`);

    if (results.errors.length > 0) {
      console.log('Sample errors:');
      results.errors.slice(0, 5).forEach((e) => {
        console.log(`  - ${e.record.subject}: ${e.error}`);
      });
    }

    return results;
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  migrateEvents()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migrateEvents, transformEvent };
