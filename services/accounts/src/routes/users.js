// User Routes
import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { userController } from '../controllers/userController.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const normalizeMergeIds = (body = {}) => {
  const masterUserId = String(
    body.masterUserId ||
      body.masterId ||
      body.primaryUserId ||
      body.keepUserId ||
      ''
  ).trim();

  const candidateList =
    body.duplicateUserIds ||
    body.duplicateIds ||
    body.sourceUserIds ||
    body.mergedUserIds ||
    body.userIds;

  const duplicateUserIds = Array.isArray(candidateList)
    ? candidateList
        .map((entry) => {
          if (!entry) return null;
          if (typeof entry === 'string') return entry;
          if (typeof entry === 'object') return entry.id || entry.userId || entry.value || null;
          return String(entry);
        })
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .filter((id) => id !== masterUserId)
    : [];

  return { masterUserId, duplicateUserIds };
};

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

// Merge duplicate users into a master user
router.post(
  '/merge',
  requireRole('admin', 'super_admin', 'system'),
  [
    body().custom((payload) => {
      const { masterUserId, duplicateUserIds } = normalizeMergeIds(payload);
      if (!masterUserId) {
        throw new Error('masterUserId is required');
      }
      if (!duplicateUserIds.length) {
        throw new Error('duplicateUserIds must contain at least one id');
      }
      return true;
    }),
    body('reason').optional().isString().withMessage('reason must be a string'),
    body('mergeReason').optional().isString().withMessage('mergeReason must be a string'),
    body('note').optional().isString().withMessage('note must be a string'),
  ],
  handleValidation,
  userController.merge
);

// Get single user
router.get('/:id', userController.get);

// Get direct reports
router.get('/:id/direct-reports', userController.getDirectReports);

// Update user (admin only)
router.put('/:id', requireRole('admin', 'super_admin', 'system'), userController.update);
router.patch('/:id', requireRole('admin', 'super_admin', 'system'), userController.patch);

// Terminate user and transfer ownership of active records
router.post(
  '/:id/terminate',
  requireRole('admin', 'super_admin', 'system'),
  [
    param('id').isString().notEmpty().withMessage('User id is required'),
    body('transferToUserId').isString().notEmpty().withMessage('transferToUserId is required'),
    body('reason').optional().isString(),
  ],
  handleValidation,
  userController.terminate
);

export default router;
