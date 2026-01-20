const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm'
    }
  }
});

async function main() {
  // Check for messages in last 10 minutes
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recentMessages = await prisma.message.findMany({
    where: {
      createdAt: { gte: tenMinAgo }
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`Messages in last 10 minutes: ${recentMessages.length}`);
  recentMessages.forEach(m => {
    console.log(`[${m.createdAt}] ${m.direction}: ${m.body?.substring(0, 60)}`);
  });

  // Check for messages containing "Brian" or "Clinton"
  console.log('\n--- Checking for Brian/Clinton messages ---');
  const userMessages = await prisma.message.findMany({
    where: {
      OR: [
        { body: { contains: 'Brian' } },
        { body: { contains: 'Clinton' } },
        { body: { contains: '4431231234' } }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 5
  });

  console.log(`Found ${userMessages.length} Brian/Clinton messages`);
  userMessages.forEach(m => {
    console.log(`[${m.createdAt}] From: ${m.fromPhone} To: ${m.toPhone} - ${m.body?.substring(0, 60)}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
