// Global Error Handler for Documents Service
import { logger } from './logger.js';

export function errorHandler(err, req, res, next) {
  logger.error('Documents Error:', { message: err.message, stack: err.stack });

  // Document-specific errors
  if (err.name === 'DocumentNotFoundError') {
    return res.status(404).json({
      success: false,
      error: { code: 'DOCUMENT_NOT_FOUND', message: err.message },
    });
  }

  if (err.name === 'SignatureError') {
    return res.status(400).json({
      success: false,
      error: { code: 'SIGNATURE_ERROR', message: err.message },
    });
  }

  if (err.name === 'TemplateError') {
    return res.status(400).json({
      success: false,
      error: { code: 'TEMPLATE_ERROR', message: err.message },
    });
  }

  // Multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: { code: 'FILE_TOO_LARGE', message: 'File size exceeds the limit' },
    });
  }

  // Prisma errors
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: { code: 'DUPLICATE_ENTRY', message: 'A record with this value already exists' },
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Record not found' },
    });
  }

  // Generic errors
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
    },
  });
}

export default errorHandler;
