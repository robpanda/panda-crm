// Opportunity Routes
import { Router } from 'express';
import { body, query } from 'express-validator';
import { opportunityService } from '../services/opportunityService.js';

const router = Router();

// Validation error handler
const handleValidation = async (req, res, next) => {
  const { validationResult } = await import('express-validator');
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: errors.array() },
    });
  }
  next();
};

// Validation rules
const validateCreate = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('accountId').notEmpty().withMessage('Account ID is required'),
  body('type').optional().isIn(['INSURANCE', 'RETAIL', 'COMMERCIAL']),
  body('stage').optional().isIn([
    'LEAD_UNASSIGNED', 'LEAD_ASSIGNED', 'SCHEDULED', 'INSPECTED',
    'CLAIM_FILED', 'APPROVED', 'CONTRACT_SIGNED', 'IN_PRODUCTION',
    'COMPLETED', 'CLOSED_WON', 'CLOSED_LOST',
  ]),
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('stage').optional(),
  query('type').optional().isIn(['all', 'INSURANCE', 'RETAIL', 'COMMERCIAL']),
  query('ownerFilter').optional().isIn(['mine', 'all']),
];

// Get stage counts for dashboard
router.get('/counts', async (req, res, next) => {
  try {
    const counts = await opportunityService.getStageCounts(req.user?.id, req.query.ownerFilter);
    res.json({ success: true, data: counts });
  } catch (error) {
    next(error);
  }
});

// List opportunities
router.get('/', validatePagination, handleValidation, async (req, res, next) => {
  try {
    const result = await opportunityService.getOpportunities({
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50,
      stage: req.query.stage,
      type: req.query.type,
      ownerId: req.query.ownerId,
      ownerFilter: req.query.ownerFilter,
      accountId: req.query.accountId,
      search: req.query.search,
      sortBy: req.query.sortBy || 'createdAt',
      sortOrder: req.query.sortOrder || 'desc',
      currentUserId: req.user?.id,
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Get opportunity details (HUB view)
router.get('/:id', async (req, res, next) => {
  try {
    const opportunity = await opportunityService.getOpportunityDetails(req.params.id);
    res.json({ success: true, data: opportunity });
  } catch (error) {
    next(error);
  }
});

// Get work orders and service appointments
router.get('/:id/work-orders', async (req, res, next) => {
  try {
    const workOrders = await opportunityService.getOpportunityWorkOrders(req.params.id);
    res.json({ success: true, data: workOrders });
  } catch (error) {
    next(error);
  }
});

// Get quotes
router.get('/:id/quotes', async (req, res, next) => {
  try {
    const quotes = await opportunityService.getOpportunityQuotes(req.params.id);
    res.json({ success: true, data: quotes });
  } catch (error) {
    next(error);
  }
});

// Get contacts
router.get('/:id/contacts', async (req, res, next) => {
  try {
    const contacts = await opportunityService.getOpportunityContacts(req.params.id);
    res.json({ success: true, data: contacts });
  } catch (error) {
    next(error);
  }
});

// Create opportunity
router.post('/', validateCreate, handleValidation, async (req, res, next) => {
  try {
    const opportunity = await opportunityService.createOpportunity({
      ...req.body,
      ownerId: req.body.ownerId || req.user?.id,
    });
    res.status(201).json({ success: true, data: opportunity });
  } catch (error) {
    next(error);
  }
});

// Update opportunity
router.put('/:id', async (req, res, next) => {
  try {
    const opportunity = await opportunityService.updateOpportunity(req.params.id, req.body);
    res.json({ success: true, data: opportunity });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const opportunity = await opportunityService.updateOpportunity(req.params.id, req.body);
    res.json({ success: true, data: opportunity });
  } catch (error) {
    next(error);
  }
});

// Delete opportunity
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await opportunityService.deleteOpportunity(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
