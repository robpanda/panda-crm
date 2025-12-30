/**
 * Route Optimization Service - Calculates optimal routes for field service appointments
 * Includes distance/travel time calculation and route ordering
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Google Distance Matrix API key from environment
const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Earth radius in miles for haversine calculation
const EARTH_RADIUS_MILES = 3959;

/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Origin latitude
 * @param {number} lon1 - Origin longitude
 * @param {number} lat2 - Destination latitude
 * @param {number} lon2 - Destination longitude
 * @returns {number} Distance in miles
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_MILES * c;
}

/**
 * Estimate travel time based on distance (assumes average 30 mph in suburban areas)
 * @param {number} distanceMiles - Distance in miles
 * @param {string} areaType - 'urban', 'suburban', 'rural'
 * @returns {number} Estimated minutes
 */
export function estimateTravelTime(distanceMiles, areaType = 'suburban') {
  const avgSpeeds = {
    urban: 20, // 20 mph average in cities
    suburban: 30, // 30 mph average in suburbs
    rural: 45, // 45 mph average in rural areas
  };

  const avgSpeed = avgSpeeds[areaType] || avgSpeeds.suburban;
  const travelMinutes = (distanceMiles / avgSpeed) * 60;

  // Add buffer time for parking, walking, etc.
  const bufferMinutes = 5;

  return Math.ceil(travelMinutes + bufferMinutes);
}

/**
 * Get distance and duration from Google Distance Matrix API
 * With caching to reduce API calls
 */
export async function getDistanceMatrix(origins, destinations) {
  if (!GOOGLE_API_KEY) {
    console.warn('GOOGLE_MAPS_API_KEY not set, using haversine calculation');
    return null;
  }

  try {
    const originsParam = origins.map((o) => `${o.lat},${o.lng}`).join('|');
    const destsParam = destinations.map((d) => `${d.lat},${d.lng}`).join('|');

    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originsParam}&destinations=${destsParam}&key=${GOOGLE_API_KEY}&units=imperial`;

    const response = await fetch(url);
    const data = await response.json();

    if (data.status === 'OK') {
      return data;
    } else {
      console.error('Distance Matrix API error:', data.status, data.error_message);
      return null;
    }
  } catch (error) {
    console.error('Distance Matrix fetch error:', error);
    return null;
  }
}

/**
 * Get cached distance or calculate and cache
 */
export async function getCachedDistance(originLat, originLon, destLat, destLon) {
  // Round to 4 decimal places for caching (about 11m precision)
  const roundTo4 = (n) => Math.round(n * 10000) / 10000;
  const oLat = roundTo4(originLat);
  const oLon = roundTo4(originLon);
  const dLat = roundTo4(destLat);
  const dLon = roundTo4(destLon);

  // Check cache first
  const cached = await prisma.distanceCache.findFirst({
    where: {
      originLat: oLat,
      originLon: oLon,
      destLat: dLat,
      destLon: dLon,
      expiresAt: { gt: new Date() },
    },
  });

  if (cached) {
    return {
      distanceMiles: cached.distanceMeters / 1609.34,
      durationMinutes: Math.ceil(cached.durationSeconds / 60),
      source: 'cache',
    };
  }

  // Try Google Distance Matrix API
  const matrixResult = await getDistanceMatrix([{ lat: oLat, lng: oLon }], [{ lat: dLat, lng: dLon }]);

  if (matrixResult && matrixResult.rows?.[0]?.elements?.[0]?.status === 'OK') {
    const element = matrixResult.rows[0].elements[0];
    const distanceMeters = element.distance.value;
    const durationSeconds = element.duration.value;

    // Cache for 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await prisma.distanceCache.upsert({
      where: {
        originLat_originLon_destLat_destLon_provider: {
          originLat: oLat,
          originLon: oLon,
          destLat: dLat,
          destLon: dLon,
          provider: 'google',
        },
      },
      update: {
        distanceMeters,
        durationSeconds,
        expiresAt,
      },
      create: {
        originLat: oLat,
        originLon: oLon,
        destLat: dLat,
        destLon: dLon,
        distanceMeters,
        durationSeconds,
        provider: 'google',
        expiresAt,
      },
    });

    return {
      distanceMiles: distanceMeters / 1609.34,
      durationMinutes: Math.ceil(durationSeconds / 60),
      source: 'google',
    };
  }

  // Fallback to haversine
  const distanceMiles = haversineDistance(oLat, oLon, dLat, dLon);
  const durationMinutes = estimateTravelTime(distanceMiles);

  return {
    distanceMiles,
    durationMinutes,
    source: 'haversine',
  };
}

/**
 * Calculate total route distance for a sequence of appointments
 * @param {Array} appointments - Array of appointments with latitude/longitude
 * @param {Object} startLocation - Starting point {lat, lng} (e.g., crew base location)
 * @returns {Promise<{totalMiles: number, totalMinutes: number, legs: Array}>}
 */
export async function calculateRouteDistance(appointments, startLocation = null) {
  if (!appointments || appointments.length === 0) {
    return { totalMiles: 0, totalMinutes: 0, legs: [] };
  }

  const legs = [];
  let totalMiles = 0;
  let totalMinutes = 0;

  // Filter appointments with valid coordinates
  const validAppointments = appointments.filter((a) => a.latitude && a.longitude);

  if (validAppointments.length === 0) {
    return { totalMiles: 0, totalMinutes: 0, legs: [] };
  }

  let prevLocation = startLocation;

  for (const appointment of validAppointments) {
    if (prevLocation) {
      const distance = await getCachedDistance(
        prevLocation.lat,
        prevLocation.lng,
        appointment.latitude,
        appointment.longitude
      );

      legs.push({
        from: prevLocation,
        to: { lat: appointment.latitude, lng: appointment.longitude },
        appointmentId: appointment.id,
        distanceMiles: distance.distanceMiles,
        durationMinutes: distance.durationMinutes,
        source: distance.source,
      });

      totalMiles += distance.distanceMiles;
      totalMinutes += distance.durationMinutes;
    }

    prevLocation = { lat: appointment.latitude, lng: appointment.longitude };
  }

  return { totalMiles, totalMinutes, legs };
}

/**
 * Optimize route using nearest neighbor algorithm
 * (Good enough for small sets of appointments, O(n²) complexity)
 * @param {Array} appointments - Array of appointments with latitude/longitude
 * @param {Object} startLocation - Starting point
 * @returns {Array} Optimized order of appointments
 */
export function optimizeRouteNearestNeighbor(appointments, startLocation = null) {
  const validAppointments = appointments.filter((a) => a.latitude && a.longitude);

  if (validAppointments.length <= 1) {
    return validAppointments;
  }

  const result = [];
  const remaining = [...validAppointments];
  let currentLat = startLocation?.lat || validAppointments[0].latitude;
  let currentLon = startLocation?.lng || validAppointments[0].longitude;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineDistance(currentLat, currentLon, remaining[i].latitude, remaining[i].longitude);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const nearest = remaining.splice(nearestIdx, 1)[0];
    result.push(nearest);
    currentLat = nearest.latitude;
    currentLon = nearest.longitude;
  }

  return result;
}

/**
 * Optimize route using 2-opt algorithm (improvement over nearest neighbor)
 * Attempts to improve route by reversing segments
 */
export function optimizeRoute2Opt(appointments, startLocation = null, maxIterations = 100) {
  let route = optimizeRouteNearestNeighbor(appointments, startLocation);

  if (route.length <= 2) {
    return route;
  }

  const routeDistance = (r) => {
    let dist = 0;
    let prev = startLocation || { lat: r[0].latitude, lng: r[0].longitude };

    for (const apt of r) {
      dist += haversineDistance(prev.lat, prev.lng, apt.latitude, apt.longitude);
      prev = { lat: apt.latitude, lng: apt.longitude };
    }
    return dist;
  };

  let improved = true;
  let iterations = 0;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 2; j < route.length; j++) {
        // Create new route with segment reversed
        const newRoute = [
          ...route.slice(0, i + 1),
          ...route.slice(i + 1, j + 1).reverse(),
          ...route.slice(j + 1),
        ];

        if (routeDistance(newRoute) < routeDistance(route)) {
          route = newRoute;
          improved = true;
        }
      }
    }
  }

  return route;
}

/**
 * Get optimized route for a resource (crew) on a specific date
 * @param {string} resourceId - ServiceResource ID
 * @param {Date} date - The date to optimize
 * @param {Object} options - Options for optimization
 * @returns {Promise<{originalOrder: Array, optimizedOrder: Array, savings: Object}>}
 */
export async function optimizeResourceRoute(resourceId, date, options = {}) {
  const { algorithm = '2opt', includeCompleted = false } = options;

  // Get the resource's base location (from territory or default)
  const resource = await prisma.serviceResource.findUnique({
    where: { id: resourceId },
    include: {
      territoryMemberships: {
        where: { isPrimary: true },
        include: { territory: true },
      },
    },
  });

  if (!resource) {
    throw new Error(`Resource not found: ${resourceId}`);
  }

  // Get base location from primary territory or use default
  let startLocation = null;
  if (resource.territoryMemberships?.[0]?.territory) {
    const territory = resource.territoryMemberships[0].territory;
    // For now, use territory center or skip if not available
    // In production, this would come from territory configuration
  }

  // Get appointments for the date
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const statusFilter = includeCompleted
    ? {}
    : { NOT: { status: { in: ['COMPLETED', 'CANCELED', 'CANNOT_COMPLETE'] } } };

  const appointments = await prisma.serviceAppointment.findMany({
    where: {
      assignedResources: {
        some: { serviceResourceId: resourceId },
      },
      scheduledStart: {
        gte: startOfDay,
        lte: endOfDay,
      },
      ...statusFilter,
    },
    orderBy: { scheduledStart: 'asc' },
  });

  if (appointments.length === 0) {
    return { originalOrder: [], optimizedOrder: [], savings: { miles: 0, minutes: 0 } };
  }

  // Calculate original route distance
  const originalRoute = await calculateRouteDistance(appointments, startLocation);

  // Optimize the route
  let optimizedAppointments;
  if (algorithm === 'nearest') {
    optimizedAppointments = optimizeRouteNearestNeighbor(appointments, startLocation);
  } else {
    optimizedAppointments = optimizeRoute2Opt(appointments, startLocation);
  }

  // Calculate optimized route distance
  const optimizedRoute = await calculateRouteDistance(optimizedAppointments, startLocation);

  return {
    originalOrder: appointments.map((a) => ({
      id: a.id,
      appointmentNumber: a.appointmentNumber,
      scheduledStart: a.scheduledStart,
      latitude: a.latitude,
      longitude: a.longitude,
    })),
    optimizedOrder: optimizedAppointments.map((a, idx) => ({
      id: a.id,
      appointmentNumber: a.appointmentNumber,
      scheduledStart: a.scheduledStart,
      latitude: a.latitude,
      longitude: a.longitude,
      suggestedOrder: idx + 1,
    })),
    savings: {
      miles: originalRoute.totalMiles - optimizedRoute.totalMiles,
      minutes: originalRoute.totalMinutes - optimizedRoute.totalMinutes,
      percentReduction:
        originalRoute.totalMiles > 0
          ? ((originalRoute.totalMiles - optimizedRoute.totalMiles) / originalRoute.totalMiles) * 100
          : 0,
    },
    original: originalRoute,
    optimized: optimizedRoute,
  };
}

/**
 * Update appointment travel times based on optimized route
 * @param {string} resourceId - ServiceResource ID
 * @param {Date} date - The date to update
 */
export async function updateAppointmentTravelTimes(resourceId, date) {
  const result = await optimizeResourceRoute(resourceId, date);

  if (result.optimizedOrder.length === 0) {
    return { updated: 0 };
  }

  let updated = 0;

  for (const leg of result.optimized.legs) {
    await prisma.serviceAppointment.update({
      where: { id: leg.appointmentId },
      data: {
        travelTimeMinutes: leg.durationMinutes,
        travelDistanceMiles: leg.distanceMiles,
      },
    });
    updated++;
  }

  return { updated, savings: result.savings };
}

/**
 * Find appointments within a radius of a location
 * @param {number} lat - Center latitude
 * @param {number} lon - Center longitude
 * @param {number} radiusMiles - Radius in miles
 * @param {Object} filters - Additional filters (date range, status, etc.)
 */
export async function findAppointmentsInRadius(lat, lon, radiusMiles, filters = {}) {
  const { startDate, endDate, status, workTypeId } = filters;

  const where = {};

  if (startDate) {
    where.scheduledStart = { gte: new Date(startDate) };
  }
  if (endDate) {
    where.scheduledStart = { ...where.scheduledStart, lte: new Date(endDate) };
  }
  if (status) {
    where.status = status;
  }
  if (workTypeId) {
    where.workTypeId = workTypeId;
  }

  // Get all appointments with coordinates (we'll filter by distance in memory)
  const appointments = await prisma.serviceAppointment.findMany({
    where: {
      ...where,
      latitude: { not: null },
      longitude: { not: null },
    },
    include: {
      workOrder: {
        include: { account: true },
      },
      workType: true,
    },
  });

  // Filter by distance
  return appointments
    .map((apt) => {
      const distance = haversineDistance(lat, lon, apt.latitude, apt.longitude);
      return { ...apt, distanceMiles: distance };
    })
    .filter((apt) => apt.distanceMiles <= radiusMiles)
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

/**
 * Suggest optimal time slots for a new appointment based on existing routes
 * @param {Object} location - {lat, lng} of the new appointment
 * @param {string} resourceId - ServiceResource ID
 * @param {Date} date - Target date
 * @param {number} durationMinutes - Appointment duration
 */
export async function suggestOptimalTimeSlot(location, resourceId, date, durationMinutes) {
  const result = await optimizeResourceRoute(resourceId, date);
  const existingAppointments = result.optimizedOrder;

  if (existingAppointments.length === 0) {
    // No existing appointments, suggest start of day
    const startTime = new Date(date);
    startTime.setHours(8, 0, 0, 0);
    return [
      {
        startTime,
        endTime: new Date(startTime.getTime() + durationMinutes * 60000),
        additionalTravelMiles: 0,
        additionalTravelMinutes: 0,
        insertPosition: 0,
      },
    ];
  }

  const suggestions = [];

  // Try inserting at each position and calculate additional travel
  for (let i = 0; i <= existingAppointments.length; i++) {
    const prevApt = i > 0 ? existingAppointments[i - 1] : null;
    const nextApt = i < existingAppointments.length ? existingAppointments[i] : null;

    // Calculate additional travel if inserted here
    let additionalTravel = { distanceMiles: 0, durationMinutes: 0 };

    if (prevApt && nextApt) {
      // Replacing direct route with route through new location
      const directDist = await getCachedDistance(
        prevApt.latitude,
        prevApt.longitude,
        nextApt.latitude,
        nextApt.longitude
      );

      const toPrev = await getCachedDistance(prevApt.latitude, prevApt.longitude, location.lat, location.lng);

      const toNext = await getCachedDistance(location.lat, location.lng, nextApt.latitude, nextApt.longitude);

      additionalTravel.distanceMiles = toPrev.distanceMiles + toNext.distanceMiles - directDist.distanceMiles;
      additionalTravel.durationMinutes = toPrev.durationMinutes + toNext.durationMinutes - directDist.durationMinutes;
    } else if (prevApt) {
      // Appending to end
      const toNew = await getCachedDistance(prevApt.latitude, prevApt.longitude, location.lat, location.lng);
      additionalTravel = toNew;
    } else if (nextApt) {
      // Prepending to start
      const toNew = await getCachedDistance(location.lat, location.lng, nextApt.latitude, nextApt.longitude);
      additionalTravel = toNew;
    }

    // Calculate suggested start time
    let suggestedStart;
    if (prevApt) {
      const prevEnd = new Date(prevApt.scheduledStart);
      prevEnd.setMinutes(prevEnd.getMinutes() + (prevApt.duration || 60));
      suggestedStart = new Date(prevEnd.getTime() + additionalTravel.durationMinutes * 60000);
    } else {
      suggestedStart = new Date(date);
      suggestedStart.setHours(8, 0, 0, 0);
    }

    suggestions.push({
      startTime: suggestedStart,
      endTime: new Date(suggestedStart.getTime() + durationMinutes * 60000),
      additionalTravelMiles: additionalTravel.distanceMiles,
      additionalTravelMinutes: additionalTravel.durationMinutes,
      insertPosition: i,
      afterAppointment: prevApt?.appointmentNumber || null,
      beforeAppointment: nextApt?.appointmentNumber || null,
    });
  }

  // Sort by least additional travel
  return suggestions.sort((a, b) => a.additionalTravelMinutes - b.additionalTravelMinutes);
}

export default {
  haversineDistance,
  estimateTravelTime,
  getDistanceMatrix,
  getCachedDistance,
  calculateRouteDistance,
  optimizeRouteNearestNeighbor,
  optimizeRoute2Opt,
  optimizeResourceRoute,
  updateAppointmentTravelTimes,
  findAppointmentsInRadius,
  suggestOptimalTimeSlot,
};
