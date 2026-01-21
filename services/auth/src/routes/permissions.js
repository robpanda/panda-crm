// Permission Routes - Role and Permission Management API
import express from 'express';
import { permissionService } from '../services/permissionService.js';
import { auditService } from '../services/auditService.js';
import { logger } from '../middleware/logger.js';

const router = express.Router();

// Middleware to extract user context
const getUserContext = (req) => ({
  userId: req.user?.sub || req.user?.userId,
  userEmail: req.user?.email,
  ipAddress: req.ip || req.headers['x-forwarded-for']?.split(',')[0],
  userAgent: req.headers['user-agent'],
});

// ============================================================================
// PERMISSION CHECK ENDPOINTS
// ============================================================================

/**
 * Check if current user has specific permission
 * GET /permissions/check?resource=accounts&action=create
 */
router.get('/check', async (req, res, next) => {
  try {
    const { resource, action, recordId } = req.query;
    const context = getUserContext(req);

    if (!resource || !action) {
      return res.status(400).json({
        success: false,
        error: 'resource and action are required',
      });
    }

    // Get record data if checking specific record
    let recordData = null;
    if (recordId) {
      // This would need to fetch the record - simplified here
      recordData = { id: recordId };
    }

    const hasPermission = await permissionService.hasPermission(
      context.userId,
      resource,
      action,
      recordData
    );

    res.json({
      success: true,
      hasPermission,
      resource,
      action,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get all permissions for current user
 * GET /permissions/me
 */
router.get('/me', async (req, res, next) => {
  try {
    const context = getUserContext(req);
    const permissions = await permissionService.getUserPermissions(context.userId);

    res.json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get management pages the current user can access
 * GET /permissions/pages
 */
router.get('/pages', async (req, res, next) => {
  try {
    const context = getUserContext(req);
    const pages = await permissionService.getUserAccessiblePages(context.userId);

    res.json({
      success: true,
      data: pages,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get all available management pages (for admin UI)
 * GET /permissions/pages/all
 */
router.get('/pages/all', async (req, res, next) => {
  try {
    const pages = permissionService.getManagementPages();

    res.json({
      success: true,
      data: pages,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get record filter for a resource based on user permissions
 * GET /permissions/filter/:resource
 */
router.get('/filter/:resource', async (req, res, next) => {
  try {
    const { resource } = req.params;
    const context = getUserContext(req);

    const filter = await permissionService.getRecordFilter(context.userId, resource);

    res.json({
      success: true,
      resource,
      filter,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// ROLE MANAGEMENT ENDPOINTS (Admin only)
// ============================================================================

/**
 * Get all roles
 * GET /permissions/roles
 * Note: All authenticated users can view the role list for dropdown menus.
 * This is read-only and doesn't expose sensitive permission details.
 */
router.get('/roles', async (req, res, next) => {
  try {
    const roles = await permissionService.getAllRoles();

    res.json({
      success: true,
      data: roles,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get role by ID
 * GET /permissions/roles/:id
 */
router.get('/roles/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const context = getUserContext(req);

    const canView = await permissionService.hasPermission(context.userId, 'roles', 'read');
    if (!canView) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
      });
    }

    const role = await permissionService.getRoleWithPermissions(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found',
      });
    }

    res.json({
      success: true,
      data: role,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Create new role
 * POST /permissions/roles
 */
router.post('/roles', async (req, res, next) => {
  try {
    const context = getUserContext(req);

    const canCreate = await permissionService.hasPermission(context.userId, 'roles', 'create');
    if (!canCreate) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
      });
    }

    const { name, description, permissions } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Role name is required',
      });
    }

    const role = await permissionService.createRole({
      name,
      description,
      permissions,
    });

    // Audit log
    await auditService.logChange({
      tableName: 'roles',
      recordId: role.id,
      action: 'CREATE',
      newValues: { name, description, permissions },
      ...context,
    });

    logger.info(`Role created: ${name} by ${context.userEmail}`);

    res.status(201).json({
      success: true,
      data: role,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update role permissions
 * PUT /permissions/roles/:id
 */
router.put('/roles/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const context = getUserContext(req);

    const canUpdate = await permissionService.hasPermission(context.userId, 'roles', 'update');
    if (!canUpdate) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
      });
    }

    const { permissions, description } = req.body;

    // Get old values for audit
    const oldRole = await permissionService.getRoleWithPermissions(id);
    if (!oldRole) {
      return res.status(404).json({
        success: false,
        error: 'Role not found',
      });
    }

    const role = await permissionService.updateRolePermissions(id, permissions);

    // Audit log
    await auditService.logChange({
      tableName: 'roles',
      recordId: id,
      action: 'UPDATE',
      oldValues: { permissions: oldRole.permissionsJson },
      newValues: { permissions },
      ...context,
    });

    logger.info(`Role updated: ${role.name} by ${context.userEmail}`);

    res.json({
      success: true,
      data: role,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Delete role
 * DELETE /permissions/roles/:id
 */
router.delete('/roles/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const context = getUserContext(req);

    const canDelete = await permissionService.hasPermission(context.userId, 'roles', 'delete');
    if (!canDelete) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
      });
    }

    const role = await permissionService.getRoleWithPermissions(id);
    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found',
      });
    }

    // Check if role has users
    if (role.users && role.users.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete role with ${role.users.length} assigned users`,
      });
    }

    // Delete role (cascade will delete rolePermissions)
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();
    await prisma.role.delete({ where: { id } });

    // Audit log
    await auditService.logChange({
      tableName: 'roles',
      recordId: id,
      action: 'DELETE',
      oldValues: { name: role.name },
      ...context,
    });

    logger.info(`Role deleted: ${role.name} by ${context.userEmail}`);

    res.json({
      success: true,
      message: 'Role deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Assign role to user
 * POST /permissions/assign
 */
router.post('/assign', async (req, res, next) => {
  try {
    const context = getUserContext(req);

    const canAssign = await permissionService.hasPermission(context.userId, 'users', 'update');
    if (!canAssign) {
      return res.status(403).json({
        success: false,
        error: 'Permission denied',
      });
    }

    const { userId, roleId } = req.body;

    if (!userId || !roleId) {
      return res.status(400).json({
        success: false,
        error: 'userId and roleId are required',
      });
    }

    const user = await permissionService.assignRole(userId, roleId);

    // Audit log
    await auditService.logChange({
      tableName: 'users',
      recordId: userId,
      action: 'UPDATE',
      newValues: { roleId, roleName: user.role?.name },
      ...context,
    });

    logger.info(`Role ${user.role?.name} assigned to user ${user.email} by ${context.userEmail}`);

    res.json({
      success: true,
      data: {
        userId: user.id,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// METADATA ENDPOINTS
// ============================================================================

/**
 * Get available resources and actions
 * GET /permissions/resources
 */
router.get('/resources', async (req, res, next) => {
  try {
    const resources = permissionService.getAvailableResources();

    res.json({
      success: true,
      data: resources,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Initialize default permissions (admin only)
 * POST /permissions/initialize
 */
router.post('/initialize', async (req, res, next) => {
  try {
    const context = getUserContext(req);

    // Only super admin can initialize
    const permissions = await permissionService.getUserPermissions(context.userId);
    if (permissions.role?.toLowerCase() !== 'super admin') {
      return res.status(403).json({
        success: false,
        error: 'Only super admin can initialize permissions',
      });
    }

    await permissionService.initializeDefaultPermissions();

    res.json({
      success: true,
      message: 'Default permissions initialized',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
