// Find Work Orders in Salesforce that are missing from Panda CRM
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

async function findMissingWorkOrders() {
  console.log('Finding missing Work Orders...\n');

  try {
    const conn = await getConnection();
    
    // Get Prisma client
    const { PrismaClient } = await import('../../shared/node_modules/@prisma/client/index.js');
    const prisma = new PrismaClient();

    // Get all SF IDs from our database
    console.log('Loading local Work Order IDs...');
    const localWOs = await prisma.workOrder.findMany({
      where: { salesforceId: { not: null } },
      select: { salesforceId: true }
    });
    const localSfIds = new Set(localWOs.map(wo => wo.salesforceId));
    console.log('Local Salesforce IDs count:', localSfIds.size);

    // Query ALL SF work orders in batches
    console.log('\nFetching all Salesforce Work Orders...');
    let allSfWOs = [];
    let done = false;
    let nextRecordsUrl = null;
    
    const result = await conn.query(`
      SELECT Id, WorkOrderNumber, Status, AccountId, Opportunity__c, CreatedDate
      FROM WorkOrder
      ORDER BY CreatedDate DESC
    `);
    
    allSfWOs = result.records;
    nextRecordsUrl = result.nextRecordsUrl;
    
    while (nextRecordsUrl) {
      console.log('Fetching more records... total so far:', allSfWOs.length);
      const moreResult = await conn.queryMore(nextRecordsUrl);
      allSfWOs = allSfWOs.concat(moreResult.records);
      nextRecordsUrl = moreResult.nextRecordsUrl;
    }
    
    console.log('Total Work Orders in Salesforce:', allSfWOs.length);

    // Find missing ones
    const missingWOs = allSfWOs.filter(wo => !localSfIds.has(wo.Id));
    console.log('\nMissing Work Orders:', missingWOs.length);

    // Analyze missing by status
    const missingByStatus = {};
    const missingWithOpp = [];
    const missingWithoutOpp = [];
    
    missingWOs.forEach(wo => {
      const status = wo.Status || 'NULL';
      missingByStatus[status] = (missingByStatus[status] || 0) + 1;
      if (wo.Opportunity__c) {
        missingWithOpp.push(wo);
      } else {
        missingWithoutOpp.push(wo);
      }
    });

    console.log('\nMissing by Status:');
    Object.entries(missingByStatus).sort((a, b) => b[1] - a[1]).forEach(([status, count]) => {
      console.log('  ' + status + ': ' + count);
    });

    console.log('\nMissing with Opportunity__c:', missingWithOpp.length);
    console.log('Missing without Opportunity__c:', missingWithoutOpp.length);

    // Check dates of missing records
    if (missingWOs.length > 0) {
      const sortedMissing = [...missingWOs].sort((a, b) => new Date(a.CreatedDate) - new Date(b.CreatedDate));
      console.log('\nOldest missing Work Order:', sortedMissing[0].WorkOrderNumber, 'created', sortedMissing[0].CreatedDate);
      console.log('Newest missing Work Order:', sortedMissing[sortedMissing.length - 1].WorkOrderNumber, 'created', sortedMissing[sortedMissing.length - 1].CreatedDate);
      
      // Group by month
      const byMonth = {};
      missingWOs.forEach(wo => {
        const month = wo.CreatedDate.substring(0, 7); // YYYY-MM
        byMonth[month] = (byMonth[month] || 0) + 1;
      });
      console.log('\nMissing by Month (top 10):');
      Object.entries(byMonth)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .forEach(([month, count]) => {
          console.log('  ' + month + ': ' + count);
        });
    }

    // Check if missing ones are related to existing accounts/opportunities
    console.log('\n\nChecking if missing Work Orders relate to existing Accounts/Opportunities in CRM...');
    
    // Sample first 10 missing with Opportunity
    console.log('\nSample of missing Work Orders WITH Opportunity:');
    missingWithOpp.slice(0, 10).forEach(wo => {
      console.log('  ' + wo.WorkOrderNumber + ' | Status: ' + wo.Status + ' | Opp: ' + wo.Opportunity__c);
    });

    await prisma.$disconnect();

  } catch (error) {
    console.error('Error:', error);
  }
}

findMissingWorkOrders();
