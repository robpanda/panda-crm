import { prisma, disconnect } from './prisma-client.js';

async function checkCommissions() {
  const total = await prisma.commission.count();
  const missingOpp = await prisma.commission.count({ where: { opportunityId: null } });
  const missingContract = await prisma.commission.count({ where: { serviceContractId: null } });
  const hasContractNoOpp = await prisma.commission.count({
    where: {
      serviceContractId: { not: null },
      opportunityId: null
    }
  });

  console.log('Commission Link Stats:');
  console.log('  Total: ' + total);
  console.log('  Missing opportunityId: ' + missingOpp);
  console.log('  Missing serviceContractId: ' + missingContract);
  console.log('  Has contract but no opp: ' + hasContractNoOpp);

  // Check a specific commission - "00035611" looks like Salesforce Name
  const specificComm = await prisma.commission.findFirst({
    where: { name: '00035611' },
    include: {
      opportunity: { select: { id: true, name: true } },
      owner: { select: { firstName: true, lastName: true } }
    }
  });

  if (specificComm) {
    console.log('\nCommission 00035611:');
    console.log('  ID: ' + specificComm.id);
    console.log('  SalesforceId: ' + specificComm.salesforceId);
    console.log('  OpportunityId: ' + (specificComm.opportunityId || 'NULL'));
    console.log('  ServiceContractId: ' + (specificComm.serviceContractId || 'NULL'));
    console.log('  Owner: ' + (specificComm.owner ? specificComm.owner.firstName + ' ' + specificComm.owner.lastName : 'None'));
    console.log('  Opportunity: ' + (specificComm.opportunity ? specificComm.opportunity.name : 'Not linked'));
  }

  await disconnect();
}

checkCommissions().catch(console.error);
