import express from 'express';
import {
  getOrderTemplates,
  getOrderTemplate,
  createOrderTemplate,
  updateOrderTemplate,
  deleteOrderTemplate,
  getProductCategories,
  seedOrderTemplates,
  seedProductCategories,
} from '../controllers/orderTemplateController.js';

const router = express.Router();

// Product categories for material ordering UI
router.get('/categories', getProductCategories);

// Seed routes (for initial setup)
router.post('/seed', seedOrderTemplates);
router.post('/seed-categories', seedProductCategories);

// Order templates CRUD
router.get('/', getOrderTemplates);
router.get('/:id', getOrderTemplate);
router.post('/', createOrderTemplate);
router.put('/:id', updateOrderTemplate);
router.delete('/:id', deleteOrderTemplate);

export default router;
