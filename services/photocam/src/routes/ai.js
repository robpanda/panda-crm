// AI Routes for Photocam
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { aiService } from '../services/aiService.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * POST /api/photocam/photos/:photoId/ai/analyze
 * Analyze a photo using AWS Rekognition
 */
router.post('/photos/:photoId/analyze', async (req, res, next) => {
  try {
    const results = await aiService.analyzePhoto(req.params.photoId);

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Photo not found' },
      });
    }
    next(error);
  }
});

/**
 * POST /api/photocam/photos/:photoId/ai/describe
 * Generate AI description for a photo
 */
router.post('/photos/:photoId/describe', async (req, res, next) => {
  try {
    const result = await aiService.generatePhotoDescription(req.params.photoId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Photo not found' },
      });
    }
    next(error);
  }
});

/**
 * POST /api/photocam/photos/:photoId/ai/extract-text
 * Extract text from a document image using Textract
 */
router.post('/photos/:photoId/extract-text', async (req, res, next) => {
  try {
    const result = await aiService.extractDocumentText(req.params.photoId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Photo not found' },
      });
    }
    next(error);
  }
});

/**
 * POST /api/photocam/photos/:photoId/ai/quality
 * Assess photo quality
 */
router.post('/photos/:photoId/quality', async (req, res, next) => {
  try {
    const result = await aiService.assessPhotoQuality(req.params.photoId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Photo not found' },
      });
    }
    next(error);
  }
});

/**
 * POST /api/photocam/projects/:projectId/ai/report
 * Generate AI inspection report for a project
 */
router.post('/projects/:projectId/report', async (req, res, next) => {
  try {
    const { customInstructions } = req.body;

    const result = await aiService.generateInspectionReport(req.params.projectId, {
      customInstructions,
      userId: req.user.id,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }
    next(error);
  }
});

/**
 * POST /api/photocam/projects/:projectId/ai/daily-log
 * Generate daily work log from photos
 */
router.post('/projects/:projectId/daily-log', async (req, res, next) => {
  try {
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Date is required' },
      });
    }

    const result = await aiService.generateDailyLog(
      req.params.projectId,
      date,
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

/**
 * POST /api/photocam/projects/:projectId/ai/checklist-from-voice
 * Generate checklist from voice transcription
 */
router.post('/projects/:projectId/checklist-from-voice', async (req, res, next) => {
  try {
    const { transcript } = req.body;

    if (!transcript) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Transcript is required' },
      });
    }

    const result = await aiService.generateChecklistFromVoice(
      req.params.projectId,
      transcript,
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

/**
 * POST /api/photocam/ai/batch-analyze
 * Batch analyze multiple photos
 */
router.post('/batch-analyze', async (req, res, next) => {
  try {
    const { photoIds } = req.body;

    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'photoIds array is required' },
      });
    }

    // Limit batch size
    if (photoIds.length > 20) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Maximum 20 photos per batch' },
      });
    }

    const results = await Promise.allSettled(
      photoIds.map((photoId) => aiService.analyzePhoto(photoId))
    );

    const processed = results.map((result, index) => ({
      photoId: photoIds[index],
      success: result.status === 'fulfilled',
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason.message : null,
    }));

    res.json({
      success: true,
      data: {
        total: photoIds.length,
        successful: processed.filter((p) => p.success).length,
        failed: processed.filter((p) => !p.success).length,
        results: processed,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
