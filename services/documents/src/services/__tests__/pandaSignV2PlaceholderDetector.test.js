import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectPlaceholdersFromHtml,
  validateRequiredSignatureAnchors,
  SIGNER_ROLES,
  SIGNATURE_FIELD_TYPES,
} from '../pandaSignV2PlaceholderDetector.js';

test('deduplicates placeholders by id + role + type only', () => {
  const html = `
    <div data-ps-id="sig-1" data-ps-role="CUSTOMER" data-ps-field="signature"></div>
    <div data-ps-id="sig-1" data-ps-role="CUSTOMER" data-ps-field="signature"></div>
    <div data-ps-id="sig-1" data-ps-role="AGENT" data-ps-field="signature"></div>
  `;

  const report = detectPlaceholdersFromHtml(html);
  const customer = report.placeholdersByRole.CUSTOMER;
  const agent = report.placeholdersByRole.AGENT;

  assert.equal(customer.length, 1, 'duplicate customer placeholder should be deduplicated');
  assert.equal(agent.length, 1, 'agent placeholder with same id must be preserved');
  assert.equal(report.duplicatePlaceholders.length, 1);
});

test('flags missing required CUSTOMER anchors when only AGENT fields are present', () => {
  const html = `
    <div data-ps-id="agent-sig" data-ps-role="AGENT" data-ps-field="signature"></div>
    <div data-ps-id="agent-init" data-ps-role="AGENT" data-ps-field="initial"></div>
  `;

  const detection = detectPlaceholdersFromHtml(html);
  const validation = validateRequiredSignatureAnchors(detection);
  const customerFailures = validation.requiredFieldFailures.filter(
    (item) => item.role === SIGNER_ROLES.CUSTOMER
  );

  assert.equal(validation.isValid, false);
  assert.equal(customerFailures.length, 2);
  assert.deepEqual(
    customerFailures.map((item) => item.type).sort(),
    [SIGNATURE_FIELD_TYPES.INITIAL, SIGNATURE_FIELD_TYPES.SIGNATURE]
  );
});

test('strict required-anchor mode throws only when explicitly enabled', () => {
  const html = `<div data-ps-id="agent-only" data-ps-role="AGENT" data-ps-field="signature"></div>`;
  const detection = detectPlaceholdersFromHtml(html);

  assert.throws(
    () => {
      validateRequiredSignatureAnchors(detection, { strictRequiredAnchors: true });
    },
    (error) => error?.code === 'MISSING_REQUIRED_SIGNATURE_ANCHORS'
  );

  const nonStrict = validateRequiredSignatureAnchors(detection, { strictRequiredAnchors: false });
  assert.equal(nonStrict.isValid, false);
});
