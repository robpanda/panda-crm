// Lead Assignment Service - Automated lead routing and assignment
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

// Settings key constants
const SETTINGS_KEYS = {
  ROUND_ROBIN_ENABLED: 'lead_round_robin_enabled',
  ASSIGNMENT_ENABLED: 'lead_auto_assignment_enabled',
};

/**
 * Lead Assignment Service
 *
 * Implements the Call Center → Sales Rep flow based on:
 * - Work Type (Insurance, Retail, Inspection)
 * - Stage (Lead Assigned, Prospect)
 * - Status (Confirmed, 3 Day Follow Up, Claim Filed, etc.)
 * - Disposition (Scheduled, Not able to Schedule, etc.)
 *
 * Flow diagram reference: /Users/robwinters/Desktop/Screenshot 2025-12-19 at 4.09.33 PM.png
 */
export const leadAssignmentService = {
  // ============================================================================
  // GLOBAL SETTINGS
  // ============================================================================

  /**
   * Get the global round-robin enabled setting
   */
  async isRoundRobinEnabled() {
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: SETTINGS_KEYS.ROUND_ROBIN_ENABLED },
      });
      return setting?.value !== 'false'; // Default to true if not set
    } catch (error) {
      // If table doesn't exist yet, default to enabled
      logger.warn('Could not check round robin setting, defaulting to enabled');
      return true;
    }
  },

  /**
   * Get the global auto-assignment enabled setting
   */
  async isAutoAssignmentEnabled() {
    try {
      const setting = await prisma.systemSetting.findUnique({
        where: { key: SETTINGS_KEYS.ASSIGNMENT_ENABLED },
      });
      return setting?.value !== 'false'; // Default to true if not set
    } catch (error) {
      logger.warn('Could not check auto-assignment setting, defaulting to enabled');
      return true;
    }
  },

  /**
   * Toggle round-robin assignment on/off
   */
  async toggleRoundRobin(enabled, updatedById) {
    const setting = await prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEYS.ROUND_ROBIN_ENABLED },
      update: {
        value: String(enabled),
        updatedById,
        updatedAt: new Date(),
      },
      create: {
        key: SETTINGS_KEYS.ROUND_ROBIN_ENABLED,
        value: String(enabled),
        description: 'Enable/disable lead round-robin assignment',
        category: 'lead_assignment',
        createdById: updatedById,
      },
    });

    logger.info(`Round-robin assignment ${enabled ? 'enabled' : 'disabled'} by ${updatedById}`);
    return {
      key: setting.key,
      enabled: setting.value === 'true',
      updatedAt: setting.updatedAt,
    };
  },

  /**
   * Toggle all auto-assignment on/off
   */
  async toggleAutoAssignment(enabled, updatedById) {
    const setting = await prisma.systemSetting.upsert({
      where: { key: SETTINGS_KEYS.ASSIGNMENT_ENABLED },
      update: {
        value: String(enabled),
        updatedById,
        updatedAt: new Date(),
      },
      create: {
        key: SETTINGS_KEYS.ASSIGNMENT_ENABLED,
        value: String(enabled),
        description: 'Enable/disable all lead auto-assignment',
        category: 'lead_assignment',
        createdById: updatedById,
      },
    });

    logger.info(`Auto-assignment ${enabled ? 'enabled' : 'disabled'} by ${updatedById}`);
    return {
      key: setting.key,
      enabled: setting.value === 'true',
      updatedAt: setting.updatedAt,
    };
  },

  /**
   * Get all assignment settings
   */
  async getAssignmentSettings() {
    const settings = await prisma.systemSetting.findMany({
      where: { category: 'lead_assignment' },
    });

    const settingsMap = {};
    for (const s of settings) {
      settingsMap[s.key] = {
        value: s.value,
        enabled: s.value === 'true',
        description: s.description,
        updatedAt: s.updatedAt,
      };
    }

    return {
      roundRobinEnabled: settingsMap[SETTINGS_KEYS.ROUND_ROBIN_ENABLED]?.enabled ?? true,
      autoAssignmentEnabled: settingsMap[SETTINGS_KEYS.ASSIGNMENT_ENABLED]?.enabled ?? true,
      settings: settingsMap,
    };
  },

  // ============================================================================
  // ASSIGNMENT RULES
  // ============================================================================

  /**
   * Get all assignment rules
   */
  async getRules(includeInactive = false) {
    return prisma.leadAssignmentRule.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ priority: 'desc' }, { name: 'asc' }],
      include: {
        assignToUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignToTeam: { select: { id: true, name: true } },
      },
    });
  },

  /**
   * Get a single rule by ID
   */
  async getRuleById(ruleId) {
    return prisma.leadAssignmentRule.findUnique({
      where: { id: ruleId },
      include: {
        assignToUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignToTeam: { select: { id: true, name: true } },
      },
    });
  },

  /**
   * Create a new assignment rule
   */
  async createRule(data, createdById) {
    const rule = await prisma.leadAssignmentRule.create({
      data: {
        name: data.name,
        description: data.description,
        isActive: data.isActive ?? true,
        priority: data.priority || 0,
        // Criteria
        workType: data.workType,
        stage: data.stage,
        status: data.status,
        leadSource: data.leadSource,
        state: data.state,
        conditions: data.conditions, // JSON for complex conditions
        // Assignment Target
        assignmentType: data.assignmentType || 'ROUND_ROBIN', // SPECIFIC_USER, ROUND_ROBIN, TEAM, QUEUE
        assignToUserId: data.assignToUserId,
        assignToTeamId: data.assignToTeamId,
        roundRobinGroup: data.roundRobinGroup,
        // Actions
        autoCreateOpportunity: data.autoCreateOpportunity ?? false,
        defaultOpportunityStage: data.defaultOpportunityStage || 'LEAD_ASSIGNED',
        notifyAssignee: data.notifyAssignee ?? true,
        notificationTemplate: data.notificationTemplate,
        createdById,
      },
    });

    await this.logRuleAction(rule.id, 'CREATE', createdById, { rule: data });
    logger.info(`Lead assignment rule created: ${rule.id} - ${rule.name}`);
    return rule;
  },

  /**
   * Update an existing rule
   */
  async updateRule(ruleId, data, updatedById) {
    const existing = await prisma.leadAssignmentRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new Error('Lead assignment rule not found');
    }

    const rule = await prisma.leadAssignmentRule.update({
      where: { id: ruleId },
      data: {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
        priority: data.priority,
        workType: data.workType,
        stage: data.stage,
        status: data.status,
        leadSource: data.leadSource,
        state: data.state,
        conditions: data.conditions,
        assignmentType: data.assignmentType,
        assignToUserId: data.assignToUserId,
        assignToTeamId: data.assignToTeamId,
        roundRobinGroup: data.roundRobinGroup,
        autoCreateOpportunity: data.autoCreateOpportunity,
        defaultOpportunityStage: data.defaultOpportunityStage,
        notifyAssignee: data.notifyAssignee,
        notificationTemplate: data.notificationTemplate,
      },
    });

    await this.logRuleAction(rule.id, 'UPDATE', updatedById, { before: existing, after: rule });
    logger.info(`Lead assignment rule updated: ${rule.id} - ${rule.name}`);
    return rule;
  },

  /**
   * Delete a rule
   */
  async deleteRule(ruleId, deletedById) {
    const existing = await prisma.leadAssignmentRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new Error('Lead assignment rule not found');
    }

    await prisma.leadAssignmentRule.delete({
      where: { id: ruleId },
    });

    await this.logRuleAction(ruleId, 'DELETE', deletedById, { rule: existing });
    logger.info(`Lead assignment rule deleted: ${ruleId} - ${existing.name}`);
    return { success: true, id: ruleId };
  },

  /**
   * Toggle rule active status
   */
  async toggleRuleStatus(ruleId, updatedById) {
    const existing = await prisma.leadAssignmentRule.findUnique({
      where: { id: ruleId },
    });

    if (!existing) {
      throw new Error('Lead assignment rule not found');
    }

    const rule = await prisma.leadAssignmentRule.update({
      where: { id: ruleId },
      data: { isActive: !existing.isActive },
    });

    await this.logRuleAction(rule.id, 'TOGGLE', updatedById, {
      wasActive: existing.isActive,
      isActive: rule.isActive
    });

    logger.info(`Lead assignment rule ${rule.isActive ? 'activated' : 'deactivated'}: ${rule.id}`);
    return rule;
  },

  // ============================================================================
  // LEAD ASSIGNMENT LOGIC
  // ============================================================================

  /**
   * Assign a lead based on matching rules
   * This is the main entry point for lead assignment
   */
  async assignLead(leadId, options = {}) {
    // Check if auto-assignment is globally enabled
    const autoAssignmentEnabled = await this.isAutoAssignmentEnabled();
    if (!autoAssignmentEnabled && !options.forceAssign) {
      logger.info(`Auto-assignment is disabled globally. Lead ${leadId} not assigned.`);
      return {
        assigned: false,
        reason: 'Auto-assignment is disabled globally',
        leadId,
      };
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        account: true,
        owner: true,
      },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    // Find matching rule
    const rule = await this.findMatchingRule(lead);

    if (!rule) {
      logger.info(`No matching assignment rule for lead ${leadId}`);
      return {
        assigned: false,
        reason: 'No matching assignment rule',
        lead,
      };
    }

    // Determine assignee based on rule
    const assignee = await this.determineAssignee(rule, lead);

    if (!assignee) {
      logger.warn(`Could not determine assignee for lead ${leadId} with rule ${rule.id}`);
      return {
        assigned: false,
        reason: 'Could not determine assignee',
        ruleId: rule.id,
        lead,
      };
    }

    // Update lead with assignment
    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        ownerId: assignee.id,
        assignedAt: new Date(),
        assignedById: options.assignedById,
        assignmentRuleId: rule.id,
        status: rule.status || lead.status, // Update status if rule specifies
      },
    });

    // Log assignment
    await prisma.leadAssignmentLog.create({
      data: {
        leadId,
        ruleId: rule.id,
        assignedToId: assignee.id,
        assignedById: options.assignedById,
        previousOwnerId: lead.ownerId,
        assignmentType: rule.assignmentType,
        metadata: {
          ruleName: rule.name,
          matchedCriteria: {
            workType: lead.workType,
            stage: lead.stage,
            status: lead.status,
            leadSource: lead.leadSource,
            state: lead.state,
          },
        },
      },
    });

    // Auto-create opportunity if configured
    let opportunity = null;
    if (rule.autoCreateOpportunity) {
      opportunity = await this.createOpportunityFromLead(updatedLead, rule);
    }

    // Send notification if configured
    if (rule.notifyAssignee) {
      await this.notifyAssignee(assignee, updatedLead, rule);
    }

    logger.info(`Lead ${leadId} assigned to ${assignee.email} via rule ${rule.name}`);

    return {
      assigned: true,
      lead: updatedLead,
      assignee,
      rule,
      opportunity,
    };
  },

  /**
   * Find the highest-priority matching rule for a lead
   */
  async findMatchingRule(lead) {
    const rules = await prisma.leadAssignmentRule.findMany({
      where: { isActive: true },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    for (const rule of rules) {
      if (this.ruleMatchesLead(rule, lead)) {
        return rule;
      }
    }

    return null;
  },

  /**
   * Check if a rule matches a lead's criteria
   */
  ruleMatchesLead(rule, lead) {
    // Check work type
    if (rule.workType && rule.workType !== lead.workType) {
      return false;
    }

    // Check stage
    if (rule.stage && rule.stage !== lead.stage) {
      return false;
    }

    // Check status
    if (rule.status && rule.status !== lead.status) {
      return false;
    }

    // Check lead source
    if (rule.leadSource && rule.leadSource !== lead.leadSource) {
      return false;
    }

    // Check state
    if (rule.state && rule.state !== lead.state) {
      return false;
    }

    // Check complex conditions (JSON)
    if (rule.conditions) {
      if (!this.evaluateConditions(rule.conditions, lead)) {
        return false;
      }
    }

    return true;
  },

  /**
   * Evaluate complex JSON conditions
   */
  evaluateConditions(conditions, lead) {
    // Handle array of conditions (AND logic)
    if (Array.isArray(conditions)) {
      return conditions.every(condition => this.evaluateSingleCondition(condition, lead));
    }

    // Handle single condition object
    return this.evaluateSingleCondition(conditions, lead);
  },

  /**
   * Evaluate a single condition
   */
  evaluateSingleCondition(condition, lead) {
    const { field, operator, value } = condition;
    const leadValue = lead[field];

    switch (operator) {
      case 'equals':
        return leadValue === value;
      case 'not_equals':
        return leadValue !== value;
      case 'contains':
        return String(leadValue).toLowerCase().includes(String(value).toLowerCase());
      case 'starts_with':
        return String(leadValue).toLowerCase().startsWith(String(value).toLowerCase());
      case 'in':
        return Array.isArray(value) && value.includes(leadValue);
      case 'not_in':
        return Array.isArray(value) && !value.includes(leadValue);
      case 'is_null':
        return leadValue === null || leadValue === undefined;
      case 'is_not_null':
        return leadValue !== null && leadValue !== undefined;
      case 'greater_than':
        return Number(leadValue) > Number(value);
      case 'less_than':
        return Number(leadValue) < Number(value);
      default:
        logger.warn(`Unknown condition operator: ${operator}`);
        return true;
    }
  },

  /**
   * Determine the assignee based on rule assignment type
   */
  async determineAssignee(rule, lead) {
    switch (rule.assignmentType) {
      case 'SPECIFIC_USER':
        return this.getSpecificUser(rule.assignToUserId);

      case 'ROUND_ROBIN':
        // Check if round-robin is globally enabled
        const roundRobinEnabled = await this.isRoundRobinEnabled();
        if (!roundRobinEnabled) {
          logger.info(`Round-robin is disabled globally. Skipping round-robin for rule ${rule.id}`);
          return null;
        }
        return this.getNextRoundRobinUser(rule.roundRobinGroup, lead);

      case 'TEAM':
        return this.getTeamMember(rule.assignToTeamId, lead);

      case 'QUEUE':
        return this.getQueueUser(rule, lead);

      case 'TERRITORY':
        return this.getTerritoryUser(lead);

      default:
        logger.warn(`Unknown assignment type: ${rule.assignmentType}`);
        return null;
    }
  },

  /**
   * Get a specific user by ID
   */
  async getSpecificUser(userId) {
    return prisma.user.findUnique({
      where: { id: userId, isActive: true },
      select: { id: true, firstName: true, lastName: true, email: true },
    });
  },

  /**
   * Get next user in round-robin rotation
   */
  async getNextRoundRobinUser(groupName, lead) {
    // Get all active users in the round-robin group
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        roundRobinGroups: { has: groupName },
      },
      orderBy: { lastLeadAssignedAt: 'asc' }, // Least recently assigned first
    });

    if (users.length === 0) {
      logger.warn(`No users in round-robin group: ${groupName}`);
      return null;
    }

    // Get the user who was assigned least recently
    const nextUser = users[0];

    // Update last assigned timestamp
    await prisma.user.update({
      where: { id: nextUser.id },
      data: { lastLeadAssignedAt: new Date() },
    });

    return nextUser;
  },

  /**
   * Get a team member based on availability/workload
   */
  async getTeamMember(teamId, lead) {
    // Get team members ordered by current lead count (load balancing)
    const members = await prisma.user.findMany({
      where: {
        isActive: true,
        teamMemberships: { some: { teamId } },
      },
      include: {
        _count: {
          select: {
            ownedLeads: {
              where: {
                status: { notIn: ['CONVERTED', 'CLOSED_LOST', 'DISQUALIFIED'] },
              },
            },
          },
        },
      },
      orderBy: { lastLeadAssignedAt: 'asc' },
    });

    if (members.length === 0) {
      return null;
    }

    // Find member with lowest active lead count
    const sortedByWorkload = members.sort((a, b) =>
      a._count.ownedLeads - b._count.ownedLeads
    );

    return sortedByWorkload[0];
  },

  /**
   * Get user from queue (FIFO with availability check)
   */
  async getQueueUser(rule, lead) {
    // Get available users for this queue
    const availableUsers = await prisma.user.findMany({
      where: {
        isActive: true,
        isAvailableForLeads: true,
        // Could add shift/schedule checks here
      },
      orderBy: { lastLeadAssignedAt: 'asc' },
    });

    return availableUsers[0] || null;
  },

  /**
   * Get user based on territory (geographic assignment)
   */
  async getTerritoryUser(lead) {
    if (!lead.state) {
      return null;
    }

    // Find territory owner for the lead's state
    const territory = await prisma.territory.findFirst({
      where: {
        states: { has: lead.state },
        isActive: true,
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    return territory?.owner || null;
  },

  // ============================================================================
  // OPPORTUNITY CREATION
  // ============================================================================

  /**
   * Create an opportunity from a lead
   */
  async createOpportunityFromLead(lead, rule) {
    const opportunity = await prisma.opportunity.create({
      data: {
        name: `${lead.firstName} ${lead.lastName} - ${lead.workType || 'New'}`.trim(),
        accountId: lead.accountId,
        leadId: lead.id,
        ownerId: lead.ownerId,
        stage: rule.defaultOpportunityStage || 'LEAD_ASSIGNED',
        workType: lead.workType,
        type: lead.type,
        leadSource: lead.leadSource,
        description: lead.description,
        amount: 0,
        probability: 10,
      },
    });

    // Update lead with opportunity reference
    await prisma.lead.update({
      where: { id: lead.id },
      data: { convertedOpportunityId: opportunity.id },
    });

    logger.info(`Created opportunity ${opportunity.id} from lead ${lead.id}`);
    return opportunity;
  },

  // ============================================================================
  // NOTIFICATIONS
  // ============================================================================

  /**
   * Send notification to assignee
   */
  async notifyAssignee(assignee, lead, rule) {
    // TODO: Integrate with messaging service (SMS/Email)
    logger.info(`Would notify ${assignee.email} about lead assignment: ${lead.id}`);

    // Create in-app notification
    await prisma.notification.create({
      data: {
        userId: assignee.id,
        type: 'LEAD_ASSIGNED',
        title: 'New Lead Assigned',
        message: `You have been assigned a new lead: ${lead.firstName} ${lead.lastName}`,
        data: {
          leadId: lead.id,
          ruleId: rule.id,
          workType: lead.workType,
        },
        isRead: false,
      },
    });
  },

  // ============================================================================
  // BULK ASSIGNMENT
  // ============================================================================

  /**
   * Assign multiple leads at once
   */
  async bulkAssignLeads(leadIds, options = {}) {
    const results = {
      success: [],
      failed: [],
    };

    for (const leadId of leadIds) {
      try {
        const result = await this.assignLead(leadId, options);
        if (result.assigned) {
          results.success.push({ leadId, assigneeId: result.assignee?.id });
        } else {
          results.failed.push({ leadId, reason: result.reason });
        }
      } catch (error) {
        results.failed.push({ leadId, reason: error.message });
      }
    }

    logger.info(`Bulk assignment: ${results.success.length} succeeded, ${results.failed.length} failed`);
    return results;
  },

  /**
   * Manually reassign a lead to a specific user
   */
  async manualAssign(leadId, assignToUserId, assignedById, notes = null) {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      throw new Error('Lead not found');
    }

    const previousOwnerId = lead.ownerId;

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        ownerId: assignToUserId,
        assignedAt: new Date(),
        assignedById,
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    // Log the manual assignment
    await prisma.leadAssignmentLog.create({
      data: {
        leadId,
        assignedToId: assignToUserId,
        assignedById,
        previousOwnerId,
        assignmentType: 'MANUAL',
        notes,
        metadata: { manual: true },
      },
    });

    logger.info(`Lead ${leadId} manually assigned to ${assignToUserId} by ${assignedById}`);
    return updatedLead;
  },

  // ============================================================================
  // ANALYTICS & REPORTING
  // ============================================================================

  /**
   * Get assignment statistics
   */
  async getAssignmentStats(dateRange = {}) {
    const where = {};
    if (dateRange.startDate) {
      where.createdAt = { gte: new Date(dateRange.startDate) };
    }
    if (dateRange.endDate) {
      where.createdAt = { ...where.createdAt, lte: new Date(dateRange.endDate) };
    }

    const [totalAssignments, byRule, byUser, byType] = await Promise.all([
      prisma.leadAssignmentLog.count({ where }),
      prisma.leadAssignmentLog.groupBy({
        by: ['ruleId'],
        where,
        _count: true,
      }),
      prisma.leadAssignmentLog.groupBy({
        by: ['assignedToId'],
        where,
        _count: true,
      }),
      prisma.leadAssignmentLog.groupBy({
        by: ['assignmentType'],
        where,
        _count: true,
      }),
    ]);

    return {
      total: totalAssignments,
      byRule,
      byUser,
      byType,
    };
  },

  /**
   * Get assignment history for a lead
   */
  async getLeadAssignmentHistory(leadId) {
    return prisma.leadAssignmentLog.findMany({
      where: { leadId },
      include: {
        assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
        assignedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
        rule: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Log rule actions for audit
   */
  async logRuleAction(ruleId, action, userId, metadata = {}) {
    await prisma.auditLog.create({
      data: {
        tableName: 'lead_assignment_rules',
        recordId: ruleId,
        action,
        newValues: metadata,
        userId,
        source: 'lead_assignment_service',
      },
    });
  },

  /**
   * Seed default assignment rules
   */
  async seedDefaultRules(createdById = 'system') {
    const defaultRules = [
      // Insurance - Inspection Confirmed
      {
        name: 'Insurance Inspection - Confirmed',
        description: 'New insurance leads with confirmed inspection',
        workType: 'INSURANCE',
        stage: 'LEAD_ASSIGNED',
        status: 'CONFIRMED',
        assignmentType: 'ROUND_ROBIN',
        roundRobinGroup: 'insurance_sales',
        autoCreateOpportunity: true,
        defaultOpportunityStage: 'LEAD_ASSIGNED',
        priority: 100,
      },
      // Insurance - 3 Day Follow Up
      {
        name: 'Insurance - 3 Day Follow Up',
        description: 'Insurance leads needing follow up',
        workType: 'INSURANCE',
        stage: 'LEAD_ASSIGNED',
        status: 'THREE_DAY_FOLLOW_UP',
        assignmentType: 'ROUND_ROBIN',
        roundRobinGroup: 'insurance_sales',
        autoCreateOpportunity: false,
        priority: 90,
      },
      // Insurance - Claim Filed
      {
        name: 'Insurance - Claim Filed',
        description: 'Insurance leads with claim filed, at Prospect stage',
        workType: 'INSURANCE',
        stage: 'PROSPECT',
        status: 'CLAIM_FILED',
        assignmentType: 'ROUND_ROBIN',
        roundRobinGroup: 'insurance_closers',
        autoCreateOpportunity: true,
        defaultOpportunityStage: 'CLAIM_FILED',
        priority: 95,
      },
      // Retail - Lead Assigned
      {
        name: 'Retail - New Lead',
        description: 'New retail leads',
        workType: 'RETAIL',
        stage: 'LEAD_ASSIGNED',
        assignmentType: 'ROUND_ROBIN',
        roundRobinGroup: 'retail_sales',
        autoCreateOpportunity: true,
        defaultOpportunityStage: 'LEAD_ASSIGNED',
        priority: 100,
      },
      // Retail - Second Visit Needed
      {
        name: 'Retail - Second Visit',
        description: 'Retail leads needing second visit',
        workType: 'RETAIL',
        stage: 'LEAD_ASSIGNED',
        status: 'SECOND_VISIT_NEEDED',
        assignmentType: 'SPECIFIC_USER', // Could be same rep
        autoCreateOpportunity: false,
        priority: 85,
      },
      // No Inspection - Out of Scope
      {
        name: 'No Inspection - Out of Scope',
        description: 'Leads marked as out of scope',
        workType: 'INSPECTION',
        stage: 'LEAD_ASSIGNED',
        status: 'NO_INSPECTION',
        conditions: [{ field: 'disposition', operator: 'equals', value: 'OUT_OF_SCOPE' }],
        assignmentType: 'QUEUE',
        autoCreateOpportunity: false,
        priority: 50,
      },
    ];

    const created = [];
    for (const ruleData of defaultRules) {
      const existing = await prisma.leadAssignmentRule.findFirst({
        where: { name: ruleData.name },
      });

      if (!existing) {
        const rule = await this.createRule(ruleData, createdById);
        created.push(rule);
      }
    }

    logger.info(`Seeded ${created.length} default lead assignment rules`);
    return created;
  },
};

export default leadAssignmentService;
