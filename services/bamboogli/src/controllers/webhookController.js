import { PrismaClient } from '@prisma/client';
import { parseIncomingSms, parseStatusCallback, generateTwimlResponse } from '../providers/twilioProvider.js';
import { parseSendGridWebhook, parseSesNotification } from '../providers/emailProvider.js';
import {
  isLikelyReferral,
  parseReferralMessage,
  findChampionByContact,
  findContactByPhone,
  createReferralFromMessage,
} from '../services/referralParserService.js';

const prisma = new PrismaClient();

/**
 * Handle incoming SMS from Twilio
 */
export async function handleTwilioIncoming(req, res) {
  try {
    // Debug logging for webhook payload
    console.log('=== Twilio Webhook Debug ===');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Request body type:', typeof req.body);
    console.log('Request body keys:', Object.keys(req.body || {}));
    console.log('Raw body (first 500):', JSON.stringify(req.body).substring(0, 500));

    // Handle case where body might be empty or malformed
    if (!req.body || Object.keys(req.body).length === 0) {
      console.error('Empty request body received from Twilio webhook');
      res.set('Content-Type', 'text/xml');
      return res.send(generateTwimlResponse(null));
    }

    const smsData = parseIncomingSms(req.body);
    console.log('Parsed Incoming SMS:', smsData);

    // Validate required fields
    if (!smsData.from) {
      console.error('Missing "From" field in Twilio webhook. Body:', req.body);
      res.set('Content-Type', 'text/xml');
      return res.send(generateTwimlResponse(null));
    }

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

    // Find the last outbound message to determine who to route the reply to
    // This ensures customer replies go back to the same person who messaged them
    let assignToUserId = conversation.assignedToId;
    const lastOutboundMessage = await prisma.message.findFirst({
      where: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        sentById: { not: null },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (lastOutboundMessage?.sentById) {
      assignToUserId = lastOutboundMessage.sentById;
      console.log(`Routing reply to last sender: ${assignToUserId}`);
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
        // Thread the reply: reference the last outbound message for threading
        inReplyTo: lastOutboundMessage?.twilioSid || null,
      },
    });

    // Update conversation with assignment (route to last sender)
    const conversationUpdate = {
      lastMessageAt: new Date(),
      lastMessagePreview: smsData.body.substring(0, 100),
      lastChannel: 'SMS',
      unreadCount: { increment: 1 },
      needsAttention: true,
      attentionReason: 'New inbound message',
      status: 'OPEN', // Reopen if closed
    };

    // If we found a sender to route to, update the assignment
    if (assignToUserId && assignToUserId !== conversation.assignedToId) {
      conversationUpdate.assignedToId = assignToUserId;
      console.log(`Reassigning conversation ${conversation.id} to user ${assignToUserId}`);
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: conversationUpdate,
    });

    // Create AttentionItem for Attention Queue - this makes the SMS appear in the main attention area
    try {
      // Check if there's already a pending attention item for this conversation
      const existingAttention = await prisma.attentionItem.findFirst({
        where: {
          conversationId: conversation.id,
          status: 'PENDING',
          type: 'UNREAD_MESSAGE',
        },
      });

      if (!existingAttention) {
        // Create new attention item
        await prisma.attentionItem.create({
          data: {
            title: `New SMS from ${conversation.name || smsData.from}`,
            description: smsData.body.substring(0, 200),
            type: 'UNREAD_MESSAGE',
            category: 'COMMUNICATION',
            priority: 'NORMAL',
            urgency: 'MEDIUM',
            status: 'PENDING',
            sourceType: 'CONVERSATION',
            sourceId: conversation.id,
            conversationId: conversation.id,
            assignedToId: assignToUserId,
            accountId: conversation.accountId,
            contactId: conversation.contactId,
            opportunityId: conversation.opportunityId,
            leadId: conversation.leadId,
            actionType: 'RESPOND_TO_MESSAGE',
            sourceData: {
              messageId: message.id,
              channel: 'SMS',
              fromPhone: smsData.from,
              preview: smsData.body.substring(0, 100),
            },
          },
        });
        console.log(`Created AttentionItem for inbound SMS from ${smsData.from}`);
      } else {
        // Update existing attention item with latest message info
        await prisma.attentionItem.update({
          where: { id: existingAttention.id },
          data: {
            description: smsData.body.substring(0, 200),
            updatedAt: new Date(),
            sourceData: {
              ...(existingAttention.sourceData || {}),
              latestMessageId: message.id,
              latestPreview: smsData.body.substring(0, 100),
              unreadCount: (conversation.unreadCount || 0) + 1,
            },
          },
        });
        console.log(`Updated existing AttentionItem for conversation ${conversation.id}`);
      }
    } catch (attentionError) {
      console.error('Failed to create/update AttentionItem for inbound SMS:', attentionError);
      // Don't fail the webhook if attention item creation fails
    }

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
          userId: assignToUserId, // Assign activity to the user who should see it
          externalPhone: smsData.from,
          externalName: conversation.name,
          metadata: {
            messageId: message.id,
            conversationId: conversation.id,
            twilioSid: smsData.twilioSid,
            channel: 'SMS',
            mediaUrls: smsData.mediaUrls,
            inReplyToMessageId: lastOutboundMessage?.id,
          },
          occurredAt: new Date(),
        },
      });
    } catch (activityError) {
      console.error('Failed to create activity record for inbound SMS:', activityError);
    }

    // Check if this SMS looks like a referral submission
    // (e.g., "John Smith, 555-123-4567, 123 Main St, Baltimore MD 21201")
    try {
      if (isLikelyReferral(smsData.body)) {
        console.log('Detected likely referral in SMS from:', fromPhone);

        // Find the Champion (referrer) by their phone number
        const champion = await findChampionByContact(fromPhone);

        if (champion) {
          console.log('Found champion:', champion.id, champion.email);

          // Parse the referral message
          const parsedData = parseReferralMessage(smsData.body);

          if (parsedData && parsedData.phone) {
            console.log('Parsed referral data:', parsedData);

            // Create the Lead and ChampionReferral records
            const result = await createReferralFromMessage({
              parsedData,
              championId: champion.id,
              senderPhone: fromPhone,
              senderEmail: null,
              channel: 'SMS',
              messageId: message.id,
              conversationId: conversation.id,
            });

            console.log('Created referral:', {
              referralId: result.referral.id,
              leadId: result.lead?.id,
              isDuplicate: result.isDuplicate,
              parseConfidence: result.parseConfidence,
            });

            // Check if referral auto-reply is enabled before sending confirmation
            // Pass the "To" number (Twilio number that received the SMS) to use per-number settings
            const autoReplyEnabled = await isReferralAutoReplyEnabled(smsData.to);
            if (autoReplyEnabled) {
              const autoReplyMessage = await getReferralAutoReplyMessage(smsData.to);
              res.set('Content-Type', 'text/xml');
              return res.send(generateTwimlResponse(autoReplyMessage));
            } else {
              console.log('Referral auto-reply disabled - not sending confirmation');
              res.set('Content-Type', 'text/xml');
              return res.send(generateTwimlResponse(null));
            }
          } else {
            console.log('Could not parse referral data from message');
          }
        } else {
          // Champion not found by phone - check if sender is a Contact and auto-create Champion
          const contact = await findContactByPhone(fromPhone);
          if (contact) {
            console.log('Referral from Contact (not Champion):', contact.id, '- auto-creating Champion record');

            // Auto-create a Champion record for this contact so they can submit referrals
            // Tag with AUTO_CREATED prefix in referral code and status_reason so we can identify them later
            // for formal invitation when the new app launches
            const newChampion = await prisma.champion.create({
              data: {
                email: contact.email || `contact-${contact.id}@referral.pandaexteriors.com`,
                firstName: contact.firstName || 'Unknown',
                lastName: contact.lastName || '',
                phone: fromPhone,
                referralCode: `AUTO-${Date.now().toString(36).toUpperCase()}`,
                status: 'APPROVED',
                status_reason: 'AUTO_CREATED: From SMS campaign referral reply. Needs formal app invitation.',
                status_changed_at: new Date(),
                bio: 'Auto-created champion from SMS campaign reply. Pending formal invitation to Champions app.',
              },
            });
            console.log('Created new Champion record:', newChampion.id);

            // Now process the referral with the new champion
            const parsedData = parseReferralMessage(smsData.body);

            if (parsedData && parsedData.phone) {
              console.log('Parsed referral data from new champion:', parsedData);

              const result = await createReferralFromMessage({
                parsedData,
                championId: newChampion.id,
                senderPhone: fromPhone,
                senderEmail: null,
                channel: 'SMS',
                messageId: message.id,
                conversationId: conversation.id,
              });

              console.log('Created referral from new champion:', {
                referralId: result.referral.id,
                leadId: result.lead?.id,
                isDuplicate: result.isDuplicate,
                parseConfidence: result.parseConfidence,
              });

              // Send confirmation auto-reply
              const autoReplyEnabled = await isReferralAutoReplyEnabled(smsData.to);
              if (autoReplyEnabled) {
                const autoReplyMessage = await getReferralAutoReplyMessage(smsData.to);
                res.set('Content-Type', 'text/xml');
                return res.send(generateTwimlResponse(autoReplyMessage));
              } else {
                console.log('Referral auto-reply disabled - not sending confirmation');
                res.set('Content-Type', 'text/xml');
                return res.send(generateTwimlResponse(null));
              }
            } else {
              console.log('Could not parse referral data from new champion message');
            }
          } else {
            // Neither Champion nor Contact found - create lead directly without champion attribution
            console.log('Referral sender not found in Champions or Contacts - creating lead without champion');

            const parsedData = parseReferralMessage(smsData.body);

            if (parsedData && parsedData.phone) {
              console.log('Parsed referral data from unknown sender:', parsedData);

              // Create the lead directly without champion attribution
              const lead = await prisma.lead.create({
                data: {
                  firstName: parsedData.firstName || 'Unknown',
                  lastName: parsedData.lastName || '',
                  phone: parsedData.phone,
                  street: parsedData.street,
                  city: parsedData.city,
                  state: parsedData.state,
                  postalCode: parsedData.zipCode,
                  source: 'SMS Campaign Referral',
                  status: 'NEW',
                  description: `Referral submitted via SMS from unknown sender (${fromPhone}). Original message: "${parsedData.rawMessage?.substring(0, 500) || smsData.body}"`,
                  leadNotes: `SMS Referral - Parse Confidence: ${parsedData.parseConfidence}%`,
                },
              });

              console.log('Created lead from unknown sender:', lead.id);

              // Send confirmation auto-reply
              const autoReplyEnabled = await isReferralAutoReplyEnabled(smsData.to);
              if (autoReplyEnabled) {
                const autoReplyMessage = await getReferralAutoReplyMessage(smsData.to);
                res.set('Content-Type', 'text/xml');
                return res.send(generateTwimlResponse(autoReplyMessage));
              } else {
                res.set('Content-Type', 'text/xml');
                return res.send(generateTwimlResponse(null));
              }
            } else {
              console.log('Could not parse referral data from unknown sender message');
            }
          }
        }
      }
    } catch (referralError) {
      // Don't fail the webhook if referral processing fails
      console.error('Error processing referral from SMS:', referralError);
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

    // First, try to find a CampaignSend by the Twilio SID (stored as externalId)
    const campaignSend = await prisma.campaignSend.findFirst({
      where: { externalId: statusData.twilioSid },
    });

    if (campaignSend) {
      console.log('Found CampaignSend for Twilio status:', campaignSend.id, 'status:', statusData.status);

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

      await prisma.campaignSend.update({
        where: { id: campaignSend.id },
        data: updateData,
      });

      res.status(200).send('OK');
      return;
    }

    // Fallback: Find in Message table for non-campaign SMS
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

      // First, try to find a CampaignSend by the messageId from customArgs
      // The messageId is passed to SendGrid and returned in webhooks
      const campaignSendId = event.messageId; // This comes from customArgs.messageId we set when sending

      if (campaignSendId) {
        const campaignSend = await prisma.campaignSend.findUnique({
          where: { id: campaignSendId },
        });

        if (campaignSend) {
          console.log('Found CampaignSend for webhook:', campaignSendId, 'status:', eventData.status);

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

          await prisma.campaignSend.update({
            where: { id: campaignSendId },
            data: updateData,
          });
          continue; // Move to next event
        }
      }

      // Also try finding by externalId (the sg_message_id we store after sending)
      if (eventData.providerId) {
        const campaignSendByExternal = await prisma.campaignSend.findFirst({
          where: { externalId: eventData.providerId },
        });

        if (campaignSendByExternal) {
          console.log('Found CampaignSend by externalId:', campaignSendByExternal.id, 'status:', eventData.status);

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

          await prisma.campaignSend.update({
            where: { id: campaignSendByExternal.id },
            data: updateData,
          });
          continue; // Move to next event
        }
      }

      // Fallback: Find in Message table for non-campaign emails
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
 * Handle SendGrid Inbound Parse webhook (for email replies)
 * This receives actual inbound emails, not just status updates
 */
export async function handleSendGridInbound(req, res) {
  try {
    // SendGrid Inbound Parse sends form data
    const {
      from,
      to,
      subject,
      text,
      html,
      sender_ip,
      envelope,
      headers,
    } = req.body;

    console.log('Inbound email received:', { from, to, subject });

    // Extract email address from "Name <email@domain.com>" format
    const fromMatch = from.match(/<([^>]+)>/) || [null, from];
    const fromEmail = fromMatch[1]?.toLowerCase()?.trim() || from.toLowerCase().trim();

    // Get plain text body (prefer text over html)
    const bodyText = text || (html ? html.replace(/<[^>]*>/g, ' ').trim() : '');

    // Find or create conversation by email
    let conversation = await prisma.conversation.findFirst({
      where: {
        OR: [
          { email: fromEmail },
          { identifier: fromEmail },
        ],
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          identifier: fromEmail,
          email: fromEmail,
          channels: ['EMAIL'],
          status: 'OPEN',
        },
      });
    }

    // Create the message record
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'INBOUND',
        channel: 'EMAIL',
        subject: subject,
        body: bodyText,
        providerName: 'sendgrid',
        fromAddress: fromEmail,
        toAddresses: Array.isArray(to) ? to : [to],
        status: 'DELIVERED',
        deliveredAt: new Date(),
        metadata: {
          sender_ip,
          headers: typeof headers === 'string' ? JSON.parse(headers) : headers,
        },
      },
    });

    // Update conversation
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: subject || bodyText.substring(0, 100),
        lastChannel: 'EMAIL',
        unreadCount: { increment: 1 },
        needsAttention: true,
        attentionReason: 'New inbound email',
        status: 'OPEN',
      },
    });

    // Create AttentionItem for Attention Queue - this makes the email appear in the main attention area
    try {
      // Check if there's already a pending attention item for this conversation
      const existingAttention = await prisma.attentionItem.findFirst({
        where: {
          conversationId: conversation.id,
          status: 'PENDING',
          type: 'UNREAD_MESSAGE',
        },
      });

      const senderName = from.replace(/<[^>]+>/, '').trim();

      if (!existingAttention) {
        // Create new attention item
        await prisma.attentionItem.create({
          data: {
            title: `New email from ${senderName || fromEmail}`,
            description: subject || bodyText.substring(0, 200),
            type: 'UNREAD_MESSAGE',
            category: 'COMMUNICATION',
            priority: 'NORMAL',
            urgency: 'MEDIUM',
            status: 'PENDING',
            sourceType: 'CONVERSATION',
            sourceId: conversation.id,
            conversationId: conversation.id,
            assignedToId: conversation.assignedToId,
            accountId: conversation.accountId,
            contactId: conversation.contactId,
            opportunityId: conversation.opportunityId,
            leadId: conversation.leadId,
            actionType: 'RESPOND_TO_MESSAGE',
            sourceData: {
              messageId: message.id,
              channel: 'EMAIL',
              fromEmail: fromEmail,
              subject: subject,
              preview: bodyText.substring(0, 100),
            },
          },
        });
        console.log(`Created AttentionItem for inbound email from ${fromEmail}`);
      } else {
        // Update existing attention item with latest message info
        await prisma.attentionItem.update({
          where: { id: existingAttention.id },
          data: {
            description: subject || bodyText.substring(0, 200),
            updatedAt: new Date(),
            sourceData: {
              ...(existingAttention.sourceData || {}),
              latestMessageId: message.id,
              latestSubject: subject,
              latestPreview: bodyText.substring(0, 100),
            },
          },
        });
        console.log(`Updated existing AttentionItem for email conversation ${conversation.id}`);
      }
    } catch (attentionError) {
      console.error('Failed to create/update AttentionItem for inbound email:', attentionError);
    }

    // Create Activity record
    try {
      await prisma.activity.create({
        data: {
          type: 'EMAIL_RECEIVED',
          subject: `Email: ${subject || 'No Subject'}`,
          body: bodyText.substring(0, 1000),
          status: 'DELIVERED',
          sourceId: message.id,
          sourceType: 'Message',
          accountId: conversation.accountId,
          contactId: conversation.contactId,
          opportunityId: conversation.opportunityId,
          externalEmail: fromEmail,
          externalName: from.replace(/<[^>]+>/, '').trim(),
          metadata: {
            messageId: message.id,
            conversationId: conversation.id,
            channel: 'EMAIL',
          },
          occurredAt: new Date(),
        },
      });
    } catch (activityError) {
      console.error('Failed to create activity record for inbound email:', activityError);
    }

    // Check if this email looks like a referral submission
    try {
      if (isLikelyReferral(bodyText)) {
        console.log('Detected likely referral in email from:', fromEmail);

        // Find the Champion by email
        const champion = await findChampionByContact(fromEmail);

        if (champion) {
          console.log('Found champion by email:', champion.id, champion.email);

          // Parse the referral message
          const parsedData = parseReferralMessage(bodyText);

          if (parsedData && parsedData.phone) {
            console.log('Parsed referral data from email:', parsedData);

            // Create the Lead and ChampionReferral records
            const result = await createReferralFromMessage({
              parsedData,
              championId: champion.id,
              senderPhone: null,
              senderEmail: fromEmail,
              channel: 'EMAIL',
              messageId: message.id,
              conversationId: conversation.id,
            });

            console.log('Created referral from email:', {
              referralId: result.referral.id,
              leadId: result.lead?.id,
              isDuplicate: result.isDuplicate,
              parseConfidence: result.parseConfidence,
            });
          } else {
            console.log('Could not parse referral data from email');
          }
        } else {
          console.log('Email sender not found in Champions:', fromEmail);
        }
      }
    } catch (referralError) {
      console.error('Error processing referral from email:', referralError);
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('SendGrid inbound webhook error:', error);
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
  if (!phone || typeof phone !== 'string') {
    console.error('normalizePhone called with invalid value:', phone);
    return '+0'; // Return safe fallback
  }
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    cleaned = '1' + cleaned;
  }
  return '+' + cleaned;
}

/**
 * Get phone number configuration by phone number (for per-number settings)
 * @param {string} phoneNumber - The phone number to look up (E.164 format)
 * @returns {Object|null} - Phone number config or null if not found
 */
async function getPhoneNumberConfig(phoneNumber) {
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

/**
 * Check if referral auto-reply is enabled for a specific phone number
 * Falls back to global setting if phone not found
 * @param {string} toPhoneNumber - The Twilio number that received the SMS
 * @returns {boolean}
 */
async function isReferralAutoReplyEnabled(toPhoneNumber) {
  try {
    // First check for per-phone-number setting
    if (toPhoneNumber) {
      const phoneConfig = await getPhoneNumberConfig(toPhoneNumber);
      if (phoneConfig) {
        console.log(`Using per-number auto-reply setting for ${toPhoneNumber}: ${phoneConfig.referralAutoReply}`);
        return phoneConfig.referralAutoReply ?? true;
      }
    }

    // Fall back to global setting
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'bamboogli.autoResponse.referralReceivedReply' },
    });
    // Default to true if not set
    if (!setting) return true;
    return setting.value === 'true';
  } catch (error) {
    console.error('Error checking referral auto-reply setting:', error);
    return true; // Default to enabled
  }
}

/**
 * Get the referral auto-reply message for a specific phone number
 * Falls back to global setting if phone not found
 * @param {string} toPhoneNumber - The Twilio number that received the SMS
 * @returns {string}
 */
async function getReferralAutoReplyMessage(toPhoneNumber) {
  try {
    // First check for per-phone-number setting
    if (toPhoneNumber) {
      const phoneConfig = await getPhoneNumberConfig(toPhoneNumber);
      if (phoneConfig && phoneConfig.referralReplyMessage) {
        console.log(`Using per-number reply message for ${toPhoneNumber}`);
        return phoneConfig.referralReplyMessage;
      }
    }

    // Fall back to global setting
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'bamboogli.autoResponse.referralReceivedMessage' },
    });
    return setting?.value || 'Received!';
  } catch (error) {
    console.error('Error getting referral auto-reply message:', error);
    return 'Received!';
  }
}
