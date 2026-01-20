// Contact Service - Business Logic Layer
// Replicates SalesLeaderContactController.cls functionality
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

// Work types for upsell analysis (matching Salesforce)
const ALL_WORK_TYPES = new Set([
  'Insurance Roofing',
  'Retail Roofing',
  'Interior',
  'Service/Repair',
]);

// Audit logging helper
const logAudit = async ({ tableName, recordId, action, oldValues, newValues, userId, userEmail, source = 'api' }) => {
  try {
    // Calculate changed fields
    const changedFields = [];
    if (oldValues && newValues) {
      const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
      for (const key of allKeys) {
        if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
          changedFields.push(key);
        }
      }
    } else if (newValues) {
      changedFields.push(...Object.keys(newValues));
    }

    await prisma.auditLog.create({
      data: {
        tableName,
        recordId,
        action,
        oldValues: oldValues || undefined,
        newValues: newValues || undefined,
        changedFields,
        userId,
        userEmail,
        source,
      },
    });
    logger.debug(`Audit log created: ${action} on ${tableName}:${recordId}`);
  } catch (error) {
    logger.error('Failed to create audit log:', error);
    // Don't throw - audit logging should not break the main operation
  }
};

class ContactService {
  /**
   * Get Contact details with Account information
   * Replicates: getContactDetails(String contactId)
   */
  async getContactDetails(contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            billingCity: true,
            billingState: true,
          },
        },
      },
    });

    if (!contact) {
      const error = new Error(`Contact not found: ${contactId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // Get Opportunity count via primary contact relation
    const opportunityCount = await prisma.opportunity.count({
      where: { contactId },
    });

    // Get Case count
    const caseCount = await prisma.case.count({
      where: {
        account: { contacts: { some: { id: contactId } } },
      },
    });

    // Get Activity count (Tasks)
    const activityCount = await prisma.task.count({
      where: {
        OR: [
          { lead: { is: null } },
          { opportunity: { contactId } },
        ],
      },
    });

    return {
      contact,
      accountName: contact.account?.name,
      accountId: contact.accountId,
      opportunityCount,
      caseCount,
      activityCount,
      hasPhone: !!(contact.phone || contact.mobilePhone),
      formattedPhone: contact.mobilePhone || contact.phone,
      smsNumber: contact.smsNumber,
      smsOptOut: contact.smsOptOut,
    };
  }

  /**
   * Get Contacts with prospecting overlays for past customer outreach
   * Replicates: getContactsWithProspecting()
   */
  async getContacts(options = {}) {
    const {
      page = 1,
      limit = 20,
      search,
      accountId,
      prospectFilter, // 'past_customers', 'recent_closed', 'upsell_candidates', 'review_eligible', 'high_value'
      sortBy = 'updatedAt',
      sortOrder = 'desc',
    } = options;

    const skip = (page - 1) * limit;

    // If prospecting filter is set, use opportunity-first query
    if (prospectFilter) {
      return this.getFilteredProspectingContacts(options);
    }

    // Build where clause - always exclude soft-deleted records
    const where = {
      deletedAt: null, // Only show non-deleted records
    };

    if (accountId) where.accountId = accountId;

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { mobilePhone: { contains: search } },
      ];
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          account: {
            select: {
              id: true,
              name: true,
              billingCity: true,
              billingState: true,
            },
          },
        },
      }),
      prisma.contact.count({ where }),
    ]);

    // Enrich with prospecting data
    const enrichedContacts = await this.enrichContactsWithProspecting(contacts);

    return {
      data: enrichedContacts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  /**
   * Get contacts filtered by prospecting criteria
   * Queries from Opportunities first to find matching contacts
   */
  async getFilteredProspectingContacts(options) {
    const {
      page = 1,
      limit = 20,
      search,
      accountId,
      prospectFilter,
    } = options;

    const skip = (page - 1) * limit;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Build opportunity query based on filter
    const oppWhere = {
      stage: 'CLOSED_WON',
      contactId: { not: null },
    };

    if (prospectFilter === 'recent_closed' || prospectFilter === 'review_eligible') {
      oppWhere.closeDate = { gte: thirtyDaysAgo };
    }

    const opportunities = await prisma.opportunity.findMany({
      where: oppWhere,
      orderBy: { closeDate: 'desc' },
      select: {
        id: true,
        contactId: true,
        accountId: true,
        closeDate: true,
        amount: true,
        workType: true,
      },
    });

    // Build contact-to-opportunities map
    const contactOppsMap = new Map();
    for (const opp of opportunities) {
      if (!contactOppsMap.has(opp.contactId)) {
        contactOppsMap.set(opp.contactId, []);
      }
      contactOppsMap.get(opp.contactId).push(opp);
    }

    let matchingContactIds = new Set(contactOppsMap.keys());

    // Apply additional filters
    if (prospectFilter === 'high_value') {
      const highValueIds = new Set();
      for (const [contactId, opps] of contactOppsMap) {
        const totalValue = opps.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
        if (totalValue >= 25000) {
          highValueIds.add(contactId);
        }
      }
      matchingContactIds = highValueIds;
    }

    if (prospectFilter === 'upsell_candidates') {
      const upsellIds = new Set();
      for (const [contactId, opps] of contactOppsMap) {
        const workTypesDone = new Set(opps.map((o) => o.workType).filter(Boolean));
        if (workTypesDone.size < ALL_WORK_TYPES.size) {
          upsellIds.add(contactId);
        }
      }
      matchingContactIds = upsellIds;
    }

    if (matchingContactIds.size === 0) {
      return { data: [], pagination: { page, limit, total: 0, totalPages: 0, hasMore: false } };
    }

    // Query contacts
    const contactWhere = {
      id: { in: Array.from(matchingContactIds) },
    };

    if (accountId) contactWhere.accountId = accountId;

    if (search) {
      contactWhere.AND = [
        {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where: contactWhere,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          account: {
            select: {
              id: true,
              name: true,
              billingCity: true,
              billingState: true,
            },
          },
        },
      }),
      prisma.contact.count({ where: contactWhere }),
    ]);

    // Enrich with prospecting data using existing map
    const enrichedContacts = contacts.map((contact) => {
      const wrapper = this.createContactWrapper(contact);
      const relevantOpps = contactOppsMap.get(contact.id) || [];

      if (relevantOpps.length > 0) {
        wrapper.isPastCustomer = true;
        wrapper.totalJobCount = relevantOpps.length;

        // Most recent job
        const lastJob = relevantOpps[0];
        wrapper.lastJobDate = lastJob.closeDate;
        wrapper.lastJobWorkType = lastJob.workType;
        wrapper.lastJobAmount = Number(lastJob.amount) || 0;

        if (lastJob.closeDate) {
          wrapper.daysSinceLastJob = Math.floor(
            (Date.now() - new Date(lastJob.closeDate).getTime()) / (1000 * 60 * 60 * 24)
          );
        }

        // Lifetime value and work types
        let totalValue = 0;
        const workTypesDone = new Set();
        for (const opp of relevantOpps) {
          totalValue += Number(opp.amount) || 0;
          if (opp.workType) workTypesDone.add(opp.workType);
        }
        wrapper.lifetimeValue = totalValue;
        wrapper.workTypesDone = Array.from(workTypesDone);

        // Upsell opportunities
        const upsellOpps = new Set(ALL_WORK_TYPES);
        for (const wt of workTypesDone) upsellOpps.delete(wt);
        wrapper.upsellOpportunities = Array.from(upsellOpps);
        wrapper.hasUpsellPotential = upsellOpps.size > 0;

        wrapper.prospectScore = this.calculateProspectScore(wrapper);
        wrapper.prospectStatusClass = this.getProspectStatusClass(wrapper);
      }

      return wrapper;
    });

    return {
      data: enrichedContacts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  /**
   * Enrich contacts with prospecting data from opportunities
   */
  async enrichContactsWithProspecting(contacts) {
    if (contacts.length === 0) return [];

    const contactIds = contacts.map((c) => c.id);
    const accountIds = contacts.map((c) => c.accountId).filter(Boolean);

    // Bulk query closed won opportunities
    const opportunities = await prisma.opportunity.findMany({
      where: {
        OR: [
          { contactId: { in: contactIds } },
          { accountId: { in: accountIds } },
        ],
        stage: 'CLOSED_WON',
      },
      orderBy: { closeDate: 'desc' },
      select: {
        id: true,
        contactId: true,
        accountId: true,
        closeDate: true,
        amount: true,
        workType: true,
      },
    });

    // Build maps
    const contactOppsMap = new Map();
    const accountOppsMap = new Map();

    for (const opp of opportunities) {
      if (opp.contactId && contactIds.includes(opp.contactId)) {
        if (!contactOppsMap.has(opp.contactId)) {
          contactOppsMap.set(opp.contactId, []);
        }
        contactOppsMap.get(opp.contactId).push(opp);
      }
      if (opp.accountId && accountIds.includes(opp.accountId)) {
        if (!accountOppsMap.has(opp.accountId)) {
          accountOppsMap.set(opp.accountId, []);
        }
        accountOppsMap.get(opp.accountId).push(opp);
      }
    }

    return contacts.map((contact) => {
      const wrapper = this.createContactWrapper(contact);

      // Get relevant opportunities
      const relevantOpps = [];
      const seenOppIds = new Set();

      if (contactOppsMap.has(contact.id)) {
        for (const opp of contactOppsMap.get(contact.id)) {
          relevantOpps.push(opp);
          seenOppIds.add(opp.id);
        }
      }

      if (contact.accountId && accountOppsMap.has(contact.accountId)) {
        for (const opp of accountOppsMap.get(contact.accountId)) {
          if (!seenOppIds.has(opp.id)) {
            relevantOpps.push(opp);
          }
        }
      }

      if (relevantOpps.length > 0) {
        wrapper.isPastCustomer = true;
        wrapper.totalJobCount = relevantOpps.length;

        const lastJob = relevantOpps[0];
        wrapper.lastJobDate = lastJob.closeDate;
        wrapper.lastJobWorkType = lastJob.workType;
        wrapper.lastJobAmount = Number(lastJob.amount) || 0;

        if (lastJob.closeDate) {
          wrapper.daysSinceLastJob = Math.floor(
            (Date.now() - new Date(lastJob.closeDate).getTime()) / (1000 * 60 * 60 * 24)
          );
        }

        let totalValue = 0;
        const workTypesDone = new Set();
        for (const opp of relevantOpps) {
          totalValue += Number(opp.amount) || 0;
          if (opp.workType) workTypesDone.add(opp.workType);
        }
        wrapper.lifetimeValue = totalValue;
        wrapper.workTypesDone = Array.from(workTypesDone);

        const upsellOpps = new Set(ALL_WORK_TYPES);
        for (const wt of workTypesDone) upsellOpps.delete(wt);
        wrapper.upsellOpportunities = Array.from(upsellOpps);
        wrapper.hasUpsellPotential = upsellOpps.size > 0;

        wrapper.prospectScore = this.calculateProspectScore(wrapper);
        wrapper.prospectStatusClass = this.getProspectStatusClass(wrapper);
      } else {
        wrapper.isPastCustomer = false;
        wrapper.totalJobCount = 0;
        wrapper.lifetimeValue = 0;
        wrapper.workTypesDone = [];
        wrapper.upsellOpportunities = Array.from(ALL_WORK_TYPES);
        wrapper.hasUpsellPotential = true;
        wrapper.prospectScore = 0;
        wrapper.prospectStatusClass = 'prospect-new';
      }

      return wrapper;
    });
  }

  /**
   * Create contact wrapper object
   */
  createContactWrapper(contact) {
    return {
      id: contact.id,
      name: contact.fullName || `${contact.firstName} ${contact.lastName}`,
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email,
      phone: contact.mobilePhone || contact.phone,
      smsNumber: contact.smsNumber,
      title: contact.title,
      accountId: contact.accountId,
      accountName: contact.account?.name,
      accountLocation: this.formatLocation(contact.account?.billingCity, contact.account?.billingState),
      createdAt: contact.createdAt,
      // Prospecting fields (set later)
      isPastCustomer: false,
      totalJobCount: 0,
      lastJobDate: null,
      lastJobWorkType: null,
      lastJobAmount: 0,
      daysSinceLastJob: null,
      lifetimeValue: 0,
      workTypesDone: [],
      upsellOpportunities: [],
      hasUpsellPotential: false,
      prospectScore: 0,
      prospectStatusClass: 'prospect-new',
    };
  }

  /**
   * Calculate prospect score based on multiple factors
   * Replicates: calculateProspectScore()
   */
  calculateProspectScore(wrapper) {
    let score = 50; // Base score for past customer

    // Recency bonus (0-20 points)
    if (wrapper.daysSinceLastJob !== null) {
      if (wrapper.daysSinceLastJob <= 30) score += 20;
      else if (wrapper.daysSinceLastJob <= 90) score += 15;
      else if (wrapper.daysSinceLastJob <= 180) score += 10;
      else if (wrapper.daysSinceLastJob <= 365) score += 5;
    }

    // Lifetime value bonus (0-15 points)
    if (wrapper.lifetimeValue >= 50000) score += 15;
    else if (wrapper.lifetimeValue >= 25000) score += 10;
    else if (wrapper.lifetimeValue >= 10000) score += 5;

    // Multiple jobs bonus (0-10 points)
    if (wrapper.totalJobCount > 1) {
      score += Math.min(wrapper.totalJobCount * 2, 10);
    }

    // Upsell potential bonus (0-5 points)
    if (wrapper.hasUpsellPotential) score += 5;

    return Math.min(score, 100);
  }

  /**
   * Get CSS class for prospect status styling
   */
  getProspectStatusClass(wrapper) {
    if (wrapper.daysSinceLastJob !== null && wrapper.daysSinceLastJob <= 30) {
      return 'prospect-recent';
    } else if (wrapper.prospectScore >= 80) {
      return 'prospect-hot';
    } else if (wrapper.prospectScore >= 60) {
      return 'prospect-warm';
    } else if (wrapper.isPastCustomer) {
      return 'prospect-past';
    }
    return 'prospect-cold';
  }

  /**
   * Format location string
   */
  formatLocation(city, state) {
    if (!city && !state) return '';
    if (!city) return state;
    if (!state) return city;
    return `${city}, ${state}`;
  }

  /**
   * Get Opportunities related to this Contact
   * Replicates: getContactOpportunities()
   */
  async getContactOpportunities(contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { accountId: true },
    });

    if (!contact) {
      const error = new Error(`Contact not found: ${contactId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    const where = {
      OR: [{ contactId }],
    };

    if (contact.accountId) {
      where.OR.push({ accountId: contact.accountId });
    }

    const opportunities = await prisma.opportunity.findMany({
      where,
      orderBy: { closeDate: 'desc' },
      take: 50,
      include: {
        account: { select: { name: true } },
        owner: { select: { firstName: true, lastName: true } },
      },
    });

    return opportunities.map((opp) => ({
      id: opp.id,
      name: opp.name,
      stageName: opp.stage,
      amount: opp.amount,
      closeDate: opp.closeDate,
      accountName: opp.account?.name,
      ownerName: opp.owner ? `${opp.owner.firstName} ${opp.owner.lastName}` : null,
      type: opp.type,
      isPrimaryContact: opp.contactId === contactId,
      stageClass: this.getStageClass(opp.stage),
    }));
  }

  /**
   * Get Cases related to this Contact
   */
  async getContactCases(contactId) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { accountId: true },
    });

    if (!contact || !contact.accountId) return [];

    const cases = await prisma.case.findMany({
      where: { accountId: contact.accountId },
      orderBy: { createdAt: 'desc' },
      take: 25,
    });

    return cases.map((c) => ({
      id: c.id,
      caseNumber: c.caseNumber,
      subject: c.subject,
      status: c.status,
      priority: c.priority,
      type: c.type,
      createdAt: c.createdAt,
      closedAt: c.closedAt,
      statusClass: this.getStatusClass(c.status),
      priorityClass: this.getPriorityClass(c.priority),
    }));
  }

  /**
   * Get review-eligible contacts (closed jobs in last 30 days)
   * Replicates: getReviewEligibleContacts()
   */
  async getReviewEligibleContacts(limitSize = 50) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentOpps = await prisma.opportunity.findMany({
      where: {
        stage: 'CLOSED_WON',
        closeDate: { gte: thirtyDaysAgo },
        contactId: { not: null },
      },
      orderBy: { closeDate: 'desc' },
      take: limitSize,
      include: {
        contact: {
          include: {
            account: {
              select: { name: true, billingCity: true, billingState: true },
            },
          },
        },
      },
    });

    const seenContactIds = new Set();
    const results = [];

    for (const opp of recentOpps) {
      if (!seenContactIds.has(opp.contactId) && opp.contact) {
        seenContactIds.add(opp.contactId);
        results.push({
          ...this.createContactWrapper(opp.contact),
          isPastCustomer: true,
          lastJobDate: opp.closeDate,
          lastJobWorkType: opp.workType,
          lastJobAmount: Number(opp.amount) || 0,
          daysSinceLastJob: Math.floor(
            (Date.now() - new Date(opp.closeDate).getTime()) / (1000 * 60 * 60 * 24)
          ),
          prospectStatusClass: 'prospect-review-eligible',
        });
      }
    }

    return results;
  }

  /**
   * Create a new contact
   */
  async createContact(data) {
    const contact = await prisma.contact.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        fullName: `${data.firstName} ${data.lastName}`,
        email: data.email,
        phone: data.phone,
        mobilePhone: data.mobilePhone,
        smsNumber: this.formatPhoneE164(data.mobilePhone || data.phone),
        mailingStreet: data.mailingStreet,
        mailingCity: data.mailingCity,
        mailingState: data.mailingState,
        mailingPostalCode: data.mailingPostalCode,
        title: data.title,
        department: data.department,
        accountId: data.accountId,
        isPrimary: data.isPrimary || false,
        salesforceId: data.salesforceId,
      },
      include: {
        account: { select: { id: true, name: true } },
      },
    });

    logger.info(`Contact created: ${contact.id} (${contact.fullName})`);
    return contact;
  }

  /**
   * Update a contact
   */
  async updateContact(id, data) {
    const contact = await prisma.contact.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        fullName: data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : undefined,
        email: data.email,
        phone: data.phone,
        mobilePhone: data.mobilePhone,
        smsNumber: data.mobilePhone || data.phone ? this.formatPhoneE164(data.mobilePhone || data.phone) : undefined,
        mailingStreet: data.mailingStreet,
        mailingCity: data.mailingCity,
        mailingState: data.mailingState,
        mailingPostalCode: data.mailingPostalCode,
        title: data.title,
        department: data.department,
        accountId: data.accountId,
        isPrimary: data.isPrimary,
        smsOptOut: data.smsOptOut,
        emailOptOut: data.emailOptOut,
        doNotCall: data.doNotCall,
      },
      include: {
        account: { select: { id: true, name: true } },
      },
    });

    logger.info(`Contact updated: ${id}`);
    return contact;
  }

  /**
   * Delete a contact
   */
  async deleteContact(id) {
    await prisma.contact.delete({ where: { id } });
    logger.info(`Contact deleted: ${id}`);
    return { deleted: true };
  }

  /**
   * Format phone to E.164
   */
  formatPhoneE164(phone) {
    if (!phone) return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return null;
  }

  // Helper methods for CSS classes
  getStageClass(stage) {
    if (!stage) return 'stage-default';
    if (stage === 'CLOSED_WON') return 'stage-won';
    if (stage === 'CLOSED_LOST') return 'stage-lost';
    return 'stage-default';
  }

  getStatusClass(status) {
    if (!status) return 'status-default';
    if (status === 'CLOSED') return 'status-closed';
    if (status === 'ESCALATED') return 'status-escalated';
    if (status === 'NEW') return 'status-new';
    return 'status-default';
  }

  getPriorityClass(priority) {
    if (!priority) return 'priority-default';
    if (priority === 'HIGH') return 'priority-high';
    if (priority === 'CRITICAL') return 'priority-critical';
    if (priority === 'LOW') return 'priority-low';
    return 'priority-default';
  }

  // Bulk reassign contacts to a new account
  async bulkReassignAccount(contactIds, newAccountId) {
    logger.info(`Bulk reassigning ${contactIds.length} contacts to account ${newAccountId}`);

    const result = await prisma.contact.updateMany({
      where: { id: { in: contactIds } },
      data: { accountId: newAccountId, updatedAt: new Date() },
    });

    logger.info(`Bulk reassign complete: ${result.count} contacts updated`);
    return { count: result.count };
  }

  // Bulk delete contacts (soft delete - set deletedAt timestamp)
  async bulkDelete(contactIds, auditContext = {}) {
    logger.info(`Bulk soft-deleting ${contactIds.length} contacts`);

    const results = {
      total: contactIds.length,
      success: [],
      failed: [],
    };

    // Process each contact to capture audit data
    for (const contactId of contactIds) {
      try {
        // Get the contact before deletion
        const oldContact = await prisma.contact.findUnique({
          where: { id: contactId },
          select: { id: true, firstName: true, lastName: true },
        });

        if (!oldContact) {
          results.failed.push({ id: contactId, error: 'Contact not found' });
          continue;
        }

        // Soft delete by setting deletedAt timestamp
        await prisma.contact.update({
          where: { id: contactId },
          data: { deletedAt: new Date(), updatedAt: new Date() },
        });

        // Log audit
        await logAudit({
          tableName: 'contacts',
          recordId: contactId,
          action: 'BULK_DELETE',
          oldValues: { deletedAt: null },
          newValues: { deletedAt: new Date() },
          userId: auditContext.userId,
          userEmail: auditContext.userEmail,
          source: 'api',
        });

        results.success.push(contactId);
        logger.info(`Soft deleted contact: ${oldContact.firstName} ${oldContact.lastName}`);
      } catch (error) {
        logger.error(`Failed to delete contact ${contactId}:`, error);
        results.failed.push({ id: contactId, error: error.message });
      }
    }

    logger.info(`Bulk delete complete: ${results.success.length}/${results.total} contacts soft-deleted`);
    return {
      count: results.success.length,
      results,
    };
  }

  // Get deleted contacts for admin restore page
  async getDeletedContacts(options = {}) {
    const { page = 1, limit = 50, search } = options;
    const skip = (page - 1) * limit;

    const where = { deletedAt: { not: null } };

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { deletedAt: 'desc' },
        include: {
          account: { select: { id: true, name: true } },
        },
      }),
      prisma.contact.count({ where }),
    ]);

    return {
      data: contacts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  // Restore a soft-deleted contact
  async restoreContact(id) {
    logger.info(`Restoring contact: ${id}`);

    const contact = await prisma.contact.findUnique({ where: { id } });
    if (!contact) {
      const error = new Error(`Contact not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }
    if (!contact.deletedAt) {
      const error = new Error('Contact is not deleted');
      error.name = 'ValidationError';
      throw error;
    }

    const restored = await prisma.contact.update({
      where: { id },
      data: { deletedAt: null, updatedAt: new Date() },
    });

    logger.info(`Contact restored: ${id}`);
    return restored;
  }

  // Bulk update opt-out status
  async bulkUpdateOptOut(contactIds, field, value) {
    logger.info(`Bulk updating opt-out ${field}=${value} for ${contactIds.length} contacts`);

    const updateData = { updatedAt: new Date() };
    if (field === 'sms') updateData.smsOptOut = value;
    else if (field === 'email') updateData.emailOptOut = value;
    else if (field === 'doNotCall') updateData.doNotCall = value;

    const result = await prisma.contact.updateMany({
      where: { id: { in: contactIds } },
      data: updateData,
    });

    logger.info(`Bulk opt-out update complete: ${result.count} contacts updated`);
    return { count: result.count };
  }
}

export const contactService = new ContactService();
export default contactService;
