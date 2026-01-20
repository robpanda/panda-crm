/**
 * RingCentral App Connect Connector for Panda CRM
 *
 * Implements the full App Connect server interface for:
 * - Contact matching (call pop)
 * - Call logging
 * - SMS/Message logging
 * - OAuth authentication
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { PrismaClient } from '@prisma/client';
import { logger } from './middleware/logger.js';
import manifest from './manifest.json' assert { type: 'json' };

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3020;

// JWT secret for connector tokens
const JWT_SECRET = process.env.RC_CONNECTOR_JWT_SECRET || 'panda-rc-connector-secret';

// Cognito JWT verifier for frontend tokens
let cognitoVerifier = null;
function getCognitoVerifier() {
  if (!cognitoVerifier && process.env.COGNITO_USER_POOL_ID && process.env.COGNITO_CLIENT_ID) {
    cognitoVerifier = CognitoJwtVerifier.create({
      userPoolId: process.env.COGNITO_USER_POOL_ID,
      tokenUse: 'access',
      clientId: process.env.COGNITO_CLIENT_ID,
    });
  }
  return cognitoVerifier;
}

// Create router for /api/ringcentral prefix
const router = express.Router();

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: [
    'chrome-extension://*',
    'https://crm.pandaadmin.com',
    'https://bamboo.pandaadmin.com',
    'https://app.ringcentral.com',
    'https://appconnect.labs.ringcentral.com'
  ],
  credentials: true
}));
app.use(express.json());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

// Mount router at /api/ringcentral
app.use('/api/ringcentral', router);

// Also handle root paths for direct access
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'ringcentral-connector',
    version: manifest.version
  });
});

// ============================================
// MANIFEST ENDPOINT
// ============================================

router.get('/manifest', (req, res) => {
  res.json(manifest);
});

// ============================================
// AUTHENTICATION ENDPOINTS
// ============================================

/**
 * Get authentication type
 * Returns: { type: 'oauth' | 'apiKey' }
 */
router.get('/auth-type', (req, res) => {
  res.json({ type: 'oauth' });
});

/**
 * Get OAuth configuration
 */
router.get('/oauth-info', (req, res) => {
  res.json({
    clientId: process.env.PANDA_OAUTH_CLIENT_ID || 'panda-crm-client',
    authorizationUri: `${process.env.API_BASE_URL || 'https://bamboo.pandaadmin.com'}/api/ringcentral/oauth/authorize`,
    tokenUri: `${process.env.API_BASE_URL || 'https://bamboo.pandaadmin.com'}/api/ringcentral/oauth/token`,
    revokeUri: `${process.env.API_BASE_URL || 'https://bamboo.pandaadmin.com'}/api/ringcentral/oauth/revoke`,
    scopes: ['contacts:read', 'contacts:write', 'activities:write']
  });
});

/**
 * OAuth Authorization endpoint
 * Redirects to Cognito or our auth system
 */
router.get('/oauth/authorize', (req, res) => {
  const { redirect_uri, state, client_id } = req.query;

  // For now, redirect to our CRM login with the callback info
  const authUrl = new URL('https://crm.pandaadmin.com/login');
  authUrl.searchParams.set('redirect_uri', redirect_uri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('client_id', client_id);
  authUrl.searchParams.set('response_type', 'code');

  res.redirect(authUrl.toString());
});

/**
 * OAuth Token exchange endpoint
 */
router.post('/oauth/token', async (req, res) => {
  try {
    const { grant_type, code, refresh_token, redirect_uri } = req.body;

    if (grant_type === 'authorization_code') {
      // Exchange auth code for tokens
      // In production, validate the code against our auth system

      // For now, decode the code which contains user info
      const userData = JSON.parse(Buffer.from(code, 'base64').toString());

      const accessToken = jwt.sign(
        {
          userId: userData.userId,
          email: userData.email,
          platform: 'pandacrm'
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      const refreshTokenValue = jwt.sign(
        { userId: userData.userId, type: 'refresh' },
        JWT_SECRET,
        { expiresIn: '30d' }
      );

      res.json({
        access_token: accessToken,
        refresh_token: refreshTokenValue,
        token_type: 'Bearer',
        expires_in: 3600
      });
    } else if (grant_type === 'refresh_token') {
      // Refresh the access token
      const decoded = jwt.verify(refresh_token, JWT_SECRET);

      const newAccessToken = jwt.sign(
        {
          userId: decoded.userId,
          platform: 'pandacrm'
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      res.json({
        access_token: newAccessToken,
        token_type: 'Bearer',
        expires_in: 3600
      });
    } else {
      res.status(400).json({ error: 'unsupported_grant_type' });
    }
  } catch (error) {
    logger.error('OAuth token error:', error);
    res.status(401).json({ error: 'invalid_grant' });
  }
});

/**
 * OAuth Revoke endpoint
 */
router.post('/oauth/revoke', async (req, res) => {
  // In production, invalidate the token in our system
  res.json({ success: true });
});

/**
 * Unauthorize - called when user disconnects
 */
router.post('/unauthorize', async (req, res) => {
  try {
    const token = extractToken(req);
    if (token) {
      // Could store revoked tokens in a blacklist
      logger.info('User disconnected from RingCentral connector');
    }
    res.json({ success: true });
  } catch (error) {
    res.json({ success: true }); // Always succeed for disconnect
  }
});

// ============================================
// USER ENDPOINTS
// ============================================

/**
 * Get current user info
 */
router.get('/user-info', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      timezone: 'America/New_York'
    });
  } catch (error) {
    logger.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

/**
 * Get list of users (for assignment dropdowns)
 */
router.get('/user-list', authenticateToken, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true
      },
      orderBy: { lastName: 'asc' }
    });

    res.json({
      users: users.map(u => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email
      }))
    });
  } catch (error) {
    logger.error('Error fetching user list:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ============================================
// CONTACT MATCHING ENDPOINTS (Call Pop)
// ============================================

/**
 * Find contact by phone number
 * This is called on incoming/outgoing calls for call pop
 */
router.get('/find-contact', authenticateToken, async (req, res) => {
  try {
    const { phoneNumber } = req.query;

    if (!phoneNumber) {
      return res.json({ contacts: [] });
    }

    // Clean phone number for matching
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    const phoneVariants = generatePhoneVariants(cleanPhone);

    // Search contacts
    const contacts = await prisma.contact.findMany({
      where: {
        OR: [
          { phone: { in: phoneVariants } },
          { mobilePhone: { in: phoneVariants } },
          { homePhone: { in: phoneVariants } },
          { otherPhone: { in: phoneVariants } }
        ]
      },
      include: {
        account: {
          select: { id: true, name: true }
        }
      },
      take: 10
    });

    // Also search leads
    const leads = await prisma.lead.findMany({
      where: {
        OR: [
          { phone: { in: phoneVariants } },
          { mobilePhone: { in: phoneVariants } }
        ],
        isConverted: false
      },
      take: 10
    });

    const results = [
      ...contacts.map(c => ({
        id: c.id,
        type: 'Contact',
        name: c.fullName || `${c.firstName} ${c.lastName}`,
        firstName: c.firstName,
        lastName: c.lastName,
        phone: c.mobilePhone || c.phone,
        email: c.email,
        accountName: c.account?.name,
        accountId: c.accountId,
        pageUrl: `/contacts/${c.id}`
      })),
      ...leads.map(l => ({
        id: l.id,
        type: 'Lead',
        name: `${l.firstName} ${l.lastName}`,
        firstName: l.firstName,
        lastName: l.lastName,
        phone: l.mobilePhone || l.phone,
        email: l.email,
        company: l.company,
        pageUrl: `/leads/${l.id}`
      }))
    ];

    res.json({
      contacts: results,
      matchedCount: results.length
    });
  } catch (error) {
    logger.error('Error finding contact:', error);
    res.status(500).json({ error: 'Failed to search contacts' });
  }
});

/**
 * Find contact by name
 */
router.get('/find-contact-with-name', authenticateToken, async (req, res) => {
  try {
    const { name } = req.query;

    if (!name || name.length < 2) {
      return res.json({ contacts: [] });
    }

    const contacts = await prisma.contact.findMany({
      where: {
        OR: [
          { firstName: { contains: name, mode: 'insensitive' } },
          { lastName: { contains: name, mode: 'insensitive' } },
          { fullName: { contains: name, mode: 'insensitive' } }
        ]
      },
      include: {
        account: { select: { id: true, name: true } }
      },
      take: 20
    });

    const leads = await prisma.lead.findMany({
      where: {
        OR: [
          { firstName: { contains: name, mode: 'insensitive' } },
          { lastName: { contains: name, mode: 'insensitive' } }
        ],
        isConverted: false
      },
      take: 10
    });

    const results = [
      ...contacts.map(c => ({
        id: c.id,
        type: 'Contact',
        name: c.fullName || `${c.firstName} ${c.lastName}`,
        phone: c.mobilePhone || c.phone,
        email: c.email,
        accountName: c.account?.name,
        pageUrl: `/contacts/${c.id}`
      })),
      ...leads.map(l => ({
        id: l.id,
        type: 'Lead',
        name: `${l.firstName} ${l.lastName}`,
        phone: l.mobilePhone || l.phone,
        email: l.email,
        company: l.company,
        pageUrl: `/leads/${l.id}`
      }))
    ];

    res.json({ contacts: results });
  } catch (error) {
    logger.error('Error finding contact by name:', error);
    res.status(500).json({ error: 'Failed to search contacts' });
  }
});

/**
 * Create a new contact
 */
router.post('/create-contact', authenticateToken, async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      email,
      type = 'Lead'
    } = req.body;

    if (type === 'Lead') {
      const lead = await prisma.lead.create({
        data: {
          firstName,
          lastName,
          phone,
          mobilePhone: phone,
          email,
          status: 'NEW',
          source: 'RingCentral',
          ownerId: req.user.userId
        }
      });

      res.json({
        id: lead.id,
        type: 'Lead',
        name: `${firstName} ${lastName}`,
        pageUrl: `/leads/${lead.id}`
      });
    } else {
      const contact = await prisma.contact.create({
        data: {
          firstName,
          lastName,
          fullName: `${firstName} ${lastName}`,
          phone,
          mobilePhone: phone,
          email
        }
      });

      res.json({
        id: contact.id,
        type: 'Contact',
        name: `${firstName} ${lastName}`,
        pageUrl: `/contacts/${contact.id}`
      });
    }
  } catch (error) {
    logger.error('Error creating contact:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

// ============================================
// CALL LOGGING ENDPOINTS
// ============================================

/**
 * Create a call log entry
 */
router.post('/create-call-log', authenticateToken, async (req, res) => {
  try {
    const {
      contactId,
      contactType,
      direction,
      fromNumber,
      toNumber,
      startTime,
      duration,
      result,
      note,
      recordingUrl,
      transcription,
      disposition,
      opportunityId,
      workOrderId,
      rcCallId
    } = req.body;

    // Determine the related record
    let accountId = null;
    let leadId = null;
    let contactRefId = null;

    if (contactType === 'Lead') {
      leadId = contactId;
    } else if (contactType === 'Contact') {
      contactRefId = contactId;
      // Get account from contact
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { accountId: true }
      });
      accountId = contact?.accountId;
    }

    // Format duration
    const durationFormatted = formatDuration(duration);

    // Build activity description
    let description = `${direction === 'inbound' ? 'Inbound' : 'Outbound'} call`;
    if (duration) {
      description += ` (${durationFormatted})`;
    }
    if (disposition) {
      description += ` - ${disposition}`;
    }
    if (note) {
      description += `\n\nNotes: ${note}`;
    }
    if (recordingUrl) {
      description += `\n\nRecording: ${recordingUrl}`;
    }
    if (transcription) {
      description += `\n\nTranscription:\n${transcription}`;
    }

    // Create activity record
    const activity = await prisma.activity.create({
      data: {
        type: 'CALL',
        subject: `${direction === 'inbound' ? 'Inbound' : 'Outbound'} Call`,
        description,
        status: 'COMPLETED',
        activityDate: new Date(startTime),
        durationMinutes: Math.ceil(duration / 60),
        accountId,
        contactId: contactRefId,
        leadId,
        opportunityId,
        workOrderId,
        ownerId: req.user.userId,
        metadata: {
          rcCallId,
          direction,
          fromNumber,
          toNumber,
          duration,
          disposition,
          recordingUrl
        }
      }
    });

    logger.info(`Call logged: ${activity.id} for ${contactType} ${contactId}`);

    res.json({
      id: activity.id,
      success: true,
      message: 'Call logged successfully',
      pageUrl: `/activities/${activity.id}`
    });
  } catch (error) {
    logger.error('Error creating call log:', error);
    res.status(500).json({ error: 'Failed to log call' });
  }
});

/**
 * Get an existing call log
 */
router.get('/call-log/:id', authenticateToken, async (req, res) => {
  try {
    const activity = await prisma.activity.findUnique({
      where: { id: req.params.id },
      include: {
        contact: { select: { firstName: true, lastName: true } },
        lead: { select: { firstName: true, lastName: true } },
        account: { select: { name: true } }
      }
    });

    if (!activity) {
      return res.status(404).json({ error: 'Call log not found' });
    }

    res.json({
      id: activity.id,
      subject: activity.subject,
      description: activity.description,
      duration: activity.durationMinutes * 60,
      activityDate: activity.activityDate,
      contactName: activity.contact
        ? `${activity.contact.firstName} ${activity.contact.lastName}`
        : activity.lead
          ? `${activity.lead.firstName} ${activity.lead.lastName}`
          : null,
      accountName: activity.account?.name,
      metadata: activity.metadata
    });
  } catch (error) {
    logger.error('Error fetching call log:', error);
    res.status(500).json({ error: 'Failed to fetch call log' });
  }
});

/**
 * Update an existing call log
 */
router.patch('/call-log/:id', authenticateToken, async (req, res) => {
  try {
    const { note, disposition, subject, duration } = req.body;

    const updateData = {};
    if (note !== undefined) {
      updateData.description = note;
    }
    if (subject !== undefined) {
      updateData.subject = subject;
    }
    if (duration !== undefined) {
      updateData.durationMinutes = Math.ceil(duration / 60);
    }
    if (disposition !== undefined) {
      updateData.metadata = {
        ...(await prisma.activity.findUnique({
          where: { id: req.params.id },
          select: { metadata: true }
        }))?.metadata,
        disposition
      };
    }

    const activity = await prisma.activity.update({
      where: { id: req.params.id },
      data: updateData
    });

    res.json({
      id: activity.id,
      success: true,
      message: 'Call log updated'
    });
  } catch (error) {
    logger.error('Error updating call log:', error);
    res.status(500).json({ error: 'Failed to update call log' });
  }
});

/**
 * Update call disposition
 */
router.post('/upsert-call-disposition', authenticateToken, async (req, res) => {
  try {
    const { callLogId, disposition, opportunityId, workOrderId } = req.body;

    const activity = await prisma.activity.update({
      where: { id: callLogId },
      data: {
        opportunityId,
        workOrderId,
        metadata: {
          ...(await prisma.activity.findUnique({
            where: { id: callLogId },
            select: { metadata: true }
          }))?.metadata,
          disposition
        }
      }
    });

    res.json({ success: true, id: activity.id });
  } catch (error) {
    logger.error('Error updating call disposition:', error);
    res.status(500).json({ error: 'Failed to update disposition' });
  }
});

// ============================================
// MESSAGE LOGGING ENDPOINTS
// ============================================

/**
 * Create a message log entry (SMS, Voicemail, Fax)
 */
router.post('/create-message-log', authenticateToken, async (req, res) => {
  try {
    const {
      contactId,
      contactType,
      direction,
      messageType, // 'sms', 'voicemail', 'fax'
      fromNumber,
      toNumber,
      timestamp,
      messages, // Array of { text, direction, timestamp }
      note,
      conversationId
    } = req.body;

    // Determine the related record
    let accountId = null;
    let leadId = null;
    let contactRefId = null;

    if (contactType === 'Lead') {
      leadId = contactId;
    } else if (contactType === 'Contact') {
      contactRefId = contactId;
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { accountId: true }
      });
      accountId = contact?.accountId;
    }

    // Build message content
    let description = '';
    if (messages && messages.length > 0) {
      description = messages.map(m => {
        const dir = m.direction === 'inbound' ? 'Received' : 'Sent';
        const time = new Date(m.timestamp).toLocaleString();
        return `[${time}] ${dir}: ${m.text}`;
      }).join('\n\n');
    }

    if (note) {
      description += `\n\nNotes: ${note}`;
    }

    const typeMap = {
      'sms': 'SMS',
      'voicemail': 'VOICEMAIL',
      'fax': 'FAX'
    };

    const activity = await prisma.activity.create({
      data: {
        type: typeMap[messageType] || 'SMS',
        subject: `${messageType.toUpperCase()} ${direction === 'inbound' ? 'from' : 'to'} ${fromNumber || toNumber}`,
        description,
        status: 'COMPLETED',
        activityDate: new Date(timestamp),
        accountId,
        contactId: contactRefId,
        leadId,
        ownerId: req.user.userId,
        metadata: {
          messageType,
          direction,
          fromNumber,
          toNumber,
          conversationId,
          messageCount: messages?.length || 1
        }
      }
    });

    logger.info(`Message logged: ${activity.id} (${messageType})`);

    res.json({
      id: activity.id,
      success: true,
      message: 'Message logged successfully',
      pageUrl: `/activities/${activity.id}`
    });
  } catch (error) {
    logger.error('Error creating message log:', error);
    res.status(500).json({ error: 'Failed to log message' });
  }
});

/**
 * Update an existing message log (append new messages)
 */
router.patch('/message-log/:id', authenticateToken, async (req, res) => {
  try {
    const { messages, note } = req.body;

    const existing = await prisma.activity.findUnique({
      where: { id: req.params.id },
      select: { description: true, metadata: true }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Message log not found' });
    }

    let newDescription = existing.description || '';

    if (messages && messages.length > 0) {
      const newMessages = messages.map(m => {
        const dir = m.direction === 'inbound' ? 'Received' : 'Sent';
        const time = new Date(m.timestamp).toLocaleString();
        return `[${time}] ${dir}: ${m.text}`;
      }).join('\n\n');

      newDescription += '\n\n' + newMessages;
    }

    if (note) {
      newDescription += `\n\nNotes: ${note}`;
    }

    const activity = await prisma.activity.update({
      where: { id: req.params.id },
      data: {
        description: newDescription,
        metadata: {
          ...existing.metadata,
          messageCount: (existing.metadata?.messageCount || 0) + (messages?.length || 0)
        }
      }
    });

    res.json({
      id: activity.id,
      success: true,
      message: 'Message log updated'
    });
  } catch (error) {
    logger.error('Error updating message log:', error);
    res.status(500).json({ error: 'Failed to update message log' });
  }
});

// ============================================
// ADDITIONAL DATA ENDPOINTS
// ============================================

/**
 * Get opportunities for a contact (for linking calls)
 */
router.get('/opportunities', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.query;

    const opportunities = await prisma.opportunity.findMany({
      where: {
        contactId,
        stage: { not: 'CLOSED_LOST' }
      },
      select: {
        id: true,
        name: true,
        stage: true,
        amount: true
      },
      orderBy: { updatedAt: 'desc' },
      take: 20
    });

    res.json({
      options: opportunities.map(o => ({
        value: o.id,
        label: `${o.name} (${o.stage})`,
        amount: o.amount
      }))
    });
  } catch (error) {
    logger.error('Error fetching opportunities:', error);
    res.status(500).json({ error: 'Failed to fetch opportunities' });
  }
});

/**
 * Get work orders for a contact
 */
router.get('/workorders', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.query;

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { accountId: true }
    });

    const workOrders = await prisma.workOrder.findMany({
      where: {
        OR: [
          { contactId },
          { accountId: contact?.accountId }
        ],
        status: { not: 'COMPLETED' }
      },
      select: {
        id: true,
        subject: true,
        workType: true,
        status: true
      },
      orderBy: { updatedAt: 'desc' },
      take: 20
    });

    res.json({
      options: workOrders.map(wo => ({
        value: wo.id,
        label: `${wo.subject} (${wo.workType})`,
        status: wo.status
      }))
    });
  } catch (error) {
    logger.error('Error fetching work orders:', error);
    res.status(500).json({ error: 'Failed to fetch work orders' });
  }
});

/**
 * Get license status (required by App Connect)
 */
router.get('/license-status', authenticateToken, async (req, res) => {
  res.json({
    licensed: true,
    plan: 'enterprise',
    features: {
      callLogging: true,
      messageLogging: true,
      contactMatching: true,
      callRecording: true,
      aiTranscription: true
    }
  });
});

/**
 * Get log format type
 */
router.get('/log-format-type', (req, res) => {
  res.json({ type: 'html' });
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return req.query.token || req.query.jwtToken;
}

async function authenticateToken(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // Try 1: Verify as RC connector JWT
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    // RC connector JWT verification failed, try Cognito
  }

  // Try 2: Verify as Cognito token
  try {
    const cognitoVerifier = getCognitoVerifier();
    if (cognitoVerifier) {
      const payload = await cognitoVerifier.verify(token);
      req.user = {
        userId: payload.sub,
        email: payload.email || payload.username,
        role: payload['custom:role'] || 'user',
        cognitoId: payload.sub,
      };
      return next();
    }
  } catch (error) {
    logger.warn('Cognito verification failed:', error.message);
  }

  // Try 3: Decode as basic JWT (backwards compatibility)
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    if (payload.sub || payload.userId) {
      req.user = {
        userId: payload.sub || payload.userId,
        email: payload.email,
        role: payload.role || payload['custom:role'] || 'user',
        cognitoId: payload.sub,
      };
      return next();
    }
  } catch (error) {
    logger.warn('JWT decode failed:', error.message);
  }

  return res.status(401).json({ error: 'Invalid token' });
}

function generatePhoneVariants(phone) {
  const variants = [phone];

  // Without country code
  if (phone.startsWith('1') && phone.length === 11) {
    variants.push(phone.substring(1));
  }

  // With country code
  if (phone.length === 10) {
    variants.push('1' + phone);
    variants.push('+1' + phone);
  }

  // Various formats
  if (phone.length === 10) {
    variants.push(`(${phone.substring(0, 3)}) ${phone.substring(3, 6)}-${phone.substring(6)}`);
    variants.push(`${phone.substring(0, 3)}-${phone.substring(3, 6)}-${phone.substring(6)}`);
    variants.push(`${phone.substring(0, 3)}.${phone.substring(3, 6)}.${phone.substring(6)}`);
  }

  return variants;
}

function formatDuration(seconds) {
  if (!seconds) return '0:00';

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

// ============================================
// ERROR HANDLING
// ============================================

app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
  logger.info(`RingCentral Connector running on port ${PORT}`);
});

export default app;
