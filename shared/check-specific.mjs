import { PrismaClient } from './node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function check() {
  try {
    const oppId = 'cmjolg43e1p2jbnkju2322t8y';
    
    // Query using raw SQL with snake_case
    const activities = await prisma.$queryRaw`
      SELECT id, opportunity_id, type, subject, source_type, occurred_at 
      FROM activities 
      WHERE opportunity_id = ${oppId}
      ORDER BY occurred_at DESC
    `;
    console.log(`Activities for ${oppId}:`, activities.length);
    activities.forEach(a => console.log(' ', a.type, '-', a.subject?.substring(0, 50), '| source:', a.source_type));
    
    // Try Prisma model query
    console.log('\nTrying Prisma model query...');
    const prismaActivities = await prisma.activity.findMany({
      where: { opportunityId: oppId },
      select: { id: true, type: true, subject: true, sourceType: true }
    });
    console.log('Prisma query result:', prismaActivities.length);
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
