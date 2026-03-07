import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPreviewFieldMapReport } from '../pandaSignV2PreviewService.js';

test('builds additive preview checklist and preserves token report shape', () => {
  const html = `
    <div data-ps-id="customer-sig" data-ps-role="CUSTOMER" data-ps-field="signature"></div>
    <div data-ps-id="customer-init" data-ps-role="CUSTOMER" data-ps-field="initial"></div>
    <div data-ps-id="agent-sig" data-ps-role="AGENT" data-ps-field="signature"></div>
    <div data-ps-id="agent-init" data-ps-role="AGENT" data-ps-field="initial"></div>
  `;

  const report = buildPreviewFieldMapReport({
    htmlBody: html,
    tokenReport: {
      resolvedTokens: { '{{job.name}}': 'Job A' },
      missingTokens: ['{{job.phone}}'],
      requiredFieldFailures: [],
    },
  });

  assert.deepEqual(Object.keys(report.tokenReport).sort(), [
    'missingTokens',
    'requiredFieldFailures',
    'resolvedTokens',
    'warnings',
  ]);
  assert.equal(report.checklist.missingTokens.length, 1);
  assert.equal(report.checklist.signaturePlaceholdersByRole.CUSTOMER.length, 2);
  assert.equal(report.checklist.signaturePlaceholdersByRole.AGENT.length, 2);
});

test('shows CUSTOMER missing anchors when only AGENT placeholders are detected', () => {
  const html = `
    <div data-ps-id="agent-sig" data-ps-role="AGENT" data-ps-field="signature"></div>
    <div data-ps-id="agent-init" data-ps-role="AGENT" data-ps-field="initial"></div>
  `;

  const report = buildPreviewFieldMapReport({ htmlBody: html });
  const failures = report.fieldMapReport.missingRequiredAnchors;

  assert.equal(report.safeToProceed, false);
  assert.equal(failures.some((item) => item.role === 'CUSTOMER'), true);
  assert.equal(report.fieldMapReport.reportFlags.missingCustomerAnchors, true);
});
