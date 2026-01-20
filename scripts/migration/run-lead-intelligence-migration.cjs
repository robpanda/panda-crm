#!/usr/bin/env node
// Run Lead Intelligence SQL migration using pg
const pg = require('pg');
const fs = require('fs');
const path = require('path');

const client = new pg.Client({
  host: 'panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com',
  port: 5432,
  database: 'panda_crm',
  user: 'pandacrm',
  password: 'PandaCRM2025Secure!',
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  const migrationFile = path.join(__dirname, '../../shared/prisma/migrations/20260104000000_add_lead_intelligence/migration.sql');

  console.log('Connecting to database...');
  console.log('Migration file:', migrationFile);

  await client.connect();
  console.log('Connected!');

  const sql = fs.readFileSync(migrationFile, 'utf8');

  // Split by semicolons at end of line
  const statements = sql
    .split(/;\s*$/m)
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  console.log(`Found ${statements.length} statements to execute`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;

    try {
      console.log(`\n[${i + 1}/${statements.length}] Executing...`);
      console.log(stmt.substring(0, 100) + (stmt.length > 100 ? '...' : ''));
      await client.query(stmt);
      console.log('✓ Success');
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('duplicate')) {
        console.log('⚠ Already exists (skipping)');
      } else {
        console.error('✗ Error:', err.message);
      }
    }
  }

  console.log('\n✅ Migration complete!');

  // Verify tables exist
  const tables = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('lead_score_history', 'lead_scoring_models', 'lead_scoring_rules')
  `);
  console.log('\nCreated tables:', tables.rows.map(r => r.table_name).join(', '));

  // Check scoring rules
  const rules = await client.query('SELECT COUNT(*) as count FROM lead_scoring_rules');
  console.log('Scoring rules inserted:', rules.rows[0].count);

  // Check leads table columns
  const columns = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'leads'
    AND column_name IN ('lead_score', 'lead_rank', 'score_factors', 'median_household_income')
  `);
  console.log('Lead table columns added:', columns.rows.map(r => r.column_name).join(', '));

  await client.end();
}

runMigration().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
