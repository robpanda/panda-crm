import { PrismaClient } from '@prisma/client';
import * as twilioProvider from '../providers/twilioProvider.js';
import * as emailProvider from '../providers/emailProvider.js';

const prisma = new PrismaClient();

// Automation types
const AUTOMATION_TYPES = {
  APPOINTMENT_CONFIRMATION: 'appointment_confirmation',
  APPOINTMENT_REMINDER_24H: 'appointment_reminder_24h',
  APPOINTMENT_REMINDER_2H: 'appointment_reminder_2h',
  CREW_DISPATCH_NOTIFICATION: 'crew_dispatch_notification',
  APPOINTMENT_COMPLETE: 'appointment_complete',
  RESCHEDULE_CONFIRMATION: 'reschedule_confirmation',
};

// Default templates for each automation type
const DEFAULT_TEMPLATES = {
  [AUTOMATION_TYPES.APPOINTMENT_CONFIRMATION]: {
    sms: {
      body: `Hi {firstName}! Your {workType} appointment with Panda Exteriors is confirmed for {appointmentDate} at {appointmentTime}. Your technician {crewName} will arrive at {address}. Reply CONFIRM to confirm or call us at (240) 801-6665 to reschedule.`,
    },
    email: {
      subject: 'Your Panda Exteriors Appointment is Confirmed!',
      body: `Hi {firstName},

Your {workType} appointment with Panda Exteriors has been confirmed!

APPOINTMENT DETAILS:
Date: {appointmentDate}
Time: {appointmentTime}
Technician: {crewName}
Location: {address}

WHAT TO EXPECT:
Our team will arrive at the scheduled time and will call you 15-30 minutes before arrival.

NEED TO RESCHEDULE?
Call us at (240) 801-6665 or reply to this email.

Thank you for choosing Panda Exteriors!

Best regards,
The Panda Exteriors Team`,
    },
  },
  [AUTOMATION_TYPES.APPOINTMENT_REMINDER_24H]: {
    sms: {
      body: `Reminder: Your {workType} appointment with Panda Exteriors is tomorrow at {appointmentTime}. {crewName} will arrive at {address}. Questions? Call (240) 801-6665.`,
    },
    email: {
      subject: 'Reminder: Your Panda Exteriors Appointment is Tomorrow!',
      body: `Hi {firstName},

This is a friendly reminder that your appointment is scheduled for tomorrow.

APPOINTMENT DETAILS:
Date: {appointmentDate}
Time: {appointmentTime}
Technician: {crewName}
Location: {address}

PREPARATION TIPS:
- Clear the work area if possible
- Ensure someone 18+ will be home
- Have any questions ready for our technician

See you tomorrow!

Best regards,
The Panda Exteriors Team`,
    },
  },
  [AUTOMATION_TYPES.APPOINTMENT_REMINDER_2H]: {
    sms: {
      body: `Hi {firstName}! Just a heads up - {crewName} from Panda Exteriors will arrive at {address} in about 2 hours for your {workType} appointment. See you soon!`,
    },
    email: null, // 2-hour reminder is SMS only
  },
  [AUTOMATION_TYPES.CREW_DISPATCH_NOTIFICATION]: {
    sms: {
      body: `NEW JOB ASSIGNED: {customerName} at {address}. {workType} scheduled for {appointmentDate} at {appointmentTime}. Contact: {customerPhone}. Job ID: {opportunityName}`,
    },
    email: {
      subject: 'New Job Assignment - {customerName}',
      body: `New job assigned to you:

CUSTOMER: {customerName}
PHONE: {customerPhone}
ADDRESS: {address}

APPOINTMENT:
Date: {appointmentDate}
Time: {appointmentTime}
Work Type: {workType}
Job ID: {opportunityName}

NOTES:
{notes}

Please confirm receipt of this assignment.`,
    },
  },
  [AUTOMATION_TYPES.APPOINTMENT_COMPLETE]: {
    sms: {
      body: `Thank you, {firstName}! Your {workType} project with Panda Exteriors is complete. We'd love your feedback - please take 30 seconds to rate your experience: {reviewLink}`,
    },
    email: {
      subject: 'How did we do? Rate your Panda Exteriors experience',
      body: `Hi {firstName},

Your {workType} project is complete! Thank you for choosing Panda Exteriors.

We'd love to hear about your experience. Please take a moment to leave us a review:

{reviewLink}

Your feedback helps us serve you and our community better.

If you have any questions or concerns about the work completed, please don't hesitate to contact us.

Best regards,
The Panda Exteriors Team`,
    },
  },
};

// Get all automation configurations
export async function listAutomations(req, res, next) {
  try {
    const automations = await prisma.automationConfig.findMany({
      orderBy: { type: 'asc' },
    });

    // If no automations exist, return defaults with enabled: false
    if (automations.length === 0) {
      const defaults = Object.entries(AUTOMATION_TYPES).map(([key, type]) => ({
        id: null,
        type,
        name: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        enabled: false,
        smsEnabled: true,
        emailEnabled: type !== AUTOMATION_TYPES.APPOINTMENT_REMINDER_2H,
        smsTemplate: DEFAULT_TEMPLATES[type]?.sms?.body || null,
        emailSubject: DEFAULT_TEMPLATES[type]?.email?.subject || null,
        emailTemplate: DEFAULT_TEMPLATES[type]?.email?.body || null,
        triggerDelay: 0,
      }));
      return res.json({ automations: defaults });
    }

    res.json({ automations });
  } catch (error) {
    next(error);
  }
}

// Get single automation
export async function getAutomation(req, res, next) {
  try {
    const { type } = req.params;

    let automation = await prisma.automationConfig.findUnique({
      where: { type },
    });

    // Return default if not configured
    if (!automation) {
      automation = {
        id: null,
        type,
        name: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        enabled: false,
        smsEnabled: true,
        emailEnabled: true,
        smsTemplate: DEFAULT_TEMPLATES[type]?.sms?.body || null,
        emailSubject: DEFAULT_TEMPLATES[type]?.email?.subject || null,
        emailTemplate: DEFAULT_TEMPLATES[type]?.email?.body || null,
        triggerDelay: 0,
      };
    }

    res.json({ automation });
  } catch (error) {
    next(error);
  }
}

// Update automation configuration
export async function updateAutomation(req, res, next) {
  try {
    const { type } = req.params;
    const {
      enabled,
      smsEnabled,
      emailEnabled,
      smsTemplate,
      emailSubject,
      emailTemplate,
      triggerDelay,
    } = req.body;

    const automation = await prisma.automationConfig.upsert({
      where: { type },
      update: {
        enabled: enabled ?? undefined,
        smsEnabled: smsEnabled ?? undefined,
        emailEnabled: emailEnabled ?? undefined,
        smsTemplate: smsTemplate ?? undefined,
        emailSubject: emailSubject ?? undefined,
        emailTemplate: emailTemplate ?? undefined,
        triggerDelay: triggerDelay ?? undefined,
        updatedAt: new Date(),
      },
      create: {
        type,
        name: type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        enabled: enabled ?? false,
        smsEnabled: smsEnabled ?? true,
        emailEnabled: emailEnabled ?? true,
        smsTemplate: smsTemplate || DEFAULT_TEMPLATES[type]?.sms?.body || null,
        emailSubject: emailSubject || DEFAULT_TEMPLATES[type]?.email?.subject || null,
        emailTemplate: emailTemplate || DEFAULT_TEMPLATES[type]?.email?.body || null,
        triggerDelay: triggerDelay ?? 0,
      },
    });

    res.json({ automation });
  } catch (error) {
    next(error);
  }
}

// Test automation (send test message)
export async function testAutomation(req, res, next) {
  try {
    const { type } = req.params;
    const { channel, to } = req.body; // channel: 'sms' or 'email'

    // Get automation config
    let automation = await prisma.automationConfig.findUnique({
      where: { type },
    });

    if (!automation) {
      automation = {
        smsTemplate: DEFAULT_TEMPLATES[type]?.sms?.body || 'Test message',
        emailSubject: DEFAULT_TEMPLATES[type]?.email?.subject || 'Test Email',
        emailTemplate: DEFAULT_TEMPLATES[type]?.email?.body || 'Test email body',
      };
    }

    // Sample merge data for testing
    const sampleData = {
      firstName: 'John',
      lastName: 'Smith',
      customerName: 'John Smith',
      customerPhone: '(555) 123-4567',
      workType: 'Roof Inspection',
      appointmentDate: 'Monday, January 6, 2025',
      appointmentTime: '10:00 AM',
      crewName: 'Mike Johnson',
      address: '123 Main St, Baltimore, MD 21201',
      projectAddress: '123 Main St, Baltimore, MD 21201', // Alias for address
      opportunityName: 'Panda Ext-12345',
      status: 'Scheduled',
      notes: 'Customer has a dog. Gate code is 1234.',
      reviewLink: 'https://g.page/panda-exteriors/review',
      companyName: 'Panda Exteriors',
      company: 'Panda Exteriors',
    };

    // Merge template with sample data - supports both {var} and {{var}} syntax
    const mergeTemplate = (template, data) => {
      if (!template) return '';
      return template.replace(/\{\{?(\w+)\}?\}/g, (match, key) => {
        return data[key] !== undefined ? data[key] : match;
      });
    };

    if (channel === 'sms') {
      const message = mergeTemplate(automation.smsTemplate, sampleData);
      const result = await twilioProvider.sendSmsMessage({
        to,
        body: message,
      });
      return res.json({ success: true, channel: 'sms', message, result });
    } else if (channel === 'email') {
      const subject = mergeTemplate(automation.emailSubject, sampleData);
      const body = mergeTemplate(automation.emailTemplate, sampleData);
      const result = await emailProvider.sendEmailMessage({
        to,
        subject,
        text: body,
        html: body.replace(/\n/g, '<br>'),
      });
      return res.json({ success: true, channel: 'email', subject, body, result });
    }

    res.status(400).json({ error: 'Invalid channel. Use "sms" or "email".' });
  } catch (error) {
    next(error);
  }
}

// Trigger automation for an appointment
export async function triggerAppointmentAutomation(req, res, next) {
  try {
    const { automationType, appointmentId, resourceId, opportunityId } = req.body;

    // Get automation config
    const automation = await prisma.automationConfig.findUnique({
      where: { type: automationType },
    });

    if (!automation?.enabled) {
      return res.json({
        success: false,
        message: 'Automation is not enabled',
        sent: { sms: false, email: false }
      });
    }

    // Get appointment and related data
    const appointment = appointmentId ? await prisma.serviceAppointment.findUnique({
      where: { id: appointmentId },
      include: {
        workOrder: {
          include: {
            opportunity: {
              include: {
                account: true,
                contact: true,
              },
            },
          },
        },
        assignedResource: {
          include: {
            resource: true,
          },
        },
      },
    }) : null;

    // Get opportunity if not from appointment
    const opportunity = appointment?.workOrder?.opportunity ||
      (opportunityId ? await prisma.opportunity.findUnique({
        where: { id: opportunityId },
        include: { account: true, contact: true },
      }) : null);

    // Get resource/crew
    const resource = appointment?.assignedResource?.resource ||
      (resourceId ? await prisma.serviceResource.findUnique({ where: { id: resourceId } }) : null);

    // Build merge data
    const contact = opportunity?.contact || opportunity?.account;
    const account = opportunity?.account;

    // Build address string for merge fields
    const addressStr = account?.billingStreet
      ? `${account.billingStreet}, ${account.billingCity || ''}, ${account.billingState || ''} ${account.billingPostalCode || ''}`.replace(/\s+/g, ' ').trim()
      : '';

    const mergeData = {
      firstName: contact?.firstName || contact?.name?.split(' ')[0] || 'Valued Customer',
      lastName: contact?.lastName || contact?.name?.split(' ').slice(1).join(' ') || '',
      customerName: contact?.name || `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() || 'Valued Customer',
      customerPhone: contact?.phone || contact?.mobilePhone || '',
      workType: appointment?.workType?.name || opportunity?.workType || 'Service',
      appointmentDate: appointment?.scheduledStart
        ? new Date(appointment.scheduledStart).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
        : 'TBD',
      appointmentTime: appointment?.scheduledStart
        ? new Date(appointment.scheduledStart).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : 'TBD',
      crewName: resource?.name || 'Our team',
      address: addressStr,
      projectAddress: addressStr, // Alias for address
      opportunityName: opportunity?.name || '',
      status: opportunity?.stageName || opportunity?.status || appointment?.status || '',
      notes: appointment?.description || opportunity?.description || '',
      reviewLink: 'https://g.page/panda-exteriors/review',
      // Additional aliases for common merge field names
      companyName: 'Panda Exteriors',
      company: 'Panda Exteriors',
    };

    const results = { sms: null, email: null };

    // Merge template helper - supports both {var} and {{var}} syntax
    const mergeTemplate = (template, data) => {
      if (!template) return '';
      return template.replace(/\{\{?(\w+)\}?\}/g, (match, key) => {
        return data[key] !== undefined && data[key] !== null ? data[key] : match;
      });
    };

    // Send SMS if enabled
    if (automation.smsEnabled && automation.smsTemplate && contact?.phone) {
      try {
        const smsMessage = mergeTemplate(automation.smsTemplate, mergeData);
        results.sms = await twilioProvider.sendSmsMessage({
          to: contact.phone,
          body: smsMessage,
        });

        // Create message record
        await prisma.message.create({
          data: {
            direction: 'OUTBOUND',
            channel: 'SMS',
            body: smsMessage,
            fromAddress: process.env.TWILIO_PHONE_NUMBER,
            toAddresses: [contact.phone],
            status: 'SENT',
            providerId: results.sms.sid,
            providerName: 'twilio',
            contactId: contact.id,
            sentAt: new Date(),
          },
        });

        // Create activity record
        await prisma.activity.create({
          data: {
            type: 'SMS_SENT',
            subject: `Automation: ${automation.name}`,
            body: smsMessage,
            status: 'SENT',
            accountId: account?.id,
            contactId: contact?.id,
            opportunityId: opportunity?.id,
            externalPhone: contact.phone,
            metadata: { automationType, appointmentId },
            occurredAt: new Date(),
          },
        });
      } catch (smsError) {
        console.error('SMS automation failed:', smsError);
        results.sms = { error: smsError.message };
      }
    }

    // Send Email if enabled - with robust email validation (similar to Salesforce flow fix)
    // Check: email not null, not empty string, valid format, and no bounced reason
    const isValidEmail = (email) => {
      if (!email || typeof email !== 'string') return false;
      const trimmed = email.trim();
      if (trimmed.length === 0) return false;
      // Basic email format check
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(trimmed);
    };

    const contactEmail = contact?.email;
    const emailBouncedReason = contact?.emailBouncedReason || contact?.email_bounced_reason;
    const canSendEmail = automation.emailEnabled &&
                         automation.emailTemplate &&
                         isValidEmail(contactEmail) &&
                         !emailBouncedReason;

    if (!canSendEmail && automation.emailEnabled) {
      // Log why email was skipped (for debugging)
      const skipReason = !contactEmail ? 'no email address' :
                         !isValidEmail(contactEmail) ? `invalid email format: "${contactEmail}"` :
                         emailBouncedReason ? `email bounced: ${emailBouncedReason}` :
                         !automation.emailTemplate ? 'no email template' : 'unknown';
      console.log(`Email automation skipped for contact ${contact?.id || 'unknown'}: ${skipReason}`);
    }

    if (canSendEmail) {
      try {
        const emailSubject = mergeTemplate(automation.emailSubject, mergeData);
        const emailBody = mergeTemplate(automation.emailTemplate, mergeData);

        results.email = await emailProvider.sendEmailMessage({
          to: contactEmail,
          subject: emailSubject,
          text: emailBody,
          html: emailBody.replace(/\n/g, '<br>'),
        });

        // Create message record
        await prisma.message.create({
          data: {
            direction: 'OUTBOUND',
            channel: 'EMAIL',
            subject: emailSubject,
            body: emailBody,
            fromAddress: process.env.EMAIL_FROM_ADDRESS,
            toAddresses: [contactEmail],
            status: 'SENT',
            providerId: results.email.messageId,
            providerName: process.env.EMAIL_PROVIDER || 'sendgrid',
            contactId: contact.id,
            sentAt: new Date(),
          },
        });

        // Create activity record
        await prisma.activity.create({
          data: {
            type: 'EMAIL_SENT',
            subject: `Automation: ${automation.name}`,
            body: emailBody,
            status: 'SENT',
            accountId: account?.id,
            contactId: contact?.id,
            opportunityId: opportunity?.id,
            externalEmail: contactEmail,
            metadata: { automationType, appointmentId },
            occurredAt: new Date(),
          },
        });
      } catch (emailError) {
        console.error('Email automation failed:', emailError);
        results.email = { error: emailError.message };
      }
    }

    res.json({
      success: true,
      automationType,
      sent: {
        sms: !!results.sms && !results.sms.error,
        email: !!results.email && !results.email.error,
      },
      results,
    });
  } catch (error) {
    next(error);
  }
}

// Get automation execution history
export async function getAutomationHistory(req, res, next) {
  try {
    const { type } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Query activities with automation metadata
    const activities = await prisma.activity.findMany({
      where: {
        OR: [
          { type: 'SMS_SENT', subject: { startsWith: 'Automation:' } },
          { type: 'EMAIL_SENT', subject: { startsWith: 'Automation:' } },
        ],
        ...(type && {
          metadata: {
            path: ['automationType'],
            equals: type,
          },
        }),
      },
      orderBy: { occurredAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
      include: {
        contact: { select: { id: true, name: true, firstName: true, lastName: true } },
        opportunity: { select: { id: true, name: true } },
      },
    });

    const total = await prisma.activity.count({
      where: {
        OR: [
          { type: 'SMS_SENT', subject: { startsWith: 'Automation:' } },
          { type: 'EMAIL_SENT', subject: { startsWith: 'Automation:' } },
        ],
      },
    });

    res.json({
      activities,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (error) {
    next(error);
  }
}

export { AUTOMATION_TYPES, DEFAULT_TEMPLATES };
