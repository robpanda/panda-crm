// Checklist Routes for Photocam
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { checklistService } from '../services/checklistService.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * POST /api/photocam/projects/:projectId/checklists
 * Create a new checklist for a project
 */
router.post('/projects/:projectId/checklists', async (req, res, next) => {
  try {
    const checklist = await checklistService.createChecklist(
      req.params.projectId,
      req.body,
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: checklist,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/projects/:projectId/checklists
 * Get all checklists for a project
 */
router.get('/projects/:projectId/checklists', async (req, res, next) => {
  try {
    const { status, assignedToId } = req.query;

    const checklists = await checklistService.getProjectChecklists(req.params.projectId, {
      status,
      assignedToId,
    });

    res.json({
      success: true,
      data: checklists,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/checklists/:id
 * Get a single checklist with all sections and items
 */
router.get('/:id', async (req, res, next) => {
  try {
    const checklist = await checklistService.getChecklistById(req.params.id);

    if (!checklist) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Checklist not found' },
      });
    }

    res.json({
      success: true,
      data: checklist,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/photocam/checklists/:id
 * Update a checklist
 */
router.put('/:id', async (req, res, next) => {
  try {
    const checklist = await checklistService.updateChecklist(req.params.id, req.body, req.user.id);

    res.json({
      success: true,
      data: checklist,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photocam/checklists/:id
 * Delete a checklist
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await checklistService.deleteChecklist(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Checklist deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/checklists/:id/sections
 * Add a section to a checklist
 */
router.post('/:id/sections', async (req, res, next) => {
  try {
    const section = await checklistService.createSection(req.params.id, req.body, req.user.id);

    res.status(201).json({
      success: true,
      data: section,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/checklists/:checklistId/sections/:sectionId/items
 * Add an item to a section
 */
router.post('/:checklistId/sections/:sectionId/items', async (req, res, next) => {
  try {
    const item = await checklistService.createItem(req.params.sectionId, req.body, req.user.id);

    res.status(201).json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/photocam/checklists/:checklistId/items/:itemId
 * Update a checklist item (complete, add notes, etc.)
 */
router.put('/:checklistId/items/:itemId', async (req, res, next) => {
  try {
    const item = await checklistService.updateItem(req.params.itemId, req.body, req.user.id);

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/checklists/:checklistId/items/:itemId/photos
 * Attach a photo to a checklist item
 */
router.post('/:checklistId/items/:itemId/photos', async (req, res, next) => {
  try {
    const { photoId } = req.body;

    if (!photoId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'photoId is required' },
      });
    }

    const attachment = await checklistService.attachPhotoToItem(
      req.params.itemId,
      photoId,
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: attachment,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photocam/checklists/:checklistId/items/:itemId/photos/:photoId
 * Remove a photo from a checklist item
 */
router.delete('/:checklistId/items/:itemId/photos/:photoId', async (req, res, next) => {
  try {
    await checklistService.removePhotoFromItem(req.params.itemId, req.params.photoId);

    res.json({
      success: true,
      message: 'Photo removed from checklist item',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
