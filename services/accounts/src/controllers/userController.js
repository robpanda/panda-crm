// User Controller - HTTP Request Handlers
import { userService } from '../services/userService.js';
import { logger } from '../middleware/logger.js';

export const userController = {
  // GET /users
  async list(req, res, next) {
    try {
      const result = await userService.getUsers({
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 20,
        sortBy: req.query.sortBy || 'lastName',
        sortOrder: req.query.sortOrder || 'asc',
        search: req.query.search,
        status: req.query.status,
        department: req.query.department,
        officeAssignment: req.query.officeAssignment,
        isActive: req.query.isActive,
        managerId: req.query.managerId,
        directorId: req.query.directorId,
      });

      res.json({
        success: true,
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /users/stats
  async stats(req, res, next) {
    try {
      const stats = await userService.getUserStats();
      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /users/dropdown
  async dropdown(req, res, next) {
    try {
      const users = await userService.getUsersForDropdown({
        isActive: req.query.isActive !== 'false',
        search: req.query.search,
        role: req.query.role,
        department: req.query.department,
      });
      res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /users/search
  async search(req, res, next) {
    try {
      const query = req.query.q;
      if (!query || query.length < 2) {
        return res.json({
          success: true,
          data: [],
        });
      }

      const users = await userService.searchUsers(query, parseInt(req.query.limit) || 10);
      res.json({
        success: true,
        data: users,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /users/:id
  async get(req, res, next) {
    try {
      const user = await userService.getUserById(req.params.id);
      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /users/salesforce/:salesforceId
  async getBySalesforceId(req, res, next) {
    try {
      const user = await userService.getUserBySalesforceId(req.params.salesforceId);
      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /users/email/:email
  async getByEmail(req, res, next) {
    try {
      const user = await userService.getUserByEmail(req.params.email);
      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  // PUT /users/:id
  async update(req, res, next) {
    try {
      const user = await userService.updateUser(req.params.id, req.body);
      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  // PATCH /users/:id
  async patch(req, res, next) {
    try {
      const user = await userService.updateUser(req.params.id, req.body);
      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  },

  // GET /users/:id/direct-reports
  async getDirectReports(req, res, next) {
    try {
      const reports = await userService.getDirectReports(req.params.id);
      res.json({
        success: true,
        data: reports,
      });
    } catch (error) {
      next(error);
    }
  },
};

export default userController;
