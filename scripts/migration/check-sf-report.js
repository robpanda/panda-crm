// Check the Work Orders Scheduled report data from Salesforce
import jsforce from 'jsforce';
import dotenv from 'dotenv';
dotenv.config();

async function getConnection() {
  const connection = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
  });

  await connection.login(
    process.env.SF_USERNAME,
    process.env.SF_PASSWORD + (process.env.SF_SECURITY_TOKEN || '')
  );
  console.log('Connected to Salesforce:', connection.instanceUrl);
  return connection;
}

async function checkWorkOrdersReport() {
  console.log('Checking Work Orders data from Salesforce...\n');

  try {
    const conn = await getConnection();

    // Get total count of Work Orders
    const totalResult = await conn.query('SELECT COUNT(Id) cnt FROM WorkOrder');
    console.log('Total Work Orders in Salesforce:', totalResult.records[0].cnt);

    // Get status distribution
    console.log('\nWork Order Status Distribution:');
    console.log('='.repeat(50));
    const statusResult = await conn.query(`
      SELECT Status, COUNT(Id) cnt
      FROM WorkOrder
      GROUP BY Status
      ORDER BY COUNT(Id) DESC
    `);
    statusResult.records.forEach(r => {
      const status = r.Status || 'NULL';
      console.log('  ' + status + ': ' + r.cnt);
    });

    // Check for Work Orders linked to Opportunities
    console.log('\n\nWork Orders with Opportunity Link:');
    console.log('='.repeat(50));
    const oppLinkResult = await conn.query(`
      SELECT COUNT(Id) cnt FROM WorkOrder WHERE Opportunity__c != null
    `);
    console.log('Work Orders with Opportunity__c:', oppLinkResult.records[0].cnt);

    // Check Work Orders without Opportunity
    const noOppResult = await conn.query(`
      SELECT COUNT(Id) cnt FROM WorkOrder WHERE Opportunity__c = null
    `);
    console.log('Work Orders without Opportunity__c:', noOppResult.records[0].cnt);

    // Check for Work Orders linked to Accounts
    const accLinkResult = await conn.query(`
      SELECT COUNT(Id) cnt FROM WorkOrder WHERE AccountId != null
    `);
    console.log('Work Orders with AccountId:', accLinkResult.records[0].cnt);

    // Get sample of scheduled work orders with related data
    console.log('\n\nSample Scheduled Work Orders:');
    console.log('='.repeat(80));
    const sampleResult = await conn.query(`
      SELECT Id, WorkOrderNumber, Status, Priority, Subject,
             AccountId, Account.Name,
             Opportunity__c,
             CreatedDate, LastModifiedDate
      FROM WorkOrder
      WHERE Status = 'Scheduled'
      ORDER BY LastModifiedDate DESC
      LIMIT 10
    `);
    sampleResult.records.forEach(wo => {
      const accName = wo.Account ? wo.Account.Name : 'NONE';
      const oppId = wo.Opportunity__c || 'NONE';
      console.log('  ' + wo.WorkOrderNumber + ' | ' + wo.Status + ' | Opp: ' + oppId + ' | Acct: ' + accName);
    });

    // Check Work Order fields from a sample
    console.log('\n\nChecking key Work Order fields:');
    console.log('='.repeat(50));
    const fieldSample = await conn.query(`
      SELECT Id, WorkOrderNumber, Status, Priority, Subject, Description,
             StartDate, EndDate, AccountId, ContactId, Opportunity__c,
             OwnerId, ServiceTerritoryId, WorkTypeId,
             CreatedDate, LastModifiedDate
      FROM WorkOrder
      LIMIT 1
    `);
    if (fieldSample.records.length > 0) {
      console.log('Available fields on Work Order:');
      Object.keys(fieldSample.records[0]).forEach(key => {
        if (key !== 'attributes') {
          const hasData = fieldSample.records[0][key] !== null ? '✓ has data' : '(null)';
          console.log('  - ' + key + ': ' + hasData);
        }
      });
    }

    // Check Service Appointments linked to Work Orders
    console.log('\n\nService Appointments Summary:');
    console.log('='.repeat(50));
    const saCount = await conn.query('SELECT COUNT(Id) cnt FROM ServiceAppointment');
    console.log('Total Service Appointments:', saCount.records[0].cnt);

    const saStatusResult = await conn.query(`
      SELECT Status, COUNT(Id) cnt
      FROM ServiceAppointment
      GROUP BY Status
      ORDER BY COUNT(Id) DESC
    `);
    console.log('\nService Appointment Status Distribution:');
    saStatusResult.records.forEach(s => {
      const status = s.Status || 'NULL';
      console.log('  ' + status + ': ' + s.cnt);
    });

    // Check how many Work Orders we have in our database
    console.log('\n\n' + '='.repeat(50));
    console.log('COMPARING TO PANDA CRM DATABASE:');
    console.log('='.repeat(50));

    // Import Prisma to check local DB
    const { PrismaClient } = await import('../../shared/node_modules/@prisma/client/index.js');
    const prisma = new PrismaClient();

    const localTotal = await prisma.workOrder.count();
    console.log('Work Orders in Panda CRM:', localTotal);

    const localWithSfId = await prisma.workOrder.count({
      where: { salesforceId: { not: null } }
    });
    console.log('Work Orders with Salesforce ID:', localWithSfId);

    const localStatuses = await prisma.workOrder.groupBy({
      by: ['status'],
      _count: { status: true }
    });
    console.log('\nLocal Status Distribution:');
    localStatuses.forEach(s => {
      console.log('  ' + s.status + ': ' + s._count.status);
    });

    // Find missing Work Orders (in SF but not in CRM)
    console.log('\n\nChecking for missing Work Orders...');

    // Get all SF IDs from our database
    const localWOs = await prisma.workOrder.findMany({
      where: { salesforceId: { not: null } },
      select: { salesforceId: true }
    });
    const localSfIds = new Set(localWOs.map(wo => wo.salesforceId));
    console.log('Local Salesforce IDs count:', localSfIds.size);

    await prisma.$disconnect();

  } catch (error) {
    console.error('Error:', error);
  }
}

checkWorkOrdersReport();
