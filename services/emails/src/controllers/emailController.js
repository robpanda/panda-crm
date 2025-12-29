import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

// List emails with filtering and pagination
export async function listEmails(req, res) {
  try {
    const {
      status,
      direction,
      contactId,
      opportunityId,
      accountId,
      leadId,
      threadId,
      search,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const where = {};

    if (status) where.status = status;
    if (direction) where.direction = direction;
    if (contactId) where.contactId = contactId;
    if (opportunityId) where.opportunityId = opportunityId;
    if (accountId) where.accountId = accountId;
    if (leadId) where.leadId = leadId;
    if (threadId) where.threadId = threadId;

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { bodyText: { contains: search, mode: 'insensitive' } },
        { fromAddress: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [emails, total] = await Promise.all([
      prisma.email.findMany({
        where,
        include: {
          contact: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          opportunity: {
            select: { id: true, name: true },
          },
          account: {
            select: { id: true, name: true },
          },
          sentBy: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.email.count({ where }),
    ]);

    res.json({
      emails,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error('Error listing emails:', error);
    res.status(500).json({ error: 'Failed to list emails' });
  }
}

// Get a single email by ID
export async function getEmail(req, res) {
  try {
    const { id } = req.params;

    const email = await prisma.email.findUnique({
      where: { id },
      include: {
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            accountId: true,
          },
        },
        opportunity: {
          select: {
            id: true,
            name: true,
            stage: true,
            accountId: true,
          },
        },
        account: {
          select: { id: true, name: true },
        },
        lead: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        sentBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    res.json(email);
  } catch (error) {
    console.error('Error getting email:', error);
    res.status(500).json({ error: 'Failed to get email' });
  }
}

// Create a new email (draft or send immediately)
export async function createEmail(req, res) {
  try {
    const {
      fromAddress,
      fromName,
      toAddresses,
      ccAddresses = [],
      bccAddresses = [],
      replyTo,
      subject,
      bodyText,
      bodyHtml,
      contactId,
      opportunityId,
      accountId,
      leadId,
      sentById,
      inReplyTo,
      threadId,
      attachmentUrls = [],
      scheduledAt,
      sendNow = false,
    } = req.body;

    if (!fromAddress) {
      return res.status(400).json({ error: 'From address is required' });
    }

    if (!toAddresses || toAddresses.length === 0) {
      return res.status(400).json({ error: 'At least one recipient is required' });
    }

    if (!subject) {
      return res.status(400).json({ error: 'Subject is required' });
    }

    // Generate a unique Message-ID for threading
    const messageId = `<${uuidv4()}@panda-crm.com>`;

    // Determine initial status
    let status = 'DRAFT';
    if (scheduledAt) {
      status = 'SCHEDULED';
    } else if (sendNow) {
      status = 'QUEUED';
    }

    // If replying, inherit threadId from parent or use parent's messageId
    let resolvedThreadId = threadId;
    if (inReplyTo && !threadId) {
      const parentEmail = await prisma.email.findFirst({
        where: { messageId: inReplyTo },
        select: { threadId: true, messageId: true },
      });
      if (parentEmail) {
        resolvedThreadId = parentEmail.threadId || parentEmail.messageId;
      }
    }

    const email = await prisma.email.create({
      data: {
        fromAddress,
        fromName,
        toAddresses,
        ccAddresses,
        bccAddresses,
        replyTo,
        subject,
        bodyText,
        bodyHtml,
        status,
        direction: 'OUTBOUND',
        messageId,
        inReplyTo,
        threadId: resolvedThreadId || messageId, // New thread starts with its own messageId
        attachmentUrls,
        attachmentCount: attachmentUrls.length,
        contactId,
        opportunityId,
        accountId,
        leadId,
        sentById,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        opportunity: {
          select: { id: true, name: true },
        },
      },
    });

    // If sendNow, trigger the email sending (placeholder for actual email provider)
    if (sendNow) {
      // TODO: Integrate with SendGrid/SES
      // For now, just mark as sent for demo purposes
      await prisma.email.update({
        where: { id: email.id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
        },
      });
    }

    res.status(201).json(email);
  } catch (error) {
    console.error('Error creating email:', error);
    res.status(500).json({ error: 'Failed to create email' });
  }
}

// Update an email (drafts only)
export async function updateEmail(req, res) {
  try {
    const { id } = req.params;
    const {
      toAddresses,
      ccAddresses,
      bccAddresses,
      subject,
      bodyText,
      bodyHtml,
      contactId,
      opportunityId,
      accountId,
      attachmentUrls,
      scheduledAt,
    } = req.body;

    // Check if email exists and is a draft
    const existing = await prisma.email.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Email not found' });
    }

    if (existing.status !== 'DRAFT' && existing.status !== 'SCHEDULED') {
      return res.status(400).json({ error: 'Only draft or scheduled emails can be edited' });
    }

    const updateData = {};
    if (toAddresses !== undefined) updateData.toAddresses = toAddresses;
    if (ccAddresses !== undefined) updateData.ccAddresses = ccAddresses;
    if (bccAddresses !== undefined) updateData.bccAddresses = bccAddresses;
    if (subject !== undefined) updateData.subject = subject;
    if (bodyText !== undefined) updateData.bodyText = bodyText;
    if (bodyHtml !== undefined) updateData.bodyHtml = bodyHtml;
    if (contactId !== undefined) updateData.contactId = contactId;
    if (opportunityId !== undefined) updateData.opportunityId = opportunityId;
    if (accountId !== undefined) updateData.accountId = accountId;
    if (attachmentUrls !== undefined) {
      updateData.attachmentUrls = attachmentUrls;
      updateData.attachmentCount = attachmentUrls.length;
    }
    if (scheduledAt !== undefined) {
      updateData.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;
      updateData.status = scheduledAt ? 'SCHEDULED' : 'DRAFT';
    }

    const email = await prisma.email.update({
      where: { id },
      data: updateData,
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        opportunity: {
          select: { id: true, name: true },
        },
      },
    });

    res.json(email);
  } catch (error) {
    console.error('Error updating email:', error);
    res.status(500).json({ error: 'Failed to update email' });
  }
}

// Delete an email (drafts only)
export async function deleteEmail(req, res) {
  try {
    const { id } = req.params;

    const existing = await prisma.email.findUnique({
      where: { id },
      select: { status: true },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Email not found' });
    }

    if (existing.status !== 'DRAFT') {
      return res.status(400).json({ error: 'Only draft emails can be deleted' });
    }

    await prisma.email.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Email deleted' });
  } catch (error) {
    console.error('Error deleting email:', error);
    res.status(500).json({ error: 'Failed to delete email' });
  }
}

// Send a draft email
export async function sendEmail(req, res) {
  try {
    const { id } = req.params;

    const email = await prisma.email.findUnique({
      where: { id },
    });

    if (!email) {
      return res.status(404).json({ error: 'Email not found' });
    }

    if (email.status !== 'DRAFT' && email.status !== 'SCHEDULED') {
      return res.status(400).json({ error: 'Email has already been sent or is in progress' });
    }

    // TODO: Integrate with SendGrid/SES
    // For now, mark as sent
    const updatedEmail = await prisma.email.update({
      where: { id },
      data: {
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    res.json(updatedEmail);
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
}

// Get emails by contact
export async function getEmailsByContact(req, res) {
  try {
    const { contactId } = req.params;
    const { limit = 50 } = req.query;

    const emails = await prisma.email.findMany({
      where: { contactId },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      include: {
        opportunity: {
          select: { id: true, name: true },
        },
        sentBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    res.json(emails);
  } catch (error) {
    console.error('Error getting emails by contact:', error);
    res.status(500).json({ error: 'Failed to get emails' });
  }
}

// Get emails by opportunity
export async function getEmailsByOpportunity(req, res) {
  try {
    const { opportunityId } = req.params;
    const { limit = 50 } = req.query;

    // Get emails directly linked to opportunity
    // OR emails to contacts that are linked to this opportunity
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      select: { contactId: true, accountId: true },
    });

    if (!opportunity) {
      return res.json([]);
    }

    const where = {
      OR: [
        { opportunityId },
        ...(opportunity.contactId ? [{ contactId: opportunity.contactId }] : []),
      ],
    };

    const emails = await prisma.email.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        sentBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    res.json(emails);
  } catch (error) {
    console.error('Error getting emails by opportunity:', error);
    res.status(500).json({ error: 'Failed to get emails' });
  }
}

// Get email thread
export async function getEmailThread(req, res) {
  try {
    const { threadId } = req.params;

    const emails = await prisma.email.findMany({
      where: { threadId },
      orderBy: { createdAt: 'asc' },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        sentBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    res.json(emails);
  } catch (error) {
    console.error('Error getting email thread:', error);
    res.status(500).json({ error: 'Failed to get email thread' });
  }
}

// Reply to an email
export async function replyToEmail(req, res) {
  try {
    const { id } = req.params;
    const {
      bodyText,
      bodyHtml,
      ccAddresses = [],
      bccAddresses = [],
      attachmentUrls = [],
      sendNow = false,
      sentById,
    } = req.body;

    // Get the original email
    const original = await prisma.email.findUnique({
      where: { id },
      include: {
        contact: { select: { email: true } },
      },
    });

    if (!original) {
      return res.status(404).json({ error: 'Original email not found' });
    }

    // Determine who to reply to
    const replyToAddress = original.direction === 'INBOUND'
      ? original.fromAddress
      : (original.contact?.email || original.toAddresses[0]);

    const reply = await prisma.email.create({
      data: {
        fromAddress: original.direction === 'INBOUND' ? original.toAddresses[0] : original.fromAddress,
        toAddresses: [replyToAddress],
        ccAddresses,
        bccAddresses,
        subject: original.subject.startsWith('Re:') ? original.subject : `Re: ${original.subject}`,
        bodyText,
        bodyHtml,
        status: sendNow ? 'QUEUED' : 'DRAFT',
        direction: 'OUTBOUND',
        messageId: `<${uuidv4()}@panda-crm.com>`,
        inReplyTo: original.messageId,
        threadId: original.threadId,
        attachmentUrls,
        attachmentCount: attachmentUrls.length,
        contactId: original.contactId,
        opportunityId: original.opportunityId,
        accountId: original.accountId,
        leadId: original.leadId,
        sentById,
        sentAt: sendNow ? new Date() : null,
      },
      include: {
        contact: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    // If sending now, trigger send
    if (sendNow) {
      // TODO: Integrate with email provider
      await prisma.email.update({
        where: { id: reply.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    }

    res.status(201).json(reply);
  } catch (error) {
    console.error('Error replying to email:', error);
    res.status(500).json({ error: 'Failed to reply to email' });
  }
}

// Forward an email
export async function forwardEmail(req, res) {
  try {
    const { id } = req.params;
    const {
      toAddresses,
      ccAddresses = [],
      bccAddresses = [],
      additionalText,
      fromAddress,
      fromName,
      sentById,
      sendNow = false,
    } = req.body;

    if (!toAddresses || toAddresses.length === 0) {
      return res.status(400).json({ error: 'At least one recipient is required' });
    }

    const original = await prisma.email.findUnique({
      where: { id },
    });

    if (!original) {
      return res.status(404).json({ error: 'Original email not found' });
    }

    const forwardedBody = additionalText
      ? `${additionalText}\n\n---------- Forwarded message ----------\nFrom: ${original.fromName || original.fromAddress}\nDate: ${original.sentAt || original.createdAt}\nSubject: ${original.subject}\nTo: ${original.toAddresses.join(', ')}\n\n${original.bodyText || ''}`
      : `---------- Forwarded message ----------\nFrom: ${original.fromName || original.fromAddress}\nDate: ${original.sentAt || original.createdAt}\nSubject: ${original.subject}\nTo: ${original.toAddresses.join(', ')}\n\n${original.bodyText || ''}`;

    const forward = await prisma.email.create({
      data: {
        fromAddress: fromAddress || original.toAddresses[0],
        fromName,
        toAddresses,
        ccAddresses,
        bccAddresses,
        subject: original.subject.startsWith('Fwd:') ? original.subject : `Fwd: ${original.subject}`,
        bodyText: forwardedBody,
        bodyHtml: original.bodyHtml, // Could enhance with forward header
        status: sendNow ? 'QUEUED' : 'DRAFT',
        direction: 'OUTBOUND',
        messageId: `<${uuidv4()}@panda-crm.com>`,
        attachmentUrls: original.attachmentUrls,
        attachmentCount: original.attachmentCount,
        opportunityId: original.opportunityId,
        accountId: original.accountId,
        sentById,
        sentAt: sendNow ? new Date() : null,
      },
    });

    if (sendNow) {
      await prisma.email.update({
        where: { id: forward.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
    }

    res.status(201).json(forward);
  } catch (error) {
    console.error('Error forwarding email:', error);
    res.status(500).json({ error: 'Failed to forward email' });
  }
}

// Get email statistics
export async function getEmailStats(req, res) {
  try {
    const { contactId, opportunityId, accountId } = req.query;

    const where = {};
    if (contactId) where.contactId = contactId;
    if (opportunityId) where.opportunityId = opportunityId;
    if (accountId) where.accountId = accountId;

    const [total, sent, delivered, opened, clicked, bounced, drafts] = await Promise.all([
      prisma.email.count({ where }),
      prisma.email.count({ where: { ...where, status: 'SENT' } }),
      prisma.email.count({ where: { ...where, status: 'DELIVERED' } }),
      prisma.email.count({ where: { ...where, status: 'OPENED' } }),
      prisma.email.count({ where: { ...where, status: 'CLICKED' } }),
      prisma.email.count({ where: { ...where, status: 'BOUNCED' } }),
      prisma.email.count({ where: { ...where, status: 'DRAFT' } }),
    ]);

    res.json({
      total,
      byStatus: {
        sent,
        delivered,
        opened,
        clicked,
        bounced,
        drafts,
      },
      openRate: delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : 0,
      clickRate: opened > 0 ? ((clicked / opened) * 100).toFixed(1) : 0,
      bounceRate: sent > 0 ? ((bounced / sent) * 100).toFixed(1) : 0,
    });
  } catch (error) {
    console.error('Error getting email stats:', error);
    res.status(500).json({ error: 'Failed to get email statistics' });
  }
}

// Handle webhook for email events (bounces, opens, clicks, etc.)
export async function handleEmailWebhook(req, res) {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];

    for (const event of events) {
      const { providerId, eventType, timestamp } = event;

      if (!providerId) continue;

      const email = await prisma.email.findFirst({
        where: { providerId },
      });

      if (!email) continue;

      const updateData = {};

      switch (eventType?.toLowerCase()) {
        case 'delivered':
          updateData.status = 'DELIVERED';
          updateData.deliveredAt = new Date(timestamp);
          break;
        case 'open':
        case 'opened':
          updateData.status = 'OPENED';
          updateData.openedAt = new Date(timestamp);
          break;
        case 'click':
        case 'clicked':
          updateData.status = 'CLICKED';
          updateData.clickedAt = new Date(timestamp);
          break;
        case 'bounce':
        case 'bounced':
          updateData.status = 'BOUNCED';
          updateData.bouncedAt = new Date(timestamp);
          updateData.bounceType = event.bounceType;
          updateData.bounceReason = event.bounceReason;
          break;
        case 'complaint':
        case 'spamreport':
          updateData.status = 'COMPLAINED';
          updateData.complainedAt = new Date(timestamp);
          break;
        case 'unsubscribe':
          updateData.status = 'UNSUBSCRIBED';
          updateData.unsubscribedAt = new Date(timestamp);
          break;
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.email.update({
          where: { id: email.id },
          data: updateData,
        });
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error handling email webhook:', error);
    res.status(500).json({ error: 'Failed to process webhook' });
  }
}
