#!/usr/bin/env node
import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm',
  ssl: { rejectUnauthorized: false }
});

async function addJobNotesColumn() {
  await client.connect();
  console.log('Connected to database');

  try {
    // Check if column exists
    const checkResult = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'leads' AND column_name = 'job_notes'
    `);

    if (checkResult.rows.length === 0) {
      await client.query('ALTER TABLE leads ADD COLUMN job_notes TEXT');
      console.log('Added job_notes column to leads table');
    } else {
      console.log('job_notes column already exists');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

addJobNotesColumn();
