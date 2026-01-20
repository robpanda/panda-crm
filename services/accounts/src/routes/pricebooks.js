// Pricebook Routes
import { Router } from 'express';
import { query, body, param, validationResult } from 'express-validator';
import { pricebookController } from '../controllers/pricebookController.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// Validation middleware
const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('sortBy').optional().isIn(['name', 'createdAt', 'updatedAt']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

const validateCreate = [
  body('name').trim().notEmpty().withMessage('Pricebook name is required'),
  body('description').optional().trim(),
  body('isActive').optional().isBoolean(),
  body('isStandard').optional().isBoolean(),
];

const validateEntry = [
  body('productId').notEmpty().withMessage('Product ID is required'),
  body('unitPrice').isDecimal().withMessage('Unit price must be a decimal'),
  body('useStandardPrice').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
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

// List pricebooks
router.get('/', validatePagination, handleValidation, pricebookController.list);

// Get single pricebook
router.get('/:id', pricebookController.get);

// Get pricebook entries
router.get('/:id/entries', validatePagination, handleValidation, pricebookController.getEntries);

// Create pricebook (admin only)
router.post('/', requireRole('admin', 'system'), validateCreate, handleValidation, pricebookController.create);

// Update pricebook (admin only)
router.put('/:id', requireRole('admin', 'system'), pricebookController.update);

// Delete pricebook (admin only)
router.delete('/:id', requireRole('admin', 'system'), pricebookController.delete);

// Add entry to pricebook (admin only)
router.post('/:id/entries', requireRole('admin', 'system'), validateEntry, handleValidation, pricebookController.addEntry);

// Update pricebook entry (admin only)
router.put('/:id/entries/:entryId', requireRole('admin', 'system'), pricebookController.updateEntry);

// Remove entry from pricebook (admin only)
router.delete('/:id/entries/:entryId', requireRole('admin', 'system'), pricebookController.removeEntry);

export default router;
