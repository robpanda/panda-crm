#!/usr/bin/env node
/**
 * Fix Lead Statuses Script
 * Updates lead status values to match Salesforce Status field properly
 */

import jsforce from 'jsforce';
import { PrismaClient } from '../../shared/node_modules/@prisma/client/index.js';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

function mapLeadStatus(sfStatus) {
  const statusMap = {
    // New/Not Contacted statuses -> NEW
    'New': 'NEW',
    'Open - Not Contacted': 'NEW',
    'Raw lead': 'NEW',
    'Not Home/No Answer': 'NEW',
    'Not Set': 'NEW',

    // Working/Contacted statuses -> CONTACTED
    'Working - Contacted': 'CONTACTED',
    'Contacted': 'CONTACTED',
    'Working': 'CONTACTED',
    'Lead Not Set': 'CONTACTED',  // Attempted contact but not set

    // Qualified/Set statuses -> QUALIFIED
    'Qualified': 'QUALIFIED',
    'Lead Set': 'QUALIFIED',  // Appointment set = qualified
    'Inspection Scheduled': 'QUALIFIED',
    'Service Agreement': 'QUALIFIED',  // Has agreement = qualified

    // Unqualified/Canceled statuses -> UNQUALIFIED
    'Unqualified': 'UNQUALIFIED',
    'Canceled': 'UNQUALIFIED',
    'Closed - Not Converted': 'UNQUALIFIED',

    // Converted/Completed statuses -> CONVERTED
    'Closed - Converted': 'CONVERTED',
    'Converted': 'CONVERTED',
    'Completed': 'CONVERTED',  // Completed = converted
  };
  return statusMap[sfStatus] || 'NEW';
}

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

async function fixLeadStatuses(conn) {
  console.log('\n=== Fixing Lead Statuses ===');

  const leads = await prisma.lead.findMany({
    where: { salesforceId: { not: null } },
    select: { id: true, salesforceId: true, status: true }
  });

  console.log(`Found ${leads.length} leads with Salesforce IDs`);
  if (leads.length === 0) return { updated: 0, unchanged: 0, errors: 0 };

  const batchSize = 200;
  let updated = 0;
  let unchanged = 0;
  let errors = 0;

  // Track status changes for summary
  const statusChanges = {};

  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);
    const sfIds = batch.map(l => `'${l.salesforceId}'`).join(',');

    try {
      const result = await conn.query(`SELECT Id, Status FROM Lead WHERE Id IN (${sfIds})`);
      const statusMap = new Map();
      result.records.forEach(r => statusMap.set(r.Id, r.Status));

      for (const lead of batch) {
        const sfStatus = statusMap.get(lead.salesforceId);
        if (sfStatus) {
          const newStatus = mapLeadStatus(sfStatus);

          if (lead.status !== newStatus) {
            try {
              await prisma.lead.update({
                where: { id: lead.id },
                data: { status: newStatus }
              });
              updated++;

              // Track the change for summary
              const changeKey = `${sfStatus} -> ${newStatus}`;
              statusChanges[changeKey] = (statusChanges[changeKey] || 0) + 1;
            } catch (err) {
              errors++;
              if (errors <= 5) console.error(`  Error updating lead ${lead.id}: ${err.message}`);
            }
          } else {
            unchanged++;
          }
        }
      }
      console.log(`  Processed ${Math.min(i + batchSize, leads.length)}/${leads.length} leads (updated: ${updated}, unchanged: ${unchanged})`);
    } catch (err) {
      console.error(`  Batch error: ${err.message}`);
      errors += batch.length;
    }
  }

  // Print status change summary
  console.log('\nStatus Changes Summary:');
  Object.entries(statusChanges)
    .sort((a, b) => b[1] - a[1])
    .forEach(([change, count]) => {
      console.log(`  ${change}: ${count}`);
    });

  return { updated, unchanged, errors };
}

async function main() {
  console.log('='.repeat(60));
  console.log('FIX LEAD STATUSES FROM SALESFORCE');
  console.log('='.repeat(60));
  console.log('');

  try {
    const conn = await getConnection();
    const results = await fixLeadStatuses(conn);

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Updated: ${results.updated}`);
    console.log(`Unchanged: ${results.unchanged}`);
    console.log(`Errors: ${results.errors}`);

  } catch (error) {
    console.error('Script failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
