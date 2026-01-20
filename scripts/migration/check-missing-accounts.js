// Check for missing Accounts that have Work Orders in Salesforce
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

async function checkMissingAccounts() {
  console.log('Checking for missing Accounts that have Work Orders...\n');

  const conn = await getConnection();

  // Get all Account IDs from our database
  const accounts = await prisma.account.findMany({
    select: { salesforceId: true },
  });
  const localAccountIds = new Set(accounts.map(a => a.salesforceId));
  console.log('Accounts in CRM:', localAccountIds.size);

  // Get all WorkOrder AccountIds from Salesforce
  const result = await conn.query(`
    SELECT AccountId, COUNT(Id) cnt
    FROM WorkOrder
    WHERE AccountId != null
    GROUP BY AccountId
  `);

  // Find Account IDs that have Work Orders but are not in our database
  const missingAccountIds = [];
  let missingWOCount = 0;
  for (const r of result.records) {
    if (!localAccountIds.has(r.AccountId)) {
      missingAccountIds.push(r.AccountId);
      missingWOCount += r.cnt;
    }
  }

  console.log('SF Accounts with Work Orders:', result.records.length);
  console.log('Missing Accounts in CRM:', missingAccountIds.length);
  console.log('Work Orders on missing Accounts:', missingWOCount);

  // Check if we also have WOs without AccountId
  const noAccountResult = await conn.query(`
    SELECT COUNT(Id) cnt FROM WorkOrder WHERE AccountId = null
  `);
  console.log('\nWork Orders without AccountId in SF:', noAccountResult.records[0].cnt);

  // Get details of a few missing accounts
  if (missingAccountIds.length > 0) {
    console.log('\nSample of missing Account IDs (first 10):');
    const sampleIds = missingAccountIds.slice(0, 10);
    const accountDetails = await conn.query(`
      SELECT Id, Name, CreatedDate FROM Account WHERE Id IN ('${sampleIds.join("','")}')
    `);
    accountDetails.records.forEach(a => {
      console.log('  ' + a.Id + ' | ' + a.Name + ' | Created: ' + a.CreatedDate);
    });
  }

  await prisma.$disconnect();
}

checkMissingAccounts().catch(console.error);
