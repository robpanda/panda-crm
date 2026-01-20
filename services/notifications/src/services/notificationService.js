import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Bamboogli messaging service URL
const BAMBOOGLI_SERVICE_URL = process.env.BAMBOOGLI_SERVICE_URL || 'http://localhost:3012';

/**
 * NotificationService - Central service for creating and managing notifications
 * This service is meant to be called by other services when events occur
 */
class NotificationService {
  /**
   * Create a notification from a template
   * @param {string} type - NotificationType enum value
   * @param {string} userId - Target user ID
   * @param {object} data - Data for template interpolation
   * @param {object} relations - Related record IDs
   */
  async createFromTemplate(type, userId, data, relations = {}) {
    // Get template
    let template = await prisma.notificationTemplate.findUnique({
      where: { type },
    });

    // Use defaults if no custom template
    if (!template) {
      const defaults = await this.getDefaultTemplate(type);
      if (!defaults) {
        throw new Error(`No template found for type: ${type}`);
      }
      template = defaults;
    }

    // Interpolate templates
    const title = this.interpolate(template.titleTemplate, data);
    const message = this.interpolate(template.messageTemplate, data);

    // Check user preferences
    const preferences = await prisma.notificationPreference.findUnique({
      where: { userId },
    });

    // Check if notification type is enabled
    if (preferences?.typePreferences?.[type]?.enabled === false) {
      console.log(`Notification type ${type} disabled for user ${userId}`);
      return null;
    }

    // Check quiet hours
    if (this.isInQuietHours(preferences)) {
      // Queue for later delivery instead of immediate
      console.log(`User ${userId} is in quiet hours, queueing notification`);
      // In production, this would queue to a job system
    }

    // Create notification
    const notification = await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        priority: template.defaultPriority || 'NORMAL',
        actionUrl: data.actionUrl,
        actionLabel: data.actionLabel,
        opportunityId: relations.opportunityId,
        accountId: relations.accountId,
        contactId: relations.contactId,
        leadId: relations.leadId,
        workOrderId: relations.workOrderId,
        caseId: relations.caseId,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
      },
    });

    // Handle delivery channels
    await this.deliverNotification(notification, template, preferences, data);

    return notification;
  }

  /**
   * Handle delivery across channels (email, SMS, push)
   */
  async deliverNotification(notification, template, preferences, data) {
    const channels = [];

    // Email delivery
    if (preferences?.emailEnabled !== false && template.emailSubjectTemplate) {
      channels.push(
        this.sendEmailNotification(notification, template, data)
          .then(() => this.updateDeliveryStatus(notification.id, 'email'))
          .catch(err => console.error('Email delivery failed:', err))
      );
    }

    // SMS delivery
    if (preferences?.smsEnabled && template.smsTemplate) {
      channels.push(
        this.sendSmsNotification(notification, template, data)
          .then(() => this.updateDeliveryStatus(notification.id, 'sms'))
          .catch(err => console.error('SMS delivery failed:', err))
      );
    }

    // Push notification (in-app is default)
    if (preferences?.pushEnabled !== false) {
      channels.push(
        this.sendPushNotification(notification, data)
          .then(() => this.updateDeliveryStatus(notification.id, 'push'))
          .catch(err => console.error('Push delivery failed:', err))
      );
    }

    await Promise.allSettled(channels);
  }

  /**
   * Send email notification via Bamboogli messaging service
   */
  async sendEmailNotification(notification, template, data) {
    const user = await prisma.user.findUnique({
      where: { id: notification.userId },
      select: { id: true, email: true, fullName: true },
    });

    if (!user?.email) {
      console.log('No email for user:', notification.userId);
      return;
    }

    const subject = this.interpolate(template.emailSubjectTemplate, data);
    const bodyHtml = this.interpolate(template.emailBodyTemplate, data);
    // Create plain text version by stripping HTML
    const bodyText = bodyHtml.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

    try {
      const response = await fetch(`${BAMBOOGLI_SERVICE_URL}/api/messages/send/email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: user.email,
          subject,
          body: bodyText,
          bodyHtml,
          contactId: data.contactId,
          opportunityId: data.opportunityId || notification.opportunityId,
          accountId: data.accountId || notification.accountId,
          sentById: 'system', // System notification
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Bamboogli email delivery failed:', {
          status: response.status,
          error: errorData,
          to: user.email,
        });
        throw new Error(errorData.error || `Email delivery failed with status ${response.status}`);
      }

      const result = await response.json();
      console.log('Email sent successfully via Bamboogli:', {
        to: user.email,
        messageId: result.id,
        providerId: result.providerId,
      });

      return result;
    } catch (error) {
      console.error('Failed to send email notification:', error);
      // Don't throw - email failure shouldn't break the notification flow
      // The in-app notification is still created
    }
  }

  /**
   * Send SMS notification via Bamboogli messaging service
   */
  async sendSmsNotification(notification, template, data) {
    const user = await prisma.user.findUnique({
      where: { id: notification.userId },
      select: { id: true, mobilePhone: true, fullName: true },
    });

    if (!user?.mobilePhone) {
      console.log('No mobile for user:', notification.userId);
      return;
    }

    const message = this.interpolate(template.smsTemplate, data);

    try {
      const response = await fetch(`${BAMBOOGLI_SERVICE_URL}/api/messages/send/sms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: user.mobilePhone,
          body: message,
          contactId: data.contactId,
          opportunityId: data.opportunityId || notification.opportunityId,
          accountId: data.accountId || notification.accountId,
          sentById: 'system', // System notification
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Bamboogli SMS delivery failed:', {
          status: response.status,
          error: errorData,
          to: user.mobilePhone,
        });
        throw new Error(errorData.error || `SMS delivery failed with status ${response.status}`);
      }

      const result = await response.json();
      console.log('SMS sent successfully via Bamboogli:', {
        to: user.mobilePhone,
        messageId: result.id,
        providerId: result.providerId,
      });

      return result;
    } catch (error) {
      console.error('Failed to send SMS notification:', error);
      // Don't throw - SMS failure shouldn't break the notification flow
      // The in-app notification is still created
    }
  }

  /**
   * Send push notification (WebSocket or service worker)
   */
  async sendPushNotification(notification, data) {
    // In production, this would:
    // 1. Send via WebSocket to connected clients
    // 2. Send via service worker push if client not connected

    console.log('Would send push notification:', {
      userId: notification.userId,
      title: notification.title,
      message: notification.message,
    });

    // TODO: Integrate with real-time service (Socket.io, Pusher, etc.)
  }

  /**
   * Update delivery status on notification
   */
  async updateDeliveryStatus(notificationId, channel) {
    const updateData = {};
    const now = new Date();

    switch (channel) {
      case 'email':
        updateData.emailSent = true;
        updateData.emailSentAt = now;
        break;
      case 'sms':
        updateData.smsSent = true;
        updateData.smsSentAt = now;
        break;
      case 'push':
        updateData.pushSent = true;
        updateData.pushSentAt = now;
        break;
    }

    await prisma.notification.update({
      where: { id: notificationId },
      data: updateData,
    });
  }

  /**
   * Check if current time is in user's quiet hours
   */
  isInQuietHours(preferences) {
    if (!preferences?.quietHoursEnabled) return false;
    if (!preferences.quietHoursStart || !preferences.quietHoursEnd) return false;

    const now = new Date();
    const tz = preferences.quietHoursTimezone || 'America/New_York';

    // Get current time in user's timezone
    const userTime = now.toLocaleTimeString('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const [startHour, startMin] = preferences.quietHoursStart.split(':').map(Number);
    const [endHour, endMin] = preferences.quietHoursEnd.split(':').map(Number);
    const [nowHour, nowMin] = userTime.split(':').map(Number);

    const startMins = startHour * 60 + startMin;
    const endMins = endHour * 60 + endMin;
    const nowMins = nowHour * 60 + nowMin;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (startMins > endMins) {
      return nowMins >= startMins || nowMins <= endMins;
    }

    return nowMins >= startMins && nowMins <= endMins;
  }

  /**
   * Interpolate template with data
   */
  interpolate(template, data) {
    if (!template) return '';
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return data[key] !== undefined ? data[key] : match;
    });
  }

  /**
   * Get default template for a type
   */
  async getDefaultTemplate(type) {
    // Import defaults from templateController
    const DEFAULT_TEMPLATES = {
      STAGE_CHANGE: {
        titleTemplate: 'Stage Changed: {{opportunityName}}',
        messageTemplate: 'Opportunity "{{opportunityName}}" moved from {{previousStage}} to {{newStage}}',
        defaultPriority: 'NORMAL',
      },
      ASSIGNMENT: {
        titleTemplate: '{{recordType}} Assigned to You',
        messageTemplate: 'You have been assigned to {{recordType}}: {{recordName}}',
        defaultPriority: 'HIGH',
      },
      OPPORTUNITY_WON: {
        titleTemplate: 'Congratulations! Opportunity Won',
        messageTemplate: 'Opportunity "{{opportunityName}}" has been closed won! Amount: {{amount}}',
        defaultPriority: 'HIGH',
      },
      // Appointment notifications for Call Center / Inspector integration
      APPOINTMENT_BOOKED: {
        titleTemplate: 'New Appointment Scheduled',
        messageTemplate: 'New {{appointmentType}} appointment booked for {{customerName}} at {{address}} on {{scheduledDate}} at {{scheduledTime}}',
        defaultPriority: 'HIGH',
        smsTemplate: 'New appt: {{customerName}} at {{address}} on {{scheduledDate}} {{scheduledTime}}. View in CRM for details.',
        emailSubjectTemplate: 'New Appointment Scheduled - {{customerName}}',
        emailBodyTemplate: `
          <h2>New Appointment Scheduled</h2>
          <p><strong>Customer:</strong> {{customerName}}</p>
          <p><strong>Address:</strong> {{address}}</p>
          <p><strong>Date:</strong> {{scheduledDate}}</p>
          <p><strong>Time:</strong> {{scheduledTime}}</p>
          <p><strong>Appointment Type:</strong> {{appointmentType}}</p>
          <p><strong>Notes:</strong> {{notes}}</p>
          <p><a href="{{actionUrl}}">View in CRM</a></p>
        `,
      },
      APPOINTMENT_RESCHEDULED: {
        titleTemplate: 'Appointment Rescheduled',
        messageTemplate: '{{appointmentType}} for {{customerName}} rescheduled from {{previousDate}} to {{newDate}} at {{newTime}}',
        defaultPriority: 'HIGH',
        smsTemplate: 'RESCHEDULED: {{customerName}} moved from {{previousDate}} to {{newDate}} {{newTime}}. Check CRM for details.',
        emailSubjectTemplate: 'Appointment Rescheduled - {{customerName}}',
        emailBodyTemplate: `
          <h2>Appointment Rescheduled</h2>
          <p><strong>Customer:</strong> {{customerName}}</p>
          <p><strong>Address:</strong> {{address}}</p>
          <p><strong>Previous Date:</strong> {{previousDate}} at {{previousTime}}</p>
          <p><strong>New Date:</strong> {{newDate}} at {{newTime}}</p>
          <p><strong>Reason:</strong> {{notes}}</p>
          <p><a href="{{actionUrl}}">View in CRM</a></p>
        `,
      },
      APPOINTMENT_CANCELLED: {
        titleTemplate: 'Appointment Cancelled',
        messageTemplate: '{{appointmentType}} for {{customerName}} on {{scheduledDate}} has been cancelled. Reason: {{reason}}',
        defaultPriority: 'HIGH',
        smsTemplate: 'CANCELLED: {{customerName}} on {{scheduledDate}}. Reason: {{reason}}',
        emailSubjectTemplate: 'Appointment Cancelled - {{customerName}}',
        emailBodyTemplate: `
          <h2>Appointment Cancelled</h2>
          <p><strong>Customer:</strong> {{customerName}}</p>
          <p><strong>Address:</strong> {{address}}</p>
          <p><strong>Original Date:</strong> {{scheduledDate}} at {{scheduledTime}}</p>
          <p><strong>Cancellation Reason:</strong> {{reason}}</p>
          <p><a href="{{actionUrl}}">View in CRM</a></p>
        `,
      },
      APPOINTMENT_DISPATCHED: {
        titleTemplate: 'Appointment Dispatched - You\'re Up!',
        messageTemplate: '{{appointmentType}} for {{customerName}} at {{address}} on {{scheduledDate}} at {{scheduledTime}} has been dispatched to you. Please confirm receipt.',
        defaultPriority: 'HIGH',
        smsTemplate: 'DISPATCHED: {{customerName}} at {{address}} - {{scheduledDate}} {{scheduledTime}}. {{appointmentType}}. Please confirm.',
        emailSubjectTemplate: 'Appointment Dispatched - {{customerName}} on {{scheduledDate}}',
        emailBodyTemplate: `
          <h2>Appointment Dispatched to You</h2>
          <p>Your next appointment has been dispatched. Please review the details below:</p>
          <p><strong>Customer:</strong> {{customerName}}</p>
          <p><strong>Address:</strong> {{address}}</p>
          <p><strong>Date:</strong> {{scheduledDate}}</p>
          <p><strong>Time:</strong> {{scheduledTime}}</p>
          <p><strong>Appointment Type:</strong> {{appointmentType}}</p>
          <p><strong>Customer Phone:</strong> {{customerPhone}}</p>
          <p><strong>Notes:</strong> {{notes}}</p>
          <p><a href="{{actionUrl}}">View Appointment Details</a></p>
          <hr/>
          <p style="font-size: 12px; color: #666;">Please arrive on time and contact the office if you have any issues.</p>
        `,
      },
    };

    return DEFAULT_TEMPLATES[type] || null;
  }

  // Convenience methods for common notification types

  async notifyStageChange(userId, opportunity, previousStage, newStage) {
    return this.createFromTemplate(
      'STAGE_CHANGE',
      userId,
      {
        opportunityName: opportunity.name,
        previousStage,
        newStage,
        actionUrl: `/opportunities/${opportunity.id}`,
        actionLabel: 'View Opportunity',
        sourceType: 'stage_change',
        sourceId: opportunity.id,
      },
      { opportunityId: opportunity.id, accountId: opportunity.accountId }
    );
  }

  async notifyAssignment(userId, recordType, record) {
    return this.createFromTemplate(
      'ASSIGNMENT',
      userId,
      {
        recordType,
        recordName: record.name || record.workOrderNumber || record.caseNumber,
        actionUrl: `/${recordType.toLowerCase()}s/${record.id}`,
        actionLabel: `View ${recordType}`,
        sourceType: 'assignment',
        sourceId: record.id,
      },
      {
        opportunityId: record.opportunityId,
        accountId: record.accountId,
        workOrderId: recordType === 'WorkOrder' ? record.id : undefined,
        caseId: recordType === 'Case' ? record.id : undefined,
      }
    );
  }

  async notifyOpportunityWon(userId, opportunity) {
    return this.createFromTemplate(
      'OPPORTUNITY_WON',
      userId,
      {
        opportunityName: opportunity.name,
        amount: new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(opportunity.amount || 0),
        actionUrl: `/opportunities/${opportunity.id}`,
        actionLabel: 'View Details',
        sourceType: 'opportunity_won',
        sourceId: opportunity.id,
      },
      { opportunityId: opportunity.id, accountId: opportunity.accountId }
    );
  }

  async notifyWorkOrderCreated(userId, workOrder) {
    return this.createFromTemplate(
      'WORK_ORDER_CREATED',
      userId,
      {
        workOrderNumber: workOrder.workOrderNumber,
        accountName: workOrder.account?.name || 'Unknown',
        actionUrl: `/work-orders/${workOrder.id}`,
        actionLabel: 'View Work Order',
        sourceType: 'work_order_created',
        sourceId: workOrder.id,
      },
      {
        workOrderId: workOrder.id,
        opportunityId: workOrder.opportunityId,
        accountId: workOrder.accountId,
      }
    );
  }

  async notifyCaseCreated(userId, caseRecord) {
    return this.createFromTemplate(
      'CASE_CREATED',
      userId,
      {
        caseNumber: caseRecord.caseNumber,
        subject: caseRecord.subject,
        priority: caseRecord.priority,
        actionUrl: `/cases/${caseRecord.id}`,
        actionLabel: 'View Case',
        sourceType: 'case_created',
        sourceId: caseRecord.id,
      },
      {
        caseId: caseRecord.id,
        accountId: caseRecord.accountId,
      }
    );
  }

  async notifyTaskAssigned(userId, task) {
    return this.createFromTemplate(
      'TASK_ASSIGNED',
      userId,
      {
        taskSubject: task.subject,
        dueDate: task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date',
        actionUrl: `/tasks/${task.id}`,
        actionLabel: 'View Task',
        sourceType: 'task_assigned',
        sourceId: task.id,
      },
      {
        opportunityId: task.opportunityId,
        accountId: task.accountId,
        leadId: task.leadId,
      }
    );
  }

  async notifyApprovalRequested(userId, record, requesterName) {
    return this.createFromTemplate(
      'APPROVAL_REQUESTED',
      userId,
      {
        recordName: record.name || record.workOrderNumber || `Record #${record.id}`,
        requesterName,
        comments: record.approvalComments || '',
        actionUrl: record.actionUrl || `/approvals/${record.id}`,
        actionLabel: 'Review & Approve',
        sourceType: 'approval_request',
        sourceId: record.id,
      },
      {
        opportunityId: record.opportunityId,
        accountId: record.accountId,
      }
    );
  }

  // ============================================================================
  // INSPECTOR / CALL CENTER APPOINTMENT NOTIFICATIONS
  // These methods notify inspectors/technicians when appointments are scheduled,
  // rescheduled, or cancelled by the call center team.
  // ============================================================================

  /**
   * Notify inspector/technician when a new appointment is booked
   * @param {string} inspectorId - User ID of the inspector/technician to notify
   * @param {Object} appointment - ServiceAppointment data
   * @param {Object} opportunity - Related Opportunity with account/contact info
   * @param {Object} options - Additional options like bookedBy user
   */
  async notifyAppointmentBooked(inspectorId, appointment, opportunity, options = {}) {
    const account = opportunity.account || {};
    const contact = opportunity.contact || {};
    const customerName = contact.fullName || account.name || 'Customer';
    const address = this.formatAddress(account);
    const appointmentType = appointment.workType?.name || appointment.appointmentType || 'Service Appointment';
    const scheduledDate = appointment.scheduledStart
      ? new Date(appointment.scheduledStart).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      : 'TBD';
    const scheduledTime = appointment.scheduledStart
      ? new Date(appointment.scheduledStart).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'TBD';

    // Note: Appointment changes are handled via scheduler, not Attention Queue.
    // Attention Queue is for customer-facing action items (aging leads, overdue invoices, etc.)
    // SMS/Email notifications are sent to inspectors via Bamboogli below.

    return this.createFromTemplate(
      'APPOINTMENT_BOOKED',
      inspectorId,
      {
        customerName,
        address,
        scheduledDate,
        scheduledTime,
        appointmentType,
        notes: options.notes || '',
        bookedBy: options.bookedByName || 'Call Center',
        actionUrl: `/opportunities/${opportunity.id}`,
        actionLabel: 'View Appointment',
        sourceType: 'appointment_booked',
        sourceId: appointment.id,
      },
      {
        opportunityId: opportunity.id,
        accountId: account.id,
        workOrderId: appointment.workOrderId,
      }
    );
  }

  /**
   * Notify inspector/technician when an appointment is rescheduled
   * @param {string} inspectorId - User ID of the inspector/technician to notify
   * @param {Object} appointment - Updated ServiceAppointment data
   * @param {Object} opportunity - Related Opportunity with account/contact info
   * @param {Object} previousTimes - Object with previousStart and previousEnd dates
   * @param {Object} options - Additional options like rescheduledBy user
   */
  async notifyAppointmentRescheduled(inspectorId, appointment, opportunity, previousTimes, options = {}) {
    const account = opportunity.account || {};
    const contact = opportunity.contact || {};
    const customerName = contact.fullName || account.name || 'Customer';
    const address = this.formatAddress(account);
    const appointmentType = appointment.workType?.name || appointment.appointmentType || 'Service Appointment';

    const formatDate = (date) =>
      date
        ? new Date(date).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })
        : 'TBD';

    const formatTime = (date) =>
      date
        ? new Date(date).toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
          })
        : 'TBD';

    // Note: Appointment changes are handled via scheduler, not Attention Queue.
    // Attention Queue is for customer-facing action items (aging leads, overdue invoices, etc.)
    // SMS/Email notifications are sent to inspectors via Bamboogli below.

    return this.createFromTemplate(
      'APPOINTMENT_RESCHEDULED',
      inspectorId,
      {
        customerName,
        address,
        previousDate: formatDate(previousTimes.previousStart),
        previousTime: formatTime(previousTimes.previousStart),
        newDate: formatDate(appointment.scheduledStart),
        newTime: formatTime(appointment.scheduledStart),
        appointmentType,
        notes: options.notes || '',
        rescheduledBy: options.rescheduledByName || 'Call Center',
        actionUrl: `/opportunities/${opportunity.id}`,
        actionLabel: 'View Appointment',
        sourceType: 'appointment_rescheduled',
        sourceId: appointment.id,
      },
      {
        opportunityId: opportunity.id,
        accountId: account.id,
        workOrderId: appointment.workOrderId,
      }
    );
  }

  /**
   * Notify inspector/technician when an appointment is dispatched to them
   * This is the critical "go-time" notification that tells the resource they have a job
   * @param {string} inspectorId - User ID of the inspector/technician to notify
   * @param {Object} appointment - Dispatched ServiceAppointment data
   * @param {Object} opportunity - Related Opportunity with account/contact info
   * @param {Object} options - Additional options like dispatchedBy user
   */
  async notifyAppointmentDispatched(inspectorId, appointment, opportunity, options = {}) {
    const account = opportunity.account || {};
    const contact = opportunity.contact || {};
    const customerName = contact.fullName || account.name || 'Customer';
    const customerPhone = contact.phone || contact.mobilePhone || account.phone || 'N/A';
    const address = this.formatAddress(account);
    const appointmentType = appointment.workType?.name || appointment.appointmentType || 'Service Appointment';

    const scheduledDate = appointment.scheduledStart
      ? new Date(appointment.scheduledStart).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      : 'TBD';
    const scheduledTime = appointment.scheduledStart
      ? new Date(appointment.scheduledStart).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })
      : 'TBD';

    return this.createFromTemplate(
      'APPOINTMENT_DISPATCHED',
      inspectorId,
      {
        customerName,
        customerPhone,
        address,
        scheduledDate,
        scheduledTime,
        appointmentType,
        notes: options.notes || appointment.description || '',
        dispatchedBy: options.dispatchedByName || 'Call Center',
        actionUrl: `/opportunities/${opportunity.id}`,
        actionLabel: 'View Appointment',
        sourceType: 'appointment_dispatched',
        sourceId: appointment.id,
      },
      {
        opportunityId: opportunity.id,
        accountId: account.id,
        workOrderId: appointment.workOrderId,
      }
    );
  }

  /**
   * Notify inspector/technician when an appointment is cancelled
   * @param {string} inspectorId - User ID of the inspector/technician to notify
   * @param {Object} appointment - Cancelled ServiceAppointment data
   * @param {Object} opportunity - Related Opportunity with account/contact info
   * @param {string} reason - Cancellation reason
   * @param {Object} options - Additional options like cancelledBy user
   */
  async notifyAppointmentCancelled(inspectorId, appointment, opportunity, reason, options = {}) {
    const account = opportunity.account || {};
    const contact = opportunity.contact || {};
    const customerName = contact.fullName || account.name || 'Customer';
    const address = this.formatAddress(account);
    const appointmentType = appointment.workType?.name || appointment.appointmentType || 'Service Appointment';

    const scheduledDate = appointment.scheduledStart
      ? new Date(appointment.scheduledStart).toLocaleDateString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
        })
      : 'Unscheduled';
    const scheduledTime = appointment.scheduledStart
      ? new Date(appointment.scheduledStart).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
        })
      : '';

    // Note: Appointment changes are handled via scheduler, not Attention Queue.
    // Attention Queue is for customer-facing action items (aging leads, overdue invoices, etc.)
    // SMS/Email notifications are sent to inspectors via Bamboogli below.

    return this.createFromTemplate(
      'APPOINTMENT_CANCELLED',
      inspectorId,
      {
        customerName,
        address,
        scheduledDate,
        scheduledTime,
        appointmentType,
        reason: reason || 'No reason provided',
        cancelledBy: options.cancelledByName || 'Call Center',
        actionUrl: `/opportunities/${opportunity.id}`,
        actionLabel: 'View Details',
        sourceType: 'appointment_cancelled',
        sourceId: appointment.id,
      },
      {
        opportunityId: opportunity.id,
        accountId: account.id,
        workOrderId: appointment.workOrderId,
      }
    );
  }

  /**
   * Notify multiple inspectors about an appointment event
   * Useful when an appointment might affect multiple team members
   * @param {string[]} inspectorIds - Array of user IDs to notify
   * @param {string} eventType - 'booked', 'rescheduled', 'dispatched', or 'cancelled'
   * @param {Object} data - Event-specific data (appointment, opportunity, etc.)
   */
  async notifyInspectorTeam(inspectorIds, eventType, data) {
    const notifications = [];

    for (const inspectorId of inspectorIds) {
      try {
        let notification;
        switch (eventType) {
          case 'booked':
            notification = await this.notifyAppointmentBooked(
              inspectorId,
              data.appointment,
              data.opportunity,
              data.options
            );
            break;
          case 'rescheduled':
            notification = await this.notifyAppointmentRescheduled(
              inspectorId,
              data.appointment,
              data.opportunity,
              data.previousTimes,
              data.options
            );
            break;
          case 'dispatched':
            notification = await this.notifyAppointmentDispatched(
              inspectorId,
              data.appointment,
              data.opportunity,
              data.options
            );
            break;
          case 'cancelled':
            notification = await this.notifyAppointmentCancelled(
              inspectorId,
              data.appointment,
              data.opportunity,
              data.reason,
              data.options
            );
            break;
          default:
            console.warn(`Unknown appointment event type: ${eventType}`);
        }
        if (notification) {
          notifications.push(notification);
        }
      } catch (error) {
        console.error(`Failed to notify inspector ${inspectorId}:`, error);
      }
    }

    return notifications;
  }

  /**
   * Helper to format account address for notifications
   */
  formatAddress(account) {
    if (!account) return 'Address not available';

    const parts = [
      account.billingStreet || account.street,
      account.billingCity || account.city,
      account.billingState || account.state,
      account.billingPostalCode || account.postalCode,
    ].filter(Boolean);

    return parts.length > 0 ? parts.join(', ') : 'Address not available';
  }

  /**
   * Get inspectors assigned to a service territory or work order
   * This is used to determine who should receive appointment notifications
   * @param {Object} options - Query options
   * @returns {Promise<string[]>} Array of user IDs
   */
  async getInspectorsForNotification(options = {}) {
    const { workOrderId, opportunityId, territoryId, workTypeId } = options;

    // Find assigned resources for work order
    if (workOrderId) {
      const workOrder = await prisma.workOrder.findUnique({
        where: { id: workOrderId },
        include: {
          assignedResources: {
            include: {
              serviceResource: {
                include: { user: true },
              },
            },
          },
          serviceAppointments: {
            include: {
              assignedResources: {
                include: {
                  serviceResource: {
                    include: { user: true },
                  },
                },
              },
            },
          },
        },
      });

      if (workOrder) {
        const inspectorIds = new Set();

        // Add work order assigned resources
        workOrder.assignedResources?.forEach((ar) => {
          if (ar.serviceResource?.userId) {
            inspectorIds.add(ar.serviceResource.userId);
          }
        });

        // Add service appointment assigned resources
        workOrder.serviceAppointments?.forEach((sa) => {
          sa.assignedResources?.forEach((ar) => {
            if (ar.serviceResource?.userId) {
              inspectorIds.add(ar.serviceResource.userId);
            }
          });
        });

        if (inspectorIds.size > 0) {
          return Array.from(inspectorIds);
        }
      }
    }

    // If no specific work order, try to find inspectors by territory
    if (territoryId) {
      const territoryMembers = await prisma.serviceTerritoryMember.findMany({
        where: { serviceTerritoryId: territoryId },
        include: {
          serviceResource: {
            include: { user: true },
          },
        },
      });

      return territoryMembers
        .filter((tm) => tm.serviceResource?.userId)
        .map((tm) => tm.serviceResource.userId);
    }

    // Fallback: get opportunity owner
    if (opportunityId) {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: opportunityId },
        select: { ownerId: true },
      });

      if (opportunity?.ownerId) {
        return [opportunity.ownerId];
      }
    }

    return [];
  }
}

export const notificationService = new NotificationService();
export default notificationService;
