import { Router } from 'express';
import {
  listPayments,
  getPayment,
  createPayment,
  updatePayment,
  deletePayment,
  refundPayment,
  getPaymentsByInvoice,
  getPaymentStats,
  batchPayment,
} from '../controllers/paymentController.js';

const router = Router();

// Statistics (before :id to avoid conflicts)
router.get('/stats', getPaymentStats);

// Batch operations
router.post('/batch', batchPayment);

// By invoice
router.get('/invoice/:invoiceId', getPaymentsByInvoice);

// CRUD operations
router.get('/', listPayments);
router.get('/:id', getPayment);
router.post('/', createPayment);
router.put('/:id', updatePayment);
router.delete('/:id', deletePayment);

// Actions
router.post('/:id/refund', refundPayment);

export default router;
