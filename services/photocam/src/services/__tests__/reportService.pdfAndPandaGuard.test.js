import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../../prisma.js';
import { reportServiceTestables } from '../reportService.js';
import { s3Service } from '../s3Service.js';

test.after(async () => {
  await prisma.$disconnect();
});

test('resolvePandaPhotoConfig deduplicates checklist ids and keeps enforcement flags', () => {
  const result = reportServiceTestables.resolvePandaPhotoConfig({
    enforceChecklistCompletion: true,
    pandaPhoto: {
      enabled: true,
      checklistIds: ['cl-1', 'cl-1'],
      checklistId: 'cl-2',
      blockReportGeneration: false,
    },
  });

  assert.equal(result.enforced, true);
  assert.equal(result.blockReportGeneration, false);
  assert.deepEqual(result.checklistIds.sort(), ['cl-1', 'cl-2']);
});

test('buildReportPdfBuffer renders fallback text when image format is unsupported', async () => {
  const original = s3Service.getObjectBuffer;
  s3Service.getObjectBuffer = async () => Buffer.from('unsupported');

  try {
    const output = await reportServiceTestables.buildReportPdfBuffer(
      { name: 'Inspection Report' },
      [{ photo: { id: 'p1', fileName: 'unknown.bin', fileKey: 'photos/p1.bin' } }]
    );

    assert.ok(Buffer.isBuffer(output));
    assert.ok(output.length > 100);
  } finally {
    s3Service.getObjectBuffer = original;
  }
});

test('buildReportPdfBuffer handles storage read errors gracefully', async () => {
  const original = s3Service.getObjectBuffer;
  s3Service.getObjectBuffer = async () => {
    throw new Error('read failed');
  };

  try {
    const output = await reportServiceTestables.buildReportPdfBuffer(
      { name: 'Inspection Report' },
      [{ photo: { id: 'p2', fileName: 'missing.jpg', fileKey: 'photos/missing.jpg' } }]
    );

    assert.ok(Buffer.isBuffer(output));
    assert.ok(output.length > 100);
  } finally {
    s3Service.getObjectBuffer = original;
  }
});
