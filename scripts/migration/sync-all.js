#!/usr/bin/env node
/**
 * Bidirectional Sync Orchestrator
 *
 * Runs bidirectional sync for all object types in the correct order.
 * Supports both full sync and incremental sync modes.
 *
 * Sync Order (respects foreign key dependencies):
 * 1. Users (prerequisite - should already exist)
 * 2. Accounts
 * 3. Contacts
 * 4. Opportunities
 * 5. WorkOrders
 * 6. ServiceAppointments
 * 7. Quotes
 * 8. Contracts
 * 9. Invoices
 * 10. Commissions
 * 11. Cases
 * 12. Documents
 *
 * Modes:
 *   --pull     Pull all objects from Salesforce to PostgreSQL
 *   --push     Push all objects from PostgreSQL to Salesforce
 *   --sync     Full bidirectional sync for all objects
 *
 * Options:
 *   --dry-run         Preview changes without applying
 *   --since           Only sync records modified since last sync
 *   --force           Ignore last sync timestamps
 *   --objects LIST    Comma-separated list of objects to sync
 *   --skip LIST       Comma-separated list of objects to skip
 *   --parallel N      Run N syncs in parallel (default: 1)
 *
 * Examples:
 *   node sync-all.js --pull --dry-run
 *   node sync-all.js --sync --since
 *   node sync-all.js --sync --objects workorders,quotes
 *   node sync-all.js --pull --skip documents
 */

import { disconnect } from './prisma-client.js';

// Import individual sync modules
import * as workOrderSync from './sync-workorders.js';
import * as serviceAppointmentSync from './sync-service-appointments.js';
import * as quoteSync from './sync-quotes.js';
import * as contractSync from './sync-contracts.js';
import * as invoiceSync from './sync-invoices.js';
import * as commissionSync from './sync-commissions.js';
import * as caseSync from './sync-cases.js';
import * as documentSync from './sync-documents.js';

// Sync configuration - order matters for dependencies
const SYNC_CONFIG = [
  {
    name: 'WorkOrders',
    key: 'workorders',
    module: workOrderSync,
    dependencies: ['accounts', 'opportunities', 'users']
  },
  {
    name: 'ServiceAppointments',
    key: 'serviceappointments',
    module: serviceAppointmentSync,
    dependencies: ['workorders']
  },
  {
    name: 'Quotes',
    key: 'quotes',
    module: quoteSync,
    dependencies: ['opportunities', 'accounts', 'contacts']
  },
  {
    name: 'Contracts',
    key: 'contracts',
    module: contractSync,
    dependencies: ['accounts', 'opportunities']
  },
  {
    name: 'Invoices',
    key: 'invoices',
    module: invoiceSync,
    dependencies: ['accounts', 'contracts']
  },
  {
    name: 'Commissions',
    key: 'commissions',
    module: commissionSync,
    dependencies: ['contracts', 'invoices', 'accounts', 'users']
  },
  {
    name: 'Cases',
    key: 'cases',
    module: caseSync,
    dependencies: ['accounts', 'contacts', 'opportunities']
  },
  {
    name: 'Documents',
    key: 'documents',
    module: documentSync,
    dependencies: ['accounts', 'opportunities', 'contacts']
  }
];

/**
 * Run sync for a single object type
 */
async function runObjectSync(config, mode, options) {
  const { name, module } = config;
  const startTime = Date.now();

  console.log(`\n${'#'.repeat(60)}`);
  console.log(`# ${name.toUpperCase()}`);
  console.log('#'.repeat(60));

  try {
    let result;
    switch (mode) {
      case 'pull':
        result = await module.pullFromSalesforce(options);
        break;
      case 'push':
        result = await module.pushToSalesforceSync(options);
        break;
      case 'sync':
        result = await module.syncBidirectional(options);
        break;
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✓ ${name} completed in ${elapsed}s`);

    return { name, success: true, result, elapsed };
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n✗ ${name} failed after ${elapsed}s:`, error.message);

    return { name, success: false, error: error.message, elapsed };
  }
}

/**
 * Run all syncs in sequence
 */
async function syncAll(mode, options = {}) {
  const { objects, skip = [], parallel = 1 } = options;

  console.log('='.repeat(60));
  console.log('PANDA CRM BIDIRECTIONAL SYNC');
  console.log('='.repeat(60));
  console.log(`Mode: ${mode.toUpperCase()}`);
  console.log(`Dry Run: ${options.dryRun ? 'YES' : 'NO'}`);
  console.log(`Incremental: ${options.since ? 'YES' : 'NO'}`);
  console.log('');

  // Filter objects to sync
  let configsToSync = SYNC_CONFIG;

  if (objects && objects.length > 0) {
    const objectSet = new Set(objects.map(o => o.toLowerCase()));
    configsToSync = configsToSync.filter(c => objectSet.has(c.key));
    console.log(`Objects: ${objects.join(', ')}`);
  }

  if (skip && skip.length > 0) {
    const skipSet = new Set(skip.map(s => s.toLowerCase()));
    configsToSync = configsToSync.filter(c => !skipSet.has(c.key));
    console.log(`Skipping: ${skip.join(', ')}`);
  }

  console.log(`\nSyncing ${configsToSync.length} object types...`);

  const startTime = Date.now();
  const results = [];

  // Run syncs (sequential for now - parallel can be added later)
  for (const config of configsToSync) {
    const result = await runObjectSync(config, mode, options);
    results.push(result);

    // If sync failed and it's a dependency for later syncs, we might want to abort
    if (!result.success && !options.force) {
      console.log(`\n⚠ ${config.name} failed - continuing with remaining objects`);
    }
  }

  // Print summary
  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('\n' + '='.repeat(60));
  console.log('SYNC SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total Time: ${totalElapsed}s`);
  console.log(`Successful: ${successful}/${results.length}`);
  console.log(`Failed: ${failed}/${results.length}`);
  console.log('');

  if (failed > 0) {
    console.log('Failed Objects:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }

  console.log('\nDetailed Results:');
  results.forEach(r => {
    const status = r.success ? '✓' : '✗';
    console.log(`  ${status} ${r.name} (${r.elapsed}s)`);
    if (r.result) {
      if (r.result.synced !== undefined) {
        console.log(`      Synced: ${r.result.synced}`);
      }
      if (r.result.pullResult) {
        console.log(`      Pulled: ${r.result.pullResult.synced}`);
      }
      if (r.result.pushResult) {
        console.log(`      Updated: ${r.result.pushResult.updated}, Created: ${r.result.pushResult.created}`);
      }
    }
  });

  return { results, totalElapsed, successful, failed };
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mode: 'pull',
    dryRun: false,
    since: false,
    force: false,
    objects: null,
    skip: [],
    parallel: 1
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--pull':
        options.mode = 'pull';
        break;
      case '--push':
        options.mode = 'push';
        break;
      case '--sync':
        options.mode = 'sync';
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--since':
        options.since = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--objects':
        options.objects = args[++i].split(',').map(s => s.trim());
        break;
      case '--skip':
        options.skip = args[++i].split(',').map(s => s.trim());
        break;
      case '--parallel':
        options.parallel = parseInt(args[++i], 10);
        break;
    }
  }

  return options;
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  try {
    await syncAll(options.mode, options);
  } catch (error) {
    console.error('Sync orchestrator failed:', error);
    process.exit(1);
  } finally {
    await disconnect();
  }
}

main();

export { syncAll };
