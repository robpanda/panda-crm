import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAgreementRenderedSignatureFields,
  getAgreementSignatureField,
} from '../pandaSignService.js';

test('rendered agreement signature fields override stale template coordinates', () => {
  const agreement = {
    mergeData: {
      _renderedSignatureFields: [
        { name: 'customer_signature', role: 'CUSTOMER', type: 'SIGNATURE', page: 3, x: 118, y: 102, width: 165, height: 32 },
        { name: 'host_signature', role: 'AGENT', type: 'SIGNATURE', page: 3, x: 118, y: 28, width: 165, height: 32 },
      ],
    },
    template: {
      signatureFields: {
        fields: [
          { name: 'customer_signature', role: 'CUSTOMER', type: 'SIGNATURE', page: 1, x: 100, y: 150, width: 200, height: 50 },
          { name: 'host_signature', role: 'AGENT', type: 'SIGNATURE', page: 1, x: 350, y: 150, width: 200, height: 50 },
        ],
      },
    },
  };

  const renderedFields = getAgreementRenderedSignatureFields(agreement);
  assert.equal(renderedFields.length, 2);
  assert.equal(renderedFields[0].page, 3);

  const customerField = getAgreementSignatureField(agreement, { role: 'CUSTOMER', type: 'SIGNATURE' });
  assert.equal(customerField.page, 3);
  assert.equal(customerField.x, 118);

  const agentField = getAgreementSignatureField(agreement, { role: 'AGENT', type: 'SIGNATURE', name: 'host_signature' });
  assert.equal(agentField.page, 3);
  assert.equal(agentField.x, 118);
});
