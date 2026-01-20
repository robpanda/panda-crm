/**
 * Lambda Handler for Comprehensive Daily Salesforce Sync
 *
 * This is a wrapper around comprehensive-daily-sync.js for Lambda execution.
 * It runs the daily sync and reports results to CloudWatch.
 */

import { PrismaClient } from '@prisma/client';
import jsforce from 'jsforce';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });

// Configuration
const BATCH_SIZE = 200;
const DEFAULT_HOURS = 24;

// Task status mapping (Salesforce -> Prisma enum)
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
};

// Get Salesforce connection
async function getSalesforceConnection() {
  const command = new GetSecretValueCommand({ SecretId: 'salesforce-api-credentials' });
  const response = await secretsClient.send(command);
  const secrets = JSON.parse(response.SecretString);

  const conn = new jsforce.Connection({
    instanceUrl: secrets.instance_url || 'https://ability-saas-2460.my.salesforce.com',
  });

  await conn.login(
    secrets.username,
    secrets.password + (secrets.security_token || '')
  );

  console.log('Connected to Salesforce:', conn.instanceUrl);
  return conn;
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

// Build ID maps for foreign key resolution
async function buildIdMaps() {
  const [accounts, contacts, opportunities, users, contracts, workOrders, leads] = await Promise.all([
    prisma.account.findMany({ select: { id: true, salesforceId: true } }),
    prisma.contact.findMany({ select: { id: true, salesforceId: true } }),
    prisma.opportunity.findMany({ select: { id: true, salesforceId: true } }),
    prisma.user.findMany({ select: { id: true, salesforceId: true } }),
    prisma.serviceContract.findMany({ select: { id: true, salesforceId: true } }),
    prisma.workOrder.findMany({ select: { id: true, salesforceId: true } }),
    prisma.lead.findMany({ select: { id: true, salesforceId: true } }),
  ]);

  const idMaps = {
    accounts: new Map(accounts.map(a => [a.salesforceId, a.id])),
    contacts: new Map(contacts.map(c => [c.salesforceId, c.id])),
    opportunities: new Map(opportunities.map(o => [o.salesforceId, o.id])),
    users: new Map(users.map(u => [u.salesforceId, u.id])),
    contracts: new Map(contracts.map(c => [c.salesforceId, c.id])),
    workOrders: new Map(workOrders.map(w => [w.salesforceId, w.id])),
    leads: new Map(leads.map(l => [l.salesforceId, l.id])),
  };

  console.log(`  Accounts: ${idMaps.accounts.size}, Contacts: ${idMaps.contacts.size}, Opportunities: ${idMaps.opportunities.size}`);
  console.log(`  Users: ${idMaps.users.size}, Contracts: ${idMaps.contracts.size}, WorkOrders: ${idMaps.workOrders.size}, Leads: ${idMaps.leads.size}`);

  return idMaps;
}

// Sync Users
async function syncUsers(conn, sinceDate, results) {
  const whereClause = sinceDate ? `WHERE LastModifiedDate >= ${sinceDate}` : '';
  const soql = `SELECT Id, FirstName, LastName, Name, Email, Username, IsActive, UserRole.Name, Department, Phone, MobilePhone FROM User ${whereClause}`;

  const records = await querySalesforce(conn, soql);
  let synced = 0, skipped = 0, errors = 0;

  for (const record of records) {
    try {
      const data = {
        salesforceId: record.Id,
        firstName: record.FirstName || '',
        lastName: record.LastName || '',
        email: record.Email || `${record.Id}@placeholder.com`,
        username: record.Username || record.Email,
        isActive: record.IsActive !== false,
        role: record.UserRole?.Name || null,
        department: record.Department || null,
        phone: record.Phone || null,
        mobilePhone: record.MobilePhone || null,
      };

      await prisma.user.upsert({
        where: { salesforceId: record.Id },
        update: data,
        create: data,
      });
      synced++;
    } catch (err) {
      console.error(`  Error syncing user ${record.Id}:`, err.message);
      errors++;
    }
  }

  results.users = { synced, skipped, errors };
  console.log(`  Synced: ${synced}, Skipped: ${skipped}, Errors: ${errors}`);
}

// Sync Accounts
async function syncAccounts(conn, sinceDate, idMaps, results) {
  const whereClause = sinceDate ? `WHERE LastModifiedDate >= ${sinceDate}` : '';
  const fields = [
    'Id', 'Name', 'AccountNumber',
    'BillingStreet', 'BillingCity', 'BillingState', 'BillingPostalCode', 'BillingCountry',
    'ShippingStreet', 'ShippingCity', 'ShippingState', 'ShippingPostalCode', 'ShippingCountry',
    'Phone', 'Website',
    'Type', 'Industry', 'Description',
    'OwnerId',
    'CreatedDate', 'LastModifiedDate',
  ];
  const soql = `SELECT ${fields.join(', ')} FROM Account ${whereClause}`;

  const records = await querySalesforce(conn, soql);
  let updated = 0, created = 0, errors = 0;

  for (const record of records) {
    try {
      const ownerId = idMaps.users.get(record.OwnerId);
      const data = {
        name: record.Name || 'Unnamed Account',
        accountNumber: record.AccountNumber || null,
        billingStreet: record.BillingStreet || null,
        billingCity: record.BillingCity || null,
        billingState: record.BillingState || null,
        billingPostalCode: record.BillingPostalCode || null,
        billingCountry: record.BillingCountry || null,
        shippingStreet: record.ShippingStreet || null,
        shippingCity: record.ShippingCity || null,
        shippingState: record.ShippingState || null,
        shippingPostalCode: record.ShippingPostalCode || null,
        shippingCountry: record.ShippingCountry || null,
        phone: record.Phone || null,
        website: record.Website || null,
        type: record.Type || null,
        industry: record.Industry || null,
        description: record.Description || null,
        updatedAt: new Date(record.LastModifiedDate),
        createdAt: new Date(record.CreatedDate),
      };

      if (ownerId) {
        data.owner = { connect: { id: ownerId } };
      }

      const existing = await prisma.account.findUnique({ where: { salesforceId: record.Id } });
      if (existing) {
        await prisma.account.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.account.create({ data: { ...data, salesforceId: record.Id } });
        created++;
        idMaps.accounts.set(record.Id, record.Id);
      }
    } catch (err) {
      console.error(`  Error syncing account ${record.Id}:`, err.message);
      errors++;
    }
  }

  results.accounts = { updated, created, errors };
  console.log(`  Updated: ${updated}, Created: ${created}, Errors: ${errors}`);
}

// Sync Contacts
async function syncContacts(conn, sinceDate, idMaps, results) {
  const whereClause = sinceDate ? `WHERE LastModifiedDate >= ${sinceDate}` : '';
  const fields = [
    'Id', 'FirstName', 'LastName', 'Name', 'Email', 'Phone', 'MobilePhone',
    'Title', 'Department', 'AccountId',
    'MailingStreet', 'MailingCity', 'MailingState', 'MailingPostalCode',
    'HasOptedOutOfEmail', 'DoNotCall',
    'CreatedDate', 'LastModifiedDate',
  ];
  const soql = `SELECT ${fields.join(', ')} FROM Contact ${whereClause}`;

  const records = await querySalesforce(conn, soql);
  let updated = 0, created = 0, errors = 0;

  for (const record of records) {
    try {
      const accountId = idMaps.accounts.get(record.AccountId);
      const data = {
        firstName: record.FirstName || '',
        lastName: record.LastName || '',
        email: record.Email || null,
        phone: record.Phone || null,
        mobilePhone: record.MobilePhone || null,
        title: record.Title || null,
        department: record.Department || null,
        mailingStreet: record.MailingStreet || null,
        mailingCity: record.MailingCity || null,
        mailingState: record.MailingState || null,
        mailingPostalCode: record.MailingPostalCode || null,
        hasOptedOutOfEmail: record.HasOptedOutOfEmail || false,
        doNotCall: record.DoNotCall || false,
        updatedAt: new Date(record.LastModifiedDate),
        createdAt: new Date(record.CreatedDate),
      };

      if (accountId) {
        data.account = { connect: { id: accountId } };
      }

      const existing = await prisma.contact.findUnique({ where: { salesforceId: record.Id } });
      if (existing) {
        await prisma.contact.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.contact.create({ data: { ...data, salesforceId: record.Id } });
        created++;
        idMaps.contacts.set(record.Id, record.Id);
      }
    } catch (err) {
      console.error(`  Error syncing contact ${record.Id}:`, err.message);
      errors++;
    }
  }

  results.contacts = { updated, created, errors };
  console.log(`  Updated: ${updated}, Created: ${created}, Errors: ${errors}`);
}

// Sync Leads
async function syncLeads(conn, sinceDate, idMaps, results) {
  const whereClause = sinceDate ? `WHERE LastModifiedDate >= ${sinceDate}` : '';
  const fields = [
    'Id', 'FirstName', 'LastName', 'Name', 'Email', 'Phone', 'MobilePhone',
    'Company', 'Title', 'Industry',
    'Street', 'City', 'State', 'PostalCode', 'Country',
    'Status', 'LeadSource', 'Rating',
    'Description', 'OwnerId',
    'HasOptedOutOfEmail', 'DoNotCall',
    'CreatedDate', 'LastModifiedDate',
  ];
  const soql = `SELECT ${fields.join(', ')} FROM Lead ${whereClause}`;

  const records = await querySalesforce(conn, soql);
  let updated = 0, created = 0, errors = 0;

  for (const record of records) {
    try {
      const ownerId = idMaps.users.get(record.OwnerId);
      const data = {
        firstName: record.FirstName || '',
        lastName: record.LastName || '',
        email: record.Email || null,
        phone: record.Phone || null,
        mobilePhone: record.MobilePhone || null,
        company: record.Company || null,
        title: record.Title || null,
        industry: record.Industry || null,
        street: record.Street || null,
        city: record.City || null,
        state: record.State || null,
        postalCode: record.PostalCode || null,
        country: record.Country || null,
        status: record.Status || 'NEW',
        leadSource: record.LeadSource || null,
        rating: record.Rating || null,
        description: record.Description || null,
        hasOptedOutOfEmail: record.HasOptedOutOfEmail || false,
        doNotCall: record.DoNotCall || false,
        updatedAt: new Date(record.LastModifiedDate),
        createdAt: new Date(record.CreatedDate),
      };

      if (ownerId) {
        data.owner = { connect: { id: ownerId } };
      }

      const existing = await prisma.lead.findUnique({ where: { salesforceId: record.Id } });
      if (existing) {
        await prisma.lead.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.lead.create({ data: { ...data, salesforceId: record.Id } });
        created++;
        idMaps.leads.set(record.Id, record.Id);
      }
    } catch (err) {
      console.error(`  Error syncing lead ${record.Id}:`, err.message);
      errors++;
    }
  }

  results.leads = { updated, created, errors };
  console.log(`  Updated: ${updated}, Created: ${created}, Errors: ${errors}`);
}

// Sync Opportunities
async function syncOpportunities(conn, sinceDate, idMaps, results) {
  const whereClause = sinceDate ? `WHERE LastModifiedDate >= ${sinceDate}` : '';
  const fields = [
    'Id', 'Name', 'Description',
    'StageName', 'Probability',
    'CloseDate', 'Amount',
    'Type', 'LeadSource',
    'AccountId', 'ContactId', 'OwnerId',
    'IsClosed', 'IsWon',
    'CreatedDate', 'LastModifiedDate',
  ];
  const soql = `SELECT ${fields.join(', ')} FROM Opportunity ${whereClause}`;

  const records = await querySalesforce(conn, soql);
  let updated = 0, created = 0, errors = 0;

  for (const record of records) {
    try {
      const accountId = idMaps.accounts.get(record.AccountId);
      const contactId = idMaps.contacts.get(record.ContactId);
      const ownerId = idMaps.users.get(record.OwnerId);

      const data = {
        name: record.Name || 'Unnamed Opportunity',
        description: record.Description || null,
        stageName: record.StageName || null,
        probability: record.Probability != null ? record.Probability : null,
        closeDate: record.CloseDate ? new Date(record.CloseDate) : null,
        amount: record.Amount != null ? record.Amount : null,
        type: record.Type || null,
        leadSource: record.LeadSource || null,
        updatedAt: new Date(record.LastModifiedDate),
        createdAt: new Date(record.CreatedDate),
      };

      if (accountId) data.account = { connect: { id: accountId } };
      if (contactId) data.contact = { connect: { id: contactId } };
      if (ownerId) data.owner = { connect: { id: ownerId } };

      const existing = await prisma.opportunity.findUnique({ where: { salesforceId: record.Id } });
      if (existing) {
        await prisma.opportunity.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.opportunity.create({ data: { ...data, salesforceId: record.Id } });
        created++;
        idMaps.opportunities.set(record.Id, record.Id);
      }
    } catch (err) {
      console.error(`  Error syncing opportunity ${record.Id}:`, err.message);
      errors++;
    }
  }

  results.opportunities = { updated, created, errors };
  console.log(`  Updated: ${updated}, Created: ${created}, Errors: ${errors}`);
}

// Sync Tasks
async function syncTasks(conn, sinceDate, idMaps, results) {
  const whereClause = sinceDate ? `WHERE LastModifiedDate >= ${sinceDate}` : '';
  const fields = [
    'Id', 'Subject', 'Description', 'Status', 'Priority',
    'WhoId', 'WhatId', 'OwnerId',
    'ActivityDate', 'CompletedDateTime',
    'CreatedDate', 'LastModifiedDate',
  ];
  const soql = `SELECT ${fields.join(', ')} FROM Task ${whereClause}`;

  const records = await querySalesforce(conn, soql);
  let updated = 0, created = 0, errors = 0;

  for (const record of records) {
    try {
      // Map Salesforce status to Prisma enum
      const sfStatus = record.Status || 'Not Started';
      const status = TASK_STATUS_MAP[sfStatus] || 'NOT_STARTED';

      // Map priority
      let priority = 'NORMAL';
      if (record.Priority === 'High') priority = 'HIGH';
      else if (record.Priority === 'Low') priority = 'LOW';

      // Resolve WhoId (Lead or Contact) and WhatId (Opportunity or Account)
      let leadId = null;
      let opportunityId = null;
      let assignedToId = null;

      if (record.WhoId) {
        leadId = idMaps.leads.get(record.WhoId);
      }
      if (record.WhatId) {
        opportunityId = idMaps.opportunities.get(record.WhatId);
      }
      if (record.OwnerId) {
        assignedToId = idMaps.users.get(record.OwnerId);
      }

      const data = {
        subject: record.Subject || 'No Subject',
        description: record.Description || null,
        status,
        priority,
        dueDate: record.ActivityDate ? new Date(record.ActivityDate) : null,
        completedDate: record.CompletedDateTime ? new Date(record.CompletedDateTime) : null,
        updatedAt: new Date(record.LastModifiedDate),
        createdAt: new Date(record.CreatedDate),
      };

      // Add relations using connect syntax
      if (leadId) data.lead = { connect: { id: leadId } };
      if (opportunityId) data.opportunity = { connect: { id: opportunityId } };
      if (assignedToId) data.assignedTo = { connect: { id: assignedToId } };

      const existing = await prisma.task.findUnique({ where: { salesforceId: record.Id } });
      if (existing) {
        await prisma.task.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.task.create({ data: { ...data, salesforceId: record.Id } });
        created++;
      }
    } catch (err) {
      console.error(`  Error syncing task ${record.Id}:`, err.message);
      errors++;
    }
  }

  results.tasks = { updated, created, errors };
  console.log(`  Updated: ${updated}, Created: ${created}, Errors: ${errors}`);
}

// Main Lambda handler
export async function handler(event) {
  const startTime = new Date();
  console.log('\n════════════════════════════════════════════════════════════');
  console.log('PANDA CRM COMPREHENSIVE DAILY SYNC (Lambda)');
  console.log('════════════════════════════════════════════════════════════');
  console.log('Started:', startTime.toISOString());

  // Get hours from event or default to 24
  const hours = event?.hours || DEFAULT_HOURS;
  const sinceDate = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  console.log('Mode: LIVE');
  console.log(`Sync Type: INCREMENTAL (last ${hours} hours)`);
  console.log('Since:', sinceDate);

  const results = {};

  try {
    const conn = await getSalesforceConnection();

    console.log('Building ID maps for foreign key resolution...');
    const idMaps = await buildIdMaps();

    // Sync each object type
    console.log('\n──────────────────────────────────────────────────');
    console.log('Syncing Users...');
    await syncUsers(conn, sinceDate, results);

    console.log('\n──────────────────────────────────────────────────');
    console.log('Syncing Accounts...');
    await syncAccounts(conn, sinceDate, idMaps, results);

    console.log('\n──────────────────────────────────────────────────');
    console.log('Syncing Contacts...');
    await syncContacts(conn, sinceDate, idMaps, results);

    console.log('\n──────────────────────────────────────────────────');
    console.log('Syncing Leads...');
    await syncLeads(conn, sinceDate, idMaps, results);

    console.log('\n──────────────────────────────────────────────────');
    console.log('Syncing Opportunities...');
    await syncOpportunities(conn, sinceDate, idMaps, results);

    console.log('\n──────────────────────────────────────────────────');
    console.log('Syncing Tasks/Activities...');
    await syncTasks(conn, sinceDate, idMaps, results);

    // Calculate totals
    const endTime = new Date();
    const duration = ((endTime - startTime) / 1000).toFixed(1);

    let totalUpdated = 0, totalCreated = 0, totalErrors = 0;
    for (const [key, val] of Object.entries(results)) {
      totalUpdated += val.updated || val.synced || 0;
      totalCreated += val.created || 0;
      totalErrors += val.errors || 0;
    }

    console.log('\n════════════════════════════════════════════════════════════');
    console.log('SYNC COMPLETE');
    console.log('════════════════════════════════════════════════════════════');
    console.log(`Duration: ${duration}s`);
    console.log('\nResults:');
    for (const [key, val] of Object.entries(results)) {
      const updated = val.updated || val.synced || 0;
      const created = val.created || 0;
      const errors = val.errors || 0;
      console.log(`  ${key.padEnd(15)} Updated: ${updated}, Created: ${created}, Errors: ${errors}`);
    }
    console.log(`\n  TOTAL          Updated: ${totalUpdated}, Created: ${totalCreated}, Errors: ${totalErrors}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        duration: `${duration}s`,
        results,
        totals: { updated: totalUpdated, created: totalCreated, errors: totalErrors },
      }),
    };
  } catch (error) {
    console.error('Sync failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  } finally {
    await prisma.$disconnect();
  }
}
