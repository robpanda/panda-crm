import { PrismaClient } from '../../shared/node_modules/@prisma/client/index.js';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function checkWorkOrders() {
  // Get status counts
  const statusCounts = await prisma.workOrder.groupBy({
    by: ['status'],
    _count: { status: true },
  });

  console.log('Work Order Status Distribution:');
  statusCounts.forEach(s => console.log('  ' + s.status + ': ' + s._count.status));

  // Get total count
  const total = await prisma.workOrder.count();
  console.log('\nTotal work orders:', total);

  // Count how many have salesforceId
  const withSfId = await prisma.workOrder.count({
    where: { salesforceId: { not: null } }
  });
  const withoutSfId = await prisma.workOrder.count({
    where: { salesforceId: null }
  });

  console.log('\nWork orders with Salesforce ID:', withSfId);
  console.log('Work orders without Salesforce ID:', withoutSfId);

  // Get sample of work orders
  const sample = await prisma.workOrder.findMany({
    take: 5,
    select: {
      id: true,
      workOrderNumber: true,
      status: true,
      salesforceId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log('\nSample work orders (5 most recent):');
  sample.forEach(wo => {
    console.log('  ' + wo.workOrderNumber + ' | ' + wo.status + ' | SF: ' + (wo.salesforceId || 'NULL') + ' | Created: ' + wo.createdAt);
  });

  await prisma.$disconnect();
}

checkWorkOrders().catch(console.error);
