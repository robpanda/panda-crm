#!/usr/bin/env node
/**
 * Comprehensive Daily Salesforce to PostgreSQL Sync
 *
 * Syncs ALL critical objects from Salesforce to Panda CRM:
 * - Users (names, roles, departments)
 * - Accounts (customer data)
 * - Contacts (contact info)
 * - Leads (status, disposition, assignment)
 * - Opportunities (stage, amounts, dates)
 * - WorkOrders (service work)
 * - ServiceAppointments (scheduling)
 * - ServiceContracts (contracts)
 * - Invoices (billing)
 * - Quotes (proposals)
 * - Tasks/Activities (call history, notes)
 *
 * Usage:
 *   node comprehensive-daily-sync.js                    # Incremental sync (last 24 hours)
 *   node comprehensive-daily-sync.js --force            # Full sync (all records)
 *   node comprehensive-daily-sync.js --hours=48         # Sync last 48 hours
 *   node comprehensive-daily-sync.js --dry-run          # Preview without changes
 *   node comprehensive-daily-sync.js --objects=leads,opportunities  # Specific objects
 */

const { PrismaClient } = require('../../shared/node_modules/@prisma/client');
const jsforce = require('jsforce');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });

// Configuration
const BATCH_SIZE = 200;
const JOB_ID_STARTING_NUMBER = 999; // First job will be 1000
const DEFAULT_HOURS = 24; // Default to last 24 hours
const SYNC_STATE_FILE = path.join(__dirname, '.comprehensive-sync-state.json');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  return {
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
    hours: parseInt(args.find(a => a.startsWith('--hours='))?.split('=')[1] || DEFAULT_HOURS),
    objects: args.find(a => a.startsWith('--objects='))?.split('=')[1]?.split(',') || null,
  };
}

// Get Salesforce connection
async function getSalesforceConnection() {
  try {
    const command = new GetSecretValueCommand({ SecretId: 'salesforce-api-credentials' });
    const response = await secretsClient.send(command);
    const secrets = JSON.parse(response.SecretString);

    const conn = new jsforce.Connection({
      instanceUrl: secrets.instance_url || 'https://ability-saas-2460.my.salesforce.com',
    });

    // Use username/password authentication (same as working salesforce-sync.js)
    await conn.login(
      secrets.username,
      secrets.password + (secrets.security_token || '')
    );

    console.log('Connected to Salesforce:', conn.instanceUrl);
    return conn;
  } catch (error) {
    console.error('Salesforce connection failed:', error.message);
    throw error;
  }
}

// Query Salesforce with pagination
async function querySalesforce(conn, soql) {
  const records = [];
  let query = conn.query(soql).maxFetch(100000);

  return new Promise((resolve, reject) => {
    query.on('record', (record) => records.push(record));
    query.on('end', () => {
      console.log(`    Fetched ${records.length} records from Salesforce`);
      resolve(records);
    });
    query.on('error', reject);
    query.run({ autoFetch: true, maxFetch: 100000 });
  });
}

// Sync state management
function loadSyncState() {
  try {
    if (fs.existsSync(SYNC_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(SYNC_STATE_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading sync state:', e.message);
  }
  return {};
}

function saveSyncState(state) {
  try {
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Error saving sync state:', e.message);
  }
}

// Generate next Job ID for an opportunity
// Format: YYYY-NNNN (e.g., 2026-1001)
async function generateJobId(createdDate) {
  const year = createdDate ? new Date(createdDate).getFullYear() : new Date().getFullYear();

  // Get or create sequence for this year
  let sequence = await prisma.jobIdSequence.findUnique({ where: { year } });

  if (!sequence) {
    // Create new sequence for this year starting at 1000
    sequence = await prisma.jobIdSequence.create({
      data: {
        year,
        lastNumber: JOB_ID_STARTING_NUMBER + 1, // Will be 1000
      },
    });
    return `${year}-${sequence.lastNumber}`;
  }

  // Increment and update sequence
  const nextNumber = sequence.lastNumber + 1;
  await prisma.jobIdSequence.update({
    where: { year },
    data: { lastNumber: nextNumber },
  });

  return `${year}-${nextNumber}`;
}

// Build ID maps for foreign key resolution
async function buildIdMaps() {
  console.log('Building ID maps for foreign key resolution...');

  const [accounts, contacts, opportunities, users, contracts, workOrders, leads] = await Promise.all([
    prisma.account.findMany({ select: { id: true, salesforceId: true } }),
    prisma.contact.findMany({ select: { id: true, salesforceId: true } }),
    prisma.opportunity.findMany({ select: { id: true, salesforceId: true } }),
    prisma.user.findMany({ select: { id: true, salesforceId: true }, where: { salesforceId: { not: null } } }),
    prisma.serviceContract.findMany({ select: { id: true, salesforceId: true } }),
    prisma.workOrder.findMany({ select: { id: true, salesforceId: true } }),
    prisma.lead.findMany({ select: { id: true, salesforceId: true } }),
  ]);

  console.log(`  Accounts: ${accounts.length}, Contacts: ${contacts.length}, Opportunities: ${opportunities.length}`);
  console.log(`  Users: ${users.length}, Contracts: ${contracts.length}, WorkOrders: ${workOrders.length}, Leads: ${leads.length}`);

  return {
    accountIdMap: new Map(accounts.map(a => [a.salesforceId, a.id])),
    contactIdMap: new Map(contacts.map(c => [c.salesforceId, c.id])),
    opportunityIdMap: new Map(opportunities.map(o => [o.salesforceId, o.id])),
    userIdMap: new Map(users.map(u => [u.salesforceId, u.id])),
    contractIdMap: new Map(contracts.map(c => [c.salesforceId, c.id])),
    workOrderIdMap: new Map(workOrders.map(w => [w.salesforceId, w.id])),
    leadIdMap: new Map(leads.map(l => [l.salesforceId, l.id])),
  };
}

// Status mappings
const LEAD_STATUS_MAP = {
  'New': 'NEW',
  'Open - Not Contacted': 'NEW',
  'Raw lead': 'NEW',
  'Not Home/No Answer': 'NEW',
  'Not Set': 'NEW',
  'Working - Contacted': 'CONTACTED',
  'Contacted': 'CONTACTED',
  'Working': 'CONTACTED',
  'Lead Not Set': 'CONTACTED',
  'Qualified': 'QUALIFIED',
  'Lead Set': 'QUALIFIED',
  'Inspection Scheduled': 'QUALIFIED',
  'Service Agreement': 'QUALIFIED',
  'Unqualified': 'UNQUALIFIED',
  'Canceled': 'UNQUALIFIED',
  'Closed - Not Converted': 'UNQUALIFIED',
  'Closed - Converted': 'CONVERTED',
  'Converted': 'CONVERTED',
  'Completed': 'CONVERTED',
};

const OPPORTUNITY_STAGE_MAP = {
  'Lead Unassigned': 'LEAD_UNASSIGNED',
  'Lead Assigned': 'LEAD_ASSIGNED',
  'Scheduled': 'SCHEDULED',
  'Inspected': 'INSPECTED',
  'Claim Filed': 'CLAIM_FILED',
  'Adjuster Meeting Complete': 'ADJUSTER_MEETING_COMPLETE',
  'Approved': 'APPROVED',
  'Contract Signed': 'CONTRACT_SIGNED',
  'In Production': 'IN_PRODUCTION',
  'Completed': 'COMPLETED',
  'Closed Won': 'CLOSED_WON',
  'Closed Lost': 'CLOSED_LOST',
  // Additional stages from Salesforce StageName
  'Prospect': 'PROSPECT',
  'Dead': 'CLOSED_LOST',
};

// Map Salesforce Status__c custom field to stage for more detailed workflow tracking
// Status__c contains more granular workflow statuses
const OPPORTUNITY_STATUS_TO_STAGE_MAP = {
  // Lead/Scheduling workflow
  'Not Scheduled': 'LEAD_ASSIGNED',
  'Scheduled': 'SCHEDULED',
  'Confirmed': 'SCHEDULED',
  'Contract Scheduled': 'CONTRACT_SIGNED',
  // Post-inspection workflow
  'Demoed': 'INSPECTED',
  'Not Demoed': 'INSPECTED',
  'Lead Run - No Claim': 'INSPECTED',
  'Qualified - No Claim': 'INSPECTED',
  // Insurance workflow
  'Claim Filed': 'CLAIM_FILED',
  'Adjusters Meeting Complete': 'ADJUSTER_MEETING_COMPLETE',
  'ATR': 'ADJUSTER_MEETING_COMPLETE',
  'ATR Scheduled': 'ADJUSTER_MEETING_COMPLETE',
  'Approved': 'APPROVED',
  // Contract/Production workflow
  'Sold/Contract Signed': 'CONTRACT_SIGNED',
  '2nd Visit Needed': 'INSPECTED',
  '2nd Visit Needed Insurance': 'INSPECTED',
  'Second Visit Needed': 'INSPECTED',
  'Prospect Follow Up': 'PROSPECT',
  'Follow Up': 'PROSPECT',
  '3 Day Follow Up': 'PROSPECT',
  // Cancellation/Failures
  'Canceled': 'CLOSED_LOST',
  'Canceled Contract': 'CLOSED_LOST',
  'Credit Fail': 'CLOSED_LOST',
  'Not Moving Forward': 'CLOSED_LOST',
  'No Inspection': 'CLOSED_LOST',
  'None': null, // Keep existing stage
};

const ACCOUNT_STATUS_MAP = {
  'New': 'NEW',
  'Lead': 'LEAD',
  'Customer - Active': 'CUSTOMER',
  'Customer': 'CUSTOMER',
  'Onboarding': 'ONBOARDING',
  'In Production': 'IN_PRODUCTION',
  'Closed - Paid': 'COMPLETED',
  'Closed - Won': 'COMPLETED',
  'Closed - Lost': 'LOST',
  'Inactive': 'INACTIVE',
};

// =====================================================
// SYNC FUNCTIONS FOR EACH OBJECT TYPE
// =====================================================

async function syncUsers(conn, idMaps, options, sinceDate) {
  console.log('\n' + '─'.repeat(50));
  console.log('Syncing Users...');

  const fields = [
    'Id', 'Name', 'FirstName', 'LastName', 'Email', 'Phone', 'MobilePhone',
    'Title', 'Department', 'UserRole.Name', 'IsActive',
    'ManagerId', 'Profile.Name',
    'CreatedDate', 'LastModifiedDate',
  ];

  let query = `SELECT ${fields.join(', ')} FROM User WHERE IsActive = true`;
  if (sinceDate && !options.force) {
    query += ` AND LastModifiedDate > ${sinceDate.toISOString()}`;
  }

  const records = await querySalesforce(conn, query);
  if (records.length === 0) return { synced: 0, errors: 0, skipped: 0 };

  let synced = 0, errors = 0, skipped = 0;

  for (const sf of records) {
    const existingUser = await prisma.user.findFirst({ where: { salesforceId: sf.Id } });
    if (!existingUser) {
      skipped++; // Don't create new users, just update existing
      continue;
    }

    try {
      if (!options.dryRun) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            firstName: sf.FirstName || existingUser.firstName,
            lastName: sf.LastName || existingUser.lastName,
            email: sf.Email || existingUser.email,
            phone: sf.Phone || sf.MobilePhone || existingUser.phone,
            title: sf.Title || existingUser.title,
            department: sf.Department || existingUser.department,
            isActive: sf.IsActive,
            updatedAt: new Date(),
          },
        });
      }
      synced++;
    } catch (error) {
      errors++;
      if (errors <= 3) console.error(`  Error updating user ${sf.Id}: ${error.message}`);
    }
  }

  console.log(`  Synced: ${synced}, Skipped: ${skipped}, Errors: ${errors}`);
  return { synced, errors, skipped };
}

async function syncAccounts(conn, idMaps, options, sinceDate) {
  console.log('\n' + '─'.repeat(50));
  console.log('Syncing Accounts...');

  // Use only standard Salesforce fields that definitely exist
  const fields = [
    'Id', 'Name', 'AccountNumber',
    'BillingStreet', 'BillingCity', 'BillingState', 'BillingPostalCode', 'BillingCountry',
    'ShippingStreet', 'ShippingCity', 'ShippingState', 'ShippingPostalCode', 'ShippingCountry',
    'Phone', 'Website',
    'Type', 'Industry', 'Description',
    'OwnerId',
    'CreatedDate', 'LastModifiedDate',
  ];

  let query = `SELECT ${fields.join(', ')} FROM Account WHERE IsDeleted = false`;
  if (sinceDate && !options.force) {
    query += ` AND LastModifiedDate > ${sinceDate.toISOString()}`;
  }

  const records = await querySalesforce(conn, query);
  if (records.length === 0) return { synced: 0, errors: 0, created: 0 };

  let synced = 0, errors = 0, created = 0;

  for (const sf of records) {
    try {
      const ownerId = idMaps.userIdMap.get(sf.OwnerId);

      const data = {
        name: sf.Name || 'Unnamed Account',
        accountNumber: sf.AccountNumber || null,
        phone: sf.Phone,
        website: sf.Website,
        industry: sf.Industry,
        type: sf.Type === 'Commercial' ? 'COMMERCIAL' : 'RESIDENTIAL',
        description: sf.Description,
        billingStreet: sf.BillingStreet,
        billingCity: sf.BillingCity,
        billingState: sf.BillingState,
        billingPostalCode: sf.BillingPostalCode,
        billingCountry: sf.BillingCountry,
        shippingStreet: sf.ShippingStreet,
        shippingCity: sf.ShippingCity,
        shippingState: sf.ShippingState,
        shippingPostalCode: sf.ShippingPostalCode,
        shippingCountry: sf.ShippingCountry,
        updatedAt: new Date(),
      };

      if (!options.dryRun) {
        const existing = await prisma.account.findFirst({ where: { salesforceId: sf.Id } });
        if (existing) {
          // For updates, use owner connect/disconnect syntax
          const updateData = { ...data };
          if (ownerId) {
            updateData.owner = { connect: { id: ownerId } };
          }
          await prisma.account.update({ where: { id: existing.id }, data: updateData });
          synced++;
        } else {
          // For creates, use owner connect syntax
          const createData = {
            ...data,
            salesforceId: sf.Id,
            createdAt: sf.CreatedDate ? new Date(sf.CreatedDate) : new Date(),
          };
          if (ownerId) {
            createData.owner = { connect: { id: ownerId } };
          }
          await prisma.account.create({ data: createData });
          created++;
        }
      } else {
        synced++;
      }
    } catch (error) {
      errors++;
      if (errors <= 3) console.error(`  Error syncing account ${sf.Id}: ${error.message}`);
    }
  }

  console.log(`  Updated: ${synced}, Created: ${created}, Errors: ${errors}`);
  return { synced, errors, created };
}

async function syncContacts(conn, idMaps, options, sinceDate) {
  console.log('\n' + '─'.repeat(50));
  console.log('Syncing Contacts...');

  // Use only standard Salesforce fields that definitely exist
  const fields = [
    'Id', 'FirstName', 'LastName', 'Name', 'Email', 'Phone', 'MobilePhone',
    'Title', 'Department', 'AccountId',
    'MailingStreet', 'MailingCity', 'MailingState', 'MailingPostalCode',
    'HasOptedOutOfEmail', 'DoNotCall',
    'CreatedDate', 'LastModifiedDate',
  ];

  let query = `SELECT ${fields.join(', ')} FROM Contact WHERE IsDeleted = false`;
  if (sinceDate && !options.force) {
    query += ` AND LastModifiedDate > ${sinceDate.toISOString()}`;
  }

  const records = await querySalesforce(conn, query);
  if (records.length === 0) return { synced: 0, errors: 0, created: 0 };

  let synced = 0, errors = 0, created = 0;

  for (const sf of records) {
    try {
      const accountId = idMaps.accountIdMap.get(sf.AccountId);

      const data = {
        firstName: sf.FirstName || 'Unknown',
        lastName: sf.LastName || 'Contact',
        fullName: sf.Name || null,
        email: sf.Email,
        phone: sf.Phone,
        mobilePhone: sf.MobilePhone,
        title: sf.Title,
        department: sf.Department,
        mailingStreet: sf.MailingStreet,
        mailingCity: sf.MailingCity,
        mailingState: sf.MailingState,
        mailingPostalCode: sf.MailingPostalCode,
        // Preferences
        emailOptOut: sf.HasOptedOutOfEmail || false,
        doNotCall: sf.DoNotCall || false,
        updatedAt: new Date(),
      };

      if (!options.dryRun) {
        const existing = await prisma.contact.findFirst({ where: { salesforceId: sf.Id } });
        if (existing) {
          const updateData = { ...data };
          if (accountId) {
            updateData.account = { connect: { id: accountId } };
          }
          await prisma.contact.update({ where: { id: existing.id }, data: updateData });
          synced++;
        } else {
          const createData = {
            ...data,
            salesforceId: sf.Id,
            createdAt: sf.CreatedDate ? new Date(sf.CreatedDate) : new Date(),
          };
          if (accountId) {
            createData.account = { connect: { id: accountId } };
          }
          await prisma.contact.create({ data: createData });
          created++;
        }
      } else {
        synced++;
      }
    } catch (error) {
      errors++;
      if (errors <= 3) console.error(`  Error syncing contact ${sf.Id}: ${error.message}`);
    }
  }

  console.log(`  Updated: ${synced}, Created: ${created}, Errors: ${errors}`);
  return { synced, errors, created };
}

async function syncLeads(conn, idMaps, options, sinceDate) {
  console.log('\n' + '─'.repeat(50));
  console.log('Syncing Leads...');

  const fields = [
    'Id', 'FirstName', 'LastName', 'Email', 'Phone', 'MobilePhone', 'Company',
    'Title', 'Status', 'Lead_Disposition__c', 'LeadSource', 'Rating', 'Industry',
    'Street', 'City', 'State', 'PostalCode', 'Country',
    'Description', 'OwnerId',
    'IsConverted', 'ConvertedDate', 'ConvertedAccountId', 'ConvertedContactId', 'ConvertedOpportunityId',
    'CreatedDate', 'LastModifiedDate',
  ];

  let query = `SELECT ${fields.join(', ')} FROM Lead WHERE IsDeleted = false`;
  if (sinceDate && !options.force) {
    query += ` AND LastModifiedDate > ${sinceDate.toISOString()}`;
  }

  const records = await querySalesforce(conn, query);
  if (records.length === 0) return { synced: 0, errors: 0, created: 0 };

  let synced = 0, errors = 0, created = 0;

  for (const sf of records) {
    try {
      const data = {
        firstName: sf.FirstName || 'Unknown',
        lastName: sf.LastName || 'Lead',
        email: sf.Email,
        phone: sf.Phone,
        mobilePhone: sf.MobilePhone,
        company: sf.Company,
        title: sf.Title,
        status: LEAD_STATUS_MAP[sf.Status] || 'NEW',
        disposition: sf.Lead_Disposition__c || null,
        source: sf.LeadSource,
        rating: sf.Rating?.toUpperCase() || null,
        industry: sf.Industry,
        street: sf.Street,
        city: sf.City,
        state: sf.State,
        postalCode: sf.PostalCode,
        country: sf.Country,
        description: sf.Description,
        ownerId: idMaps.userIdMap.get(sf.OwnerId) || null,
        isConverted: sf.IsConverted || false,
        convertedDate: sf.ConvertedDate ? new Date(sf.ConvertedDate) : null,
        convertedAccountId: sf.ConvertedAccountId ? idMaps.accountIdMap.get(sf.ConvertedAccountId) : null,
        convertedContactId: sf.ConvertedContactId ? idMaps.contactIdMap.get(sf.ConvertedContactId) : null,
        convertedOpportunityId: sf.ConvertedOpportunityId ? idMaps.opportunityIdMap.get(sf.ConvertedOpportunityId) : null,
        updatedAt: new Date(),
      };

      if (!options.dryRun) {
        const existing = await prisma.lead.findFirst({ where: { salesforceId: sf.Id } });
        if (existing) {
          await prisma.lead.update({ where: { id: existing.id }, data });
          synced++;
        } else {
          await prisma.lead.create({
            data: {
              ...data,
              salesforceId: sf.Id,
              createdAt: sf.CreatedDate ? new Date(sf.CreatedDate) : new Date(),
            },
          });
          created++;
        }
      } else {
        synced++;
      }
    } catch (error) {
      errors++;
      if (errors <= 3) console.error(`  Error syncing lead ${sf.Id}: ${error.message}`);
    }
  }

  console.log(`  Updated: ${synced}, Created: ${created}, Errors: ${errors}`);
  return { synced, errors, created };
}

async function syncOpportunities(conn, idMaps, options, sinceDate) {
  console.log('\n' + '─'.repeat(50));
  console.log('Syncing Opportunities...');

  // Include Status__c custom field for more accurate stage mapping
  const fields = [
    'Id', 'Name', 'Description',
    'StageName', 'Status__c', 'Probability',
    'CloseDate', 'Amount',
    'Type', 'LeadSource',
    'AccountId', 'ContactId', 'OwnerId',
    'IsClosed', 'IsWon',
    'CreatedDate', 'LastModifiedDate',
  ];

  let query = `SELECT ${fields.join(', ')} FROM Opportunity WHERE IsDeleted = false`;
  if (sinceDate && !options.force) {
    query += ` AND LastModifiedDate > ${sinceDate.toISOString()}`;
  }

  const records = await querySalesforce(conn, query);
  if (records.length === 0) return { synced: 0, errors: 0, created: 0 };

  let synced = 0, errors = 0, created = 0;

  for (const sf of records) {
    try {
      const accountId = idMaps.accountIdMap.get(sf.AccountId);
      const contactId = sf.ContactId ? idMaps.contactIdMap.get(sf.ContactId) : null;
      const ownerId = idMaps.userIdMap.get(sf.OwnerId);

      // Determine stage: Prefer Status__c mapping for more granular workflow tracking,
      // fall back to StageName mapping, then default to LEAD_UNASSIGNED
      let stage = null;
      if (sf.Status__c && OPPORTUNITY_STATUS_TO_STAGE_MAP[sf.Status__c]) {
        stage = OPPORTUNITY_STATUS_TO_STAGE_MAP[sf.Status__c];
      }
      if (!stage && sf.StageName) {
        stage = OPPORTUNITY_STAGE_MAP[sf.StageName];
      }
      if (!stage) {
        stage = 'LEAD_UNASSIGNED';
      }

      const data = {
        name: sf.Name || 'Unnamed Opportunity',
        stage: stage,
        status: sf.Status__c || null, // Also store original status in status field
        amount: sf.Amount || null,
        closeDate: sf.CloseDate ? new Date(sf.CloseDate) : null,
        probability: sf.Probability || 0,
        type: sf.Type === 'Retail' ? 'RETAIL' : (sf.Type === 'Commercial' ? 'COMMERCIAL' : 'INSURANCE'),
        leadSource: sf.LeadSource,
        description: sf.Description,
        updatedAt: new Date(),
      };

      if (!options.dryRun) {
        const existing = await prisma.opportunity.findFirst({ where: { salesforceId: sf.Id } });
        if (existing) {
          const updateData = { ...data };
          // Use connect syntax for relations
          if (accountId) updateData.account = { connect: { id: accountId } };
          if (contactId) updateData.contact = { connect: { id: contactId } };
          if (ownerId) updateData.owner = { connect: { id: ownerId } };
          await prisma.opportunity.update({ where: { id: existing.id }, data: updateData });
          synced++;
        } else {
          // For creates, accountId is required
          if (!accountId) {
            errors++;
            continue;
          }
          // Generate a Job ID for the new opportunity
          const jobId = await generateJobId(sf.CreatedDate);
          const createData = {
            ...data,
            salesforceId: sf.Id,
            jobId: jobId,
            createdAt: sf.CreatedDate ? new Date(sf.CreatedDate) : new Date(),
            account: { connect: { id: accountId } },
          };
          if (contactId) createData.contact = { connect: { id: contactId } };
          if (ownerId) createData.owner = { connect: { id: ownerId } };
          await prisma.opportunity.create({ data: createData });
          created++;
        }
      } else {
        synced++;
      }
    } catch (error) {
      errors++;
      if (errors <= 3) console.error(`  Error syncing opportunity ${sf.Id}: ${error.message}`);
    }
  }

  console.log(`  Updated: ${synced}, Created: ${created}, Errors: ${errors}`);
  return { synced, errors, created };
}

// Task status mapping
const TASK_STATUS_MAP = {
  'Not Started': 'NOT_STARTED',
  'Open': 'NOT_STARTED',
  'In Progress': 'IN_PROGRESS',
  'Working': 'IN_PROGRESS',
  'Waiting on someone else': 'WAITING',
  'Waiting': 'WAITING',
  'Completed': 'COMPLETED',
  'Complete': 'COMPLETED',
  'Deferred': 'DEFERRED',
  'Deferred': 'DEFERRED',
};

async function syncTasks(conn, idMaps, options, sinceDate) {
  console.log('\n' + '─'.repeat(50));
  console.log('Syncing Tasks/Activities...');

  // Use only standard Task fields
  const fields = [
    'Id', 'Subject', 'Description', 'Status', 'Priority',
    'WhoId', 'WhatId', 'OwnerId',
    'ActivityDate', 'IsClosed', 'IsHighPriority',
    'CreatedDate', 'LastModifiedDate',
  ];

  let query = `SELECT ${fields.join(', ')} FROM Task WHERE IsDeleted = false`;
  if (sinceDate && !options.force) {
    query += ` AND LastModifiedDate > ${sinceDate.toISOString()}`;
  }

  const records = await querySalesforce(conn, query);
  if (records.length === 0) return { synced: 0, errors: 0, created: 0 };

  let synced = 0, errors = 0, created = 0;

  for (const sf of records) {
    // Determine if this is linked to a Lead or Opportunity
    let leadId = null, opportunityId = null;

    if (sf.WhoId) {
      // WhoId is typically a Contact or Lead - we only track Lead
      leadId = idMaps.leadIdMap.get(sf.WhoId) || null;
    }
    if (sf.WhatId) {
      // WhatId is typically an Account or Opportunity - we only track Opportunity
      opportunityId = idMaps.opportunityIdMap.get(sf.WhatId) || null;
    }

    // Skip if no linkable record (Task model only has lead/opportunity relationships)
    if (!leadId && !opportunityId) {
      continue;
    }

    try {
      // Map status to valid enum value
      const mappedStatus = TASK_STATUS_MAP[sf.Status] || (sf.IsClosed ? 'COMPLETED' : 'NOT_STARTED');

      const data = {
        subject: sf.Subject || 'Task',
        description: sf.Description,
        status: mappedStatus,
        priority: sf.Priority === 'High' || sf.IsHighPriority ? 'HIGH' : (sf.Priority === 'Low' ? 'LOW' : 'NORMAL'),
        leadId,
        opportunityId,
        assignedToId: idMaps.userIdMap.get(sf.OwnerId) || null,
        dueDate: sf.ActivityDate ? new Date(sf.ActivityDate) : null,
        completedDate: sf.IsClosed ? new Date() : null,
        updatedAt: new Date(),
      };

      if (!options.dryRun) {
        const existing = await prisma.task.findFirst({ where: { salesforceId: sf.Id } });
        if (existing) {
          await prisma.task.update({ where: { id: existing.id }, data });
          synced++;
        } else {
          await prisma.task.create({
            data: {
              ...data,
              salesforceId: sf.Id,
              createdAt: sf.CreatedDate ? new Date(sf.CreatedDate) : new Date(),
            },
          });
          created++;
        }
      } else {
        synced++;
      }
    } catch (error) {
      errors++;
      if (errors <= 3) console.error(`  Error syncing task ${sf.Id}: ${error.message}`);
    }
  }

  console.log(`  Updated: ${synced}, Created: ${created}, Errors: ${errors}`);
  return { synced, errors, created };
}

// Invoice status mapping
const INVOICE_STATUS_MAP = {
  'Draft': 'DRAFT',
  'Pending': 'PENDING',
  'Sent': 'SENT',
  'Partially Paid': 'PARTIALLY_PAID',
  'Paid': 'PAID',
  'Overdue': 'OVERDUE',
  'Cancelled': 'CANCELLED',
  'Void': 'VOID',
};

// Payment status and method mappings
const PAYMENT_STATUS_MAP = {
  'Pending': 'PENDING',
  'Settled Successfully': 'SETTLED',
  'Completed': 'SETTLED',
  'Success': 'SETTLED',
  'Failed': 'FAILED',
  'Declined': 'FAILED',
  'Refunded': 'REFUNDED',
  'Partially Refunded': 'PARTIALLY_REFUNDED',
  'Cancelled': 'FAILED',  // No CANCELLED status in enum, use FAILED
  'Voided': 'FAILED',     // No VOIDED status in enum, use FAILED
  'Processing': 'PROCESSING',
};

const PAYMENT_METHOD_MAP = {
  'Credit Card': 'CREDIT_CARD',
  'Debit Card': 'CREDIT_CARD',
  'Check': 'CHECK',
  'Cash': 'CASH',
  'ACH': 'ACH',
  'Bank Transfer': 'ACH',
  'Wire': 'WIRE',
  'Financing': 'FINANCING',
  'Insurance': 'INSURANCE_CHECK',
  'Insurance Check': 'INSURANCE_CHECK',
  'Other': 'CHECK', // Default to CHECK as fallback (valid enum value)
};

async function syncInvoices(conn, idMaps, options, sinceDate) {
  console.log('\n' + '─'.repeat(50));
  console.log('Syncing Invoices...');

  // Build existing invoice map for faster lookups (avoid individual queries)
  console.log('  Building existing invoice lookup map...');
  const existingInvoices = await prisma.invoice.findMany({
    select: { id: true, salesforceId: true },
  });
  const invoiceLookup = new Map(existingInvoices.filter(i => i.salesforceId).map(i => [i.salesforceId, i.id]));
  console.log(`  Found ${invoiceLookup.size} existing invoices in database`);

  // Query fw1__Invoice__c object (FinancialForce/Accounting Seed invoices)
  const fields = [
    'Id', 'Name', 'fw1__Status__c', 'fw1__Invoice_Date__c', 'fw1__Due_Date__c',
    'fw1__Total_Invoice_Amount__c', 'fw1__Total_Paid_Amount__c', 'fw1__Balance_Due__c',
    'fw1__Account__c', 'fw1__Opportunity__c',
    'CreatedDate', 'LastModifiedDate',
  ];

  let query = `SELECT ${fields.join(', ')} FROM fw1__Invoice__c`;
  if (sinceDate && !options.force) {
    query += ` WHERE LastModifiedDate > ${sinceDate.toISOString()}`;
  }

  let records = [];
  try {
    records = await querySalesforce(conn, query);
  } catch (error) {
    console.error(`  Error querying invoices: ${error.message}`);
    return { synced: 0, errors: 0, created: 0 };
  }

  if (records.length === 0) return { synced: 0, errors: 0, created: 0 };

  let synced = 0, errors = 0, created = 0, skipped = 0;
  const total = records.length;
  let lastProgress = 0;

  for (let i = 0; i < records.length; i++) {
    const sf = records[i];

    // Progress logging every 10%
    const progress = Math.floor((i / total) * 100);
    if (progress >= lastProgress + 10) {
      console.log(`  Progress: ${progress}% (${i}/${total})`);
      lastProgress = progress;
    }

    try {
      const accountId = idMaps.accountIdMap.get(sf.fw1__Account__c);
      const opportunityId = sf.fw1__Opportunity__c ? idMaps.opportunityIdMap.get(sf.fw1__Opportunity__c) : null;

      // Skip if no account link (required field)
      if (!accountId) {
        skipped++;
        continue;
      }

      const status = INVOICE_STATUS_MAP[sf.fw1__Status__c] || 'DRAFT';

      const data = {
        status: status,
        invoiceDate: sf.fw1__Invoice_Date__c ? new Date(sf.fw1__Invoice_Date__c) : null,
        dueDate: sf.fw1__Due_Date__c ? new Date(sf.fw1__Due_Date__c) : null,
        total: sf.fw1__Total_Invoice_Amount__c || 0,
        amountPaid: sf.fw1__Total_Paid_Amount__c || 0,
        balanceDue: sf.fw1__Balance_Due__c || 0,
        updatedAt: new Date(),
      };

      if (!options.dryRun) {
        const existingId = invoiceLookup.get(sf.Id);
        if (existingId) {
          const updateData = { ...data };
          if (accountId) updateData.accountId = accountId;
          if (opportunityId) updateData.opportunityId = opportunityId;
          await prisma.invoice.update({ where: { id: existingId }, data: updateData });
          synced++;
        } else {
          // Generate invoice number if not exists
          const invoiceNumber = sf.Name || `INV-${Date.now()}-${i}`;
          const createData = {
            ...data,
            salesforceId: sf.Id,
            invoiceNumber: invoiceNumber,
            createdAt: sf.CreatedDate ? new Date(sf.CreatedDate) : new Date(),
            accountId: accountId,
          };
          if (opportunityId) createData.opportunityId = opportunityId;
          await prisma.invoice.create({ data: createData });
          created++;
        }
      } else {
        synced++;
      }
    } catch (error) {
      errors++;
      if (errors <= 5) console.error(`  Error syncing invoice ${sf.Id}: ${error.message}`);
    }
  }

  console.log(`  Updated: ${synced}, Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`);
  return { synced, errors, created };
}

async function syncPayments(conn, idMaps, options, sinceDate) {
  console.log('\n' + '─'.repeat(50));
  console.log('Syncing Payments...');

  // Build invoice ID map for linking payments to invoices
  const invoices = await prisma.invoice.findMany({ select: { id: true, salesforceId: true } });
  const invoiceIdMap = new Map(invoices.map(i => [i.salesforceId, i.id]));
  console.log(`  Invoice ID map: ${invoiceIdMap.size} invoices`);

  // Query fw1__Payment__c object
  const fields = [
    'Id', 'Name', 'fw1__Amount__c', 'fw1__Payment_Date__c', 'fw1__Status__c',
    'fw1__Payment_Method__c', 'fw1__Reference__c', 'fw1__Invoice__c',
    'fw1__Account__c',
    'CreatedDate', 'LastModifiedDate',
  ];

  let query = `SELECT ${fields.join(', ')} FROM fw1__Payment__c`;
  if (sinceDate && !options.force) {
    query += ` WHERE LastModifiedDate > ${sinceDate.toISOString()}`;
  }

  let records = [];
  try {
    records = await querySalesforce(conn, query);
  } catch (error) {
    console.error(`  Error querying payments: ${error.message}`);
    return { synced: 0, errors: 0, created: 0 };
  }

  if (records.length === 0) return { synced: 0, errors: 0, created: 0 };

  // Build payment lookup map for fast existence checks
  console.log('  Building existing payment lookup map...');
  const existingPayments = await prisma.payment.findMany({
    select: { id: true, salesforceId: true },
  });
  const paymentLookup = new Map(existingPayments.filter(p => p.salesforceId).map(p => [p.salesforceId, p.id]));
  console.log(`  Found ${paymentLookup.size} existing payments in database`);

  let synced = 0, errors = 0, created = 0, skipped = 0;
  const total = records.length;
  let lastProgress = 0;

  for (let i = 0; i < records.length; i++) {
    const sf = records[i];
    try {
      // Progress logging
      const progress = Math.floor((i / total) * 100);
      if (progress >= lastProgress + 10) {
        console.log(`  Progress: ${progress}% (${i}/${total})`);
        lastProgress = progress;
      }

      const invoiceId = sf.fw1__Invoice__c ? invoiceIdMap.get(sf.fw1__Invoice__c) : null;

      // Skip if no invoice link (required field for our schema)
      if (!invoiceId) {
        skipped++;
        continue;
      }

      const status = PAYMENT_STATUS_MAP[sf.fw1__Status__c] || 'PENDING';
      const paymentMethod = PAYMENT_METHOD_MAP[sf.fw1__Payment_Method__c] || 'CHECK';

      const data = {
        amount: sf.fw1__Amount__c || 0,
        paymentDate: sf.fw1__Payment_Date__c ? new Date(sf.fw1__Payment_Date__c) : new Date(),
        status: status,
        paymentMethod: paymentMethod,
        referenceNumber: sf.fw1__Reference__c || null,
        updatedAt: new Date(),
      };

      if (!options.dryRun) {
        const existingId = paymentLookup.get(sf.Id);
        if (existingId) {
          const updateData = { ...data };
          if (invoiceId) updateData.invoiceId = invoiceId;
          await prisma.payment.update({ where: { id: existingId }, data: updateData });
          synced++;
        } else {
          // Generate payment number if not exists
          const paymentNumber = sf.Name || `PAY-${Date.now()}`;
          const createData = {
            ...data,
            salesforceId: sf.Id,
            paymentNumber: paymentNumber,
            createdAt: sf.CreatedDate ? new Date(sf.CreatedDate) : new Date(),
            invoiceId: invoiceId,
          };
          await prisma.payment.create({ data: createData });
          created++;
        }
      } else {
        synced++;
      }
    } catch (error) {
      errors++;
      if (errors <= 3) console.error(`  Error syncing payment ${sf.Id}: ${error.message}`);
    }
  }

  console.log(`  Updated: ${synced}, Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`);
  return { synced, errors, created };
}

// =====================================================
// MAIN EXECUTION
// =====================================================

async function main() {
  const startTime = Date.now();
  const options = parseArgs();

  console.log('\n' + '═'.repeat(60));
  console.log('PANDA CRM COMPREHENSIVE DAILY SYNC');
  console.log('═'.repeat(60));
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`Mode: ${options.dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Sync Type: ${options.force ? 'FULL' : `INCREMENTAL (last ${options.hours} hours)`}`);
  if (options.objects) {
    console.log(`Objects: ${options.objects.join(', ')}`);
  }

  // Calculate since date for incremental sync
  const sinceDate = new Date();
  sinceDate.setHours(sinceDate.getHours() - options.hours);
  console.log(`Since: ${sinceDate.toISOString()}`);

  try {
    const conn = await getSalesforceConnection();
    const idMaps = await buildIdMaps();

    const results = {};
    const allObjects = ['users', 'accounts', 'contacts', 'leads', 'opportunities', 'tasks', 'invoices', 'payments'];
    const objectsToSync = options.objects || allObjects;

    for (const obj of objectsToSync) {
      switch (obj.toLowerCase()) {
        case 'users':
          results.users = await syncUsers(conn, idMaps, options, sinceDate);
          break;
        case 'accounts':
          results.accounts = await syncAccounts(conn, idMaps, options, sinceDate);
          // Rebuild ID maps after accounts sync to catch new records
          idMaps.accountIdMap = new Map(
            (await prisma.account.findMany({ select: { id: true, salesforceId: true } }))
              .map(a => [a.salesforceId, a.id])
          );
          break;
        case 'contacts':
          results.contacts = await syncContacts(conn, idMaps, options, sinceDate);
          idMaps.contactIdMap = new Map(
            (await prisma.contact.findMany({ select: { id: true, salesforceId: true } }))
              .map(c => [c.salesforceId, c.id])
          );
          break;
        case 'leads':
          results.leads = await syncLeads(conn, idMaps, options, sinceDate);
          idMaps.leadIdMap = new Map(
            (await prisma.lead.findMany({ select: { id: true, salesforceId: true } }))
              .map(l => [l.salesforceId, l.id])
          );
          break;
        case 'opportunities':
          results.opportunities = await syncOpportunities(conn, idMaps, options, sinceDate);
          idMaps.opportunityIdMap = new Map(
            (await prisma.opportunity.findMany({ select: { id: true, salesforceId: true } }))
              .map(o => [o.salesforceId, o.id])
          );
          break;
        case 'tasks':
          results.tasks = await syncTasks(conn, idMaps, options, sinceDate);
          break;
        case 'invoices':
          results.invoices = await syncInvoices(conn, idMaps, options, sinceDate);
          break;
        case 'payments':
          results.payments = await syncPayments(conn, idMaps, options, sinceDate);
          break;
        default:
          console.log(`Unknown object type: ${obj}`);
      }
    }

    // Save sync state
    if (!options.dryRun) {
      const state = loadSyncState();
      state.lastSync = new Date().toISOString();
      state.results = results;
      saveSyncState(state);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    console.log('\n' + '═'.repeat(60));
    console.log('SYNC COMPLETE');
    console.log('═'.repeat(60));
    console.log(`Duration: ${elapsed}s`);
    console.log('\nResults:');

    let totalSynced = 0, totalCreated = 0, totalErrors = 0;
    for (const [obj, result] of Object.entries(results)) {
      const created = result.created || 0;
      console.log(`  ${obj.padEnd(15)} Updated: ${result.synced}, Created: ${created}, Errors: ${result.errors}`);
      totalSynced += result.synced;
      totalCreated += created;
      totalErrors += result.errors;
    }

    console.log(`\n  TOTAL          Updated: ${totalSynced}, Created: ${totalCreated}, Errors: ${totalErrors}`);

  } catch (error) {
    console.error('\nSync failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
