import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { reportService } from '../services/reportService.js';
import { featureFlags, requireFeature } from '../config/featureFlags.js';

const router = express.Router();

router.use(authMiddleware);

router.use((req, _res, next) => {
  try {
    requireFeature(featureFlags.reportsEnabled, 'Photo reports');
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/reports
 */
router.post('/', async (req, res, next) => {
  try {
    const report = await reportService.createReport(req.body, req.user?.id || null);

    if (Array.isArray(req.body?.items) && req.body.items.length > 0) {
      await reportService.upsertReportItems(report.id, req.body.items);
    }

    const hydrated = await reportService.getReportById(report.id);
    res.status(201).json({ success: true, data: hydrated });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/reports
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await reportService.listReports(req.query);
    res.json({ success: true, data: result.data, pagination: result.pagination });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/reports/:id
 */
router.get('/:id', async (req, res, next) => {
  try {
    const report = await reportService.getReportById(req.params.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Report not found' },
      });
    }

    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/photocam/reports/:id/generate
 */
router.post('/:id/generate', async (req, res, next) => {
  try {
    const report = await reportService.generateReport(req.params.id, req.user?.id || null);
    res.json({ success: true, data: report });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photocam/reports/:id/download
 */
router.get('/:id/download', async (req, res, next) => {
  try {
    const data = await reportService.getReportDownload(req.params.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
