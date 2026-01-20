#!/usr/bin/env node
// Migrate Users from Salesforce to PostgreSQL + Cognito
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, batchUpsert, disconnect } from './prisma-client.js';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const USER_FIELDS = [
  'Id',
  'Username',
  'FirstName',
  'LastName',
  'Email',
  'IsActive',
  'UserRole.Name',
  'Department',
  'Title',
  'Phone',
  'MobilePhone',
  'Profile.Name',
  'CreatedDate',
  'LastModifiedDate',
];

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'us-east-2',
});

function mapUserRole(sfProfile, sfRole) {
  // Map Salesforce profiles/roles to CRM roles
  const roleMap = {
    'System Administrator': 'admin',
    'Sales Rep': 'sales_rep',
    'Sales Manager': 'sales_manager',
    'Call Center': 'call_center',
    'Project Manager': 'project_manager',
    'Executive': 'executive',
  };

  return roleMap[sfProfile] || roleMap[sfRole] || 'user';
}

function transformUser(sfUser) {
  return {
    salesforceId: sfUser.Id,
    email: sfUser.Email,
    firstName: sfUser.FirstName || 'Unknown',  // firstName is required
    lastName: sfUser.LastName,
    fullName: `${sfUser.FirstName || ''} ${sfUser.LastName || ''}`.trim(),
    phone: sfUser.Phone || sfUser.MobilePhone,
    title: sfUser.Title,
    department: sfUser.Department,
    status: sfUser.IsActive ? 'Active' : 'Inactive',
    isActive: sfUser.IsActive,
    // Note: role is now a relationship - skip it for now, can be set later
    createdAt: new Date(sfUser.CreatedDate),
    updatedAt: new Date(sfUser.LastModifiedDate),
  };
}

async function createCognitoUser(user, temporaryPassword) {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;

  try {
    // Create user in Cognito
    await cognitoClient.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: user.email,
        UserAttributes: [
          { Name: 'email', Value: user.email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'name', Value: user.fullName },
          { Name: 'custom:role', Value: user.role },
          { Name: 'custom:department', Value: user.department || '' },
          { Name: 'custom:salesforce_id', Value: user.salesforceId },
        ],
        MessageAction: 'SUPPRESS', // Don't send email
      })
    );

    // Set permanent password
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: user.email,
        Password: temporaryPassword,
        Permanent: true,
      })
    );

    return { success: true };
  } catch (error) {
    if (error.name === 'UsernameExistsException') {
      console.log(`User ${user.email} already exists in Cognito`);
      return { success: true, existing: true };
    }
    throw error;
  }
}

function generateTemporaryPassword() {
  // Generate a secure temporary password
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Ensure it meets Cognito requirements
  return 'Panda2024!' + password.substring(0, 8);
}

async function migrateUsers(options = {}) {
  const { createInCognito = false, activeOnly = true } = options;

  console.log('=== Starting User Migration ===');
  console.log(`Options: createInCognito=${createInCognito}, activeOnly=${activeOnly}`);

  try {
    // Query Salesforce
    let soql = `SELECT ${USER_FIELDS.join(', ')} FROM User`;
    if (activeOnly) {
      soql += ' WHERE IsActive = true';
    }
    soql += ' ORDER BY CreatedDate ASC';

    console.log('Querying Salesforce users...');
    const sfUsers = await querySalesforce(soql);
    console.log(`Found ${sfUsers.length} users to migrate`);

    // Transform records
    const users = sfUsers.map(transformUser);

    // Upsert to PostgreSQL
    console.log('Upserting to PostgreSQL...');
    const dbResults = await batchUpsert('user', users, 'salesforceId', 50);

    // Optionally create in Cognito
    let cognitoResults = { created: 0, existing: 0, errors: [] };
    if (createInCognito) {
      console.log('Creating users in Cognito...');

      for (const user of users) {
        if (!user.email || !user.isActive) continue;

        try {
          const tempPassword = generateTemporaryPassword();
          const result = await createCognitoUser(user, tempPassword);

          if (result.existing) {
            cognitoResults.existing++;
          } else {
            cognitoResults.created++;
            // Log password for admin to distribute
            console.log(`Created Cognito user: ${user.email} (temp password: ${tempPassword})`);
          }
        } catch (error) {
          cognitoResults.errors.push({ user: user.email, error: error.message });
        }
      }
    }

    console.log('=== Migration Complete ===');
    console.log(`Database - Processed: ${users.length}, Errors: ${dbResults.errors.length}`);

    if (createInCognito) {
      console.log(`Cognito - Created: ${cognitoResults.created}, Existing: ${cognitoResults.existing}, Errors: ${cognitoResults.errors.length}`);
    }

    // Role distribution
    const roleCounts = {};
    users.forEach((u) => {
      roleCounts[u.role] = (roleCounts[u.role] || 0) + 1;
    });
    console.log('Role distribution:', roleCounts);

    return { dbResults, cognitoResults };
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await disconnect();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const createInCognito = process.argv.includes('--cognito');
  const includeInactive = process.argv.includes('--all');

  migrateUsers({ createInCognito, activeOnly: !includeInactive })
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { migrateUsers, transformUser };
