// Final check of Work Order migration status
import jsforce from 'jsforce';
import { PrismaClient } from '../../shared/node_modules/@prisma/client/index.js';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function getConnection() {
  const connection = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
  });
  await connection.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
  );
  return connection;
}

async function finalCheck() {
  console.log('='.repeat(60));
  console.log('WORK ORDER MIGRATION STATUS');
  console.log('='.repeat(60));

  const conn = await getConnection();

  // SF counts
  const sfTotal = await conn.query('SELECT COUNT(Id) cnt FROM WorkOrder WHERE IsDeleted = false');
  const sfWithAccount = await conn.query('SELECT COUNT(Id) cnt FROM WorkOrder WHERE AccountId != null AND IsDeleted = false');
  const sfNoAccount = await conn.query('SELECT COUNT(Id) cnt FROM WorkOrder WHERE AccountId = null AND IsDeleted = false');

  console.log('\nSalesforce:');
  console.log('  Total Work Orders:', sfTotal.records[0].cnt);
  console.log('  With AccountId:', sfWithAccount.records[0].cnt);
  console.log('  Without AccountId:', sfNoAccount.records[0].cnt);

  // Local counts
  const localTotal = await prisma.workOrder.count();
  const localWithSF = await prisma.workOrder.count({ where: { salesforceId: { not: null } } });

  console.log('\nPanda CRM:');
  console.log('  Total Work Orders:', localTotal);
  console.log('  With Salesforce ID:', localWithSF);

  // Status distribution
  const sfStatuses = await conn.query(`
    SELECT Status, COUNT(Id) cnt FROM WorkOrder GROUP BY Status ORDER BY COUNT(Id) DESC
  `);
  console.log('\nSalesforce Status Distribution:');
  sfStatuses.records.forEach(s => {
    console.log('  ' + (s.Status || 'NULL') + ': ' + s.cnt);
  });

  const localStatuses = await prisma.workOrder.groupBy({
    by: ['status'],
    _count: { status: true }
  });
  console.log('\nPanda CRM Status Distribution:');
  localStatuses.forEach(s => {
    console.log('  ' + s.status + ': ' + s._count.status);
  });

  // Calculate coverage
  const coverage = ((localTotal / sfTotal.records[0].cnt) * 100).toFixed(1);
  console.log('\n' + '='.repeat(60));
  console.log('COVERAGE:', coverage + '%');
  console.log('Missing:', sfTotal.records[0].cnt - localTotal, 'Work Orders');
  console.log('  (', sfNoAccount.records[0].cnt, 'have no Account in SF - cannot migrate)');
  console.log('='.repeat(60));

  await prisma.$disconnect();
}

finalCheck().catch(console.error);
