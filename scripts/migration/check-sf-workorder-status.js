// Check Work Order statuses in Salesforce
import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import dotenv from 'dotenv';
dotenv.config();

async function checkSalesforceStatuses() {
  console.log('Checking Work Order statuses in Salesforce...\n');

  try {
    // Get status distribution
    const statusQuery = `
      SELECT Status, COUNT(Id) cnt
      FROM WorkOrder
      GROUP BY Status
      ORDER BY COUNT(Id) DESC
    `;

    const results = await querySalesforce(statusQuery);

    console.log('Work Order Status Distribution in Salesforce:');
    console.log('='.repeat(50));
    results.forEach(r => {
      console.log('  ' + (r.Status || 'NULL') + ': ' + r.cnt);
    });

    // Get total count
    const totalQuery = 'SELECT COUNT() FROM WorkOrder';
    const totalResult = await querySalesforce(totalQuery);
    console.log('\nTotal Work Orders in Salesforce:', totalResult[0].expr0);

    // Get sample work orders with different statuses
    console.log('\n\nSample Work Orders by Status:');
    console.log('='.repeat(50));

    const sampleQuery = `
      SELECT Id, WorkOrderNumber, Status, Priority, CreatedDate, LastModifiedDate
      FROM WorkOrder
      ORDER BY LastModifiedDate DESC
      LIMIT 20
    `;

    const samples = await querySalesforce(sampleQuery);
    samples.forEach(wo => {
      console.log('  ' + wo.WorkOrderNumber + ' | Status: ' + wo.Status + ' | Priority: ' + wo.Priority);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

checkSalesforceStatuses();
