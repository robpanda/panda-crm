// Photo Service for Photocam
// Handles photo upload, processing, and management
import sharp from 'sharp';
import exifr from 'exifr';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../prisma.js';
import { s3Service } from './s3Service.js';
import { projectService } from './projectService.js';
import { logger } from '../middleware/logger.js';

// Image processing settings
const DISPLAY_MAX_WIDTH = 2048;
const THUMBNAIL_SIZE = 400;
const JPEG_QUALITY = 85;
const MAX_INLINE_BULK_EXPORT_ITEMS = 80;

function isMissingColumnError(error, columnHint = null) {
  if (!error || error.code !== 'P2022') return false;
  if (!columnHint) return true;
  const metaColumn = String(error?.meta?.column || '');
  const message = String(error?.message || '');
  return metaColumn.includes(columnHint) || message.includes(columnHint);
}

function shouldQueueBulkExport(photoCount) {
  return Number(photoCount || 0) > MAX_INLINE_BULK_EXPORT_ITEMS;
}

function sanitizeFilename(name, fallback = 'photo') {
  const raw = (name || fallback).trim();
  return raw.replace(/[^a-zA-Z0-9._-]/g, '_') || fallback;
}

function detectImageFormat(buffer) {
  if (!buffer || buffer.length < 4) return 'unknown';
  const sig = buffer.subarray(0, 8);
  // PNG
  if (sig[0] === 0x89 && sig[1] === 0x50 && sig[2] === 0x4e && sig[3] === 0x47) return 'png';
  // JPEG
  if (sig[0] === 0xff && sig[1] === 0xd8 && sig[2] === 0xff) return 'jpg';
  return 'unknown';
}

async function buildBulkZipBuffer(photos) {
  const zip = new JSZip();

  for (const [index, photo] of photos.entries()) {
    if (!photo.fileKey) continue;
    // eslint-disable-next-line no-await-in-loop
    const content = await s3Service.getObjectBuffer(photo.fileKey);
    const safeName = sanitizeFilename(photo.fileName, `photo-${index + 1}`);
    zip.file(`${String(index + 1).padStart(3, '0')}-${safeName}`, content);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

async function buildBulkPdfBuffer(photos, title = 'Photo Export') {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  for (const [index, photo] of photos.entries()) {
    const page = pdfDoc.addPage([612, 792]);
    page.drawText(title, { x: 40, y: 760, size: 16, font: fontBold, color: rgb(0.11, 0.11, 0.11) });
    page.drawText(`Photo ${index + 1} of ${photos.length}`, {
      x: 40,
      y: 740,
      size: 11,
      font,
      color: rgb(0.25, 0.25, 0.25),
    });
    page.drawText(photo.fileName || photo.id, { x: 40, y: 722, size: 10, font, color: rgb(0.35, 0.35, 0.35) });

    if (!photo.fileKey) {
      page.drawText('Original file key unavailable for this photo.', { x: 40, y: 680, size: 11, font });
      // eslint-disable-next-line no-continue
      continue;
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const bytes = await s3Service.getObjectBuffer(photo.fileKey);
      const format = detectImageFormat(bytes);
      let embedded = null;
      if (format === 'png') {
        // eslint-disable-next-line no-await-in-loop
        embedded = await pdfDoc.embedPng(bytes);
      } else if (format === 'jpg') {
        // eslint-disable-next-line no-await-in-loop
        embedded = await pdfDoc.embedJpg(bytes);
      }

      if (!embedded) {
        page.drawText('Image format is not supported for PDF embedding.', { x: 40, y: 680, size: 11, font });
        // eslint-disable-next-line no-continue
        continue;
      }

      const bounds = { x: 40, y: 80, width: 532, height: 620 };
      const scale = Math.min(bounds.width / embedded.width, bounds.height / embedded.height, 1);
      const drawWidth = embedded.width * scale;
      const drawHeight = embedded.height * scale;
      const x = bounds.x + (bounds.width - drawWidth) / 2;
      const y = bounds.y + (bounds.height - drawHeight) / 2;
      page.drawImage(embedded, { x, y, width: drawWidth, height: drawHeight });
    } catch (error) {
      page.drawText(`Unable to embed image: ${error.message}`, { x: 40, y: 680, size: 11, font });
    }
  }

  return Buffer.from(await pdfDoc.save());
}

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

/**
 * Update selected photo metadata fields without replacing broader update behavior.
 */
export async function updatePhotoMetadata(photoId, payload = {}, userId) {
  const allowed = {};

  if (Object.prototype.hasOwnProperty.call(payload, 'caption')) {
    allowed.caption = payload.caption;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'tags')) {
    allowed.tags = Array.isArray(payload.tags) ? payload.tags : [];
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'photoType')) {
    allowed.photoType = payload.photoType;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'notes')) {
    allowed.notes = payload.notes || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'checklistItemId')) {
    allowed.checklistItemId = payload.checklistItemId || null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'customerVisible')) {
    allowed.customerVisible = Boolean(payload.customerVisible);
  }

  if (!Object.keys(allowed).length) {
    const err = new Error('No supported metadata fields provided');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  let updated;
  try {
    updated = await prisma.photo.update({
      where: { id: photoId },
      data: allowed,
    });
  } catch (error) {
    // Safety fallback for environments where additive PhotoCam migration has not been applied yet.
    if (!isMissingColumnError(error)) throw error;

    const fallback = { ...allowed };
    delete fallback.notes;
    delete fallback.checklistItemId;
    delete fallback.customerVisible;

    if (!Object.keys(fallback).length) {
      throw error;
    }

    logger.warn('Photo metadata fallback applied due to missing DB column', {
      photoId,
      attemptedFields: Object.keys(allowed),
      fallbackFields: Object.keys(fallback),
      code: error.code,
      column: error?.meta?.column || null,
    });

    updated = await prisma.photo.update({
      where: { id: photoId },
      data: fallback,
    });
  }

  if (updated?.projectId) {
    await projectService.createProjectActivity(updated.projectId, userId, 'PHOTO_METADATA_UPDATED', {
      photoId,
      fields: Object.keys(allowed),
    });
  }

  return updated;
}

/**
 * Assign selected photos to checklist/gallery/report scopes.
 */
export async function bulkAssignPhotos(payload = {}, userId) {
  const photoIds = Array.isArray(payload.photoIds) ? payload.photoIds.filter(Boolean) : [];
  if (!photoIds.length) {
    const err = new Error('photoIds must be a non-empty array');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const targetType = payload.targetType;
  const targetId = payload.targetId || null;

  if (!['CHECKLIST_ITEM', 'GALLERY', 'REPORT', 'PROJECT_GROUP'].includes(targetType)) {
    const err = new Error('targetType must be CHECKLIST_ITEM, GALLERY, REPORT, or PROJECT_GROUP');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (!targetId && targetType !== 'PROJECT_GROUP') {
    const err = new Error('targetId is required for selected targetType');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  let assigned = 0;

  if (targetType === 'CHECKLIST_ITEM') {
    const existingLinks = await prisma.checklistItemPhoto.findMany({
      where: { itemId: targetId, photoId: { in: photoIds } },
      select: { photoId: true },
    });
    const existingIds = new Set(existingLinks.map((row) => row.photoId));
    const toInsert = photoIds.filter((photoId) => !existingIds.has(photoId));

    if (toInsert.length) {
      await prisma.checklistItemPhoto.createMany({
        data: toInsert.map((photoId) => ({
          itemId: targetId,
          photoId,
        })),
        skipDuplicates: true,
      });
    }

    // Best-effort pointer for fast lookup; tolerate pre-migration DBs lacking checklist_item_id.
    try {
      await prisma.photo.updateMany({
        where: { id: { in: photoIds }, deletedAt: null },
        data: { checklistItemId: targetId },
      });
    } catch (error) {
      if (!isMissingColumnError(error, 'checklist_item_id')) throw error;
      logger.warn('Skipping checklistItemId pointer update due to missing checklist_item_id column', {
        targetId,
        photoCount: photoIds.length,
      });
    }

    assigned = toInsert.length;
  }

  if (targetType === 'GALLERY') {
    const existing = await prisma.galleryPhoto.findMany({
      where: { galleryId: targetId, photoId: { in: photoIds } },
      select: { photoId: true },
    });
    const existingIds = new Set(existing.map((row) => row.photoId));
    const toInsert = photoIds.filter((id) => !existingIds.has(id));

    if (toInsert.length) {
      const maxSort = await prisma.galleryPhoto.aggregate({
        where: { galleryId: targetId },
        _max: { sortOrder: true },
      });
      let nextSort = (maxSort._max.sortOrder || 0) + 1;
      await prisma.galleryPhoto.createMany({
        data: toInsert.map((photoId) => ({
          galleryId: targetId,
          photoId,
          sortOrder: nextSort++,
        })),
      });
    }
    assigned = toInsert.length;
  }

  if (targetType === 'REPORT') {
    const existing = await prisma.photoReportItem.findMany({
      where: { reportId: targetId, photoId: { in: photoIds } },
      select: { photoId: true },
    });
    const existingIds = new Set(existing.map((row) => row.photoId));
    const toInsert = photoIds.filter((id) => !existingIds.has(id));

    if (toInsert.length) {
      const maxSort = await prisma.photoReportItem.aggregate({
        where: { reportId: targetId },
        _max: { sortOrder: true },
      });
      let nextSort = (maxSort._max.sortOrder || 0) + 1;
      await prisma.photoReportItem.createMany({
        data: toInsert.map((photoId) => ({
          reportId: targetId,
          photoId,
          sortOrder: nextSort++,
        })),
      });
    }
    assigned = toInsert.length;
  }

  if (targetType === 'PROJECT_GROUP') {
    const updates = await Promise.all(photoIds.map((photoId) => updatePhotoMetadata(photoId, {
      tags: Array.from(new Set([...(payload.existingTags || []), payload.groupKey].filter(Boolean))),
    }, userId)));
    assigned = updates.length;
  }

  return {
    targetType,
    targetId,
    requestedCount: photoIds.length,
    assignedCount: assigned,
  };
}

/**
 * Queue a bulk download/export request and return an export job reference.
 */
export async function createBulkDownload(payload = {}, userId) {
  const photoIds = Array.isArray(payload.photoIds) ? payload.photoIds.filter(Boolean) : [];
  if (!photoIds.length) {
    const err = new Error('photoIds must be a non-empty array');
    err.statusCode = 400;
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const photos = await prisma.photo.findMany({
    where: { id: { in: photoIds }, deletedAt: null },
    select: {
      id: true,
      projectId: true,
      fileKey: true,
      originalUrl: true,
      fileName: true,
      photoType: true,
    },
  });

  const projectId = payload.projectId || photos[0]?.projectId || null;
  const opportunityId = payload.opportunityId || null;
  const outputFormat = payload.outputFormat === 'pdf' ? 'pdf' : 'zip';

  const exportJob = await prisma.photoExportJob.create({
    data: {
      projectId,
      opportunityId,
      outputFormat,
      status: 'PROCESSING',
      requestJson: {
        photoIds,
        outputFormat,
      },
      createdById: userId || null,
    },
  });

  if (photos.length === 0) {
    const updated = await prisma.photoExportJob.update({
      where: { id: exportJob.id },
      data: {
        status: 'FAILED',
        errorMessage: 'No valid photos were found for export',
      },
    });
    return {
      exportJobId: updated.id,
      status: updated.status,
      outputFormat,
      totalPhotos: 0,
      downloadUrl: null,
    };
  }

  if (shouldQueueBulkExport(photos.length)) {
    return {
      exportJobId: exportJob.id,
      status: 'PENDING',
      outputFormat,
      totalPhotos: photos.length,
      queued: true,
      message: 'Large export queued for async generation.',
    };
  }

  try {
    const nowTs = Date.now();
    const extension = outputFormat === 'pdf' ? 'pdf' : 'zip';
    const filename = `photocam-export-${nowTs}.${extension}`;
    const exportBuffer = outputFormat === 'pdf'
      ? await buildBulkPdfBuffer(photos, 'PhotoCam Bulk Export')
      : await buildBulkZipBuffer(photos);

    const upload = await s3Service.uploadExport(
      projectId || opportunityId || 'unscoped',
      `bulk-${outputFormat}`,
      exportBuffer,
      filename,
      outputFormat === 'pdf' ? 'application/pdf' : 'application/zip'
    );

    const updated = await prisma.photoExportJob.update({
      where: { id: exportJob.id },
      data: {
        status: 'READY',
        fileKey: upload.key,
        fileUrl: upload.url,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const downloadUrl = await s3Service.getPresignedDownloadUrl(updated.fileKey, 60 * 15);
    return {
      exportJobId: updated.id,
      status: updated.status,
      outputFormat,
      totalPhotos: photos.length,
      downloadUrl,
    };
  } catch (error) {
    const failed = await prisma.photoExportJob.update({
      where: { id: exportJob.id },
      data: {
        status: 'FAILED',
        errorMessage: error.message,
      },
    });

    return {
      exportJobId: failed.id,
      status: failed.status,
      outputFormat,
      totalPhotos: photos.length,
      error: error.message,
    };
  }
}

export async function getBulkDownloadStatus(exportJobId) {
  const job = await prisma.photoExportJob.findUnique({
    where: { id: exportJobId },
  });

  if (!job) {
    const err = new Error('Export job not found');
    err.statusCode = 404;
    err.code = 'NOT_FOUND';
    throw err;
  }

  const result = {
    exportJobId: job.id,
    status: job.status,
    outputFormat: job.outputFormat,
    error: job.errorMessage || null,
    expiresAt: job.expiresAt,
    createdAt: job.createdAt,
  };

  if (job.fileKey) {
    result.downloadUrl = await s3Service.getPresignedDownloadUrl(job.fileKey, 60 * 15);
  }

  return result;
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
  updatePhotoMetadata,
  bulkAssignPhotos,
  createBulkDownload,
  getBulkDownloadStatus,
  processImage,
};

export const photoServiceTestables = {
  sanitizeFilename,
  detectImageFormat,
  buildBulkZipBuffer,
  buildBulkPdfBuffer,
  shouldQueueBulkExport,
  MAX_INLINE_BULK_EXPORT_ITEMS,
};

export default photoService;
