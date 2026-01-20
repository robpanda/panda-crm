import express from 'express';
import {
  getMaterialOrders,
  getMaterialOrderCounts,
  getMaterialOrder,
  createMaterialOrder,
  updateMaterialOrder,
  updateMaterialOrderStatus,
  bulkUpdateStatus,
  deleteMaterialOrder,
  getSuppliers,
  upsertSupplier,
  submitToAbcSupply,
  getOrdersForCalendar,
} from '../controllers/materialOrderController.js';

const router = express.Router();

// Material order counts (for W/O/D tabs)
router.get('/counts', getMaterialOrderCounts);

// Calendar view (material deliveries)
router.get('/calendar', getOrdersForCalendar);

// Suppliers
router.get('/suppliers', getSuppliers);
router.post('/suppliers', upsertSupplier);

// Bulk operations
router.post('/bulk-status', bulkUpdateStatus);

// Individual material orders
router.get('/', getMaterialOrders);
router.get('/:id', getMaterialOrder);
router.post('/', createMaterialOrder);
router.put('/:id', updateMaterialOrder);
router.patch('/:id/status', updateMaterialOrderStatus);
router.delete('/:id', deleteMaterialOrder);

// ABC Supply integration
router.post('/:id/submit-abc', submitToAbcSupply);

export default router;
