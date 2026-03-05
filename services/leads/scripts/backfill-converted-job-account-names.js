#!/usr/bin/env node

import prismaPkg from '@prisma/client';

const { PrismaClient } = prismaPkg;

const prisma = new PrismaClient();

function getFlag(name) {
  return process.argv.includes(name);
}

function getArg(name, defaultValue = null) {
  const index = process.argv.findIndex(arg => arg === name || arg.startsWith(`${name}=`));
  if (index === -1) return defaultValue;

  const current = process.argv[index];
  if (current.includes('=')) {
    return current.split('=').slice(1).join('=');
  }

  return process.argv[index + 1] ?? defaultValue;
}

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeNameSegment(value) {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const withoutDateSuffix = normalized
    .replace(/\s*-\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/g, '')
    .trim();

  return withoutDateSuffix.replace(/\s{2,}/g, ' ').trim() || normalized;
}

function resolveCustomerName(lead) {
  const firstName = sanitizeNameSegment(lead.firstName);
  const lastName = sanitizeNameSegment(lead.lastName);
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const companyName = sanitizeNameSegment(lead.company);
  return fullName || companyName || 'Customer';
}

async function run() {
  const apply = getFlag('--apply');
  const limitRaw = getArg('--limit', null);
  const limit = limitRaw ? Number(limitRaw) : null;
  const onlyAccounts = getFlag('--only-accounts');

  if (limitRaw && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error(`Invalid --limit value: ${limitRaw}`);
  }

  console.log('Backfill converted job/account names');
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
  if (limit) console.log(`Limit: ${limit}`);
  if (onlyAccounts) console.log('Scope: accounts only');

  const leads = await prisma.lead.findMany({
    where: {
      isConverted: true,
      convertedOpportunityId: { not: null },
      convertedAccountId: { not: null },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      company: true,
      convertedOpportunityId: true,
      convertedAccountId: true,
      convertedAt: true,
    },
    orderBy: { convertedAt: 'asc' },
    ...(limit ? { take: limit } : {}),
  });

  if (leads.length === 0) {
    console.log('No converted leads found.');
    return;
  }

  const opportunityIds = [...new Set(leads.map(lead => lead.convertedOpportunityId).filter(Boolean))];
  const accountIds = [...new Set(leads.map(lead => lead.convertedAccountId).filter(Boolean))];

  const [opportunities, accounts] = await Promise.all([
    prisma.opportunity.findMany({
      where: { id: { in: opportunityIds } },
      select: {
        id: true,
        name: true,
        job_id: true,
        accountId: true,
      },
    }),
    prisma.account.findMany({
      where: { id: { in: accountIds } },
      select: {
        id: true,
        name: true,
      },
    }),
  ]);

  const opportunitiesById = new Map(opportunities.map(opportunity => [opportunity.id, opportunity]));
  const accountsById = new Map(accounts.map(account => [account.id, account]));

  const opportunityUpdates = [];
  const accountUpdatesMap = new Map();
  const conflicts = [];
  const missing = [];

  for (const lead of leads) {
    const opportunity = opportunitiesById.get(lead.convertedOpportunityId);
    const account = accountsById.get(lead.convertedAccountId);

    if (!opportunity || !account) {
      missing.push({
        leadId: lead.id,
        opportunityId: lead.convertedOpportunityId,
        accountId: lead.convertedAccountId,
      });
      continue;
    }

    const customerName = resolveCustomerName(lead);
    const targetOpportunityName = customerName;
    const targetAccountName = opportunity.job_id ? `${opportunity.job_id} ${customerName}` : customerName;

    if (!onlyAccounts && opportunity.name !== targetOpportunityName) {
      opportunityUpdates.push({
        id: opportunity.id,
        from: opportunity.name,
        to: targetOpportunityName,
      });
    }

    if (account.name !== targetAccountName) {
      const existing = accountUpdatesMap.get(account.id);
      if (existing && existing.to !== targetAccountName) {
        conflicts.push({
          accountId: account.id,
          existingTarget: existing.to,
          conflictingTarget: targetAccountName,
          leadId: lead.id,
          opportunityId: opportunity.id,
        });
      } else {
        accountUpdatesMap.set(account.id, {
          id: account.id,
          from: account.name,
          to: targetAccountName,
        });
      }
    }
  }

  const accountUpdates = [...accountUpdatesMap.values()].filter(
    update => !conflicts.some(conflict => conflict.accountId === update.id)
  );

  console.log(`\nFound ${leads.length} converted lead mappings.`);
  console.log(`Opportunity rename candidates: ${opportunityUpdates.length}`);
  console.log(`Account rename candidates: ${accountUpdates.length}`);
  console.log(`Conflicts skipped: ${conflicts.length}`);
  console.log(`Missing linked records: ${missing.length}`);

  if (!apply) {
    const sampleOpportunities = opportunityUpdates.slice(0, 10);
    const sampleAccounts = accountUpdates.slice(0, 10);

    if (sampleOpportunities.length > 0) {
      console.log('\nSample opportunity updates (first 10):');
      for (const update of sampleOpportunities) {
        console.log(`- ${update.id}: "${update.from}" -> "${update.to}"`);
      }
    }

    if (sampleAccounts.length > 0) {
      console.log('\nSample account updates (first 10):');
      for (const update of sampleAccounts) {
        console.log(`- ${update.id}: "${update.from}" -> "${update.to}"`);
      }
    }

    if (conflicts.length > 0) {
      console.log('\nConflicts (first 10):');
      for (const conflict of conflicts.slice(0, 10)) {
        console.log(`- account ${conflict.accountId}: "${conflict.existingTarget}" vs "${conflict.conflictingTarget}"`);
      }
    }

    console.log('\nDry run complete. Re-run with --apply to persist changes.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    if (!onlyAccounts) {
      for (const update of opportunityUpdates) {
        await tx.opportunity.update({
          where: { id: update.id },
          data: { name: update.to },
        });
      }
    }

    for (const update of accountUpdates) {
      await tx.account.update({
        where: { id: update.id },
        data: { name: update.to },
      });
    }
  });

  console.log('\nBackfill applied successfully.');
  console.log(`Updated opportunities: ${onlyAccounts ? 0 : opportunityUpdates.length}`);
  console.log(`Updated accounts: ${accountUpdates.length}`);
  if (conflicts.length > 0) {
    console.log(`Skipped conflicted accounts: ${conflicts.length}`);
  }
}

run()
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
