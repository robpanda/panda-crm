// Gallery Service for Photocam
import prisma from '../prisma.js';
import { logger } from '../middleware/logger.js';
import crypto from 'crypto';
import { s3Service } from './s3Service.js';

function hashPassword(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

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
  const expiresAt = options.expiresAt
    ? new Date(options.expiresAt)
    : options.expiresInDays
      ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  await prisma.photoGallery.update({
    where: { id: galleryId },
    data: {
      shareToken,
      shareExpiresAt: expiresAt,
      isPublic: true,
      passwordHash: options.password ? hashPassword(options.password) : null,
      downloadEnabled: options.allowDownload ?? true,
      isPortalVisible: options.isPortalVisible ?? true,
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
  if (gallery.passwordHash && hashPassword(password || '') !== gallery.passwordHash) {
    return { requiresPassword: true };
  }

  // Track lightweight analytics
  await prisma.photoGallery.update({
    where: { id: gallery.id },
    data: {
      viewCount: { increment: 1 },
      lastViewedAt: new Date(),
    },
  });

  // Remove hash from response
  const { passwordHash: _, ...galleryData } = gallery;
  return galleryData;
}

export async function getSharedPhotoDownloadByToken(shareToken, photoId, password = null) {
  const gallery = await prisma.photoGallery.findFirst({
    where: {
      shareToken,
      isPublic: true,
    },
    select: {
      id: true,
      name: true,
      shareExpiresAt: true,
      passwordHash: true,
      downloadEnabled: true,
    },
  });

  if (!gallery) {
    const err = new Error('Gallery not found or link is invalid');
    err.code = 'NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  if (gallery.shareExpiresAt && new Date() > gallery.shareExpiresAt) {
    const err = new Error('This share link has expired');
    err.code = 'EXPIRED';
    err.statusCode = 410;
    throw err;
  }

  if (gallery.passwordHash && hashPassword(password || '') !== gallery.passwordHash) {
    const err = new Error('This gallery requires a password');
    err.code = 'PASSWORD_REQUIRED';
    err.statusCode = 401;
    throw err;
  }

  if (!gallery.downloadEnabled) {
    const err = new Error('Downloads are disabled for this gallery');
    err.code = 'DOWNLOAD_DISABLED';
    err.statusCode = 403;
    throw err;
  }

  const galleryPhoto = await prisma.galleryPhoto.findFirst({
    where: {
      galleryId: gallery.id,
      photoId,
    },
    include: {
      photo: {
        select: {
          id: true,
          fileName: true,
          fileKey: true,
        },
      },
    },
  });

  if (!galleryPhoto?.photo?.fileKey) {
    const err = new Error('Photo file is not available');
    err.code = 'NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const expiresInSeconds = 60 * 10;
  const url = await s3Service.getPresignedDownloadUrl(galleryPhoto.photo.fileKey, expiresInSeconds);

  return {
    photoId: galleryPhoto.photo.id,
    fileName: galleryPhoto.photo.fileName,
    url,
    expiresInSeconds,
  };
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
      passwordHash: null,
    },
  });

  return { revoked: true };
}

export async function createGalleryFromSelection(payload, userId) {
  const gallery = await createGallery(
    payload.projectId,
    {
      name: payload.name,
      description: payload.description,
      isPublic: payload.isPublic ?? false,
      isLive: payload.isLive ?? false,
      photoIds: payload.photoIds || [],
    },
    userId
  );

  return gallery;
}

export async function updateGalleryAccess(galleryId, payload, userId) {
  const existing = await prisma.photoGallery.findUnique({ where: { id: galleryId } });
  if (!existing) {
    const err = new Error('Gallery not found');
    err.code = 'NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  const data = {};
  if (Object.prototype.hasOwnProperty.call(payload, 'allowDownload')) {
    data.downloadEnabled = Boolean(payload.allowDownload);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'downloadEnabled')) {
    data.downloadEnabled = Boolean(payload.downloadEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'isPortalVisible')) {
    data.isPortalVisible = Boolean(payload.isPortalVisible);
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'expiresAt')) {
    data.shareExpiresAt = payload.expiresAt ? new Date(payload.expiresAt) : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'expiresInDays')) {
    data.shareExpiresAt = payload.expiresInDays
      ? new Date(Date.now() + Number(payload.expiresInDays) * 24 * 60 * 60 * 1000)
      : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'password')) {
    data.passwordHash = payload.password ? hashPassword(payload.password) : null;
  }

  const updated = await prisma.photoGallery.update({
    where: { id: galleryId },
    data,
  });

  logger.info(`Updated gallery access controls`, {
    galleryId,
    userId,
    keys: Object.keys(data),
  });

  return updated;
}

export async function getGalleryAnalytics(galleryId) {
  const gallery = await prisma.photoGallery.findUnique({
    where: { id: galleryId },
    select: {
      id: true,
      name: true,
      status: true,
      isPortalVisible: true,
      downloadEnabled: true,
      shareExpiresAt: true,
      viewCount: true,
      lastViewedAt: true,
      updatedAt: true,
    },
  });

  if (!gallery) {
    const err = new Error('Gallery not found');
    err.code = 'NOT_FOUND';
    err.statusCode = 404;
    throw err;
  }

  return gallery;
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
  getSharedPhotoDownloadByToken,
  getLiveGalleryPhotos,
  revokeShareLink,
  createGalleryFromSelection,
  updateGalleryAccess,
  getGalleryAnalytics,
};

export default galleryService;
