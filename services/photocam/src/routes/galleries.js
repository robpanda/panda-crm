// Gallery Routes for Photocam
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { galleryService } from '../services/galleryService.js';

const router = express.Router();

// Apply auth middleware to all routes except public share
router.use((req, res, next) => {
  // Allow public access to share endpoint
  if (req.path.startsWith('/share/')) {
    return next();
  }
  return authMiddleware(req, res, next);
});

/**
 * POST /api/photocam/projects/:projectId/galleries
 * Create a new gallery for a project
 */
router.post('/projects/:projectId/galleries', async (req, res, next) => {
  try {
    const gallery = await galleryService.createGallery(
      req.params.projectId,
      req.body,
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: gallery,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/projects/:projectId/galleries
 * Get all galleries for a project
 */
router.get('/projects/:projectId/galleries', async (req, res, next) => {
  try {
    const galleries = await galleryService.getProjectGalleries(req.params.projectId);

    res.json({
      success: true,
      data: galleries,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/galleries/:id
 * Get a single gallery with all photos
 */
router.get('/:id', async (req, res, next) => {
  try {
    const gallery = await galleryService.getGalleryById(req.params.id);

    if (!gallery) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Gallery not found' },
      });
    }

    res.json({
      success: true,
      data: gallery,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/photocam/galleries/:id
 * Update a gallery
 */
router.put('/:id', async (req, res, next) => {
  try {
    const gallery = await galleryService.updateGallery(req.params.id, req.body, req.user.id);

    res.json({
      success: true,
      data: gallery,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photocam/galleries/:id
 * Delete a gallery
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await galleryService.deleteGallery(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Gallery deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/galleries/:id/photos
 * Add photos to a gallery
 */
router.post('/:id/photos', async (req, res, next) => {
  try {
    const { photoIds } = req.body;

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'photoIds array is required' },
      });
    }

    const result = await galleryService.addPhotosToGallery(req.params.id, photoIds, req.user.id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photocam/galleries/:id/photos/:photoId
 * Remove a photo from a gallery
 */
router.delete('/:id/photos/:photoId', async (req, res, next) => {
  try {
    await galleryService.removePhotoFromGallery(req.params.id, req.params.photoId);

    res.json({
      success: true,
      message: 'Photo removed from gallery',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/photocam/galleries/:id/reorder
 * Reorder photos in a gallery
 */
router.put('/:id/reorder', async (req, res, next) => {
  try {
    const { photoIds } = req.body;

    if (!photoIds || !Array.isArray(photoIds)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'photoIds array is required' },
      });
    }

    const result = await galleryService.reorderGalleryPhotos(req.params.id, photoIds);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/galleries/:id/share
 * Create a shareable link for a gallery
 */
router.post('/:id/share', async (req, res, next) => {
  try {
    const { expiresInDays, password } = req.body;

    const result = await galleryService.createShareLink(req.params.id, {
      expiresInDays,
      password,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photocam/galleries/:id/share
 * Revoke a gallery's share link
 */
router.delete('/:id/share', async (req, res, next) => {
  try {
    const result = await galleryService.revokeShareLink(req.params.id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/galleries/:id/live
 * Get live gallery photos (all project photos for live galleries)
 */
router.get('/:id/live', async (req, res, next) => {
  try {
    const photos = await galleryService.getLiveGalleryPhotos(req.params.id);

    if (photos === null) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Gallery not found or not a live gallery' },
      });
    }

    res.json({
      success: true,
      data: photos,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/share/:token
 * Public endpoint - Get a gallery by share token
 */
router.get('/share/:token', async (req, res, next) => {
  try {
    const { password } = req.query;

    const result = await galleryService.getGalleryByShareToken(req.params.token, password);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Gallery not found or link is invalid' },
      });
    }

    if (result.expired) {
      return res.status(410).json({
        success: false,
        error: { code: 'EXPIRED', message: 'This share link has expired' },
      });
    }

    if (result.requiresPassword) {
      return res.status(401).json({
        success: false,
        error: { code: 'PASSWORD_REQUIRED', message: 'This gallery requires a password' },
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
