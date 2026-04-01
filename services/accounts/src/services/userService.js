// User Service - Business Logic for User Management
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

// The live accounts Prisma client does not expose a User.identityLink relation.
// Build the admin Cognito view from the existing user record instead of querying
// a relation that is absent in production.
const USER_IDENTITY_INCLUDE = {};

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

function trimToNull(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(value) {
  const trimmed = trimToNull(value);
  return trimmed ? trimmed.toLowerCase() : null;
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function booleanOrDefault(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return Boolean(value);
}

function dateOnlyOrNull(value) {
  const trimmed = trimToNull(value);
  if (!trimmed) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T12:00:00.000Z`)
    : new Date(trimmed);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

function buildFullName(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(' ').trim() || null;
}

function buildServiceError(message, statusCode = 500, code = 'INTERNAL_ERROR') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

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

function buildIdentityLinkView(user) {
  if (!user?.cognitoId) {
    return null;
  }

  const normalizedEmail = normalizeEmail(user.email);

  return {
    id: user.cognitoId,
    cognitoSub: user.cognitoId,
    cognitoUsername: normalizedEmail || user.email || null,
    emailNormalized: normalizedEmail,
    authProvider: 'cognito',
    linkState: 'LINKED',
    repairState: null,
    repairReason: null,
    lastVerifiedAt: null,
    lastLoginAt: null,
    lastReconciledAt: null,
    updatedAt: user.updatedAt || null,
  };
}

function hydrateUserIdentity(user) {
  if (!user) {
    return user;
  }

  return {
    ...user,
    identityLink: user.identityLink ?? buildIdentityLinkView(user),
  };
}

function hydrateUserCollection(users) {
  return Array.isArray(users) ? users.map(hydrateUserIdentity) : [];
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
      data: hydrateUserCollection(users),
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

    return hydrateUserIdentity(user);
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

    return hydrateUserIdentity(user);
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

    return hydrateUserIdentity(user);
  },

  /**
   * Create user in Cognito and local database
   */
  async createUser(data) {
    const email = normalizeEmail(data.email);
    const firstName = trimToNull(data.firstName);
    const lastName = trimToNull(data.lastName);
    const password = data.password;
    const roleId = trimToNull(data.roleId);
    const managerId = trimToNull(data.managerId);
    const directorId = trimToNull(data.directorId);
    const regionalManagerId = trimToNull(data.regionalManagerId);
    const executiveId = trimToNull(data.executiveId);

    if (!email || !firstName || !lastName || !password) {
      throw buildServiceError('Email, first name, last name, and password are required', 400, 'VALIDATION_ERROR');
    }

    if (password.length < 8) {
      throw buildServiceError('Password must be at least 8 characters', 400, 'VALIDATION_ERROR');
    }

    const [existingUser, role] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      roleId
        ? prisma.role.findUnique({
            where: { id: roleId },
            select: { id: true, name: true, roleType: true },
          })
        : Promise.resolve(null),
    ]);

    if (existingUser) {
      throw buildServiceError('A user with this email already exists', 409, 'DUPLICATE_ENTRY');
    }

    if (roleId && !role) {
      throw buildServiceError('Selected role was not found', 400, 'VALIDATION_ERROR');
    }

    const hierarchyIds = [managerId, directorId, regionalManagerId, executiveId].filter(Boolean);
    if (hierarchyIds.length) {
      const hierarchyUsers = await prisma.user.findMany({
        where: { id: { in: hierarchyIds } },
        select: { id: true },
      });
      const foundIds = new Set(hierarchyUsers.map((user) => user.id));
      const missingIds = hierarchyIds.filter((id) => !foundIds.has(id));
      if (missingIds.length) {
        throw buildServiceError('One or more reporting hierarchy users could not be found', 400, 'VALIDATION_ERROR');
      }
    }

    if (!INTERNAL_API_KEY) {
      throw buildServiceError('INTERNAL_API_KEY is not configured for user creation', 500, 'CONFIGURATION_ERROR');
    }

    let authResponse;
    try {
      authResponse = await fetch(`${AUTH_SERVICE_URL}/api/auth/admin/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': INTERNAL_API_KEY,
        },
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          password,
          role: role?.roleType || role?.name || null,
          department: trimToNull(data.department),
          salesforceId: trimToNull(data.salesforceId),
        }),
      });
    } catch (error) {
      throw buildServiceError(`Failed to reach auth service: ${error.message}`, 502, 'AUTH_SERVICE_UNAVAILABLE');
    }

    const authPayload = await authResponse.json().catch(() => null);
    if (!authResponse.ok) {
      throw buildServiceError(
        authPayload?.error?.message || 'Failed to create Cognito user',
        authResponse.status,
        authPayload?.error?.code || 'AUTH_SERVICE_ERROR'
      );
    }

    const cognitoId = authPayload?.data?.user?.sub || authPayload?.data?.cognitoId || null;

    const createdUser = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        fullName: buildFullName(firstName, lastName),
        cognitoId,
        roleId,
        phone: trimToNull(data.phone),
        mobilePhone: trimToNull(data.mobilePhone),
        isActive: booleanOrDefault(data.isActive, true),
        status: trimToNull(data.status) || (booleanOrDefault(data.isActive, true) ? 'ACTIVE' : 'INACTIVE'),
        department: trimToNull(data.department),
        division: trimToNull(data.division),
        title: trimToNull(data.title),
        employeeNumber: trimToNull(data.employeeNumber),
        officeAssignment: trimToNull(data.officeAssignment),
        startDate: dateOnlyOrNull(data.startDate),
        salesforceId: trimToNull(data.salesforceId),
        managerId,
        directorId,
        regionalManagerId,
        executiveId,
        companyLeadRate: numberOrNull(data.companyLeadRate),
        preCommissionRate: numberOrNull(data.preCommissionRate),
        selfGenRate: numberOrNull(data.selfGenRate),
        commissionRate: numberOrNull(data.commissionRate),
        overridePercent: numberOrNull(data.overridePercent),
        supplementsCommissionable: booleanOrDefault(data.supplementsCommissionable, false),
        x5050CommissionSplit: booleanOrDefault(data.x5050CommissionSplit, false),
      },
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
    });

    logger.info(`User created: ${createdUser.id}`);
    return hydrateUserIdentity(createdUser);
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
    return hydrateUserIdentity(updated);
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
        }),
        tx.user.findUnique({
          where: { id: targetUserId },
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
          },
        }),
      ]);

      if (!sourceUser || !targetUser) {
        const error = new Error('User not found');
        error.code = 'NOT_FOUND';
        throw error;
      }

      const mergedData = buildMergedUserData(targetUser, sourceUser);
      const targetKeepsExistingIdentity = Boolean(targetUser.cognitoId);

      if (targetKeepsExistingIdentity && mergedData.cognitoId) {
        delete mergedData.cognitoId;
      }

      if (Object.keys(mergedData).length > 0) {
        await tx.user.update({
          where: { id: targetUser.id },
          data: mergedData,
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
        },
      });

      logger.info(`User merged: ${sourceUser.id} -> ${targetUser.id}`);

      return {
        mergedUserId: sourceUser.id,
        parentUserId: targetUser.id,
        user: hydrateUserIdentity(updatedTarget),
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
        tx.account.updateMany({ where: { ownerId: sourceUser.id }, data: { ownerId: targetUser.id } }),
        tx.lead.updateMany({ where: { ownerId: sourceUser.id }, data: { ownerId: targetUser.id } }),
        tx.opportunity.updateMany({ where: { ownerId: sourceUser.id }, data: { ownerId: targetUser.id } }),
        tx.opportunity.updateMany({ where: { projectManagerId: sourceUser.id }, data: { projectManagerId: targetUser.id } }),
        tx.opportunity.updateMany({ where: { onboardedById: sourceUser.id }, data: { onboardedById: targetUser.id } }),
        tx.opportunity.updateMany({ where: { approvedById: sourceUser.id }, data: { approvedById: targetUser.id } }),
        tx.opportunity.updateMany({ where: { projectExpeditorId: sourceUser.id }, data: { projectExpeditorId: targetUser.id } }),
        tx.event.updateMany({ where: { ownerId: sourceUser.id }, data: { ownerId: targetUser.id } }),
        tx.task.updateMany({ where: { assignedToId: sourceUser.id }, data: { assignedToId: targetUser.id } }),
        tx.quote.updateMany({ where: { owner_id: sourceUser.id }, data: { owner_id: targetUser.id } }),
        tx.document.updateMany({ where: { ownerId: sourceUser.id }, data: { ownerId: targetUser.id } }),
        tx.message.updateMany({ where: { user_id: sourceUser.id }, data: { user_id: targetUser.id } }),
        tx.serviceContract.updateMany({ where: { ownerId: sourceUser.id }, data: { ownerId: targetUser.id } }),
        tx.serviceContract.updateMany({ where: { managerId: sourceUser.id }, data: { managerId: targetUser.id } }),
        tx.serviceContract.updateMany({ where: { regionalManagerId: sourceUser.id }, data: { regionalManagerId: targetUser.id } }),
        tx.serviceContract.updateMany({ where: { directorId: sourceUser.id }, data: { directorId: targetUser.id } }),
        tx.serviceContract.updateMany({ where: { executiveId: sourceUser.id }, data: { executiveId: targetUser.id } }),
        tx.user.updateMany({ where: { managerId: sourceUser.id }, data: { managerId: targetUser.id } }),
        tx.user.updateMany({ where: { directorId: sourceUser.id }, data: { directorId: targetUser.id } }),
        tx.user.updateMany({ where: { regionalManagerId: sourceUser.id }, data: { regionalManagerId: targetUser.id } }),
        tx.user.updateMany({ where: { executiveId: sourceUser.id }, data: { executiveId: targetUser.id } }),
      ]);

      if (sourceUser.cognitoId) {
        await tx.user.update({
          where: { id: sourceUser.id },
          data: {
            cognitoId: null,
          },
        });
      }

      const terminatedUser = await tx.user.update({
        where: { id: sourceUser.id },
        data: {
          isActive: false,
          status: 'TERMINATED',
          updatedAt: new Date(),
        },
      });

      logger.info(`User terminated and transferred: ${sourceUser.id} -> ${targetUser.id}`);

      const updatedTarget = await tx.user.findUnique({
        where: { id: targetUser.id },
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
      });

      return {
        terminatedUserId: terminatedUser.id,
        transferToUserId: targetUser.id,
        transferredCounts: {
          accounts: accountsTransferred.count,
          leads: leadsTransferred.count,
          jobs: jobsTransferred.count,
          projectManagedJobs: jobsProjectManagedTransferred.count,
          onboardedJobs: jobsOnboardedTransferred.count,
          approvedJobs: jobsApprovedTransferred.count,
          expeditedJobs: jobsExpeditedTransferred.count,
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
          managerReports: managerReportsTransferred.count,
          directorReports: directorReportsTransferred.count,
          regionalReports: regionalReportsTransferred.count,
          executiveReports: executiveReportsTransferred.count,
        },
        user: hydrateUserIdentity(updatedTarget),
      };
    });
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
};

export default userService;
