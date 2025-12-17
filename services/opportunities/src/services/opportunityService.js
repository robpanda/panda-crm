// Opportunity Service - Business Logic Layer
// Replicates SalesLeaderOpportunityDetailController.cls and related controllers
// This is the HUB - Opportunity is the central object in Panda CRM
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

class OpportunityService {
  /**
   * Get opportunities with filtering and pagination
   * Replicates: SalesLeaderOpportunityListController.getOpportunities()
   */
  async getOpportunities(options = {}) {
    const {
      page = 1,
      limit = 50,
      stage,
      type,
      ownerId,
      ownerFilter,
      accountId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      currentUserId,
    } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};

    if (stage && stage !== 'all') {
      where.stage = stage;
    }

    if (type && type !== 'all') {
      where.type = type;
    }

    if (ownerFilter === 'mine' && currentUserId) {
      where.ownerId = currentUserId;
    } else if (ownerId) {
      where.ownerId = ownerId;
    }

    if (accountId) {
      where.accountId = accountId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { account: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          account: {
            select: { id: true, name: true, billingCity: true, billingState: true },
          },
          contact: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          owner: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: {
            select: { quotes: true, workOrders: true },
          },
        },
      }),
      prisma.opportunity.count({ where }),
    ]);

    // Transform to wrappers
    const wrappers = opportunities.map((opp) => this.createOpportunityWrapper(opp));

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
   * Get opportunity details (the HUB view)
   * Replicates: getOpportunityDetails()
   */
  async getOpportunityDetails(id) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      include: {
        account: true,
        contact: true,
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        quotes: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            lineItems: {
              include: { product: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        serviceContract: true,
        commissions: {
          include: {
            owner: { select: { firstName: true, lastName: true } },
          },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            createdBy: { select: { firstName: true, lastName: true } },
          },
        },
        tasks: {
          orderBy: { dueDate: 'asc' },
          include: {
            assignedTo: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    return this.createOpportunityWrapper(opportunity, true);
  }

  /**
   * Get work orders and service appointments for the opportunity
   * Replicates: getOpportunityWorkOrders()
   */
  async getOpportunityWorkOrders(id) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      select: { accountId: true },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    const workOrders = await prisma.workOrder.findMany({
      where: {
        OR: [
          { opportunityId: id },
          { accountId: opportunity.accountId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        workType: true,
        territory: true,
        serviceAppointments: {
          orderBy: { scheduledStart: 'asc' },
          include: {
            assignedResources: {
              include: {
                serviceResource: true,
              },
            },
          },
        },
      },
    });

    return workOrders.map((wo) => ({
      id: wo.id,
      workOrderNumber: wo.workOrderNumber,
      subject: wo.subject,
      status: wo.status,
      priority: wo.priority,
      description: wo.description,
      startDate: wo.startDate,
      endDate: wo.endDate,
      workTypeName: wo.workType?.name,
      territoryName: wo.territory?.name,
      createdAt: wo.createdAt,
      serviceAppointments: wo.serviceAppointments.map((sa) => ({
        id: sa.id,
        appointmentNumber: sa.appointmentNumber,
        status: sa.status,
        scheduledStart: sa.scheduledStart,
        scheduledEnd: sa.scheduledEnd,
        actualStart: sa.actualStart,
        actualEnd: sa.actualEnd,
        duration: sa.duration,
        assignedResources: sa.assignedResources.map((ar) => ({
          id: ar.serviceResource.id,
          name: ar.serviceResource.name,
          isPrimary: ar.isPrimaryResource,
        })),
      })),
    }));
  }

  /**
   * Get quotes for the opportunity
   * Replicates: getOpportunityQuotes()
   */
  async getOpportunityQuotes(id) {
    const quotes = await prisma.quote.findMany({
      where: { opportunityId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: {
        lineItems: {
          include: { product: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    return quotes.map((q) => ({
      id: q.id,
      quoteNumber: q.quoteNumber,
      name: q.name,
      status: q.status,
      total: q.total,
      subtotal: q.subtotal,
      discount: q.discount,
      tax: q.tax,
      expirationDate: q.expirationDate,
      isPmQuote: q.isPmQuote,
      createdAt: q.createdAt,
      lineItems: q.lineItems.map((li) => ({
        id: li.id,
        productName: li.product?.name,
        description: li.description,
        quantity: li.quantity,
        unitPrice: li.unitPrice,
        totalPrice: li.totalPrice,
      })),
    }));
  }

  /**
   * Get contacts for the opportunity
   */
  async getOpportunityContacts(id) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      select: { contactId: true, accountId: true },
    });

    if (!opportunity) return [];

    const contacts = await prisma.contact.findMany({
      where: { accountId: opportunity.accountId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return contacts.map((c) => ({
      id: c.id,
      name: c.fullName || `${c.firstName} ${c.lastName}`,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      mobilePhone: c.mobilePhone,
      title: c.title,
      isPrimary: c.isPrimary,
      isPrimaryContact: c.id === opportunity.contactId,
    }));
  }

  /**
   * Get stage counts for dashboard
   */
  async getStageCounts(currentUserId, ownerFilter) {
    const where = {};
    if (ownerFilter === 'mine' && currentUserId) {
      where.ownerId = currentUserId;
    }

    const counts = await prisma.opportunity.groupBy({
      by: ['stage'],
      where,
      _count: { id: true },
      _sum: { amount: true },
    });

    const result = { total: 0, totalAmount: 0 };
    for (const item of counts) {
      result[item.stage] = {
        count: item._count.id,
        amount: Number(item._sum.amount) || 0,
      };
      result.total += item._count.id;
      result.totalAmount += Number(item._sum.amount) || 0;
    }

    return result;
  }

  /**
   * Create new opportunity
   */
  async createOpportunity(data) {
    const opportunity = await prisma.opportunity.create({
      data: {
        name: data.name,
        description: data.description,
        stage: data.stage || 'LEAD_UNASSIGNED',
        status: data.status,
        probability: data.probability || 0,
        closeDate: data.closeDate ? new Date(data.closeDate) : null,
        appointmentDate: data.appointmentDate ? new Date(data.appointmentDate) : null,
        amount: data.amount,
        contractTotal: data.contractTotal,
        type: data.type || 'INSURANCE',
        workType: data.workType,
        leadSource: data.leadSource,
        isSelfGen: data.isSelfGen || false,
        isPandaClaims: data.isPandaClaims || false,
        isApproved: data.isApproved || false,
        claimNumber: data.claimNumber,
        claimFiledDate: data.claimFiledDate ? new Date(data.claimFiledDate) : null,
        insuranceCarrier: data.insuranceCarrier,
        rcvAmount: data.rcvAmount,
        acvAmount: data.acvAmount,
        deductible: data.deductible,
        supplementsTotal: data.supplementsTotal,
        accountId: data.accountId,
        contactId: data.contactId,
        ownerId: data.ownerId,
        salesforceId: data.salesforceId,
      },
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    logger.info(`Opportunity created: ${opportunity.id} (${opportunity.name})`);
    return this.createOpportunityWrapper(opportunity);
  }

  /**
   * Update opportunity
   */
  async updateOpportunity(id, data) {
    const opportunity = await prisma.opportunity.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        stage: data.stage,
        status: data.status,
        probability: data.probability,
        closeDate: data.closeDate ? new Date(data.closeDate) : undefined,
        appointmentDate: data.appointmentDate ? new Date(data.appointmentDate) : undefined,
        soldDate: data.soldDate ? new Date(data.soldDate) : undefined,
        amount: data.amount,
        contractTotal: data.contractTotal,
        type: data.type,
        workType: data.workType,
        leadSource: data.leadSource,
        isSelfGen: data.isSelfGen,
        isPandaClaims: data.isPandaClaims,
        isApproved: data.isApproved,
        claimNumber: data.claimNumber,
        claimFiledDate: data.claimFiledDate ? new Date(data.claimFiledDate) : undefined,
        insuranceCarrier: data.insuranceCarrier,
        rcvAmount: data.rcvAmount,
        acvAmount: data.acvAmount,
        deductible: data.deductible,
        supplementsTotal: data.supplementsTotal,
        accountId: data.accountId,
        contactId: data.contactId,
        ownerId: data.ownerId,
      },
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    logger.info(`Opportunity updated: ${id}`);
    return this.createOpportunityWrapper(opportunity);
  }

  /**
   * Delete opportunity
   */
  async deleteOpportunity(id) {
    await prisma.opportunity.delete({ where: { id } });
    logger.info(`Opportunity deleted: ${id}`);
    return { deleted: true };
  }

  /**
   * Create opportunity wrapper with computed fields
   */
  createOpportunityWrapper(opp, includeDetails = false) {
    const wrapper = {
      id: opp.id,
      name: opp.name,
      description: opp.description,
      stage: opp.stage,
      stageName: this.formatStageName(opp.stage),
      status: opp.status,
      probability: opp.probability,
      closeDate: opp.closeDate,
      appointmentDate: opp.appointmentDate,
      soldDate: opp.soldDate,
      amount: opp.amount ? Number(opp.amount) : null,
      contractTotal: opp.contractTotal ? Number(opp.contractTotal) : null,
      type: opp.type,
      workType: opp.workType,
      leadSource: opp.leadSource,
      isSelfGen: opp.isSelfGen,
      isPandaClaims: opp.isPandaClaims,
      isApproved: opp.isApproved,
      isClosed: ['CLOSED_WON', 'CLOSED_LOST'].includes(opp.stage),
      isWon: opp.stage === 'CLOSED_WON',
      // Account
      accountId: opp.accountId,
      accountName: opp.account?.name,
      accountLocation: opp.account ? `${opp.account.billingCity || ''}, ${opp.account.billingState || ''}`.replace(/^, |, $/, '') : '',
      // Contact
      contactId: opp.contactId,
      contactName: opp.contact ? `${opp.contact.firstName} ${opp.contact.lastName}` : null,
      contactPhone: opp.contact?.phone,
      contactEmail: opp.contact?.email,
      // Owner
      ownerId: opp.ownerId,
      ownerName: opp.owner ? `${opp.owner.firstName} ${opp.owner.lastName}` : 'Unassigned',
      // Timestamps
      createdAt: opp.createdAt,
      updatedAt: opp.updatedAt,
      // Counts
      quoteCount: opp._count?.quotes,
      workOrderCount: opp._count?.workOrders,
      // Styling
      stageClass: this.getStageClass(opp.stage),
      typeClass: this.getTypeClass(opp.type),
    };

    // Insurance fields
    if (opp.type === 'INSURANCE') {
      wrapper.claimNumber = opp.claimNumber;
      wrapper.claimFiledDate = opp.claimFiledDate;
      wrapper.insuranceCarrier = opp.insuranceCarrier;
      wrapper.rcvAmount = opp.rcvAmount ? Number(opp.rcvAmount) : null;
      wrapper.acvAmount = opp.acvAmount ? Number(opp.acvAmount) : null;
      wrapper.deductible = opp.deductible ? Number(opp.deductible) : null;
      wrapper.supplementsTotal = opp.supplementsTotal ? Number(opp.supplementsTotal) : null;
    }

    // Include related records for detail view
    if (includeDetails) {
      wrapper.account = opp.account;
      wrapper.contact = opp.contact;
      wrapper.quotes = opp.quotes;
      wrapper.orders = opp.orders;
      wrapper.serviceContract = opp.serviceContract;
      wrapper.commissions = opp.commissions;
      wrapper.notes = opp.notes;
      wrapper.tasks = opp.tasks;
    }

    return wrapper;
  }

  /**
   * Format stage name for display
   */
  formatStageName(stage) {
    if (!stage) return 'Unknown';
    return stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Get CSS class for stage
   */
  getStageClass(stage) {
    if (!stage) return 'stage-default';
    if (stage === 'CLOSED_WON') return 'stage-won';
    if (stage === 'CLOSED_LOST') return 'stage-lost';
    if (stage.includes('LEAD')) return 'stage-lead';
    if (stage.includes('APPROVED') || stage.includes('CONTRACT')) return 'stage-active';
    if (stage.includes('PRODUCTION') || stage.includes('COMPLETED')) return 'stage-production';
    return 'stage-default';
  }

  /**
   * Get CSS class for type
   */
  getTypeClass(type) {
    if (!type) return 'type-default';
    if (type === 'INSURANCE') return 'type-insurance';
    if (type === 'RETAIL') return 'type-retail';
    if (type === 'COMMERCIAL') return 'type-commercial';
    return 'type-default';
  }
}

export const opportunityService = new OpportunityService();
export default opportunityService;
