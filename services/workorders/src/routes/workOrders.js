import { Router } from 'express';
import {
  listWorkOrders,
  getWorkOrder,
  createWorkOrder,
  updateWorkOrder,
  deleteWorkOrder,
  getWorkOrdersByOpportunity,
  getWorkOrderStats,
  getWorkTypes,
} from '../controllers/workOrderController.js';

const router = Router();

// List and stats
router.get('/', listWorkOrders);
router.get('/stats', getWorkOrderStats);
router.get('/types', getWorkTypes);

// By opportunity (the HUB view)
router.get('/opportunity/:opportunityId', getWorkOrdersByOpportunity);

// CRUD
router.get('/:id', getWorkOrder);
router.post('/', createWorkOrder);
router.put('/:id', updateWorkOrder);
router.delete('/:id', deleteWorkOrder);

export default router;
