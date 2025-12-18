import { Router } from 'express';
import {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  sendInvoice,
  voidInvoice,
  applyLateFee,
  getInvoicesByAccount,
  getInvoiceStats,
  updateOverdueStatus,
} from '../controllers/invoiceController.js';

const router = Router();

// Statistics (before :id to avoid conflicts)
router.get('/stats', getInvoiceStats);

// Batch operations
router.post('/update-overdue', updateOverdueStatus);

// By account
router.get('/account/:accountId', getInvoicesByAccount);

// CRUD operations
router.get('/', listInvoices);
router.get('/:id', getInvoice);
router.post('/', createInvoice);
router.put('/:id', updateInvoice);
router.delete('/:id', deleteInvoice);

// Actions
router.post('/:id/send', sendInvoice);
router.post('/:id/void', voidInvoice);
router.post('/:id/late-fee', applyLateFee);

export default router;
