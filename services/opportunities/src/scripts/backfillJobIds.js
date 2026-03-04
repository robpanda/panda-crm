import { PrismaClient } from '@prisma/client';
import { opportunityService } from '../services/opportunityService.js';

const prisma = new PrismaClient();

async function main() {
  const missing = await prisma.opportunity.findMany({
    where: { jobId: null, deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  let assigned = 0;
  let skipped = 0;
  let failed = 0;

  for (const opp of missing) {
    try {
      const result = await opportunityService.assignJobId(opp.id);
      if (result.assigned) {
        assigned += 1;
      } else {
        skipped += 1;
      }
    } catch (err) {
      failed += 1;
      console.error(`Failed to assign job ID for ${opp.id}:`, err.message);
    }
  }

  console.log(`Backfill complete. assigned=${assigned} skipped=${skipped} failed=${failed}`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
