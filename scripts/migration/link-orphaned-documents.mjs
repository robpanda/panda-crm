/**
 * Link Orphaned Adobe Sign Documents to Opportunities
 *
 * This script finds Adobe Sign documents that don't have DocumentLink records
 * and attempts to link them to opportunities based on:
 * 1. Agreement table (matches by salesforceId)
 * 2. Metadata stored in the document (opportunitySfId, accountSfId)
 *
 * Usage:
 *   node link-orphaned-documents.mjs --dry-run    # Preview changes
 *   node link-orphaned-documents.mjs              # Apply changes
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

async function linkOrphanedDocuments() {
  console.log('='.repeat(70));
  console.log('Link Orphaned Adobe Sign Documents to Opportunities');
  console.log('='.repeat(70));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (changes will be applied)'}`);
  console.log('');

  // Find orphaned documents
  const orphanedDocs = await prisma.document.findMany({
    where: {
      sourceType: 'ADOBE_SIGN',
      links: { none: {} }
    },
    select: {
      id: true,
      title: true,
      salesforceId: true,
      metadata: true
    }
  });

  console.log(`Found ${orphanedDocs.length} orphaned Adobe Sign documents\n`);

  let linkedToOpportunity = 0;
  let linkedToAccount = 0;
  let notFound = 0;
  let errors = 0;

  for (const doc of orphanedDocs) {
    try {
      const meta = doc.metadata ?
        (typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata) : {};

      // Strategy 1: Find Agreement by salesforceId and get opportunityId
      const agreement = await prisma.agreement.findFirst({
        where: { salesforceId: doc.salesforceId },
        select: {
          id: true,
          opportunityId: true,
          accountId: true,
          opportunity: { select: { accountId: true } }
        }
      });

      let opportunityId = null;
      let accountId = null;

      if (agreement) {
        opportunityId = agreement.opportunityId;
        accountId = agreement.accountId || agreement.opportunity?.accountId;
      }

      // Strategy 2: If no agreement match, try metadata
      if (!opportunityId && meta.opportunitySfId) {
        const opp = await prisma.opportunity.findFirst({
          where: { salesforceId: meta.opportunitySfId },
          select: { id: true, accountId: true }
        });
        if (opp) {
          opportunityId = opp.id;
          accountId = opp.accountId;
        }
      }

      // Strategy 3: If still no match but we have account SF ID
      if (!opportunityId && !accountId && meta.accountSfId) {
        const acc = await prisma.account.findFirst({
          where: { salesforceId: meta.accountSfId },
          select: { id: true }
        });
        if (acc) {
          accountId = acc.id;
        }
      }

      // Create the DocumentLink
      if (opportunityId || accountId) {
        if (VERBOSE || DRY_RUN) {
          console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Linking: ${doc.title?.substring(0, 50)}...`);
          console.log(`  → Opportunity: ${opportunityId || 'N/A'}, Account: ${accountId || 'N/A'}`);
        }

        if (!DRY_RUN) {
          await prisma.documentLink.create({
            data: {
              id: `doclink_${doc.id}_auto`,
              salesforceId: `AUTOLINK_${doc.salesforceId}`,
              documentId: doc.id,
              opportunityId: opportunityId,
              accountId: accountId,
              linkedRecordType: opportunityId ? 'OPPORTUNITY' : 'ACCOUNT',
              shareType: 'V', // Viewer access
              visibility: 'AllUsers'
            }
          });
        }

        if (opportunityId) {
          linkedToOpportunity++;
        } else {
          linkedToAccount++;
        }
      } else {
        notFound++;
        if (VERBOSE) {
          console.log(`[NOT FOUND] ${doc.title?.substring(0, 50)}... (SF ID: ${doc.salesforceId})`);
        }
      }
    } catch (error) {
      errors++;
      console.error(`[ERROR] ${doc.title}: ${error.message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log(`Total orphaned documents:     ${orphanedDocs.length}`);
  console.log(`Linked to Opportunities:      ${linkedToOpportunity}`);
  console.log(`Linked to Accounts only:      ${linkedToAccount}`);
  console.log(`Could not find match:         ${notFound}`);
  console.log(`Errors:                       ${errors}`);
  console.log('');

  if (DRY_RUN) {
    console.log('This was a DRY RUN. Run without --dry-run to apply changes.');
  }

  await prisma.$disconnect();
}

linkOrphanedDocuments().catch(console.error);
