import test from 'node:test';
import assert from 'node:assert/strict';

import { findOpportunityByIdOrJobId } from './repositoryOpportunityLookup.js';

test('findOpportunityByIdOrJobId keeps Prisma select args flat', async () => {
  const calls = [];
  const mockPrisma = {
    opportunity: {
      findUnique: async (args) => {
        calls.push(['findUnique', args]);
        return null;
      },
      findFirst: async (args) => {
        calls.push(['findFirst', args]);
        return { id: 'opp_1' };
      },
    },
  };

  await findOpportunityByIdOrJobId(
    mockPrisma,
    'cmjob123',
    { select: { id: true, name: true, accountId: true } },
  );

  assert.deepEqual(calls, [
    ['findUnique', {
      where: { id: 'cmjob123' },
      select: { id: true, name: true, accountId: true },
    }],
    ['findFirst', {
      where: { jobId: 'cmjob123' },
      select: { id: true, name: true, accountId: true },
    }],
  ]);
});

test('findOpportunityByIdOrJobId supports raw select shorthand', async () => {
  const calls = [];
  const mockPrisma = {
    opportunity: {
      findUnique: async (args) => {
        calls.push(['findUnique', args]);
        return { id: 'opp_2', name: 'Opportunity 2' };
      },
      findFirst: async () => {
        throw new Error('findFirst should not be called when the id lookup succeeds');
      },
    },
  };

  const opportunity = await findOpportunityByIdOrJobId(
    mockPrisma,
    'opp_2',
    { id: true, name: true },
  );

  assert.deepEqual(calls, [[
    'findUnique',
    {
      where: { id: 'opp_2' },
      select: { id: true, name: true },
    },
  ]]);
  assert.deepEqual(opportunity, { id: 'opp_2', name: 'Opportunity 2' });
});
