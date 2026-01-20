// Opportunity Controller - HTTP request handlers
import { opportunityService } from '../services/opportunityService.js';
import { successResponse, errorResponse, NotFoundError } from '@panda-crm/shared';

export const opportunityController = {
  // Get stage counts for dashboard
  async getStageCounts(req, res, next) {
    try {
      // Parse ownerIds from comma-separated string
      const ownerIds = req.query.ownerIds
        ? req.query.ownerIds.split(',').filter(id => id.trim())
        : [];

      const counts = await opportunityService.getStageCounts(
        req.user?.id,
        req.query.ownerFilter,
        ownerIds
      );
      res.json(successResponse(counts));
    } catch (error) {
      next(error);
    }
  },

  // List opportunities with filters
  async getOpportunities(req, res, next) {
    try {
      // Parse ownerIds from comma-separated string for team/multi-owner filtering
      const ownerIds = req.query.ownerIds
        ? req.query.ownerIds.split(',').filter(id => id.trim())
        : [];

      const result = await opportunityService.getOpportunities({
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50,
        stage: req.query.stage,
        type: req.query.type,
        ownerId: req.query.ownerId,
        ownerIds, // Support multiple owner IDs for team filtering
        ownerFilter: req.query.ownerFilter,
        accountId: req.query.accountId,
        search: req.query.search,
        sortBy: req.query.sortBy || 'createdAt',
        sortOrder: req.query.sortOrder || 'desc',
        currentUserId: req.user?.id,
        closeDateFrom: req.query.closeDateFrom,
        closeDateTo: req.query.closeDateTo,
      });
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },

  // Get opportunity details (HUB view)
  async getOpportunityDetails(req, res, next) {
    try {
      const opportunity = await opportunityService.getOpportunityDetails(req.params.id);
      res.json(successResponse(opportunity));
    } catch (error) {
      next(error);
    }
  },

  // Get work orders for opportunity
  async getWorkOrders(req, res, next) {
    try {
      const workOrders = await opportunityService.getOpportunityWorkOrders(req.params.id);
      res.json(successResponse(workOrders));
    } catch (error) {
      next(error);
    }
  },

  // Get quotes for opportunity
  async getQuotes(req, res, next) {
    try {
      const quotes = await opportunityService.getOpportunityQuotes(req.params.id);
      res.json(successResponse(quotes));
    } catch (error) {
      next(error);
    }
  },

  // Get contacts for opportunity
  async getContacts(req, res, next) {
    try {
      const contacts = await opportunityService.getOpportunityContacts(req.params.id);
      res.json(successResponse(contacts));
    } catch (error) {
      next(error);
    }
  },

  // Create opportunity
  async createOpportunity(req, res, next) {
    try {
      const opportunity = await opportunityService.createOpportunity({
        ...req.body,
        ownerId: req.body.ownerId || req.user?.id,
      });
      res.status(201).json(successResponse(opportunity));
    } catch (error) {
      next(error);
    }
  },

  // Update opportunity
  async updateOpportunity(req, res, next) {
    try {
      const opportunity = await opportunityService.updateOpportunity(
        req.params.id,
        req.body
      );
      res.json(successResponse(opportunity));
    } catch (error) {
      next(error);
    }
  },

  // Delete opportunity
  async deleteOpportunity(req, res, next) {
    try {
      const result = await opportunityService.deleteOpportunity(req.params.id);
      res.json(successResponse(result));
    } catch (error) {
      next(error);
    }
  },
};

export default opportunityController;
