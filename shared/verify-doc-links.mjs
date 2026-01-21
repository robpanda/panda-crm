import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyDocumentLinks() {
  console.log('='.repeat(60));
  console.log('Document Linkage Verification Report');
  console.log('='.repeat(60));
  
  // Total Adobe Sign documents
  const totalDocs = await prisma.document.count({
    where: { sourceType: 'ADOBE_SIGN' }
  });
  console.log(`\nTotal Adobe Sign Documents: ${totalDocs}`);
  
  // Documents with any DocumentLink
  const docsWithLinks = await prisma.document.count({
    where: {
      sourceType: 'ADOBE_SIGN',
      links: { some: {} }
    }
  });
  console.log(`Documents with DocumentLinks: ${docsWithLinks}`);
  
  // Documents linked to opportunities
  const docsLinkedToOpps = await prisma.document.count({
    where: {
      sourceType: 'ADOBE_SIGN',
      links: { some: { opportunityId: { not: null } } }
    }
  });
  console.log(`Documents linked to Opportunities: ${docsLinkedToOpps}`);
  
  // Documents linked to accounts only (no opportunity)
  const docsLinkedToAccountsOnly = await prisma.document.count({
    where: {
      sourceType: 'ADOBE_SIGN',
      links: {
        some: { accountId: { not: null } },
        none: { opportunityId: { not: null } }
      }
    }
  });
  console.log(`Documents linked to Accounts only: ${docsLinkedToAccountsOnly}`);
  
  // Orphaned documents (no links at all)
  const orphanedDocs = await prisma.document.count({
    where: {
      sourceType: 'ADOBE_SIGN',
      links: { none: {} }
    }
  });
  console.log(`Orphaned Documents (no links): ${orphanedDocs}`);
  
  // Check Agreement table for signed documents
  console.log('\n' + '='.repeat(60));
  console.log('Agreement Table Status');
  console.log('='.repeat(60));
  
  const totalAgreements = await prisma.agreement.count();
  console.log(`\nTotal Agreements: ${totalAgreements}`);
  
  const signedAgreements = await prisma.agreement.count({
    where: { status: 'SIGNED' }
  });
  console.log(`Signed Agreements: ${signedAgreements}`);
  
  const agreementsWithDocs = await prisma.agreement.count({
    where: { signedDocumentUrl: { not: null } }
  });
  console.log(`Agreements with signedDocumentUrl: ${agreementsWithDocs}`);
  
  const agreementsLinkedToOpps = await prisma.agreement.count({
    where: { opportunityId: { not: null } }
  });
  console.log(`Agreements linked to Opportunities: ${agreementsLinkedToOpps}`);
  
  // Sample of orphaned documents
  if (orphanedDocs > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('Sample Orphaned Documents (first 10)');
    console.log('='.repeat(60));
    
    const sampleOrphans = await prisma.document.findMany({
      where: {
        sourceType: 'ADOBE_SIGN',
        links: { none: {} }
      },
      take: 10,
      select: {
        id: true,
        title: true,
        salesforceId: true,
        metadata: true
      }
    });
    
    sampleOrphans.forEach((doc, i) => {
      console.log(`\n${i+1}. ${doc.title}`);
      console.log(`   ID: ${doc.id}`);
      console.log(`   Salesforce ID: ${doc.salesforceId}`);
      if (doc.metadata) {
        const meta = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata;
        if (meta.opportunitySfId) console.log(`   SF Opportunity ID: ${meta.opportunitySfId}`);
        if (meta.accountSfId) console.log(`   SF Account ID: ${meta.accountSfId}`);
      }
    });
  }
  
  await prisma.$disconnect();
}

verifyDocumentLinks().catch(console.error);
