#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Update filters to match actual database stage values
const listFilters = {
  'Confirmation': {
    targetObject: 'Opportunity',
    // LEAD_ASSIGNED = leads that need confirmation calls
    filterCriteria: {
      stage: 'LEAD_ASSIGNED',
      NOT: { stage: { in: ['CLOSED_WON', 'CLOSED_LOST'] } },
    },
  },
  'Reset': {
    targetObject: 'Opportunity',
    // APPROVED = opportunities that need follow-up/reset calls
    filterCriteria: {
      stage: 'APPROVED',
      NOT: { stage: { in: ['CLOSED_WON', 'CLOSED_LOST'] } },
    },
  },
  'Rehash': {
    targetObject: 'Opportunity',
    // LEAD_ASSIGNED that haven't progressed
    filterCriteria: {
      stage: 'LEAD_ASSIGNED',
      NOT: { stage: { in: ['CLOSED_WON', 'CLOSED_LOST'] } },
    },
  },
  'Rehash - Retail': {
    targetObject: 'Opportunity',
    filterCriteria: {
      stage: 'LEAD_ASSIGNED',
      type: 'RETAIL',
      NOT: { stage: { in: ['CLOSED_WON', 'CLOSED_LOST'] } },
    },
  },
};

async function fixFilters() {
  console.log('Updating opportunity list filters to match actual stages...\n');

  for (const [name, config] of Object.entries(listFilters)) {
    const list = await prisma.callList.findFirst({
      where: { name },
    });

    if (!list) {
      console.log(`List "${name}" not found, skipping`);
      continue;
    }

    await prisma.callList.update({
      where: { id: list.id },
      data: {
        targetObject: config.targetObject,
        filterCriteria: config.filterCriteria,
      },
    });

    console.log(`Updated "${name}" with filter: ${JSON.stringify(config.filterCriteria)}`);
  }

  console.log('\nDone!');
  await prisma.$disconnect();
}

fixFilters();
