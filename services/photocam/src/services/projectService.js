// Project Service for Photocam
// Handles PhotoProject CRUD and related operations
import prisma from '../prisma.js';
import { logger } from '../middleware/logger.js';

/**
 * Create a new photo project
 */
export async function createProject(data, userId) {
  try {
    // Validate userId exists in users table before setting ownerId
    // This prevents foreign key constraint errors when userId is a Cognito UUID
    let validatedOwnerId = null;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (user) {
        validatedOwnerId = user.id;
      } else {
        logger.warn(`User not found for ID: ${userId}, setting ownerId to null`);
      }
    }

    const project = await prisma.photoProject.create({
      data: {
        name: data.name,
        description: data.description,
        projectType: data.type || 'JOB',
        status: 'ACTIVE',
        street: data.address || data.street,
        city: data.city,
        state: data.state,
        postalCode: data.zipCode || data.postalCode,
        latitude: data.latitude ? parseFloat(data.latitude) : null,
        longitude: data.longitude ? parseFloat(data.longitude) : null,
        tags: data.tags || [],
        metadata: data.settings || data.metadata || {},
        ownerId: validatedOwnerId,
        accountId: data.accountId || null,
        opportunityId: data.opportunityId || null,
        workOrderId: data.workOrderId || null,
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        account: {
          select: { id: true, name: true },
        },
        opportunity: {
          select: { id: true, name: true, jobId: true },
        },
      },
    });

    // Create activity log
    await createProjectActivity(project.id, userId, 'PROJECT_CREATED', { name: project.name });

    return project;
  } catch (error) {
    logger.error('Create project error:', error);
    throw error;
  }
}

/**
 * Get a project by ID with full details
 */
export async function getProjectById(projectId, includeStats = false) {
  try {
    const project = await prisma.photoProject.findUnique({
      where: { id: projectId },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        account: {
          select: { id: true, name: true },
        },
        opportunity: {
          select: { id: true, name: true, jobId: true, stageName: true },
        },
        workOrder: {
          select: { id: true, workOrderNumber: true, status: true },
        },
        collaborators: {
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
        _count: {
          select: {
            photos: true,
            checklists: true,
            comparisons: true,
            pages: true,
            galleries: true,
          },
        },
      },
    });

    if (!project) {
      return null;
    }

    if (includeStats) {
      // Get additional stats
      const stats = await getProjectStats(projectId);
      return { ...project, stats };
    }

    return project;
  } catch (error) {
    logger.error('Get project error:', error);
    throw error;
  }
}

/**
 * Get projects with filtering and pagination
 */
export async function getProjects(filters = {}, pagination = {}) {
  try {
    const {
      ownerId,
      accountId,
      opportunityId,
      workOrderId,
      type,
      status,
      search,
    } = filters;

    const { page = 1, limit = 20 } = pagination;
    const skip = (page - 1) * limit;

    const where = {
      archivedDate: null, // Exclude archived projects by default
    };

    if (ownerId) where.ownerId = ownerId;
    if (accountId) where.accountId = accountId;
    if (opportunityId) where.opportunityId = opportunityId;
    if (workOrderId) where.workOrderId = workOrderId;
    if (type) where.projectType = type;
    if (status) where.status = status;

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { street: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [projects, total] = await Promise.all([
      prisma.photoProject.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: {
            select: { id: true, firstName: true, lastName: true },
          },
          opportunity: {
            select: { id: true, name: true, jobId: true },
          },
          _count: {
            select: { photos: true },
          },
        },
      }),
      prisma.photoProject.count({ where }),
    ]);

    return {
      projects,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  } catch (error) {
    logger.error('Get projects error:', error);
    throw error;
  }
}

/**
 * Update a project
 */
export async function updateProject(projectId, data, userId) {
  try {
    const existing = await prisma.photoProject.findUnique({
      where: { id: projectId },
    });

    if (!existing) {
      throw new Error('Project not found');
    }

    const updated = await prisma.photoProject.update({
      where: { id: projectId },
      data: {
        name: data.name ?? existing.name,
        description: data.description ?? existing.description,
        projectType: data.type ?? existing.projectType,
        status: data.status ?? existing.status,
        street: data.address ?? data.street ?? existing.street,
        city: data.city ?? existing.city,
        state: data.state ?? existing.state,
        postalCode: data.zipCode ?? data.postalCode ?? existing.postalCode,
        latitude: data.latitude !== undefined ? parseFloat(data.latitude) : existing.latitude,
        longitude: data.longitude !== undefined ? parseFloat(data.longitude) : existing.longitude,
        tags: data.tags ?? existing.tags,
        metadata: data.settings ?? data.metadata ?? existing.metadata,
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Log activity
    await createProjectActivity(projectId, userId, 'PROJECT_UPDATED', {
      changes: Object.keys(data),
    });

    return updated;
  } catch (error) {
    logger.error('Update project error:', error);
    throw error;
  }
}

/**
 * Archive a project (soft delete)
 */
export async function archiveProject(projectId, userId) {
  try {
    const project = await prisma.photoProject.update({
      where: { id: projectId },
      data: {
        status: 'ARCHIVED',
        archivedDate: new Date(),
        archivedById: userId,
      },
    });

    await createProjectActivity(projectId, userId, 'PROJECT_ARCHIVED', {});

    return project;
  } catch (error) {
    logger.error('Archive project error:', error);
    throw error;
  }
}

/**
 * Restore an archived project
 */
export async function restoreProject(projectId, userId) {
  try {
    const project = await prisma.photoProject.update({
      where: { id: projectId },
      data: {
        status: 'ACTIVE',
        archivedDate: null,
        archivedById: null,
      },
    });

    await createProjectActivity(projectId, userId, 'PROJECT_RESTORED', {});

    return project;
  } catch (error) {
    logger.error('Restore project error:', error);
    throw error;
  }
}

/**
 * Get or create a project for an opportunity
 */
export async function getOrCreateProjectForOpportunity(opportunityId, userId) {
  try {
    // Check if project exists
    let project = await prisma.photoProject.findFirst({
      where: { opportunityId },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { photos: true },
        },
      },
    });

    if (project) {
      return { project, created: false };
    }

    // Get opportunity details to create project
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        account: true,
      },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    // Create project from opportunity
    project = await createProject({
      name: opportunity.name || `Project for ${opportunity.jobId}`,
      type: 'JOB',
      address: opportunity.account?.billingStreet,
      city: opportunity.account?.billingCity,
      state: opportunity.account?.billingState,
      zipCode: opportunity.account?.billingPostalCode,
      accountId: opportunity.accountId,
      opportunityId: opportunity.id,
    }, userId);

    return { project, created: true };
  } catch (error) {
    logger.error('Get/create project error:', error);
    throw error;
  }
}

/**
 * Add a collaborator to a project
 */
export async function addCollaborator(projectId, userId, role, invitedById) {
  try {
    const collaborator = await prisma.projectCollaborator.create({
      data: {
        projectId,
        userId,
        role: role || 'VIEWER',
        invitedById,
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    await createProjectActivity(projectId, invitedById, 'COLLABORATOR_ADDED', {
      userId,
      role,
    });

    return collaborator;
  } catch (error) {
    logger.error('Add collaborator error:', error);
    throw error;
  }
}

/**
 * Remove a collaborator from a project
 */
export async function removeCollaborator(projectId, userId, removedById) {
  try {
    await prisma.projectCollaborator.deleteMany({
      where: { projectId, userId },
    });

    await createProjectActivity(projectId, removedById, 'COLLABORATOR_REMOVED', {
      userId,
    });

    return true;
  } catch (error) {
    logger.error('Remove collaborator error:', error);
    throw error;
  }
}

/**
 * Update collaborator role
 */
export async function updateCollaboratorRole(projectId, userId, newRole, updatedById) {
  try {
    const collaborator = await prisma.projectCollaborator.updateMany({
      where: { projectId, userId },
      data: { role: newRole },
    });

    await createProjectActivity(projectId, updatedById, 'COLLABORATOR_ROLE_CHANGED', {
      userId,
      newRole,
    });

    return collaborator;
  } catch (error) {
    logger.error('Update collaborator role error:', error);
    throw error;
  }
}

/**
 * Get project stats
 */
export async function getProjectStats(projectId) {
  try {
    const [
      photoStats,
      checklistStats,
      comparisonCount,
      pageCount,
      galleryCount,
      recentActivity,
    ] = await Promise.all([
      prisma.photo.groupBy({
        by: ['type'],
        where: { projectId, deletedAt: null },
        _count: true,
      }),
      prisma.photoChecklist.groupBy({
        by: ['status'],
        where: { projectId },
        _count: true,
      }),
      prisma.beforeAfterComparison.count({
        where: { projectId },
      }),
      prisma.photoPage.count({
        where: { projectId },
      }),
      prisma.photoGallery.count({
        where: { projectId },
      }),
      prisma.photoProjectActivity.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
    ]);

    return {
      photos: {
        total: photoStats.reduce((sum, s) => sum + s._count, 0),
        byType: photoStats.reduce((acc, s) => ({ ...acc, [s.type]: s._count }), {}),
      },
      checklists: {
        total: checklistStats.reduce((sum, s) => sum + s._count, 0),
        byStatus: checklistStats.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
      },
      comparisons: comparisonCount,
      pages: pageCount,
      galleries: galleryCount,
      recentActivity,
    };
  } catch (error) {
    logger.error('Get project stats error:', error);
    throw error;
  }
}

/**
 * Create a project activity log entry
 */
export async function createProjectActivity(projectId, userId, activityType, metadata = {}) {
  try {
    // Validate userId exists in users table before setting
    // This prevents foreign key constraint errors when userId is a Cognito UUID
    let validatedUserId = null;
    if (userId) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (user) {
        validatedUserId = user.id;
      }
    }

    // Generate a title based on activity type
    const titleMap = {
      'PROJECT_CREATED': 'Project Created',
      'PROJECT_UPDATED': 'Project Updated',
      'PROJECT_ARCHIVED': 'Project Archived',
      'PROJECT_RESTORED': 'Project Restored',
      'COLLABORATOR_ADDED': 'Collaborator Added',
      'COLLABORATOR_REMOVED': 'Collaborator Removed',
      'COLLABORATOR_ROLE_CHANGED': 'Collaborator Role Changed',
      'PHOTO_ADDED': 'Photo Added',
      'PHOTO_DELETED': 'Photo Deleted',
      'CHECKLIST_CREATED': 'Checklist Created',
      'CHECKLIST_COMPLETED': 'Checklist Completed',
    };
    const title = titleMap[activityType] || activityType;

    const activity = await prisma.photoProjectActivity.create({
      data: {
        projectId,
        userId: validatedUserId,
        activityType,
        title,
        metadata,
      },
    });

    return activity;
  } catch (error) {
    logger.error('Create activity error:', error);
    // Don't throw - activity logging shouldn't fail the main operation
    return null;
  }
}

export const projectService = {
  createProject,
  getProjectById,
  getProjects,
  updateProject,
  archiveProject,
  restoreProject,
  getOrCreateProjectForOpportunity,
  addCollaborator,
  removeCollaborator,
  updateCollaboratorRole,
  getProjectStats,
  createProjectActivity,
};

export default projectService;
