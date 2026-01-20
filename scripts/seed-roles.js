#!/usr/bin/env node

/**
 * Seed Roles Script
 * Creates default roles for Panda CRM including Call Center Manager
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default permissions for system roles
const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: {
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
  },

  admin: {
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
    commissions: ['read', 'approve'],
    workflows: ['create', 'read', 'update', 'delete'],
    templates: ['create', 'read', 'update', 'delete'],
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
    accounts: ['create', 'read', 'update'],
    contacts: ['create', 'read', 'update'],
    leads: ['create', 'read', 'update'],
    opportunities: ['create', 'read', 'update'],
    quotes: ['create', 'read', 'update'],
    workorders: ['read'],
    appointments: ['read'],
    commissions: ['read'],
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
    agreements: ['create', 'read', 'update'],
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

  call_center_manager: {
    accounts: ['read', 'update'],
    contacts: ['create', 'read', 'update', 'export', 'assign'],
    leads: ['create', 'read', 'update', 'export', 'assign'],
    opportunities: ['read', 'update'],
    appointments: ['create', 'read', 'update', 'assign'],
    templates: ['read', 'update'],
    campaigns: ['create', 'read', 'update'],
    users: ['read'],
    reports: ['read', 'export'],
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
};

async function seedRoles() {
  console.log('🌱 Seeding roles...\n');

  // First, create all permissions
  const resources = {
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
  };

  console.log('Creating permissions...');
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
        console.log(`  ✅ Created permission: ${name}`);
      }
    }
  }

  console.log('\nCreating roles...');
  for (const [roleName, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const formattedName = roleName
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const existing = await prisma.role.findUnique({
      where: { name: formattedName },
    });

    if (!existing) {
      // Create the role
      const role = await prisma.role.create({
        data: {
          name: formattedName,
          description: `Default ${formattedName} role`,
          roleType: roleName,
          permissionsJson: permissions,
        },
      });

      // Create role-permission links
      for (const [resource, actions] of Object.entries(permissions)) {
        for (const action of actions) {
          const permissionName = `${resource}.${action}`;
          const permission = await prisma.permission.findUnique({
            where: { name: permissionName },
          });

          if (permission) {
            await prisma.rolePermission.create({
              data: {
                roleId: role.id,
                permissionId: permission.id,
              },
            });
          }
        }
      }

      console.log(`  ✅ Created role: ${formattedName}`);
    } else {
      console.log(`  ⏭️  Role exists: ${formattedName}`);
    }
  }

  console.log('\n✨ Role seeding complete!\n');

  // List all roles
  const allRoles = await prisma.role.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { name: 'asc' },
  });

  console.log('📋 Available Roles:');
  console.log('─'.repeat(50));
  for (const role of allRoles) {
    console.log(`  ${role.name} (${role._count.users} users)`);
  }
  console.log('─'.repeat(50));
}

// Run the seed
seedRoles()
  .catch((error) => {
    console.error('❌ Error seeding roles:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
