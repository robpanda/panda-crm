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
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './middleware/logger.js';

dotenv.config();

const app = express();
const PORT = process.env.DOCUMENTS_PORT || 3009;

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://crm.pandaadmin.com',
    'https://crm.pandaexteriors.com',
    'https://sign.pandaexteriors.com'
  ],
  credentials: true,
}));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'documents',
    timestamp: new Date().toISOString(),
    features: ['agreements', 'templates', 'signatures', 'file-storage', 'pdf-generation'],
  });
});

// Routes - /api/documents/* to match ALB path-based routing
app.use('/api/documents/agreements', agreementRoutes);
app.use('/api/documents/pdf', pdfRoutes);
app.use('/api/documents/repository', repositoryRoutes);

// File upload endpoint
app.post('/api/documents/upload', upload.single('file'), async (req, res, next) => {
  try {
    const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { v4: uuidv4 } = await import('uuid');

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { code: 'NO_FILE', message: 'No file uploaded' },
      });
    }

    const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
    const bucket = process.env.DOCUMENTS_BUCKET || 'panda-crm-documents';

    const fileId = uuidv4();
    const ext = req.file.originalname.split('.').pop();
    const key = `uploads/${fileId}.${ext}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      Metadata: {
        originalName: req.file.originalname,
        uploadedBy: req.headers['x-user-id'] || 'anonymous',
      },
    }));

    const url = `https://${bucket}.s3.amazonaws.com/${key}`;

    res.json({
      success: true,
      data: {
        fileId,
        key,
        url,
        originalName: req.file.originalname,
        contentType: req.file.mimetype,
        size: req.file.size,
      },
    });
  } catch (error) {
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
