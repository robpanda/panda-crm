/**
 * Twilio SMS Provider for Bamboogli
 * Handles sending and receiving SMS messages via Twilio
 */

import twilio from 'twilio';

// Initialize Twilio client (lazy load)
let twilioClient = null;

function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }

    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

/**
 * Send SMS message via Twilio
 * @param {Object} options
 * @param {string} options.to - Recipient phone number (E.164 format)
 * @param {string} options.body - Message text
 * @param {string[]} options.mediaUrls - Optional media URLs for MMS
 * @param {string} options.messageId - Internal message ID for status callback
 * @param {string} options.fromNumber - Optional override for sender number (for campaigns)
 * @returns {Promise<Object>} Send result with Twilio SID
 */
export async function sendSmsMessage({ to, body, mediaUrls, messageId, fromNumber: overrideFromNumber }) {
  const client = getTwilioClient();

  const defaultFromNumber = process.env.TWILIO_PHONE_NUMBER;
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

  // Use override if provided, otherwise fall back to default
  const fromNumber = overrideFromNumber || defaultFromNumber;

  if (!fromNumber && !messagingServiceSid) {
    throw new Error('Twilio phone number or messaging service SID not configured');
  }

  const messageOptions = {
    to,
    body,
    statusCallback: `${process.env.API_BASE_URL}/api/webhooks/twilio/status`,
  };

  // If override number provided, always use it (bypass messaging service)
  // Otherwise use messaging service if available, then fall back to default number
  if (overrideFromNumber) {
    messageOptions.from = overrideFromNumber;
  } else if (messagingServiceSid) {
    messageOptions.messagingServiceSid = messagingServiceSid;
  } else {
    messageOptions.from = fromNumber;
  }

  // Add media for MMS if provided
  if (mediaUrls && mediaUrls.length > 0) {
    messageOptions.mediaUrl = mediaUrls;
  }

  try {
    const message = await client.messages.create(messageOptions);

    return {
      success: true,
      twilioSid: message.sid,
      providerId: message.sid,
      providerName: 'twilio',
      status: message.status,
      to: message.to,
      from: message.from,
    };
  } catch (error) {
    console.error('Twilio send error:', error);
    throw {
      code: error.code || 'TWILIO_ERROR',
      message: error.message,
      moreInfo: error.moreInfo,
    };
  }
}

/**
 * Parse incoming Twilio webhook for SMS
 * @param {Object} body - Twilio webhook body
 * @returns {Object} Parsed message data
 */
export function parseIncomingSms(body) {
  return {
    twilioSid: body.MessageSid || body.SmsSid,
    from: body.From,
    to: body.To,
    body: body.Body || '',
    numMedia: parseInt(body.NumMedia || '0', 10),
    mediaUrls: extractMediaUrls(body),
    fromCity: body.FromCity,
    fromState: body.FromState,
    fromCountry: body.FromCountry,
    fromZip: body.FromZip,
    messagingServiceSid: body.MessagingServiceSid,
    accountSid: body.AccountSid,
  };
}

/**
 * Parse status callback from Twilio
 * @param {Object} body - Twilio status callback body
 * @returns {Object} Parsed status data
 */
export function parseStatusCallback(body) {
  return {
    twilioSid: body.MessageSid || body.SmsSid,
    status: mapTwilioStatus(body.MessageStatus || body.SmsStatus),
    errorCode: body.ErrorCode,
    errorMessage: body.ErrorMessage,
    to: body.To,
    from: body.From,
  };
}

/**
 * Map Twilio status to our MessageStatus enum
 * @param {string} twilioStatus
 * @returns {string}
 */
function mapTwilioStatus(twilioStatus) {
  const statusMap = {
    queued: 'QUEUED',
    sending: 'SENDING',
    sent: 'SENT',
    delivered: 'DELIVERED',
    undelivered: 'FAILED',
    failed: 'FAILED',
    received: 'DELIVERED',
    read: 'READ',
  };
  return statusMap[twilioStatus?.toLowerCase()] || 'UNKNOWN';
}

/**
 * Extract media URLs from Twilio webhook body
 * @param {Object} body
 * @returns {string[]}
 */
function extractMediaUrls(body) {
  const mediaUrls = [];
  const numMedia = parseInt(body.NumMedia || '0', 10);

  for (let i = 0; i < numMedia; i++) {
    const url = body[`MediaUrl${i}`];
    if (url) {
      mediaUrls.push(url);
    }
  }

  return mediaUrls;
}

/**
 * Lookup phone number information
 * @param {string} phoneNumber
 * @returns {Promise<Object>}
 */
export async function lookupPhoneNumber(phoneNumber) {
  const client = getTwilioClient();

  try {
    const lookup = await client.lookups.v2
      .phoneNumbers(phoneNumber)
      .fetch({ fields: 'line_type_intelligence,caller_name' });

    return {
      phoneNumber: lookup.phoneNumber,
      countryCode: lookup.countryCode,
      callerName: lookup.callerName?.caller_name,
      callerType: lookup.callerName?.caller_type,
      lineType: lookup.lineTypeIntelligence?.type,
      carrier: lookup.lineTypeIntelligence?.carrier_name,
      valid: lookup.valid,
    };
  } catch (error) {
    console.error('Phone lookup error:', error);
    return {
      phoneNumber,
      valid: false,
      error: error.message,
    };
  }
}

/**
 * Check if a number is opted out (Twilio's opt-out list)
 * @param {string} phoneNumber
 * @returns {Promise<boolean>}
 */
export async function checkOptOut(phoneNumber) {
  // Note: Twilio handles opt-outs automatically and will return error 21610
  // when trying to send to opted-out numbers. This is for proactive checking.
  // In production, you might maintain your own opt-out list or use Twilio's
  // messaging insights API if available on your plan.
  return false;
}

/**
 * Generate TwiML response for incoming messages
 * @param {string} message - Optional auto-response message
 * @returns {string} TwiML XML
 */
export function generateTwimlResponse(message) {
  if (message) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(message)}</Message>
</Response>`;
  }
  return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
}

/**
 * Escape XML special characters
 */
function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export default {
  sendSmsMessage,
  parseIncomingSms,
  parseStatusCallback,
  lookupPhoneNumber,
  checkOptOut,
  generateTwimlResponse,
};
