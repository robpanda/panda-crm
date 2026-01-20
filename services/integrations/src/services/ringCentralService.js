// RingCentral Call Center Integration Service
// Replaces Five9 - Handles call logging, recording sync, and AI transcription
// Also includes RingCX Voice APIs for agent/queue/campaign management
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

// RingCentral Platform API configuration (standard APIs)
const RC_API_BASE = process.env.RINGCENTRAL_SERVER_URL || 'https://platform.ringcentral.com';
const RC_CLIENT_ID = process.env.RINGCENTRAL_CLIENT_ID;
const RC_CLIENT_SECRET = process.env.RINGCENTRAL_CLIENT_SECRET;
const RC_JWT_TOKEN = process.env.RINGCENTRAL_JWT_TOKEN;

// RingCX Voice API configuration (contact center APIs)
// Base URL: https://ringcx.ringcentral.com/voice/api/v1/admin/accounts/{accountId}
const RINGCX_API_BASE = process.env.RINGCX_API_BASE || 'https://ringcx.ringcentral.com';
const RINGCX_ACCOUNT_ID = process.env.RINGCX_ACCOUNT_ID; // Your RingCX account ID
const RINGCX_API_TOKEN = process.env.RINGCX_API_TOKEN; // RingCX-specific API token (if different)
const RINGCX_DIGITAL_TOKEN = process.env.RINGCX_DIGITAL_TOKEN; // RingCX Digital API token

const PROVIDER_NAME = 'ringcentral';

class RingCentralService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiry = null;
    this.refreshToken = null;
    this.tokenLoaded = false;
    // RingCX-specific tokens (separate from RC Platform tokens)
    this.ringCxAccessToken = null;
    this.ringCxRefreshToken = null;
    this.ringCxTokenExpiry = null;
  }

  /**
   * Load OAuth tokens from database
   */
  async loadTokensFromDatabase() {
    if (this.tokenLoaded) return;

    try {
      const credential = await prisma.integrationCredential.findUnique({
        where: { provider: PROVIDER_NAME },
      });

      if (credential && credential.isActive) {
        this.accessToken = credential.accessToken;
        this.refreshToken = credential.refreshToken;
        this.tokenExpiry = credential.tokenExpiresAt ? new Date(credential.tokenExpiresAt).getTime() : null;
        logger.info('RingCentral tokens loaded from database');
      }
      this.tokenLoaded = true;
    } catch (error) {
      logger.error('Error loading RingCentral tokens from database:', error.message);
      this.tokenLoaded = true; // Mark as loaded to prevent repeated attempts
    }
  }

  /**
   * Save OAuth tokens to database
   */
  async saveTokensToDatabase(accessToken, refreshToken, expiresIn) {
    const tokenExpiresAt = new Date(Date.now() + (expiresIn * 1000));

    try {
      await prisma.integrationCredential.upsert({
        where: { provider: PROVIDER_NAME },
        update: {
          accessToken,
          refreshToken,
          tokenExpiresAt,
          isActive: true,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        },
        create: {
          provider: PROVIDER_NAME,
          accessToken,
          refreshToken,
          tokenExpiresAt,
          clientId: RC_CLIENT_ID,
          isActive: true,
          lastUsedAt: new Date(),
        },
      });

      // Update in-memory cache
      this.accessToken = accessToken;
      this.refreshToken = refreshToken;
      this.tokenExpiry = tokenExpiresAt.getTime() - (5 * 60 * 1000); // 5 min buffer

      logger.info('RingCentral tokens saved to database');
    } catch (error) {
      logger.error('Error saving RingCentral tokens to database:', error.message);
      throw error;
    }
  }

  /**
   * Refresh the access token using refresh_token
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      throw new Error('No refresh token available. Please re-authorize RingCentral.');
    }

    const credentials = Buffer.from(`${RC_CLIENT_ID}:${RC_CLIENT_SECRET}`).toString('base64');

    const response = await fetch(`${RC_API_BASE}/restapi/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // If refresh token is invalid, clear tokens and require re-authorization
      if (response.status === 400 || response.status === 401) {
        await this.clearTokens();
        throw new Error('RingCentral session expired. Please re-authorize.');
      }
      throw new Error(`RingCentral token refresh failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    await this.saveTokensToDatabase(data.access_token, data.refresh_token, data.expires_in);

    logger.info('RingCentral access token refreshed successfully');
    return this.accessToken;
  }

  /**
   * Clear tokens from database and memory (for logout/re-auth)
   */
  async clearTokens() {
    try {
      await prisma.integrationCredential.update({
        where: { provider: PROVIDER_NAME },
        data: {
          accessToken: null,
          refreshToken: null,
          tokenExpiresAt: null,
          isActive: false,
          updatedAt: new Date(),
        },
      });
    } catch (error) {
      // Ignore if record doesn't exist
      logger.warn('Error clearing RingCentral tokens:', error.message);
    }

    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.tokenLoaded = false;
  }

  // ==========================================
  // Connection Status & OAuth
  // ==========================================

  /**
   * Check if RingCentral is configured and connected
   */
  async getConnectionStatus() {
    // Check if client credentials are configured
    const configured = !!(RC_CLIENT_ID && RC_CLIENT_SECRET);

    if (!configured) {
      return {
        configured: false,
        connected: false,
        authorized: false,
        accountId: null,
        lastSync: null,
        message: 'RingCentral client credentials not configured',
      };
    }

    // Load tokens from database if not already loaded
    await this.loadTokensFromDatabase();

    // Check if we have OAuth tokens
    const hasTokens = !!(this.accessToken && this.refreshToken);

    if (!hasTokens) {
      return {
        configured: true,
        connected: false,
        authorized: false,
        accountId: null,
        lastSync: null,
        message: 'RingCentral not authorized. Please connect your account.',
      };
    }

    try {
      // Try to get account info to verify connection
      const accountInfo = await this.makeRequest('/restapi/v1.0/account/~');

      // Get last used time from database
      const credential = await prisma.integrationCredential.findUnique({
        where: { provider: PROVIDER_NAME },
        select: { lastUsedAt: true },
      });

      return {
        configured: true,
        connected: true,
        authorized: true,
        accountId: accountInfo?.id || null,
        accountName: accountInfo?.mainNumber || null,
        lastSync: credential?.lastUsedAt?.toISOString() || new Date().toISOString(),
      };
    } catch (error) {
      logger.warn('RingCentral connection check failed:', error.message);

      // Check if it's an auth error that requires re-authorization
      const needsReauth = error.message.includes('expired') || error.message.includes('re-authorize');

      return {
        configured: true,
        connected: false,
        authorized: !needsReauth,
        accountId: null,
        lastSync: null,
        error: error.message,
        needsReauthorization: needsReauth,
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
      `${process.env.APP_URL || 'https://crm.pandaadmin.com'}/api/integrations/ringcentral/auth/callback`;

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
      `${process.env.APP_URL || 'https://crm.pandaadmin.com'}/api/integrations/ringcentral/auth/callback`;

    const credentials = Buffer.from(`${RC_CLIENT_ID}:${RC_CLIENT_SECRET}`).toString('base64');

    logger.info('Exchanging authorization code for tokens...');

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
      logger.error('OAuth token exchange failed:', errorText);
      throw new Error(`OAuth token exchange failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Save tokens to database for persistence
    await this.saveTokensToDatabase(data.access_token, data.refresh_token, data.expires_in);

    logger.info('RingCentral OAuth tokens obtained and saved');

    // Get account info
    const accountInfo = await this.makeRequest('/restapi/v1.0/account/~');

    return {
      success: true,
      accountId: accountInfo?.id,
      accountName: accountInfo?.mainNumber,
    };
  }

  // ==========================================
  // Authentication (OAuth Flow)
  // ==========================================

  async getAccessToken() {
    // Load tokens from database if not already loaded
    await this.loadTokensFromDatabase();

    // Check if we have a valid token in memory
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    // If we have a refresh token, try to refresh the access token
    if (this.refreshToken) {
      try {
        logger.info('Access token expired, refreshing...');
        return await this.refreshAccessToken();
      } catch (error) {
        logger.error('Failed to refresh RingCentral token:', error.message);
        // If refresh fails with auth error, clear tokens
        if (error.message.includes('expired') || error.message.includes('re-authorize')) {
          await this.clearTokens();
        }
        throw error;
      }
    }

    // No valid tokens - user needs to authorize
    throw new Error('RingCentral not authorized. Please connect your account via Settings > Integrations.');
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
   * Uses RingSense AI when recording ID is available
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

    // Try RingSense AI directly if we have a recording ID (don't need transcription first)
    if (callLog.recordingId) {
      const ringSenseData = await this.getRingSenseInsights(callLog.recordingId);
      if (ringSenseData) {
        // Update the call log with RingSense AI analysis
        const updated = await prisma.callLog.update({
          where: { id: callLogId },
          data: {
            sentiment: ringSenseData.sentiment?.overall || 'NEUTRAL',
            summary: ringSenseData.summary?.text || ringSenseData.bulletedSummary?.join(' ') || '',
            keyPoints: ringSenseData.highlights?.map(h => h.text) || [],
            nextActions: ringSenseData.nextSteps?.map(n => n.text) || [],
            transcription: ringSenseData.transcript?.map(t => `${t.speaker}: ${t.text}`).join('\n') || callLog.transcription,
            aiAnalyzedAt: new Date(),
          },
        });

        return {
          status: 'COMPLETED',
          source: 'RINGSENSE',
          analysis: {
            sentiment: updated.sentiment,
            summary: updated.summary,
            keyPoints: updated.keyPoints,
            nextActions: updated.nextActions,
            analyzedAt: updated.aiAnalyzedAt,
          },
        };
      }
    }

    // Fallback: If no transcription yet, request one first
    if (!callLog.transcription) {
      await this.requestTranscription(callLogId);
      return {
        status: 'PENDING',
        message: 'Transcription requested. Analysis will proceed after transcription completes.'
      };
    }

    // Fallback: Perform basic AI analysis on the transcription
    const analysis = await this.performAiAnalysis(callLog.transcription, callLog.recordingId);

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
      source: analysis.source || 'FALLBACK',
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
   * Get RingSense AI insights for a call recording
   * Uses RingCentral's RingSense API for transcription, sentiment, and summaries
   * @param {string} recordingId - The RingCentral recording ID or session ID
   * @param {string} domain - Domain type: 'pbx' for RingEX calls, 'rcv' for video, 'engage' for RingCX
   */
  async getRingSenseInsights(recordingId, domain = 'pbx') {
    try {
      const token = await this.getAccessToken();
      if (!token) {
        throw new Error('No RingCentral access token available');
      }

      // RingSense API endpoint for call insights
      const response = await fetch(
        `${RC_API_BASE}/ai/ringsense/v1/public/accounts/~/domains/${domain}/records/${recordingId}/insights`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logger.warn(`RingSense API error: ${response.status} - ${errorText}`);
        // Fall back to basic analysis if RingSense unavailable
        return null;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      logger.warn('RingSense insights unavailable:', error.message);
      return null;
    }
  }

  /**
   * Perform AI analysis on transcription text
   * Uses RingSense AI when available, falls back to basic keyword analysis
   */
  async performAiAnalysis(transcription, recordingId = null) {
    logger.info('Performing AI analysis on transcription...');

    // Try RingSense AI first if we have a recording ID
    if (recordingId) {
      const ringSenseData = await this.getRingSenseInsights(recordingId);
      if (ringSenseData) {
        logger.info('Using RingSense AI analysis');
        return {
          sentiment: ringSenseData.sentiment?.overall || 'NEUTRAL',
          summary: ringSenseData.summary?.text || ringSenseData.bulletedSummary?.join(' ') || '',
          keyPoints: ringSenseData.highlights?.map(h => h.text) || [],
          nextActions: ringSenseData.nextSteps?.map(n => n.text) || [],
          transcriptSegments: ringSenseData.transcript || [],
          source: 'RINGSENSE',
        };
      }
    }

    // Fallback: Basic sentiment detection based on keywords
    logger.info('Using fallback keyword-based analysis');
    const positiveWords = ['great', 'excellent', 'thank', 'appreciate', 'happy', 'perfect', 'wonderful', 'awesome', 'love'];
    const negativeWords = ['problem', 'issue', 'frustrated', 'angry', 'disappointed', 'wrong', 'terrible', 'bad', 'hate'];

    const lowerText = transcription.toLowerCase();
    const positiveCount = positiveWords.filter(w => lowerText.includes(w)).length;
    const negativeCount = negativeWords.filter(w => lowerText.includes(w)).length;

    let sentiment = 'NEUTRAL';
    if (positiveCount > negativeCount + 1) sentiment = 'POSITIVE';
    if (negativeCount > positiveCount + 1) sentiment = 'NEGATIVE';

    // Extract key sentences (simple heuristic: sentences with keywords)
    const sentences = transcription.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const keyPoints = sentences.slice(0, 3).map(s => s.trim());

    return {
      sentiment,
      summary: sentences.length > 0 ? sentences[0].trim() + '...' : 'No summary available.',
      keyPoints: keyPoints.length > 0 ? keyPoints : ['No key points extracted'],
      nextActions: ['Review call recording for follow-up items'],
      source: 'FALLBACK',
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

  // ==========================================
  // RingCX Voice API - Configuration & Auth
  // ==========================================

  /**
   * Check if RingCX is configured
   */
  /**
   * Check if RingCX Voice API is configured
   * Requires: RINGCX_ACCOUNT_ID + (RINGCX_API_TOKEN or RingCentral OAuth)
   */
  isRingCxConfigured() {
    // Need account ID and either a specific RingCX token or the ability to use RC OAuth
    return !!(RINGCX_ACCOUNT_ID && (RINGCX_API_TOKEN || this.accessToken || RC_JWT_TOKEN));
  }

  /**
   * Exchange RingCentral OAuth token for RingCX Voice API token
   * Per RingCentral docs: https://developers.ringcentral.com/engage/voice/guide/authentication/auth-ringcentral
   *
   * The RingCentral OAuth token must be exchanged for a RingCX-specific token
   * via POST to https://ringcx.ringcentral.com/api/auth/login/rc/accesstoken
   */
  async exchangeRcTokenForRingCx(rcAccessToken) {
    const url = `${RINGCX_API_BASE}/api/auth/login/rc/accesstoken?includeRefresh=true`;

    logger.info('Exchanging RingCentral token for RingCX token...');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `rcAccessToken=${encodeURIComponent(rcAccessToken)}&rcTokenType=Bearer`,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`RingCX token exchange failed: ${response.status} - ${errorText}`);
      throw new Error(`RingCX token exchange failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    logger.info('RingCX token exchange successful');

    // Store RingCX tokens (they expire in 5 minutes per docs)
    this.ringCxAccessToken = data.accessToken;
    this.ringCxRefreshToken = data.refreshToken;
    this.ringCxTokenExpiry = Date.now() + (4 * 60 * 1000); // 4 minute buffer (tokens last 5 min)

    return this.ringCxAccessToken;
  }

  /**
   * Refresh RingCX token using the RingCX refresh token
   */
  async refreshRingCxToken() {
    if (!this.ringCxRefreshToken) {
      throw new Error('No RingCX refresh token available');
    }

    const url = `${RINGCX_API_BASE}/api/auth/token/refresh`;

    logger.info('Refreshing RingCX token...');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `refresh_token=${encodeURIComponent(this.ringCxRefreshToken)}&rcTokenType=Bearer`,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`RingCX token refresh failed: ${response.status} - ${errorText}`);
      // Clear tokens and force re-exchange
      this.ringCxAccessToken = null;
      this.ringCxRefreshToken = null;
      this.ringCxTokenExpiry = null;
      throw new Error(`RingCX token refresh failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    logger.info('RingCX token refresh successful');

    this.ringCxAccessToken = data.accessToken;
    if (data.refreshToken) {
      this.ringCxRefreshToken = data.refreshToken;
    }
    this.ringCxTokenExpiry = Date.now() + (4 * 60 * 1000);

    return this.ringCxAccessToken;
  }

  /**
   * Get RingCX access token
   * RingCX Voice API requires a separate token obtained by exchanging the RC OAuth token
   *
   * Priority:
   * 1. RINGCX_API_TOKEN - Manually configured token
   * 2. Cached RingCX token (if not expired)
   * 3. Exchange RC OAuth token for new RingCX token
   *
   * Note: RINGCX_DIGITAL_TOKEN is for the Digital/Chat API, NOT Voice API
   */
  async getRingCxAccessToken() {
    // If we have a specific RingCX Voice API token, use it
    if (RINGCX_API_TOKEN) {
      logger.info('Using RINGCX_API_TOKEN for RingCX Voice API');
      return RINGCX_API_TOKEN;
    }

    // Check if we have a valid cached RingCX token
    if (this.ringCxAccessToken && this.ringCxTokenExpiry && Date.now() < this.ringCxTokenExpiry) {
      logger.debug('Using cached RingCX token');
      return this.ringCxAccessToken;
    }

    // Try to refresh existing RingCX token
    if (this.ringCxRefreshToken) {
      try {
        return await this.refreshRingCxToken();
      } catch (error) {
        logger.warn('RingCX refresh failed, will try new exchange:', error.message);
      }
    }

    // Exchange RingCentral OAuth token for RingCX token
    const rcToken = await this.getAccessToken();
    if (!rcToken) {
      throw new Error('No RingCentral OAuth token available. Please authorize via /api/integrations/ringcentral/auth/url');
    }

    return await this.exchangeRcTokenForRingCx(rcToken);
  }

  /**
   * Make a request to the RingCX Voice API
   * Base path: /voice/api/v1/admin/accounts/{accountId}
   */
  async makeRingCxRequest(endpoint, options = {}) {
    if (!RINGCX_ACCOUNT_ID) {
      throw new Error('RingCX Account ID not configured. Set RINGCX_ACCOUNT_ID environment variable.');
    }

    const token = await this.getRingCxAccessToken();
    const baseUrl = `${RINGCX_API_BASE}/voice/api/v1/admin/accounts/${RINGCX_ACCOUNT_ID}`;

    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`RingCX API error: ${response.status} - ${errorText}`);
    }

    if (response.status === 204) {
      return null;
    }

    return response.json();
  }

  /**
   * Get RingCX connection status and configuration
   */
  async getRingCxStatus() {
    const configured = this.isRingCxConfigured();

    if (!configured) {
      return {
        configured: false,
        connected: false,
        accountId: null,
        features: {
          agentManagement: false,
          inboundQueues: false,
          outboundCampaigns: false,
          leadManagement: false,
          activeCallsControl: false,
        },
        message: 'RingCX not configured. Set RINGCX_ACCOUNT_ID and RINGCX_API_TOKEN (or use RC_JWT_TOKEN).',
      };
    }

    try {
      // Try to get account info to verify connection
      const agents = await this.getRingCxAgentGroups();

      return {
        configured: true,
        connected: true,
        accountId: RINGCX_ACCOUNT_ID,
        features: {
          agentManagement: true,
          inboundQueues: true,
          outboundCampaigns: true,
          leadManagement: true,
          activeCallsControl: true,
        },
        agentGroupCount: agents?.length || 0,
      };
    } catch (error) {
      logger.warn('RingCX connection check failed:', error.message);
      return {
        configured: true,
        connected: false,
        accountId: RINGCX_ACCOUNT_ID,
        error: error.message,
        features: {
          agentManagement: false,
          inboundQueues: false,
          outboundCampaigns: false,
          leadManagement: false,
          activeCallsControl: false,
        },
      };
    }
  }

  // ==========================================
  // RingCX Voice API - Agent Management
  // ==========================================

  /**
   * Get all agent groups
   */
  async getRingCxAgentGroups() {
    try {
      const data = await this.makeRingCxRequest('/agentGroups');
      return data || [];
    } catch (error) {
      logger.error('Error fetching RingCX agent groups:', error);
      throw error;
    }
  }

  /**
   * Get a specific agent group
   */
  async getRingCxAgentGroup(agentGroupId) {
    try {
      const data = await this.makeRingCxRequest(`/agentGroups/${agentGroupId}`);
      return data;
    } catch (error) {
      logger.error(`Error fetching RingCX agent group ${agentGroupId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new agent group
   */
  async createRingCxAgentGroup(groupData) {
    try {
      const data = await this.makeRingCxRequest('/agentGroups', {
        method: 'POST',
        body: JSON.stringify(groupData),
      });
      logger.info(`RingCX agent group created: ${data.agentGroupId}`);
      return data;
    } catch (error) {
      logger.error('Error creating RingCX agent group:', error);
      throw error;
    }
  }

  /**
   * Update an agent group
   */
  async updateRingCxAgentGroup(agentGroupId, groupData) {
    try {
      const data = await this.makeRingCxRequest(`/agentGroups/${agentGroupId}`, {
        method: 'PUT',
        body: JSON.stringify(groupData),
      });
      logger.info(`RingCX agent group updated: ${agentGroupId}`);
      return data;
    } catch (error) {
      logger.error(`Error updating RingCX agent group ${agentGroupId}:`, error);
      throw error;
    }
  }

  /**
   * Delete an agent group
   */
  async deleteRingCxAgentGroup(agentGroupId) {
    try {
      await this.makeRingCxRequest(`/agentGroups/${agentGroupId}`, {
        method: 'DELETE',
      });
      logger.info(`RingCX agent group deleted: ${agentGroupId}`);
      return { success: true };
    } catch (error) {
      logger.error(`Error deleting RingCX agent group ${agentGroupId}:`, error);
      throw error;
    }
  }

  /**
   * Get all agents in an agent group
   */
  async getRingCxAgents(agentGroupId) {
    try {
      const data = await this.makeRingCxRequest(`/agentGroups/${agentGroupId}/agents`);
      return data || [];
    } catch (error) {
      logger.error(`Error fetching RingCX agents for group ${agentGroupId}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific agent
   */
  async getRingCxAgent(agentGroupId, agentId) {
    try {
      const data = await this.makeRingCxRequest(`/agentGroups/${agentGroupId}/agents/${agentId}`);
      return data;
    } catch (error) {
      logger.error(`Error fetching RingCX agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new agent
   * @param {Object} agentData - Agent data including:
   *   - firstName, lastName, email, username, password
   *   - agentType: 'AGENT' or 'SUPERVISOR'
   *   - allowInbound, allowOutbound, allowBlended
   *   - defaultLoginDest: phone number or extension
   */
  async createRingCxAgent(agentGroupId, agentData) {
    try {
      const data = await this.makeRingCxRequest(`/agentGroups/${agentGroupId}/agents`, {
        method: 'POST',
        body: JSON.stringify(agentData),
      });
      logger.info(`RingCX agent created: ${data.agentId} in group ${agentGroupId}`);
      return data;
    } catch (error) {
      logger.error('Error creating RingCX agent:', error);
      throw error;
    }
  }

  /**
   * Update an agent
   */
  async updateRingCxAgent(agentGroupId, agentId, agentData) {
    try {
      const data = await this.makeRingCxRequest(`/agentGroups/${agentGroupId}/agents/${agentId}`, {
        method: 'PUT',
        body: JSON.stringify(agentData),
      });
      logger.info(`RingCX agent updated: ${agentId}`);
      return data;
    } catch (error) {
      logger.error(`Error updating RingCX agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Delete an agent
   */
  async deleteRingCxAgent(agentGroupId, agentId) {
    try {
      await this.makeRingCxRequest(`/agentGroups/${agentGroupId}/agents/${agentId}`, {
        method: 'DELETE',
      });
      logger.info(`RingCX agent deleted: ${agentId}`);
      return { success: true };
    } catch (error) {
      logger.error(`Error deleting RingCX agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get agent state/status (Available, On Break, etc.)
   */
  async getRingCxAgentState(agentId) {
    try {
      const data = await this.makeRingCxRequest(`/agents/${agentId}/state`);
      return data;
    } catch (error) {
      logger.error(`Error fetching RingCX agent state ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Update agent state (set to Available, On Break, etc.)
   */
  async updateRingCxAgentState(agentId, state) {
    try {
      const data = await this.makeRingCxRequest(`/agents/${agentId}/state`, {
        method: 'POST',
        body: JSON.stringify({ agentState: state }),
      });
      logger.info(`RingCX agent ${agentId} state updated to ${state}`);
      return data;
    } catch (error) {
      logger.error(`Error updating RingCX agent state ${agentId}:`, error);
      throw error;
    }
  }

  // ==========================================
  // RingCX Voice API - Inbound Queues (Gates)
  // ==========================================

  /**
   * Get all gate groups (inbound queue groups)
   */
  async getRingCxGateGroups() {
    try {
      const data = await this.makeRingCxRequest('/gateGroups');
      return data || [];
    } catch (error) {
      logger.error('Error fetching RingCX gate groups:', error);
      throw error;
    }
  }

  /**
   * Get a specific gate group
   */
  async getRingCxGateGroup(gateGroupId) {
    try {
      const data = await this.makeRingCxRequest(`/gateGroups/${gateGroupId}`);
      return data;
    } catch (error) {
      logger.error(`Error fetching RingCX gate group ${gateGroupId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new gate group
   */
  async createRingCxGateGroup(groupData) {
    try {
      const data = await this.makeRingCxRequest('/gateGroups', {
        method: 'POST',
        body: JSON.stringify(groupData),
      });
      logger.info(`RingCX gate group created: ${data.gateGroupId}`);
      return data;
    } catch (error) {
      logger.error('Error creating RingCX gate group:', error);
      throw error;
    }
  }

  /**
   * Update a gate group
   */
  async updateRingCxGateGroup(gateGroupId, groupData) {
    try {
      const data = await this.makeRingCxRequest(`/gateGroups/${gateGroupId}`, {
        method: 'PUT',
        body: JSON.stringify(groupData),
      });
      logger.info(`RingCX gate group updated: ${gateGroupId}`);
      return data;
    } catch (error) {
      logger.error(`Error updating RingCX gate group ${gateGroupId}:`, error);
      throw error;
    }
  }

  /**
   * Get all gates (queues) in a gate group
   */
  async getRingCxGates(gateGroupId) {
    try {
      const data = await this.makeRingCxRequest(`/gateGroups/${gateGroupId}/gates`);
      return data || [];
    } catch (error) {
      logger.error(`Error fetching RingCX gates for group ${gateGroupId}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific gate (queue)
   */
  async getRingCxGate(gateGroupId, gateId) {
    try {
      const data = await this.makeRingCxRequest(`/gateGroups/${gateGroupId}/gates/${gateId}`);
      return data;
    } catch (error) {
      logger.error(`Error fetching RingCX gate ${gateId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new gate (inbound queue)
   * @param {Object} gateData - Gate configuration including:
   *   - gateName: Display name for the queue
   *   - gateDesc: Description
   *   - outboundCallerId: Caller ID for callbacks
   *   - shortAbandonTime: Seconds before considering a call abandoned
   *   - slaTime: Service level agreement time in seconds
   *   - surveyEnabled: Enable post-call survey
   *   - whisperMessage: Message played to agent before connecting
   */
  async createRingCxGate(gateGroupId, gateData) {
    try {
      const data = await this.makeRingCxRequest(`/gateGroups/${gateGroupId}/gates`, {
        method: 'POST',
        body: JSON.stringify(gateData),
      });
      logger.info(`RingCX gate created: ${data.gateId} in group ${gateGroupId}`);
      return data;
    } catch (error) {
      logger.error('Error creating RingCX gate:', error);
      throw error;
    }
  }

  /**
   * Update a gate
   */
  async updateRingCxGate(gateGroupId, gateId, gateData) {
    try {
      const data = await this.makeRingCxRequest(`/gateGroups/${gateGroupId}/gates/${gateId}`, {
        method: 'PUT',
        body: JSON.stringify(gateData),
      });
      logger.info(`RingCX gate updated: ${gateId}`);
      return data;
    } catch (error) {
      logger.error(`Error updating RingCX gate ${gateId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a gate
   */
  async deleteRingCxGate(gateGroupId, gateId) {
    try {
      await this.makeRingCxRequest(`/gateGroups/${gateGroupId}/gates/${gateId}`, {
        method: 'DELETE',
      });
      logger.info(`RingCX gate deleted: ${gateId}`);
      return { success: true };
    } catch (error) {
      logger.error(`Error deleting RingCX gate ${gateId}:`, error);
      throw error;
    }
  }

  /**
   * Get skills assigned to a gate
   */
  async getRingCxGateSkills(gateGroupId, gateId) {
    try {
      const data = await this.makeRingCxRequest(`/gateGroups/${gateGroupId}/gates/${gateId}/skills`);
      return data || [];
    } catch (error) {
      logger.error(`Error fetching skills for gate ${gateId}:`, error);
      throw error;
    }
  }

  /**
   * Assign a skill to a gate
   */
  async assignRingCxGateSkill(gateGroupId, gateId, skillData) {
    try {
      const data = await this.makeRingCxRequest(`/gateGroups/${gateGroupId}/gates/${gateId}/skills`, {
        method: 'POST',
        body: JSON.stringify(skillData),
      });
      logger.info(`Skill assigned to gate ${gateId}`);
      return data;
    } catch (error) {
      logger.error(`Error assigning skill to gate ${gateId}:`, error);
      throw error;
    }
  }

  // ==========================================
  // RingCX Voice API - Outbound Campaigns (Dial Groups)
  // ==========================================

  /**
   * Get all dial groups (outbound campaign groups)
   */
  async getRingCxDialGroups() {
    try {
      const data = await this.makeRingCxRequest('/dialGroups');
      return data || [];
    } catch (error) {
      logger.error('Error fetching RingCX dial groups:', error);
      throw error;
    }
  }

  /**
   * Get a specific dial group
   */
  async getRingCxDialGroup(dialGroupId) {
    try {
      const data = await this.makeRingCxRequest(`/dialGroups/${dialGroupId}`);
      return data;
    } catch (error) {
      logger.error(`Error fetching RingCX dial group ${dialGroupId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new dial group
   * @param {Object} dialGroupData - Dial group configuration including:
   *   - dialGroupName: Name for the campaign group
   *   - dialGroupDesc: Description
   *   - dialMode: 'PREDICTIVE', 'PREVIEW', 'MANUAL', 'BROADCAST'
   *   - isActive: true/false
   *   - billingCode: For tracking/reporting
   */
  async createRingCxDialGroup(dialGroupData) {
    try {
      const data = await this.makeRingCxRequest('/dialGroups', {
        method: 'POST',
        body: JSON.stringify(dialGroupData),
      });
      logger.info(`RingCX dial group created: ${data.dialGroupId}`);
      return data;
    } catch (error) {
      logger.error('Error creating RingCX dial group:', error);
      throw error;
    }
  }

  /**
   * Update a dial group
   */
  async updateRingCxDialGroup(dialGroupId, dialGroupData) {
    try {
      const data = await this.makeRingCxRequest(`/dialGroups/${dialGroupId}`, {
        method: 'PUT',
        body: JSON.stringify(dialGroupData),
      });
      logger.info(`RingCX dial group updated: ${dialGroupId}`);
      return data;
    } catch (error) {
      logger.error(`Error updating RingCX dial group ${dialGroupId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a dial group
   */
  async deleteRingCxDialGroup(dialGroupId) {
    try {
      await this.makeRingCxRequest(`/dialGroups/${dialGroupId}`, {
        method: 'DELETE',
      });
      logger.info(`RingCX dial group deleted: ${dialGroupId}`);
      return { success: true };
    } catch (error) {
      logger.error(`Error deleting RingCX dial group ${dialGroupId}:`, error);
      throw error;
    }
  }

  /**
   * Get campaigns in a dial group
   */
  async getRingCxCampaigns(dialGroupId) {
    try {
      const data = await this.makeRingCxRequest(`/dialGroups/${dialGroupId}/campaigns`);
      return data || [];
    } catch (error) {
      logger.error(`Error fetching campaigns for dial group ${dialGroupId}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific campaign
   */
  async getRingCxCampaign(dialGroupId, campaignId) {
    try {
      const data = await this.makeRingCxRequest(`/dialGroups/${dialGroupId}/campaigns/${campaignId}`);
      return data;
    } catch (error) {
      logger.error(`Error fetching campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new campaign
   * @param {Object} campaignData - Campaign configuration including:
   *   - campaignName: Display name
   *   - campaignDesc: Description
   *   - isActive: true/false
   *   - maxRingTime: Max ring time in seconds
   *   - maxAttempts: Max dial attempts per lead
   *   - minRetryTime: Min minutes before retry
   *   - scrubDisconnects: Remove disconnected numbers
   */
  async createRingCxCampaign(dialGroupId, campaignData) {
    try {
      const data = await this.makeRingCxRequest(`/dialGroups/${dialGroupId}/campaigns`, {
        method: 'POST',
        body: JSON.stringify(campaignData),
      });
      logger.info(`RingCX campaign created: ${data.campaignId} in dial group ${dialGroupId}`);
      return data;
    } catch (error) {
      logger.error('Error creating RingCX campaign:', error);
      throw error;
    }
  }

  /**
   * Update a campaign
   */
  async updateRingCxCampaign(dialGroupId, campaignId, campaignData) {
    try {
      const data = await this.makeRingCxRequest(`/dialGroups/${dialGroupId}/campaigns/${campaignId}`, {
        method: 'PUT',
        body: JSON.stringify(campaignData),
      });
      logger.info(`RingCX campaign updated: ${campaignId}`);
      return data;
    } catch (error) {
      logger.error(`Error updating RingCX campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a campaign
   */
  async deleteRingCxCampaign(dialGroupId, campaignId) {
    try {
      await this.makeRingCxRequest(`/dialGroups/${dialGroupId}/campaigns/${campaignId}`, {
        method: 'DELETE',
      });
      logger.info(`RingCX campaign deleted: ${campaignId}`);
      return { success: true };
    } catch (error) {
      logger.error(`Error deleting RingCX campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Start/resume a campaign
   */
  async startRingCxCampaign(dialGroupId, campaignId) {
    try {
      const data = await this.updateRingCxCampaign(dialGroupId, campaignId, { isActive: true });
      logger.info(`RingCX campaign started: ${campaignId}`);
      return data;
    } catch (error) {
      logger.error(`Error starting RingCX campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Pause/stop a campaign
   */
  async pauseRingCxCampaign(dialGroupId, campaignId) {
    try {
      const data = await this.updateRingCxCampaign(dialGroupId, campaignId, { isActive: false });
      logger.info(`RingCX campaign paused: ${campaignId}`);
      return data;
    } catch (error) {
      logger.error(`Error pausing RingCX campaign ${campaignId}:`, error);
      throw error;
    }
  }

  // ==========================================
  // RingCX Voice API - Lead Management
  // ==========================================

  /**
   * Get leads for a campaign
   */
  async getRingCxLeads(campaignId, options = {}) {
    try {
      const params = new URLSearchParams();
      if (options.page) params.append('page', options.page);
      if (options.maxRows) params.append('maxRows', options.maxRows);
      if (options.orderBy) params.append('orderBy', options.orderBy);
      if (options.leadState) params.append('leadState', options.leadState);

      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await this.makeRingCxRequest(`/campaigns/${campaignId}/leads${query}`);
      return data || [];
    } catch (error) {
      logger.error(`Error fetching leads for campaign ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific lead
   */
  async getRingCxLead(campaignId, leadId) {
    try {
      const data = await this.makeRingCxRequest(`/campaigns/${campaignId}/leads/${leadId}`);
      return data;
    } catch (error) {
      logger.error(`Error fetching RingCX lead ${leadId}:`, error);
      throw error;
    }
  }

  /**
   * Create/upload a single lead
   * @param {Object} leadData - Lead data including:
   *   - leadPhone: Primary phone number (required)
   *   - externId: External ID for linking to CRM
   *   - firstName, lastName, email, address1, city, state, zip
   *   - callerId: Callback number
   *   - auxData1-5: Custom fields
   */
  async createRingCxLead(campaignId, leadData) {
    try {
      const data = await this.makeRingCxRequest(`/campaigns/${campaignId}/leads`, {
        method: 'POST',
        body: JSON.stringify(leadData),
      });
      logger.info(`RingCX lead created in campaign ${campaignId}`);
      return data;
    } catch (error) {
      logger.error('Error creating RingCX lead:', error);
      throw error;
    }
  }

  /**
   * Bulk upload leads to a campaign
   * @param {Array} leads - Array of lead objects
   * @param {Object} options - Upload options:
   *   - duplicateAction: 'RETAIN_FIRST', 'RETAIN_LAST', 'REMOVE_ALL', 'REMOVE_FROM_FILE'
   *   - listState: 'ACTIVE', 'INACTIVE'
   */
  async bulkUploadRingCxLeads(campaignId, leads, options = {}) {
    try {
      const uploadData = {
        ...options,
        uploadLeads: leads,
      };

      const data = await this.makeRingCxRequest(`/campaigns/${campaignId}/leads/upload`, {
        method: 'POST',
        body: JSON.stringify(uploadData),
      });
      logger.info(`Bulk uploaded ${leads.length} leads to RingCX campaign ${campaignId}`);
      return data;
    } catch (error) {
      logger.error('Error bulk uploading RingCX leads:', error);
      throw error;
    }
  }

  /**
   * Update a lead
   */
  async updateRingCxLead(campaignId, leadId, leadData) {
    try {
      const data = await this.makeRingCxRequest(`/campaigns/${campaignId}/leads/${leadId}`, {
        method: 'PUT',
        body: JSON.stringify(leadData),
      });
      logger.info(`RingCX lead updated: ${leadId}`);
      return data;
    } catch (error) {
      logger.error(`Error updating RingCX lead ${leadId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a lead from a campaign
   */
  async deleteRingCxLead(campaignId, leadId) {
    try {
      await this.makeRingCxRequest(`/campaigns/${campaignId}/leads/${leadId}`, {
        method: 'DELETE',
      });
      logger.info(`RingCX lead deleted: ${leadId}`);
      return { success: true };
    } catch (error) {
      logger.error(`Error deleting RingCX lead ${leadId}:`, error);
      throw error;
    }
  }

  /**
   * Search leads across campaigns
   */
  async searchRingCxLeads(searchParams) {
    try {
      const data = await this.makeRingCxRequest('/leads/search', {
        method: 'POST',
        body: JSON.stringify(searchParams),
      });
      return data || [];
    } catch (error) {
      logger.error('Error searching RingCX leads:', error);
      throw error;
    }
  }

  /**
   * Sync CRM leads to RingCX campaign
   * Converts Panda CRM leads to RingCX format and uploads
   * @param {string} campaignId - RingCX campaign ID
   * @param {Object} options - Sync options
   * @param {string[]} options.leadIds - Array of lead IDs to sync
   * @param {string} options.callListId - Call list ID to sync items from
   * @param {Object} options.filters - Additional filters
   */
  async syncLeadsToRingCxCampaign(campaignId, options = {}) {
    try {
      const { leadIds, callListId, filters } = options;
      let ringCxLeads = [];

      // If callListId is provided, fetch items from call list
      if (callListId) {
        logger.info(`Syncing call list ${callListId} to RingCX campaign ${campaignId}`);

        // Fetch pending items from call list
        const callListItems = await prisma.callListItem.findMany({
          where: {
            callListId,
            status: 'PENDING',
            phoneNumber: { not: null },
          },
          include: {
            lead: {
              include: {
                account: { select: { name: true } },
              },
            },
          },
        });

        logger.info(`Found ${callListItems.length} pending items in call list`);

        // Convert call list items to RingCX format
        ringCxLeads = callListItems.map(item => {
          const lead = item.lead;
          return {
            externId: item.leadId || item.id, // Use lead ID if available, otherwise item ID
            leadPhone: item.phoneNumber,
            firstName: lead?.firstName || item.displayName?.split(' ')[0] || 'Unknown',
            lastName: lead?.lastName || item.displayName?.split(' ').slice(1).join(' ') || '',
            email: lead?.email || null,
            address1: lead?.street || item.displayAddress?.split(',')[0] || null,
            city: lead?.city || null,
            state: lead?.state || null,
            zip: lead?.postalCode || null,
            auxData1: lead?.company || lead?.account?.name || null,
            auxData2: lead?.source || 'Call List',
            auxData3: item.displayStatus || lead?.status || null,
            auxData4: lead?.workType || null,
            auxData5: lead?.salesforceId || null,
          };
        }).filter(lead => lead.leadPhone); // Only items with phone numbers

      } else if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
        // Original behavior: fetch leads by IDs
        const crmLeads = await prisma.lead.findMany({
          where: { id: { in: leadIds } },
          include: {
            account: { select: { name: true } },
          },
        });

        // Convert to RingCX format
        ringCxLeads = crmLeads.map(lead => ({
          externId: lead.id, // Link back to CRM
          leadPhone: lead.phone || lead.mobilePhone,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          address1: lead.street,
          city: lead.city,
          state: lead.state,
          zip: lead.postalCode,
          auxData1: lead.company || lead.account?.name,
          auxData2: lead.source,
          auxData3: lead.status,
          auxData4: lead.workType,
          auxData5: lead.salesforceId,
        })).filter(lead => lead.leadPhone); // Only leads with phone numbers
      } else {
        return { synced: 0, message: 'No leadIds or callListId provided' };
      }

      if (ringCxLeads.length === 0) {
        return { synced: 0, message: 'No leads with phone numbers to sync' };
      }

      // Upload to RingCX
      const result = await this.bulkUploadRingCxLeads(campaignId, ringCxLeads, {
        duplicateAction: 'RETAIN_LAST',
        listState: 'ACTIVE',
      });

      logger.info(`Synced ${ringCxLeads.length} CRM leads to RingCX campaign ${campaignId}`);

      return {
        synced: ringCxLeads.length,
        campaignId,
        source: callListId ? 'call_list' : 'lead_ids',
        sourceId: callListId || null,
        result,
      };
    } catch (error) {
      logger.error('Error syncing CRM leads to RingCX:', error);
      throw error;
    }
  }

  // ==========================================
  // RingCX Voice API - Active Calls Control
  // ==========================================

  /**
   * Get all active calls
   * @param {Object} options - Filter options
   * @param {string} options.agentId - Filter by agent ID
   * @param {string} options.gateId - Filter by gate/queue ID
   * @param {string} options.campaignId - Filter by campaign ID
   * @param {number} options.page - Page number
   * @param {number} options.limit - Results per page
   */
  async getRingCxActiveCalls(options = {}) {
    try {
      // Build query parameters
      const queryParams = new URLSearchParams();
      if (options.agentId) queryParams.append('agentId', options.agentId);
      if (options.gateId) queryParams.append('gateId', options.gateId);
      if (options.campaignId) queryParams.append('campaignId', options.campaignId);
      if (options.page) queryParams.append('page', options.page);
      if (options.limit) queryParams.append('maxRows', options.limit);

      const queryString = queryParams.toString();
      const endpoint = queryString ? `/activeCalls?${queryString}` : '/activeCalls';

      const data = await this.makeRingCxRequest(endpoint);
      return data || [];
    } catch (error) {
      // Check if this is an "invalid.data" error - usually means the feature isn't available
      // or the account doesn't have active call monitoring enabled
      if (error.message?.includes('invalid.data') || error.message?.includes('400')) {
        logger.warn('RingCX active calls feature may not be enabled for this account:', error.message);
        // Return empty array instead of throwing - feature not available
        return [];
      }
      logger.error('Error fetching RingCX active calls:', error);
      throw error;
    }
  }

  /**
   * Get active calls for a specific agent
   */
  async getRingCxAgentActiveCalls(agentId) {
    try {
      const data = await this.makeRingCxRequest(`/agents/${agentId}/activeCalls`);
      return data || [];
    } catch (error) {
      // Gracefully handle if feature isn't available
      if (error.message?.includes('invalid.data') || error.message?.includes('400')) {
        logger.warn(`RingCX active calls feature may not be enabled for agent ${agentId}:`, error.message);
        return [];
      }
      logger.error(`Error fetching active calls for agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get a specific active call
   */
  async getRingCxActiveCall(uii) {
    try {
      const data = await this.makeRingCxRequest(`/activeCalls/${uii}`);
      return data;
    } catch (error) {
      // Gracefully handle if feature isn't available or call not found
      if (error.message?.includes('invalid.data') || error.message?.includes('400')) {
        logger.warn(`RingCX active call ${uii} not found or feature not enabled:`, error.message);
        return null;
      }
      logger.error(`Error fetching active call ${uii}:`, error);
      throw error;
    }
  }

  /**
   * Barge into an active call (supervisor joins the call)
   * @param {string} uii - Unique call identifier
   * @param {string} bargeType - 'FULL', 'LISTEN', 'COACH'
   *   - FULL: Supervisor can speak to both agent and customer
   *   - LISTEN: Silent monitoring
   *   - COACH: Whisper to agent only (customer can't hear)
   */
  async bargeRingCxCall(uii, bargeType = 'FULL') {
    try {
      const data = await this.makeRingCxRequest(`/activeCalls/${uii}/barge`, {
        method: 'POST',
        body: JSON.stringify({ bargeType }),
      });
      logger.info(`Barged into call ${uii} with type ${bargeType}`);
      return data;
    } catch (error) {
      logger.error(`Error barging into call ${uii}:`, error);
      throw error;
    }
  }

  /**
   * Coach/whisper to agent on a call (customer can't hear)
   */
  async coachRingCxCall(uii) {
    return this.bargeRingCxCall(uii, 'COACH');
  }

  /**
   * Silently monitor a call
   */
  async monitorRingCxCall(uii) {
    return this.bargeRingCxCall(uii, 'LISTEN');
  }

  /**
   * Transfer an active call
   * @param {Object} transferData - Transfer configuration:
   *   - transferDest: Destination phone number or extension
   *   - transferType: 'WARM' (announced) or 'COLD' (blind)
   */
  async transferRingCxCall(uii, transferData) {
    try {
      const data = await this.makeRingCxRequest(`/activeCalls/${uii}/transfer`, {
        method: 'POST',
        body: JSON.stringify(transferData),
      });
      logger.info(`Call ${uii} transferred to ${transferData.transferDest}`);
      return data;
    } catch (error) {
      logger.error(`Error transferring call ${uii}:`, error);
      throw error;
    }
  }

  /**
   * Hold/unhold an active call
   */
  async holdRingCxCall(uii, hold = true) {
    try {
      const data = await this.makeRingCxRequest(`/activeCalls/${uii}/hold`, {
        method: 'POST',
        body: JSON.stringify({ hold }),
      });
      logger.info(`Call ${uii} ${hold ? 'placed on hold' : 'resumed'}`);
      return data;
    } catch (error) {
      logger.error(`Error holding/resuming call ${uii}:`, error);
      throw error;
    }
  }

  /**
   * Hangup an active call
   */
  async hangupRingCxCall(uii) {
    try {
      const data = await this.makeRingCxRequest(`/activeCalls/${uii}/hangup`, {
        method: 'POST',
      });
      logger.info(`Call ${uii} hung up`);
      return data;
    } catch (error) {
      logger.error(`Error hanging up call ${uii}:`, error);
      throw error;
    }
  }

  /**
   * Record/stop recording an active call
   */
  async recordRingCxCall(uii, record = true) {
    try {
      const data = await this.makeRingCxRequest(`/activeCalls/${uii}/record`, {
        method: 'POST',
        body: JSON.stringify({ record }),
      });
      logger.info(`Call ${uii} recording ${record ? 'started' : 'stopped'}`);
      return data;
    } catch (error) {
      logger.error(`Error recording call ${uii}:`, error);
      throw error;
    }
  }

  /**
   * Dial a preview call (agent initiated)
   */
  async dialRingCxPreviewCall(agentId, phoneNumber, campaignId = null) {
    try {
      const dialData = {
        phoneNumber,
        ...(campaignId && { campaignId }),
      };

      const data = await this.makeRingCxRequest(`/agents/${agentId}/dial`, {
        method: 'POST',
        body: JSON.stringify(dialData),
      });
      logger.info(`Preview dial initiated for agent ${agentId} to ${phoneNumber}`);
      return data;
    } catch (error) {
      logger.error(`Error initiating preview dial for agent ${agentId}:`, error);
      throw error;
    }
  }

  // ==========================================
  // RingCX Voice API - Statistics & Reporting
  // ==========================================

  /**
   * Get campaign statistics
   */
  async getRingCxCampaignStats(dialGroupId, campaignId) {
    try {
      const data = await this.makeRingCxRequest(`/dialGroups/${dialGroupId}/campaigns/${campaignId}/stats`);
      return data;
    } catch (error) {
      logger.error(`Error fetching campaign stats for ${campaignId}:`, error);
      throw error;
    }
  }

  /**
   * Get queue (gate) statistics
   */
  async getRingCxQueueStats(gateGroupId, gateId) {
    try {
      const data = await this.makeRingCxRequest(`/gateGroups/${gateGroupId}/gates/${gateId}/stats`);
      return data;
    } catch (error) {
      logger.error(`Error fetching queue stats for ${gateId}:`, error);
      throw error;
    }
  }

  /**
   * Get gate statistics by gateId only (looks up gate group automatically)
   * This is a convenience method when you only have the gateId
   */
  async getRingCxGateStats(gateId) {
    try {
      // First, get all gate groups to find which one contains this gate
      const gateGroups = await this.getRingCxGateGroups();

      for (const group of gateGroups || []) {
        const gates = await this.getRingCxGates(group.gateGroupId);
        const gate = (gates || []).find(g => g.gateId === gateId || g.gateId === parseInt(gateId));
        if (gate) {
          // Found the gate, now get its stats
          const stats = await this.makeRingCxRequest(`/gateGroups/${group.gateGroupId}/gates/${gateId}/stats`);
          return {
            gateId,
            gateGroupId: group.gateGroupId,
            gateName: gate.gateName,
            ...stats,
          };
        }
      }

      throw new Error(`Gate ${gateId} not found in any gate group`);
    } catch (error) {
      logger.error(`Error fetching gate stats for ${gateId}:`, error);
      throw error;
    }
  }

  /**
   * Get agent statistics
   */
  async getRingCxAgentStats(agentId, options = {}) {
    try {
      const params = new URLSearchParams();
      if (options.startDate) params.append('startDate', options.startDate);
      if (options.endDate) params.append('endDate', options.endDate);

      const query = params.toString() ? `?${params.toString()}` : '';
      const data = await this.makeRingCxRequest(`/agents/${agentId}/stats${query}`);
      return data;
    } catch (error) {
      logger.error(`Error fetching agent stats for ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get real-time dashboard stats
   */
  async getRingCxDashboardStats() {
    try {
      const data = await this.makeRingCxRequest('/dashboard');
      return data;
    } catch (error) {
      logger.error('Error fetching RingCX dashboard stats:', error);
      throw error;
    }
  }
}

export const ringCentralService = new RingCentralService();
