// User Routes
import { Router } from 'express';
import { param, query, validationResult } from 'express-validator';
import { userController } from '../controllers/userController.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// Validation middleware
const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'lastName', 'firstName', 'email', 'department', 'officeAssignment']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

// Validation error handler
const handleValidation = (req, res, next) => {
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

// Routes

// Stats (must be before /:id to avoid conflict)
router.get('/stats', userController.stats);

// Search
router.get('/search', userController.search);

// Dropdown (minimal data for selects)
router.get('/dropdown', userController.dropdown);

// List users
router.get('/', validatePagination, handleValidation, userController.list);

// Get by Salesforce ID
router.get('/salesforce/:salesforceId', userController.getBySalesforceId);

// Get by email (for auth context lookup)
router.get('/email/:email', userController.getByEmail);

// Get single user
router.get('/:id', userController.get);

// Get direct reports
router.get('/:id/direct-reports', userController.getDirectReports);

// Update user (admin only)
router.put('/:id', requireRole('admin', 'super_admin', 'system'), userController.update);
router.patch('/:id', requireRole('admin', 'super_admin', 'system'), userController.patch);

export default router;
