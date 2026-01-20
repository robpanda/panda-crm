// Call List Service - Manages call lists, items, dispositions, and sessions
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Resolve date placeholders in filter criteria
 * Converts strings like 'NOW_MINUS_4_HOURS' to actual Date objects
 */
function resolveDatePlaceholders(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    const now = new Date();
    switch (obj) {
      case 'NOW':
        return now;
      case 'NOW_MINUS_4_HOURS':
        return new Date(now.getTime() - 4 * 60 * 60 * 1000);
      case 'NOW_MINUS_7_DAYS':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case 'NOW_MINUS_14_DAYS':
        return new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      case 'NOW_MINUS_30_DAYS':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return obj;
    }
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveDatePlaceholders);
  }
  if (typeof obj === 'object') {
    const resolved = {};
    for (const [key, value] of Object.entries(obj)) {
      resolved[key] = resolveDatePlaceholders(value);
    }
    return resolved;
  }
  return obj;
}

/**
 * Call List Service
 * Handles CRUD for call lists, items, dispositions, and agent sessions
 */
class CallListService {

  // ==================== CALL LISTS ====================

  /**
   * Get all call lists with stats
   */
  async getCallLists(filters = {}) {
    const { isActive, listType, assignedUserId, states } = filters;

    const where = {};
    if (isActive !== undefined) where.isActive = isActive;
    if (listType) where.listType = listType;
    if (assignedUserId) where.assignedUserId = assignedUserId;
    if (states?.length) where.states = { hasSome: states };

    const lists = await prisma.callList.findMany({
      where,
      include: {
        assignedUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        _count: {
          select: { items: true },
        },
      },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });

    // Add real-time item counts
    for (const list of lists) {
      const [pendingCount, completedToday] = await Promise.all([
        prisma.callListItem.count({
          where: { callListId: list.id, status: 'PENDING' },
        }),
        prisma.callListItem.count({
          where: {
            callListId: list.id,
            status: 'COMPLETED',
            completedAt: {
              gte: new Date(new Date().setHours(0, 0, 0, 0)),
            },
          },
        }),
      ]);

      list.pendingItems = pendingCount;
      list.completedToday = completedToday;
      list.totalItems = list._count.items;
      delete list._count;
    }

    return lists;
  }

  /**
   * Get a single call list by ID
   */
  async getCallListById(id) {
    const list = await prisma.callList.findUnique({
      where: { id },
      include: {
        assignedUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        dispositions: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!list) return null;

    // Get item counts by status
    const statusCounts = await prisma.callListItem.groupBy({
      by: ['status'],
      where: { callListId: id },
      _count: { id: true },
    });

    list.statusCounts = statusCounts.reduce((acc, s) => {
      acc[s.status] = s._count.id;
      return acc;
    }, {});

    return list;
  }

  /**
   * Create a new call list
   */
  async createCallList(data, createdById) {
    const list = await prisma.callList.create({
      data: {
        ...data,
        createdById,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // If it's a dynamic list, populate it immediately
    if (list.listType === 'DYNAMIC' && list.filterCriteria) {
      await this.refreshDynamicList(list.id);
    }

    return list;
  }

  /**
   * Update a call list
   */
  async updateCallList(id, data) {
    const list = await prisma.callList.update({
      where: { id },
      data,
      include: {
        assignedUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return list;
  }

  /**
   * Delete a call list (soft delete by deactivating)
   */
  async deleteCallList(id) {
    await prisma.callList.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true };
  }

  /**
   * Refresh a dynamic list by re-running the filter criteria
   */
  async refreshDynamicList(listId) {
    const list = await prisma.callList.findUnique({ where: { id: listId } });

    if (!list || list.listType !== 'DYNAMIC' || !list.filterCriteria) {
      throw new Error('Invalid list for refresh');
    }

    const targetObject = list.targetObject || 'Lead';
    const rawFilterCriteria = typeof list.filterCriteria === 'string'
      ? JSON.parse(list.filterCriteria)
      : list.filterCriteria;

    // Resolve date placeholders like NOW_MINUS_4_HOURS to actual dates
    const filterCriteria = resolveDatePlaceholders(rawFilterCriteria);

    // Get existing items to avoid duplicates
    const existingItems = await prisma.callListItem.findMany({
      where: { callListId: listId },
      select: { leadId: true, opportunityId: true, contactId: true },
    });

    const existingLeadIds = new Set(existingItems.map(i => i.leadId).filter(Boolean));
    const existingOppIds = new Set(existingItems.map(i => i.opportunityId).filter(Boolean));
    const existingContactIds = new Set(existingItems.map(i => i.contactId).filter(Boolean));

    let newItems = [];

    if (targetObject === 'Lead') {
      const leads = await prisma.lead.findMany({
        where: filterCriteria,
        include: {
          account: { select: { billingState: true, billingCity: true } },
        },
      });

      for (const lead of leads) {
        if (existingLeadIds.has(lead.id)) continue;

        const phone = lead.mobilePhone || lead.phone;
        if (!phone) continue;

        newItems.push({
          callListId: listId,
          leadId: lead.id,
          phoneNumber: phone.replace(/\D/g, ''),
          formattedPhone: phone,
          displayName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Unknown',
          displayAddress: lead.account ?
            `${lead.account.billingCity || ''}, ${lead.account.billingState || ''}`.trim() : null,
          displayStatus: lead.status,
          addedReason: 'dynamic_refresh',
          priority: list.priority,
        });
      }
    } else if (targetObject === 'Opportunity') {
      const opportunities = await prisma.opportunity.findMany({
        where: filterCriteria,
        include: {
          account: { select: { billingState: true, billingCity: true, phone: true } },
          contact: { select: { phone: true, mobilePhone: true } },
        },
      });

      for (const opp of opportunities) {
        if (existingOppIds.has(opp.id)) continue;

        const phone = opp.contact?.mobilePhone || opp.contact?.phone || opp.account?.phone;
        if (!phone) continue;

        newItems.push({
          callListId: listId,
          opportunityId: opp.id,
          accountId: opp.accountId,
          phoneNumber: phone.replace(/\D/g, ''),
          formattedPhone: phone,
          displayName: opp.name,
          displayAddress: opp.account ?
            `${opp.account.billingCity || ''}, ${opp.account.billingState || ''}`.trim() : null,
          displayStatus: opp.stage,
          addedReason: 'dynamic_refresh',
          priority: list.priority,
        });
      }
    }

    // Bulk insert new items
    if (newItems.length > 0) {
      await prisma.callListItem.createMany({
        data: newItems,
        skipDuplicates: true,
      });
    }

    // Update list refresh timestamp and counts
    const [totalCount, pendingCount] = await Promise.all([
      prisma.callListItem.count({ where: { callListId: listId } }),
      prisma.callListItem.count({ where: { callListId: listId, status: 'PENDING' } }),
    ]);

    await prisma.callList.update({
      where: { id: listId },
      data: {
        lastRefreshedAt: new Date(),
        totalItems: totalCount,
        pendingItems: pendingCount,
      },
    });

    return { added: newItems.length, total: totalCount };
  }

  // ==================== CALL LIST ITEMS ====================

  /**
   * Get items for a call list with pagination
   */
  async getCallListItems(listId, options = {}) {
    const {
      status,
      page = 1,
      limit = 50,
      sortBy = 'priority',
      sortOrder = 'desc',
      assignedToId,
    } = options;

    const where = { callListId: listId };
    if (status) where.status = status;
    if (assignedToId) where.assignedToId = assignedToId;

    const [items, total] = await Promise.all([
      prisma.callListItem.findMany({
        where,
        include: {
          assignedTo: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.callListItem.count({ where }),
    ]);

    return {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get the next item to call for an agent
   * Respects cadence, priority, and assignment
   */
  async getNextCallItem(listId, agentId) {
    const list = await prisma.callList.findUnique({ where: { id: listId } });
    if (!list) throw new Error('List not found');

    const now = new Date();

    // Find next available item:
    // 1. Status is PENDING or RESCHEDULED
    // 2. Not assigned to someone else, OR assigned to this agent
    // 3. nextAttemptAt is null or in the past
    // 4. attemptCount < maxAttempts
    // 5. Not expired
    const item = await prisma.callListItem.findFirst({
      where: {
        callListId: listId,
        status: { in: ['PENDING', 'RESCHEDULED'] },
        OR: [
          { assignedToId: null },
          { assignedToId: agentId },
        ],
        OR: [
          { nextAttemptAt: null },
          { nextAttemptAt: { lte: now } },
        ],
        attemptCount: { lt: list.maxAttempts },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      orderBy: [
        { priority: 'desc' },
        { scheduledFor: 'asc' },
        { added_at: 'asc' },
      ],
    });

    if (!item) return null;

    // Mark as in progress and assign to agent
    const updatedItem = await prisma.callListItem.update({
      where: { id: item.id },
      data: {
        status: 'IN_PROGRESS',
        assignedToId: agentId,
      },
    });

    return updatedItem;
  }

  /**
   * Add items to a call list manually
   */
  async addItemsToList(listId, items) {
    const list = await prisma.callList.findUnique({ where: { id: listId } });
    if (!list) throw new Error('List not found');

    const created = await prisma.callListItem.createMany({
      data: items.map(item => ({
        callListId: listId,
        leadId: item.leadId,
        opportunityId: item.opportunityId,
        contactId: item.contactId,
        accountId: item.accountId,
        phoneNumber: item.phoneNumber?.replace(/\D/g, ''),
        formattedPhone: item.phoneNumber,
        displayName: item.displayName,
        displayAddress: item.displayAddress,
        displayStatus: item.displayStatus,
        priority: item.priority || list.priority,
        addedReason: item.addedReason || 'manual',
      })),
      skipDuplicates: true,
    });

    return { added: created.count };
  }

  /**
   * Remove item from list
   */
  async removeItemFromList(itemId) {
    await prisma.callListItem.update({
      where: { id: itemId },
      data: { status: 'REMOVED' },
    });
    return { success: true };
  }

  /**
   * Move item to another list
   */
  async moveItemToList(itemId, targetListId, reason) {
    const item = await prisma.callListItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error('Item not found');

    // Create new item in target list
    const newItem = await prisma.callListItem.create({
      data: {
        callListId: targetListId,
        leadId: item.leadId,
        opportunityId: item.opportunityId,
        contactId: item.contactId,
        accountId: item.accountId,
        phoneNumber: item.phoneNumber,
        formattedPhone: item.formattedPhone,
        displayName: item.displayName,
        displayAddress: item.displayAddress,
        displayStatus: item.displayStatus,
        addedReason: reason || 'moved_from_list',
        sourceListId: item.callListId,
      },
    });

    // Remove from original list
    await prisma.callListItem.update({
      where: { id: itemId },
      data: { status: 'REMOVED' },
    });

    return newItem;
  }

  // ==================== DISPOSITIONS ====================

  /**
   * Get dispositions for a list (or global dispositions if listId is null)
   */
  async getDispositions(listId = null) {
    const where = listId ? { callListId: listId, isActive: true } : { callListId: null, isActive: true };

    return prisma.callListDisposition.findMany({
      where,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  /**
   * Apply a disposition to a call list item
   * This triggers disposition actions (move to list, update status, etc.)
   */
  async applyDisposition(itemId, dispositionCode, notes, agentId) {
    const item = await prisma.callListItem.findUnique({
      where: { id: itemId },
      include: { callList: true },
    });

    if (!item) throw new Error('Item not found');

    // Find the disposition
    const disposition = await prisma.callListDisposition.findFirst({
      where: {
        OR: [
          { callListId: item.callListId, code: dispositionCode },
          { callListId: null, code: dispositionCode },
        ],
        isActive: true,
      },
    });

    if (!disposition) throw new Error('Disposition not found');

    const now = new Date();

    // Calculate next attempt time based on cadence
    let nextAttemptAt = null;
    if (!disposition.removeFromList && item.callList.cadenceHours) {
      nextAttemptAt = new Date(now.getTime() + (item.callList.cadenceHours * 60 * 60 * 1000));
    }

    // Update the item
    const updateData = {
      attemptCount: item.attemptCount + 1,
      lastAttemptAt: now,
      lastAttemptResult: dispositionCode,
      disposition: dispositionCode,
      dispositionAt: now,
      status: disposition.removeFromList ? 'COMPLETED' :
              disposition.scheduleCallback ? 'RESCHEDULED' : 'PENDING',
      completedAt: disposition.removeFromList ? now : null,
      nextAttemptAt,
    };

    await prisma.callListItem.update({
      where: { id: itemId },
      data: updateData,
    });

    // Create a call log entry
    await prisma.callLog.create({
      data: {
        leadId: item.leadId,
        opportunityId: item.opportunityId,
        contactId: item.contactId,
        direction: 'OUTBOUND',
        outcome: dispositionCode,
        notes,
        startTime: now,
        endTime: now,
        duration: 0, // Will be updated from phone system
        userId: agentId,
      },
    });

    // Execute disposition actions
    const actions = [];

    // Move to another list
    if (disposition.moveToListId) {
      await this.moveItemToList(itemId, disposition.moveToListId, `disposition_${dispositionCode}`);
      actions.push('moved_to_list');
    }

    // Update lead status
    if (disposition.updateLeadStatus && item.leadId) {
      await prisma.lead.update({
        where: { id: item.leadId },
        data: { status: disposition.updateLeadStatus },
      });
      actions.push('lead_status_updated');
    }

    // Update opportunity stage
    if (disposition.updateOppStage && item.opportunityId) {
      await prisma.opportunity.update({
        where: { id: item.opportunityId },
        data: { stage: disposition.updateOppStage },
      });
      actions.push('opp_stage_updated');
    }

    // Add to DNC (Do Not Call) - would need a DNC table
    if (disposition.addToDNC) {
      // TODO: Add to DNC list
      actions.push('added_to_dnc');
    }

    return { success: true, actions };
  }

  /**
   * Create a new disposition
   */
  async createDisposition(data) {
    return prisma.callListDisposition.create({ data });
  }

  /**
   * Update a disposition
   */
  async updateDisposition(id, data) {
    return prisma.callListDisposition.update({
      where: { id },
      data,
    });
  }

  // ==================== CALL SESSIONS ====================

  /**
   * Start a new call session for an agent
   */
  async startSession(userId, listId = null, dialerMode = 'PREVIEW') {
    // End any existing active sessions
    await prisma.callSession.updateMany({
      where: {
        userId,
        endedAt: null,
      },
      data: {
        endedAt: new Date(),
        terminationReason: 'new_session_started',
      },
    });

    const session = await prisma.callSession.create({
      data: {
        userId,
        currentListId: listId,
        dialerMode,
      },
    });

    return session;
  }

  /**
   * End a call session
   */
  async endSession(sessionId, reason = 'user_logout') {
    const session = await prisma.callSession.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
        terminationReason: reason,
      },
    });

    return session;
  }

  /**
   * Pause/unpause a session
   */
  async toggleSessionPause(sessionId) {
    const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error('Session not found');

    if (session.pausedAt) {
      // Unpause - calculate pause duration and add to total
      const pauseDuration = Date.now() - session.pausedAt.getTime();
      return prisma.callSession.update({
        where: { id: sessionId },
        data: {
          pausedAt: null,
          totalPauseMs: session.totalPauseMs + pauseDuration,
        },
      });
    } else {
      // Pause
      return prisma.callSession.update({
        where: { id: sessionId },
        data: { pausedAt: new Date() },
      });
    }
  }

  /**
   * Update session stats after a call
   */
  async updateSessionStats(sessionId, callData) {
    const session = await prisma.callSession.findUnique({ where: { id: sessionId } });
    if (!session) return;

    await prisma.callSession.update({
      where: { id: sessionId },
      data: {
        totalCalls: session.totalCalls + 1,
        connectedCalls: callData.connected ? session.connectedCalls + 1 : session.connectedCalls,
        totalTalkTimeMs: session.totalTalkTimeMs + (callData.talkTimeMs || 0),
        totalWrapTimeMs: session.totalWrapTimeMs + (callData.wrapTimeMs || 0),
      },
    });
  }

  /**
   * Get active session for a user
   */
  async getActiveSession(userId) {
    return prisma.callSession.findFirst({
      where: {
        userId,
        endedAt: null,
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Get session stats summary
   */
  async getSessionStats(userId, startDate, endDate) {
    const where = { userId };
    if (startDate) where.startedAt = { gte: new Date(startDate) };
    if (endDate) where.startedAt = { ...where.startedAt, lte: new Date(endDate) };

    const sessions = await prisma.callSession.findMany({
      where,
      select: {
        totalCalls: true,
        connectedCalls: true,
        totalTalkTimeMs: true,
        totalWrapTimeMs: true,
        startedAt: true,
        endedAt: true,
        totalPauseMs: true,
      },
    });

    const totals = sessions.reduce((acc, s) => {
      acc.totalCalls += s.totalCalls;
      acc.connectedCalls += s.connectedCalls;
      acc.totalTalkTimeMs += s.totalTalkTimeMs;
      acc.totalWrapTimeMs += s.totalWrapTimeMs;
      acc.totalPauseMs += s.totalPauseMs;
      if (s.endedAt) {
        acc.totalSessionMs += s.endedAt.getTime() - s.startedAt.getTime();
      }
      return acc;
    }, {
      totalCalls: 0,
      connectedCalls: 0,
      totalTalkTimeMs: 0,
      totalWrapTimeMs: 0,
      totalPauseMs: 0,
      totalSessionMs: 0,
    });

    return {
      ...totals,
      avgCallDurationMs: totals.connectedCalls > 0
        ? Math.round(totals.totalTalkTimeMs / totals.connectedCalls) : 0,
      connectRate: totals.totalCalls > 0
        ? Math.round((totals.connectedCalls / totals.totalCalls) * 100) : 0,
      sessionCount: sessions.length,
    };
  }

  // ==================== PREDEFINED LISTS ====================

  /**
   * Get or create the predefined call lists based on Panda Call Center Process flow
   * Source: Panda Call Center Process PDF diagram
   *
   * Lead Sources:
   * - Five9 Marketing
   * - Door Knockers
   * - Angi/HomeAdvisor
   * - REI/Telemarketing
   *
   * List Flow:
   * Hot Leads → Confirmation → (Confirmed → Appointment Runs) OR (Canceled → Reset)
   * Reset → Lead Reset → Lead Set → Cold Leads
   * Inspected/Demo → Rehash (if not sold)
   */
  async ensurePredefinedLists(createdById) {
    const predefinedLists = [
      // ============================================
      // HOT LEADS - New leads from all sources
      // ============================================
      {
        name: 'Hot Leads',
        description: 'New leads less than 4 hours old from Five9 Marketing, Door Knockers, Angi/HomeAdvisor, REI/Telemarketing. Preview dialer, 3hr cadence.',
        listType: 'DYNAMIC',
        targetObject: 'Lead',
        cadenceType: 'PREVIEW',
        filterCriteria: {
          status: { in: ['NEW', 'CONTACTED'] },
          // Leads less than 4 hours old
          createdAt: { gte: 'NOW_MINUS_4_HOURS' },
        },
        cadenceHours: 3,
        maxAttempts: 6,
        cooldownDays: 7,
        priority: 100,
        states: ['MD', 'VA', 'DE', 'NJ', 'PA', 'NC', 'TPA', 'CAT'],
      },

      // ============================================
      // CONFIRMATION LIST - Scheduled appointments
      // Called in order of date/time to confirm
      // ============================================
      {
        name: 'Confirmation',
        description: 'Appointments scheduled, need confirmation call. Called in order of appointment date/time. Confirmations call to confirm not an auto dialer.',
        listType: 'DYNAMIC',
        targetObject: 'Opportunity',
        cadenceType: 'PREVIEW',
        filterCriteria: {
          stage: 'SCHEDULED',
          status: { notIn: ['CONFIRMED', 'COMPLETED', 'CANCELLED'] },
        },
        cadenceHours: 4,
        maxAttempts: 3,
        cooldownDays: 1,
        priority: 95,
        states: ['MD', 'VA', 'DE', 'NJ', 'PA', 'NC', 'TPA', 'CAT'],
      },

      // ============================================
      // RESET LIST - Cancelled/No-show appointments
      // Appointment was cancelled, moved to cancelled in Salesforce
      // ============================================
      {
        name: 'Reset',
        description: 'Cancelled appointments or no-shows. Appointment was cancelled, moved to cancelled in Salesforce. Cadence based on appointment age.',
        listType: 'DYNAMIC',
        targetObject: 'Opportunity',
        cadenceType: 'PROGRESSIVE',
        filterCriteria: {
          stage: { in: ['SCHEDULED', 'LEAD_ASSIGNED'] },
          status: { in: ['CANCELLED', 'NO_SHOW', 'RESCHEDULE'] },
        },
        cadenceHours: 3, // Every 3 hours for appointments less than 7 days
        maxAttempts: 6,
        cooldownDays: 7,
        priority: 90,
        states: ['MD', 'VA', 'DE', 'NJ', 'PA', 'NC', 'TPA', 'CAT'],
      },

      // ============================================
      // REHASH LIST - Demo ran but not sold
      // H/O receives quote, chooses not to move forward
      // Cooldown of 2-3 weeks, called once every 2 days
      // ============================================
      {
        name: 'Rehash',
        description: 'Demo/inspection ran but not sold. H/O receives quote, chooses not to move forward. Cooldown 2-3 weeks, called once every 2 days.',
        listType: 'DYNAMIC',
        targetObject: 'Opportunity',
        cadenceType: 'PREVIEW',
        filterCriteria: {
          stage: 'INSPECTED',
          // Exclude closed opportunities
          NOT: { stage: { in: ['CLOSED_WON', 'CLOSED_LOST'] } },
        },
        cadenceHours: 48, // Once every 2 days
        maxAttempts: 6,
        cooldownDays: 14, // 2-3 week cooldown
        priority: 80,
        states: ['MD', 'VA', 'DE', 'NJ', 'PA', 'NC', 'TPA', 'CAT'],
      },

      // ============================================
      // REHASH LIST FOR JOSH - Retail demos not sold
      // Inside sales new pitch, updated quote given
      // ============================================
      {
        name: 'Rehash - Retail',
        description: 'Retail demos not sold. Inside sales new pitch, updated quote given over the phone. Pitch miss or rehash appointment, dead for 1 year added to separate list.',
        listType: 'DYNAMIC',
        targetObject: 'Opportunity',
        cadenceType: 'PREVIEW',
        filterCriteria: {
          stage: 'INSPECTED',
          type: 'RETAIL',
          // Exclude closed opportunities
          NOT: { stage: { in: ['CLOSED_WON', 'CLOSED_LOST'] } },
        },
        cadenceHours: 48,
        maxAttempts: 6,
        cooldownDays: 14,
        priority: 78,
        states: ['MD', 'VA', 'DE', 'NJ', 'PA', 'NC', 'TPA', 'CAT'],
      },

      // ============================================
      // LEAD RESET - Within 7 days, 3hr cadence
      // Day 1-14 cadence pull from a hopper
      // ============================================
      {
        name: 'Lead Reset',
        description: 'Leads within 7 days cadence pool. Day 1-14 cadence pull from hopper. Called every 3 hours. A lead can fit this pile any longer considered Cool Down list or "Dead".',
        listType: 'DYNAMIC',
        targetObject: 'Lead',
        cadenceType: 'PROGRESSIVE',
        filterCriteria: {
          status: { in: ['NEW', 'CONTACTED', 'NURTURING'] },
          // Leads 4 hours to 7 days old
          createdAt: {
            gte: 'NOW_MINUS_7_DAYS',
            lt: 'NOW_MINUS_4_HOURS',
          },
        },
        cadenceHours: 3,
        maxAttempts: 6,
        cooldownDays: 7,
        priority: 75,
        states: ['MD', 'VA', 'DE', 'NJ', 'PA', 'NC', 'TPA', 'CAT'],
      },

      // ============================================
      // LEAD SET - Leads with appointments already set
      // Called once per day
      // ============================================
      {
        name: 'Lead Set',
        description: 'Leads that already have appointments set. Called once per day to ensure appointment is still valid.',
        listType: 'DYNAMIC',
        targetObject: 'Lead',
        cadenceType: 'PREVIEW',
        filterCriteria: {
          status: 'QUALIFIED',
          isConverted: true,
        },
        cadenceHours: 24, // Once per day
        maxAttempts: 3,
        cooldownDays: 7,
        priority: 70,
        states: ['MD', 'VA', 'DE', 'NJ', 'PA', 'NC', 'TPA', 'CAT'],
      },

      // ============================================
      // COLD LEADS - Separated by state
      // Progressive mode to be churned on by individual states
      // Cadence based on lead age
      // ============================================
      {
        name: 'Cold Leads',
        description: 'Cold leads list, separated out by state. Progressive mode churned by individual states. Cadence: <7 days = 3hr, 7-14 days = 4hr, 14-30 days = 24hr.',
        listType: 'DYNAMIC',
        targetObject: 'Lead',
        cadenceType: 'PROGRESSIVE',
        filterCriteria: {
          status: { in: ['NEW', 'CONTACTED', 'NURTURING'] },
          // Leads older than 7 days
          createdAt: { lt: 'NOW_MINUS_7_DAYS' },
        },
        cadenceHours: 24, // Base cadence, adjusted by lead age
        maxAttempts: 6,
        cooldownDays: 30,
        priority: 50,
        states: ['MD', 'VA', 'DE', 'NJ', 'PA', 'NC', 'TPA', 'CAT'],
      },

      // ============================================
      // NOT INTERESTED / COOL DOWN LIST
      // Not interested dispos, add to not interested or cool down list
      // ============================================
      {
        name: 'Cool Down',
        description: 'Not interested dispositions. Leads marked as not interested during calls. Longer cooldown period before re-contact.',
        listType: 'DYNAMIC',
        targetObject: 'Lead',
        cadenceType: 'MANUAL',
        filterCriteria: {
          status: 'NURTURING',
          disposition: { in: ['NOT_INTERESTED', 'CALL_BACK_LATER'] },
        },
        cadenceHours: 168, // 7 days
        maxAttempts: 3,
        cooldownDays: 90, // 3 month cooldown
        priority: 30,
        states: ['MD', 'VA', 'DE', 'NJ', 'PA', 'NC', 'TPA', 'CAT'],
      },

      // ============================================
      // MOVE TO RESET LIST - Cancelled to unconfirmed status
      // ============================================
      {
        name: 'Unconfirmed Reset',
        description: 'Appointments that were cancelled to unconfirmed status. Move to Reset list for re-contact.',
        listType: 'DYNAMIC',
        targetObject: 'Opportunity',
        cadenceType: 'PROGRESSIVE',
        filterCriteria: {
          stage: 'LEAD_ASSIGNED',
          status: 'UNCONFIRMED',
        },
        cadenceHours: 4,
        maxAttempts: 6,
        cooldownDays: 7,
        priority: 85,
        states: ['MD', 'VA', 'DE', 'NJ', 'PA', 'NC', 'TPA', 'CAT'],
      },

      // ============================================
      // 2ND VISIT NEEDED LIST
      // From demo flow - needs second visit
      // ============================================
      {
        name: '2nd Visit Needed',
        description: 'Demos that require a second visit. H/O needs more time or additional decision maker present.',
        listType: 'DYNAMIC',
        targetObject: 'Opportunity',
        cadenceType: 'PREVIEW',
        filterCriteria: {
          stage: 'INSPECTED',
          status: '2ND_VISIT_NEEDED',
        },
        cadenceHours: 24,
        maxAttempts: 4,
        cooldownDays: 7,
        priority: 82,
        states: ['MD', 'VA', 'DE', 'NJ', 'PA', 'NC', 'TPA', 'CAT'],
      },

      // ============================================
      // CALLBACK LIST - Scheduled callbacks
      // ============================================
      {
        name: 'Scheduled Callbacks',
        description: 'Leads/Opportunities with scheduled callback times. Agent requested specific callback time.',
        listType: 'CALLBACK',
        targetObject: 'Lead',
        cadenceType: 'PREVIEW',
        filterCriteria: {
          hasScheduledCallback: true,
        },
        cadenceHours: 0, // Callback at scheduled time
        maxAttempts: 3,
        cooldownDays: 1,
        priority: 99, // High priority - scheduled callbacks
        states: ['MD', 'VA', 'DE', 'NJ', 'PA', 'NC', 'TPA', 'CAT'],
      },

      // ============================================
      // DEAD LEADS - 1 Year list
      // ============================================
      {
        name: 'Dead Leads (1 Year)',
        description: 'Leads that have been through multiple attempts with no success. Dead for 1 year before re-contact.',
        listType: 'STATIC',
        targetObject: 'Lead',
        cadenceType: 'MANUAL',
        filterCriteria: {
          status: 'UNQUALIFIED',
          disposition: { in: ['NOT_INTERESTED', 'NO_PROSPECT', 'NOT_SOLD'] },
        },
        cadenceHours: 8760, // 1 year in hours
        maxAttempts: 1,
        cooldownDays: 365,
        priority: 10,
        states: ['MD', 'VA', 'DE', 'NJ', 'PA', 'NC', 'TPA', 'CAT'],
      },
    ];

    const createdLists = [];

    for (const listDef of predefinedLists) {
      // Check if list already exists
      const existing = await prisma.callList.findFirst({
        where: { name: listDef.name },
      });

      if (!existing) {
        // Map camelCase to snake_case for Prisma schema compatibility
        const createData = {
          name: listDef.name,
          description: listDef.description,
          listType: listDef.listType,
          targetObject: listDef.targetObject,
          filterCriteria: JSON.stringify(listDef.filterCriteria),
          cadence_type: listDef.cadenceType,
          cadence_hours: listDef.cadenceHours,
          max_attempts: listDef.maxAttempts,
          cooldown_days: listDef.cooldownDays,
          priority: listDef.priority,
          states: listDef.states,
        };
        const list = await this.createCallList(createData, createdById);
        createdLists.push(list);
      }
    }

    return createdLists;
  }

  /**
   * Get or create predefined dispositions based on Panda Call Center Process flow
   * Maps to specific list movements and status updates
   */
  async ensurePredefinedDispositions() {
    const predefinedDispositions = [
      // ============================================
      // POSITIVE OUTCOMES - Appointment Flow
      // ============================================
      {
        code: 'APPOINTMENT_SET',
        name: 'Appointment Set',
        category: 'POSITIVE',
        color: '#22c55e',
        sortOrder: 1,
        removeFromList: true,
        updateLeadStatus: 'QUALIFIED',
        description: 'Lead wants to schedule appointment. Creates opportunity and schedules inspection.',
      },
      {
        code: 'CONFIRMED',
        name: 'Appointment Confirmed',
        category: 'POSITIVE',
        color: '#10b981',
        sortOrder: 2,
        removeFromList: true,
        updateOppStage: 'SCHEDULED',
        description: 'Appointment confirmed by homeowner. Ready for demo/inspection.',
      },
      {
        code: 'APPOINTMENT_RESCHEDULED',
        name: 'Appointment Rescheduled',
        category: 'POSITIVE',
        color: '#84cc16',
        sortOrder: 3,
        scheduleCallback: true,
        description: 'Appointment rescheduled to new date/time. Stays in confirmation queue.',
      },
      {
        code: 'SIGNED_CONTRACT',
        name: 'Signed Contract',
        category: 'POSITIVE',
        color: '#059669',
        sortOrder: 4,
        removeFromList: true,
        updateOppStage: 'CONTRACT_SIGNED',
        description: 'H/O signs contract. Sold - move forward with project.',
      },
      {
        code: 'RETAIL_DEMO_SOLD',
        name: 'Retail Demo Sold / Claim Filed',
        category: 'POSITIVE',
        color: '#047857',
        sortOrder: 5,
        removeFromList: true,
        updateOppStage: 'CLAIM_FILED',
        description: 'Retail demo sold or insurance claim filed. Moving to production queue.',
      },

      // ============================================
      // NO CONTACT - Call attempts with no answer
      // ============================================
      {
        code: 'NO_ANSWER',
        name: 'No Answer from Lead',
        category: 'NO_CONTACT',
        color: '#94a3b8',
        sortOrder: 10,
        description: 'No answer from lead. Will retry based on cadence.',
      },
      {
        code: 'VOICEMAIL',
        name: 'Left Voicemail',
        category: 'NO_CONTACT',
        color: '#64748b',
        sortOrder: 11,
        description: 'Left voicemail message. Waiting for callback.',
      },
      {
        code: 'BUSY',
        name: 'Busy Signal',
        category: 'NO_CONTACT',
        color: '#475569',
        sortOrder: 12,
        description: 'Line was busy. Will retry shortly.',
      },
      {
        code: 'DISCONNECTED',
        name: 'Number Disconnected',
        category: 'NO_CONTACT',
        color: '#334155',
        sortOrder: 13,
        removeFromList: true,
        description: 'Phone number is disconnected or invalid.',
      },

      // ============================================
      // CALLBACK - Scheduled follow-ups
      // ============================================
      {
        code: 'CALLBACK_REQUESTED',
        name: 'Callback Requested',
        category: 'CALLBACK',
        color: '#3b82f6',
        sortOrder: 20,
        scheduleCallback: true,
        description: 'Lead requested callback at specific time. Push callback to rep on specified date/time.',
      },
      {
        code: 'FOLLOW_UP_SPECIFIC_DATE',
        name: 'Follow Up Specific Date',
        category: 'CALLBACK',
        color: '#2563eb',
        sortOrder: 21,
        scheduleCallback: true,
        description: 'Follow up on specific date requested by homeowner.',
      },
      {
        code: 'CALL_BACK_LATER',
        name: 'Call Back Later',
        category: 'CALLBACK',
        color: '#1d4ed8',
        sortOrder: 22,
        scheduleCallback: true,
        description: 'General callback later - no specific time given.',
      },

      // ============================================
      // NEGATIVE OUTCOMES - Not moving forward
      // ============================================
      {
        code: 'NOT_INTERESTED',
        name: 'Not Interested',
        category: 'NEGATIVE',
        color: '#f97316',
        sortOrder: 30,
        cooldownDays: 90,
        moveToListName: 'Cool Down',
        description: 'Not interested dispos, add to not interested or cool down list.',
      },
      {
        code: 'DNC',
        name: 'Do Not Call (DNC)',
        category: 'NEGATIVE',
        color: '#ef4444',
        sortOrder: 31,
        removeFromList: true,
        addToDNC: true,
        description: 'Add to Do Not Call list. Never contact again.',
      },
      {
        code: 'APPOINTMENT_CANCELLED',
        name: 'Appointment Cancelled',
        category: 'NEGATIVE',
        color: '#dc2626',
        sortOrder: 32,
        moveToListName: 'Reset',
        description: 'Appointment cancelled. Move to cancelled in Salesforce, add to Reset list.',
      },
      {
        code: 'NO_PROSPECT',
        name: 'No Prospect',
        category: 'NEGATIVE',
        color: '#b91c1c',
        sortOrder: 33,
        removeFromList: true,
        updateLeadStatus: 'UNQUALIFIED',
        description: 'Not a valid prospect. Remove from all lists.',
      },
      {
        code: 'LEAD_RAN_NO_CLAIM',
        name: 'Lead Ran No Claim',
        category: 'NEGATIVE',
        color: '#991b1b',
        sortOrder: 34,
        removeFromList: true,
        description: 'Insurance lead - inspection ran but no claim filed.',
      },

      // ============================================
      // DEMO OUTCOMES - After inspection/demo
      // ============================================
      {
        code: 'NO_DEMO',
        name: 'No Demo',
        category: 'NEGATIVE',
        color: '#78716c',
        sortOrder: 40,
        moveToListName: 'Reset',
        description: 'Demo did not happen. Move to Reset list for re-scheduling.',
      },
      {
        code: 'DEMO_NOT_SOLD',
        name: 'Not Sold - Demo Complete',
        category: 'NEGATIVE',
        color: '#a3a3a3',
        sortOrder: 41,
        moveToListName: 'Rehash',
        description: 'Demo/inspection completed but not sold. Move to Rehash list.',
      },
      {
        code: 'NOT_SOLD_HO_DECLINED',
        name: 'Not Sold - H/O Signs Contract Elsewhere',
        category: 'NEGATIVE',
        color: '#737373',
        sortOrder: 42,
        removeFromList: true,
        updateOppStage: 'CLOSED_LOST',
        description: 'H/O signed with competitor or declined. Close as lost.',
      },
      {
        code: 'NOT_SOLD_NO_QUOTE',
        name: 'Not Sold/No Quote - H/O Requires Return Survey',
        category: 'NEGATIVE',
        color: '#525252',
        sortOrder: 43,
        moveToListName: 'Rehash',
        description: 'Demo ran but no quote given. H/O requires return survey, no interest in updated estimate.',
      },
      {
        code: '2ND_VISIT_NEEDED',
        name: '2nd Visit Needed',
        category: 'CALLBACK',
        color: '#8b5cf6',
        sortOrder: 44,
        moveToListName: '2nd Visit Needed',
        description: 'Demo complete, needs second visit to close deal.',
      },

      // ============================================
      // QUALIFIED/DISQUALIFIED
      // ============================================
      {
        code: 'QUALIFIED',
        name: 'Qualified Lead',
        category: 'QUALIFIED',
        color: '#a855f7',
        sortOrder: 50,
        updateLeadStatus: 'QUALIFIED',
        description: 'Lead is qualified - meets criteria for appointment.',
      },
      {
        code: 'NOT_QUALIFIED',
        name: 'Not Qualified',
        category: 'DISQUALIFIED',
        color: '#c084fc',
        sortOrder: 51,
        updateLeadStatus: 'UNQUALIFIED',
        removeFromList: true,
        description: 'Lead does not meet qualification criteria.',
      },
      {
        code: 'RENTER',
        name: 'Renter - Not Homeowner',
        category: 'DISQUALIFIED',
        color: '#d8b4fe',
        sortOrder: 52,
        removeFromList: true,
        description: 'Contact is a renter, not the homeowner.',
      },
      {
        code: 'NO_LONGER_OWNER',
        name: 'No Longer Owner',
        category: 'DISQUALIFIED',
        color: '#e9d5ff',
        sortOrder: 53,
        removeFromList: true,
        description: 'Person no longer owns the property.',
      },

      // ============================================
      // INSURANCE-SPECIFIC DISPOSITIONS
      // ============================================
      {
        code: 'CLAIM_FILED',
        name: 'Insurance Claim Filed',
        category: 'POSITIVE',
        color: '#0ea5e9',
        sortOrder: 60,
        removeFromList: true,
        updateOppStage: 'CLAIM_FILED',
        description: 'Insurance claim has been filed with carrier.',
      },
      {
        code: 'ADJUSTER_SCHEDULED',
        name: 'Adjuster Meeting Scheduled',
        category: 'POSITIVE',
        color: '#0284c7',
        sortOrder: 61,
        removeFromList: true,
        description: 'Adjuster meeting scheduled with insurance company.',
      },
      {
        code: 'PROSPECT',
        name: 'Prospect - Appointment Complete',
        category: 'POSITIVE',
        color: '#0369a1',
        sortOrder: 62,
        description: 'Inspection complete, prospect identified. Move to claims process.',
      },

      // ============================================
      // OTHER/MISCELLANEOUS
      // ============================================
      {
        code: 'WRONG_NUMBER',
        name: 'Wrong Number',
        category: 'OTHER',
        color: '#6b7280',
        sortOrder: 70,
        removeFromList: true,
        description: 'Wrong phone number for this contact.',
      },
      {
        code: 'LANGUAGE_BARRIER',
        name: 'Language Barrier',
        category: 'OTHER',
        color: '#9ca3af',
        sortOrder: 71,
        description: 'Unable to communicate due to language barrier.',
      },
      {
        code: 'DECEASED',
        name: 'Deceased',
        category: 'OTHER',
        color: '#374151',
        sortOrder: 72,
        removeFromList: true,
        description: 'Contact is deceased. Remove from all lists.',
      },
      {
        code: 'DUPLICATE',
        name: 'Duplicate Record',
        category: 'OTHER',
        color: '#4b5563',
        sortOrder: 73,
        removeFromList: true,
        description: 'Duplicate lead/contact record.',
      },
    ];

    let createdCount = 0;
    for (const disp of predefinedDispositions) {
      const existing = await prisma.callListDisposition.findFirst({
        where: { code: disp.code, callListId: null },
      });

      if (!existing) {
        await prisma.callListDisposition.create({
          data: { ...disp, callListId: null },
        });
        createdCount++;
      }
    }

    return createdCount;
  }

  // ==================== DASHBOARD STATS ====================

  /**
   * Get comprehensive dashboard stats for call center manager
   * Includes queue depths, time-in-list metrics, and team performance
   */
  async getDashboardStats() {
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));

    // Get all active lists with detailed stats
    const lists = await prisma.callList.findMany({
      where: { isActive: true },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
    });

    const listStats = await Promise.all(lists.map(async (list) => {
      // Get item counts by status
      const [pending, inProgress, completed, skipped] = await Promise.all([
        prisma.callListItem.count({ where: { callListId: list.id, status: 'PENDING' } }),
        prisma.callListItem.count({ where: { callListId: list.id, status: 'IN_PROGRESS' } }),
        prisma.callListItem.count({ where: { callListId: list.id, status: 'COMPLETED' } }),
        prisma.callListItem.count({ where: { callListId: list.id, status: 'SKIPPED' } }),
      ]);

      // Get completed today count
      const completedToday = await prisma.callListItem.count({
        where: {
          callListId: list.id,
          status: 'COMPLETED',
          completedAt: { gte: startOfToday },
        },
      });

      // Calculate average time in list for pending items (in hours)
      const pendingItems = await prisma.callListItem.findMany({
        where: { callListId: list.id, status: 'PENDING' },
        select: { added_at: true },
        take: 100, // Sample for performance
      });

      let avgTimeInListHours = 0;
      if (pendingItems.length > 0) {
        const totalHours = pendingItems.reduce((sum, item) => {
          const hoursInList = (Date.now() - new Date(item.added_at).getTime()) / (1000 * 60 * 60);
          return sum + hoursInList;
        }, 0);
        avgTimeInListHours = Math.round(totalHours / pendingItems.length);
      }

      // Get oldest item age
      const oldestItem = await prisma.callListItem.findFirst({
        where: { callListId: list.id, status: 'PENDING' },
        orderBy: { added_at: 'asc' },
        select: { added_at: true },
      });

      const oldestItemHours = oldestItem
        ? Math.round((Date.now() - new Date(oldestItem.added_at).getTime()) / (1000 * 60 * 60))
        : 0;

      // Get items for preview - use cached display fields
      const previewItems = await prisma.callListItem.findMany({
        where: { callListId: list.id, status: 'PENDING' },
        include: {
          assignedTo: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: [{ priority: 'desc' }, { added_at: 'asc' }],
        take: 50,
      });

      // Get lead owner IDs for items that have a leadId
      const leadIds = previewItems.map(item => item.leadId).filter(Boolean);
      let leadOwnerMap = {};
      if (leadIds.length > 0) {
        const leads = await prisma.lead.findMany({
          where: { id: { in: leadIds } },
          select: { id: true, ownerId: true },
        });
        leadOwnerMap = Object.fromEntries(leads.map(l => [l.id, l.ownerId]));
      }

      return {
        id: list.id,
        name: list.name,
        description: list.description,
        listType: list.listType,
        targetObject: list.targetObject,
        cadenceType: list.cadenceType,
        cadenceHours: list.cadenceHours,
        maxAttempts: list.maxAttempts,
        priority: list.priority,
        counts: {
          pending,
          inProgress,
          completed,
          skipped,
          total: pending + inProgress + completed + skipped,
          completedToday,
        },
        metrics: {
          avgTimeInListHours,
          oldestItemHours,
          queueDepth: pending + inProgress,
        },
        items: previewItems.map(item => ({
          id: item.id,
          leadId: item.leadId,
          opportunityId: item.opportunityId,
          displayName: item.displayName,
          phone: item.phoneNumber || item.formattedPhone,
          displayAddress: item.displayAddress,
          displayStatus: item.displayStatus,
          status: item.status,
          attemptCount: item.attempt_count,
          priority: item.priority,
          addedAt: item.added_at,
          hoursInList: Math.round((Date.now() - new Date(item.added_at).getTime()) / (1000 * 60 * 60)),
          assignedToId: item.assignedToId,
          assignedToName: item.assignedTo ? `${item.assignedTo.firstName} ${item.assignedTo.lastName}` : null,
          ownerId: item.leadId ? leadOwnerMap[item.leadId] || null : null, // Lead owner for filtering by non-managers
        })),
      };
    }));

    // Get active sessions (active = endedAt is null)
    const activeSessions = await prisma.callSession.findMany({
      where: { endedAt: null },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    // Get today's team performance
    const todayStats = await prisma.callSession.aggregate({
      where: {
        startedAt: { gte: startOfToday },
      },
      _sum: {
        totalCalls: true,
        connectedCalls: true,
        totalTalkTimeMs: true,
      },
    });

    return {
      lists: listStats,
      activeSessions: activeSessions.map(s => ({
        id: s.id,
        agentId: s.userId,
        agentName: s.user ? `${s.user.firstName} ${s.user.lastName}` : 'Unknown',
        listId: s.currentListId,
        listName: null, // No direct relation to call list
        status: s.endedAt ? 'ENDED' : (s.pausedAt ? 'PAUSED' : 'ACTIVE'),
        isPaused: !!s.pausedAt,
        startedAt: s.startedAt,
        callsCompleted: s.totalCalls,
      })),
      todayTotals: {
        callsCompleted: todayStats._sum.totalCalls || 0,
        callsConnected: todayStats._sum.connectedCalls || 0,
        totalTalkTimeMinutes: Math.round((todayStats._sum.totalTalkTimeMs || 0) / 60000),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Bulk assign items to a user (pass null to unassign)
   */
  async bulkAssignItems(itemIds, assignToUserId) {
    // Get the lead IDs from the items
    const items = await prisma.callListItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, leadId: true },
    });

    const leadIds = items.filter(i => i.leadId).map(i => i.leadId);

    // Update lead ownership (null to unassign)
    if (leadIds.length > 0) {
      await prisma.lead.updateMany({
        where: { id: { in: leadIds } },
        data: { ownerId: assignToUserId }, // null = unassign
      });
    }

    // Also update the call list item's assignedToId
    await prisma.callListItem.updateMany({
      where: { id: { in: itemIds } },
      data: { assignedToId: assignToUserId },
    });

    return { assigned: leadIds.length, itemIds, unassigned: assignToUserId === null };
  }
}

export const callListService = new CallListService();
export default callListService;
