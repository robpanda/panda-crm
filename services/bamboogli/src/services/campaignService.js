/**
 * Campaign Service
 * Handles campaign CRUD, audience targeting, and bulk message sending
 */

import { PrismaClient } from '@prisma/client';
import { sendSmsMessage } from '../providers/twilioProvider.js';
import { sendEmailMessage } from '../providers/emailProvider.js';
import rileyMysql from '../utils/rileyMysql.js';

const prisma = new PrismaClient();

/**
 * Create a new campaign
 */
export async function createCampaign(data, userId) {
  const campaign = await prisma.campaign.create({
    data: {
      name: data.name,
      description: data.description,
      type: data.type || 'SMS',
      status: 'DRAFT',
      audienceRules: data.audienceRules || {},
      subject: data.subject,
      body: data.body,
      templateId: data.templateId,
      sendSchedule: data.sendSchedule || 'IMMEDIATE',
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
      createdById: userId,
    },
    include: {
      template: true,
    },
  });

  // Estimate recipients based on audience rules
  const estimatedCount = await estimateRecipients(data.audienceRules || {});

  await prisma.campaign.update({
    where: { id: campaign.id },
    data: { estimatedRecipients: estimatedCount },
  });

  return { ...campaign, estimatedRecipients: estimatedCount };
}

/**
 * Get all campaigns with filters
 */
export async function getCampaigns({ page = 1, limit = 25, type, status, search }) {
  const skip = (page - 1) * limit;

  const where = {};
  if (type) where.type = type;
  if (status) where.status = status;
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }

  const [campaigns, total] = await Promise.all([
    prisma.campaign.findMany({
      where,
      include: {
        template: true,
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.campaign.count({ where }),
  ]);

  return {
    campaigns,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get a single campaign by ID with detailed stats
 */
export async function getCampaignById(id) {
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      template: true,
      sends: {
        take: 100,
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!campaign) return null;

  // Calculate stats
  const stats = await prisma.campaignSend.groupBy({
    by: ['status'],
    where: { campaignId: id },
    _count: true,
  });

  const statusCounts = stats.reduce((acc, s) => {
    acc[s.status] = s._count;
    return acc;
  }, {});

  return {
    ...campaign,
    stats: {
      queued: statusCounts.QUEUED || 0,
      sending: statusCounts.SENDING || 0,
      sent: statusCounts.SENT || 0,
      delivered: statusCounts.DELIVERED || 0,
      failed: statusCounts.FAILED || 0,
      opened: statusCounts.OPENED || 0,
      clicked: statusCounts.CLICKED || 0,
    },
  };
}

/**
 * Update a campaign
 */
export async function updateCampaign(id, data) {
  const updateData = {};

  if (data.name !== undefined) updateData.name = data.name;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.subject !== undefined) updateData.subject = data.subject;
  if (data.body !== undefined) updateData.body = data.body;
  if (data.audienceRules !== undefined) updateData.audienceRules = data.audienceRules;
  if (data.templateId !== undefined) updateData.templateId = data.templateId;
  if (data.sendSchedule !== undefined) updateData.sendSchedule = data.sendSchedule;
  if (data.scheduledAt !== undefined) updateData.scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;
  if (data.status !== undefined) updateData.status = data.status;

  const campaign = await prisma.campaign.update({
    where: { id },
    data: updateData,
    include: { template: true },
  });

  // Re-estimate recipients if audience rules changed
  if (data.audienceRules) {
    const estimatedCount = await estimateRecipients(data.audienceRules);
    await prisma.campaign.update({
      where: { id },
      data: { estimatedRecipients: estimatedCount },
    });
    campaign.estimatedRecipients = estimatedCount;
  }

  return campaign;
}

/**
 * Delete a campaign
 */
export async function deleteCampaign(id) {
  // Delete all sends first (cascade should handle this, but being explicit)
  await prisma.campaignSend.deleteMany({
    where: { campaignId: id },
  });

  await prisma.campaign.delete({
    where: { id },
  });

  return { success: true };
}

/**
 * Estimate recipients based on audience rules
 */
export async function estimateRecipients(rules) {
  const where = await buildAudienceQuery(rules);

  // Count contacts matching criteria
  const count = await prisma.contact.count({
    where: {
      ...where,
      OR: [
        { email: { not: null } },
        { phone: { not: null } },
        { mobilePhone: { not: null } },
      ],
    },
  });

  return count;
}

/**
 * Get audience preview (sample of matching contacts)
 */
export async function getAudiencePreview(rules, limit = 10) {
  const where = await buildAudienceQuery(rules);

  const contacts = await prisma.contact.findMany({
    where: {
      ...where,
      OR: [
        { email: { not: null } },
        { phone: { not: null } },
        { mobilePhone: { not: null } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      mobilePhone: true,
      account: {
        select: {
          name: true,
          billingCity: true,
          billingState: true,
        },
      },
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  const total = await prisma.contact.count({
    where: {
      ...where,
      OR: [
        { email: { not: null } },
        { phone: { not: null } },
        { mobilePhone: { not: null } },
      ],
    },
  });

  return { contacts, total };
}

/**
 * Build Prisma query from audience rules
 */
async function buildAudienceQuery(rules) {
  const where = {};
  const conditions = [];

  // Contact-level filters
  if (rules.contactStatus) {
    conditions.push({ status: rules.contactStatus });
  }

  if (rules.hasEmail) {
    conditions.push({ email: { not: null } });
  }

  if (rules.hasPhone) {
    conditions.push({
      OR: [
        { phone: { not: null } },
        { mobilePhone: { not: null } },
      ],
    });
  }

  if (rules.createdAfter) {
    conditions.push({ createdAt: { gte: new Date(rules.createdAfter) } });
  }

  if (rules.createdBefore) {
    conditions.push({ createdAt: { lte: new Date(rules.createdBefore) } });
  }

  // Account-level filters
  if (rules.accountType || rules.accountStatus || rules.states || rules.territories) {
    const accountWhere = {};

    if (rules.accountType) {
      accountWhere.type = rules.accountType;
    }

    if (rules.accountStatus) {
      accountWhere.status = rules.accountStatus;
    }

    if (rules.states && rules.states.length > 0) {
      accountWhere.billingState = { in: rules.states };
    }

    if (rules.territories && rules.territories.length > 0) {
      accountWhere.territory = { in: rules.territories };
    }

    conditions.push({ account: accountWhere });
  }

  // Opportunity-based filters (contacts linked to opportunities)
  // Support both opportunityStage (legacy singular) and opportunityStages (new plural array)
  const stages = rules.opportunityStages || (rules.opportunityStage ? [rules.opportunityStage] : null);
  if (stages || rules.opportunityType) {
    const oppWhere = {};

    if (stages && stages.length > 0) {
      oppWhere.stage = { in: stages };
    }

    if (rules.opportunityType) {
      oppWhere.type = rules.opportunityType;
    }

    conditions.push({
      account: {
        opportunities: {
          some: oppWhere,
        },
      },
    });
  }

  // Lead source filter (include)
  if (rules.leadSources && rules.leadSources.length > 0) {
    conditions.push({ leadSource: { in: rules.leadSources } });
  }

  // Lead source filter (exclude)
  if (rules.excludeSources && rules.excludeSources.length > 0) {
    conditions.push({ leadSource: { notIn: rules.excludeSources } });
  }

  // Exclude opted-out
  if (rules.excludeOptedOut !== false) {
    conditions.push({ emailOptOut: { not: true } });
    conditions.push({ smsOptOut: { not: true } });
  }

  // Exclude Champions (GTR Advocates) by email
  if (rules.excludeChampions) {
    // Get all champion emails to exclude
    const champions = await prisma.champion.findMany({
      where: { status: 'ACTIVE' },
      select: { email: true },
    });
    // Filter out null emails first, then convert to lowercase
    const championEmails = champions
      .map(c => c.email)
      .filter(Boolean)
      .map(email => email.toLowerCase());

    if (championEmails.length > 0) {
      // Exclude contacts whose email matches any champion email
      conditions.push({
        OR: [
          { email: null },
          { email: { notIn: championEmails, mode: 'insensitive' } },
        ],
      });
    }
  }

  if (conditions.length > 0) {
    where.AND = conditions;
  }

  return where;
}

/**
 * Send a campaign to all recipients
 */
export async function sendCampaign(campaignId, userId) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true },
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
    throw new Error(`Campaign cannot be sent from status: ${campaign.status}`);
  }

  // Update status to SENDING
  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'SENDING',
      sentAt: new Date(),
    },
  });

  // Get recipients
  const where = await buildAudienceQuery(campaign.audienceRules || {});
  const contacts = await prisma.contact.findMany({
    where: {
      ...where,
      OR: campaign.type === 'EMAIL'
        ? [{ email: { not: null } }]
        : [{ phone: { not: null } }, { mobilePhone: { not: null } }],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      mobilePhone: true,
      account: {
        select: {
          name: true,
          billingCity: true,
          billingState: true,
        },
      },
    },
  });

  // Use body from template if not set directly
  const messageBody = campaign.body || campaign.template?.body || '';
  const messageSubject = campaign.subject || campaign.template?.subject || '';

  // Create send records and queue messages
  const sendPromises = contacts.map(async (contact) => {
    const recipientAddress = campaign.type === 'EMAIL'
      ? contact.email
      : contact.mobilePhone || contact.phone;

    if (!recipientAddress) return null;

    // Personalize message
    const personalizedBody = personalizeMessage(messageBody, contact);
    const personalizedSubject = personalizeMessage(messageSubject, contact);

    // Create send record
    const send = await prisma.campaignSend.create({
      data: {
        campaignId,
        contactId: contact.id,
        email: campaign.type === 'EMAIL' ? recipientAddress : null,
        phone: campaign.type === 'SMS' ? recipientAddress : null,
        status: 'QUEUED',
      },
    });

    // Send the message
    try {
      let result;
      if (campaign.type === 'SMS') {
        // Use dedicated campaign phone number if configured, otherwise use default
        const campaignFromNumber = process.env.TWILIO_CAMPAIGN_PHONE_NUMBER;
        result = await sendSmsMessage({
          to: recipientAddress,
          body: personalizedBody,
          messageId: send.id,
          fromNumber: campaignFromNumber, // Use campaign-specific number
        });
      } else {
        // Append unsubscribe link to email body
        const bodyWithUnsubscribe = appendUnsubscribeLink(personalizedBody, recipientAddress, false);
        const bodyHtmlWithUnsubscribe = appendUnsubscribeLink(personalizedBody, recipientAddress, true);

        result = await sendEmailMessage({
          to: recipientAddress,
          subject: personalizedSubject,
          body: bodyWithUnsubscribe,
          bodyHtml: bodyHtmlWithUnsubscribe,
          messageId: send.id,
        });
      }

      // Update send record with success
      await prisma.campaignSend.update({
        where: { id: send.id },
        data: {
          status: 'SENT',
          externalId: result.providerId || result.twilioSid,
        },
      });

      return { success: true, sendId: send.id };
    } catch (error) {
      // Update send record with failure
      await prisma.campaignSend.update({
        where: { id: send.id },
        data: {
          status: 'FAILED',
          errorCode: error.code || 'UNKNOWN',
          errorMessage: error.message,
        },
      });

      return { success: false, sendId: send.id, error: error.message };
    }
  });

  // Process in batches of 50 to avoid overwhelming providers
  const batchSize = 50;
  const results = [];

  for (let i = 0; i < sendPromises.length; i += batchSize) {
    const batch = sendPromises.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch);
    results.push(...batchResults.filter(Boolean));

    // Small delay between batches
    if (i + batchSize < sendPromises.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Update campaign stats
  const successCount = results.filter(r => r?.success).length;
  const failCount = results.filter(r => r && !r.success).length;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: 'SENT',
      totalSent: results.length,
      delivered: successCount,
      failed: failCount,
    },
  });

  return {
    campaignId,
    totalRecipients: contacts.length,
    sent: results.length,
    successful: successCount,
    failed: failCount,
  };
}

/**
 * Send a test campaign to specified employees
 * @param {string} campaignId - The campaign ID
 * @param {string[]} userIds - Array of user IDs to send test to
 * @param {string} userId - The user sending the test
 */
export async function sendTestCampaign(campaignId, userIds, userId) {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true },
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Get the users to send test to
  const users = await prisma.user.findMany({
    where: {
      id: { in: userIds },
      isActive: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
    },
  });

  if (users.length === 0) {
    throw new Error('No valid users found for test send');
  }

  // Use body from template if not set directly
  const messageBody = campaign.body || campaign.template?.body || '';
  const messageSubject = campaign.subject || campaign.template?.subject || '';

  const results = [];

  for (const user of users) {
    // Create a mock contact object for personalization
    const mockContact = {
      firstName: user.firstName || 'Test',
      lastName: user.lastName || 'User',
      email: user.email,
      phone: user.phone,
      account: {
        name: 'Test Account',
        billingCity: 'Test City',
        billingState: 'Test State',
      },
    };

    const personalizedBody = personalizeMessage(messageBody, mockContact);
    const personalizedSubject = `[TEST] ${personalizeMessage(messageSubject, mockContact)}`;

    const recipientAddress = campaign.type === 'EMAIL'
      ? user.email
      : user.phone;

    if (!recipientAddress) {
      results.push({
        userId: user.id,
        success: false,
        error: `No ${campaign.type === 'EMAIL' ? 'email' : 'phone'} address for user`,
      });
      continue;
    }

    try {
      let result;
      if (campaign.type === 'SMS') {
        // Use dedicated campaign phone number if configured
        const campaignFromNumber = process.env.TWILIO_CAMPAIGN_PHONE_NUMBER;
        result = await sendSmsMessage({
          to: recipientAddress,
          body: `[TEST] ${personalizedBody}`,
          fromNumber: campaignFromNumber, // Use campaign-specific number
        });
      } else {
        result = await sendEmailMessage({
          to: recipientAddress,
          subject: personalizedSubject,
          body: `[TEST MESSAGE - This is a preview of campaign: ${campaign.name}]\n\n${personalizedBody}`,
          bodyHtml: `<div style="background:#fff3cd;padding:10px;margin-bottom:10px;border:1px solid #ffc107;border-radius:4px;"><strong>TEST MESSAGE</strong> - This is a preview of campaign: ${campaign.name}</div>${personalizedBody}`,
        });
      }

      results.push({
        userId: user.id,
        userName: `${user.firstName} ${user.lastName}`,
        recipientAddress,
        success: true,
        messageId: result.providerId || result.twilioSid,
      });
    } catch (error) {
      results.push({
        userId: user.id,
        userName: `${user.firstName} ${user.lastName}`,
        recipientAddress,
        success: false,
        error: error.message,
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return {
    campaignId,
    campaignName: campaign.name,
    type: campaign.type,
    testRecipients: users.length,
    successful: successCount,
    failed: failCount,
    results,
  };
}

/**
 * Get employees available for test sends
 */
export async function getTestRecipients(search) {
  const where = {
    isActive: true,
  };

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: 'insensitive' } },
      { lastName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      department: true,
      title: true,
    },
    orderBy: [
      { firstName: 'asc' },
      { lastName: 'asc' },
    ],
    take: 100,
  });

  // Filter to users who have either email or phone
  return users.filter(u => u.email || u.phone);
}

/**
 * Personalize message with contact/account data
 */
function personalizeMessage(message, contact) {
  if (!message) return '';

  const firstName = contact.firstName || '';
  const lastName = contact.lastName || '';
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || 'Customer';
  const accountName = contact.account?.name || '';
  const city = contact.account?.billingCity || '';
  const state = contact.account?.billingState || '';

  return message
    .replace(/\{\{firstName\}\}/gi, firstName)
    .replace(/\{\{lastName\}\}/gi, lastName)
    .replace(/\{\{fullName\}\}/gi, fullName)
    .replace(/\{\{name\}\}/gi, fullName)
    .replace(/\{\{accountName\}\}/gi, accountName)
    .replace(/\{\{city\}\}/gi, city)
    .replace(/\{\{state\}\}/gi, state)
    .replace(/\{\{company\}\}/gi, 'Panda Exteriors');
}

/**
 * Pause an active campaign
 */
export async function pauseCampaign(id) {
  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status: 'PAUSED' },
  });
  return campaign;
}

/**
 * Resume a paused campaign
 */
export async function resumeCampaign(id) {
  const campaign = await prisma.campaign.update({
    where: { id },
    data: { status: 'ACTIVE' },
  });
  return campaign;
}

/**
 * Duplicate a campaign
 */
export async function duplicateCampaign(id, userId) {
  const original = await prisma.campaign.findUnique({
    where: { id },
  });

  if (!original) {
    throw new Error('Campaign not found');
  }

  const duplicate = await prisma.campaign.create({
    data: {
      name: `${original.name} (Copy)`,
      description: original.description,
      type: original.type,
      status: 'DRAFT',
      audienceRules: original.audienceRules,
      subject: original.subject,
      body: original.body,
      templateId: original.templateId,
      sendSchedule: 'IMMEDIATE',
      createdById: userId,
    },
  });

  return duplicate;
}

/**
 * Get campaign sends with pagination
 */
export async function getCampaignSends(campaignId, { page = 1, limit = 50, status }) {
  const skip = (page - 1) * limit;

  const where = { campaignId };
  if (status) where.status = status;

  const [sends, total] = await Promise.all([
    prisma.campaignSend.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.campaignSend.count({ where }),
  ]);

  return {
    sends,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}

/**
 * Update send status from webhook
 */
export async function updateSendStatus(externalId, status, metadata = {}) {
  const send = await prisma.campaignSend.findFirst({
    where: { externalId },
  });

  if (!send) return null;

  const updateData = { status };

  if (status === 'DELIVERED') {
    updateData.deliveredAt = new Date();
  } else if (status === 'OPENED') {
    updateData.openedAt = new Date();
  } else if (status === 'CLICKED') {
    updateData.clickedAt = new Date();
  } else if (status === 'FAILED') {
    updateData.errorCode = metadata.errorCode;
    updateData.errorMessage = metadata.errorMessage;
  }

  const updatedSend = await prisma.campaignSend.update({
    where: { id: send.id },
    data: updateData,
  });

  // Update campaign stats
  await updateCampaignStats(send.campaignId);

  return updatedSend;
}

/**
 * Recalculate campaign stats
 */
async function updateCampaignStats(campaignId) {
  const stats = await prisma.campaignSend.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: true,
  });

  const counts = stats.reduce((acc, s) => {
    acc[s.status] = s._count;
    return acc;
  }, {});

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      delivered: counts.DELIVERED || 0,
      failed: counts.FAILED || 0,
      opened: counts.OPENED || 0,
      clicked: counts.CLICKED || 0,
    },
  });
}

/**
 * Get counts of opportunities by stage for campaign targeting
 * Returns counts of contacts that have opportunities in each stage
 */
export async function getOpportunityStageCounts() {
  // Get all opportunity stages with counts of unique contacts
  const stageCounts = await prisma.$queryRaw`
    SELECT
      o.stage,
      COUNT(DISTINCT c.id) as contact_count
    FROM opportunities o
    JOIN accounts a ON o.account_id = a.id
    JOIN contacts c ON c.account_id = a.id
    WHERE o.stage IS NOT NULL
      AND (c.mobile_phone IS NOT NULL OR c.phone IS NOT NULL OR c.email IS NOT NULL)
    GROUP BY o.stage
    ORDER BY contact_count DESC
  `;

  // Convert to object format { stage: count }
  const counts = {};
  for (const row of stageCounts) {
    counts[row.stage] = Number(row.contact_count);
  }

  // Also get total opportunities per stage (not just contacts)
  const oppCounts = await prisma.$queryRaw`
    SELECT stage, COUNT(*) as count
    FROM opportunities
    WHERE stage IS NOT NULL
    GROUP BY stage
    ORDER BY count DESC
  `;

  const opportunityCounts = {};
  for (const row of oppCounts) {
    opportunityCounts[row.stage] = Number(row.count);
  }

  return {
    contactCounts: counts,      // Contacts with phone/email linked to opportunities in each stage
    opportunityCounts,          // Total opportunities in each stage
    stages: Object.keys(counts), // List of stages that have data
  };
}

/**
 * Fix a campaign that is stuck in SENDING status
 * Updates all QUEUED sends to SENT and updates campaign metrics
 * @param {string} campaignId - The campaign ID
 * @param {Object} options - Options
 * @param {boolean} options.dryRun - If true, only preview changes without applying them
 */
export async function fixStuckCampaign(campaignId, options = {}) {
  const { dryRun = false } = options;

  // Get the campaign
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    include: {
      _count: {
        select: { sends: true },
      },
    },
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Get send status breakdown
  const statusCounts = await prisma.campaignSend.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: true,
  });

  const counts = statusCounts.reduce((acc, s) => {
    acc[s.status] = s._count;
    return acc;
  }, {});

  const totalSends = campaign._count.sends;
  const queuedCount = counts.QUEUED || 0;
  const sentCount = counts.SENT || 0;
  const deliveredCount = counts.DELIVERED || 0;
  const failedCount = counts.FAILED || 0;

  const result = {
    campaignId,
    campaignName: campaign.name,
    currentStatus: campaign.status,
    statusCounts: counts,
    totalSends,
    dryRun,
    changes: {
      sendsUpdated: 0,
      newTotalSent: 0,
      newDelivered: 0,
      newFailed: 0,
      newStatus: null,
    },
  };

  // Only fix if campaign is stuck in SENDING status OR has QUEUED sends that need updating
  if (campaign.status !== 'SENDING' && queuedCount === 0) {
    result.message = `Campaign is not stuck - current status is ${campaign.status} and no QUEUED sends`;
    return result;
  }

  // Check if sends need to be updated (QUEUED means Twilio succeeded but DB update failed)
  if (queuedCount > 0) {
    if (!dryRun) {
      const updateResult = await prisma.campaignSend.updateMany({
        where: {
          campaignId,
          status: 'QUEUED',
        },
        data: {
          status: 'SENT',
        },
      });
      result.changes.sendsUpdated = updateResult.count;
    } else {
      result.changes.sendsUpdated = queuedCount;
    }
  }

  // Calculate new totals
  const newSent = sentCount + queuedCount;
  const newDelivered = deliveredCount || newSent; // Assume delivered if no webhook updates yet
  const newFailed = failedCount;

  result.changes.newTotalSent = newSent;
  result.changes.newDelivered = newDelivered;
  result.changes.newFailed = newFailed;
  result.changes.newStatus = 'SENT';

  if (!dryRun) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'SENT',
        totalSent: newSent,
        delivered: newDelivered,
        failed: newFailed,
      },
    });
    result.message = 'Campaign fixed successfully';
  } else {
    result.message = 'Dry run - no changes applied';
  }

  return result;
}

/**
 * Opt out contacts from SMS and/or Email campaigns by phone numbers
 * @param {string[]} phoneNumbers - Array of phone numbers (any format)
 * @param {Object} options - Options
 * @param {boolean} options.sms - Opt out of SMS (default true)
 * @param {boolean} options.email - Opt out of Email (default true)
 * @param {boolean} options.dryRun - Preview without applying changes
 */
export async function optOutByPhoneNumbers(phoneNumbers, options = {}) {
  const { sms = true, email = true, dryRun = false } = options;

  // Normalize phone numbers to 10 digits
  const normalizedNumbers = phoneNumbers.map(p => p.replace(/\D/g, '').slice(-10));

  const results = [];

  for (const phone of normalizedNumbers) {
    // Find contacts matching this phone number
    const contacts = await prisma.contact.findMany({
      where: {
        OR: [
          { phone: { contains: phone } },
          { mobilePhone: { contains: phone } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        mobilePhone: true,
        email: true,
        smsOptOut: true,
        emailOptOut: true,
      },
    });

    const phoneResult = {
      phone: `+1${phone}`,
      contactsFound: contacts.length,
      contacts: [],
    };

    for (const contact of contacts) {
      const contactResult = {
        id: contact.id,
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Unknown',
        email: contact.email,
        previousSmsOptOut: contact.smsOptOut,
        previousEmailOptOut: contact.emailOptOut,
        updated: false,
      };

      const needsUpdate = (sms && !contact.smsOptOut) || (email && !contact.emailOptOut);

      if (needsUpdate) {
        if (!dryRun) {
          const updateData = {};
          if (sms) updateData.smsOptOut = true;
          if (email) updateData.emailOptOut = true;

          await prisma.contact.update({
            where: { id: contact.id },
            data: updateData,
          });
          contactResult.updated = true;
        } else {
          contactResult.wouldUpdate = true;
        }
      } else {
        contactResult.alreadyOptedOut = true;
      }

      phoneResult.contacts.push(contactResult);
    }

    results.push(phoneResult);
  }

  const totalContacts = results.reduce((sum, r) => sum + r.contactsFound, 0);
  const totalUpdated = results.reduce((sum, r) =>
    sum + r.contacts.filter(c => c.updated || c.wouldUpdate).length, 0);

  return {
    dryRun,
    optOutSms: sms,
    optOutEmail: email,
    phoneNumbers: normalizedNumbers.length,
    totalContactsFound: totalContacts,
    totalUpdated,
    results,
  };
}

/**
 * Generate an unsubscribe token for a contact/email
 * Token format: base64(email:timestamp)
 */
export function generateUnsubscribeToken(email) {
  const payload = `${email}:${Date.now()}`;
  return Buffer.from(payload).toString('base64url');
}

/**
 * Decode an unsubscribe token
 */
export function decodeUnsubscribeToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const [email] = decoded.split(':');
    return { email, valid: !!email };
  } catch (error) {
    return { email: null, valid: false };
  }
}

/**
 * Generate unsubscribe link for a contact email
 */
export function generateUnsubscribeLink(email) {
  const token = generateUnsubscribeToken(email);
  const baseUrl = process.env.CRM_BASE_URL || 'https://crm.pandaadmin.com';
  return `${baseUrl}/api/campaigns/unsubscribe/${token}`;
}

/**
 * Append unsubscribe link to email body/HTML
 */
export function appendUnsubscribeLink(body, email, isHtml = false) {
  const unsubscribeLink = generateUnsubscribeLink(email);

  if (isHtml) {
    // Check if body already has a closing </body> tag
    if (body.toLowerCase().includes('</body>')) {
      return body.replace(
        /<\/body>/i,
        `<div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #666; text-align: center;">
          <p>If you no longer wish to receive these emails, you can <a href="${unsubscribeLink}" style="color: #667eea;">unsubscribe here</a>.</p>
        </div>
        </body>`
      );
    }
    // No </body> tag, append at the end
    return `${body}
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e5e5; font-size: 12px; color: #666; text-align: center;">
        <p>If you no longer wish to receive these emails, you can <a href="${unsubscribeLink}" style="color: #667eea;">unsubscribe here</a>.</p>
      </div>`;
  }

  // Plain text
  return `${body}\n\n---\nTo unsubscribe from these emails, visit: ${unsubscribeLink}`;
}

/**
 * Process unsubscribe request by token
 */
export async function unsubscribeByToken(token) {
  const { email, valid } = decodeUnsubscribeToken(token);

  if (!valid || !email) {
    throw new Error('Invalid or expired unsubscribe link');
  }

  // Find contacts with this email
  const contacts = await prisma.contact.findMany({
    where: {
      email: { equals: email, mode: 'insensitive' },
    },
  });

  if (contacts.length === 0) {
    // Still return success even if no contact found - don't leak info
    return {
      success: true,
      message: 'You have been unsubscribed from our email list.',
    };
  }

  // Update all contacts with this email to opt out
  const updates = await Promise.all(
    contacts.map(contact =>
      prisma.contact.update({
        where: { id: contact.id },
        data: { emailOptOut: true },
      })
    )
  );

  return {
    success: true,
    message: 'You have been unsubscribed from our email list.',
    contactsUpdated: updates.length,
  };
}

export default {
  createCampaign,
  getCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  estimateRecipients,
  getAudiencePreview,
  sendCampaign,
  sendTestCampaign,
  getTestRecipients,
  pauseCampaign,
  resumeCampaign,
  duplicateCampaign,
  getCampaignSends,
  updateSendStatus,
  getOpportunityStageCounts,
  fixStuckCampaign,
  optOutByPhoneNumbers,
  generateUnsubscribeToken,
  decodeUnsubscribeToken,
  generateUnsubscribeLink,
  appendUnsubscribeLink,
  unsubscribeByToken,
};
