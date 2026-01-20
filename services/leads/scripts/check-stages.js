#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkStages() {
  // Count opportunities by stage
  const stageCounts = await prisma.opportunity.groupBy({
    by: ['stage'],
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } },
  });

  console.log('Opportunity Stage Distribution:\n');
  for (const s of stageCounts) {
    console.log(`  ${s.stage}: ${s._count.id}`);
  }

  // Check for opportunities that might match our lists
  const scheduled = await prisma.opportunity.count({
    where: { stage: 'SCHEDULED' },
  });
  const inspected = await prisma.opportunity.count({
    where: { stage: 'INSPECTED' },
  });

  console.log('\n\nTarget Lists:');
  console.log(`  SCHEDULED (Confirmation): ${scheduled}`);
  console.log(`  INSPECTED (Rehash/Reset): ${inspected}`);

  await prisma.$disconnect();
}

checkStages();
