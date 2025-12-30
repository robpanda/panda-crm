/**
 * Geocoding Service - Converts addresses to coordinates
 * Uses Google Geocoding API with caching for efficiency
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Google Maps API key from environment
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Geocode a single address and return coordinates
 * @param {string} address - Full address string
 * @returns {Promise<{lat: number, lng: number, status: string} | null>}
 */
export async function geocodeAddress(address) {
  if (!address || address.trim().length === 0) {
    return null;
  }

  if (!GOOGLE_API_KEY) {
    console.warn('GOOGLE_MAPS_API_KEY not set, using fallback geocoding');
    return fallbackGeocode(address);
  }

  try {
    const encodedAddress = encodeURIComponent(address);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${GOOGLE_API_KEY}`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK' && data.results.length > 0) {
      const location = data.results[0].geometry.location;
      return {
        lat: location.lat,
        lng: location.lng,
        status: 'success',
        formattedAddress: data.results[0].formatted_address,
      };
    } else if (data.status === 'ZERO_RESULTS') {
      return { lat: null, lng: null, status: 'no_results' };
    } else {
      console.error('Geocoding error:', data.status, data.error_message);
      return { lat: null, lng: null, status: 'error' };
    }
  } catch (error) {
    console.error('Geocoding fetch error:', error);
    return { lat: null, lng: null, status: 'error' };
  }
}

/**
 * Fallback geocoding using approximate state/city center coordinates
 * Used when Google API key is not available
 */
function fallbackGeocode(address) {
  // State center coordinates (approximate)
  const stateCoordinates = {
    'MD': { lat: 39.0458, lng: -76.6413 },
    'Maryland': { lat: 39.0458, lng: -76.6413 },
    'VA': { lat: 37.4316, lng: -78.6569 },
    'Virginia': { lat: 37.4316, lng: -78.6569 },
    'DE': { lat: 38.9108, lng: -75.5277 },
    'Delaware': { lat: 38.9108, lng: -75.5277 },
    'PA': { lat: 41.2033, lng: -77.1945 },
    'Pennsylvania': { lat: 41.2033, lng: -77.1945 },
    'NJ': { lat: 40.0583, lng: -74.4057 },
    'New Jersey': { lat: 40.0583, lng: -74.4057 },
    'NC': { lat: 35.7596, lng: -79.0193 },
    'North Carolina': { lat: 35.7596, lng: -79.0193 },
    'SC': { lat: 33.8361, lng: -81.1637 },
    'South Carolina': { lat: 33.8361, lng: -81.1637 },
    'FL': { lat: 27.6648, lng: -81.5158 },
    'Florida': { lat: 27.6648, lng: -81.5158 },
    'NY': { lat: 40.7128, lng: -74.0060 },
    'New York': { lat: 40.7128, lng: -74.0060 },
    'AR': { lat: 35.2010, lng: -91.8318 },
    'Arkansas': { lat: 35.2010, lng: -91.8318 },
  };

  // Try to extract state from address
  const addressUpper = address.toUpperCase();
  for (const [state, coords] of Object.entries(stateCoordinates)) {
    if (addressUpper.includes(state.toUpperCase())) {
      return {
        lat: coords.lat,
        lng: coords.lng,
        status: 'partial', // Indicates approximate location
      };
    }
  }

  return { lat: null, lng: null, status: 'failed' };
}

/**
 * Build full address string from components
 */
export function buildAddressString(street, city, state, postalCode) {
  const parts = [street, city, state, postalCode].filter(Boolean);
  return parts.join(', ');
}

/**
 * Geocode an Account record and update its coordinates
 * @param {string} accountId - Account ID to geocode
 */
export async function geocodeAccount(accountId) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      billingStreet: true,
      billingCity: true,
      billingState: true,
      billingPostalCode: true,
      latitude: true,
      longitude: true,
    },
  });

  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  // Skip if already geocoded
  if (account.latitude && account.longitude) {
    return { success: true, cached: true };
  }

  const address = buildAddressString(
    account.billingStreet,
    account.billingCity,
    account.billingState,
    account.billingPostalCode
  );

  if (!address) {
    return { success: false, error: 'No address available' };
  }

  const result = await geocodeAddress(address);

  if (result && result.lat && result.lng) {
    await prisma.account.update({
      where: { id: accountId },
      data: {
        latitude: result.lat,
        longitude: result.lng,
        geocodedAt: new Date(),
        geocodeStatus: result.status,
      },
    });
    return { success: true, lat: result.lat, lng: result.lng };
  }

  // Update status even on failure for tracking
  await prisma.account.update({
    where: { id: accountId },
    data: {
      geocodeStatus: result?.status || 'failed',
    },
  });

  return { success: false, status: result?.status };
}

/**
 * Geocode a ServiceAppointment record
 * Falls back to Account address if appointment has no address
 */
export async function geocodeServiceAppointment(appointmentId) {
  const appointment = await prisma.serviceAppointment.findUnique({
    where: { id: appointmentId },
    select: {
      id: true,
      street: true,
      city: true,
      state: true,
      postalCode: true,
      latitude: true,
      longitude: true,
      workOrder: {
        select: {
          account: {
            select: {
              billingStreet: true,
              billingCity: true,
              billingState: true,
              billingPostalCode: true,
              latitude: true,
              longitude: true,
            },
          },
        },
      },
    },
  });

  if (!appointment) {
    throw new Error(`Appointment not found: ${appointmentId}`);
  }

  // Skip if already geocoded
  if (appointment.latitude && appointment.longitude) {
    return { success: true, cached: true };
  }

  // Try appointment address first, then fall back to account address
  let address = buildAddressString(
    appointment.street,
    appointment.city,
    appointment.state,
    appointment.postalCode
  );

  // If no appointment address, try account address
  if (!address && appointment.workOrder?.account) {
    const account = appointment.workOrder.account;

    // If account is already geocoded, use those coordinates
    if (account.latitude && account.longitude) {
      await prisma.serviceAppointment.update({
        where: { id: appointmentId },
        data: {
          latitude: account.latitude,
          longitude: account.longitude,
          geocodedAt: new Date(),
        },
      });
      return { success: true, lat: account.latitude, lng: account.longitude, fromAccount: true };
    }

    address = buildAddressString(
      account.billingStreet,
      account.billingCity,
      account.billingState,
      account.billingPostalCode
    );
  }

  if (!address) {
    return { success: false, error: 'No address available' };
  }

  const result = await geocodeAddress(address);

  if (result && result.lat && result.lng) {
    await prisma.serviceAppointment.update({
      where: { id: appointmentId },
      data: {
        latitude: result.lat,
        longitude: result.lng,
        geocodedAt: new Date(),
      },
    });
    return { success: true, lat: result.lat, lng: result.lng };
  }

  return { success: false, status: result?.status };
}

/**
 * Batch geocode multiple accounts
 * @param {number} limit - Max records to process
 * @param {boolean} forceRegeocode - Re-geocode even if already done
 */
export async function batchGeocodeAccounts(limit = 100, forceRegeocode = false) {
  const whereClause = forceRegeocode
    ? {}
    : {
        OR: [
          { latitude: null },
          { geocodeStatus: 'pending' },
          { geocodeStatus: 'failed' },
        ],
      };

  const accounts = await prisma.account.findMany({
    where: whereClause,
    select: { id: true },
    take: limit,
  });

  const results = { success: 0, failed: 0, total: accounts.length };

  for (const account of accounts) {
    try {
      const result = await geocodeAccount(account.id);
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
      }

      // Rate limiting - Google allows 50 requests/second
      await new Promise(resolve => setTimeout(resolve, 25));
    } catch (error) {
      console.error(`Error geocoding account ${account.id}:`, error);
      results.failed++;
    }
  }

  return results;
}

/**
 * Batch geocode service appointments
 */
export async function batchGeocodeAppointments(limit = 100) {
  const appointments = await prisma.serviceAppointment.findMany({
    where: {
      latitude: null,
    },
    select: { id: true },
    take: limit,
  });

  const results = { success: 0, failed: 0, total: appointments.length };

  for (const appointment of appointments) {
    try {
      const result = await geocodeServiceAppointment(appointment.id);
      if (result.success) {
        results.success++;
      } else {
        results.failed++;
      }
      await new Promise(resolve => setTimeout(resolve, 25));
    } catch (error) {
      console.error(`Error geocoding appointment ${appointment.id}:`, error);
      results.failed++;
    }
  }

  return results;
}

export default {
  geocodeAddress,
  geocodeAccount,
  geocodeServiceAppointment,
  batchGeocodeAccounts,
  batchGeocodeAppointments,
  buildAddressString,
};
