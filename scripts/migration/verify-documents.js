import { prisma, disconnect } from './prisma-client.js';

async function verify() {
  try {
    // Count documents by source type
    const bySourceType = await prisma.$queryRaw`
      SELECT source_type, COUNT(*)::int as count
      FROM documents
      GROUP BY source_type
      ORDER BY count DESC
    `;
    
    console.log('\n=== DOCUMENTS BY SOURCE TYPE ===');
    console.log(bySourceType);
    
    // Count document links by record type
    const byRecordType = await prisma.$queryRaw`
      SELECT linked_record_type, COUNT(*)::int as count
      FROM document_links
      GROUP BY linked_record_type
      ORDER BY count DESC
    `;
    
    console.log('\n=== DOCUMENT LINKS BY RECORD TYPE ===');
    console.log(byRecordType);
    
    // Total counts
    const totalDocs = await prisma.document.count();
    const totalLinks = await prisma.documentLink.count();
    
    console.log('\n=== TOTALS ===');
    console.log(`Total Documents: ${totalDocs}`);
    console.log(`Total Document Links: ${totalLinks}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await disconnect();
  }
}

verify();
