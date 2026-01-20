/**
 * Champion Reports & Analytics Routes
 * Provides comprehensive reporting for the Champions program
 */

import express from 'express';
import { PrismaClient } from '@prisma/client';
import { logger } from '../services/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

/**
 * GET /api/champion-reports/dashboard
 * Get dashboard summary stats for admin
 */
router.get('/dashboard', async (req, res) => {
  try {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);

    const [
      // Champion counts
      totalChampions,
      activeChampions,
      pendingChampions,
      newChampionsThisMonth,
      // Referral counts
      totalReferrals,
      referralsThisMonth,
      qualifiedReferrals,
      qualifiedThisMonth,
      closedWonReferrals,
      closedWonThisMonth,
      // Payout totals
      totalPaidPayouts,
      pendingPayouts,
      payoutsThisMonth,
      // Top performers
      topChampions,
    ] = await Promise.all([
      // Champion counts
      prisma.champion.count({ where: { deletedAt: null } }),
      prisma.champion.count({ where: { status: 'ACTIVE', deletedAt: null } }),
      prisma.champion.count({ where: { status: 'PENDING', deletedAt: null } }),
      prisma.champion.count({
        where: { deletedAt: null, createdAt: { gte: thisMonth } }
      }),
      // Referral counts
      prisma.championReferral.count(),
      prisma.championReferral.count({ where: { createdAt: { gte: thisMonth } } }),
      prisma.championReferral.count({ where: { isQualified: true } }),
      prisma.championReferral.count({
        where: { isQualified: true, qualifiedAt: { gte: thisMonth } }
      }),
      prisma.championReferral.count({ where: { closedWon: true } }),
      prisma.championReferral.count({
        where: { closedWon: true, closedWonAt: { gte: thisMonth } }
      }),
      // Payout totals
      prisma.championPayout.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
      }),
      prisma.championPayout.aggregate({
        where: { status: 'PENDING' },
        _sum: { amount: true },
      }),
      prisma.championPayout.aggregate({
        where: { status: 'PAID', processedAt: { gte: thisMonth } },
        _sum: { amount: true },
      }),
      // Top performers this month
      prisma.championReferral.groupBy({
        by: ['championId'],
        where: { createdAt: { gte: thisMonth } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
    ]);

    // Get champion details for top performers
    let topPerformers = [];
    if (topChampions.length > 0) {
      const champions = await prisma.champion.findMany({
        where: { id: { in: topChampions.map(c => c.championId) } },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      topPerformers = topChampions.map(tc => {
        const champion = champions.find(c => c.id === tc.championId);
        return {
          championId: tc.championId,
          name: champion ? `${champion.firstName} ${champion.lastName}` : 'Unknown',
          email: champion?.email,
          referralsThisMonth: tc._count.id,
        };
      });
    }

    // Calculate conversion rates
    const qualificationRate = totalReferrals > 0
      ? ((qualifiedReferrals / totalReferrals) * 100).toFixed(1)
      : 0;
    const closeRate = qualifiedReferrals > 0
      ? ((closedWonReferrals / qualifiedReferrals) * 100).toFixed(1)
      : 0;
    const overallConversionRate = totalReferrals > 0
      ? ((closedWonReferrals / totalReferrals) * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        champions: {
          total: totalChampions,
          active: activeChampions,
          pending: pendingChampions,
          newThisMonth: newChampionsThisMonth,
        },
        referrals: {
          total: totalReferrals,
          thisMonth: referralsThisMonth,
          qualified: qualifiedReferrals,
          qualifiedThisMonth,
          closedWon: closedWonReferrals,
          closedWonThisMonth,
          qualificationRate: `${qualificationRate}%`,
          closeRate: `${closeRate}%`,
          overallConversionRate: `${overallConversionRate}%`,
        },
        payouts: {
          totalPaid: totalPaidPayouts._sum.amount || 0,
          pending: pendingPayouts._sum.amount || 0,
          paidThisMonth: payoutsThisMonth._sum.amount || 0,
        },
        topPerformers,
        generatedAt: now.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch dashboard stats' },
    });
  }
});

/**
 * GET /api/champion-reports/leaderboard
 * Get champion leaderboard for a date range
 */
router.get('/leaderboard', async (req, res) => {
  try {
    const { period = 'month', limit = 20 } = req.query;
    const now = new Date();

    let startDate;
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      case 'all':
        startDate = new Date(0);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    // Get referral counts by champion
    const referralCounts = await prisma.championReferral.groupBy({
      by: ['championId'],
      where: { createdAt: { gte: startDate } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: parseInt(limit),
    });

    // Get champion details and earnings
    const championIds = referralCounts.map(r => r.championId);
    const [champions, earnings] = await Promise.all([
      prisma.champion.findMany({
        where: { id: { in: championIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          referralCode: true,
          createdAt: true,
          wallet: {
            select: { lifetimeEarnings: true },
          },
        },
      }),
      prisma.championPayout.groupBy({
        by: ['championId'],
        where: {
          championId: { in: championIds },
          status: 'PAID',
          processedAt: { gte: startDate },
        },
        _sum: { amount: true },
      }),
    ]);

    // Combine data
    const leaderboard = referralCounts.map((rc, index) => {
      const champion = champions.find(c => c.id === rc.championId);
      const earning = earnings.find(e => e.championId === rc.championId);
      return {
        rank: index + 1,
        championId: rc.championId,
        name: champion ? `${champion.firstName} ${champion.lastName}` : 'Unknown',
        email: champion?.email,
        referralCode: champion?.referralCode,
        referrals: rc._count.id,
        periodEarnings: earning?._sum?.amount || 0,
        lifetimeEarnings: champion?.wallet?.lifetimeEarnings || 0,
        memberSince: champion?.createdAt,
      };
    });

    res.json({
      success: true,
      data: {
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        leaderboard,
      },
    });
  } catch (error) {
    logger.error('Error fetching leaderboard:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch leaderboard' },
    });
  }
});

/**
 * GET /api/champion-reports/referral-pipeline
 * Get referral pipeline breakdown
 */
router.get('/referral-pipeline', async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const [byStatus, recentReferrals] = await Promise.all([
      // Count by status
      prisma.championReferral.groupBy({
        by: ['status'],
        where: { createdAt: { gte: startDate } },
        _count: { id: true },
      }),
      // Recent referrals with details
      prisma.championReferral.findMany({
        where: { createdAt: { gte: startDate } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: {
          champion: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
    ]);

    // Calculate pipeline metrics
    const totalReferrals = recentReferrals.length;
    const newReferrals = byStatus.find(s => s.status === 'NEW')?._count.id || 0;
    const contacted = byStatus.find(s => s.status === 'CONTACTED')?._count.id || 0;
    const qualified = byStatus.find(s => s.status === 'QUALIFIED')?._count.id || 0;
    const closedWon = byStatus.find(s => s.status === 'CLOSED_WON')?._count.id || 0;
    const closedLost = byStatus.find(s => s.status === 'CLOSED_LOST')?._count.id || 0;

    res.json({
      success: true,
      data: {
        period: {
          days: parseInt(days),
          startDate: startDate.toISOString(),
          endDate: new Date().toISOString(),
        },
        summary: {
          total: totalReferrals,
          new: newReferrals,
          contacted,
          qualified,
          closedWon,
          closedLost,
          open: totalReferrals - closedWon - closedLost,
        },
        byStatus: byStatus.map(s => ({
          status: s.status,
          count: s._count.id,
        })),
        recentReferrals: recentReferrals.map(r => ({
          id: r.id,
          customerName: `${r.firstName} ${r.lastName}`,
          customerEmail: r.email,
          status: r.status,
          champion: r.champion ? `${r.champion.firstName} ${r.champion.lastName}` : null,
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (error) {
    logger.error('Error fetching referral pipeline:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch referral pipeline' },
    });
  }
});

/**
 * GET /api/champion-reports/payout-summary
 * Get payout summary by type and period
 */
router.get('/payout-summary', async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const now = new Date();

    let startDate;
    switch (period) {
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const [byType, byStatus, recentPayouts, totalAllTime] = await Promise.all([
      // Sum by payout type
      prisma.championPayout.groupBy({
        by: ['type'],
        where: { createdAt: { gte: startDate } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Sum by status
      prisma.championPayout.groupBy({
        by: ['status'],
        where: { createdAt: { gte: startDate } },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Recent payouts
      prisma.championPayout.findMany({
        where: { createdAt: { gte: startDate } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: {
          champion: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
      // All-time totals
      prisma.championPayout.aggregate({
        where: { status: 'PAID' },
        _sum: { amount: true },
        _count: { id: true },
      }),
    ]);

    const periodTotal = byStatus.reduce((sum, s) => sum + (s._sum.amount || 0), 0);
    const paidThisPeriod = byStatus.find(s => s.status === 'PAID')?._sum.amount || 0;
    const pendingThisPeriod = byStatus.find(s => s.status === 'PENDING')?._sum.amount || 0;

    res.json({
      success: true,
      data: {
        period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString(),
        summary: {
          periodTotal,
          paidThisPeriod,
          pendingThisPeriod,
          allTimePaid: totalAllTime._sum.amount || 0,
          allTimePayoutCount: totalAllTime._count.id || 0,
        },
        byType: byType.map(t => ({
          type: t.type,
          amount: t._sum.amount || 0,
          count: t._count.id,
        })),
        byStatus: byStatus.map(s => ({
          status: s.status,
          amount: s._sum.amount || 0,
          count: s._count.id,
        })),
        recentPayouts: recentPayouts.map(p => ({
          id: p.id,
          type: p.type,
          amount: p.amount,
          status: p.status,
          champion: p.champion ? `${p.champion.firstName} ${p.champion.lastName}` : null,
          createdAt: p.createdAt,
          processedAt: p.processedAt,
        })),
      },
    });
  } catch (error) {
    logger.error('Error fetching payout summary:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch payout summary' },
    });
  }
});

/**
 * GET /api/champion-reports/champion/:id
 * Get detailed analytics for a specific champion
 */
router.get('/champion/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [champion, referralStats, payoutStats, monthlyReferrals, monthlyEarnings] = await Promise.all([
      // Get champion details
      prisma.champion.findUnique({
        where: { id },
        include: {
          wallet: true,
          assignedRep: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
      // Referral statistics
      prisma.championReferral.groupBy({
        by: ['status'],
        where: { championId: id },
        _count: { id: true },
      }),
      // Payout statistics
      prisma.championPayout.aggregate({
        where: { championId: id },
        _sum: { amount: true },
        _count: { id: true },
      }),
      // Monthly referrals (last 12 months)
      prisma.$queryRaw`
        SELECT
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as count
        FROM champion_referrals
        WHERE champion_id = ${id}
          AND created_at > NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month ASC
      `,
      // Monthly earnings (last 12 months)
      prisma.$queryRaw`
        SELECT
          DATE_TRUNC('month', created_at) as month,
          SUM(amount) as total
        FROM champion_payouts
        WHERE champion_id = ${id}
          AND status = 'PAID'
          AND created_at > NOW() - INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month ASC
      `,
    ]);

    if (!champion) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Champion not found' },
      });
    }

    // Build referral funnel
    const totalReferrals = referralStats.reduce((sum, s) => sum + s._count.id, 0);
    const qualified = referralStats.find(s => s.status === 'QUALIFIED')?._count.id || 0;
    const closedWon = referralStats.find(s => s.status === 'CLOSED_WON')?._count.id || 0;

    res.json({
      success: true,
      data: {
        champion: {
          id: champion.id,
          name: `${champion.firstName} ${champion.lastName}`,
          email: champion.email,
          phone: champion.phone,
          referralCode: champion.referralCode,
          status: champion.status,
          createdAt: champion.createdAt,
          lastLoginAt: champion.lastLoginAt,
          assignedRep: champion.assignedRep,
        },
        wallet: {
          availableBalance: champion.wallet?.availableBalance || 0,
          pendingBalance: champion.wallet?.pendingBalance || 0,
          lifetimeEarnings: champion.wallet?.lifetimeEarnings || 0,
          lifetimePayouts: champion.wallet?.lifetimePayouts || 0,
        },
        referrals: {
          total: totalReferrals,
          byStatus: referralStats.map(s => ({
            status: s.status,
            count: s._count.id,
          })),
          funnel: {
            submitted: totalReferrals,
            qualified,
            closed: closedWon,
            qualificationRate: totalReferrals > 0 ? ((qualified / totalReferrals) * 100).toFixed(1) : 0,
            closeRate: qualified > 0 ? ((closedWon / qualified) * 100).toFixed(1) : 0,
          },
        },
        payouts: {
          totalEarned: payoutStats._sum.amount || 0,
          payoutCount: payoutStats._count.id || 0,
        },
        trends: {
          monthlyReferrals: monthlyReferrals.map(m => ({
            month: m.month,
            count: parseInt(m.count),
          })),
          monthlyEarnings: monthlyEarnings.map(m => ({
            month: m.month,
            total: parseFloat(m.total) || 0,
          })),
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching champion analytics:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch champion analytics' },
    });
  }
});

/**
 * GET /api/champion-reports/trends
 * Get overall program trends
 */
router.get('/trends', async (req, res) => {
  try {
    const { months = 12 } = req.query;

    const [signups, referrals, payouts] = await Promise.all([
      // Monthly signups
      prisma.$queryRaw`
        SELECT
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as count
        FROM champions
        WHERE created_at > NOW() - INTERVAL '${parseInt(months)} months'
          AND deleted_at IS NULL
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month ASC
      `,
      // Monthly referrals
      prisma.$queryRaw`
        SELECT
          DATE_TRUNC('month', created_at) as month,
          COUNT(*) as total,
          SUM(CASE WHEN is_qualified = true THEN 1 ELSE 0 END) as qualified,
          SUM(CASE WHEN closed_won = true THEN 1 ELSE 0 END) as closed_won
        FROM champion_referrals
        WHERE created_at > NOW() - INTERVAL '${parseInt(months)} months'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month ASC
      `,
      // Monthly payouts
      prisma.$queryRaw`
        SELECT
          DATE_TRUNC('month', created_at) as month,
          SUM(amount) as total,
          COUNT(*) as count
        FROM champion_payouts
        WHERE created_at > NOW() - INTERVAL '${parseInt(months)} months'
          AND status = 'PAID'
        GROUP BY DATE_TRUNC('month', created_at)
        ORDER BY month ASC
      `,
    ]);

    res.json({
      success: true,
      data: {
        period: `Last ${months} months`,
        signups: signups.map(s => ({
          month: s.month,
          count: parseInt(s.count),
        })),
        referrals: referrals.map(r => ({
          month: r.month,
          total: parseInt(r.total),
          qualified: parseInt(r.qualified),
          closedWon: parseInt(r.closed_won),
        })),
        payouts: payouts.map(p => ({
          month: p.month,
          total: parseFloat(p.total) || 0,
          count: parseInt(p.count),
        })),
      },
    });
  } catch (error) {
    logger.error('Error fetching trends:', error);
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: 'Failed to fetch trends' },
    });
  }
});

/**
 * GET /api/champion-reports/export
 * Export champions data as CSV or JSON
 */
router.get('/export', async (req, res) => {
  try {
    const { format = 'json', status, since } = req.query;

    const where = { deletedAt: null };
    if (status) where.status = status;
    if (since) where.createdAt = { gte: new Date(since) };

    const champions = await prisma.champion.findMany({
      where,
      include: {
        wallet: true,
        _count: {
          select: { referrals: true, payouts: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = champions.map(c => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      referralCode: c.referralCode,
      status: c.status,
      city: c.city,
      state: c.state,
      createdAt: c.createdAt,
      lastLoginAt: c.lastLoginAt,
      referralCount: c._count.referrals,
      payoutCount: c._count.payouts,
      availableBalance: c.wallet?.availableBalance || 0,
      lifetimeEarnings: c.wallet?.lifetimeEarnings || 0,
    }));

    if (format === 'csv') {
      const headers = Object.keys(data[0] || {});
      const csv = [
        headers.join(','),
        ...data.map(row =>
          headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
            if (val instanceof Date) return val.toISOString();
            return val;
          }).join(',')
        ),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=champions-export.csv');
      return res.send(csv);
    }

    res.json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    logger.error('Error exporting champions:', error);
    res.status(500).json({
      success: false,
      error: { code: 'EXPORT_ERROR', message: 'Failed to export champions' },
    });
  }
});

export default router;
