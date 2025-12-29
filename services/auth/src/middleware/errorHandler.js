// Global Error Handler for Auth Service
import { logger } from './logger.js';

// Helper to get error name from AWS SDK v3 errors
function getErrorName(err) {
  // AWS SDK v3 uses err.name or err.__type
  return err.name || err.__type || err.code || '';
}

export function errorHandler(err, req, res, next) {
  const errorName = getErrorName(err);
  logger.error('Auth Error:', { name: errorName, message: err.message, stack: err.stack });

  // Cognito-specific errors
  if (errorName === 'NotAuthorizedException' || errorName.includes('NotAuthorizedException')) {
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
  }

  if (errorName === 'UserNotFoundException' || errorName.includes('UserNotFoundException')) {
    // Return same message as invalid credentials to prevent user enumeration
    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
  }

  if (err.name === 'UserNotConfirmedException') {
    return res.status(403).json({
      success: false,
      error: { code: 'USER_NOT_CONFIRMED', message: 'Please verify your email address' },
    });
  }

  if (err.name === 'UsernameExistsException') {
    return res.status(409).json({
      success: false,
      error: { code: 'USER_EXISTS', message: 'A user with this email already exists' },
    });
  }

  if (err.name === 'InvalidPasswordException') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_PASSWORD', message: err.message || 'Password does not meet requirements' },
    });
  }

  if (err.name === 'CodeMismatchException') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_CODE', message: 'Invalid verification code' },
    });
  }

  if (err.name === 'ExpiredCodeException') {
    return res.status(400).json({
      success: false,
      error: { code: 'EXPIRED_CODE', message: 'Verification code has expired' },
    });
  }

  if (err.name === 'LimitExceededException') {
    return res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
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
