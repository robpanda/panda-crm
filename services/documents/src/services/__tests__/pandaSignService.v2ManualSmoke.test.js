import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import agreementRoutes from '../../routes/agreements.js';
import { pandaSignService } from '../pandaSignService.js';

async function withAgreementRouteStubs(stubs, run) {
  const originalMethods = {};
  for (const [name, impl] of Object.entries(stubs)) {
    originalMethods[name] = pandaSignService[name];
    pandaSignService[name] = impl;
  }

  const app = express();
  app.use(express.json());
  app.use('/api/documents/agreements', agreementRoutes);

  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}/api/documents/agreements`;

  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    for (const [name, impl] of Object.entries(originalMethods)) {
      pandaSignService[name] = impl;
    }
  }
}

function assertExistingSignFetchFields(data) {
  assert.ok(data && typeof data === 'object');
  assert.ok(typeof data.id === 'string' && data.id.length > 0);
  assert.ok(typeof data.name === 'string');
  assert.ok(typeof data.status === 'string');
  assert.ok(typeof data.recipientName === 'string');
  assert.ok(typeof data.documentUrl === 'string');
  assert.ok(Object.hasOwn(data, 'signatureFields'));
  assert.ok(Object.hasOwn(data, 'expiresAt'));
}

test('manual smoke: GET /sign/:token keeps existing fields and additive preview fields', async () => {
  const customerOnlySignatureFields = [
    { id: 'cust-sig-1', role: 'CUSTOMER', type: 'SIGNATURE', x: 100, y: 150, width: 200, height: 50, page: 1 },
    { id: 'cust-init-1', role: 'CUSTOMER', type: 'INITIAL', x: 320, y: 150, width: 80, height: 50, page: 1 },
  ];

  const previewReport = {
    fieldMapReport: {
      signaturePlaceholdersByRole: {
        CUSTOMER: [{ id: 'cust-sig-1', role: 'CUSTOMER', type: 'SIGNATURE' }],
        AGENT: [{ id: 'agent-sig-1', role: 'AGENT', type: 'SIGNATURE' }],
      },
      warnings: [{ code: 'SAFE_AREA_TOP_TOO_SMALL', message: 'Top margin is small' }],
    },
    checklist: {
      missingTokens: [],
      signaturePlaceholdersByRole: {
        CUSTOMER: [{ id: 'cust-sig-1', role: 'CUSTOMER', type: 'SIGNATURE' }],
        AGENT: [{ id: 'agent-sig-1', role: 'AGENT', type: 'SIGNATURE' }],
      },
      missingRequiredAnchors: [],
    },
    warnings: [{ code: 'NON_BLOCKING_WARNING', message: 'Advisory only' }],
  };

  await withAgreementRouteStubs({
    async getAgreementByToken() {
      return {
        id: 'agr_manual_smoke_1',
        name: 'Manual Smoke Agreement',
        status: 'SENT',
        recipientName: 'Customer One',
        recipientEmail: 'customer.one@example.com',
        documentUrl: 'https://example.com/agreement.pdf',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        template: { signatureFields: customerOnlySignatureFields },
        previewReport,
      };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/sign/test-sign-token`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assertExistingSignFetchFields(payload.data);

    // Explicit no-role-leakage assertion for customer token fixtures.
    const returnedSignatureFields = Array.isArray(payload.data.signatureFields) ? payload.data.signatureFields : [];
    assert.equal(returnedSignatureFields.length > 0, true);
    assert.equal(returnedSignatureFields.every((field) => String(field?.role || '').toUpperCase() !== 'AGENT'), true);

    // Additive preview/report fields: present and non-breaking.
    assert.ok(Object.hasOwn(payload.data, 'fieldMapReport'));
    assert.ok(Object.hasOwn(payload.data, 'checklist'));
    assert.ok(Object.hasOwn(payload.data, 'previewWarnings'));
    assert.equal(Array.isArray(payload.data.previewWarnings), true);

    // If page labels are present anywhere in preview/checklist data, they must never contain 0 of 0.
    const previewText = JSON.stringify({
      fieldMapReport: payload.data.fieldMapReport,
      checklist: payload.data.checklist,
      previewWarnings: payload.data.previewWarnings,
    });
    assert.equal(previewText.includes('0 of 0'), false);
  });
});

test('manual smoke: GET /sign/:token still succeeds when additive preview fields are unavailable', async () => {
  await withAgreementRouteStubs({
    async getAgreementByToken() {
      return {
        id: 'agr_manual_smoke_2',
        name: 'Legacy Agreement',
        status: 'VIEWED',
        recipientName: 'Customer Two',
        recipientEmail: 'customer.two@example.com',
        documentUrl: 'https://example.com/legacy-agreement.pdf',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        template: { signatureFields: [{ id: 'sig-only', role: 'CUSTOMER', type: 'SIGNATURE' }] },
      };
    },
  }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/sign/test-sign-token-legacy`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assertExistingSignFetchFields(payload.data);

    // Additive fields should not be required for successful old behavior.
    assert.equal(payload.data.fieldMapReport, undefined);
    assert.equal(payload.data.checklist, undefined);
    assert.equal(Array.isArray(payload.data.previewWarnings), true);
    assert.equal(payload.data.previewWarnings.length, 0);
  });
});

test('manual smoke: POST /sign/:token keeps existing response fields and additive placement report', async () => {
  let capturedSignatureRect = null;

  await withAgreementRouteStubs({
    async applySignature({ signatureRect }) {
      capturedSignatureRect = signatureRect;
      return {
        agreement: {
          id: 'agr_manual_smoke_3',
          status: 'SIGNED',
          signedAt: new Date().toISOString(),
          signedDocumentUrl: 'https://example.com/signed-agreement.pdf',
        },
        placementReport: {
          snapped: true,
          driftExceeded: true,
          warnings: [{ code: 'SIGNATURE_SNAP_DRIFT_EXCEEDED', pageLabel: 'Page 1 of 1' }],
        },
      };
    },
  }, async (baseUrl) => {
    const signatureRect = { x: 444, y: 301, width: 240, height: 66, page: 2 };
    const response = await fetch(`${baseUrl}/sign/test-sign-token-post`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+v3EAAAAASUVORK5CYII=',
        signerName: 'Customer Three',
        signerEmail: 'customer.three@example.com',
        signatureRect,
      }),
    });

    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.success, true);
    assert.equal(payload.data.agreementId, 'agr_manual_smoke_3');
    assert.equal(typeof payload.data.status, 'string');
    assert.ok(Object.hasOwn(payload.data, 'signedAt'));
    assert.ok(Object.hasOwn(payload.data, 'signedDocumentUrl'));
    assert.ok(Object.hasOwn(payload.data, 'placementReport'));
    assert.deepEqual(capturedSignatureRect, signatureRect);

    // If page labels are present in placement/report text, they must not contain 0 of 0.
    const reportText = JSON.stringify(payload.data.placementReport || {});
    assert.equal(reportText.includes('0 of 0'), false);
  });
});
