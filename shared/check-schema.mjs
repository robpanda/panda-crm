import { PrismaClient } from './node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function check() {
  try {
    // Try to query the activities table directly
    const result = await prisma.$queryRaw`SELECT COUNT(*) as count FROM activities`;
    console.log('Activities table exists, count:', result);
    
    // Check if opportunityId column exists
    const sample = await prisma.$queryRaw`SELECT id, "opportunityId", type, subject FROM activities LIMIT 3`;
    console.log('Sample activities:', sample);
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
