// Audit Routes - Audit Log Management API
import express from 'express';
import { auditService } from '../services/auditService.js';
import { permissionService } from '../services/permissionService.js';

const router = express.Router();

// Middleware to extract user context
const getUserContext = (req) => ({
  userId: req.user?.sub || req.user?.userId,
  userEmail: req.user?.email,
  ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
  userAgent: req.headers['user-agent'],
});

/**
 * Search audit logs
 * GET /audit/logs
 */
router.get('/logs', async (req, res, next) => {
  try {
    const context = getUserContext(req);

    // Check permission
    const canView = await permissionService.hasPermission(context.userId, 'audit_logs', 'read');
    if (!canView) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
      });
    }

    const {
      tableName,
      action,
      userId,
      userEmail,
      startDate,
      endDate,
      searchField,
      searchValue,
      limit = 50,
      offset = 0,
    } = req.query;

    const result = await auditService.searchAuditLogs({
      tableName,
      action,
      userId,
      userEmail,
      startDate,
      endDate,
      searchField,
      searchValue,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.json({
      success: true,
      data: result.logs,
      pagination: {
        total: result.total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get audit logs for a specific record
 * GET /audit/record/:tableName/:recordId
 */
router.get('/record/:tableName/:recordId', async (req, res, next) => {
  try {
    const { tableName, recordId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    const context = getUserContext(req);

    // Check permission
    const canView = await permissionService.hasPermission(context.userId, 'audit_logs', 'read');
    if (!canView) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
      });
    }

    const result = await auditService.getRecordAuditLogs(tableName, recordId, {
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.json({
      success: true,
      data: result.logs,
      pagination: {
        total: result.total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get audit logs for current user's activity
 * GET /audit/my-activity
 */
router.get('/my-activity', async (req, res, next) => {
  try {
    const context = getUserContext(req);
    const { action, startDate, endDate, limit = 50, offset = 0 } = req.query;

    const result = await auditService.getUserAuditLogs(context.userId, {
      action,
      startDate,
      endDate,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.json({
      success: true,
      data: result.logs,
      pagination: {
        total: result.total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get audit logs for a specific user (admin only)
 * GET /audit/user/:userId
 */
router.get('/user/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { action, startDate, endDate, limit = 50, offset = 0 } = req.query;
    const context = getUserContext(req);

    // Check permission
    const canView = await permissionService.hasPermission(context.userId, 'audit_logs', 'read');
    if (!canView) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
      });
    }

    const result = await auditService.getUserAuditLogs(userId, {
      action,
      startDate,
      endDate,
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    res.json({
      success: true,
      data: result.logs,
      pagination: {
        total: result.total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get audit statistics
 * GET /audit/stats
 */
router.get('/stats', async (req, res, next) => {
  try {
    const context = getUserContext(req);
    const { startDate, endDate } = req.query;

    // Check permission
    const canView = await permissionService.hasPermission(context.userId, 'audit_logs', 'read');
    if (!canView) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
      });
    }

    const stats = await auditService.getAuditStats({ startDate, endDate });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Export audit logs
 * GET /audit/export
 */
router.get('/export', async (req, res, next) => {
  try {
    const context = getUserContext(req);

    // Check permission
    const canExport = await permissionService.hasPermission(context.userId, 'audit_logs', 'export');
    if (!canExport) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
      });
    }

    const { tableName, action, userId, startDate, endDate, format = 'json' } = req.query;

    // Get all matching logs (no pagination for export)
    const result = await auditService.searchAuditLogs({
      tableName,
      action,
      userId,
      startDate,
      endDate,
      limit: 10000, // Max export limit
      offset: 0,
    });

    // Log the export
    await auditService.logExport({
      tableName: 'audit_logs',
      recordCount: result.logs.length,
      filters: { tableName, action, userId, startDate, endDate },
      format,
      ...context,
    });

    if (format === 'csv') {
      // Convert to CSV
      const headers = ['timestamp', 'action', 'table', 'recordId', 'user', 'changedFields', 'source'];
      const csvRows = [headers.join(',')];

      for (const log of result.logs) {
        const row = [
          log.createdAt.toISOString(),
          log.action,
          log.tableName,
          log.recordId,
          log.userEmail || log.userId,
          `"${(log.changedFields || []).join(', ')}"`,
          log.source,
        ];
        csvRows.push(row.join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit_logs.csv');
      res.send(csvRows.join('\n'));
    } else {
      res.json({
        success: true,
        data: result.logs,
        total: result.total,
        exportedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * Cleanup old audit logs (admin only, for data retention)
 * POST /audit/cleanup
 */
router.post('/cleanup', async (req, res, next) => {
  try {
    const context = getUserContext(req);

    // Only super admin can cleanup
    const permissions = await permissionService.getUserPermissions(context.userId);
    if (permissions.role?.toLowerCase() !== 'super admin') {
      return res.status(403).json({
        success: false,
        error: 'Only super admin can cleanup audit logs',
      });
    }

    const { retentionDays = 365 } = req.body;

    const deletedCount = await auditService.cleanupOldLogs(retentionDays);

    // Log the cleanup action
    await auditService.logChange({
      tableName: 'audit_logs',
      recordId: 'cleanup',
      action: 'DELETE',
      newValues: {
        deletedCount,
        retentionDays,
        cleanupDate: new Date().toISOString(),
      },
      ...context,
      source: 'admin',
    });

    res.json({
      success: true,
      message: `Deleted ${deletedCount} audit logs older than ${retentionDays} days`,
      deletedCount,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get distinct values for filters
 * GET /audit/filters
 */
router.get('/filters', async (req, res, next) => {
  try {
    const context = getUserContext(req);

    // Check permission
    const canView = await permissionService.hasPermission(context.userId, 'audit_logs', 'read');
    if (!canView) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
      });
    }

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    // Get distinct tables
    const tables = await prisma.auditLog.findMany({
      distinct: ['tableName'],
      select: { tableName: true },
    });

    // Get distinct actions
    const actions = await prisma.auditLog.findMany({
      distinct: ['action'],
      select: { action: true },
    });

    // Get distinct users
    const users = await prisma.auditLog.findMany({
      distinct: ['userEmail'],
      where: { userEmail: { not: null } },
      select: { userId: true, userEmail: true },
      take: 100,
    });

    res.json({
      success: true,
      data: {
        tables: tables.map((t) => t.tableName),
        actions: actions.map((a) => a.action),
        users: users,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
