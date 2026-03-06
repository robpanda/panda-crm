import { PrismaClient, Prisma } from '@prisma/client';
import { notificationService } from '../services/notificationService.js';
import { dispatchMentions } from '../services/mentionDispatcher.js';

const prisma = new PrismaClient();
const notificationModel = Prisma?.dmmf?.datamodel?.models?.find((model) => model.name === 'Notification');
const runtimeNotificationModel = prisma?._runtimeDataModel?.models?.Notification;
const runtimeFields = Array.isArray(runtimeNotificationModel?.fields)
  ? runtimeNotificationModel.fields.map((field) => field.name)
  : Object.keys(runtimeNotificationModel?.fields || {});
const notificationFields = new Set([
  ...(notificationModel?.fields || []).map((field) => field.name),
  ...runtimeFields,
]);
const supportsNotificationActorId = notificationFields.has('actorId');
const supportsNotificationActorRelation = notificationFields.has('actor');

const ACTOR_SELECT = { id: true, fullName: true, firstName: true, lastName: true, email: true };

function withActorInclude(include = {}) {
  if (!supportsNotificationActorRelation) {
    return include;
  }
  return {
    ...include,
    actor: {
      select: ACTOR_SELECT,
    },
  };
}

async function hydrateActors(notifications = []) {
  if (!supportsNotificationActorId || supportsNotificationActorRelation || notifications.length === 0) {
    return notifications;
  }

  const actorIds = [...new Set(notifications.map((notification) => notification.actorId).filter(Boolean))];
  if (!actorIds.length) {
    return notifications;
  }

  const actors = await prisma.user.findMany({
    where: { id: { in: actorIds } },
    select: ACTOR_SELECT,
  });

  const actorById = new Map(actors.map((actor) => [actor.id, actor]));
  return notifications.map((notification) => ({
    ...notification,
    actor: notification.actorId ? actorById.get(notification.actorId) || null : null,
  }));
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

    const include = withActorInclude({
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
    });

    const [rawNotifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.notification.count({ where }),
    ]);
    const notifications = await hydrateActors(rawNotifications);

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
    if (!supportsNotificationActorId) {
      return res.json({
        data: [],
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total: 0,
          totalPages: 0,
        },
      });
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

    const include = withActorInclude({
      user: {
        select: { id: true, fullName: true, firstName: true, lastName: true, email: true },
      },
    });

    const [rawNotifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
        take: parseInt(limit, 10),
      }),
      prisma.notification.count({ where }),
    ]);
    const notifications = await hydrateActors(rawNotifications);

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

    const include = withActorInclude({
      user: {
        select: { id: true, fullName: true, email: true },
      },
      opportunity: true,
      account: true,
      contact: true,
      workOrder: true,
      case: true,
    });

    let notification = await prisma.notification.findUnique({
      where: { id },
      include,
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (supportsNotificationActorId && !supportsNotificationActorRelation && notification.actorId) {
      const actor = await prisma.user.findUnique({
        where: { id: notification.actorId },
        select: ACTOR_SELECT,
      });
      notification = { ...notification, actor: actor || null };
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

    const notificationData = {
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
      sourceType,
      sourceId,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    };
    if (supportsNotificationActorId) {
      notificationData.actorId = actorId || null;
    }

    const include = withActorInclude({
      opportunity: {
        select: { id: true, name: true },
      },
      account: {
        select: { id: true, name: true },
      },
    });

    let notification = await prisma.notification.create({
      data: notificationData,
      include,
    });

    if (supportsNotificationActorId && !supportsNotificationActorRelation && notification.actorId) {
      const actor = await prisma.user.findUnique({
        where: { id: notification.actorId },
        select: ACTOR_SELECT,
      });
      notification = { ...notification, actor: actor || null };
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

    const include = withActorInclude({
      user: {
        select: { id: true, fullName: true },
      },
    });

    const rawNotifications = await prisma.notification.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
    });
    const notifications = await hydrateActors(rawNotifications);

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
