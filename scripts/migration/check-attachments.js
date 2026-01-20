import { querySalesforce } from './salesforce-client.js';

async function checkAttachments() {
  try {
    // Count total attachments in Salesforce
    const result = await querySalesforce(`
      SELECT COUNT() 
      FROM Attachment 
      WHERE ParentId != null
    `);
    
    console.log('\nSalesforce Attachment count:', result.totalSize);
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkAttachments();
