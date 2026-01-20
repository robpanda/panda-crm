/**
 * Seed Champion Referral System
 * Creates default payout tiers and referral settings
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Champion Referral System...\n');

  // 1. Create default Payout Tiers
  console.log('Creating default payout tiers...');

  const payoutTiers = [
    {
      name: 'Signup Bonus',
      description: 'Bonus paid when a new Champion signs up and is approved',
      type: 'SIGNUP_BONUS',
      amount: 25.00,
      priority: 1,
      isActive: true,
    },
    {
      name: 'Referral Submitted',
      description: 'Bonus paid when a Champion submits any referral (optional)',
      type: 'REFERRAL_BONUS',
      amount: 0.00, // Disabled by default
      priority: 2,
      isActive: false,
    },
    {
      name: 'Qualified Lead',
      description: 'Bonus paid when a referral is qualified as a valid lead',
      type: 'QUALIFIED_BONUS',
      amount: 50.00,
      priority: 3,
      isActive: true,
    },
    {
      name: 'Closed Won Deal',
      description: 'Bonus paid when a referral results in a closed deal',
      type: 'CLOSED_WON_BONUS',
      amount: 150.00,
      priority: 4,
      isActive: true,
    },
  ];

  for (const tier of payoutTiers) {
    const existing = await prisma.championPayoutTier.findFirst({
      where: { name: tier.name },
    });

    if (existing) {
      console.log(`  - Tier "${tier.name}" already exists, updating...`);
      await prisma.championPayoutTier.update({
        where: { id: existing.id },
        data: tier,
      });
    } else {
      console.log(`  - Creating tier "${tier.name}": $${tier.amount}`);
      await prisma.championPayoutTier.create({ data: tier });
    }
  }

  // 2. Create default Referral Settings
  console.log('\nCreating default referral settings...');

  const existingSettings = await prisma.referralSettings.findFirst();

  if (existingSettings) {
    console.log('  - Referral settings already exist, skipping...');
  } else {
    await prisma.referralSettings.create({
      data: {
        programName: 'Panda Champion Referral Program',
        programDescription: 'Earn rewards for referring friends and family to Panda Exteriors. Get paid when your referrals become customers!',
        isActive: true,
        allowSelfRegistration: true,
        requireApproval: false, // Auto-approve for now
        inviteOnly: false,
        codePrefix: 'PANDA',
        codeLength: 6,
        defaultMinimumPayout: 25.00,
        payoutProcessingDay: 1, // First of month
        autoProcessPayouts: false,
        duplicateWindowDays: 90,
        duplicateCheckAddress: true,
        duplicateCheckPhone: true,
        supportEmail: 'referrals@pandaexteriors.com',
        supportPhone: '+1-240-801-6665',
      },
    });
    console.log('  - Default referral settings created');
  }

  // 3. Summary
  const tierCount = await prisma.championPayoutTier.count();
  const settingsCount = await prisma.referralSettings.count();

  console.log('\n========================================');
  console.log('Champion Referral System Seeding Complete');
  console.log('========================================');
  console.log(`Payout Tiers: ${tierCount}`);
  console.log(`Settings Records: ${settingsCount}`);
  console.log('\nDefault Payout Structure:');
  console.log('  - Signup Bonus: $25');
  console.log('  - Qualified Lead: $50');
  console.log('  - Closed Deal: $150');
  console.log('\n');
}

main()
  .catch((e) => {
    console.error('Error seeding champion system:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
