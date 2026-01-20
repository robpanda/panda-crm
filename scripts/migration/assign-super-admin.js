#!/usr/bin/env node

import { prisma } from './prisma-client.js';

async function main() {
  // Find the Super Admin role
  const superAdminRole = await prisma.role.findFirst({
    where: {
      OR: [
        { name: 'Super Admin' },
        { name: 'super_admin' },
        { roleType: 'super_admin' },
      ]
    },
  });

  if (!superAdminRole) {
    console.log('Super Admin role not found!');
    process.exit(1);
  }

  console.log('Found Super Admin role:', superAdminRole.name, '(id:', superAdminRole.id + ')');

  // Update Rob's role
  const updated = await prisma.user.update({
    where: { email: 'robwinters@pandaexteriors.com' },
    data: { roleId: superAdminRole.id },
    include: { role: true },
  });

  console.log('\nUpdated Rob Winters:');
  console.log('  New Role:', updated.role.name);
  console.log('  Role Type:', updated.role.roleType);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
