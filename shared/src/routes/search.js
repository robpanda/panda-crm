// Global Search Routes
import { Router } from 'express';
import { searchService } from '../services/searchService.js';

const router = Router();

/**
 * GET /search - Global search across all entities
 */
router.get('/', async (req, res, next) => {
  try {
    const {
      q,
      types,
      limit = 20,
      includeInactive = false,
    } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({
        success: true,
        data: { results: [], total: 0, query: q || '' },
      });
    }

    const results = await searchService.globalSearch(q, {
      types: types ? types.split(',') : undefined,
      limit: parseInt(limit),
      userId: req.user?.id,
      includeInactive: includeInactive === 'true',
    });

    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /search/quick - Quick autocomplete search
 */
router.get('/quick', async (req, res, next) => {
  try {
    const { q, types, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.json({ success: true, data: [] });
    }

    const results = await searchService.quickSearch(q, {
      types: types ? types.split(',') : undefined,
      limit: parseInt(limit),
    });

    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /search/create-indexes - Create FTS indexes (admin only)
 */
router.post('/create-indexes', async (req, res, next) => {
  try {
    // Require admin role
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Admin access required' },
      });
    }

    await searchService.createSearchIndexes();

    res.json({ success: true, message: 'Search indexes created successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
