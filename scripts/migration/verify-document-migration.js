#!/usr/bin/env node
/**
 * Verify Document Migration: Salesforce vs Panda CRM
 *
 * Compares ContentDocument and ContentDocumentLink records between
 * Salesforce and Panda CRM to identify migration gaps.
 */

const { PrismaClient } = require('../../shared/node_modules/@prisma/client');
const jsforce = require('jsforce');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });

// Get Salesforce connection
async function getSalesforceConnection() {
  try {
    const command = new GetSecretValueCommand({ SecretId: 'salesforce-api-credentials' });
    const response = await secretsClient.send(command);
    const secrets = JSON.parse(response.SecretString);

    const conn = new jsforce.Connection({
      instanceUrl: secrets.instance_url || 'https://ability-saas-2460.my.salesforce.com',
    });

    await conn.login(
      secrets.username,
      secrets.password + (secrets.security_token || '')
    );

    console.log('Connected to Salesforce:', conn.instanceUrl);
    return conn;
  } catch (error) {
    console.error('Salesforce connection failed:', error.message);
    throw error;
  }
}

// Query Salesforce with pagination
async function querySalesforce(conn, soql) {
  const records = [];
  let query = conn.query(soql).maxFetch(500000);

  return new Promise((resolve, reject) => {
    query.on('record', (record) => records.push(record));
    query.on('end', () => resolve(records));
    query.on('error', reject);
    query.run({ autoFetch: true, maxFetch: 500000 });
  });
}

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('  DOCUMENT MIGRATION VERIFICATION: SALESFORCE vs PANDA CRM');
  console.log('═'.repeat(70));
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log('═'.repeat(70));

  try {
    // Connect to Salesforce
    console.log('\n[1/4] Connecting to Salesforce...');
    const conn = await getSalesforceConnection();

    // === SALESFORCE COUNTS ===
    console.log('\n[2/4] Querying Salesforce counts...');

    // Total ContentDocuments
    const sfDocCountResult = await conn.query('SELECT COUNT(Id) cnt FROM ContentDocument');
    const sfDocCount = sfDocCountResult.records[0].cnt;
    console.log(`  - ContentDocument total: ${sfDocCount.toLocaleString()}`);

    // ContentDocumentLink has query restrictions, so we need to count via document IDs
    console.log('\n  Note: ContentDocumentLink requires filter - will count via document relationships');

    // Get all document IDs and query links in batches
    console.log('  Fetching ContentDocument IDs for link queries...');
    const allDocs = await querySalesforce(conn, 'SELECT Id FROM ContentDocument');
    const docIds = allDocs.map(d => d.Id);
    console.log(`  - Found ${docIds.length} documents`);

    // Query links in batches of 100 document IDs
    let sfLinkCount = 0;
    let sfOppLinks = 0;
    let sfAccLinks = 0;
    let sfContactLinks = 0;
    let sfLeadLinks = 0;
    let sfCaseLinks = 0;
    let sfWOLinks = 0;

    console.log('  Counting document links by entity type (batched queries)...');
    const batchSize = 100;
    for (let i = 0; i < docIds.length; i += batchSize) {
      const batch = docIds.slice(i, i + batchSize);
      const idList = batch.map(id => `'${id}'`).join(',');

      const batchLinks = await conn.query(`
        SELECT Id, LinkedEntityId
        FROM ContentDocumentLink
        WHERE ContentDocumentId IN (${idList})
      `);

      sfLinkCount += batchLinks.totalSize;

      for (const link of batchLinks.records) {
        const entityId = link.LinkedEntityId;
        if (entityId.startsWith('006')) sfOppLinks++;
        else if (entityId.startsWith('001')) sfAccLinks++;
        else if (entityId.startsWith('003')) sfContactLinks++;
        else if (entityId.startsWith('00Q')) sfLeadLinks++;
        else if (entityId.startsWith('500')) sfCaseLinks++;
        else if (entityId.startsWith('0WO')) sfWOLinks++;
      }

      if ((i + batchSize) % 500 === 0 || i + batchSize >= docIds.length) {
        console.log(`    Processed ${Math.min(i + batchSize, docIds.length)}/${docIds.length} documents...`);
      }
    }
    console.log(`  - ContentDocumentLink total: ${sfLinkCount.toLocaleString()}`);

    // === PANDA CRM COUNTS ===
    console.log('\n[3/4] Querying Panda CRM counts...');

    // Total documents
    const crmDocCount = await prisma.document.count();
    console.log(`  - documents total: ${crmDocCount.toLocaleString()}`);

    // Total document links
    const crmLinkCount = await prisma.documentLink.count();
    console.log(`  - document_links total: ${crmLinkCount.toLocaleString()}`);

    // Breakdown by linked record type
    const crmLinksByType = await prisma.$queryRaw`
      SELECT linked_record_type, COUNT(*)::int as count
      FROM document_links
      GROUP BY linked_record_type
      ORDER BY count DESC
    `;

    // Get specific counts
    const crmOppLinks = crmLinksByType.find(r => r.linked_record_type === 'OPPORTUNITY')?.count || 0;
    const crmAccLinks = crmLinksByType.find(r => r.linked_record_type === 'ACCOUNT')?.count || 0;
    const crmContactLinks = crmLinksByType.find(r => r.linked_record_type === 'CONTACT')?.count || 0;
    const crmLeadLinks = crmLinksByType.find(r => r.linked_record_type === 'LEAD')?.count || 0;
    const crmCaseLinks = crmLinksByType.find(r => r.linked_record_type === 'CASE')?.count || 0;
    const crmWOLinks = crmLinksByType.find(r => r.linked_record_type === 'WORK_ORDER')?.count || 0;

    // Count unique opportunities/accounts with documents
    const crmOppsWithDocs = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT opportunity_id)::int as count
      FROM document_links
      WHERE opportunity_id IS NOT NULL
    `;

    const crmAccsWithDocs = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT account_id)::int as count
      FROM document_links
      WHERE account_id IS NOT NULL
    `;

    // === SUMMARY TABLE ===
    console.log('\n[4/4] Generating summary...');

    console.log('\n' + '═'.repeat(70));
    console.log('  MIGRATION SUMMARY');
    console.log('═'.repeat(70));

    console.log('\n┌─────────────────────────┬───────────────┬───────────────┬──────────┐');
    console.log('│ Metric                  │ Salesforce    │ Panda CRM     │ Gap      │');
    console.log('├─────────────────────────┼───────────────┼───────────────┼──────────┤');

    function formatRow(label, sfVal, crmVal) {
      const gap = sfVal - crmVal;
      const gapStr = gap > 0 ? `-${gap.toLocaleString()}` : (gap < 0 ? `+${Math.abs(gap).toLocaleString()}` : '0');
      const sfStr = sfVal.toLocaleString().padStart(11);
      const crmStr = crmVal.toLocaleString().padStart(11);
      const gapFmt = gapStr.padStart(6);
      console.log(`│ ${label.padEnd(23)} │ ${sfStr} │ ${crmStr} │ ${gapFmt} │`);
    }

    formatRow('Total Documents', sfDocCount, crmDocCount);
    formatRow('Total Document Links', sfLinkCount, crmLinkCount);
    console.log('├─────────────────────────┼───────────────┼───────────────┼──────────┤');
    console.log('│ Links by Entity Type    │               │               │          │');
    console.log('├─────────────────────────┼───────────────┼───────────────┼──────────┤');
    formatRow('  Opportunity (006)', sfOppLinks, crmOppLinks);
    formatRow('  Account (001)', sfAccLinks, crmAccLinks);
    formatRow('  Contact (003)', sfContactLinks, crmContactLinks);
    formatRow('  Lead (00Q)', sfLeadLinks, crmLeadLinks);
    formatRow('  Case (500)', sfCaseLinks, crmCaseLinks);
    formatRow('  Work Order (0WO)', sfWOLinks, crmWOLinks);
    console.log('└─────────────────────────┴───────────────┴───────────────┴──────────┘');

    // Coverage percentages
    console.log('\n' + '─'.repeat(70));
    console.log('  MIGRATION COVERAGE');
    console.log('─'.repeat(70));

    const docCoverage = sfDocCount > 0 ? ((crmDocCount / sfDocCount) * 100).toFixed(2) : 0;
    const linkCoverage = sfLinkCount > 0 ? ((crmLinkCount / sfLinkCount) * 100).toFixed(2) : 0;
    const oppCoverage = sfOppLinks > 0 ? ((crmOppLinks / sfOppLinks) * 100).toFixed(2) : 0;
    const accCoverage = sfAccLinks > 0 ? ((crmAccLinks / sfAccLinks) * 100).toFixed(2) : 0;

    console.log(`\n  Documents:      ${docCoverage}% migrated (${crmDocCount.toLocaleString()} of ${sfDocCount.toLocaleString()})`);
    console.log(`  Document Links: ${linkCoverage}% migrated (${crmLinkCount.toLocaleString()} of ${sfLinkCount.toLocaleString()})`);
    console.log(`  Opportunity Links: ${oppCoverage}% migrated (${crmOppLinks.toLocaleString()} of ${sfOppLinks.toLocaleString()})`);
    console.log(`  Account Links:     ${accCoverage}% migrated (${crmAccLinks.toLocaleString()} of ${sfAccLinks.toLocaleString()})`);

    // Unique records with documents
    console.log('\n' + '─'.repeat(70));
    console.log('  PANDA CRM DOCUMENT COVERAGE');
    console.log('─'.repeat(70));
    console.log(`\n  Opportunities with documents: ${crmOppsWithDocs[0].count.toLocaleString()}`);
    console.log(`  Accounts with documents:      ${crmAccsWithDocs[0].count.toLocaleString()}`);

    // Show document link breakdown in CRM
    console.log('\n' + '─'.repeat(70));
    console.log('  PANDA CRM LINK TYPES BREAKDOWN');
    console.log('─'.repeat(70));
    console.log('\n  Linked Record Type      | Count');
    console.log('  ' + '-'.repeat(40));
    for (const row of crmLinksByType) {
      const type = row.linked_record_type || 'NULL';
      console.log(`  ${type.padEnd(23)} | ${row.count.toLocaleString()}`);
    }

    // Check for orphaned documents (no links)
    const orphanedDocs = await prisma.$queryRaw`
      SELECT COUNT(d.id)::int as count
      FROM documents d
      LEFT JOIN document_links dl ON dl.document_id = d.id
      WHERE dl.id IS NULL
    `;
    console.log(`\n  Orphaned documents (no links): ${orphanedDocs[0].count.toLocaleString()}`);

    // Sample of missing documents if gap exists
    if (sfDocCount > crmDocCount) {
      console.log('\n' + '─'.repeat(70));
      console.log('  GAP ANALYSIS');
      console.log('─'.repeat(70));

      const missingCount = sfDocCount - crmDocCount;
      console.log(`\n  Missing ${missingCount.toLocaleString()} documents from Salesforce`);
      console.log('  (Run migrate-documents.js to sync missing documents)');
    }

    console.log('\n' + '═'.repeat(70));
    console.log(`  Completed: ${new Date().toISOString()}`);
    console.log('═'.repeat(70) + '\n');

  } catch (error) {
    console.error('\nERROR:', error.message);
    if (error.message.includes('INVALID_LOGIN')) {
      console.error('\n⚠️  Salesforce credentials may be invalid or expired.');
      console.error('   Update credentials in AWS Secrets Manager: salesforce-api-credentials');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
