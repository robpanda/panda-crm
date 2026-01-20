import { PrismaClient } from '@prisma/client';
import jsforce from 'jsforce';

const prisma = new PrismaClient();

async function migrate() {
  console.log('Starting migration...');
  const conn = new jsforce.Connection({ loginUrl: 'https://login.salesforce.com' });
  
  await conn.login(process.env.SF_USERNAME, process.env.SF_PASSWORD + process.env.SF_SECURITY_TOKEN);
  console.log('Connected to Salesforce');

  const products = await conn.query('SELECT Id, Name, ProductCode, Description, Family, IsActive FROM Product2 WHERE IsActive = true LIMIT 50');
  console.log('Found ' + products.totalSize + ' products');

  for (const p of products.records) {
    const existing = await prisma.product.findUnique({ where: { salesforceId: p.Id }});
    if (existing) {
      await prisma.product.update({ where: { id: existing.id }, data: { name: p.Name }});
      console.log('Updated: ' + p.Name);
    } else {
      await prisma.product.create({ data: { salesforceId: p.Id, name: p.Name, productCode: p.ProductCode, description: p.Description, family: p.Family, isActive: true }});
      console.log('Created: ' + p.Name);
    }
  }
  
  await prisma.$disconnect();
  console.log('Done!');
}

migrate().catch(console.error);
