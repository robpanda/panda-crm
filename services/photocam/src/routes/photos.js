// Photos Routes for Photocam
import express from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { photoService } from '../services/photoService.js';
import { logger } from '../middleware/logger.js';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 20, // Max 20 files at once
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * POST /api/photocam/photos/upload
 * Upload a single photo
 */
router.post('/upload', upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No photo file provided' },
      });
    }

    const { projectId, type, caption, tags } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'projectId is required' },
      });
    }

    const photo = await photoService.uploadPhoto(
      projectId,
      req.file,
      { type, caption, tags: tags ? JSON.parse(tags) : [] },
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: photo,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/photos/upload-multiple
 * Upload multiple photos
 */
router.post('/upload-multiple', upload.array('photos', 20), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No photo files provided' },
      });
    }

    const { projectId, type, tags } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'projectId is required' },
      });
    }

    const result = await photoService.uploadMultiplePhotos(
      projectId,
      req.files,
      { type, tags: tags ? JSON.parse(tags) : [] },
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: {
        uploaded: result.uploaded,
        errors: result.errors,
        totalUploaded: result.uploaded.length,
        totalErrors: result.errors.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/photos/:id
 * Get a photo by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const photo = await photoService.getPhotoById(req.params.id);

    if (!photo) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Photo not found' },
      });
    }

    res.json({
      success: true,
      data: photo,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/photocam/photos/:id
 * Update a photo
 */
router.put('/:id', async (req, res, next) => {
  try {
    const photo = await photoService.updatePhoto(req.params.id, req.body, req.user.id);
    res.json({
      success: true,
      data: photo,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photocam/photos/:id
 * Soft delete a photo
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await photoService.deletePhoto(req.params.id, req.user.id);
    res.json({
      success: true,
      message: 'Photo deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/photos/:id/download
 * Get presigned download URL
 */
router.get('/:id/download', async (req, res, next) => {
  try {
    const variant = req.query.variant || 'original';
    const url = await photoService.getPhotoDownloadUrl(req.params.id, variant);

    res.json({
      success: true,
      data: { url, variant },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/projects/:projectId/photos
 * Get photos for a project
 */
router.get('/project/:projectId', async (req, res, next) => {
  try {
    const { page, limit, type, search, hasGps, dateFrom, dateTo } = req.query;

    const result = await photoService.getProjectPhotos(
      req.params.projectId,
      { type, search, hasGps: hasGps === 'true' ? true : hasGps === 'false' ? false : undefined, dateFrom, dateTo },
      { page: parseInt(page) || 1, limit: parseInt(limit) || 50 }
    );

    res.json({
      success: true,
      data: result.photos,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
