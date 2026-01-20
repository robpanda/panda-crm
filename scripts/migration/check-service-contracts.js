import { prisma, disconnect } from './prisma-client.js';

async function check() {
  // Check if service_contracts table has opportunityId
  const total = await prisma.serviceContract.count();
  const withoutOpp = await prisma.serviceContract.count({ where: { opportunityId: null } });

  console.log('ServiceContract stats:');
  console.log('  Total:', total);
  console.log('  With opportunityId:', total - withoutOpp);
  console.log('  Without opportunityId:', withoutOpp);

  // Sample a commission with contract
  const sampleComm = await prisma.commission.findFirst({
    where: {
      serviceContractId: { not: null }
    },
    include: {
      serviceContract: true
    }
  });

  if (sampleComm) {
    console.log('\nSample commission with contract:');
    console.log('  Commission ID:', sampleComm.id);
    console.log('  ServiceContract ID:', sampleComm.serviceContractId);
    console.log('  ServiceContract has oppId:', sampleComm.serviceContract?.opportunityId ? 'YES' : 'NO');
    if (sampleComm.serviceContract) {
      console.log('  ServiceContract oppId:', sampleComm.serviceContract.opportunityId);
    }
  }

  await disconnect();
}

check().catch(console.error);
