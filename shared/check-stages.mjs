import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm'
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
  console.log(`Total leads (deleted_at is null): ${leadsCount}`);

  // Check leads matching dashboard filter (isConverted: false)
  const leadsCountNotConverted = await prisma.lead.count({
    where: {
      deleted_at: null,
      isConverted: false
    }
  });
  console.log(`Total leads (isConverted=false - matching dashboard): ${leadsCountNotConverted}`);

  // Check leads with status filter similar to dashboard
  const leadsCountOpen = await prisma.lead.count({
    where: {
      deleted_at: null,
      status: { notIn: ['CONVERTED', 'UNQUALIFIED'] }
    }
  });
  console.log(`Total leads (open - not converted/unqualified): ${leadsCountOpen}`);

  // Group by status
  const leadsByStatus = await prisma.lead.groupBy({
    by: ['status'],
    where: { deleted_at: null },
    _count: { id: true },
    orderBy: { _count: { id: 'desc' } }
  });
  console.log(`\nLeads by status:`);
  for (const item of leadsByStatus) {
    console.log(`  ${item.status || 'NULL'}: ${item._count.id}`);
  }

  // Group by isConverted
  const leadsByConverted = await prisma.lead.groupBy({
    by: ['isConverted'],
    where: { deleted_at: null },
    _count: { id: true }
  });
  console.log(`\nLeads by isConverted:`);
  for (const item of leadsByConverted) {
    console.log(`  isConverted=${item.isConverted}: ${item._count.id}`);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
