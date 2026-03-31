// User Service - Business Logic for User Management
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://auth-service:3000';
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

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

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { employeeNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (status) {
      where.status = status;
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
    return createdUser;
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
        manager: {
          select: { id: true, fullName: true },
        },
        director: {
          select: { id: true, fullName: true },
        },
      },
    });

    logger.info(`User updated: ${id}`);
    return updated;
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
    const [total, active, inactive, byDepartment, byOffice] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: false } }),
      prisma.user.groupBy({
        by: ['department'],
        _count: { id: true },
        where: { department: { not: null } },
      }),
      prisma.user.groupBy({
        by: ['officeAssignment'],
        _count: { id: true },
        where: { officeAssignment: { not: null } },
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
