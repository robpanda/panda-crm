import test from 'node:test';
import assert from 'node:assert/strict';
import { SIGNED_DOCUMENT_URL_EXPIRES_IN_SECONDS } from '../pandaSignService.js';

test('signed document URLs stay within the S3 presign maximum window', () => {
  assert.equal(SIGNED_DOCUMENT_URL_EXPIRES_IN_SECONDS, 60 * 60 * 24 * 7);
  assert.ok(SIGNED_DOCUMENT_URL_EXPIRES_IN_SECONDS <= 604800);
});
