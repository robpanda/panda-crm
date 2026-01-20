// S3 Service for Photocam
// Handles all S3 operations for photo storage
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../middleware/logger.js';

const BUCKET_NAME = process.env.PHOTOCAM_S3_BUCKET || 'pandacam-photos-prod';
const REGION = process.env.AWS_REGION || 'us-east-2';
// CloudFront distribution for CDN delivery
const CDN_URL = process.env.PHOTOCAM_CDN_URL || 'https://d2nv1ditkq7acr.cloudfront.net';

// Initialize S3 client
const s3Client = new S3Client({ region: REGION });

/**
 * Generate S3 key for a photo
 * Structure: {projectId}/{folder}/{photoId}/{filename}
 */
function generatePhotoKey(projectId, folder, photoId, filename) {
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${projectId}/${folder}/${photoId}/${sanitizedFilename}`;
}

/**
 * Upload a file to S3
 */
export async function uploadFile(buffer, key, contentType, metadata = {}) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      Metadata: metadata,
    });

    await s3Client.send(command);

    return {
      key,
      url: `${CDN_URL}/${key}`,
      bucket: BUCKET_NAME,
    };
  } catch (error) {
    logger.error('S3 upload error:', error);
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
}

/**
 * Upload a photo with all variants (original, display, thumbnail)
 */
export async function uploadPhotoWithVariants(projectId, photoId, files) {
  const results = {};

  try {
    // Upload original
    if (files.original) {
      const key = generatePhotoKey(projectId, 'originals', photoId, files.original.filename);
      results.original = await uploadFile(
        files.original.buffer,
        key,
        files.original.contentType,
        { photoId, variant: 'original' }
      );
    }

    // Upload display version (web-optimized)
    if (files.display) {
      const key = generatePhotoKey(projectId, 'display', photoId, files.display.filename);
      results.display = await uploadFile(
        files.display.buffer,
        key,
        files.display.contentType,
        { photoId, variant: 'display' }
      );
    }

    // Upload thumbnail
    if (files.thumbnail) {
      const key = generatePhotoKey(projectId, 'thumbnails', photoId, files.thumbnail.filename);
      results.thumbnail = await uploadFile(
        files.thumbnail.buffer,
        key,
        files.thumbnail.contentType,
        { photoId, variant: 'thumbnail' }
      );
    }

    return results;
  } catch (error) {
    logger.error('Photo upload error:', error);
    throw error;
  }
}

/**
 * Get a presigned URL for downloading a file
 */
export async function getPresignedDownloadUrl(key, expiresIn = 3600) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    logger.error('Presigned URL error:', error);
    throw new Error(`Failed to generate download URL: ${error.message}`);
  }
}

/**
 * Get a presigned URL for uploading a file
 */
export async function getPresignedUploadUrl(key, contentType, expiresIn = 3600) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return { url, key };
  } catch (error) {
    logger.error('Presigned upload URL error:', error);
    throw new Error(`Failed to generate upload URL: ${error.message}`);
  }
}

/**
 * Delete a file from S3
 */
export async function deleteFile(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    logger.error('S3 delete error:', error);
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
}

/**
 * Delete all files for a photo (all variants)
 */
export async function deletePhotoFiles(projectId, photoId) {
  const folders = ['originals', 'display', 'thumbnails'];
  const errors = [];

  for (const folder of folders) {
    try {
      // List all files in the photo folder
      const prefix = `${projectId}/${folder}/${photoId}/`;
      const listCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: prefix,
      });

      const listResult = await s3Client.send(listCommand);

      if (listResult.Contents) {
        for (const obj of listResult.Contents) {
          await deleteFile(obj.Key);
        }
      }
    } catch (error) {
      errors.push({ folder, error: error.message });
    }
  }

  if (errors.length > 0) {
    logger.warn('Some photo files failed to delete:', errors);
  }

  return { deleted: true, errors };
}

/**
 * Copy a file within S3
 */
export async function copyFile(sourceKey, destinationKey) {
  try {
    const command = new CopyObjectCommand({
      Bucket: BUCKET_NAME,
      CopySource: `${BUCKET_NAME}/${sourceKey}`,
      Key: destinationKey,
    });

    await s3Client.send(command);
    return {
      key: destinationKey,
      url: `${CDN_URL}/${destinationKey}`,
    };
  } catch (error) {
    logger.error('S3 copy error:', error);
    throw new Error(`Failed to copy file: ${error.message}`);
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    throw error;
  }
}

/**
 * List files in a folder
 */
export async function listFiles(prefix, maxKeys = 1000) {
  try {
    const command = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: maxKeys,
    });

    const result = await s3Client.send(command);
    return result.Contents || [];
  } catch (error) {
    logger.error('S3 list error:', error);
    throw new Error(`Failed to list files: ${error.message}`);
  }
}

/**
 * Upload a generated comparison image
 */
export async function uploadComparisonImage(projectId, comparisonId, buffer, filename, contentType) {
  const key = `${projectId}/comparisons/${comparisonId}/${filename}`;
  return uploadFile(buffer, key, contentType, { comparisonId, type: 'comparison' });
}

/**
 * Upload a generated export (PDF, etc.)
 */
export async function uploadExport(projectId, exportType, buffer, filename, contentType) {
  const exportId = uuidv4();
  const key = `${projectId}/exports/${exportId}/${filename}`;
  return uploadFile(buffer, key, contentType, { exportId, type: exportType });
}

/**
 * Get file metadata
 */
export async function getFileMetadata(key) {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const result = await s3Client.send(command);
    return {
      contentType: result.ContentType,
      contentLength: result.ContentLength,
      lastModified: result.LastModified,
      metadata: result.Metadata,
    };
  } catch (error) {
    if (error.name === 'NotFound') {
      return null;
    }
    throw error;
  }
}

export const s3Service = {
  uploadFile,
  uploadPhotoWithVariants,
  getPresignedDownloadUrl,
  getPresignedUploadUrl,
  deleteFile,
  deletePhotoFiles,
  copyFile,
  fileExists,
  listFiles,
  uploadComparisonImage,
  uploadExport,
  getFileMetadata,
  generatePhotoKey,
  BUCKET_NAME,
  CDN_URL,
};

export default s3Service;
