// Validation Middleware - Shared validation error handler
import { validationResult } from 'express-validator';

/**
 * Handle validation errors from express-validator
 * Use after express-validator middleware chain
 */
export const handleValidation = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors.array(),
      },
    });
  }
  next();
};

export default { handleValidation };
