// Lead Service - Business Logic Layer
// Replicates SalesLeaderLeadListController.cls and LeadWizard functionality
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

class LeadService {
  /**
   * Get leads with filtering and pagination
   * Replicates: getLeads()
   */
  async getLeads(options = {}) {
    const {
      page = 1,
      limit = 50,
      status,
      ownerId,
      ownerFilter, // 'mine' or 'all'
      source,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      currentUserId,
    } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = { isConverted: false };

    if (status && status !== 'all') {
      where.status = status;
    }

    if (ownerFilter === 'mine' && currentUserId) {
      where.ownerId = currentUserId;
    } else if (ownerId) {
      where.ownerId = ownerId;
    }

    if (source && source !== 'all') {
      where.source = source;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { mobilePhone: { contains: search } },
        { company: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          owner: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.lead.count({ where }),
    ]);

    // Transform leads to wrappers with computed fields
    const wrappers = leads.map((lead) => this.createLeadWrapper(lead));

    return {
      data: wrappers,
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
   * Get lead counts by status and filters
   * Replicates: getLeadCounts()
   */
  async getLeadCounts(currentUserId) {
    const counts = {};

    // Total unconverted leads
    counts.total = await prisma.lead.count({
      where: { isConverted: false },
    });

    // My leads
    if (currentUserId) {
      counts.mine = await prisma.lead.count({
        where: { isConverted: false, ownerId: currentUserId },
      });
    }

    // By status
    const statusCounts = await prisma.lead.groupBy({
      by: ['status'],
      where: { isConverted: false },
      _count: { id: true },
    });

    for (const item of statusCounts) {
      if (item.status) {
        counts[item.status] = item._count.id;
      }
    }

    return counts;
  }

  /**
   * Get available lead statuses
   */
  getLeadStatuses() {
    return [
      { value: 'NEW', label: 'New' },
      { value: 'CONTACTED', label: 'Contacted' },
      { value: 'QUALIFIED', label: 'Qualified' },
      { value: 'UNQUALIFIED', label: 'Unqualified' },
      { value: 'NURTURING', label: 'Nurturing' },
      { value: 'CONVERTED', label: 'Converted' },
    ];
  }

  /**
   * Get lead sources
   */
  getLeadSources() {
    return [
      { value: 'Web', label: 'Web' },
      { value: 'Phone Inquiry', label: 'Phone Inquiry' },
      { value: 'Partner Referral', label: 'Partner Referral' },
      { value: 'Purchased List', label: 'Purchased List' },
      { value: 'Door Knock', label: 'Door Knock' },
      { value: 'Self-Gen', label: 'Self-Gen' },
      { value: 'Marketing Campaign', label: 'Marketing Campaign' },
      { value: 'Trade Show', label: 'Trade Show' },
      { value: 'Employee Referral', label: 'Employee Referral' },
      { value: 'Customer Referral', label: 'Customer Referral' },
      { value: 'Social Media', label: 'Social Media' },
      { value: 'Other', label: 'Other' },
    ];
  }

  /**
   * Get single lead by ID
   */
  async getLeadById(id) {
    const lead = await prisma.lead.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            createdBy: { select: { firstName: true, lastName: true } },
          },
        },
        tasks: {
          orderBy: { dueDate: 'asc' },
          where: { status: { not: 'COMPLETED' } },
          take: 5,
        },
      },
    });

    if (!lead) {
      const error = new Error(`Lead not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    return this.createLeadWrapper(lead);
  }

  /**
   * Create new lead
   */
  async createLead(data) {
    const lead = await prisma.lead.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        mobilePhone: data.mobilePhone,
        company: data.company,
        street: data.street,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        status: data.status || 'NEW',
        source: data.source,
        rating: data.rating,
        industry: data.industry,
        ownerId: data.ownerId,
        isSelfGen: data.isSelfGen || false,
        selfGenRepId: data.selfGenRepId,
        salesforceId: data.salesforceId,
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    logger.info(`Lead created: ${lead.id} (${lead.firstName} ${lead.lastName})`);
    return this.createLeadWrapper(lead);
  }

  /**
   * Update lead
   */
  async updateLead(id, data) {
    const lead = await prisma.lead.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        mobilePhone: data.mobilePhone,
        company: data.company,
        street: data.street,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        status: data.status,
        source: data.source,
        rating: data.rating,
        industry: data.industry,
        ownerId: data.ownerId,
        score: data.score,
      },
      include: {
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    logger.info(`Lead updated: ${id}`);
    return this.createLeadWrapper(lead);
  }

  /**
   * Convert lead to Account, Contact, and Opportunity
   */
  async convertLead(id, options = {}) {
    const lead = await prisma.lead.findUnique({ where: { id } });

    if (!lead) {
      const error = new Error(`Lead not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    if (lead.isConverted) {
      const error = new Error('Lead has already been converted');
      error.name = 'ValidationError';
      throw error;
    }

    // Use transaction for conversion
    const result = await prisma.$transaction(async (tx) => {
      // Create Account
      const account = await tx.account.create({
        data: {
          name: options.accountName || lead.company || `${lead.firstName} ${lead.lastName}`,
          billingStreet: lead.street,
          billingCity: lead.city,
          billingState: lead.state,
          billingPostalCode: lead.postalCode,
          phone: lead.phone,
          email: lead.email,
          type: 'RESIDENTIAL',
          status: 'NEW',
          ownerId: lead.ownerId,
        },
      });

      // Create Contact
      const contact = await tx.contact.create({
        data: {
          firstName: lead.firstName,
          lastName: lead.lastName,
          fullName: `${lead.firstName} ${lead.lastName}`,
          email: lead.email,
          phone: lead.phone,
          mobilePhone: lead.mobilePhone,
          mailingStreet: lead.street,
          mailingCity: lead.city,
          mailingState: lead.state,
          mailingPostalCode: lead.postalCode,
          accountId: account.id,
          isPrimary: true,
        },
      });

      // Create Opportunity if requested
      let opportunity = null;
      if (options.createOpportunity !== false) {
        opportunity = await tx.opportunity.create({
          data: {
            name: options.opportunityName || `${lead.firstName} ${lead.lastName} - ${new Date().toLocaleDateString()}`,
            accountId: account.id,
            contactId: contact.id,
            stage: 'LEAD_ASSIGNED',
            type: options.opportunityType || 'INSURANCE',
            leadSource: lead.source,
            isSelfGen: lead.isSelfGen,
            ownerId: lead.ownerId,
            closeDate: options.closeDate ? new Date(options.closeDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          },
        });
      }

      // Update lead as converted
      await tx.lead.update({
        where: { id },
        data: {
          isConverted: true,
          convertedDate: new Date(),
          convertedAccountId: account.id,
          convertedContactId: contact.id,
          convertedOpportunityId: opportunity?.id,
        },
      });

      return { account, contact, opportunity };
    });

    logger.info(`Lead converted: ${id} -> Account: ${result.account.id}, Contact: ${result.contact.id}, Opportunity: ${result.opportunity?.id}`);
    return result;
  }

  /**
   * Delete lead
   */
  async deleteLead(id) {
    await prisma.lead.delete({ where: { id } });
    logger.info(`Lead deleted: ${id}`);
    return { deleted: true };
  }

  /**
   * Create lead wrapper with computed fields
   */
  createLeadWrapper(lead) {
    const wrapper = {
      id: lead.id,
      name: `${lead.firstName} ${lead.lastName}`,
      firstName: lead.firstName,
      lastName: lead.lastName,
      status: lead.status,
      source: lead.source,
      phone: lead.phone,
      email: lead.email,
      company: lead.company,
      title: lead.title,
      mobilePhone: lead.mobilePhone,
      createdAt: lead.createdAt,
      updatedAt: lead.updatedAt,
      ownerId: lead.ownerId,
      ownerName: lead.owner ? `${lead.owner.firstName} ${lead.owner.lastName}` : 'Unassigned',
      city: lead.city,
      state: lead.state,
      rating: lead.rating,
      industry: lead.industry,
      score: lead.score,
      isSelfGen: lead.isSelfGen,
      isConverted: lead.isConverted,
      formattedPhone: lead.mobilePhone || lead.phone,
      statusClass: this.getStatusClass(lead.status),
      ratingClass: this.getRatingClass(lead.rating),
      daysOld: 0,
      daysOldLabel: 'Today',
    };

    // Calculate days old
    if (lead.createdAt) {
      const diffTime = Date.now() - new Date(lead.createdAt).getTime();
      const daysOld = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      wrapper.daysOld = daysOld;

      if (daysOld === 0) {
        wrapper.daysOldLabel = 'Today';
      } else if (daysOld === 1) {
        wrapper.daysOldLabel = '1 day';
      } else if (daysOld < 7) {
        wrapper.daysOldLabel = `${daysOld} days`;
      } else if (daysOld < 30) {
        const weeks = Math.floor(daysOld / 7);
        wrapper.daysOldLabel = `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
      } else {
        const months = Math.floor(daysOld / 30);
        wrapper.daysOldLabel = `${months} ${months === 1 ? 'month' : 'months'}`;
      }
    }

    return wrapper;
  }

  /**
   * Get CSS class for lead status
   */
  getStatusClass(status) {
    if (!status) return 'status-default';

    const statusLower = status.toLowerCase();
    if (statusLower.includes('new') || statusLower === 'open') return 'status-new';
    if (statusLower.includes('working') || statusLower.includes('contacted')) return 'status-working';
    if (statusLower.includes('qualified') || statusLower.includes('hot') || statusLower.includes('set')) return 'status-qualified';
    if (statusLower.includes('unqualified') || statusLower.includes('closed') || statusLower.includes('not set')) return 'status-closed';
    if (statusLower.includes('nurturing') || statusLower.includes('waiting')) return 'status-nurturing';
    if (statusLower.includes('assigned') || statusLower.includes('issued')) return 'status-assigned';
    return 'status-default';
  }

  /**
   * Get CSS class for lead rating
   */
  getRatingClass(rating) {
    if (!rating) return 'rating-none';

    const ratingLower = rating.toLowerCase();
    if (ratingLower === 'hot') return 'rating-hot';
    if (ratingLower === 'warm') return 'rating-warm';
    if (ratingLower === 'cold') return 'rating-cold';
    return 'rating-none';
  }
}

export const leadService = new LeadService();
export default leadService;
