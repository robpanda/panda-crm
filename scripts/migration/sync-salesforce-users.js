#!/usr/bin/env node

/**
 * Comprehensive Salesforce User Sync to Panda CRM
 *
 * This script:
 * 1. Queries all users from Salesforce with profile fields
 * 2. Compares with existing Panda CRM users
 * 3. Creates/updates users in database
 * 4. Creates/updates Cognito accounts
 * 5. Generates unique passwords for active employees
 * 6. Outputs password list
 */

const jsforce = require('jsforce');
const { CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand, AdminGetUserCommand } = require('@aws-sdk/client-cognito-identity-provider');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Client } = require('pg');
const crypto = require('crypto');
const fs = require('fs');

// Configuration
const COGNITO_USER_POOL_ID = 'us-east-2_e02zbxuZ2';
const AWS_REGION = 'us-east-2';

const cognitoClient = new CognitoIdentityProviderClient({ region: AWS_REGION });
const secretsClient = new SecretsManagerClient({ region: AWS_REGION });

// Database connection
const dbConfig = {
  host: 'panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com',
  port: 5432,
  database: 'panda_crm',
  user: 'pandacrm',
  password: 'PandaCRM2025Secure!',
  ssl: { rejectUnauthorized: false }
};

// Generate random 10 alphanumeric password that meets Cognito requirements
// Must have: uppercase, lowercase, number, special character
function generatePassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const numbers = '23456789';
  const special = '!@#$';

  // Ensure at least one of each required character type
  let password = '';
  password += upper.charAt(Math.floor(Math.random() * upper.length));
  password += lower.charAt(Math.floor(Math.random() * lower.length));
  password += numbers.charAt(Math.floor(Math.random() * numbers.length));
  password += special.charAt(Math.floor(Math.random() * special.length));

  // Fill remaining with mixed characters
  const allChars = upper + lower + numbers;
  for (let i = 0; i < 6; i++) {
    password += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }

  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Get Salesforce credentials from Secrets Manager
async function getSalesforceCredentials() {
  const command = new GetSecretValueCommand({ SecretId: 'salesforce-api-credentials' });
  const response = await secretsClient.send(command);
  return JSON.parse(response.SecretString);
}

// Check if user exists in Cognito
async function getCognitoUser(email) {
  try {
    const command = new AdminGetUserCommand({
      UserPoolId: COGNITO_USER_POOL_ID,
      Username: email.toLowerCase(),
    });
    const response = await cognitoClient.send(command);
    return response;
  } catch (error) {
    if (error.name === 'UserNotFoundException') {
      return null;
    }
    throw error;
  }
}

// Create or update Cognito user
async function ensureCognitoUser(email, firstName, lastName, password) {
  const username = email.toLowerCase();

  try {
    // Check if user exists
    const existingUser = await getCognitoUser(email);

    if (existingUser) {
      // User exists, just set password
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: username,
        Password: password,
        Permanent: true,
      });
      await cognitoClient.send(setPasswordCommand);

      // Get the sub (cognito ID)
      const subAttr = existingUser.UserAttributes?.find(a => a.Name === 'sub');
      return {
        cognitoId: subAttr?.Value,
        isNew: false,
      };
    } else {
      // Create new user
      const createCommand = new AdminCreateUserCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: username,
        UserAttributes: [
          { Name: 'email', Value: email.toLowerCase() },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'given_name', Value: firstName || '' },
          { Name: 'family_name', Value: lastName || '' },
        ],
        MessageAction: 'SUPPRESS', // Don't send welcome email
        TemporaryPassword: password,
      });

      const createResponse = await cognitoClient.send(createCommand);

      // Set permanent password
      const setPasswordCommand = new AdminSetUserPasswordCommand({
        UserPoolId: COGNITO_USER_POOL_ID,
        Username: username,
        Password: password,
        Permanent: true,
      });
      await cognitoClient.send(setPasswordCommand);

      // Get the sub (cognito ID)
      const subAttr = createResponse.User?.Attributes?.find(a => a.Name === 'sub');
      return {
        cognitoId: subAttr?.Value,
        isNew: true,
      };
    }
  } catch (error) {
    console.error(`Error with Cognito user ${email}:`, error.message);
    return { cognitoId: null, isNew: false, error: error.message };
  }
}

// Check if email looks like a valid person email (not system/integration/crew)
function isRealPerson(sfUser) {
  const email = (sfUser.Email || '').toLowerCase();
  const name = (sfUser.Name || '').toLowerCase();

  // Skip system/integration accounts
  if (email.includes('integration') || email.includes('noreply@') ||
      email.includes('.ext') || email.includes('force.com') ||
      email.includes('@example') || email.includes('migration')) {
    return false;
  }

  // Skip site guest users
  if (name.includes('site guest') || name.includes('automated process')) {
    return false;
  }

  // Skip crew/roofing/gutters accounts (contractors)
  if (name.includes(' crew') || name.includes('roofing ') || name.includes('gutters') ||
      name.includes(' siding') || name.includes('interior crew')) {
    return false;
  }

  return true;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SALESFORCE USER SYNC TO PANDA CRM');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Connect to Salesforce
  console.log('Connecting to Salesforce...');
  const sfCreds = await getSalesforceCredentials();
  const conn = new jsforce.Connection({
    loginUrl: 'https://login.salesforce.com'
  });
  await conn.login(sfCreds.username, sfCreds.password + sfCreds.security_token);
  console.log('✓ Connected to Salesforce\n');

  // Query all users from Salesforce
  console.log('Querying Salesforce users...');
  const sfQuery = `
    SELECT
      Id, Email, FirstName, LastName, Name, IsActive,
      Phone, MobilePhone,
      Department, Division, Title,
      Office_Assignment__c,
      ManagerId, Manager.Name, Manager.Email,
      Director__c, Regional_Manager__c, Executive__c,
      Commission_Rate__c, Pre_Commission_Rate__c,
      Self_Gen_Rate__c, Company_Lead_Rate__c,
      Override__c, Supplements_Commissionable__c,
      X50_50_Commission_Split__c,
      Profile.Name, UserRole.Name,
      Start_Date__c
    FROM User
    WHERE Email != null
    ORDER BY LastName, FirstName
  `;

  const sfResult = await conn.query(sfQuery);
  const sfUsers = sfResult.records;
  console.log(`✓ Found ${sfUsers.length} Salesforce users\n`);

  // Connect to database
  console.log('Connecting to Panda CRM database...');
  const db = new Client(dbConfig);
  await db.connect();
  console.log('✓ Connected to database\n');

  // Get existing users from database
  const existingUsersResult = await db.query(`
    SELECT id, email, salesforce_id, cognito_id, first_name, last_name, is_active
    FROM users
  `);
  const existingUsers = new Map(existingUsersResult.rows.map(u => [u.email?.toLowerCase(), u]));
  console.log(`✓ Found ${existingUsers.size} existing users in Panda CRM\n`);

  // Build Salesforce ID to internal ID map for manager lookups
  const sfIdMap = new Map();
  for (const sfUser of sfUsers) {
    const existing = existingUsers.get(sfUser.Email?.toLowerCase());
    if (existing) {
      sfIdMap.set(sfUser.Id, existing.id);
    }
  }

  // Track results
  const results = {
    created: [],
    updated: [],
    skipped: [],
    errors: [],
    passwords: [],
  };

  // Process each Salesforce user
  console.log('Processing users...\n');

  for (const sfUser of sfUsers) {
    const email = sfUser.Email?.toLowerCase();
    if (!email) {
      results.skipped.push({ name: sfUser.Name, reason: 'No email' });
      continue;
    }

    // Skip non-person accounts for Cognito
    const isPerson = isRealPerson(sfUser);

    try {
      const existingUser = existingUsers.get(email);
      const isActive = sfUser.IsActive === true;

      // Generate password only for active real people
      let password = null;
      if (isActive && isPerson) {
        password = generatePassword();
      }

      // Prepare user data - using correct column names from schema
      const userData = {
        salesforceId: sfUser.Id,
        email: email,
        firstName: sfUser.FirstName || '',
        lastName: sfUser.LastName || '',
        fullName: sfUser.Name || `${sfUser.FirstName || ''} ${sfUser.LastName || ''}`.trim(),
        phone: sfUser.Phone || null,
        mobilePhone: sfUser.MobilePhone || null,
        department: sfUser.Department || null,
        division: sfUser.Division || null,
        title: sfUser.Title || null,
        officeAssignment: sfUser.Office_Assignment__c || null,
        isActive: isActive,
        commissionRate: sfUser.Commission_Rate__c || null,
        preCommissionRate: sfUser.Pre_Commission_Rate__c || null,
        selfGenRate: sfUser.Self_Gen_Rate__c || null,
        companyLeadRate: sfUser.Company_Lead_Rate__c || null,
        overridePercent: sfUser.Override__c || null,
        supplementsCommissionable: sfUser.Supplements_Commissionable__c || false,
        x5050CommissionSplit: sfUser.X50_50_Commission_Split__c || false,
        startDate: sfUser.Start_Date__c || null,
        // Manager lookups - will be resolved after first pass
        managerSfId: sfUser.ManagerId || null,
        directorSfId: sfUser.Director__c || null,
        regionalManagerSfId: sfUser.Regional_Manager__c || null,
        executiveSfId: sfUser.Executive__c || null,
      };

      let cognitoId = existingUser?.cognito_id || null;

      // Create/update Cognito for active real people
      if (isActive && isPerson && password) {
        const cognitoResult = await ensureCognitoUser(email, userData.firstName, userData.lastName, password);
        if (cognitoResult.cognitoId) {
          cognitoId = cognitoResult.cognitoId;
        }

        // Store password for output
        results.passwords.push({
          name: `${userData.firstName} ${userData.lastName}`.trim(),
          email: email,
          password: password,
          isNewCognito: cognitoResult.isNew,
          office: userData.officeAssignment,
          department: userData.department,
          title: userData.title,
        });
      }

      if (existingUser) {
        // Update existing user
        await db.query(`
          UPDATE users SET
            salesforce_id = $1,
            first_name = $2,
            last_name = $3,
            full_name = $4,
            phone = $5,
            mobile_phone = $6,
            department = $7,
            division = $8,
            title = $9,
            office_assignment = $10,
            is_active = $11,
            commission_rate = $12,
            pre_commission_rate = $13,
            self_gen_rate = $14,
            company_lead_rate = $15,
            override_percent = $16,
            supplements_commissionable = $17,
            x50_50_commission_split = $18,
            start_date = $19,
            cognito_id = COALESCE($20, cognito_id),
            updated_at = NOW()
          WHERE id = $21
        `, [
          userData.salesforceId,
          userData.firstName,
          userData.lastName,
          userData.fullName,
          userData.phone,
          userData.mobilePhone,
          userData.department,
          userData.division,
          userData.title,
          userData.officeAssignment,
          userData.isActive,
          userData.commissionRate,
          userData.preCommissionRate,
          userData.selfGenRate,
          userData.companyLeadRate,
          userData.overridePercent,
          userData.supplementsCommissionable,
          userData.x5050CommissionSplit,
          userData.startDate,
          cognitoId,
          existingUser.id,
        ]);

        // Store SF ID mapping
        sfIdMap.set(userData.salesforceId, existingUser.id);

        results.updated.push({ name: sfUser.Name, email });
        process.stdout.write(`  Updated: ${sfUser.Name}\n`);
      } else {
        // Create new user
        const newId = crypto.randomUUID();
        await db.query(`
          INSERT INTO users (
            id, salesforce_id, email, first_name, last_name, full_name,
            phone, mobile_phone, department, division, title, office_assignment,
            is_active, commission_rate, pre_commission_rate, self_gen_rate,
            company_lead_rate, override_percent, supplements_commissionable,
            x50_50_commission_split, start_date, cognito_id, created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, NOW(), NOW()
          )
        `, [
          newId,
          userData.salesforceId,
          userData.email,
          userData.firstName,
          userData.lastName,
          userData.fullName,
          userData.phone,
          userData.mobilePhone,
          userData.department,
          userData.division,
          userData.title,
          userData.officeAssignment,
          userData.isActive,
          userData.commissionRate,
          userData.preCommissionRate,
          userData.selfGenRate,
          userData.companyLeadRate,
          userData.overridePercent,
          userData.supplementsCommissionable,
          userData.x5050CommissionSplit,
          userData.startDate,
          cognitoId,
        ]);

        // Store SF ID mapping
        sfIdMap.set(userData.salesforceId, newId);

        results.created.push({ name: sfUser.Name, email });
        process.stdout.write(`  Created: ${sfUser.Name}\n`);
      }
    } catch (error) {
      results.errors.push({ name: sfUser.Name, email, error: error.message });
      console.error(`  Error with ${sfUser.Name}: ${error.message}`);
    }
  }

  // Second pass: Update manager references using Salesforce IDs
  console.log('\nUpdating manager references...');

  for (const sfUser of sfUsers) {
    const email = sfUser.Email?.toLowerCase();
    if (!email) continue;

    const userId = sfIdMap.get(sfUser.Id);
    if (!userId) continue;

    const managerId = sfUser.ManagerId ? sfIdMap.get(sfUser.ManagerId) : null;
    const directorId = sfUser.Director__c ? sfIdMap.get(sfUser.Director__c) : null;
    const regionalManagerId = sfUser.Regional_Manager__c ? sfIdMap.get(sfUser.Regional_Manager__c) : null;
    const executiveId = sfUser.Executive__c ? sfIdMap.get(sfUser.Executive__c) : null;

    if (managerId || directorId || regionalManagerId || executiveId) {
      try {
        await db.query(`
          UPDATE users SET
            manager_id = COALESCE($1, manager_id),
            director_id = COALESCE($2, director_id),
            regional_manager_id = COALESCE($3, regional_manager_id),
            executive_id = COALESCE($4, executive_id)
          WHERE id = $5
        `, [managerId, directorId, regionalManagerId, executiveId, userId]);
      } catch (error) {
        console.error(`  Error updating managers for ${sfUser.Name}: ${error.message}`);
      }
    }
  }

  await db.end();

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('SYNC COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log(`Created: ${results.created.length}`);
  console.log(`Updated: ${results.updated.length}`);
  console.log(`Skipped: ${results.skipped.length}`);
  console.log(`Errors:  ${results.errors.length}`);

  // Print passwords for active users
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('PASSWORD LIST FOR ACTIVE EMPLOYEES');
  console.log('═══════════════════════════════════════════════════════════\n');

  const activePasswords = results.passwords.filter(p => p.password);
  activePasswords.sort((a, b) => a.name.localeCompare(b.name));

  console.log('Name | Email | Password | Office | Department | Title');
  console.log('─────────────────────────────────────────────────────────────────────────────────────────────────────────────────');

  for (const p of activePasswords) {
    console.log(`${p.name} | ${p.email} | ${p.password} | ${p.office || '-'} | ${p.department || '-'} | ${p.title || '-'}`);
  }

  console.log(`\nTotal: ${activePasswords.length} active employees with passwords`);

  // Also save to file
  const passwordFile = '/tmp/panda-crm-passwords.csv';
  const csvContent = 'Name,Email,Password,Office,Department,Title\n' +
    activePasswords.map(p => `"${p.name}","${p.email}","${p.password}","${p.office || ''}","${p.department || ''}","${p.title || ''}"`).join('\n');
  fs.writeFileSync(passwordFile, csvContent);
  console.log(`\nPasswords also saved to: ${passwordFile}`);

  if (results.errors.length > 0) {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('ERRORS');
    console.log('═══════════════════════════════════════════════════════════\n');
    for (const err of results.errors) {
      console.log(`${err.name} (${err.email}): ${err.error}`);
    }
  }
}

main().catch(console.error);
