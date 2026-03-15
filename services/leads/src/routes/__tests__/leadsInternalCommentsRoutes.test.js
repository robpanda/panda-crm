import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import router from '../leads.js';
import { leadService } from '../../services/leadService.js';

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
  const originalGetLeadById = leadService.getLeadById;
  let getLeadByIdCalled = false;

  leadService.getLeadById = async () => {
    getLeadByIdCalled = true;
    throw new Error('GET /:id should not handle /comment-departments');
  };

  t.after(() => {
    leadService.getLeadById = originalGetLeadById;
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
  assert.equal(getLeadByIdCalled, false);
});

test('GET /:id/internal-comments returns lead comment data', async (t) => {
  const originalGetLeadInternalComments = leadService.getLeadInternalComments;
  let requestedLeadId = null;

  leadService.getLeadInternalComments = async (leadId) => {
    requestedLeadId = leadId;
    return [{ id: 'comment-1', content: 'Internal note' }];
  };

  t.after(() => {
    leadService.getLeadInternalComments = originalGetLeadInternalComments;
  });

  const { baseUrl, close } = await createTestServer();
  t.after(close);

  const response = await fetch(`${baseUrl}/lead-123/internal-comments`);
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.success, true);
  assert.deepEqual(payload.data, [{ id: 'comment-1', content: 'Internal note' }]);
  assert.equal(requestedLeadId, 'lead-123');
});
