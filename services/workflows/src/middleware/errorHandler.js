// Global Error Handler for Workflows Service
import { logger } from './logger.js';

export function errorHandler(err, req, res, next) {
  logger.error('Workflow Error:', { message: err.message, stack: err.stack });

  // Workflow-specific errors
  if (err.name === 'WorkflowNotFoundError') {
    return res.status(404).json({
      success: false,
      error: { code: 'WORKFLOW_NOT_FOUND', message: err.message },
    });
  }

  if (err.name === 'WorkflowExecutionError') {
    return res.status(500).json({
      success: false,
      error: { code: 'WORKFLOW_EXECUTION_FAILED', message: err.message },
    });
  }

  if (err.name === 'InvalidTriggerError') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_TRIGGER', message: err.message },
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
