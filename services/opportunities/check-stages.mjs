import { PrismaClient } from './node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function main() {
  try {
    const counts = await prisma.opportunity.groupBy({
      by: ['stage'],
      _count: { id: true },
      where: {
        deletedAt: null,
      },
    });

    console.log('Stage Counts from Database:');
    console.log('===========================');
    
    const sorted = counts.sort((a, b) => b._count.id - a._count.id);
    
    for (const item of sorted) {
      console.log(`${item.stage}: ${item._count.id}`);
    }

    const total = await prisma.opportunity.count({
      where: { deletedAt: null }
    });
    console.log(`\nTotal opportunities: ${total}`);

  } catch(err) {
    console.error('Error:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
