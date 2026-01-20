// Account Controller - HTTP Request Handlers
import { accountService } from '../services/accountService.js';
import { logger } from '../middleware/logger.js';

export const accountController = {
  // GET /accounts
  async list(req, res, next) {
    try {
      const result = await accountService.getAccounts({
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'desc',
        status: req.query.status,
        type: req.query.type,
        ownerId: req.query.ownerId,
        state: req.query.state,
        search: req.query.search,
        isPandaClaims: req.query.isPandaClaims,
      });

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /accounts/:id
  async get(req, res, next) {
    try {
      const account = await accountService.getAccountById(req.params.id);
      res.json({
        success: true,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /accounts/salesforce/:salesforceId
  async getBySalesforceId(req, res, next) {
    try {
      const account = await accountService.getAccountBySalesforceId(req.params.salesforceId);
      res.json({
        success: true,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  },

  // POST /accounts
  async create(req, res, next) {
    try {
      const account = await accountService.createAccount(req.body);
      res.status(201).json({
        success: true,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /accounts/:id
  async update(req, res, next) {
    try {
      const account = await accountService.updateAccount(req.params.id, req.body);
      res.json({
        success: true,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  },

  // PATCH /accounts/:id
  async patch(req, res, next) {
    try {
      const account = await accountService.updateAccount(req.params.id, req.body);
      res.json({
        success: true,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  },

  // DELETE /accounts/:id
  async delete(req, res, next) {
    try {
      const hardDelete = req.query.hard === 'true';
      const result = hardDelete
        ? await accountService.hardDeleteAccount(req.params.id)
        : await accountService.deleteAccount(req.params.id);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /accounts/:id/contacts
  async getContacts(req, res, next) {
    try {
      const contacts = await accountService.getAccountContacts(req.params.id);
      res.json({
        success: true,
        data: contacts,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /accounts/:id/opportunities
  async getOpportunities(req, res, next) {
    try {
      const result = await accountService.getAccountOpportunities(req.params.id, {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        stage: req.query.stage,
      });
      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  // POST /accounts/:id/recalculate-financials
  async recalculateFinancials(req, res, next) {
    try {
      await accountService.updateAccountFinancials(req.params.id);
      const account = await accountService.getAccountById(req.params.id);
      res.json({
        success: true,
        data: {
          totalSalesVolume: account.totalSalesVolume,
          totalPaidAmount: account.totalPaidAmount,
          balanceDue: account.balanceDue,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /accounts/search
  async search(req, res, next) {
    try {
      const query = req.query.q;
      if (!query || query.length < 2) {
        return res.json({
          success: true,
          data: [],
        });
      }

      const accounts = await accountService.searchAccounts(query, parseInt(req.query.limit) || 10);
      res.json({
        success: true,
        data: accounts,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default accountController;
