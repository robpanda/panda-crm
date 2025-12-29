// Product Routes
import { Router } from 'express';
import { query, body, param, validationResult } from 'express-validator';
import { productController } from '../controllers/productController.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// Validation middleware
const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('sortBy').optional().isIn(['name', 'productCode', 'family', 'createdAt', 'updatedAt']),
  query('sortOrder').optional().isIn(['asc', 'desc']),
];

const validateCreate = [
  body('name').trim().notEmpty().withMessage('Product name is required'),
  body('productCode').optional().trim(),
  body('family').optional().trim(),
  body('unitPrice').optional().isDecimal().withMessage('Unit price must be a decimal'),
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

// Get product families (must be before /:id to avoid conflict)
router.get('/families', productController.getFamilies);

// Search products (must be before /:id to avoid conflict)
router.get('/search', productController.search);

// List products
router.get('/', validatePagination, handleValidation, productController.list);

// Get single product
router.get('/:id', productController.get);

// Create product (admin only)
router.post('/', requireRole('admin', 'system'), validateCreate, handleValidation, productController.create);

// Update product (admin only)
router.put('/:id', requireRole('admin', 'system'), productController.update);

// Delete product (admin only)
router.delete('/:id', requireRole('admin', 'system'), productController.delete);

export default router;
