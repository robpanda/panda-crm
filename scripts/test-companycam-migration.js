/**
 * Test script for CompanyCam to S3 migration
 * Tests the full pipeline on a single project
 */

import { PrismaClient } from '@prisma/client';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const prisma = new PrismaClient();
const s3Client = new S3Client({ region: 'us-east-2' });
const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });

const S3_BUCKET = 'pandacam-photos-prod';
const COMPANYCAM_API_URL = 'https://api.companycam.com/v2';

// Test project - Timothy Drennan
const TEST_PROJECT_COMPANYCAM_ID = '97245468';

async function getCompanyCamToken() {
  const command = new GetSecretValueCommand({ SecretId: 'companycam/api-token' });
  const response = await secretsClient.send(command);
  const secret = JSON.parse(response.SecretString);
  return secret.token || secret.api_token || secret.apiToken;
}

async function downloadAndUploadToS3(imageUrl, projectId, photoId, token) {
  const { default: fetch } = await import('node-fetch');
  const { Upload } = await import('@aws-sdk/lib-storage');

  console.log(`  Downloading from CompanyCam: ${imageUrl}`);

  // Download from CompanyCam
  const response = await fetch(imageUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const s3Key = `projects/${projectId}/photos/${photoId}.${extension}`;

  console.log(`  Uploading to S3: ${s3Key}`);

  // Upload to S3
  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: response.body,
      ContentType: contentType,
    },
  });

  await upload.done();
  console.log(`  ✓ Uploaded successfully`);

  return { s3Key, contentType };
}

async function downloadAndUploadThumbnail(thumbnailUrl, projectId, photoId, token) {
  const { default: fetch } = await import('node-fetch');
  const { Upload } = await import('@aws-sdk/lib-storage');

  console.log(`  Downloading thumbnail from CompanyCam`);

  const response = await fetch(thumbnailUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    console.log(`  ⚠ Failed to download thumbnail: ${response.status}`);
    return null;
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const s3Key = `projects/${projectId}/thumbnails/${photoId}_thumb.${extension}`;

  console.log(`  Uploading thumbnail to S3: ${s3Key}`);

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: response.body,
      ContentType: contentType,
    },
  });

  await upload.done();
  console.log(`  ✓ Thumbnail uploaded successfully`);

  return s3Key;
}

async function verifyS3Object(s3Key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
    });
    const response = await s3Client.send(command);
    return {
      exists: true,
      size: response.ContentLength,
      contentType: response.ContentType,
    };
  } catch (error) {
    if (error.name === 'NotFound') {
      return { exists: false };
    }
    throw error;
  }
}

async function createPhotoRecord(photo, project, s3Key, s3ThumbnailKey) {
  // Find the PhotoProject record
  const photoProject = await prisma.photoProject.findFirst({
    where: { companyCamId: project.companyCamId }
  });

  if (!photoProject) {
    console.log(`  ⚠ No PhotoProject found for CompanyCam ID ${project.companyCamId}`);
    return null;
  }

  // Check if Photo record already exists
  const existingPhoto = await prisma.photo.findFirst({
    where: {
      externalId: photo.companyCamId,
      externalSource: 'COMPANYCAM'
    }
  });

  if (existingPhoto) {
    console.log(`  Photo record already exists: ${existingPhoto.id}`);
    return existingPhoto;
  }

  // Create the Photo record
  const s3Url = `https://${S3_BUCKET}.s3.us-east-2.amazonaws.com/${s3Key}`;
  const thumbnailUrl = s3ThumbnailKey
    ? `https://${S3_BUCKET}.s3.us-east-2.amazonaws.com/${s3ThumbnailKey}`
    : null;

  const newPhoto = await prisma.photo.create({
    data: {
      projectId: photoProject.id,
      url: s3Url,
      thumbnailUrl: thumbnailUrl,
      fileName: `${photo.companyCamId}.jpg`,
      fileSize: 0, // Unknown from CompanyCam
      mimeType: 'image/jpeg',
      type: 'PROGRESS',
      status: 'ACTIVE',
      capturedAt: photo.takenAt ? new Date(photo.takenAt) : new Date(),
      externalId: photo.companyCamId,
      externalSource: 'COMPANYCAM',
      metadata: {
        originalCompanyCamUrl: photo.photoUrl,
        migratedAt: new Date().toISOString(),
      }
    }
  });

  console.log(`  ✓ Created Photo record: ${newPhoto.id}`);
  return newPhoto;
}

async function runMigrationTest() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('CompanyCam to S3 Migration Test');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Test Project CompanyCam ID: ${TEST_PROJECT_COMPANYCAM_ID}`);
  console.log(`S3 Bucket: ${S3_BUCKET}`);
  console.log('');

  try {
    // Step 1: Get CompanyCam API token
    console.log('Step 1: Getting CompanyCam API token...');
    const token = await getCompanyCamToken();
    console.log(`  ✓ Token retrieved (${token.substring(0, 10)}...)`);
    console.log('');

    // Step 2: Find the project
    console.log('Step 2: Finding project in database...');
    const project = await prisma.companyCamProject.findFirst({
      where: { companyCamId: TEST_PROJECT_COMPANYCAM_ID }
    });

    if (!project) {
      throw new Error(`Project not found with CompanyCam ID: ${TEST_PROJECT_COMPANYCAM_ID}`);
    }
    console.log(`  ✓ Found project: ${project.name}`);
    console.log(`  Internal ID: ${project.id}`);
    console.log(`  Opportunity ID: ${project.opportunityId}`);
    console.log('');

    // Step 3: Get unmigrated photos
    console.log('Step 3: Getting unmigrated photos...');
    const photos = await prisma.companyCamPhoto.findMany({
      where: {
        projectId: project.id,
        migratedToS3: false
      },
      take: 3 // Limit to 3 for testing
    });

    console.log(`  Found ${photos.length} unmigrated photos (testing up to 3)`);
    console.log('');

    if (photos.length === 0) {
      console.log('  No unmigrated photos found. Test complete.');
      return;
    }

    // Step 4: Process each photo
    let successCount = 0;
    let errorCount = 0;

    for (const photo of photos) {
      console.log(`───────────────────────────────────────────────────────────`);
      console.log(`Processing photo: ${photo.companyCamId}`);
      console.log(`  Original URL: ${photo.photoUrl}`);

      try {
        // Download and upload main photo
        const { s3Key } = await downloadAndUploadToS3(
          photo.photoUrl,
          project.id,
          photo.companyCamId,
          token
        );

        // Download and upload thumbnail if available
        let s3ThumbnailKey = null;
        if (photo.thumbnailUrl) {
          s3ThumbnailKey = await downloadAndUploadThumbnail(
            photo.thumbnailUrl,
            project.id,
            photo.companyCamId,
            token
          );
        }

        // Verify the upload
        console.log('  Verifying S3 upload...');
        const verification = await verifyS3Object(s3Key);
        if (verification.exists) {
          console.log(`  ✓ Verified: ${verification.size} bytes, ${verification.contentType}`);
        } else {
          throw new Error('S3 object verification failed');
        }

        // Update companycam_photos record
        await prisma.companyCamPhoto.update({
          where: { id: photo.id },
          data: {
            s3Key: s3Key,
            s3ThumbnailKey: s3ThumbnailKey,
            originalCompanycamUrl: photo.photoUrl,
            migratedToS3: true,
            migratedAt: new Date()
          }
        });
        console.log('  ✓ Updated companycam_photos record');

        // Create Photo record for CRM display
        await createPhotoRecord(photo, project, s3Key, s3ThumbnailKey);

        successCount++;
        console.log(`  ✓ Photo migration complete!`);

      } catch (error) {
        console.log(`  ✗ Error: ${error.message}`);
        errorCount++;
      }
    }

    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Migration Test Results');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Total photos processed: ${photos.length}`);
    console.log(`  Successful: ${successCount}`);
    console.log(`  Errors: ${errorCount}`);

    // Verify final state
    console.log('');
    console.log('Verification:');
    const migratedPhotos = await prisma.companyCamPhoto.findMany({
      where: {
        projectId: project.id,
        migratedToS3: true
      }
    });
    console.log(`  CompanyCam photos migrated: ${migratedPhotos.length}`);

    const photoRecords = await prisma.photo.findMany({
      where: {
        externalSource: 'COMPANYCAM',
        externalId: { in: photos.map(p => p.companyCamId) }
      }
    });
    console.log(`  Photo records created: ${photoRecords.length}`);

    if (photoRecords.length > 0) {
      console.log('');
      console.log('Sample Photo Record:');
      console.log(`  ID: ${photoRecords[0].id}`);
      console.log(`  URL: ${photoRecords[0].url}`);
      console.log(`  External ID: ${photoRecords[0].externalId}`);
    }

  } catch (error) {
    console.error('Migration test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigrationTest();
