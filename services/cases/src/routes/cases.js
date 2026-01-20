import { Router } from 'express';
import {
  listCases,
  getCase,
  createCase,
  updateCase,
  deleteCase,
  getCasesByAccount,
  getCasesByOpportunity,
  getCaseStats,
  escalateCase,
  closeCase,
  reopenCase,
  addCaseComment,
  getCaseComments,
} from '../controllers/caseController.js';

const router = Router();

// Statistics (before :id to avoid conflicts)
router.get('/stats', getCaseStats);

// By account
router.get('/account/:accountId', getCasesByAccount);

// By opportunity (via account)
router.get('/opportunity/:opportunityId', getCasesByOpportunity);

// CRUD operations
router.get('/', listCases);
router.get('/:id', getCase);
router.post('/', createCase);
router.put('/:id', updateCase);
router.delete('/:id', deleteCase);

// Actions
router.post('/:id/escalate', escalateCase);
router.post('/:id/close', closeCase);
router.post('/:id/reopen', reopenCase);

// Comments
router.get('/:id/comments', getCaseComments);
router.post('/:id/comments', addCaseComment);

export default router;
