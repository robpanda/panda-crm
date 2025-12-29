import { PrismaClient } from '@prisma/client';
import { sendSmsMessage } from '../providers/twilioProvider.js';
import { sendEmailMessage } from '../providers/emailProvider.js';

const prisma = new PrismaClient();

// List messages with filtering
export async function listMessages(req, res, next) {
  try {
    const {
      conversationId,
      channel,
      status,
      direction,
      contactId,
      page = 1,
      limit = 50,
    } = req.query;

    const where = {
      ...(conversationId && { conversationId }),
      ...(channel && { channel }),
      ...(status && { status }),
      ...(direction && { direction }),
      ...(contactId && { contactId }),
    };

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: {
          conversation: {
            select: { id: true, phoneNumber: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.message.count({ where }),
    ]);

    res.json({
      data: messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
}

// Get single message
export async function getMessage(req, res, next) {
  try {
    const { id } = req.params;

    const message = await prisma.message.findUnique({
      where: { id },
      include: {
        conversation: true,
        contact: {
          select: { id: true, fullName: true, email: true, mobilePhone: true },
        },
      },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(message);
  } catch (error) {
    next(error);
  }
}

// Unified send message - auto-detects channel based on conversation
export async function sendMessage(req, res, next) {
  try {
    const {
      conversationId,
      to, // Phone or email
      channel, // SMS or EMAIL (optional - auto-detect if not provided)
      body,
      bodyHtml,
      subject,
      mediaUrls,
      contactId,
      opportunityId,
      accountId,
      sentById,
    } = req.body;

    // Validate required fields
    if (!body) {
      return res.status(400).json({ error: 'Message body is required' });
    }

    if (!conversationId && !to) {
      return res.status(400).json({
        error: 'Either conversationId or to (phone/email) is required',
      });
    }

    let conversation;
    let detectedChannel = channel;

    if (conversationId) {
      conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
      });
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      // Use conversation's channel preference
      if (!detectedChannel) {
        detectedChannel = conversation.lastChannel || conversation.channels[0] || 'SMS';
      }
    } else {
      // Get or create conversation by identifier
      const isPhone = /^\+?[\d\s\-()]+$/.test(to);
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to);

      if (!isPhone && !isEmail) {
        return res.status(400).json({ error: 'Invalid phone or email format' });
      }

      const normalizedTo = isPhone
        ? normalizePhone(to)
        : to.toLowerCase().trim();

      detectedChannel = isPhone ? 'SMS' : 'EMAIL';

      conversation = await prisma.conversation.upsert({
        where: { identifier: normalizedTo },
        create: {
          identifier: normalizedTo,
          phoneNumber: isPhone ? normalizedTo : null,
          email: isEmail ? normalizedTo : null,
          channels: [detectedChannel],
          contactId,
          opportunityId,
          accountId,
        },
        update: {
          // Add channel if not already present
          channels: {
            push: detectedChannel,
          },
        },
      });
    }

    // Create the message record
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        channel: detectedChannel,
        body,
        bodyHtml: detectedChannel === 'EMAIL' ? bodyHtml : null,
        subject: detectedChannel === 'EMAIL' ? subject : null,
        mediaUrls: mediaUrls || [],
        status: 'QUEUED',
        contactId,
        sentById,
        fromAddress: detectedChannel === 'EMAIL'
          ? process.env.EMAIL_FROM_ADDRESS || 'noreply@pandaexteriors.com'
          : process.env.TWILIO_PHONE_NUMBER,
        toAddresses: detectedChannel === 'EMAIL'
          ? [conversation.email]
          : [conversation.phoneNumber],
      },
    });

    // Send via appropriate provider
    let sendResult;
    try {
      if (detectedChannel === 'SMS') {
        sendResult = await sendSmsMessage({
          to: conversation.phoneNumber,
          body,
          mediaUrls,
          messageId: message.id,
        });
      } else {
        sendResult = await sendEmailMessage({
          to: conversation.email,
          subject,
          body,
          bodyHtml,
          messageId: message.id,
        });
      }

      // Update message with provider details
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          providerId: sendResult.providerId,
          providerName: sendResult.providerName,
          twilioSid: sendResult.twilioSid,
          emailMessageId: sendResult.emailMessageId,
        },
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: body.substring(0, 100),
          lastChannel: detectedChannel,
        },
      });

      // Create Activity record for activity feed
      try {
        await prisma.activity.create({
          data: {
            type: detectedChannel === 'SMS' ? 'SMS_SENT' : 'EMAIL_SENT',
            subject: detectedChannel === 'EMAIL' ? subject : `SMS to ${conversation.phoneNumber}`,
            body: body,
            bodyHtml: detectedChannel === 'EMAIL' ? bodyHtml : null,
            status: 'SENT',
            sourceId: message.id,
            sourceType: 'Message',
            accountId: accountId || conversation.accountId,
            contactId: contactId || conversation.contactId,
            opportunityId: opportunityId || conversation.opportunityId,
            userId: sentById,
            externalPhone: detectedChannel === 'SMS' ? conversation.phoneNumber : null,
            externalEmail: detectedChannel === 'EMAIL' ? conversation.email : null,
            metadata: {
              messageId: message.id,
              conversationId: conversation.id,
              providerId: sendResult.providerId,
              channel: detectedChannel,
            },
            occurredAt: new Date(),
          },
        });
      } catch (activityError) {
        // Log but don't fail the request if activity creation fails
        console.error('Failed to create activity record:', activityError);
      }

      res.status(201).json({
        ...message,
        status: 'SENT',
        providerId: sendResult.providerId,
      });
    } catch (sendError) {
      // Update message with error - ensure errorCode is string
      await prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'FAILED',
          errorCode: String(sendError.code || 'SEND_ERROR'),
          errorMessage: sendError.message,
        },
      });

      throw sendError;
    }
  } catch (error) {
    next(error);
  }
}

// Send SMS specifically
export async function sendSms(req, res, next) {
  req.body.channel = 'SMS';
  return sendMessage(req, res, next);
}

// Send Email specifically
export async function sendEmail(req, res, next) {
  req.body.channel = 'EMAIL';
  return sendMessage(req, res, next);
}

// Reply to a message (maintains conversation thread)
export async function replyToMessage(req, res, next) {
  try {
    const { id } = req.params;
    const { body, bodyHtml, subject, mediaUrls, sentById } = req.body;

    const originalMessage = await prisma.message.findUnique({
      where: { id },
      include: { conversation: true },
    });

    if (!originalMessage) {
      return res.status(404).json({ error: 'Original message not found' });
    }

    // Use the same conversation and channel
    req.body = {
      conversationId: originalMessage.conversationId,
      channel: originalMessage.channel,
      body,
      bodyHtml,
      subject: subject || (originalMessage.subject ? `Re: ${originalMessage.subject}` : undefined),
      mediaUrls,
      sentById,
    };

    return sendMessage(req, res, next);
  } catch (error) {
    next(error);
  }
}

// Get messages by conversation
export async function getMessagesByConversation(req, res, next) {
  try {
    const { conversationId } = req.params;
    const { limit = 100, before } = req.query;

    const where = {
      conversationId,
      ...(before && { createdAt: { lt: new Date(before) } }),
    };

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: parseInt(limit),
    });

    res.json(messages);
  } catch (error) {
    next(error);
  }
}

// Get email thread
export async function getMessageThread(req, res, next) {
  try {
    const { threadId } = req.params;

    const messages = await prisma.message.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
    });

    res.json(messages);
  } catch (error) {
    next(error);
  }
}

// Retry failed message
export async function retryMessage(req, res, next) {
  try {
    const { id } = req.params;

    const message = await prisma.message.findUnique({
      where: { id },
      include: { conversation: true },
    });

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (message.status !== 'FAILED') {
      return res.status(400).json({ error: 'Only failed messages can be retried' });
    }

    // Retry sending
    let sendResult;
    try {
      if (message.channel === 'SMS') {
        sendResult = await sendSmsMessage({
          to: message.conversation.phoneNumber,
          body: message.body,
          mediaUrls: message.mediaUrls,
          messageId: message.id,
        });
      } else {
        sendResult = await sendEmailMessage({
          to: message.toAddresses[0],
          subject: message.subject,
          body: message.body,
          bodyHtml: message.bodyHtml,
          messageId: message.id,
        });
      }

      const updatedMessage = await prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          providerId: sendResult.providerId,
          providerName: sendResult.providerName,
          twilioSid: sendResult.twilioSid,
          emailMessageId: sendResult.emailMessageId,
          errorCode: null,
          errorMessage: null,
        },
      });

      res.json(updatedMessage);
    } catch (sendError) {
      await prisma.message.update({
        where: { id: message.id },
        data: {
          errorMessage: sendError.message,
        },
      });
      throw sendError;
    }
  } catch (error) {
    next(error);
  }
}

// Delete message (soft delete by marking status)
export async function deleteMessage(req, res, next) {
  try {
    const { id } = req.params;

    await prisma.message.update({
      where: { id },
      data: { status: 'DELETED' },
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

// Helper: Normalize phone number
function normalizePhone(phone) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    cleaned = '1' + cleaned;
  }
  return '+' + cleaned;
}
