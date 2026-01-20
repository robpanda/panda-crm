import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkInvoices() {
  try {
    const count = await prisma.invoice.count();
    console.log('Total invoices in database:', count);
    
    // Check for invoices with opportunity links
    const withOpps = await prisma.invoice.count({
      where: { opportunityId: { not: null } }
    });
    console.log('Invoices with opportunity_id:', withOpps);
    
    // Get sample invoices
    const samples = await prisma.invoice.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        invoiceNumber: true,
        salesforceId: true,
        accountId: true,
        opportunityId: true,
        total: true,
        balanceDue: true,
        status: true,
      }
    });
    console.log('\nSample invoices:', JSON.stringify(samples, null, 2));
    
    // Check schema columns
    const schema = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'invoices' 
      ORDER BY ordinal_position;
    `;
    console.log('\nInvoice table columns:', schema.map(c => c.column_name).join(', '));
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkInvoices();
