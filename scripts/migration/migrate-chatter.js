#!/usr/bin/env node
// Migrate Chatter posts (FeedItem) from Salesforce to Activity table
// Creates Activity records with type COMMENT_ADDED

import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

const FEED_ITEM_FIELDS = [
  'Id',
  'ParentId',           // Related record (Opportunity, Account, Lead, etc.)
  'Type',               // FeedItem type (TextPost, LinkPost, ContentPost, etc.)
  'Title',
  'Body',
  'Status',
  'CreatedById',
  'CreatedDate',
  'LastModifiedDate',
  'Visibility',         // AllUsers, InternalUsers
  'IsDeleted',
  'CommentCount',
  'LikeCount',
];

// Salesforce FeedItem types we care about
const RELEVANT_TYPES = [
  'TextPost',           // Plain text post
  'LinkPost',           // Post with link
  'ContentPost',        // Post with file attachment
  'TrackedChange',      // Field change tracking
  'CreateRecordEvent',  // Record creation
  'PollPost',           // Poll
  'QuestionPost',       // Question
];

async function buildIdMaps(prisma) {
  console.log('Building ID maps...');

  // Get users
  const users = await prisma.user.findMany({
    select: { id: true, salesforceId: true, firstName: true, lastName: true },
    where: { salesforceId: { not: null } },
  });
  const userIdMap = new Map();
  const userNameMap = new Map();
  users.forEach((u) => {
    userIdMap.set(u.salesforceId, u.id);
    userNameMap.set(u.salesforceId, `${u.firstName || ''} ${u.lastName || ''}`.trim());
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

  // Get leads
  const leads = await prisma.lead.findMany({
    select: { id: true, salesforceId: true },
    where: { salesforceId: { not: null } },
  });
  const leadIdMap = new Map();
  leads.forEach((l) => {
    leadIdMap.set(l.salesforceId, l.id);
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

  console.log(`Built ID maps: ${userIdMap.size} users, ${opportunityIdMap.size} opportunities, ${accountIdMap.size} accounts, ${leadIdMap.size} leads`);
  return { userIdMap, userNameMap, opportunityIdMap, accountIdMap, leadIdMap, contactIdMap };
}

function getRelatedIds(sfFeed, maps) {
  const { opportunityIdMap, accountIdMap, leadIdMap, contactIdMap } = maps;

  let opportunityId = undefined;
  let accountId = undefined;
  let leadId = undefined;
  let contactId = undefined;

  const parentId = sfFeed.ParentId;
  if (parentId) {
    const prefix = parentId.substring(0, 3);
    switch (prefix) {
      case '006': // Opportunity
        opportunityId = opportunityIdMap.get(parentId);
        break;
      case '001': // Account
        accountId = accountIdMap.get(parentId);
        break;
      case '00Q': // Lead
        leadId = leadIdMap.get(parentId);
        break;
      case '003': // Contact
        contactId = contactIdMap.get(parentId);
        break;
    }
  }

  return { opportunityId, accountId, leadId, contactId };
}

function determineActivityType(sfFeed) {
  const type = sfFeed.Type;

  switch (type) {
    case 'TrackedChange':
      // Field changes - determine subtype based on content
      if (sfFeed.Body && sfFeed.Body.includes('Stage')) return { type: 'STAGE_CHANGED', subType: 'SYSTEM' };
      if (sfFeed.Body && sfFeed.Body.includes('Owner')) return { type: 'OWNER_CHANGED', subType: 'SYSTEM' };
      if (sfFeed.Body && sfFeed.Body.includes('Status')) return { type: 'STATUS_CHANGED', subType: 'SYSTEM' };
      return { type: 'RECORD_UPDATED', subType: 'SYSTEM' };
    case 'CreateRecordEvent':
      return { type: 'RECORD_CREATED', subType: 'SYSTEM' };
    default:
      return { type: 'COMMENT_ADDED', subType: 'CHATTER' };
  }
}

function transformFeedItem(sfFeed, maps) {
  const { userIdMap, userNameMap } = maps;

  // Get activity type
  const { type, subType } = determineActivityType(sfFeed);

  // Get related record IDs
  const { opportunityId, accountId, leadId, contactId } = getRelatedIds(sfFeed, maps);

  // Get user who created the post
  const userId = sfFeed.CreatedById ? userIdMap.get(sfFeed.CreatedById) : undefined;
  const userName = sfFeed.CreatedById ? userNameMap.get(sfFeed.CreatedById) : undefined;

  // Build subject from title or type
  let subject = sfFeed.Title || undefined;
  if (!subject && sfFeed.Type === 'TrackedChange') {
    subject = 'Record Updated';
  } else if (!subject && sfFeed.Type === 'CreateRecordEvent') {
    subject = 'Record Created';
  }

  const activity = {
    type,
    subType,
    subject,
    body: sfFeed.Body || undefined,
    status: sfFeed.Status || undefined,
    sourceId: sfFeed.Id,
    sourceType: 'SALESFORCE',
    externalName: userName || undefined,
    metadata: {
      feedType: sfFeed.Type,
      visibility: sfFeed.Visibility,
      commentCount: sfFeed.CommentCount,
      likeCount: sfFeed.LikeCount,
    },
    occurredAt: new Date(sfFeed.CreatedDate),
    createdAt: new Date(sfFeed.CreatedDate),
  };

  // Add optional foreign keys
  if (opportunityId) activity.opportunityId = opportunityId;
  if (accountId) activity.accountId = accountId;
  if (leadId) activity.leadId = leadId;
  if (contactId) activity.contactId = contactId;
  if (userId) activity.userId = userId;

  return activity;
}

async function migrateChatter(options = {}) {
  const { dryRun = false, limit = 0, opportunityOnly = false } = options;
  console.log('=== Starting Chatter Migration ===');
  if (dryRun) console.log('*** DRY RUN - No data will be written ***');

  const prisma = getPrismaClient();

  try {
    // Build ID maps first
    const maps = await buildIdMaps(prisma);

    // Build type filter
    const typeFilter = RELEVANT_TYPES.map((t) => `'${t}'`).join(', ');

    // Query Salesforce - focus on opportunity-related feeds
    let soql = `SELECT ${FEED_ITEM_FIELDS.join(', ')} FROM FeedItem WHERE IsDeleted = false AND Type IN (${typeFilter})`;

    soql += ` ORDER BY CreatedDate ASC`;

    if (limit > 0 && !opportunityOnly) {
      soql += ` LIMIT ${limit}`;
    }

    console.log('Querying Salesforce FeedItems (Chatter posts)...');
    console.log(`Query: ${soql.substring(0, 200)}...`);

    let sfFeeds = await querySalesforce(soql);
    console.log(`Fetched ${sfFeeds.length} feed items from Salesforce`);

    // Filter for opportunity-related feeds if requested (ParentId starts with 006)
    if (opportunityOnly) {
      sfFeeds = sfFeeds.filter((f) => f.ParentId && f.ParentId.startsWith('006'));
      console.log(`Filtered to ${sfFeeds.length} opportunity-related feed items`);
    }

    if (limit > 0 && opportunityOnly) {
      sfFeeds = sfFeeds.slice(0, limit);
    }

    console.log(`Found ${sfFeeds.length} feed items to migrate`);

    if (sfFeeds.length === 0) {
      console.log('No feed items found to migrate.');
      return { created: 0, skipped: 0, errors: [] };
    }

    // Transform records
    const activities = sfFeeds.map((f) => transformFeedItem(f, maps));

    // Count stats
    const typeCounts = {};
    activities.forEach((a) => {
      typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
    });

    const withOpportunity = activities.filter((a) => a.opportunityId).length;
    const withAccount = activities.filter((a) => a.accountId).length;
    const withUser = activities.filter((a) => a.userId).length;

    console.log(`\nFeed type breakdown:`);
    Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    console.log(`\nLinking stats:`);
    console.log(`  Linked to Opportunity: ${withOpportunity}`);
    console.log(`  Linked to Account: ${withAccount}`);
    console.log(`  Linked to User: ${withUser}`);

    if (dryRun) {
      console.log('\n*** DRY RUN - Would create activities:');
      console.log(`  Total: ${activities.length}`);
      activities.slice(0, 10).forEach((a, i) => {
        const preview = a.body ? a.body.substring(0, 60).replace(/\n/g, ' ') : '(no body)';
        console.log(`  ${i + 1}. [${a.type}] ${preview}${a.body && a.body.length > 60 ? '...' : ''}`);
      });
      return { created: 0, skipped: 0, errors: [], wouldCreate: activities.length };
    }

    // Insert to PostgreSQL in batches
    console.log('\nInserting to PostgreSQL...');
    const BATCH_SIZE = 100;
    let created = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < activities.length; i += BATCH_SIZE) {
      const batch = activities.slice(i, i + BATCH_SIZE);

      for (const activity of batch) {
        try {
          // Check if already exists by sourceId
          const existing = await prisma.activity.findFirst({
            where: { sourceId: activity.sourceId, sourceType: 'SALESFORCE' },
          });

          if (existing) {
            skipped++;
            continue;
          }

          await prisma.activity.create({ data: activity });
          created++;
        } catch (error) {
          errors.push({ activity, error: error.message });
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
        const preview = e.activity.body ? e.activity.body.substring(0, 40) : '(no body)';
        console.log(`  ${i + 1}. ${preview}: ${e.error}`);
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
const opportunityOnly = args.includes('--opportunity-only');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0;

console.log('Options:');
console.log(`  --dry-run: ${dryRun}`);
console.log(`  --opportunity-only: ${opportunityOnly}`);
console.log(`  --limit: ${limit || 'unlimited'}`);
console.log('');

migrateChatter({ dryRun, limit, opportunityOnly })
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
