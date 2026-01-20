import { PrismaClient } from './node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function check() {
  try {
    const columns = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'activities'
      ORDER BY ordinal_position
    `;
    console.log('Activity table columns:');
    columns.forEach(c => console.log(' ', c.column_name, '-', c.data_type));
    
    // Sample data
    const sample = await prisma.$queryRaw`SELECT id, opportunity_id, type, subject FROM activities WHERE opportunity_id IS NOT NULL LIMIT 3`;
    console.log('\nSample with opportunity_id:', sample);
    
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
