// Contact Routes
import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { contactService } from '../services/contactService.js';

const router = Router();

// Validation error handler
const handleValidation = async (req, res, next) => {
  const { validationResult } = await import('express-validator');
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

// Validation rules
const validateCreate = [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').optional().isEmail().withMessage('Invalid email format'),
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
  query('prospectFilter').optional().isIn([
    'past_customers',
    'recent_closed',
    'upsell_candidates',
    'review_eligible',
    'high_value',
  ]),
];

// Routes

// Get review-eligible contacts (for Google Reviews outreach)
router.get('/review-eligible', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const contacts = await contactService.getReviewEligibleContacts(limit);
    res.json({ success: true, data: contacts });
  } catch (error) {
    next(error);
  }
});

// List contacts with prospecting overlays
router.get('/', validatePagination, handleValidation, async (req, res, next) => {
  try {
    const result = await contactService.getContacts({
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      search: req.query.search,
      accountId: req.query.accountId,
      prospectFilter: req.query.prospectFilter,
      sortBy: req.query.sortBy || 'updatedAt',
      sortOrder: req.query.sortOrder || 'desc',
    });
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

// Get contact details
router.get('/:id', async (req, res, next) => {
  try {
    const result = await contactService.getContactDetails(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Get contact's opportunities
router.get('/:id/opportunities', async (req, res, next) => {
  try {
    const opportunities = await contactService.getContactOpportunities(req.params.id);
    res.json({ success: true, data: opportunities });
  } catch (error) {
    next(error);
  }
});

// Get contact's cases
router.get('/:id/cases', async (req, res, next) => {
  try {
    const cases = await contactService.getContactCases(req.params.id);
    res.json({ success: true, data: cases });
  } catch (error) {
    next(error);
  }
});

// Create contact
router.post('/', validateCreate, handleValidation, async (req, res, next) => {
  try {
    const contact = await contactService.createContact(req.body);
    res.status(201).json({ success: true, data: contact });
  } catch (error) {
    next(error);
  }
});

// Update contact
router.put('/:id', async (req, res, next) => {
  try {
    const contact = await contactService.updateContact(req.params.id, req.body);
    res.json({ success: true, data: contact });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const contact = await contactService.updateContact(req.params.id, req.body);
    res.json({ success: true, data: contact });
  } catch (error) {
    next(error);
  }
});

// Delete contact
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await contactService.deleteContact(req.params.id);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
