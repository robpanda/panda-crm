// Standardized Error Handling Middleware
// Provides consistent error responses across all services

/**
 * Custom Application Error class
 * Use this for business logic errors with specific error codes
 */
export class AppError extends Error {
  constructor(message, code = 'INTERNAL_ERROR', statusCode = 500, details = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true; // Distinguishes from programming errors

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation Error - 400 Bad Request
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Not Found Error - 404
 */
export class NotFoundError extends AppError {
  constructor(resource = 'Resource', id = null) {
    const message = id ? `${resource} with ID ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
    this.resource = resource;
  }
}

/**
 * Authentication Error - 401 Unauthorized
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * Authorization Error - 403 Forbidden
 */
export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * Conflict Error - 409 (e.g., duplicate record)
 */
export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

/**
 * Rate Limit Error - 429 Too Many Requests
 */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests, please try again later', retryAfter = 60) {
    super(message, 'RATE_LIMITED', 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * External Service Error - 502 Bad Gateway
 */
export class ExternalServiceError extends AppError {
  constructor(serviceName, originalError = null) {
    super(`Error communicating with ${serviceName}`, 'EXTERNAL_SERVICE_ERROR', 502);
    this.name = 'ExternalServiceError';
    this.serviceName = serviceName;
    this.originalError = originalError;
  }
}

/**
 * Map Prisma errors to AppErrors
 */
function handlePrismaError(error) {
  // Prisma error codes: https://www.prisma.io/docs/reference/api-reference/error-reference
  switch (error.code) {
    case 'P2002': // Unique constraint violation
      const field = error.meta?.target?.[0] || 'field';
      return new ConflictError(`A record with this ${field} already exists`);

    case 'P2025': // Record not found
      return new NotFoundError('Record');

    case 'P2003': // Foreign key constraint failed
      return new ValidationError('Referenced record does not exist', { constraint: error.meta?.field_name });

    case 'P2014': // Required relation violation
      return new ValidationError('Required relation is missing');

    case 'P2016': // Query interpretation error
      return new ValidationError('Invalid query parameters');

    default:
      return null; // Let it fall through to generic handler
  }
}

/**
 * Map JWT/Auth errors
 */
function handleAuthError(error) {
  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid token');
  }
  if (error.name === 'TokenExpiredError') {
    return new AuthenticationError('Token has expired');
  }
  if (error.name === 'NotBeforeError') {
    return new AuthenticationError('Token not yet valid');
  }
  return null;
}

/**
 * Async handler wrapper - wraps async route handlers to catch errors
 * Usage: router.get('/path', asyncHandler(async (req, res) => { ... }))
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Request validation middleware factory
 * Usage: router.post('/path', validateRequest(schema), handler)
 */
export const validateRequest = (schema) => (req, res, next) => {
  // Supports Joi, Zod, or custom validators
  const { error, value } = typeof schema.validate === 'function'
    ? schema.validate(req.body, { abortEarly: false })
    : { error: null, value: req.body };

  if (error) {
    const details = error.details?.map(d => ({
      field: d.path?.join('.'),
      message: d.message,
    })) || [{ message: error.message }];

    return next(new ValidationError('Validation failed', details));
  }

  req.validatedBody = value;
  next();
};

/**
 * Main error handler middleware
 * This should be the last middleware added to Express
 */
export const errorHandler = (err, req, res, next) => {
  // Log error for debugging
  const logError = {
    message: err.message,
    code: err.code,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
  };

  // Don't log 404s at error level
  if (err.statusCode === 404) {
    console.log('Not Found:', req.path);
  } else {
    console.error('Error:', JSON.stringify(logError, null, 2));
  }

  // If it's already an AppError, use it directly
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details && { details: err.details }),
        ...(err.retryAfter && { retryAfter: err.retryAfter }),
      },
    });
  }

  // Try to handle Prisma errors
  const prismaError = handlePrismaError(err);
  if (prismaError) {
    return res.status(prismaError.statusCode).json({
      success: false,
      error: {
        code: prismaError.code,
        message: prismaError.message,
        ...(prismaError.details && { details: prismaError.details }),
      },
    });
  }

  // Try to handle auth errors
  const authError = handleAuthError(err);
  if (authError) {
    return res.status(authError.statusCode).json({
      success: false,
      error: {
        code: authError.code,
        message: authError.message,
      },
    });
  }

  // Handle multer file upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'FILE_TOO_LARGE',
        message: 'File size exceeds the maximum allowed limit',
      },
    });
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'UNEXPECTED_FILE',
        message: 'Unexpected file field',
      },
    });
  }

  // Handle syntax errors (bad JSON)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
      },
    });
  }

  // Default to 500 Internal Server Error for unexpected errors
  const statusCode = err.statusCode || err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'An unexpected error occurred'
    : err.message;

  res.status(statusCode).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
};

/**
 * 404 Not Found handler - add before errorHandler
 */
export const notFoundHandler = (req, res, next) => {
  next(new NotFoundError(`Route ${req.method} ${req.path}`));
};

/**
 * Request logger middleware
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      userId: req.user?.id,
    };

    if (res.statusCode >= 400) {
      console.warn('Request:', JSON.stringify(log));
    } else {
      console.log('Request:', JSON.stringify(log));
    }
  });

  next();
};

export default {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  asyncHandler,
  validateRequest,
  errorHandler,
  notFoundHandler,
  requestLogger,
};
