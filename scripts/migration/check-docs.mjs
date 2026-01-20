import { getPrismaClient, disconnect } from './prisma-client.js';

async function checkDocuments() {
  const prisma = getPrismaClient();
  
  try {
    // Count total documents
    const totalDocs = await prisma.document.count();
    
    // Count documents with opportunity links
    const linkedDocs = await prisma.documentLink.count({
      where: { opportunityId: { not: null } }
    });
    
    // Count total document links
    const totalLinks = await prisma.documentLink.count();
    
    // Count unique opportunities with documents
    const oppsWithDocsRaw = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT opportunity_id) as count 
      FROM document_links 
      WHERE opportunity_id IS NOT NULL
    `;
    const oppsWithDocs = Number(oppsWithDocsRaw[0]?.count || 0);
    
    // Get sample documents with their links
    const sampleDocs = await prisma.document.findMany({
      take: 5,
      include: {
        links: {
          include: {
            opportunity: { select: { name: true, jobId: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log('=== DOCUMENT MIGRATION STATUS ===');
    console.log('Total Documents:', totalDocs);
    console.log('Total Document Links:', totalLinks);
    console.log('Links to Opportunities (Jobs):', linkedDocs);
    console.log('Unique Jobs with Documents:', oppsWithDocs);
    console.log('');
    
    if (sampleDocs.length > 0) {
      console.log('=== SAMPLE RECENT DOCUMENTS ===');
      sampleDocs.forEach(doc => {
        console.log('- Document:', doc.title || doc.name || doc.salesforceId);
        console.log('  Type:', doc.fileType || 'unknown');
        console.log('  Links:', doc.links.length);
        doc.links.forEach(link => {
          if (link.opportunity) {
            console.log('    -> Job:', link.opportunity.jobId || link.opportunity.name);
          }
        });
      });
    }
  } finally {
    await disconnect();
  }
}

checkDocuments().catch(e => { console.error('Error:', e.message); process.exit(1); });
