// Projects Routes for Photocam
import express from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { projectService } from '../services/projectService.js';
import { logger } from '../middleware/logger.js';

const router = express.Router();

// Apply auth middleware to all routes
router.use(authMiddleware);

/**
 * POST /api/photocam/projects
 * Create a new photo project
 */
router.post('/', async (req, res, next) => {
  try {
    const project = await projectService.createProject(req.body, req.user.id);
    res.status(201).json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/projects/opportunity/:opportunityId
 * Get or create a project for an opportunity
 * NOTE: This route must be defined BEFORE /:id to avoid conflicts
 */
router.get('/opportunity/:opportunityId', async (req, res, next) => {
  try {
    const result = await projectService.getOrCreateProjectForOpportunity(
      req.params.opportunityId,
      req.user.id
    );

    res.json({
      success: true,
      data: result.project,
      created: result.created,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/projects
 * List projects with filters
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      page,
      limit,
      ownerId,
      accountId,
      opportunityId,
      workOrderId,
      type,
      status,
      search,
    } = req.query;

    const result = await projectService.getProjects(
      { ownerId, accountId, opportunityId, workOrderId, type, status, search },
      { page: parseInt(page) || 1, limit: parseInt(limit) || 20 }
    );

    res.json({
      success: true,
      data: result.projects,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/projects/:id
 * Get a project by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const includeStats = req.query.includeStats === 'true';
    const project = await projectService.getProjectById(req.params.id, includeStats);

    if (!project) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }

    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/photocam/projects/:id
 * Update a project
 */
router.put('/:id', async (req, res, next) => {
  try {
    const project = await projectService.updateProject(req.params.id, req.body, req.user.id);
    res.json({
      success: true,
      data: project,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photocam/projects/:id
 * Archive a project
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const project = await projectService.archiveProject(req.params.id, req.user.id);
    res.json({
      success: true,
      data: project,
      message: 'Project archived successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/projects/:id/restore
 * Restore an archived project
 */
router.post('/:id/restore', async (req, res, next) => {
  try {
    const project = await projectService.restoreProject(req.params.id, req.user.id);
    res.json({
      success: true,
      data: project,
      message: 'Project restored successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/projects/:id/stats
 * Get project statistics
 */
router.get('/:id/stats', async (req, res, next) => {
  try {
    const stats = await projectService.getProjectStats(req.params.id);
    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/projects/:id/collaborators
 * Add a collaborator to a project
 */
router.post('/:id/collaborators', async (req, res, next) => {
  try {
    const { userId, role } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'userId is required' },
      });
    }

    const collaborator = await projectService.addCollaborator(
      req.params.id,
      userId,
      role,
      req.user.id
    );

    res.status(201).json({
      success: true,
      data: collaborator,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photocam/projects/:id/collaborators/:userId
 * Remove a collaborator from a project
 */
router.delete('/:id/collaborators/:userId', async (req, res, next) => {
  try {
    await projectService.removeCollaborator(
      req.params.id,
      req.params.userId,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Collaborator removed successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/photocam/projects/:id/collaborators/:userId
 * Update collaborator role
 */
router.put('/:id/collaborators/:userId', async (req, res, next) => {
  try {
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'role is required' },
      });
    }

    await projectService.updateCollaboratorRole(
      req.params.id,
      req.params.userId,
      role,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Collaborator role updated',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
