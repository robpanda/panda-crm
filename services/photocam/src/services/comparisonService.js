// Before/After Comparison Service for Photocam
import prisma from '../prisma.js';
import { logger } from '../middleware/logger.js';
import { s3Service } from './s3Service.js';
import sharp from 'sharp';
import crypto from 'crypto';

/**
 * Create a new before/after comparison
 */
export async function createComparison(projectId, data, userId) {
  logger.info(`Creating comparison for project ${projectId}`);

  // Verify before and after photos exist
  const [beforePhoto, afterPhoto] = await Promise.all([
    prisma.photo.findUnique({ where: { id: data.beforePhotoId } }),
    prisma.photo.findUnique({ where: { id: data.afterPhotoId } }),
  ]);

  if (!beforePhoto) {
    const error = new Error('Before photo not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  if (!afterPhoto) {
    const error = new Error('After photo not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const comparison = await prisma.beforeAfterComparison.create({
    data: {
      projectId,
      beforePhotoId: data.beforePhotoId,
      afterPhotoId: data.afterPhotoId,
      layout: data.layout || 'SIDE_BY_SIDE',
      title: data.title,
      description: data.description,
      createdById: userId,
    },
    include: {
      beforePhoto: {
        select: { id: true, displayUrl: true, thumbnailUrl: true, caption: true },
      },
      afterPhoto: {
        select: { id: true, displayUrl: true, thumbnailUrl: true, caption: true },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  logger.info(`Created comparison ${comparison.id}`);
  return comparison;
}

/**
 * Get a comparison by ID
 */
export async function getComparisonById(comparisonId) {
  const comparison = await prisma.beforeAfterComparison.findUnique({
    where: { id: comparisonId },
    include: {
      project: {
        select: { id: true, name: true },
      },
      beforePhoto: {
        select: { id: true, displayUrl: true, thumbnailUrl: true, caption: true, originalUrl: true },
      },
      afterPhoto: {
        select: { id: true, displayUrl: true, thumbnailUrl: true, caption: true, originalUrl: true },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  return comparison;
}

/**
 * Get all comparisons for a project
 */
export async function getProjectComparisons(projectId) {
  const comparisons = await prisma.beforeAfterComparison.findMany({
    where: { projectId },
    include: {
      beforePhoto: {
        select: { id: true, thumbnailUrl: true, caption: true },
      },
      afterPhoto: {
        select: { id: true, thumbnailUrl: true, caption: true },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return comparisons;
}

/**
 * Update a comparison
 */
export async function updateComparison(comparisonId, data, userId) {
  logger.info(`Updating comparison ${comparisonId}`);

  const comparison = await prisma.beforeAfterComparison.update({
    where: { id: comparisonId },
    data: {
      layout: data.layout,
      title: data.title,
      description: data.description,
      beforePhotoId: data.beforePhotoId,
      afterPhotoId: data.afterPhotoId,
    },
    include: {
      beforePhoto: {
        select: { id: true, displayUrl: true, thumbnailUrl: true, caption: true },
      },
      afterPhoto: {
        select: { id: true, displayUrl: true, thumbnailUrl: true, caption: true },
      },
    },
  });

  // Clear generated image if photos or layout changed
  if (data.beforePhotoId || data.afterPhotoId || data.layout) {
    await prisma.beforeAfterComparison.update({
      where: { id: comparisonId },
      data: { generatedImageUrl: null },
    });
  }

  return comparison;
}

/**
 * Delete a comparison
 */
export async function deleteComparison(comparisonId, userId) {
  logger.info(`Deleting comparison ${comparisonId}`);

  const comparison = await prisma.beforeAfterComparison.findUnique({
    where: { id: comparisonId },
  });

  if (!comparison) {
    const error = new Error('Comparison not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Delete generated image from S3 if exists
  if (comparison.generatedImageUrl) {
    try {
      const key = comparison.generatedImageUrl.split('.com/')[1];
      if (key) {
        await s3Service.deleteFile(key);
      }
    } catch (err) {
      logger.warn(`Failed to delete generated image: ${err.message}`);
    }
  }

  await prisma.beforeAfterComparison.delete({
    where: { id: comparisonId },
  });

  return { deleted: true };
}

/**
 * Generate composite image for comparison
 */
export async function generateComparisonImage(comparisonId, options = {}) {
  logger.info(`Generating comparison image for ${comparisonId}`);

  const comparison = await getComparisonById(comparisonId);

  if (!comparison) {
    const error = new Error('Comparison not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const beforeUrl = comparison.beforePhoto.displayUrl || comparison.beforePhoto.originalUrl;
  const afterUrl = comparison.afterPhoto.displayUrl || comparison.afterPhoto.originalUrl;

  if (!beforeUrl || !afterUrl) {
    const error = new Error('Photo URLs not available');
    error.code = 'MISSING_PHOTOS';
    throw error;
  }

  // Fetch both images
  const [beforeBuffer, afterBuffer] = await Promise.all([
    fetchImageBuffer(beforeUrl),
    fetchImageBuffer(afterUrl),
  ]);

  let compositeBuffer;
  const layout = comparison.layout || 'SIDE_BY_SIDE';
  const outputWidth = options.width || 2400;
  const outputHeight = options.height || 1200;

  switch (layout) {
    case 'SIDE_BY_SIDE':
      compositeBuffer = await createSideBySide(beforeBuffer, afterBuffer, outputWidth, outputHeight);
      break;
    case 'VERTICAL':
      compositeBuffer = await createVertical(beforeBuffer, afterBuffer, outputWidth, outputHeight);
      break;
    case 'DIAGONAL':
      compositeBuffer = await createDiagonal(beforeBuffer, afterBuffer, outputWidth, outputHeight);
      break;
    default:
      compositeBuffer = await createSideBySide(beforeBuffer, afterBuffer, outputWidth, outputHeight);
  }

  // Add labels if requested
  if (options.addLabels) {
    compositeBuffer = await addLabels(compositeBuffer, layout, options);
  }

  // Upload to S3
  const fileName = `comparison-${comparisonId}-${Date.now()}.jpg`;
  const result = await s3Service.uploadComparisonImage(comparison.projectId, fileName, compositeBuffer);

  // Update comparison record
  await prisma.beforeAfterComparison.update({
    where: { id: comparisonId },
    data: { generatedImageUrl: result.url },
  });

  logger.info(`Generated comparison image: ${result.url}`);
  return { url: result.url };
}

/**
 * Create a shareable link for a comparison
 */
export async function createShareLink(comparisonId, options = {}) {
  logger.info(`Creating share link for comparison ${comparisonId}`);

  const comparison = await prisma.beforeAfterComparison.findUnique({
    where: { id: comparisonId },
  });

  if (!comparison) {
    const error = new Error('Comparison not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Generate a unique share token
  const shareToken = crypto.randomBytes(16).toString('hex');
  const expiresAt = options.expiresInDays
    ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  await prisma.beforeAfterComparison.update({
    where: { id: comparisonId },
    data: {
      shareToken,
      shareExpiresAt: expiresAt,
      isPublic: true,
    },
  });

  const shareUrl = `${process.env.FRONTEND_URL || 'https://crm.pandaadmin.com'}/share/comparison/${shareToken}`;

  return { shareUrl, shareToken, expiresAt };
}

/**
 * Get a comparison by share token (public access)
 */
export async function getComparisonByShareToken(shareToken) {
  const comparison = await prisma.beforeAfterComparison.findFirst({
    where: {
      shareToken,
      isPublic: true,
    },
    include: {
      project: {
        select: { id: true, name: true },
      },
      beforePhoto: {
        select: { id: true, displayUrl: true, caption: true },
      },
      afterPhoto: {
        select: { id: true, displayUrl: true, caption: true },
      },
    },
  });

  if (!comparison) {
    return null;
  }

  // Check if expired
  if (comparison.shareExpiresAt && new Date() > comparison.shareExpiresAt) {
    return null;
  }

  return comparison;
}

// Helper functions for image composition

async function fetchImageBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function createSideBySide(beforeBuffer, afterBuffer, width, height) {
  const halfWidth = Math.floor(width / 2);

  const beforeResized = await sharp(beforeBuffer)
    .resize(halfWidth, height, { fit: 'cover' })
    .toBuffer();

  const afterResized = await sharp(afterBuffer)
    .resize(halfWidth, height, { fit: 'cover' })
    .toBuffer();

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: beforeResized, left: 0, top: 0 },
      { input: afterResized, left: halfWidth, top: 0 },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function createVertical(beforeBuffer, afterBuffer, width, height) {
  const halfHeight = Math.floor(height / 2);

  const beforeResized = await sharp(beforeBuffer)
    .resize(width, halfHeight, { fit: 'cover' })
    .toBuffer();

  const afterResized = await sharp(afterBuffer)
    .resize(width, halfHeight, { fit: 'cover' })
    .toBuffer();

  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .composite([
      { input: beforeResized, left: 0, top: 0 },
      { input: afterResized, left: 0, top: halfHeight },
    ])
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function createDiagonal(beforeBuffer, afterBuffer, width, height) {
  // For diagonal, we overlay the images with a diagonal split
  const beforeResized = await sharp(beforeBuffer)
    .resize(width, height, { fit: 'cover' })
    .toBuffer();

  const afterResized = await sharp(afterBuffer)
    .resize(width, height, { fit: 'cover' })
    .toBuffer();

  // Create a diagonal mask (SVG)
  const mask = Buffer.from(`
    <svg width="${width}" height="${height}">
      <polygon points="0,0 ${width},0 ${width},${height}" fill="white"/>
    </svg>
  `);

  // Apply mask to after image
  const maskedAfter = await sharp(afterResized)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  // Composite before (full) with masked after on top
  return sharp(beforeResized)
    .composite([{ input: maskedAfter, left: 0, top: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function addLabels(imageBuffer, layout, options) {
  const metadata = await sharp(imageBuffer).metadata();
  const { width, height } = metadata;

  const labelHeight = 40;
  const beforeLabel = options.beforeLabel || 'BEFORE';
  const afterLabel = options.afterLabel || 'AFTER';

  // Create label overlays with SVG
  const labelSvg = Buffer.from(`
    <svg width="${width}" height="${height}">
      <style>
        .label { font-family: Arial, sans-serif; font-size: 24px; font-weight: bold; fill: white; }
        .label-bg { fill: rgba(0,0,0,0.6); }
      </style>
      ${
        layout === 'VERTICAL'
          ? `
        <rect x="10" y="10" width="100" height="${labelHeight}" rx="4" class="label-bg"/>
        <text x="20" y="38" class="label">${beforeLabel}</text>
        <rect x="10" y="${height / 2 + 10}" width="100" height="${labelHeight}" rx="4" class="label-bg"/>
        <text x="20" y="${height / 2 + 38}" class="label">${afterLabel}</text>
      `
          : `
        <rect x="10" y="10" width="100" height="${labelHeight}" rx="4" class="label-bg"/>
        <text x="20" y="38" class="label">${beforeLabel}</text>
        <rect x="${width / 2 + 10}" y="10" width="100" height="${labelHeight}" rx="4" class="label-bg"/>
        <text x="${width / 2 + 20}" y="38" class="label">${afterLabel}</text>
      `
      }
    </svg>
  `);

  return sharp(imageBuffer)
    .composite([{ input: labelSvg, left: 0, top: 0 }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

export const comparisonService = {
  createComparison,
  getComparisonById,
  getProjectComparisons,
  updateComparison,
  deleteComparison,
  generateComparisonImage,
  createShareLink,
  getComparisonByShareToken,
};

export default comparisonService;
