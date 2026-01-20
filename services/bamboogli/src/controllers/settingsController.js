import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper to convert BigInt to Number for JSON serialization
const serializeBigInt = (obj) => {
  return JSON.parse(JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? Number(value) : value
  ));
};

// Settings keys for Bamboogli
const SETTING_KEYS = {
  TWILIO_ENABLED: 'bamboogli.twilio.enabled',
  TWILIO_ACCOUNT_SID: 'bamboogli.twilio.accountSid',
  TWILIO_AUTH_TOKEN: 'bamboogli.twilio.authToken',
  TWILIO_PHONE_NUMBER: 'bamboogli.twilio.phoneNumber',
  TWILIO_MESSAGING_SERVICE_SID: 'bamboogli.twilio.messagingServiceSid',
  SENDGRID_ENABLED: 'bamboogli.sendgrid.enabled',
  SENDGRID_API_KEY: 'bamboogli.sendgrid.apiKey',
  SENDGRID_FROM_EMAIL: 'bamboogli.sendgrid.fromEmail',
  SENDGRID_FROM_NAME: 'bamboogli.sendgrid.fromName',
  AUTO_RESPONSE_ENABLED: 'bamboogli.autoResponse.enabled',
  AUTO_RESPONSE_MESSAGE: 'bamboogli.autoResponse.message',
  AUTO_RESPONSE_DELAY: 'bamboogli.autoResponse.delayMinutes',
  REFERRAL_RECEIVED_AUTO_REPLY: 'bamboogli.autoResponse.referralReceivedReply',
  REFERRAL_RECEIVED_MESSAGE: 'bamboogli.autoResponse.referralReceivedMessage',
  BUSINESS_HOURS_ENABLED: 'bamboogli.businessHours.enabled',
  BUSINESS_HOURS_START: 'bamboogli.businessHours.start',
  BUSINESS_HOURS_END: 'bamboogli.businessHours.end',
  BUSINESS_HOURS_TIMEZONE: 'bamboogli.businessHours.timezone',
  AFTER_HOURS_MESSAGE: 'bamboogli.businessHours.afterHoursMessage',
};

// Get all Bamboogli settings
export async function getSettings(req, res, next) {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          startsWith: 'bamboogli.',
        },
      },
    });

    // Convert to object format
    const settingsMap = {};
    settings.forEach((setting) => {
      // Remove 'bamboogli.' prefix and convert to nested object
      const keyPath = setting.key.replace('bamboogli.', '').split('.');
      let current = settingsMap;
      for (let i = 0; i < keyPath.length - 1; i++) {
        if (!current[keyPath[i]]) {
          current[keyPath[i]] = {};
        }
        current = current[keyPath[i]];
      }
      // Parse boolean and number values
      let value = setting.value;
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!isNaN(value) && value !== '') value = Number(value);
      current[keyPath[keyPath.length - 1]] = value;
    });

    // Return with defaults if not set
    res.json({
      twilio: {
        enabled: settingsMap.twilio?.enabled ?? false,
        accountSid: settingsMap.twilio?.accountSid ?? '',
        authToken: settingsMap.twilio?.authToken ? '••••••••' : '', // Mask sensitive data
        phoneNumber: settingsMap.twilio?.phoneNumber ?? '',
        messagingServiceSid: settingsMap.twilio?.messagingServiceSid ?? '',
      },
      sendgrid: {
        enabled: settingsMap.sendgrid?.enabled ?? false,
        apiKey: settingsMap.sendgrid?.apiKey ? '••••••••' : '', // Mask sensitive data
        fromEmail: settingsMap.sendgrid?.fromEmail ?? '',
        fromName: settingsMap.sendgrid?.fromName ?? '',
      },
      autoResponse: {
        enabled: settingsMap.autoResponse?.enabled ?? false,
        message: settingsMap.autoResponse?.message ?? '',
        delayMinutes: settingsMap.autoResponse?.delayMinutes ?? 5,
        referralReceivedReply: settingsMap.autoResponse?.referralReceivedReply ?? true,
        referralReceivedMessage: settingsMap.autoResponse?.referralReceivedMessage ?? 'Received!',
      },
      businessHours: {
        enabled: settingsMap.businessHours?.enabled ?? false,
        start: settingsMap.businessHours?.start ?? '09:00',
        end: settingsMap.businessHours?.end ?? '17:00',
        timezone: settingsMap.businessHours?.timezone ?? 'America/New_York',
        afterHoursMessage: settingsMap.businessHours?.afterHoursMessage ?? '',
      },
    });
  } catch (error) {
    next(error);
  }
}

// Update settings
export async function updateSettings(req, res, next) {
  try {
    const { twilio, sendgrid, autoResponse, businessHours } = req.body;
    const updates = [];

    // Helper to add setting update
    const addUpdate = (key, value) => {
      if (value !== undefined && value !== '••••••••') {
        updates.push({
          key,
          value: String(value),
          category: 'bamboogli',
          updatedById: req.user?.id,
        });
      }
    };

    // Twilio settings
    if (twilio) {
      addUpdate(SETTING_KEYS.TWILIO_ENABLED, twilio.enabled);
      addUpdate(SETTING_KEYS.TWILIO_ACCOUNT_SID, twilio.accountSid);
      if (twilio.authToken && twilio.authToken !== '••••••••') {
        addUpdate(SETTING_KEYS.TWILIO_AUTH_TOKEN, twilio.authToken);
      }
      addUpdate(SETTING_KEYS.TWILIO_PHONE_NUMBER, twilio.phoneNumber);
      addUpdate(SETTING_KEYS.TWILIO_MESSAGING_SERVICE_SID, twilio.messagingServiceSid);
    }

    // SendGrid settings
    if (sendgrid) {
      addUpdate(SETTING_KEYS.SENDGRID_ENABLED, sendgrid.enabled);
      if (sendgrid.apiKey && sendgrid.apiKey !== '••••••••') {
        addUpdate(SETTING_KEYS.SENDGRID_API_KEY, sendgrid.apiKey);
      }
      addUpdate(SETTING_KEYS.SENDGRID_FROM_EMAIL, sendgrid.fromEmail);
      addUpdate(SETTING_KEYS.SENDGRID_FROM_NAME, sendgrid.fromName);
    }

    // Auto-response settings
    if (autoResponse) {
      addUpdate(SETTING_KEYS.AUTO_RESPONSE_ENABLED, autoResponse.enabled);
      addUpdate(SETTING_KEYS.AUTO_RESPONSE_MESSAGE, autoResponse.message);
      addUpdate(SETTING_KEYS.AUTO_RESPONSE_DELAY, autoResponse.delayMinutes);
      addUpdate(SETTING_KEYS.REFERRAL_RECEIVED_AUTO_REPLY, autoResponse.referralReceivedReply);
      addUpdate(SETTING_KEYS.REFERRAL_RECEIVED_MESSAGE, autoResponse.referralReceivedMessage);
    }

    // Business hours settings
    if (businessHours) {
      addUpdate(SETTING_KEYS.BUSINESS_HOURS_ENABLED, businessHours.enabled);
      addUpdate(SETTING_KEYS.BUSINESS_HOURS_START, businessHours.start);
      addUpdate(SETTING_KEYS.BUSINESS_HOURS_END, businessHours.end);
      addUpdate(SETTING_KEYS.BUSINESS_HOURS_TIMEZONE, businessHours.timezone);
      addUpdate(SETTING_KEYS.AFTER_HOURS_MESSAGE, businessHours.afterHoursMessage);
    }

    // Upsert all settings
    for (const update of updates) {
      await prisma.systemSetting.upsert({
        where: { key: update.key },
        update: {
          value: update.value,
          updatedById: update.updatedById,
        },
        create: update,
      });
    }

    res.json({ success: true, message: 'Settings updated successfully' });
  } catch (error) {
    next(error);
  }
}

// Get channel connection status
export async function getChannelStatus(req, res, next) {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          startsWith: 'bamboogli.',
        },
      },
    });

    const settingsMap = {};
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    const twilioEnabled = settingsMap[SETTING_KEYS.TWILIO_ENABLED] === 'true';
    const sendgridEnabled = settingsMap[SETTING_KEYS.SENDGRID_ENABLED] === 'true';

    let twilioStatus = { connected: false, error: null };
    let sendgridStatus = { connected: false, error: null };

    // Check Twilio connection
    if (twilioEnabled && settingsMap[SETTING_KEYS.TWILIO_ACCOUNT_SID]) {
      try {
        const accountSid = settingsMap[SETTING_KEYS.TWILIO_ACCOUNT_SID];
        const authToken = settingsMap[SETTING_KEYS.TWILIO_AUTH_TOKEN];

        if (accountSid && authToken) {
          // Dynamic import for twilio
          const twilio = (await import('twilio')).default;
          const client = twilio(accountSid, authToken);
          const account = await client.api.accounts(accountSid).fetch();
          twilioStatus = {
            connected: true,
            accountName: account.friendlyName,
            status: account.status,
          };
        }
      } catch (error) {
        twilioStatus = {
          connected: false,
          error: error.message,
        };
      }
    }

    // Check SendGrid connection
    if (sendgridEnabled && settingsMap[SETTING_KEYS.SENDGRID_API_KEY]) {
      try {
        const apiKey = settingsMap[SETTING_KEYS.SENDGRID_API_KEY];

        if (apiKey) {
          // Make a simple API call to verify the key
          const response = await fetch('https://api.sendgrid.com/v3/user/profile', {
            headers: {
              Authorization: `Bearer ${apiKey}`,
            },
          });

          if (response.ok) {
            const profile = await response.json();
            sendgridStatus = {
              connected: true,
              email: profile.email,
            };
          } else {
            sendgridStatus = {
              connected: false,
              error: 'Invalid API key',
            };
          }
        }
      } catch (error) {
        sendgridStatus = {
          connected: false,
          error: error.message,
        };
      }
    }

    res.json({
      twilio: {
        enabled: twilioEnabled,
        ...twilioStatus,
      },
      sendgrid: {
        enabled: sendgridEnabled,
        ...sendgridStatus,
      },
    });
  } catch (error) {
    next(error);
  }
}

// Get message statistics
export async function getMessageStats(req, res, next) {
  try {
    const { period = '30d' } = req.query;

    // Calculate date range
    let days = 30;
    if (period.endsWith('d')) {
      days = parseInt(period.slice(0, -1), 10);
    } else if (period.endsWith('w')) {
      days = parseInt(period.slice(0, -1), 10) * 7;
    } else if (period.endsWith('m')) {
      days = parseInt(period.slice(0, -1), 10) * 30;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get message counts
    const [
      totalMessages,
      smsSent,
      smsReceived,
      emailsSent,
      emailsReceived,
      failedMessages,
      conversations,
      activeConversations,
    ] = await Promise.all([
      prisma.message.count({
        where: { createdAt: { gte: startDate } },
      }),
      prisma.message.count({
        where: {
          createdAt: { gte: startDate },
          channel: 'SMS',
          direction: 'OUTBOUND',
        },
      }),
      prisma.message.count({
        where: {
          createdAt: { gte: startDate },
          channel: 'SMS',
          direction: 'INBOUND',
        },
      }),
      prisma.message.count({
        where: {
          createdAt: { gte: startDate },
          channel: 'EMAIL',
          direction: 'OUTBOUND',
        },
      }),
      prisma.message.count({
        where: {
          createdAt: { gte: startDate },
          channel: 'EMAIL',
          direction: 'INBOUND',
        },
      }),
      prisma.message.count({
        where: {
          createdAt: { gte: startDate },
          status: 'FAILED',
        },
      }),
      prisma.conversation.count({
        where: { createdAt: { gte: startDate } },
      }),
      prisma.conversation.count({
        where: {
          status: 'OPEN',
          lastMessageAt: { gte: startDate },
        },
      }),
    ]);

    // Get daily breakdown for chart
    const dailyStats = await prisma.$queryRaw`
      SELECT
        DATE(created_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN channel = 'SMS' THEN 1 ELSE 0 END) as sms,
        SUM(CASE WHEN channel = 'EMAIL' THEN 1 ELSE 0 END) as email
      FROM messages
      WHERE created_at >= ${startDate}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    res.json({
      period,
      summary: {
        totalMessages,
        sms: {
          sent: smsSent,
          received: smsReceived,
          total: smsSent + smsReceived,
        },
        email: {
          sent: emailsSent,
          received: emailsReceived,
          total: emailsSent + emailsReceived,
        },
        failedMessages,
        failureRate: totalMessages > 0 ? ((failedMessages / totalMessages) * 100).toFixed(2) : 0,
        conversations,
        activeConversations,
      },
      daily: serializeBigInt(dailyStats),
    });
  } catch (error) {
    next(error);
  }
}

// Test SMS connection by sending a test message
export async function testSmsConnection(req, res, next) {
  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          startsWith: 'bamboogli.twilio.',
        },
      },
    });

    const settingsMap = {};
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    const accountSid = settingsMap[SETTING_KEYS.TWILIO_ACCOUNT_SID];
    const authToken = settingsMap[SETTING_KEYS.TWILIO_AUTH_TOKEN];
    const fromNumber = settingsMap[SETTING_KEYS.TWILIO_PHONE_NUMBER];
    const messagingServiceSid = settingsMap[SETTING_KEYS.TWILIO_MESSAGING_SERVICE_SID];

    if (!accountSid || !authToken) {
      return res.status(400).json({ error: 'Twilio credentials not configured' });
    }

    if (!fromNumber && !messagingServiceSid) {
      return res.status(400).json({ error: 'Twilio phone number or messaging service SID not configured' });
    }

    const twilio = (await import('twilio')).default;
    const client = twilio(accountSid, authToken);

    const messageOptions = {
      to: phoneNumber,
      body: 'This is a test message from Panda CRM Bamboogli. If you received this, SMS is working correctly!',
    };

    if (messagingServiceSid) {
      messageOptions.messagingServiceSid = messagingServiceSid;
    } else {
      messageOptions.from = fromNumber;
    }

    const message = await client.messages.create(messageOptions);

    res.json({
      success: true,
      message: 'Test SMS sent successfully',
      sid: message.sid,
      status: message.status,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}

// ===== Phone Number Management =====

// Get all connected Twilio phone numbers
export async function getPhoneNumbers(req, res, next) {
  try {
    const phoneNumbers = await prisma.twilioPhoneNumber.findMany({
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      success: true,
      data: phoneNumbers,
    });
  } catch (error) {
    next(error);
  }
}

// Get a single phone number by ID
export async function getPhoneNumber(req, res, next) {
  try {
    const { id } = req.params;

    const phoneNumber = await prisma.twilioPhoneNumber.findUnique({
      where: { id },
    });

    if (!phoneNumber) {
      return res.status(404).json({
        success: false,
        error: 'Phone number not found',
      });
    }

    res.json({
      success: true,
      data: phoneNumber,
    });
  } catch (error) {
    next(error);
  }
}

// Update phone number settings (auto-reply, etc.)
export async function updatePhoneNumber(req, res, next) {
  try {
    const { id } = req.params;
    const {
      friendlyName,
      purpose,
      isActive,
      autoReplyEnabled,
      autoReplyMessage,
      referralAutoReply,
      referralReplyMessage,
    } = req.body;

    // Build update data (only include provided fields)
    const updateData = {};
    if (friendlyName !== undefined) updateData.friendlyName = friendlyName;
    if (purpose !== undefined) updateData.purpose = purpose;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (autoReplyEnabled !== undefined) updateData.autoReplyEnabled = autoReplyEnabled;
    if (autoReplyMessage !== undefined) updateData.autoReplyMessage = autoReplyMessage;
    if (referralAutoReply !== undefined) updateData.referralAutoReply = referralAutoReply;
    if (referralReplyMessage !== undefined) updateData.referralReplyMessage = referralReplyMessage;

    const phoneNumber = await prisma.twilioPhoneNumber.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      data: phoneNumber,
      message: 'Phone number settings updated successfully',
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'Phone number not found',
      });
    }
    next(error);
  }
}

// Add a new phone number (manual or from Twilio sync)
export async function addPhoneNumber(req, res, next) {
  try {
    const {
      phoneNumber,
      friendlyName,
      purpose,
      twilioSid,
      autoReplyEnabled = false,
      autoReplyMessage,
      referralAutoReply = true,
      referralReplyMessage = 'Received!',
    } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required',
      });
    }

    // Normalize phone number to E.164 format
    let normalizedNumber = phoneNumber.replace(/\D/g, '');
    if (normalizedNumber.length === 10) {
      normalizedNumber = `+1${normalizedNumber}`;
    } else if (!normalizedNumber.startsWith('+')) {
      normalizedNumber = `+${normalizedNumber}`;
    }

    const newPhoneNumber = await prisma.twilioPhoneNumber.create({
      data: {
        phoneNumber: normalizedNumber,
        friendlyName,
        purpose,
        twilioSid,
        autoReplyEnabled,
        autoReplyMessage,
        referralAutoReply,
        referralReplyMessage,
      },
    });

    res.status(201).json({
      success: true,
      data: newPhoneNumber,
      message: 'Phone number added successfully',
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        error: 'Phone number already exists',
      });
    }
    next(error);
  }
}

// Delete a phone number
export async function deletePhoneNumber(req, res, next) {
  try {
    const { id } = req.params;

    await prisma.twilioPhoneNumber.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Phone number deleted successfully',
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        error: 'Phone number not found',
      });
    }
    next(error);
  }
}

// Get phone number settings by phone number (for webhook lookups)
export async function getPhoneNumberByNumber(phoneNumber) {
  try {
    // Normalize phone number to E.164 format
    let normalizedNumber = phoneNumber.replace(/\D/g, '');
    if (normalizedNumber.length === 10) {
      normalizedNumber = `+1${normalizedNumber}`;
    } else if (normalizedNumber.length === 11 && normalizedNumber.startsWith('1')) {
      normalizedNumber = `+${normalizedNumber}`;
    } else if (!normalizedNumber.startsWith('+')) {
      normalizedNumber = `+${normalizedNumber}`;
    }

    const phoneConfig = await prisma.twilioPhoneNumber.findUnique({
      where: { phoneNumber: normalizedNumber },
    });

    return phoneConfig;
  } catch (error) {
    console.error('Error fetching phone number config:', error);
    return null;
  }
}

// Test email connection by sending a test email
export async function testEmailConnection(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email address is required' });
    }

    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          startsWith: 'bamboogli.sendgrid.',
        },
      },
    });

    const settingsMap = {};
    settings.forEach((s) => {
      settingsMap[s.key] = s.value;
    });

    const apiKey = settingsMap[SETTING_KEYS.SENDGRID_API_KEY];
    const fromEmail = settingsMap[SETTING_KEYS.SENDGRID_FROM_EMAIL];
    const fromName = settingsMap[SETTING_KEYS.SENDGRID_FROM_NAME] || 'Panda CRM';

    if (!apiKey) {
      return res.status(400).json({ error: 'SendGrid API key not configured' });
    }

    if (!fromEmail) {
      return res.status(400).json({ error: 'From email address not configured' });
    }

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email }] }],
        from: { email: fromEmail, name: fromName },
        subject: 'Panda CRM Bamboogli - Test Email',
        content: [
          {
            type: 'text/html',
            value: `
              <h2>Test Email from Panda CRM</h2>
              <p>This is a test email from Bamboogli messaging service.</p>
              <p>If you received this, email is working correctly!</p>
              <br/>
              <p>- Panda CRM Team</p>
            `,
          },
        ],
      }),
    });

    if (response.ok || response.status === 202) {
      res.json({
        success: true,
        message: 'Test email sent successfully',
      });
    } else {
      const error = await response.text();
      res.status(400).json({
        success: false,
        error: error || 'Failed to send test email',
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
}
