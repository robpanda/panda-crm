// Documents Service - Entry Point
// Handles PandaSign e-signatures, document management, and file storage
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import multer from 'multer';

import agreementRoutes from './routes/agreements.js';
import pdfRoutes from './routes/pdf.js';
import repositoryRoutes from './routes/repository.js';
import contentBlockRoutes from './routes/contentBlocks.js';
import slateDocumentsRoutes from './routes/slateDocuments.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './middleware/logger.js';
import { prisma } from './lib/prisma.js';
import { fromContainerMetadata, fromInstanceMetadata } from '@aws-sdk/credential-provider-imds';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

dotenv.config();

const buildS3CredentialsProvider = () => {
  if (process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || process.env.AWS_CONTAINER_CREDENTIALS_FULL_URI) {
    logger.info('[Documents] Using ECS container credentials for S3');
    return fromContainerMetadata();
  }
  if (process.env.AWS_EC2_METADATA_DISABLED !== 'true' && process.env.AWS_EXECUTION_ENV?.includes('AWS_ECS') === false) {
    return fromInstanceMetadata();
  }
  return defaultProvider();
};

const createS3Client = async () => {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: process.env.AWS_REGION || 'us-east-2',
    credentials: buildS3CredentialsProvider(),
  });
};

const app = express();
const PORT = process.env.DOCUMENTS_PORT || 3009;

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// CORS configuration - allowed origins list
const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [
  'http://localhost:3000',
  'http://localhost:5173',
  'https://crm.pandaadmin.com',
  'https://crm.pandaexteriors.com',
  'https://bamboo.pandaadmin.com',
  'https://bamboo.pandaexteriors.com',
  'https://sign.pandaexteriors.com'
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-User-Id'],
  optionsSuccessStatus: 200,
};

// Middleware
app.use(helmet());

// Handle preflight OPTIONS requests FIRST
app.options('*', cors(corsOptions));

// Apply CORS to all requests
app.use(cors(corsOptions));

// Ensure CORS headers are always sent, even on error responses
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, X-User-Id');
  }
  next();
});

app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '50mb' }));

const fileTypeMap = {
  pdf: 'PDF',
  doc: 'WORD',
  docx: 'WORD',
  xls: 'EXCEL',
  xlsx: 'EXCEL',
  jpg: 'IMAGE',
  jpeg: 'IMAGE',
  png: 'IMAGE',
  gif: 'IMAGE',
  webp: 'IMAGE',
};

const getExtension = (filename = '') => {
  const last = filename.split('.').pop();
  return last ? last.toLowerCase() : '';
};

const getFileType = (ext) => fileTypeMap[ext] || 'OTHER';

// Health check - support both /health and /api/documents/health for ALB
const healthHandler = (req, res) => {
  res.json({
    status: 'healthy',
    service: 'documents',
    timestamp: new Date().toISOString(),
    features: ['agreements', 'templates', 'signatures', 'file-storage', 'pdf-generation', 'wysiwyg-editor', 'branding-profiles'],
  });
};
app.get('/health', healthHandler);
app.get('/api/documents/health', healthHandler);

// Routes - /api/documents/* to match ALB path-based routing
app.use('/api/documents/agreements', agreementRoutes);
app.use('/api/documents/pdf', pdfRoutes);
app.use('/api/documents/repository', repositoryRoutes);
app.use('/api/documents/content-blocks', contentBlockRoutes);
app.use('/api/documents/v2', slateDocumentsRoutes);  // WYSIWYG templates & branding
// v2 aliases for frontends that expect content blocks under /v2
app.use('/api/documents/v2/content-blocks', contentBlockRoutes);
// Back-compat: allow v2 routes without the /v2 prefix (e.g., /api/documents/templates)
app.use('/api/documents', slateDocumentsRoutes);

// Presigned upload - get S3 URL for direct upload
app.post('/api/documents/upload/presign', async (req, res, next) => {
  try {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { v4: uuidv4 } = await import('uuid');

    const {
      fileName,
      contentType = 'application/octet-stream',
      contentSize,
    } = req.body || {};

    if (!fileName) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'fileName is required' },
      });
    }

    const fileId = uuidv4();
    const ext = getExtension(fileName);
    const key = `uploads/${fileId}${ext ? `.${ext}` : ''}`;
    const bucket = process.env.DOCUMENTS_BUCKET || 'panda-crm-documents';

    const s3Client = await createS3Client();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    res.json({
      success: true,
      data: {
        fileId,
        key,
        uploadUrl,
        contentType,
        contentSize,
      },
    });
  } catch (error) {
    logger.error('Presign upload error:', error);
    next(error);
  }
});

// Complete upload - create document record + link after direct S3 upload
app.post('/api/documents/upload/complete', async (req, res, next) => {
  try {
    const { HeadObjectCommand } = await import('@aws-sdk/client-s3');

    const {
      fileId,
      key,
      originalName,
      contentType,
      size,
      opportunityId,
      accountId,
      category,
    } = req.body || {};

    if (!key || !originalName) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'key and originalName are required' },
      });
    }

    const bucket = process.env.DOCUMENTS_BUCKET || 'panda-crm-documents';
    const s3Client = await createS3Client();

    const head = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    const contentSize = head.ContentLength || size || 0;
    const resolvedContentType = head.ContentType || contentType || 'application/octet-stream';

    const uploadedBy = req.headers['x-user-id'] || 'anonymous';
    const ext = getExtension(originalName) || getExtension(key);
    const fileType = getFileType(ext);
    const url = `https://${bucket}.s3.amazonaws.com/${key}`;

    const document = await prisma.document.create({
      data: {
        title: originalName,
        fileName: originalName,
        fileType,
        fileExtension: ext,
        contentSize,
        contentUrl: url,
        sourceType: 'UPLOAD',
        ownerId: uploadedBy !== 'anonymous' ? uploadedBy : null,
        metadata: JSON.stringify({ category: category || 'other', uploadedAt: new Date().toISOString() }),
      },
    });

    if (opportunityId || accountId) {
      await prisma.documentLink.create({
        data: {
          documentId: document.id,
          opportunityId: opportunityId || null,
          accountId: accountId || null,
          linkedRecordType: opportunityId ? 'OPPORTUNITY' : 'ACCOUNT',
          shareType: 'V',
          visibility: 'AllUsers',
        },
      });
    }

    logger.info(`Document uploaded (direct): ${document.id} linked to opportunity: ${opportunityId || 'none'}`);

    res.json({
      success: true,
      data: {
        id: document.id,
        fileId,
        key,
        url,
        originalName,
        contentType: resolvedContentType,
        size: contentSize,
        category: category || 'other',
        opportunityId,
        accountId,
      },
    });
  } catch (error) {
    logger.error('Complete upload error:', error);
    next(error);
  }
});

// File upload endpoint - creates S3 object AND database record
app.post('/api/documents/upload', upload.single('file'), async (req, res, next) => {
  try {
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { v4: uuidv4 } = await import('uuid');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' },
      });
    }

    // Extract metadata from request body (FormData fields)
    const { opportunityId, accountId, category } = req.body;
    const uploadedBy = req.headers['x-user-id'] || 'anonymous';

    const s3Client = await createS3Client();
    const bucket = process.env.DOCUMENTS_BUCKET || 'panda-crm-documents';

    const fileId = uuidv4();
    const ext = req.file.originalname.split('.').pop()?.toLowerCase() || '';
    const key = `uploads/${fileId}.${ext}`;

    // Upload to S3
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        originalName: req.file.originalname,
        uploadedBy,
        category: category || 'other',
      },
    }));

    const url = `https://${bucket}.s3.amazonaws.com/${key}`;

    const fileType = getFileType(ext);

    // Create Document record in database
    const document = await prisma.document.create({
      data: {
        title: req.file.originalname,
        fileName: req.file.originalname,
        fileType,
        fileExtension: ext,
        contentSize: req.file.size,
        contentUrl: url,
        sourceType: 'UPLOAD',
        ownerId: uploadedBy !== 'anonymous' ? uploadedBy : null,
        metadata: JSON.stringify({ category: category || 'other', uploadedAt: new Date().toISOString() }),
      },
    });

    // Create DocumentLink to associate with opportunity or account
    if (opportunityId || accountId) {
      await prisma.documentLink.create({
        data: {
          documentId: document.id,
          opportunityId: opportunityId || null,
          accountId: accountId || null,
          linkedRecordType: opportunityId ? 'OPPORTUNITY' : 'ACCOUNT',
          shareType: 'V',
          visibility: 'AllUsers',
        },
      });
    }

    logger.info(`Document uploaded: ${document.id} linked to opportunity: ${opportunityId || 'none'}`);

    res.json({
      success: true,
      data: {
        id: document.id,
        fileId,
        key,
        url,
        originalName: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
        category: category || 'other',
        opportunityId,
        accountId,
      },
    });
  } catch (error) {
    logger.error('Document upload error:', error);
    next(error);
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
