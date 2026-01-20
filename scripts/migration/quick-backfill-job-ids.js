#!/usr/bin/env node
/**
 * Quick Job ID Backfill using pg client directly
 * This script assigns Job IDs to opportunities that don't have one.
 */

const { Client } = require('pg');

const client = new Client({
  host: 'panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com',
  port: 5432,
  database: 'panda_crm',
  user: 'pandacrm',
  password: 'PandaCRM2025Secure!',
  ssl: { rejectUnauthorized: false }
});

const JOB_ID_STARTING_NUMBER = 999;
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  await client.connect();
  console.log('Connected to database');

  // Get opportunities without job_id, grouped by year
  const oppsResult = await client.query(`
    SELECT id, name, created_at, EXTRACT(YEAR FROM created_at) as year
    FROM opportunities
    WHERE job_id IS NULL
    ORDER BY created_at ASC
  `);

  console.log(`Found ${oppsResult.rows.length} opportunities without job_id`);

  if (oppsResult.rows.length === 0) {
    console.log('Nothing to do');
    await client.end();
    return;
  }

  // Group by year
  const byYear = {};
  for (const row of oppsResult.rows) {
    const year = parseInt(row.year);
    if (!byYear[year]) byYear[year] = [];
    byYear[year].push(row);
  }

  console.log('\nBy year:');
  for (const [year, opps] of Object.entries(byYear)) {
    console.log(`  ${year}: ${opps.length} opportunities`);
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes will be made.\n');
  }

  // Process each year
  for (const [yearStr, opps] of Object.entries(byYear)) {
    const year = parseInt(yearStr);

    // Get current sequence for this year
    const seqResult = await client.query(
      'SELECT last_number FROM job_id_sequences WHERE year = $1',
      [year]
    );

    let startNumber;
    if (seqResult.rows.length > 0) {
      startNumber = seqResult.rows[0].last_number + 1;
      console.log(`\nYear ${year}: continuing from ${year}-${startNumber}`);
    } else {
      startNumber = JOB_ID_STARTING_NUMBER + 1;
      console.log(`\nYear ${year}: starting new sequence at ${year}-${startNumber}`);
    }

    // Assign job IDs
    for (let i = 0; i < opps.length; i++) {
      const opp = opps[i];
      const jobId = `${year}-${startNumber + i}`;

      if (DRY_RUN) {
        if (i < 3 || i === opps.length - 1) {
          console.log(`  Would assign ${jobId} to: ${opp.name}`);
        } else if (i === 3) {
          console.log(`  ... (${opps.length - 4} more)`);
        }
      } else {
        await client.query(
          'UPDATE opportunities SET job_id = $1, updated_at = NOW() WHERE id = $2',
          [jobId, opp.id]
        );

        if ((i + 1) % 10 === 0 || i === opps.length - 1) {
          console.log(`  Assigned ${i + 1}/${opps.length} (${jobId})`);
        }
      }
    }

    // Update sequence
    const newLastNumber = startNumber + opps.length - 1;
    if (!DRY_RUN) {
      if (seqResult.rows.length > 0) {
        await client.query(
          'UPDATE job_id_sequences SET last_number = $1, updated_at = NOW() WHERE year = $2',
          [newLastNumber, year]
        );
      } else {
        await client.query(
          'INSERT INTO job_id_sequences (id, year, last_number, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())',
          [`seq-${year}`, year, newLastNumber]
        );
      }
      console.log(`  Updated sequence: ${year}-${newLastNumber}`);
    }
  }

  console.log('\nDone!');
  await client.end();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
