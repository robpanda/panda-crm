// Documents Service - Entry Point
// Handles PandaSign e-signatures, document management, and file storage
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import multer from 'multer';
import { PrismaClient } from '@prisma/client';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

import agreementRoutes from './routes/agreements.js';
import pdfRoutes from './routes/pdf.js';
import repositoryRoutes from './routes/repository.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './middleware/logger.js';

dotenv.config();

const app = express();
const PORT = process.env.DOCUMENTS_PORT || 3009;
const AWS_REGION = process.env.AWS_REGION || 'us-east-2';
const DOCUMENTS_BUCKET = process.env.DOCUMENTS_BUCKET || 'panda-crm-documents';
const DIRECT_UPLOAD_URL_TTL_SECONDS = 15 * 60;
const DIRECT_UPLOAD_TOKEN_TTL_MS = DIRECT_UPLOAD_URL_TTL_SECONDS * 1000;

const prisma = new PrismaClient();
const s3Client = new S3Client({ region: AWS_REGION });

const directUploadTokenStore = new Map();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

const allowedUploadCategories = new Set([
  'contract',
  'measurement',
  'insurance',
  'invoice',
  'quote',
  'permit',
  'photo',
  'other',
]);

function toNullableString(value) {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function normalizeUploadCategory(value) {
  const normalized = String(value || 'other').trim().toLowerCase();
  return allowedUploadCategories.has(normalized) ? normalized : 'other';
}

function sanitizeFileName(value) {
  const fallback = `upload-${Date.now()}`;
  const normalized = String(value || fallback).trim();
  return normalized.replace(/[^\w.\- ]+/g, '_').replace(/\s+/g, '-').slice(0, 180) || fallback;
}

function getFileNameStem(fileName) {
  const normalized = sanitizeFileName(fileName);
  const extensionIndex = normalized.lastIndexOf('.');
  if (extensionIndex <= 0) return normalized;
  return normalized.slice(0, extensionIndex);
}

function extractFileDetails(fileName, mimeType) {
  const normalizedName = sanitizeFileName(fileName);
  const extensionIndex = normalizedName.lastIndexOf('.');
  const extension = extensionIndex > -1 ? normalizedName.slice(extensionIndex + 1).toLowerCase() : '';

  if (extension) {
    return {
      normalizedName,
      fileExtension: extension,
      fileType: extension.toUpperCase(),
    };
  }

  const mimeSegment = toNullableString(mimeType)?.split('/')?.[1]?.toLowerCase() || '';
  return {
    normalizedName,
    fileExtension: mimeSegment || null,
    fileType: mimeSegment ? mimeSegment.toUpperCase() : 'FILE',
  };
}

function getUserIdFromHeaders(req) {
  return toNullableString(
    req.headers['x-user-id']
      || req.headers['x-userid']
      || req.headers['x-user']
      || null
  );
}

function buildUploadKey(fileName) {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const { normalizedName } = extractFileDetails(fileName);
  return `uploads/${yyyy}/${mm}/${dd}/${uuidv4()}-${normalizedName}`;
}

function consumeUploadToken(uploadToken) {
  if (!uploadToken) return null;

  const tokenData = directUploadTokenStore.get(uploadToken);
  if (!tokenData) return null;

  directUploadTokenStore.delete(uploadToken);
  if (tokenData.expiresAt <= Date.now()) {
    return null;
  }

  return tokenData;
}

function pruneExpiredUploadTokens() {
  const now = Date.now();
  for (const [token, tokenData] of directUploadTokenStore.entries()) {
    if (tokenData.expiresAt <= now) {
      directUploadTokenStore.delete(token);
    }
  }
}

async function resolveUploadTargets(opportunityId, accountId) {
  const normalizedOpportunityId = toNullableString(opportunityId);
  const normalizedAccountId = toNullableString(accountId);

  let linkedOpportunity = null;
  if (normalizedOpportunityId) {
    linkedOpportunity = await prisma.opportunity.findUnique({
      where: { id: normalizedOpportunityId },
      select: { id: true, accountId: true },
    });
  }

  let resolvedAccountId = normalizedAccountId;
  if (!resolvedAccountId && linkedOpportunity?.accountId) {
    resolvedAccountId = linkedOpportunity.accountId;
  }

  return {
    opportunityId: linkedOpportunity?.id || null,
    accountId: resolvedAccountId || null,
  };
}

async function maybeResolveOwnerId(ownerId) {
  const normalizedOwnerId = toNullableString(ownerId);
  if (!normalizedOwnerId) return null;

  const owner = await prisma.user.findUnique({
    where: { id: normalizedOwnerId },
    select: { id: true },
  });

  return owner?.id || null;
}

async function persistUploadedDocument({
  fileName,
  fileSize,
  contentType,
  bucket,
  key,
  title,
  description,
  category,
  opportunityId,
  accountId,
  ownerId,
  metadata = {},
}) {
  const fileDetails = extractFileDetails(fileName, contentType);
  const normalizedTitle = toNullableString(title) || getFileNameStem(fileDetails.normalizedName) || 'Uploaded document';
  const normalizedDescription = toNullableString(description);
  const normalizedCategory = normalizeUploadCategory(category);
  const normalizedContentType = toNullableString(contentType) || 'application/octet-stream';
  const normalizedFileSize = Number.isFinite(Number(fileSize)) ? Number(fileSize) : null;
  const resolvedOwnerId = await maybeResolveOwnerId(ownerId);
  const targets = await resolveUploadTargets(opportunityId, accountId);

  const documentMetadata = JSON.stringify({
    category: normalizedCategory,
    mimeType: normalizedContentType,
    uploadSource: 'crm-upload',
    ...metadata,
  });

  const document = await prisma.$transaction(async (tx) => {
    const createdDocument = await tx.document.create({
      data: {
        title: normalizedTitle,
        description: normalizedDescription,
        fileName: fileDetails.normalizedName,
        fileType: fileDetails.fileType,
        fileExtension: fileDetails.fileExtension,
        contentSize: normalizedFileSize,
        contentUrl: `s3://${bucket}/${key}`,
        sourceType: 'UPLOAD',
        ownerId: resolvedOwnerId,
        metadata: documentMetadata,
      },
    });

    if (targets.opportunityId) {
      await tx.documentLink.create({
        data: {
          documentId: createdDocument.id,
          opportunityId: targets.opportunityId,
          linkedRecordType: 'OPPORTUNITY',
        },
      });
    }

    if (targets.accountId) {
      await tx.documentLink.create({
        data: {
          documentId: createdDocument.id,
          accountId: targets.accountId,
          linkedRecordType: 'ACCOUNT',
        },
      });
    }

    return createdDocument;
  });

  const downloadUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: 3600 }
  );

  return {
    id: document.id,
    title: document.title,
    fileName: document.fileName,
    fileType: document.fileType,
    fileExtension: document.fileExtension,
    contentSize: document.contentSize,
    contentUrl: downloadUrl,
    downloadUrl,
    category: normalizedCategory,
    opportunityId: targets.opportunityId,
    accountId: targets.accountId,
    createdAt: document.createdAt,
  };
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://crm.pandaadmin.com',
    'https://crm.pandaexteriors.com',
    'https://sign.pandaexteriors.com',
  ],
  credentials: true,
}));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'documents',
    timestamp: new Date().toISOString(),
    features: ['agreements', 'templates', 'signatures', 'file-storage', 'pdf-generation'],
    buildSha: process.env.BUILD_SHA || process.env.GITHUB_SHA || 'unknown',
    buildTime: process.env.BUILD_TIME || process.env.GITHUB_RUN_ID || null,
  });
});

// Routes - /api/documents/* to match ALB path-based routing
app.use('/api/documents/agreements', agreementRoutes);
app.use('/api/documents/pdf', pdfRoutes);
app.use('/api/documents/repository', repositoryRoutes);

// Fast upload init endpoint (presigned S3 PUT)
app.post('/api/documents/upload/init', async (req, res, next) => {
  try {
    pruneExpiredUploadTokens();

    const fileName = toNullableString(req.body?.fileName);
    const fileSize = Number(req.body?.fileSize);
    const contentType = toNullableString(req.body?.contentType) || 'application/octet-stream';

    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'fileName is required' },
      });
    }

    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'fileSize must be greater than zero' },
      });
    }

    const key = buildUploadKey(fileName);
    const command = new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: key,
      ContentType: contentType,
      Metadata: {
        originalName: sanitizeFileName(fileName),
        uploadedBy: getUserIdFromHeaders(req) || 'anonymous',
      },
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: DIRECT_UPLOAD_URL_TTL_SECONDS,
    });

    const uploadToken = uuidv4();
    const expiresAt = Date.now() + DIRECT_UPLOAD_TOKEN_TTL_MS;

    directUploadTokenStore.set(uploadToken, {
      fileName,
      fileSize,
      contentType,
      key,
      bucket: DOCUMENTS_BUCKET,
      title: toNullableString(req.body?.title),
      description: toNullableString(req.body?.description),
      category: normalizeUploadCategory(req.body?.category),
      opportunityId: toNullableString(req.body?.opportunityId),
      accountId: toNullableString(req.body?.accountId),
      ownerId: toNullableString(req.body?.ownerId) || getUserIdFromHeaders(req),
      metadata: {
        uploadedVia: 'direct-upload',
      },
      expiresAt,
    });

    return res.json({
      success: true,
      data: {
        uploadUrl,
        uploadToken,
        key,
        contentType,
        expiresIn: DIRECT_UPLOAD_URL_TTL_SECONDS,
      },
    });
  } catch (error) {
    return next(error);
  }
});

// Fast upload complete endpoint (finalize DB record + links)
app.post('/api/documents/upload/complete', async (req, res, next) => {
  try {
    const uploadToken = toNullableString(req.body?.uploadToken);
    const pendingUpload = consumeUploadToken(uploadToken);

    if (!pendingUpload) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_UPLOAD_TOKEN', message: 'Upload token is invalid or expired' },
      });
    }

    const createdDocument = await persistUploadedDocument({
      fileName: pendingUpload.fileName,
      fileSize: pendingUpload.fileSize,
      contentType: pendingUpload.contentType,
      bucket: pendingUpload.bucket,
      key: pendingUpload.key,
      title: pendingUpload.title,
      description: pendingUpload.description,
      category: pendingUpload.category,
      opportunityId: pendingUpload.opportunityId,
      accountId: pendingUpload.accountId,
      ownerId: pendingUpload.ownerId,
      metadata: pendingUpload.metadata,
    });

    return res.json({
      success: true,
      data: {
        ...createdDocument,
        uploadMethod: 'direct',
      },
    });
  } catch (error) {
    return next(error);
  }
});

// Legacy multipart upload endpoint (fallback)
app.post('/api/documents/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' },
      });
    }

    const key = buildUploadKey(req.file.originalname);

    await s3Client.send(new PutObjectCommand({
      Bucket: DOCUMENTS_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype || 'application/octet-stream',
      Metadata: {
        originalName: sanitizeFileName(req.file.originalname),
        uploadedBy: getUserIdFromHeaders(req) || 'anonymous',
      },
    }));

    const createdDocument = await persistUploadedDocument({
      fileName: req.file.originalname,
      fileSize: req.file.size,
      contentType: req.file.mimetype,
      bucket: DOCUMENTS_BUCKET,
      key,
      title: toNullableString(req.body?.title),
      description: toNullableString(req.body?.description),
      category: normalizeUploadCategory(req.body?.category),
      opportunityId: toNullableString(req.body?.opportunityId),
      accountId: toNullableString(req.body?.accountId),
      ownerId: toNullableString(req.body?.ownerId) || getUserIdFromHeaders(req),
      metadata: {
        uploadedVia: 'multipart-fallback',
      },
    });

    return res.json({
      success: true,
      data: {
        fileId: createdDocument.id,
        key,
        url: createdDocument.downloadUrl,
        originalName: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
        document: createdDocument,
        uploadMethod: 'multipart',
      },
    });
  } catch (error) {
    return next(error);
  }
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Documents service running on port ${PORT}`);
});

export default app;
