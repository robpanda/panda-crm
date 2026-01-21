/**
 * Setup Document Signing Workflows
 *
 * Creates workflow configurations for automated document signing:
 * 1. Quote Acceptance - Triggered when quote is approved for signing
 * 2. Contract Signing - Triggered when opportunity reaches contract stage
 * 3. Work Order Authorization - Triggered when work order is ready for signature
 * 4. Signing Reminder - Scheduled workflow for unsigned documents
 *
 * Usage:
 *   node setup-document-signing-workflows.mjs --dry-run    # Preview changes
 *   node setup-document-signing-workflows.mjs              # Create workflows
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

async function setupDocumentSigningWorkflows() {
  console.log('='.repeat(70));
  console.log('Setup Document Signing Workflows');
  console.log('='.repeat(70));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (workflows will be created)'}`);
  console.log('');

  const workflows = [
    // 1. Quote Acceptance Workflow
    {
      name: 'Send Quote for Signature',
      description: 'Automatically sends quote for customer signature when quote status changes to APPROVED',
      triggerObject: 'Quote',
      triggerEvent: 'UPDATE',
      triggerConditions: {
        operator: 'AND',
        rules: [
          { field: 'status', operator: 'changed_to', value: 'APPROVED' },
          { field: 'requiresSignature', operator: 'equals', value: true },
        ],
      },
      actions: [
        {
          actionType: 'SEND_AGREEMENT',
          actionOrder: 1,
          config: {
            documentType: 'quote',
            sendViaSms: true,
            sendImmediately: true,
          },
        },
        {
          actionType: 'CREATE_TASK',
          actionOrder: 2,
          config: {
            subject: 'Follow up on quote signature - {{quoteNumber}}',
            description: 'Quote sent for signature to {{opportunity.contact.name}}. Follow up if not signed within 3 days.',
            dueInDays: 3,
            priority: 'MEDIUM',
            assigneeField: 'opportunity.ownerId',
          },
        },
      ],
    },

    // 2. Contract Signing Workflow
    {
      name: 'Send Contract for Signature',
      description: 'Automatically generates and sends contract when opportunity reaches CONTRACT_READY stage',
      triggerObject: 'Opportunity',
      triggerEvent: 'UPDATE',
      triggerConditions: {
        operator: 'AND',
        rules: [
          { field: 'stageName', operator: 'changed_to', value: 'CONTRACT_READY' },
        ],
      },
      actions: [
        {
          actionType: 'SEND_AGREEMENT',
          actionOrder: 1,
          config: {
            documentType: 'contract',
            sendViaSms: true,
            sendImmediately: true,
            recipientEmailField: 'contact.email',
            recipientNameField: 'contact.name',
          },
        },
        {
          actionType: 'UPDATE_FIELD',
          actionOrder: 2,
          config: {
            targetObject: 'Opportunity',
            targetField: 'contractSentAt',
            valueType: 'now',
          },
        },
        {
          actionType: 'SEND_EMAIL',
          actionOrder: 3,
          config: {
            recipientField: 'owner.email',
            subject: 'Contract Sent: {{name}}',
            body: 'Contract for {{name}} has been sent to {{contact.name}} ({{contact.email}}) for signature.',
          },
        },
        {
          actionType: 'CREATE_TASK',
          actionOrder: 4,
          config: {
            subject: 'Follow up on contract signature - {{name}}',
            description: 'Contract sent to {{contact.name}}. Ensure signature is obtained within 7 days.',
            dueInDays: 7,
            priority: 'HIGH',
            assigneeField: 'ownerId',
          },
        },
      ],
    },

    // 3. Work Order Authorization Workflow
    {
      name: 'Send Work Order for Authorization',
      description: 'Sends work order for customer authorization when status changes to PENDING_AUTHORIZATION',
      triggerObject: 'WorkOrder',
      triggerEvent: 'UPDATE',
      triggerConditions: {
        operator: 'AND',
        rules: [
          { field: 'status', operator: 'changed_to', value: 'PENDING_AUTHORIZATION' },
        ],
      },
      actions: [
        {
          actionType: 'SEND_AGREEMENT',
          actionOrder: 1,
          config: {
            documentType: 'workorder',
            sendViaSms: true,
            sendImmediately: true,
            recipientEmailField: 'opportunity.contact.email',
            recipientNameField: 'opportunity.contact.name',
          },
        },
        {
          actionType: 'SEND_SMS',
          actionOrder: 2,
          config: {
            recipientField: 'opportunity.contact.mobilePhone',
            message: 'Hi {{opportunity.contact.firstName}}! Your work order from Panda Exteriors is ready for authorization. Check your email for the signing link.',
          },
        },
      ],
    },

    // 4. Document Signed - Update Opportunity
    {
      name: 'Process Signed Quote',
      description: 'Updates opportunity when quote acceptance agreement is signed',
      triggerObject: 'Agreement',
      triggerEvent: 'UPDATE',
      triggerConditions: {
        operator: 'AND',
        rules: [
          { field: 'status', operator: 'changed_to', value: 'SIGNED' },
          { field: 'mergeData.quoteId', operator: 'is_not_null' },
        ],
      },
      actions: [
        {
          actionType: 'UPDATE_FIELD',
          actionOrder: 1,
          config: {
            targetObject: 'Opportunity',
            targetField: 'stageName',
            value: 'QUOTE_ACCEPTED',
            valueType: 'literal',
          },
        },
        {
          actionType: 'UPDATE_FIELD',
          actionOrder: 2,
          config: {
            targetObject: 'Quote',
            targetField: 'status',
            value: 'ACCEPTED',
            valueType: 'literal',
          },
        },
        {
          actionType: 'SEND_EMAIL',
          actionOrder: 3,
          config: {
            recipientField: 'opportunity.owner.email',
            subject: 'Quote Signed: {{name}}',
            body: 'Great news! {{recipientName}} has signed the quote for {{opportunity.name}}. The opportunity has been moved to QUOTE_ACCEPTED stage.',
          },
        },
      ],
    },

    // 5. Contract Signed - Update Opportunity and Create Invoice
    {
      name: 'Process Signed Contract',
      description: 'Updates opportunity and creates invoice when contract is fully signed',
      triggerObject: 'Agreement',
      triggerEvent: 'UPDATE',
      triggerConditions: {
        operator: 'AND',
        rules: [
          { field: 'status', operator: 'changed_to', value: 'COMPLETED' },
          { field: 'template.category', operator: 'equals', value: 'CONTRACT' },
        ],
      },
      actions: [
        {
          actionType: 'UPDATE_FIELD',
          actionOrder: 1,
          config: {
            targetObject: 'Opportunity',
            targetField: 'stageName',
            value: 'CONTRACT_SIGNED',
            valueType: 'literal',
          },
        },
        {
          actionType: 'UPDATE_FIELD',
          actionOrder: 2,
          config: {
            targetObject: 'Opportunity',
            targetField: 'contractSignedAt',
            valueType: 'now',
          },
        },
        {
          actionType: 'CREATE_COMMISSION',
          actionOrder: 3,
          config: {
            sourceObject: 'Opportunity',
            triggerEvent: 'CONTRACT_SIGNED',
          },
        },
        {
          actionType: 'SEND_EMAIL',
          actionOrder: 4,
          config: {
            recipientField: 'opportunity.owner.email',
            subject: 'Contract Executed: {{opportunity.name}}',
            body: 'The contract for {{opportunity.name}} has been fully executed. Commission has been calculated. Next step: Schedule installation.',
          },
        },
        {
          actionType: 'CREATE_TASK',
          actionOrder: 5,
          config: {
            subject: 'Schedule Installation - {{opportunity.name}}',
            description: 'Contract signed. Schedule installation appointment with customer.',
            dueInDays: 2,
            priority: 'HIGH',
            assigneeField: 'opportunity.projectManagerId',
            relatedToType: 'Opportunity',
          },
        },
      ],
    },
  ];

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const workflowData of workflows) {
    console.log(`\nProcessing: ${workflowData.name}`);

    // Check if workflow already exists
    const existing = await prisma.workflow.findFirst({
      where: { name: workflowData.name },
    });

    if (existing) {
      console.log(`  -> Workflow already exists (ID: ${existing.id})`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  -> [DRY RUN] Would create workflow with ${workflowData.actions.length} actions`);
      console.log(`     Trigger: ${workflowData.triggerObject}.${workflowData.triggerEvent}`);
      console.log(`     Actions: ${workflowData.actions.map(a => a.actionType).join(', ')}`);
      created++;
      continue;
    }

    // Create workflow with actions
    const { actions, ...workflowFields } = workflowData;

    // Get admin user for createdById
    const adminUser = await prisma.user.findFirst({
      where: { role: { roleType: 'admin' } },
    });

    const workflow = await prisma.workflow.create({
      data: {
        ...workflowFields,
        isActive: true,
        version: 1,
        createdById: adminUser?.id || 'system',
        actions: {
          create: actions.map(action => {
            // Map config fields to actual WorkflowAction schema fields
            const actionData = {
              actionType: action.actionType,
              actionOrder: action.actionOrder,
            };

            // Map specific config fields based on action type
            if (action.config) {
              if (action.config.targetField) actionData.updateField = action.config.targetField;
              if (action.config.value !== undefined) actionData.updateValue = String(action.config.value);
              if (action.config.webhookUrl) actionData.webhookUrl = action.config.webhookUrl;
              if (action.config.webhookMethod) actionData.webhookMethod = action.config.webhookMethod;
              if (action.config.webhookHeaders) actionData.webhookHeaders = action.config.webhookHeaders;
              if (action.config.webhookBody) actionData.webhookBody = action.config.webhookBody;
              if (action.config.delayMinutes) actionData.delayMinutes = action.config.delayMinutes;
              if (action.config.targetObject) actionData.createRecordType = action.config.targetObject;
              // Store full config in createRecordData as a workaround for complex configs
              actionData.createRecordData = action.config;
            }

            if (action.condition) actionData.condition = action.condition;

            return actionData;
          }),
        },
      },
      include: { actions: true },
    });

    console.log(`  -> Created workflow (ID: ${workflow.id}) with ${workflow.actions.length} actions`);
    created++;
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('Summary');
  console.log('='.repeat(70));
  console.log(`Workflows created:  ${created}`);
  console.log(`Workflows updated:  ${updated}`);
  console.log(`Workflows skipped:  ${skipped}`);

  if (DRY_RUN) {
    console.log('\nThis was a DRY RUN. Run without --dry-run to create workflows.');
  }

  // Also setup the document signing automation configs if they don't exist
  console.log('\n' + '='.repeat(70));
  console.log('Setting up Document Signing Automations');
  console.log('='.repeat(70));

  const automationTypes = [
    {
      type: 'document_signing_request',
      name: 'Document Signing Request',
      smsTemplate: `Hi {firstName}! You have a document ready to sign from Panda Exteriors: "{documentName}". Please sign here: {signingUrl} - Questions? Call (240) 801-6665`,
      emailSubject: 'Please Sign: {documentName} - Panda Exteriors',
      emailTemplate: `Hi {firstName},

You have a document waiting for your signature:

DOCUMENT: {documentName}
PROJECT: {projectName}

Please click the link below to review and sign your document:

{signingUrl}

This link will expire in 30 days.

If you have any questions, please contact us at (240) 801-6665.

Thank you for choosing Panda Exteriors!

Best regards,
The Panda Exteriors Team`,
    },
    {
      type: 'document_signing_reminder',
      name: 'Document Signing Reminder',
      smsTemplate: `Reminder: Your document "{documentName}" from Panda Exteriors is still waiting for your signature. Sign here: {signingUrl}`,
      emailSubject: 'Reminder: Please Sign Your Document - {documentName}',
      emailTemplate: `Hi {firstName},

This is a friendly reminder that your document is still waiting for your signature:

DOCUMENT: {documentName}
PROJECT: {projectName}
SENT: {sentDate}

Please sign your document to proceed:

{signingUrl}

If you have any questions or need to discuss the document, please call us at (240) 801-6665.

Best regards,
The Panda Exteriors Team`,
    },
    {
      type: 'document_signed_confirmation',
      name: 'Document Signed Confirmation',
      smsTemplate: `Thank you, {firstName}! Your signature on "{documentName}" has been recorded. You'll receive a copy of the signed document via email.`,
      emailSubject: 'Document Signed: {documentName} - Confirmation',
      emailTemplate: `Hi {firstName},

Thank you for signing your document!

DOCUMENT: {documentName}
SIGNED AT: {signedAt}

You can download your signed document here:
{signedDocumentUrl}

If you have any questions, please contact us at (240) 801-6665.

Best regards,
The Panda Exteriors Team`,
    },
    {
      type: 'document_completed_notification',
      name: 'Document Completed Notification',
      smsTemplate: `Great news, {firstName}! Your document "{documentName}" is now fully executed. All signatures have been collected. Check your email for the completed document.`,
      emailSubject: 'Document Complete: {documentName} - All Signatures Collected',
      emailTemplate: `Hi {firstName},

Great news! Your document has been fully executed with all required signatures.

DOCUMENT: {documentName}
PROJECT: {projectName}
COMPLETED AT: {completedAt}

Download your completed document:
{signedDocumentUrl}

Thank you for your business! Our team will be in touch regarding next steps.

Best regards,
The Panda Exteriors Team`,
    },
  ];

  let automationsCreated = 0;
  let automationsSkipped = 0;

  for (const automation of automationTypes) {
    const existing = await prisma.automation_configs.findUnique({
      where: { type: automation.type },
    });

    if (existing) {
      console.log(`  Automation '${automation.type}' already exists - skipped`);
      automationsSkipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would create automation: ${automation.type}`);
      automationsCreated++;
      continue;
    }

    await prisma.automation_configs.create({
      data: {
        id: `auto_${automation.type}_${Date.now()}`,
        type: automation.type,
        name: automation.name,
        enabled: true,
        sms_enabled: true,
        email_enabled: true,
        sms_template: automation.smsTemplate,
        email_subject: automation.emailSubject,
        email_template: automation.emailTemplate,
        trigger_delay: 0,
        updated_at: new Date(),
      },
    });

    console.log(`  Created automation: ${automation.type}`);
    automationsCreated++;
  }

  console.log(`\nAutomations created: ${automationsCreated}`);
  console.log(`Automations skipped: ${automationsSkipped}`);

  await prisma.$disconnect();
}

setupDocumentSigningWorkflows().catch(console.error);
