// CompanyCam Service - Photo documentation integration
import { PrismaClient } from '@prisma/client';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });

// CompanyCam API Base URL
const COMPANYCAM_API = 'https://api.companycam.com/v2';

// Cached credentials
let companyCamToken = null;

/**
 * Get CompanyCam API token from AWS Secrets Manager
 */
async function getCompanyCamToken() {
  if (companyCamToken) return companyCamToken;

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'companycam/api-token' })
    );
    const secret = JSON.parse(response.SecretString);
    companyCamToken = secret.api_token;
    return companyCamToken;
  } catch (error) {
    logger.error('Failed to get CompanyCam token:', error);
    throw new Error('Unable to retrieve CompanyCam credentials');
  }
}

/**
 * Make authenticated request to CompanyCam API
 */
async function companyCamRequest(endpoint, options = {}) {
  const token = await getCompanyCamToken();

  const response = await fetch(`${COMPANYCAM_API}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    logger.error(`CompanyCam API error: ${response.status} - ${error}`);
    throw new Error(`CompanyCam API error: ${response.status}`);
  }

  return response.json();
}

/**
 * CompanyCam Service - Photo documentation for projects
 */
export const companyCamService = {
  /**
   * Get all projects from CompanyCam
   */
  async getProjects(options = {}) {
    const { page = 1, perPage = 50, search, status } = options;

    let endpoint = `/projects?page=${page}&per_page=${perPage}`;
    if (search) endpoint += `&search=${encodeURIComponent(search)}`;
    if (status) endpoint += `&status=${status}`;

    const result = await companyCamRequest(endpoint);

    return {
      projects: result.projects || result,
      pagination: {
        page,
        perPage,
        total: result.total_entries || result.length,
      },
    };
  },

  /**
   * Get single project by ID
   */
  async getProject(projectId) {
    return companyCamRequest(`/projects/${projectId}`);
  },

  /**
   * Create a new project in CompanyCam
   */
  async createProject({
    name,
    address,
    opportunityId,
    coordinates,
  }) {
    logger.info(`Creating CompanyCam project: ${name}`);

    const projectData = {
      name,
      address: {
        street_address_1: address.street,
        street_address_2: address.street2,
        city: address.city,
        state: address.state,
        postal_code: address.postalCode,
        country: address.country || 'US',
      },
      coordinates: coordinates ? {
        lat: coordinates.latitude,
        lon: coordinates.longitude,
      } : undefined,
      external_id: opportunityId,
    };

    const project = await companyCamRequest('/projects', {
      method: 'POST',
      body: JSON.stringify(projectData),
    });

    // Create local record
    const localProject = await prisma.companyCamProject.create({
      data: {
        companyCamId: project.id,
        name: project.name,
        address: projectData.address,
        opportunityId,
        status: project.status || 'active',
        syncStatus: 'SYNCED',
        lastSyncedAt: new Date(),
      },
    });

    logger.info(`CompanyCam project created: ${project.id}`);

    return {
      ...project,
      localId: localProject.id,
    };
  },

  /**
   * Update a project in CompanyCam
   */
  async updateProject(projectId, updates) {
    const project = await companyCamRequest(`/projects/${projectId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });

    // Update local record
    await prisma.companyCamProject.updateMany({
      where: { companyCamId: projectId },
      data: {
        name: project.name,
        status: project.status,
        lastSyncedAt: new Date(),
      },
    });

    return project;
  },

  /**
   * Get photos for a project
   */
  async getProjectPhotos(projectId, options = {}) {
    const { page = 1, perPage = 50, tag, startDate, endDate } = options;

    let endpoint = `/projects/${projectId}/photos?page=${page}&per_page=${perPage}`;
    if (tag) endpoint += `&tag=${encodeURIComponent(tag)}`;
    if (startDate) endpoint += `&created_at_min=${startDate}`;
    if (endDate) endpoint += `&created_at_max=${endDate}`;

    const result = await companyCamRequest(endpoint);

    // Update local photo count
    const totalPhotos = result.total_entries || result.length;
    await prisma.companyCamProject.updateMany({
      where: { companyCamId: projectId },
      data: { photoCount: totalPhotos },
    });

    return {
      photos: result.photos || result,
      pagination: {
        page,
        perPage,
        total: totalPhotos,
      },
    };
  },

  /**
   * Get a single photo
   */
  async getPhoto(photoId) {
    return companyCamRequest(`/photos/${photoId}`);
  },

  /**
   * Add a tag to a photo
   */
  async addPhotoTag(photoId, tag) {
    return companyCamRequest(`/photos/${photoId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    });
  },

  /**
   * Get all tags for a project
   */
  async getProjectTags(projectId) {
    return companyCamRequest(`/projects/${projectId}/tags`);
  },

  /**
   * Get project comments
   */
  async getProjectComments(projectId, page = 1, perPage = 50) {
    return companyCamRequest(`/projects/${projectId}/comments?page=${page}&per_page=${perPage}`);
  },

  /**
   * Add comment to project
   */
  async addProjectComment(projectId, content, userId) {
    return companyCamRequest(`/projects/${projectId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  /**
   * Get users from CompanyCam
   */
  async getUsers() {
    return companyCamRequest('/users');
  },

  /**
   * Sync project photos to local database
   */
  async syncProjectPhotos(projectId) {
    logger.info(`Syncing photos for project: ${projectId}`);

    const localProject = await prisma.companyCamProject.findFirst({
      where: { companyCamId: projectId },
    });

    if (!localProject) {
      throw new Error('Project not found in local database');
    }

    // Get all photos from CompanyCam
    let allPhotos = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await this.getProjectPhotos(projectId, { page, perPage: 100 });
      allPhotos = allPhotos.concat(result.photos);
      hasMore = result.photos.length === 100;
      page++;
    }

    // Sync photos to local database
    for (const photo of allPhotos) {
      await prisma.companyCamPhoto.upsert({
        where: { companyCamId: photo.id },
        create: {
          companyCamId: photo.id,
          projectId: localProject.id,
          photoUrl: photo.uris?.original || photo.photo_url,
          thumbnailUrl: photo.uris?.thumbnail || photo.thumbnail_url,
          takenAt: photo.created_at ? new Date(photo.created_at) : null,
          latitude: photo.coordinates?.lat,
          longitude: photo.coordinates?.lon,
          tags: photo.tags || [],
          caption: photo.caption,
          uploadedBy: photo.creator?.name,
        },
        update: {
          photoUrl: photo.uris?.original || photo.photo_url,
          thumbnailUrl: photo.uris?.thumbnail || photo.thumbnail_url,
          tags: photo.tags || [],
          caption: photo.caption,
        },
      });
    }

    // Update sync status
    await prisma.companyCamProject.update({
      where: { id: localProject.id },
      data: {
        photoCount: allPhotos.length,
        syncStatus: 'SYNCED',
        lastSyncedAt: new Date(),
      },
    });

    logger.info(`Synced ${allPhotos.length} photos for project ${projectId}`);

    return { synced: allPhotos.length };
  },

  /**
   * Link CompanyCam project to Opportunity
   */
  async linkToOpportunity(companyCamId, opportunityId) {
    // Check if opportunity exists
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    // Update or create local project record
    const localProject = await prisma.companyCamProject.upsert({
      where: { companyCamId },
      create: {
        companyCamId,
        opportunityId,
        syncStatus: 'PENDING',
      },
      update: {
        opportunityId,
      },
    });

    // Sync project data
    try {
      const project = await this.getProject(companyCamId);
      await prisma.companyCamProject.update({
        where: { id: localProject.id },
        data: {
          name: project.name,
          address: project.address,
          status: project.status,
          syncStatus: 'SYNCED',
          lastSyncedAt: new Date(),
        },
      });
    } catch (error) {
      logger.error('Failed to sync project data:', error);
    }

    return localProject;
  },

  /**
   * Get local projects (with Opportunity links)
   */
  async getLocalProjects(filters = {}) {
    const where = {};

    if (filters.opportunityId) where.opportunityId = filters.opportunityId;
    if (filters.syncStatus) where.syncStatus = filters.syncStatus;

    return prisma.companyCamProject.findMany({
      where,
      include: {
        opportunity: {
          select: { id: true, name: true, stage: true },
        },
        photos: {
          take: 5,
          orderBy: { takenAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Get photos for opportunity
   */
  async getOpportunityPhotos(opportunityId) {
    const project = await prisma.companyCamProject.findFirst({
      where: { opportunityId },
      include: {
        photos: {
          orderBy: { takenAt: 'desc' },
        },
      },
    });

    if (!project) {
      return { photos: [], project: null };
    }

    return {
      project,
      photos: project.photos,
    };
  },

  /**
   * Search CompanyCam projects by address
   */
  async searchByAddress(address) {
    const result = await this.getProjects({ search: address });
    return result.projects;
  },

  /**
   * Get recent activity across all projects
   */
  async getRecentActivity(limit = 20) {
    // Get recent photos from local database
    const recentPhotos = await prisma.companyCamPhoto.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        project: {
          include: {
            opportunity: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    return recentPhotos;
  },

  /**
   * Webhook handler for CompanyCam events
   */
  async handleWebhook(event) {
    const { type, data } = event;

    logger.info(`CompanyCam webhook: ${type}`);

    switch (type) {
      case 'photo.created':
        await this.handlePhotoCreated(data);
        break;
      case 'project.created':
        await this.handleProjectCreated(data);
        break;
      case 'project.updated':
        await this.handleProjectUpdated(data);
        break;
      default:
        logger.warn(`Unhandled CompanyCam webhook type: ${type}`);
    }

    return { handled: true };
  },

  async handlePhotoCreated(data) {
    const { project_id, photo } = data;

    const localProject = await prisma.companyCamProject.findFirst({
      where: { companyCamId: project_id },
    });

    if (!localProject) {
      logger.info(`Photo created for unlinked project: ${project_id}`);
      return;
    }

    await prisma.companyCamPhoto.create({
      data: {
        companyCamId: photo.id,
        projectId: localProject.id,
        photoUrl: photo.uris?.original || photo.photo_url,
        thumbnailUrl: photo.uris?.thumbnail || photo.thumbnail_url,
        takenAt: photo.created_at ? new Date(photo.created_at) : null,
        latitude: photo.coordinates?.lat,
        longitude: photo.coordinates?.lon,
        tags: photo.tags || [],
        caption: photo.caption,
        uploadedBy: photo.creator?.name,
      },
    });

    // Update photo count
    await prisma.companyCamProject.update({
      where: { id: localProject.id },
      data: {
        photoCount: { increment: 1 },
      },
    });
  },

  async handleProjectCreated(data) {
    const { project } = data;

    // Check if project has external_id that matches an opportunity
    if (project.external_id) {
      await this.linkToOpportunity(project.id, project.external_id);
    }
  },

  async handleProjectUpdated(data) {
    const { project } = data;

    await prisma.companyCamProject.updateMany({
      where: { companyCamId: project.id },
      data: {
        name: project.name,
        status: project.status,
        lastSyncedAt: new Date(),
      },
    });
  },
};

export default companyCamService;
