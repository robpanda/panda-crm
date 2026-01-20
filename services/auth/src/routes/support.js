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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// S3 configuration
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'panda-crm-support';

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
    const tickets = await prisma.support_tickets.findMany({
      where: { user_id: req.user.id },
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
    const ticket = await prisma.support_tickets.findFirst({
      where: {
        id: req.params.id,
        user_id: req.user.id, // Users can only see their own tickets
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
      where: { ticket_id: req.params.id },
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

    res.json({ ticket, messages });
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
        user_id: req.user.id,
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
            uploaded_by_id: req.user.id,
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
    const { message, attachments } = req.body;

    // Verify ticket belongs to user or user is admin
    const ticket = await prisma.support_tickets.findFirst({
      where: {
        id: req.params.id,
        OR: [
          { user_id: req.user.id },
          { assigned_to_id: req.user.id },
        ],
      },
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    // Create message
    const newMessage = await prisma.support_ticket_messages.create({
      data: {
        ticket_id: req.params.id,
        user_id: req.user.id,
        message,
        is_internal: false,
      },
    });

    // Update ticket timestamps
    const isUserMessage = req.user.id === ticket.user_id;
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
      where: { id: req.params.id },
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
    const isAdmin = req.user.roleType?.toLowerCase() === 'admin' ||
                    req.user.role?.name?.toLowerCase()?.includes('admin');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const tickets = await prisma.support_tickets.findMany({
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
        _count: {
          select: {
            messages: true,
            attachments: true,
          },
        },
      },
      orderBy: [
        { status: 'asc' },
        { priority: 'desc' },
        { created_at: 'desc' },
      ],
    });

    res.json({ tickets });
  } catch (error) {
    console.error('Failed to get admin tickets:', error);
    res.status(500).json({ error: 'Failed to load tickets' });
  }
});

// Admin: Get stats
router.get('/admin/stats', authMiddleware, async (req, res) => {
  try {
    const isAdmin = req.user.roleType?.toLowerCase() === 'admin' ||
                    req.user.role?.name?.toLowerCase()?.includes('admin');
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
    const isAdmin = req.user.roleType?.toLowerCase() === 'admin' ||
                    req.user.role?.name?.toLowerCase()?.includes('admin');
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
    const isAdmin = req.user.roleType?.toLowerCase() === 'admin' ||
                    req.user.role?.name?.toLowerCase()?.includes('admin');
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
        updateData.resolved_by_id = req.user.id;

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
