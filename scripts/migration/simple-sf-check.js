import { bulkQuery } from './salesforce-client.js';

async function checkDocs() {
  try {
    console.log('Fetching ALL ContentDocuments from Salesforce...\n');

    const docs = await bulkQuery(`
      SELECT Id, Title, FileType, FileExtension, ContentSize, CreatedDate, LatestPublishedVersionId
      FROM ContentDocument
      ORDER BY CreatedDate DESC
    `);

    console.log(`Total ContentDocuments in Salesforce: ${docs.length}\n`);

    if (docs.length > 0) {
      console.log('Sample of recent documents:');
      docs.slice(0, 10).forEach((doc, i) => {
        const size = (doc.ContentSize || 0) / 1024;
        console.log(`${i+1}. ${doc.Title}.${doc.FileExtension || 'unknown'} (${doc.FileType || 'unknown'}, ${size.toFixed(1)}KB)`);
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkDocs();
