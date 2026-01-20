/**
 * Fix Photo URLs: Update from S3 to CloudFront
 *
 * Problem: Photo records were created with direct S3 URLs but the bucket
 * only allows CloudFront access, causing ERR_BLOCKED_BY_ORB errors.
 *
 * This script updates:
 * - originalUrl: from s3.amazonaws.com to CloudFront
 * - displayUrl: from s3.amazonaws.com to CloudFront
 */

import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL + '&connection_limit=5&pool_timeout=60'
    }
  }
});

// S3 bucket that photos are stored in
const S3_BUCKET = 'pandacam-photos-prod';
const S3_REGION = 'us-east-2';

// CloudFront domain for the bucket
const CLOUDFRONT_DOMAIN = 'd2nv1ditkq7acr.cloudfront.net';

// URL patterns
const S3_URL_PATTERN = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/`;
const CLOUDFRONT_URL_PATTERN = `https://${CLOUDFRONT_DOMAIN}/`;

// Stats
const stats = {
  totalPhotos: 0,
  updatedPhotos: 0,
  skippedPhotos: 0,
  errors: []
};

async function fixPhotoUrls() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Fix Photo URLs: S3 → CloudFront');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');
  console.log(`S3 Pattern:         ${S3_URL_PATTERN}`);
  console.log(`CloudFront Pattern: ${CLOUDFRONT_URL_PATTERN}`);
  console.log('');

  try {
    // Find all photos with S3 URLs
    console.log('Step 1: Finding photos with S3 URLs...');

    const photosWithS3Urls = await prisma.photo.findMany({
      where: {
        OR: [
          { originalUrl: { contains: S3_BUCKET } },
          { displayUrl: { contains: S3_BUCKET } }
        ]
      },
      select: {
        id: true,
        originalUrl: true,
        displayUrl: true,
        fileName: true
      }
    });

    stats.totalPhotos = photosWithS3Urls.length;
    console.log(`  Found ${stats.totalPhotos} photos with S3 URLs`);
    console.log('');

    if (stats.totalPhotos === 0) {
      console.log('No photos need updating. Exiting.');
      return;
    }

    // Update each photo
    console.log('Step 2: Updating URLs to CloudFront...');
    console.log('───────────────────────────────────────────────────────────');

    for (let i = 0; i < photosWithS3Urls.length; i++) {
      const photo = photosWithS3Urls[i];

      try {
        const updates = {};

        // Update originalUrl if it contains S3 bucket
        if (photo.originalUrl && photo.originalUrl.includes(S3_BUCKET)) {
          updates.originalUrl = photo.originalUrl.replace(S3_URL_PATTERN, CLOUDFRONT_URL_PATTERN);
        }

        // Update displayUrl if it contains S3 bucket
        if (photo.displayUrl && photo.displayUrl.includes(S3_BUCKET)) {
          updates.displayUrl = photo.displayUrl.replace(S3_URL_PATTERN, CLOUDFRONT_URL_PATTERN);
        }

        if (Object.keys(updates).length > 0) {
          await prisma.photo.update({
            where: { id: photo.id },
            data: updates
          });
          stats.updatedPhotos++;

          // Progress indicator every 100 photos
          if ((i + 1) % 100 === 0 || i === photosWithS3Urls.length - 1) {
            console.log(`  Progress: ${i + 1}/${stats.totalPhotos} (${Math.round((i + 1) / stats.totalPhotos * 100)}%)`);
          }
        } else {
          stats.skippedPhotos++;
        }
      } catch (error) {
        stats.errors.push({
          photoId: photo.id,
          fileName: photo.fileName,
          error: error.message
        });
      }
    }

    // Final summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('URL Fix Complete!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
    console.log('Results:');
    console.log(`  Total photos found:    ${stats.totalPhotos}`);
    console.log(`  Photos updated:        ${stats.updatedPhotos}`);
    console.log(`  Photos skipped:        ${stats.skippedPhotos}`);
    console.log(`  Errors:                ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('');
      console.log('Errors (first 10):');
      stats.errors.slice(0, 10).forEach((err, i) => {
        console.log(`  ${i + 1}. Photo ${err.photoId}: ${err.error}`);
      });
    }

    // Verification
    console.log('');
    console.log('Verification:');

    const remainingS3Photos = await prisma.photo.count({
      where: {
        OR: [
          { originalUrl: { contains: S3_BUCKET } },
          { displayUrl: { contains: S3_BUCKET } }
        ]
      }
    });

    const cloudfrontPhotos = await prisma.photo.count({
      where: {
        OR: [
          { originalUrl: { contains: CLOUDFRONT_DOMAIN } },
          { displayUrl: { contains: CLOUDFRONT_DOMAIN } }
        ]
      }
    });

    console.log(`  Photos still with S3 URLs:        ${remainingS3Photos}`);
    console.log(`  Photos with CloudFront URLs:      ${cloudfrontPhotos}`);

    // Show sample updated URL
    if (stats.updatedPhotos > 0) {
      const samplePhoto = await prisma.photo.findFirst({
        where: {
          originalUrl: { contains: CLOUDFRONT_DOMAIN }
        },
        select: {
          id: true,
          originalUrl: true,
          displayUrl: true
        }
      });

      if (samplePhoto) {
        console.log('');
        console.log('Sample updated photo:');
        console.log(`  ID: ${samplePhoto.id}`);
        console.log(`  Original URL: ${samplePhoto.originalUrl}`);
        console.log(`  Display URL: ${samplePhoto.displayUrl}`);
      }
    }

  } catch (error) {
    console.error('Fix failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixPhotoUrls();
