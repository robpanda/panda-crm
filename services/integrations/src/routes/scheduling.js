// Advanced Scheduling Engine Routes
import { Router } from 'express';
import { schedulingService } from '../services/schedulingService.js';
import { logger } from '../middleware/logger.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = Router();

// ==========================================
// Optimization Routes
// ==========================================

/**
 * POST /scheduling/optimize - Run schedule optimization
 */
router.post('/optimize', authMiddleware, requireRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const {
      runType = 'DAILY',
      territoryId,
      date,
      resourceIds,
    } = req.body;

    const result = await schedulingService.runOptimization({
      runType,
      territoryId,
      date: date ? new Date(date) : new Date(),
      resourceIds,
      triggeredById: req.user.id,
    });

    logger.info(`Schedule optimization completed: ${result.id} by ${req.user.email}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /scheduling/optimizations - List optimization runs
 */
router.get('/optimizations', authMiddleware, async (req, res, next) => {
  try {
    const { status, territoryId, limit = 20 } = req.query;

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const where = {};
    if (status) where.status = status;
    if (territoryId) where.territoryId = territoryId;

    const optimizations = await prisma.scheduleOptimization.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      include: {
        territory: { select: { id: true, name: true } },
        triggeredBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    res.json({ success: true, data: optimizations });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /scheduling/optimizations/:id - Get optimization details
 */
router.get('/optimizations/:id', authMiddleware, async (req, res, next) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const optimization = await prisma.scheduleOptimization.findUnique({
      where: { id: req.params.id },
      include: {
        territory: { select: { id: true, name: true } },
        triggeredBy: { select: { id: true, firstName: true, lastName: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!optimization) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Optimization run not found' },
      });
    }

    res.json({ success: true, data: optimization });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /scheduling/optimizations/:id/approve - Approve optimization changes
 */
router.post('/optimizations/:id/approve', authMiddleware, requireRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const result = await schedulingService.approveOptimization(req.params.id, req.user.id);

    logger.info(`Optimization ${req.params.id} approved by ${req.user.email}`);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /scheduling/optimizations/:id/reject - Reject optimization changes
 */
router.post('/optimizations/:id/reject', authMiddleware, requireRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const optimization = await prisma.scheduleOptimization.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED' },
    });

    logger.info(`Optimization ${req.params.id} rejected by ${req.user.email}`);

    res.json({ success: true, data: optimization });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Slot Finding
// ==========================================

/**
 * POST /scheduling/find-slot - Find optimal appointment slot
 */
router.post('/find-slot', authMiddleware, async (req, res, next) => {
  try {
    const {
      opportunityId,
      duration,
      workTypeId,
      preferredDate,
      preferredTimeWindow,
      resourceId,
    } = req.body;

    if (!opportunityId || !duration) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'opportunityId and duration are required' },
      });
    }

    const slots = await schedulingService.findOptimalSlot({
      opportunityId,
      duration: parseInt(duration),
      workTypeId,
      preferredDate: preferredDate ? new Date(preferredDate) : undefined,
      preferredTimeWindow,
      resourceId,
    });

    res.json({ success: true, data: slots });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Resource Capacity
// ==========================================

/**
 * GET /scheduling/capacity - Get resource capacity
 */
router.get('/capacity', authMiddleware, async (req, res, next) => {
  try {
    const { resourceId, territoryId, date, startDate, endDate } = req.query;

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const where = {};
    if (resourceId) where.resourceId = resourceId;
    if (territoryId) where.territoryId = territoryId;
    if (date) where.date = new Date(date);
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const capacity = await prisma.resourceCapacity.findMany({
      where,
      orderBy: { date: 'asc' },
      include: {
        resource: { select: { id: true, name: true } },
        territory: { select: { id: true, name: true } },
      },
    });

    res.json({ success: true, data: capacity });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /scheduling/capacity - Set resource capacity
 */
router.post('/capacity', authMiddleware, requireRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const {
      resourceId,
      territoryId,
      date,
      maxAppointments,
      maxHours,
      isAvailable = true,
      notes,
    } = req.body;

    if (!resourceId || !date) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'resourceId and date are required' },
      });
    }

    const capacity = await schedulingService.setResourceCapacity({
      resourceId,
      territoryId,
      date: new Date(date),
      maxAppointments,
      maxHours,
      isAvailable,
      notes,
    });

    logger.info(`Capacity set for resource ${resourceId} on ${date} by ${req.user.email}`);

    res.json({ success: true, data: capacity });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /scheduling/capacity/:id - Update resource capacity
 */
router.put('/capacity/:id', authMiddleware, requireRole(['admin', 'manager']), async (req, res, next) => {
  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const capacity = await prisma.resourceCapacity.update({
      where: { id: req.params.id },
      data: req.body,
    });

    logger.info(`Capacity ${req.params.id} updated by ${req.user.email}`);

    res.json({ success: true, data: capacity });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Utilization & Analytics
// ==========================================

/**
 * GET /scheduling/utilization - Get resource utilization
 */
router.get('/utilization', authMiddleware, async (req, res, next) => {
  try {
    const { resourceId, territoryId, startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'startDate and endDate are required' },
      });
    }

    const utilization = await schedulingService.getResourceUtilization({
      resourceId,
      territoryId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
    });

    res.json({ success: true, data: utilization });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /scheduling/stats - Get scheduling statistics
 */
router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const { territoryId, startDate, endDate } = req.query;

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const where = {};
    if (territoryId) where.territoryId = territoryId;
    if (Object.keys(dateFilter).length) where.createdAt = dateFilter;

    // Get optimization stats
    const optimizationStats = await prisma.scheduleOptimization.groupBy({
      by: ['status'],
      where,
      _count: { id: true },
    });

    const avgMetrics = await prisma.scheduleOptimization.aggregate({
      where: { ...where, status: 'APPLIED' },
      _avg: {
        appointmentsOptimized: true,
        travelTimeReduced: true,
      },
    });

    res.json({
      success: true,
      data: {
        optimizations: optimizationStats.reduce((acc, s) => {
          acc[s.status] = s._count.id;
          return acc;
        }, {}),
        averages: {
          appointmentsOptimized: Math.round(avgMetrics._avg.appointmentsOptimized || 0),
          travelTimeReduced: Math.round(avgMetrics._avg.travelTimeReduced || 0),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ==========================================
// Route Optimization
// ==========================================

/**
 * POST /scheduling/route - Optimize route for a day
 */
router.post('/route', authMiddleware, async (req, res, next) => {
  try {
    const { resourceId, date, appointmentIds } = req.body;

    if (!resourceId || !date) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'resourceId and date are required' },
      });
    }

    const route = await schedulingService.optimizeRoute(resourceId, new Date(date));

    res.json({ success: true, data: route });
  } catch (error) {
    next(error);
  }
});

export default router;
