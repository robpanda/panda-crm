import { PrismaClient } from '../../shared/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function check() {
  const [accounts, opps, contracts, invoices] = await Promise.all([
    prisma.account.count({ where: { salesforceId: { not: null } } }),
    prisma.opportunity.count({ where: { salesforceId: { not: null } } }),
    prisma.serviceContract.count({ where: { salesforceId: { not: null } } }),
    prisma.invoice.count(),
  ]);
  
  console.log('Records with Salesforce IDs:');
  console.log('  Accounts:', accounts);
  console.log('  Opportunities:', opps);
  console.log('  Service Contracts:', contracts);
  console.log('  Invoices (total):', invoices);
  
  // Also check total counts
  const [totalAccounts, totalOpps] = await Promise.all([
    prisma.account.count(),
    prisma.opportunity.count(),
  ]);
  console.log('\nTotal records:');
  console.log('  Accounts:', totalAccounts);
  console.log('  Opportunities:', totalOpps);
  
  await prisma.$disconnect();
}

check().catch(e => {
  console.error(e);
  process.exit(1);
});
