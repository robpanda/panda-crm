// S3 File Upload Service
// Handles file uploads, downloads, and management using AWS S3
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import path from 'path';

class FileUploadService {
  constructor() {
    this.s3Client = null;
    this.bucket = process.env.S3_BUCKET || 'panda-crm-files';
    this.region = process.env.AWS_REGION || 'us-east-2';
    this.cdnDomain = process.env.CDN_DOMAIN || null; // Optional CloudFront domain
  }

  /**
   * Initialize S3 client
   */
  initialize() {
    if (!this.s3Client) {
      this.s3Client = new S3Client({
        region: this.region,
        // Credentials are automatically loaded from environment or IAM role
      });
    }
    return this.s3Client;
  }

  /**
   * Generate a unique file key
   */
  generateFileKey(originalName, folder = 'uploads') {
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(originalName);
    const safeName = path.basename(originalName, ext)
      .replace(/[^a-zA-Z0-9-_]/g, '-')
      .substring(0, 50);

    return `${folder}/${timestamp}-${randomId}-${safeName}${ext}`;
  }

  /**
   * Get content type from file extension
   */
  getContentType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.csv': 'text/csv',
      '.txt': 'text/plain',
      '.zip': 'application/zip',
      '.json': 'application/json',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Upload a file to S3
   * @param {Buffer|Readable} fileContent - File content as buffer or stream
   * @param {string} originalName - Original filename
   * @param {object} options - Upload options
   * @returns {object} Upload result with key and URL
   */
  async uploadFile(fileContent, originalName, options = {}) {
    this.initialize();

    const {
      folder = 'uploads',
      contentType = null,
      metadata = {},
      acl = 'private',
      maxSize = 50 * 1024 * 1024, // 50MB default
    } = options;

    // Validate file size if Buffer
    if (Buffer.isBuffer(fileContent) && fileContent.length > maxSize) {
      throw new Error(`File size exceeds maximum allowed size of ${maxSize / 1024 / 1024}MB`);
    }

    const fileKey = this.generateFileKey(originalName, folder);
    const mimeType = contentType || this.getContentType(originalName);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      Body: fileContent,
      ContentType: mimeType,
      Metadata: {
        originalName,
        uploadedAt: new Date().toISOString(),
        ...metadata,
      },
    });

    await this.s3Client.send(command);

    const url = this.cdnDomain
      ? `https://${this.cdnDomain}/${fileKey}`
      : `https://${this.bucket}.s3.${this.region}.amazonaws.com/${fileKey}`;

    return {
      key: fileKey,
      url,
      bucket: this.bucket,
      contentType: mimeType,
      originalName,
      uploadedAt: new Date().toISOString(),
    };
  }

  /**
   * Upload multiple files
   */
  async uploadFiles(files, options = {}) {
    const results = await Promise.all(
      files.map(file => this.uploadFile(file.content, file.name, options))
    );
    return results;
  }

  /**
   * Generate a presigned URL for uploading directly to S3
   * Used for large files or direct browser uploads
   */
  async getPresignedUploadUrl(originalName, options = {}) {
    this.initialize();

    const {
      folder = 'uploads',
      contentType = null,
      expiresIn = 3600, // 1 hour
      maxSize = 50 * 1024 * 1024,
    } = options;

    const fileKey = this.generateFileKey(originalName, folder);
    const mimeType = contentType || this.getContentType(originalName);

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
      ContentType: mimeType,
    });

    const presignedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    return {
      uploadUrl: presignedUrl,
      key: fileKey,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      contentType: mimeType,
      maxSize,
    };
  }

  /**
   * Generate a presigned URL for downloading a file
   */
  async getPresignedDownloadUrl(fileKey, options = {}) {
    this.initialize();

    const { expiresIn = 3600, fileName = null } = options;

    const commandOptions = {
      Bucket: this.bucket,
      Key: fileKey,
    };

    // Add Content-Disposition for custom filename
    if (fileName) {
      commandOptions.ResponseContentDisposition = `attachment; filename="${fileName}"`;
    }

    const command = new GetObjectCommand(commandOptions);
    const presignedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });

    return {
      downloadUrl: presignedUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  /**
   * Delete a file from S3
   */
  async deleteFile(fileKey) {
    this.initialize();

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: fileKey,
    });

    await this.s3Client.send(command);

    return { deleted: true, key: fileKey };
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(fileKeys) {
    const results = await Promise.all(
      fileKeys.map(key => this.deleteFile(key).catch(err => ({ deleted: false, key, error: err.message })))
    );
    return results;
  }

  /**
   * Check if a file exists
   */
  async fileExists(fileKey) {
    this.initialize();

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: fileKey,
      });

      const response = await this.s3Client.send(command);

      return {
        exists: true,
        contentLength: response.ContentLength,
        contentType: response.ContentType,
        lastModified: response.LastModified,
        metadata: response.Metadata,
      };
    } catch (error) {
      if (error.name === 'NotFound') {
        return { exists: false };
      }
      throw error;
    }
  }

  /**
   * Get file metadata without downloading
   */
  async getFileMetadata(fileKey) {
    const result = await this.fileExists(fileKey);
    if (!result.exists) {
      throw new Error('File not found');
    }
    return result;
  }

  /**
   * Copy a file within S3
   */
  async copyFile(sourceKey, destinationKey) {
    this.initialize();

    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${sourceKey}`,
      Key: destinationKey,
    });

    await this.s3Client.send(command);

    return {
      sourceKey,
      destinationKey,
      copied: true,
    };
  }

  // ==========================================
  // Entity-Specific Upload Methods
  // ==========================================

  /**
   * Upload document for an opportunity
   */
  async uploadOpportunityDocument(opportunityId, fileContent, fileName, documentType = 'general') {
    return this.uploadFile(fileContent, fileName, {
      folder: `opportunities/${opportunityId}/${documentType}`,
      metadata: {
        opportunityId,
        documentType,
      },
    });
  }

  /**
   * Upload document for an account
   */
  async uploadAccountDocument(accountId, fileContent, fileName, documentType = 'general') {
    return this.uploadFile(fileContent, fileName, {
      folder: `accounts/${accountId}/${documentType}`,
      metadata: {
        accountId,
        documentType,
      },
    });
  }

  /**
   * Upload contact photo
   */
  async uploadContactPhoto(contactId, fileContent, fileName) {
    return this.uploadFile(fileContent, fileName, {
      folder: `contacts/${contactId}/photos`,
      metadata: {
        contactId,
        type: 'photo',
      },
    });
  }

  /**
   * Upload email attachment
   */
  async uploadEmailAttachment(emailId, fileContent, fileName) {
    return this.uploadFile(fileContent, fileName, {
      folder: `emails/${emailId}/attachments`,
      metadata: {
        emailId,
        type: 'attachment',
      },
    });
  }

  /**
   * Upload work order photo (before/during/after)
   */
  async uploadWorkOrderPhoto(workOrderId, fileContent, fileName, photoType = 'during') {
    return this.uploadFile(fileContent, fileName, {
      folder: `workorders/${workOrderId}/photos/${photoType}`,
      metadata: {
        workOrderId,
        photoType,
      },
    });
  }

  /**
   * Upload signed contract/agreement
   */
  async uploadSignedContract(opportunityId, fileContent, fileName) {
    return this.uploadFile(fileContent, fileName, {
      folder: `opportunities/${opportunityId}/contracts`,
      metadata: {
        opportunityId,
        type: 'signed-contract',
        signedAt: new Date().toISOString(),
      },
    });
  }

  /**
   * Upload measurement report (EagleView, GAF, etc.)
   */
  async uploadMeasurementReport(opportunityId, fileContent, fileName, provider) {
    return this.uploadFile(fileContent, fileName, {
      folder: `opportunities/${opportunityId}/measurements`,
      metadata: {
        opportunityId,
        provider,
        type: 'measurement-report',
      },
    });
  }

  // ==========================================
  // Utility Methods
  // ==========================================

  /**
   * Get public URL for a file (if bucket/CDN is public)
   */
  getPublicUrl(fileKey) {
    if (this.cdnDomain) {
      return `https://${this.cdnDomain}/${fileKey}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${fileKey}`;
  }

  /**
   * Validate file type
   */
  isAllowedFileType(filename, allowedTypes = []) {
    if (allowedTypes.length === 0) return true;

    const ext = path.extname(filename).toLowerCase();
    return allowedTypes.includes(ext);
  }

  /**
   * Get allowed file types for documents
   */
  static get DOCUMENT_TYPES() {
    return ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt'];
  }

  /**
   * Get allowed file types for images
   */
  static get IMAGE_TYPES() {
    return ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  }
}

// Singleton instance
export const fileUploadService = new FileUploadService();
