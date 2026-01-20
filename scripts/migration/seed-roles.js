#!/usr/bin/env node

/**
 * Seed Roles Script
 * Creates default roles for Panda CRM including Call Center Manager
 */

import { prisma } from './prisma-client.js';

// Default permissions for system roles (using uppercase for enum values)
const DEFAULT_ROLE_PERMISSIONS = {
  super_admin: {
    accounts: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'ASSIGN'],
    contacts: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT'],
    leads: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'ASSIGN'],
    opportunities: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'ASSIGN'],
    quotes: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE'],
    orders: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    invoices: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE'],
    payments: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    workorders: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'ASSIGN'],
    appointments: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'ASSIGN'],
    commissions: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE'],
    workflows: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    templates: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    agreements: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    campaigns: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    users: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    roles: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    settings: ['READ', 'UPDATE'],
    reports: ['READ', 'EXPORT'],
    audit_logs: ['READ', 'EXPORT'],
    integrations: ['READ', 'UPDATE'],
  },

  admin: {
    accounts: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'ASSIGN'],
    contacts: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT'],
    leads: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'ASSIGN'],
    opportunities: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'ASSIGN'],
    quotes: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE'],
    orders: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    invoices: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE'],
    payments: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    workorders: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'ASSIGN'],
    appointments: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'ASSIGN'],
    commissions: ['READ', 'APPROVE'],
    workflows: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    templates: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    agreements: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    campaigns: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    users: ['READ', 'UPDATE'],
    roles: ['READ'],
    settings: ['READ', 'UPDATE'],
    reports: ['READ', 'EXPORT'],
    audit_logs: ['READ'],
    integrations: ['READ', 'UPDATE'],
  },

  sales_manager: {
    accounts: ['CREATE', 'READ', 'UPDATE', 'EXPORT', 'ASSIGN'],
    contacts: ['CREATE', 'READ', 'UPDATE', 'EXPORT'],
    leads: ['CREATE', 'READ', 'UPDATE', 'EXPORT', 'ASSIGN'],
    opportunities: ['CREATE', 'READ', 'UPDATE', 'EXPORT', 'ASSIGN'],
    quotes: ['CREATE', 'READ', 'UPDATE', 'APPROVE'],
    orders: ['READ'],
    invoices: ['READ'],
    payments: ['READ'],
    workorders: ['READ'],
    appointments: ['READ'],
    commissions: ['READ'],
    templates: ['READ'],
    agreements: ['CREATE', 'READ', 'UPDATE'],
    campaigns: ['CREATE', 'READ', 'UPDATE'],
    reports: ['READ', 'EXPORT'],
  },

  sales_rep: {
    accounts: ['CREATE', 'READ', 'UPDATE'],
    contacts: ['CREATE', 'READ', 'UPDATE'],
    leads: ['CREATE', 'READ', 'UPDATE'],
    opportunities: ['CREATE', 'READ', 'UPDATE'],
    quotes: ['CREATE', 'READ', 'UPDATE'],
    workorders: ['READ'],
    appointments: ['READ'],
    commissions: ['READ'],
    templates: ['READ'],
    agreements: ['CREATE', 'READ'],
    reports: ['READ'],
  },

  project_manager: {
    accounts: ['READ', 'UPDATE'],
    contacts: ['READ', 'UPDATE'],
    opportunities: ['READ', 'UPDATE'],
    quotes: ['READ'],
    orders: ['CREATE', 'READ', 'UPDATE'],
    invoices: ['READ', 'UPDATE'],
    payments: ['CREATE', 'READ'],
    workorders: ['CREATE', 'READ', 'UPDATE', 'ASSIGN'],
    appointments: ['CREATE', 'READ', 'UPDATE', 'ASSIGN'],
    commissions: ['READ'],
    templates: ['READ'],
    agreements: ['CREATE', 'READ', 'UPDATE'],
    reports: ['READ'],
  },

  field_technician: {
    accounts: ['READ'],
    contacts: ['READ'],
    opportunities: ['READ'],
    workorders: ['READ', 'UPDATE'],
    appointments: ['READ', 'UPDATE'],
    templates: ['READ'],
  },

  call_center: {
    accounts: ['READ'],
    contacts: ['CREATE', 'READ', 'UPDATE'],
    leads: ['CREATE', 'READ', 'UPDATE'],
    opportunities: ['READ'],
    appointments: ['READ'],
    templates: ['READ'],
    campaigns: ['READ'],
  },

  call_center_manager: {
    accounts: ['READ', 'UPDATE'],
    contacts: ['CREATE', 'READ', 'UPDATE', 'EXPORT', 'ASSIGN'],
    leads: ['CREATE', 'READ', 'UPDATE', 'EXPORT', 'ASSIGN'],
    opportunities: ['READ', 'UPDATE'],
    appointments: ['CREATE', 'READ', 'UPDATE', 'ASSIGN'],
    templates: ['READ', 'UPDATE'],
    campaigns: ['CREATE', 'READ', 'UPDATE'],
    users: ['READ'],
    reports: ['READ', 'EXPORT'],
  },

  accounting: {
    accounts: ['READ'],
    opportunities: ['READ'],
    quotes: ['READ'],
    orders: ['READ'],
    invoices: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE'],
    payments: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    commissions: ['READ', 'APPROVE'],
    reports: ['READ', 'EXPORT'],
  },

  viewer: {
    accounts: ['READ'],
    contacts: ['READ'],
    leads: ['READ'],
    opportunities: ['READ'],
    quotes: ['READ'],
    orders: ['READ'],
    invoices: ['READ'],
    workorders: ['READ'],
    appointments: ['READ'],
    reports: ['READ'],
  },
};

async function seedRoles() {
  console.log('🌱 Seeding roles...\n');

  // First, create all permissions
  const resources = {
    accounts: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'ASSIGN'],
    contacts: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT'],
    leads: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'ASSIGN'],
    opportunities: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'EXPORT', 'ASSIGN'],
    quotes: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE'],
    orders: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    invoices: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE'],
    payments: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    workorders: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'ASSIGN'],
    appointments: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'ASSIGN'],
    commissions: ['CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE'],
    workflows: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    templates: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    agreements: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    campaigns: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    users: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    roles: ['CREATE', 'READ', 'UPDATE', 'DELETE'],
    settings: ['READ', 'UPDATE'],
    reports: ['READ', 'EXPORT'],
    audit_logs: ['READ', 'EXPORT'],
    integrations: ['READ', 'UPDATE'],
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
            action,  // This is now an uppercase enum value
            description: `${action.charAt(0) + action.slice(1).toLowerCase()} ${resource}`,
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
      // Create the role with lowercase permissions for JSON storage (legacy compatibility)
      const legacyPermissions = {};
      for (const [resource, actions] of Object.entries(permissions)) {
        legacyPermissions[resource] = actions.map(a => a.toLowerCase());
      }

      const role = await prisma.role.create({
        data: {
          name: formattedName,
          description: `Default ${formattedName} role`,
          roleType: roleName,
          permissionsJson: legacyPermissions,
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
