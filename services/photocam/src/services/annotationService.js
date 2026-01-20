// Annotation Service for Photocam
import prisma from '../prisma.js';
import { logger } from '../middleware/logger.js';

/**
 * Create a new annotation on a photo
 */
export async function createAnnotation(photoId, data, userId) {
  logger.info(`Creating annotation on photo ${photoId}`);

  // Verify photo exists
  const photo = await prisma.photo.findUnique({
    where: { id: photoId },
    include: { project: true },
  });

  if (!photo) {
    const error = new Error('Photo not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const annotation = await prisma.photoAnnotation.create({
    data: {
      photoId,
      type: data.type || 'FREEHAND',
      data: data.data, // JSON containing drawing coordinates, colors, etc.
      label: data.label,
      color: data.color || '#FF0000',
      strokeWidth: data.strokeWidth || 2,
      position: data.position, // JSON with x, y coordinates
      createdById: userId,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  logger.info(`Created annotation ${annotation.id} on photo ${photoId}`);
  return annotation;
}

/**
 * Get all annotations for a photo
 */
export async function getPhotoAnnotations(photoId) {
  const annotations = await prisma.photoAnnotation.findMany({
    where: { photoId },
    include: {
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return annotations;
}

/**
 * Get a single annotation by ID
 */
export async function getAnnotationById(annotationId) {
  const annotation = await prisma.photoAnnotation.findUnique({
    where: { id: annotationId },
    include: {
      photo: {
        select: {
          id: true,
          projectId: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  return annotation;
}

/**
 * Update an annotation
 */
export async function updateAnnotation(annotationId, data, userId) {
  logger.info(`Updating annotation ${annotationId}`);

  const existing = await prisma.photoAnnotation.findUnique({
    where: { id: annotationId },
  });

  if (!existing) {
    const error = new Error('Annotation not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  const annotation = await prisma.photoAnnotation.update({
    where: { id: annotationId },
    data: {
      type: data.type,
      data: data.data,
      label: data.label,
      color: data.color,
      strokeWidth: data.strokeWidth,
      position: data.position,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });

  logger.info(`Updated annotation ${annotationId}`);
  return annotation;
}

/**
 * Delete an annotation
 */
export async function deleteAnnotation(annotationId, userId) {
  logger.info(`Deleting annotation ${annotationId}`);

  const existing = await prisma.photoAnnotation.findUnique({
    where: { id: annotationId },
  });

  if (!existing) {
    const error = new Error('Annotation not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  await prisma.photoAnnotation.delete({
    where: { id: annotationId },
  });

  logger.info(`Deleted annotation ${annotationId}`);
  return { deleted: true };
}

/**
 * Bulk create annotations (for importing or copying)
 */
export async function bulkCreateAnnotations(photoId, annotations, userId) {
  logger.info(`Bulk creating ${annotations.length} annotations on photo ${photoId}`);

  const created = await prisma.photoAnnotation.createMany({
    data: annotations.map((ann) => ({
      photoId,
      type: ann.type || 'FREEHAND',
      data: ann.data,
      label: ann.label,
      color: ann.color || '#FF0000',
      strokeWidth: ann.strokeWidth || 2,
      position: ann.position,
      createdById: userId,
    })),
  });

  return { count: created.count };
}

/**
 * Copy annotations from one photo to another
 */
export async function copyAnnotations(sourcePhotoId, targetPhotoId, userId) {
  logger.info(`Copying annotations from photo ${sourcePhotoId} to ${targetPhotoId}`);

  const sourceAnnotations = await prisma.photoAnnotation.findMany({
    where: { photoId: sourcePhotoId },
  });

  if (sourceAnnotations.length === 0) {
    return { count: 0 };
  }

  const result = await bulkCreateAnnotations(
    targetPhotoId,
    sourceAnnotations.map((ann) => ({
      type: ann.type,
      data: ann.data,
      label: ann.label,
      color: ann.color,
      strokeWidth: ann.strokeWidth,
      position: ann.position,
    })),
    userId
  );

  logger.info(`Copied ${result.count} annotations to photo ${targetPhotoId}`);
  return result;
}

export const annotationService = {
  createAnnotation,
  getPhotoAnnotations,
  getAnnotationById,
  updateAnnotation,
  deleteAnnotation,
  bulkCreateAnnotations,
  copyAnnotations,
};

export default annotationService;
