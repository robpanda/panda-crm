import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: join(__dirname, '../../../../shared/.env') });

import pkg from '@prisma/client';
const { PrismaClient } = pkg;
const prisma = new PrismaClient();

async function findRecentCampaigns() {
  try {
    console.log('Querying all campaigns...\n');

    const campaigns = await prisma.campaign.findMany({
      orderBy: {
        updatedAt: 'desc'
      },
      take: 50,
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        sendSchedule: true,
        totalSent: true,
        delivered: true,
        failed: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log(`Found ${campaigns.length} campaigns:\n`);
    console.log(JSON.stringify(campaigns, null, 2));

    console.log('\n--- SUMMARY ---');
    console.log(`Total campaigns: ${campaigns.length}`);
    const statusCounts = campaigns.reduce((acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      return acc;
    }, {});
    console.log('Status breakdown:', statusCounts);

  } catch (error) {
    console.error('Error querying campaigns:', error);
  } finally {
    await prisma.$disconnect();
  }
}

findRecentCampaigns();
