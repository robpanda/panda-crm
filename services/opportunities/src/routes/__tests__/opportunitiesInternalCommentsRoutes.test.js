import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import router from '../opportunities.js';
import { opportunityService } from '../../services/opportunityService.js';

test('opportunity service exposes the internal comment handlers used by the router', () => {
  assert.equal(typeof opportunityService.getOpportunityInternalComments, 'function');
  assert.equal(typeof opportunityService.createOpportunityInternalComment, 'function');
  assert.equal(typeof opportunityService.updateOpportunityInternalComment, 'function');
  assert.equal(typeof opportunityService.deleteOpportunityInternalComment, 'function');
  assert.equal(typeof opportunityService.getOrderContract, 'function');
  assert.equal(typeof opportunityService.updateOrderContract, 'function');
});

const createTestServer = async () => {
  const app = express();
  app.use(express.json());
  app.use(router);
  app.use((error, req, res, next) => {
    res.status(error.status || 500).json({
      success: false,
      error: { message: error.message },
    });
  });

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
};

test('GET /comment-departments resolves successfully before /:id handlers', async (t) => {
  const originalGetOpportunityDetails = opportunityService.getOpportunityDetails;
  let getOpportunityDetailsCalled = false;

  opportunityService.getOpportunityDetails = async () => {
    getOpportunityDetailsCalled = true;
    throw new Error('GET /:id should not handle /comment-departments');
  };

  t.after(() => {
    opportunityService.getOpportunityDetails = originalGetOpportunityDetails;
  });

  const { baseUrl, close } = await createTestServer();
  t.after(close);

  const response = await fetch(`${baseUrl}/comment-departments`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(Array.isArray(payload.data), true);
  assert.deepEqual(payload.data.map((item) => item.value), [
    'general',
    'sales',
    'call-center',
    'production',
    'finance',
  ]);
  assert.equal(getOpportunityDetailsCalled, false);
});

test('GET /:id/internal-comments returns opportunity comment data', async (t) => {
  const originalGetOpportunityInternalComments = opportunityService.getOpportunityInternalComments;
  let requestedOpportunityId = null;

  opportunityService.getOpportunityInternalComments = async (opportunityId) => {
    requestedOpportunityId = opportunityId;
    return [{ id: 'comment-1', content: 'Internal note' }];
  };

  t.after(() => {
    opportunityService.getOpportunityInternalComments = originalGetOpportunityInternalComments;
  });

  const { baseUrl, close } = await createTestServer();
  t.after(close);

  const response = await fetch(`${baseUrl}/opp-123/internal-comments`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.deepEqual(payload.data, [{ id: 'comment-1', content: 'Internal note' }]);
  assert.equal(requestedOpportunityId, 'opp-123');
});

test('GET /:id/order-contract returns structured specs-backed order contract data', async (t) => {
  const originalGetOrderContract = opportunityService.getOrderContract;
  let requestedOpportunityId = null;

  opportunityService.getOrderContract = async (opportunityId) => {
    requestedOpportunityId = opportunityId;
    return {
      opportunityId,
      specsData: { selectedTrades: ['roofing'] },
      orderContract: { overview: { projectName: 'Test Project' } },
    };
  };

  t.after(() => {
    opportunityService.getOrderContract = originalGetOrderContract;
  });

  const { baseUrl, close } = await createTestServer();
  t.after(close);

  const response = await fetch(`${baseUrl}/opp-123/order-contract`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(requestedOpportunityId, 'opp-123');
  assert.equal(payload.data.orderContract.overview.projectName, 'Test Project');
});

test('PATCH /:id/order-contract forwards the additive patch body', async (t) => {
  const originalUpdateOrderContract = opportunityService.updateOrderContract;
  let requestedOpportunityId = null;
  let requestedPatch = null;
  let requestedUserId = null;

  opportunityService.updateOrderContract = async (opportunityId, orderContractPatch, userId) => {
    requestedOpportunityId = opportunityId;
    requestedPatch = orderContractPatch;
    requestedUserId = userId;
    return {
      opportunityId,
      orderContract: orderContractPatch,
    };
  };

  t.after(() => {
    opportunityService.updateOrderContract = originalUpdateOrderContract;
  });

  const { baseUrl, close } = await createTestServer();
  t.after(close);

  const response = await fetch(`${baseUrl}/opp-123/order-contract`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      orderContract: {
        overview: {
          projectName: 'Updated Project',
        },
      },
    }),
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.equal(requestedOpportunityId, 'opp-123');
  assert.deepEqual(requestedPatch, {
    overview: {
      projectName: 'Updated Project',
    },
  });
  assert.equal(requestedUserId, null);
});
