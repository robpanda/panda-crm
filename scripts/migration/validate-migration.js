#!/usr/bin/env node
// Validate migration by comparing counts between Salesforce and PostgreSQL
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

async function validateMigration() {
  console.log('╔═══════════════════════════════════════════════════╗');
  console.log('║   MIGRATION VALIDATION                            ║');
  console.log('╚═══════════════════════════════════════════════════╝');
  console.log('');

  const prisma = getPrismaClient();
  const results = [];

  try {
    // Validate Accounts
    console.log('Validating Accounts...');
    const sfAccountCount = (await querySalesforce('SELECT COUNT() FROM Account')).length ||
      (await querySalesforce('SELECT Id FROM Account')).length;
    const dbAccountCount = await prisma.account.count();
    results.push({
      object: 'Account',
      salesforce: sfAccountCount,
      database: dbAccountCount,
      match: sfAccountCount === dbAccountCount,
    });

    // Validate Contacts
    console.log('Validating Contacts...');
    const sfContactCount = (await querySalesforce('SELECT Id FROM Contact')).length;
    const dbContactCount = await prisma.contact.count();
    results.push({
      object: 'Contact',
      salesforce: sfContactCount,
      database: dbContactCount,
      match: sfContactCount === dbContactCount,
    });

    // Validate Leads
    console.log('Validating Leads...');
    const sfLeadCount = (await querySalesforce('SELECT Id FROM Lead')).length;
    const dbLeadCount = await prisma.lead.count();
    results.push({
      object: 'Lead',
      salesforce: sfLeadCount,
      database: dbLeadCount,
      match: sfLeadCount === dbLeadCount,
    });

    // Validate Opportunities
    console.log('Validating Opportunities...');
    const sfOppCount = (await querySalesforce('SELECT Id FROM Opportunity')).length;
    const dbOppCount = await prisma.opportunity.count();
    results.push({
      object: 'Opportunity',
      salesforce: sfOppCount,
      database: dbOppCount,
      match: sfOppCount === dbOppCount,
    });

    // Validate Users
    console.log('Validating Users...');
    const sfUserCount = (await querySalesforce('SELECT Id FROM User WHERE IsActive = true')).length;
    const dbUserCount = await prisma.user.count({ where: { isActive: true } });
    results.push({
      object: 'User (Active)',
      salesforce: sfUserCount,
      database: dbUserCount,
      match: sfUserCount === dbUserCount,
    });

    // Print results
    console.log('\n');
    console.log('─'.repeat(60));
    console.log('│ Object          │ Salesforce │ Database │ Status        │');
    console.log('─'.repeat(60));

    let allMatch = true;
    for (const r of results) {
      const status = r.match ? '✓ Match' : `⚠ Diff: ${Math.abs(r.salesforce - r.database)}`;
      if (!r.match) allMatch = false;

      console.log(
        `│ ${r.object.padEnd(15)} │ ${r.salesforce.toString().padStart(10)} │ ${r.database.toString().padStart(8)} │ ${status.padEnd(13)} │`
      );
    }

    console.log('─'.repeat(60));
    console.log('');

    if (allMatch) {
      console.log('✅ All record counts match!');
    } else {
      console.log('⚠️  Some counts do not match. Check for:');
      console.log('   - Records created/deleted after migration');
      console.log('   - Permission issues during query');
      console.log('   - Records that failed to migrate (check logs)');
    }

    // Additional validations
    console.log('\n📊 Additional Checks:');

    // Check for orphaned contacts (no account)
    const orphanedContacts = await prisma.contact.count({
      where: { accountId: null, sfAccountId: { not: null } },
    });
    console.log(`   Contacts missing Account link: ${orphanedContacts}`);

    // Check for orphaned opportunities
    const orphanedOpps = await prisma.opportunity.count({
      where: { accountId: null, sfAccountId: { not: null } },
    });
    console.log(`   Opportunities missing Account link: ${orphanedOpps}`);

    // Check for users without Salesforce ID
    const usersWithoutSfId = await prisma.user.count({
      where: { salesforceId: null },
    });
    console.log(`   Users without Salesforce ID: ${usersWithoutSfId}`);

    return { results, allMatch };
  } catch (error) {
    console.error('Validation failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  validateMigration()
    .then(({ allMatch }) => process.exit(allMatch ? 0 : 1))
    .catch(() => process.exit(1));
}

export { validateMigration };
