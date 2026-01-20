// Audit Service - Comprehensive audit logging for Panda CRM
// Tracks all data changes, user actions, and system events

import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

// Fields to exclude from audit logs (sensitive data)
const EXCLUDED_FIELDS = [
  'password',
  'accessToken',
  'refreshToken',
  'googleAccessToken',
  'googleRefreshToken',
  'clientSecret',
  'apiKey',
  'secretKey',
];

// Fields to mask in audit logs
const MASKED_FIELDS = ['ssn', 'taxId', 'bankAccount'];

export const auditService = {
  /**
   * Log a data change (create, update, delete)
   */
  async logChange({
    tableName,
    recordId,
    action,
    oldValues,
    newValues,
    userId,
    userEmail,
    ipAddress,
    userAgent,
    source = 'web',
    workflowId = null,
  }) {
    try {
      // Filter and mask sensitive fields
      const filteredOldValues = oldValues ? this.filterSensitiveData(oldValues) : null;
      const filteredNewValues = newValues ? this.filterSensitiveData(newValues) : null;

      // Calculate changed fields
      const changedFields = this.getChangedFields(filteredOldValues, filteredNewValues);

      // Don't log if nothing changed on update
      if (action === 'UPDATE' && changedFields.length === 0) {
        return null;
      }

      const auditLog = await prisma.auditLog.create({
        data: {
          tableName,
          recordId,
          action,
          oldValues: filteredOldValues,
          newValues: filteredNewValues,
          changedFields,
          userId,
          userEmail,
          ipAddress,
          userAgent,
          source,
          workflowId,
        },
      });

      logger.debug(`Audit log created: ${action} on ${tableName}:${recordId}`);
      return auditLog;
    } catch (error) {
      logger.error('Failed to create audit log:', error);
      // Don't throw - audit logging should not break the main operation
      return null;
    }
  },

  /**
   * Log user authentication events
   */
  async logAuth({
    action, // 'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_RESET'
    userId,
    userEmail,
    ipAddress,
    userAgent,
    details = null,
  }) {
    try {
      const auditLog = await prisma.auditLog.create({
        data: {
          tableName: 'auth',
          recordId: userId || userEmail || 'unknown',
          action,
          newValues: details,
          userId,
          userEmail,
          ipAddress,
          userAgent,
          source: 'auth',
        },
      });

      logger.info(`Auth event: ${action} for ${userEmail}`);
      return auditLog;
    } catch (error) {
      logger.error('Failed to log auth event:', error);
      return null;
    }
  },

  /**
   * Log data export events
   */
  async logExport({
    tableName,
    recordCount,
    filters,
    format,
    userId,
    userEmail,
    ipAddress,
    userAgent,
  }) {
    try {
      const auditLog = await prisma.auditLog.create({
        data: {
          tableName,
          recordId: 'bulk_export',
          action: 'EXPORT',
          newValues: {
            recordCount,
            filters,
            format,
            exportedAt: new Date().toISOString(),
          },
          userId,
          userEmail,
          ipAddress,
          userAgent,
          source: 'web',
        },
      });

      logger.info(`Export: ${recordCount} ${tableName} records by ${userEmail}`);
      return auditLog;
    } catch (error) {
      logger.error('Failed to log export:', error);
      return null;
    }
  },

  /**
   * Log record view events (for sensitive records)
   */
  async logView({
    tableName,
    recordId,
    userId,
    userEmail,
    ipAddress,
    userAgent,
  }) {
    try {
      const auditLog = await prisma.auditLog.create({
        data: {
          tableName,
          recordId,
          action: 'VIEW',
          userId,
          userEmail,
          ipAddress,
          userAgent,
          source: 'web',
        },
      });

      return auditLog;
    } catch (error) {
      logger.error('Failed to log view:', error);
      return null;
    }
  },

  /**
   * Get audit logs for a specific record
   */
  async getRecordAuditLogs(tableName, recordId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const logs = await prisma.auditLog.findMany({
      where: {
        tableName,
        recordId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.auditLog.count({
      where: {
        tableName,
        recordId,
      },
    });

    return { logs, total };
  },

  /**
   * Get audit logs for a user
   */
  async getUserAuditLogs(userId, options = {}) {
    const { limit = 50, offset = 0, action = null, startDate = null, endDate = null } = options;

    const where = { userId };
    if (action) where.action = action;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.auditLog.count({ where });

    return { logs, total };
  },

  /**
   * Search audit logs
   */
  async searchAuditLogs(options = {}) {
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
    } = options;

    const where = {};
    if (tableName) where.tableName = tableName;
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (userEmail) where.userEmail = { contains: userEmail, mode: 'insensitive' };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }
    if (searchField && searchValue) {
      where.changedFields = { has: searchField };
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await prisma.auditLog.count({ where });

    return { logs, total };
  },

  /**
   * Get audit summary statistics
   */
  async getAuditStats(options = {}) {
    const { startDate, endDate } = options;

    const where = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Get counts by action
    const actionCounts = await prisma.auditLog.groupBy({
      by: ['action'],
      where,
      _count: true,
    });

    // Get counts by table
    const tableCounts = await prisma.auditLog.groupBy({
      by: ['tableName'],
      where,
      _count: true,
    });

    // Get most active users
    const userActivity = await prisma.auditLog.groupBy({
      by: ['userId', 'userEmail'],
      where: { ...where, userId: { not: null } },
      _count: true,
      orderBy: { _count: { userId: 'desc' } },
      take: 10,
    });

    // Get recent activity count
    const last24Hours = await prisma.auditLog.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    const last7Days = await prisma.auditLog.count({
      where: {
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });

    return {
      actionCounts: actionCounts.reduce((acc, item) => {
        acc[item.action] = item._count;
        return acc;
      }, {}),
      tableCounts: tableCounts.reduce((acc, item) => {
        acc[item.tableName] = item._count;
        return acc;
      }, {}),
      topUsers: userActivity.map((item) => ({
        userId: item.userId,
        email: item.userEmail,
        actionCount: item._count,
      })),
      recentActivity: {
        last24Hours,
        last7Days,
      },
    };
  },

  /**
   * Filter sensitive data from values
   */
  filterSensitiveData(data) {
    if (!data || typeof data !== 'object') return data;

    const filtered = { ...data };
    for (const field of EXCLUDED_FIELDS) {
      if (field in filtered) {
        delete filtered[field];
      }
    }
    for (const field of MASKED_FIELDS) {
      if (field in filtered && filtered[field]) {
        filtered[field] = '****' + String(filtered[field]).slice(-4);
      }
    }
    return filtered;
  },

  /**
   * Get fields that changed between old and new values
   */
  getChangedFields(oldValues, newValues) {
    if (!oldValues || !newValues) {
      return newValues ? Object.keys(newValues) : [];
    }

    const changedFields = [];
    const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);

    for (const key of allKeys) {
      if (EXCLUDED_FIELDS.includes(key)) continue;

      const oldVal = JSON.stringify(oldValues[key]);
      const newVal = JSON.stringify(newValues[key]);

      if (oldVal !== newVal) {
        changedFields.push(key);
      }
    }

    return changedFields;
  },

  /**
   * Create a Prisma middleware for automatic audit logging
   * Usage: prisma.$use(auditMiddleware(userId, ipAddress, userAgent))
   */
  createMiddleware({ getUserContext }) {
    return async (params, next) => {
      // Skip audit logging for audit_logs table itself
      if (params.model === 'AuditLog') {
        return next(params);
      }

      // Only audit create, update, delete
      const auditableActions = ['create', 'update', 'delete', 'updateMany', 'deleteMany'];
      if (!auditableActions.includes(params.action)) {
        return next(params);
      }

      const context = getUserContext ? getUserContext() : {};
      const { userId, userEmail, ipAddress, userAgent, source } = context;

      // For update/delete, get the old values first
      let oldRecord = null;
      if (params.action === 'update' || params.action === 'delete') {
        try {
          oldRecord = await prisma[params.model].findUnique({
            where: params.args.where,
          });
        } catch {
          // Record may not exist, that's ok
        }
      }

      // Execute the actual operation
      const result = await next(params);

      // Log the change
      const tableName = params.model.toLowerCase() + 's'; // Convert model to table name
      const recordId = result?.id || params.args?.where?.id || 'unknown';

      const actionMap = {
        create: 'CREATE',
        update: 'UPDATE',
        delete: 'DELETE',
        updateMany: 'UPDATE',
        deleteMany: 'DELETE',
      };

      await this.logChange({
        tableName,
        recordId,
        action: actionMap[params.action],
        oldValues: oldRecord,
        newValues: params.action === 'delete' ? null : result,
        userId,
        userEmail,
        ipAddress,
        userAgent,
        source: source || 'api',
      });

      return result;
    };
  },

  /**
   * Cleanup old audit logs (retention policy)
   */
  async cleanupOldLogs(retentionDays = 365) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const deleted = await prisma.auditLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });

    logger.info(`Cleaned up ${deleted.count} audit logs older than ${retentionDays} days`);
    return deleted.count;
  },
};

export default auditService;
