import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../../prisma.js';
import { listRecommendedTemplateSeeds } from '../templateService.js';

test.after(async () => {
  await prisma.$disconnect();
});

test('recommended template seed list includes checklist and report starters', () => {
  const seeds = listRecommendedTemplateSeeds();

  assert.ok(Array.isArray(seeds.checklists));
  assert.ok(Array.isArray(seeds.reports));
  assert.ok(seeds.checklists.includes('Insurance Inspection Checklist'));
  assert.ok(seeds.reports.includes('Completion Photos'));
});
