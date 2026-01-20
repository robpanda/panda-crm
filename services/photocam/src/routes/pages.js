// Page Routes for Photocam (Notebook-style pages)
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { pageService } from '../services/pageService.js';

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
 * POST /api/photocam/projects/:projectId/pages
 * Create a new page for a project
 */
router.post('/projects/:projectId/pages', async (req, res, next) => {
  try {
    const page = await pageService.createPage(req.params.projectId, req.body, req.user.id);

    res.status(201).json({
      success: true,
      data: page,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/projects/:projectId/pages
 * Get all pages for a project
 */
router.get('/projects/:projectId/pages', async (req, res, next) => {
  try {
    const { pageType } = req.query;

    const pages = await pageService.getProjectPages(req.params.projectId, { pageType });

    res.json({
      success: true,
      data: pages,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/projects/:projectId/pages/search
 * Search pages by content
 */
router.get('/projects/:projectId/pages/search', async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Search query (q) is required' },
      });
    }

    const pages = await pageService.searchPages(req.params.projectId, q);

    res.json({
      success: true,
      data: pages,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/pages/:id
 * Get a single page
 */
router.get('/:id', async (req, res, next) => {
  try {
    const page = await pageService.getPageById(req.params.id);

    if (!page) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Page not found' },
      });
    }

    res.json({
      success: true,
      data: page,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/photocam/pages/:id
 * Update a page
 */
router.put('/:id', async (req, res, next) => {
  try {
    const page = await pageService.updatePage(req.params.id, req.body, req.user.id);

    res.json({
      success: true,
      data: page,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photocam/pages/:id
 * Delete a page
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await pageService.deletePage(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Page deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/pages/:id/duplicate
 * Duplicate a page
 */
router.post('/:id/duplicate', async (req, res, next) => {
  try {
    const page = await pageService.duplicatePage(req.params.id, req.user.id);

    res.status(201).json({
      success: true,
      data: page,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/photocam/projects/:projectId/pages/reorder
 * Reorder pages in a project
 */
router.put('/projects/:projectId/pages/reorder', async (req, res, next) => {
  try {
    const { pageIds } = req.body;

    if (!pageIds || !Array.isArray(pageIds)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'pageIds array is required' },
      });
    }

    const result = await pageService.reorderPages(req.params.projectId, pageIds);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/pages/:id/share
 * Create a shareable link for a page
 */
router.post('/:id/share', async (req, res, next) => {
  try {
    const { expiresInDays } = req.body;

    const result = await pageService.createPageShareLink(req.params.id, {
      expiresInDays,
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
 * DELETE /api/photocam/pages/:id/share
 * Revoke a page's share link
 */
router.delete('/:id/share', async (req, res, next) => {
  try {
    const result = await pageService.revokePageShareLink(req.params.id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/pages/:id/export
 * Export page data (for PDF generation)
 */
router.get('/:id/export', async (req, res, next) => {
  try {
    const exportData = await pageService.exportPageData(req.params.id);

    res.json({
      success: true,
      data: exportData,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/share/page/:token
 * Public endpoint - Get a page by share token
 */
router.get('/share/page/:token', async (req, res, next) => {
  try {
    const result = await pageService.getPageByShareToken(req.params.token);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Page not found or link is invalid' },
      });
    }

    if (result.expired) {
      return res.status(410).json({
        success: false,
        error: { code: 'EXPIRED', message: 'This share link has expired' },
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
