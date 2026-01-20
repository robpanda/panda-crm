// Webhooks Routes for Photocam
// Handles callbacks from Lambda functions and external services

import express from 'express';
import { photoService } from '../services/photoService.js';
import { prisma } from '../index.js';
import { logger } from '../middleware/logger.js';

const router = express.Router();

// Validate Lambda secret for security
const validateLambdaSecret = (req, res, next) => {
  const secret = req.headers['x-lambda-secret'];
  const expectedSecret = process.env.LAMBDA_SECRET;

  if (!expectedSecret) {
    // If no secret configured, allow for development
    logger.warn('LAMBDA_SECRET not configured - allowing request');
    return next();
  }

  if (secret !== expectedSecret) {
    logger.warn('Invalid Lambda secret provided');
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid Lambda secret' },
    });
  }

  next();
};

// Apply Lambda auth to all routes
router.use(validateLambdaSecret);

/**
 * POST /api/photocam/webhooks/photos/:photoId/processing-complete
 * Called by image-processor Lambda when processing is complete
 */
router.post('/photos/:photoId/processing-complete', async (req, res, next) => {
  try {
    const { photoId } = req.params;
    const {
      displayUrl,
      thumbnailUrl,
      metadata,
      processedAt,
    } = req.body;

    logger.info(`Processing complete for photo ${photoId}`);

    // Update photo record
    const photo = await prisma.photo.update({
      where: { id: photoId },
      data: {
        displayUrl,
        thumbnailUrl,
        metadata: metadata ? JSON.stringify(metadata) : undefined,
        processedAt: processedAt ? new Date(processedAt) : new Date(),
        status: 'PROCESSED',
      },
    });

    res.json({
      success: true,
      data: { photoId, status: 'updated' },
    });
  } catch (error) {
    logger.error(`Error updating photo processing status: ${error.message}`);
    next(error);
  }
});

/**
 * POST /api/photocam/webhooks/photos/:photoId/ai-analysis
 * Called by ai-analyzer Lambda when AI analysis is complete
 */
router.post('/photos/:photoId/ai-analysis', async (req, res, next) => {
  try {
    const { photoId } = req.params;
    const {
      aiLabels,
      detectedText,
      suggestedCategory,
      suggestedTags,
      aiProcessedAt,
    } = req.body;

    logger.info(`AI analysis complete for photo ${photoId}`);

    // Update photo with AI analysis results
    const photo = await prisma.photo.update({
      where: { id: photoId },
      data: {
        aiLabels: aiLabels ? JSON.stringify(aiLabels) : undefined,
        detectedText: detectedText || [],
        suggestedCategory,
        // Merge suggested tags with existing tags
        tags: {
          push: suggestedTags || [],
        },
        aiProcessedAt: aiProcessedAt ? new Date(aiProcessedAt) : new Date(),
      },
    });

    // If category was suggested and photo has no category, update it
    if (suggestedCategory && !photo.type) {
      await prisma.photo.update({
        where: { id: photoId },
        data: { type: suggestedCategory },
      });
    }

    res.json({
      success: true,
      data: { photoId, status: 'ai_analysis_complete' },
    });
  } catch (error) {
    logger.error(`Error updating photo AI analysis: ${error.message}`);
    next(error);
  }
});

/**
 * POST /api/photocam/webhooks/comparisons/:comparisonId/generation-complete
 * Called by comparison-generator Lambda when generation is complete
 */
router.post('/comparisons/:comparisonId/generation-complete', async (req, res, next) => {
  try {
    const { comparisonId } = req.params;
    const {
      layout,
      imageUrl,
      generatedAt,
    } = req.body;

    logger.info(`Comparison generation complete for ${comparisonId}, layout: ${layout}`);

    // Update comparison record
    const comparison = await prisma.beforeAfterComparison.update({
      where: { id: comparisonId },
      data: {
        generatedImageUrl: imageUrl,
        layout: layout || 'SIDE_BY_SIDE',
        generatedAt: generatedAt ? new Date(generatedAt) : new Date(),
        status: 'GENERATED',
      },
    });

    res.json({
      success: true,
      data: { comparisonId, status: 'generated' },
    });
  } catch (error) {
    logger.error(`Error updating comparison generation status: ${error.message}`);
    next(error);
  }
});

/**
 * POST /api/photocam/webhooks/s3-event
 * Handles S3 event notifications (for when not using direct Lambda trigger)
 */
router.post('/s3-event', async (req, res, next) => {
  try {
    const { Records } = req.body;

    if (!Records || !Array.isArray(Records)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PAYLOAD', message: 'Invalid S3 event format' },
      });
    }

    const results = [];

    for (const record of Records) {
      const { eventName, s3 } = record;

      if (!s3 || !s3.object) continue;

      const key = decodeURIComponent(s3.object.key.replace(/\+/g, ' '));
      const bucket = s3.bucket.name;

      logger.info(`S3 event: ${eventName} on ${bucket}/${key}`);

      // Only process PUT events in originals folder
      if (eventName.startsWith('ObjectCreated') && key.includes('/originals/')) {
        // Parse the key to get projectId, photoId
        const keyParts = key.split('/');
        const projectId = keyParts[0];
        const photoId = keyParts[2];

        results.push({
          key,
          projectId,
          photoId,
          action: 'queued_for_processing',
        });

        // Could trigger async processing here or rely on direct Lambda trigger
      }
    }

    res.json({
      success: true,
      data: { processed: results.length, results },
    });
  } catch (error) {
    logger.error(`Error processing S3 event: ${error.message}`);
    next(error);
  }
});

export default router;
