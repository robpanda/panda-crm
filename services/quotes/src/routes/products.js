import { Router } from 'express';
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
  searchProducts,
  bulkImportProducts,
} from '../controllers/productController.js';

const router = Router();

// List and search
router.get('/', listProducts);
router.get('/search', searchProducts);
router.get('/categories', getCategories);

// CRUD
router.get('/:id', getProduct);
router.post('/', createProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);

// Bulk operations
router.post('/bulk-import', bulkImportProducts);

export default router;
