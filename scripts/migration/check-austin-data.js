#!/usr/bin/env node
import { getPrismaClient, disconnect } from './prisma-client.js';

const prisma = await getPrismaClient();

// Find Austin Boyle
const austin = await prisma.user.findFirst({
  where: {
    OR: [
      { email: { contains: 'austin', mode: 'insensitive' } },
      { firstName: { contains: 'Austin', mode: 'insensitive' } }
    ]
  },
  select: { id: true, email: true, firstName: true, lastName: true }
});

if (!austin) {
  console.log('Austin Boyle not found');
  await disconnect();
  process.exit(1);
}

console.log('=== AUSTIN BOYLE ===');
console.log('ID:', austin.id);
console.log('Email:', austin.email);
console.log('Name:', austin.firstName, austin.lastName);

// Get current month date range
const now = new Date();
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

console.log('Date range:', monthStart.toISOString().split('T')[0], 'to', monthEnd.toISOString().split('T')[0]);

// Count closed-won opportunities this month for Austin
const closedWonThisMonth = await prisma.opportunity.findMany({
  where: {
    ownerId: austin.id,
    stage: 'CLOSED_WON',
    closeDate: {
      gte: monthStart,
      lte: monthEnd
    },
    deletedAt: null
  },
  select: { id: true, name: true, amount: true, closeDate: true }
});

console.log('\n=== SALES THIS MONTH ===');
console.log('Closed-Won count:', closedWonThisMonth.length);
const totalVolume = closedWonThisMonth.reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);
console.log('Total Volume:', totalVolume);
console.log('Avg Deal Size:', closedWonThisMonth.length > 0 ? totalVolume / closedWonThisMonth.length : 0);

console.log('\n=== LEADS (isConverted: false) ===');
const leadCounts = await prisma.lead.groupBy({
  by: ['status'],
  where: { ownerId: austin.id, deleted_at: null, isConverted: false },
  _count: true
});
let totalLeads = 0;
for (const lc of leadCounts) {
  console.log(lc.status + ':', lc._count);
  totalLeads += lc._count;
}
console.log('Total leads:', totalLeads);
const newLeads = leadCounts.find(l => l.status === 'NEW')?._count || 0;
console.log('NEW leads only:', newLeads);

console.log('\n=== OPPORTUNITIES (PIPELINE) ===');
const oppCounts = await prisma.opportunity.groupBy({
  by: ['stage'],
  where: { ownerId: austin.id, deletedAt: null },
  _count: true,
  _sum: { amount: true }
});
let totalOpps = 0;
let openPipelineValue = 0;
let closedWon = 0;
let closedLost = 0;
for (const oc of oppCounts) {
  console.log(oc.stage + ':', oc._count, '(amount:', oc._sum.amount, ')');
  totalOpps += oc._count;
  if (oc.stage === 'CLOSED_WON') closedWon = oc._count;
  else if (oc.stage === 'CLOSED_LOST') closedLost = oc._count;
  else openPipelineValue += parseFloat(oc._sum.amount || 0);
}
const openOpps = totalOpps - closedWon - closedLost;
console.log('\nMy Prospects (open opps):', openOpps);
console.log('Open Pipeline Value:', openPipelineValue);

// Unscheduled (LEAD_ASSIGNED or LEAD_UNASSIGNED)
const unscheduled = oppCounts.filter(o => ['LEAD_ASSIGNED', 'LEAD_UNASSIGNED'].includes(o.stage))
  .reduce((sum, o) => sum + o._count, 0);
console.log('Unscheduled:', unscheduled);

// Scheduled
const scheduled = oppCounts.find(o => o.stage === 'SCHEDULED')?._count || 0;
console.log('Scheduled:', scheduled);

console.log('\n=== COMMISSIONS ===');
const commissions = await prisma.commission.findMany({
  where: { ownerId: austin.id },
  select: { status: true, commissionAmount: true, paidAmount: true }
});

const unpaid = commissions.filter(c => ['NEW', 'REQUESTED', 'APPROVED'].includes(c.status));
const unpaidAmount = unpaid.reduce((sum, c) => sum + (parseFloat(c.commissionAmount) || 0), 0);
console.log('Unpaid commissions:', unpaid.length, 'pending (amount:', unpaidAmount, ')');

const paid = commissions.filter(c => c.status === 'PAID');
const paidAmount = paid.reduce((sum, c) => sum + (parseFloat(c.paidAmount || c.commissionAmount) || 0), 0);
console.log('Paid commissions:', paid.length, '(amount:', paidAmount, ')');

await disconnect();
