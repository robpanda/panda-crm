import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        include: {
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
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.notification.count({ where }),
    ]);

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

// Get a single notification
export async function getNotification(req, res, next) {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
        opportunity: true,
        account: true,
        contact: true,
        workOrder: true,
        case: true,
      },
    });

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

    const notification = await prisma.notification.create({
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
        sourceType,
        sourceId,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
      include: {
        opportunity: {
          select: { id: true, name: true },
        },
        account: {
          select: { id: true, name: true },
        },
      },
    });

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

    const notifications = await prisma.notification.findMany({
      where,
      include: {
        user: {
          select: { id: true, fullName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
    });

    res.json(notifications);
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
