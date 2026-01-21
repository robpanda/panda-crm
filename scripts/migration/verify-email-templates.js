#!/usr/bin/env node
// Verify Email Templates have content, merge fields, and workflow triggers
import { getPrismaClient, disconnect } from './prisma-client.js';

const prisma = await getPrismaClient();

async function verifyEmailTemplates() {
  console.log('========================================');
  console.log('  Email Templates Verification Report');
  console.log('========================================\n');

  // Get all message templates
  const templates = await prisma.messageTemplate.findMany({
    orderBy: { name: 'asc' }
  });

  console.log(`Total templates found: ${templates.length}\n`);

  // Check for templates with empty content
  const emptyBodyTemplates = templates.filter(t => !t.body || t.body.trim() === '');
  console.log('--- Templates with Empty Body ---');
  if (emptyBodyTemplates.length === 0) {
    console.log('  ✓ All templates have body content');
  } else {
    console.log(`  ✗ ${emptyBodyTemplates.length} templates have empty bodies:`);
    emptyBodyTemplates.forEach(t => console.log(`    - ${t.name} (${t.type})`));
  }
  console.log('');

  // Check for templates with empty subject (for EMAIL type)
  const emailTemplates = templates.filter(t => t.type === 'EMAIL');
  const emptySubjectEmails = emailTemplates.filter(t => !t.subject || t.subject.trim() === '');
  console.log('--- Email Templates with Empty Subject ---');
  if (emptySubjectEmails.length === 0) {
    console.log('  ✓ All email templates have subjects');
  } else {
    console.log(`  ✗ ${emptySubjectEmails.length} email templates have empty subjects:`);
    emptySubjectEmails.forEach(t => console.log(`    - ${t.name}`));
  }
  console.log('');

  // Check merge fields/variables
  console.log('--- Merge Field Analysis ---');
  const templatesWithVars = templates.filter(t => t.variables && t.variables.length > 0);
  const templatesWithoutVars = templates.filter(t => !t.variables || t.variables.length === 0);

  console.log(`  Templates with variables defined: ${templatesWithVars.length}`);
  console.log(`  Templates without variables: ${templatesWithoutVars.length}`);

  // Analyze variable patterns in body content
  const varPatterns = {
    doubleBrace: /\{\{(\w+)\}\}/g,  // {{variable}}
    singleBrace: /\{(\w+)\}/g,       // {variable}
    sfMerge: /\{!(\w+)\}/g,          // {!variable}
    htmlMerge: /\[\[(\w+)\]\]/g,     // [[variable]]
  };

  console.log('\n  Variable patterns found in template bodies:');
  let patternCounts = { doubleBrace: 0, singleBrace: 0, sfMerge: 0, htmlMerge: 0 };

  templates.forEach(t => {
    if (t.body) {
      if (varPatterns.doubleBrace.test(t.body)) patternCounts.doubleBrace++;
      if (varPatterns.singleBrace.test(t.body)) patternCounts.singleBrace++;
      if (varPatterns.sfMerge.test(t.body)) patternCounts.sfMerge++;
      if (varPatterns.htmlMerge.test(t.body)) patternCounts.htmlMerge++;
    }
  });

  console.log(`    {{variable}} pattern: ${patternCounts.doubleBrace} templates`);
  console.log(`    {variable} pattern: ${patternCounts.singleBrace} templates`);
  console.log(`    {!variable} (Salesforce): ${patternCounts.sfMerge} templates`);
  console.log(`    [[variable]] pattern: ${patternCounts.htmlMerge} templates`);
  console.log('');

  // Category breakdown
  console.log('--- Category Breakdown ---');
  const byCategory = {};
  templates.forEach(t => {
    const cat = t.category || 'UNCATEGORIZED';
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  });
  Object.entries(byCategory).sort((a, b) => b[1] - a[1]).forEach(([cat, count]) => {
    console.log(`  ${cat}: ${count}`);
  });
  console.log('');

  // Type breakdown
  console.log('--- Type Breakdown ---');
  const byType = {};
  templates.forEach(t => {
    byType[t.type] = (byType[t.type] || 0) + 1;
  });
  Object.entries(byType).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  console.log('');

  // Check workflow triggers
  console.log('--- Workflow Triggers Analysis ---');
  try {
    const workflowTriggers = await prisma.workflowTrigger.findMany({
      where: {
        OR: [
          { actionType: { contains: 'email', mode: 'insensitive' } },
          { actionType: { contains: 'template', mode: 'insensitive' } },
          { actionType: { contains: 'message', mode: 'insensitive' } },
          { actionType: 'SEND_EMAIL' },
        ]
      },
      include: {
        workflow: true
      }
    });

    if (workflowTriggers.length === 0) {
      console.log('  No email-related workflow triggers found');
    } else {
      console.log(`  Found ${workflowTriggers.length} email-related workflow triggers:`);
      workflowTriggers.forEach(trigger => {
        console.log(`    - ${trigger.workflow?.name || 'Unknown'}: ${trigger.actionType}`);
        if (trigger.actionData) {
          try {
            const data = typeof trigger.actionData === 'string'
              ? JSON.parse(trigger.actionData)
              : trigger.actionData;
            if (data.templateId) {
              const template = templates.find(t => t.id === data.templateId);
              console.log(`      Template: ${template?.name || data.templateId}`);
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      });
    }
  } catch (e) {
    console.log(`  Could not query workflow triggers: ${e.message}`);
  }
  console.log('');

  // Show sample templates with content
  console.log('--- Sample Templates with Content ---');
  const samplesWithContent = templates.filter(t => t.body && t.body.length > 50).slice(0, 5);
  samplesWithContent.forEach(t => {
    console.log(`\n  Template: ${t.name}`);
    console.log(`  Type: ${t.type} | Category: ${t.category}`);
    console.log(`  Subject: ${t.subject || '(none)'}`);
    console.log(`  Variables: ${(t.variables || []).join(', ') || '(none)'}`);
    console.log(`  Body preview: ${t.body.substring(0, 150).replace(/\n/g, ' ')}...`);
  });

  // Check for common required templates
  console.log('\n\n--- Common Template Check ---');
  const commonTemplates = [
    'Welcome Email',
    'Appointment Confirmation',
    'Quote Follow Up',
    'Lead Confirmation',
    'Appointment Reminder',
  ];

  commonTemplates.forEach(name => {
    const found = templates.find(t => t.name.toLowerCase().includes(name.toLowerCase()));
    if (found) {
      const hasContent = found.body && found.body.length > 20;
      console.log(`  ✓ ${name}: Found (${found.type}, ${hasContent ? 'has content' : 'EMPTY'})`);
    } else {
      console.log(`  ✗ ${name}: Not found`);
    }
  });

  console.log('\n========================================');
  console.log('  Verification Complete!');
  console.log('========================================');
}

verifyEmailTemplates()
  .catch(console.error)
  .finally(() => disconnect());
