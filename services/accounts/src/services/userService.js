// User Service - Business Logic for User Management
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

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

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
      where,
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
      take: 100,
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
