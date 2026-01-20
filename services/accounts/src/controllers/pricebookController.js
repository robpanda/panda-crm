// Pricebook Controller - HTTP Request Handlers
import { pricebookService } from '../services/pricebookService.js';
import { logger } from '../middleware/logger.js';

export const pricebookController = {
  // GET /pricebooks
  async list(req, res, next) {
    try {
      const result = await pricebookService.getPricebooks({
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 25,
        sortBy: req.query.sortBy || 'name',
        sortOrder: req.query.sortOrder || 'asc',
        isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined,
        isStandard: req.query.isStandard !== undefined ? req.query.isStandard === 'true' : undefined,
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

  // GET /pricebooks/:id
  async get(req, res, next) {
    try {
      const pricebook = await pricebookService.getPricebookById(req.params.id);
      res.json({
        success: true,
        data: pricebook,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /pricebooks/:id/entries
  async getEntries(req, res, next) {
    try {
      const result = await pricebookService.getPricebookEntries(req.params.id, {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50,
        sortBy: req.query.sortBy || 'product',
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

  // POST /pricebooks
  async create(req, res, next) {
    try {
      const pricebook = await pricebookService.createPricebook(req.body);
      res.status(201).json({
        success: true,
        data: pricebook,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /pricebooks/:id
  async update(req, res, next) {
    try {
      const pricebook = await pricebookService.updatePricebook(req.params.id, req.body);
      res.json({
        success: true,
        data: pricebook,
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /pricebooks/:id
  async delete(req, res, next) {
    try {
      const pricebook = await pricebookService.deletePricebook(req.params.id);
      res.json({
        success: true,
        data: pricebook,
      });
    } catch (error) {
      next(error);
    }
  },

  // POST /pricebooks/:id/entries
  async addEntry(req, res, next) {
    try {
      const entry = await pricebookService.addPricebookEntry(req.params.id, req.body);
      res.status(201).json({
        success: true,
        data: entry,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /pricebooks/:id/entries/:entryId
  async updateEntry(req, res, next) {
    try {
      const entry = await pricebookService.updatePricebookEntry(req.params.entryId, req.body);
      res.json({
        success: true,
        data: entry,
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /pricebooks/:id/entries/:entryId
  async removeEntry(req, res, next) {
    try {
      await pricebookService.removePricebookEntry(req.params.entryId);
      res.json({
        success: true,
        message: 'Entry removed from pricebook',
      });
    } catch (error) {
      next(error);
    }
  },
};

export default pricebookController;
