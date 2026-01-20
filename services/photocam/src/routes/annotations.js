// Annotation Routes for Photocam
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { annotationService } from '../services/annotationService.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * POST /api/photocam/photos/:photoId/annotations
 * Create a new annotation on a photo
 */
router.post('/photos/:photoId/annotations', async (req, res, next) => {
  try {
    const annotation = await annotationService.createAnnotation(
      req.params.photoId,
      req.body,
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: annotation,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/photos/:photoId/annotations
 * Get all annotations for a photo
 */
router.get('/photos/:photoId/annotations', async (req, res, next) => {
  try {
    const annotations = await annotationService.getPhotoAnnotations(req.params.photoId);

    res.json({
      success: true,
      data: annotations,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/annotations/:id
 * Get a single annotation by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const annotation = await annotationService.getAnnotationById(req.params.id);

    if (!annotation) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Annotation not found' },
      });
    }

    res.json({
      success: true,
      data: annotation,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/photocam/annotations/:id
 * Update an annotation
 */
router.put('/:id', async (req, res, next) => {
  try {
    const annotation = await annotationService.updateAnnotation(
      req.params.id,
      req.body,
      req.user.id
    );

    res.json({
      success: true,
      data: annotation,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photocam/annotations/:id
 * Delete an annotation
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await annotationService.deleteAnnotation(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Annotation deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/photos/:photoId/annotations/bulk
 * Bulk create annotations on a photo
 */
router.post('/photos/:photoId/annotations/bulk', async (req, res, next) => {
  try {
    const { annotations } = req.body;

    if (!annotations || !Array.isArray(annotations)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'annotations array is required' },
      });
    }

    const result = await annotationService.bulkCreateAnnotations(
      req.params.photoId,
      annotations,
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/photos/:sourcePhotoId/annotations/copy/:targetPhotoId
 * Copy annotations from one photo to another
 */
router.post('/photos/:sourcePhotoId/annotations/copy/:targetPhotoId', async (req, res, next) => {
  try {
    const result = await annotationService.copyAnnotations(
      req.params.sourcePhotoId,
      req.params.targetPhotoId,
      req.user.id
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
