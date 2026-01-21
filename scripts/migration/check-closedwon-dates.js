#!/usr/bin/env node
import { getPrismaClient, disconnect } from './prisma-client.js';
const prisma = await getPrismaClient();

const austin = await prisma.user.findFirst({
  where: { email: { contains: 'austin', mode: 'insensitive' } },
  select: { id: true }
});

const closedWon = await prisma.opportunity.findMany({
  where: {
    ownerId: austin.id,
    stage: 'CLOSED_WON',
    deletedAt: null
  },
  select: { id: true, name: true, closeDate: true, amount: true, soldDate: true, createdAt: true }
});

console.log('Austin CLOSED_WON opportunities (' + closedWon.length + ' total):');
for (const o of closedWon) {
  console.log('Name:', o.name);
  console.log('  closeDate:', o.closeDate);
  console.log('  soldDate:', o.soldDate);
  console.log('  amount:', o.amount ? o.amount.toString() : 'null');
  console.log('  createdAt:', o.createdAt);
  console.log('');
}

await disconnect();
