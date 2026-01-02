// Call Center Routes - Leaderboard, Stats, Team Totals
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Disable caching for all call center routes - data is real-time
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

/**
 * GET /call-center/leaderboard
 * Returns ranked list of call center reps by leads created
 */
router.get('/leaderboard', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    // Default to today if no dates provided
    const start = startDate ? new Date(startDate) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = endDate ? new Date(endDate + 'T23:59:59.999Z') : new Date(new Date().setHours(23, 59, 59, 999));

    // Get all users in call center department
    const callCenterUsers = await prisma.user.findMany({
      where: {
        OR: [
          { department: { contains: 'Call Center', mode: 'insensitive' } },
          { role: { name: { contains: 'call_center', mode: 'insensitive' } } },
        ],
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        title: true,
      },
    });

    // Get lead counts grouped by owner for the date range
    const leadsWithCounts = await prisma.lead.groupBy({
      by: ['ownerId'],
      where: {
        ownerId: { in: callCenterUsers.map(u => u.id) },
        createdAt: { gte: start, lte: end },
      },
      _count: { id: true },
    });

    // Get converted leads (appointments set)
    const convertedCounts = await prisma.lead.groupBy({
      by: ['ownerId'],
      where: {
        ownerId: { in: callCenterUsers.map(u => u.id) },
        createdAt: { gte: start, lte: end },
        isConverted: true,
      },
      _count: { id: true },
    });

    // Map counts to users
    const leaderboard = callCenterUsers.map(user => {
      const leadCount = leadsWithCounts.find(l => l.ownerId === user.id)?._count?.id || 0;
      const convertedCount = convertedCounts.find(c => c.ownerId === user.id)?._count?.id || 0;

      return {
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        title: user.title || 'Call Center Rep',
        leadsCreated: leadCount,
        appointmentsSet: convertedCount,
        conversionRate: leadCount > 0 ? Math.round((convertedCount / leadCount) * 100) : 0,
        streak: 0, // Could calculate consecutive days with leads
      };
    });

    // Sort by leads created descending
    leaderboard.sort((a, b) => {
      if (b.leadsCreated !== a.leadsCreated) return b.leadsCreated - a.leadsCreated;
      return b.appointmentsSet - a.appointmentsSet;
    });

    res.json({
      success: true,
      data: {
        leaderboard,
        period: { start, end },
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /call-center/my-stats
 * Returns current user's personal stats
 */
router.get('/my-stats', async (req, res, next) => {
  try {
    const { userId, startDate, endDate } = req.query;
    const targetUserId = userId || req.user?.id;

    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_USER', message: 'User ID required' }
      });
    }

    const start = startDate ? new Date(startDate) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = endDate ? new Date(endDate + 'T23:59:59.999Z') : new Date(new Date().setHours(23, 59, 59, 999));

    // Get yesterday's range for trend comparison
    const yesterdayStart = new Date(start);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(end);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);

    // Current period stats
    const [leadsCreated, leadsConverted, yesterdayLeads, yesterdayConverted] = await Promise.all([
      prisma.lead.count({
        where: {
          ownerId: targetUserId,
          createdAt: { gte: start, lte: end },
        },
      }),
      prisma.lead.count({
        where: {
          ownerId: targetUserId,
          createdAt: { gte: start, lte: end },
          isConverted: true,
        },
      }),
      prisma.lead.count({
        where: {
          ownerId: targetUserId,
          createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
        },
      }),
      prisma.lead.count({
        where: {
          ownerId: targetUserId,
          createdAt: { gte: yesterdayStart, lte: yesterdayEnd },
          isConverted: true,
        },
      }),
    ]);

    // Calculate trends (percentage change from yesterday)
    const leadsTrend = yesterdayLeads > 0
      ? Math.round(((leadsCreated - yesterdayLeads) / yesterdayLeads) * 100)
      : leadsCreated > 0 ? 100 : 0;

    const appointmentsTrend = yesterdayConverted > 0
      ? Math.round(((leadsConverted - yesterdayConverted) / yesterdayConverted) * 100)
      : leadsConverted > 0 ? 100 : 0;

    res.json({
      success: true,
      data: {
        leadsCreated,
        leadsConverted,
        appointmentsSet: leadsConverted, // For now, appointments = converted leads
        callsMade: 0, // Would come from phone system integration
        conversionRate: leadsCreated > 0 ? Math.round((leadsConverted / leadsCreated) * 100) : 0,
        avgCallDuration: 0,
        leadsTrend,
        appointmentsTrend,
        callsTrend: 0,
        conversionTrend: 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /call-center/team-totals
 * Returns aggregate stats for entire call center team
 */
router.get('/team-totals', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : new Date(new Date().setHours(0, 0, 0, 0));
    const end = endDate ? new Date(endDate + 'T23:59:59.999Z') : new Date(new Date().setHours(23, 59, 59, 999));

    // Get all call center user IDs
    const callCenterUsers = await prisma.user.findMany({
      where: {
        OR: [
          { department: { contains: 'Call Center', mode: 'insensitive' } },
          { role: { name: { contains: 'call_center', mode: 'insensitive' } } },
        ],
        isActive: true,
      },
      select: { id: true },
    });

    const userIds = callCenterUsers.map(u => u.id);

    // Get totals
    const [totalLeads, totalConverted] = await Promise.all([
      prisma.lead.count({
        where: {
          ownerId: { in: userIds },
          createdAt: { gte: start, lte: end },
        },
      }),
      prisma.lead.count({
        where: {
          ownerId: { in: userIds },
          createdAt: { gte: start, lte: end },
          isConverted: true,
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalLeads,
        totalConverted,
        totalAppointments: totalConverted, // For now, same as converted
        totalCalls: 0, // Would come from phone integration
        teamConversionRate: totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 100) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /call-center/unconfirmed
 * Returns leads with tentative appointment dates that need confirmation
 * These are leads that have NOT been converted yet but have a tentative date set
 */
router.get('/unconfirmed', async (req, res, next) => {
  try {
    const { startDate, endDate, sortBy = 'tentativeAppointmentDate', sortOrder = 'asc' } = req.query;

    // Build date filter for tentative appointment date
    const dateFilter = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    // Get unconfirmed leads - leads with tentative date that are NOT converted
    const leads = await prisma.lead.findMany({
      where: {
        isConverted: false,
        tentativeAppointmentDate: Object.keys(dateFilter).length > 0 ? dateFilter : { not: null },
        status: { notIn: ['CONVERTED', 'UNQUALIFIED'] },
      },
      include: {
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
    });

    res.json({
      success: true,
      data: leads,
      pagination: {
        total: leads.length,
        page: 1,
        limit: leads.length,
        totalPages: 1,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
