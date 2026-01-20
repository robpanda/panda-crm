// Job ID Service
// Generates sequential job IDs in format YYYY-NNNN (e.g., 2026-1000)
// Thread-safe using database transactions with row-level locking

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// Starting number for each year (first job ID will be YYYY-1000)
const STARTING_NUMBER = 999;

/**
 * Generate the next Job ID for the current year
 * Uses database transaction with FOR UPDATE lock to ensure thread safety
 *
 * @returns {Promise<string>} Job ID in format YYYY-NNNN
 */
export async function generateJobId() {
  const currentYear = new Date().getFullYear();

  // Use raw query with FOR UPDATE to ensure atomic increment
  // This prevents race conditions when multiple requests try to generate IDs simultaneously
  const result = await prisma.$transaction(async (tx) => {
    // Try to get and lock the sequence row for this year
    const sequences = await tx.$queryRaw`
      SELECT id, year, last_number
      FROM job_id_sequences
      WHERE year = ${currentYear}
      FOR UPDATE
    `;

    let nextNumber;

    if (sequences.length === 0) {
      // First job of the year - create the sequence
      await tx.jobIdSequence.create({
        data: {
          year: currentYear,
          lastNumber: STARTING_NUMBER + 1, // First job will be 1000
        },
      });
      nextNumber = STARTING_NUMBER + 1;
    } else {
      // Increment the sequence
      nextNumber = sequences[0].last_number + 1;
      await tx.jobIdSequence.update({
        where: { year: currentYear },
        data: { lastNumber: nextNumber },
      });
    }

    return nextNumber;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  return `${currentYear}-${result}`;
}

/**
 * Get the current job ID counter for a specific year (without incrementing)
 *
 * @param {number} year - Calendar year
 * @returns {Promise<number|null>} Current counter value or null if not found
 */
export async function getCurrentCounter(year) {
  const sequence = await prisma.jobIdSequence.findUnique({
    where: { year },
  });
  return sequence?.lastNumber || null;
}

/**
 * Get the next job ID that would be assigned (without actually assigning it)
 * Useful for previewing what the next ID will be
 *
 * @returns {Promise<string>} Next Job ID in format YYYY-NNNN
 */
export async function peekNextJobId() {
  const currentYear = new Date().getFullYear();

  const sequence = await prisma.jobIdSequence.findUnique({
    where: { year: currentYear },
  });

  const nextNumber = (sequence?.lastNumber || STARTING_NUMBER) + 1;
  return `${currentYear}-${nextNumber}`;
}

/**
 * Bulk generate Job IDs for multiple opportunities
 * More efficient than calling generateJobId() multiple times
 *
 * @param {number} count - Number of Job IDs to generate
 * @returns {Promise<string[]>} Array of Job IDs in format YYYY-NNNN
 */
export async function generateBulkJobIds(count) {
  if (count <= 0) return [];

  const currentYear = new Date().getFullYear();

  const result = await prisma.$transaction(async (tx) => {
    // Lock the sequence row
    const sequences = await tx.$queryRaw`
      SELECT id, year, last_number
      FROM job_id_sequences
      WHERE year = ${currentYear}
      FOR UPDATE
    `;

    let startNumber;

    if (sequences.length === 0) {
      // First jobs of the year
      startNumber = STARTING_NUMBER + 1;
      await tx.jobIdSequence.create({
        data: {
          year: currentYear,
          lastNumber: STARTING_NUMBER + count,
        },
      });
    } else {
      startNumber = sequences[0].last_number + 1;
      await tx.jobIdSequence.update({
        where: { year: currentYear },
        data: { lastNumber: sequences[0].last_number + count },
      });
    }

    return { startNumber, count };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });

  // Generate the array of job IDs
  const jobIds = [];
  for (let i = 0; i < result.count; i++) {
    jobIds.push(`${currentYear}-${result.startNumber + i}`);
  }

  return jobIds;
}

/**
 * Assign Job ID to an opportunity if it doesn't have one
 *
 * @param {string} opportunityId - The opportunity ID
 * @returns {Promise<{jobId: string, assigned: boolean}>} The Job ID and whether it was newly assigned
 */
export async function assignJobIdToOpportunity(opportunityId) {
  // First check if opportunity already has a Job ID
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    select: { id: true, jobId: true },
  });

  if (!opportunity) {
    throw new Error(`Opportunity not found: ${opportunityId}`);
  }

  if (opportunity.jobId) {
    // Already has a Job ID
    return { jobId: opportunity.jobId, assigned: false };
  }

  // Generate and assign a new Job ID
  const jobId = await generateJobId();

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { jobId },
  });

  return { jobId, assigned: true };
}

/**
 * Bulk assign Job IDs to opportunities that don't have one
 * Used for backfilling existing opportunities or Salesforce sync
 *
 * @param {string[]} opportunityIds - Array of opportunity IDs
 * @returns {Promise<{assigned: number, skipped: number, results: Array}>} Assignment results
 */
export async function bulkAssignJobIds(opportunityIds) {
  if (!opportunityIds || opportunityIds.length === 0) {
    return { assigned: 0, skipped: 0, results: [] };
  }

  // Get opportunities that don't have Job IDs
  const opportunities = await prisma.opportunity.findMany({
    where: {
      id: { in: opportunityIds },
      jobId: null,
    },
    select: { id: true },
  });

  const needsAssignment = opportunities.map(o => o.id);
  const skipped = opportunityIds.length - needsAssignment.length;

  if (needsAssignment.length === 0) {
    return { assigned: 0, skipped, results: [] };
  }

  // Generate Job IDs in bulk
  const jobIds = await generateBulkJobIds(needsAssignment.length);

  // Assign them to opportunities
  const results = [];
  for (let i = 0; i < needsAssignment.length; i++) {
    await prisma.opportunity.update({
      where: { id: needsAssignment[i] },
      data: { jobId: jobIds[i] },
    });
    results.push({ opportunityId: needsAssignment[i], jobId: jobIds[i] });
  }

  return { assigned: needsAssignment.length, skipped, results };
}

/**
 * Find opportunity by Job ID
 *
 * @param {string} jobId - Job ID in format YYYY-NNNN
 * @returns {Promise<Object|null>} Opportunity or null if not found
 */
export async function findByJobId(jobId) {
  return prisma.opportunity.findUnique({
    where: { jobId },
    include: {
      account: true,
      contact: true,
      owner: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  });
}

export const jobIdService = {
  generateJobId,
  getCurrentCounter,
  peekNextJobId,
  generateBulkJobIds,
  assignJobIdToOpportunity,
  bulkAssignJobIds,
  findByJobId,
};

export default jobIdService;
