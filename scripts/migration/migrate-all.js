#!/usr/bin/env node
// Run all migrations in order
import { migrateAccounts } from './migrate-accounts.js';
import { migrateContacts } from './migrate-contacts.js';
import { migrateLeads } from './migrate-leads.js';
import { migrateOpportunities } from './migrate-opportunities.js';
import { migrateUsers } from './migrate-users.js';
import { disconnect } from './prisma-client.js';

async function migrateAll(options = {}) {
  const { createCognitoUsers = false } = options;

  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   PANDA CRM - SALESFORCE DATA MIGRATION           ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

  const startTime = Date.now();
  const results = {};

  try {
    // 1. Migrate Users first (needed for owner lookups)
    console.log('\n[1/5] Migrating Users...');
    console.log('─'.repeat(50));
    results.users = await migrateUsers({ createInCognito: createCognitoUsers });

    // 2. Migrate Accounts
    console.log('\n[2/5] Migrating Accounts...');
    console.log('─'.repeat(50));
    results.accounts = await migrateAccounts();

    // 3. Migrate Contacts (depends on Accounts)
    console.log('\n[3/5] Migrating Contacts...');
    console.log('─'.repeat(50));
    results.contacts = await migrateContacts();

    // 4. Migrate Leads
    console.log('\n[4/5] Migrating Leads...');
    console.log('─'.repeat(50));
    results.leads = await migrateLeads();

    // 5. Migrate Opportunities (depends on Accounts & Contacts)
    console.log('\n[5/5] Migrating Opportunities...');
    console.log('─'.repeat(50));
    results.opportunities = await migrateOpportunities();

    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n');
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║   MIGRATION COMPLETE                              ║');
    console.log('╚═══════════════════════════════════════════════════╝');
    console.log(`Total time: ${duration} seconds`);
    console.log('');
    console.log('Summary:');
    console.log(`  Users:         ${results.users?.dbResults?.errors?.length === 0 ? '✓' : '⚠'} ${results.users?.dbResults?.errors?.length || 0} errors`);
    console.log(`  Accounts:      ${results.accounts?.errors?.length === 0 ? '✓' : '⚠'} ${results.accounts?.errors?.length || 0} errors`);
    console.log(`  Contacts:      ${results.contacts?.errors?.length === 0 ? '✓' : '⚠'} ${results.contacts?.errors?.length || 0} errors`);
    console.log(`  Leads:         ${results.leads?.errors?.length === 0 ? '✓' : '⚠'} ${results.leads?.errors?.length || 0} errors`);
    console.log(`  Opportunities: ${results.opportunities?.errors?.length === 0 ? '✓' : '⚠'} ${results.opportunities?.errors?.length || 0} errors`);

    return results;
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    await disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const createCognito = process.argv.includes('--cognito');

  console.log('Starting full migration...');
  if (createCognito) {
    console.log('⚠️  Will create Cognito users');
  }

  migrateAll({ createCognitoUsers: createCognito })
    .then(() => {
      console.log('\n✅ All migrations completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration failed:', error);
      process.exit(1);
    });
}

export { migrateAll };
