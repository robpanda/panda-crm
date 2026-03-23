import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAuditAction } from '../pandaSignService.js';

test('normalizeAuditAction maps PandaSign lifecycle events onto supported audit enum values', () => {
  assert.equal(normalizeAuditAction('CREATED'), 'CREATE');
  assert.equal(normalizeAuditAction('VIEWED'), 'VIEW');
  assert.equal(normalizeAuditAction('SENT'), 'UPDATE');
  assert.equal(normalizeAuditAction('SIGNED'), 'UPDATE');
  assert.equal(normalizeAuditAction('COMPLETED'), 'UPDATE');
  assert.equal(normalizeAuditAction('HOST_SIGNING_INITIATED'), 'UPDATE');
  assert.equal(normalizeAuditAction('HOST_SIGNED'), 'UPDATE');
});

test('normalizeAuditAction preserves already valid audit enum values', () => {
  assert.equal(normalizeAuditAction('CREATE'), 'CREATE');
  assert.equal(normalizeAuditAction('UPDATE'), 'UPDATE');
  assert.equal(normalizeAuditAction('VIEW'), 'VIEW');
});
