// CompanyCam Service - Photo documentation integration
// Includes full migration capability to download photos from CompanyCam and upload to Panda S3
import { PrismaClient } from '@prisma/client';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });

// S3 configuration for photo storage
const S3_REGION = process.env.AWS_REGION || 'us-east-2';
const S3_BUCKET = process.env.COMPANYCAM_PHOTOS_BUCKET || 'pandacam-photos-prod';
const s3Client = new S3Client({ region: S3_REGION });

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
 * Download image from CompanyCam URL and upload to Panda S3 bucket
 * This is the core function for migrating photos from CompanyCam to our own storage
 * @param {string} imageUrl - CompanyCam image URL to download
 * @param {string} projectId - CompanyCam project ID for S3 path organization
 * @param {string} photoId - CompanyCam photo ID for unique filename
 * @returns {Promise<{s3Key: string, s3Url: string, contentType: string, size: number}>}
 */
async function downloadAndUploadToS3(imageUrl, projectId, photoId) {
  try {
    logger.info(`Downloading photo ${photoId} from CompanyCam...`);

    // Download image from CompanyCam
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Determine file extension from content type
    const extensionMap = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/heic': 'heic',
    };
    const extension = extensionMap[contentType] || 'jpg';

    // Generate S3 key: projects/{projectId}/photos/{photoId}.{ext}
    const s3Key = `projects/${projectId}/photos/${photoId}.${extension}`;

    // Check if already exists in S3 (avoid re-uploading)
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
      }));
      logger.info(`Photo ${photoId} already exists in S3, skipping upload`);
      return {
        s3Key,
        s3Url: `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3Key}`,
        contentType,
        size: buffer.length,
        alreadyExists: true,
      };
    } catch (headErr) {
      // Object doesn't exist, proceed with upload
    }

    // Upload to S3
    logger.info(`Uploading photo ${photoId} to S3: ${s3Key}`);
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
      Metadata: {
        'companycam-photo-id': photoId,
        'companycam-project-id': projectId,
        'migrated-at': new Date().toISOString(),
      },
    }));

    const s3Url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3Key}`;
    logger.info(`Photo ${photoId} uploaded successfully to ${s3Url}`);

    return {
      s3Key,
      s3Url,
      contentType,
      size: buffer.length,
      alreadyExists: false,
    };
  } catch (error) {
    logger.error(`Failed to download/upload photo ${photoId}:`, error);
    throw error;
  }
}

/**
 * Download and upload thumbnail to S3
 * @param {string} thumbnailUrl - CompanyCam thumbnail URL
 * @param {string} projectId - CompanyCam project ID
 * @param {string} photoId - CompanyCam photo ID
 * @returns {Promise<{s3Key: string, s3Url: string}>}
 */
async function downloadAndUploadThumbnail(thumbnailUrl, projectId, photoId) {
  try {
    const response = await fetch(thumbnailUrl);
    if (!response.ok) {
      throw new Error(`Failed to download thumbnail: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const extension = contentType.includes('png') ? 'png' : 'jpg';
    const s3Key = `projects/${projectId}/thumbnails/${photoId}_thumb.${extension}`;

    // Check if already exists
    try {
      await s3Client.send(new HeadObjectCommand({
        Bucket: S3_BUCKET,
        Key: s3Key,
      }));
      return {
        s3Key,
        s3Url: `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3Key}`,
      };
    } catch (headErr) {
      // Continue with upload
    }

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
    }));

    return {
      s3Key,
      s3Url: `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3Key}`,
    };
  } catch (error) {
    logger.warn(`Failed to upload thumbnail for photo ${photoId}:`, error.message);
    return { s3Key: null, s3Url: null };
  }
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
   * Get a single user by ID
   */
  async getUser(userId) {
    return companyCamRequest(`/users/${userId}`);
  },

  /**
   * Search for user by email
   */
  async findUserByEmail(email) {
    const users = await this.getUsers();
    const userList = users.users || users;
    return userList.find(u => u.email?.toLowerCase() === email.toLowerCase());
  },

  /**
   * Create a new CompanyCam user (Standard user for third-party contractors)
   * Note: Requires admin permissions
   */
  async createUser({
    email,
    firstName,
    lastName,
    phone,
    role = 'standard', // standard, admin, etc.
  }) {
    logger.info(`Creating CompanyCam user: ${email}`);

    const userData = {
      email,
      first_name: firstName,
      last_name: lastName,
      phone_number: phone,
      role,
    };

    const user = await companyCamRequest('/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    logger.info(`CompanyCam user created: ${user.id}`);
    return user;
  },

  /**
   * Add a user as collaborator to a project
   * This gives them access to view and upload photos to the project
   */
  async addProjectCollaborator(projectId, userId) {
    logger.info(`Adding collaborator ${userId} to project ${projectId}`);

    const result = await companyCamRequest(`/projects/${projectId}/users`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });

    logger.info(`Collaborator added to project ${projectId}`);
    return result;
  },

  /**
   * Remove a user from a project
   */
  async removeProjectCollaborator(projectId, userId) {
    logger.info(`Removing collaborator ${userId} from project ${projectId}`);

    const result = await companyCamRequest(`/projects/${projectId}/users/${userId}`, {
      method: 'DELETE',
    });

    return result;
  },

  /**
   * Get all collaborators on a project
   */
  async getProjectCollaborators(projectId) {
    return companyCamRequest(`/projects/${projectId}/users`);
  },

  /**
   * Ensure a crew member has CompanyCam access for a job
   * 1. Check if they have a CompanyCam account (by email)
   * 2. If not, create a standard user account
   * 3. Add them as collaborator to the project
   *
   * @param {Object} params
   * @param {string} params.email - Crew member's email
   * @param {string} params.firstName - First name
   * @param {string} params.lastName - Last name
   * @param {string} params.phone - Phone number (optional)
   * @param {string} params.companyCamProjectId - CompanyCam project ID
   * @param {string} params.opportunityId - Panda CRM opportunity ID
   */
  async ensureCrewAccess({
    email,
    firstName,
    lastName,
    phone,
    companyCamProjectId,
    opportunityId,
  }) {
    logger.info(`Ensuring crew access for ${email} on project ${companyCamProjectId}`);

    // Step 1: Check if user already exists in CompanyCam
    let user = await this.findUserByEmail(email);

    // Step 2: Create user if they don't exist
    if (!user) {
      logger.info(`User ${email} not found in CompanyCam, creating...`);
      user = await this.createUser({
        email,
        firstName,
        lastName,
        phone,
        role: 'standard',
      });
    }

    // Step 3: Add user as collaborator to the project
    try {
      await this.addProjectCollaborator(companyCamProjectId, user.id);
    } catch (error) {
      // If error is "already a collaborator", that's fine
      if (!error.message?.includes('already')) {
        throw error;
      }
      logger.info(`User ${email} is already a collaborator on project ${companyCamProjectId}`);
    }

    // Step 4: Record the crew assignment in our database
    await prisma.companyCamCrewAccess.upsert({
      where: {
        companyCamProjectId_userEmail: {
          companyCamProjectId,
          userEmail: email,
        },
      },
      create: {
        companyCamProjectId,
        companyCamUserId: user.id,
        userEmail: email,
        userName: `${firstName} ${lastName}`,
        opportunityId,
        grantedAt: new Date(),
      },
      update: {
        companyCamUserId: user.id,
        userName: `${firstName} ${lastName}`,
        grantedAt: new Date(),
      },
    });

    logger.info(`Crew access granted: ${email} -> project ${companyCamProjectId}`);

    return {
      user,
      projectId: companyCamProjectId,
      accessGranted: true,
    };
  },

  /**
   * Revoke crew access from a project (after job completion)
   */
  async revokeCrewAccess({
    email,
    companyCamProjectId,
  }) {
    logger.info(`Revoking crew access for ${email} on project ${companyCamProjectId}`);

    const user = await this.findUserByEmail(email);
    if (user) {
      try {
        await this.removeProjectCollaborator(companyCamProjectId, user.id);
      } catch (error) {
        logger.warn(`Could not remove collaborator: ${error.message}`);
      }
    }

    // Update our record
    await prisma.companyCamCrewAccess.updateMany({
      where: {
        companyCamProjectId,
        userEmail: email,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return { revoked: true };
  },

  /**
   * Sync project photos to local database AND upload to S3
   * This is the main migration method - downloads from CompanyCam and uploads to Panda's S3
   */
  async syncProjectPhotos(projectId, options = {}) {
    const { uploadToS3 = true, createPhotoRecords = true } = options;
    logger.info(`Syncing photos for project: ${projectId} (uploadToS3: ${uploadToS3})`);

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

    let uploadedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    // Sync photos to local database and upload to S3
    for (const photo of allPhotos) {
      try {
        const companyCamOriginalUrl = photo.uris?.original || photo.photo_url;
        const companyCamThumbnailUrl = photo.uris?.thumbnail || photo.thumbnail_url;

        let s3PhotoUrl = companyCamOriginalUrl;
        let s3ThumbnailUrl = companyCamThumbnailUrl;
        let s3Key = null;
        let s3ThumbnailKey = null;
        let photoFileSize = 0;
        let photoMimeType = 'image/jpeg';

        // Upload to S3 if enabled and we have a source URL
        if (uploadToS3 && companyCamOriginalUrl) {
          try {
            // Upload main photo
            const photoResult = await downloadAndUploadToS3(
              companyCamOriginalUrl,
              projectId,
              photo.id
            );
            s3PhotoUrl = photoResult.s3Url;
            s3Key = photoResult.s3Key;
            photoFileSize = photoResult.size || 0;
            photoMimeType = photoResult.contentType || 'image/jpeg';

            if (photoResult.alreadyExists) {
              skippedCount++;
            } else {
              uploadedCount++;
            }

            // Upload thumbnail
            if (companyCamThumbnailUrl) {
              const thumbResult = await downloadAndUploadThumbnail(
                companyCamThumbnailUrl,
                projectId,
                photo.id
              );
              if (thumbResult.s3Url) {
                s3ThumbnailUrl = thumbResult.s3Url;
                s3ThumbnailKey = thumbResult.s3Key;
              }
            }
          } catch (uploadError) {
            logger.error(`Failed to upload photo ${photo.id} to S3:`, uploadError.message);
            failedCount++;
            // Continue with CompanyCam URL as fallback
          }
        }

        // Upsert to companyCamPhoto table
        await prisma.companyCamPhoto.upsert({
          where: { companyCamId: photo.id },
          create: {
            companyCamId: photo.id,
            projectId: localProject.id,
            photoUrl: s3PhotoUrl,
            thumbnailUrl: s3ThumbnailUrl,
            s3Key: s3Key,
            s3ThumbnailKey: s3ThumbnailKey,
            originalCompanyCamUrl: companyCamOriginalUrl,
            takenAt: photo.created_at ? new Date(photo.created_at) : null,
            latitude: photo.coordinates?.lat,
            longitude: photo.coordinates?.lon,
            tags: photo.tags || [],
            caption: photo.caption,
            uploadedBy: photo.creator?.name,
            migratedToS3: !!s3Key,
            migratedAt: s3Key ? new Date() : null,
          },
          update: {
            photoUrl: s3PhotoUrl,
            thumbnailUrl: s3ThumbnailUrl,
            s3Key: s3Key || undefined,
            s3ThumbnailKey: s3ThumbnailKey || undefined,
            tags: photo.tags || [],
            caption: photo.caption,
            migratedToS3: s3Key ? true : undefined,
            migratedAt: s3Key ? new Date() : undefined,
          },
        });

        // Create Photo record in photocam service for CRM display
        if (createPhotoRecords && localProject.opportunityId && s3Key) {
          await this.createPhotocamPhotoRecord({
            projectId: localProject.id,
            opportunityId: localProject.opportunityId,
            photoUrl: s3PhotoUrl,
            thumbnailUrl: s3ThumbnailUrl,
            s3Key,
            caption: photo.caption,
            takenAt: photo.created_at ? new Date(photo.created_at) : null,
            latitude: photo.coordinates?.lat,
            longitude: photo.coordinates?.lon,
            tags: photo.tags || [],
            uploadedBy: photo.creator?.name,
            companyCamPhotoId: photo.id,
            fileSize: photoFileSize,
            mimeType: photoMimeType,
          });
        }
      } catch (error) {
        logger.error(`Error processing photo ${photo.id}:`, error.message);
        failedCount++;
      }
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

    logger.info(`Synced ${allPhotos.length} photos for project ${projectId}: ${uploadedCount} uploaded, ${skippedCount} skipped (already in S3), ${failedCount} failed`);

    return {
      synced: allPhotos.length,
      uploaded: uploadedCount,
      skipped: skippedCount,
      failed: failedCount,
    };
  },

  /**
   * Create a Photo record in the photocam service for CRM display
   */
  async createPhotocamPhotoRecord({
    projectId,
    opportunityId,
    photoUrl,
    thumbnailUrl,
    s3Key,
    caption,
    takenAt,
    latitude,
    longitude,
    tags,
    uploadedBy,
    companyCamPhotoId,
    fileSize = 0,
    mimeType = 'image/jpeg',
  }) {
    try {
      // Check if photo already exists in photocam by externalId or fileKey (S3 key)
      const existingPhoto = await prisma.photo.findFirst({
        where: {
          OR: [
            { externalId: companyCamPhotoId },
            { fileKey: s3Key },
          ],
        },
      });

      if (existingPhoto) {
        logger.debug(`Photo ${companyCamPhotoId} already exists in photocam, skipping`);
        return existingPhoto;
      }

      // Find or create PhotoProject for this opportunity
      let photoProject = await prisma.photoProject.findFirst({
        where: { opportunityId },
      });

      if (!photoProject) {
        // Get opportunity details for project creation
        const opportunity = await prisma.opportunity.findUnique({
          where: { id: opportunityId },
          include: { account: true },
        });

        if (opportunity) {
          photoProject = await prisma.photoProject.create({
            data: {
              name: opportunity.name || `Project for ${opportunity.jobId}`,
              projectType: 'JOB',
              status: 'ACTIVE',
              street: opportunity.account?.billingStreet,
              city: opportunity.account?.billingCity,
              state: opportunity.account?.billingState,
              postalCode: opportunity.account?.billingPostalCode,
              opportunityId: opportunityId,
              accountId: opportunity.accountId,
              metadata: { source: 'companycam_migration' },
            },
          });
        }
      }

      if (!photoProject) {
        logger.warn(`Could not create PhotoProject for opportunity ${opportunityId}`);
        return null;
      }

      // Create Photo record with correct field names matching Photo model schema
      const photo = await prisma.photo.create({
        data: {
          projectId: photoProject.id,
          externalId: companyCamPhotoId,
          externalSource: 'companycam',
          originalUrl: photoUrl,
          thumbnailUrl: thumbnailUrl,
          fileKey: s3Key,
          fileName: s3Key ? s3Key.split('/').pop() : 'unknown.jpg',
          fileSize: fileSize || 0,
          mimeType: mimeType || 'image/jpeg',
          caption: caption,
          photoType: 'OTHER',
          capturedAt: takenAt ? new Date(takenAt) : null,
          latitude: latitude,
          longitude: longitude,
          tags: tags || [],
        },
      });

      logger.debug(`Created photocam Photo record: ${photo.id}`);
      return photo;
    } catch (error) {
      logger.error(`Failed to create photocam Photo record:`, error.message);
      return null;
    }
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
   * Returns photos with CloudFront URLs for migrated photos
   */
  async getOpportunityPhotos(opportunityId, options = {}) {
    const { page = 1, limit = 100, tag } = options;
    const skip = (page - 1) * limit;

    // Build photo filter conditions
    const photoWhereConditions = {};
    if (tag) {
      // Filter photos that have this tag in their tags array
      photoWhereConditions.tags = { has: tag };
    }

    const project = await prisma.companyCamProject.findFirst({
      where: { opportunityId },
      include: {
        photos: {
          where: photoWhereConditions,
          orderBy: { takenAt: 'desc' },
          skip,
          take: limit,
        },
      },
    });

    if (!project) {
      return { photos: [], project: null, pagination: { page, limit, total: 0, totalPages: 0 } };
    }

    // Get total count for pagination (with same filter)
    const totalCount = await prisma.companyCamPhoto.count({
      where: {
        projectId: project.id,
        ...photoWhereConditions,
      },
    });

    // CloudFront domain for migrated photos
    const CLOUDFRONT_DOMAIN = 'd2nv1ditkq7acr.cloudfront.net';

    // Debug: Log migration stats
    const migratedCount = project.photos.filter(p => p.migratedToS3 && p.s3Key).length;
    const notMigratedCount = project.photos.length - migratedCount;
    logger.info(`[getOpportunityPhotos] Project ${project.id}: ${migratedCount} migrated, ${notMigratedCount} not migrated`);

    // Transform photos to use CloudFront URLs for migrated photos
    const transformedPhotos = project.photos.map((photo) => {
      // If photo has been migrated to S3, build CloudFront URL from s3Key
      if (photo.migratedToS3 && photo.s3Key) {
        const cloudFrontUrl = `https://${CLOUDFRONT_DOMAIN}/${photo.s3Key}`;
        const cloudFrontThumbnailUrl = photo.s3ThumbnailKey
          ? `https://${CLOUDFRONT_DOMAIN}/${photo.s3ThumbnailKey}`
          : cloudFrontUrl;

        return {
          ...photo,
          photoUrl: cloudFrontUrl,
          thumbnailUrl: cloudFrontThumbnailUrl,
          // Keep original URLs for reference
          originalPhotoUrl: photo.photoUrl,
          originalThumbnailUrl: photo.thumbnailUrl,
        };
      }

      // Debug: Log non-migrated photo details
      logger.debug(`[getOpportunityPhotos] Non-migrated photo ${photo.id}: migratedToS3=${photo.migratedToS3}, s3Key=${photo.s3Key}, photoUrl=${photo.photoUrl?.substring(0, 50)}...`);

      // Return original photo data if not migrated
      return photo;
    });

    return {
      project,
      photos: transformedPhotos,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
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

    // Get CompanyCam URLs
    const companyCamOriginalUrl = photo.uris?.original || photo.photo_url;
    const companyCamThumbnailUrl = photo.uris?.thumbnail || photo.thumbnail_url;

    // Initialize S3 fields - will upload to S3 for full-size lightbox display
    let s3PhotoUrl = companyCamOriginalUrl;
    let s3ThumbnailUrl = companyCamThumbnailUrl;
    let s3Key = null;
    let s3ThumbnailKey = null;
    let migratedToS3 = false;

    // Upload original photo to S3
    if (companyCamOriginalUrl) {
      try {
        logger.info(`[handlePhotoCreated] Uploading photo ${photo.id} to S3...`);
        const photoResult = await downloadAndUploadToS3(
          companyCamOriginalUrl,
          project_id,
          photo.id
        );
        s3PhotoUrl = photoResult.s3Url;
        s3Key = photoResult.s3Key;
        migratedToS3 = true;
        logger.info(`[handlePhotoCreated] Photo ${photo.id} uploaded to S3: ${s3Key}`);
      } catch (uploadError) {
        logger.warn(`[handlePhotoCreated] Failed to upload photo ${photo.id} to S3:`, uploadError.message);
        // Continue with CompanyCam URL as fallback
      }
    }

    // Upload thumbnail to S3
    if (companyCamThumbnailUrl && migratedToS3) {
      try {
        const thumbResult = await downloadAndUploadThumbnail(
          companyCamThumbnailUrl,
          project_id,
          photo.id
        );
        if (thumbResult.s3Key) {
          s3ThumbnailUrl = thumbResult.s3Url;
          s3ThumbnailKey = thumbResult.s3Key;
        }
      } catch (thumbError) {
        logger.warn(`[handlePhotoCreated] Failed to upload thumbnail for photo ${photo.id}:`, thumbError.message);
        // Continue with CompanyCam thumbnail URL as fallback
      }
    }

    await prisma.companyCamPhoto.create({
      data: {
        companyCamId: photo.id,
        projectId: localProject.id,
        photoUrl: s3PhotoUrl,
        thumbnailUrl: s3ThumbnailUrl,
        s3Key: s3Key,
        s3ThumbnailKey: s3ThumbnailKey,
        migratedToS3: migratedToS3,
        migratedAt: migratedToS3 ? new Date() : null,
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

    logger.info(`[handlePhotoCreated] Photo ${photo.id} created successfully, migratedToS3: ${migratedToS3}`);
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

  // Background sync state tracking
  _syncState: {
    isRunning: false,
    lastRunAt: null,
    lastHourlyReportAt: null,
    stats: {
      projectsSynced: 0,
      photosSynced: 0,
      errors: 0,
      lastError: null,
    },
    hourlyStats: {
      projectsSynced: 0,
      photosSynced: 0,
      errors: 0,
      startedAt: null,
    },
  },

  /**
   * Reset hourly stats (called after hourly report)
   */
  resetHourlyStats() {
    this._syncState.hourlyStats = {
      projectsSynced: 0,
      photosSynced: 0,
      errors: 0,
      startedAt: new Date(),
    };
    this._syncState.lastHourlyReportAt = new Date();
  },

  /**
   * Get current sync status for reporting
   */
  getSyncStatus() {
    return {
      isRunning: this._syncState.isRunning,
      lastRunAt: this._syncState.lastRunAt,
      lastHourlyReportAt: this._syncState.lastHourlyReportAt,
      totalStats: { ...this._syncState.stats },
      hourlyStats: { ...this._syncState.hourlyStats },
    };
  },

  /**
   * Sync all CompanyCam projects and their photos in the background
   * Called by cron job - processes projects in batches with rate limiting
   */
  async syncAllProjects() {
    if (this._syncState.isRunning) {
      logger.info('CompanyCam sync already running, skipping this run');
      return { skipped: true, reason: 'already_running' };
    }

    this._syncState.isRunning = true;
    const startTime = Date.now();
    let projectsSynced = 0;
    let photosSynced = 0;
    let errors = 0;

    try {
      logger.info('Starting CompanyCam background sync...');

      // Initialize hourly stats if not set
      if (!this._syncState.hourlyStats.startedAt) {
        this._syncState.hourlyStats.startedAt = new Date();
      }

      // Get all CompanyCam projects with pagination
      let page = 1;
      let hasMore = true;
      const processedProjectIds = new Set();

      while (hasMore) {
        try {
          const result = await this.getProjects({ page, perPage: 50 });
          const projects = result.projects || result;

          if (!projects || projects.length === 0) {
            hasMore = false;
            break;
          }

          logger.info(`Processing page ${page} with ${projects.length} projects`);

          for (const project of projects) {
            if (processedProjectIds.has(project.id)) continue;
            processedProjectIds.add(project.id);

            try {
              // Check if project exists locally, create if not
              let localProject = await prisma.companyCamProject.findFirst({
                where: { companyCamId: project.id },
              });

              if (!localProject) {
                // Create local project record
                localProject = await prisma.companyCamProject.create({
                  data: {
                    companyCamId: project.id,
                    name: project.name || 'Unnamed Project',
                    address: typeof project.address === 'object'
                      ? JSON.stringify(project.address)
                      : project.address,
                    latitude: project.coordinates?.lat,
                    longitude: project.coordinates?.lon,
                    syncStatus: 'PENDING',
                  },
                });
                logger.info(`Created local project for CompanyCam ID: ${project.id}`);
              }

              // Sync photos for this project
              const syncResult = await this.syncProjectPhotos(project.id);
              photosSynced += syncResult.synced || 0;
              projectsSynced++;

              // Update stats
              this._syncState.stats.projectsSynced++;
              this._syncState.stats.photosSynced += syncResult.synced || 0;
              this._syncState.hourlyStats.projectsSynced++;
              this._syncState.hourlyStats.photosSynced += syncResult.synced || 0;

              // Rate limiting - 300ms between project syncs
              await new Promise(resolve => setTimeout(resolve, 300));

            } catch (projectError) {
              errors++;
              this._syncState.stats.errors++;
              this._syncState.stats.lastError = projectError.message;
              this._syncState.hourlyStats.errors++;
              logger.error(`Error syncing project ${project.id}:`, projectError.message);
              // Continue with next project
            }
          }

          hasMore = projects.length === 50;
          page++;

          // Rate limiting between pages
          await new Promise(resolve => setTimeout(resolve, 500));

        } catch (pageError) {
          logger.error(`Error fetching projects page ${page}:`, pageError.message);
          errors++;
          hasMore = false;
        }
      }

      const duration = Math.round((Date.now() - startTime) / 1000);
      logger.info(`CompanyCam sync completed: ${projectsSynced} projects, ${photosSynced} photos synced, ${errors} errors in ${duration}s`);

      this._syncState.lastRunAt = new Date();

      return {
        success: true,
        projectsSynced,
        photosSynced,
        errors,
        duration,
      };

    } catch (error) {
      logger.error('CompanyCam sync failed:', error);
      this._syncState.stats.errors++;
      this._syncState.stats.lastError = error.message;
      throw error;
    } finally {
      this._syncState.isRunning = false;
    }
  },

  /**
   * Generate hourly status report
   */
  generateHourlyReport() {
    const status = this.getSyncStatus();
    const hourlyDuration = status.hourlyStats.startedAt
      ? Math.round((Date.now() - new Date(status.hourlyStats.startedAt).getTime()) / 1000 / 60)
      : 0;

    const report = {
      timestamp: new Date().toISOString(),
      period: `${hourlyDuration} minutes`,
      isCurrentlyRunning: status.isRunning,
      lastSyncCompleted: status.lastRunAt,
      hourlyProgress: {
        projectsSynced: status.hourlyStats.projectsSynced,
        photosSynced: status.hourlyStats.photosSynced,
        errors: status.hourlyStats.errors,
      },
      totalProgress: {
        projectsSynced: status.totalStats.projectsSynced,
        photosSynced: status.totalStats.photosSynced,
        errors: status.totalStats.errors,
        lastError: status.totalStats.lastError,
      },
    };

    logger.info('=== CompanyCam Hourly Sync Report ===');
    logger.info(`Period: Last ${report.period}`);
    logger.info(`Currently Running: ${report.isCurrentlyRunning ? 'Yes' : 'No'}`);
    logger.info(`Hourly Progress: ${report.hourlyProgress.projectsSynced} projects, ${report.hourlyProgress.photosSynced} photos, ${report.hourlyProgress.errors} errors`);
    logger.info(`Total Progress: ${report.totalProgress.projectsSynced} projects, ${report.totalProgress.photosSynced} photos, ${report.totalProgress.errors} errors`);
    if (report.totalProgress.lastError) {
      logger.info(`Last Error: ${report.totalProgress.lastError}`);
    }
    logger.info('=====================================');

    // Reset hourly stats after report
    this.resetHourlyStats();

    return report;
  },

  // ============================================
  // Photo Tag Management (Local Database)
  // ============================================

  /**
   * Add a tag to a photo in the local database
   * @param {string} photoId - The local CompanyCamPhoto ID (cuid)
   * @param {string} tag - The tag to add
   * @returns {Object} Updated photo with tags
   */
  async addPhotoTagLocal(photoId, tag) {
    if (!photoId || !tag) {
      throw new Error('Photo ID and tag are required');
    }

    const trimmedTag = tag.trim();
    if (!trimmedTag) {
      throw new Error('Tag cannot be empty');
    }

    logger.info(`Adding tag "${trimmedTag}" to photo ${photoId}`);

    // Get the current photo
    const photo = await prisma.companyCamPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      throw new Error('Photo not found');
    }

    // Check if tag already exists
    const currentTags = photo.tags || [];
    if (currentTags.includes(trimmedTag)) {
      logger.info(`Tag "${trimmedTag}" already exists on photo ${photoId}`);
      return photo;
    }

    // Add the new tag
    const updatedPhoto = await prisma.companyCamPhoto.update({
      where: { id: photoId },
      data: {
        tags: [...currentTags, trimmedTag],
      },
    });

    logger.info(`Tag "${trimmedTag}" added to photo ${photoId}. Total tags: ${updatedPhoto.tags.length}`);
    return updatedPhoto;
  },

  /**
   * Remove a tag from a photo in the local database
   * @param {string} photoId - The local CompanyCamPhoto ID (cuid)
   * @param {string} tag - The tag to remove
   * @returns {Object} Updated photo with tags
   */
  async removePhotoTagLocal(photoId, tag) {
    if (!photoId || !tag) {
      throw new Error('Photo ID and tag are required');
    }

    logger.info(`Removing tag "${tag}" from photo ${photoId}`);

    // Get the current photo
    const photo = await prisma.companyCamPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      throw new Error('Photo not found');
    }

    const currentTags = photo.tags || [];
    const filteredTags = currentTags.filter(t => t !== tag);

    if (filteredTags.length === currentTags.length) {
      logger.info(`Tag "${tag}" not found on photo ${photoId}`);
      return photo;
    }

    // Update the photo with filtered tags
    const updatedPhoto = await prisma.companyCamPhoto.update({
      where: { id: photoId },
      data: {
        tags: filteredTags,
      },
    });

    logger.info(`Tag "${tag}" removed from photo ${photoId}. Remaining tags: ${updatedPhoto.tags.length}`);
    return updatedPhoto;
  },

  /**
   * Set all tags for a photo (replaces existing tags)
   * @param {string} photoId - The local CompanyCamPhoto ID (cuid)
   * @param {string[]} tags - Array of tags to set
   * @returns {Object} Updated photo with tags
   */
  async setPhotoTagsLocal(photoId, tags) {
    if (!photoId) {
      throw new Error('Photo ID is required');
    }

    const tagArray = Array.isArray(tags) ? tags : [];
    const cleanedTags = tagArray.map(t => t.trim()).filter(t => t.length > 0);
    // Remove duplicates
    const uniqueTags = [...new Set(cleanedTags)];

    logger.info(`Setting ${uniqueTags.length} tags on photo ${photoId}`);

    const updatedPhoto = await prisma.companyCamPhoto.update({
      where: { id: photoId },
      data: {
        tags: uniqueTags,
      },
    });

    logger.info(`Tags set on photo ${photoId}: ${uniqueTags.join(', ')}`);
    return updatedPhoto;
  },

  /**
   * Get a single photo by ID with full details
   * @param {string} photoId - The local CompanyCamPhoto ID (cuid)
   * @returns {Object} Photo with all details
   */
  async getPhotoById(photoId) {
    if (!photoId) {
      throw new Error('Photo ID is required');
    }

    const photo = await prisma.companyCamPhoto.findUnique({
      where: { id: photoId },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            companyCamId: true,
            opportunityId: true,
          },
        },
      },
    });

    if (!photo) {
      throw new Error('Photo not found');
    }

    return photo;
  },

  /**
   * Get all unique tags used across all photos in a project
   * @param {string} projectId - The local CompanyCamProject ID
   * @returns {string[]} Array of unique tags
   */
  async getProjectTagsLocal(projectId) {
    if (!projectId) {
      throw new Error('Project ID is required');
    }

    const photos = await prisma.companyCamPhoto.findMany({
      where: { projectId },
      select: { tags: true },
    });

    // Collect all unique tags
    const allTags = new Set();
    photos.forEach(photo => {
      (photo.tags || []).forEach(tag => allTags.add(tag));
    });

    return Array.from(allTags).sort();
  },

  /**
   * Get all unique tags used across all photos in the system
   * @returns {Object[]} Array of { tag, count } objects
   */
  async getAllTagsWithCounts() {
    const photos = await prisma.companyCamPhoto.findMany({
      where: {
        tags: { isEmpty: false },
      },
      select: { tags: true },
    });

    // Count tag occurrences
    const tagCounts = {};
    photos.forEach(photo => {
      (photo.tags || []).forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    // Convert to array and sort by count
    return Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  },

  /**
   * Bulk add a tag to multiple photos
   * @param {string[]} photoIds - Array of photo IDs
   * @param {string} tag - The tag to add
   * @returns {Object} Result summary
   */
  async bulkAddTag(photoIds, tag) {
    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      throw new Error('Photo IDs array is required');
    }
    if (!tag || !tag.trim()) {
      throw new Error('Tag is required');
    }

    const trimmedTag = tag.trim();
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const photoId of photoIds) {
      try {
        const photo = await prisma.companyCamPhoto.findUnique({
          where: { id: photoId },
          select: { id: true, tags: true },
        });

        if (!photo) {
          errors++;
          continue;
        }

        const currentTags = photo.tags || [];
        if (currentTags.includes(trimmedTag)) {
          skipped++;
          continue;
        }

        await prisma.companyCamPhoto.update({
          where: { id: photoId },
          data: { tags: [...currentTags, trimmedTag] },
        });
        updated++;
      } catch (err) {
        logger.error(`Error adding tag to photo ${photoId}:`, err.message);
        errors++;
      }
    }

    logger.info(`Bulk add tag "${trimmedTag}": ${updated} updated, ${skipped} skipped, ${errors} errors`);
    return { tag: trimmedTag, updated, skipped, errors, total: photoIds.length };
  },

  /**
   * Bulk remove a tag from multiple photos
   * @param {string[]} photoIds - Array of photo IDs
   * @param {string} tag - The tag to remove
   * @returns {Object} Result summary
   */
  async bulkRemoveTag(photoIds, tag) {
    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      throw new Error('Photo IDs array is required');
    }
    if (!tag) {
      throw new Error('Tag is required');
    }

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const photoId of photoIds) {
      try {
        const photo = await prisma.companyCamPhoto.findUnique({
          where: { id: photoId },
          select: { id: true, tags: true },
        });

        if (!photo) {
          errors++;
          continue;
        }

        const currentTags = photo.tags || [];
        if (!currentTags.includes(tag)) {
          skipped++;
          continue;
        }

        await prisma.companyCamPhoto.update({
          where: { id: photoId },
          data: { tags: currentTags.filter(t => t !== tag) },
        });
        updated++;
      } catch (err) {
        logger.error(`Error removing tag from photo ${photoId}:`, err.message);
        errors++;
      }
    }

    logger.info(`Bulk remove tag "${tag}": ${updated} updated, ${skipped} skipped, ${errors} errors`);
    return { tag, updated, skipped, errors, total: photoIds.length };
  },
};

export default companyCamService;
