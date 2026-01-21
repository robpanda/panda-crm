#!/usr/bin/env node
// Check more details about email templates and their usage
import { getPrismaClient, disconnect } from './prisma-client.js';

const prisma = await getPrismaClient();

async function checkTemplateDetails() {
  console.log('========================================');
  console.log('  Template Details & Workflow Check');
  console.log('========================================\n');

  // Get templates with their actual content
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 10
  });

  console.log('--- 10 Most Recently Updated Templates ---\n');
  templates.forEach((t, i) => {
    console.log(`${i + 1}. ${t.name}`);
    console.log(`   Type: ${t.type} | Category: ${t.category}`);
    console.log(`   Subject: ${t.subject || '(none)'}`);
    console.log(`   Active: ${t.isActive} | System: ${t.isSystem}`);
    console.log(`   Variables: ${(t.variables || []).join(', ') || '(none)'}`);
    console.log(`   Body length: ${(t.body || '').length} chars`);
    console.log(`   Updated: ${t.updatedAt}`);
    console.log('');
  });

  // Check for any workflow-related tables
  console.log('--- Checking for Workflow Tables ---\n');

  try {
    // Check if Workflow model exists and has email actions
    const workflows = await prisma.workflow.findMany({
      take: 20
    });
    console.log(`Found ${workflows.length} workflows`);

    // Check for email-related workflows
    const emailWorkflows = workflows.filter(w => {
      const name = (w.name || '').toLowerCase();
      return name.includes('email') || name.includes('notification') || name.includes('template');
    });

    if (emailWorkflows.length > 0) {
      console.log(`\nEmail-related workflows:`);
      emailWorkflows.forEach(w => {
        console.log(`  - ${w.name} (${w.isActive ? 'active' : 'inactive'})`);
      });
    }
  } catch (e) {
    console.log(`Workflow table check: ${e.message}`);
  }

  // Show templates by category that would be used in workflows
  console.log('\n--- Templates Likely Used in Workflows ---\n');

  const workflowCategories = ['NOTIFICATION', 'LEAD', 'SCHEDULING', 'APPOINTMENT', 'FOLLOW_UP'];

  for (const category of workflowCategories) {
    const catTemplates = await prisma.messageTemplate.findMany({
      where: { category },
      select: { id: true, name: true, subject: true, variables: true }
    });

    if (catTemplates.length > 0) {
      console.log(`${category} (${catTemplates.length} templates):`);
      catTemplates.forEach(t => {
        console.log(`  - ${t.name}`);
        console.log(`    Subject: ${t.subject || '(none)'}`);
        console.log(`    Variables: ${(t.variables || []).join(', ') || '(none)'}`);
      });
      console.log('');
    }
  }

  // Show SMS templates
  console.log('--- SMS Templates ---\n');
  const smsTemplates = await prisma.messageTemplate.findMany({
    where: { type: 'SMS' }
  });

  if (smsTemplates.length === 0) {
    console.log('No SMS templates found');
  } else {
    console.log(`Found ${smsTemplates.length} SMS templates:`);
    smsTemplates.forEach(t => {
      console.log(`  - ${t.name} (${t.category})`);
      console.log(`    Body: ${(t.body || '').substring(0, 80)}...`);
    });
  }

  console.log('\n========================================');
  console.log('  Check Complete!');
  console.log('========================================');
}

checkTemplateDetails()
  .catch(console.error)
  .finally(() => disconnect());
