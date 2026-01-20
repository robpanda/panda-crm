// Product Controller - HTTP Request Handlers
import { productService } from '../services/productService.js';
import { logger } from '../middleware/logger.js';

export const productController = {
  // GET /products
  async list(req, res, next) {
    try {
      const result = await productService.getProducts({
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50,
        sortBy: req.query.sortBy || 'name',
        sortOrder: req.query.sortOrder || 'asc',
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
        family: req.query.family,
        search: req.query.search,
      });

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /products/families
  async getFamilies(req, res, next) {
    try {
      const families = await productService.getProductFamilies();
      res.json({
        success: true,
        data: families,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /products/search
  async search(req, res, next) {
    try {
      const query = req.query.q;
      if (!query || query.length < 2) {
        return res.json({
          success: true,
          data: [],
        });
      }

      const products = await productService.searchProducts(query, parseInt(req.query.limit) || 10);
      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /products/:id
  async get(req, res, next) {
    try {
      const product = await productService.getProductById(req.params.id);
      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  },

  // POST /products
  async create(req, res, next) {
    try {
      const product = await productService.createProduct(req.body);
      res.status(201).json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /products/:id
  async update(req, res, next) {
    try {
      const product = await productService.updateProduct(req.params.id, req.body);
      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /products/:id
  async delete(req, res, next) {
    try {
      const product = await productService.deleteProduct(req.params.id);
      res.json({
        success: true,
        data: product,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default productController;
