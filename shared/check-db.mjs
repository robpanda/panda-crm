import { PrismaClient } from './node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function check() {
  try {
    // Check these specific jobs
    const jobNums = ['Panda Ext-10838', 'Panda Ext-7562', 'Panda Ext-7304', 'Panda Ext-7236', 'Panda Ext-128604', 'Panda Ext-129945'];
    
    for (const num of jobNums) {
      const found = await prisma.opportunity.findFirst({
        where: { name: { contains: num } },
        select: { id: true, name: true, jobId: true }
      });
      console.log(`${num}: ${found ? 'FOUND - ' + found.name : 'NOT FOUND'}`);
    }
    
    // What's the lowest job number in CRM?
    const lowest = await prisma.opportunity.findFirst({
      where: { name: { contains: 'Panda Ext-' } },
      orderBy: { name: 'asc' },
      select: { name: true }
    });
    console.log('\nLowest in CRM:', lowest?.name);
    
  } finally {
    await prisma.$disconnect();
  }
}

check();
