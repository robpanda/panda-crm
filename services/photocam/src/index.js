// Photocam Service - Entry Point
// Handles photo management, projects, checklists, annotations, galleries, and AI features
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import projectRoutes from './routes/projects.js';
import photoRoutes from './routes/photos.js';
import annotationRoutes from './routes/annotations.js';
import checklistRoutes from './routes/checklists.js';
import templateRoutes from './routes/templates.js';
import comparisonRoutes from './routes/comparisons.js';
import pageRoutes from './routes/pages.js';
import galleryRoutes from './routes/galleries.js';
import aiRoutes from './routes/ai.js';
import webhookRoutes from './routes/webhooks.js';
import { logger } from './middleware/logger.js';

// Initialize Prisma client
export const prisma = new PrismaClient();

dotenv.config();

const app = express();
const PORT = process.env.PHOTOCAM_PORT || 3013;

// Error handler
function errorHandler(err, req, res, next) {
  logger.error('Photocam Error:', { message: err.message, stack: err.stack });

  if (err.name === 'PhotocamError') {
    return res.status(400).json({
      success: false,
      error: { code: 'PHOTOCAM_ERROR', message: err.message },
    });
  }

  // Provide meaningful error messages for common failures
  let userMessage = 'An error occurred';
  let errorCode = err.code || 'INTERNAL_ERROR';

  if (err.message?.includes('not found')) {
    userMessage = err.message;
    errorCode = 'NOT_FOUND';
  } else if (err.message?.includes('S3')) {
    userMessage = 'Storage service error. Please try again later.';
    errorCode = 'STORAGE_ERROR';
  } else if (err.message?.includes('Rekognition') || err.message?.includes('Textract')) {
    userMessage = 'AI analysis service error. Please try again later.';
    errorCode = 'AI_SERVICE_ERROR';
  } else if (err.message?.includes('PrismaClient')) {
    userMessage = 'Database connection error. Please try again.';
    errorCode = 'DATABASE_ERROR';
  } else if (err.message?.includes('multer') || err.message?.includes('file')) {
    userMessage = 'File upload error. Please check file size and format.';
    errorCode = 'UPLOAD_ERROR';
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: userMessage,
      // Include details in non-production for debugging
      ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
    },
  });
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://crm.pandaadmin.com',
    'https://crm.pandaexteriors.com'
  ],
  credentials: true,
}));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check (ALB target group uses /health)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'photocam',
    timestamp: new Date().toISOString(),
    features: [
      'photo-projects',
      'photo-upload',
      'annotations',
      'checklists',
      'templates',
      'before-after-comparisons',
      'photo-pages',
      'galleries',
      'ai-analysis',
      'ai-reports',
    ],
  });
});

// Health check at /api/photocam/health for external access
app.get('/api/photocam/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'photocam',
    timestamp: new Date().toISOString(),
    features: [
      'photo-projects',
      'photo-upload',
      'annotations',
      'checklists',
      'templates',
      'before-after-comparisons',
      'photo-pages',
      'galleries',
      'ai-analysis',
      'ai-reports',
    ],
  });
});

// Diagnostic endpoint to check configuration
app.get('/api/photocam/diagnostics', (req, res) => {
  const checkEnv = (name) => process.env[name] ? 'configured' : 'missing';

  res.json({
    success: true,
    data: {
      s3: {
        bucket: checkEnv('PHOTOCAM_S3_BUCKET'),
        region: checkEnv('AWS_REGION'),
      },
      ai: {
        openaiKey: checkEnv('OPENAI_API_KEY'),
        rekognition: 'available', // AWS SDK uses IAM role
        textract: 'available',
      },
      lambda: {
        imageProcessor: checkEnv('IMAGE_PROCESSOR_LAMBDA'),
        aiAnalyzer: checkEnv('AI_ANALYZER_LAMBDA'),
      },
      database: {
        url: checkEnv('DATABASE_URL'),
      },
      cognito: {
        userPoolId: checkEnv('COGNITO_USER_POOL_ID'),
        clientId: checkEnv('COGNITO_CLIENT_ID'),
      },
    },
  });
});

// Routes - /api/photocam/* to match ALB path-based routing
app.use('/api/photocam/projects', projectRoutes);
app.use('/api/photocam/photos', photoRoutes);
app.use('/api/photocam/annotations', annotationRoutes);
app.use('/api/photocam/checklists', checklistRoutes);
app.use('/api/photocam/templates', templateRoutes);
app.use('/api/photocam/comparisons', comparisonRoutes);
app.use('/api/photocam/pages', pageRoutes);
app.use('/api/photocam/galleries', galleryRoutes);
app.use('/api/photocam/ai', aiRoutes);
app.use('/api/photocam/webhooks', webhookRoutes);

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
  logger.info(`Photocam service running on port ${PORT}`);
});

export default app;
