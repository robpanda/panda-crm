// Five9 Call Center Integration Service
// Handles call logging, recording sync, and AI transcription
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

// Five9 API configuration
const FIVE9_API_BASE = process.env.FIVE9_API_URL || 'https://api.five9.com';
const FIVE9_USERNAME = process.env.FIVE9_USERNAME;
const FIVE9_PASSWORD = process.env.FIVE9_PASSWORD;

class Five9Service {
  constructor() {
    this.sessionId = null;
    this.sessionExpiry = null;
  }

  // ==========================================
  // Authentication
  // ==========================================

  async getAuthToken() {
    // Check if we have a valid session
    if (this.sessionId && this.sessionExpiry > Date.now()) {
      return this.sessionId;
    }

    try {
      const credentials = Buffer.from(`${FIVE9_USERNAME}:${FIVE9_PASSWORD}`).toString('base64');

      const response = await fetch(`${FIVE9_API_BASE}/appsvcs/rs/svc/auth/login`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Five9 auth failed: ${response.status}`);
      }

      const data = await response.json();
      this.sessionId = data.tokenId;
      this.sessionExpiry = Date.now() + (30 * 60 * 1000); // 30 minute session

      return this.sessionId;
    } catch (error) {
      logger.error('Five9 authentication error:', error);
      throw error;
    }
  }

  async makeRequest(endpoint, options = {}) {
    const token = await this.getAuthToken();

    const response = await fetch(`${FIVE9_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Five9 API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  // ==========================================
  // Call Data Sync
  // ==========================================

  /**
   * Sync call data from Five9 to local database
   */
  async syncCallData(options = {}) {
    const {
      startDate = new Date(Date.now() - 24 * 60 * 60 * 1000), // Default last 24 hours
      endDate = new Date(),
      campaignIds = [],
    } = options;

    try {
      logger.info(`Syncing Five9 calls from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Get call logs from Five9
      const callData = await this.getCallLogs(startDate, endDate, campaignIds);

      let synced = 0;
      let skipped = 0;
      let errors = 0;

      for (const call of callData) {
        try {
          // Check if call already exists
          const existing = await prisma.callLog.findUnique({
            where: { five9CallId: call.callId },
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Find matching records
          const matchedRecords = await this.matchCallToRecords(call.ani);

          // Create call log
          await prisma.callLog.create({
            data: {
              five9CallId: call.callId,
              five9SessionId: call.sessionId,
              five9CampaignId: call.campaignId,
              five9CampaignName: call.campaignName,
              five9AgentId: call.agentId,
              five9AgentName: call.agentName,
              direction: this.mapDirection(call.callType),
              callType: 'VOICE',
              phoneNumber: call.ani,
              formattedPhone: this.formatPhone(call.ani),
              startTime: new Date(call.startTime),
              endTime: call.endTime ? new Date(call.endTime) : null,
              duration: call.duration,
              ringTime: call.ringTime,
              holdTime: call.holdTime,
              talkTime: call.talkTime,
              disposition: call.disposition,
              dispositionName: call.dispositionName,
              dispositionNotes: call.notes,
              recordingUrl: call.recordingUrl,
              recordingDuration: call.recordingDuration,
              ...matchedRecords,
            },
          });

          synced++;
        } catch (error) {
          logger.error(`Error syncing call ${call.callId}:`, error);
          errors++;
        }
      }

      logger.info(`Five9 sync complete: ${synced} synced, ${skipped} skipped, ${errors} errors`);

      return { synced, skipped, errors, total: callData.length };
    } catch (error) {
      logger.error('Five9 sync error:', error);
      throw error;
    }
  }

  /**
   * Get call logs from Five9 API
   */
  async getCallLogs(startDate, endDate, campaignIds = []) {
    // Five9 Statistics API call
    // This would use their reporting API to get call detail records
    const params = new URLSearchParams({
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });

    if (campaignIds.length > 0) {
      params.append('campaigns', campaignIds.join(','));
    }

    try {
      const data = await this.makeRequest(`/appsvcs/rs/svc/orgs/${process.env.FIVE9_ORG_ID}/call_logs?${params}`);
      return data.callLogs || [];
    } catch (error) {
      // If API not configured, return empty for now
      logger.warn('Five9 API not configured or unavailable:', error.message);
      return [];
    }
  }

  // ==========================================
  // Record Matching
  // ==========================================

  /**
   * Match a phone number to existing CRM records
   */
  async matchCallToRecords(phoneNumber) {
    const normalized = this.normalizePhone(phoneNumber);
    const result = {
      opportunityId: null,
      accountId: null,
      contactId: null,
      leadId: null,
      userId: null,
    };

    // Try to find a contact first
    const contact = await prisma.contact.findFirst({
      where: {
        OR: [
          { phone: { contains: normalized } },
          { mobilePhone: { contains: normalized } },
          { smsNumber: { contains: normalized } },
        ],
      },
      include: {
        account: true,
        opportunities: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (contact) {
      result.contactId = contact.id;
      result.accountId = contact.accountId;
      if (contact.opportunities.length > 0) {
        result.opportunityId = contact.opportunities[0].id;
      }
      return result;
    }

    // Try to find a lead
    const lead = await prisma.lead.findFirst({
      where: {
        OR: [
          { phone: { contains: normalized } },
          { mobilePhone: { contains: normalized } },
        ],
      },
    });

    if (lead) {
      result.leadId = lead.id;
      return result;
    }

    // Try to find an account by phone
    const account = await prisma.account.findFirst({
      where: { phone: { contains: normalized } },
    });

    if (account) {
      result.accountId = account.id;

      // Get most recent opportunity
      const opportunity = await prisma.opportunity.findFirst({
        where: { accountId: account.id },
        orderBy: { createdAt: 'desc' },
      });

      if (opportunity) {
        result.opportunityId = opportunity.id;
      }
    }

    return result;
  }

  // ==========================================
  // Call Logging (Manual Entry)
  // ==========================================

  /**
   * Log a call manually (from Salesforce or frontend)
   */
  async logCall(data) {
    const {
      phoneNumber,
      direction = 'OUTBOUND',
      duration,
      notes,
      disposition,
      opportunityId,
      accountId,
      contactId,
      leadId,
      userId,
    } = data;

    // If no explicit links, try to match
    let matchedRecords = {};
    if (!opportunityId && !accountId && !contactId && !leadId) {
      matchedRecords = await this.matchCallToRecords(phoneNumber);
    }

    const callLog = await prisma.callLog.create({
      data: {
        callType: 'MANUAL',
        direction,
        phoneNumber,
        formattedPhone: this.formatPhone(phoneNumber),
        startTime: new Date(),
        duration,
        disposition,
        dispositionNotes: notes,
        opportunityId: opportunityId || matchedRecords.opportunityId,
        accountId: accountId || matchedRecords.accountId,
        contactId: contactId || matchedRecords.contactId,
        leadId: leadId || matchedRecords.leadId,
        userId,
      },
      include: {
        opportunity: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return callLog;
  }

  // ==========================================
  // Recording & Transcription
  // ==========================================

  /**
   * Fetch recording URL for a call
   */
  async getRecordingUrl(callId) {
    try {
      const data = await this.makeRequest(
        `/appsvcs/rs/svc/orgs/${process.env.FIVE9_ORG_ID}/recordings/${callId}`
      );
      return data.url;
    } catch (error) {
      logger.error(`Error fetching recording for call ${callId}:`, error);
      return null;
    }
  }

  /**
   * Request AI transcription for a call
   */
  async requestTranscription(callLogId) {
    const callLog = await prisma.callLog.findUnique({
      where: { id: callLogId },
    });

    if (!callLog || !callLog.recordingUrl) {
      throw new Error('Call log not found or has no recording');
    }

    // Mark as pending transcription
    await prisma.callLog.update({
      where: { id: callLogId },
      data: { transcriptionStatus: 'PENDING' },
    });

    // In a real implementation, this would:
    // 1. Download the recording
    // 2. Send to transcription service (OpenAI Whisper, AWS Transcribe, etc.)
    // 3. Update the call log when complete

    // For now, return the pending status
    return { status: 'PENDING', callLogId };
  }

  /**
   * Update transcription when complete
   */
  async updateTranscription(callLogId, transcription, aiAnalysis = null) {
    const updateData = {
      transcription,
      transcriptionStatus: 'COMPLETED',
    };

    if (aiAnalysis) {
      updateData.sentiment = aiAnalysis.sentiment;
      updateData.summary = aiAnalysis.summary;
      updateData.keyPoints = aiAnalysis.keyPoints;
      updateData.nextActions = aiAnalysis.nextActions;
      updateData.aiAnalyzedAt = new Date();
    }

    return prisma.callLog.update({
      where: { id: callLogId },
      data: updateData,
    });
  }

  // ==========================================
  // Statistics & Reporting
  // ==========================================

  /**
   * Get call statistics for a user or team
   */
  async getCallStats(options = {}) {
    const { userId, startDate, endDate, groupBy = 'day' } = options;

    const where = {};
    if (userId) where.userId = userId;
    if (startDate) where.startTime = { gte: startDate };
    if (endDate) where.startTime = { ...where.startTime, lte: endDate };

    const stats = await prisma.callLog.aggregate({
      where,
      _count: { id: true },
      _sum: { duration: true, talkTime: true },
      _avg: { duration: true },
    });

    const byDirection = await prisma.callLog.groupBy({
      by: ['direction'],
      where,
      _count: { id: true },
    });

    const byDisposition = await prisma.callLog.groupBy({
      by: ['disposition'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    return {
      totalCalls: stats._count.id,
      totalDuration: stats._sum.duration || 0,
      totalTalkTime: stats._sum.talkTime || 0,
      avgDuration: Math.round(stats._avg.duration || 0),
      byDirection: byDirection.reduce((acc, item) => {
        acc[item.direction] = item._count.id;
        return acc;
      }, {}),
      topDispositions: byDisposition.map(d => ({
        disposition: d.disposition,
        count: d._count.id,
      })),
    };
  }

  /**
   * Get recent calls for an opportunity
   */
  async getCallsForOpportunity(opportunityId, limit = 10) {
    return prisma.callLog.findMany({
      where: { opportunityId },
      orderBy: { startTime: 'desc' },
      take: limit,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // ==========================================
  // Webhook Handler
  // ==========================================

  /**
   * Handle Five9 webhook events
   */
  async handleWebhook(event) {
    const { eventType, data } = event;

    logger.info(`Five9 webhook: ${eventType}`);

    switch (eventType) {
      case 'call.completed':
        await this.handleCallCompleted(data);
        break;
      case 'recording.available':
        await this.handleRecordingAvailable(data);
        break;
      case 'disposition.updated':
        await this.handleDispositionUpdated(data);
        break;
      default:
        logger.warn(`Unhandled Five9 event: ${eventType}`);
    }
  }

  async handleCallCompleted(data) {
    // Sync this specific call
    const matchedRecords = await this.matchCallToRecords(data.ani);

    await prisma.callLog.upsert({
      where: { five9CallId: data.callId },
      create: {
        five9CallId: data.callId,
        five9SessionId: data.sessionId,
        five9CampaignId: data.campaignId,
        five9CampaignName: data.campaignName,
        five9AgentId: data.agentId,
        five9AgentName: data.agentName,
        direction: this.mapDirection(data.callType),
        callType: 'VOICE',
        phoneNumber: data.ani,
        formattedPhone: this.formatPhone(data.ani),
        startTime: new Date(data.startTime),
        endTime: data.endTime ? new Date(data.endTime) : null,
        duration: data.duration,
        ringTime: data.ringTime,
        holdTime: data.holdTime,
        talkTime: data.talkTime,
        disposition: data.disposition,
        ...matchedRecords,
      },
      update: {
        endTime: data.endTime ? new Date(data.endTime) : null,
        duration: data.duration,
        talkTime: data.talkTime,
        disposition: data.disposition,
      },
    });
  }

  async handleRecordingAvailable(data) {
    await prisma.callLog.updateMany({
      where: { five9CallId: data.callId },
      data: {
        recordingUrl: data.recordingUrl,
        recordingDuration: data.duration,
      },
    });
  }

  async handleDispositionUpdated(data) {
    await prisma.callLog.updateMany({
      where: { five9CallId: data.callId },
      data: {
        disposition: data.disposition,
        dispositionName: data.dispositionName,
        dispositionNotes: data.notes,
      },
    });
  }

  // ==========================================
  // Utility Methods
  // ==========================================

  normalizePhone(phone) {
    if (!phone) return '';
    return phone.replace(/\D/g, '').slice(-10);
  }

  formatPhone(phone) {
    const normalized = this.normalizePhone(phone);
    if (normalized.length === 10) {
      return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
    }
    return phone;
  }

  mapDirection(callType) {
    const directionMap = {
      'inbound': 'INBOUND',
      'outbound': 'OUTBOUND',
      'internal': 'INTERNAL',
      'transfer': 'TRANSFER',
    };
    return directionMap[callType?.toLowerCase()] || 'OUTBOUND';
  }
}

export const five9Service = new Five9Service();
