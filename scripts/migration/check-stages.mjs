import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://panda_admin:Toortoor%401@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm'
    }
  }
});

async function main() {
  // Get stage counts
  const stageCounts = await prisma.opportunity.groupBy({
    by: ['stage'],
    where: { deletedAt: null },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } }
  });
  
  console.log('\n=== OPPORTUNITY STAGE COUNTS ===\n');
  let total = 0;
  for (const item of stageCounts) {
    console.log(`${item.stage}: ${item._count.id}`);
    total += item._count.id;
  }
  console.log(`\nTOTAL: ${total}`);
  
  // Also check leads count
  const leadsCount = await prisma.lead.count({
    where: { deleted_at: null }
  });
  console.log(`\n=== LEADS COUNT ===`);
  console.log(`Total leads: ${leadsCount}`);
  
  await prisma.$disconnect();
}

main().catch(console.error);
