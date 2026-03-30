// User Service - Business Logic for User Management
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

const USER_IDENTITY_INCLUDE = {
  identityLink: {
    select: {
      id: true,
      cognitoSub: true,
      cognitoUsername: true,
      emailNormalized: true,
      authProvider: true,
      linkState: true,
      repairState: true,
      repairReason: true,
      lastVerifiedAt: true,
      lastLoginAt: true,
      lastReconciledAt: true,
      updatedAt: true,
    },
  },
};

const USER_DELETE_BLOCKERS = [
  { key: 'accounts', label: 'accounts', model: 'account', where: (id) => ({ ownerId: id }) },
  { key: 'leads', label: 'leads', model: 'lead', where: (id) => ({ ownerId: id }) },
  { key: 'jobs', label: 'jobs', model: 'opportunity', where: (id) => ({ ownerId: id }) },
  { key: 'projectManagedJobs', label: 'project-managed jobs', model: 'opportunity', where: (id) => ({ projectManagerId: id }) },
  { key: 'onboardedJobs', label: 'onboarded jobs', model: 'opportunity', where: (id) => ({ onboardedById: id }) },
  { key: 'approvedJobs', label: 'approved jobs', model: 'opportunity', where: (id) => ({ approvedById: id }) },
  { key: 'expeditedJobs', label: 'expedited jobs', model: 'opportunity', where: (id) => ({ projectExpeditorId: id }) },
  { key: 'appointments', label: 'appointments', model: 'event', where: (id) => ({ ownerId: id }) },
  { key: 'tasks', label: 'tasks', model: 'task', where: (id) => ({ assignedToId: id }) },
  { key: 'quotes', label: 'quotes', model: 'quote', where: (id) => ({ owner_id: id }) },
  { key: 'documents', label: 'documents', model: 'document', where: (id) => ({ ownerId: id }) },
  { key: 'contractsOwned', label: 'owned contracts', model: 'serviceContract', where: (id) => ({ ownerId: id }) },
  { key: 'contractsManaged', label: 'managed contracts', model: 'serviceContract', where: (id) => ({ managerId: id }) },
  { key: 'contractsRegional', label: 'regional contracts', model: 'serviceContract', where: (id) => ({ regionalManagerId: id }) },
  { key: 'contractsDirected', label: 'directed contracts', model: 'serviceContract', where: (id) => ({ directorId: id }) },
  { key: 'contractsExecutive', label: 'executive contracts', model: 'serviceContract', where: (id) => ({ executiveId: id }) },
  { key: 'directReports', label: 'direct reports', model: 'user', where: (id) => ({ managerId: id }) },
  { key: 'directorReports', label: 'director reports', model: 'user', where: (id) => ({ directorId: id }) },
  { key: 'regionalReports', label: 'regional reports', model: 'user', where: (id) => ({ regionalManagerId: id }) },
  { key: 'executiveReports', label: 'executive reports', model: 'user', where: (id) => ({ executiveId: id }) },
];

const MERGE_COPY_FIELDS = [
  'firstName',
  'lastName',
  'fullName',
  'phone',
  'mobilePhone',
  'department',
  'division',
  'title',
  'employeeNumber',
  'officeAssignment',
  'startDate',
  'street',
  'city',
  'state',
  'postalCode',
  'country',
  'roleId',
  'managerId',
  'directorId',
  'regionalManagerId',
  'executiveId',
  'companyLeadRate',
  'preCommissionRate',
  'selfGenRate',
  'commissionRate',
  'overridePercent',
  'google_calendar_email',
];

const NON_MERGED_USER_WHERE = {
  OR: [
    { status: null },
    { status: { not: 'MERGED' } },
  ],
};

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function buildMergedUserData(targetUser, sourceUser) {
  const mergedData = {};

  for (const field of MERGE_COPY_FIELDS) {
    if (!hasValue(targetUser[field]) && hasValue(sourceUser[field])) {
      mergedData[field] = sourceUser[field];
    }
  }

  if (!targetUser.cognitoId && sourceUser.cognitoId) {
    mergedData.cognitoId = sourceUser.cognitoId;
  }

  if (!targetUser.status && sourceUser.status) {
    mergedData.status = sourceUser.status;
  }

  if (sourceUser.supplementsCommissionable) {
    mergedData.supplementsCommissionable = true;
  }

  if (sourceUser.x5050CommissionSplit) {
    mergedData.x5050CommissionSplit = true;
  }

  if (sourceUser.google_calendar_sync_enabled) {
    mergedData.google_calendar_sync_enabled = true;
  }

  return mergedData;
}

export const userService = {
  /**
   * Get users with pagination and filtering
   */
  async getUsers({
    page = 1,
    limit = 20,
    sortBy = 'lastName',
    sortOrder = 'asc',
    search,
    status,
    department,
    officeAssignment,
    isActive,
    managerId,
    directorId,
  } = {}) {
    const skip = (page - 1) * limit;

    // Build where clause
    const where = {};
    const andClauses = [];

    if (search) {
      andClauses.push({
        OR: [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeNumber: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (status === 'true' || status === 'false') {
      where.isActive = status === 'true';
    } else if (status) {
      where.status = status;
    }

    if (status !== 'MERGED') {
      andClauses.push(NON_MERGED_USER_WHERE);
    }

    if (department) {
      where.department = department;
    }

    if (officeAssignment) {
      where.officeAssignment = officeAssignment;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true' || isActive === true;
    }

    if (managerId) {
      where.managerId = managerId;
    }

    if (directorId) {
      where.directorId = directorId;
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    // Build orderBy
    const orderBy = {};
    orderBy[sortBy] = sortOrder;

    // Execute query
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          ...USER_IDENTITY_INCLUDE,
          role: {
            select: { id: true, name: true, roleType: true },
          },
          manager: {
            select: { id: true, fullName: true, firstName: true, lastName: true },
          },
          director: {
            select: { id: true, fullName: true, firstName: true, lastName: true },
          },
          regionalManager: {
            select: { id: true, fullName: true, firstName: true, lastName: true },
          },
          executive: {
            select: { id: true, fullName: true, firstName: true, lastName: true },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get single user by ID with full hierarchy
   */
  async getUserById(id) {
    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        ...USER_IDENTITY_INCLUDE,
        role: {
          select: { id: true, name: true, roleType: true, permissionsJson: true },
        },
        manager: {
          select: { id: true, fullName: true, firstName: true, lastName: true, email: true, title: true },
        },
        director: {
          select: { id: true, fullName: true, firstName: true, lastName: true, email: true, title: true },
        },
        regionalManager: {
          select: { id: true, fullName: true, firstName: true, lastName: true, email: true, title: true },
        },
        executive: {
          select: { id: true, fullName: true, firstName: true, lastName: true, email: true, title: true },
        },
        directReports: {
          select: { id: true, fullName: true, firstName: true, lastName: true, email: true, title: true },
        },
      },
    });

    if (!user) {
      const error = new Error('User not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    return user;
  },

  /**
   * Get user by Salesforce ID
   */
  async getUserBySalesforceId(salesforceId) {
    const user = await prisma.user.findUnique({
      where: { salesforceId },
      include: {
        ...USER_IDENTITY_INCLUDE,
        manager: {
          select: { id: true, fullName: true, firstName: true, lastName: true },
        },
        director: {
          select: { id: true, fullName: true, firstName: true, lastName: true },
        },
      },
    });

    if (!user) {
      const error = new Error('User not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    return user;
  },

  /**
   * Get user by email with role and team information
   */
  async getUserByEmail(email) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        ...USER_IDENTITY_INCLUDE,
        role: {
          select: { id: true, name: true, roleType: true, permissionsJson: true },
        },
        manager: {
          select: { id: true, fullName: true, firstName: true, lastName: true, email: true },
        },
        director: {
          select: { id: true, fullName: true, firstName: true, lastName: true, email: true },
        },
        directReports: {
          select: { id: true, fullName: true, firstName: true, lastName: true, email: true, title: true },
        },
      },
    });

    if (!user) {
      const error = new Error('User not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    return user;
  },

  /**
   * Update user
   */
  async updateUser(id, data) {
    // Validate user exists
    await this.getUserById(id);

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        ...USER_IDENTITY_INCLUDE,
        role: {
          select: { id: true, name: true, roleType: true, permissionsJson: true },
        },
        manager: {
          select: { id: true, fullName: true, firstName: true, lastName: true },
        },
        director: {
          select: { id: true, fullName: true, firstName: true, lastName: true },
        },
        regionalManager: {
          select: { id: true, fullName: true, firstName: true, lastName: true },
        },
        executive: {
          select: { id: true, fullName: true, firstName: true, lastName: true },
        },
      },
    });

    logger.info(`User updated: ${id}`);
    return updated;
  },

  /**
   * Delete a user only when they are not attached to active hub records.
   * This keeps admin cleanup safe for test/duplicate users and pushes
   * real ownership changes through terminate/transfer or merge.
   */
  async deleteUser(id, actingUserId) {
    if (!id) {
      const error = new Error('User ID is required');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    if (actingUserId && actingUserId === id) {
      const error = new Error('You cannot delete your own user record');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        identityLink: true,
      },
    });

    if (!user) {
      const error = new Error('User not found');
      error.code = 'NOT_FOUND';
      error.statusCode = 404;
      throw error;
    }

    const blockerCounts = await Promise.all(
      USER_DELETE_BLOCKERS.map(async ({ key, label, model, where }) => ({
        key,
        label,
        count: await prisma[model].count({ where: where(id) }),
      }))
    );

    const activeBlockers = blockerCounts.filter((entry) => entry.count > 0);

    if (activeBlockers.length > 0) {
      const blockerSummary = activeBlockers
        .map((entry) => `${entry.label} (${entry.count})`)
        .join(', ');

      const error = new Error(
        `This user still owns or is assigned to active records: ${blockerSummary}. Use Terminate & Transfer or Merge instead.`
      );
      error.code = 'DELETE_BLOCKED';
      error.statusCode = 409;
      throw error;
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (user.identityLink) {
          await tx.identityLink.delete({
            where: { id: user.identityLink.id },
          });
        }

        await tx.user.delete({
          where: { id },
        });
      });
    } catch (error) {
      if (error?.code === 'P2003') {
        const deleteBlockedError = new Error(
          'This user is still referenced by related records. Use Terminate & Transfer or Merge instead.'
        );
        deleteBlockedError.code = 'DELETE_BLOCKED';
        deleteBlockedError.statusCode = 409;
        throw deleteBlockedError;
      }

      throw error;
    }

    logger.info(`User deleted: ${id}`);

    return {
      deletedUserId: id,
      email: user.email,
    };
  },

  /**
   * Get users for dropdown (minimal data)
   * @param {Object} options - Filter options
   * @param {boolean} options.isActive - Filter by active status
   * @param {string} options.search - Search by name
   * @param {string} options.role - Filter by roleType (e.g., 'call_center', 'sales_rep')
   * @param {string} options.department - Filter by department
   */
  async getUsersForDropdown({ isActive = true, search, role, department } = {}) {
    const where = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    // Note: 'role' parameter is deprecated - use 'department' instead
    // roleType field doesn't exist in the User model

    if (department) {
      where.department = { contains: department, mode: 'insensitive' };
    }

    const trimmedSearch = typeof search === 'string' ? search.trim() : '';
    if (trimmedSearch) {
      const searchTokens = trimmedSearch.split(/\s+/).filter(Boolean);
      const tokenFilters = searchTokens.map((token) => ({
        OR: [
          { firstName: { contains: token, mode: 'insensitive' } },
          { lastName: { contains: token, mode: 'insensitive' } },
          { fullName: { contains: token, mode: 'insensitive' } },
          { email: { contains: token, mode: 'insensitive' } },
          { title: { contains: token, mode: 'insensitive' } },
          { department: { contains: token, mode: 'insensitive' } },
        ],
      }));

      where.AND = [...(where.AND || []), ...tokenFilters];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        firstName: true,
        lastName: true,
        email: true,
        isActive: true,
        title: true,
        department: true,
        officeAssignment: true,
      },
      orderBy: { lastName: 'asc' },
      take: 500,
    });

    return users;
  },

  /**
   * Get user statistics
   */
  async getUserStats() {
    const visibleUserWhere = NON_MERGED_USER_WHERE;

    const [total, active, inactive, byDepartment, byOffice] = await Promise.all([
      prisma.user.count({ where: visibleUserWhere }),
      prisma.user.count({ where: { AND: [visibleUserWhere, { isActive: true }] } }),
      prisma.user.count({ where: { AND: [visibleUserWhere, { isActive: false }] } }),
      prisma.user.groupBy({
        by: ['department'],
        _count: { id: true },
        where: {
          AND: [
            visibleUserWhere,
            { department: { not: null } },
          ],
        },
      }),
      prisma.user.groupBy({
        by: ['officeAssignment'],
        _count: { id: true },
        where: {
          AND: [
            visibleUserWhere,
            { officeAssignment: { not: null } },
          ],
        },
      }),
    ]);

    return {
      total,
      active,
      inactive,
      byDepartment: byDepartment.reduce((acc, d) => {
        if (d.department) acc[d.department] = d._count.id;
        return acc;
      }, {}),
      byOffice: byOffice.reduce((acc, o) => {
        if (o.officeAssignment) acc[o.officeAssignment] = o._count.id;
        return acc;
      }, {}),
    };
  },

  /**
   * Get direct reports for a user
   */
  async getDirectReports(userId) {
    const reports = await prisma.user.findMany({
      where: { managerId: userId },
      select: {
        id: true,
        fullName: true,
        firstName: true,
        lastName: true,
        email: true,
        title: true,
        department: true,
        isActive: true,
      },
      orderBy: { lastName: 'asc' },
    });

    return reports;
  },

  /**
   * Search users
   */
  async searchUsers(query, limit = 10) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: query, mode: 'insensitive' } },
          { lastName: { contains: query, mode: 'insensitive' } },
          { fullName: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        firstName: true,
        lastName: true,
        email: true,
        title: true,
        department: true,
        officeAssignment: true,
      },
      orderBy: { lastName: 'asc' },
      take: limit,
    });

    return users;
  },

  /**
   * Merge a duplicate/source user into the selected parent/kept user.
   * This is intentionally conservative: it preserves the target user,
   * moves the identity link when safe, re-points reporting hierarchy,
   * and deactivates the source record.
   */
  async mergeUsers(sourceUserId, targetUserId) {
    if (!sourceUserId || !targetUserId) {
      const error = new Error('Both source and parent users are required');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    if (sourceUserId === targetUserId) {
      const error = new Error('Source user and parent user must be different');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    return prisma.$transaction(async (tx) => {
      const [sourceUser, targetUser] = await Promise.all([
        tx.user.findUnique({
          where: { id: sourceUserId },
          include: {
            identityLink: true,
          },
        }),
        tx.user.findUnique({
          where: { id: targetUserId },
          include: {
            identityLink: true,
            role: {
              select: { id: true, name: true, roleType: true },
            },
            manager: {
              select: { id: true, fullName: true, firstName: true, lastName: true },
            },
            director: {
              select: { id: true, fullName: true, firstName: true, lastName: true },
            },
            regionalManager: {
              select: { id: true, fullName: true, firstName: true, lastName: true },
            },
            executive: {
              select: { id: true, fullName: true, firstName: true, lastName: true },
            },
          },
        }),
      ]);

      if (!sourceUser || !targetUser) {
        const error = new Error('User not found');
        error.code = 'NOT_FOUND';
        throw error;
      }

      const mergedData = buildMergedUserData(targetUser, sourceUser);
      const targetKeepsExistingIdentity = Boolean(
        targetUser.identityLink || targetUser.cognitoId
      );

      // The selected parent user always wins identity during merge. If the parent
      // already has a Cognito/identity link, we sever the duplicate's identity
      // instead of blocking the merge with a conflict.
      if (targetKeepsExistingIdentity && mergedData.cognitoId) {
        delete mergedData.cognitoId;
      }

      if (Object.keys(mergedData).length > 0) {
        await tx.user.update({
          where: { id: targetUser.id },
          data: mergedData,
        });
      }

      if (sourceUser.identityLink && targetKeepsExistingIdentity) {
        await tx.identityLink.delete({
          where: { id: sourceUser.identityLink.id },
        });
      } else if (sourceUser.identityLink && !targetUser.identityLink) {
        await tx.identityLink.update({
          where: { id: sourceUser.identityLink.id },
          data: {
            crmUserId: targetUser.id,
            repairState: 'relinked',
            repairReason: `merged_from:${sourceUser.id}`,
            lastReconciledAt: new Date(),
            lastVerifiedAt: new Date(),
          },
        });
      }

      await Promise.all([
        tx.user.updateMany({
          where: { managerId: sourceUser.id },
          data: { managerId: targetUser.id },
        }),
        tx.user.updateMany({
          where: { directorId: sourceUser.id },
          data: { directorId: targetUser.id },
        }),
        tx.user.updateMany({
          where: { regionalManagerId: sourceUser.id },
          data: { regionalManagerId: targetUser.id },
        }),
        tx.user.updateMany({
          where: { executiveId: sourceUser.id },
          data: { executiveId: targetUser.id },
        }),
        tx.user.update({
          where: { id: sourceUser.id },
          data: {
            isActive: false,
            status: 'MERGED',
            cognitoId: null,
            updatedAt: new Date(),
          },
        }),
      ]);

      const updatedTarget = await tx.user.findUnique({
        where: { id: targetUser.id },
        include: {
          role: {
            select: { id: true, name: true, roleType: true },
          },
          manager: {
            select: { id: true, fullName: true, firstName: true, lastName: true },
          },
          director: {
            select: { id: true, fullName: true, firstName: true, lastName: true },
          },
          regionalManager: {
            select: { id: true, fullName: true, firstName: true, lastName: true },
          },
          executive: {
            select: { id: true, fullName: true, firstName: true, lastName: true },
          },
          identityLink: true,
        },
      });

      logger.info(`User merged: ${sourceUser.id} -> ${targetUser.id}`);

      return {
        mergedUserId: sourceUser.id,
        parentUserId: targetUser.id,
        user: updatedTarget,
      };
    });
  },

  /**
   * Terminate a user and transfer active ownership/assignment records
   * to another active user. This intentionally reassigns only clearly
   * user-owned records and preserves historical author fields.
   */
  async terminateAndTransferUser(sourceUserId, targetUserId) {
    if (!sourceUserId || !targetUserId) {
      const error = new Error('Both the terminated user and transfer user are required');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    if (sourceUserId === targetUserId) {
      const error = new Error('Transfer user must be different from the terminated user');
      error.code = 'VALIDATION_ERROR';
      error.statusCode = 400;
      throw error;
    }

    return prisma.$transaction(async (tx) => {
      const [sourceUser, targetUser] = await Promise.all([
        tx.user.findUnique({
          where: { id: sourceUserId },
        }),
        tx.user.findUnique({
          where: { id: targetUserId },
        }),
      ]);

      if (!sourceUser || !targetUser) {
        const error = new Error('User not found');
        error.code = 'NOT_FOUND';
        throw error;
      }

      if (!sourceUser.isActive || sourceUser.status === 'TERMINATED') {
        const error = new Error('This user is already inactive or terminated');
        error.code = 'VALIDATION_ERROR';
        error.statusCode = 400;
        throw error;
      }

      if (!targetUser.isActive || targetUser.status === 'TERMINATED') {
        const error = new Error('Transfer user must be active');
        error.code = 'VALIDATION_ERROR';
        error.statusCode = 400;
        throw error;
      }

      const [
        accountsTransferred,
        leadsTransferred,
        jobsTransferred,
        jobsProjectManagedTransferred,
        jobsOnboardedTransferred,
        jobsApprovedTransferred,
        jobsExpeditedTransferred,
        appointmentsTransferred,
        tasksTransferred,
        quotesTransferred,
        documentsTransferred,
        conversationsTransferred,
        contractsOwnedTransferred,
        contractsManagedTransferred,
        contractsRegionalTransferred,
        contractsDirectedTransferred,
        contractsExecutiveTransferred,
        managerReportsTransferred,
        directorReportsTransferred,
        regionalReportsTransferred,
        executiveReportsTransferred,
      ] = await Promise.all([
        tx.account.updateMany({
          where: { ownerId: sourceUser.id },
          data: { ownerId: targetUser.id },
        }),
        tx.lead.updateMany({
          where: { ownerId: sourceUser.id },
          data: { ownerId: targetUser.id },
        }),
        tx.opportunity.updateMany({
          where: { ownerId: sourceUser.id },
          data: { ownerId: targetUser.id },
        }),
        tx.opportunity.updateMany({
          where: { projectManagerId: sourceUser.id },
          data: { projectManagerId: targetUser.id },
        }),
        tx.opportunity.updateMany({
          where: { onboardedById: sourceUser.id },
          data: { onboardedById: targetUser.id },
        }),
        tx.opportunity.updateMany({
          where: { approvedById: sourceUser.id },
          data: { approvedById: targetUser.id },
        }),
        tx.opportunity.updateMany({
          where: { projectExpeditorId: sourceUser.id },
          data: { projectExpeditorId: targetUser.id },
        }),
        tx.event.updateMany({
          where: { ownerId: sourceUser.id },
          data: { ownerId: targetUser.id },
        }),
        tx.task.updateMany({
          where: { assignedToId: sourceUser.id },
          data: { assignedToId: targetUser.id },
        }),
        tx.quote.updateMany({
          where: { owner_id: sourceUser.id },
          data: { owner_id: targetUser.id },
        }),
        tx.document.updateMany({
          where: { ownerId: sourceUser.id },
          data: { ownerId: targetUser.id },
        }),
        tx.conversation.updateMany({
          where: { assignedUserId: sourceUser.id },
          data: { assignedUserId: targetUser.id },
        }),
        tx.serviceContract.updateMany({
          where: { ownerId: sourceUser.id },
          data: { ownerId: targetUser.id },
        }),
        tx.serviceContract.updateMany({
          where: { managerId: sourceUser.id },
          data: { managerId: targetUser.id },
        }),
        tx.serviceContract.updateMany({
          where: { regionalManagerId: sourceUser.id },
          data: { regionalManagerId: targetUser.id },
        }),
        tx.serviceContract.updateMany({
          where: { directorId: sourceUser.id },
          data: { directorId: targetUser.id },
        }),
        tx.serviceContract.updateMany({
          where: { executiveId: sourceUser.id },
          data: { executiveId: targetUser.id },
        }),
        tx.user.updateMany({
          where: { managerId: sourceUser.id },
          data: { managerId: targetUser.id },
        }),
        tx.user.updateMany({
          where: { directorId: sourceUser.id },
          data: { directorId: targetUser.id },
        }),
        tx.user.updateMany({
          where: { regionalManagerId: sourceUser.id },
          data: { regionalManagerId: targetUser.id },
        }),
        tx.user.updateMany({
          where: { executiveId: sourceUser.id },
          data: { executiveId: targetUser.id },
        }),
      ]);

      await tx.user.update({
        where: { id: sourceUser.id },
        data: {
          isActive: false,
          status: 'TERMINATED',
          updatedAt: new Date(),
        },
      });

      const terminatedUser = await tx.user.findUnique({
        where: { id: sourceUser.id },
        include: {
          role: {
            select: { id: true, name: true, roleType: true },
          },
          manager: {
            select: { id: true, fullName: true, firstName: true, lastName: true },
          },
          director: {
            select: { id: true, fullName: true, firstName: true, lastName: true },
          },
          regionalManager: {
            select: { id: true, fullName: true, firstName: true, lastName: true },
          },
          executive: {
            select: { id: true, fullName: true, firstName: true, lastName: true },
          },
          identityLink: true,
        },
      });

      logger.info(`User terminated and transferred: ${sourceUser.id} -> ${targetUser.id}`);

      return {
        terminatedUserId: sourceUser.id,
        transferToUserId: targetUser.id,
        transferSummary: {
          accounts: accountsTransferred.count,
          leads: leadsTransferred.count,
          jobsOwned: jobsTransferred.count,
          jobsProjectManaged: jobsProjectManagedTransferred.count,
          jobsOnboarded: jobsOnboardedTransferred.count,
          jobsApproved: jobsApprovedTransferred.count,
          jobsExpedited: jobsExpeditedTransferred.count,
          appointments: appointmentsTransferred.count,
          tasks: tasksTransferred.count,
          quotes: quotesTransferred.count,
          documents: documentsTransferred.count,
          conversations: conversationsTransferred.count,
          contractsOwned: contractsOwnedTransferred.count,
          contractsManaged: contractsManagedTransferred.count,
          contractsRegional: contractsRegionalTransferred.count,
          contractsDirected: contractsDirectedTransferred.count,
          contractsExecutive: contractsExecutiveTransferred.count,
          hierarchyReferences:
            managerReportsTransferred.count +
            directorReportsTransferred.count +
            regionalReportsTransferred.count +
            executiveReportsTransferred.count,
        },
        user: terminatedUser,
      };
    });
  },
};

export default userService;
