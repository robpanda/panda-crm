// Google Calendar Service - Calendar integration for crew scheduling
import { PrismaClient } from '@prisma/client';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { google } from 'googleapis';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });

// Cached credentials
let googleCredentials = null;

/**
 * Get Google OAuth credentials from AWS Secrets Manager
 */
async function getGoogleCredentials() {
  if (googleCredentials) return googleCredentials;

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'google/calendar-oauth' })
    );
    googleCredentials = JSON.parse(response.SecretString);
    return googleCredentials;
  } catch (error) {
    logger.error('Failed to get Google credentials:', error);
    throw new Error('Unable to retrieve Google Calendar credentials');
  }
}

/**
 * Create OAuth2 client
 */
async function getOAuth2Client() {
  const credentials = await getGoogleCredentials();

  return new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uri || `${process.env.API_BASE_URL}/api/integrations/google/callback`
  );
}

/**
 * Google Calendar Service - Calendar sync for crew scheduling
 */
export const googleCalendarService = {
  /**
   * Generate OAuth authorization URL
   */
  async getAuthUrl(serviceResourceId, state = {}) {
    const oauth2Client = await getOAuth2Client();

    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: JSON.stringify({
        serviceResourceId,
        ...state,
      }),
      prompt: 'consent', // Force consent to get refresh token
    });

    return authUrl;
  },

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code, serviceResourceId) {
    const oauth2Client = await getOAuth2Client();

    const { tokens } = await oauth2Client.getToken(code);

    // Get calendar list to find primary calendar
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const calendarList = await calendar.calendarList.list();
    const primaryCalendar = calendarList.data.items.find(cal => cal.primary);

    // Store credentials
    const sync = await prisma.googleCalendarSync.upsert({
      where: { serviceResourceId },
      create: {
        serviceResourceId,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: new Date(tokens.expiry_date),
        calendarId: primaryCalendar?.id || 'primary',
        syncEnabled: true,
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || undefined,
        tokenExpiry: new Date(tokens.expiry_date),
        calendarId: primaryCalendar?.id || 'primary',
        syncEnabled: true,
      },
    });

    logger.info(`Google Calendar connected for service resource: ${serviceResourceId}`);

    return {
      connected: true,
      calendarId: sync.calendarId,
    };
  },

  /**
   * Get authenticated calendar client for a service resource
   */
  async getCalendarClient(serviceResourceId) {
    const sync = await prisma.googleCalendarSync.findUnique({
      where: { serviceResourceId },
    });

    if (!sync) {
      throw new Error('Google Calendar not connected for this resource');
    }

    if (!sync.syncEnabled) {
      throw new Error('Calendar sync is disabled for this resource');
    }

    const oauth2Client = await getOAuth2Client();
    oauth2Client.setCredentials({
      access_token: sync.accessToken,
      refresh_token: sync.refreshToken,
    });

    // Check if token needs refresh
    if (sync.tokenExpiry && new Date(sync.tokenExpiry) < new Date()) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();

        await prisma.googleCalendarSync.update({
          where: { serviceResourceId },
          data: {
            accessToken: credentials.access_token,
            tokenExpiry: new Date(credentials.expiry_date),
          },
        });

        oauth2Client.setCredentials(credentials);
      } catch (error) {
        logger.error('Failed to refresh Google token:', error);
        throw new Error('Failed to refresh Google Calendar token');
      }
    }

    return {
      calendar: google.calendar({ version: 'v3', auth: oauth2Client }),
      calendarId: sync.calendarId,
    };
  },

  /**
   * Create calendar event for service appointment
   */
  async createAppointmentEvent(serviceResourceId, appointment) {
    const { calendar, calendarId } = await this.getCalendarClient(serviceResourceId);

    const event = {
      summary: `${appointment.workType || 'Appointment'} - ${appointment.account?.name || 'Customer'}`,
      description: `
Project: ${appointment.opportunity?.name || 'N/A'}
Address: ${appointment.address || appointment.account?.billingAddress || 'N/A'}
Work Order: ${appointment.workOrderId || 'N/A'}

Notes: ${appointment.notes || 'None'}
      `.trim(),
      location: appointment.address || appointment.account?.billingAddress,
      start: {
        dateTime: new Date(appointment.scheduledStart).toISOString(),
        timeZone: 'America/New_York',
      },
      end: {
        dateTime: new Date(appointment.scheduledEnd).toISOString(),
        timeZone: 'America/New_York',
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
          { method: 'popup', minutes: 15 },
        ],
      },
      extendedProperties: {
        private: {
          serviceAppointmentId: appointment.id,
          workOrderId: appointment.workOrderId,
          opportunityId: appointment.opportunityId,
        },
      },
    };

    const result = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    logger.info(`Created Google Calendar event: ${result.data.id}`);

    return {
      eventId: result.data.id,
      htmlLink: result.data.htmlLink,
    };
  },

  /**
   * Update calendar event
   */
  async updateAppointmentEvent(serviceResourceId, googleEventId, updates) {
    const { calendar, calendarId } = await this.getCalendarClient(serviceResourceId);

    const event = {};

    if (updates.summary) event.summary = updates.summary;
    if (updates.description) event.description = updates.description;
    if (updates.location) event.location = updates.location;

    if (updates.scheduledStart) {
      event.start = {
        dateTime: new Date(updates.scheduledStart).toISOString(),
        timeZone: 'America/New_York',
      };
    }

    if (updates.scheduledEnd) {
      event.end = {
        dateTime: new Date(updates.scheduledEnd).toISOString(),
        timeZone: 'America/New_York',
      };
    }

    const result = await calendar.events.patch({
      calendarId,
      eventId: googleEventId,
      requestBody: event,
    });

    logger.info(`Updated Google Calendar event: ${googleEventId}`);

    return {
      eventId: result.data.id,
      htmlLink: result.data.htmlLink,
    };
  },

  /**
   * Delete calendar event
   */
  async deleteAppointmentEvent(serviceResourceId, googleEventId) {
    const { calendar, calendarId } = await this.getCalendarClient(serviceResourceId);

    await calendar.events.delete({
      calendarId,
      eventId: googleEventId,
    });

    logger.info(`Deleted Google Calendar event: ${googleEventId}`);

    return { deleted: true };
  },

  /**
   * Get availability from calendar
   */
  async getAvailability(serviceResourceId, startDate, endDate) {
    const { calendar, calendarId } = await this.getCalendarClient(serviceResourceId);

    const response = await calendar.events.list({
      calendarId,
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    });

    const busySlots = response.data.items.map(event => ({
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      summary: event.summary,
    }));

    return busySlots;
  },

  /**
   * Find available time slots
   */
  async findAvailableSlots(serviceResourceId, startDate, endDate, durationMinutes = 60) {
    const busySlots = await this.getAvailability(serviceResourceId, startDate, endDate);

    // Business hours: 8 AM - 6 PM
    const businessStart = 8 * 60; // minutes from midnight
    const businessEnd = 18 * 60;

    const availableSlots = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Iterate through each day
    for (let day = new Date(start); day < end; day.setDate(day.getDate() + 1)) {
      // Skip weekends
      if (day.getDay() === 0 || day.getDay() === 6) continue;

      // Get busy slots for this day
      const dayStart = new Date(day);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59);

      const dayBusySlots = busySlots.filter(slot => {
        const slotStart = new Date(slot.start);
        return slotStart >= dayStart && slotStart <= dayEnd;
      });

      // Find available slots
      let currentTime = businessStart;

      for (const busySlot of dayBusySlots) {
        const busyStart = new Date(busySlot.start);
        const busyMinutes = busyStart.getHours() * 60 + busyStart.getMinutes();

        if (busyMinutes > currentTime && busyMinutes - currentTime >= durationMinutes) {
          const slotStart = new Date(day);
          slotStart.setHours(Math.floor(currentTime / 60), currentTime % 60, 0);

          const slotEnd = new Date(day);
          slotEnd.setHours(Math.floor(busyMinutes / 60), busyMinutes % 60, 0);

          availableSlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            durationMinutes: busyMinutes - currentTime,
          });
        }

        const busyEnd = new Date(busySlot.end);
        currentTime = busyEnd.getHours() * 60 + busyEnd.getMinutes();
      }

      // Check time after last busy slot
      if (businessEnd - currentTime >= durationMinutes) {
        const slotStart = new Date(day);
        slotStart.setHours(Math.floor(currentTime / 60), currentTime % 60, 0);

        const slotEnd = new Date(day);
        slotEnd.setHours(Math.floor(businessEnd / 60), businessEnd % 60, 0);

        availableSlots.push({
          start: slotStart.toISOString(),
          end: slotEnd.toISOString(),
          durationMinutes: businessEnd - currentTime,
        });
      }
    }

    return availableSlots;
  },

  /**
   * Sync all appointments for a service resource
   */
  async syncAppointments(serviceResourceId) {
    logger.info(`Syncing appointments for resource: ${serviceResourceId}`);

    // Get all scheduled appointments
    const appointments = await prisma.serviceAppointment.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledStart: { gte: new Date() },
      },
      include: {
        account: true,
        opportunity: true,
      },
    });

    let synced = 0;
    let errors = 0;

    for (const appointment of appointments) {
      try {
        if (!appointment.googleEventId) {
          // Create new event
          const result = await this.createAppointmentEvent(serviceResourceId, appointment);

          await prisma.serviceAppointment.update({
            where: { id: appointment.id },
            data: { googleEventId: result.eventId },
          });

          synced++;
        }
      } catch (error) {
        logger.error(`Failed to sync appointment ${appointment.id}:`, error);
        errors++;
      }
    }

    // Update last sync time
    await prisma.googleCalendarSync.update({
      where: { serviceResourceId },
      data: { lastSyncedAt: new Date() },
    });

    logger.info(`Sync complete: ${synced} synced, ${errors} errors`);

    return { synced, errors };
  },

  /**
   * Disconnect Google Calendar
   */
  async disconnect(serviceResourceId) {
    await prisma.googleCalendarSync.delete({
      where: { serviceResourceId },
    });

    logger.info(`Google Calendar disconnected for: ${serviceResourceId}`);

    return { disconnected: true };
  },

  /**
   * Get sync status for a service resource
   */
  async getSyncStatus(serviceResourceId) {
    const sync = await prisma.googleCalendarSync.findUnique({
      where: { serviceResourceId },
    });

    if (!sync) {
      return { connected: false };
    }

    return {
      connected: true,
      syncEnabled: sync.syncEnabled,
      calendarId: sync.calendarId,
      lastSyncedAt: sync.lastSyncedAt,
    };
  },

  /**
   * Toggle sync enabled/disabled
   */
  async toggleSync(serviceResourceId, enabled) {
    const sync = await prisma.googleCalendarSync.update({
      where: { serviceResourceId },
      data: { syncEnabled: enabled },
    });

    return {
      syncEnabled: sync.syncEnabled,
    };
  },
};

export default googleCalendarService;
