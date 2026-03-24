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

test('GAF webhook payload extraction handles form-encoded auth fields with JSON payload strings', () => {
  const extracted = measurementService.extractGAFWebhookPayload({
    client_id: 'abc',
    client_secret: 'def',
    SubscriberOrderNumber: 'report_123',
    GAFOrderNumber: '4572975',
    RoofMeasurement: JSON.stringify({
      Area: 703,
      Assets: {
        Report: 'FR_example.pdf',
        Acculynx: 'Xml_example.xml',
      },
    }),
  });

  assert.equal(extracted.SubscriberOrderNumber, 'report_123');
  assert.equal(extracted.GAFOrderNumber, '4572975');
  assert.deepEqual(extracted.RoofMeasurement, {
    Area: 703,
    Assets: {
      Report: 'FR_example.pdf',
      Acculynx: 'Xml_example.xml',
    },
  });
  assert.equal('client_id' in extracted, false);
  assert.equal('client_secret' in extracted, false);
});

test('GAF webhook normalization handles nested payload envelopes', () => {
  const normalized = measurementService.normalizeGAFWebhookPayload({
    payload: {
      SubscriberOrderNumber: 'report_456',
      GAFOrderNumber: '4664080',
      Status: 'Completed',
      RoofMeasurement: {
        Area: 812,
        Assets: {
          Report: 'FR_ready.pdf',
        },
      },
    },
  });

  assert.equal(normalized.subscriberOrderNumber, 'report_456');
  assert.equal(normalized.orderId, '4664080');
  assert.equal(normalized.status, 'COMPLETED');
  assert.equal(normalized.hasMeasurementData, true);
  assert.equal(normalized.reportAsset, 'FR_ready.pdf');
});
