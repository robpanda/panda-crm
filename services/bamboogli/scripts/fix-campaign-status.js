/**
 * Fix Campaign Status Script
 *
 * This script fixes campaigns that are stuck in SENDING status
 * by querying actual send status from the database and updating accordingly.
 *
 * Usage:
 *   node scripts/fix-campaign-status.js --dry-run           # Preview changes
 *   node scripts/fix-campaign-status.js                      # Apply fixes
 *   node scripts/fix-campaign-status.js --campaign-id=xxx   # Fix specific campaign
 */

import { PrismaClient } from '../../../shared/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const campaignIdArg = args.find(a => a.startsWith('--campaign-id='));
const SPECIFIC_CAMPAIGN_ID = campaignIdArg ? campaignIdArg.split('=')[1] : null;

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           FIX CAMPAIGN STATUS SCRIPT                           ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`.padEnd(67) + '║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Find campaigns stuck in SENDING status
  const whereClause = {
    status: 'SENDING',
  };

  if (SPECIFIC_CAMPAIGN_ID) {
    whereClause.id = SPECIFIC_CAMPAIGN_ID;
  }

  const stuckCampaigns = await prisma.campaign.findMany({
    where: whereClause,
    include: {
      _count: {
        select: { sends: true }
      }
    }
  });

  if (stuckCampaigns.length === 0) {
    console.log('No campaigns found in SENDING status.');
    return;
  }

  console.log(`Found ${stuckCampaigns.length} campaign(s) stuck in SENDING status:\n`);

  for (const campaign of stuckCampaigns) {
    console.log(`────────────────────────────────────────────────────────────────`);
    console.log(`Campaign: ${campaign.name}`);
    console.log(`ID: ${campaign.id}`);
    console.log(`Type: ${campaign.type}`);
    console.log(`Created: ${campaign.createdAt}`);
    console.log(`Sent At: ${campaign.sentAt}`);
    console.log(`Total Send Records: ${campaign._count.sends}`);
    console.log();

    // Get send status breakdown
    const statusCounts = await prisma.campaignSend.groupBy({
      by: ['status'],
      where: { campaignId: campaign.id },
      _count: true,
    });

    const counts = statusCounts.reduce((acc, s) => {
      acc[s.status] = s._count;
      return acc;
    }, {});

    console.log('Send Status Breakdown:');
    console.log(`  QUEUED:    ${counts.QUEUED || 0}`);
    console.log(`  SENDING:   ${counts.SENDING || 0}`);
    console.log(`  SENT:      ${counts.SENT || 0}`);
    console.log(`  DELIVERED: ${counts.DELIVERED || 0}`);
    console.log(`  FAILED:    ${counts.FAILED || 0}`);
    console.log(`  OPENED:    ${counts.OPENED || 0}`);
    console.log(`  CLICKED:   ${counts.CLICKED || 0}`);
    console.log();

    // Check if all sends are still QUEUED (meaning Twilio was called but DB update failed)
    const totalSends = campaign._count.sends;
    const queuedCount = counts.QUEUED || 0;
    const sentCount = counts.SENT || 0;
    const deliveredCount = counts.DELIVERED || 0;
    const failedCount = counts.FAILED || 0;

    if (queuedCount === totalSends && totalSends > 0) {
      console.log('⚠️  ALL sends are still QUEUED - this indicates the send loop');
      console.log('   completed to Twilio but database updates failed.');
      console.log();
      console.log('   Since messages were sent via Twilio (confirmed by user),');
      console.log('   we will update these sends to SENT status.');
      console.log();

      if (!DRY_RUN) {
        // Update all QUEUED sends to SENT
        const updateResult = await prisma.campaignSend.updateMany({
          where: {
            campaignId: campaign.id,
            status: 'QUEUED',
          },
          data: {
            status: 'SENT',
          },
        });
        console.log(`   ✅ Updated ${updateResult.count} sends to SENT status.`);
      } else {
        console.log(`   [DRY RUN] Would update ${queuedCount} sends to SENT status.`);
      }
    }

    // Calculate new totals
    const newSent = sentCount + queuedCount; // All QUEUED become SENT
    const newDelivered = deliveredCount;
    const newFailed = failedCount;

    console.log();
    console.log('Campaign Status Update:');
    console.log(`  New totalSent: ${newSent}`);
    console.log(`  New delivered: ${newDelivered || newSent}`); // Assume all sent were delivered if no webhook updates
    console.log(`  New failed: ${newFailed}`);
    console.log(`  New status: SENT`);
    console.log();

    if (!DRY_RUN) {
      // Update campaign status
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          status: 'SENT',
          totalSent: newSent,
          delivered: newDelivered || newSent, // Assume delivered if no failures
          failed: newFailed,
        },
      });
      console.log(`   ✅ Campaign status updated to SENT.`);
    } else {
      console.log(`   [DRY RUN] Would update campaign status to SENT.`);
    }

    console.log();
  }

  console.log('────────────────────────────────────────────────────────────────');
  console.log('Done!');

  if (DRY_RUN) {
    console.log('\nTo apply these changes, run without --dry-run flag.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
