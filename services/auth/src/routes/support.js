import express from 'express';
import { PrismaClient } from '@prisma/client';
import { authMiddleware } from '../middleware/auth.js';
import multer from 'multer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import https from 'https';

const router = express.Router();
const prisma = new PrismaClient();

// OpenAI API configuration for GPT-4o-mini
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit for screenshots/docs in replies
});

// S3 configuration
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'panda-crm-support';

function getRequestUserId(req) {
  return req?.user?.id || req?.user?.userId || req?.user?.sub || null;
}

function buildEmailVariants(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !normalized.includes('@')) return [];
  const [localPart, domainPart] = normalized.split('@');
  if (!localPart || !domainPart) return [normalized];

  const domains = new Set([domainPart]);
  if (domainPart === 'pandaexteriors.com') domains.add('panda-exteriors.com');
  if (domainPart === 'panda-exteriors.com') domains.add('pandaexteriors.com');

  const localVariants = new Set([localPart, localPart.replace(/\./g, '')]);

  const variants = [];
  for (const local of localVariants) {
    for (const domain of domains) {
      variants.push(`${local}@${domain}`);
    }
  }
  return Array.from(new Set(variants));
}

async function resolveSupportUserContext(req) {
  const tokenUserId = getRequestUserId(req);
  const tokenEmail = String(req?.user?.email || '').trim().toLowerCase() || null;
  const emailVariants = buildEmailVariants(tokenEmail);

  const orFilters = [];
  if (tokenUserId) {
    orFilters.push({ id: tokenUserId });
    orFilters.push({ cognitoId: tokenUserId });
  }
  if (emailVariants.length > 0) {
    orFilters.push({ email: { in: emailVariants } });
  }

  if (orFilters.length === 0) {
    return {
      tokenUserId: null,
      tokenEmail: null,
      resolvedUserId: null,
      candidateUserIds: [],
    };
  }

  const users = await prisma.user.findMany({
    where: { OR: orFilters },
    select: {
      id: true,
      cognitoId: true,
      email: true,
    },
    take: 25,
  });

  const normalizedTokenEmail = tokenEmail || null;
  const resolvedUser =
    users.find((user) => user.id === tokenUserId || user.cognitoId === tokenUserId)
    || users.find((user) => normalizedTokenEmail && String(user.email || '').toLowerCase() === normalizedTokenEmail)
    || users[0]
    || null;

  const candidateUserIds = Array.from(
    new Set([tokenUserId, ...users.map((user) => user.id)].filter(Boolean))
  );

  return {
    tokenUserId,
    tokenEmail,
    emailVariants,
    resolvedUserId: resolvedUser?.id || null,
    candidateUserIds,
  };
}

function isSupportAdmin(user = {}) {
  const roleType = String(user?.roleType || user?.role || '').toLowerCase();
  const roleName = String(user?.role?.name || '').toLowerCase();
  const groups = Array.isArray(user?.groups)
    ? user.groups.map((group) => String(group).toLowerCase())
    : [];

  return roleType.includes('admin')
    || roleName.includes('admin')
    || roleType.includes('system_admin')
    || roleName.includes('system_admin')
    || groups.some((group) => group.includes('admin'));
}

function buildTicketIdentifierWhere(rawTicketId) {
  return {
    OR: [
      { id: rawTicketId },
      { ticket_number: rawTicketId },
    ],
  };
}

async function isSupportAdminResolved(req) {
  if (isSupportAdmin(req?.user)) return true;

  const userContext = await resolveSupportUserContext(req);
  if (!userContext.resolvedUserId) return false;

  const dbUser = await prisma.user.findUnique({
    where: { id: userContext.resolvedUserId },
    select: {
      title: true,
      department: true,
      role: {
        select: {
          name: true,
          roleType: true,
        },
      },
    },
  });

  const values = [
    dbUser?.title,
    dbUser?.department,
    dbUser?.role?.name,
    dbUser?.role?.roleType,
  ]
    .map((value) => String(value || '').toLowerCase())
    .filter(Boolean);

  return values.some((value) => value.includes('admin') || value.includes('system'));
}

// Helper to generate ticket number
function generateTicketNumber() {
  const prefix = 'TKT';
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// Helper to upload to S3
async function uploadToS3(file, folder = 'support') {
  const key = `${folder}/${Date.now()}-${file.originalname}`;
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype,
  });

  await s3Client.send(command);
  return `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/${key}`;
}

// Upload endpoint for attachments
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const url = await uploadToS3(req.file, 'attachments');
    res.json({ url });
  } catch (error) {
    console.error('Failed to upload file:', error);
    res.status(500).json({ error: 'Failed to upload file' });
  }
});

// Get user's tickets
router.get('/tickets', authMiddleware, async (req, res) => {
  try {
    const userContext = await resolveSupportUserContext(req);
    if (!userContext.resolvedUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const whereClauses = [];
    if (userContext.candidateUserIds.length > 0) {
      whereClauses.push({ user_id: { in: userContext.candidateUserIds } });
    }
    if (userContext.tokenEmail) {
      whereClauses.push({
        user: {
          email: { in: userContext.emailVariants.length > 0 ? userContext.emailVariants : [userContext.tokenEmail] },
        },
      });
    }

    if (whereClauses.length === 0) {
      return res.json({ tickets: [] });
    }

    const tickets = await prisma.support_tickets.findMany({
      where: { OR: whereClauses },
      include: {
        _count: {
          select: {
            messages: true,
            attachments: true,
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    res.json({ tickets });
  } catch (error) {
    console.error('Failed to get tickets:', error);
    res.status(500).json({ error: 'Failed to load tickets' });
  }
});

// Get single ticket
router.get('/tickets/:id', authMiddleware, async (req, res) => {
  try {
    const userContext = await resolveSupportUserContext(req);
    if (!userContext.resolvedUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const ownershipFilters = [];
    if (userContext.candidateUserIds.length > 0) {
      ownershipFilters.push({ user_id: { in: userContext.candidateUserIds } });
    }
    if (userContext.tokenEmail) {
      ownershipFilters.push({
        user: {
          email: { in: userContext.emailVariants.length > 0 ? userContext.emailVariants : [userContext.tokenEmail] },
        },
      });
    }

    if (ownershipFilters.length === 0 && !isSupportAdmin(req.user)) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const canViewAllTickets = await isSupportAdminResolved(req);
    const ticket = await prisma.support_tickets.findFirst({
      where: {
        ...buildTicketIdentifierWhere(req.params.id),
        ...(canViewAllTickets
          ? {}
          : { OR: ownershipFilters }), // Users can only see their own tickets
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        assigned_to: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        related_article: {
          select: {
            id: true,
            title: true,
            summary: true,
          },
        },
        attachments: true,
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Get messages
    const messages = await prisma.support_ticket_messages.findMany({
      where: { ticket_id: ticket.id },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    const messageIds = messages.map((message) => message.id);
    const attachments = messageIds.length > 0
      ? await prisma.support_ticket_attachments.findMany({
          where: {
            ticket_id: ticket.id,
            message_id: { in: messageIds },
          },
          orderBy: { created_at: 'asc' },
        })
      : [];

    const attachmentsByMessageId = new Map();
    for (const attachment of attachments) {
      const existing = attachmentsByMessageId.get(attachment.message_id) || [];
      existing.push(attachment);
      attachmentsByMessageId.set(attachment.message_id, existing);
    }

    const messagesWithAttachments = messages.map((message) => ({
      ...message,
      attachments: attachmentsByMessageId.get(message.id) || [],
    }));

    res.json({ ticket, messages: messagesWithAttachments });
  } catch (error) {
    console.error('Failed to get ticket:', error);
    res.status(500).json({ error: 'Failed to load ticket' });
  }
});

// Create ticket
router.post('/tickets', authMiddleware, upload.fields([
  { name: 'screenshot', maxCount: 1 },
  { name: 'attachments', maxCount: 5 }
]), async (req, res) => {
  try {
    const userContext = await resolveSupportUserContext(req);
    if (!userContext.resolvedUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { subject, description, category, priority, pageUrl, browserInfo } = req.body;

    // Upload screenshot if provided
    let screenshotUrl = null;
    if (req.files?.screenshot?.[0]) {
      screenshotUrl = await uploadToS3(req.files.screenshot[0], 'screenshots');
    }

    // Create ticket
    const ticket = await prisma.support_tickets.create({
      data: {
        ticket_number: generateTicketNumber(),
        subject,
        description,
        category: category || null,
        priority: priority || 'MEDIUM',
        status: 'NEW',
        page_url: pageUrl || null,
        browser_info: browserInfo || null,
        screenshot_url: screenshotUrl,
        user_id: userContext.resolvedUserId,
      },
    });

    // Upload and attach files
    if (req.files?.attachments) {
      for (const file of req.files.attachments) {
        const fileUrl = await uploadToS3(file, 'attachments');

        await prisma.support_ticket_attachments.create({
          data: {
            ticket_id: ticket.id,
            file_name: file.originalname,
            file_url: fileUrl,
            file_size: file.size,
            file_type: file.mimetype,
            uploaded_by_id: userContext.resolvedUserId,
          },
        });
      }
    }

    res.status(201).json({ ticket });
  } catch (error) {
    console.error('Failed to create ticket:', error);
    res.status(500).json({ error: 'Failed to create ticket' });
  }
});

// Add message to ticket
router.post('/tickets/:id/messages', authMiddleware, async (req, res) => {
  try {
    const userContext = await resolveSupportUserContext(req);
    if (!userContext.resolvedUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { message, attachments } = req.body;
    const normalizedMessage = typeof message === 'string' ? message.trim() : '';
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    if (!normalizedMessage && !hasAttachments) {
      return res.status(400).json({ error: 'Message or attachment is required' });
    }

    // Verify ticket belongs to user or user is admin
    const ownershipFilters = [];
    if (userContext.candidateUserIds.length > 0) {
      ownershipFilters.push({ user_id: { in: userContext.candidateUserIds } });
    }
    if (userContext.tokenEmail) {
      ownershipFilters.push({
        user: {
          email: { in: userContext.emailVariants.length > 0 ? userContext.emailVariants : [userContext.tokenEmail] },
        },
      });
    }

    if (ownershipFilters.length === 0 && !isSupportAdmin(req.user)) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const canViewAllTickets = await isSupportAdminResolved(req);
    const ticket = await prisma.support_tickets.findFirst({
      where: {
        ...buildTicketIdentifierWhere(req.params.id),
        ...(canViewAllTickets
          ? {}
          : {
              OR: ownershipFilters,
            }),
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Create message
    const newMessage = await prisma.support_ticket_messages.create({
      data: {
        ticket_id: ticket.id,
        user_id: userContext.resolvedUserId,
        message: normalizedMessage || 'Attachment(s) uploaded',
        is_internal: false,
      },
    });

    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const attachment of attachments) {
        const fileUrl = typeof attachment === 'string'
          ? attachment
          : attachment.file_url || attachment.url || null;
        if (!fileUrl) continue;

        await prisma.support_ticket_attachments.create({
          data: {
            ticket_id: ticket.id,
            message_id: newMessage.id,
            file_name: attachment.file_name || attachment.name || 'attachment',
            file_url: fileUrl,
            file_size: Number(attachment.file_size || attachment.size || 0) || null,
            file_type: attachment.file_type || attachment.type || null,
            uploaded_by_id: userContext.resolvedUserId,
          },
        });
      }
    }

    // Update ticket timestamps
    const isUserMessage = userContext.candidateUserIds.includes(ticket.user_id);
    const updateData = {
      last_response_at: new Date(),
    };

    // If user responds, change from WAITING_FOR_USER to IN_PROGRESS
    if (isUserMessage && ticket.status === 'WAITING_FOR_USER') {
      updateData.status = 'IN_PROGRESS';
    }

    // If admin responds for first time, record first response time
    if (!isUserMessage && !ticket.first_response_at) {
      const diffMs = new Date() - new Date(ticket.created_at);
      updateData.first_response_at = new Date();
      updateData.response_time_mins = Math.floor(diffMs / 60000);
    }

    await prisma.support_tickets.update({
      where: { id: ticket.id },
      data: updateData,
    });

    res.status(201).json({ message: newMessage });
  } catch (error) {
    console.error('Failed to create message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Admin: Get all tickets
router.get('/admin/tickets', authMiddleware, async (req, res) => {
  try {
    // Check if user is admin
    const isAdmin = await isSupportAdminResolved(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const tickets = await prisma.support_tickets.findMany({
      select: {
        id: true,
        ticket_number: true,
        subject: true,
        description: true,
        status: true,
        priority: true,
        category: true,
        page_url: true,
        screenshot_url: true,
        browser_info: true,
        user_id: true,
        assigned_to_id: true,
        resolved_at: true,
        resolved_by_id: true,
        first_response_at: true,
        last_response_at: true,
        response_time_mins: true,
        resolution_time_mins: true,
        related_help_article_id: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { created_at: 'desc' },
      ],
    });

    const userIds = Array.from(new Set(
      tickets
        .flatMap((ticket) => [ticket.user_id, ticket.assigned_to_id])
        .filter(Boolean)
    ));

    const [users, messageCounts, attachmentCounts] = await Promise.all([
      userIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true, fullName: true, email: true },
          })
        : Promise.resolve([]),
      prisma.support_ticket_messages.groupBy({
        by: ['ticket_id'],
        where: { ticket_id: { in: tickets.map((t) => t.id) } },
        _count: { ticket_id: true },
      }),
      prisma.support_ticket_attachments.groupBy({
        by: ['ticket_id'],
        where: { ticket_id: { in: tickets.map((t) => t.id) } },
        _count: { ticket_id: true },
      }),
    ]);

    const usersById = new Map(users.map((user) => [user.id, user]));
    const messagesByTicketId = new Map(messageCounts.map((row) => [row.ticket_id, row._count.ticket_id || 0]));
    const attachmentsByTicketId = new Map(attachmentCounts.map((row) => [row.ticket_id, row._count.ticket_id || 0]));

    const hydratedTickets = tickets.map((ticket) => {
      const owner = usersById.get(ticket.user_id) || null;
      const assigned = usersById.get(ticket.assigned_to_id) || null;
      return {
        ...ticket,
        user: owner,
        assigned_to: assigned,
        _count: {
          messages: messagesByTicketId.get(ticket.id) || 0,
          attachments: attachmentsByTicketId.get(ticket.id) || 0,
        },
      };
    });

    res.json({ tickets: hydratedTickets });
  } catch (error) {
    console.error('Failed to get admin tickets:', error);
    res.status(500).json({ error: 'Failed to load tickets' });
  }
});

// Admin: Get stats
router.get('/admin/stats', authMiddleware, async (req, res) => {
  try {
    const isAdmin = await isSupportAdminResolved(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const [totalOpen, unassigned, resolved, avgResponse] = await Promise.all([
      prisma.support_tickets.count({
        where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
      }),
      prisma.support_tickets.count({
        where: { assigned_to_id: null, status: { notIn: ['RESOLVED', 'CLOSED'] } },
      }),
      prisma.support_tickets.count({
        where: {
          status: { in: ['RESOLVED', 'CLOSED'] },
          created_at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.support_tickets.aggregate({
        _avg: { response_time_mins: true },
        where: { response_time_mins: { not: null } },
      }),
    ]);

    const totalLast30Days = await prisma.support_tickets.count({
      where: { created_at: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
    });

    res.json({
      totalOpen,
      unassigned,
      resolutionRate: totalLast30Days > 0 ? Math.round((resolved / totalLast30Days) * 100) : 0,
      avgResponseTime: avgResponse._avg.response_time_mins ?
        Math.round(avgResponse._avg.response_time_mins / 60) : null,
    });
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// Admin: Export tickets
router.get('/admin/export', authMiddleware, async (req, res) => {
  try {
    const isAdmin = await isSupportAdminResolved(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const tickets = await prisma.support_tickets.findMany({
      include: {
        user: true,
        assigned_to: true,
      },
      orderBy: { created_at: 'desc' },
    });

    // Generate CSV
    const csv = [
      ['Ticket Number', 'Subject', 'Status', 'Priority', 'User', 'Assigned To', 'Created', 'Resolved'].join(','),
      ...tickets.map(t => [
        t.ticket_number,
        `"${t.subject.replace(/"/g, '""')}"`,
        t.status,
        t.priority,
        `"${t.user.firstName} ${t.user.lastName}"`,
        t.assigned_to ? `"${t.assigned_to.firstName} ${t.assigned_to.lastName}"` : 'Unassigned',
        t.created_at.toISOString(),
        t.resolved_at ? t.resolved_at.toISOString() : '',
      ].join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=support-tickets.csv');
    res.send(csv);
  } catch (error) {
    console.error('Failed to export tickets:', error);
    res.status(500).json({ error: 'Failed to export tickets' });
  }
});

// AI Suggestions using GPT-4o-mini
router.post('/ai/suggestions', authMiddleware, async (req, res) => {
  try {
    const { subject, description, categories, priorities } = req.body;

    if (!description || description.length < 10) {
      return res.status(400).json({ error: 'Description too short for analysis' });
    }

    // If no OpenAI API key, use keyword-based fallback
    if (!OPENAI_API_KEY) {
      const fallback = getKeywordBasedSuggestions(subject, description, categories, priorities);
      return res.json(fallback);
    }

    const prompt = `You are a support ticket classifier for a CRM system used by a roofing/exteriors company. Analyze the following support ticket and suggest the most appropriate category and priority.

Subject: ${subject || 'Not provided'}
Description: ${description}

Available Categories: ${categories.join(', ')}
Available Priorities: ${priorities.join(', ')} (LOW = minor issue, MEDIUM = normal, HIGH = urgent/affecting work, URGENT = critical/blocking work)

Respond in JSON format only:
{
  "suggestedCategory": "category name",
  "suggestedPriority": "PRIORITY_VALUE",
  "reasoning": "Brief explanation of why you chose these (1-2 sentences)"
}`;

    const response = await callOpenAI(prompt);

    if (response.error) {
      // Fallback to keyword-based suggestions
      const fallback = getKeywordBasedSuggestions(subject, description, categories, priorities);
      return res.json(fallback);
    }

    res.json(response);
  } catch (error) {
    console.error('AI suggestions error:', error);
    // Return keyword-based fallback on error
    const { subject, description, categories, priorities } = req.body;
    const fallback = getKeywordBasedSuggestions(subject, description, categories || [], priorities || []);
    res.json(fallback);
  }
});

// Helper function to call OpenAI API
async function callOpenAI(prompt) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that classifies support tickets. Always respond with valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (parsed.choices && parsed.choices[0]?.message?.content) {
            const content = parsed.choices[0].message.content;
            // Parse the JSON from the response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              resolve(JSON.parse(jsonMatch[0]));
            } else {
              resolve({ error: 'Invalid response format' });
            }
          } else {
            resolve({ error: parsed.error?.message || 'API error' });
          }
        } catch (e) {
          resolve({ error: 'Failed to parse response' });
        }
      });
    });

    req.on('error', (e) => {
      resolve({ error: e.message });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ error: 'Request timeout' });
    });

    req.write(data);
    req.end();
  });
}

// Keyword-based fallback for AI suggestions
function getKeywordBasedSuggestions(subject, description, categories, priorities) {
  const text = `${subject} ${description}`.toLowerCase();

  // Category detection
  let suggestedCategory = 'Other';
  const categoryKeywords = {
    'Bug Report': ['bug', 'error', 'broken', 'not working', 'crash', 'fail', 'issue', 'wrong', 'incorrect'],
    'Feature Request': ['feature', 'request', 'add', 'new', 'would like', 'could you', 'enhancement', 'improve', 'suggestion'],
    'Technical Issue': ['technical', 'system', 'server', 'database', 'api', 'login', 'password', 'access', 'permission'],
    'Performance Issue': ['slow', 'performance', 'loading', 'speed', 'timeout', 'hang', 'freeze', 'lag'],
    'Integration Problem': ['integration', 'sync', 'salesforce', 'api', 'webhook', 'connect', 'adobe', 'twilio', 'sendgrid'],
    'Data Issue': ['data', 'missing', 'duplicate', 'lost', 'wrong data', 'incorrect data', 'sync', 'import', 'export'],
    'Account Question': ['account', 'user', 'profile', 'settings', 'billing', 'subscription'],
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(kw => text.includes(kw))) {
      if (categories.includes(category)) {
        suggestedCategory = category;
        break;
      }
    }
  }

  // Priority detection
  let suggestedPriority = 'MEDIUM';
  const urgentKeywords = ['urgent', 'critical', 'emergency', 'asap', 'immediately', 'blocking', 'cannot work', 'production down'];
  const highKeywords = ['important', 'affecting', 'impact', 'need help', 'stuck', 'broken', 'not working'];
  const lowKeywords = ['minor', 'when you have time', 'low priority', 'nice to have', 'eventually', 'suggestion'];

  if (urgentKeywords.some(kw => text.includes(kw))) {
    suggestedPriority = 'URGENT';
  } else if (highKeywords.some(kw => text.includes(kw))) {
    suggestedPriority = 'HIGH';
  } else if (lowKeywords.some(kw => text.includes(kw))) {
    suggestedPriority = 'LOW';
  }

  let reasoning = `Based on keywords detected: `;
  if (suggestedCategory !== 'Other') {
    reasoning += `Category set to "${suggestedCategory}" due to related terms. `;
  }
  if (suggestedPriority !== 'MEDIUM') {
    reasoning += `Priority set to "${suggestedPriority}" based on urgency indicators.`;
  } else {
    reasoning += `Default priority assigned.`;
  }

  return {
    suggestedCategory,
    suggestedPriority,
    reasoning,
  };
}

// Search for similar tickets
router.get('/tickets/similar', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 5) {
      return res.json({ tickets: [] });
    }

    // Search for similar tickets using basic text matching
    // Split search query into words for matching
    const searchWords = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    if (searchWords.length === 0) {
      return res.json({ tickets: [] });
    }

    // Get recent tickets (last 90 days) that might be similar
    const tickets = await prisma.support_tickets.findMany({
      where: {
        created_at: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
        },
        OR: [
          { subject: { contains: searchWords[0], mode: 'insensitive' } },
          { description: { contains: searchWords[0], mode: 'insensitive' } },
          ...(searchWords[1] ? [
            { subject: { contains: searchWords[1], mode: 'insensitive' } },
            { description: { contains: searchWords[1], mode: 'insensitive' } },
          ] : []),
        ],
      },
      select: {
        id: true,
        ticket_number: true,
        subject: true,
        status: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    // Score and rank results by relevance
    const scoredTickets = tickets.map(ticket => {
      const textToSearch = `${ticket.subject} ${ticket.description || ''}`.toLowerCase();
      let score = 0;

      searchWords.forEach(word => {
        if (textToSearch.includes(word)) {
          score += word.length; // Longer matching words score higher
        }
      });

      return { ...ticket, score };
    });

    // Sort by score and return top 5
    const sortedTickets = scoredTickets
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .filter(t => t.score > 0);

    res.json({ tickets: sortedTickets });
  } catch (error) {
    console.error('Similar tickets search error:', error);
    res.json({ tickets: [] });
  }
});

// Admin: Update ticket status/priority/assignment
router.patch('/admin/tickets/:id', authMiddleware, async (req, res) => {
  try {
    const isAdmin = await isSupportAdminResolved(req);
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const { status, priority, assigned_to_id } = req.body;
    const updateData = {};

    if (status) updateData.status = status;
    if (priority) updateData.priority = priority;
    if (assigned_to_id !== undefined) updateData.assigned_to_id = assigned_to_id;

    // If resolving, record resolution time
    if (status === 'RESOLVED' || status === 'CLOSED') {
      const ticket = await prisma.support_tickets.findUnique({
        where: { id: req.params.id },
      });

      if (ticket && !ticket.resolved_at) {
        updateData.resolved_at = new Date();
        updateData.resolved_by_id = getRequestUserId(req);

        const diffMs = new Date() - new Date(ticket.created_at);
        updateData.resolution_time_mins = Math.floor(diffMs / 60000);
      }
    }

    const ticket = await prisma.support_tickets.update({
      where: { id: req.params.id },
      data: updateData,
    });

    res.json({ ticket });
  } catch (error) {
    console.error('Failed to update ticket:', error);
    res.status(500).json({ error: 'Failed to update ticket' });
  }
});

export default router;
