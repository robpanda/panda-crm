// Account Routes
import { Router } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { accountController } from '../controllers/accountController.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

// Validation middleware
const validateCreate = [
  body('name').trim().notEmpty().withMessage('Account name is required'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('phone').optional().isMobilePhone('any').withMessage('Invalid phone format'),
  body('type').optional().isIn(['RESIDENTIAL', 'COMMERCIAL', 'INSURANCE']),
  body('status').optional().isIn(['NEW', 'ACTIVE', 'ONBOARDING', 'IN_PRODUCTION', 'COMPLETED', 'INACTIVE']),
  body('billingState').optional().isLength({ min: 2, max: 2 }).withMessage('State must be 2-letter code'),
  body('billingPostalCode').optional().isPostalCode('US').withMessage('Invalid postal code'),
];

const validateUpdate = [
  param('id').notEmpty().withMessage('Account ID is required'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
  body('type').optional().isIn(['RESIDENTIAL', 'COMMERCIAL', 'INSURANCE']),
  body('status').optional().isIn(['NEW', 'ACTIVE', 'ONBOARDING', 'IN_PRODUCTION', 'COMPLETED', 'INACTIVE']),
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }).toInt().withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 5000 }).toInt().withMessage('Limit must be between 1 and 5000'), // Increased for dashboards
  query('sortBy').optional().isIn(['createdAt', 'updatedAt', 'name', 'status', 'totalSalesVolume']),
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

// Search (must be before /:id to avoid conflict)
router.get('/search', validatePagination, handleValidation, accountController.search);

// List accounts
router.get('/', validatePagination, handleValidation, accountController.list);

// Get by Salesforce ID
router.get('/salesforce/:salesforceId', accountController.getBySalesforceId);

// Admin: Get deleted accounts (for restore page) - must be before /:id
router.get('/deleted', requireRole('admin', 'super_admin', 'system'), async (req, res, next) => {
  try {
    const { accountService } = await import('../services/accountService.js');
    const result = await accountService.getDeletedAccounts({
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      search: req.query.search,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Get single account
router.get('/:id', accountController.get);

// Get account contacts
router.get('/:id/contacts', accountController.getContacts);

// Get account opportunities
router.get('/:id/opportunities', validatePagination, handleValidation, accountController.getOpportunities);

// Recalculate financials
router.post('/:id/recalculate-financials', accountController.recalculateFinancials);

// Create account
router.post('/', validateCreate, handleValidation, accountController.create);

// Update account (full)
router.put('/:id', validateUpdate, handleValidation, accountController.update);

// Update account (partial)
router.patch('/:id', validateUpdate, handleValidation, accountController.patch);

// Delete account (admin only)
router.delete('/:id', requireRole('admin', 'system'), accountController.delete);

// Bulk operations

// Bulk reassign accounts
router.post('/bulk-reassign', requireRole('admin', 'super_admin', 'system'), async (req, res, next) => {
  try {
    const { accountIds, newOwnerId } = req.body;
    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'accountIds array is required' } });
    }
    if (!newOwnerId) {
      return res.status(400).json({ success: false, error: { message: 'newOwnerId is required' } });
    }
    const { accountService } = await import('../services/accountService.js');
    const result = await accountService.bulkReassign(accountIds, newOwnerId);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Bulk update status
router.post('/bulk-update-status', requireRole('admin', 'super_admin', 'system'), async (req, res, next) => {
  try {
    const { accountIds, status } = req.body;
    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'accountIds array is required' } });
    }
    if (!status) {
      return res.status(400).json({ success: false, error: { message: 'status is required' } });
    }
    const { accountService } = await import('../services/accountService.js');
    const result = await accountService.bulkUpdateStatus(accountIds, status);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Bulk delete (soft delete)
router.post('/bulk-delete', requireRole('admin', 'super_admin', 'system'), async (req, res, next) => {
  try {
    const { accountIds } = req.body;
    if (!accountIds || !Array.isArray(accountIds) || accountIds.length === 0) {
      return res.status(400).json({ success: false, error: { message: 'accountIds array is required' } });
    }
    const { accountService } = await import('../services/accountService.js');
    // Pass audit context for tracking who performed the delete
    const auditContext = {
      userId: req.user?.id,
      userEmail: req.user?.email,
    };
    const result = await accountService.bulkDelete(accountIds, auditContext);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Admin: Restore a soft-deleted account
router.post('/:id/restore', requireRole('admin', 'super_admin', 'system'), async (req, res, next) => {
  try {
    const { accountService } = await import('../services/accountService.js');
    const result = await accountService.restoreAccount(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
