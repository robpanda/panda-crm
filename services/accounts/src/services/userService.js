// User Service - Business Logic for User Management
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

const uniqueIds = (ids = []) => [...new Set((ids || []).filter(Boolean).map((id) => String(id).trim()).filter(Boolean))];
const PANDA_EMPLOYEE_EMAIL_DOMAINS = new Set(['pandaexteriors.com', 'panda-exteriors.com']);

const userDisplayName = (user = {}) => {
  return user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || user.id;
};

const buildEmailLookupCandidates = (email) => {
  if (typeof email !== 'string') return [];

  const trimmed = email.trim();
  if (!trimmed) return [];

  const candidates = [];
  const seen = new Set();

  const addCandidate = (value) => {
    const candidate = String(value || '').trim();
    if (!candidate) return;
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  const lowerEmail = trimmed.toLowerCase();
  addCandidate(trimmed);
  addCandidate(lowerEmail);

  const atIndex = lowerEmail.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === lowerEmail.length - 1) {
    return candidates;
  }

  const localPart = lowerEmail.slice(0, atIndex);
  const domainPart = lowerEmail.slice(atIndex + 1);
  addCandidate(`${localPart}@${domainPart}`);

  if (PANDA_EMPLOYEE_EMAIL_DOMAINS.has(domainPart)) {
    const dotlessLocalPart = localPart.replace(/\./g, '');
    for (const domain of PANDA_EMPLOYEE_EMAIL_DOMAINS) {
      addCandidate(`${localPart}@${domain}`);
      addCandidate(`${dotlessLocalPart}@${domain}`);
    }
  }

  return candidates;
};

const getEmailMatchRank = (email, rankedCandidates) => {
  const normalized = String(email || '').toLowerCase();
  const rank = rankedCandidates.indexOf(normalized);
  return rank === -1 ? Number.MAX_SAFE_INTEGER : rank;
};

const transferAssignments = async (tx, sourceUserIds, targetUserId) => {
  const sourceIds = uniqueIds(sourceUserIds);
  if (!sourceIds.length) {
    return {
      leads: 0,
      leadSelfGen: 0,
      opportunities: 0,
      opportunityProjectManagers: 0,
      appointments: 0,
      tasks: 0,
      accounts: 0,
      commissions: 0,
      serviceContracts: 0,
      attentionItems: 0,
      photoProjects: 0,
      territories: 0,
      supportTickets: 0,
      managerReports: 0,
      directorReports: 0,
      regionalReports: 0,
      executiveReports: 0,
      total: 0,
    };
  }

  const [
    leads,
    leadSelfGen,
    opportunities,
    opportunityProjectManagers,
    appointments,
    tasks,
    accounts,
    commissions,
    serviceContracts,
    attentionItems,
    photoProjects,
    territories,
    supportTickets,
    managerReports,
    directorReports,
    regionalReports,
    executiveReports,
  ] = await Promise.all([
    tx.lead.updateMany({
      where: { ownerId: { in: sourceIds } },
      data: { ownerId: targetUserId },
    }),
    tx.lead.updateMany({
      where: { selfGenRepId: { in: sourceIds } },
      data: { selfGenRepId: targetUserId },
    }),
    tx.opportunity.updateMany({
      where: { ownerId: { in: sourceIds } },
      data: { ownerId: targetUserId },
    }),
    tx.opportunity.updateMany({
      where: { projectManagerId: { in: sourceIds } },
      data: { projectManagerId: targetUserId },
    }),
    tx.event.updateMany({
      where: { ownerId: { in: sourceIds } },
      data: { ownerId: targetUserId },
    }),
    tx.task.updateMany({
      where: { assignedToId: { in: sourceIds } },
      data: { assignedToId: targetUserId },
    }),
    tx.account.updateMany({
      where: { ownerId: { in: sourceIds } },
      data: { ownerId: targetUserId },
    }),
    tx.commission.updateMany({
      where: { ownerId: { in: sourceIds } },
      data: { ownerId: targetUserId },
    }),
    tx.serviceContract.updateMany({
      where: { ownerId: { in: sourceIds } },
      data: { ownerId: targetUserId },
    }),
    tx.attentionItem.updateMany({
      where: { assignedToId: { in: sourceIds } },
      data: { assignedToId: targetUserId },
    }),
    tx.photoProject.updateMany({
      where: { ownerId: { in: sourceIds } },
      data: { ownerId: targetUserId },
    }),
    tx.territory.updateMany({
      where: { ownerId: { in: sourceIds } },
      data: { ownerId: targetUserId },
    }),
    tx.support_tickets.updateMany({
      where: { assigned_to_id: { in: sourceIds } },
      data: { assigned_to_id: targetUserId },
    }),
    tx.user.updateMany({
      where: { managerId: { in: sourceIds } },
      data: { managerId: targetUserId },
    }),
    tx.user.updateMany({
      where: { directorId: { in: sourceIds } },
      data: { directorId: targetUserId },
    }),
    tx.user.updateMany({
      where: { regionalManagerId: { in: sourceIds } },
      data: { regionalManagerId: targetUserId },
    }),
    tx.user.updateMany({
      where: { executiveId: { in: sourceIds } },
      data: { executiveId: targetUserId },
    }),
  ]);

  const summary = {
    leads: leads.count,
    leadSelfGen: leadSelfGen.count,
    opportunities: opportunities.count,
    opportunityProjectManagers: opportunityProjectManagers.count,
    appointments: appointments.count,
    tasks: tasks.count,
    accounts: accounts.count,
    commissions: commissions.count,
    serviceContracts: serviceContracts.count,
    attentionItems: attentionItems.count,
    photoProjects: photoProjects.count,
    territories: territories.count,
    supportTickets: supportTickets.count,
    managerReports: managerReports.count,
    directorReports: directorReports.count,
    regionalReports: regionalReports.count,
    executiveReports: executiveReports.count,
  };

  summary.total = Object.values(summary).reduce((acc, val) => acc + val, 0);
  return summary;
};

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
      const normalizedStatus = String(status).toLowerCase();
      if (normalizedStatus === 'true' || normalizedStatus === 'false') {
        where.isActive = normalizedStatus === 'true';
      } else {
        where.status = status;
      }
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
    const emailCandidates = buildEmailLookupCandidates(email);
    if (!emailCandidates.length) {
      const error = new Error('User not found');
      error.code = 'NOT_FOUND';
      throw error;
    }
    const rankedCandidates = emailCandidates.map((candidate) => candidate.toLowerCase());

    const users = await prisma.user.findMany({
      where: {
        OR: emailCandidates.map((candidate) => ({
          email: {
            equals: candidate,
            mode: 'insensitive',
          },
        })),
      },
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
    const user = users.sort((a, b) => {
      const rankA = getEmailMatchRank(a.email, rankedCandidates);
      const rankB = getEmailMatchRank(b.email, rankedCandidates);
      if (rankA !== rankB) return rankA - rankB;
      if (a.isActive !== b.isActive) return Number(b.isActive) - Number(a.isActive);

      const updatedAtA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const updatedAtB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return updatedAtB - updatedAtA;
    })[0];

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

  /**
   * Terminate user and transfer active ownership assignments
   */
  async terminateUser(userId, { transferToUserId, reason } = {}) {
    if (!transferToUserId) {
      const error = new Error('transferToUserId is required');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (transferToUserId === userId) {
      const error = new Error('Cannot transfer ownership to the same user');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const [user, transferUser] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, fullName: true, firstName: true, lastName: true, isActive: true, status: true },
      }),
      prisma.user.findUnique({
        where: { id: transferToUserId },
        select: { id: true, email: true, fullName: true, firstName: true, lastName: true, isActive: true },
      }),
    ]);

    if (!user) {
      const error = new Error('User not found');
      error.code = 'NOT_FOUND';
      throw error;
    }

    if (!transferUser || !transferUser.isActive) {
      const error = new Error('Transfer owner must be an active user');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const reassignmentSummary = await prisma.$transaction(async (tx) => {
      const summary = await transferAssignments(tx, [userId], transferToUserId);

      await tx.user.update({
        where: { id: userId },
        data: {
          isActive: false,
          status: 'TERMINATED',
        },
      });

      return summary;
    });

    logger.info('User terminated and assignments transferred', {
      userId,
      transferToUserId,
      reason: reason || null,
      reassignmentSummary,
    });

    return {
      userId,
      transferToUserId,
      terminatedUser: {
        id: user.id,
        email: user.email,
        name: userDisplayName(user),
      },
      transferUser: {
        id: transferUser.id,
        email: transferUser.email,
        name: userDisplayName(transferUser),
      },
      reason: reason || null,
      reassignmentSummary,
    };
  },

  /**
   * Merge duplicate users into a selected master user.
   * Master remains active and duplicate records are deactivated.
   */
  async mergeUsers({ masterUserId, duplicateUserIds, reason } = {}) {
    const duplicates = uniqueIds(duplicateUserIds);

    if (!masterUserId) {
      const error = new Error('masterUserId is required');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (!duplicates.length) {
      const error = new Error('duplicateUserIds must include at least one user');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    if (duplicates.includes(masterUserId)) {
      const error = new Error('masterUserId cannot be included in duplicateUserIds');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }

    const allUserIds = uniqueIds([masterUserId, ...duplicates]);
    const users = await prisma.user.findMany({
      where: { id: { in: allUserIds } },
      select: {
        id: true,
        email: true,
        fullName: true,
        firstName: true,
        lastName: true,
        isActive: true,
        status: true,
      },
    });

    if (users.length !== allUserIds.length) {
      const foundIds = new Set(users.map((u) => u.id));
      const missingIds = allUserIds.filter((id) => !foundIds.has(id));
      const error = new Error(`Some users were not found: ${missingIds.join(', ')}`);
      error.code = 'NOT_FOUND';
      throw error;
    }

    const masterUser = users.find((u) => u.id === masterUserId);
    const duplicateUsers = users.filter((u) => duplicates.includes(u.id));

    const reassignmentSummary = await prisma.$transaction(async (tx) => {
      const summary = await transferAssignments(tx, duplicates, masterUserId);

      await tx.user.update({
        where: { id: masterUserId },
        data: {
          isActive: true,
          status: 'ACTIVE',
        },
      });

      await tx.user.updateMany({
        where: { id: { in: duplicates } },
        data: {
          isActive: false,
          status: 'INACTIVE',
        },
      });

      return summary;
    });

    logger.info('Users merged into master user', {
      masterUserId,
      duplicateUserIds: duplicates,
      reason: reason || null,
      reassignmentSummary,
    });

    return {
      masterUser: {
        id: masterUser.id,
        email: masterUser.email,
        name: userDisplayName(masterUser),
      },
      mergedUsers: duplicateUsers.map((user) => ({
        id: user.id,
        email: user.email,
        name: userDisplayName(user),
      })),
      reason: reason || null,
      reassignmentSummary,
    };
  },
};

export default userService;
