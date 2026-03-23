import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSignatureCreateData } from '../pandaSignService.js';

test('buildSignatureCreateData uses persisted signature field names expected by Prisma', () => {
  const signedAt = new Date('2026-03-23T14:36:31.937Z');
  const data = buildSignatureCreateData({
    agreementId: 'agreement-1',
    signerName: 'test two',
    signerEmail: 'robwinters+customer@pandaexteriors.com',
    signerType: 'HOST',
    signatureType: 'ELECTRONIC',
    signatureUrl: 'https://example.com/signature.png',
    signedAt,
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
  });

  assert.equal(data.agreementId, 'agreement-1');
  assert.equal(data.signerName, 'test two');
  assert.equal(data.signerEmail, 'robwinters+customer@pandaexteriors.com');
  assert.equal(data.signer_type, 'HOST');
  assert.equal(data.signature_type, 'ELECTRONIC');
  assert.equal(data.signature_url, 'https://example.com/signature.png');
  assert.equal(data.signedAt, signedAt);
  assert.equal(data.ipAddress, '127.0.0.1');
  assert.equal(data.userAgent, 'test-agent');
  assert.equal('signatureType' in data, false);
  assert.equal('signatureUrl' in data, false);
  assert.equal('signerType' in data, false);
});
