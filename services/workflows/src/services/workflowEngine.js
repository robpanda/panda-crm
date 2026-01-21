// Workflow Engine - Core execution engine for all workflow automation
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';
import { messagingService } from './messagingService.js';
import { commissionService } from './commissionService.js';

const prisma = new PrismaClient();

/**
 * WorkflowEngine - Replaces Salesforce Flows
 * Handles triggers, conditions, and action execution
 */
export const workflowEngine = {
  /**
   * Process a trigger event and execute matching workflows
   * @param {string} triggerObject - The object type (Opportunity, Account, Contact, etc.)
   * @param {string} triggerEvent - The event type (CREATE, UPDATE, DELETE, FIELD_CHANGE, SCHEDULED)
   * @param {object} record - The current record data
   * @param {object} previousRecord - The previous record data (for updates)
   * @param {string} userId - The user who triggered the event
   */
  async processTrigger(triggerObject, triggerEvent, record, previousRecord = null, userId = null) {
    logger.info(`Processing trigger: ${triggerObject}.${triggerEvent}`, { recordId: record.id });

    try {
      // Find all active workflows matching this trigger
      const workflows = await prisma.workflow.findMany({
        where: {
          triggerObject,
          triggerEvent,
          isActive: true,
        },
        include: {
          actions: {
            orderBy: { actionOrder: 'asc' },
            include: {
              messageTemplate: true,
            },
          },
        },
      });

      logger.info(`Found ${workflows.length} matching workflows`);

      const results = [];

      for (const workflow of workflows) {
        // Check if conditions are met
        const conditionsMet = this.evaluateConditions(
          workflow.triggerConditions,
          record,
          previousRecord
        );

        if (!conditionsMet) {
          logger.debug(`Workflow ${workflow.id} conditions not met, skipping`);
          continue;
        }

        // Create execution record
        const execution = await prisma.workflowExecution.create({
          data: {
            workflowId: workflow.id,
            triggerRecordId: record.id,
            triggerData: record,
            status: 'RUNNING',
            startedAt: new Date(),
          },
        });

        try {
          // Execute all actions in order
          const actionResults = await this.executeActions(
            workflow.actions,
            record,
            previousRecord,
            userId,
            execution.id
          );

          // Update execution as completed
          await prisma.workflowExecution.update({
            where: { id: execution.id },
            data: {
              status: 'COMPLETED',
              completedAt: new Date(),
              result: actionResults,
            },
          });

          results.push({
            workflowId: workflow.id,
            workflowName: workflow.name,
            executionId: execution.id,
            status: 'COMPLETED',
            actions: actionResults,
          });

        } catch (error) {
          logger.error(`Workflow ${workflow.id} execution failed:`, error);

          await prisma.workflowExecution.update({
            where: { id: execution.id },
            data: {
              status: 'FAILED',
              completedAt: new Date(),
              errorMessage: error.message,
            },
          });

          results.push({
            workflowId: workflow.id,
            workflowName: workflow.name,
            executionId: execution.id,
            status: 'FAILED',
            error: error.message,
          });
        }
      }

      // Create audit log
      await this.createAuditLog('workflow_trigger', null, 'WORKFLOW', {
        triggerObject,
        triggerEvent,
        recordId: record.id,
        workflowsExecuted: results.length,
      }, userId);

      return results;

    } catch (error) {
      logger.error('Error processing trigger:', error);
      throw error;
    }
  },

  /**
   * Evaluate workflow conditions against record data
   */
  evaluateConditions(conditions, record, previousRecord) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return true; // No conditions means always execute
    }

    try {
      const { operator = 'AND', rules = [] } = conditions;

      if (rules.length === 0) return true;

      const results = rules.map(rule => this.evaluateRule(rule, record, previousRecord));

      if (operator === 'AND') {
        return results.every(r => r);
      } else if (operator === 'OR') {
        return results.some(r => r);
      }

      return true;
    } catch (error) {
      logger.error('Error evaluating conditions:', error);
      return false;
    }
  },

  /**
   * Evaluate a single rule
   */
  evaluateRule(rule, record, previousRecord) {
    const { field, operator, value, checkPrevious } = rule;

    const currentValue = this.getFieldValue(record, field);
    const prevValue = previousRecord ? this.getFieldValue(previousRecord, field) : undefined;

    switch (operator) {
      case 'equals':
        return currentValue === value;
      case 'not_equals':
        return currentValue !== value;
      case 'contains':
        return String(currentValue).includes(value);
      case 'starts_with':
        return String(currentValue).startsWith(value);
      case 'ends_with':
        return String(currentValue).endsWith(value);
      case 'greater_than':
        return Number(currentValue) > Number(value);
      case 'less_than':
        return Number(currentValue) < Number(value);
      case 'greater_or_equal':
        return Number(currentValue) >= Number(value);
      case 'less_or_equal':
        return Number(currentValue) <= Number(value);
      case 'is_null':
        return currentValue === null || currentValue === undefined;
      case 'is_not_null':
        return currentValue !== null && currentValue !== undefined;
      case 'changed':
        return currentValue !== prevValue;
      case 'changed_to':
        return currentValue === value && prevValue !== value;
      case 'changed_from':
        return prevValue === value && currentValue !== value;
      case 'in':
        return Array.isArray(value) && value.includes(currentValue);
      case 'not_in':
        return Array.isArray(value) && !value.includes(currentValue);
      default:
        logger.warn(`Unknown operator: ${operator}`);
        return false;
    }
  },

  /**
   * Get nested field value from record (supports dot notation)
   */
  getFieldValue(record, field) {
    const parts = field.split('.');
    let value = record;
    for (const part of parts) {
      if (value === null || value === undefined) return undefined;
      value = value[part];
    }
    return value;
  },

  /**
   * Execute workflow actions in sequence
   */
  async executeActions(actions, record, previousRecord, userId, executionId) {
    const results = [];

    for (const action of actions) {
      // Check action-level condition
      if (action.condition && !this.evaluateConditions(action.condition, record, previousRecord)) {
        results.push({
          actionId: action.id,
          actionType: action.actionType,
          status: 'SKIPPED',
          reason: 'Condition not met',
        });
        continue;
      }

      // Handle delay
      if (action.actionType === 'DELAY' && action.delayMinutes > 0) {
        // Schedule delayed execution
        await this.scheduleDelayedAction(action, record, executionId, action.delayMinutes);
        results.push({
          actionId: action.id,
          actionType: 'DELAY',
          status: 'SCHEDULED',
          delayMinutes: action.delayMinutes,
        });
        continue;
      }

      try {
        const result = await this.executeAction(action, record, previousRecord, userId);
        results.push({
          actionId: action.id,
          actionType: action.actionType,
          status: 'COMPLETED',
          result,
        });
      } catch (error) {
        logger.error(`Action ${action.id} failed:`, error);
        results.push({
          actionId: action.id,
          actionType: action.actionType,
          status: 'FAILED',
          error: error.message,
        });

        // Check if we should continue on failure
        if (action.stopOnFailure !== false) {
          throw error;
        }
      }
    }

    return results;
  },

  /**
   * Execute a single action
   */
  async executeAction(action, record, previousRecord, userId) {
    const config = action.config || {};

    switch (action.actionType) {
      case 'SEND_SMS':
        return await messagingService.sendSMS({
          templateId: action.messageTemplateId,
          template: action.messageTemplate,
          record,
          recipient: this.resolveRecipient(config.recipientField, record),
          userId,
        });

      case 'SEND_EMAIL':
        return await messagingService.sendEmail({
          templateId: action.messageTemplateId,
          template: action.messageTemplate,
          record,
          recipient: this.resolveRecipient(config.recipientField, record, 'email'),
          userId,
        });

      case 'UPDATE_FIELD':
        return await this.updateField(config, record, userId);

      case 'CREATE_RECORD':
        return await this.createRecord(config, record, userId);

      case 'CREATE_TASK':
        return await this.createTask(config, record, userId);

      case 'CREATE_COMMISSION':
        return await commissionService.createCommission({
          recordType: config.sourceObject,
          recordId: record.id,
          record,
          triggerEvent: config.triggerEvent,
          userId,
        });

      case 'CALL_WEBHOOK':
        return await this.callWebhook(config, record);

      case 'SCHEDULE_APPOINTMENT':
        return await this.scheduleAppointment(config, record, userId);

      case 'SEND_AGREEMENT':
        return await this.sendAgreement(config, record, userId);

      default:
        throw new Error(`Unknown action type: ${action.actionType}`);
    }
  },

  /**
   * Resolve recipient from record based on field path
   */
  resolveRecipient(fieldPath, record, type = 'phone') {
    if (!fieldPath) {
      // Default fields
      if (type === 'phone') {
        return record.phone || record.mobilePhone || record.contactPhone;
      }
      return record.email || record.contactEmail;
    }
    return this.getFieldValue(record, fieldPath);
  },

  /**
   * Update a field on the record
   */
  async updateField(config, record, userId) {
    const { targetObject, targetField, value, valueType } = config;

    let resolvedValue = value;

    // Resolve dynamic values
    if (valueType === 'field') {
      resolvedValue = this.getFieldValue(record, value);
    } else if (valueType === 'formula') {
      resolvedValue = this.evaluateFormula(value, record);
    } else if (valueType === 'now') {
      resolvedValue = new Date();
    }

    // Get the Prisma model
    const model = this.getPrismaModel(targetObject);
    if (!model) {
      throw new Error(`Unknown target object: ${targetObject}`);
    }

    const updated = await model.update({
      where: { id: record.id },
      data: { [targetField]: resolvedValue },
    });

    // Audit log
    await this.createAuditLog(
      targetObject.toLowerCase(),
      record.id,
      'UPDATE',
      { [targetField]: resolvedValue },
      userId,
      { [targetField]: record[targetField] }
    );

    return { updated: true, field: targetField, newValue: resolvedValue };
  },

  /**
   * Create a new record
   */
  async createRecord(config, sourceRecord, userId) {
    const { targetObject, fieldMappings } = config;

    const data = {};
    for (const mapping of fieldMappings) {
      if (mapping.valueType === 'literal') {
        data[mapping.targetField] = mapping.value;
      } else if (mapping.valueType === 'field') {
        data[mapping.targetField] = this.getFieldValue(sourceRecord, mapping.value);
      } else if (mapping.valueType === 'formula') {
        data[mapping.targetField] = this.evaluateFormula(mapping.value, sourceRecord);
      }
    }

    const model = this.getPrismaModel(targetObject);
    if (!model) {
      throw new Error(`Unknown target object: ${targetObject}`);
    }

    const created = await model.create({ data });

    await this.createAuditLog(
      targetObject.toLowerCase(),
      created.id,
      'CREATE',
      data,
      userId
    );

    return { created: true, recordId: created.id };
  },

  /**
   * Create a task
   */
  async createTask(config, record, userId) {
    const { subject, description, dueInDays, priority, assigneeField } = config;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + (dueInDays || 1));

    const assigneeId = assigneeField ? this.getFieldValue(record, assigneeField) : userId;

    const task = await prisma.task.create({
      data: {
        subject: this.interpolateTemplate(subject, record),
        description: this.interpolateTemplate(description, record),
        dueDate,
        priority: priority || 'MEDIUM',
        status: 'NOT_STARTED',
        assignedToId: assigneeId,
        relatedToType: config.relatedToType || 'Opportunity',
        relatedToId: record.id,
        createdById: userId,
      },
    });

    return { created: true, taskId: task.id };
  },

  /**
   * Call external webhook
   */
  async callWebhook(config, record) {
    const { url, method = 'POST', headers = {}, bodyTemplate } = config;

    const body = bodyTemplate ? this.interpolateTemplate(JSON.stringify(bodyTemplate), record) : JSON.stringify(record);

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: method !== 'GET' ? body : undefined,
    });

    const responseData = await response.text();

    return {
      success: response.ok,
      status: response.status,
      response: responseData,
    };
  },

  /**
   * Schedule an appointment (integrates with Field Service)
   */
  async scheduleAppointment(config, record, userId) {
    const { workType, duration, preferredDate, assigneeField } = config;

    // This would integrate with ServiceAppointment model
    const appointment = await prisma.serviceAppointment.create({
      data: {
        workOrderId: record.workOrderId || record.id,
        status: 'SCHEDULED',
        scheduledStart: preferredDate ? new Date(preferredDate) : new Date(),
        scheduledEnd: new Date(Date.now() + (duration || 60) * 60 * 1000),
        workType,
        createdById: userId,
      },
    });

    return { scheduled: true, appointmentId: appointment.id };
  },

  /**
   * Send document for signature (integrates with PandaSign)
   * @param {object} config - Action configuration
   * @param {string} config.templateId - Agreement template ID (optional if documentType specified)
   * @param {string} config.documentType - Type of document: 'quote', 'invoice', 'workorder', 'contract', 'custom'
   * @param {string} config.documentId - ID of the source document (quoteId, invoiceId, etc.)
   * @param {string} config.recipientEmailField - Field path for recipient email (default: contact.email)
   * @param {string} config.recipientNameField - Field path for recipient name (default: contact.name)
   * @param {boolean} config.sendViaSms - Also send signing link via SMS
   * @param {boolean} config.sendImmediately - Send immediately after creating (default: true)
   */
  async sendAgreement(config, record, userId) {
    const {
      templateId,
      documentType,
      documentId,
      recipientEmailField,
      recipientNameField,
      sendViaSms = false,
      sendImmediately = true,
      mergeData: additionalMergeData = {},
    } = config;

    logger.info(`Sending agreement via workflow: documentType=${documentType}, recordId=${record.id}`);

    // Resolve recipient info from record
    const recipientEmail = recipientEmailField
      ? this.getFieldValue(record, recipientEmailField)
      : (record.contact?.email || record.contactEmail || record.account?.email || record.recipientEmail);

    const recipientName = recipientNameField
      ? this.getFieldValue(record, recipientNameField)
      : (record.contact?.name || `${record.contact?.firstName || ''} ${record.contact?.lastName || ''}`.trim() ||
         record.account?.name || record.recipientName || 'Customer');

    if (!recipientEmail) {
      throw new Error('Cannot send agreement: no recipient email found');
    }

    let agreement;
    const crypto = await import('crypto');
    const { v4: uuidv4 } = await import('uuid');

    // Generate signing token
    const signingToken = crypto.randomBytes(32).toString('hex');
    const signingBaseUrl = process.env.SIGNING_BASE_URL || 'https://sign.pandaexteriors.com';

    // Handle different document types
    if (documentType === 'quote') {
      // Get quote data
      const quote = await prisma.quote.findUnique({
        where: { id: documentId || record.quoteId || record.id },
        include: {
          opportunity: { include: { account: true, contact: true } },
          lineItems: { include: { product: true } },
        },
      });

      if (!quote) throw new Error('Quote not found');

      // Find or create quote acceptance template
      let template = await prisma.agreementTemplate.findFirst({
        where: { category: 'QUOTE_ACCEPT', isActive: true },
      });

      if (!template) {
        template = await prisma.agreementTemplate.create({
          data: {
            name: 'Quote Acceptance',
            category: 'QUOTE_ACCEPT',
            content: 'I accept this quote and authorize the work to proceed.',
            signatureFields: [{ name: 'signature', page: 1, x: 100, y: 100, width: 200, height: 50 }],
            isActive: true,
          },
        });
      }

      agreement = await prisma.agreement.create({
        data: {
          agreementNumber: `QUOTE-${quote.quoteNumber}-${Date.now()}`,
          name: `Quote Acceptance - ${quote.quoteNumber}`,
          status: 'DRAFT',
          templateId: template.id,
          opportunityId: quote.opportunityId,
          accountId: quote.opportunity?.accountId,
          contactId: quote.opportunity?.contactId,
          recipientEmail,
          recipientName,
          signingToken,
          signingUrl: `${signingBaseUrl}/sign/${signingToken}`,
          expiresAt: quote.expirationDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          mergeData: {
            quoteId: quote.id,
            quoteNumber: quote.quoteNumber,
            quoteTotal: quote.grandTotal || quote.total,
            projectName: quote.opportunity?.name,
            ...additionalMergeData,
          },
          createdById: userId,
        },
      });

    } else if (documentType === 'invoice') {
      const invoice = await prisma.invoice.findUnique({
        where: { id: documentId || record.invoiceId || record.id },
        include: { account: { include: { primaryContact: true } } },
      });

      if (!invoice) throw new Error('Invoice not found');

      let template = await prisma.agreementTemplate.findFirst({
        where: { category: 'INVOICE_ACK', isActive: true },
      });

      if (!template) {
        template = await prisma.agreementTemplate.create({
          data: {
            name: 'Invoice Acknowledgment',
            category: 'INVOICE_ACK',
            content: 'I acknowledge receipt of this invoice.',
            signatureFields: [{ name: 'signature', page: 1, x: 100, y: 100, width: 200, height: 50 }],
            isActive: true,
          },
        });
      }

      agreement = await prisma.agreement.create({
        data: {
          agreementNumber: `INV-ACK-${invoice.invoiceNumber}-${Date.now()}`,
          name: `Invoice Acknowledgment - ${invoice.invoiceNumber}`,
          status: 'DRAFT',
          templateId: template.id,
          accountId: invoice.accountId,
          recipientEmail,
          recipientName,
          signingToken,
          signingUrl: `${signingBaseUrl}/sign/${signingToken}`,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          mergeData: {
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            invoiceTotal: invoice.total,
            ...additionalMergeData,
          },
          createdById: userId,
        },
      });

    } else if (documentType === 'workorder') {
      const workOrder = await prisma.workOrder.findUnique({
        where: { id: documentId || record.workOrderId || record.id },
        include: { opportunity: { include: { account: true, contact: true } } },
      });

      if (!workOrder) throw new Error('Work order not found');

      let template = await prisma.agreementTemplate.findFirst({
        where: { category: 'WORK_ORDER_AUTH', isActive: true },
      });

      if (!template) {
        template = await prisma.agreementTemplate.create({
          data: {
            name: 'Work Order Authorization',
            category: 'WORK_ORDER_AUTH',
            content: 'I authorize this work order to proceed.',
            signatureFields: [{ name: 'signature', page: 1, x: 100, y: 100, width: 200, height: 50 }],
            isActive: true,
          },
        });
      }

      agreement = await prisma.agreement.create({
        data: {
          agreementNumber: `WO-${workOrder.workOrderNumber}-${Date.now()}`,
          name: `Work Order Authorization - ${workOrder.workOrderNumber}`,
          status: 'DRAFT',
          templateId: template.id,
          opportunityId: workOrder.opportunityId,
          accountId: workOrder.opportunity?.accountId,
          contactId: workOrder.opportunity?.contactId,
          recipientEmail,
          recipientName,
          signingToken,
          signingUrl: `${signingBaseUrl}/sign/${signingToken}`,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          mergeData: {
            workOrderId: workOrder.id,
            workOrderNumber: workOrder.workOrderNumber,
            workType: workOrder.workType,
            ...additionalMergeData,
          },
          createdById: userId,
        },
      });

    } else if (documentType === 'contract' || templateId) {
      // Use specified template or find contract template
      let template = templateId
        ? await prisma.agreementTemplate.findUnique({ where: { id: templateId } })
        : await prisma.agreementTemplate.findFirst({ where: { category: 'CONTRACT', isActive: true } });

      if (!template) throw new Error('Agreement template not found');

      // Build merge data from record
      const mergeData = {
        customerName: recipientName,
        customerEmail: recipientEmail,
        projectName: record.name,
        projectAddress: record.projectAddress || record.address,
        contractAmount: record.amount || record.total,
        contractDate: new Date().toLocaleDateString(),
        salesRep: record.ownerName || record.salesRep,
        ...additionalMergeData,
      };

      agreement = await prisma.agreement.create({
        data: {
          agreementNumber: `AGR-${Date.now()}-${uuidv4().slice(0, 4).toUpperCase()}`,
          name: this.interpolateTemplate(template.name, record) || `Agreement for ${record.name || record.id}`,
          status: 'DRAFT',
          templateId: template.id,
          opportunityId: record.opportunityId || record.id,
          accountId: record.accountId,
          contactId: record.contactId,
          recipientEmail,
          recipientName,
          signingToken,
          signingUrl: `${signingBaseUrl}/sign/${signingToken}`,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          mergeData,
          createdById: userId,
        },
      });
    } else {
      throw new Error('Must specify either documentType or templateId for sendAgreement action');
    }

    // Create audit log
    await this.createAuditLog('agreements', agreement.id, 'CREATE', {
      agreementNumber: agreement.agreementNumber,
      documentType,
      status: 'DRAFT',
      source: 'workflow_engine',
    }, userId);

    // Send immediately if configured
    if (sendImmediately) {
      // Update status to SENT
      await prisma.agreement.update({
        where: { id: agreement.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          sentById: userId,
        },
      });

      // Trigger Bamboogli document signing automation for email/SMS
      try {
        const bamboogliBaseUrl = process.env.BAMBOOGLI_SERVICE_URL || 'http://localhost:3012';
        await fetch(`${bamboogliBaseUrl}/api/automations/document/trigger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            automationType: 'document_signing_request',
            agreementId: agreement.id,
            opportunityId: agreement.opportunityId,
          }),
        });
        logger.info(`Triggered document signing automation for agreement ${agreement.id}`);
      } catch (automationError) {
        logger.warn(`Failed to trigger Bamboogli automation: ${automationError.message}`);
        // Don't fail the workflow if automation trigger fails
      }

      // Also send via SMS if configured
      if (sendViaSms) {
        const recipientPhone = record.contact?.phone || record.contact?.mobilePhone ||
                              record.phone || record.mobilePhone;
        if (recipientPhone) {
          try {
            await fetch(`${bamboogliBaseUrl}/api/automations/document/send-sms`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                agreementId: agreement.id,
                phoneNumber: recipientPhone,
              }),
            });
            logger.info(`Sent signing link SMS to ${recipientPhone}`);
          } catch (smsError) {
            logger.warn(`Failed to send SMS signing link: ${smsError.message}`);
          }
        }
      }

      await this.createAuditLog('agreements', agreement.id, 'SENT', {
        recipientEmail,
        sendViaSms,
      }, userId);
    }

    return {
      sent: sendImmediately,
      agreementId: agreement.id,
      agreementNumber: agreement.agreementNumber,
      signingUrl: agreement.signingUrl,
      documentType,
    };
  },

  /**
   * Schedule a delayed action for later execution
   */
  async scheduleDelayedAction(action, record, executionId, delayMinutes) {
    const scheduledFor = new Date(Date.now() + delayMinutes * 60 * 1000);

    await prisma.scheduledMessage.create({
      data: {
        projectId: record.id,
        stage: 'workflow_delay',
        scheduledFor,
        status: 'PENDING',
        messageContent: JSON.stringify({
          actionId: action.id,
          executionId,
          record,
        }),
      },
    });

    logger.info(`Scheduled delayed action ${action.id} for ${scheduledFor.toISOString()}`);
  },

  /**
   * Interpolate template variables
   * Supports both {var} and {{var}} syntax for merge fields
   * Also supports dot notation for nested fields: {{contact.firstName}} or {contact.firstName}
   */
  interpolateTemplate(template, record) {
    if (!template) return template;

    // Support both {var} and {{var}} syntax
    return template.replace(/\{\{?([^}]+)\}?\}/g, (match, fieldPath) => {
      // Skip if this looks like a JSON object or other non-merge-field syntax
      if (fieldPath.includes(':') || fieldPath.includes('"')) return match;
      const value = this.getFieldValue(record, fieldPath.trim());
      return value !== undefined && value !== null ? value : match;
    });
  },

  /**
   * Evaluate simple formulas
   */
  evaluateFormula(formula, record) {
    // Basic formula support (e.g., "{{amount}} * 0.1")
    const interpolated = this.interpolateTemplate(formula, record);

    // Only allow safe math operations
    if (/^[\d\s+\-*/().]+$/.test(interpolated)) {
      try {
        return Function('"use strict"; return (' + interpolated + ')')();
      } catch {
        return interpolated;
      }
    }
    return interpolated;
  },

  /**
   * Get Prisma model by name
   */
  getPrismaModel(objectName) {
    const modelMap = {
      Opportunity: prisma.opportunity,
      Account: prisma.account,
      Contact: prisma.contact,
      Lead: prisma.lead,
      Quote: prisma.quote,
      Order: prisma.order,
      WorkOrder: prisma.workOrder,
      Invoice: prisma.invoice,
      Commission: prisma.commission,
      Task: prisma.task,
      ServiceAppointment: prisma.serviceAppointment,
      Agreement: prisma.agreement,
    };
    return modelMap[objectName];
  },

  /**
   * Create audit log entry
   */
  async createAuditLog(tableName, recordId, action, newValues, userId, oldValues = null) {
    try {
      await prisma.auditLog.create({
        data: {
          tableName,
          recordId: recordId || 'system',
          action,
          oldValues,
          newValues,
          userId,
          source: 'workflow_engine',
          ipAddress: null,
          userAgent: 'WorkflowEngine/1.0',
        },
      });
    } catch (error) {
      logger.error('Failed to create audit log:', error);
    }
  },
};

export default workflowEngine;
