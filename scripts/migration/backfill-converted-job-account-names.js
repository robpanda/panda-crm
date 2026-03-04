#!/usr/bin/env node
/**
 * Backfill converted Lead naming for Jobs (Opportunities) and Accounts.
 *
 * Rules:
 * - Opportunity.name = "<First Last>" OR "<Company>"
 * - Account.name = "<JobId> <First Last>" OR "<JobId> <Company>"
 *
 * Safe defaults:
 * - Dry run by default.
 * - Account updates are skipped when an account has multiple opportunities.
 *
 * Usage:
 *   node backfill-converted-job-account-names.js
 *   node backfill-converted-job-account-names.js --apply
 *   node backfill-converted-job-account-names.js --apply --limit 500
 */

import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Client } = pg;

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function resolveCustomerName(lead, fallback = '') {
  const firstName = normalizeText(lead.firstName);
  const lastName = normalizeText(lead.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const companyName = normalizeText(lead.company);
  return fullName || companyName || normalizeText(fallback) || 'Customer';
}

function parseArgs() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');

  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex >= 0 ? Number.parseInt(args[limitIndex + 1], 10) : null;

  if (limitIndex >= 0 && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error('Invalid --limit value. Example: --limit 500');
  }

  return {
    apply,
    limit,
  };
}

function chunk(values, size = 500) {
  const output = [];
  for (let i = 0; i < values.length; i += size) {
    output.push(values.slice(i, i + size));
  }
  return output;
}

async function queryByIds(client, sql, ids) {
  if (!ids.length) return [];
  const rows = [];
  for (const batch of chunk(ids, 500)) {
    const result = await client.query(sql, [batch]);
    rows.push(...result.rows);
  }
  return rows;
}

async function main() {
  const { apply, limit } = parseArgs();
  const dryRun = !apply;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const connectionString = process.env.DATABASE_URL
    .replace(/([?&])sslmode=require(&)?/i, (match, prefix, suffix) => (prefix === '?' && !suffix ? '' : prefix))
    .replace(/[?&]$/g, '');

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  console.log('='.repeat(72));
  console.log('Backfill: Converted Lead Job + Account Names');
  console.log('='.repeat(72));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'APPLY (writes enabled)'}`);
  console.log(`Limit: ${limit || 'none'}`);
  console.log('');

  const leadQuery = `
    SELECT
      id,
      first_name AS "firstName",
      last_name AS "lastName",
      company,
      converted_opportunity_id AS "convertedOpportunityId",
      converted_account_id AS "convertedAccountId"
    FROM leads
    WHERE is_converted = true
      AND converted_opportunity_id IS NOT NULL
    ORDER BY converted_date ASC NULLS LAST, created_at ASC
    ${limit ? `LIMIT ${Number(limit)}` : ''}
  `;

  const leadResult = await client.query(leadQuery);
  const leads = leadResult.rows;

  console.log(`Converted leads considered: ${leads.length}`);
  if (leads.length === 0) {
    await client.end();
    return;
  }

  const opportunityIds = [...new Set(leads.map((lead) => lead.convertedOpportunityId).filter(Boolean))];

  const opportunities = await queryByIds(
    client,
    `
      SELECT
        id,
        name,
        job_id AS "jobId",
        account_id AS "accountId",
        deleted_at AS "deletedAt"
      FROM opportunities
      WHERE id = ANY($1::text[])
    `,
    opportunityIds
  );

  const opportunitiesById = new Map(opportunities.map((opp) => [opp.id, opp]));
  const opportunitiesPerAccount = new Map();
  for (const opp of opportunities) {
    opportunitiesPerAccount.set(opp.accountId, (opportunitiesPerAccount.get(opp.accountId) || 0) + 1);
  }

  const accountIds = [...new Set(opportunities.map((opp) => opp.accountId).filter(Boolean))];

  const accounts = await queryByIds(
    client,
    `
      SELECT
        id,
        name,
        deleted_at AS "deletedAt"
      FROM accounts
      WHERE id = ANY($1::text[])
    `,
    accountIds
  );

  const accountsById = new Map(accounts.map((account) => [account.id, account]));

  const opportunityUpdates = new Map();
  const accountUpdates = new Map();

  const stats = {
    leadsProcessed: 0,
    missingOpportunity: 0,
    deletedOpportunity: 0,
    missingAccount: 0,
    deletedAccount: 0,
    sharedAccountSkipped: 0,
    opportunityNeedsUpdate: 0,
    accountNeedsUpdate: 0,
  };

  for (const lead of leads) {
    stats.leadsProcessed += 1;

    const opportunity = opportunitiesById.get(lead.convertedOpportunityId);
    if (!opportunity) {
      stats.missingOpportunity += 1;
      continue;
    }
    if (opportunity.deletedAt) {
      stats.deletedOpportunity += 1;
      continue;
    }

    const accountId = opportunity.accountId || lead.convertedAccountId;
    if (!accountId) {
      stats.missingAccount += 1;
      continue;
    }

    const account = accountsById.get(accountId);
    if (!account) {
      stats.missingAccount += 1;
      continue;
    }
    if (account.deletedAt) {
      stats.deletedAccount += 1;
      continue;
    }

    const customerName = resolveCustomerName(lead, opportunity.name || account.name);
    const desiredOpportunityName = customerName;
    const desiredAccountName = opportunity.jobId ? `${opportunity.jobId} ${customerName}` : customerName;

    if (normalizeText(opportunity.name) !== desiredOpportunityName) {
      opportunityUpdates.set(opportunity.id, {
        id: opportunity.id,
        from: opportunity.name,
        to: desiredOpportunityName,
      });
    }

    const accountOpportunityCount = opportunitiesPerAccount.get(accountId) || 0;
    if (accountOpportunityCount > 1) {
      stats.sharedAccountSkipped += 1;
      continue;
    }

    if (normalizeText(account.name) !== desiredAccountName) {
      accountUpdates.set(account.id, {
        id: account.id,
        from: account.name,
        to: desiredAccountName,
      });
    }
  }

  stats.opportunityNeedsUpdate = opportunityUpdates.size;
  stats.accountNeedsUpdate = accountUpdates.size;

  console.log('');
  console.log('Summary:');
  console.log(`  Leads processed: ${stats.leadsProcessed}`);
  console.log(`  Opportunities to rename: ${stats.opportunityNeedsUpdate}`);
  console.log(`  Accounts to rename: ${stats.accountNeedsUpdate}`);
  console.log(`  Missing opportunities: ${stats.missingOpportunity}`);
  console.log(`  Deleted opportunities skipped: ${stats.deletedOpportunity}`);
  console.log(`  Missing accounts: ${stats.missingAccount}`);
  console.log(`  Deleted accounts skipped: ${stats.deletedAccount}`);
  console.log(`  Shared accounts skipped: ${stats.sharedAccountSkipped}`);

  const opportunitySamples = Array.from(opportunityUpdates.values()).slice(0, 10);
  const accountSamples = Array.from(accountUpdates.values()).slice(0, 10);

  if (opportunitySamples.length > 0) {
    console.log('');
    console.log('Opportunity rename samples:');
    for (const sample of opportunitySamples) {
      console.log(`  ${sample.id}: "${sample.from}" -> "${sample.to}"`);
    }
  }

  if (accountSamples.length > 0) {
    console.log('');
    console.log('Account rename samples:');
    for (const sample of accountSamples) {
      console.log(`  ${sample.id}: "${sample.from}" -> "${sample.to}"`);
    }
  }

  if (dryRun) {
    console.log('');
    console.log('Dry run complete. Re-run with --apply to write changes.');
    await client.end();
    return;
  }

  console.log('');
  console.log('Applying updates...');

  await client.query('BEGIN');
  try {
    let opportunityUpdated = 0;
    for (const update of opportunityUpdates.values()) {
      await client.query(
        'UPDATE opportunities SET name = $1, updated_at = NOW() WHERE id = $2',
        [update.to, update.id]
      );
      opportunityUpdated += 1;
    }

    let accountUpdated = 0;
    for (const update of accountUpdates.values()) {
      await client.query(
        'UPDATE accounts SET name = $1, updated_at = NOW() WHERE id = $2',
        [update.to, update.id]
      );
      accountUpdated += 1;
    }

    await client.query('COMMIT');

    console.log(`Updated opportunities: ${opportunityUpdated}`);
    console.log(`Updated accounts: ${accountUpdated}`);
    console.log('Backfill complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
