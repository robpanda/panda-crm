/**
 * Opt Out Contacts Script
 *
 * Opts out contacts from SMS and Email campaigns by phone number
 *
 * Usage:
 *   DATABASE_URL="postgresql://..." node opt-out-contacts.js --dry-run
 *   DATABASE_URL="postgresql://..." node opt-out-contacts.js
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// Phone numbers to opt out (normalized to 10 digits)
const PHONE_NUMBERS = [
  '5403357327',
  '2096092233',
  '9297510093',
  '7247599589',
];

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           OPT OUT CONTACTS SCRIPT                              ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log(`║  Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update database)'}`.padEnd(67) + '║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Processing ${PHONE_NUMBERS.length} phone numbers...\n`);

  let totalUpdated = 0;

  for (const phone of PHONE_NUMBERS) {
    console.log(`────────────────────────────────────────────────────────────────`);
    console.log(`Phone: +1${phone}`);

    // Find contacts matching this phone number (check both phone and mobilePhone)
    const contacts = await prisma.contact.findMany({
      where: {
        OR: [
          { phone: { contains: phone } },
          { mobilePhone: { contains: phone } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        mobilePhone: true,
        email: true,
        smsOptOut: true,
        emailOptOut: true,
      },
    });

    if (contacts.length === 0) {
      console.log(`  ⚠️  No contacts found with this phone number`);
      continue;
    }

    console.log(`  Found ${contacts.length} contact(s):`);

    for (const contact of contacts) {
      console.log(`    - ${contact.firstName || ''} ${contact.lastName || ''} (${contact.email || 'no email'})`);
      console.log(`      Phone: ${contact.phone || 'N/A'}, Mobile: ${contact.mobilePhone || 'N/A'}`);
      console.log(`      Current: smsOptOut=${contact.smsOptOut}, emailOptOut=${contact.emailOptOut}`);

      if (contact.smsOptOut && contact.emailOptOut) {
        console.log(`      ✓ Already opted out of both SMS and Email`);
        continue;
      }

      if (!DRY_RUN) {
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            smsOptOut: true,
            emailOptOut: true,
          },
        });
        console.log(`      ✅ Updated: smsOptOut=true, emailOptOut=true`);
      } else {
        console.log(`      [DRY RUN] Would set smsOptOut=true, emailOptOut=true`);
      }
      totalUpdated++;
    }
  }

  console.log(`\n────────────────────────────────────────────────────────────────`);
  console.log(`Done! ${DRY_RUN ? 'Would update' : 'Updated'} ${totalUpdated} contact(s).`);

  if (DRY_RUN) {
    console.log('\nTo apply these changes, run without --dry-run flag.');
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
