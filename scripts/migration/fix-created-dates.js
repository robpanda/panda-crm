#!/usr/bin/env node
/**
 * Fix Created Dates Script
 * Updates createdAt timestamps for all migrated records to match Salesforce CreatedDate
 */

import jsforce from 'jsforce';
import { PrismaClient } from '../../shared/node_modules/@prisma/client/index.js';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function getConnection() {
  const connection = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
  });
  await connection.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
  );
  console.log('Connected to Salesforce:', connection.instanceUrl);
  return connection;
}

async function fixLeadDates(conn) {
  console.log('\n=== Fixing Lead Created Dates ===');

  const leads = await prisma.lead.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true, createdAt: true }
  });

  console.log(`Found ${leads.length} leads with Salesforce IDs`);
  if (leads.length === 0) return { updated: 0, errors: 0 };

  const batchSize = 200;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    const sfIds = batch.map(l => `'${l.salesforceId}'`).join(',');

    try {
      const result = await conn.query(`SELECT Id, CreatedDate FROM Lead WHERE Id IN (${sfIds})`);
      const dateMap = new Map();
      result.records.forEach(r => dateMap.set(r.Id, new Date(r.CreatedDate)));

      for (const lead of batch) {
        const sfCreatedDate = dateMap.get(lead.salesforceId);
        if (sfCreatedDate) {
          try {
            await prisma.lead.update({
              where: { id: lead.id },
              data: { createdAt: sfCreatedDate }
            });
            updated++;
          } catch (err) {
            errors++;
            if (errors <= 5) console.error(`  Error updating lead ${lead.id}: ${err.message}`);
          }
        }
      }
      console.log(`  Processed ${Math.min(i + batchSize, leads.length)}/${leads.length} leads (updated: ${updated})`);
    } catch (err) {
      console.error(`  Batch error: ${err.message}`);
      errors += batch.length;
    }
  }
  return { updated, errors };
}

async function fixContactDates(conn) {
  console.log('\n=== Fixing Contact Created Dates ===');

  const contacts = await prisma.contact.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true, createdAt: true }
  });

  console.log(`Found ${contacts.length} contacts with Salesforce IDs`);
  if (contacts.length === 0) return { updated: 0, errors: 0 };

  const batchSize = 200;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);
    const sfIds = batch.map(c => `'${c.salesforceId}'`).join(',');

    try {
      const result = await conn.query(`SELECT Id, CreatedDate FROM Contact WHERE Id IN (${sfIds})`);
      const dateMap = new Map();
      result.records.forEach(r => dateMap.set(r.Id, new Date(r.CreatedDate)));

      for (const contact of batch) {
        const sfCreatedDate = dateMap.get(contact.salesforceId);
        if (sfCreatedDate) {
          try {
            await prisma.contact.update({
              where: { id: contact.id },
              data: { createdAt: sfCreatedDate }
            });
            updated++;
          } catch (err) {
            errors++;
            if (errors <= 5) console.error(`  Error updating contact ${contact.id}: ${err.message}`);
          }
        }
      }
      console.log(`  Processed ${Math.min(i + batchSize, contacts.length)}/${contacts.length} contacts (updated: ${updated})`);
    } catch (err) {
      console.error(`  Batch error: ${err.message}`);
      errors += batch.length;
    }
  }
  return { updated, errors };
}

async function fixAccountDates(conn) {
  console.log('\n=== Fixing Account Created Dates ===');

  const accounts = await prisma.account.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true, createdAt: true }
  });

  console.log(`Found ${accounts.length} accounts with Salesforce IDs`);
  if (accounts.length === 0) return { updated: 0, errors: 0 };

  const batchSize = 200;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < accounts.length; i += batchSize) {
    const batch = accounts.slice(i, i + batchSize);
    const sfIds = batch.map(a => `'${a.salesforceId}'`).join(',');

    try {
      const result = await conn.query(`SELECT Id, CreatedDate FROM Account WHERE Id IN (${sfIds})`);
      const dateMap = new Map();
      result.records.forEach(r => dateMap.set(r.Id, new Date(r.CreatedDate)));

      for (const account of batch) {
        const sfCreatedDate = dateMap.get(account.salesforceId);
        if (sfCreatedDate) {
          try {
            await prisma.account.update({
              where: { id: account.id },
              data: { createdAt: sfCreatedDate }
            });
            updated++;
          } catch (err) {
            errors++;
            if (errors <= 5) console.error(`  Error updating account ${account.id}: ${err.message}`);
          }
        }
      }
      console.log(`  Processed ${Math.min(i + batchSize, accounts.length)}/${accounts.length} accounts (updated: ${updated})`);
    } catch (err) {
      console.error(`  Batch error: ${err.message}`);
      errors += batch.length;
    }
  }
  return { updated, errors };
}

async function fixOpportunityDates(conn) {
  console.log('\n=== Fixing Opportunity Created Dates ===');

  const opportunities = await prisma.opportunity.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true, createdAt: true }
  });

  console.log(`Found ${opportunities.length} opportunities with Salesforce IDs`);
  if (opportunities.length === 0) return { updated: 0, errors: 0 };

  const batchSize = 200;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < opportunities.length; i += batchSize) {
    const batch = opportunities.slice(i, i + batchSize);
    const sfIds = batch.map(o => `'${o.salesforceId}'`).join(',');

    try {
      const result = await conn.query(`SELECT Id, CreatedDate FROM Opportunity WHERE Id IN (${sfIds})`);
      const dateMap = new Map();
      result.records.forEach(r => dateMap.set(r.Id, new Date(r.CreatedDate)));

      for (const opp of batch) {
        const sfCreatedDate = dateMap.get(opp.salesforceId);
        if (sfCreatedDate) {
          try {
            await prisma.opportunity.update({
              where: { id: opp.id },
              data: { createdAt: sfCreatedDate }
            });
            updated++;
          } catch (err) {
            errors++;
            if (errors <= 5) console.error(`  Error updating opportunity ${opp.id}: ${err.message}`);
          }
        }
      }
      console.log(`  Processed ${Math.min(i + batchSize, opportunities.length)}/${opportunities.length} opportunities (updated: ${updated})`);
    } catch (err) {
      console.error(`  Batch error: ${err.message}`);
      errors += batch.length;
    }
  }
  return { updated, errors };
}

async function fixWorkOrderDates(conn) {
  console.log('\n=== Fixing Work Order Created Dates ===');

  const workOrders = await prisma.workOrder.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true, createdAt: true }
  });

  console.log(`Found ${workOrders.length} work orders with Salesforce IDs`);
  if (workOrders.length === 0) return { updated: 0, errors: 0 };

  const batchSize = 200;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < workOrders.length; i += batchSize) {
    const batch = workOrders.slice(i, i + batchSize);
    const sfIds = batch.map(w => `'${w.salesforceId}'`).join(',');

    try {
      const result = await conn.query(`SELECT Id, CreatedDate FROM WorkOrder WHERE Id IN (${sfIds})`);
      const dateMap = new Map();
      result.records.forEach(r => dateMap.set(r.Id, new Date(r.CreatedDate)));

      for (const wo of batch) {
        const sfCreatedDate = dateMap.get(wo.salesforceId);
        if (sfCreatedDate) {
          try {
            await prisma.workOrder.update({
              where: { id: wo.id },
              data: { createdAt: sfCreatedDate }
            });
            updated++;
          } catch (err) {
            errors++;
            if (errors <= 5) console.error(`  Error updating work order ${wo.id}: ${err.message}`);
          }
        }
      }
      console.log(`  Processed ${Math.min(i + batchSize, workOrders.length)}/${workOrders.length} work orders (updated: ${updated})`);
    } catch (err) {
      console.error(`  Batch error: ${err.message}`);
      errors += batch.length;
    }
  }
  return { updated, errors };
}

async function main() {
  console.log('='.repeat(60));
  console.log('FIX CREATED DATES FROM SALESFORCE');
  console.log('='.repeat(60));
  console.log('');

  try {
    const conn = await getConnection();

    const leadResults = await fixLeadDates(conn);
    const contactResults = await fixContactDates(conn);
    const accountResults = await fixAccountDates(conn);
    const oppResults = await fixOpportunityDates(conn);
    const woResults = await fixWorkOrderDates(conn);

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Leads:         ${leadResults.updated} updated, ${leadResults.errors} errors`);
    console.log(`Contacts:      ${contactResults.updated} updated, ${contactResults.errors} errors`);
    console.log(`Accounts:      ${accountResults.updated} updated, ${accountResults.errors} errors`);
    console.log(`Opportunities: ${oppResults.updated} updated, ${oppResults.errors} errors`);
    console.log(`Work Orders:   ${woResults.updated} updated, ${woResults.errors} errors`);

    const totalUpdated = leadResults.updated + contactResults.updated + accountResults.updated +
                        oppResults.updated + woResults.updated;
    const totalErrors = leadResults.errors + contactResults.errors + accountResults.errors +
                       oppResults.errors + woResults.errors;

    console.log('');
    console.log(`TOTAL: ${totalUpdated} records updated, ${totalErrors} errors`);

  } catch (error) {
    console.error('Script failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
