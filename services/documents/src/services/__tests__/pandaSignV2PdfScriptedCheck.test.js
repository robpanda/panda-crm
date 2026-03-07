import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPageNumberLabel,
  validateHeaderFooterSafeArea,
} from '../pandaSignV2PdfService.js';

test('never returns invalid page number label 0 of 0', () => {
  assert.equal(buildPageNumberLabel(0, 0), 'Page 1');
  assert.equal(buildPageNumberLabel(2, null), 'Page 2');
});

test('flags header-content-in-footer regression', () => {
  const report = validateHeaderFooterSafeArea({
    headerHtml: '<div>Acme Contract Header</div>',
    footerHtml: '<div data-ps-region="header">Acme Contract Header</div>',
  });

  assert.equal(
    report.warnings.some((warning) => warning.code === 'HEADER_CONTENT_IN_FOOTER'),
    true
  );
});
