import { prisma, disconnect } from './prisma-client.js';

async function addColumns() {
  try {
    // Add source_type column if it doesn't exist
    await prisma.$executeRawUnsafe(`
      ALTER TABLE documents 
      ADD COLUMN IF NOT EXISTS source_type VARCHAR(50)
    `);
    console.log('Added source_type column');
    
    // Add metadata column if it doesn't exist
    await prisma.$executeRawUnsafe(`
      ALTER TABLE documents 
      ADD COLUMN IF NOT EXISTS metadata TEXT
    `);
    console.log('Added metadata column');
    
    console.log('Schema update complete!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await disconnect();
  }
}

addColumns();
