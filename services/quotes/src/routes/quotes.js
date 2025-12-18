import { Router } from 'express';
import {
  listQuotes,
  getQuote,
  createQuote,
  updateQuote,
  deleteQuote,
  addLineItem,
  removeLineItem,
  acceptQuote,
  cloneQuote,
  getQuotesByOpportunity,
} from '../controllers/quoteController.js';

const router = Router();

// List quotes
router.get('/', listQuotes);

// By opportunity (the HUB view)
router.get('/opportunity/:opportunityId', getQuotesByOpportunity);

// CRUD
router.get('/:id', getQuote);
router.post('/', createQuote);
router.put('/:id', updateQuote);
router.delete('/:id', deleteQuote);

// Line items
router.post('/:id/line-items', addLineItem);
router.delete('/:id/line-items/:lineItemId', removeLineItem);

// Actions
router.post('/:id/accept', acceptQuote);
router.post('/:id/clone', cloneQuote);

export default router;
