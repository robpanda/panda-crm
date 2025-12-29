/**
 * Email Provider for Bamboogli
 * Supports SendGrid and AWS SES
 */

import sgMail from '@sendgrid/mail';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

// Provider type from environment
const EMAIL_PROVIDER = process.env.EMAIL_PROVIDER || 'sendgrid'; // 'sendgrid' or 'ses'

// Initialize SendGrid
if (EMAIL_PROVIDER === 'sendgrid' && process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

// Initialize SES client (lazy)
let sesClient = null;
function getSesClient() {
  if (!sesClient) {
    sesClient = new SESClient({
      region: process.env.AWS_REGION || 'us-east-2',
    });
  }
  return sesClient;
}

/**
 * Send email message
 * @param {Object} options
 * @param {string|string[]} options.to - Recipient email(s)
 * @param {string} options.subject - Email subject
 * @param {string} options.body - Plain text body
 * @param {string} options.bodyHtml - HTML body (optional)
 * @param {string} options.from - From address (optional, uses default)
 * @param {string} options.fromName - From name (optional)
 * @param {string} options.replyTo - Reply-to address (optional)
 * @param {string[]} options.cc - CC addresses (optional)
 * @param {string[]} options.bcc - BCC addresses (optional)
 * @param {string} options.messageId - Internal message ID for tracking
 * @returns {Promise<Object>} Send result
 */
export async function sendEmailMessage(options) {
  const {
    to,
    subject,
    body,
    bodyHtml,
    from,
    fromName,
    replyTo,
    cc,
    bcc,
    messageId,
  } = options;

  const fromAddress = from || process.env.EMAIL_FROM_ADDRESS || 'info@pandaexteriors.com';
  const fromDisplayName = fromName || process.env.EMAIL_FROM_NAME || 'Panda Exteriors';

  if (EMAIL_PROVIDER === 'sendgrid') {
    return sendViaSendGrid({
      to,
      subject,
      body,
      bodyHtml,
      from: fromAddress,
      fromName: fromDisplayName,
      replyTo,
      cc,
      bcc,
      messageId,
    });
  } else {
    return sendViaSes({
      to,
      subject,
      body,
      bodyHtml,
      from: fromAddress,
      fromName: fromDisplayName,
      replyTo,
      cc,
      bcc,
      messageId,
    });
  }
}

/**
 * Send via SendGrid
 */
async function sendViaSendGrid(options) {
  const { to, subject, body, bodyHtml, from, fromName, replyTo, cc, bcc, messageId } = options;

  const msg = {
    to: Array.isArray(to) ? to : [to],
    from: {
      email: from,
      name: fromName,
    },
    subject,
    text: body,
    html: bodyHtml || body,
    trackingSettings: {
      clickTracking: { enable: true },
      openTracking: { enable: true },
    },
    customArgs: {
      messageId,
    },
  };

  if (replyTo) {
    msg.replyTo = replyTo;
  }

  if (cc && cc.length > 0) {
    msg.cc = cc;
  }

  if (bcc && bcc.length > 0) {
    msg.bcc = bcc;
  }

  try {
    const [response] = await sgMail.send(msg);

    return {
      success: true,
      providerId: response.headers['x-message-id'],
      providerName: 'sendgrid',
      emailMessageId: response.headers['x-message-id'],
      statusCode: response.statusCode,
    };
  } catch (error) {
    console.error('SendGrid error:', error);
    throw {
      code: error.code || 'SENDGRID_ERROR',
      message: error.message,
      response: error.response?.body,
    };
  }
}

/**
 * Send via AWS SES
 */
async function sendViaSes(options) {
  const { to, subject, body, bodyHtml, from, fromName, replyTo, cc, bcc } = options;

  const client = getSesClient();

  const toAddresses = Array.isArray(to) ? to : [to];

  const params = {
    Source: `${fromName} <${from}>`,
    Destination: {
      ToAddresses: toAddresses,
      CcAddresses: cc || [],
      BccAddresses: bcc || [],
    },
    Message: {
      Subject: {
        Data: subject,
        Charset: 'UTF-8',
      },
      Body: {
        Text: {
          Data: body,
          Charset: 'UTF-8',
        },
      },
    },
  };

  // Add HTML body if provided
  if (bodyHtml) {
    params.Message.Body.Html = {
      Data: bodyHtml,
      Charset: 'UTF-8',
    };
  }

  // Add reply-to if provided
  if (replyTo) {
    params.ReplyToAddresses = [replyTo];
  }

  try {
    const command = new SendEmailCommand(params);
    const response = await client.send(command);

    return {
      success: true,
      providerId: response.MessageId,
      providerName: 'ses',
      emailMessageId: response.MessageId,
    };
  } catch (error) {
    console.error('SES error:', error);
    throw {
      code: error.Code || 'SES_ERROR',
      message: error.message,
    };
  }
}

/**
 * Parse SendGrid webhook event
 * @param {Object} event - SendGrid event
 * @returns {Object} Parsed event data
 */
export function parseSendGridWebhook(event) {
  const eventType = event.event;

  const baseData = {
    providerId: event.sg_message_id,
    providerName: 'sendgrid',
    email: event.email,
    timestamp: new Date(event.timestamp * 1000),
    messageId: event.messageId || event.sg_event_id,
  };

  switch (eventType) {
    case 'delivered':
      return { ...baseData, status: 'DELIVERED' };

    case 'open':
      return { ...baseData, status: 'OPENED', openedAt: baseData.timestamp };

    case 'click':
      return { ...baseData, status: 'CLICKED', clickedAt: baseData.timestamp, url: event.url };

    case 'bounce':
      return {
        ...baseData,
        status: 'BOUNCED',
        bouncedAt: baseData.timestamp,
        bounceType: event.type, // 'bounce' or 'blocked'
        bounceReason: event.reason,
      };

    case 'dropped':
      return {
        ...baseData,
        status: 'FAILED',
        errorCode: 'DROPPED',
        errorMessage: event.reason,
      };

    case 'spamreport':
      return {
        ...baseData,
        status: 'SPAM_REPORTED',
      };

    case 'unsubscribe':
      return {
        ...baseData,
        status: 'UNSUBSCRIBED',
      };

    default:
      return { ...baseData, status: 'UNKNOWN', eventType };
  }
}

/**
 * Parse SES notification (SNS)
 * @param {Object} notification - SES notification via SNS
 * @returns {Object} Parsed notification data
 */
export function parseSesNotification(notification) {
  const { notificationType, mail, bounce, complaint, delivery } = notification;

  const baseData = {
    providerId: mail?.messageId,
    providerName: 'ses',
    email: mail?.destination?.[0],
    timestamp: new Date(mail?.timestamp),
  };

  switch (notificationType) {
    case 'Delivery':
      return {
        ...baseData,
        status: 'DELIVERED',
        deliveredAt: new Date(delivery?.timestamp),
      };

    case 'Bounce':
      return {
        ...baseData,
        status: 'BOUNCED',
        bouncedAt: new Date(bounce?.timestamp),
        bounceType: bounce?.bounceType,
        bounceReason: bounce?.bouncedRecipients?.[0]?.diagnosticCode,
      };

    case 'Complaint':
      return {
        ...baseData,
        status: 'SPAM_REPORTED',
        complaintType: complaint?.complaintFeedbackType,
      };

    default:
      return { ...baseData, status: 'UNKNOWN', notificationType };
  }
}

/**
 * Validate email address format
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generate plain text from HTML
 * @param {string} html
 * @returns {string}
 */
export function htmlToPlainText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default {
  sendEmailMessage,
  parseSendGridWebhook,
  parseSesNotification,
  isValidEmail,
  htmlToPlainText,
};
