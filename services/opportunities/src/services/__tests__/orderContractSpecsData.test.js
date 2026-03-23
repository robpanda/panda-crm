import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeOrderContractIntoSpecsData } from '../orderContractSpecsData.js';

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
