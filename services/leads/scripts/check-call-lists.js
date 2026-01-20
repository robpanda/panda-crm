#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkLists() {
  const lists = await prisma.callList.findMany({
    where: { isActive: true },
    select: { id: true, name: true, filterCriteria: true, targetObject: true, listType: true }
  });

  console.log('Call Lists:\n');
  for (const list of lists) {
    console.log(`Name: ${list.name}`);
    console.log(`  Type: ${list.listType}`);
    console.log(`  Target: ${list.targetObject}`);
    console.log(`  Filter: ${JSON.stringify(list.filterCriteria, null, 2)}`);
    console.log('');
  }

  await prisma.$disconnect();
}

checkLists();
