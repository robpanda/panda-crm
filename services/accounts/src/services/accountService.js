// Account Service - Business Logic Layer
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

// Workflows service URL for triggering automations
const WORKFLOWS_SERVICE_URL = process.env.WORKFLOWS_SERVICE_URL || 'http://workflows-service:3008';

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

    // Build where clause - always exclude soft-deleted records
    const where = {
      deletedAt: null, // Only show non-deleted records
    };

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
  async updateAccount(id, data, userId = null) {
    // Get existing account to detect status change
    const existingAccount = await this.getAccountById(id);
    const oldStatus = existingAccount.status;

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

    // Trigger QuickBooks/Stripe customer creation on status change to "Onboarding"
    if (data.status && data.status !== oldStatus) {
      await this.evaluateStatusChangeTriggers(id, oldStatus, data.status, userId);
    }

    return account;
  }

  // Evaluate account status change triggers (QB/Stripe customer creation)
  async evaluateStatusChangeTriggers(accountId, oldStatus, newStatus, userId) {
    try {
      const onboardingStatuses = ['Onboarding', 'ONBOARDING', 'onboarding'];

      if (onboardingStatuses.includes(newStatus) && !onboardingStatuses.includes(oldStatus)) {
        logger.info(`Account status changed to Onboarding - triggering QB/Stripe sync`, { accountId, oldStatus, newStatus });

        // Call workflows service to trigger QB customer creation
        const response = await fetch(`${WORKFLOWS_SERVICE_URL}/api/triggers/quickbooks/account-onboarding`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountId, userId }),
        });

        if (response.ok) {
          const result = await response.json();
          logger.info(`QB/Stripe sync triggered for account ${accountId}`, result);
        } else {
          const error = await response.text();
          logger.error(`Failed to trigger QB/Stripe sync for account ${accountId}:`, error);
        }
      }
    } catch (error) {
      logger.error('Error evaluating account status triggers:', { accountId, error: error.message });
      // Don't throw - trigger failure shouldn't block account update
    }
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

  // Bulk reassign accounts to a new owner
  async bulkReassign(accountIds, newOwnerId) {
    logger.info(`Bulk reassigning ${accountIds.length} accounts to owner ${newOwnerId}`);

    const result = await prisma.account.updateMany({
      where: { id: { in: accountIds } },
      data: { ownerId: newOwnerId, updatedAt: new Date() },
    });

    logger.info(`Bulk reassign complete: ${result.count} accounts updated`);
    return { count: result.count };
  }

  // Bulk update account status
  async bulkUpdateStatus(accountIds, status) {
    logger.info(`Bulk updating ${accountIds.length} accounts to status ${status}`);

    const result = await prisma.account.updateMany({
      where: { id: { in: accountIds } },
      data: { status, updatedAt: new Date() },
    });

    logger.info(`Bulk status update complete: ${result.count} accounts updated`);
    return { count: result.count };
  }

  // Bulk delete (soft delete - set deletedAt timestamp)
  async bulkDelete(accountIds, auditContext = {}) {
    logger.info(`Bulk soft-deleting ${accountIds.length} accounts`);

    const results = {
      total: accountIds.length,
      success: [],
      failed: [],
    };

    // Process each account to capture audit data
    for (const accountId of accountIds) {
      try {
        // Get the account before deletion
        const oldAccount = await prisma.account.findUnique({
          where: { id: accountId },
          select: { id: true, name: true, status: true },
        });

        if (!oldAccount) {
          results.failed.push({ id: accountId, error: 'Account not found' });
          continue;
        }

        // Soft delete by setting deletedAt timestamp
        await prisma.account.update({
          where: { id: accountId },
          data: { deletedAt: new Date(), updatedAt: new Date() },
        });

        // Log audit
        await logAudit({
          tableName: 'accounts',
          recordId: accountId,
          action: 'BULK_DELETE',
          oldValues: { status: oldAccount.status, deletedAt: null },
          newValues: { deletedAt: new Date() },
          userId: auditContext.userId,
          userEmail: auditContext.userEmail,
          source: 'api',
        });

        results.success.push(accountId);
        logger.info(`Soft deleted account: ${oldAccount.name}`);
      } catch (error) {
        logger.error(`Failed to delete account ${accountId}:`, error);
        results.failed.push({ id: accountId, error: error.message });
      }
    }

    logger.info(`Bulk delete complete: ${results.success.length}/${results.total} accounts soft-deleted`);
    return {
      count: results.success.length,
      results,
    };
  }

  // Get deleted accounts for admin restore page
  async getDeletedAccounts(options = {}) {
    const {
      page = 1,
      limit = 50,
      search,
    } = options;

    const skip = (page - 1) * limit;

    // Only show deleted records (deletedAt is not null)
    const where = {
      deletedAt: { not: null },
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { accountNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [accounts, total] = await Promise.all([
      prisma.account.findMany({
        where,
        skip,
        take: limit,
        orderBy: { deletedAt: 'desc' },
        include: {
          owner: {
            select: { id: true, firstName: true, lastName: true },
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
      },
    };
  }

  // Restore a soft-deleted account
  async restoreAccount(id) {
    logger.info(`Restoring account: ${id}`);

    const account = await prisma.account.findUnique({
      where: { id },
    });

    if (!account) {
      const error = new Error(`Account not found: ${id}`);
      error.name = 'NotFoundError';
      throw error;
    }

    if (!account.deletedAt) {
      const error = new Error('Account is not deleted');
      error.name = 'ValidationError';
      throw error;
    }

    const restored = await prisma.account.update({
      where: { id },
      data: { deletedAt: null, updatedAt: new Date() },
    });

    logger.info(`Account restored: ${id}`);
    return restored;
  }

  // Permanently delete accounts older than 30 days
  async purgeDeletedAccounts() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    logger.info(`Purging accounts deleted before: ${thirtyDaysAgo.toISOString()}`);

    const result = await prisma.account.deleteMany({
      where: {
        deletedAt: { lt: thirtyDaysAgo },
      },
    });

    logger.info(`Purged ${result.count} accounts permanently`);
    return { count: result.count };
  }
}

export const accountService = new AccountService();
export default accountService;
