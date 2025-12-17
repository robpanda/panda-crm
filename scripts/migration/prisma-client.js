// Prisma Client for Migration Scripts
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

let prisma = null;

export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return prisma;
}

export async function batchUpsert(model, records, idField = 'salesforceId', batchSize = 100) {
  const prisma = getPrismaClient();
  const results = { created: 0, updated: 0, errors: [] };

  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);

    for (const record of batch) {
      try {
        await prisma[model].upsert({
          where: { [idField]: record[idField] },
          update: record,
          create: record,
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
  if (prisma) {
    await prisma.$disconnect();
  }
}

export default { getPrismaClient, batchUpsert, disconnect };
