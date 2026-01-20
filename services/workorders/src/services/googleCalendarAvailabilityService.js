/**
 * Google Calendar Availability Service
 * Checks Google Calendar busy times for service resources during scheduling
 * Uses Domain-Wide Delegation to access staff calendars
 */

import { PrismaClient } from '@prisma/client';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { google } from 'googleapis';

const prisma = new PrismaClient();
const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-2' });

// Cached service account credentials
let serviceAccountCredentials = null;

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
    console.error('Failed to get Google service account credentials:', error.message);
    return null;
  }
}

/**
 * Create a JWT auth client that impersonates a specific user
 */
async function getAuthClientForUser(userEmail) {
  const credentials = await getServiceAccountCredentials();
  if (!credentials) return null;

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
    subject: userEmail,
  });

  return auth;
}

/**
 * Get busy/free information for a user from Google Calendar
 * @param {string} userEmail - Google Calendar email address
 * @param {Date} startDate - Start of time range
 * @param {Date} endDate - End of time range
 * @returns {Promise<Array<{start: string, end: string}>>} Array of busy slots
 */
export async function getFreeBusy(userEmail, startDate, endDate) {
  try {
    const auth = await getAuthClientForUser(userEmail);
    if (!auth) {
      console.warn('Google Calendar service unavailable, skipping busy check');
      return [];
    }

    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: new Date(startDate).toISOString(),
        timeMax: new Date(endDate).toISOString(),
        items: [{ id: userEmail }],
      },
    });

    const busySlots = response.data.calendars?.[userEmail]?.busy || [];
    return busySlots.map(slot => ({
      start: new Date(slot.start),
      end: new Date(slot.end),
    }));
  } catch (error) {
    console.error(`Failed to get freebusy for ${userEmail}:`, error.message);
    return [];
  }
}

/**
 * Get Google Calendar busy times for a service resource
 * @param {string} resourceId - ServiceResource ID
 * @param {Date} startDate - Start of time range
 * @param {Date} endDate - End of time range
 * @returns {Promise<Array<{start: Date, end: Date}>>} Array of busy time slots
 */
export async function getResourceCalendarBusyTimes(resourceId, startDate, endDate) {
  try {
    // Get the service resource with linked user
    const resource = await prisma.serviceResource.findUnique({
      where: { id: resourceId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            googleCalendarEmail: true,
            googleCalendarSyncEnabled: true,
          },
        },
      },
    });

    if (!resource?.user) {
      return [];
    }

    // Check if calendar sync is enabled for this user
    if (!resource.user.googleCalendarSyncEnabled) {
      return [];
    }

    const calendarEmail = resource.user.googleCalendarEmail || resource.user.email;
    if (!calendarEmail) {
      return [];
    }

    return await getFreeBusy(calendarEmail, startDate, endDate);
  } catch (error) {
    console.error(`Failed to get calendar busy times for resource ${resourceId}:`, error.message);
    return [];
  }
}

/**
 * Get Google Calendar busy times for multiple service resources
 * @param {Array<string>} resourceIds - Array of ServiceResource IDs
 * @param {Date} startDate - Start of time range
 * @param {Date} endDate - End of time range
 * @returns {Promise<Map<string, Array<{start: Date, end: Date}>>>} Map of resourceId -> busy slots
 */
export async function getMultipleResourceCalendarBusyTimes(resourceIds, startDate, endDate) {
  const result = new Map();

  // Get all resources with their users in one query
  const resources = await prisma.serviceResource.findMany({
    where: { id: { in: resourceIds } },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          googleCalendarEmail: true,
          googleCalendarSyncEnabled: true,
        },
      },
    },
  });

  // Build map of email to resource IDs
  const emailToResourceIds = new Map();
  const resourcesToCheck = [];

  for (const resource of resources) {
    if (resource.user?.googleCalendarSyncEnabled) {
      const email = resource.user.googleCalendarEmail || resource.user.email;
      if (email) {
        if (!emailToResourceIds.has(email)) {
          emailToResourceIds.set(email, []);
        }
        emailToResourceIds.get(email).push(resource.id);
        resourcesToCheck.push({ resourceId: resource.id, email });
      }
    }
  }

  // Fetch busy times for each unique email
  const uniqueEmails = [...emailToResourceIds.keys()];

  await Promise.all(
    uniqueEmails.map(async (email) => {
      const busyTimes = await getFreeBusy(email, startDate, endDate);
      const resourceIdsForEmail = emailToResourceIds.get(email);

      for (const resourceId of resourceIdsForEmail) {
        result.set(resourceId, busyTimes);
      }
    })
  );

  // Initialize empty arrays for resources without calendar
  for (const resourceId of resourceIds) {
    if (!result.has(resourceId)) {
      result.set(resourceId, []);
    }
  }

  return result;
}

/**
 * Check if a time slot conflicts with any Google Calendar events
 * @param {string} resourceId - ServiceResource ID
 * @param {Date} slotStart - Proposed slot start time
 * @param {Date} slotEnd - Proposed slot end time
 * @returns {Promise<{hasConflict: boolean, conflicts: Array}>}
 */
export async function checkSlotForCalendarConflict(resourceId, slotStart, slotEnd) {
  const busyTimes = await getResourceCalendarBusyTimes(resourceId, slotStart, slotEnd);

  const conflicts = busyTimes.filter(busy => {
    // Check for overlap
    return busy.start < slotEnd && busy.end > slotStart;
  });

  return {
    hasConflict: conflicts.length > 0,
    conflicts: conflicts.map(c => ({
      start: c.start.toISOString(),
      end: c.end.toISOString(),
    })),
  };
}

/**
 * Filter out time slots that conflict with Google Calendar events
 * @param {string} resourceId - ServiceResource ID
 * @param {Array<{start: Date, end: Date}>} slots - Array of potential time slots
 * @returns {Promise<Array>} Filtered slots without calendar conflicts
 */
export async function filterSlotsForCalendarConflicts(resourceId, slots) {
  if (!slots || slots.length === 0) return [];

  // Get the full date range
  const earliest = new Date(Math.min(...slots.map(s => new Date(s.start || s.startDateTime).getTime())));
  const latest = new Date(Math.max(...slots.map(s => new Date(s.end || s.endDateTime).getTime())));

  const busyTimes = await getResourceCalendarBusyTimes(resourceId, earliest, latest);

  if (busyTimes.length === 0) {
    return slots; // No calendar events, all slots available
  }

  return slots.filter(slot => {
    const slotStart = new Date(slot.start || slot.startDateTime);
    const slotEnd = new Date(slot.end || slot.endDateTime);

    // Check for any overlapping busy time
    const hasConflict = busyTimes.some(busy =>
      busy.start < slotEnd && busy.end > slotStart
    );

    return !hasConflict;
  });
}

/**
 * Merge CRM appointments with Google Calendar busy times into unified busy periods
 * @param {Array<{start: Date, end: Date}>} crmBusyPeriods - Busy periods from CRM appointments
 * @param {Array<{start: Date, end: Date}>} calendarBusyPeriods - Busy periods from Google Calendar
 * @returns {Array<{start: Date, end: Date, source: string}>} Combined busy periods
 */
export function mergeBusyPeriods(crmBusyPeriods, calendarBusyPeriods) {
  const allPeriods = [
    ...crmBusyPeriods.map(p => ({ ...p, source: 'crm' })),
    ...calendarBusyPeriods.map(p => ({ ...p, source: 'google_calendar' })),
  ].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  if (allPeriods.length === 0) return [];

  // Merge overlapping periods
  const merged = [allPeriods[0]];

  for (let i = 1; i < allPeriods.length; i++) {
    const current = allPeriods[i];
    const lastMerged = merged[merged.length - 1];

    if (new Date(current.start) <= new Date(lastMerged.end)) {
      // Overlapping or adjacent - extend the end if needed
      if (new Date(current.end) > new Date(lastMerged.end)) {
        lastMerged.end = current.end;
        lastMerged.source = 'mixed';
      }
    } else {
      // No overlap - add as new period
      merged.push(current);
    }
  }

  return merged;
}

export default {
  getFreeBusy,
  getResourceCalendarBusyTimes,
  getMultipleResourceCalendarBusyTimes,
  checkSlotForCalendarConflict,
  filterSlotsForCalendarConflicts,
  mergeBusyPeriods,
};
