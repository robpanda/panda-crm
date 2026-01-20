#!/usr/bin/env node
// Migrate Emails from Salesforce EmailMessage to Activity table
// Creates Activity records with type EMAIL_SENT or EMAIL_RECEIVED

import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

const EMAIL_FIELDS = [
  'Id',
  'ParentId',           // Related record (Opportunity, Account, Case, etc.)
  'ActivityId',         // Associated Activity record if any
  'ToAddress',
  'FromAddress',
  'FromName',
  'CcAddress',
  'BccAddress',
  'Subject',
  'TextBody',
  'HtmlBody',
  'Status',             // 0=New, 1=Read, 2=Replied, 3=Sent, 4=Forwarded, 5=Draft
  'Incoming',           // true=received, false=sent
  'IsDeleted',
  'CreatedDate',
  'MessageDate',
  'LastModifiedDate',
  'RelatedToId',        // Another way to track related record
];

// Salesforce Email Status codes
const EMAIL_STATUS_MAP = {
  0: 'NEW',
  1: 'READ',
  2: 'REPLIED',
  3: 'SENT',
  4: 'FORWARDED',
  5: 'DRAFT',
};

async function buildIdMaps(prisma) {
  console.log('Building ID maps...');

  // Get users
  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true, email: true },
    where: { salesforceId: { not: null } },
  });
  const userIdMap = new Map();
  const userEmailMap = new Map();
  users.forEach((u) => {
    userIdMap.set(u.salesforceId, u.id);
    if (u.email) {
      userEmailMap.set(u.email.toLowerCase(), u.id);
    }
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
    select: { id: true, salesforceId: true, email: true },
    where: { salesforceId: { not: null } },
  });
  const contactIdMap = new Map();
  const contactEmailMap = new Map();
  contacts.forEach((c) => {
    contactIdMap.set(c.salesforceId, c.id);
    if (c.email) {
      contactEmailMap.set(c.email.toLowerCase(), c.id);
    }
  });

  // Get leads
  const leads = await prisma.lead.findMany({
    select: { id: true, salesforceId: true, email: true },
    where: { salesforceId: { not: null } },
  });
  const leadIdMap = new Map();
  const leadEmailMap = new Map();
  leads.forEach((l) => {
    leadIdMap.set(l.salesforceId, l.id);
    if (l.email) {
      leadEmailMap.set(l.email.toLowerCase(), l.id);
    }
  });

  // Get cases
  const cases = await prisma.case.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const caseIdMap = new Map();
  cases.forEach((c) => {
    caseIdMap.set(c.salesforceId, c.id);
  });

  console.log(`Built ID maps: ${userIdMap.size} users, ${opportunityIdMap.size} opportunities, ${accountIdMap.size} accounts, ${contactIdMap.size} contacts, ${leadIdMap.size} leads`);
  return { userIdMap, userEmailMap, opportunityIdMap, accountIdMap, contactIdMap, contactEmailMap, leadIdMap, leadEmailMap, caseIdMap };
}

function getRelatedIds(sfEmail, maps) {
  const { opportunityIdMap, accountIdMap, contactIdMap, leadIdMap, caseIdMap } = maps;

  let opportunityId = undefined;
  let accountId = undefined;
  let contactId = undefined;
  let leadId = undefined;

  // Check ParentId (primary related record)
  const parentId = sfEmail.ParentId || sfEmail.RelatedToId;
  if (parentId) {
    const prefix = parentId.substring(0, 3);
    switch (prefix) {
      case '006': // Opportunity
        opportunityId = opportunityIdMap.get(parentId);
        break;
      case '001': // Account
        accountId = accountIdMap.get(parentId);
        break;
      case '003': // Contact
        contactId = contactIdMap.get(parentId);
        break;
      case '00Q': // Lead
        leadId = leadIdMap.get(parentId);
        break;
      case '500': // Case
        // Could add caseId if Activity model supports it
        break;
    }
  }

  return { opportunityId, accountId, contactId, leadId };
}

function transformEmail(sfEmail, maps) {
  const { userEmailMap, contactEmailMap, leadEmailMap } = maps;

  // Determine if sent or received
  const type = sfEmail.Incoming ? 'EMAIL_RECEIVED' : 'EMAIL_SENT';

  // Get related record IDs
  const { opportunityId, accountId, contactId, leadId } = getRelatedIds(sfEmail, maps);

  // Try to find user ID from FromAddress for sent emails
  let userId = undefined;
  if (!sfEmail.Incoming && sfEmail.FromAddress) {
    userId = userEmailMap.get(sfEmail.FromAddress.toLowerCase());
  }

  // Get external info for received emails
  let externalEmail = sfEmail.Incoming ? sfEmail.FromAddress : sfEmail.ToAddress;
  let externalName = sfEmail.Incoming ? sfEmail.FromName : undefined;

  // Try to find contact/lead from email address
  let resolvedContactId = contactId;
  let resolvedLeadId = leadId;
  if (externalEmail && !resolvedContactId && !resolvedLeadId) {
    const emailLower = externalEmail.toLowerCase();
    resolvedContactId = contactEmailMap.get(emailLower);
    if (!resolvedContactId) {
      resolvedLeadId = leadEmailMap.get(emailLower);
    }
  }

  const activity = {
    type,
    subType: sfEmail.Incoming ? 'INBOUND' : 'OUTBOUND',
    subject: sfEmail.Subject || undefined,
    body: sfEmail.TextBody || undefined,
    bodyHtml: sfEmail.HtmlBody || undefined,
    status: EMAIL_STATUS_MAP[sfEmail.Status] || undefined,
    sourceId: sfEmail.Id,
    sourceType: 'SALESFORCE',
    externalEmail,
    externalName,
    metadata: {
      toAddress: sfEmail.ToAddress,
      fromAddress: sfEmail.FromAddress,
      ccAddress: sfEmail.CcAddress,
      bccAddress: sfEmail.BccAddress,
      activityId: sfEmail.ActivityId,
    },
    occurredAt: sfEmail.MessageDate ? new Date(sfEmail.MessageDate) : new Date(sfEmail.CreatedDate),
    createdAt: new Date(sfEmail.CreatedDate),
  };

  // Add optional foreign keys
  if (opportunityId) activity.opportunityId = opportunityId;
  if (accountId) activity.accountId = accountId;
  if (resolvedContactId) activity.contactId = resolvedContactId;
  if (resolvedLeadId) activity.leadId = resolvedLeadId;
  if (userId) activity.userId = userId;

  return activity;
}

async function migrateEmails(options = {}) {
  const { dryRun = false, limit = 0 } = options;
  console.log('=== Starting Email Migration ===');
  if (dryRun) console.log('*** DRY RUN - No data will be written ***');

  const prisma = getPrismaClient();

  try {
    // Build ID maps first
    const maps = await buildIdMaps(prisma);

    // Query Salesforce
    let soql = `SELECT ${EMAIL_FIELDS.join(', ')} FROM EmailMessage WHERE IsDeleted = false ORDER BY CreatedDate ASC`;
    if (limit > 0) {
      soql += ` LIMIT ${limit}`;
    }
    console.log('Querying Salesforce emails...');

    const sfEmails = await querySalesforce(soql);
    console.log(`Found ${sfEmails.length} emails to migrate`);

    if (sfEmails.length === 0) {
      console.log('No emails found to migrate.');
      return { created: 0, skipped: 0, errors: [] };
    }

    // Transform records
    const activities = sfEmails.map((e) => transformEmail(e, maps));

    // Count stats
    const sentCount = activities.filter((a) => a.type === 'EMAIL_SENT').length;
    const receivedCount = activities.filter((a) => a.type === 'EMAIL_RECEIVED').length;
    const withOpportunity = activities.filter((a) => a.opportunityId).length;
    const withContact = activities.filter((a) => a.contactId).length;

    console.log(`\nEmail breakdown:`);
    console.log(`  Sent: ${sentCount}`);
    console.log(`  Received: ${receivedCount}`);
    console.log(`  Linked to Opportunity: ${withOpportunity}`);
    console.log(`  Linked to Contact: ${withContact}`);

    if (dryRun) {
      console.log('\n*** DRY RUN - Would create activities:');
      console.log(`  Total: ${activities.length}`);
      activities.slice(0, 5).forEach((a, i) => {
        console.log(`  ${i + 1}. [${a.type}] ${a.subject || '(no subject)'} - ${a.externalEmail || 'N/A'}`);
      });
      return { created: 0, skipped: 0, errors: [], wouldCreate: activities.length };
    }

    // Insert to PostgreSQL in batches using transactions
    console.log('\nInserting to PostgreSQL...');
    const BATCH_SIZE = 50; // Smaller batches for stability
    let created = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < activities.length; i += BATCH_SIZE) {
      const batch = activities.slice(i, i + BATCH_SIZE);

      try {
        // Use a transaction for each batch to ensure commits happen regularly
        await prisma.$transaction(async (tx) => {
          for (const activity of batch) {
            try {
              // Check if already exists by sourceId
              const existing = await tx.activity.findFirst({
                where: { sourceId: activity.sourceId, sourceType: 'SALESFORCE' },
              });

              if (existing) {
                skipped++;
                continue;
              }

              await tx.activity.create({ data: activity });
              created++;
            } catch (error) {
              errors.push({ activity, error: error.message });
            }
          }
        }, { timeout: 60000 }); // 60 second timeout per batch
      } catch (txError) {
        console.error(`\nBatch ${i}-${i + BATCH_SIZE} transaction failed:`, txError.message);
        // Try individual inserts for failed batch
        for (const activity of batch) {
          try {
            const existing = await prisma.activity.findFirst({
              where: { sourceId: activity.sourceId, sourceType: 'SALESFORCE' },
            });
            if (!existing) {
              await prisma.activity.create({ data: activity });
              created++;
            } else {
              skipped++;
            }
          } catch (error) {
            errors.push({ activity, error: error.message });
          }
        }
      }

      const progress = Math.min(i + BATCH_SIZE, activities.length);
      process.stdout.write(`\r  Progress: ${progress}/${activities.length} (${created} created, ${skipped} skipped)`);
    }

    console.log('\n\n=== Migration Complete ===');
    console.log(`Created: ${created}`);
    console.log(`Skipped (already exists): ${skipped}`);
    console.log(`Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\nSample errors:');
      errors.slice(0, 5).forEach((e, i) => {
        console.log(`  ${i + 1}. ${e.activity.subject || '(no subject)'}: ${e.error}`);
      });
    }

    return { created, skipped, errors };
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// CLI
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;

migrateEmails({ dryRun, limit })
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
