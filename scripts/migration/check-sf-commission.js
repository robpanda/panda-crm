import { getSalesforceConnection, querySalesforce } from './salesforce-client.js';
import { prisma, disconnect } from './prisma-client.js';

async function check() {
  // The user mentioned "500" and "00035611" - search for these
  console.log('Searching for commission with name containing 00035611 or 500...');

  // Search various patterns
  const patterns = ['00035611', '500', 'Sales Commission'];

  for (const pattern of patterns) {
    const comms = await prisma.commission.findMany({
      where: {
        OR: [
          { name: { contains: pattern } },
          { id: { contains: pattern } }
        ]
      },
      take: 3,
      select: {
        id: true,
        name: true,
        salesforceId: true,
        opportunityId: true,
        serviceContractId: true,
        type: true,
        commissionValue: true,
        paidAmount: true,
        paidDate: true
      }
    });

    if (comms.length > 0) {
      console.log(`\nFound ${comms.length} commissions matching "${pattern}":`);
      comms.forEach(c => {
        console.log(`  ID: ${c.id}`);
        console.log(`  Name: ${c.name}`);
        console.log(`  Type: ${c.type}`);
        console.log(`  Value: $${c.commissionValue}`);
        console.log(`  Paid: $${c.paidAmount}`);
        console.log(`  PaidDate: ${c.paidDate}`);
        console.log(`  OpportunityId: ${c.opportunityId || 'NULL'}`);
        console.log(`  ServiceContractId: ${c.serviceContractId || 'NULL'}`);
        console.log(`  SalesforceId: ${c.salesforceId || 'NULL'}`);
        console.log('---');
      });
    }
  }

  // Get stats on commission with Sales Commission type
  const salesCommStats = await prisma.$queryRaw`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN opportunity_id IS NULL THEN 1 END) as missing_opp
    FROM commissions
    WHERE commission_type = 'BACK_END'
  `;
  console.log('\nBACK_END commission stats:');
  console.log('  Total:', Number(salesCommStats[0].total));
  console.log('  Missing opportunityId:', Number(salesCommStats[0].missing_opp));

  await disconnect();
}

check().catch(console.error);
