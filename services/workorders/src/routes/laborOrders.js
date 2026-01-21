import express from 'express';
import {
  getLaborOrders,
  getLaborOrderCounts,
  getLaborOrder,
  createLaborOrder,
  updateLaborOrder,
  updateLaborOrderStatus,
  deleteLaborOrder,
  getLaborPriceBookItems,
  getDefaultLaborItems,
} from '../controllers/laborOrderController.js';

const router = express.Router();

// Counts (for status tabs)
router.get('/counts', getLaborOrderCounts);

// Price book items for labor ordering UI
router.get('/pricebook-items', getLaborPriceBookItems);

// Default labor items by work type
router.get('/defaults/:workType', getDefaultLaborItems);

// Labor orders CRUD
router.get('/', getLaborOrders);
router.get('/:id', getLaborOrder);
router.post('/', createLaborOrder);
router.put('/:id', updateLaborOrder);
router.patch('/:id/status', updateLaborOrderStatus);
router.delete('/:id', deleteLaborOrder);

export default router;
