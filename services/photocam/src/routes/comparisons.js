// Before/After Comparison Routes for Photocam
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { comparisonService } from '../services/comparisonService.js';

const router = express.Router();

// Apply auth middleware to all routes except public share endpoint
router.use((req, res, next) => {
  // Allow public access to share endpoint
  if (req.path.startsWith('/share/')) {
    return next();
  }
  return authMiddleware(req, res, next);
});

/**
 * POST /api/photocam/projects/:projectId/comparisons
 * Create a new before/after comparison
 */
router.post('/projects/:projectId/comparisons', async (req, res, next) => {
  try {
    const comparison = await comparisonService.createComparison(
      req.params.projectId,
      req.body,
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/projects/:projectId/comparisons
 * Get all comparisons for a project
 */
router.get('/projects/:projectId/comparisons', async (req, res, next) => {
  try {
    const comparisons = await comparisonService.getProjectComparisons(req.params.projectId);

    res.json({
      success: true,
      data: comparisons,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/comparisons/:id
 * Get a single comparison
 */
router.get('/:id', async (req, res, next) => {
  try {
    const comparison = await comparisonService.getComparisonById(req.params.id);

    if (!comparison) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Comparison not found' },
      });
    }

    res.json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/photocam/comparisons/:id
 * Update a comparison
 */
router.put('/:id', async (req, res, next) => {
  try {
    const comparison = await comparisonService.updateComparison(
      req.params.id,
      req.body,
      req.user.id
    );

    res.json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photocam/comparisons/:id
 * Delete a comparison
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await comparisonService.deleteComparison(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Comparison deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/comparisons/:id/generate
 * Generate a composite image for the comparison
 */
router.post('/:id/generate', async (req, res, next) => {
  try {
    const { width, height, addLabels, beforeLabel, afterLabel } = req.body;

    const result = await comparisonService.generateComparisonImage(req.params.id, {
      width,
      height,
      addLabels,
      beforeLabel,
      afterLabel,
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
 * POST /api/photocam/comparisons/:id/share
 * Create or get a shareable link for the comparison
 */
router.post('/:id/share', async (req, res, next) => {
  try {
    const { expiresInDays } = req.body;

    const result = await comparisonService.createShareLink(req.params.id, { expiresInDays });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/comparisons/share/:token
 * Get a comparison by share token (public access)
 */
router.get('/share/:token', async (req, res, next) => {
  try {
    const comparison = await comparisonService.getComparisonByShareToken(req.params.token);

    if (!comparison) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Comparison not found or link has expired' },
      });
    }

    res.json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
