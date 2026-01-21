// Permission Service - Role-Based Access Control (RBAC) for Panda CRM
// Handles permission checking, role management, and access control

import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

// Default permissions for system roles
const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: {
    // Full access to everything
    accounts: ['create', 'read', 'update', 'delete', 'export', 'assign'],
    contacts: ['create', 'read', 'update', 'delete', 'export'],
    leads: ['create', 'read', 'update', 'delete', 'export', 'assign'],
    opportunities: ['create', 'read', 'update', 'delete', 'export', 'assign'],
    quotes: ['create', 'read', 'update', 'delete', 'approve'],
    orders: ['create', 'read', 'update', 'delete'],
    invoices: ['create', 'read', 'update', 'delete', 'approve'],
    payments: ['create', 'read', 'update', 'delete'],
    workorders: ['create', 'read', 'update', 'delete', 'assign'],
    appointments: ['create', 'read', 'update', 'delete', 'assign'],
    cases: ['create', 'read', 'update', 'delete', 'assign'],
    commissions: ['create', 'read', 'update', 'delete', 'approve'],
    workflows: ['create', 'read', 'update', 'delete'],
    templates: ['create', 'read', 'update', 'delete'],
    order_templates: ['create', 'read', 'update', 'delete'],
    labor_orders: ['create', 'read', 'update', 'delete'],
    material_orders: ['create', 'read', 'update', 'delete'],
    agreements: ['create', 'read', 'update', 'delete'],
    campaigns: ['create', 'read', 'update', 'delete'],
    users: ['create', 'read', 'update', 'delete'],
    roles: ['create', 'read', 'update', 'delete'],
    settings: ['read', 'update'],
    reports: ['read', 'export'],
    audit_logs: ['read', 'export'],
    integrations: ['read', 'update'],
  },

  admin: {
    // Most access except role/user management
    accounts: ['create', 'read', 'update', 'delete', 'export', 'assign'],
    contacts: ['create', 'read', 'update', 'delete', 'export'],
    leads: ['create', 'read', 'update', 'delete', 'export', 'assign'],
    opportunities: ['create', 'read', 'update', 'delete', 'export', 'assign'],
    quotes: ['create', 'read', 'update', 'delete', 'approve'],
    orders: ['create', 'read', 'update', 'delete'],
    invoices: ['create', 'read', 'update', 'delete', 'approve'],
    payments: ['create', 'read', 'update', 'delete'],
    workorders: ['create', 'read', 'update', 'delete', 'assign'],
    appointments: ['create', 'read', 'update', 'delete', 'assign'],
    cases: ['create', 'read', 'update', 'delete', 'assign'],
    commissions: ['read', 'approve'],
    workflows: ['create', 'read', 'update', 'delete'],
    templates: ['create', 'read', 'update', 'delete'],
    order_templates: ['create', 'read', 'update', 'delete'],
    labor_orders: ['create', 'read', 'update', 'delete'],
    material_orders: ['create', 'read', 'update', 'delete'],
    agreements: ['create', 'read', 'update', 'delete'],
    campaigns: ['create', 'read', 'update', 'delete'],
    users: ['read', 'update'],
    roles: ['read'],
    settings: ['read', 'update'],
    reports: ['read', 'export'],
    audit_logs: ['read'],
    integrations: ['read', 'update'],
  },

  sales_manager: {
    accounts: ['create', 'read', 'update', 'export', 'assign'],
    contacts: ['create', 'read', 'update', 'export'],
    leads: ['create', 'read', 'update', 'export', 'assign'],
    opportunities: ['create', 'read', 'update', 'export', 'assign'],
    quotes: ['create', 'read', 'update', 'approve'],
    orders: ['read'],
    invoices: ['read'],
    payments: ['read'],
    workorders: ['read'],
    appointments: ['read'],
    commissions: ['read'],
    templates: ['read'],
    agreements: ['create', 'read', 'update'],
    campaigns: ['create', 'read', 'update'],
    reports: ['read', 'export'],
  },

  sales_rep: {
    // Access to own records
    accounts: ['create', 'read', 'update'],
    contacts: ['create', 'read', 'update'],
    leads: ['create', 'read', 'update'],
    opportunities: ['create', 'read', 'update'],
    quotes: ['create', 'read', 'update'],
    workorders: ['read'],
    appointments: ['read'],
    commissions: ['read'], // Own commissions only
    templates: ['read'],
    agreements: ['create', 'read'],
    reports: ['read'],
  },

  project_manager: {
    accounts: ['read', 'update'],
    contacts: ['read', 'update'],
    opportunities: ['read', 'update'],
    quotes: ['read'],
    orders: ['create', 'read', 'update'],
    invoices: ['read', 'update'],
    payments: ['create', 'read'],
    workorders: ['create', 'read', 'update', 'assign'],
    appointments: ['create', 'read', 'update', 'assign'],
    commissions: ['read'],
    templates: ['read'],
    order_templates: ['read'],
    labor_orders: ['create', 'read', 'update'],
    material_orders: ['create', 'read', 'update'],
    agreements: ['create', 'read', 'update'],
    reports: ['read'],
    cases: ['create', 'read', 'update'],
  },

  project_expeditor: {
    // Project Expeditor - handles HOA, PII, Permits, Change Orders, Ad Hoc cases
    accounts: ['read', 'update'],
    contacts: ['read', 'update'],
    opportunities: ['read', 'update'], // Update for expediting checklist fields
    quotes: ['read'],
    orders: ['read'],
    invoices: ['read'],
    workorders: ['read', 'update'],
    appointments: ['read', 'update'],
    commissions: ['read'],
    templates: ['read'],
    agreements: ['create', 'read', 'update'], // For change orders
    cases: ['create', 'read', 'update'], // Create and manage HOA, PII, Permit, Ad Hoc cases
    reports: ['read'],
  },

  project_coordinator: {
    // Project Coordinator - handles material & labor orders (almost anyone except call center)
    accounts: ['read', 'update'],
    contacts: ['read', 'update'],
    opportunities: ['read', 'update'],
    quotes: ['read', 'update'],
    orders: ['create', 'read', 'update'], // Material orders
    invoices: ['read'],
    workorders: ['create', 'read', 'update'], // Create work orders
    appointments: ['create', 'read', 'update'],
    commissions: ['read'],
    templates: ['read'],
    order_templates: ['read'], // Access to order templates
    labor_orders: ['create', 'read', 'update'], // Create labor orders
    material_orders: ['create', 'read', 'update'], // Create material orders
    agreements: ['read'],
    reports: ['read'],
  },

  field_technician: {
    accounts: ['read'],
    contacts: ['read'],
    opportunities: ['read'],
    workorders: ['read', 'update'],
    appointments: ['read', 'update'],
    templates: ['read'],
  },

  call_center: {
    accounts: ['read'],
    contacts: ['create', 'read', 'update'],
    leads: ['create', 'read', 'update'],
    opportunities: ['read'],
    appointments: ['read'],
    templates: ['read'],
    campaigns: ['read'],
  },

  accounting: {
    accounts: ['read'],
    opportunities: ['read'],
    quotes: ['read'],
    orders: ['read'],
    invoices: ['create', 'read', 'update', 'delete', 'approve'],
    payments: ['create', 'read', 'update', 'delete'],
    commissions: ['read', 'approve'],
    reports: ['read', 'export'],
  },

  viewer: {
    // Read-only access
    accounts: ['read'],
    contacts: ['read'],
    leads: ['read'],
    opportunities: ['read'],
    quotes: ['read'],
    orders: ['read'],
    invoices: ['read'],
    workorders: ['read'],
    appointments: ['read'],
    reports: ['read'],
  },

  // Mobile App Roles
  bdr: {
    // Business Development Rep (Door Knocker) - Mobile App
    leads: ['create', 'read', 'update'],
    accounts: ['read'],
    contacts: ['create', 'read', 'update'],
    opportunities: ['read'],
    appointments: ['read'],
    mobile_app: ['access', 'knocker_view'],
  },

  bdr_manager: {
    // BDR Manager - Mobile App with team oversight
    leads: ['create', 'read', 'update', 'assign', 'export'],
    accounts: ['read', 'update'],
    contacts: ['create', 'read', 'update'],
    opportunities: ['read', 'update'],
    appointments: ['read'],
    users: ['read'], // View team members
    reports: ['read'],
    mobile_app: ['access', 'knocker_view', 'manager_view', 'team_stats'],
  },

  mobile_sales: {
    // Mobile Sales Rep - Insurance/Retail field sales
    leads: ['create', 'read', 'update'],
    accounts: ['create', 'read', 'update'],
    contacts: ['create', 'read', 'update'],
    opportunities: ['create', 'read', 'update'],
    quotes: ['create', 'read', 'update'],
    appointments: ['create', 'read', 'update'],
    workorders: ['read'],
    agreements: ['create', 'read'],
    templates: ['read'],
    mobile_app: ['access', 'sales_view'],
  },

  mobile_sales_manager: {
    // Mobile Sales Manager - Field sales with team management
    leads: ['create', 'read', 'update', 'assign', 'export'],
    accounts: ['create', 'read', 'update', 'assign'],
    contacts: ['create', 'read', 'update'],
    opportunities: ['create', 'read', 'update', 'assign', 'export'],
    quotes: ['create', 'read', 'update', 'approve'],
    appointments: ['create', 'read', 'update', 'assign'],
    workorders: ['read', 'update'],
    commissions: ['read'],
    agreements: ['create', 'read', 'update'],
    templates: ['read'],
    users: ['read'], // View team members
    reports: ['read', 'export'],
    mobile_app: ['access', 'sales_view', 'manager_view', 'team_stats'],
  },
};

// Record-level permission conditions
const RECORD_LEVEL_CONDITIONS = {
  // Sales reps can only see their own records
  sales_rep: {
    accounts: { ownerId: '$currentUser' },
    leads: { ownerId: '$currentUser' },
    opportunities: { ownerId: '$currentUser' },
    commissions: { ownerId: '$currentUser' },
  },

  // Project managers see records in their territory or assigned to them
  project_manager: {
    workorders: { OR: [{ assignedToId: '$currentUser' }, { territory: '$userTerritory' }] },
    appointments: { OR: [{ assignedResourceId: '$currentUser' }, { territory: '$userTerritory' }] },
  },

  // Field technicians see only assigned work
  field_technician: {
    workorders: { assignedResourceId: '$currentUser' },
    appointments: { assignedResourceId: '$currentUser' },
  },

  // BDR (Door Knocker) - own leads only
  bdr: {
    leads: { ownerId: '$currentUser' },
    contacts: { createdById: '$currentUser' },
  },

  // BDR Manager - team leads (by territory or direct reports)
  bdr_manager: {
    leads: { OR: [{ ownerId: '$currentUser' }, { territory: '$userTerritory' }] },
  },

  // Mobile Sales - own records
  mobile_sales: {
    leads: { ownerId: '$currentUser' },
    accounts: { ownerId: '$currentUser' },
    opportunities: { ownerId: '$currentUser' },
  },

  // Mobile Sales Manager - team records
  mobile_sales_manager: {
    leads: { OR: [{ ownerId: '$currentUser' }, { territory: '$userTerritory' }] },
    accounts: { OR: [{ ownerId: '$currentUser' }, { territory: '$userTerritory' }] },
    opportunities: { OR: [{ ownerId: '$currentUser' }, { territory: '$userTerritory' }] },
  },
};

export const permissionService = {
  /**
   * Check if a user has permission to perform an action on a resource
   */
  async hasPermission(userId, resource, action, recordData = null) {
    try {
      // Get user with role
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          role: {
            include: {
              rolePermissions: {
                include: { permission: true },
              },
            },
          },
        },
      });

      if (!user || !user.isActive) {
        return false;
      }

      // Check if role has permission
      const rolePermissions = user.role?.rolePermissions || [];
      const hasRolePermission = rolePermissions.some(
        (rp) => rp.permission.resource === resource && rp.permission.action === action
      );

      // Also check legacy JSON permissions
      const legacyPermissions = user.role?.permissionsJson || {};
      const hasLegacyPermission =
        legacyPermissions[resource]?.includes(action) ||
        legacyPermissions[resource]?.includes('*');

      // Check default permissions based on role name
      const roleName = user.role?.name?.toLowerCase()?.replace(/\s+/g, '_');
      const defaultPerms = DEFAULT_ROLE_PERMISSIONS[roleName] || {};
      const hasDefaultPermission = defaultPerms[resource]?.includes(action);

      const hasPermission = hasRolePermission || hasLegacyPermission || hasDefaultPermission;

      if (!hasPermission) {
        return false;
      }

      // Check record-level conditions if record data is provided
      if (recordData) {
        const conditions = RECORD_LEVEL_CONDITIONS[roleName]?.[resource];
        if (conditions) {
          return this.evaluateConditions(conditions, recordData, user);
        }
      }

      return true;
    } catch (error) {
      logger.error('Permission check error:', error);
      return false;
    }
  },

  /**
   * Evaluate record-level conditions
   */
  evaluateConditions(conditions, recordData, user) {
    // Replace placeholders
    const resolvedConditions = JSON.parse(
      JSON.stringify(conditions)
        .replace(/"\$currentUser"/g, `"${user.id}"`)
        .replace(/"\$userTerritory"/g, `"${user.territoryId || ''}"`)
        .replace(/"\$userDepartment"/g, `"${user.department || ''}"`)
    );

    // Evaluate OR conditions
    if (resolvedConditions.OR) {
      return resolvedConditions.OR.some((cond) =>
        Object.entries(cond).every(([field, value]) => recordData[field] === value)
      );
    }

    // Evaluate AND conditions (default)
    return Object.entries(resolvedConditions).every(
      ([field, value]) => recordData[field] === value
    );
  },

  /**
   * Get all permissions for a user
   */
  async getUserPermissions(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: {
          include: {
            rolePermissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!user || !user.role) {
      return {};
    }

    // Combine role permissions, legacy permissions, and defaults
    const permissions = {};

    // Add default permissions for role
    const roleName = user.role.name?.toLowerCase()?.replace(/\s+/g, '_');
    const defaults = DEFAULT_ROLE_PERMISSIONS[roleName] || {};
    Object.entries(defaults).forEach(([resource, actions]) => {
      permissions[resource] = [...(permissions[resource] || []), ...actions];
    });

    // Add legacy JSON permissions
    const legacy = user.role.permissionsJson || {};
    Object.entries(legacy).forEach(([resource, actions]) => {
      if (Array.isArray(actions)) {
        permissions[resource] = [...(permissions[resource] || []), ...actions];
      }
    });

    // Add role-specific permissions from database
    user.role.rolePermissions.forEach((rp) => {
      const resource = rp.permission.resource;
      const action = rp.permission.action;
      if (!permissions[resource]) {
        permissions[resource] = [];
      }
      if (!permissions[resource].includes(action)) {
        permissions[resource].push(action);
      }
    });

    // Get record-level conditions
    const conditions = RECORD_LEVEL_CONDITIONS[roleName] || {};

    return {
      permissions,
      conditions,
      role: user.role.name,
    };
  },

  /**
   * Get filter conditions for a resource based on user permissions
   * Used to filter queries to only return records the user can see
   */
  async getRecordFilter(userId, resource) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || !user.role) {
      return { id: 'NONE' }; // Return impossible condition
    }

    const roleName = user.role.name?.toLowerCase()?.replace(/\s+/g, '_');

    // Super admin and admin see everything
    if (roleName === 'super_admin' || roleName === 'admin') {
      return {};
    }

    // Get conditions for this role and resource
    const conditions = RECORD_LEVEL_CONDITIONS[roleName]?.[resource];
    if (!conditions) {
      return {}; // No restrictions
    }

    // Resolve conditions
    const resolved = JSON.parse(
      JSON.stringify(conditions)
        .replace(/"\$currentUser"/g, `"${user.id}"`)
        .replace(/"\$userTerritory"/g, `"${user.territoryId || ''}"`)
        .replace(/"\$userDepartment"/g, `"${user.department || ''}"`)
    );

    return resolved;
  },

  /**
   * Create a new role
   */
  async createRole(data) {
    const { name, description, permissions } = data;

    const role = await prisma.role.create({
      data: {
        name,
        description,
        permissionsJson: permissions || {},
      },
    });

    // If specific permissions are provided, create RolePermission records
    if (permissions) {
      for (const [resource, actions] of Object.entries(permissions)) {
        for (const action of actions) {
          // Find or create the permission
          let permission = await prisma.permission.findFirst({
            where: { resource, action },
          });

          if (!permission) {
            permission = await prisma.permission.create({
              data: {
                name: `${resource}.${action}`,
                resource,
                action,
              },
            });
          }

          // Create the role-permission link
          await prisma.rolePermission.create({
            data: {
              roleId: role.id,
              permissionId: permission.id,
            },
          });
        }
      }
    }

    return role;
  },

  /**
   * Update role permissions
   */
  async updateRolePermissions(roleId, permissions) {
    // Remove existing role permissions
    await prisma.rolePermission.deleteMany({
      where: { roleId },
    });

    // Update legacy JSON
    await prisma.role.update({
      where: { id: roleId },
      data: {
        permissionsJson: permissions,
      },
    });

    // Create new role permissions
    for (const [resource, actions] of Object.entries(permissions)) {
      for (const action of actions) {
        let permission = await prisma.permission.findFirst({
          where: { resource, action },
        });

        if (!permission) {
          permission = await prisma.permission.create({
            data: {
              name: `${resource}.${action}`,
              resource,
              action,
            },
          });
        }

        await prisma.rolePermission.create({
          data: {
            roleId,
            permissionId: permission.id,
          },
        });
      }
    }

    return this.getRoleWithPermissions(roleId);
  },

  /**
   * Get role with all permissions
   */
  async getRoleWithPermissions(roleId) {
    return prisma.role.findUnique({
      where: { id: roleId },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
        users: {
          select: { id: true, email: true, fullName: true },
        },
      },
    });
  },

  /**
   * Get all roles
   */
  async getAllRoles() {
    const roles = await prisma.role.findMany({
      include: {
        _count: {
          select: { users: true },
        },
        rolePermissions: {
          include: { permission: true },
        },
      },
    });

    return roles.map((role) => {
      // Build permissions from rolePermissions table
      let permissions = role.rolePermissions.reduce((acc, rp) => {
        if (!acc[rp.permission.resource]) {
          acc[rp.permission.resource] = [];
        }
        acc[rp.permission.resource].push(rp.permission.action);
        return acc;
      }, {});

      // If no permissions from rolePermissions, try legacy permissionsJson field
      if (Object.keys(permissions).length === 0 && role.permissionsJson) {
        try {
          // Handle both object and double-encoded string
          if (typeof role.permissionsJson === 'string') {
            permissions = JSON.parse(role.permissionsJson);
          } else if (typeof role.permissionsJson === 'object') {
            permissions = role.permissionsJson;
          }
        } catch (e) {
          logger.warn(`Failed to parse permissionsJson for role ${role.name}:`, e.message);
          permissions = {};
        }
      }

      return {
        ...role,
        userCount: role._count.users,
        permissions,
      };
    });
  },

  /**
   * Assign role to user
   */
  async assignRole(userId, roleId) {
    return prisma.user.update({
      where: { id: userId },
      data: { roleId },
      include: { role: true },
    });
  },

  /**
   * Get available resources and actions
   */
  getAvailableResources() {
    return {
      accounts: ['create', 'read', 'update', 'delete', 'export', 'assign'],
      contacts: ['create', 'read', 'update', 'delete', 'export'],
      leads: ['create', 'read', 'update', 'delete', 'export', 'assign'],
      opportunities: ['create', 'read', 'update', 'delete', 'export', 'assign'],
      quotes: ['create', 'read', 'update', 'delete', 'approve'],
      orders: ['create', 'read', 'update', 'delete'],
      invoices: ['create', 'read', 'update', 'delete', 'approve'],
      payments: ['create', 'read', 'update', 'delete'],
      workorders: ['create', 'read', 'update', 'delete', 'assign'],
      appointments: ['create', 'read', 'update', 'delete', 'assign'],
      cases: ['create', 'read', 'update', 'delete', 'assign'], // Case management
      commissions: ['create', 'read', 'update', 'delete', 'approve'],
      workflows: ['create', 'read', 'update', 'delete'],
      templates: ['create', 'read', 'update', 'delete'],
      agreements: ['create', 'read', 'update', 'delete'],
      campaigns: ['create', 'read', 'update', 'delete'],
      users: ['create', 'read', 'update', 'delete'],
      roles: ['create', 'read', 'update', 'delete'],
      settings: ['read', 'update'],
      reports: ['read', 'export'],
      audit_logs: ['read', 'export'],
      integrations: ['read', 'update'],
      mobile_app: ['access', 'knocker_view', 'sales_view', 'manager_view', 'team_stats'],
      // Page access permissions - controls visibility of management pages
      pages: ['access'],
    };
  },

  /**
   * Get management pages list with access requirements
   */
  getManagementPages() {
    return [
      { id: 'cases', label: 'Cases', path: '/management/cases' },
      { id: 'tasks', label: 'Tasks', path: '/management/tasks' },
      { id: 'commissions', label: 'Commissions', path: '/management/commissions' },
      { id: 'invoices', label: 'Invoices', path: '/management/invoices' },
      { id: 'contracts', label: 'Contracts', path: '/management/contracts' },
      { id: 'quotes', label: 'Quotes', path: '/management/quotes' },
      { id: 'appointments', label: 'Appointments', path: '/management/appointments' },
      { id: 'workOrders', label: 'Work Orders', path: '/management/work-orders' },
    ];
  },

  /**
   * Get pages a user can access based on their role
   */
  async getUserAccessiblePages(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { role: true },
    });

    if (!user || !user.role) {
      return [];
    }

    const roleName = user.role.name?.toLowerCase()?.replace(/\s+/g, '_');
    const roleType = user.role.roleType?.toLowerCase();
    const allPages = this.getManagementPages();

    // Admins get access to all pages
    if (roleName === 'super_admin' || roleName === 'admin' ||
        roleName?.includes('admin') || roleType === 'admin' || roleType === 'executive') {
      return allPages;
    }

    // Check permissionsJson for page access
    const permissionsJson = user.role.permissionsJson || {};
    const pageAccess = permissionsJson.pages || {};

    // Filter pages based on explicit grants in permissionsJson
    return allPages.filter(page => pageAccess[page.id] === true);
  },

  /**
   * Initialize default permissions in database
   */
  async initializeDefaultPermissions() {
    const resources = this.getAvailableResources();

    for (const [resource, actions] of Object.entries(resources)) {
      for (const action of actions) {
        const name = `${resource}.${action}`;
        const existing = await prisma.permission.findUnique({
          where: { name },
        });

        if (!existing) {
          await prisma.permission.create({
            data: {
              name,
              resource,
              action,
              description: `${action.charAt(0).toUpperCase() + action.slice(1)} ${resource}`,
            },
          });
          logger.info(`Created permission: ${name}`);
        }
      }
    }

    // Create default roles if they don't exist
    for (const [roleName, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      const formattedName = roleName
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      const existing = await prisma.role.findUnique({
        where: { name: formattedName },
      });

      if (!existing) {
        await this.createRole({
          name: formattedName,
          description: `Default ${formattedName} role`,
          permissions,
        });
        logger.info(`Created role: ${formattedName}`);
      }
    }

    logger.info('Default permissions initialized');
  },
};

export default permissionService;
