import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractInsuranceClaimFromSpecsData,
  mergeInsuranceClaimIntoSpecsData,
  mergeOrderContractIntoSpecsData,
} from '../orderContractSpecsData.js';

test('mergeOrderContractIntoSpecsData preserves unrelated specsData while deep-merging orderContract', () => {
  const existingSpecsData = JSON.stringify({
    selectedTrades: ['roofing', 'gutters'],
    complexity: 'high',
    legacyChecklist: {
      photosComplete: true,
    },
    orderContract: {
      overview: {
        projectName: 'Original Project',
        customerName: 'Jamie Customer',
      },
      pricing: {
        contractAmount: 12000,
        lineItems: [
          {
            id: 'existing-line',
            name: 'Roof Replacement',
            quantity: 1,
            total: 12000,
          },
        ],
      },
      signers: {
        agent: {
          name: 'Rob Winters',
        },
      },
    },
  });

  const { specsData, orderContract } = mergeOrderContractIntoSpecsData(existingSpecsData, {
    pricing: {
      depositAmount: 2500,
      lineItems: [
        {
          name: 'Updated Roof Replacement',
          description: 'Architectural shingles',
          quantity: 1,
          total: 12500,
        },
      ],
    },
    signers: {
      agent: {
        email: 'rob@pandaexteriors.com',
      },
    },
  });

  assert.deepEqual(specsData.selectedTrades, ['roofing', 'gutters']);
  assert.equal(specsData.complexity, 'high');
  assert.equal(specsData.legacyChecklist.photosComplete, true);

  assert.equal(orderContract.overview.projectName, 'Original Project');
  assert.equal(orderContract.overview.customerName, 'Jamie Customer');
  assert.equal(orderContract.pricing.contractAmount, 12000);
  assert.equal(orderContract.pricing.depositAmount, 2500);
  assert.equal(orderContract.pricing.lineItems.length, 1);
  assert.equal(orderContract.pricing.lineItems[0].name, 'Updated Roof Replacement');
  assert.equal(orderContract.signers.agent.name, 'Rob Winters');
  assert.equal(orderContract.signers.agent.email, 'rob@pandaexteriors.com');
});

test('mergeInsuranceClaimIntoSpecsData preserves unrelated specsData while storing manual adjuster fields', () => {
  const existingSpecsData = JSON.stringify({
    selectedTrades: ['roofing'],
    orderContract: {
      overview: {
        projectName: 'Original Project',
      },
    },
    insuranceClaim: {
      adjuster: {
        name: 'Original Adjuster',
        officePhone: '555-1000',
      },
      adjusterAssigned: true,
      adjusterMeetingComplete: false,
    },
  });

  const { specsData } = mergeInsuranceClaimIntoSpecsData(existingSpecsData, {
    adjusterName: 'Jamie Adjuster',
    adjusterOfficePhoneExt: '204',
    adjusterMobilePhone: '555-2222',
    adjusterEmail: 'jamie.adjuster@example.com',
    adjusterMeetingDate: '2026-04-03',
    adjusterMeetingComplete: true,
  });

  assert.deepEqual(specsData.selectedTrades, ['roofing']);
  assert.equal(specsData.orderContract.overview.projectName, 'Original Project');

  const insuranceClaim = extractInsuranceClaimFromSpecsData(specsData);
  assert.equal(insuranceClaim.adjusterName, 'Jamie Adjuster');
  assert.equal(insuranceClaim.adjusterOfficePhone, '555-1000');
  assert.equal(insuranceClaim.adjusterOfficePhoneExt, '204');
  assert.equal(insuranceClaim.adjusterMobilePhone, '555-2222');
  assert.equal(insuranceClaim.adjusterEmail, 'jamie.adjuster@example.com');
  assert.equal(insuranceClaim.adjusterAssigned, true);
  assert.equal(insuranceClaim.adjusterMeetingDate, '2026-04-03');
  assert.equal(insuranceClaim.adjusterMeetingComplete, true);
});
