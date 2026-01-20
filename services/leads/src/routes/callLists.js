// Call List Routes - CRUD for call lists, items, dispositions, sessions
import { Router } from 'express';
import { callListService } from '../services/callListService.js';
import { listPopulationService } from '../services/listPopulationService.js';

const router = Router();

// ==================== MANAGER DASHBOARD ====================

/**
 * GET /call-lists/dashboard
 * Get comprehensive dashboard stats for call center manager
 * Includes queue depth, time-in-list metrics, and item previews
 */
router.get('/dashboard', async (req, res, next) => {
  try {
    const stats = await callListService.getDashboardStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /call-lists/bulk-assign
 * Bulk assign leads to a team member
 */
router.post('/bulk-assign', async (req, res, next) => {
  try {
    const { itemIds, assignToUserId } = req.body;

    if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'itemIds array required' },
      });
    }

    if (!assignToUserId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'assignToUserId required' },
      });
    }

    const result = await callListService.bulkAssignItems(itemIds, assignToUserId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// ==================== CALL LISTS ====================

/**
 * GET /call-lists
 * Get all call lists with stats
 */
router.get('/', async (req, res, next) => {
  try {
    const { isActive, listType, assignedUserId, states } = req.query;

    const filters = {};
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (listType) filters.listType = listType;
    if (assignedUserId) filters.assignedUserId = assignedUserId;
    if (states) filters.states = states.split(',');

    const lists = await callListService.getCallLists(filters);

    res.json({
      success: true,
      data: lists,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /call-lists/predefined/init
 * Initialize predefined Five9-style lists and dispositions
 */
router.post('/predefined/init', async (req, res, next) => {
  try {
    const userId = req.user?.id;

    const [lists, dispositionCount] = await Promise.all([
      callListService.ensurePredefinedLists(userId),
      callListService.ensurePredefinedDispositions(),
    ]);

    res.json({
      success: true,
      data: {
        listsCreated: lists.length,
        dispositionsCreated: dispositionCount,
        lists: lists.map(l => ({ id: l.id, name: l.name })),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /call-lists/:id
 * Get a single call list with stats and dispositions
 */
router.get('/:id', async (req, res, next) => {
  try {
    const list = await callListService.getCallListById(req.params.id);

    if (!list) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Call list not found' },
      });
    }

    res.json({
      success: true,
      data: list,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /call-lists
 * Create a new call list
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const list = await callListService.createCallList(req.body, userId);

    res.status(201).json({
      success: true,
      data: list,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /call-lists/:id
 * Update a call list
 */
router.put('/:id', async (req, res, next) => {
  try {
    const list = await callListService.updateCallList(req.params.id, req.body);

    res.json({
      success: true,
      data: list,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /call-lists/:id
 * Delete (deactivate) a call list
 */
router.delete('/:id', async (req, res, next) => {
  try {
    await callListService.deleteCallList(req.params.id);

    res.json({
      success: true,
      message: 'Call list deactivated',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /call-lists/:id/refresh
 * Refresh a dynamic list by re-running filter criteria
 */
router.post('/:id/refresh', async (req, res, next) => {
  try {
    const result = await callListService.refreshDynamicList(req.params.id);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// ==================== CALL LIST ITEMS ====================

/**
 * GET /call-lists/:id/items
 * Get items for a call list with pagination
 */
router.get('/:id/items', async (req, res, next) => {
  try {
    const { status, page, limit, sortBy, sortOrder, assignedToId } = req.query;

    const result = await callListService.getCallListItems(req.params.id, {
      status,
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 50,
      sortBy: sortBy || 'priority',
      sortOrder: sortOrder || 'desc',
      assignedToId,
    });

    res.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /call-lists/:id/next
 * Get the next item to call for the current agent
 */
router.get('/:id/next', async (req, res, next) => {
  try {
    const agentId = req.user?.id;
    const item = await callListService.getNextCallItem(req.params.id, agentId);

    if (!item) {
      return res.json({
        success: true,
        data: null,
        message: 'No more items available to call',
      });
    }

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /call-lists/:id/items
 * Add items to a call list manually
 */
router.post('/:id/items', async (req, res, next) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'Items array required' },
      });
    }

    const result = await callListService.addItemsToList(req.params.id, items);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /call-lists/:listId/items/:itemId
 * Remove an item from a list
 */
router.delete('/:listId/items/:itemId', async (req, res, next) => {
  try {
    await callListService.removeItemFromList(req.params.itemId);

    res.json({
      success: true,
      message: 'Item removed from list',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /call-lists/:listId/items/:itemId/move
 * Move an item to another list
 */
router.post('/:listId/items/:itemId/move', async (req, res, next) => {
  try {
    const { targetListId, reason } = req.body;

    if (!targetListId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'targetListId required' },
      });
    }

    const newItem = await callListService.moveItemToList(req.params.itemId, targetListId, reason);

    res.json({
      success: true,
      data: newItem,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /call-lists/:listId/items/:itemId/disposition
 * Apply a disposition to an item (record call outcome)
 */
router.post('/:listId/items/:itemId/disposition', async (req, res, next) => {
  try {
    const { dispositionCode, notes } = req.body;
    const agentId = req.user?.id;

    if (!dispositionCode) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'dispositionCode required' },
      });
    }

    const result = await callListService.applyDisposition(
      req.params.itemId,
      dispositionCode,
      notes,
      agentId
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

// ==================== DISPOSITIONS ====================

/**
 * GET /call-lists/dispositions
 * Get all global dispositions (not list-specific)
 */
router.get('/dispositions/global', async (req, res, next) => {
  try {
    const dispositions = await callListService.getDispositions(null);

    res.json({
      success: true,
      data: dispositions,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /call-lists/:id/dispositions
 * Get dispositions for a specific list
 */
router.get('/:id/dispositions', async (req, res, next) => {
  try {
    const dispositions = await callListService.getDispositions(req.params.id);

    res.json({
      success: true,
      data: dispositions,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /call-lists/dispositions
 * Create a new disposition
 */
router.post('/dispositions', async (req, res, next) => {
  try {
    const disposition = await callListService.createDisposition(req.body);

    res.status(201).json({
      success: true,
      data: disposition,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /call-lists/dispositions/:id
 * Update a disposition
 */
router.put('/dispositions/:id', async (req, res, next) => {
  try {
    const disposition = await callListService.updateDisposition(req.params.id, req.body);

    res.json({
      success: true,
      data: disposition,
    });
  } catch (error) {
    next(error);
  }
});

// ==================== SESSIONS ====================

/**
 * POST /call-lists/sessions/start
 * Start a new call session
 */
router.post('/sessions/start', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { listId, dialerMode } = req.body;

    const session = await callListService.startSession(userId, listId, dialerMode);

    res.status(201).json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /call-lists/sessions/:id/end
 * End a call session
 */
router.post('/sessions/:id/end', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const session = await callListService.endSession(req.params.id, reason);

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /call-lists/sessions/:id/pause
 * Toggle pause state of a session
 */
router.post('/sessions/:id/pause', async (req, res, next) => {
  try {
    const session = await callListService.toggleSessionPause(req.params.id);

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /call-lists/sessions/active
 * Get the current user's active session
 */
router.get('/sessions/active', async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const session = await callListService.getActiveSession(userId);

    res.json({
      success: true,
      data: session,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /call-lists/sessions/stats
 * Get session stats for current user
 */
router.get('/sessions/stats', async (req, res, next) => {
  try {
    const userId = req.query.userId || req.user?.id;
    const { startDate, endDate } = req.query;

    const stats = await callListService.getSessionStats(userId, startDate, endDate);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /call-lists/sessions/:id/call-complete
 * Update session stats after a call completes
 */
router.post('/sessions/:id/call-complete', async (req, res, next) => {
  try {
    const { connected, talkTimeMs, wrapTimeMs } = req.body;

    await callListService.updateSessionStats(req.params.id, {
      connected,
      talkTimeMs,
      wrapTimeMs,
    });

    res.json({
      success: true,
      message: 'Session stats updated',
    });
  } catch (error) {
    next(error);
  }
});

// ==================== LIST POPULATION ====================

/**
 * POST /call-lists/populate
 * Trigger list population job - routes leads/opportunities to appropriate lists
 */
router.post('/populate', async (req, res, next) => {
  try {
    const { dryRun = false, limit = 1000 } = req.body;

    const results = await listPopulationService.runFullPopulation({ dryRun, limit });

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /call-lists/populate/:listType
 * Populate a specific list type
 * listType: hotLeads, leadReset, coldLeads, callbacks, coolDown, confirmation, rehash, reset
 */
router.post('/populate/:listType', async (req, res, next) => {
  try {
    const { listType } = req.params;
    const { dryRun = false, limit = 1000 } = req.body;
    const listsByName = await listPopulationService.getCallListsByName();

    let result;
    switch (listType) {
      case 'hotLeads':
        result = await listPopulationService.populateHotLeads(listsByName, { dryRun, limit });
        break;
      case 'leadReset':
        result = await listPopulationService.populateLeadReset(listsByName, { dryRun, limit });
        break;
      case 'coldLeads':
        result = await listPopulationService.populateColdLeads(listsByName, { dryRun, limit });
        break;
      case 'callbacks':
        result = await listPopulationService.populateCallbacks(listsByName, { dryRun, limit });
        break;
      case 'coolDown':
        result = await listPopulationService.populateCoolDown(listsByName, { dryRun, limit });
        break;
      case 'confirmation':
        result = await listPopulationService.populateConfirmation(listsByName, { dryRun, limit });
        break;
      case 'rehash':
        result = await listPopulationService.populateRehash(listsByName, { dryRun, limit });
        break;
      case 'reset':
        result = await listPopulationService.populateReset(listsByName, { dryRun, limit });
        break;
      default:
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_LIST_TYPE', message: `Unknown list type: ${listType}` },
        });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /call-lists/disposition/:leadId
 * Apply a disposition to a lead and route to appropriate list
 */
router.post('/disposition/:leadId', async (req, res, next) => {
  try {
    const { leadId } = req.params;
    const { dispositionCode, callbackAt, notes } = req.body;

    if (!dispositionCode) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_INPUT', message: 'dispositionCode required' },
      });
    }

    const result = await listPopulationService.handleDisposition(leadId, dispositionCode, {
      callbackAt,
      notes,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
