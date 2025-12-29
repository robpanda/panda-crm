// Messaging Service - SMS and Email integration with Riley
import { PrismaClient } from '@prisma/client';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });

// Cached credentials
let twilioCredentials = null;
let sendgridCredentials = null;

/**
 * Get Twilio credentials from AWS Secrets Manager
 */
async function getTwilioCredentials() {
  if (twilioCredentials) return twilioCredentials;

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'twilio/master' })
    );
    twilioCredentials = JSON.parse(response.SecretString);
    return twilioCredentials;
  } catch (error) {
    logger.error('Failed to get Twilio credentials:', error);
    throw new Error('Unable to retrieve Twilio credentials');
  }
}

/**
 * Get SendGrid credentials from AWS Secrets Manager
 */
async function getSendgridCredentials() {
  if (sendgridCredentials) return sendgridCredentials;

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'sendgrid/api-key' })
    );
    sendgridCredentials = JSON.parse(response.SecretString);
    return sendgridCredentials;
  } catch (error) {
    logger.error('Failed to get SendGrid credentials:', error);
    throw new Error('Unable to retrieve SendGrid credentials');
  }
}

/**
 * Messaging Service - Handles SMS and Email through Riley integration
 */
export const messagingService = {
  /**
   * Send SMS via Twilio/Riley
   */
  async sendSMS({ templateId, template, record, recipient, userId }) {
    if (!recipient) {
      throw new Error('SMS recipient phone number is required');
    }

    // Get or load template
    let messageTemplate = template;
    if (templateId && !template) {
      messageTemplate = await prisma.messageTemplate.findUnique({
        where: { id: templateId },
      });
    }

    if (!messageTemplate) {
      throw new Error('Message template not found');
    }

    // Interpolate template with record data
    const messageBody = this.interpolateTemplate(messageTemplate.body, record);

    // Format phone number
    const formattedPhone = this.formatPhoneNumber(recipient);

    logger.info(`Sending SMS to ${formattedPhone}`, { templateId: messageTemplate.id });

    try {
      const twilioConfig = await getTwilioCredentials();

      // Call Twilio API
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.account_sid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${twilioConfig.account_sid}:${twilioConfig.auth_token}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            To: formattedPhone,
            From: twilioConfig.messaging_service_sid ? undefined : twilioConfig.default_from_number,
            MessagingServiceSid: twilioConfig.messaging_service_sid,
            Body: messageBody,
            StatusCallback: `${process.env.API_BASE_URL}/api/workflows/webhooks/twilio/status`,
          }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to send SMS');
      }

      // Log the message
      await prisma.message.create({
        data: {
          conversationId: formattedPhone.replace(/\D/g, '').slice(-10),
          direction: 'OUTBOUND',
          content: messageBody,
          status: 'SENT',
          channel: 'SMS',
          twilioSid: result.sid,
          contactId: record.contactId,
          opportunityId: record.opportunityId || record.id,
          sentById: userId,
        },
      });

      return {
        success: true,
        messageId: result.sid,
        to: formattedPhone,
        body: messageBody,
      };

    } catch (error) {
      logger.error('SMS send failed:', error);
      throw error;
    }
  },

  /**
   * Send Email via SendGrid
   */
  async sendEmail({ templateId, template, record, recipient, userId }) {
    if (!recipient) {
      throw new Error('Email recipient address is required');
    }

    // Get or load template
    let messageTemplate = template;
    if (templateId && !template) {
      messageTemplate = await prisma.messageTemplate.findUnique({
        where: { id: templateId },
      });
    }

    if (!messageTemplate) {
      throw new Error('Message template not found');
    }

    // Interpolate template with record data
    const subject = this.interpolateTemplate(messageTemplate.subject || 'Notification from Panda Exteriors', record);
    const htmlBody = this.interpolateTemplate(messageTemplate.body, record);
    const textBody = this.stripHtml(htmlBody);

    logger.info(`Sending email to ${recipient}`, { templateId: messageTemplate.id });

    try {
      const sendgridConfig = await getSendgridCredentials();

      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sendgridConfig.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [{
            to: [{ email: recipient }],
            subject,
          }],
          from: {
            email: sendgridConfig.from_email || 'info@pandaexteriors.com',
            name: sendgridConfig.from_name || 'Panda Exteriors',
          },
          content: [
            { type: 'text/plain', value: textBody },
            { type: 'text/html', value: htmlBody },
          ],
          tracking_settings: {
            click_tracking: { enable: true },
            open_tracking: { enable: true },
          },
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`SendGrid error: ${error}`);
      }

      // Get message ID from headers
      const messageId = response.headers.get('x-message-id');

      // Log the email
      await prisma.message.create({
        data: {
          conversationId: recipient.replace(/[^a-z0-9]/gi, '').slice(0, 20),
          direction: 'OUTBOUND',
          content: textBody,
          status: 'SENT',
          channel: 'EMAIL',
          externalId: messageId,
          contactId: record.contactId,
          opportunityId: record.opportunityId || record.id,
          sentById: userId,
        },
      });

      return {
        success: true,
        messageId,
        to: recipient,
        subject,
      };

    } catch (error) {
      logger.error('Email send failed:', error);
      throw error;
    }
  },

  /**
   * Format phone number to E.164 format
   */
  formatPhoneNumber(phone) {
    if (!phone) return null;

    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');

    // Handle US numbers
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    } else if (digits.startsWith('+')) {
      return phone;
    }

    return `+${digits}`;
  },

  /**
   * Interpolate template variables with record data
   */
  interpolateTemplate(template, record) {
    if (!template) return template;

    return template.replace(/\{\{([^}]+)\}\}/g, (match, fieldPath) => {
      const value = this.getFieldValue(record, fieldPath.trim());
      return value !== undefined && value !== null ? value : '';
    });
  },

  /**
   * Get nested field value (supports dot notation)
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
   * Strip HTML tags from text
   */
  stripHtml(html) {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
  },

  /**
   * Get all message templates
   */
  async getTemplates(type = null) {
    const where = type ? { type } : {};
    return prisma.messageTemplate.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Create or update message template
   */
  async upsertTemplate(data) {
    if (data.id) {
      return prisma.messageTemplate.update({
        where: { id: data.id },
        data: {
          name: data.name,
          type: data.type,
          subject: data.subject,
          body: data.body,
          variables: data.variables || [],
          category: data.category,
          isSystem: data.isSystem || false,
          updatedAt: new Date(),
        },
      });
    }

    return prisma.messageTemplate.create({
      data: {
        name: data.name,
        type: data.type,
        subject: data.subject,
        body: data.body,
        variables: data.variables || [],
        category: data.category,
        isSystem: data.isSystem || false,
      },
    });
  },

  /**
   * Delete message template
   */
  async deleteTemplate(id) {
    return prisma.messageTemplate.delete({
      where: { id },
    });
  },

  /**
   * Schedule a message for later delivery
   */
  async scheduleMessage({ projectId, stage, templateId, scheduledFor, recipient, recordData }) {
    const template = await prisma.messageTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    return prisma.scheduledMessage.create({
      data: {
        projectId,
        stage,
        templateId,
        scheduledFor: new Date(scheduledFor),
        status: 'PENDING',
        messageContent: this.interpolateTemplate(template.body, recordData),
        recipientPhone: recipient,
      },
    });
  },

  /**
   * Process pending scheduled messages
   */
  async processScheduledMessages() {
    const now = new Date();

    const pendingMessages = await prisma.scheduledMessage.findMany({
      where: {
        status: 'PENDING',
        scheduledFor: { lte: now },
      },
      include: {
        template: true,
      },
    });

    logger.info(`Processing ${pendingMessages.length} scheduled messages`);

    for (const scheduled of pendingMessages) {
      try {
        // Update status to sending
        await prisma.scheduledMessage.update({
          where: { id: scheduled.id },
          data: { status: 'SENDING' },
        });

        // Get project data for template interpolation
        const project = await prisma.opportunity.findUnique({
          where: { id: scheduled.projectId },
          include: {
            account: true,
            contact: true,
          },
        });

        if (!project) {
          throw new Error('Project not found');
        }

        // Determine if SMS or Email based on template type
        if (scheduled.template?.type === 'EMAIL') {
          await this.sendEmail({
            template: scheduled.template,
            record: project,
            recipient: project.contact?.email || project.account?.email,
          });
        } else {
          await this.sendSMS({
            template: scheduled.template,
            record: project,
            recipient: scheduled.recipientPhone || project.contact?.phone || project.account?.phone,
          });
        }

        // Mark as sent
        await prisma.scheduledMessage.update({
          where: { id: scheduled.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        });

      } catch (error) {
        logger.error(`Failed to send scheduled message ${scheduled.id}:`, error);

        await prisma.scheduledMessage.update({
          where: { id: scheduled.id },
          data: {
            status: 'FAILED',
            errorMessage: error.message,
          },
        });
      }
    }

    return { processed: pendingMessages.length };
  },
};

export default messagingService;
