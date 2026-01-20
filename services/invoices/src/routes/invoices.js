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
  processLateFees,
  getLateFeesSummary,
  getInvoicesByAccount,
  getInvoiceStats,
  updateOverdueStatus,
  generateInvoicePdf,
  getInvoicePdf,
} from '../controllers/invoiceController.js';

const router = Router();

// Statistics (before :id to avoid conflicts)
router.get('/stats', getInvoiceStats);

// Batch operations
router.post('/update-overdue', updateOverdueStatus);
router.post('/process-late-fees', processLateFees); // Batch process late fees for all overdue invoices

// Late fee summary by account
router.get('/late-fees/account/:accountId', getLateFeesSummary);

// By account
router.get('/account/:accountId', getInvoicesByAccount);

// CRUD operations
router.get('/', listInvoices);
router.get('/:id', getInvoice);
router.post('/', createInvoice);
router.put('/:id', updateInvoice);
router.delete('/:id', deleteInvoice);

// PDF operations
router.get('/:id/pdf', getInvoicePdf);
router.post('/:id/pdf', generateInvoicePdf);

// Actions
router.post('/:id/send', sendInvoice);
router.post('/:id/void', voidInvoice);
router.post('/:id/late-fee', applyLateFee); // Apply late fee to single invoice

export default router;
