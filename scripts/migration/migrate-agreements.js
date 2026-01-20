/**
 * Agreement Migration Script
 * Migrates agreement/signature data from Salesforce to PostgreSQL
 *
 * This script syncs Agreement_Status__c from Salesforce Opportunities to the
 * Agreement table in Panda CRM. For opportunities that have signed agreements,
 * it creates Agreement records linked to the opportunity.
 *
 * Salesforce Source:
 * - Opportunity.Agreement_Status__c (picklist: draft, sent, viewed, signed, declined, etc.)
 * - echosign_Signature__c (managed package - Adobe Sign agreements)
 *
 * Target:
 * - agreements table (status, opportunityId, signedAt, etc.)
 * - Also updates opportunities.agreementStatus for quick reference
 *
 * Prerequisites:
 * - Opportunities must be migrated first
 * - Accounts must be migrated first
 *
 * Usage: node migrate-agreements.js [--limit N] [--dry-run] [--update-only]
 */

import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, disconnect } from './prisma-client.js';

// Parse command line arguments
const args = process.argv.slice(2);
const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : null;
const dryRun = args.includes('--dry-run');
const updateOnly = args.includes('--update-only');

// Salesforce fields to query from Opportunity
const OPPORTUNITY_FIELDS = [
  'Id',
  'Name',
  'Agreement_Status__c',
  'AccountId',
  'ContactId',
  'LastModifiedDate',
  'CreatedDate',
];

// Map Salesforce Agreement_Status__c to Prisma AgreementStatus enum
function mapAgreementStatus(sfStatus) {
  if (!sfStatus) return 'DRAFT';

  const statusMap = {
    'draft': 'DRAFT',
    'sent': 'SENT',
    'out for signature': 'SENT',
    'viewed': 'VIEWED',
    'signed': 'SIGNED',
    'completed': 'SIGNED',
    'declined': 'DECLINED',
    'cancel-pending': 'VOIDED',
    'canceled': 'VOIDED',
    'cancelled': 'VOIDED',
    'expired': 'EXPIRED',
    'error': 'DRAFT',
  };

  return statusMap[sfStatus.toLowerCase()] || 'DRAFT';
}

// Generate agreement number from opportunity name
function generateAgreementNumber(oppName, index) {
  // Extract job number from opportunity name (e.g., "Panda Ext-12345: John Doe" -> "AGR-12345")
  const match = oppName?.match(/Panda Ext-(\d+)/i);
  if (match) {
    return `AGR-${match[1]}`;
  }
  return `AGR-${Date.now()}-${index}`;
}

async function migrateAgreements() {
  console.log('='.repeat(60));
  console.log('Agreement Migration Script');
  console.log('='.repeat(60));

  if (dryRun) {
    console.log('*** DRY RUN MODE - No changes will be made ***\n');
  }

  try {
    const conn = await getSalesforceConnection();

    // Build query - only get opportunities with agreement status
    let soql = `
      SELECT ${OPPORTUNITY_FIELDS.join(', ')}
      FROM Opportunity
      WHERE Agreement_Status__c != null
      ORDER BY LastModifiedDate DESC
    `;

    if (limit) {
      soql += ` LIMIT ${limit}`;
    }

    console.log('Querying Salesforce for opportunities with agreements...');
    const opportunities = await querySalesforce(conn, soql);
    console.log(`Found ${opportunities.length} opportunities with Agreement_Status__c set\n`);

    // Get status breakdown
    const statusCounts = {};
    opportunities.forEach(opp => {
      const status = opp.Agreement_Status__c || 'null';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    console.log('Status breakdown:');
    Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
    console.log('');

    // Get existing opportunity mappings from Panda CRM
    const existingOpps = await prisma.opportunity.findMany({
      where: {
        salesforceId: {
          in: opportunities.map(o => o.Id),
        },
      },
      select: {
        id: true,
        salesforceId: true,
        name: true,
        accountId: true,
        contactId: true,
      },
    });

    const oppMap = new Map(existingOpps.map(o => [o.salesforceId, o]));
    console.log(`Found ${existingOpps.length} matching opportunities in Panda CRM\n`);

    // Check for existing agreements
    const existingAgreements = await prisma.agreement.findMany({
      where: {
        opportunityId: {
          in: existingOpps.map(o => o.id),
        },
      },
      select: {
        id: true,
        opportunityId: true,
        status: true,
      },
    });

    const agreementMap = new Map(existingAgreements.map(a => [a.opportunityId, a]));
    console.log(`Found ${existingAgreements.length} existing agreements in Panda CRM\n`);

    // Process each opportunity
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = [];

    for (let i = 0; i < opportunities.length; i++) {
      const sfOpp = opportunities[i];
      const pandaOpp = oppMap.get(sfOpp.Id);

      if (!pandaOpp) {
        skipped++;
        continue;
      }

      const newStatus = mapAgreementStatus(sfOpp.Agreement_Status__c);
      const existingAgreement = agreementMap.get(pandaOpp.id);

      try {
        if (existingAgreement) {
          // Update existing agreement if status changed
          if (existingAgreement.status !== newStatus) {
            if (!dryRun) {
              await prisma.agreement.update({
                where: { id: existingAgreement.id },
                data: {
                  status: newStatus,
                  signedAt: newStatus === 'SIGNED' ? new Date() : null,
                  updatedAt: new Date(),
                },
              });
            }
            updated++;
            if (updated <= 5) {
              console.log(`Updated: ${pandaOpp.name} - ${existingAgreement.status} -> ${newStatus}`);
            }
          } else {
            skipped++;
          }
        } else if (!updateOnly) {
          // Create new agreement
          const agreementNumber = generateAgreementNumber(pandaOpp.name, i);

          if (!dryRun) {
            await prisma.agreement.create({
              data: {
                agreementNumber,
                name: `Agreement - ${pandaOpp.name}`,
                status: newStatus,
                opportunityId: pandaOpp.id,
                accountId: pandaOpp.accountId,
                contactId: pandaOpp.contactId,
                signedAt: newStatus === 'SIGNED' ? new Date(sfOpp.LastModifiedDate) : null,
                sentAt: ['SENT', 'VIEWED', 'SIGNED'].includes(newStatus) ? new Date(sfOpp.CreatedDate) : null,
              },
            });
          }
          created++;
          if (created <= 5) {
            console.log(`Created: ${agreementNumber} - ${pandaOpp.name} (${newStatus})`);
          }
        }

        // Update opportunity's agreementStatus field for quick reference
        if (!dryRun) {
          await prisma.opportunity.update({
            where: { id: pandaOpp.id },
            data: {
              // Store the original SF status for reference
              status: sfOpp.Agreement_Status__c,
            },
          });
        }

      } catch (error) {
        errors.push({
          salesforceId: sfOpp.Id,
          name: sfOpp.Name,
          error: error.message,
        });
      }

      // Progress indicator
      if ((i + 1) % 100 === 0) {
        console.log(`Processed ${i + 1}/${opportunities.length}...`);
      }
    }

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total opportunities with agreements: ${opportunities.length}`);
    console.log(`Matched to Panda CRM: ${existingOpps.length}`);
    console.log(`Agreements created: ${created}`);
    console.log(`Agreements updated: ${updated}`);
    console.log(`Skipped (no changes): ${skipped}`);
    console.log(`Errors: ${errors.length}`);

    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.slice(0, 10).forEach(e => {
        console.log(`  - ${e.name}: ${e.error}`);
      });
      if (errors.length > 10) {
        console.log(`  ... and ${errors.length - 10} more`);
      }
    }

    if (dryRun) {
      console.log('\n*** DRY RUN - No changes were made ***');
    }

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Also create a function to sync just the agreement status to opportunities
async function syncAgreementStatusToOpportunities() {
  console.log('\n' + '='.repeat(60));
  console.log('Syncing Agreement Status to Opportunities');
  console.log('='.repeat(60));

  try {
    const conn = await getSalesforceConnection();

    // Get all opportunities with agreement status
    const soql = `
      SELECT Id, Agreement_Status__c
      FROM Opportunity
      WHERE Agreement_Status__c != null
    `;

    console.log('Querying Salesforce...');
    const sfOpps = await querySalesforce(conn, soql);
    console.log(`Found ${sfOpps.length} opportunities with Agreement_Status__c\n`);

    // Batch update
    let updated = 0;
    const batchSize = 100;

    for (let i = 0; i < sfOpps.length; i += batchSize) {
      const batch = sfOpps.slice(i, i + batchSize);
      const sfIds = batch.map(o => o.Id);

      // Get matching Panda CRM opportunities
      const pandaOpps = await prisma.opportunity.findMany({
        where: { salesforceId: { in: sfIds } },
        select: { id: true, salesforceId: true },
      });

      // Update each one
      for (const pandaOpp of pandaOpps) {
        const sfOpp = batch.find(o => o.Id === pandaOpp.salesforceId);
        if (sfOpp && !dryRun) {
          await prisma.opportunity.update({
            where: { id: pandaOpp.id },
            data: {
              status: sfOpp.Agreement_Status__c,
            },
          });
          updated++;
        }
      }

      console.log(`Updated ${Math.min(i + batchSize, sfOpps.length)}/${sfOpps.length}...`);
    }

    console.log(`\nTotal updated: ${updated}`);

  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Main execution
migrateAgreements()
  .then(() => {
    console.log('\nAgreement migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration failed:', error);
    process.exit(1);
  });
