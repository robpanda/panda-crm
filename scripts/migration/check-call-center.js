const prisma = require('./prisma-client');

async function run() {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      department: { contains: 'Call', mode: 'insensitive' }
    },
    select: { id: true, fullName: true, department: true, title: true },
    orderBy: { fullName: 'asc' }
  });
  console.log('Call Center Department Users:', users.length);
  users.forEach(u => console.log(' -', u.fullName, '|', u.department, '|', u.title));
  await prisma.$disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
