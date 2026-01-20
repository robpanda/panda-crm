#!/usr/bin/env node

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Define proper filter criteria for each list
const listFilters = {
  'Hot Leads': {
    targetObject: 'Lead',
    filterCriteria: {
      status: 'NEW',
      isConverted: false,
    },
  },
  'Confirmation': {
    targetObject: 'Opportunity',
    filterCriteria: {
      stage: 'SCHEDULED',
      NOT: { stage: { in: ['CLOSED_WON', 'CLOSED_LOST'] } },
    },
  },
  'Reset': {
    targetObject: 'Opportunity',
    filterCriteria: {
      stage: 'INSPECTED',
      NOT: { stage: { in: ['CLOSED_WON', 'CLOSED_LOST'] } },
    },
  },
  'Rehash': {
    targetObject: 'Opportunity',
    filterCriteria: {
      stage: 'INSPECTED',
      NOT: { stage: { in: ['CLOSED_WON', 'CLOSED_LOST'] } },
    },
  },
  'Lead Reset': {
    targetObject: 'Lead',
    filterCriteria: {
      status: { in: ['CONTACTED', 'NURTURING'] },
      isConverted: false,
    },
  },
  'Cold Leads': {
    targetObject: 'Lead',
    filterCriteria: {
      status: 'UNQUALIFIED',
      isConverted: false,
    },
  },
  'Cool Down': {
    targetObject: 'Lead',
    filterCriteria: {
      status: 'NURTURING',
      isConverted: false,
    },
  },
  'Rehash - Retail': {
    targetObject: 'Opportunity',
    filterCriteria: {
      stage: 'INSPECTED',
      type: 'RETAIL',
      NOT: { stage: { in: ['CLOSED_WON', 'CLOSED_LOST'] } },
    },
  },
};

async function fixFilters() {
  console.log('Fixing call list filter criteria...\n');

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
