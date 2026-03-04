#!/usr/bin/env node
/**
 * Backfill legacy untitled/generic opportunity notes into internal comments.
 *
 * Why:
 * - Legacy "comment-style" job notes were created with blank/generic titles.
 * - Internal Comments UI only loads notes with internal-comment title patterns.
 * - This backfill normalizes those legacy notes to INTERNAL_COMMENT metadata titles.
 *
 * Safety:
 * - Dry-run by default (no writes).
 * - Applies only to notes linked to opportunities.
 * - Captures every changed row in a backup table before update.
 * - Supports rollback by run ID.
 *
 * Usage:
 *   node backfill-opportunity-internal-comments.js
 *   node backfill-opportunity-internal-comments.js --apply
 *   node backfill-opportunity-internal-comments.js --apply --limit 500
 *   node backfill-opportunity-internal-comments.js --opportunity-id <opportunityId>
 *   node backfill-opportunity-internal-comments.js --rollback-run <runId>
 *   node backfill-opportunity-internal-comments.js --rollback-run <runId> --apply
 */

import crypto from 'crypto';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Client } = pg;

const GENERIC_TITLES = [
  'untitled',
  'comment',
  'comments',
  'internal note',
  'internal notes',
  'note',
];

const PLACEHOLDER_BODIES = ['na', 'n/a', 'none', '-'];
const BACKUP_TABLE = 'note_internal_comment_backfill_backup';

function normalizeDepartmentTag(value) {
  const normalized = String(value || 'general')
    .trim()
    .toLowerCase()
    .replace(/\|/g, '')
    .replace(/\s+/g, '_');
  return normalized || 'general';
}

function buildInternalCommentTitle(departmentTag = 'general', isResolved = false) {
  return `INTERNAL_COMMENT|${normalizeDepartmentTag(departmentTag)}|${isResolved ? '1' : '0'}`;
}

function printHelp() {
  console.log(`
Backfill legacy opportunity notes to internal comments

Options:
  --apply                       Apply writes (default is dry-run)
  --limit <number>              Limit candidate rows
  --opportunity-id <id>         Scope to a single opportunity
  --department-tag <tag>        Internal comment department (default: general)
  --resolved                    Set resolved flag true in migrated title
  --include-placeholders        Include placeholder bodies like "na"
  --rollback-run <runId>        Roll back a previous run (dry-run unless --apply)
  --help                        Show this help
`);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const getValue = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };

  if (args.includes('--help')) {
    printHelp();
    process.exit(0);
  }

  const limitRaw = getValue('--limit');
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : null;
  if (limitRaw && (!Number.isFinite(limit) || limit <= 0)) {
    throw new Error('Invalid --limit value. Example: --limit 500');
  }

  const rollbackRunId = getValue('--rollback-run');
  const opportunityId = getValue('--opportunity-id');
  const departmentTag = getValue('--department-tag') || 'general';

  return {
    apply: args.includes('--apply'),
    limit,
    opportunityId,
    departmentTag,
    isResolved: args.includes('--resolved'),
    includePlaceholders: args.includes('--include-placeholders'),
    rollbackRunId,
  };
}

function toSafeConnectionString(connectionString) {
  return connectionString
    .replace(/([?&])sslmode=require(&)?/i, (match, prefix, suffix) => (prefix === '?' && !suffix ? '' : prefix))
    .replace(/[?&]$/g, '');
}

function formatPreview(value, length = 140) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, length);
}

function buildRunId(prefix) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `${prefix}-${stamp}-${suffix}`;
}

async function ensureBackupTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${BACKUP_TABLE} (
      id BIGSERIAL PRIMARY KEY,
      run_id TEXT NOT NULL,
      note_id TEXT NOT NULL,
      opportunity_id TEXT NOT NULL,
      old_title TEXT,
      new_title TEXT NOT NULL,
      body_preview TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_${BACKUP_TABLE}_run_note
      ON ${BACKUP_TABLE} (run_id, note_id)
  `);

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_${BACKUP_TABLE}_run_id
      ON ${BACKUP_TABLE} (run_id)
  `);
}

async function loadCandidates(client, options) {
  const params = [GENERIC_TITLES];
  const where = [
    'n.opportunity_id IS NOT NULL',
    `(n.title IS NULL OR btrim(n.title) = '' OR lower(btrim(n.title)) = ANY($1::text[]))`,
    "btrim(coalesce(n.body, '')) <> ''",
  ];

  if (!options.includePlaceholders) {
    params.push(PLACEHOLDER_BODIES);
    where.push(`lower(btrim(n.body)) <> ALL($${params.length}::text[])`);
  }

  if (options.opportunityId) {
    params.push(options.opportunityId);
    where.push(`n.opportunity_id = $${params.length}`);
  }

  const limitClause = options.limit ? `LIMIT ${Number(options.limit)}` : '';

  const query = `
    SELECT
      n.id,
      n.opportunity_id AS "opportunityId",
      n.title,
      n.body,
      n.created_at AS "createdAt",
      n.created_by_id AS "createdById"
    FROM notes n
    WHERE ${where.join('\n      AND ')}
    ORDER BY n.created_at ASC
    ${limitClause}
  `;

  const result = await client.query(query, params);
  return result.rows;
}

function printCandidateSummary(candidates, newTitle) {
  const opportunities = new Map();
  for (const row of candidates) {
    opportunities.set(row.opportunityId, (opportunities.get(row.opportunityId) || 0) + 1);
  }

  const topOpportunities = [...opportunities.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  console.log(`Candidates found: ${candidates.length}`);
  console.log(`Affected opportunities: ${opportunities.size}`);
  console.log(`Target title: ${newTitle}`);

  if (topOpportunities.length > 0) {
    console.log('');
    console.log('Top affected opportunities:');
    for (const [opportunityId, count] of topOpportunities) {
      console.log(`  ${opportunityId}: ${count}`);
    }
  }

  const sample = candidates.slice(0, 12);
  if (sample.length > 0) {
    console.log('');
    console.log('Sample rows:');
    for (const row of sample) {
      const title = row.title === null ? 'NULL' : `"${row.title}"`;
      console.log(
        `  ${row.id} | opp=${row.opportunityId} | title=${title} | body="${formatPreview(row.body)}"`
      );
    }
  }
}

async function applyBackfill(client, candidates, newTitle) {
  const noteIds = candidates.map((row) => row.id);
  const runId = buildRunId('internal-comment-backfill');

  await client.query('BEGIN');
  try {
    await ensureBackupTable(client);

    await client.query(
      `
      INSERT INTO ${BACKUP_TABLE} (
        run_id,
        note_id,
        opportunity_id,
        old_title,
        new_title,
        body_preview
      )
      SELECT
        $1,
        n.id,
        n.opportunity_id,
        n.title,
        $2,
        LEFT(REGEXP_REPLACE(n.body, E'[\\n\\r\\t]+', ' ', 'g'), 200)
      FROM notes n
      WHERE n.id = ANY($3::text[])
      ON CONFLICT (run_id, note_id) DO NOTHING
      `,
      [runId, newTitle, noteIds]
    );

    const updated = await client.query(
      `
      UPDATE notes n
      SET title = $1
      WHERE n.id = ANY($2::text[])
      RETURNING n.id
      `,
      [newTitle, noteIds]
    );

    await client.query('COMMIT');
    return {
      runId,
      updatedCount: updated.rowCount || 0,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function previewRollback(client, rollbackRunId) {
  const rows = await client.query(
    `
    SELECT
      b.note_id AS "noteId",
      b.opportunity_id AS "opportunityId",
      b.old_title AS "oldTitle",
      b.new_title AS "newTitle",
      n.title AS "currentTitle"
    FROM ${BACKUP_TABLE} b
    JOIN notes n ON n.id = b.note_id
    WHERE b.run_id = $1
    ORDER BY b.id ASC
    `,
    [rollbackRunId]
  );

  const total = rows.rowCount || 0;
  const canRollback = rows.rows.filter((row) => row.currentTitle === row.newTitle).length;
  const diverged = total - canRollback;

  return {
    total,
    canRollback,
    diverged,
    sample: rows.rows.slice(0, 12),
  };
}

async function applyRollback(client, rollbackRunId) {
  await client.query('BEGIN');
  try {
    const result = await client.query(
      `
      UPDATE notes n
      SET title = b.old_title
      FROM (
        SELECT DISTINCT ON (note_id)
          note_id,
          old_title,
          new_title
        FROM ${BACKUP_TABLE}
        WHERE run_id = $1
        ORDER BY note_id, id DESC
      ) b
      WHERE n.id = b.note_id
        AND n.title IS NOT DISTINCT FROM b.new_title
      RETURNING n.id
      `,
      [rollbackRunId]
    );

    await client.query('COMMIT');
    return { rolledBack: result.rowCount || 0 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const options = parseArgs();
  const dryRun = !options.apply;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({
    connectionString: toSafeConnectionString(process.env.DATABASE_URL),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  console.log('='.repeat(80));
  console.log('Backfill: Legacy Opportunity Notes -> Internal Comments');
  console.log('='.repeat(80));
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'APPLY (writes enabled)'}`);

  if (options.rollbackRunId) {
    console.log(`Rollback run: ${options.rollbackRunId}`);
  } else {
    console.log(`Scope opportunityId: ${options.opportunityId || 'all'}`);
    console.log(`Limit: ${options.limit || 'none'}`);
    console.log(`Include placeholder bodies: ${options.includePlaceholders ? 'yes' : 'no'}`);
    console.log(`Department tag: ${normalizeDepartmentTag(options.departmentTag)}`);
    console.log(`Resolved: ${options.isResolved ? 'true' : 'false'}`);
  }
  console.log('');

  try {
    if (options.rollbackRunId) {
      await ensureBackupTable(client);
      const preview = await previewRollback(client, options.rollbackRunId);

      console.log(`Rows in backup run: ${preview.total}`);
      console.log(`Rows eligible for rollback: ${preview.canRollback}`);
      console.log(`Rows skipped (title diverged): ${preview.diverged}`);

      if (preview.sample.length > 0) {
        console.log('');
        console.log('Rollback sample:');
        for (const row of preview.sample) {
          const oldTitle = row.oldTitle === null ? 'NULL' : `"${row.oldTitle}"`;
          const currentTitle = row.currentTitle === null ? 'NULL' : `"${row.currentTitle}"`;
          console.log(
            `  ${row.noteId} | opp=${row.opportunityId} | old=${oldTitle} | current=${currentTitle}`
          );
        }
      }

      if (dryRun) {
        console.log('');
        console.log('Dry run only. Re-run with --apply to execute rollback.');
        return;
      }

      const rollbackResult = await applyRollback(client, options.rollbackRunId);
      console.log('');
      console.log(`Rollback applied. Rows restored: ${rollbackResult.rolledBack}`);
      return;
    }

    const newTitle = buildInternalCommentTitle(options.departmentTag, options.isResolved);
    const candidates = await loadCandidates(client, options);

    printCandidateSummary(candidates, newTitle);

    if (candidates.length === 0) {
      console.log('');
      console.log('No candidate notes found. Nothing to do.');
      return;
    }

    if (dryRun) {
      console.log('');
      console.log('Dry run only. Re-run with --apply to update notes.');
      return;
    }

    const applyResult = await applyBackfill(client, candidates, newTitle);
    console.log('');
    console.log(`Backfill applied. Updated rows: ${applyResult.updatedCount}`);
    console.log(`Rollback run ID: ${applyResult.runId}`);
    console.log(`Rollback command: node backfill-opportunity-internal-comments.js --rollback-run ${applyResult.runId} --apply`);
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`Backfill failed: ${error.message}`);
  process.exit(1);
});
