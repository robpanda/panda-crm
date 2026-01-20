#!/usr/bin/env node
// Run SQL migration file using pg
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm?sslmode=require';

async function runMigration() {
  const migrationFile = process.argv[2] || path.join(__dirname, '../../shared/prisma/migrations/20260104000000_add_lead_intelligence/migration.sql');

  console.log('Connecting to database...');
  console.log('Migration file:', migrationFile);

  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected!');

    const sql = fs.readFileSync(migrationFile, 'utf8');

    // Split by semicolons but be careful with functions
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
        console.log(stmt.substring(0, 80) + (stmt.length > 80 ? '...' : ''));
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

  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
