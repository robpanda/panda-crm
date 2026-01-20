import { PrismaClient } from '../../shared/node_modules/@prisma/client/index.js';
import bcrypt from '../../services/champions/node_modules/bcryptjs/dist/bcrypt.js';

const prisma = new PrismaClient();

async function createTestChampion() {
  const email = 'rob@pandaexteriors.com';
  const password = 'Panda2025!';

  // Check if champion already exists
  const existing = await prisma.champion.findUnique({
    where: { email }
  });

  if (existing) {
    console.log('Champion already exists:', existing.email);
    return existing;
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 10);

  // Generate referral code
  const referralCode = 'ROB' + Math.random().toString(36).substring(2, 8).toUpperCase();

  // Create champion
  const champion = await prisma.champion.create({
    data: {
      email,
      passwordHash,
      firstName: 'Rob',
      lastName: 'Winters',
      phone: '555-000-0000',
      referralCode,
      status: 'ACTIVE',
      tier: 'BRONZE',
      totalReferrals: 0,
      successfulReferrals: 0,
      lifetimeEarnings: 0,
    }
  });

  // Create wallet
  await prisma.championWallet.create({
    data: {
      championId: champion.id,
      availableBalance: 0,
      pendingBalance: 0,
      lifetimeEarnings: 0,
    }
  });

  console.log('Champion created successfully!');
  console.log('Email:', email);
  console.log('Password:', password);
  console.log('Referral Code:', referralCode);

  return champion;
}

createTestChampion()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('Error:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
