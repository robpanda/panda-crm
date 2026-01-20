import { PrismaClient } from './node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function check() {
  try {
    const oppId = 'cmjolg43e1p2jbnkju2322t8y';
    
    // Check activities
    const activities = await prisma.activity.findMany({
      where: { opportunityId: oppId },
      orderBy: { occurredAt: 'desc' }
    });
    console.log(`Activities for opportunity ${oppId}: ${activities.length}`);
    if (activities.length > 0) {
      console.log('\nSample activity:');
      console.log(JSON.stringify(activities[0], null, 2));
    }
    
    // Check notes
    const notes = await prisma.note.findMany({
      where: { opportunityId: oppId }
    });
    console.log(`\nNotes for opportunity: ${notes.length}`);
    
    // Check opportunity exists
    const opp = await prisma.opportunity.findUnique({
      where: { id: oppId },
      select: { id: true, name: true, accountId: true }
    });
    console.log('\nOpportunity:', opp);
    
  } finally {
    await prisma.$disconnect();
  }
}

check();
