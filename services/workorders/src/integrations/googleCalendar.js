import { google } from 'googleapis';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Google Calendar API setup
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

// Initialize OAuth2 client
function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3005/api/google/callback';

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

// Generate auth URL for user to authorize
export function getAuthUrl(resourceId) {
  const oauth2Client = getOAuth2Client();
  const state = Buffer.from(JSON.stringify({ resourceId })).toString('base64');

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    state,
    prompt: 'consent', // Force consent to get refresh token
  });
}

// Exchange authorization code for tokens
export async function handleCallback(code, state) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  // Decode state to get resourceId
  const { resourceId } = JSON.parse(Buffer.from(state, 'base64').toString());

  // Store tokens for the service resource
  await prisma.serviceResource.update({
    where: { id: resourceId },
    data: {
      googleCalendarConnected: true,
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    },
  });

  return { success: true, resourceId };
}

// Get authenticated calendar client for a resource
async function getCalendarClient(resourceId) {
  const resource = await prisma.serviceResource.findUnique({
    where: { id: resourceId },
  });

  if (!resource || !resource.googleCalendarConnected) {
    throw new Error('Google Calendar not connected for this resource');
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: resource.googleAccessToken,
    refresh_token: resource.googleRefreshToken,
    expiry_date: resource.googleTokenExpiry?.getTime(),
  });

  // Handle token refresh
  oauth2Client.on('tokens', async (tokens) => {
    await prisma.serviceResource.update({
      where: { id: resourceId },
      data: {
        googleAccessToken: tokens.access_token,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      },
    });
  });

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

// Create calendar event for service appointment
export async function createCalendarEvent(appointment) {
  const { assignedResources } = appointment;

  if (!assignedResources || assignedResources.length === 0) {
    return null;
  }

  // Get the primary assigned resource
  const primaryResource = assignedResources[0].resource;

  if (!primaryResource.googleCalendarConnected) {
    return null;
  }

  const calendar = await getCalendarClient(primaryResource.id);

  // Build event details
  const event = {
    summary: `${appointment.workOrder?.workType || 'Service'} - ${appointment.workOrder?.account?.name || 'Customer'}`,
    description: buildEventDescription(appointment),
    location: formatAddress(appointment.workOrder?.account),
    start: {
      dateTime: appointment.schedStartTime.toISOString(),
      timeZone: 'America/New_York',
    },
    end: {
      dateTime: appointment.schedEndTime.toISOString(),
      timeZone: 'America/New_York',
    },
    colorId: getColorForWorkType(appointment.workOrder?.workType),
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 15 },
      ],
    },
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
    sendUpdates: 'none',
  });

  // Store the Google Calendar event ID
  await prisma.serviceAppointment.update({
    where: { id: appointment.id },
    data: { googleCalendarEventId: response.data.id },
  });

  return response.data;
}

// Update calendar event
export async function updateCalendarEvent(appointment) {
  if (!appointment.googleCalendarEventId) {
    // No existing event, create new one
    return createCalendarEvent(appointment);
  }

  const { assignedResources } = appointment;
  if (!assignedResources || assignedResources.length === 0) {
    return null;
  }

  const primaryResource = assignedResources[0].resource;
  if (!primaryResource.googleCalendarConnected) {
    return null;
  }

  const calendar = await getCalendarClient(primaryResource.id);

  const event = {
    summary: `${appointment.workOrder?.workType || 'Service'} - ${appointment.workOrder?.account?.name || 'Customer'}`,
    description: buildEventDescription(appointment),
    location: formatAddress(appointment.workOrder?.account),
    start: {
      dateTime: appointment.schedStartTime.toISOString(),
      timeZone: 'America/New_York',
    },
    end: {
      dateTime: appointment.schedEndTime.toISOString(),
      timeZone: 'America/New_York',
    },
    colorId: getColorForWorkType(appointment.workOrder?.workType),
  };

  try {
    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: appointment.googleCalendarEventId,
      resource: event,
      sendUpdates: 'none',
    });
    return response.data;
  } catch (error) {
    if (error.code === 404) {
      // Event was deleted, create new one
      return createCalendarEvent(appointment);
    }
    throw error;
  }
}

// Delete calendar event
export async function deleteCalendarEvent(appointment) {
  if (!appointment.googleCalendarEventId) {
    return null;
  }

  const { assignedResources } = appointment;
  if (!assignedResources || assignedResources.length === 0) {
    return null;
  }

  const primaryResource = assignedResources[0].resource;
  if (!primaryResource.googleCalendarConnected) {
    return null;
  }

  const calendar = await getCalendarClient(primaryResource.id);

  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId: appointment.googleCalendarEventId,
      sendUpdates: 'none',
    });

    await prisma.serviceAppointment.update({
      where: { id: appointment.id },
      data: { googleCalendarEventId: null },
    });

    return { deleted: true };
  } catch (error) {
    if (error.code === 404) {
      // Already deleted
      return { deleted: true };
    }
    throw error;
  }
}

// Get busy times from Google Calendar
export async function getBusyTimes(resourceId, startTime, endTime) {
  const resource = await prisma.serviceResource.findUnique({
    where: { id: resourceId },
  });

  if (!resource || !resource.googleCalendarConnected) {
    return [];
  }

  const calendar = await getCalendarClient(resourceId);

  const response = await calendar.freebusy.query({
    resource: {
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      items: [{ id: 'primary' }],
    },
  });

  const busy = response.data.calendars?.primary?.busy || [];
  return busy.map((slot) => ({
    start: new Date(slot.start),
    end: new Date(slot.end),
  }));
}

// Sync upcoming appointments to Google Calendar
export async function syncAppointmentsToCalendar(resourceId, days = 14) {
  const resource = await prisma.serviceResource.findUnique({
    where: { id: resourceId },
    include: {
      assignedAppointments: {
        where: {
          schedStartTime: {
            gte: new Date(),
            lte: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
          },
          status: { notIn: ['CANCELED', 'CANNOT_COMPLETE'] },
        },
        include: {
          workOrder: {
            include: { account: true },
          },
        },
      },
    },
  });

  if (!resource || !resource.googleCalendarConnected) {
    return { synced: 0, errors: [] };
  }

  const results = { synced: 0, errors: [] };

  for (const assignment of resource.assignedAppointments || []) {
    const appointment = assignment.appointment;
    try {
      if (appointment.googleCalendarEventId) {
        await updateCalendarEvent(appointment);
      } else {
        await createCalendarEvent(appointment);
      }
      results.synced++;
    } catch (error) {
      results.errors.push({
        appointmentId: appointment.id,
        error: error.message,
      });
    }
  }

  return results;
}

// Helper functions
function buildEventDescription(appointment) {
  const wo = appointment.workOrder;
  const account = wo?.account;

  let description = '';

  if (account) {
    description += `Customer: ${account.name}\n`;
    if (account.phone) description += `Phone: ${account.phone}\n`;
    if (account.email) description += `Email: ${account.email}\n`;
    description += '\n';
  }

  if (wo) {
    description += `Work Order: ${wo.workOrderNumber}\n`;
    description += `Type: ${wo.workType}\n`;
    if (wo.description) description += `\nDescription:\n${wo.description}\n`;
  }

  description += `\nAppointment: ${appointment.appointmentNumber}`;
  description += `\nStatus: ${appointment.status}`;

  return description;
}

function formatAddress(account) {
  if (!account) return '';

  const parts = [];
  if (account.billingStreet) parts.push(account.billingStreet);
  if (account.billingCity) parts.push(account.billingCity);
  if (account.billingState) parts.push(account.billingState);
  if (account.billingPostalCode) parts.push(account.billingPostalCode);

  return parts.join(', ');
}

function getColorForWorkType(workType) {
  // Google Calendar color IDs (1-11)
  const colorMap = {
    'Standard Roof Installation': '9', // Blue
    'Gold Pledge Installation': '5', // Yellow
    'Inspection': '10', // Green
    'Repair': '11', // Red
    'Adjustment': '6', // Orange
    'Follow-up': '7', // Cyan
  };

  return colorMap[workType] || '1'; // Default lavender
}

// Disconnect Google Calendar
export async function disconnectCalendar(resourceId) {
  await prisma.serviceResource.update({
    where: { id: resourceId },
    data: {
      googleCalendarConnected: false,
      googleAccessToken: null,
      googleRefreshToken: null,
      googleTokenExpiry: null,
    },
  });

  return { disconnected: true };
}
