// Shared Prisma Client Singleton
// All files in this service should import prisma from this module
// to prevent database connection pool exhaustion

import { PrismaClient } from '@prisma/client';

// Create singleton instance
const globalForPrisma = globalThis;

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
