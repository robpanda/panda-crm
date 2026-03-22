import test from 'node:test';
import assert from 'node:assert/strict';

import { leadService } from '../leadService.js';

test('createLeadWrapper prefers current Prisma score fields', () => {
  const wrapper = leadService.createLeadWrapper({
    id: 'lead-1',
    firstName: 'Donna',
    lastName: 'Starling',
    status: 'NEW',
    source: null,
    phone: '555-1111',
    email: null,
    company: null,
    title: null,
    mobilePhone: null,
    createdAt: new Date('2026-03-14T00:00:00Z'),
    updatedAt: new Date('2026-03-14T00:00:00Z'),
    ownerId: null,
    owner: null,
    city: 'Southampton Township',
    state: 'NJ',
    street: null,
    postalCode: null,
    rating: null,
    industry: null,
    score: 82,
    leadScore: 82,
    leadRank: 'A',
    scoreFactors: [{ name: 'Referral Lead', impact: 20 }],
    scoredAt: new Date('2026-03-14T01:00:00Z'),
  });

  assert.equal(wrapper.leadScore, 82);
  assert.equal(wrapper.leadRank, 'A');
  assert.deepEqual(wrapper.scoreFactors, [{ name: 'Referral Lead', impact: 20 }]);
  assert.equal(wrapper.score, 82);
});

test('createLeadWrapper derives rank when only score exists', () => {
  const wrapper = leadService.createLeadWrapper({
    id: 'lead-2',
    firstName: 'Hina',
    lastName: 'Shaheen',
    status: 'NEW',
    source: null,
    phone: '555-2222',
    email: null,
    company: null,
    title: null,
    mobilePhone: null,
    createdAt: new Date('2026-03-14T00:00:00Z'),
    updatedAt: new Date('2026-03-14T00:00:00Z'),
    ownerId: null,
    owner: null,
    city: null,
    state: null,
    street: null,
    postalCode: null,
    rating: null,
    industry: null,
    score: 61,
  });

  assert.equal(wrapper.leadScore, 61);
  assert.equal(wrapper.leadRank, 'B');
});

test('leadToPinStatus treats canonical and legacy callback dispositions as go-back-later', () => {
  assert.equal(
    leadService.leadToPinStatus({ opportunityId: null, disposition: 'CALL_BACK', status: 'NURTURING' }),
    'GBL'
  );
  assert.equal(
    leadService.leadToPinStatus({ opportunityId: null, disposition: 'CALLBACK', status: 'NURTURING' }),
    'GBL'
  );
});
