// Account Service - Business Logic Layer
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

class AccountService {
  // Get all accounts with filtering and pagination
  async getAccounts(options = {}) {
    const {
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      status,
      type,
      ownerId,
      state,
      search,
      isPandaClaims,
    } = options;

    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};

    if (status) where.status = status;
    if (type) where.type = type;
    if (ownerId) where.ownerId = ownerId;
    if (state) where.billingState = state;
    if (isPandaClaims !== undefined) where.isPandaClaims = isPandaClaims === 'true';

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { accountNumber: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    // Execute query with count
    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          owner: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: {
            select: { opportunities: true, contacts: true, invoices: true },
          },
        },
      }),
      prisma.account.count({ where }),
    ]);

    return {
      data: accounts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  // Get single account by ID
  async getAccountById(id) {
    const account = await prisma.account.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        contacts: {
          orderBy: { isPrimary: 'desc' },
        },
        opportunities: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        cases: {
          where: { status: { not: 'CLOSED' } },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { opportunities: true, contacts: true, invoices: true, cases: true, workOrders: true },
        },
      },
    });

    if (!account) {
      const error = new Error(`Account not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    return account;
  }

  // Get account by Salesforce ID
  async getAccountBySalesforceId(salesforceId) {
    const account = await prisma.account.findUnique({
      where: { salesforceId },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!account) {
      const error = new Error(`Account not found with Salesforce ID: ${salesforceId}`);
      error.name = 'NotFoundError';
      throw error;
    }

    return account;
  }

  // Create new account
  async createAccount(data) {
    // Generate account number if not provided
    if (!data.accountNumber) {
      const lastAccount = await prisma.account.findFirst({
        where: { accountNumber: { startsWith: 'PANDA-' } },
        orderBy: { accountNumber: 'desc' },
      });
      const nextNumber = lastAccount
        ? parseInt(lastAccount.accountNumber.replace('PANDA-', '')) + 1
        : 1;
      data.accountNumber = `PANDA-${nextNumber.toString().padStart(6, '0')}`;
    }

    const account = await prisma.account.create({
      data: {
        name: data.name,
        accountNumber: data.accountNumber,
        billingStreet: data.billingStreet,
        billingCity: data.billingCity,
        billingState: data.billingState,
        billingPostalCode: data.billingPostalCode,
        billingCountry: data.billingCountry || 'USA',
        phone: data.phone,
        email: data.email,
        website: data.website,
        type: data.type || 'RESIDENTIAL',
        status: data.status || 'NEW',
        industry: data.industry,
        isPandaClaims: data.isPandaClaims || false,
        isSureClaims: data.isSureClaims || false,
        ownerId: data.ownerId,
        salesforceId: data.salesforceId,
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logger.info(`Account created: ${account.id} (${account.name})`);
    return account;
  }

  // Update account
  async updateAccount(id, data) {
    // Verify account exists
    await this.getAccountById(id);

    const account = await prisma.account.update({
      where: { id },
      data: {
        name: data.name,
        billingStreet: data.billingStreet,
        billingCity: data.billingCity,
        billingState: data.billingState,
        billingPostalCode: data.billingPostalCode,
        billingCountry: data.billingCountry,
        phone: data.phone,
        email: data.email,
        website: data.website,
        type: data.type,
        status: data.status,
        industry: data.industry,
        isPandaClaims: data.isPandaClaims,
        isSureClaims: data.isSureClaims,
        ownerId: data.ownerId,
        totalSalesVolume: data.totalSalesVolume,
        totalPaidAmount: data.totalPaidAmount,
        balanceDue: data.balanceDue,
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logger.info(`Account updated: ${account.id}`);
    return account;
  }

  // Delete account (soft delete by setting status to INACTIVE)
  async deleteAccount(id) {
    await this.getAccountById(id);

    const account = await prisma.account.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });

    logger.info(`Account deleted (soft): ${id}`);
    return account;
  }

  // Hard delete (for admin/cleanup only)
  async hardDeleteAccount(id) {
    await this.getAccountById(id);

    // Check for related records
    const relatedCounts = await prisma.account.findUnique({
      where: { id },
      select: {
        _count: {
          select: { opportunities: true, invoices: true, workOrders: true },
        },
      },
    });

    const totalRelated =
      relatedCounts._count.opportunities +
      relatedCounts._count.invoices +
      relatedCounts._count.workOrders;

    if (totalRelated > 0) {
      const error = new Error(
        `Cannot delete account with related records. Found ${relatedCounts._count.opportunities} opportunities, ${relatedCounts._count.invoices} invoices, ${relatedCounts._count.workOrders} work orders.`
      );
      error.name = 'ValidationError';
      throw error;
    }

    await prisma.account.delete({ where: { id } });
    logger.info(`Account hard deleted: ${id}`);
    return { deleted: true };
  }

  // Get account contacts
  async getAccountContacts(accountId) {
    await this.getAccountById(accountId);

    return prisma.contact.findMany({
      where: { accountId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  // Get account opportunities
  async getAccountOpportunities(accountId, options = {}) {
    const { page = 1, limit = 20, stage } = options;
    const skip = (page - 1) * limit;

    await this.getAccountById(accountId);

    const where = { accountId };
    if (stage) where.stage = stage;

    const [opportunities, total] = await Promise.all([
      prisma.opportunity.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.opportunity.count({ where }),
    ]);

    return {
      data: opportunities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Update account financial totals (called by other services)
  async updateAccountFinancials(accountId) {
    const invoices = await prisma.invoice.findMany({
      where: { accountId },
      select: { total: true, amountPaid: true, balanceDue: true },
    });

    const totalSalesVolume = invoices.reduce(
      (sum, inv) => sum + (inv.total?.toNumber() || 0),
      0
    );
    const totalPaidAmount = invoices.reduce(
      (sum, inv) => sum + (inv.amountPaid?.toNumber() || 0),
      0
    );
    const balanceDue = invoices.reduce(
      (sum, inv) => sum + (inv.balanceDue?.toNumber() || 0),
      0
    );

    await prisma.account.update({
      where: { id: accountId },
      data: {
        totalSalesVolume,
        totalPaidAmount,
        balanceDue,
      },
    });

    logger.info(`Account financials updated: ${accountId}`);
  }

  // Search accounts (full-text search)
  async searchAccounts(query, limit = 10) {
    return prisma.account.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { accountNumber: { contains: query, mode: 'insensitive' } },
          { billingCity: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: limit,
      select: {
        id: true,
        name: true,
        accountNumber: true,
        billingCity: true,
        billingState: true,
        status: true,
      },
    });
  }

  // ============================================================================
  // SERVICE REQUEST (per Creating A Service Request SOP)
  // ============================================================================

  /**
   * Create a service request on an account
   * Sets serviceRequired=true, serviceComplete=false, records notes and PM
   */
  async createServiceRequest(accountId, data) {
    // Verify account exists
    await this.getAccountById(accountId);

    const account = await prisma.account.update({
      where: { id: accountId },
      data: {
        serviceRequired: true,
        serviceComplete: false,
        serviceRequestDate: new Date(),
        serviceNotes: data.notes || data.serviceNotes,
        projectManagerId: data.projectManagerId,
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        projectManager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logger.info(`Service request created for account: ${accountId}`);
    return account;
  }

  /**
   * Mark a service request as complete
   */
  async completeServiceRequest(accountId) {
    await this.getAccountById(accountId);

    const account = await prisma.account.update({
      where: { id: accountId },
      data: {
        serviceComplete: true,
      },
      include: {
        owner: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        projectManager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    logger.info(`Service request completed for account: ${accountId}`);
    return account;
  }

  /**
   * Get accounts with pending service requests
   */
  async getServiceRequests(options = {}) {
    const { page = 1, limit = 50, projectManagerId, includeCompleted = false } = options;
    const skip = (page - 1) * limit;

    const where = {
      serviceRequired: true,
    };

    if (!includeCompleted) {
      where.serviceComplete = false;
    }

    if (projectManagerId) {
      where.projectManagerId = projectManagerId;
    }

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        skip,
        take: limit,
        orderBy: { serviceRequestDate: 'desc' },
        include: {
          owner: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          projectManager: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          opportunities: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: { id: true, name: true, stage: true },
          },
        },
      }),
      prisma.account.count({ where }),
    ]);

    return {
      data: accounts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }
}

export const accountService = new AccountService();
export default accountService;
