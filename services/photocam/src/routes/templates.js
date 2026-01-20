// Template Routes for Photocam
import express from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { templateService } from '../services/templateService.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * POST /api/photocam/templates
 * Create a new checklist template (admin only)
 */
router.post('/', requireRole(['admin', 'super_admin', 'manager']), async (req, res, next) => {
  try {
    const template = await templateService.createTemplate(req.body, req.user.id);

    res.status(201).json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/templates
 * Get all templates (filtered by category, search, active status)
 */
router.get('/', async (req, res, next) => {
  try {
    const { category, search, isActive } = req.query;

    const templates = await templateService.getTemplates({
      category,
      search,
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/templates/categories
 * Get template categories with counts
 */
router.get('/categories', async (req, res, next) => {
  try {
    const categories = await templateService.getTemplateCategories();

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/templates/:id
 * Get a single template
 */
router.get('/:id', async (req, res, next) => {
  try {
    const template = await templateService.getTemplateById(req.params.id);

    if (!template) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Template not found' },
      });
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/photocam/templates/:id
 * Update a template (admin only)
 */
router.put('/:id', requireRole(['admin', 'super_admin', 'manager']), async (req, res, next) => {
  try {
    const template = await templateService.updateTemplate(req.params.id, req.body, req.user.id);

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photocam/templates/:id
 * Deactivate a template (admin only)
 */
router.delete('/:id', requireRole(['admin', 'super_admin', 'manager']), async (req, res, next) => {
  try {
    await templateService.deleteTemplate(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Template deactivated successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photocam/templates/:id/permanent
 * Permanently delete a template (admin only)
 */
router.delete(
  '/:id/permanent',
  requireRole(['admin', 'super_admin']),
  async (req, res, next) => {
    try {
      await templateService.permanentlyDeleteTemplate(req.params.id);

      res.json({
        success: true,
        message: 'Template permanently deleted',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/photocam/templates/:id/instantiate
 * Create a checklist from a template
 */
router.post('/:id/instantiate', async (req, res, next) => {
  try {
    const { projectId, name, description, assignedToId, dueDate } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'projectId is required' },
      });
    }

    const checklist = await templateService.instantiateTemplate(
      req.params.id,
      projectId,
      { name, description, assignedToId, dueDate },
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
 * POST /api/photocam/templates/:id/duplicate
 * Duplicate a template
 */
router.post(
  '/:id/duplicate',
  requireRole(['admin', 'super_admin', 'manager']),
  async (req, res, next) => {
    try {
      const { name } = req.body;

      const template = await templateService.duplicateTemplate(req.params.id, name, req.user.id);

      res.status(201).json({
        success: true,
        data: template,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
