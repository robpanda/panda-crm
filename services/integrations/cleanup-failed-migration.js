/**
 * Cleanup script for failed CompanyCam migration
 * Resets database records and deletes corrupted S3 files
 */

import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { S3Client, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const prisma = new PrismaClient();
const s3Client = new S3Client({ region: 'us-east-2' });

const S3_BUCKET = 'pandacam-photos-prod';

// Test project - Timothy Drennan
const TEST_PROJECT_COMPANYCAM_ID = '97245468';

async function cleanupFailedMigration() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('CompanyCam Migration Cleanup');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Test Project CompanyCam ID: ${TEST_PROJECT_COMPANYCAM_ID}`);
  console.log('');

  try {
    // Step 1: Find the test project
    console.log('Step 1: Finding test project...');
    const project = await prisma.companyCamProject.findFirst({
      where: { companyCamId: TEST_PROJECT_COMPANYCAM_ID }
    });

    if (!project) {
      throw new Error(`Project not found with CompanyCam ID: ${TEST_PROJECT_COMPANYCAM_ID}`);
    }
    console.log(`  ✓ Found project: ${project.name}`);
    console.log(`  Internal ID: ${project.id}`);
    console.log('');

    // Step 2: Find migrated photos that need cleanup
    console.log('Step 2: Finding migrated photos to clean up...');
    const migratedPhotos = await prisma.companyCamPhoto.findMany({
      where: {
        projectId: project.id,
        migratedToS3: true
      }
    });

    console.log(`  Found ${migratedPhotos.length} migrated photos to clean up`);
    console.log('');

    if (migratedPhotos.length === 0) {
      console.log('  No migrated photos found. Nothing to clean up.');
      return;
    }

    // Step 3: Delete S3 objects
    console.log('Step 3: Deleting S3 objects...');
    let s3DeletedCount = 0;
    let s3ErrorCount = 0;

    for (const photo of migratedPhotos) {
      // Delete main photo
      if (photo.s3Key) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: photo.s3Key,
          }));
          s3DeletedCount++;
          console.log(`  ✓ Deleted: ${photo.s3Key}`);
        } catch (error) {
          if (error.name !== 'NoSuchKey') {
            console.log(`  ✗ Failed to delete ${photo.s3Key}: ${error.message}`);
            s3ErrorCount++;
          }
        }
      }

      // Delete thumbnail
      if (photo.s3ThumbnailKey) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: S3_BUCKET,
            Key: photo.s3ThumbnailKey,
          }));
          s3DeletedCount++;
          console.log(`  ✓ Deleted: ${photo.s3ThumbnailKey}`);
        } catch (error) {
          if (error.name !== 'NoSuchKey') {
            console.log(`  ✗ Failed to delete ${photo.s3ThumbnailKey}: ${error.message}`);
            s3ErrorCount++;
          }
        }
      }
    }
    console.log(`  S3 objects deleted: ${s3DeletedCount}, errors: ${s3ErrorCount}`);
    console.log('');

    // Step 4: Delete Photo records created during failed migration
    console.log('Step 4: Deleting Photo records from CRM...');
    const photoIds = migratedPhotos.map(p => p.companyCamId);

    const deletedPhotoRecords = await prisma.photo.deleteMany({
      where: {
        externalId: { in: photoIds },
        externalSource: 'COMPANYCAM'
      }
    });
    console.log(`  ✓ Deleted ${deletedPhotoRecords.count} Photo records`);
    console.log('');

    // Step 5: Reset companycam_photos records
    console.log('Step 5: Resetting companycam_photos records...');
    const resetResult = await prisma.companyCamPhoto.updateMany({
      where: {
        projectId: project.id,
        migratedToS3: true
      },
      data: {
        s3Key: null,
        s3ThumbnailKey: null,
        originalCompanyCamUrl: null,
        migratedToS3: false,
        migratedAt: null
      }
    });
    console.log(`  ✓ Reset ${resetResult.count} companycam_photos records`);
    console.log('');

    // Step 6: Verify cleanup
    console.log('Step 6: Verifying cleanup...');
    const remainingMigrated = await prisma.companyCamPhoto.count({
      where: {
        projectId: project.id,
        migratedToS3: true
      }
    });
    console.log(`  Remaining migrated photos: ${remainingMigrated}`);

    const unmigratedPhotos = await prisma.companyCamPhoto.count({
      where: {
        projectId: project.id,
        migratedToS3: false
      }
    });
    console.log(`  Unmigrated photos ready for migration: ${unmigratedPhotos}`);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Cleanup Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('You can now re-run the test migration script:');
    console.log('  node test-companycam-migration.js');

  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupFailedMigration();
