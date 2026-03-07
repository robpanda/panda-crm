import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SIGNATURE_SNAP_DRIFT_TOLERANCE_PX,
  resolveSignaturePlacement,
} from '../pandaSignV2PdfBurnInService.js';

test('keeps drift check permissive within tolerance', () => {
  const result = resolveSignaturePlacement({
    expectedRect: { page: 1, x: 120, y: 240, w: 200, h: 60 },
    submittedRect: { page: 1, x: 132, y: 250, w: 198, h: 62 },
  });

  assert.equal(result.driftExceeded, false);
  assert.equal(result.warnings.length, 0);
  assert.equal(result.placement.x, 120);
  assert.equal(result.placement.y, 240);
});

test('snaps to expected coordinates when drift exceeds tolerance', () => {
  const result = resolveSignaturePlacement({
    expectedRect: { page: 2, x: 50, y: 80, w: 180, h: 44 },
    submittedRect: { page: 2, x: 50 + SIGNATURE_SNAP_DRIFT_TOLERANCE_PX + 10, y: 80, w: 180, h: 44 },
  });

  assert.equal(result.snapped, true);
  assert.equal(result.driftExceeded, true);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, 'SIGNATURE_SNAP_DRIFT_EXCEEDED');
  assert.equal(result.placement.x, 50);
  assert.equal(result.placement.y, 80);
});
