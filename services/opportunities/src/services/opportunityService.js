// Opportunity Service - Business Logic Layer
// Replicates SalesLeaderOpportunityDetailController.cls and related controllers
// This is the HUB - Opportunity is the central object in Panda CRM
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

// Job ID starting number (first job ID will be YYYY-1000)
const JOB_ID_STARTING_NUMBER = 999;

// Lazy-load notification service to avoid circular dependencies
let notificationService = null;
async function getNotificationService() {
  if (!notificationService) {
    try {
      // The notification service runs on a separate port - call via HTTP
      // In production, this would be an internal service mesh call
      const NOTIFICATION_SERVICE_URL =
        process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3011';
      notificationService = {
        // Wrap notification methods to call via HTTP
        async notifyAppointmentBooked(inspectorId, appointment, opportunity, options) {
          return this._sendNotification('appointment-booked', {
            inspectorId,
            appointment,
            opportunity,
            options,
          });
        },
        async notifyAppointmentRescheduled(
          inspectorId,
          appointment,
          opportunity,
          previousTimes,
          options
        ) {
          return this._sendNotification('appointment-rescheduled', {
            inspectorId,
            appointment,
            opportunity,
            previousTimes,
            options,
          });
        },
        async notifyAppointmentCancelled(inspectorId, appointment, opportunity, reason, options) {
          return this._sendNotification('appointment-cancelled', {
            inspectorId,
            appointment,
            opportunity,
            reason,
            options,
          });
        },
        async getInspectorsForNotification(options) {
          try {
            const response = await fetch(`${NOTIFICATION_SERVICE_URL}/api/inspectors/for-notification`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(options),
            });
            if (!response.ok) return [];
            const data = await response.json();
            return data.inspectorIds || [];
          } catch (error) {
            logger.warn('Could not get inspectors for notification:', error.message);
            return [];
          }
        },
        async _sendNotification(type, payload) {
          try {
            const response = await fetch(`${NOTIFICATION_SERVICE_URL}/api/notifications/appointment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type, ...payload }),
            });
            if (!response.ok) {
              logger.warn(`Notification service returned ${response.status}`);
            }
            return response.ok;
          } catch (error) {
            // Log but don't fail the main operation if notifications fail
            logger.warn('Notification service unavailable:', error.message);
            return false;
          }
        },
      };
    } catch (error) {
      logger.warn('Failed to initialize notification service:', error.message);
      // Return a no-op service
      notificationService = {
        notifyAppointmentBooked: async () => false,
        notifyAppointmentRescheduled: async () => false,
        notifyAppointmentCancelled: async () => false,
        getInspectorsForNotification: async () => [],
      };
    }
  }
  return notificationService;
}

// Lazy-load onboarding triggers service
let onboardingTriggersService = null;
async function getOnboardingTriggers() {
  if (!onboardingTriggersService) {
    try {
      const WORKFLOWS_SERVICE_URL = process.env.WORKFLOWS_SERVICE_URL || 'http://localhost:3008';
      onboardingTriggersService = {
        async evaluate(opportunityId, previousState, currentState) {
          try {
            const response = await fetch(`${WORKFLOWS_SERVICE_URL}/api/workflows/triggers/onboarding/evaluate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ opportunityId, previousState, currentState }),
            });
            if (!response.ok) {
              logger.warn(`Onboarding triggers service returned ${response.status}`);
              return null;
            }
            const data = await response.json();
            return data.data;
          } catch (error) {
            logger.warn('Onboarding triggers service unavailable:', error.message);
            return null;
          }
        },
      };
    } catch (error) {
      logger.warn('Failed to initialize onboarding triggers service:', error.message);
      onboardingTriggersService = {
        evaluate: async () => null,
      };
    }
  }
  return onboardingTriggersService;
}

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
        lineItems: {
          orderBy: { sortOrder: 'asc' },
          include: { product: true },
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
        measurementReports: {
          orderBy: { createdAt: 'desc' },
          take: 5,
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
   * Get hub summary with counts of all related records
   * This powers the Opportunity Hub overview section
   */
  async getOpportunitySummary(id) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      include: {
        account: {
          select: { id: true, name: true, billingCity: true, billingState: true, phone: true },
        },
        contact: {
          select: { id: true, firstName: true, lastName: true, phone: true, email: true },
        },
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        serviceContract: {
          select: {
            id: true,
            contractNumber: true,
            status: true,
            contractTotal: true,
            paidAmount: true,
            balanceDue: true,
            collectedPercent: true,
          },
        },
        _count: {
          select: {
            quotes: true,
            workOrders: true,
            commissions: true,
            notes: true,
            tasks: true,
            lineItems: true,
            measurementReports: true,
          },
        },
        // Get the most recent measurement report for display (prioritize delivered, then by creation date)
        measurementReports: {
          orderBy: [
            { orderStatus: 'asc' }, // DELIVERED comes before ORDERED/PENDING alphabetically
            { createdAt: 'desc' },
          ],
          take: 1,
          select: {
            id: true,
            provider: true,
            reportType: true,
            orderStatus: true,
            orderNumber: true,
            orderedAt: true,
            reportPdfUrl: true,
            modelViewerUrl: true,
            designViewerUrl: true,
            totalRoofArea: true,
            totalRoofSquares: true,
            predominantPitch: true,
            suggestedWasteFactor: true,
            ridgeLength: true,
            hipLength: true,
            valleyLength: true,
            rakeLength: true,
            eaveLength: true,
            flashingLength: true,
            stepFlashingLength: true,
            dripEdgeLength: true,
            facets: true,
            deliveredAt: true,
          },
        },
      },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // Get additional counts that require separate queries
    const [appointmentCount, invoiceCount, agreementCount] = await Promise.all([
      // Count ServiceAppointments via WorkOrders
      prisma.serviceAppointment.count({
        where: {
          workOrder: { opportunityId: id },
        },
      }),
      // Count Invoices via Account (as Invoice doesn't directly link to Opportunity)
      prisma.invoice.count({
        where: { accountId: opportunity.accountId },
      }),
      // Count Agreements for this Opportunity
      prisma.agreement.count({
        where: { opportunityId: id },
      }),
    ]);

    return {
      id: opportunity.id,
      name: opportunity.name,
      stage: opportunity.stage,
      stageName: this.formatStageName(opportunity.stage),
      status: opportunity.status,
      type: opportunity.type,
      amount: opportunity.amount ? Number(opportunity.amount) : null,
      contractTotal: opportunity.contractTotal ? Number(opportunity.contractTotal) : null,
      closeDate: opportunity.closeDate,
      appointmentDate: opportunity.appointmentDate,
      soldDate: opportunity.soldDate,
      // Account
      account: opportunity.account,
      // Contact
      contact: opportunity.contact
        ? {
            ...opportunity.contact,
            fullName: `${opportunity.contact.firstName} ${opportunity.contact.lastName}`,
          }
        : null,
      // Owner
      owner: opportunity.owner
        ? {
            ...opportunity.owner,
            fullName: `${opportunity.owner.firstName} ${opportunity.owner.lastName}`,
          }
        : null,
      // Service Contract (financial summary)
      serviceContract: opportunity.serviceContract
        ? {
            ...opportunity.serviceContract,
            contractTotal: Number(opportunity.serviceContract.contractTotal),
            paidAmount: opportunity.serviceContract.paidAmount
              ? Number(opportunity.serviceContract.paidAmount)
              : 0,
            balanceDue: opportunity.serviceContract.balanceDue
              ? Number(opportunity.serviceContract.balanceDue)
              : 0,
            collectedPercent: opportunity.serviceContract.collectedPercent
              ? Number(opportunity.serviceContract.collectedPercent)
              : 0,
          }
        : null,
      // Counts for hub tabs
      counts: {
        quotes: opportunity._count.quotes,
        workOrders: opportunity._count.workOrders,
        appointments: appointmentCount,
        commissions: opportunity._count.commissions,
        invoices: invoiceCount,
        agreements: agreementCount,
        notes: opportunity._count.notes,
        tasks: opportunity._count.tasks,
        lineItems: opportunity._count.lineItems,
        measurementReports: opportunity._count.measurementReports,
      },
      // Most recent delivered measurement report
      measurementReport: opportunity.measurementReports?.[0] || null,
      // Insurance-specific fields
      isPandaClaims: opportunity.isPandaClaims,
      isApproved: opportunity.isApproved,
      claimNumber: opportunity.claimNumber,
      insuranceCarrier: opportunity.insuranceCarrier,
      rcvAmount: opportunity.rcvAmount ? Number(opportunity.rcvAmount) : null,
      deductible: opportunity.deductible ? Number(opportunity.deductible) : null,
    };
  }

  /**
   * Get service appointments for the opportunity
   * Goes through WorkOrders to find all appointments
   */
  async getOpportunityAppointments(id) {
    const appointments = await prisma.serviceAppointment.findMany({
      where: {
        workOrder: { opportunityId: id },
      },
      orderBy: { scheduledStart: 'desc' },
      include: {
        workOrder: {
          select: {
            id: true,
            workOrderNumber: true,
            subject: true,
            workType: { select: { name: true } },
          },
        },
        assignedResources: {
          include: {
            serviceResource: {
              select: { id: true, name: true, phone: true, resourceType: true },
            },
          },
        },
      },
    });

    return {
      opportunityId: id,
      appointments: appointments.map((sa) => ({
        id: sa.id,
        appointmentNumber: sa.appointmentNumber,
        subject: sa.subject,
        status: sa.status,
        scheduledStart: sa.scheduledStart,
        scheduledEnd: sa.scheduledEnd,
        actualStart: sa.actualStart,
        actualEnd: sa.actualEnd,
        duration: sa.duration,
        address: sa.street
          ? `${sa.street}, ${sa.city}, ${sa.state} ${sa.postalCode}`
          : null,
        workOrder: {
          id: sa.workOrder.id,
          workOrderNumber: sa.workOrder.workOrderNumber,
          subject: sa.workOrder.subject,
          workTypeName: sa.workOrder.workType?.name,
        },
        crew: sa.assignedResources.map((ar) => ({
          id: ar.serviceResource.id,
          name: ar.serviceResource.name,
          phone: ar.serviceResource.phone,
          type: ar.serviceResource.resourceType,
          isPrimary: ar.isPrimaryResource,
        })),
      })),
      summary: {
        total: appointments.length,
        scheduled: appointments.filter((a) => a.status === 'SCHEDULED').length,
        completed: appointments.filter((a) => a.status === 'COMPLETED').length,
        inProgress: appointments.filter((a) => a.status === 'IN_PROGRESS').length,
      },
    };
  }

  /**
   * Get service contract for the opportunity
   */
  async getOpportunityContract(id) {
    const contract = await prisma.serviceContract.findUnique({
      where: { opportunityId: id },
      include: {
        commissions: {
          include: {
            owner: { select: { id: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!contract) {
      return null;
    }

    return {
      id: contract.id,
      contractNumber: contract.contractNumber,
      name: contract.name,
      status: contract.status,
      startDate: contract.startDate,
      endDate: contract.endDate,
      contractTotal: Number(contract.contractTotal),
      salesTotalPrice: contract.salesTotalPrice ? Number(contract.salesTotalPrice) : null,
      supplementsClosedTotal: contract.supplementsClosedTotal
        ? Number(contract.supplementsClosedTotal)
        : null,
      paidAmount: contract.paidAmount ? Number(contract.paidAmount) : 0,
      balanceDue: contract.balanceDue ? Number(contract.balanceDue) : 0,
      collectedPercent: contract.collectedPercent ? Number(contract.collectedPercent) : 0,
      isPmContract: contract.isPmContract,
      backEndCommissionReady: contract.backEndCommissionReady,
      // Commission summary
      commissionSummary: {
        total: contract.commissions.length,
        totalAmount: contract.commissions.reduce(
          (sum, c) => sum + Number(c.commissionAmount),
          0
        ),
        byStatus: contract.commissions.reduce((acc, c) => {
          acc[c.status] = (acc[c.status] || 0) + 1;
          return acc;
        }, {}),
      },
      commissions: contract.commissions.map((c) => ({
        id: c.id,
        type: c.type,
        status: c.status,
        ownerName: `${c.owner.firstName} ${c.owner.lastName}`,
        commissionValue: Number(c.commissionValue),
        commissionRate: Number(c.commissionRate),
        commissionAmount: Number(c.commissionAmount),
        requestedAmount: c.requestedAmount ? Number(c.requestedAmount) : null,
        createdAt: c.createdAt,
      })),
    };
  }

  /**
   * Get invoices for the opportunity (via Account)
   */
  async getOpportunityInvoices(id) {
    const opportunity = await prisma.opportunity.findUnique({
      where: { id },
      select: { accountId: true, name: true },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    const invoices = await prisma.invoice.findMany({
      where: { accountId: opportunity.accountId },
      orderBy: { createdAt: 'desc' },
      include: {
        payments: {
          orderBy: { paymentDate: 'desc' },
        },
        lineItems: true,
      },
    });

    return {
      opportunityId: id,
      opportunityName: opportunity.name,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        terms: inv.terms,
        subtotal: Number(inv.subtotal),
        tax: Number(inv.tax),
        total: Number(inv.total),
        amountPaid: Number(inv.amountPaid),
        balanceDue: Number(inv.balanceDue),
        // Stripe
        stripePaymentLinkUrl: inv.stripePaymentLinkUrl,
        stripeHostedInvoiceUrl: inv.stripeHostedInvoiceUrl,
        // QuickBooks
        qbDocNumber: inv.qbDocNumber,
        qbSyncStatus: inv.qbSyncStatus,
        // Line items
        lineItems: inv.lineItems.map((li) => ({
          description: li.description,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          totalPrice: Number(li.totalPrice),
        })),
        // Payments
        payments: inv.payments.map((p) => ({
          id: p.id,
          paymentNumber: p.paymentNumber,
          amount: Number(p.amount),
          paymentDate: p.paymentDate,
          paymentMethod: p.paymentMethod,
          status: p.status,
          referenceNumber: p.referenceNumber,
        })),
      })),
      summary: {
        totalInvoiced: invoices.reduce((sum, i) => sum + Number(i.total), 0),
        totalPaid: invoices.reduce((sum, i) => sum + Number(i.amountPaid), 0),
        totalBalanceDue: invoices.reduce((sum, i) => sum + Number(i.balanceDue), 0),
        invoiceCount: invoices.length,
        paidCount: invoices.filter((i) => i.status === 'PAID').length,
        overdueCount: invoices.filter((i) => i.status === 'OVERDUE').length,
      },
    };
  }

  /**
   * Get commissions for the opportunity
   */
  async getOpportunityCommissions(id) {
    const commissions = await prisma.commission.findMany({
      where: { opportunityId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        serviceContract: {
          select: { contractNumber: true, contractTotal: true },
        },
      },
    });

    return {
      opportunityId: id,
      commissions: commissions.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        owner: {
          id: c.owner.id,
          name: `${c.owner.firstName} ${c.owner.lastName}`,
          email: c.owner.email,
        },
        commissionValue: Number(c.commissionValue),
        commissionRate: Number(c.commissionRate),
        commissionAmount: Number(c.commissionAmount),
        requestedAmount: c.requestedAmount ? Number(c.requestedAmount) : null,
        preCommissionAmount: c.preCommissionAmount ? Number(c.preCommissionAmount) : null,
        paidAmount: c.paidAmount ? Number(c.paidAmount) : null,
        isCompanyLead: c.isCompanyLead,
        isSelfGen: c.isSelfGen,
        notes: c.notes,
        holdReason: c.holdReason,
        deniedReason: c.deniedReason,
        contractNumber: c.serviceContract?.contractNumber,
        createdAt: c.createdAt,
        requestedDate: c.requestedDate,
        approvedDate: c.approvedDate,
        paidDate: c.paidDate,
      })),
      summary: {
        total: commissions.length,
        totalAmount: commissions.reduce((sum, c) => sum + Number(c.commissionAmount), 0),
        totalPaid: commissions
          .filter((c) => c.status === 'PAID')
          .reduce((sum, c) => sum + Number(c.paidAmount || c.commissionAmount), 0),
        byType: commissions.reduce((acc, c) => {
          acc[c.type] = (acc[c.type] || 0) + 1;
          return acc;
        }, {}),
        byStatus: commissions.reduce((acc, c) => {
          acc[c.status] = (acc[c.status] || 0) + 1;
          return acc;
        }, {}),
      },
    };
  }

  /**
   * Get activity timeline for the opportunity
   * Combines notes, tasks, stage changes into unified timeline
   */
  async getOpportunityActivity(id, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const [notes, tasks, opportunity] = await Promise.all([
      // Get notes
      prisma.note.findMany({
        where: { opportunityId: id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          createdBy: { select: { firstName: true, lastName: true } },
        },
      }),
      // Get tasks
      prisma.task.findMany({
        where: { opportunityId: id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          assignedTo: { select: { firstName: true, lastName: true } },
        },
      }),
      // Get opportunity for stage info
      prisma.opportunity.findUnique({
        where: { id },
        select: { stage: true, updatedAt: true, createdAt: true },
      }),
    ]);

    // Combine into unified timeline
    const activities = [
      ...notes.map((n) => ({
        id: n.id,
        type: 'NOTE',
        title: n.title || 'Note',
        body: n.body,
        createdAt: n.createdAt,
        createdBy: n.createdBy
          ? `${n.createdBy.firstName} ${n.createdBy.lastName}`
          : 'System',
        icon: 'document-text',
      })),
      ...tasks.map((t) => ({
        id: t.id,
        type: 'TASK',
        title: t.subject,
        body: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        completedDate: t.completedDate,
        createdAt: t.createdAt,
        assignedTo: t.assignedTo
          ? `${t.assignedTo.firstName} ${t.assignedTo.lastName}`
          : 'Unassigned',
        icon: 'check-circle',
      })),
    ];

    // Sort by createdAt descending
    activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return {
      opportunityId: id,
      activities: activities.slice(offset, offset + limit),
      pagination: {
        total: activities.length,
        limit,
        offset,
        hasMore: activities.length > offset + limit,
      },
    };
  }

  /**
   * Get documents/agreements for the opportunity
   */
  async getOpportunityDocuments(id) {
    const agreements = await prisma.agreement.findMany({
      where: { opportunityId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        template: {
          select: { name: true, category: true },
        },
      },
    });

    return {
      opportunityId: id,
      documents: agreements.map((a) => ({
        id: a.id,
        agreementNumber: a.agreementNumber,
        name: a.name,
        status: a.status,
        templateName: a.template?.name,
        category: a.template?.category || 'General',
        documentUrl: a.documentUrl,
        signedDocumentUrl: a.signedDocumentUrl,
        signingUrl: a.signingUrl,
        sentAt: a.sentAt,
        viewedAt: a.viewedAt,
        signedAt: a.signedAt,
        declinedAt: a.declinedAt,
        declineReason: a.declineReason,
        expiresAt: a.expiresAt,
        createdAt: a.createdAt,
      })),
      summary: {
        total: agreements.length,
        signed: agreements.filter((a) => a.status === 'SIGNED').length,
        pending: agreements.filter((a) => ['SENT', 'VIEWED'].includes(a.status)).length,
        draft: agreements.filter((a) => a.status === 'DRAFT').length,
        declined: agreements.filter((a) => a.status === 'DECLINED').length,
      },
    };
  }

  /**
   * Get stage counts for dashboard
   * @param {string} currentUserId - Current user's ID
   * @param {string} ownerFilter - 'all', 'mine', or 'team'
   * @param {string[]} ownerIds - Array of owner IDs for team filtering
   */
  async getStageCounts(currentUserId, ownerFilter, ownerIds = []) {
    const where = {};

    if (ownerFilter === 'mine' && currentUserId) {
      where.ownerId = currentUserId;
    } else if (ownerFilter === 'team' && ownerIds.length > 0) {
      where.ownerId = { in: ownerIds };
    } else if (ownerIds.length > 0) {
      // If ownerIds are provided, use them regardless of ownerFilter
      where.ownerId = { in: ownerIds };
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
   * Generate Job ID within a transaction
   * @param {Object} tx - Prisma transaction client
   * @returns {Promise<string|null>} Job ID in format YYYY-NNNN or null if failed
   */
  async generateJobId(tx = prisma) {
    const currentYear = new Date().getFullYear();

    try {
      // Try to get and lock the sequence row for this year
      const sequences = await tx.$queryRaw`
        SELECT id, year, last_number
        FROM job_id_sequences
        WHERE year = ${currentYear}
        FOR UPDATE
      `;

      let nextNumber;
      if (!sequences || sequences.length === 0) {
        // First job of the year - create the sequence
        await tx.jobIdSequence.create({
          data: {
            year: currentYear,
            lastNumber: JOB_ID_STARTING_NUMBER + 1,
          },
        });
        nextNumber = JOB_ID_STARTING_NUMBER + 1;
      } else {
        // Increment the sequence
        nextNumber = Number(sequences[0].last_number) + 1;
        await tx.jobIdSequence.update({
          where: { year: currentYear },
          data: { lastNumber: nextNumber },
        });
      }

      const jobId = `${currentYear}-${nextNumber}`;
      logger.info(`Generated Job ID: ${jobId}`);
      return jobId;
    } catch (err) {
      logger.warn(`Failed to generate Job ID: ${err.message}`);
      return null;
    }
  }

  /**
   * Create new opportunity
   */
  async createOpportunity(data) {
    // Use transaction to ensure Job ID is assigned atomically
    const opportunity = await prisma.$transaction(async (tx) => {
      // Generate Job ID unless it's already provided (e.g., from Salesforce sync)
      let jobId = data.jobId || null;
      if (!jobId) {
        jobId = await this.generateJobId(tx);
      }

      const opp = await tx.opportunity.create({
        data: {
          name: data.name,
          jobId, // Auto-assigned Job ID
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
          // Address fields
          street: data.street,
          city: data.city,
          state: data.state,
          postalCode: data.postalCode,
          accountId: data.accountId,
          contactId: data.contactId,
          ownerId: data.ownerId,
          salesforceId: data.salesforceId,
          // Create line items if provided
          lineItems: data.lineItems?.length > 0 ? {
            create: data.lineItems.map((li, index) => ({
              name: li.name || li.product?.name || 'Line Item',
              description: li.description,
              productCode: li.productCode,
              quantity: li.quantity || 1,
              unitPrice: li.unitPrice || 0,
              totalPrice: li.total || li.totalPrice || (li.quantity || 1) * (li.unitPrice || 0),
              discount: li.discount,
              sortOrder: index,
              productId: li.productId,
            })),
          } : undefined,
        },
        include: {
          account: { select: { id: true, name: true } },
          contact: { select: { id: true, firstName: true, lastName: true } },
          owner: { select: { id: true, firstName: true, lastName: true } },
          lineItems: { include: { product: true } },
        },
      });

      return opp;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });

    logger.info(`Opportunity created: ${opportunity.id} (${opportunity.name}) with Job ID: ${opportunity.jobId}`);
    return this.createOpportunityWrapper(opportunity, true);
  }

  /**
   * Update opportunity
   */
  async updateOpportunity(id, data) {
    // Capture previous state for trigger evaluation
    const previousState = await prisma.opportunity.findUnique({
      where: { id },
      select: {
        id: true,
        stage: true,
        status: true,
        type: true,
        isPandaClaims: true,
        isApproved: true,
        serviceRequired: true,
        serviceComplete: true,
      },
    });

    // Handle line items separately if provided
    if (data.lineItems !== undefined) {
      // Delete existing line items and recreate
      await prisma.opportunityLineItem.deleteMany({ where: { opportunityId: id } });

      if (data.lineItems?.length > 0) {
        await prisma.opportunityLineItem.createMany({
          data: data.lineItems.map((li, index) => ({
            opportunityId: id,
            name: li.name || li.product?.name || 'Line Item',
            description: li.description,
            productCode: li.productCode,
            quantity: li.quantity || 1,
            unitPrice: li.unitPrice || 0,
            totalPrice: li.total || li.totalPrice || (li.quantity || 1) * (li.unitPrice || 0),
            discount: li.discount,
            sortOrder: index,
            productId: li.productId,
          })),
        });
      }
    }

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
        // Address fields
        street: data.street,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        accountId: data.accountId,
        contactId: data.contactId,
        ownerId: data.ownerId,
        // Checklist fields
        serviceRequired: data.serviceRequired,
        serviceComplete: data.serviceComplete,
      },
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        owner: { select: { id: true, firstName: true, lastName: true } },
        lineItems: { include: { product: true } },
      },
    });

    // Evaluate onboarding triggers if relevant fields changed
    if (previousState) {
      try {
        const triggersService = await getOnboardingTriggers();
        const currentState = {
          id: opportunity.id,
          stage: opportunity.stage,
          status: opportunity.status,
          type: opportunity.type,
          isPandaClaims: opportunity.isPandaClaims,
          isApproved: opportunity.isApproved,
          serviceRequired: opportunity.serviceRequired,
          serviceComplete: opportunity.serviceComplete,
        };

        // Fire and forget - don't wait for triggers
        triggersService.evaluate(opportunity.id, previousState, currentState).catch(error => {
          logger.warn('Failed to evaluate onboarding triggers:', error.message);
        });
      } catch (error) {
        logger.warn('Failed to call onboarding triggers service:', error.message);
      }
    }

    logger.info(`Opportunity updated: ${id}`);
    return this.createOpportunityWrapper(opportunity, true);
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
      // Address
      street: opp.street,
      city: opp.city,
      state: opp.state,
      postalCode: opp.postalCode,
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
      // Include line items with formatted data
      wrapper.lineItems = opp.lineItems?.map((li) => ({
        id: li.id,
        name: li.name,
        description: li.description,
        productCode: li.productCode,
        quantity: li.quantity,
        unitPrice: Number(li.unitPrice),
        totalPrice: Number(li.totalPrice),
        total: Number(li.totalPrice),
        discount: li.discount ? Number(li.discount) : null,
        sortOrder: li.sortOrder,
        product: li.product,
      })) || [];
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

  // ============================================================================
  // CALL CENTER METHODS
  // These support the Call Center dashboard for scheduling appointments
  // ============================================================================

  /**
   * Get unscheduled appointments - opportunities that were converted from leads
   * but don't have a scheduled service appointment yet
   * Used by: Call Center Dashboard - Unscheduled Appointments tab
   */
  async getUnscheduledAppointments(options = {}) {
    const { startDate, endDate, sortBy = 'appointmentDate', sortOrder = 'asc' } = options;

    // Build date filter for tentative/expected appointment date
    const dateFilter = {};
    if (startDate) {
      dateFilter.gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    // Find opportunities that:
    // 1. Are in early stages (just converted from lead, need appointment)
    // 2. Have an expected appointment date (tentativeAppointmentDate stored from lead conversion)
    // 3. Do NOT have a scheduled service appointment yet
    const opportunities = await prisma.opportunity.findMany({
      where: {
        stage: {
          in: ['LEAD_ASSIGNED', 'SCHEDULED', 'LEAD_UNASSIGNED'],
        },
        // Optional date filter on expected appointment date
        ...(Object.keys(dateFilter).length > 0
          ? { appointmentDate: dateFilter }
          : { appointmentDate: { not: null } }),
      },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            phone: true,
            billingStreet: true,
            billingCity: true,
            billingState: true,
            billingPostalCode: true,
          },
        },
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            mobilePhone: true,
            email: true,
          },
        },
        owner: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        workOrders: {
          include: {
            serviceAppointments: {
              where: {
                status: { in: ['SCHEDULED', 'DISPATCHED', 'IN_PROGRESS'] },
              },
            },
          },
        },
      },
      orderBy: {
        [sortBy === 'tentativeAppointmentDate' ? 'appointmentDate' : sortBy]: sortOrder,
      },
    });

    // Filter to only those without any scheduled appointments
    const unscheduledOpportunities = opportunities.filter((opp) => {
      // Check if any work order has a scheduled appointment
      const hasScheduledAppointment = opp.workOrders.some(
        (wo) => wo.serviceAppointments.length > 0
      );
      return !hasScheduledAppointment;
    });

    // Format response for call center dashboard
    const formatted = unscheduledOpportunities.map((opp) => ({
      id: opp.id,
      name: opp.name,
      stage: opp.stage,
      stageName: this.formatStageName(opp.stage),
      type: opp.type,
      tentativeAppointmentDate: opp.appointmentDate,
      expectedAppointmentDate: opp.appointmentDate,
      // Account info
      account: opp.account
        ? {
            id: opp.account.id,
            name: opp.account.name,
            phone: opp.account.phone,
            address: [
              opp.account.billingStreet,
              opp.account.billingCity,
              opp.account.billingState,
              opp.account.billingPostalCode,
            ]
              .filter(Boolean)
              .join(', '),
          }
        : null,
      // Contact info for calling
      contact: opp.contact
        ? {
            id: opp.contact.id,
            name: `${opp.contact.firstName} ${opp.contact.lastName}`,
            firstName: opp.contact.firstName,
            lastName: opp.contact.lastName,
            phone: opp.contact.phone || opp.contact.mobilePhone,
            mobilePhone: opp.contact.mobilePhone,
            email: opp.contact.email,
          }
        : null,
      // Owner (sales rep)
      owner: opp.owner
        ? {
            id: opp.owner.id,
            name: `${opp.owner.firstName} ${opp.owner.lastName}`,
            email: opp.owner.email,
          }
        : null,
      createdAt: opp.createdAt,
    }));

    return {
      opportunities: formatted,
      total: formatted.length,
    };
  }

  /**
   * Book a service appointment for an opportunity
   * Creates WorkOrder (if needed) and ServiceAppointment
   * Used by: Call Center after confirming appointment with customer
   */
  async bookAppointment(opportunityId, data) {
    const { scheduledStart, scheduledEnd, workTypeId, notes, bookedBy } = data;

    // Get the opportunity with account info
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        account: true,
        contact: true,
        owner: true,
      },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${opportunityId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // Check if there's already a work order for this opportunity
    let workOrder = await prisma.workOrder.findFirst({
      where: { opportunityId },
      orderBy: { createdAt: 'desc' },
    });

    // Create work order if none exists
    if (!workOrder) {
      workOrder = await prisma.workOrder.create({
        data: {
          subject: `Inspection - ${opportunity.name}`,
          status: 'NEW',
          priority: 'NORMAL',
          description: `Service appointment for ${opportunity.name}`,
          opportunityId: opportunityId,
          accountId: opportunity.accountId,
          contactId: opportunity.contactId,
          workTypeId: workTypeId,
          // Address from opportunity or account
          street: opportunity.street || opportunity.account?.billingStreet,
          city: opportunity.city || opportunity.account?.billingCity,
          state: opportunity.state || opportunity.account?.billingState,
          postalCode: opportunity.postalCode || opportunity.account?.billingPostalCode,
        },
      });
    }

    // Create the service appointment
    const serviceAppointment = await prisma.serviceAppointment.create({
      data: {
        subject: `${opportunity.type === 'INSURANCE' ? 'Inspection' : 'Sales Visit'} - ${opportunity.name}`,
        status: 'SCHEDULED',
        scheduledStart: new Date(scheduledStart),
        scheduledEnd: new Date(scheduledEnd),
        duration: Math.round(
          (new Date(scheduledEnd) - new Date(scheduledStart)) / (1000 * 60)
        ), // Duration in minutes
        description: notes,
        workOrderId: workOrder.id,
        // Address
        street: workOrder.street,
        city: workOrder.city,
        state: workOrder.state,
        postalCode: workOrder.postalCode,
      },
    });

    // Update opportunity stage to SCHEDULED
    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        stage: 'SCHEDULED',
        status: 'Scheduled',
        appointmentDate: new Date(scheduledStart),
      },
    });

    // Create a note documenting the appointment booking
    await prisma.note.create({
      data: {
        title: 'Appointment Booked',
        body: `Service appointment scheduled for ${new Date(scheduledStart).toLocaleString()}. ${notes ? `Notes: ${notes}` : ''}`,
        opportunityId: opportunityId,
        createdById: bookedBy,
      },
    });

    logger.info(
      `Appointment booked for opportunity ${opportunityId}: SA ${serviceAppointment.id}`
    );

    // ============================================================================
    // INSPECTOR NOTIFICATIONS
    // Notify assigned inspectors/technicians about the new appointment
    // ============================================================================
    try {
      const notifications = await getNotificationService();

      // Get the user who booked the appointment for notification context
      let bookedByName = 'Call Center';
      if (bookedBy) {
        const bookedByUser = await prisma.user.findUnique({
          where: { id: bookedBy },
          select: { firstName: true, lastName: true },
        });
        if (bookedByUser) {
          bookedByName = `${bookedByUser.firstName} ${bookedByUser.lastName}`;
        }
      }

      // Get inspectors to notify (assigned resources or territory members)
      const inspectorIds = await notifications.getInspectorsForNotification({
        workOrderId: workOrder.id,
        opportunityId: opportunityId,
      });

      // If no assigned resources yet, notify opportunity owner
      const notifyIds =
        inspectorIds.length > 0 ? inspectorIds : opportunity.ownerId ? [opportunity.ownerId] : [];

      // Send notifications to each inspector
      for (const inspectorId of notifyIds) {
        await notifications.notifyAppointmentBooked(
          inspectorId,
          {
            id: serviceAppointment.id,
            subject: serviceAppointment.subject,
            scheduledStart: serviceAppointment.scheduledStart,
            scheduledEnd: serviceAppointment.scheduledEnd,
            workOrderId: workOrder.id,
            appointmentType: opportunity.type === 'INSURANCE' ? 'Inspection' : 'Sales Visit',
          },
          opportunity,
          {
            notes,
            bookedByName,
          }
        );
      }

      logger.info(
        `Sent appointment notifications to ${notifyIds.length} inspector(s) for opportunity ${opportunityId}`
      );
    } catch (notifyError) {
      // Log but don't fail the booking if notifications fail
      logger.warn(`Failed to send appointment notifications: ${notifyError.message}`);
    }

    return {
      success: true,
      workOrder: {
        id: workOrder.id,
        subject: workOrder.subject,
        status: workOrder.status,
      },
      serviceAppointment: {
        id: serviceAppointment.id,
        subject: serviceAppointment.subject,
        status: serviceAppointment.status,
        scheduledStart: serviceAppointment.scheduledStart,
        scheduledEnd: serviceAppointment.scheduledEnd,
        duration: serviceAppointment.duration,
      },
      opportunity: {
        id: opportunity.id,
        name: opportunity.name,
        stage: 'SCHEDULED',
      },
      notificationsSent: true,
    };
  }

  /**
   * Reschedule an existing service appointment
   * Used by: Call Center when customer requests reschedule
   */
  async rescheduleAppointment(opportunityId, appointmentId, data) {
    const { scheduledStart, scheduledEnd, notes, rescheduledBy } = data;

    // Verify the appointment belongs to this opportunity
    const appointment = await prisma.serviceAppointment.findFirst({
      where: {
        id: appointmentId,
        workOrder: { opportunityId },
      },
      include: {
        workOrder: {
          include: {
            opportunity: true,
          },
        },
        assignedResources: {
          include: { serviceResource: true },
        },
      },
    });

    if (!appointment) {
      const error = new Error(
        `Appointment ${appointmentId} not found for opportunity ${opportunityId}`
      );
      error.name = 'NotFoundError';
      throw error;
    }

    const oldStart = appointment.scheduledStart;
    const oldEnd = appointment.scheduledEnd;

    // Update the appointment
    const updatedAppointment = await prisma.serviceAppointment.update({
      where: { id: appointmentId },
      data: {
        scheduledStart: new Date(scheduledStart),
        scheduledEnd: new Date(scheduledEnd),
        duration: Math.round(
          (new Date(scheduledEnd) - new Date(scheduledStart)) / (1000 * 60)
        ),
        status: 'SCHEDULED', // Reset to scheduled if was in another state
      },
    });

    // Update opportunity appointment date
    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        appointmentDate: new Date(scheduledStart),
      },
    });

    // Create note documenting the reschedule
    await prisma.note.create({
      data: {
        title: 'Appointment Rescheduled',
        body: `Appointment rescheduled from ${oldStart.toLocaleString()} to ${new Date(scheduledStart).toLocaleString()}. ${notes ? `Reason: ${notes}` : ''}`,
        opportunityId: opportunityId,
        createdById: rescheduledBy,
      },
    });

    logger.info(
      `Appointment ${appointmentId} rescheduled for opportunity ${opportunityId}`
    );

    // ============================================================================
    // INSPECTOR NOTIFICATIONS
    // Notify assigned inspectors/technicians about the reschedule
    // ============================================================================
    try {
      const notifications = await getNotificationService();

      // Get the user who rescheduled for notification context
      let rescheduledByName = 'Call Center';
      if (rescheduledBy) {
        const rescheduledByUser = await prisma.user.findUnique({
          where: { id: rescheduledBy },
          select: { firstName: true, lastName: true },
        });
        if (rescheduledByUser) {
          rescheduledByName = `${rescheduledByUser.firstName} ${rescheduledByUser.lastName}`;
        }
      }

      // Get inspectors to notify from assigned resources
      const inspectorIds = appointment.assignedResources
        .filter((ar) => ar.serviceResource?.userId)
        .map((ar) => ar.serviceResource.userId);

      // If no assigned resources, try to get from notification service or use owner
      let notifyIds = inspectorIds;
      if (notifyIds.length === 0) {
        notifyIds = await notifications.getInspectorsForNotification({
          workOrderId: appointment.workOrderId,
          opportunityId: opportunityId,
        });
      }
      if (notifyIds.length === 0 && appointment.workOrder.opportunity.ownerId) {
        notifyIds = [appointment.workOrder.opportunity.ownerId];
      }

      // Send notifications
      for (const inspectorId of notifyIds) {
        await notifications.notifyAppointmentRescheduled(
          inspectorId,
          {
            id: updatedAppointment.id,
            subject: updatedAppointment.subject,
            scheduledStart: updatedAppointment.scheduledStart,
            scheduledEnd: updatedAppointment.scheduledEnd,
            workOrderId: appointment.workOrderId,
            appointmentType: appointment.workOrder.opportunity.type === 'INSURANCE' ? 'Inspection' : 'Sales Visit',
          },
          appointment.workOrder.opportunity,
          { previousStart: oldStart, previousEnd: oldEnd },
          {
            notes,
            rescheduledByName,
          }
        );
      }

      logger.info(
        `Sent reschedule notifications to ${notifyIds.length} inspector(s) for opportunity ${opportunityId}`
      );
    } catch (notifyError) {
      logger.warn(`Failed to send reschedule notifications: ${notifyError.message}`);
    }

    // Return info for notification to assigned crew/inspector
    return {
      success: true,
      appointment: {
        id: updatedAppointment.id,
        subject: updatedAppointment.subject,
        status: updatedAppointment.status,
        scheduledStart: updatedAppointment.scheduledStart,
        scheduledEnd: updatedAppointment.scheduledEnd,
        previousStart: oldStart,
        previousEnd: oldEnd,
      },
      // Crew to notify
      assignedResources: appointment.assignedResources.map((ar) => ({
        id: ar.serviceResource.id,
        name: ar.serviceResource.name,
        phone: ar.serviceResource.phone,
        email: ar.serviceResource.email,
      })),
      opportunity: {
        id: opportunityId,
        name: appointment.workOrder.opportunity.name,
      },
      notificationsSent: true,
    };
  }

  /**
   * Cancel a service appointment
   * Used by: Call Center when customer cancels
   */
  async cancelAppointment(opportunityId, appointmentId, data) {
    const { reason, cancelledBy } = data;

    // Verify the appointment belongs to this opportunity
    const appointment = await prisma.serviceAppointment.findFirst({
      where: {
        id: appointmentId,
        workOrder: { opportunityId },
      },
      include: {
        workOrder: {
          include: { opportunity: true },
        },
        assignedResources: {
          include: { serviceResource: true },
        },
      },
    });

    if (!appointment) {
      const error = new Error(
        `Appointment ${appointmentId} not found for opportunity ${opportunityId}`
      );
      error.name = 'NotFoundError';
      throw error;
    }

    // Update appointment status to CANCELED
    const updatedAppointment = await prisma.serviceAppointment.update({
      where: { id: appointmentId },
      data: {
        status: 'CANCELED',
        description: appointment.description
          ? `${appointment.description}\n\nCancellation reason: ${reason}`
          : `Cancellation reason: ${reason}`,
      },
    });

    // Update opportunity - may need to go back to earlier stage
    await prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        status: 'Appointment Cancelled',
        // Don't clear appointmentDate - keep for reference
      },
    });

    // Create note documenting the cancellation
    await prisma.note.create({
      data: {
        title: 'Appointment Cancelled',
        body: `Service appointment for ${appointment.scheduledStart.toLocaleString()} was cancelled. Reason: ${reason}`,
        opportunityId: opportunityId,
        createdById: cancelledBy,
      },
    });

    logger.info(
      `Appointment ${appointmentId} cancelled for opportunity ${opportunityId}: ${reason}`
    );

    // ============================================================================
    // INSPECTOR NOTIFICATIONS
    // Notify assigned inspectors/technicians about the cancellation
    // ============================================================================
    try {
      const notifications = await getNotificationService();

      // Get the user who cancelled for notification context
      let cancelledByName = 'Call Center';
      if (cancelledBy) {
        const cancelledByUser = await prisma.user.findUnique({
          where: { id: cancelledBy },
          select: { firstName: true, lastName: true },
        });
        if (cancelledByUser) {
          cancelledByName = `${cancelledByUser.firstName} ${cancelledByUser.lastName}`;
        }
      }

      // Get inspectors to notify from assigned resources
      const inspectorIds = appointment.assignedResources
        .filter((ar) => ar.serviceResource?.userId)
        .map((ar) => ar.serviceResource.userId);

      // If no assigned resources, try to get from notification service or use owner
      let notifyIds = inspectorIds;
      if (notifyIds.length === 0) {
        notifyIds = await notifications.getInspectorsForNotification({
          workOrderId: appointment.workOrderId,
          opportunityId: opportunityId,
        });
      }
      if (notifyIds.length === 0 && appointment.workOrder.opportunity.ownerId) {
        notifyIds = [appointment.workOrder.opportunity.ownerId];
      }

      // Send notifications - cancellations are urgent
      for (const inspectorId of notifyIds) {
        await notifications.notifyAppointmentCancelled(
          inspectorId,
          {
            id: updatedAppointment.id,
            subject: updatedAppointment.subject,
            scheduledStart: appointment.scheduledStart,
            scheduledEnd: appointment.scheduledEnd,
            workOrderId: appointment.workOrderId,
            appointmentType: appointment.workOrder.opportunity.type === 'INSURANCE' ? 'Inspection' : 'Sales Visit',
          },
          appointment.workOrder.opportunity,
          reason,
          {
            cancelledByName,
          }
        );
      }

      logger.info(
        `Sent cancellation notifications to ${notifyIds.length} inspector(s) for opportunity ${opportunityId}`
      );
    } catch (notifyError) {
      logger.warn(`Failed to send cancellation notifications: ${notifyError.message}`);
    }

    // Return info for notification to assigned crew/inspector
    return {
      success: true,
      appointment: {
        id: updatedAppointment.id,
        subject: updatedAppointment.subject,
        status: 'CANCELED',
        scheduledStart: appointment.scheduledStart,
        scheduledEnd: appointment.scheduledEnd,
        cancellationReason: reason,
      },
      // Crew to notify
      assignedResources: appointment.assignedResources.map((ar) => ({
        id: ar.serviceResource.id,
        name: ar.serviceResource.name,
        phone: ar.serviceResource.phone,
        email: ar.serviceResource.email,
      })),
      opportunity: {
        id: opportunityId,
        name: appointment.workOrder.opportunity.name,
      },
      notificationsSent: true,
    };
  }

  /**
   * Add a job message/note to an opportunity
   * Used by: Call Center to document calls and status updates
   * Enhanced to support @mentions and notifications
   */
  async addJobMessage(opportunityId, data) {
    const { message, createdBy, mentionedUsers = [] } = data;

    // Verify opportunity exists
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, name: true },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${opportunityId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // Get creator details for notification
    const creator = await prisma.user.findUnique({
      where: { id: createdBy },
      select: { id: true, firstName: true, lastName: true },
    });

    // Create the note
    const note = await prisma.note.create({
      data: {
        title: 'Job Message',
        body: message,
        opportunityId: opportunityId,
        createdById: createdBy,
      },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    // Create notifications for @mentioned users (fire-and-forget)
    if (mentionedUsers && mentionedUsers.length > 0) {
      const creatorName = creator ? `${creator.firstName} ${creator.lastName}` : 'Someone';
      const messagePreview = message.length > 100 ? message.substring(0, 100) + '...' : message;

      const notifications = mentionedUsers.map(userId => ({
        userId: userId,
        type: 'MENTION',
        title: `${creatorName} mentioned you`,
        message: `${creatorName} mentioned you in ${opportunity.name}: "${messagePreview}"`,
        priority: 'NORMAL',
        actionUrl: `/jobs/${opportunityId}?tab=activity`,
        actionLabel: 'View Update',
        opportunityId: opportunityId,
        sourceType: 'mention',
        sourceId: note.id,
        status: 'UNREAD',
      }));

      // Create notifications in background (don't await)
      prisma.notification.createMany({ data: notifications }).catch(error => {
        logger.warn('Failed to create mention notifications:', error.message);
      });

      logger.info(`Created ${notifications.length} mention notifications for note ${note.id}`);
    }

    logger.info(`Job message added to opportunity ${opportunityId}`);

    return {
      success: true,
      note: {
        id: note.id,
        title: note.title,
        body: note.body,
        createdAt: note.createdAt,
        createdBy: note.createdBy
          ? `${note.createdBy.firstName} ${note.createdBy.lastName}`
          : 'System',
      },
      opportunity: {
        id: opportunity.id,
        name: opportunity.name,
      },
    };
  }

  // ============================================================================
  // SERVICE REQUEST METHODS
  // Per Creating A Service Request SOP - service requests live on jobs (opportunities)
  // ============================================================================

  /**
   * Get opportunities with active service requests
   * Used by: Project Manager dashboard to track service needs
   */
  async getServiceRequests(options = {}) {
    const { status = 'pending', projectManagerId, page = 1, limit = 50 } = options;
    const skip = (page - 1) * limit;

    // Build where clause
    const where = {
      serviceRequired: true,
    };

    if (status === 'pending') {
      where.serviceComplete = false;
    } else if (status === 'complete') {
      where.serviceComplete = true;
    }
    // 'all' doesn't add serviceComplete filter

    if (projectManagerId) {
      where.projectManagerId = projectManagerId;
    }

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { serviceRequestDate: 'desc' },
        include: {
          account: {
            select: { id: true, name: true, phone: true, billingCity: true, billingState: true },
          },
          contact: {
            select: { id: true, firstName: true, lastName: true, phone: true, email: true },
          },
          owner: {
            select: { id: true, firstName: true, lastName: true },
          },
          projectManager: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      prisma.opportunity.count({ where }),
    ]);

    const data = opportunities.map((opp) => ({
      id: opp.id,
      name: opp.name,
      stage: opp.stage,
      stageName: this.formatStageName(opp.stage),
      type: opp.type,
      // Service request fields
      serviceRequired: opp.serviceRequired,
      serviceComplete: opp.serviceComplete,
      serviceRequestDate: opp.serviceRequestDate,
      serviceNotes: opp.serviceNotes,
      // Related records
      account: opp.account
        ? {
            id: opp.account.id,
            name: opp.account.name,
            phone: opp.account.phone,
            location: `${opp.account.billingCity || ''}, ${opp.account.billingState || ''}`.replace(/^, |, $/, ''),
          }
        : null,
      contact: opp.contact
        ? {
            id: opp.contact.id,
            name: `${opp.contact.firstName} ${opp.contact.lastName}`,
            phone: opp.contact.phone,
            email: opp.contact.email,
          }
        : null,
      owner: opp.owner
        ? {
            id: opp.owner.id,
            name: `${opp.owner.firstName} ${opp.owner.lastName}`,
          }
        : null,
      projectManager: opp.projectManager
        ? {
            id: opp.projectManager.id,
            name: `${opp.projectManager.firstName} ${opp.projectManager.lastName}`,
            email: opp.projectManager.email,
          }
        : null,
      createdAt: opp.createdAt,
    }));

    return {
      data,
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
   * Create a service request on an opportunity
   * Per SOP: PM creates service request when service is needed
   */
  async createServiceRequest(opportunityId, data) {
    const { projectManagerId, serviceNotes, createdBy } = data;

    // Verify opportunity exists
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, name: true },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${opportunityId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    // Update opportunity with service request fields
    const updated = await prisma.opportunity.update({
      where: { id: opportunityId },
      data: {
        serviceRequired: true,
        serviceComplete: false,
        serviceRequestDate: new Date(),
        serviceNotes: serviceNotes,
        projectManagerId: projectManagerId,
      },
      include: {
        projectManager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Create note documenting the service request
    await prisma.note.create({
      data: {
        title: 'Service Request Created',
        body: `Service request created. ${serviceNotes ? `Notes: ${serviceNotes}` : ''}`,
        opportunityId: opportunityId,
        createdById: createdBy,
      },
    });

    logger.info(`Service request created for opportunity ${opportunityId}`);

    return {
      success: true,
      opportunity: {
        id: updated.id,
        name: updated.name,
        serviceRequired: updated.serviceRequired,
        serviceComplete: updated.serviceComplete,
        serviceRequestDate: updated.serviceRequestDate,
        serviceNotes: updated.serviceNotes,
        projectManager: updated.projectManager
          ? {
              id: updated.projectManager.id,
              name: `${updated.projectManager.firstName} ${updated.projectManager.lastName}`,
              email: updated.projectManager.email,
            }
          : null,
      },
    };
  }

  /**
   * Update a service request on an opportunity
   */
  async updateServiceRequest(opportunityId, data) {
    const { serviceComplete, serviceNotes, projectManagerId, updatedBy } = data;

    // Verify opportunity exists and has a service request
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { id: true, name: true, serviceRequired: true },
    });

    if (!opportunity) {
      const error = new Error(`Opportunity not found: ${opportunityId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    if (!opportunity.serviceRequired) {
      const error = new Error(`No service request exists for opportunity: ${opportunityId}`);
      error.name = 'ValidationError';
      throw error;
    }

    // Build update data
    const updateData = {};
    if (serviceComplete !== undefined) updateData.serviceComplete = serviceComplete;
    if (serviceNotes !== undefined) updateData.serviceNotes = serviceNotes;
    if (projectManagerId !== undefined) updateData.projectManagerId = projectManagerId;

    const updated = await prisma.opportunity.update({
      where: { id: opportunityId },
      data: updateData,
      include: {
        projectManager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // Create note if status changed
    if (serviceComplete !== undefined) {
      await prisma.note.create({
        data: {
          title: serviceComplete ? 'Service Request Completed' : 'Service Request Reopened',
          body: serviceComplete
            ? `Service request marked as complete. ${serviceNotes ? `Notes: ${serviceNotes}` : ''}`
            : `Service request reopened. ${serviceNotes ? `Notes: ${serviceNotes}` : ''}`,
          opportunityId: opportunityId,
          createdById: updatedBy,
        },
      });
    }

    logger.info(`Service request updated for opportunity ${opportunityId}`);

    return {
      success: true,
      opportunity: {
        id: updated.id,
        name: updated.name,
        serviceRequired: updated.serviceRequired,
        serviceComplete: updated.serviceComplete,
        serviceRequestDate: updated.serviceRequestDate,
        serviceNotes: updated.serviceNotes,
        projectManager: updated.projectManager
          ? {
              id: updated.projectManager.id,
              name: `${updated.projectManager.firstName} ${updated.projectManager.lastName}`,
              email: updated.projectManager.email,
            }
          : null,
      },
    };
  }

  /**
   * Mark a service request as complete
   * Shortcut method for completing a service request
   */
  async completeServiceRequest(opportunityId, data) {
    const { notes, completedBy } = data;

    return this.updateServiceRequest(opportunityId, {
      serviceComplete: true,
      serviceNotes: notes,
      updatedBy: completedBy,
    });
  }
}

export const opportunityService = new OpportunityService();
export default opportunityService;
