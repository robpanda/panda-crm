// Google Calendar Service - Calendar integration for crew scheduling
// Uses Domain-Wide Delegation to access all staff calendars without individual OAuth
import { PrismaClient } from '@prisma/client';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { google } from 'googleapis';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });

// Cached service account credentials
let serviceAccountCredentials = null;

// Google Workspace domain
const GOOGLE_WORKSPACE_DOMAIN = process.env.GOOGLE_WORKSPACE_DOMAIN || 'panda-exteriors.com';

/**
 * Get Google Service Account credentials from AWS Secrets Manager
 */
async function getServiceAccountCredentials() {
  if (serviceAccountCredentials) return serviceAccountCredentials;

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: 'google/calendar-service-account' })
    );
    serviceAccountCredentials = JSON.parse(response.SecretString);
    return serviceAccountCredentials;
  } catch (error) {
    logger.error('Failed to get Google service account credentials:', error);
    throw new Error('Unable to retrieve Google Calendar credentials');
  }
}

/**
 * Create a JWT auth client that impersonates a specific user
 * This uses Domain-Wide Delegation to access any user's calendar
 */
async function getAuthClientForUser(userEmail) {
  const credentials = await getServiceAccountCredentials();

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
    subject: userEmail, // Impersonate this user
  });

  return auth;
}

/**
 * Get calendar client for a specific user
 */
async function getCalendarClientForUser(userEmail) {
  const auth = await getAuthClientForUser(userEmail);
  return google.calendar({ version: 'v3', auth });
}

/**
 * Google Calendar Service - Calendar sync for crew scheduling
 * Uses Domain-Wide Delegation for organization-wide access
 */
export const googleCalendarService = {
  /**
   * Test connection to a user's calendar
   */
  async testConnection(userEmail) {
    try {
      const calendar = await getCalendarClientForUser(userEmail);
      const response = await calendar.calendarList.list({ maxResults: 1 });

      return {
        success: true,
        email: userEmail,
        calendarsFound: response.data.items?.length || 0,
      };
    } catch (error) {
      logger.error(`Failed to connect to calendar for ${userEmail}:`, error);
      return {
        success: false,
        email: userEmail,
        error: error.message,
      };
    }
  },

  /**
   * Get user's primary calendar ID
   */
  async getPrimaryCalendarId(userEmail) {
    const calendar = await getCalendarClientForUser(userEmail);
    const response = await calendar.calendarList.list();

    const primaryCalendar = response.data.items?.find(cal => cal.primary);
    return primaryCalendar?.id || 'primary';
  },

  /**
   * Get all events from a user's calendar within a date range
   */
  async getEvents(userEmail, startDate, endDate, options = {}) {
    const calendar = await getCalendarClientForUser(userEmail);
    const calendarId = options.calendarId || 'primary';

    const response = await calendar.events.list({
      calendarId,
      timeMin: new Date(startDate).toISOString(),
      timeMax: new Date(endDate).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: options.maxResults || 250,
    });

    return response.data.items || [];
  },

  /**
   * Get busy/free information for a user
   */
  async getFreeBusy(userEmail, startDate, endDate) {
    const calendar = await getCalendarClientForUser(userEmail);

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: new Date(startDate).toISOString(),
        timeMax: new Date(endDate).toISOString(),
        items: [{ id: userEmail }],
      },
    });

    const busySlots = response.data.calendars?.[userEmail]?.busy || [];
    return busySlots.map(slot => ({
      start: slot.start,
      end: slot.end,
    }));
  },

  /**
   * Get busy/free information for multiple users at once
   */
  async getFreeBusyMultiple(userEmails, startDate, endDate) {
    // Use service account to query (doesn't need impersonation for freebusy)
    const credentials = await getServiceAccountCredentials();
    const auth = new google.auth.JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      // For freebusy query, we can use any user that has domain-wide access
      subject: userEmails[0],
    });

    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: new Date(startDate).toISOString(),
        timeMax: new Date(endDate).toISOString(),
        items: userEmails.map(email => ({ id: email })),
      },
    });

    const result = {};
    for (const email of userEmails) {
      result[email] = response.data.calendars?.[email]?.busy || [];
    }

    return result;
  },

  /**
   * Create calendar event for service appointment
   */
  async createAppointmentEvent(userEmail, appointment) {
    const calendar = await getCalendarClientForUser(userEmail);

    const event = {
      summary: `${appointment.workType || 'Appointment'} - ${appointment.account?.name || appointment.customerName || 'Customer'}`,
      description: `
Project: ${appointment.opportunity?.name || appointment.projectName || 'N/A'}
Address: ${appointment.address || appointment.account?.billingAddress || 'N/A'}
Work Order: ${appointment.workOrderId || 'N/A'}
Appointment ID: ${appointment.id}

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
      colorId: appointment.colorId || '9', // Default blue
      extendedProperties: {
        private: {
          serviceAppointmentId: appointment.id,
          workOrderId: appointment.workOrderId || '',
          opportunityId: appointment.opportunityId || '',
          source: 'panda-crm',
        },
      },
    };

    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'none', // Don't send invite emails
    });

    logger.info(`Created Google Calendar event for ${userEmail}: ${result.data.id}`);

    return {
      eventId: result.data.id,
      htmlLink: result.data.htmlLink,
      userEmail,
    };
  },

  /**
   * Update calendar event
   */
  async updateAppointmentEvent(userEmail, googleEventId, updates) {
    const calendar = await getCalendarClientForUser(userEmail);

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

    if (updates.colorId) {
      event.colorId = updates.colorId;
    }

    const result = await calendar.events.patch({
      calendarId: 'primary',
      eventId: googleEventId,
      requestBody: event,
      sendUpdates: 'none',
    });

    logger.info(`Updated Google Calendar event for ${userEmail}: ${googleEventId}`);

    return {
      eventId: result.data.id,
      htmlLink: result.data.htmlLink,
    };
  },

  /**
   * Delete calendar event
   */
  async deleteAppointmentEvent(userEmail, googleEventId) {
    const calendar = await getCalendarClientForUser(userEmail);

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId,
      sendUpdates: 'none',
    });

    logger.info(`Deleted Google Calendar event for ${userEmail}: ${googleEventId}`);

    return { deleted: true };
  },

  /**
   * Get availability (busy slots) from calendar
   */
  async getAvailability(userEmail, startDate, endDate) {
    const events = await this.getEvents(userEmail, startDate, endDate);

    return events.map(event => ({
      start: event.start.dateTime || event.start.date,
      end: event.end.dateTime || event.end.date,
      summary: event.summary,
      isBusy: event.transparency !== 'transparent',
    }));
  },

  /**
   * Find available time slots for a user
   */
  async findAvailableSlots(userEmail, startDate, endDate, durationMinutes = 60) {
    const busySlots = await this.getFreeBusy(userEmail, startDate, endDate);

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
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(day);
      dayEnd.setHours(23, 59, 59, 999);

      const dayBusySlots = busySlots
        .filter(slot => {
          const slotStart = new Date(slot.start);
          return slotStart >= dayStart && slotStart <= dayEnd;
        })
        .sort((a, b) => new Date(a.start) - new Date(b.start));

      // Find available slots
      let currentTime = businessStart;

      for (const busySlot of dayBusySlots) {
        const busyStart = new Date(busySlot.start);
        const busyMinutes = busyStart.getHours() * 60 + busyStart.getMinutes();

        if (busyMinutes > currentTime && busyMinutes - currentTime >= durationMinutes) {
          const slotStart = new Date(day);
          slotStart.setHours(Math.floor(currentTime / 60), currentTime % 60, 0, 0);

          const slotEnd = new Date(day);
          slotEnd.setHours(Math.floor(busyMinutes / 60), busyMinutes % 60, 0, 0);

          availableSlots.push({
            start: slotStart.toISOString(),
            end: slotEnd.toISOString(),
            durationMinutes: busyMinutes - currentTime,
          });
        }

        const busyEnd = new Date(busySlot.end);
        currentTime = Math.max(currentTime, busyEnd.getHours() * 60 + busyEnd.getMinutes());
      }

      // Check time after last busy slot
      if (businessEnd - currentTime >= durationMinutes) {
        const slotStart = new Date(day);
        slotStart.setHours(Math.floor(currentTime / 60), currentTime % 60, 0, 0);

        const slotEnd = new Date(day);
        slotEnd.setHours(Math.floor(businessEnd / 60), businessEnd % 60, 0, 0);

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
   * Sync all scheduled appointments for a user to their calendar
   */
  async syncAppointmentsForUser(userId) {
    // Get user with their Google email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, google_calendar_email: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const calendarEmail = user.google_calendar_email || user.email;
    logger.info(`Syncing appointments for user ${userId} (${calendarEmail})`);

    // Get all appointments assigned to this user's service resource
    const serviceResource = await prisma.serviceResource.findFirst({
      where: { userId },
    });

    if (!serviceResource) {
      logger.warn(`No service resource found for user ${userId}`);
      return { synced: 0, errors: 0, message: 'No service resource linked to user' };
    }

    // Get appointments via assigned resources
    const assignedResources = await prisma.assignedResource.findMany({
      where: { serviceResourceId: serviceResource.id },
      include: {
        serviceAppointment: {
          include: {
            workOrder: {
              include: {
                account: true,
                opportunity: true,
              },
            },
          },
        },
      },
    });

    let synced = 0;
    let errors = 0;

    for (const assigned of assignedResources) {
      const appointment = assigned.serviceAppointment;

      // Skip if already synced or not scheduled
      if (appointment.googleEventId || appointment.status !== 'SCHEDULED') continue;
      if (!appointment.scheduledStart || new Date(appointment.scheduledStart) < new Date()) continue;

      try {
        const eventData = {
          id: appointment.id,
          workType: appointment.workType?.name || appointment.workTypeName,
          account: appointment.workOrder?.account,
          opportunity: appointment.workOrder?.opportunity,
          address: appointment.address || appointment.workOrder?.account?.billingAddress,
          workOrderId: appointment.workOrderId,
          opportunityId: appointment.workOrder?.opportunityId,
          scheduledStart: appointment.scheduledStart,
          scheduledEnd: appointment.scheduledEnd,
          notes: appointment.description,
        };

        const result = await this.createAppointmentEvent(calendarEmail, eventData);

        await prisma.serviceAppointment.update({
          where: { id: appointment.id },
          data: { googleEventId: result.eventId },
        });

        synced++;
      } catch (error) {
        logger.error(`Failed to sync appointment ${appointment.id}:`, error);
        errors++;
      }
    }

    logger.info(`Sync complete for ${calendarEmail}: ${synced} synced, ${errors} errors`);

    return { synced, errors, userEmail: calendarEmail };
  },

  /**
   * Sync all users' calendars
   */
  async syncAllUsers() {
    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        OR: [
          { google_calendar_email: { not: null } },
          { email: { endsWith: `@${GOOGLE_WORKSPACE_DOMAIN}` } },
        ],
      },
      select: { id: true, email: true, google_calendar_email: true },
    });

    const results = [];

    for (const user of users) {
      try {
        const result = await this.syncAppointmentsForUser(user.id);
        results.push({ userId: user.id, ...result });
      } catch (error) {
        logger.error(`Failed to sync for user ${user.id}:`, error);
        results.push({ userId: user.id, error: error.message });
      }
    }

    return results;
  },

  /**
   * Link a CRM user to their Google Calendar email
   * (in case their CRM email differs from their Google Workspace email)
   */
  async linkUserToGoogleCalendar(userId, googleEmail, enableSync = true) {
    // First test the connection
    const testResult = await this.testConnection(googleEmail);

    if (!testResult.success) {
      throw new Error(`Cannot access calendar for ${googleEmail}: ${testResult.error}`);
    }

    // Update user with Google Calendar email and sync enabled
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        google_calendar_email: googleEmail,
        google_calendar_sync_enabled: enableSync,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        google_calendar_email: true,
        google_calendar_sync_enabled: true,
      },
    });

    logger.info(`Linked user ${userId} to Google Calendar: ${googleEmail}, sync enabled: ${enableSync}`);

    return { linked: true, googleEmail, syncEnabled: enableSync, user };
  },

  /**
   * Get connection status for a user
   * Returns database state without requiring Google API connection test
   */
  async getConnectionStatus(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          google_calendar_email: true,
          google_calendar_sync_enabled: true,
          googleCalendarLastSyncAt: true,
        },
      });

      if (!user) {
        return { connected: false, error: 'User not found' };
      }

      const calendarEmail = user.google_calendar_email;
      const isLinked = !!calendarEmail;

      // Only test connection if user has a linked calendar email
      // and skip test if it would fail silently
      let connectionVerified = false;
      let connectionError = null;

      if (isLinked && user.google_calendar_sync_enabled) {
        try {
          const testResult = await this.testConnection(calendarEmail);
          connectionVerified = testResult.success;
          connectionError = testResult.error;
        } catch (err) {
          // Don't fail the whole request if connection test fails
          logger.warn(`Calendar connection test failed for ${calendarEmail}:`, err.message);
          connectionError = 'Could not verify connection';
        }
      }

      return {
        connected: isLinked,
        google_calendar_email: calendarEmail,
        syncEnabled: user.google_calendar_sync_enabled || false,
        lastSyncAt: user.googleCalendarLastSyncAt,
        isLinked,
        connectionVerified,
        error: connectionError,
      };
    } catch (error) {
      logger.error('Error getting calendar connection status:', error);
      return {
        connected: false,
        google_calendar_email: null,
        syncEnabled: false,
        lastSyncAt: null,
        isLinked: false,
        connectionVerified: false,
        error: 'Failed to fetch calendar status',
      };
    }
  },

  /**
   * Get all users and their calendar connection status
   */
  async getAllUsersCalendarStatus() {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        google_calendar_email: true,
        google_calendar_sync_enabled: true,
        googleCalendarLastSyncAt: true,
      },
      orderBy: { lastName: 'asc' },
    });

    // Return without testing each connection (too slow for 200+ users)
    // Connection is tested when linking
    return users.map(user => ({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      google_calendar_email: user.google_calendar_email,
      google_calendar_sync_enabled: user.google_calendar_sync_enabled || false,
      googleCalendarLastSyncAt: user.googleCalendarLastSyncAt,
    }));
  },
};

export default googleCalendarService;
