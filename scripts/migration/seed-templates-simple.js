#!/usr/bin/env node
// Simple script to seed default SMS and Email templates
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const defaultSmsTemplates = [
  {
    name: 'Lead Confirmation',
    description: 'Confirm appointment with lead',
    type: 'SMS',
    category: 'CONFIRMATION',
    subject: null,
    body: 'Hi {{firstName}}, this is Panda Exteriors confirming your appointment. Reply YES to confirm or call us to reschedule.',
    variables: ['firstName'],
    isActive: true,
    isSystem: true,
  },
  {
    name: 'Appointment Reminder',
    description: 'Remind about upcoming appointment',
    type: 'SMS',
    category: 'APPOINTMENT',
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
    body: 'Hi {{firstName}}, thank you for meeting with us today! If you have any questions, feel free to reach out. - Panda Exteriors',
    variables: ['firstName'],
    isActive: true,
    isSystem: true,
  },
  {
    name: 'Quote Follow Up SMS',
    description: 'Follow up on quote',
    type: 'SMS',
    category: 'SALES',
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
    body: 'Hi {{firstName}}, your inspection with Panda Exteriors has been scheduled. We look forward to seeing you!',
    variables: ['firstName'],
    isActive: true,
    isSystem: true,
  },
];

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

Best regards,
The Panda Exteriors Team`,
    variables: ['firstName'],
    isActive: true,
    isSystem: true,
  },
  {
    name: 'Appointment Confirmation Email',
    description: 'Confirm scheduled appointment',
    type: 'EMAIL',
    category: 'CONFIRMATION',
    subject: 'Your Appointment is Confirmed',
    body: `Hi {{firstName}},

Your appointment with Panda Exteriors has been confirmed!

We look forward to meeting with you and discussing how we can help with your project.

Best regards,
The Panda Exteriors Team`,
    variables: ['firstName'],
    isActive: true,
    isSystem: true,
  },
  {
    name: 'Quote Follow Up Email',
    description: 'Follow up on sent quote',
    type: 'EMAIL',
    category: 'SALES',
    subject: 'Following Up on Your Quote',
    body: `Hi {{firstName}},

I wanted to follow up on the quote we recently sent you. Have you had a chance to review it?

If you have any questions or would like to discuss the details, I'm happy to help.

Best regards,
The Panda Exteriors Team`,
    variables: ['firstName'],
    isActive: true,
    isSystem: true,
  },
  {
    name: 'Thank You Email',
    description: 'Thank customer after meeting',
    type: 'EMAIL',
    category: 'FOLLOW_UP',
    subject: 'Thank You for Meeting with Us',
    body: `Hi {{firstName}},

Thank you for taking the time to meet with us today. It was great learning about your project needs.

Please don't hesitate to reach out if you have any questions.

Best regards,
The Panda Exteriors Team`,
    variables: ['firstName'],
    isActive: true,
    isSystem: true,
  },
];

async function main() {
  console.log('Seeding default message templates...\n');

  // SMS Templates
  console.log('SMS Templates:');
  for (const template of defaultSmsTemplates) {
    try {
      const existing = await prisma.messageTemplate.findFirst({
        where: { name: template.name, type: 'SMS' },
      });

      if (existing) {
        console.log(`  SKIP: ${template.name} (already exists)`);
      } else {
        await prisma.messageTemplate.create({ data: template });
        console.log(`  CREATE: ${template.name}`);
      }
    } catch (err) {
      console.error(`  ERROR: ${template.name} - ${err.message}`);
    }
  }

  // Email Templates
  console.log('\nEmail Templates:');
  for (const template of defaultEmailTemplates) {
    try {
      const existing = await prisma.messageTemplate.findFirst({
        where: { name: template.name, type: 'EMAIL' },
      });

      if (existing) {
        console.log(`  SKIP: ${template.name} (already exists)`);
      } else {
        await prisma.messageTemplate.create({ data: template });
        console.log(`  CREATE: ${template.name}`);
      }
    } catch (err) {
      console.error(`  ERROR: ${template.name} - ${err.message}`);
    }
  }

  // Count templates
  const count = await prisma.messageTemplate.count();
  console.log(`\nTotal templates in database: ${count}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
