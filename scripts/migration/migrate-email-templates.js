#!/usr/bin/env node
// Migrate Email Templates from Salesforce to Panda CRM MessageTemplate table
import { querySalesforce } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

const prisma = await getPrismaClient();

// Salesforce EmailTemplate fields to fetch
const EMAIL_TEMPLATE_FIELDS = [
  'Id',
  'Name',
  'DeveloperName',
  'Subject',
  'Body',
  'HtmlValue',
  'Description',
  'FolderId',
  'Folder.Name',
  'IsActive',
  'TemplateType',
  'CreatedDate',
  'LastModifiedDate',
];

function mapCategory(folderName) {
  // Map Salesforce folder names to categories
  const categoryMap = {
    'lead': 'LEAD',
    'sales': 'SALES',
    'marketing': 'MARKETING',
    'service': 'SERVICE',
    'appointment': 'APPOINTMENT',
    'notification': 'NOTIFICATION',
    'customer': 'CUSTOMER',
    'follow': 'FOLLOW_UP',
    'confirmation': 'CONFIRMATION',
  };

  const lowerFolder = (folderName || '').toLowerCase();
  for (const [key, value] of Object.entries(categoryMap)) {
    if (lowerFolder.includes(key)) {
      return value;
    }
  }
  return 'GENERAL';
}

function transformTemplate(sfTemplate) {
  return {
    name: sfTemplate.Name,
    description: sfTemplate.Description,
    type: 'EMAIL', // All email templates
    category: mapCategory(sfTemplate.Folder?.Name || ''),
    subject: sfTemplate.Subject || sfTemplate.Name,
    body: sfTemplate.HtmlValue || sfTemplate.Body || '',
    variables: extractVariables(sfTemplate.HtmlValue || sfTemplate.Body || ''),
    isActive: sfTemplate.IsActive !== false,
    isSystem: false,
  };
}

/**
 * Extract variables from template string
 * Supports {{variable}}, {variable}, {!variable}, and merge field syntax
 */
function extractVariables(template) {
  if (!template) return [];

  const variables = new Set();

  // Match {{variable}}
  const doubleBrace = /\{\{(\w+)\}\}/g;
  let match;
  while ((match = doubleBrace.exec(template)) !== null) {
    variables.add(match[1]);
  }

  // Match {!variable} (Salesforce merge field syntax)
  const sfMergeField = /\{!(\w+)\}/g;
  while ((match = sfMergeField.exec(template)) !== null) {
    variables.add(match[1]);
  }

  // Match {variable}
  const singleBrace = /\{(\w+)\}/g;
  while ((match = singleBrace.exec(template)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables);
}

async function migrateEmailTemplates() {
  console.log('Starting Email Templates Migration from Salesforce...\n');

  try {
    // Query Salesforce for email templates
    const query = `
      SELECT ${EMAIL_TEMPLATE_FIELDS.join(', ')}
      FROM EmailTemplate
      WHERE IsActive = true
      ORDER BY Name
    `;

    console.log('Fetching email templates from Salesforce...');
    const sfTemplates = await querySalesforce(query);
    console.log(`Found ${sfTemplates.length} email templates in Salesforce\n`);

    if (sfTemplates.length === 0) {
      console.log('No email templates found in Salesforce.');
      return;
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Process templates
    for (const sfTemplate of sfTemplates) {
      try {
        const data = transformTemplate(sfTemplate);

        // Skip if body is empty
        if (!data.body || data.body.trim() === '') {
          console.log(`  SKIP: ${sfTemplate.Name} (empty body)`);
          skipped++;
          continue;
        }

        // Check if template already exists (by name)
        const existing = await prisma.messageTemplate.findFirst({
          where: { name: data.name },
        });

        if (existing) {
          // Update existing template
          await prisma.messageTemplate.update({
            where: { id: existing.id },
            data,
          });
          console.log(`  UPDATE: ${data.name}`);
          updated++;
        } else {
          // Create new template
          await prisma.messageTemplate.create({
            data,
          });
          console.log(`  CREATE: ${data.name}`);
          created++;
        }
      } catch (err) {
        console.error(`  ERROR: ${sfTemplate.Name} - ${err.message}`);
        errors++;
      }
    }

    console.log('\n--- Migration Summary ---');
    console.log(`Created: ${created}`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Errors: ${errors}`);
    console.log(`Total processed: ${sfTemplates.length}`);

  } catch (err) {
    console.error('Migration failed:', err.message);
    throw err;
  } finally {
    await disconnect();
  }
}

// Also create some default SMS templates
async function createDefaultSmsTemplates() {
  console.log('\nCreating default SMS templates...\n');

  const defaultSmsTemplates = [
    {
      name: 'Lead Confirmation',
      description: 'Confirm appointment with lead',
      type: 'SMS',
      category: 'CONFIRMATION',
      subject: null,
      body: 'Hi {{firstName}}, this is Panda Exteriors confirming your appointment. Reply YES to confirm or call us at (XXX) XXX-XXXX to reschedule.',
      variables: ['firstName'],
      isActive: true,
      isSystem: true,
    },
    {
      name: 'Appointment Reminder',
      description: 'Remind about upcoming appointment',
      type: 'SMS',
      category: 'APPOINTMENT',
      subject: null,
      body: 'Hi {{firstName}}, just a reminder about your appointment with Panda Exteriors tomorrow. See you then!',
      variables: ['firstName'],
      isActive: true,
      isSystem: true,
    },
    {
      name: 'Thank You Follow Up',
      description: 'Thank customer after appointment',
      type: 'SMS',
      category: 'FOLLOW_UP',
      subject: null,
      body: 'Hi {{firstName}}, thank you for meeting with us today! If you have any questions, feel free to reach out. - Panda Exteriors',
      variables: ['firstName'],
      isActive: true,
      isSystem: true,
    },
    {
      name: 'Quote Follow Up',
      description: 'Follow up on quote',
      type: 'SMS',
      category: 'SALES',
      subject: null,
      body: 'Hi {{firstName}}, just checking in on the quote we sent. Let us know if you have any questions! - Panda Exteriors',
      variables: ['firstName'],
      isActive: true,
      isSystem: true,
    },
    {
      name: 'Inspection Scheduled',
      description: 'Confirm inspection appointment',
      type: 'SMS',
      category: 'APPOINTMENT',
      subject: null,
      body: 'Hi {{firstName}}, your inspection with Panda Exteriors has been scheduled. We look forward to seeing you!',
      variables: ['firstName'],
      isActive: true,
      isSystem: true,
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const template of defaultSmsTemplates) {
    try {
      const existing = await prisma.messageTemplate.findFirst({
        where: { name: template.name, type: 'SMS' },
      });

      if (existing) {
        console.log(`  SKIP: ${template.name} (already exists)`);
        skipped++;
      } else {
        await prisma.messageTemplate.create({ data: template });
        console.log(`  CREATE: ${template.name}`);
        created++;
      }
    } catch (err) {
      console.error(`  ERROR: ${template.name} - ${err.message}`);
    }
  }

  console.log(`\nSMS Templates - Created: ${created}, Skipped: ${skipped}`);
}

// Also create some default Email templates
async function createDefaultEmailTemplates() {
  console.log('\nCreating default Email templates...\n');

  const defaultEmailTemplates = [
    {
      name: 'Welcome Email',
      description: 'Welcome new leads',
      type: 'EMAIL',
      category: 'LEAD',
      subject: 'Welcome to Panda Exteriors!',
      body: `Hi {{firstName}},

Thank you for your interest in Panda Exteriors! We're excited to help you with your roofing and exterior needs.

One of our team members will be in touch shortly to schedule your free consultation.

In the meantime, if you have any questions, feel free to reply to this email or give us a call.

Best regards,
The Panda Exteriors Team`,
      variables: ['firstName'],
      isActive: true,
      isSystem: true,
    },
    {
      name: 'Appointment Confirmation',
      description: 'Confirm scheduled appointment',
      type: 'EMAIL',
      category: 'CONFIRMATION',
      subject: 'Your Appointment is Confirmed',
      body: `Hi {{firstName}},

Your appointment with Panda Exteriors has been confirmed!

We look forward to meeting with you and discussing how we can help with your project.

If you need to reschedule or have any questions, please don't hesitate to contact us.

Best regards,
The Panda Exteriors Team`,
      variables: ['firstName'],
      isActive: true,
      isSystem: true,
    },
    {
      name: 'Quote Follow Up',
      description: 'Follow up on sent quote',
      type: 'EMAIL',
      category: 'SALES',
      subject: 'Following Up on Your Quote',
      body: `Hi {{firstName}},

I wanted to follow up on the quote we recently sent you. Have you had a chance to review it?

If you have any questions or would like to discuss the details, I'm happy to help. We can also schedule a call at your convenience.

Looking forward to hearing from you!

Best regards,
The Panda Exteriors Team`,
      variables: ['firstName'],
      isActive: true,
      isSystem: true,
    },
    {
      name: 'Thank You',
      description: 'Thank customer after meeting',
      type: 'EMAIL',
      category: 'FOLLOW_UP',
      subject: 'Thank You for Meeting with Us',
      body: `Hi {{firstName}},

Thank you for taking the time to meet with us today. It was great learning about your project needs.

As discussed, I've attached all the relevant information. Please don't hesitate to reach out if you have any questions.

We look forward to working with you!

Best regards,
The Panda Exteriors Team`,
      variables: ['firstName'],
      isActive: true,
      isSystem: true,
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const template of defaultEmailTemplates) {
    try {
      const existing = await prisma.messageTemplate.findFirst({
        where: { name: template.name, type: 'EMAIL' },
      });

      if (existing) {
        console.log(`  SKIP: ${template.name} (already exists)`);
        skipped++;
      } else {
        await prisma.messageTemplate.create({ data: template });
        console.log(`  CREATE: ${template.name}`);
        created++;
      }
    } catch (err) {
      console.error(`  ERROR: ${template.name} - ${err.message}`);
    }
  }

  console.log(`\nEmail Templates - Created: ${created}, Skipped: ${skipped}`);
}

// Run migration
async function main() {
  console.log('========================================');
  console.log('  Email/SMS Templates Migration Tool');
  console.log('========================================\n');

  const args = process.argv.slice(2);
  const skipSalesforce = args.includes('--skip-salesforce');
  const defaultsOnly = args.includes('--defaults-only');

  if (!defaultsOnly && !skipSalesforce) {
    await migrateEmailTemplates();
  }

  // Always create default templates
  await createDefaultSmsTemplates();
  await createDefaultEmailTemplates();

  console.log('\n========================================');
  console.log('  Migration Complete!');
  console.log('========================================');
}

main().catch(console.error);
