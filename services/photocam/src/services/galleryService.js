// Gallery Service for Photocam
import prisma from '../prisma.js';
import { logger } from '../middleware/logger.js';
import crypto from 'crypto';

/**
 * Create a new gallery for a project
 */
export async function createGallery(projectId, data, userId) {
  logger.info(`Creating gallery for project ${projectId}`);

  const gallery = await prisma.photoGallery.create({
    data: {
      projectId,
      name: data.name,
      description: data.description,
      isPublic: data.isPublic ?? false,
      isLive: data.isLive ?? true, // Auto-updating gallery
      createdById: userId,
    },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
      _count: {
        select: { photos: true },
      },
    },
  });

  // Add initial photos if provided
  if (data.photoIds && data.photoIds.length > 0) {
    await addPhotosToGallery(gallery.id, data.photoIds, userId);
  }

  logger.info(`Created gallery ${gallery.id}`);
  return getGalleryById(gallery.id);
}

/**
 * Get a gallery by ID
 */
export async function getGalleryById(galleryId) {
  const gallery = await prisma.photoGallery.findUnique({
    where: { id: galleryId },
    include: {
      project: {
        select: { id: true, name: true },
      },
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
      photos: {
        include: {
          photo: {
            select: {
              id: true,
              displayUrl: true,
              thumbnailUrl: true,
              originalUrl: true,
              caption: true,
              type: true,
              takenAt: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  return gallery;
}

/**
 * Get all galleries for a project
 */
export async function getProjectGalleries(projectId) {
  const galleries = await prisma.photoGallery.findMany({
    where: { projectId },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
      _count: {
        select: { photos: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return galleries;
}

/**
 * Update a gallery
 */
export async function updateGallery(galleryId, data, userId) {
  logger.info(`Updating gallery ${galleryId}`);

  const gallery = await prisma.photoGallery.update({
    where: { id: galleryId },
    data: {
      name: data.name,
      description: data.description,
      isPublic: data.isPublic,
      isLive: data.isLive,
      coverPhotoId: data.coverPhotoId,
    },
    include: {
      createdBy: {
        select: { id: true, firstName: true, lastName: true },
      },
      _count: {
        select: { photos: true },
      },
    },
  });

  return gallery;
}

/**
 * Delete a gallery
 */
export async function deleteGallery(galleryId, userId) {
  logger.info(`Deleting gallery ${galleryId}`);

  // Remove photo associations first
  await prisma.galleryPhoto.deleteMany({
    where: { galleryId },
  });

  await prisma.photoGallery.delete({
    where: { id: galleryId },
  });

  return { deleted: true };
}

/**
 * Add photos to a gallery
 */
export async function addPhotosToGallery(galleryId, photoIds, userId) {
  logger.info(`Adding ${photoIds.length} photos to gallery ${galleryId}`);

  // Get current max sort order
  const maxSort = await prisma.galleryPhoto.aggregate({
    where: { galleryId },
    _max: { sortOrder: true },
  });

  let sortOrder = (maxSort._max.sortOrder || 0) + 1;

  // Filter out photos already in gallery
  const existing = await prisma.galleryPhoto.findMany({
    where: {
      galleryId,
      photoId: { in: photoIds },
    },
    select: { photoId: true },
  });

  const existingIds = new Set(existing.map((e) => e.photoId));
  const newPhotoIds = photoIds.filter((id) => !existingIds.has(id));

  if (newPhotoIds.length === 0) {
    return { added: 0 };
  }

  // Add new photos
  await prisma.galleryPhoto.createMany({
    data: newPhotoIds.map((photoId) => ({
      galleryId,
      photoId,
      sortOrder: sortOrder++,
    })),
  });

  return { added: newPhotoIds.length };
}

/**
 * Remove a photo from a gallery
 */
export async function removePhotoFromGallery(galleryId, photoId) {
  logger.info(`Removing photo ${photoId} from gallery ${galleryId}`);

  await prisma.galleryPhoto.deleteMany({
    where: { galleryId, photoId },
  });

  return { removed: true };
}

/**
 * Reorder photos in a gallery
 */
export async function reorderGalleryPhotos(galleryId, photoIds) {
  logger.info(`Reordering photos in gallery ${galleryId}`);

  // Update sort order for each photo
  await Promise.all(
    photoIds.map((photoId, index) =>
      prisma.galleryPhoto.updateMany({
        where: { galleryId, photoId },
        data: { sortOrder: index },
      })
    )
  );

  return { reordered: true };
}

/**
 * Create a shareable link for a gallery
 */
export async function createShareLink(galleryId, options = {}) {
  logger.info(`Creating share link for gallery ${galleryId}`);

  const gallery = await prisma.photoGallery.findUnique({
    where: { id: galleryId },
  });

  if (!gallery) {
    const error = new Error('Gallery not found');
    error.code = 'NOT_FOUND';
    throw error;
  }

  // Generate unique share token
  const shareToken = crypto.randomBytes(16).toString('hex');
  const expiresAt = options.expiresInDays
    ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
    : null;

  await prisma.photoGallery.update({
    where: { id: galleryId },
    data: {
      shareToken,
      shareExpiresAt: expiresAt,
      isPublic: true,
      password: options.password || null,
    },
  });

  const shareUrl = `${process.env.FRONTEND_URL || 'https://crm.pandaadmin.com'}/share/gallery/${shareToken}`;

  return { shareUrl, shareToken, expiresAt, hasPassword: !!options.password };
}

/**
 * Get a gallery by share token (public access)
 */
export async function getGalleryByShareToken(shareToken, password = null) {
  const gallery = await prisma.photoGallery.findFirst({
    where: {
      shareToken,
      isPublic: true,
    },
    include: {
      project: {
        select: { id: true, name: true },
      },
      photos: {
        include: {
          photo: {
            select: {
              id: true,
              displayUrl: true,
              thumbnailUrl: true,
              caption: true,
              type: true,
              takenAt: true,
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
    },
  });

  if (!gallery) {
    return null;
  }

  // Check if expired
  if (gallery.shareExpiresAt && new Date() > gallery.shareExpiresAt) {
    return { expired: true };
  }

  // Check password if required
  if (gallery.password && gallery.password !== password) {
    return { requiresPassword: true };
  }

  // Remove password from response
  const { password: _, ...galleryData } = gallery;
  return galleryData;
}

/**
 * Get live gallery photos (for auto-updating galleries)
 * Returns all photos from the project for "live" galleries
 */
export async function getLiveGalleryPhotos(galleryId) {
  const gallery = await prisma.photoGallery.findUnique({
    where: { id: galleryId },
    select: { projectId: true, isLive: true },
  });

  if (!gallery || !gallery.isLive) {
    return null;
  }

  // Get all photos from the project
  const photos = await prisma.photo.findMany({
    where: {
      projectId: gallery.projectId,
      deletedAt: null,
    },
    select: {
      id: true,
      displayUrl: true,
      thumbnailUrl: true,
      caption: true,
      type: true,
      takenAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return photos;
}

/**
 * Revoke gallery share link
 */
export async function revokeShareLink(galleryId) {
  logger.info(`Revoking share link for gallery ${galleryId}`);

  await prisma.photoGallery.update({
    where: { id: galleryId },
    data: {
      shareToken: null,
      shareExpiresAt: null,
      isPublic: false,
      password: null,
    },
  });

  return { revoked: true };
}

export const galleryService = {
  createGallery,
  getGalleryById,
  getProjectGalleries,
  updateGallery,
  deleteGallery,
  addPhotosToGallery,
  removePhotoFromGallery,
  reorderGalleryPhotos,
  createShareLink,
  getGalleryByShareToken,
  getLiveGalleryPhotos,
  revokeShareLink,
};

export default galleryService;
