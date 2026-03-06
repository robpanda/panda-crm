import { PrismaClient } from '@prisma/client';
import { notificationService } from '../services/notificationService.js';
import { dispatchMentions } from '../services/mentionDispatcher.js';

const prisma = new PrismaClient();

function isUnknownActorIncludeError(error) {
  const message = String(error?.message || '');
  return message.includes('Unknown field `actor` for include statement on model `Notification`');
}

function dropActorInclude(include = undefined) {
  if (!include || typeof include !== 'object') return include;
  if (!Object.prototype.hasOwnProperty.call(include, 'actor')) return include;
  const { actor, ...rest } = include;
  return rest;
}

// List notifications for a user with filtering
export async function listNotifications(req, res, next) {
  try {
    const {
      userId,
      status,
      type,
      priority,
      opportunityId,
      accountId,
      page = 1,
      limit = 20,
    } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const where = {
      userId,
      ...(status && { status }),
      ...(type && { type }),
      ...(priority && { priority }),
      ...(opportunityId && { opportunityId }),
      ...(accountId && { accountId }),
      status: status || { not: 'DELETED' }, // Exclude deleted by default
    };

    const findManyArgs = {
      where,
      include: {
        actor: {
          select: { id: true, fullName: true, firstName: true, lastName: true, email: true },
        },
        opportunity: {
          select: { id: true, name: true, stage: true },
        },
        account: {
          select: { id: true, name: true },
        },
        contact: {
          select: { id: true, fullName: true },
        },
        workOrder: {
          select: { id: true, workOrderNumber: true, status: true },
        },
        case: {
          select: { id: true, caseNumber: true, subject: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
      take: parseInt(limit, 10),
    };

    const totalPromise = prisma.notification.count({ where });
    let notifications;
    try {
      notifications = await prisma.notification.findMany(findManyArgs);
    } catch (error) {
      if (!isUnknownActorIncludeError(error)) throw error;
      notifications = await prisma.notification.findMany({
        ...findManyArgs,
        include: dropActorInclude(findManyArgs.include),
      });
    }
    const total = await totalPromise;

    res.json({
      data: notifications,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
}

// List notifications sent by an actor (Outbox)
export async function listOutboxNotifications(req, res, next) {
  try {
    const {
      actorId,
      type,
      priority,
      status,
      opportunityId,
      accountId,
      page = 1,
      limit = 20,
    } = req.query;

    if (!actorId) {
      return res.status(400).json({ error: 'actorId is required' });
    }

    const where = {
      actorId,
      ...(status && { status }),
      ...(type && { type }),
      ...(priority && { priority }),
      ...(opportunityId && { opportunityId }),
      ...(accountId && { accountId }),
      status: status || { not: 'DELETED' },
    };

    const findManyArgs = {
      where,
      include: {
        user: {
          select: { id: true, fullName: true, firstName: true, lastName: true, email: true },
        },
        actor: {
          select: { id: true, fullName: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
      take: parseInt(limit, 10),
    };

    const totalPromise = prisma.notification.count({ where });
    let notifications;
    try {
      notifications = await prisma.notification.findMany(findManyArgs);
    } catch (error) {
      if (!isUnknownActorIncludeError(error)) throw error;
      notifications = await prisma.notification.findMany({
        ...findManyArgs,
        include: dropActorInclude(findManyArgs.include),
      });
    }
    const total = await totalPromise;

    res.json({
      data: notifications,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / parseInt(limit, 10)),
      },
    });
  } catch (error) {
    next(error);
  }
}

// Get a single notification
export async function getNotification(req, res, next) {
  try {
    const { id } = req.params;

    const findUniqueArgs = {
      where: { id },
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
        actor: {
          select: { id: true, fullName: true, email: true },
        },
        opportunity: true,
        account: true,
        contact: true,
        workOrder: true,
        case: true,
      },
    };

    let notification;
    try {
      notification = await prisma.notification.findUnique(findUniqueArgs);
    } catch (error) {
      if (!isUnknownActorIncludeError(error)) throw error;
      notification = await prisma.notification.findUnique({
        ...findUniqueArgs,
        include: dropActorInclude(findUniqueArgs.include),
      });
    }

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json(notification);
  } catch (error) {
    next(error);
  }
}

// Create a notification (typically called by other services)
export async function createNotification(req, res, next) {
  try {
    const {
      userId,
      type,
      title,
      message,
      priority = 'NORMAL',
      actionUrl,
      actionLabel,
      opportunityId,
      accountId,
      contactId,
      leadId,
      workOrderId,
      caseId,
      sourceType,
      sourceId,
      expiresAt,
      actorId,
    } = req.body;

    if (!userId || !type || !title || !message) {
      return res.status(400).json({
        error: 'userId, type, title, and message are required',
      });
    }

    // Check user preferences before creating
    const preferences = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    // Check if this type is disabled by user
    if (preferences?.typePreferences) {
      const typePrefs = preferences.typePreferences[type];
      if (typePrefs && typePrefs.enabled === false) {
        return res.json({
          message: 'Notification type disabled by user preferences',
          created: false,
        });
      }
    }

    const createArgs = {
      data: {
        userId,
        type,
        title,
        message,
        priority,
        actionUrl,
        actionLabel,
        opportunityId,
        accountId,
        contactId,
        leadId,
        workOrderId,
        caseId,
        actorId: actorId || null,
        sourceType,
        sourceId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      include: {
        actor: {
          select: { id: true, fullName: true, email: true },
        },
        opportunity: {
          select: { id: true, name: true },
        },
        account: {
          select: { id: true, name: true },
        },
      },
    };

    let notification;
    try {
      notification = await prisma.notification.create(createArgs);
    } catch (error) {
      if (!isUnknownActorIncludeError(error)) throw error;
      notification = await prisma.notification.create({
        ...createArgs,
        include: dropActorInclude(createArgs.include),
      });
    }

    // Queue email/SMS delivery if enabled in preferences
    // This would be handled by a separate delivery service
    if (preferences?.emailEnabled) {
      // TODO: Queue email delivery
      console.log('Would queue email for notification:', notification.id);
    }

    if (preferences?.smsEnabled) {
      // TODO: Queue SMS delivery
      console.log('Would queue SMS for notification:', notification.id);
    }

    res.status(201).json(notification);
  } catch (error) {
    next(error);
  }
}

// Mark notification as read
export async function markAsRead(req, res, next) {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.update({
      where: { id },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    });

    res.json(notification);
  } catch (error) {
    next(error);
  }
}

// Mark all notifications as read for a user
export async function markAllAsRead(req, res, next) {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await prisma.notification.updateMany({
      where: {
        userId,
        status: 'UNREAD',
      },
      data: {
        status: 'READ',
        readAt: new Date(),
      },
    });

    res.json({ updated: result.count });
  } catch (error) {
    next(error);
  }
}

// Archive notification
export async function archiveNotification(req, res, next) {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        archivedAt: new Date(),
      },
    });

    res.json(notification);
  } catch (error) {
    next(error);
  }
}

// Delete notification (soft delete)
export async function deleteNotification(req, res, next) {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.update({
      where: { id },
      data: {
        status: 'DELETED',
      },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

// Get unread count for a user
export async function getUnreadCount(req, res, next) {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const count = await prisma.notification.count({
      where: {
        userId,
        status: 'UNREAD',
      },
    });

    // Also get counts by priority
    const [urgent, high, normal] = await Promise.all([
      prisma.notification.count({
        where: { userId, status: 'UNREAD', priority: 'URGENT' },
      }),
      prisma.notification.count({
        where: { userId, status: 'UNREAD', priority: 'HIGH' },
      }),
      prisma.notification.count({
        where: { userId, status: 'UNREAD', priority: 'NORMAL' },
      }),
    ]);

    res.json({
      total: count,
      byPriority: { urgent, high, normal },
    });
  } catch (error) {
    next(error);
  }
}

// Get notifications for a specific opportunity (for Opportunity Hub)
export async function getNotificationsByOpportunity(req, res, next) {
  try {
    const { opportunityId } = req.params;
    const { userId, status, limit = 10 } = req.query;

    const where = {
      opportunityId,
      ...(userId && { userId }),
      ...(status ? { status } : { status: { not: 'DELETED' } }),
    };

    const findManyArgs = {
      where,
      include: {
        user: {
          select: { id: true, fullName: true },
        },
        actor: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
    };

    let notifications;
    try {
      notifications = await prisma.notification.findMany(findManyArgs);
    } catch (error) {
      if (!isUnknownActorIncludeError(error)) throw error;
      notifications = await prisma.notification.findMany({
        ...findManyArgs,
        include: dropActorInclude(findManyArgs.include),
      });
    }

    res.json(notifications);
  } catch (error) {
    next(error);
  }
}

// Canonical mention dispatch endpoint for lead/job internal comms.
export async function dispatchMentionNotifications(req, res, next) {
  try {
    const {
      actorId = null,
      actorName = null,
      recipients = [],
      entityType = null,
      entityId = null,
      noteId = null,
      commentId = null,
      snippet = '',
      bodyPreview = '',
      actionPath = null,
      actionLabel = null,
      context = null,
      sourceType = null,
      sourceId = null,
      leadId = null,
      opportunityId = null,
      accountId = null,
      correlationId = null,
    } = req.body || {};

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'recipients array is required' },
      });
    }

    const dispatchResult = await dispatchMentions({
      notificationService,
      actorId,
      actorName: actorName || 'Someone',
      recipients,
      entityType,
      entityId,
      noteId,
      commentId,
      snippet,
      bodyPreview,
      actionPath,
      actionLabel,
      context,
      sourceType,
      sourceId,
      leadId,
      opportunityId,
      accountId,
      correlationId,
      logger: console,
    });

    res.json({
      success: true,
      data: dispatchResult,
    });
  } catch (error) {
    next(error);
  }
}

// Bulk update notification status
export async function bulkUpdateStatus(req, res, next) {
  try {
    const { ids, status } = req.body;

    if (!ids || !Array.isArray(ids) || !status) {
      return res.status(400).json({
        error: 'ids (array) and status are required',
      });
    }

    const updateData = { status };
    if (status === 'READ') {
      updateData.readAt = new Date();
    } else if (status === 'ARCHIVED') {
      updateData.archivedAt = new Date();
    }

    const result = await prisma.notification.updateMany({
      where: {
        id: { in: ids },
      },
      data: updateData,
    });

    res.json({ updated: result.count });
  } catch (error) {
    next(error);
  }
}
