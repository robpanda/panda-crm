import { PrismaClient } from '@prisma/client';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://pandacrm:PandaCRM2025Secure!@panda-crm-db.c1o4i6ekayqo.us-east-2.rds.amazonaws.com:5432/panda_crm' } }
});

async function getCognitoUsers() {
  // Get all Cognito users (paginated)
  let allUsers = [];
  let paginationToken = null;

  do {
    const cmd = paginationToken
      ? `aws cognito-idp list-users --user-pool-id us-east-2_e02zbxuZ2 --limit 60 --pagination-token "${paginationToken}" --output json`
      : `aws cognito-idp list-users --user-pool-id us-east-2_e02zbxuZ2 --limit 60 --output json`;

    const { stdout } = await execPromise(cmd);
    const result = JSON.parse(stdout);

    for (const user of result.Users) {
      const email = user.Attributes?.find(a => a.Name === 'email')?.Value;
      const sub = user.Attributes?.find(a => a.Name === 'sub')?.Value;
      if (email && sub) {
        allUsers.push({ email: email.toLowerCase(), cognitoId: sub });
      }
    }

    paginationToken = result.PaginationToken;
  } while (paginationToken);

  return allUsers;
}

async function main() {
  console.log('Fetching Cognito users...');
  const cognitoUsers = await getCognitoUsers();
  console.log(`Found ${cognitoUsers.length} Cognito users`);

  let updated = 0;
  let notFound = 0;
  let alreadySet = 0;

  for (const cu of cognitoUsers) {
    try {
      // Find user by email
      const dbUser = await prisma.user.findFirst({
        where: { email: { equals: cu.email, mode: 'insensitive' } },
        select: { id: true, email: true, cognitoId: true }
      });

      if (!dbUser) {
        notFound++;
        continue;
      }

      if (dbUser.cognitoId === cu.cognitoId) {
        alreadySet++;
        continue;
      }

      // Update cognitoId
      await prisma.user.update({
        where: { id: dbUser.id },
        data: { cognitoId: cu.cognitoId }
      });
      updated++;
      console.log(`Updated: ${cu.email} -> ${cu.cognitoId}`);
    } catch (err) {
      console.error(`Error updating ${cu.email}:`, err.message);
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Already set: ${alreadySet}`);
  console.log(`  Not in DB: ${notFound}`);

  await prisma.$disconnect();
}

main().catch(console.error);
