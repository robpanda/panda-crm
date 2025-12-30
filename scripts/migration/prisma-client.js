// Prisma Client for Migration Scripts
// Import from shared location where Prisma client is generated
import { PrismaClient } from '../../shared/node_modules/@prisma/client/index.js';
import dotenv from 'dotenv';

dotenv.config();

let _prisma = null;

export function getPrismaClient() {
  if (!_prisma) {
    _prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return _prisma;
}

// Export prisma singleton for convenience
export const prisma = getPrismaClient();

// Helper to remove undefined values from an object
function cleanObject(obj) {
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export async function batchUpsert(model, records, idField = 'salesforceId', batchSize = 100) {
  const client = getPrismaClient();
  const results = { created: 0, updated: 0, errors: [] };

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    for (const record of batch) {
      try {
        // Clean the record to remove undefined values
        const cleanedRecord = cleanObject(record);

        // For updates, exclude createdAt to preserve original creation date
        const { createdAt, ...updateData } = cleanedRecord;

        await client[model].upsert({
          where: { [idField]: cleanedRecord[idField] },
          update: updateData, // Don't overwrite createdAt on updates
          create: cleanedRecord, // Include createdAt only for new records
        });
        // Can't easily tell if created or updated in upsert
        results.created++;
      } catch (error) {
        results.errors.push({ record, error: error.message });
      }
    }

    console.log(`Processed ${Math.min(i + batchSize, records.length)}/${records.length} records`);
  }

  return results;
}

export async function disconnect() {
  if (_prisma) {
    await _prisma.$disconnect();
  }
}

export default { getPrismaClient, batchUpsert, disconnect };
