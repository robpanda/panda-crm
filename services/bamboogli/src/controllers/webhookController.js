import { PrismaClient } from '@prisma/client';
import { parseIncomingSms, parseStatusCallback, generateTwimlResponse } from '../providers/twilioProvider.js';
import { parseSendGridWebhook, parseSesNotification } from '../providers/emailProvider.js';

const prisma = new PrismaClient();

/**
 * Handle incoming SMS from Twilio
 */
export async function handleTwilioIncoming(req, res) {
  try {
    const smsData = parseIncomingSms(req.body);
    console.log('Incoming SMS:', smsData);

    // Normalize phone number
    const fromPhone = normalizePhone(smsData.from);

    // Find or create conversation
    let conversation = await prisma.conversation.findUnique({
      where: { identifier: fromPhone },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          identifier: fromPhone,
          phoneNumber: fromPhone,
          channels: ['SMS'],
          status: 'OPEN',
        },
      });
    }

    // Create the message record
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        channel: 'SMS',
        body: smsData.body,
        mediaUrls: smsData.mediaUrls,
        twilioSid: smsData.twilioSid,
        providerName: 'twilio',
        fromAddress: smsData.from,
        toAddresses: [smsData.to],
        status: 'DELIVERED',
        deliveredAt: new Date(),
      },
    });

    // Update conversation
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: smsData.body.substring(0, 100),
        lastChannel: 'SMS',
        unreadCount: { increment: 1 },
        needsAttention: true,
        attentionReason: 'New inbound message',
        status: 'OPEN', // Reopen if closed
      },
    });

    // Create Activity record for activity feed
    try {
      await prisma.activity.create({
        data: {
          type: 'SMS_RECEIVED',
          subject: `SMS from ${smsData.from}`,
          body: smsData.body,
          status: 'DELIVERED',
          sourceId: message.id,
          sourceType: 'Message',
          accountId: conversation.accountId,
          contactId: conversation.contactId,
          opportunityId: conversation.opportunityId,
          externalPhone: smsData.from,
          externalName: conversation.name,
          metadata: {
            messageId: message.id,
            conversationId: conversation.id,
            twilioSid: smsData.twilioSid,
            channel: 'SMS',
            mediaUrls: smsData.mediaUrls,
          },
          occurredAt: new Date(),
        },
      });
    } catch (activityError) {
      console.error('Failed to create activity record for inbound SMS:', activityError);
    }

    // Check for auto-response
    let autoResponse = null;
    if (conversation.autoResponseEnabled) {
      autoResponse = await generateAutoResponse(conversation, message);
    }

    // Return TwiML response
    res.set('Content-Type', 'text/xml');
    res.send(generateTwimlResponse(autoResponse));
  } catch (error) {
    console.error('Twilio incoming webhook error:', error);
    res.set('Content-Type', 'text/xml');
    res.send(generateTwimlResponse(null));
  }
}

/**
 * Handle Twilio status callback
 */
export async function handleTwilioStatus(req, res) {
  try {
    const statusData = parseStatusCallback(req.body);
    console.log('Twilio status update:', statusData);

    // Find the message by Twilio SID
    const message = await prisma.message.findUnique({
      where: { twilioSid: statusData.twilioSid },
    });

    if (message) {
      const updateData = {
        status: statusData.status,
      };

      // Add timestamps based on status
      if (statusData.status === 'DELIVERED') {
        updateData.deliveredAt = new Date();
      } else if (statusData.status === 'FAILED') {
        updateData.errorCode = statusData.errorCode;
        updateData.errorMessage = statusData.errorMessage;
      }

      await prisma.message.update({
        where: { id: message.id },
        data: updateData,
      });
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Twilio status webhook error:', error);
    res.status(200).send('OK'); // Always return 200 to Twilio
  }
}

/**
 * Handle SendGrid webhook events
 */
export async function handleSendGridWebhook(req, res) {
  try {
    // SendGrid sends an array of events
    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const event of events) {
      const eventData = parseSendGridWebhook(event);
      console.log('SendGrid event:', eventData);

      // Find message by provider ID
      const message = await prisma.message.findFirst({
        where: {
          OR: [
            { providerId: eventData.providerId },
            { emailMessageId: eventData.providerId },
          ],
        },
      });

      if (message) {
        const updateData = {
          status: eventData.status,
        };

        if (eventData.openedAt) updateData.openedAt = eventData.openedAt;
        if (eventData.clickedAt) updateData.clickedAt = eventData.clickedAt;
        if (eventData.bouncedAt) {
          updateData.bouncedAt = eventData.bouncedAt;
          updateData.bounceType = eventData.bounceType;
          updateData.bounceReason = eventData.bounceReason;
        }
        if (eventData.errorCode) updateData.errorCode = eventData.errorCode;
        if (eventData.errorMessage) updateData.errorMessage = eventData.errorMessage;

        await prisma.message.update({
          where: { id: message.id },
          data: updateData,
        });
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('SendGrid webhook error:', error);
    res.status(200).send('OK');
  }
}

/**
 * Handle AWS SES notification (via SNS)
 */
export async function handleSesWebhook(req, res) {
  try {
    // SNS sends a string that needs to be parsed
    let notification = req.body;

    // Handle SNS subscription confirmation
    if (notification.Type === 'SubscriptionConfirmation') {
      console.log('SNS subscription confirmation:', notification.SubscribeURL);
      // In production, you would confirm the subscription
      return res.status(200).send('OK');
    }

    // Handle actual notification
    if (notification.Type === 'Notification') {
      const sesEvent = JSON.parse(notification.Message);
      const eventData = parseSesNotification(sesEvent);
      console.log('SES event:', eventData);

      // Find message by provider ID
      const message = await prisma.message.findFirst({
        where: {
          OR: [
            { providerId: eventData.providerId },
            { emailMessageId: eventData.providerId },
          ],
        },
      });

      if (message) {
        const updateData = {
          status: eventData.status,
        };

        if (eventData.deliveredAt) updateData.deliveredAt = eventData.deliveredAt;
        if (eventData.bouncedAt) {
          updateData.bouncedAt = eventData.bouncedAt;
          updateData.bounceType = eventData.bounceType;
          updateData.bounceReason = eventData.bounceReason;
        }

        await prisma.message.update({
          where: { id: message.id },
          data: updateData,
        });
      }
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('SES webhook error:', error);
    res.status(200).send('OK');
  }
}

/**
 * Generate auto-response for incoming message
 * This is a placeholder - in production, integrate with AI service
 */
async function generateAutoResponse(conversation, message) {
  // Check if we've auto-responded recently (avoid spam)
  if (conversation.lastAutoResponseAt) {
    const minutesSinceLastResponse =
      (Date.now() - new Date(conversation.lastAutoResponseAt).getTime()) / 1000 / 60;

    if (minutesSinceLastResponse < 5) {
      return null; // Don't auto-respond again within 5 minutes
    }
  }

  // Check for common opt-out keywords
  const optOutKeywords = ['stop', 'unsubscribe', 'cancel', 'quit', 'end'];
  const messageBody = message.body.toLowerCase().trim();

  if (optOutKeywords.includes(messageBody)) {
    // Update conversation to disable auto-responses
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { autoResponseEnabled: false },
    });
    return 'You have been unsubscribed from automated messages. Reply HELP for assistance.';
  }

  // Check for help keyword
  if (messageBody === 'help') {
    return 'Thank you for contacting Panda Exteriors. A team member will respond shortly during business hours (Mon-Fri 8am-6pm EST). For emergencies, call (240) 801-6665.';
  }

  // Default auto-response (can be customized or use AI)
  // Update the last auto-response timestamp
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastAutoResponseAt: new Date() },
  });

  return 'Thanks for your message! A member of our team will get back to you shortly.';
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhone(phone) {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    cleaned = '1' + cleaned;
  }
  return '+' + cleaned;
}
