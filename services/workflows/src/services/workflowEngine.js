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
   */
  async sendAgreement(config, record, userId) {
    const { templateId, recipientEmail, recipientName } = config;

    const agreement = await prisma.agreement.create({
      data: {
        agreementNumber: `AGR-${Date.now()}`,
        name: `Agreement for ${record.name || record.id}`,
        templateId,
        status: 'SENT',
        opportunityId: record.opportunityId || record.id,
        accountId: record.accountId,
        contactId: record.contactId,
        recipientEmail: recipientEmail || this.getFieldValue(record, 'email'),
        recipientName: recipientName || this.getFieldValue(record, 'name'),
        sentAt: new Date(),
        createdById: userId,
      },
    });

    // Call PandaSign API to create and send document
    // TODO: Integrate with actual PandaSign service

    return { sent: true, agreementId: agreement.id };
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
   */
  interpolateTemplate(template, record) {
    if (!template) return template;

    return template.replace(/\{\{([^}]+)\}\}/g, (match, fieldPath) => {
      const value = this.getFieldValue(record, fieldPath.trim());
      return value !== undefined ? value : match;
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
