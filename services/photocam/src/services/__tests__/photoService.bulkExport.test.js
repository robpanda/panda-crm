import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../../prisma.js';
import { photoServiceTestables } from '../photoService.js';
import { s3Service } from '../s3Service.js';

test.after(async () => {
  await prisma.$disconnect();
});

test('shouldQueueBulkExport uses configured inline threshold', () => {
  const threshold = photoServiceTestables.MAX_INLINE_BULK_EXPORT_ITEMS;
  assert.equal(photoServiceTestables.shouldQueueBulkExport(threshold), false);
  assert.equal(photoServiceTestables.shouldQueueBulkExport(threshold + 1), true);
});

test('buildBulkPdfBuffer stays resilient for unsupported image payloads', async () => {
  const original = s3Service.getObjectBuffer;
  s3Service.getObjectBuffer = async () => Buffer.from('not-a-supported-image');

  try {
    const output = await photoServiceTestables.buildBulkPdfBuffer(
      [{ id: 'p1', fileName: 'sample.bin', fileKey: 'photos/p1.bin' }],
      'Bulk Export Test'
    );

    assert.ok(Buffer.isBuffer(output));
    assert.ok(output.length > 100);
  } finally {
    s3Service.getObjectBuffer = original;
  }
});

test('buildBulkPdfBuffer handles object fetch failures without throwing', async () => {
  const original = s3Service.getObjectBuffer;
  s3Service.getObjectBuffer = async () => {
    throw new Error('S3 fetch failed');
  };

  try {
    const output = await photoServiceTestables.buildBulkPdfBuffer(
      [{ id: 'p2', fileName: 'missing.jpg', fileKey: 'photos/missing.jpg' }],
      'Bulk Export Failover Test'
    );

    assert.ok(Buffer.isBuffer(output));
    assert.ok(output.length > 100);
  } finally {
    s3Service.getObjectBuffer = original;
  }
});
