/**
 * Link Orphaned Adobe Sign Documents to Opportunities
 *
 * This script finds Adobe Sign documents that don't have DocumentLink records
 * and attempts to link them to opportunities based on:
 * 1. Matching Agreement records by name similarity
 * 2. Looking up opportunities/accounts by their Salesforce IDs
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

  // Pre-load agreements to match by name
  console.log('Loading agreement mappings...');
  const agreements = await prisma.agreement.findMany({
    where: { opportunityId: { not: null } },
    select: { id: true, name: true, opportunityId: true, accountId: true }
  });
  console.log(`  Loaded ${agreements.length} agreements with opportunities\n`);

  let linkedToOpportunity = 0;
  let linkedToAccount = 0;
  let notFound = 0;
  let errors = 0;
  let duplicateSkipped = 0;

  for (let i = 0; i < orphanedDocs.length; i++) {
    const doc = orphanedDocs[i];
    if ((i + 1) % 100 === 0) {
      console.log(`Processing ${i + 1}/${orphanedDocs.length}...`);
    }

    try {
      let opportunityId = null;
      let accountId = null;

      // Strategy 1: Try to find matching agreement by name
      // Extract customer name from document title like "Service Agreement & Assignment of Claim for Jane Doe-"
      const nameMatch = doc.title?.match(/for\s+(.+?)[-\s]*$/i);
      const customerName = nameMatch ? nameMatch[1].trim() : null;

      if (customerName && customerName.length > 3) {
        // Find agreement with matching customer name
        const matchingAgreement = agreements.find(a =>
          a.name?.toLowerCase().includes(customerName.toLowerCase())
        );
        if (matchingAgreement) {
          opportunityId = matchingAgreement.opportunityId;
          accountId = matchingAgreement.accountId;
        }
      }

      // Strategy 2: If no match by name, try existing DocumentLinks from docs with similar titles
      if (!opportunityId) {
        const similarDocs = await prisma.document.findMany({
          where: {
            sourceType: 'ADOBE_SIGN',
            title: doc.title,
            links: { some: { opportunityId: { not: null } } }
          },
          include: { links: { select: { opportunityId: true, accountId: true } } },
          take: 1
        });

        if (similarDocs.length > 0 && similarDocs[0].links.length > 0) {
          opportunityId = similarDocs[0].links[0].opportunityId;
          accountId = similarDocs[0].links[0].accountId;
        }
      }

      // Create the DocumentLink if we found a match
      if (opportunityId || accountId) {
        if (VERBOSE || DRY_RUN) {
          console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Linking: ${doc.title?.substring(0, 50)}...`);
          console.log(`  -> Opportunity: ${opportunityId || 'N/A'}, Account: ${accountId || 'N/A'}`);
        }

        if (!DRY_RUN) {
          try {
            await prisma.documentLink.create({
              data: {
                id: `doclink_${doc.id.slice(-12)}_auto`,
                salesforceId: `AUTOLINK_${doc.salesforceId}`,
                documentId: doc.id,
                opportunityId: opportunityId,
                accountId: accountId,
                linkedRecordType: opportunityId ? 'OPPORTUNITY' : 'ACCOUNT',
                shareType: 'V',
                visibility: 'AllUsers'
              }
            });
          } catch (e) {
            if (e.code === 'P2002') {
              duplicateSkipped++;
              continue;
            }
            throw e;
          }
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
      if (VERBOSE) {
        console.error(`[ERROR] ${doc.title}: ${error.message}`);
      }
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
  console.log(`Duplicate links skipped:      ${duplicateSkipped}`);
  console.log(`Errors:                       ${errors}`);
  console.log('');

  if (DRY_RUN) {
    console.log('This was a DRY RUN. Run without --dry-run to apply changes.');
  }

  await prisma.$disconnect();
}

linkOrphanedDocuments().catch(console.error);
