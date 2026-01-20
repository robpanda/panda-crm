// Mobile App Foundation Service
// Session management, push notifications, offline sync, and mobile activity tracking
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

class MobileService {
  // ==========================================
  // Session Management
  // ==========================================

  /**
   * Register a new mobile device/session
   */
  async registerDevice(data) {
    const {
      userId,
      deviceType,
      deviceId,
      deviceModel,
      osVersion,
      appVersion,
      pushToken,
    } = data;

    // Deactivate any existing sessions for this device
    await prisma.mobileSession.updateMany({
      where: {
        deviceId,
        isActive: true,
      },
      data: {
        isActive: false,
        lastActiveAt: new Date(),
      },
    });

    // Create new session
    const session = await prisma.mobileSession.create({
      data: {
        userId,
        deviceType: deviceType || 'IOS',
        deviceId,
        deviceModel,
        osVersion,
        appVersion,
        pushToken,
        sessionToken: this.generateSessionToken(),
        isActive: true,
        lastActiveAt: new Date(),
      },
    });

    logger.info(`Mobile device registered: ${deviceId} for user ${userId}`);

    return {
      sessionId: session.id,
      sessionToken: session.sessionToken,
    };
  }

  /**
   * Validate session token
   */
  async validateSession(sessionToken) {
    const session = await prisma.mobileSession.findFirst({
      where: {
        sessionToken,
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
    });

    if (!session) {
      return { valid: false };
    }

    // Update last active
    await prisma.mobileSession.update({
      where: { id: session.id },
      data: { lastActiveAt: new Date() },
    });

    return {
      valid: true,
      session,
      user: session.user,
    };
  }

  /**
   * End mobile session (logout)
   */
  async endSession(sessionToken) {
    const session = await prisma.mobileSession.findFirst({
      where: { sessionToken },
    });

    if (!session) {
      throw new Error('Session not found');
    }

    await prisma.mobileSession.update({
      where: { id: session.id },
      data: {
        isActive: false,
        lastActiveAt: new Date(),
      },
    });

    logger.info(`Mobile session ended: ${session.id}`);

    return { success: true };
  }

  /**
   * Update push notification token
   */
  async updatePushToken(sessionId, pushToken) {
    await prisma.mobileSession.update({
      where: { id: sessionId },
      data: { pushToken },
    });

    return { success: true };
  }

  // ==========================================
  // Activity Tracking
  // ==========================================

  /**
   * Log mobile activity
   */
  async logActivity(data) {
    const {
      sessionId,
      userId,
      activityType,
      entityType,
      entityId,
      metadata,
      latitude,
      longitude,
    } = data;

    // Map entity type to correct field
    const entityFields = {};
    if (entityType === 'Opportunity') entityFields.opportunityId = entityId;
    else if (entityType === 'Account') entityFields.accountId = entityId;
    else if (entityType === 'Contact') entityFields.contactId = entityId;
    else if (entityType === 'Lead') entityFields.leadId = entityId;

    const activity = await prisma.mobileActivity.create({
      data: {
        sessionId,
        userId,
        activityType,
        metadata,
        latitude,
        longitude,
        ...entityFields,
      },
    });

    return activity;
  }

  /**
   * Get user's recent mobile activities
   */
  async getUserActivities(userId, options = {}) {
    const { limit = 50, activityTypes } = options;

    const where = { userId };
    if (activityTypes?.length) {
      where.activityType = { in: activityTypes };
    }

    return prisma.mobileActivity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        opportunity: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // ==========================================
  // Offline Sync
  // ==========================================

  /**
   * Get data for offline caching
   */
  async getOfflineData(userId, options = {}) {
    const {
      lastSyncAt,
      includeOpportunities = true,
      includeAccounts = true,
      includeContacts = true,
      includeAppointments = true,
    } = options;

    const syncFilter = lastSyncAt
      ? { updatedAt: { gte: new Date(lastSyncAt) } }
      : {};

    const data = {};

    // Get user's opportunities
    if (includeOpportunities) {
      data.opportunities = await prisma.opportunity.findMany({
        where: {
          ownerId: userId,
          ...syncFilter,
        },
        select: {
          id: true,
          name: true,
          stage: true,
          status: true,
          amount: true,
          closeDate: true,
          street: true,
          city: true,
          state: true,
          postalCode: true,
          accountId: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: 200,
      });
    }

    // Get related accounts
    if (includeAccounts) {
      const accountIds = data.opportunities?.map(o => o.accountId).filter(Boolean) || [];
      data.accounts = await prisma.account.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { id: { in: accountIds } },
          ],
          ...syncFilter,
        },
        select: {
          id: true,
          name: true,
          phone: true,
          billingStreet: true,
          billingCity: true,
          billingState: true,
          billingPostalCode: true,
          updatedAt: true,
        },
        take: 200,
      });
    }

    // Get contacts
    if (includeContacts) {
      const accountIds = data.accounts?.map(a => a.id) || [];
      data.contacts = await prisma.contact.findMany({
        where: {
          OR: [
            { ownerId: userId },
            { accountId: { in: accountIds } },
          ],
          ...syncFilter,
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          mobilePhone: true,
          accountId: true,
          updatedAt: true,
        },
        take: 500,
      });
    }

    // Get upcoming appointments (ServiceAppointments would need to be added)
    if (includeAppointments) {
      // Placeholder - would query ServiceAppointment model
      data.appointments = [];
    }

    data.syncedAt = new Date().toISOString();

    return data;
  }

  /**
   * Sync offline changes back to server
   */
  async syncOfflineChanges(userId, changes) {
    const results = {
      success: [],
      errors: [],
    };

    for (const change of changes) {
      try {
        await this.processOfflineChange(userId, change);
        results.success.push({
          localId: change.localId,
          entityType: change.entityType,
          action: change.action,
        });
      } catch (error) {
        results.errors.push({
          localId: change.localId,
          entityType: change.entityType,
          action: change.action,
          error: error.message,
        });
      }
    }

    logger.info(`Offline sync: ${results.success.length} succeeded, ${results.errors.length} failed`);

    return results;
  }

  async processOfflineChange(userId, change) {
    const { entityType, action, entityId, data } = change;

    switch (entityType) {
      case 'Opportunity':
        return this.syncOpportunityChange(userId, action, entityId, data);
      case 'Account':
        return this.syncAccountChange(userId, action, entityId, data);
      case 'Contact':
        return this.syncContactChange(userId, action, entityId, data);
      case 'Activity':
        return this.logActivity({ userId, ...data });
      default:
        throw new Error(`Unknown entity type: ${entityType}`);
    }
  }

  async syncOpportunityChange(userId, action, entityId, data) {
    if (action === 'update' && entityId) {
      // Verify ownership
      const opp = await prisma.opportunity.findFirst({
        where: { id: entityId, ownerId: userId },
      });
      if (!opp) throw new Error('Opportunity not found or not owned by user');

      return prisma.opportunity.update({
        where: { id: entityId },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });
    }
    throw new Error(`Unsupported action: ${action}`);
  }

  async syncAccountChange(userId, action, entityId, data) {
    if (action === 'update' && entityId) {
      const account = await prisma.account.findFirst({
        where: { id: entityId, ownerId: userId },
      });
      if (!account) throw new Error('Account not found or not owned by user');

      return prisma.account.update({
        where: { id: entityId },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });
    }
    throw new Error(`Unsupported action: ${action}`);
  }

  async syncContactChange(userId, action, entityId, data) {
    if (action === 'update' && entityId) {
      const contact = await prisma.contact.findFirst({
        where: { id: entityId, ownerId: userId },
      });
      if (!contact) throw new Error('Contact not found or not owned by user');

      return prisma.contact.update({
        where: { id: entityId },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });
    }
    throw new Error(`Unsupported action: ${action}`);
  }

  // ==========================================
  // Push Notifications
  // ==========================================

  /**
   * Send push notification to user
   */
  async sendPushNotification(userId, notification) {
    const { title, body, data } = notification;

    // Get active sessions with push tokens
    const sessions = await prisma.mobileSession.findMany({
      where: {
        userId,
        isActive: true,
        pushToken: { not: null },
      },
    });

    if (sessions.length === 0) {
      logger.warn(`No active mobile sessions with push tokens for user ${userId}`);
      return { sent: 0 };
    }

    const results = await Promise.allSettled(
      sessions.map(session => this.sendToDevice(session, { title, body, data }))
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    logger.info(`Push notification sent to ${sent}/${sessions.length} devices for user ${userId}`);

    return { sent, total: sessions.length };
  }

  async sendToDevice(session, notification) {
    // This would integrate with APNs (iOS) or FCM (Android)
    // For now, just log the attempt
    logger.info(`Would send push to ${session.deviceType} device: ${session.pushToken?.substring(0, 20)}...`);

    // In production, use:
    // - @parse/node-apn for iOS
    // - firebase-admin for Android/FCM

    return { success: true };
  }

  /**
   * Send push notification for new appointment
   */
  async notifyNewAppointment(userId, appointment) {
    return this.sendPushNotification(userId, {
      title: 'New Appointment Scheduled',
      body: `${appointment.subject} on ${new Date(appointment.startTime).toLocaleDateString()}`,
      data: {
        type: 'NEW_APPOINTMENT',
        appointmentId: appointment.id,
        opportunityId: appointment.opportunityId,
      },
    });
  }

  /**
   * Send push notification for opportunity update
   */
  async notifyOpportunityUpdate(userId, opportunity, changeType) {
    const messages = {
      STAGE_CHANGE: `${opportunity.name} moved to ${opportunity.stage}`,
      AMOUNT_CHANGE: `${opportunity.name} amount updated to $${opportunity.amount?.toLocaleString()}`,
      ASSIGNED: `You've been assigned to ${opportunity.name}`,
    };

    return this.sendPushNotification(userId, {
      title: 'Opportunity Update',
      body: messages[changeType] || `${opportunity.name} was updated`,
      data: {
        type: changeType,
        opportunityId: opportunity.id,
      },
    });
  }

  // ==========================================
  // Mobile Dashboard Data
  // ==========================================

  /**
   * Get dashboard data for mobile app
   */
  async getDashboardData(userId) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekFromNow = new Date(today);
    weekFromNow.setDate(weekFromNow.getDate() + 7);

    // Get pipeline summary
    const pipelineSummary = await prisma.opportunity.groupBy({
      by: ['stage'],
      where: {
        ownerId: userId,
        stage: { notIn: ['Closed Won', 'Closed Lost'] },
      },
      _count: { id: true },
      _sum: { amount: true },
    });

    // Get recent opportunities
    const recentOpportunities = await prisma.opportunity.findMany({
      where: { ownerId: userId },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        name: true,
        stage: true,
        amount: true,
        closeDate: true,
        account: { select: { name: true } },
      },
    });

    // Get opportunities closing soon
    const closingSoon = await prisma.opportunity.findMany({
      where: {
        ownerId: userId,
        stage: { notIn: ['Closed Won', 'Closed Lost'] },
        closeDate: {
          gte: today,
          lte: weekFromNow,
        },
      },
      orderBy: { closeDate: 'asc' },
      select: {
        id: true,
        name: true,
        amount: true,
        closeDate: true,
        stage: true,
      },
    });

    // Get today's stats
    const todayStats = await prisma.mobileActivity.groupBy({
      by: ['activityType'],
      where: {
        userId,
        createdAt: { gte: today },
      },
      _count: { id: true },
    });

    return {
      pipeline: {
        stages: pipelineSummary.map(s => ({
          stage: s.stage,
          count: s._count.id,
          value: s._sum.amount || 0,
        })),
        totalCount: pipelineSummary.reduce((sum, s) => sum + s._count.id, 0),
        totalValue: pipelineSummary.reduce((sum, s) => sum + (s._sum.amount || 0), 0),
      },
      recentOpportunities,
      closingSoon,
      todayActivity: todayStats.reduce((acc, s) => {
        acc[s.activityType] = s._count.id;
        return acc;
      }, {}),
    };
  }

  /**
   * Get opportunity detail for mobile
   */
  async getOpportunityDetail(opportunityId, userId) {
    const opportunity = await prisma.opportunity.findFirst({
      where: {
        id: opportunityId,
        OR: [
          { ownerId: userId },
          { account: { ownerId: userId } },
        ],
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            phone: true,
            billingStreet: true,
            billingCity: true,
            billingState: true,
            billingPostalCode: true,
          },
        },
        contacts: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            mobilePhone: true,
            isPrimary: true,
          },
        },
        measurementReports: {
          where: { orderStatus: 'DELIVERED' },
          orderBy: { deliveredAt: 'desc' },
          take: 1,
        },
        callLogs: {
          orderBy: { startTime: 'desc' },
          take: 5,
          select: {
            id: true,
            direction: true,
            startTime: true,
            duration: true,
            disposition: true,
            summary: true,
          },
        },
      },
    });

    if (!opportunity) {
      throw new Error('Opportunity not found');
    }

    // Log view activity
    await this.logActivity({
      userId,
      activityType: 'VIEW_RECORD',
      entityType: 'Opportunity',
      entityId: opportunityId,
    });

    return opportunity;
  }

  // ==========================================
  // Utility Methods
  // ==========================================

  generateSessionToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Clean up stale sessions
   */
  async cleanupStaleSessions(daysOld = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const result = await prisma.mobileSession.updateMany({
      where: {
        isActive: true,
        lastActiveAt: { lt: cutoff },
      },
      data: {
        isActive: false,
      },
    });

    logger.info(`Cleaned up ${result.count} stale mobile sessions`);
    return result;
  }

  /**
   * Get mobile usage statistics
   */
  async getUsageStats(options = {}) {
    const { startDate, endDate } = options;

    const where = {};
    if (startDate) where.createdAt = { gte: startDate };
    if (endDate) where.createdAt = { ...where.createdAt, lte: endDate };

    const activeSessions = await prisma.mobileSession.count({
      where: { isActive: true },
    });

    const sessionsByDevice = await prisma.mobileSession.groupBy({
      by: ['deviceType'],
      where: { isActive: true },
      _count: { id: true },
    });

    const activityByType = await prisma.mobileActivity.groupBy({
      by: ['activityType'],
      where,
      _count: { id: true },
    });

    const dailyActivity = await prisma.$queryRaw`
      SELECT DATE(created_at) as date, COUNT(*) as count
      FROM mobile_activity
      WHERE created_at >= ${startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
      GROUP BY DATE(created_at)
      ORDER BY date DESC
      LIMIT 30
    `;

    return {
      activeSessions,
      sessionsByDevice: sessionsByDevice.reduce((acc, s) => {
        acc[s.deviceType] = s._count.id;
        return acc;
      }, {}),
      activityByType: activityByType.reduce((acc, a) => {
        acc[a.activityType] = a._count.id;
        return acc;
      }, {}),
      dailyActivity,
    };
  }
}

export const mobileService = new MobileService();
