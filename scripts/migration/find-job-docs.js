const { prisma } = require('./prisma-client');

async function main() {
  // Find the opportunity
  const opp = await prisma.opportunity.findFirst({
    where: {
      OR: [
        { name: { contains: '16532', mode: 'insensitive' } },
        { jobId: { contains: '16532', mode: 'insensitive' } }
      ]
    },
    include: {
      account: true
    }
  });
  
  if (!opp) {
    console.log('Opportunity not found');
    return;
  }
  
  console.log('\n=== OPPORTUNITY ===');
  console.log('ID:', opp.id);
  console.log('Name:', opp.name);
  console.log('Job ID:', opp.jobId);
  console.log('Salesforce ID:', opp.salesforceId);
  console.log('Account ID:', opp.accountId);
  console.log('Account Name:', opp.account?.name);
  console.log('Account SF ID:', opp.account?.salesforceId);
  
  // Check document links for this opportunity
  const oppLinks = await prisma.documentLink.findMany({
    where: { opportunityId: opp.id },
    include: { document: true }
  });
  console.log('\n=== DOCUMENT LINKS (via Opportunity ID) ===');
  console.log('Count:', oppLinks.length);
  
  // Check document links for the account
  const accountLinks = await prisma.documentLink.findMany({
    where: { accountId: opp.accountId },
    include: { document: true }
  });
  console.log('\n=== DOCUMENT LINKS (via Account ID) ===');
  console.log('Count:', accountLinks.length);
  
  // Check total documents in system
  const totalDocs = await prisma.document.count();
  console.log('\n=== TOTAL DOCUMENTS IN SYSTEM ===');
  console.log('Count:', totalDocs);
  
  // Check total document links
  const totalLinks = await prisma.documentLink.count();
  console.log('\n=== TOTAL DOCUMENT LINKS ===');
  console.log('Count:', totalLinks);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
