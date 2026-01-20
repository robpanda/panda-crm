/**
 * Seed Work Types for Panda CRM
 *
 * Creates standard work types for insurance and retail workflows
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const workTypes = [
  // Insurance workflow work types
  {
    name: 'Inspection',
    description: 'Initial property inspection',
    estimatedDuration: 60,
  },
  {
    name: 'Adjuster Meeting',
    description: 'Meeting with insurance adjuster',
    estimatedDuration: 90,
  },
  {
    name: 'ATR',
    description: 'Attempt to Repair - adjuster verification',
    estimatedDuration: 60,
  },
  {
    name: 'Contract Signing',
    description: 'Contract signing appointment with homeowner',
    estimatedDuration: 45,
  },
  {
    name: 'Spec',
    description: 'Specification review and measurement',
    estimatedDuration: 60,
  },
  {
    name: 'Supplement',
    description: 'Supplement inspection or review',
    estimatedDuration: 45,
  },

  // Installation work types
  {
    name: 'Installation',
    description: 'Main installation work',
    estimatedDuration: 480, // 8 hours
  },
  {
    name: 'Roofing',
    description: 'Roofing installation',
    estimatedDuration: 480,
  },
  {
    name: 'Siding',
    description: 'Siding installation',
    estimatedDuration: 480,
  },
  {
    name: 'Gutters',
    description: 'Gutter installation',
    estimatedDuration: 240,
  },
  {
    name: 'Solar',
    description: 'Solar panel installation',
    estimatedDuration: 480,
  },
  {
    name: 'Interior',
    description: 'Interior work',
    estimatedDuration: 240,
  },

  // Service work types
  {
    name: 'Repair',
    description: 'Repair work',
    estimatedDuration: 120,
  },
  {
    name: 'Walkthrough',
    description: 'Final walkthrough with customer',
    estimatedDuration: 30,
  },
  {
    name: 'Estimate',
    description: 'Estimate appointment',
    estimatedDuration: 60,
  },
];

async function seedWorkTypes() {
  console.log('Seeding work types...');

  let created = 0;
  let updated = 0;

  for (const workType of workTypes) {
    try {
      const existing = await prisma.workType.findFirst({
        where: { name: workType.name },
      });

      if (existing) {
        await prisma.workType.update({
          where: { id: existing.id },
          data: workType,
        });
        updated++;
        console.log(`  Updated: ${workType.name}`);
      } else {
        await prisma.workType.create({
          data: workType,
        });
        created++;
        console.log(`  Created: ${workType.name}`);
      }
    } catch (error) {
      console.error(`  Error with ${workType.name}:`, error.message);
    }
  }

  console.log(`\nSeed complete: ${created} created, ${updated} updated`);
}

seedWorkTypes()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
