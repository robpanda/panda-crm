import test from 'node:test';
import assert from 'node:assert/strict';

import { measurementService } from '../measurementService.js';

test('GAF delivery is not ready when completed payload has no measurements or deliverables', () => {
  const normalized = {
    status: 'COMPLETED',
    reportPdfUrl: null,
    reportUrl: null,
    reportAsset: null,
    homeownerReportAsset: null,
    xmlAsset: null,
    report3dUrl: null,
    modelUrl: null,
  };

  const ready = measurementService.isGAFDeliveryReady({
    normalized,
    measurements: {},
    reportPdfUrl: null,
    reportXmlUrl: null,
    reportJsonUrl: null,
  });

  assert.equal(ready, false);
});

test('GAF delivery is ready when completed payload has usable measurements', () => {
  const normalized = {
    status: 'COMPLETED',
    reportPdfUrl: null,
    reportUrl: null,
    reportAsset: null,
    homeownerReportAsset: null,
    xmlAsset: null,
    report3dUrl: null,
    modelUrl: null,
  };

  const ready = measurementService.isGAFDeliveryReady({
    normalized,
    measurements: {
      totalRoofArea: 444,
      totalRoofSquares: 4.44,
    },
    reportPdfUrl: null,
    reportXmlUrl: null,
    reportJsonUrl: null,
  });

  assert.equal(ready, true);
});

test('GAF delivery is ready when completed payload has a downloadable report asset', () => {
  const normalized = {
    status: 'COMPLETED',
    reportPdfUrl: null,
    reportUrl: null,
    reportAsset: 'FR_example.pdf',
    homeownerReportAsset: null,
    xmlAsset: null,
    report3dUrl: null,
    modelUrl: null,
  };

  const ready = measurementService.isGAFDeliveryReady({
    normalized,
    measurements: {},
    reportPdfUrl: null,
    reportXmlUrl: null,
    reportJsonUrl: null,
  });

  assert.equal(ready, true);
});
