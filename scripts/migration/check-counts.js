#!/usr/bin/env node
// Check record counts in Salesforce vs PostgreSQL

import jsforce from 'jsforce';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Client } = pg;

async function getSalesforceCounts() {
  const conn = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
    instanceUrl: process.env.SF_INSTANCE_URL,
    accessToken: process.env.SF_ACCESS_TOKEN,
  });

  if (!process.env.SF_ACCESS_TOKEN) {
    await conn.login(
      process.env.SF_USERNAME,
      process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
    );
  }

  const queries = [
    { name: 'Leads', soql: 'SELECT COUNT() FROM Lead' },
    { name: 'Accounts', soql: 'SELECT COUNT() FROM Account' },
    { name: 'Contacts', soql: 'SELECT COUNT() FROM Contact' },
    { name: 'Opportunities', soql: 'SELECT COUNT() FROM Opportunity' },
    { name: 'Users (Active)', soql: 'SELECT COUNT() FROM User WHERE IsActive = true' },
    { name: 'Tasks', soql: 'SELECT COUNT() FROM Task' },
    { name: 'Events', soql: 'SELECT COUNT() FROM Event' },
  ];

  console.log('=== Salesforce Record Counts ===');
  const sfCounts = {};
  for (const q of queries) {
    const result = await conn.query(q.soql);
    console.log(`${q.name}: ${result.totalSize}`);
    sfCounts[q.name] = result.totalSize;
  }
  return sfCounts;
}

async function getPostgresCounts() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  await client.connect();

  const queries = [
    { name: 'Leads', sql: 'SELECT COUNT(*) as total, COUNT(owner_id) as with_owner FROM leads' },
    { name: 'Accounts', sql: 'SELECT COUNT(*) as total, COUNT(owner_id) as with_owner FROM accounts' },
    { name: 'Contacts', sql: 'SELECT COUNT(*) as total, COUNT(created_by_id) as with_owner FROM contacts' },
    { name: 'Opportunities', sql: 'SELECT COUNT(*) as total, COUNT(owner_id) as with_owner FROM opportunities' },
    { name: 'Users', sql: 'SELECT COUNT(*) as total FROM users' },
    { name: 'Tasks', sql: 'SELECT COUNT(*) as total, COUNT(assigned_to_id) as with_owner FROM tasks' },
    { name: 'Events', sql: 'SELECT COUNT(*) as total, COUNT(owner_id) as with_owner FROM events' },
  ];

  console.log('\n=== PostgreSQL Record Counts ===');
  for (const q of queries) {
    const result = await client.query(q.sql);
    const row = result.rows[0];
    if (row.with_owner !== undefined) {
      console.log(`${q.name}: ${row.total} total, ${row.with_owner} with owner (${Math.round(row.with_owner/row.total*100)}%)`);
    } else {
      console.log(`${q.name}: ${row.total}`);
    }
  }

  await client.end();
}

async function main() {
  try {
    await getSalesforceCounts();
    await getPostgresCounts();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

main();
