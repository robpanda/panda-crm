#!/usr/bin/env node
/**
 * Comprehensive Salesforce Email Template Migration
 *
 * Migrates all email templates from Salesforce to Panda CRM MessageTemplate table,
 * including:
 * - Template content (HTML and text body)
 * - Subject lines
 * - Folder/category mapping
 * - Merge fields extraction (Salesforce syntax like {!Contact.FirstName})
 * - Related object/module detection for workflow triggers
 *
 * Usage:
 *   node migrate-sf-email-templates.js [options]
 *
 * Options:
 *   --dry-run     Preview what would be migrated without making changes
 *   --all         Include inactive templates
 *   --verbose     Show detailed output for each template
 */

import { querySalesforce, getSalesforceConnection } from './salesforce-client.js';
import { getPrismaClient, disconnect } from './prisma-client.js';

const prisma = await getPrismaClient();

// Parse command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const INCLUDE_ALL = args.includes('--all');
const VERBOSE = args.includes('--verbose');

// Salesforce EmailTemplate fields
const EMAIL_TEMPLATE_FIELDS = [
  'Id',
  'Name',
  'DeveloperName',
  'Subject',
  'Body',           // Plain text body
  'HtmlValue',      // HTML body
  'Description',
  'FolderId',
  'Folder.Name',
  'Folder.DeveloperName',
  'IsActive',
  'TemplateType',   // text, html, custom, visualforce
  'Encoding',
  'OwnerId',
  'Owner.Name',
  'Owner.Email',
  'CreatedDate',
  'LastModifiedDate',
  'LastModifiedById',
  'LastModifiedBy.Name',
];

// Map Salesforce folder names to Bamboogli categories
const FOLDER_CATEGORY_MAP = {
  // Public folders
  'public email templates': 'PUBLIC',
  'pandaclaims': 'CLAIMS',
  'five9 email templates': 'CALL_CENTER',
  'marketing content': 'MARKETING',
  'email templates from salesforce': 'GENERAL',

  // Private template folders (map by keywords)
  'private': 'PERSONAL',

  // Keywords-based mapping
  'atr': 'CLAIMS',
  'appointment': 'APPOINTMENT',
  'schedule': 'SCHEDULING',
  'reschedule': 'SCHEDULING',
  'confirmation': 'CONFIRMATION',
  'follow up': 'FOLLOW_UP',
  'follow-up': 'FOLLOW_UP',
  'followup': 'FOLLOW_UP',
  'onboarding': 'ONBOARDING',
  'renewal': 'RENEWAL',
  'invoice': 'BILLING',
  'lead': 'LEAD',
  'prospect': 'LEAD',
  'customer': 'CUSTOMER',
  'notification': 'NOTIFICATION',
  'supplement': 'CLAIMS',
  'estimate': 'SALES',
  'quote': 'SALES',
  'dumpster': 'OPERATIONS',
  'install': 'OPERATIONS',
  'project': 'OPERATIONS',
  'nurture': 'NURTURE',
  'drip': 'NURTURE',
  'transition': 'TRANSITION',
  'event': 'EVENT',
  'meeting': 'MEETING',
  'newsletter': 'MARKETING',
  'welcome': 'ONBOARDING',
  'thank': 'FOLLOW_UP',
  'lost': 'WIN_BACK',
  'reengage': 'WIN_BACK',
};

// Salesforce merge field patterns and their CRM equivalents
const MERGE_FIELD_PATTERNS = [
  // Standard Salesforce merge fields
  { pattern: /\{!Contact\.(\w+)\}/gi, object: 'contact', prefix: 'contact' },
  { pattern: /\{!Lead\.(\w+)\}/gi, object: 'lead', prefix: 'lead' },
  { pattern: /\{!Account\.(\w+)\}/gi, object: 'account', prefix: 'account' },
  { pattern: /\{!Opportunity\.(\w+)\}/gi, object: 'opportunity', prefix: 'opportunity' },
  { pattern: /\{!Case\.(\w+)\}/gi, object: 'case', prefix: 'case' },
  { pattern: /\{!User\.(\w+)\}/gi, object: 'user', prefix: 'user' },
  { pattern: /\{!Recipient\.(\w+)\}/gi, object: 'recipient', prefix: 'recipient' },
  { pattern: /\{!Owner\.(\w+)\}/gi, object: 'owner', prefix: 'owner' },
  { pattern: /\{!Sender\.(\w+)\}/gi, object: 'sender', prefix: 'sender' },

  // Generic merge fields
  { pattern: /\{!(\w+)\.(\w+)\}/gi, object: 'dynamic', prefix: null },
  { pattern: /\{!(\w+)\}/gi, object: 'variable', prefix: null },

  // Double-brace syntax (Panda CRM style)
  { pattern: /\{\{(\w+)\.(\w+)\}\}/gi, object: 'dynamic', prefix: null },
  { pattern: /\{\{(\w+)\}\}/gi, object: 'variable', prefix: null },
];

// Map Salesforce field names to CRM field names
const FIELD_NAME_MAP = {
  'firstname': 'firstName',
  'lastname': 'lastName',
  'email': 'email',
  'phone': 'phone',
  'mobilephone': 'mobilePhone',
  'name': 'name',
  'mailingstreet': 'street',
  'mailingcity': 'city',
  'mailingstate': 'state',
  'mailingpostalcode': 'postalCode',
  'billingstreet': 'billingStreet',
  'billingcity': 'billingCity',
  'billingstate': 'billingState',
  'billingpostalcode': 'billingPostalCode',
  'title': 'title',
  'company': 'company',
  'industry': 'industry',
  'stagename': 'stageName',
  'amount': 'amount',
  'closedate': 'closeDate',
  'description': 'description',
  'createddate': 'createdAt',
  'lastmodifieddate': 'updatedAt',
};

/**
 * Determine category from folder name and template name
 */
function determineCategory(folderName, templateName) {
  const combined = `${folderName || ''} ${templateName || ''}`.toLowerCase();

  // Check folder name first
  const folderLower = (folderName || '').toLowerCase();
  for (const [key, category] of Object.entries(FOLDER_CATEGORY_MAP)) {
    if (folderLower.includes(key)) {
      return category;
    }
  }

  // Check combined for keywords
  for (const [key, category] of Object.entries(FOLDER_CATEGORY_MAP)) {
    if (combined.includes(key)) {
      return category;
    }
  }

  return 'GENERAL';
}

/**
 * Extract and normalize merge fields from template content
 */
function extractMergeFields(content) {
  if (!content) return { variables: [], relatedObjects: [] };

  const variables = new Set();
  const relatedObjects = new Set();

  for (const { pattern, object, prefix } of MERGE_FIELD_PATTERNS) {
    let match;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(content)) !== null) {
      if (object === 'dynamic' && match[1] && match[2]) {
        // Object.Field pattern
        const objName = match[1].toLowerCase();
        const fieldName = match[2].toLowerCase();
        const normalizedField = FIELD_NAME_MAP[fieldName] || toCamelCase(fieldName);
        variables.add(`${objName}.${normalizedField}`);
        relatedObjects.add(objName);
      } else if (object === 'variable' && match[1]) {
        // Simple variable
        const fieldName = match[1].toLowerCase();
        const normalizedField = FIELD_NAME_MAP[fieldName] || toCamelCase(fieldName);
        variables.add(normalizedField);
      } else if (prefix && match[1]) {
        // Known object with field
        const fieldName = match[1].toLowerCase();
        const normalizedField = FIELD_NAME_MAP[fieldName] || toCamelCase(fieldName);
        variables.add(`${prefix}.${normalizedField}`);
        relatedObjects.add(object);
      }
    }
  }

  return {
    variables: Array.from(variables).sort(),
    relatedObjects: Array.from(relatedObjects).sort(),
  };
}

/**
 * Convert snake_case or PascalCase to camelCase
 */
function toCamelCase(str) {
  return str
    .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
    .replace(/^([A-Z])/, (_, letter) => letter.toLowerCase());
}

/**
 * Convert Salesforce merge field syntax to Panda CRM syntax
 */
function convertMergeFieldSyntax(content) {
  if (!content) return content;

  let converted = content;

  // Convert {!Object.Field} to {{object.field}}
  converted = converted.replace(/\{!(\w+)\.(\w+)\}/g, (match, obj, field) => {
    const normalizedObj = obj.toLowerCase();
    const normalizedField = FIELD_NAME_MAP[field.toLowerCase()] || toCamelCase(field);
    return `{{${normalizedObj}.${normalizedField}}}`;
  });

  // Convert {!Variable} to {{variable}}
  converted = converted.replace(/\{!(\w+)\}/g, (match, variable) => {
    const normalizedField = FIELD_NAME_MAP[variable.toLowerCase()] || toCamelCase(variable);
    return `{{${normalizedField}}}`;
  });

  return converted;
}

/**
 * Transform Salesforce template to Panda CRM format
 */
function transformTemplate(sfTemplate) {
  const folderName = sfTemplate.Folder?.Name || '';
  const category = determineCategory(folderName, sfTemplate.Name);

  // Get HTML and text body
  const htmlBody = sfTemplate.HtmlValue || '';
  const textBody = sfTemplate.Body || '';
  const combinedContent = htmlBody || textBody;

  // Extract merge fields
  const { variables, relatedObjects } = extractMergeFields(combinedContent);

  // Convert merge field syntax
  const convertedHtml = convertMergeFieldSyntax(htmlBody);
  const convertedText = convertMergeFieldSyntax(textBody);
  const convertedSubject = convertMergeFieldSyntax(sfTemplate.Subject || '');

  // Determine if this is a system template (from automated processes)
  const isSystem = (sfTemplate.Owner?.Name || '').toLowerCase().includes('automated') ||
                   (sfTemplate.Owner?.Name || '').toLowerCase().includes('system');

  return {
    // Core fields
    name: sfTemplate.Name,
    description: sfTemplate.Description || `Migrated from Salesforce folder: ${folderName}`,
    type: 'EMAIL',
    category: category,
    subject: convertedSubject || sfTemplate.Name,
    body: convertedHtml || convertedText || '',
    variables: variables,
    isActive: sfTemplate.IsActive !== false,
    isSystem: isSystem,

    // Metadata (stored in description or as JSON)
    metadata: {
      salesforceId: sfTemplate.Id,
      originalFolder: folderName,
      originalOwner: sfTemplate.Owner?.Name,
      ownerEmail: sfTemplate.Owner?.Email,
      templateType: sfTemplate.TemplateType,
      relatedObjects: relatedObjects,
      lastModifiedBy: sfTemplate.LastModifiedBy?.Name,
      lastModifiedAt: sfTemplate.LastModifiedDate,
      createdAt: sfTemplate.CreatedDate,
      hasHtml: !!htmlBody,
      hasText: !!textBody,
    },
  };
}

/**
 * Main migration function
 */
async function migrateEmailTemplates() {
  console.log('='.repeat(60));
  console.log('  Salesforce Email Template Migration');
  console.log('='.repeat(60));
  console.log(`\nMode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
  console.log(`Include inactive: ${INCLUDE_ALL ? 'Yes' : 'No'}`);
  console.log('');

  try {
    // Build query
    const whereClause = INCLUDE_ALL ? '' : 'WHERE IsActive = true';
    const query = `
      SELECT ${EMAIL_TEMPLATE_FIELDS.join(', ')}
      FROM EmailTemplate
      ${whereClause}
      ORDER BY Folder.Name, Name
    `;

    console.log('Connecting to Salesforce...');
    const conn = await getSalesforceConnection();
    console.log(`Connected to: ${conn.instanceUrl}\n`);

    console.log('Fetching email templates...');
    const sfTemplates = await querySalesforce(query);
    console.log(`Found ${sfTemplates.length} email templates in Salesforce\n`);

    if (sfTemplates.length === 0) {
      console.log('No email templates found.');
      return;
    }

    // Group by folder for display
    const byFolder = {};
    for (const t of sfTemplates) {
      const folder = t.Folder?.Name || 'Unfiled';
      if (!byFolder[folder]) byFolder[folder] = [];
      byFolder[folder].push(t);
    }

    console.log('Templates by folder:');
    for (const [folder, templates] of Object.entries(byFolder).sort()) {
      console.log(`  ${folder}: ${templates.length}`);
    }
    console.log('');

    // Process templates
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    const results = [];

    for (const sfTemplate of sfTemplates) {
      try {
        const data = transformTemplate(sfTemplate);

        // Skip if body is empty
        if (!data.body || data.body.trim() === '') {
          if (VERBOSE) console.log(`  SKIP: ${sfTemplate.Name} (empty body)`);
          skipped++;
          results.push({ name: sfTemplate.Name, status: 'skipped', reason: 'empty body' });
          continue;
        }

        // Build description with metadata
        const metadataNote = `[SF: ${data.metadata.originalFolder}] ${data.metadata.salesforceId}`;
        const fullDescription = data.description ? `${data.description}\n\n${metadataNote}` : metadataNote;

        const templateData = {
          name: data.name,
          description: fullDescription,
          type: data.type,
          category: data.category,
          subject: data.subject,
          body: data.body,
          variables: data.variables,
          isActive: data.isActive,
          isSystem: data.isSystem,
        };

        if (DRY_RUN) {
          // Just report what would happen
          const existing = await prisma.messageTemplate.findFirst({
            where: { name: data.name },
          });

          if (existing) {
            console.log(`  WOULD UPDATE: ${data.name} (${data.category})`);
            updated++;
          } else {
            console.log(`  WOULD CREATE: ${data.name} (${data.category})`);
            created++;
          }

          if (VERBOSE) {
            console.log(`    Subject: ${data.subject}`);
            console.log(`    Variables: ${data.variables.join(', ') || 'none'}`);
            console.log(`    Related Objects: ${data.metadata.relatedObjects.join(', ') || 'none'}`);
          }
        } else {
          // Actually create/update
          const existing = await prisma.messageTemplate.findFirst({
            where: { name: data.name },
          });

          if (existing) {
            await prisma.messageTemplate.update({
              where: { id: existing.id },
              data: templateData,
            });
            console.log(`  UPDATE: ${data.name} (${data.category})`);
            updated++;
            results.push({ name: data.name, status: 'updated', category: data.category });
          } else {
            await prisma.messageTemplate.create({
              data: templateData,
            });
            console.log(`  CREATE: ${data.name} (${data.category})`);
            created++;
            results.push({ name: data.name, status: 'created', category: data.category });
          }
        }
      } catch (err) {
        console.error(`  ERROR: ${sfTemplate.Name} - ${err.message}`);
        errors++;
        results.push({ name: sfTemplate.Name, status: 'error', error: err.message });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('  Migration Summary');
    console.log('='.repeat(60));
    console.log(`Total templates in Salesforce: ${sfTemplates.length}`);
    console.log(`${DRY_RUN ? 'Would create' : 'Created'}: ${created}`);
    console.log(`${DRY_RUN ? 'Would update' : 'Updated'}: ${updated}`);
    console.log(`Skipped (empty): ${skipped}`);
    console.log(`Errors: ${errors}`);

    // Category breakdown
    const byCategory = {};
    for (const r of results) {
      if (r.category) {
        byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      }
    }

    if (Object.keys(byCategory).length > 0) {
      console.log('\nBy category:');
      for (const [cat, count] of Object.entries(byCategory).sort()) {
        console.log(`  ${cat}: ${count}`);
      }
    }

    return results;

  } catch (err) {
    console.error('\nMigration failed:', err.message);
    if (VERBOSE) console.error(err.stack);
    throw err;
  }
}

/**
 * Also store in the EmailTemplate table for the legacy system
 */
async function migrateToEmailTemplateTable() {
  console.log('\n' + '='.repeat(60));
  console.log('  Also migrating to EmailTemplate table (legacy)');
  console.log('='.repeat(60) + '\n');

  try {
    const whereClause = INCLUDE_ALL ? '' : 'WHERE IsActive = true';
    const query = `
      SELECT ${EMAIL_TEMPLATE_FIELDS.join(', ')}
      FROM EmailTemplate
      ${whereClause}
      ORDER BY Name
    `;

    const sfTemplates = await querySalesforce(query);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const sfTemplate of sfTemplates) {
      try {
        const htmlBody = sfTemplate.HtmlValue || '';
        const textBody = sfTemplate.Body || '';

        if (!htmlBody && !textBody) {
          skipped++;
          continue;
        }

        const { variables } = extractMergeFields(htmlBody || textBody);
        const convertedHtml = convertMergeFieldSyntax(htmlBody);
        const convertedText = convertMergeFieldSyntax(textBody);
        const convertedSubject = convertMergeFieldSyntax(sfTemplate.Subject || sfTemplate.Name);

        const folderName = sfTemplate.Folder?.Name || '';
        const category = determineCategory(folderName, sfTemplate.Name);

        const data = {
          salesforceId: sfTemplate.Id,
          name: sfTemplate.Name,
          subject: convertedSubject,
          htmlBody: convertedHtml || convertedText,
          textBody: convertedText || null,
          category: category,
          isActive: sfTemplate.IsActive !== false,
          isPublic: folderName.toLowerCase().includes('public'),
          mergeFields: variables,
        };

        if (DRY_RUN) {
          const existing = await prisma.emailTemplate.findUnique({
            where: { salesforceId: sfTemplate.Id },
          });

          if (existing) {
            console.log(`  WOULD UPDATE (EmailTemplate): ${data.name}`);
            updated++;
          } else {
            console.log(`  WOULD CREATE (EmailTemplate): ${data.name}`);
            created++;
          }
        } else {
          await prisma.emailTemplate.upsert({
            where: { salesforceId: sfTemplate.Id },
            update: data,
            create: data,
          });

          const existing = await prisma.emailTemplate.findUnique({
            where: { salesforceId: sfTemplate.Id },
          });

          if (existing) {
            updated++;
          } else {
            created++;
          }
        }
      } catch (err) {
        if (VERBOSE) console.error(`  ERROR: ${sfTemplate.Name} - ${err.message}`);
      }
    }

    console.log(`EmailTemplate table: ${created} created, ${updated} updated, ${skipped} skipped`);
  } catch (err) {
    console.error('EmailTemplate migration failed:', err.message);
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    // Migrate to MessageTemplate (primary Bamboogli table)
    await migrateEmailTemplates();

    // Also migrate to EmailTemplate table for legacy compatibility
    await migrateToEmailTemplateTable();

    console.log('\n' + '='.repeat(60));
    console.log('  Migration Complete!');
    console.log('='.repeat(60));

    if (DRY_RUN) {
      console.log('\nThis was a DRY RUN. No changes were made.');
      console.log('Run without --dry-run to actually migrate templates.');
    }
  } finally {
    await disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
