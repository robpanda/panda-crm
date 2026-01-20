// Attention Queue Service
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Get attention items with filters and pagination
 */
export async function getAttentionItems({
  userId = null,
  status = null,
  type = null,
  category = null,
  urgency = null,
  priority = null,
  opportunityId = null,
  accountId = null,
  includeCompleted = false,
  includeDismissed = false,
  includeSnoozed = true,
  page = 1,
  limit = 50,
  sortBy = 'urgency',
  sortOrder = 'desc',
}) {
  const where = {};

  // User filter
  if (userId) {
    where.assignedToId = userId;
  }

  // Status filters
  const statusFilters = ['PENDING', 'IN_PROGRESS'];
  if (includeCompleted) statusFilters.push('COMPLETED');
  if (includeDismissed) statusFilters.push('DISMISSED');
  if (includeSnoozed) statusFilters.push('SNOOZED');
  where.status = { in: statusFilters };

  if (status) {
    where.status = status;
  }

  // Other filters
  if (type) where.type = type;
  if (category) where.category = category;
  if (urgency) where.urgency = urgency;
  if (priority) where.priority = priority;
  if (opportunityId) where.opportunityId = opportunityId;
  if (accountId) where.accountId = accountId;

  // Sorting
  const orderBy = [];
  if (sortBy === 'urgency') {
    orderBy.push({ urgency: sortOrder });
    orderBy.push({ priority: 'desc' });
    orderBy.push({ createdAt: 'desc' });
  } else if (sortBy === 'dueDate') {
    orderBy.push({ dueDate: sortOrder });
  } else if (sortBy === 'priority') {
    orderBy.push({ priority: sortOrder });
  } else {
    orderBy.push({ createdAt: sortOrder });
  }

  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    prisma.attentionItem.findMany({
      where,
      orderBy,
      skip,
      take: limit,
      include: {
        opportunity: {
          select: { id: true, name: true, stage: true, amount: true },
        },
        account: {
          select: { id: true, name: true },
        },
        contact: {
          select: { id: true, firstName: true, lastName: true },
        },
        lead: {
          select: { id: true, firstName: true, lastName: true, status: true },
        },
        workOrder: {
          select: { id: true, workOrderNumber: true, status: true },
        },
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    }),
    prisma.attentionItem.count({ where }),
  ]);

  return {
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get attention queue statistics
 */
export async function getStats(userId = null) {
  const where = userId ? { assignedToId: userId } : {};

  const [
    totalPending,
    totalInProgress,
    totalCompleted,
    totalDismissed,
    totalSnoozed,
    byCategoryResults,
    byUrgencyResults,
    byTypeResults,
  ] = await Promise.all([
    prisma.attentionItem.count({ where: { ...where, status: 'PENDING' } }),
    prisma.attentionItem.count({ where: { ...where, status: 'IN_PROGRESS' } }),
    prisma.attentionItem.count({ where: { ...where, status: 'COMPLETED' } }),
    prisma.attentionItem.count({ where: { ...where, status: 'DISMISSED' } }),
    prisma.attentionItem.count({ where: { ...where, status: 'SNOOZED' } }),
    prisma.attentionItem.groupBy({
      by: ['category'],
      where: { ...where, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      _count: true,
    }),
    prisma.attentionItem.groupBy({
      by: ['urgency'],
      where: { ...where, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      _count: true,
    }),
    prisma.attentionItem.groupBy({
      by: ['type'],
      where: { ...where, status: { in: ['PENDING', 'IN_PROGRESS'] } },
      _count: true,
    }),
  ]);

  const byCategory = {};
  byCategoryResults.forEach((r) => {
    byCategory[r.category] = r._count;
  });

  const byUrgency = {};
  byUrgencyResults.forEach((r) => {
    byUrgency[r.urgency] = r._count;
  });

  const byType = {};
  byTypeResults.forEach((r) => {
    byType[r.type] = r._count;
  });

  return {
    total: totalPending + totalInProgress,
    pending: totalPending,
    inProgress: totalInProgress,
    completed: totalCompleted,
    dismissed: totalDismissed,
    snoozed: totalSnoozed,
    byCategory,
    byUrgency,
    byType,
  };
}

/**
 * Get a single attention item by ID
 */
export async function getAttentionItemById(id) {
  return prisma.attentionItem.findUnique({
    where: { id },
    include: {
      opportunity: true,
      account: true,
      contact: true,
      lead: true,
      workOrder: true,
      quote: true,
      invoice: true,
      assignedTo: true,
    },
  });
}

/**
 * Create a new attention item
 */
export async function createAttentionItem(data) {
  return prisma.attentionItem.create({
    data: {
      title: data.title,
      description: data.description,
      type: data.type,
      category: data.category || 'TASK',
      priority: data.priority || 'NORMAL',
      urgency: data.urgency || 'MEDIUM',
      status: 'PENDING',
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      sourceData: data.sourceData,
      dueDate: data.dueDate,
      amount: data.amount,
      opportunityId: data.opportunityId,
      accountId: data.accountId,
      contactId: data.contactId,
      leadId: data.leadId,
      workOrderId: data.workOrderId,
      quoteId: data.quoteId,
      invoiceId: data.invoiceId,
      caseId: data.caseId,
      assignedToId: data.assignedToId,
      actionType: data.actionType,
      actionUrl: data.actionUrl,
    },
    include: {
      opportunity: { select: { id: true, name: true } },
      account: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

/**
 * Update an attention item
 */
export async function updateAttentionItem(id, data) {
  return prisma.attentionItem.update({
    where: { id },
    data,
  });
}

/**
 * Delete an attention item
 */
export async function deleteAttentionItem(id) {
  return prisma.attentionItem.delete({
    where: { id },
  });
}

/**
 * Mark item as complete
 */
export async function completeItem(id, userId) {
  return prisma.attentionItem.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedById: userId,
    },
  });
}

/**
 * Dismiss item
 */
export async function dismissItem(id, userId, reason = null) {
  return prisma.attentionItem.update({
    where: { id },
    data: {
      status: 'DISMISSED',
      dismissedAt: new Date(),
      dismissedById: userId,
      dismissReason: reason,
    },
  });
}

/**
 * Snooze item
 */
export async function snoozeItem(id, duration) {
  let snoozeUntil;

  if (duration instanceof Date) {
    snoozeUntil = duration;
  } else {
    const now = new Date();
    switch (duration) {
      case '1h':
        snoozeUntil = new Date(now.getTime() + 60 * 60 * 1000);
        break;
      case '4h':
        snoozeUntil = new Date(now.getTime() + 4 * 60 * 60 * 1000);
        break;
      case '1d':
        snoozeUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        break;
      case '3d':
        snoozeUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
        break;
      case '1w':
        snoozeUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        break;
      default:
        snoozeUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  return prisma.attentionItem.update({
    where: { id },
    data: {
      status: 'SNOOZED',
      snoozeUntil,
    },
  });
}

/**
 * Assign item to a user
 */
export async function assignItem(id, userId) {
  return prisma.attentionItem.update({
    where: { id },
    data: {
      assignedToId: userId,
    },
  });
}

/**
 * Start working on an item
 */
export async function startItem(id) {
  return prisma.attentionItem.update({
    where: { id },
    data: {
      status: 'IN_PROGRESS',
      startedAt: new Date(),
    },
  });
}

/**
 * Refresh the attention queue by running generators
 */
export async function refreshQueue() {
  // This would run various generators to create attention items
  // based on business rules (overdue invoices, stale leads, etc.)
  // For now, just return stats
  const created = 0;
  return { created };
}

/**
 * Clean up old completed/dismissed items
 */
export async function cleanupOldItems(olderThanDays = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await prisma.attentionItem.deleteMany({
    where: {
      status: { in: ['COMPLETED', 'DISMISSED'] },
      updatedAt: { lt: cutoffDate },
    },
  });

  return result.count;
}

export const attentionService = {
  getAttentionItems,
  getStats,
  getAttentionItemById,
  createAttentionItem,
  updateAttentionItem,
  deleteAttentionItem,
  completeItem,
  dismissItem,
  snoozeItem,
  assignItem,
  startItem,
  refreshQueue,
  cleanupOldItems,
};

export default attentionService;
