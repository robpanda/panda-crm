#!/usr/bin/env node
import pg from 'pg';

const client = new pg.Client({
  connectionString: 'postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm',
  ssl: { rejectUnauthorized: false }
});

async function checkTables() {
  await client.connect();
  console.log('Connected to database');

  try {
    // Check if support_tickets table exists
    const result = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'support%'
    `);

    console.log('Support tables found:', result.rows.map(r => r.table_name));

    if (result.rows.length === 0) {
      console.log('\nNo support tables found. Creating them...');

      // Create support_tickets table
      await client.query(`
        CREATE TABLE IF NOT EXISTS support_tickets (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          ticket_number TEXT UNIQUE NOT NULL,
          subject TEXT NOT NULL,
          description TEXT NOT NULL,
          status TEXT DEFAULT 'NEW',
          priority TEXT DEFAULT 'MEDIUM',
          category TEXT,
          page_url TEXT,
          browser_info TEXT,
          screenshot_url TEXT,
          user_id TEXT NOT NULL REFERENCES users(id),
          assigned_to_id TEXT REFERENCES users(id),
          resolved_by_id TEXT REFERENCES users(id),
          related_article_id TEXT,
          first_response_at TIMESTAMPTZ,
          last_response_at TIMESTAMPTZ,
          resolved_at TIMESTAMPTZ,
          response_time_mins INTEGER,
          resolution_time_mins INTEGER,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('Created support_tickets table');

      // Create support_ticket_messages table
      await client.query(`
        CREATE TABLE IF NOT EXISTS support_ticket_messages (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL REFERENCES users(id),
          message TEXT NOT NULL,
          is_internal BOOLEAN DEFAULT false,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('Created support_ticket_messages table');

      // Create support_ticket_attachments table
      await client.query(`
        CREATE TABLE IF NOT EXISTS support_ticket_attachments (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
          ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
          file_name TEXT NOT NULL,
          file_url TEXT NOT NULL,
          file_size INTEGER,
          file_type TEXT,
          uploaded_by_id TEXT NOT NULL REFERENCES users(id),
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('Created support_ticket_attachments table');
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

checkTables();
