#!/usr/bin/env node
// Migrate Salesforce UserRoles and Role Hierarchy to Panda CRM
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

// Salesforce UserRole hierarchy fields
const ROLE_FIELDS = [
  'Id',
  'Name',
  'DeveloperName',
  'ParentRoleId',
  'RollupDescription',
];

// Map Salesforce roles to Panda CRM role types (for ROLE_TYPES in AuthContext)
const ROLE_TYPE_MAPPING = {
  // Admin roles
  'Super Admin': 'admin',
  'System Administrator': 'admin',
  'Admin': 'admin',

  // Executive roles
  'CEO': 'executive',
  'Executive': 'executive',
  'VP': 'executive',
  'Vice President': 'executive',

  // Office Manager roles
  'Office Manager': 'office_manager',
  'Regional Manager': 'office_manager',
  'Branch Manager': 'office_manager',

  // Sales Manager roles
  'Sales Manager': 'sales_manager',
  'Team Lead': 'sales_manager',
  'Sales Director': 'sales_manager',

  // Sales Rep roles
  'Sales Rep': 'sales_rep',
  'Sales Representative': 'sales_rep',
  'Account Executive': 'sales_rep',
  'Closer': 'sales_rep',
  'Setter': 'sales_rep',

  // Project Manager roles
  'Project Manager': 'project_manager',
  'PM': 'project_manager',
  'Production Manager': 'project_manager',

  // Call Center roles
  'Call Center': 'call_center',
  'Call Center Rep': 'call_center',
  'Inside Sales': 'call_center',

  // Viewer roles
  'Viewer': 'viewer',
  'Read Only': 'viewer',
};

// Default permissions for each role type
const DEFAULT_PERMISSIONS = {
  admin: {
    accounts: ['create', 'read', 'update', 'delete', 'export'],
    contacts: ['create', 'read', 'update', 'delete', 'export'],
    leads: ['create', 'read', 'update', 'delete', 'assign', 'export'],
    opportunities: ['create', 'read', 'update', 'delete', 'approve', 'export'],
    quotes: ['create', 'read', 'update', 'delete', 'approve'],
    workorders: ['create', 'read', 'update', 'delete', 'assign'],
    commissions: ['create', 'read', 'update', 'delete', 'approve'],
    users: ['create', 'read', 'update', 'delete'],
    roles: ['create', 'read', 'update', 'delete'],
    reports: ['create', 'read', 'update', 'delete'],
    settings: ['read', 'update'],
    audit_logs: ['read'],
  },
  executive: {
    accounts: ['read', 'export'],
    contacts: ['read', 'export'],
    leads: ['read', 'export'],
    opportunities: ['read', 'approve', 'export'],
    quotes: ['read', 'approve'],
    workorders: ['read'],
    commissions: ['read', 'approve'],
    users: ['read'],
    reports: ['create', 'read', 'update', 'delete'],
    settings: ['read'],
    audit_logs: ['read'],
  },
  office_manager: {
    accounts: ['create', 'read', 'update', 'export'],
    contacts: ['create', 'read', 'update', 'export'],
    leads: ['create', 'read', 'update', 'assign', 'export'],
    opportunities: ['create', 'read', 'update', 'export'],
    quotes: ['create', 'read', 'update'],
    workorders: ['create', 'read', 'update', 'assign'],
    commissions: ['read'],
    users: ['read'],
    reports: ['create', 'read'],
  },
  sales_manager: {
    accounts: ['create', 'read', 'update'],
    contacts: ['create', 'read', 'update'],
    leads: ['create', 'read', 'update', 'assign'],
    opportunities: ['create', 'read', 'update'],
    quotes: ['create', 'read', 'update'],
    workorders: ['read', 'update'],
    commissions: ['read'],
    reports: ['read'],
  },
  sales_rep: {
    accounts: ['create', 'read', 'update'],
    contacts: ['create', 'read', 'update'],
    leads: ['create', 'read', 'update'],
    opportunities: ['create', 'read', 'update'],
    quotes: ['create', 'read', 'update'],
    workorders: ['read'],
    commissions: ['read'],
    reports: ['read'],
  },
  project_manager: {
    accounts: ['read', 'update'],
    contacts: ['read', 'update'],
    leads: ['read'],
    opportunities: ['read', 'update'],
    quotes: ['read'],
    workorders: ['create', 'read', 'update', 'assign'],
    commissions: ['read'],
    reports: ['read'],
  },
  call_center: {
    accounts: ['read'],
    contacts: ['create', 'read', 'update'],
    leads: ['create', 'read', 'update'],
    opportunities: ['read'],
    quotes: ['read'],
    workorders: ['read'],
    reports: ['read'],
  },
  viewer: {
    accounts: ['read'],
    contacts: ['read'],
    leads: ['read'],
    opportunities: ['read'],
    quotes: ['read'],
    workorders: ['read'],
    reports: ['read'],
  },
};

function getRoleType(sfRoleName) {
  // Check exact match first
  if (ROLE_TYPE_MAPPING[sfRoleName]) {
    return ROLE_TYPE_MAPPING[sfRoleName];
  }

  // Check partial matches
  const lowerName = sfRoleName.toLowerCase();
  for (const [key, value] of Object.entries(ROLE_TYPE_MAPPING)) {
    if (lowerName.includes(key.toLowerCase())) {
      return value;
    }
  }

  // Default to sales_rep if no match
  return 'sales_rep';
}

function transformRole(sfRole) {
  const roleType = getRoleType(sfRole.Name);
  const permissions = DEFAULT_PERMISSIONS[roleType] || DEFAULT_PERMISSIONS.sales_rep;

  return {
    salesforceId: sfRole.Id,
    name: sfRole.Name,
    developerName: sfRole.DeveloperName,
    description: sfRole.RollupDescription || `Migrated from Salesforce: ${sfRole.Name}`,
    roleType: roleType,
    parentSalesforceId: sfRole.ParentRoleId,
    permissionsJson: JSON.stringify(permissions),
    isActive: true,
  };
}

async function migrateRoles(options = {}) {
  const { dryRun = false } = options;
  const prisma = await getPrismaClient();

  console.log('=== Starting Role Migration ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);

  try {
    // Query Salesforce UserRoles
    const soql = `SELECT ${ROLE_FIELDS.join(', ')} FROM UserRole ORDER BY ParentRoleId NULLS FIRST, Name`;

    console.log('Querying Salesforce UserRoles...');
    const sfRoles = await querySalesforce(soql);
    console.log(`Found ${sfRoles.length} roles to migrate`);

    // Transform and build hierarchy
    const roles = sfRoles.map(transformRole);

    // Display role type distribution
    const roleTypeCounts = {};
    roles.forEach(r => {
      roleTypeCounts[r.roleType] = (roleTypeCounts[r.roleType] || 0) + 1;
    });
    console.log('Role type distribution:', roleTypeCounts);

    if (dryRun) {
      console.log('\n=== DRY RUN - No changes made ===');
      console.log('Roles that would be created:');
      roles.forEach(r => {
        console.log(`  - ${r.name} (${r.roleType})${r.parentSalesforceId ? ` [parent: ${r.parentSalesforceId}]` : ''}`);
      });
      return { roles, count: roles.length };
    }

    // First pass: Create all roles without parent relationships
    console.log('Creating roles in database...');
    const createdRoles = [];
    const sfIdToDbId = {};

    for (const role of roles) {
      const { parentSalesforceId, ...roleData } = role;

      try {
        const created = await prisma.role.upsert({
          where: { salesforceId: role.salesforceId },
          update: {
            name: roleData.name,
            description: roleData.description,
            permissionsJson: roleData.permissionsJson,
            isActive: roleData.isActive,
          },
          create: {
            salesforceId: roleData.salesforceId,
            name: roleData.name,
            description: roleData.description,
            permissionsJson: roleData.permissionsJson,
            isActive: roleData.isActive,
          },
        });

        createdRoles.push(created);
        sfIdToDbId[role.salesforceId] = created.id;
        console.log(`✓ Created/Updated role: ${role.name}`);
      } catch (error) {
        console.error(`✗ Failed to create role ${role.name}:`, error.message);
      }
    }

    // Second pass: Update parent relationships
    console.log('\nUpdating role hierarchy...');
    for (const role of roles) {
      if (role.parentSalesforceId && sfIdToDbId[role.parentSalesforceId]) {
        try {
          await prisma.role.update({
            where: { salesforceId: role.salesforceId },
            data: {
              parentId: sfIdToDbId[role.parentSalesforceId],
            },
          });
          console.log(`✓ Linked ${role.name} to parent role`);
        } catch (error) {
          console.error(`✗ Failed to link parent for ${role.name}:`, error.message);
        }
      }
    }

    console.log('\n=== Role Migration Complete ===');
    console.log(`Total roles created/updated: ${createdRoles.length}`);

    return { roles: createdRoles, sfIdToDbId };
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

async function migrateUserRoleAssignments(options = {}) {
  const { dryRun = false } = options;
  const prisma = await getPrismaClient();

  console.log('\n=== Migrating User Role Assignments ===');

  try {
    // Query Salesforce Users with their roles
    const soql = `
      SELECT Id, Email, UserRole.Id, UserRole.Name, Manager.Id, Manager.Email,
             Profile.Name, Department, Division
      FROM User
      WHERE IsActive = true
      ORDER BY UserRole.Name
    `;

    console.log('Querying Salesforce Users with roles...');
    const sfUsers = await querySalesforce(soql);
    console.log(`Found ${sfUsers.length} active users`);

    // Get role mappings from our database
    const dbRoles = await prisma.role.findMany();
    const sfIdToRoleId = {};
    dbRoles.forEach(r => {
      if (r.salesforceId) {
        sfIdToRoleId[r.salesforceId] = r.id;
      }
    });

    // Get user mappings
    const dbUsers = await prisma.user.findMany({
      where: { salesforceId: { not: null } },
    });
    const sfIdToUserId = {};
    dbUsers.forEach(u => {
      if (u.salesforceId) {
        sfIdToUserId[u.salesforceId] = u.id;
      }
    });

    if (dryRun) {
      console.log('\n=== DRY RUN - No changes made ===');
      console.log('User role assignments that would be made:');
      sfUsers.forEach(u => {
        const roleName = u.UserRole?.Name || 'No Role';
        console.log(`  - ${u.Email}: ${roleName}`);
      });
      return { count: sfUsers.length };
    }

    // Update users with their roles and managers
    let updated = 0;
    let skipped = 0;

    for (const sfUser of sfUsers) {
      const userId = sfIdToUserId[sfUser.Id];
      if (!userId) {
        console.log(`⚠ User not found in CRM: ${sfUser.Email}`);
        skipped++;
        continue;
      }

      const updateData = {};

      // Assign role
      if (sfUser.UserRole?.Id) {
        const roleId = sfIdToRoleId[sfUser.UserRole.Id];
        if (roleId) {
          updateData.roleId = roleId;
        }
      }

      // Assign manager
      if (sfUser.Manager?.Id) {
        const managerId = sfIdToUserId[sfUser.Manager.Id];
        if (managerId) {
          updateData.managerId = managerId;
        }
      }

      // Office assignment from Division
      if (sfUser.Division) {
        updateData.officeAssignment = sfUser.Division;
      }

      if (Object.keys(updateData).length > 0) {
        try {
          await prisma.user.update({
            where: { id: userId },
            data: updateData,
          });
          console.log(`✓ Updated ${sfUser.Email}: role=${sfUser.UserRole?.Name || 'none'}, manager=${sfUser.Manager?.Email || 'none'}`);
          updated++;
        } catch (error) {
          console.error(`✗ Failed to update ${sfUser.Email}:`, error.message);
        }
      }
    }

    console.log('\n=== User Role Assignment Complete ===');
    console.log(`Updated: ${updated}, Skipped: ${skipped}`);

    return { updated, skipped };
  } catch (error) {
    console.error('User role assignment failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const rolesOnly = args.includes('--roles-only');
  const usersOnly = args.includes('--users-only');

  console.log('╔════════════════════════════════════════╗');
  console.log('║  Salesforce Role Migration to Panda CRM ║');
  console.log('╚════════════════════════════════════════╝\n');

  if (!usersOnly) {
    const roleResult = await migrateRoles({ dryRun });
    console.log(`\nMigrated ${roleResult.roles?.length || roleResult.count} roles\n`);
  }

  if (!rolesOnly) {
    const userResult = await migrateUserRoleAssignments({ dryRun });
    console.log(`\nAssigned roles to ${userResult.updated} users\n`);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

export { migrateRoles, migrateUserRoleAssignments, getRoleType, ROLE_TYPE_MAPPING, DEFAULT_PERMISSIONS };
