#!/usr/bin/env node

import { prisma } from './prisma-client.js';

async function main() {
  // Find the Call Center Manager role
  const ccManagerRole = await prisma.role.findFirst({
    where: { name: 'Call Center Manager' },
  });

  if (!ccManagerRole) {
    console.log('Call Center Manager role not found!');
    process.exit(1);
  }

  console.log('Found Call Center Manager role:', ccManagerRole.name, '(id:', ccManagerRole.id + ')');

  // Update Sutton's role
  const updated = await prisma.user.update({
    where: { email: 'suttongasper@pandaexteriors.com' },
    data: { roleId: ccManagerRole.id },
    include: { role: true },
  });

  console.log('\nUpdated Sutton Gasper:');
  console.log('  New Role:', updated.role.name);
  console.log('  Role Type:', updated.role.roleType);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
