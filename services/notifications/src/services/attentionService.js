// Attention Queue Service
// Manages attention items - things that need user action

import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  fullName: true,
  email: true,
};

function withUserDisplayName(user) {
  if (!user || typeof user !== 'object') return user;
  const computedName = user.fullName || [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email || null;
  return {
    ...user,
    name: computedName,
  };
}

export const attentionService = {
  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  /**
   * Get attention items with filters
   */
  async getAttentionItems({
    userId,
    status = 'PENDING',
    type,
    category,
    urgency,
    priority,
    opportunityId,
    accountId,
    includeCompleted = false,
    includeDismissed = false,
    includeSnoozed = true,
    page = 1,
    limit = 50,
    sortBy = 'urgency', // urgency, createdAt, dueDate
    sortOrder = 'desc',
  }) {
    const where = {};

    // Filter by user assignment
    if (userId) {
      where.assignedToId = userId;
    }

    // Status filter
    if (!includeCompleted && !includeDismissed) {
      where.status = { in: includeSnoozed ? ['PENDING', 'IN_PROGRESS', 'SNOOZED'] : ['PENDING', 'IN_PROGRESS'] };
    } else if (status) {
      where.status = status;
    }

    // Handle snoozed items - only show if snooze time has passed
    if (includeSnoozed) {
      where.OR = [
        { status: { in: ['PENDING', 'IN_PROGRESS'] } },
        { status: 'SNOOZED', snoozedUntil: { lte: new Date() } },
      ];
    }

    // Type filter
    if (type) {
      where.type = type;
    }

    // Category filter
    if (category) {
      where.category = category;
    }

    // Urgency filter
    if (urgency) {
      where.urgency = urgency;
    }

    // Priority filter
    if (priority) {
      where.priority = priority;
    }

    // Opportunity filter
    if (opportunityId) {
      where.opportunityId = opportunityId;
    }

    // Account filter
    if (accountId) {
      where.accountId = accountId;
    }

    // Build sort order - urgency uses custom ordering
    let orderBy;
    if (sortBy === 'urgency') {
      // We'll sort in memory for custom urgency order
      orderBy = { createdAt: 'desc' };
    } else {
      orderBy = { [sortBy]: sortOrder };
    }

    const [items, total] = await Promise.all([
      prisma.attentionItem.findMany({
        where,
        include: {
          opportunity: {
            select: { id: true, name: true, stage: true, amount: true },
          },
          account: {
            select: { id: true, name: true },
          },
          contact: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          lead: {
            select: { id: true, firstName: true, lastName: true, status: true },
          },
          workOrder: {
            select: { id: true, workOrderNumber: true, status: true },
          },
          quote: {
            select: { id: true, quoteNumber: true, status: true, total: true },
          },
          invoice: {
            select: { id: true, invoiceNumber: true, status: true, total: true, balanceDue: true },
          },
          case: {
            select: { id: true, caseNumber: true, subject: true, priority: true },
          },
          approvalRequest: {
            select: { id: true, subject: true, status: true, type: true },
          },
          assignedTo: {
            select: userSelect,
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.attentionItem.count({ where }),
    ]);

    // Custom sort for urgency
    if (sortBy === 'urgency') {
      const urgencyOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      items.sort((a, b) => {
        const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
        if (urgencyDiff !== 0) return sortOrder === 'asc' ? urgencyDiff : -urgencyDiff;
        // Secondary sort by due date
        if (a.dueDate && b.dueDate) {
          return sortOrder === 'asc'
            ? new Date(a.dueDate) - new Date(b.dueDate)
            : new Date(b.dueDate) - new Date(a.dueDate);
        }
        return 0;
      });
    }

    const normalizedItems = items.map((item) => ({
      ...item,
      assignedTo: withUserDisplayName(item.assignedTo),
    }));

    return {
      items: normalizedItems,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get attention item by ID
   */
  async getAttentionItemById(id) {
    const item = await prisma.attentionItem.findUnique({
      where: { id },
      include: {
        opportunity: true,
        account: true,
        contact: true,
        lead: true,
        workOrder: true,
        quote: true,
        invoice: true,
        case: true,
        approvalRequest: true,
        assignedTo: true,
        dismissedBy: true,
      },
    });
    if (!item) return item;
    return {
      ...item,
      assignedTo: withUserDisplayName(item.assignedTo),
      dismissedBy: withUserDisplayName(item.dismissedBy),
    };
  },

  /**
   * Create a new attention item
   */
  async createAttentionItem(data) {
    // Calculate days overdue if due date is in the past
    let daysOverdue = null;
    if (data.dueDate && new Date(data.dueDate) < new Date()) {
      const diff = Date.now() - new Date(data.dueDate).getTime();
      daysOverdue = Math.floor(diff / (1000 * 60 * 60 * 24));
    }

    const item = await prisma.attentionItem.create({
      data: {
        ...data,
        daysOverdue,
      },
      include: {
        opportunity: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        assignedTo: { select: userSelect },
      },
    });
    return {
      ...item,
      assignedTo: withUserDisplayName(item.assignedTo),
    };
  },

  /**
   * Update an attention item
   */
  async updateAttentionItem(id, data) {
    const item = await prisma.attentionItem.update({
      where: { id },
      data,
      include: {
        opportunity: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        assignedTo: { select: userSelect },
      },
    });
    return {
      ...item,
      assignedTo: withUserDisplayName(item.assignedTo),
    };
  },

  /**
   * Delete an attention item
   */
  async deleteAttentionItem(id) {
    return prisma.attentionItem.delete({ where: { id } });
  },

  // ============================================================================
  // ACTIONS
  // ============================================================================

  /**
   * Complete an attention item
   */
  async completeItem(id, userId) {
    return prisma.attentionItem.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        actionCompleted: true,
        actionCompletedAt: new Date(),
        actionCompletedById: userId,
      },
    });
  },

  /**
   * Dismiss an attention item
   */
  async dismissItem(id, userId, reason = null) {
    return prisma.attentionItem.update({
      where: { id },
      data: {
        status: 'DISMISSED',
        dismissedAt: new Date(),
        dismissedById: userId,
        dismissReason: reason,
      },
    });
  },

  /**
   * Snooze an attention item
   */
  async snoozeItem(id, snoozeDuration) {
    // Calculate snooze until date
    const snoozeUntil = new Date();
    switch (snoozeDuration) {
      case '1h':
        snoozeUntil.setHours(snoozeUntil.getHours() + 1);
        break;
      case '4h':
        snoozeUntil.setHours(snoozeUntil.getHours() + 4);
        break;
      case '1d':
        snoozeUntil.setDate(snoozeUntil.getDate() + 1);
        break;
      case '3d':
        snoozeUntil.setDate(snoozeUntil.getDate() + 3);
        break;
      case '1w':
        snoozeUntil.setDate(snoozeUntil.getDate() + 7);
        break;
      default:
        // If a date is passed directly
        if (snoozeDuration instanceof Date) {
          snoozeUntil.setTime(snoozeDuration.getTime());
        }
    }

    return prisma.attentionItem.update({
      where: { id },
      data: {
        status: 'SNOOZED',
        snoozedUntil: snoozeUntil,
      },
    });
  },

  /**
   * Assign an attention item to a user
   */
  async assignItem(id, userId) {
    return prisma.attentionItem.update({
      where: { id },
      data: {
        assignedToId: userId,
        status: 'IN_PROGRESS',
      },
    });
  },

  /**
   * Mark an item as in progress
   */
  async startItem(id) {
    return prisma.attentionItem.update({
      where: { id },
      data: { status: 'IN_PROGRESS' },
    });
  },

  // ============================================================================
  // STATS
  // ============================================================================

  /**
   * Get attention queue statistics
   */
  async getStats(userId = null) {
    const userPredicate = userId
      ? Prisma.sql`assigned_to_id = ${userId}`
      : Prisma.sql`TRUE`;
    const activePredicate = Prisma.sql`${userPredicate} AND status IN ('PENDING','IN_PROGRESS')`;

    const [countRows, urgencyRows, byCategoryRows, byTypeRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE ${activePredicate})::int AS total,
          COUNT(*) FILTER (WHERE ${userPredicate} AND status = 'PENDING')::int AS pending,
          COUNT(*) FILTER (WHERE ${userPredicate} AND status = 'IN_PROGRESS')::int AS in_progress,
          COUNT(*) FILTER (WHERE ${activePredicate} AND urgency = 'CRITICAL')::int AS critical,
          COUNT(*) FILTER (WHERE ${activePredicate} AND urgency = 'HIGH')::int AS high,
          COUNT(*) FILTER (WHERE ${activePredicate} AND urgency = 'MEDIUM')::int AS medium,
          COUNT(*) FILTER (WHERE ${activePredicate} AND urgency = 'LOW')::int AS low,
          COUNT(*) FILTER (WHERE ${activePredicate} AND due_date < NOW())::int AS overdue
        FROM attention_items
      `,
      prisma.$queryRaw`
        SELECT urgency::text AS urgency, COUNT(*)::int AS count
        FROM attention_items
        WHERE ${activePredicate}
        GROUP BY urgency
      `,
      prisma.$queryRaw`
        SELECT category::text AS category, COUNT(*)::int AS count
        FROM attention_items
        WHERE ${activePredicate}
        GROUP BY category
      `,
      prisma.$queryRaw`
        SELECT type::text AS type, COUNT(*)::int AS count
        FROM attention_items
        WHERE ${activePredicate}
        GROUP BY type
      `,
    ]);

    const counts = Array.isArray(countRows) && countRows[0] ? countRows[0] : {};
    const byUrgency = { critical: 0, high: 0, medium: 0, low: 0 };
    urgencyRows.forEach((row) => {
      const key = String(row.urgency || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(byUrgency, key)) {
        byUrgency[key] = Number(row.count) || 0;
      }
    });

    return {
      total: Number(counts.total) || 0,
      pending: Number(counts.pending) || 0,
      inProgress: Number(counts.in_progress) || 0,
      byUrgency,
      overdue: Number(counts.overdue) || 0,
      byCategory: byCategoryRows.reduce((acc, item) => {
        acc[item.category] = Number(item.count) || 0;
        return acc;
      }, {}),
      byType: byTypeRows.reduce((acc, item) => {
        acc[item.type] = Number(item.count) || 0;
        return acc;
      }, {}),
    };
  },

  // ============================================================================
  // GENERATION - Create attention items from various sources
  // ============================================================================

  /**
   * Generate attention items for overdue invoices
   */
  async generateOverdueInvoiceItems() {
    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        dueDate: { lt: new Date() },
      },
      include: {
        account: { select: { id: true, name: true, ownerId: true } },
      },
    });

    const created = [];
    for (const invoice of overdueInvoices) {
      // Check if attention item already exists
      const existing = await prisma.attentionItem.findFirst({
        where: {
          sourceType: 'INVOICE',
          sourceId: invoice.id,
          status: { in: ['PENDING', 'IN_PROGRESS', 'SNOOZED'] },
        },
      });

      if (!existing) {
        const daysOverdue = Math.floor(
          (Date.now() - new Date(invoice.dueDate).getTime()) / (1000 * 60 * 60 * 24)
        );

        const item = await this.createAttentionItem({
          title: `Overdue Invoice: ${invoice.invoiceNumber}`,
          description: `Invoice ${invoice.invoiceNumber} is ${daysOverdue} days overdue. Balance: $${invoice.balanceDue}`,
          type: 'OVERDUE_INVOICE',
          category: 'FINANCIAL',
          urgency: daysOverdue > 30 ? 'HIGH' : daysOverdue > 14 ? 'MEDIUM' : 'LOW',
          priority: daysOverdue > 60 ? 'HIGH' : 'NORMAL',
          sourceType: 'INVOICE',
          sourceId: invoice.id,
          invoiceId: invoice.id,
          accountId: invoice.accountId,
          assignedToId: invoice.account?.ownerId,
          dueDate: invoice.dueDate,
          daysOverdue,
          amount: invoice.balanceDue,
          actionType: 'collect_payment',
          actionUrl: `/invoices/${invoice.id}`,
        });
        created.push(item);
      }
    }

    return created;
  },

  /**
   * Generate attention items for stalled opportunities
   */
  async generateStalledOpportunityItems(staleDays = 14) {
    const staleDate = new Date();
    staleDate.setDate(staleDate.getDate() - staleDays);

    // Some environments still have enum drift in stage values.
    // Try strict enum-safe filters first, then gracefully fall back to updatedAt-only.
    const whereCandidates = [
      {
        stage: { notIn: ['CLOSED_WON', 'CLOSED_LOST', 'COMPLETED'] },
        updatedAt: { lt: staleDate },
      },
      {
        updatedAt: { lt: staleDate },
      },
    ];

    let stalledOpps = [];
    let lastError = null;
    for (const where of whereCandidates) {
      try {
        stalledOpps = await prisma.opportunity.findMany({
          where,
          include: {
            account: { select: { id: true, name: true } },
            contact: { select: { id: true, firstName: true, lastName: true } },
          },
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    const created = [];
    for (const opp of stalledOpps) {
      const existing = await prisma.attentionItem.findFirst({
        where: {
          sourceType: 'OPPORTUNITY',
          sourceId: opp.id,
          type: 'STALLED_DEAL',
          status: { in: ['PENDING', 'IN_PROGRESS', 'SNOOZED'] },
        },
      });

      if (!existing) {
        const daysSinceUpdate = Math.floor(
          (Date.now() - new Date(opp.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        const item = await this.createAttentionItem({
          title: `Stalled Opportunity: ${opp.name}`,
          description: `No activity for ${daysSinceUpdate} days. Stage: ${opp.stage}. Value: $${opp.amount || 0}`,
          type: 'STALLED_DEAL',
          category: 'TASK',
          urgency: daysSinceUpdate > 30 ? 'HIGH' : 'MEDIUM',
          priority: opp.amount > 50000 ? 'HIGH' : 'NORMAL',
          sourceType: 'OPPORTUNITY',
          sourceId: opp.id,
          opportunityId: opp.id,
          accountId: opp.accountId,
          contactId: opp.contactId,
          assignedToId: opp.ownerId,
          amount: opp.amount,
          actionType: 'follow_up',
          actionUrl: `/jobs/${opp.id}`,
        });
        created.push(item);
      }
    }

    return created;
  },

  /**
   * Generate attention items for pending approvals
   */
  async generateApprovalItems() {
    const pendingApprovals = await prisma.approvalRequest.findMany({
      where: {
        status: { in: ['PENDING', 'IN_REVIEW'] },
      },
      include: {
        opportunity: { select: { id: true, name: true } },
        requester: { select: userSelect },
      },
    });

    const created = [];
    for (const approval of pendingApprovals) {
      const existing = await prisma.attentionItem.findFirst({
        where: {
          sourceType: 'APPROVAL',
          sourceId: approval.id,
          status: { in: ['PENDING', 'IN_PROGRESS', 'SNOOZED'] },
        },
      });

      if (!existing) {
        const item = await this.createAttentionItem({
          title: `Approval Needed: ${approval.subject}`,
          description: `${approval.type} approval requested by ${withUserDisplayName(approval.requester)?.name || 'Unknown User'}`,
          type: 'APPROVAL_NEEDED',
          category: 'APPROVAL',
          urgency: approval.priority === 'HIGH' ? 'HIGH' : 'MEDIUM',
          priority: approval.priority,
          sourceType: 'APPROVAL',
          sourceId: approval.id,
          approvalRequestId: approval.id,
          opportunityId: approval.opportunityId,
          assignedToId: approval.approverId,
          dueDate: approval.dueDate,
          amount: approval.requestedValue,
          actionType: 'review_approval',
          actionUrl: `/jobs/${approval.opportunityId}?tab=approvals`,
        });
        created.push(item);
      }
    }

    return created;
  },

  /**
   * Generate attention items for aging leads
   */
  async generateAgingLeadItems(agingDays = 3) {
    const agingDate = new Date();
    agingDate.setDate(agingDate.getDate() - agingDays);

    const agingLeads = await prisma.lead.findMany({
      where: {
        status: { in: ['New', 'Contacted', 'Working'] },
        createdAt: { lt: agingDate },
        isConverted: false,
      },
    });

    const created = [];
    for (const lead of agingLeads) {
      const existing = await prisma.attentionItem.findFirst({
        where: {
          sourceType: 'LEAD',
          sourceId: lead.id,
          type: 'LEAD_AGING',
          status: { in: ['PENDING', 'IN_PROGRESS', 'SNOOZED'] },
        },
      });

      if (!existing) {
        const daysOld = Math.floor(
          (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );

        const item = await this.createAttentionItem({
          title: `Aging Lead: ${lead.firstName} ${lead.lastName}`,
          description: `Lead has been in "${lead.status}" status for ${daysOld} days`,
          type: 'LEAD_AGING',
          category: 'TASK',
          urgency: daysOld > 7 ? 'HIGH' : daysOld > 5 ? 'MEDIUM' : 'LOW',
          sourceType: 'LEAD',
          sourceId: lead.id,
          leadId: lead.id,
          assignedToId: lead.ownerId,
          actionType: 'contact_lead',
          actionUrl: `/leads/${lead.id}`,
        });
        created.push(item);
      }
    }

    return created;
  },

  /**
   * Generate attention items for expiring quotes
   */
  async generateExpiringQuoteItems(expiringDays = 3) {
    const expiringDate = new Date();
    expiringDate.setDate(expiringDate.getDate() + expiringDays);

    const expiringQuotes = await prisma.quote.findMany({
      where: {
        status: { in: ['DRAFT', 'SENT'] },
        expirationDate: { lte: expiringDate, gte: new Date() },
      },
      include: {
        opportunity: { select: { id: true, name: true, ownerId: true, accountId: true } },
      },
    });

    const created = [];
    for (const quote of expiringQuotes) {
      const existing = await prisma.attentionItem.findFirst({
        where: {
          sourceType: 'QUOTE',
          sourceId: quote.id,
          type: 'QUOTE_EXPIRING',
          status: { in: ['PENDING', 'IN_PROGRESS', 'SNOOZED'] },
        },
      });

      if (!existing) {
        const daysUntilExpiry = Math.ceil(
          (new Date(quote.expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );

        const item = await this.createAttentionItem({
          title: `Quote Expiring: ${quote.quoteNumber}`,
          description: `Quote expires in ${daysUntilExpiry} day(s). Value: $${quote.total}`,
          type: 'QUOTE_EXPIRING',
          category: 'TASK',
          urgency: daysUntilExpiry <= 1 ? 'HIGH' : 'MEDIUM',
          sourceType: 'QUOTE',
          sourceId: quote.id,
          quoteId: quote.id,
          opportunityId: quote.opportunityId,
          accountId: quote.opportunity?.accountId,
          assignedToId: quote.opportunity?.ownerId,
          dueDate: quote.expirationDate,
          amount: quote.total,
          actionType: 'follow_up_quote',
          actionUrl: `/quotes/${quote.id}`,
        });
        created.push(item);
      }
    }

    return created;
  },

  /**
   * Generate attention items from unread conversations
   */
  async generateUnreadMessageItems() {
    const unreadConversations = await prisma.conversation.findMany({
      where: {
        unreadCount: { gt: 0 },
        status: 'OPEN',
      },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const created = [];
    for (const conv of unreadConversations) {
      const existing = await prisma.attentionItem.findFirst({
        where: {
          sourceType: 'CONVERSATION',
          sourceId: conv.id,
          type: 'UNREAD_MESSAGE',
          status: { in: ['PENDING', 'IN_PROGRESS', 'SNOOZED'] },
        },
      });

      if (!existing) {
        const item = await this.createAttentionItem({
          title: `Unread Messages (${conv.unreadCount})`,
          description: conv.lastMessagePreview || 'New messages awaiting response',
          type: 'UNREAD_MESSAGE',
          category: 'COMMUNICATION',
          urgency: conv.priority === 'HIGH' ? 'HIGH' : conv.unreadCount > 3 ? 'MEDIUM' : 'LOW',
          sourceType: 'CONVERSATION',
          sourceId: conv.id,
          conversationId: conv.id,
          contactId: conv.contactId,
          opportunityId: conv.opportunityId,
          accountId: conv.accountId,
          assignedToId: conv.assignedUserId,
          actionType: 'respond',
          actionUrl: `/bamboogli?conversation=${conv.id}`,
          sourceData: {
            channel: conv.lastChannel,
            unreadCount: conv.unreadCount,
            identifier: conv.identifier,
          },
        });
        created.push(item);
      }
    }

    return created;
  },

  /**
   * Generate attention items for cases needing attention
   */
  async generateCaseItems() {
    const priorityCases = await prisma.case.findMany({
      where: {
        status: { in: ['New', 'Open', 'Escalated'] },
        priority: { in: ['High', 'Critical'] },
      },
      include: {
        account: { select: { id: true, name: true, ownerId: true } },
      },
    });

    const created = [];
    for (const caseRecord of priorityCases) {
      const existing = await prisma.attentionItem.findFirst({
        where: {
          sourceType: 'CASE',
          sourceId: caseRecord.id,
          status: { in: ['PENDING', 'IN_PROGRESS', 'SNOOZED'] },
        },
      });

      if (!existing) {
        const item = await this.createAttentionItem({
          title: `Case: ${caseRecord.caseNumber} - ${caseRecord.subject}`,
          description: caseRecord.description?.substring(0, 200) || 'High priority case needs attention',
          type: caseRecord.status === 'Escalated' ? 'CASE_ESCALATION' : 'CUSTOMER_COMPLAINT',
          category: 'ESCALATION',
          urgency: caseRecord.priority === 'Critical' ? 'CRITICAL' : 'HIGH',
          priority: 'HIGH',
          sourceType: 'CASE',
          sourceId: caseRecord.id,
          caseId: caseRecord.id,
          accountId: caseRecord.accountId,
          assignedToId: caseRecord.account?.ownerId,
          actionType: 'resolve_case',
          actionUrl: `/cases/${caseRecord.id}`,
        });
        created.push(item);
      }
    }

    return created;
  },

  /**
   * Run all generators to refresh attention queue
   */
  async refreshQueue() {
    const results = {
      overdueInvoices: await this.generateOverdueInvoiceItems(),
      stalledOpportunities: await this.generateStalledOpportunityItems(),
      pendingApprovals: await this.generateApprovalItems(),
      agingLeads: await this.generateAgingLeadItems(),
      expiringQuotes: await this.generateExpiringQuoteItems(),
      unreadMessages: await this.generateUnreadMessageItems(),
      priorityCases: await this.generateCaseItems(),
    };

    return {
      created: Object.values(results).flat().length,
      bySource: Object.entries(results).reduce((acc, [key, items]) => {
        acc[key] = items.length;
        return acc;
      }, {}),
    };
  },

  /**
   * Clean up completed/dismissed items older than specified days
   */
  async cleanupOldItems(olderThanDays = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await prisma.attentionItem.deleteMany({
      where: {
        status: { in: ['COMPLETED', 'DISMISSED', 'EXPIRED'] },
        updatedAt: { lt: cutoffDate },
      },
    });

    return result.count;
  },

  /**
   * Update overdue status on items
   */
  async updateOverdueStatus() {
    // Find items with due dates in the past that aren't marked overdue
    const items = await prisma.attentionItem.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        dueDate: { lt: new Date() },
        daysOverdue: null,
      },
    });

    for (const item of items) {
      const daysOverdue = Math.floor(
        (Date.now() - new Date(item.dueDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      await prisma.attentionItem.update({
        where: { id: item.id },
        data: {
          daysOverdue,
          urgency: daysOverdue > 7 ? 'HIGH' : daysOverdue > 3 ? 'MEDIUM' : item.urgency,
        },
      });
    }

    return items.length;
  },
};

export default attentionService;
