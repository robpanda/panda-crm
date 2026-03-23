import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderContractRuntimeData } from '../pandaSignService.js';

test('buildOrderContractRuntimeData resolves structured contract merge data from opportunity specsData.orderContract', () => {
  const resolved = buildOrderContractRuntimeData({
    opportunity: {
      id: 'opp-1',
      name: '2026-2753 Richard Jordan',
      jobId: '2026-2753',
      state: 'MD',
      amount: 12500,
      contractTotal: 13500,
      specsData: JSON.stringify({
        unrelatedKey: true,
        orderContract: {
          overview: {
            projectName: 'Jordan Roof Replacement',
            contractDate: '2026-03-23',
            customerName: 'Richard Jordan',
          },
          pricing: {
            scopeOfWork: 'Roof replacement and gutters',
            lineItems: [
              {
                name: 'Roof Replacement',
                description: 'Architectural shingles',
                quantity: 1,
                unitPrice: 13500,
                total: 13500,
              },
            ],
          },
          signers: {
            customer: {
              name: 'Richard Jordan',
              email: 'richard@example.com',
            },
          },
        },
      }),
      owner: {
        fullName: 'Rob Winters',
        email: 'rob@pandaexteriors.com',
        title: 'Sales Representative',
      },
    },
    account: {
      name: 'Richard Jordan Household',
      email: 'household@example.com',
      phone: '4105550199',
    },
    contact: {
      fullName: 'Richard Jordan',
      firstName: 'Richard',
      lastName: 'Jordan',
      email: 'richard@example.com',
      mobilePhone: '4105550101',
    },
    mergeData: {
      orderContract: {
        overview: {
          effectiveDate: '2026-03-24',
        },
        pricing: {
          depositAmount: 3500,
        },
        signers: {
          agent: {
            phone: '4435550109',
          },
        },
      },
    },
    territory: 'MD',
    customerName: 'Richard Jordan',
    customerEmail: 'richard@example.com',
    customerPhone: '4105550101',
    projectAddress: '123 Main St, Baltimore, MD 21201',
  });

  assert.equal(resolved.orderContract.overview.projectName, 'Jordan Roof Replacement');
  assert.equal(resolved.orderContract.overview.jobNumber, '2026-2753');
  assert.equal(resolved.orderContract.overview.projectAddress, '123 Main St, Baltimore, MD 21201');
  assert.equal(resolved.orderContract.overview.contractDate, '2026-03-23');
  assert.equal(resolved.orderContract.overview.effectiveDate, '2026-03-24');

  assert.equal(resolved.orderContract.pricing.contractAmount, 13500);
  assert.equal(resolved.orderContract.pricing.depositAmount, 3500);
  assert.equal(resolved.orderContract.pricing.scopeOfWork, 'Roof replacement and gutters');
  assert.equal(resolved.orderContract.pricing.lineItems.length, 1);
  assert.match(resolved.orderContract.pricing.lineItemsText, /Roof Replacement/);
  assert.match(resolved.orderContract.pricing.lineItemsHtml, /<ul>/);

  assert.equal(resolved.orderContract.signers.customer.name, 'Richard Jordan');
  assert.equal(resolved.orderContract.signers.customer.email, 'richard@example.com');
  assert.equal(resolved.orderContract.signers.agent.name, 'Rob Winters');
  assert.equal(resolved.orderContract.signers.agent.email, 'rob@pandaexteriors.com');
  assert.equal(resolved.orderContract.signers.agent.phone, '4435550109');
});
