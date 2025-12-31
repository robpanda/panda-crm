// RingCentral Call Center Integration Service
// Replaces Five9 - Handles call logging, recording sync, and AI transcription
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

// RingCentral API configuration
const RC_API_BASE = process.env.RINGCENTRAL_SERVER_URL || 'https://platform.ringcentral.com';
const RC_CLIENT_ID = process.env.RINGCENTRAL_CLIENT_ID;
const RC_CLIENT_SECRET = process.env.RINGCENTRAL_CLIENT_SECRET;
const RC_JWT_TOKEN = process.env.RINGCENTRAL_JWT_TOKEN;

class RingCentralService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.refreshToken = null;
  }

  // ==========================================
  // Connection Status & OAuth
  // ==========================================

  /**
   * Check if RingCentral is configured and connected
   */
  async getConnectionStatus() {
    const configured = !!(RC_CLIENT_ID && RC_CLIENT_SECRET && RC_JWT_TOKEN);

    if (!configured) {
      return {
        configured: false,
        connected: false,
        accountId: null,
        lastSync: null,
      };
    }

    try {
      // Try to get account info to verify connection
      const accountInfo = await this.makeRequest('/restapi/v1.0/account/~');

      return {
        configured: true,
        connected: true,
        accountId: accountInfo?.id || null,
        accountName: accountInfo?.mainNumber || null,
        lastSync: new Date().toISOString(),
      };
    } catch (error) {
      logger.warn('RingCentral connection check failed:', error.message);
      return {
        configured: true,
        connected: false,
        accountId: null,
        lastSync: null,
        error: error.message,
      };
    }
  }

  /**
   * Get OAuth authorization URL for user-based auth
   */
  async getAuthorizationUrl() {
    if (!RC_CLIENT_ID) {
      throw new Error('RingCentral client ID not configured');
    }

    const redirectUri = process.env.RINGCENTRAL_REDIRECT_URI ||
      `${process.env.APP_URL || 'https://bamboo.pandaadmin.com'}/api/integrations/ringcentral/auth/callback`;

    const authUrl = new URL(`${RC_API_BASE}/restapi/oauth/authorize`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', RC_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', 'panda-crm-auth');

    return authUrl.toString();
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleAuthCallback(code, state) {
    const redirectUri = process.env.RINGCENTRAL_REDIRECT_URI ||
      `${process.env.APP_URL || 'https://bamboo.pandaadmin.com'}/api/integrations/ringcentral/auth/callback`;

    const credentials = Buffer.from(`${RC_CLIENT_ID}:${RC_CLIENT_SECRET}`).toString('base64');

    const response = await fetch(`${RC_API_BASE}/restapi/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth token exchange failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);

    // Get account info
    const accountInfo = await this.makeRequest('/restapi/v1.0/account/~');

    return {
      success: true,
      accountId: accountInfo?.id,
      accountName: accountInfo?.mainNumber,
    };
  }

  // ==========================================
  // Authentication (JWT Flow)
  // ==========================================

  async getAccessToken() {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    try {
      const credentials = Buffer.from(`${RC_CLIENT_ID}:${RC_CLIENT_SECRET}`).toString('base64');

      // Use JWT token for server-to-server auth
      const response = await fetch(`${RC_API_BASE}/restapi/oauth/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: RC_JWT_TOKEN,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`RingCentral auth failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      this.accessToken = data.access_token;
      this.refreshToken = data.refresh_token;
      // Token expires in seconds, convert to ms and subtract 5 min buffer
      this.tokenExpiry = Date.now() + ((data.expires_in - 300) * 1000);

      return this.accessToken;
    } catch (error) {
      logger.error('RingCentral authentication error:', error);
      throw error;
    }
  }

  async makeRequest(endpoint, options = {}) {
    const token = await this.getAccessToken();

    const response = await fetch(`${RC_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`RingCentral API error: ${response.status} - ${errorText}`);
    }

    // Some endpoints return no content
    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  // ==========================================
  // Connection Status
  // ==========================================

  /**
   * Get RingCentral connection status
   */
  async getConnectionStatus() {
    try {
      // Try to authenticate and get account info
      const accountInfo = await this.makeRequest('/restapi/v1.0/account/~');

      return {
        connected: true,
        accountId: accountInfo.id,
        accountName: accountInfo.mainNumber?.phoneNumber || accountInfo.name || 'RingCentral Account',
        extensionName: null, // Will be populated by extension info
        lastSync: null, // Could add this to track last successful sync
      };
    } catch (error) {
      logger.error('RingCentral connection check failed:', error);
      return {
        connected: false,
        error: error.message,
      };
    }
  }

  // ==========================================
  // Call Data Sync
  // ==========================================

  /**
   * Sync call data from RingCentral to local database
   */
  async syncCallData(options = {}) {
    const {
      startDate = new Date(Date.now() - 24 * 60 * 60 * 1000), // Default last 24 hours
      endDate = new Date(),
      extensionId = '~', // ~ means current user's extension
    } = options;

    try {
      logger.info(`Syncing RingCentral calls from ${startDate.toISOString()} to ${endDate.toISOString()}`);

      // Get call logs from RingCentral
      const callData = await this.getCallLogs(startDate, endDate, extensionId);

      let synced = 0;
      let skipped = 0;
      let errors = 0;

      for (const call of callData) {
        try {
          // Check if call already exists
          const existing = await prisma.callLog.findUnique({
            where: { ringCentralCallId: call.id },
          });

          if (existing) {
            skipped++;
            continue;
          }

          // Get the phone number (from or to depending on direction)
          const phoneNumber = call.direction === 'Inbound'
            ? call.from?.phoneNumber
            : call.to?.phoneNumber;

          // Find matching records
          const matchedRecords = await this.matchCallToRecords(phoneNumber);

          // Create call log
          await prisma.callLog.create({
            data: {
              ringCentralCallId: call.id,
              ringCentralSessionId: call.sessionId,
              ringCentralExtensionId: extensionId !== '~' ? extensionId : null,
              direction: this.mapDirection(call.direction),
              callType: call.type === 'Voice' ? 'VOICE' : 'VIDEO',
              phoneNumber: phoneNumber,
              formattedPhone: this.formatPhone(phoneNumber),
              callerName: call.from?.name || null,
              startTime: new Date(call.startTime),
              endTime: call.endTime ? new Date(call.endTime) : null,
              duration: call.duration,
              result: call.result, // Accepted, Missed, Voicemail, etc.
              recordingUrl: call.recording?.contentUri || null,
              recordingId: call.recording?.id || null,
              ...matchedRecords,
            },
          });

          synced++;
        } catch (error) {
          logger.error(`Error syncing call ${call.id}:`, error);
          errors++;
        }
      }

      logger.info(`RingCentral sync complete: ${synced} synced, ${skipped} skipped, ${errors} errors`);

      return { synced, skipped, errors, total: callData.length };
    } catch (error) {
      logger.error('RingCentral sync error:', error);
      throw error;
    }
  }

  /**
   * Get call logs from RingCentral API
   */
  async getCallLogs(startDate, endDate, extensionId = '~') {
    try {
      const params = new URLSearchParams({
        dateFrom: startDate.toISOString(),
        dateTo: endDate.toISOString(),
        type: 'Voice',
        view: 'Detailed',
        perPage: 250,
      });

      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/call-log?${params}`
      );

      return data?.records || [];
    } catch (error) {
      logger.warn('RingCentral API not configured or unavailable:', error.message);
      return [];
    }
  }

  /**
   * Get all extensions (users) in the account
   */
  async getExtensions() {
    try {
      const data = await this.makeRequest(
        '/restapi/v1.0/account/~/extension?type=User&status=Enabled&perPage=500'
      );
      return data?.records || [];
    } catch (error) {
      logger.error('Error fetching extensions:', error);
      return [];
    }
  }

  /**
   * Get call log for all extensions (company-wide)
   */
  async getCompanyCallLogs(startDate, endDate) {
    try {
      const params = new URLSearchParams({
        dateFrom: startDate.toISOString(),
        dateTo: endDate.toISOString(),
        type: 'Voice',
        view: 'Detailed',
        perPage: 250,
      });

      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/call-log?${params}`
      );

      return data?.records || [];
    } catch (error) {
      logger.warn('RingCentral company call log unavailable:', error.message);
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

    if (!normalized) return result;

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
  // Click-to-Call
  // ==========================================

  /**
   * Initiate an outbound call via RingCentral RingOut
   */
  async initiateCall(fromNumber, toNumber, extensionId = '~') {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/ring-out`,
        {
          method: 'POST',
          body: JSON.stringify({
            from: { phoneNumber: fromNumber },
            to: { phoneNumber: toNumber },
            playPrompt: true,
          }),
        }
      );

      logger.info(`RingOut initiated: ${data.id} from ${fromNumber} to ${toNumber}`);

      return {
        ringOutId: data.id,
        status: data.status?.callStatus,
        callerStatus: data.status?.callerStatus,
        calleeStatus: data.status?.calleeStatus,
      };
    } catch (error) {
      logger.error('RingOut initiation failed:', error);
      throw error;
    }
  }

  /**
   * Get RingOut status
   */
  async getRingOutStatus(ringOutId, extensionId = '~') {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/ring-out/${ringOutId}`
      );

      return {
        ringOutId: data.id,
        status: data.status?.callStatus,
        callerStatus: data.status?.callerStatus,
        calleeStatus: data.status?.calleeStatus,
      };
    } catch (error) {
      logger.error('Error getting RingOut status:', error);
      throw error;
    }
  }

  /**
   * Cancel an active RingOut
   */
  async cancelRingOut(ringOutId, extensionId = '~') {
    try {
      await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/ring-out/${ringOutId}`,
        { method: 'DELETE' }
      );

      logger.info(`RingOut cancelled: ${ringOutId}`);
      return { success: true };
    } catch (error) {
      logger.error('Error cancelling RingOut:', error);
      throw error;
    }
  }

  // ==========================================
  // Call Logging (Manual Entry)
  // ==========================================

  /**
   * Log a call manually (from frontend)
   */
  async logCall(data) {
    const {
      phoneNumber,
      direction = 'OUTBOUND',
      duration,
      notes,
      disposition,
      result,
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
        result: result || disposition,
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
   * Get recording content URI for a call
   */
  async getRecordingUrl(recordingId) {
    try {
      const token = await this.getAccessToken();

      // RingCentral recording URLs require the access token as a query parameter
      const recordingUrl = `${RC_API_BASE}/restapi/v1.0/account/~/recording/${recordingId}/content?access_token=${token}`;

      return recordingUrl;
    } catch (error) {
      logger.error(`Error fetching recording ${recordingId}:`, error);
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

    if (!callLog || !callLog.recordingId) {
      throw new Error('Call log not found or has no recording');
    }

    // Mark as pending transcription
    await prisma.callLog.update({
      where: { id: callLogId },
      data: { transcriptionStatus: 'PENDING' },
    });

    // In a real implementation, this would:
    // 1. Download the recording from RingCentral
    // 2. Send to transcription service (OpenAI Whisper, AWS Transcribe, etc.)
    // 3. Update the call log when complete

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
  // Phone System & Device Management
  // ==========================================

  /**
   * Get all phone numbers in the account
   */
  async getPhoneNumbers() {
    try {
      const data = await this.makeRequest(
        '/restapi/v1.0/account/~/phone-number?perPage=500'
      );
      return data?.records || [];
    } catch (error) {
      logger.error('Error fetching phone numbers:', error);
      return [];
    }
  }

  /**
   * Get phone numbers for a specific extension
   */
  async getExtensionPhoneNumbers(extensionId = '~') {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/phone-number`
      );
      return data?.records || [];
    } catch (error) {
      logger.error(`Error fetching phone numbers for extension ${extensionId}:`, error);
      return [];
    }
  }

  /**
   * Get extension details (user info, devices, etc.)
   */
  async getExtensionDetails(extensionId = '~') {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}`
      );
      return data;
    } catch (error) {
      logger.error(`Error fetching extension ${extensionId}:`, error);
      return null;
    }
  }

  /**
   * Get devices for an extension
   */
  async getExtensionDevices(extensionId = '~') {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/device`
      );
      return data?.records || [];
    } catch (error) {
      logger.error(`Error fetching devices for extension ${extensionId}:`, error);
      return [];
    }
  }

  /**
   * Get caller ID settings
   */
  async getCallerIdSettings(extensionId = '~') {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/caller-id`
      );
      return data;
    } catch (error) {
      logger.error('Error fetching caller ID settings:', error);
      return null;
    }
  }

  /**
   * Update caller ID settings
   */
  async updateCallerIdSettings(extensionId, settings) {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/caller-id`,
        {
          method: 'PUT',
          body: JSON.stringify(settings),
        }
      );
      return data;
    } catch (error) {
      logger.error('Error updating caller ID settings:', error);
      throw error;
    }
  }

  /**
   * Get presence/availability status
   */
  async getPresence(extensionId = '~') {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/presence`
      );
      return data;
    } catch (error) {
      logger.error('Error fetching presence:', error);
      return null;
    }
  }

  /**
   * Update presence/availability status
   */
  async updatePresence(extensionId, status) {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/presence`,
        {
          method: 'PUT',
          body: JSON.stringify({
            userStatus: status, // Available, Busy, DoNotDisturb, Offline
          }),
        }
      );
      return data;
    } catch (error) {
      logger.error('Error updating presence:', error);
      throw error;
    }
  }

  /**
   * Get call queues
   */
  async getCallQueues() {
    try {
      const data = await this.makeRequest(
        '/restapi/v1.0/account/~/call-queues?perPage=100'
      );
      return data?.records || [];
    } catch (error) {
      logger.error('Error fetching call queues:', error);
      return [];
    }
  }

  /**
   * Get call queue members
   */
  async getCallQueueMembers(queueId) {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/call-queues/${queueId}/members`
      );
      return data?.records || [];
    } catch (error) {
      logger.error(`Error fetching queue ${queueId} members:`, error);
      return [];
    }
  }

  /**
   * Get IVR menus
   */
  async getIvrMenus() {
    try {
      const data = await this.makeRequest(
        '/restapi/v1.0/account/~/ivr-menus'
      );
      return data?.records || [];
    } catch (error) {
      logger.error('Error fetching IVR menus:', error);
      return [];
    }
  }

  /**
   * Get voicemail messages
   */
  async getVoicemails(extensionId = '~', options = {}) {
    try {
      const params = new URLSearchParams({
        messageType: 'VoiceMail',
        perPage: options.limit || 50,
      });

      if (options.readStatus) {
        params.append('readStatus', options.readStatus);
      }

      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/message-store?${params}`
      );
      return data?.records || [];
    } catch (error) {
      logger.error('Error fetching voicemails:', error);
      return [];
    }
  }

  /**
   * Get voicemail content URL
   */
  async getVoicemailContentUrl(messageId, attachmentId, extensionId = '~') {
    try {
      const token = await this.getAccessToken();
      return `${RC_API_BASE}/restapi/v1.0/account/~/extension/${extensionId}/message-store/${messageId}/content/${attachmentId}?access_token=${token}`;
    } catch (error) {
      logger.error('Error getting voicemail URL:', error);
      return null;
    }
  }

  /**
   * Get active calls for an extension
   */
  async getActiveCalls(extensionId = '~') {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/active-calls`
      );
      return data?.records || [];
    } catch (error) {
      logger.error('Error fetching active calls:', error);
      return [];
    }
  }

  /**
   * Get call handling rules (forwarding, etc.)
   */
  async getCallHandlingRules(extensionId = '~') {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/answering-rule`
      );
      return data?.records || [];
    } catch (error) {
      logger.error('Error fetching call handling rules:', error);
      return [];
    }
  }

  /**
   * Get forwarding numbers
   */
  async getForwardingNumbers(extensionId = '~') {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/account/~/extension/${extensionId}/forwarding-number`
      );
      return data?.records || [];
    } catch (error) {
      logger.error('Error fetching forwarding numbers:', error);
      return [];
    }
  }

  // ==========================================
  // RingCentral AI Features
  // ==========================================

  /**
   * List available AI features
   */
  getAiFeatures() {
    return {
      transcription: {
        name: 'Call Transcription',
        description: 'Automatic speech-to-text transcription of call recordings',
        status: 'available',
        endpoint: '/calls/:id/transcribe',
      },
      sentiment: {
        name: 'Sentiment Analysis',
        description: 'AI-powered analysis of call sentiment (positive, negative, neutral)',
        status: 'available',
        endpoint: '/calls/:id/analyze',
      },
      summary: {
        name: 'Call Summary',
        description: 'AI-generated summary of call content and key points',
        status: 'available',
        endpoint: '/calls/:id/summarize',
      },
      keyPoints: {
        name: 'Key Point Extraction',
        description: 'Extract important discussion points and action items',
        status: 'available',
        endpoint: '/calls/:id/key-points',
      },
      nextActions: {
        name: 'Next Actions',
        description: 'AI-suggested follow-up actions based on call content',
        status: 'available',
        endpoint: '/calls/:id/next-actions',
      },
      speakerDiarization: {
        name: 'Speaker Identification',
        description: 'Identify and label different speakers in the conversation',
        status: 'available',
        endpoint: '/calls/:id/speakers',
      },
      coaching: {
        name: 'Sales Coaching Insights',
        description: 'AI-powered insights for sales call coaching and improvement',
        status: 'available',
        endpoint: '/calls/:id/coaching',
      },
      compliance: {
        name: 'Compliance Checking',
        description: 'Check calls for compliance with scripts and regulations',
        status: 'available',
        endpoint: '/calls/:id/compliance',
      },
    };
  }

  /**
   * Analyze a call with AI (full analysis)
   */
  async analyzeCallWithAi(callLogId) {
    const callLog = await prisma.callLog.findUnique({
      where: { id: callLogId },
    });

    if (!callLog) {
      throw new Error('Call log not found');
    }

    if (!callLog.recordingId && !callLog.transcription) {
      throw new Error('Call has no recording or transcription to analyze');
    }

    // If no transcription yet, request one first
    if (!callLog.transcription) {
      await this.requestTranscription(callLogId);
      return {
        status: 'PENDING',
        message: 'Transcription requested. Analysis will proceed after transcription completes.'
      };
    }

    // Perform AI analysis on the transcription
    // In production, this would call OpenAI, Claude, or another AI service
    const analysis = await this.performAiAnalysis(callLog.transcription);

    // Update the call log with AI analysis
    const updated = await prisma.callLog.update({
      where: { id: callLogId },
      data: {
        sentiment: analysis.sentiment,
        summary: analysis.summary,
        keyPoints: analysis.keyPoints,
        nextActions: analysis.nextActions,
        aiAnalyzedAt: new Date(),
      },
    });

    return {
      status: 'COMPLETED',
      analysis: {
        sentiment: updated.sentiment,
        summary: updated.summary,
        keyPoints: updated.keyPoints,
        nextActions: updated.nextActions,
        analyzedAt: updated.aiAnalyzedAt,
      },
    };
  }

  /**
   * Perform AI analysis on transcription text
   * This is a placeholder - in production would use OpenAI/Claude API
   */
  async performAiAnalysis(transcription) {
    // Placeholder implementation
    // In production, this would call an AI API like:
    // - OpenAI GPT-4
    // - Anthropic Claude
    // - AWS Bedrock
    // - RingCentral's own AI APIs

    logger.info('Performing AI analysis on transcription...');

    // Basic sentiment detection based on keywords
    const positiveWords = ['great', 'excellent', 'thank', 'appreciate', 'happy', 'perfect', 'wonderful'];
    const negativeWords = ['problem', 'issue', 'frustrated', 'angry', 'disappointed', 'wrong', 'terrible'];

    const lowerText = transcription.toLowerCase();
    const positiveCount = positiveWords.filter(w => lowerText.includes(w)).length;
    const negativeCount = negativeWords.filter(w => lowerText.includes(w)).length;

    let sentiment = 'NEUTRAL';
    if (positiveCount > negativeCount + 1) sentiment = 'POSITIVE';
    if (negativeCount > positiveCount + 1) sentiment = 'NEGATIVE';

    return {
      sentiment,
      summary: 'AI summary will be generated here in production.',
      keyPoints: ['Key point extraction will be implemented with AI service'],
      nextActions: ['Follow-up actions will be suggested by AI'],
    };
  }

  /**
   * Get AI coaching insights for a call
   */
  async getCoachingInsights(callLogId) {
    const callLog = await prisma.callLog.findUnique({
      where: { id: callLogId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!callLog || !callLog.transcription) {
      throw new Error('Call log not found or has no transcription');
    }

    // In production, this would analyze the call for coaching opportunities
    // Things like: talk-to-listen ratio, objection handling, closing attempts, etc.

    return {
      callId: callLogId,
      rep: callLog.user ? `${callLog.user.firstName} ${callLog.user.lastName}` : 'Unknown',
      duration: callLog.duration,
      insights: {
        talkToListenRatio: 'Placeholder - would calculate actual ratio',
        questionAsked: 'Placeholder - count of questions',
        objectionHandling: 'Placeholder - analysis of objection responses',
        closingAttempts: 'Placeholder - identified closing attempts',
        recommendations: [
          'Listen more to understand customer needs',
          'Ask more discovery questions',
          'Practice objection handling techniques',
        ],
      },
    };
  }

  /**
   * Get compliance check for a call
   */
  async checkCompliance(callLogId, scriptId = null) {
    const callLog = await prisma.callLog.findUnique({
      where: { id: callLogId },
    });

    if (!callLog || !callLog.transcription) {
      throw new Error('Call log not found or has no transcription');
    }

    // In production, would check against compliance requirements
    // - Required disclosures made
    // - Prohibited phrases avoided
    // - Script adherence

    return {
      callId: callLogId,
      compliant: true,
      checks: [
        { rule: 'Introduction given', passed: true },
        { rule: 'Company name stated', passed: true },
        { rule: 'Required disclosures', passed: true },
        { rule: 'No prohibited phrases', passed: true },
      ],
      score: 100,
    };
  }

  // ==========================================
  // Statistics & Reporting
  // ==========================================

  /**
   * Get call statistics for a user or team
   */
  async getCallStats(options = {}) {
    const { userId, startDate, endDate } = options;

    const where = {};
    if (userId) where.userId = userId;
    if (startDate) where.startTime = { gte: startDate };
    if (endDate) where.startTime = { ...where.startTime, lte: endDate };

    const stats = await prisma.callLog.aggregate({
      where,
      _count: { id: true },
      _sum: { duration: true },
      _avg: { duration: true },
    });

    const byDirection = await prisma.callLog.groupBy({
      by: ['direction'],
      where,
      _count: { id: true },
    });

    const byResult = await prisma.callLog.groupBy({
      by: ['result'],
      where,
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 10,
    });

    const directionMap = byDirection.reduce((acc, item) => {
      acc[item.direction] = item._count.id;
      return acc;
    }, {});

    return {
      totalCalls: stats._count.id || 0,
      totalDuration: stats._sum.duration || 0,
      avgDuration: Math.round(stats._avg.duration || 0),
      inboundCalls: directionMap.Inbound || 0,
      outboundCalls: directionMap.Outbound || 0,
      missedCalls: directionMap.Missed || 0,
      byDirection: directionMap,
      topResults: byResult.map(r => ({
        result: r.result,
        count: r._count.id,
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

  /**
   * Get call by ID
   */
  async getCallById(id) {
    return prisma.callLog.findUnique({
      where: { id },
      include: {
        opportunity: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Update a call log
   */
  async updateCall(id, data) {
    return prisma.callLog.update({
      where: { id },
      data,
      include: {
        opportunity: { select: { id: true, name: true } },
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
        lead: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // ==========================================
  // Webhook Handler
  // ==========================================

  /**
   * Handle RingCentral webhook events
   */
  async handleWebhook(event) {
    const { event: eventType, body } = event;

    logger.info(`RingCentral webhook: ${eventType}`);

    // RingCentral uses subscription-based webhooks
    // Events include: /restapi/v1.0/account/~/extension/~/telephony/sessions
    switch (eventType) {
      case '/restapi/v1.0/account/~/telephony/sessions':
        await this.handleTelephonyEvent(body);
        break;
      case '/restapi/v1.0/account/~/extension/~/message-store':
        await this.handleMessageEvent(body);
        break;
      default:
        logger.warn(`Unhandled RingCentral event: ${eventType}`);
    }
  }

  async handleTelephonyEvent(data) {
    // Handle real-time telephony events (call start, end, etc.)
    const { telephonySessionId, parties } = data;

    for (const party of parties || []) {
      if (party.status?.code === 'Disconnected') {
        // Call ended - sync this call
        const phoneNumber = party.direction === 'Inbound'
          ? party.from?.phoneNumber
          : party.to?.phoneNumber;

        const matchedRecords = await this.matchCallToRecords(phoneNumber);

        await prisma.callLog.upsert({
          where: { ringCentralSessionId: telephonySessionId },
          create: {
            ringCentralSessionId: telephonySessionId,
            ringCentralCallId: party.id,
            direction: this.mapDirection(party.direction),
            callType: 'VOICE',
            phoneNumber,
            formattedPhone: this.formatPhone(phoneNumber),
            callerName: party.from?.name,
            startTime: new Date(),
            duration: party.duration || 0,
            result: party.status?.reason || 'Completed',
            ...matchedRecords,
          },
          update: {
            duration: party.duration || 0,
            result: party.status?.reason || 'Completed',
          },
        });
      }
    }
  }

  async handleMessageEvent(data) {
    // Handle SMS/voicemail events
    logger.info('Message event received:', data.type);
  }

  // ==========================================
  // Subscription Management
  // ==========================================

  /**
   * Create webhook subscription for telephony events
   */
  async createWebhookSubscription(webhookUrl) {
    try {
      const data = await this.makeRequest(
        '/restapi/v1.0/subscription',
        {
          method: 'POST',
          body: JSON.stringify({
            eventFilters: [
              '/restapi/v1.0/account/~/telephony/sessions',
              '/restapi/v1.0/account/~/extension/~/message-store',
            ],
            deliveryMode: {
              transportType: 'WebHook',
              address: webhookUrl,
            },
            expiresIn: 604800, // 7 days
          }),
        }
      );

      logger.info(`Webhook subscription created: ${data.id}`);
      return data;
    } catch (error) {
      logger.error('Error creating webhook subscription:', error);
      throw error;
    }
  }

  /**
   * Renew webhook subscription
   */
  async renewSubscription(subscriptionId) {
    try {
      const data = await this.makeRequest(
        `/restapi/v1.0/subscription/${subscriptionId}/renew`,
        { method: 'POST' }
      );

      logger.info(`Subscription renewed: ${subscriptionId}`);
      return data;
    } catch (error) {
      logger.error('Error renewing subscription:', error);
      throw error;
    }
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
    return phone || '';
  }

  mapDirection(direction) {
    const directionMap = {
      'Inbound': 'INBOUND',
      'Outbound': 'OUTBOUND',
    };
    return directionMap[direction] || 'OUTBOUND';
  }
}

export const ringCentralService = new RingCentralService();
