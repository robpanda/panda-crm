/**
 * Full CompanyCam to S3 Migration Script
 * Migrates all photos from CompanyCam to AWS S3
 *
 * Based on successful test-companycam-migration.js with all bug fixes applied
 */

import pkg from '@prisma/client';
const { PrismaClient } = pkg;
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const prisma = new PrismaClient();
const s3Client = new S3Client({ region: 'us-east-2' });
const secretsClient = new SecretsManagerClient({ region: 'us-east-2' });

const S3_BUCKET = 'pandacam-photos-prod';
const COMPANYCAM_API_URL = 'https://api.companycam.com/v2';

// Configuration
const BATCH_SIZE = 50;  // Photos per batch
const DELAY_BETWEEN_PHOTOS = 500;  // ms between each photo (rate limiting)
const DELAY_BETWEEN_BATCHES = 2000;  // ms between batches

// Stats tracking
const stats = {
  totalProjects: 0,
  processedProjects: 0,
  totalPhotos: 0,
  successfulPhotos: 0,
  failedPhotos: 0,
  skippedPhotos: 0,
  errors: [],
  startTime: null,
  endTime: null,
};

async function getCompanyCamToken() {
  const command = new GetSecretValueCommand({ SecretId: 'companycam/api-token' });
  const response = await secretsClient.send(command);
  const secret = JSON.parse(response.SecretString);
  return secret.token || secret.api_token || secret.apiToken;
}

async function getPhotoUrlsFromApi(photoId, token) {
  const { default: fetch } = await import('node-fetch');

  const response = await fetch(`${COMPANYCAM_API_URL}/photos/${photoId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch photo from API: ${response.status} ${response.statusText}`);
  }

  const photo = await response.json();

  // CRITICAL: uris is an ARRAY of {type, uri, url} objects, NOT an object with properties
  const originalUrl = photo.uris?.find(u => u.type === 'original')?.uri || photo.photo_url;
  const thumbnailUrl = photo.uris?.find(u => u.type === 'thumbnail')?.uri;

  return { originalUrl, thumbnailUrl };
}

async function downloadAndUploadToS3(imageUrl, projectId, photoId, token) {
  const { default: fetch } = await import('node-fetch');
  const { Upload } = await import('@aws-sdk/lib-storage');

  const response = await fetch(imageUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';

  // Verify it's an actual image, not HTML
  if (contentType.includes('text/html')) {
    throw new Error('Received HTML instead of image - URL may require different authentication');
  }

  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const s3Key = `projects/${projectId}/photos/${photoId}.${extension}`;

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
  return { s3Key, contentType };
}

async function downloadAndUploadThumbnail(thumbnailUrl, projectId, photoId, token) {
  const { default: fetch } = await import('node-fetch');
  const { Upload } = await import('@aws-sdk/lib-storage');

  const response = await fetch(thumbnailUrl, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get('content-type') || 'image/jpeg';

  // Skip if HTML
  if (contentType.includes('text/html')) {
    return null;
  }

  const extension = contentType.includes('png') ? 'png' : 'jpg';
  const s3Key = `projects/${projectId}/thumbnails/${photoId}_thumb.${extension}`;

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
  // Find the PhotoProject record via opportunityId (not companyCamId!)
  const photoProject = await prisma.photoProject.findFirst({
    where: { opportunityId: project.opportunityId }
  });

  if (!photoProject) {
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
      fileSize: 0,
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

  return newPhoto;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function processPhoto(photo, project, token) {
  try {
    // Fetch the actual downloadable URLs from CompanyCam API
    const { originalUrl, thumbnailUrl: apiThumbnailUrl } = await getPhotoUrlsFromApi(
      photo.companyCamId,
      token
    );

    if (!originalUrl) {
      throw new Error('Could not get original URL from CompanyCam API');
    }

    // Download and upload main photo
    const { s3Key } = await downloadAndUploadToS3(
      originalUrl,
      project.id,
      photo.companyCamId,
      token
    );

    // Download and upload thumbnail if available
    let s3ThumbnailKey = null;
    if (apiThumbnailUrl) {
      s3ThumbnailKey = await downloadAndUploadThumbnail(
        apiThumbnailUrl,
        project.id,
        photo.companyCamId,
        token
      );
    }

    // Verify the upload
    const verification = await verifyS3Object(s3Key);
    if (!verification.exists) {
      throw new Error('S3 object verification failed');
    }

    // Update companycam_photos record
    await prisma.companyCamPhoto.update({
      where: { id: photo.id },
      data: {
        s3Key: s3Key,
        s3ThumbnailKey: s3ThumbnailKey,
        originalCompanyCamUrl: photo.photoUrl,
        migratedToS3: true,
        migratedAt: new Date()
      }
    });

    // Create Photo record for CRM display
    await createPhotoRecord(photo, project, s3Key, s3ThumbnailKey);

    return { success: true, s3Key, size: verification.size };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function processProject(project, token) {
  console.log(`\n  Processing project: ${project.name} (ID: ${project.companyCamId})`);

  // Get all unmigrated photos for this project
  const photos = await prisma.companyCamPhoto.findMany({
    where: {
      projectId: project.id,
      migratedToS3: false
    }
  });

  if (photos.length === 0) {
    console.log(`    No unmigrated photos found`);
    return { processed: 0, success: 0, failed: 0 };
  }

  console.log(`    Found ${photos.length} unmigrated photos`);

  let projectSuccess = 0;
  let projectFailed = 0;

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const photoNum = i + 1;

    process.stdout.write(`    [${photoNum}/${photos.length}] Photo ${photo.companyCamId}... `);

    const result = await processPhoto(photo, project, token);

    if (result.success) {
      console.log(`✓ (${Math.round(result.size / 1024)} KB)`);
      projectSuccess++;
      stats.successfulPhotos++;
    } else {
      console.log(`✗ ${result.error}`);
      projectFailed++;
      stats.failedPhotos++;
      stats.errors.push({
        projectId: project.id,
        photoId: photo.id,
        companyCamId: photo.companyCamId,
        error: result.error
      });
    }

    // Rate limiting
    if (i < photos.length - 1) {
      await sleep(DELAY_BETWEEN_PHOTOS);
    }
  }

  return { processed: photos.length, success: projectSuccess, failed: projectFailed };
}

async function runFullMigration() {
  stats.startTime = new Date();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('CompanyCam to S3 Full Migration');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Started: ${stats.startTime.toISOString()}`);
  console.log(`S3 Bucket: ${S3_BUCKET}`);
  console.log('');

  try {
    // Step 1: Get CompanyCam API token
    console.log('Step 1: Getting CompanyCam API token...');
    const token = await getCompanyCamToken();
    console.log(`  ✓ Token retrieved`);
    console.log('');

    // Step 2: Get all projects with unmigrated photos
    console.log('Step 2: Finding projects with unmigrated photos...');

    const projectsWithUnmigrated = await prisma.companyCamProject.findMany({
      where: {
        photos: {
          some: {
            migratedToS3: false
          }
        }
      },
      include: {
        _count: {
          select: {
            photos: {
              where: { migratedToS3: false }
            }
          }
        }
      }
    });

    stats.totalProjects = projectsWithUnmigrated.length;
    stats.totalPhotos = projectsWithUnmigrated.reduce((sum, p) => sum + p._count.photos, 0);

    console.log(`  Found ${stats.totalProjects} projects with ${stats.totalPhotos} unmigrated photos`);
    console.log('');

    if (stats.totalProjects === 0) {
      console.log('  No unmigrated photos found. Migration complete!');
      return;
    }

    // Step 3: Process each project
    console.log('Step 3: Processing projects...');
    console.log('───────────────────────────────────────────────────────────');

    for (let i = 0; i < projectsWithUnmigrated.length; i++) {
      const project = projectsWithUnmigrated[i];
      stats.processedProjects = i + 1;

      console.log(`\n[Project ${i + 1}/${stats.totalProjects}]`);

      const result = await processProject(project, token);

      console.log(`    Summary: ${result.success} succeeded, ${result.failed} failed`);

      // Delay between projects
      if (i < projectsWithUnmigrated.length - 1) {
        await sleep(DELAY_BETWEEN_BATCHES);
      }

      // Progress update every 10 projects
      if ((i + 1) % 10 === 0) {
        const elapsed = (new Date() - stats.startTime) / 1000 / 60;
        const rate = stats.successfulPhotos / elapsed;
        const remaining = (stats.totalPhotos - stats.successfulPhotos - stats.failedPhotos) / rate;
        console.log(`\n  ═══ Progress: ${stats.successfulPhotos + stats.failedPhotos}/${stats.totalPhotos} photos (${Math.round(elapsed)} min elapsed, ~${Math.round(remaining)} min remaining) ═══\n`);
      }
    }

    stats.endTime = new Date();

    // Final Summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Migration Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Duration: ${Math.round((stats.endTime - stats.startTime) / 1000 / 60)} minutes`);
    console.log('');
    console.log('Results:');
    console.log(`  Projects processed: ${stats.processedProjects}/${stats.totalProjects}`);
    console.log(`  Photos migrated:    ${stats.successfulPhotos}`);
    console.log(`  Photos failed:      ${stats.failedPhotos}`);
    console.log(`  Success rate:       ${Math.round(stats.successfulPhotos / (stats.successfulPhotos + stats.failedPhotos) * 100)}%`);

    if (stats.errors.length > 0) {
      console.log('');
      console.log('Errors (first 20):');
      stats.errors.slice(0, 20).forEach((err, i) => {
        console.log(`  ${i + 1}. Photo ${err.companyCamId}: ${err.error}`);
      });

      if (stats.errors.length > 20) {
        console.log(`  ... and ${stats.errors.length - 20} more errors`);
      }
    }

    // Verification
    console.log('');
    console.log('Verification:');
    const migratedCount = await prisma.companyCamPhoto.count({
      where: { migratedToS3: true }
    });
    const remainingCount = await prisma.companyCamPhoto.count({
      where: { migratedToS3: false }
    });
    console.log(`  Total migrated photos in DB: ${migratedCount}`);
    console.log(`  Remaining unmigrated:        ${remainingCount}`);

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runFullMigration();
