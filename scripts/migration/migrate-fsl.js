#!/usr/bin/env node
// Master script to migrate all Field Service Lightning data
// Runs migrations in dependency order

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const migrations = [
  { name: 'Work Types', script: 'migrate-work-types.js' },
  { name: 'Service Territories', script: 'migrate-service-territories.js' },
  { name: 'Service Resources (Crews)', script: 'migrate-service-resources.js' },
  { name: 'Assigned Resources (Crew Assignments)', script: 'migrate-assigned-resources.js' },
];

async function runMigration(migration) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Starting: ${migration.name}`);
    console.log('='.repeat(60));

    const scriptPath = join(__dirname, migration.script);
    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      env: process.env,
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${migration.name} completed successfully`);
        resolve();
      } else {
        console.error(`❌ ${migration.name} failed with code ${code}`);
        reject(new Error(`${migration.name} failed`));
      }
    });

    child.on('error', (error) => {
      console.error(`❌ Error running ${migration.name}: ${error.message}`);
      reject(error);
    });
  });
}

async function runAllMigrations() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║        Field Service Lightning Data Migration            ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\nMigrations to run:');
  migrations.forEach((m, i) => console.log(`  ${i + 1}. ${m.name}`));

  const results = [];
  const startTime = Date.now();

  for (const migration of migrations) {
    try {
      await runMigration(migration);
      results.push({ ...migration, success: true });
    } catch (error) {
      results.push({ ...migration, success: false, error: error.message });
      // Continue with next migration even if one fails
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('\n' + '='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Duration: ${duration}s\n`);

  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} ${r.name}${r.error ? ': ' + r.error : ''}`);
  });

  const failed = results.filter(r => !r.success).length;
  if (failed > 0) {
    console.log(`\n⚠️  ${failed} migration(s) failed`);
    process.exit(1);
  } else {
    console.log('\n✅ All migrations completed successfully!');
  }
}

runAllMigrations().catch(console.error);
