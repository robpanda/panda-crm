// Photo Service for Photocam
// Handles photo upload, processing, and management
import sharp from 'sharp';
import exifr from 'exifr';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../prisma.js';
import { s3Service } from './s3Service.js';
import { projectService } from './projectService.js';
import { logger } from '../middleware/logger.js';

// Image processing settings
const DISPLAY_MAX_WIDTH = 2048;
const THUMBNAIL_SIZE = 400;
const JPEG_QUALITY = 85;

/**
 * Process uploaded file and create photo variants
 */
async function processImage(buffer, filename) {
  try {
    const image = sharp(buffer);
    const metadata = await image.metadata();

    // Extract EXIF data
    let exifData = null;
    try {
      exifData = await exifr.parse(buffer, {
        gps: true,
        exif: true,
        ifd0: true,
      });
    } catch (e) {
      logger.warn('EXIF extraction failed:', e.message);
    }

    // Create display version (max 2048px)
    const displayBuffer = await image
      .resize(DISPLAY_MAX_WIDTH, DISPLAY_MAX_WIDTH, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    // Create thumbnail (400px square)
    const thumbnailBuffer = await image
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();

    return {
      original: {
        buffer,
        filename,
        contentType: `image/${metadata.format || 'jpeg'}`,
        width: metadata.width,
        height: metadata.height,
      },
      display: {
        buffer: displayBuffer,
        filename: filename.replace(/\.[^.]+$/, '_display.jpg'),
        contentType: 'image/jpeg',
      },
      thumbnail: {
        buffer: thumbnailBuffer,
        filename: filename.replace(/\.[^.]+$/, '_thumb.jpg'),
        contentType: 'image/jpeg',
      },
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: buffer.length,
        exif: exifData,
        hasGps: !!(exifData?.latitude && exifData?.longitude),
        gpsLatitude: exifData?.latitude,
        gpsLongitude: exifData?.longitude,
        capturedAt: exifData?.DateTimeOriginal || exifData?.CreateDate,
        cameraMake: exifData?.Make,
        cameraModel: exifData?.Model,
      },
    };
  } catch (error) {
    logger.error('Image processing error:', error);
    throw new Error(`Failed to process image: ${error.message}`);
  }
}

/**
 * Upload a photo to a project
 */
export async function uploadPhoto(projectId, file, options = {}, userId) {
  try {
    const photoId = uuidv4();
    const { type = 'OTHER', caption, tags = [] } = options;

    // Process image and create variants
    const processed = await processImage(file.buffer, file.originalname);

    // Upload to S3
    const uploadResults = await s3Service.uploadPhotoWithVariants(
      projectId,
      photoId,
      processed
    );

    // Create database record
    const photo = await prisma.photo.create({
      data: {
        id: photoId,
        projectId,
        filename: file.originalname,
        originalUrl: uploadResults.original?.url,
        displayUrl: uploadResults.display?.url,
        thumbnailUrl: uploadResults.thumbnail?.url,
        s3Key: uploadResults.original?.key,
        contentType: processed.original.contentType,
        size: processed.metadata.size,
        width: processed.metadata.width,
        height: processed.metadata.height,
        type,
        caption,
        tags,
        exifData: processed.metadata.exif || {},
        gpsLatitude: processed.metadata.gpsLatitude,
        gpsLongitude: processed.metadata.gpsLongitude,
        capturedAt: processed.metadata.capturedAt,
        cameraMake: processed.metadata.cameraMake,
        cameraModel: processed.metadata.cameraModel,
        uploadedById: userId,
      },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Log activity
    await projectService.createProjectActivity(projectId, userId, 'PHOTO_UPLOADED', {
      photoId,
      filename: file.originalname,
      type,
    });

    return photo;
  } catch (error) {
    logger.error('Upload photo error:', error);
    throw error;
  }
}

/**
 * Upload multiple photos
 */
export async function uploadMultiplePhotos(projectId, files, options = {}, userId) {
  const results = [];
  const errors = [];

  for (const file of files) {
    try {
      const photo = await uploadPhoto(projectId, file, options, userId);
      results.push(photo);
    } catch (error) {
      errors.push({ filename: file.originalname, error: error.message });
    }
  }

  return { uploaded: results, errors };
}

/**
 * Get a photo by ID
 */
export async function getPhotoById(photoId) {
  try {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        annotations: {
          orderBy: { createdAt: 'asc' },
          include: {
            createdBy: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
        project: {
          select: { id: true, name: true, opportunityId: true },
        },
      },
    });

    return photo;
  } catch (error) {
    logger.error('Get photo error:', error);
    throw error;
  }
}

/**
 * Get photos for a project with filtering
 */
export async function getProjectPhotos(projectId, filters = {}, pagination = {}) {
  try {
    const { type, search, hasGps, dateFrom, dateTo } = filters;
    const { page = 1, limit = 50 } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      projectId,
      deletedAt: null,
    };

    if (type) where.type = type;
    if (hasGps !== undefined) {
      where.gpsLatitude = hasGps ? { not: null } : null;
    }
    if (search) {
      where.OR = [
        { caption: { contains: search, mode: 'insensitive' } },
        { filename: { contains: search, mode: 'insensitive' } },
        { tags: { has: search } },
      ];
    }
    if (dateFrom || dateTo) {
      where.capturedAt = {};
      if (dateFrom) where.capturedAt.gte = new Date(dateFrom);
      if (dateTo) where.capturedAt.lte = new Date(dateTo);
    }

    const [photos, total] = await Promise.all([
      prisma.photo.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          uploadedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: {
            select: { annotations: true },
          },
        },
      }),
      prisma.photo.count({ where }),
    ]);

    return {
      photos,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error('Get project photos error:', error);
    throw error;
  }
}

/**
 * Update a photo
 */
export async function updatePhoto(photoId, data, userId) {
  try {
    const photo = await prisma.photo.update({
      where: { id: photoId },
      data: {
        type: data.type,
        caption: data.caption,
        tags: data.tags,
        aiLabels: data.aiLabels,
        aiDescription: data.aiDescription,
      },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    await projectService.createProjectActivity(photo.projectId, userId, 'PHOTO_UPDATED', {
      photoId,
      changes: Object.keys(data),
    });

    return photo;
  } catch (error) {
    logger.error('Update photo error:', error);
    throw error;
  }
}

/**
 * Delete a photo (soft delete)
 */
export async function deletePhoto(photoId, userId) {
  try {
    const photo = await prisma.photo.update({
      where: { id: photoId },
      data: { deletedAt: new Date() },
    });

    await projectService.createProjectActivity(photo.projectId, userId, 'PHOTO_DELETED', {
      photoId,
      filename: photo.filename,
    });

    return photo;
  } catch (error) {
    logger.error('Delete photo error:', error);
    throw error;
  }
}

/**
 * Permanently delete a photo (including S3 files)
 */
export async function permanentlyDeletePhoto(photoId) {
  try {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      throw new Error('Photo not found');
    }

    // Delete from S3
    await s3Service.deletePhotoFiles(photo.projectId, photoId);

    // Delete from database
    await prisma.photo.delete({
      where: { id: photoId },
    });

    return true;
  } catch (error) {
    logger.error('Permanent delete photo error:', error);
    throw error;
  }
}

/**
 * Get presigned download URL for a photo
 */
export async function getPhotoDownloadUrl(photoId, variant = 'original') {
  try {
    const photo = await prisma.photo.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      throw new Error('Photo not found');
    }

    let key;
    switch (variant) {
      case 'display':
        key = photo.displayUrl?.replace(s3Service.CDN_URL + '/', '');
        break;
      case 'thumbnail':
        key = photo.thumbnailUrl?.replace(s3Service.CDN_URL + '/', '');
        break;
      default:
        key = photo.s3Key;
    }

    if (!key) {
      throw new Error(`${variant} version not available`);
    }

    const url = await s3Service.getPresignedDownloadUrl(key);
    return url;
  } catch (error) {
    logger.error('Get download URL error:', error);
    throw error;
  }
}

/**
 * Get photos by type for a project
 */
export async function getPhotosByType(projectId, type) {
  try {
    const photos = await prisma.photo.findMany({
      where: {
        projectId,
        type,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return photos;
  } catch (error) {
    logger.error('Get photos by type error:', error);
    throw error;
  }
}

/**
 * Update AI labels for a photo (called after Rekognition analysis)
 */
export async function updatePhotoAiData(photoId, aiData) {
  try {
    const photo = await prisma.photo.update({
      where: { id: photoId },
      data: {
        aiLabels: aiData.labels,
        aiDescription: aiData.description,
        detectedText: aiData.detectedText,
        aiProcessedAt: new Date(),
      },
    });

    return photo;
  } catch (error) {
    logger.error('Update AI data error:', error);
    throw error;
  }
}

export const photoService = {
  uploadPhoto,
  uploadMultiplePhotos,
  getPhotoById,
  getProjectPhotos,
  updatePhoto,
  deletePhoto,
  permanentlyDeletePhoto,
  getPhotoDownloadUrl,
  getPhotosByType,
  updatePhotoAiData,
  processImage,
};

export default photoService;
