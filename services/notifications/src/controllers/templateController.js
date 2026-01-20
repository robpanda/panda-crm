import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Default templates for all notification types
const DEFAULT_TEMPLATES = {
  STAGE_CHANGE: {
    name: 'Stage Change',
    description: 'Notification when an opportunity stage changes',
    titleTemplate: 'Stage Changed: {{opportunityName}}',
    messageTemplate: 'Opportunity "{{opportunityName}}" moved from {{previousStage}} to {{newStage}}',
    emailSubjectTemplate: 'Stage Update: {{opportunityName}}',
    emailBodyTemplate: '<p>The opportunity <strong>{{opportunityName}}</strong> has been updated.</p><p>Previous Stage: {{previousStage}}<br>New Stage: {{newStage}}</p>',
    defaultPriority: 'NORMAL',
    enabledByDefault: true,
  },
  ASSIGNMENT: {
    name: 'Assignment',
    description: 'Notification when a record is assigned to you',
    titleTemplate: '{{recordType}} Assigned to You',
    messageTemplate: 'You have been assigned to {{recordType}}: {{recordName}}',
    emailSubjectTemplate: 'New Assignment: {{recordName}}',
    emailBodyTemplate: '<p>You have been assigned to the following {{recordType}}:</p><p><strong>{{recordName}}</strong></p>',
    defaultPriority: 'HIGH',
    enabledByDefault: true,
  },
  OPPORTUNITY_WON: {
    name: 'Opportunity Won',
    description: 'Notification when an opportunity is won',
    titleTemplate: 'Congratulations! Opportunity Won',
    messageTemplate: 'Opportunity "{{opportunityName}}" has been closed won! Amount: {{amount}}',
    emailSubjectTemplate: 'Won: {{opportunityName}} - {{amount}}',
    emailBodyTemplate: '<p>Congratulations! The opportunity <strong>{{opportunityName}}</strong> has been closed won!</p><p>Amount: {{amount}}</p>',
    defaultPriority: 'HIGH',
    enabledByDefault: true,
  },
  OPPORTUNITY_LOST: {
    name: 'Opportunity Lost',
    description: 'Notification when an opportunity is lost',
    titleTemplate: 'Opportunity Lost: {{opportunityName}}',
    messageTemplate: 'Opportunity "{{opportunityName}}" has been closed lost. Reason: {{lostReason}}',
    emailSubjectTemplate: 'Lost: {{opportunityName}}',
    emailBodyTemplate: '<p>The opportunity <strong>{{opportunityName}}</strong> has been closed lost.</p><p>Reason: {{lostReason}}</p>',
    defaultPriority: 'NORMAL',
    enabledByDefault: true,
  },
  WORK_ORDER_CREATED: {
    name: 'Work Order Created',
    description: 'Notification when a new work order is created',
    titleTemplate: 'New Work Order: {{workOrderNumber}}',
    messageTemplate: 'Work Order {{workOrderNumber}} has been created for {{accountName}}',
    emailSubjectTemplate: 'New Work Order: {{workOrderNumber}}',
    emailBodyTemplate: '<p>A new work order has been created:</p><p><strong>{{workOrderNumber}}</strong><br>Account: {{accountName}}</p>',
    defaultPriority: 'NORMAL',
    enabledByDefault: true,
  },
  WORK_ORDER_COMPLETED: {
    name: 'Work Order Completed',
    description: 'Notification when a work order is completed',
    titleTemplate: 'Work Order Completed: {{workOrderNumber}}',
    messageTemplate: 'Work Order {{workOrderNumber}} has been completed',
    emailSubjectTemplate: 'Completed: {{workOrderNumber}}',
    emailBodyTemplate: '<p>Work Order <strong>{{workOrderNumber}}</strong> has been completed.</p>',
    defaultPriority: 'NORMAL',
    enabledByDefault: true,
  },
  APPOINTMENT_SCHEDULED: {
    name: 'Appointment Scheduled',
    description: 'Notification when an appointment is scheduled',
    titleTemplate: 'Appointment Scheduled',
    messageTemplate: 'Appointment scheduled for {{scheduledDate}} at {{scheduledTime}}',
    emailSubjectTemplate: 'Appointment Scheduled: {{scheduledDate}}',
    emailBodyTemplate: '<p>A new appointment has been scheduled:</p><p>Date: {{scheduledDate}}<br>Time: {{scheduledTime}}<br>Location: {{address}}</p>',
    defaultPriority: 'NORMAL',
    enabledByDefault: true,
  },
  APPOINTMENT_REMINDER: {
    name: 'Appointment Reminder',
    description: 'Reminder before an appointment',
    titleTemplate: 'Upcoming Appointment',
    messageTemplate: 'Reminder: You have an appointment {{timeUntil}}',
    emailSubjectTemplate: 'Reminder: Appointment {{timeUntil}}',
    emailBodyTemplate: '<p>This is a reminder that you have an upcoming appointment:</p><p>Date: {{scheduledDate}}<br>Time: {{scheduledTime}}<br>Location: {{address}}</p>',
    smsTemplate: 'Reminder: Appointment on {{scheduledDate}} at {{scheduledTime}}. {{address}}',
    defaultPriority: 'HIGH',
    enabledByDefault: true,
  },
  CASE_CREATED: {
    name: 'Case Created',
    description: 'Notification when a new case is created',
    titleTemplate: 'New Case: {{caseNumber}}',
    messageTemplate: 'Case {{caseNumber}} has been created: {{subject}}',
    emailSubjectTemplate: 'New Case: {{caseNumber}} - {{subject}}',
    emailBodyTemplate: '<p>A new case has been created:</p><p><strong>{{caseNumber}}</strong><br>Subject: {{subject}}<br>Priority: {{priority}}</p>',
    defaultPriority: 'NORMAL',
    enabledByDefault: true,
  },
  CASE_ESCALATED: {
    name: 'Case Escalated',
    description: 'Notification when a case is escalated',
    titleTemplate: 'Case Escalated: {{caseNumber}}',
    messageTemplate: 'Case {{caseNumber}} has been escalated to {{escalatedTo}}',
    emailSubjectTemplate: 'ESCALATED: {{caseNumber}} - {{subject}}',
    emailBodyTemplate: '<p><strong>ESCALATED</strong></p><p>Case <strong>{{caseNumber}}</strong> has been escalated.</p><p>Reason: {{escalationReason}}</p>',
    defaultPriority: 'URGENT',
    enabledByDefault: true,
  },
  TASK_ASSIGNED: {
    name: 'Task Assigned',
    description: 'Notification when a task is assigned to you',
    titleTemplate: 'New Task: {{taskSubject}}',
    messageTemplate: 'You have been assigned a new task: {{taskSubject}}',
    emailSubjectTemplate: 'New Task: {{taskSubject}}',
    emailBodyTemplate: '<p>You have been assigned a new task:</p><p><strong>{{taskSubject}}</strong><br>Due: {{dueDate}}</p>',
    defaultPriority: 'NORMAL',
    enabledByDefault: true,
  },
  TASK_DUE_SOON: {
    name: 'Task Due Soon',
    description: 'Reminder when a task is due soon',
    titleTemplate: 'Task Due Soon: {{taskSubject}}',
    messageTemplate: 'Task "{{taskSubject}}" is due {{timeUntilDue}}',
    emailSubjectTemplate: 'Due Soon: {{taskSubject}}',
    emailBodyTemplate: '<p>This task is due soon:</p><p><strong>{{taskSubject}}</strong><br>Due: {{dueDate}}</p>',
    defaultPriority: 'HIGH',
    enabledByDefault: true,
  },
  TASK_OVERDUE: {
    name: 'Task Overdue',
    description: 'Notification when a task is overdue',
    titleTemplate: 'OVERDUE: {{taskSubject}}',
    messageTemplate: 'Task "{{taskSubject}}" is {{daysOverdue}} days overdue',
    emailSubjectTemplate: 'OVERDUE: {{taskSubject}}',
    emailBodyTemplate: '<p><strong>OVERDUE TASK</strong></p><p>{{taskSubject}} was due on {{dueDate}}.</p>',
    defaultPriority: 'URGENT',
    enabledByDefault: true,
  },
  COMMISSION_CREATED: {
    name: 'Commission Created',
    description: 'Notification when a commission is created',
    titleTemplate: 'New Commission: {{amount}}',
    messageTemplate: 'A new commission of {{amount}} has been created for {{opportunityName}}',
    emailSubjectTemplate: 'Commission Created: {{amount}}',
    emailBodyTemplate: '<p>A new commission has been created:</p><p>Amount: {{amount}}<br>Opportunity: {{opportunityName}}</p>',
    defaultPriority: 'NORMAL',
    enabledByDefault: true,
  },
  COMMISSION_APPROVED: {
    name: 'Commission Approved',
    description: 'Notification when a commission is approved',
    titleTemplate: 'Commission Approved: {{amount}}',
    messageTemplate: 'Your commission of {{amount}} has been approved',
    emailSubjectTemplate: 'Commission Approved: {{amount}}',
    emailBodyTemplate: '<p>Your commission has been approved:</p><p>Amount: {{amount}}<br>Opportunity: {{opportunityName}}</p>',
    defaultPriority: 'HIGH',
    enabledByDefault: true,
  },
  APPROVAL_REQUESTED: {
    name: 'Approval Requested',
    description: 'Notification when your approval is requested',
    titleTemplate: 'Approval Needed: {{recordName}}',
    messageTemplate: '{{requesterName}} has requested your approval for {{recordName}}',
    emailSubjectTemplate: 'Approval Required: {{recordName}}',
    emailBodyTemplate: '<p>Your approval has been requested:</p><p><strong>{{recordName}}</strong><br>Requested by: {{requesterName}}<br>Comments: {{comments}}</p>',
    defaultPriority: 'HIGH',
    enabledByDefault: true,
  },
  MENTION: {
    name: 'Mentioned',
    description: 'Notification when you are mentioned',
    titleTemplate: '{{mentionedBy}} mentioned you',
    messageTemplate: '{{mentionedBy}} mentioned you in {{context}}',
    emailSubjectTemplate: '{{mentionedBy}} mentioned you',
    emailBodyTemplate: '<p><strong>{{mentionedBy}}</strong> mentioned you in {{context}}:</p><p>"{{excerpt}}"</p>',
    defaultPriority: 'NORMAL',
    enabledByDefault: true,
  },
  SYSTEM_ALERT: {
    name: 'System Alert',
    description: 'System-level alerts and notifications',
    titleTemplate: 'System Alert',
    messageTemplate: '{{message}}',
    emailSubjectTemplate: 'System Alert: {{title}}',
    emailBodyTemplate: '<p><strong>System Alert</strong></p><p>{{message}}</p>',
    defaultPriority: 'HIGH',
    enabledByDefault: true,
  },
};

// List all notification templates
export async function listTemplates(req, res, next) {
  try {
    const templates = await prisma.notificationTemplate.findMany({
      orderBy: { type: 'asc' },
    });

    // Merge with defaults for any missing types
    const templateMap = new Map(templates.map(t => [t.type, t]));
    const allTemplates = [];

    for (const [type, defaults] of Object.entries(DEFAULT_TEMPLATES)) {
      if (templateMap.has(type)) {
        allTemplates.push(templateMap.get(type));
      } else {
        allTemplates.push({
          type,
          ...defaults,
          isDefault: true,
        });
      }
    }

    // Add any custom templates not in defaults
    templates.forEach(t => {
      if (!DEFAULT_TEMPLATES[t.type]) {
        allTemplates.push(t);
      }
    });

    res.json(allTemplates);
  } catch (error) {
    next(error);
  }
}

// Get a specific template
export async function getTemplate(req, res, next) {
  try {
    const { type } = req.params;

    let template = await prisma.notificationTemplate.findUnique({
      where: { type },
    });

    // Return default if not customized
    if (!template && DEFAULT_TEMPLATES[type]) {
      template = {
        type,
        ...DEFAULT_TEMPLATES[type],
        isDefault: true,
      };
    }

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    next(error);
  }
}

// Update a template (create if doesn't exist)
export async function updateTemplate(req, res, next) {
  try {
    const { type } = req.params;
    const {
      name,
      description,
      titleTemplate,
      messageTemplate,
      emailSubjectTemplate,
      emailBodyTemplate,
      smsTemplate,
      defaultPriority,
      enabledByDefault,
    } = req.body;

    // Validate required fields
    if (!titleTemplate || !messageTemplate) {
      return res.status(400).json({
        error: 'titleTemplate and messageTemplate are required',
      });
    }

    const template = await prisma.notificationTemplate.upsert({
      where: { type },
      create: {
        type,
        name: name || DEFAULT_TEMPLATES[type]?.name || type,
        description,
        titleTemplate,
        messageTemplate,
        emailSubjectTemplate,
        emailBodyTemplate,
        smsTemplate,
        defaultPriority: defaultPriority || 'NORMAL',
        enabledByDefault: enabledByDefault !== false,
      },
      update: {
        name,
        description,
        titleTemplate,
        messageTemplate,
        emailSubjectTemplate,
        emailBodyTemplate,
        smsTemplate,
        defaultPriority,
        enabledByDefault,
      },
    });

    res.json(template);
  } catch (error) {
    next(error);
  }
}
