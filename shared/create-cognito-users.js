import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm' } }
});

const USER_POOL_ID = 'us-east-2_e02zbxuZ2';
const DEFAULT_PASSWORD = 'Panda2025!'; // Temporary password, user must change on first login

async function createCognitoUser(user) {
  const { email, firstName, lastName, role } = user;

  // Determine role for Cognito
  const roleName = role?.name?.toLowerCase() || 'user';
  let cognitoRole = 'user';
  if (roleName.includes('admin') || roleName.includes('super')) {
    cognitoRole = 'admin';
  } else if (roleName.includes('manager')) {
    cognitoRole = 'manager';
  }

  // Determine department from role
  let department = 'Sales';
  if (roleName.includes('call center')) {
    department = 'Call Center';
  } else if (roleName.includes('project') || roleName.includes('pm ')) {
    department = 'Project Management';
  } else if (roleName.includes('field') || roleName.includes('technician')) {
    department = 'Field Operations';
  }

  try {
    // Create user in Cognito with SUPPRESS message action (no email sent)
    // Note: custom:custom:department is the correct attribute name in this pool
    const cmd = `aws cognito-idp admin-create-user \
      --user-pool-id ${USER_POOL_ID} \
      --username "${email}" \
      --user-attributes \
        Name=email,Value="${email}" \
        Name=email_verified,Value=true \
        Name=given_name,Value="${firstName || ''}" \
        Name=family_name,Value="${lastName || ''}" \
        Name=custom:role,Value="${cognitoRole}" \
        Name=custom:custom:department,Value="${department}" \
      --temporary-password "${DEFAULT_PASSWORD}" \
      --message-action SUPPRESS \
      --output json`;

    const { stdout } = await execPromise(cmd);
    const result = JSON.parse(stdout);

    // Extract the sub (cognitoId) from the response
    const sub = result.User?.Attributes?.find(a => a.Name === 'sub')?.Value;

    if (sub) {
      return { success: true, cognitoId: sub };
    } else {
      return { success: false, error: 'No sub returned' };
    }
  } catch (err) {
    // Check if user already exists
    if (err.message.includes('UsernameExistsException')) {
      // User exists, try to get their sub
      try {
        const getCmd = `aws cognito-idp admin-get-user --user-pool-id ${USER_POOL_ID} --username "${email}" --output json`;
        const { stdout } = await execPromise(getCmd);
        const result = JSON.parse(stdout);
        const sub = result.UserAttributes?.find(a => a.Name === 'sub')?.Value;
        if (sub) {
          return { success: true, cognitoId: sub, existed: true };
        }
      } catch (getErr) {
        return { success: false, error: getErr.message };
      }
    }
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('Fetching users without cognitoId...');

  // Get active users without cognitoId
  const users = await prisma.user.findMany({
    where: {
      cognitoId: null,
      isActive: true
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: { select: { name: true } }
    },
    orderBy: { email: 'asc' }
  });

  console.log(`Found ${users.length} active users without cognitoId`);

  let created = 0;
  let alreadyExisted = 0;
  let failed = 0;

  for (const user of users) {
    process.stdout.write(`Processing ${user.email}...`);

    const result = await createCognitoUser(user);

    if (result.success) {
      // Update database with cognitoId
      await prisma.user.update({
        where: { id: user.id },
        data: { cognitoId: result.cognitoId }
      });

      if (result.existed) {
        console.log(' already existed, synced cognitoId');
        alreadyExisted++;
      } else {
        console.log(' created');
        created++;
      }
    } else {
      console.log(` FAILED: ${result.error}`);
      failed++;
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\nSummary:`);
  console.log(`  Created: ${created}`);
  console.log(`  Already existed (synced): ${alreadyExisted}`);
  console.log(`  Failed: ${failed}`);

  await prisma.$disconnect();
}

main().catch(console.error);
