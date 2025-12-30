import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import {
  addMinutes,
  addDays,
  startOfDay,
  endOfDay,
  format,
  parseISO,
  isWithinInterval,
  isSameDay,
  differenceInMinutes,
} from 'date-fns';

// Import the new FSL-equivalent services
import * as geocodingService from '../services/geocodingService.js';
import * as routeOptimizationService from '../services/routeOptimizationService.js';
import * as schedulingPolicyService from '../services/schedulingPolicyService.js';

const prisma = new PrismaClient();

// Auto-schedule request schema
const autoScheduleSchema = z.object({
  serviceAppointmentId: z.string(),
  preferredResourceIds: z.array(z.string()).optional(),
  preferredDate: z.string().datetime().optional(),
  dateRangeStart: z.string().datetime().optional(),
  dateRangeEnd: z.string().datetime().optional(),
  respectOperatingHours: z.boolean().default(true),
});

// Find available slots schema
const findSlotsSchema = z.object({
  territoryId: z.string().optional(),
  resourceIds: z.array(z.string()).optional(),
  durationMinutes: z.number().int().positive().default(120),
  dateFrom: z.string().datetime(),
  dateTo: z.string().datetime(),
  skillRequirements: z.array(z.string()).optional(),
});

// Auto-schedule service appointment (replicates SelfGenAutoScheduler)
export async function autoScheduleAppointment(req, res, next) {
  try {
    const data = autoScheduleSchema.parse(req.body);

    const appointment = await prisma.serviceAppointment.findUnique({
      where: { id: data.serviceAppointmentId },
      include: {
        workOrder: {
          include: {
            account: true,
            territory: {
              include: {
                operatingHours: { include: { timeSlots: true } },
                members: {
                  where: { resource: { isActive: true } },
                  include: { resource: true },
                },
              },
            },
            workType: true,
          },
        },
        assignedResources: true,
      },
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Service appointment not found' });
    }

    if (appointment.status !== 'NONE') {
      return res.status(400).json({
        error: 'Appointment already scheduled or in progress',
        currentStatus: appointment.status,
      });
    }

    // Determine territory and resources
    const territory = appointment.workOrder.territory;
    if (!territory) {
      return res.status(400).json({ error: 'Work order has no assigned territory' });
    }

    // Get available resources
    let candidateResources = [];
    if (data.preferredResourceIds && data.preferredResourceIds.length > 0) {
      candidateResources = await prisma.serviceResource.findMany({
        where: { id: { in: data.preferredResourceIds }, isActive: true },
      });
    } else {
      candidateResources = territory.members.map((m) => m.resource);
    }

    if (candidateResources.length === 0) {
      return res.status(400).json({ error: 'No available resources in territory' });
    }

    // Determine duration
    const duration = appointment.duration || appointment.workOrder.workType?.estimatedDuration || 120;

    // Determine date range
    const startDate = data.dateRangeStart
      ? parseISO(data.dateRangeStart)
      : data.preferredDate
        ? parseISO(data.preferredDate)
        : new Date();
    const endDate = data.dateRangeEnd ? parseISO(data.dateRangeEnd) : addDays(startDate, 14);

    // Get operating hours
    const operatingHours = territory.operatingHours;
    const timeSlots = operatingHours?.timeSlots || [];

    // Find first available slot
    let bestSlot = null;
    let currentDate = startOfDay(startDate);

    while (currentDate <= endDate && !bestSlot) {
      const dayOfWeek = currentDate.getDay();
      const daySlots = timeSlots.filter((s) => s.dayOfWeek === dayOfWeek);

      if (daySlots.length === 0) {
        currentDate = addDays(currentDate, 1);
        continue;
      }

      for (const resource of candidateResources) {
        // Check for absences
        const hasAbsence = await prisma.resourceAbsence.count({
          where: {
            resourceId: resource.id,
            start: { lte: endOfDay(currentDate) },
            end: { gte: startOfDay(currentDate) },
          },
        });

        if (hasAbsence > 0) continue;

        // Get existing appointments for this resource on this day
        const existingAppointments = await prisma.assignedResource.findMany({
          where: {
            serviceResourceId: resource.id,
            serviceAppointment: {
              scheduledStart: { gte: startOfDay(currentDate), lte: endOfDay(currentDate) },
              status: { notIn: ['COMPLETED', 'CANCELED', 'CANNOT_COMPLETE'] },
            },
          },
          include: {
            serviceAppointment: {
              select: { scheduledStart: true, scheduledEnd: true },
            },
          },
        });

        const busyPeriods = existingAppointments.map((a) => ({
          start: a.serviceAppointment.scheduledStart,
          end: a.serviceAppointment.scheduledEnd,
        }));

        // Find available slot in operating hours
        for (const slot of daySlots) {
          const [startHour, startMin] = slot.startTime.split(':').map(Number);
          const [endHour, endMin] = slot.endTime.split(':').map(Number);

          const slotStart = new Date(currentDate);
          slotStart.setHours(startHour, startMin, 0, 0);

          const slotEnd = new Date(currentDate);
          slotEnd.setHours(endHour, endMin, 0, 0);

          // Start from current time if today
          let searchStart = slotStart;
          if (isSameDay(currentDate, new Date()) && new Date() > slotStart) {
            searchStart = new Date();
            searchStart.setMinutes(Math.ceil(searchStart.getMinutes() / 30) * 30, 0, 0);
          }

          // Find gaps
          let candidateStart = searchStart;
          const sortedBusy = busyPeriods.sort((a, b) => a.start.getTime() - b.start.getTime());

          for (const busy of sortedBusy) {
            if (busy.start > candidateStart) {
              const gapMinutes = differenceInMinutes(busy.start, candidateStart);
              if (gapMinutes >= duration) {
                bestSlot = {
                  resourceId: resource.id,
                  resourceName: resource.name,
                  start: candidateStart,
                  end: addMinutes(candidateStart, duration),
                };
                break;
              }
            }
            if (busy.end > candidateStart) {
              candidateStart = busy.end;
            }
          }

          if (bestSlot) break;

          // Check remaining time after all appointments
          if (!bestSlot && candidateStart < slotEnd) {
            const remainingMinutes = differenceInMinutes(slotEnd, candidateStart);
            if (remainingMinutes >= duration) {
              bestSlot = {
                resourceId: resource.id,
                resourceName: resource.name,
                start: candidateStart,
                end: addMinutes(candidateStart, duration),
              };
            }
          }

          if (bestSlot) break;
        }

        if (bestSlot) break;
      }

      currentDate = addDays(currentDate, 1);
    }

    if (!bestSlot) {
      return res.status(400).json({
        error: 'No available time slots found',
        searchedDateRange: {
          from: format(startDate, 'yyyy-MM-dd'),
          to: format(endDate, 'yyyy-MM-dd'),
        },
        resourcesChecked: candidateResources.length,
      });
    }

    // Update appointment
    const updatedAppointment = await prisma.serviceAppointment.update({
      where: { id: data.serviceAppointmentId },
      data: {
        scheduledStart: bestSlot.start,
        scheduledEnd: bestSlot.end,
        status: 'SCHEDULED',
      },
    });

    // Assign resource
    await prisma.assignedResource.upsert({
      where: {
        serviceAppointmentId_serviceResourceId: {
          serviceAppointmentId: data.serviceAppointmentId,
          serviceResourceId: bestSlot.resourceId,
        },
      },
      create: {
        serviceAppointmentId: data.serviceAppointmentId,
        serviceResourceId: bestSlot.resourceId,
        isPrimaryResource: true,
      },
      update: {
        isPrimaryResource: true,
      },
    });

    res.json({
      success: true,
      appointment: updatedAppointment,
      scheduledSlot: {
        resourceId: bestSlot.resourceId,
        resourceName: bestSlot.resourceName,
        start: bestSlot.start,
        end: bestSlot.end,
      },
    });
  } catch (error) {
    next(error);
  }
}

// Find available time slots
export async function findAvailableSlots(req, res, next) {
  try {
    const data = findSlotsSchema.parse(req.body);

    const startDate = parseISO(data.dateFrom);
    const endDate = parseISO(data.dateTo);
    const duration = data.durationMinutes;

    // Get candidate resources
    let resourceWhere = { isActive: true };

    if (data.resourceIds && data.resourceIds.length > 0) {
      resourceWhere.id = { in: data.resourceIds };
    } else if (data.territoryId) {
      resourceWhere.territoryMembers = {
        some: { territoryId: data.territoryId },
      };
    }

    if (data.skillRequirements && data.skillRequirements.length > 0) {
      resourceWhere.skills = {
        some: { skillId: { in: data.skillRequirements } },
      };
    }

    const resources = await prisma.serviceResource.findMany({
      where: resourceWhere,
      include: {
        territoryMembers: {
          include: {
            territory: {
              include: {
                operatingHours: { include: { timeSlots: true } },
              },
            },
          },
        },
      },
    });

    // Get all existing appointments in date range
    const existingAssignments = await prisma.assignedResource.findMany({
      where: {
        serviceResourceId: { in: resources.map((r) => r.id) },
        serviceAppointment: {
          scheduledStart: { gte: startDate, lte: endDate },
          status: { notIn: ['COMPLETED', 'CANCELED', 'CANNOT_COMPLETE'] },
        },
      },
      include: {
        serviceAppointment: {
          select: { scheduledStart: true, scheduledEnd: true },
        },
      },
    });

    // Get all absences in date range
    const absences = await prisma.resourceAbsence.findMany({
      where: {
        resourceId: { in: resources.map((r) => r.id) },
        OR: [
          { start: { gte: startDate, lte: endDate } },
          { end: { gte: startDate, lte: endDate } },
        ],
      },
    });

    // Build availability map
    const availableSlots = [];
    let currentDate = startOfDay(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const dateStr = format(currentDate, 'yyyy-MM-dd');

      for (const resource of resources) {
        // Get operating hours from primary territory
        const primaryMember = resource.territoryMembers.find((m) => m.isPrimary);
        const timeSlots = primaryMember?.territory?.operatingHours?.timeSlots || [];
        const daySlots = timeSlots.filter((s) => s.dayOfWeek === dayOfWeek);

        if (daySlots.length === 0) continue;

        // Check for absence
        const hasAbsence = absences.some(
          (a) =>
            a.resourceId === resource.id &&
            isWithinInterval(currentDate, { start: startOfDay(a.start), end: endOfDay(a.end) })
        );

        if (hasAbsence) continue;

        // Get busy periods for this resource on this day
        const busyPeriods = existingAssignments
          .filter(
            (a) =>
              a.serviceResourceId === resource.id &&
              isSameDay(a.serviceAppointment.scheduledStart, currentDate)
          )
          .map((a) => ({
            start: a.serviceAppointment.scheduledStart,
            end: a.serviceAppointment.scheduledEnd,
          }))
          .sort((a, b) => a.start.getTime() - b.start.getTime());

        // Find available slots in each operating hours window
        for (const slot of daySlots) {
          const [startHour, startMin] = slot.startTime.split(':').map(Number);
          const [endHour, endMin] = slot.endTime.split(':').map(Number);

          const windowStart = new Date(currentDate);
          windowStart.setHours(startHour, startMin, 0, 0);

          const windowEnd = new Date(currentDate);
          windowEnd.setHours(endHour, endMin, 0, 0);

          let searchStart = windowStart;

          for (const busy of busyPeriods) {
            if (busy.start > searchStart) {
              const gapMinutes = differenceInMinutes(busy.start, searchStart);
              if (gapMinutes >= duration) {
                availableSlots.push({
                  date: dateStr,
                  resourceId: resource.id,
                  resourceName: resource.name,
                  start: format(searchStart, 'HH:mm'),
                  end: format(addMinutes(searchStart, duration), 'HH:mm'),
                  startDateTime: searchStart.toISOString(),
                  endDateTime: addMinutes(searchStart, duration).toISOString(),
                  durationMinutes: duration,
                });
              }
            }
            if (busy.end > searchStart) {
              searchStart = busy.end;
            }
          }

          // Check remaining time
          if (searchStart < windowEnd) {
            const remainingMinutes = differenceInMinutes(windowEnd, searchStart);
            if (remainingMinutes >= duration) {
              availableSlots.push({
                date: dateStr,
                resourceId: resource.id,
                resourceName: resource.name,
                start: format(searchStart, 'HH:mm'),
                end: format(addMinutes(searchStart, duration), 'HH:mm'),
                startDateTime: searchStart.toISOString(),
                endDateTime: addMinutes(searchStart, duration).toISOString(),
                durationMinutes: duration,
              });
            }
          }
        }
      }

      currentDate = addDays(currentDate, 1);
    }

    // Group by date
    const slotsByDate = availableSlots.reduce((acc, slot) => {
      if (!acc[slot.date]) {
        acc[slot.date] = [];
      }
      acc[slot.date].push(slot);
      return acc;
    }, {});

    res.json({
      dateRange: {
        from: format(startDate, 'yyyy-MM-dd'),
        to: format(endDate, 'yyyy-MM-dd'),
      },
      requestedDuration: duration,
      totalSlots: availableSlots.length,
      resourcesChecked: resources.length,
      slotsByDate,
      slots: availableSlots.slice(0, 100), // Limit for performance
    });
  } catch (error) {
    next(error);
  }
}

// Get dispatch board data
export async function getDispatchBoard(req, res, next) {
  try {
    const { date, territoryId } = req.query;

    const targetDate = date ? parseISO(date) : new Date();

    // Get resources
    let resourceWhere = { isActive: true };
    if (territoryId) {
      resourceWhere.territoryMembers = { some: { territoryId } };
    }

    const resources = await prisma.serviceResource.findMany({
      where: resourceWhere,
      include: {
        territoryMembers: { include: { territory: true } },
      },
      orderBy: { name: 'asc' },
    });

    // Get appointments for the day
    const appointments = await prisma.serviceAppointment.findMany({
      where: {
        scheduledStart: { gte: startOfDay(targetDate), lte: endOfDay(targetDate) },
        status: { notIn: ['CANCELED'] },
      },
      include: {
        workOrder: {
          include: {
            account: { select: { id: true, name: true, phone: true } },
            opportunity: { select: { id: true, name: true } },
            workType: { select: { name: true } },
          },
        },
        assignedResources: {
          include: {
            serviceResource: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { scheduledStart: 'asc' },
    });

    // Build board data by resource
    const board = resources.map((resource) => {
      const resourceAppointments = appointments.filter((apt) =>
        apt.assignedResources.some((ar) => ar.serviceResourceId === resource.id)
      );

      return {
        resource: {
          id: resource.id,
          name: resource.name,
          resourceType: resource.resourceType,
          territories: resource.territoryMembers.map((m) => m.territory.name),
        },
        appointments: resourceAppointments.map((apt) => ({
          id: apt.id,
          appointmentNumber: apt.appointmentNumber,
          status: apt.status,
          scheduledStart: apt.scheduledStart,
          scheduledEnd: apt.scheduledEnd,
          duration: apt.duration,
          account: apt.workOrder.account,
          workType: apt.workOrder.workType?.name,
          address: `${apt.street || ''}, ${apt.city || ''}, ${apt.state || ''}`.trim(),
        })),
        appointmentCount: resourceAppointments.length,
        scheduledMinutes: resourceAppointments.reduce((sum, apt) => sum + (apt.duration || 0), 0),
      };
    });

    // Unassigned appointments
    const unassigned = appointments.filter((apt) => apt.assignedResources.length === 0);

    // Summary stats
    const stats = {
      totalAppointments: appointments.length,
      byStatus: appointments.reduce((acc, apt) => {
        acc[apt.status] = (acc[apt.status] || 0) + 1;
        return acc;
      }, {}),
      assignedCount: appointments.length - unassigned.length,
      unassignedCount: unassigned.length,
    };

    res.json({
      date: format(targetDate, 'yyyy-MM-dd'),
      stats,
      board,
      unassignedAppointments: unassigned,
    });
  } catch (error) {
    next(error);
  }
}

// Optimize schedule using route optimization service (FSL-equivalent)
export async function optimizeSchedule(req, res, next) {
  try {
    const { resourceId, date, applyChanges = false, algorithm = '2opt' } = req.body;

    const targetDate = date ? parseISO(date) : new Date();

    // Use the route optimization service
    const result = await routeOptimizationService.optimizeResourceRoute(resourceId, targetDate, { algorithm });

    // If applyChanges is true, update travel times on appointments
    if (applyChanges && result.optimizedOrder.length > 0) {
      await routeOptimizationService.updateAppointmentTravelTimes(resourceId, targetDate);
    }

    res.json({
      resourceId,
      date: format(targetDate, 'yyyy-MM-dd'),
      appointmentCount: result.originalOrder.length,
      originalOrder: result.originalOrder,
      optimizedOrder: result.optimizedOrder,
      savings: result.savings,
      original: {
        totalMiles: result.original?.totalMiles || 0,
        totalMinutes: result.original?.totalMinutes || 0,
      },
      optimized: {
        totalMiles: result.optimized?.totalMiles || 0,
        totalMinutes: result.optimized?.totalMinutes || 0,
      },
      changesApplied: applyChanges,
    });
  } catch (error) {
    next(error);
  }
}

// ============================================
// NEW FSL-EQUIVALENT ENDPOINTS
// ============================================

// Geocode endpoints
export async function geocodeAddress(req, res, next) {
  try {
    const { address } = req.body;
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }
    const result = await geocodingService.geocodeAddress(address);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function geocodeAccount(req, res, next) {
  try {
    const { accountId } = req.params;
    const result = await geocodingService.geocodeAccount(accountId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function geocodeAppointment(req, res, next) {
  try {
    const { appointmentId } = req.params;
    const result = await geocodingService.geocodeServiceAppointment(appointmentId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function batchGeocodeAccounts(req, res, next) {
  try {
    const { limit = 100, forceRegeocode = false } = req.body;
    const result = await geocodingService.batchGeocodeAccounts(limit, forceRegeocode);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function batchGeocodeAppointments(req, res, next) {
  try {
    const { limit = 100 } = req.body;
    const result = await geocodingService.batchGeocodeAppointments(limit);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// Distance calculation endpoints
export async function calculateDistance(req, res, next) {
  try {
    const { origin, destination } = req.body;
    if (!origin?.lat || !origin?.lng || !destination?.lat || !destination?.lng) {
      return res.status(400).json({ error: 'Origin and destination coordinates are required' });
    }
    const result = await routeOptimizationService.getCachedDistance(
      origin.lat,
      origin.lng,
      destination.lat,
      destination.lng
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function findNearbyAppointments(req, res, next) {
  try {
    const { lat, lng, radiusMiles = 10, startDate, endDate, status, workTypeId } = req.body;
    if (!lat || !lng) {
      return res.status(400).json({ error: 'Latitude and longitude are required' });
    }
    const result = await routeOptimizationService.findAppointmentsInRadius(lat, lng, radiusMiles, {
      startDate,
      endDate,
      status,
      workTypeId,
    });
    res.json({ count: result.length, appointments: result });
  } catch (error) {
    next(error);
  }
}

export async function suggestTimeSlots(req, res, next) {
  try {
    const { location, resourceId, date, durationMinutes = 60 } = req.body;
    if (!location?.lat || !location?.lng || !resourceId || !date) {
      return res.status(400).json({ error: 'Location, resourceId, and date are required' });
    }
    const result = await routeOptimizationService.suggestOptimalTimeSlot(
      location,
      resourceId,
      parseISO(date),
      durationMinutes
    );
    res.json({ count: result.length, slots: result });
  } catch (error) {
    next(error);
  }
}

// Scheduling policy endpoints
export async function getSchedulingPolicies(req, res, next) {
  try {
    const policies = await schedulingPolicyService.getAllPolicies();
    res.json(policies);
  } catch (error) {
    next(error);
  }
}

export async function getActivePolicy(req, res, next) {
  try {
    const policy = await schedulingPolicyService.getActivePolicy();
    res.json(policy);
  } catch (error) {
    next(error);
  }
}

export async function upsertPolicy(req, res, next) {
  try {
    const policy = await schedulingPolicyService.upsertPolicy(req.body);
    res.json(policy);
  } catch (error) {
    next(error);
  }
}

// Resource matching endpoints
export async function checkSkillMatch(req, res, next) {
  try {
    const { resourceId, workTypeId } = req.params;
    const { exactMatch = 'false' } = req.query;
    const result = await schedulingPolicyService.checkSkillMatch(resourceId, workTypeId, exactMatch === 'true');
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function checkTerritoryMatch(req, res, next) {
  try {
    const { resourceId, territoryId } = req.params;
    const result = await schedulingPolicyService.checkTerritoryMatch(resourceId, territoryId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function getResourceUtilization(req, res, next) {
  try {
    const { resourceId } = req.params;
    const { date = new Date().toISOString() } = req.query;
    const result = await schedulingPolicyService.calculateResourceUtilization(resourceId, parseISO(date));
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function findBestResources(req, res, next) {
  try {
    const { appointmentId } = req.params;
    const { limit = 5, policyId } = req.query;
    const result = await schedulingPolicyService.findBestResources(appointmentId, {
      limit: parseInt(limit),
      policyId,
    });
    res.json({ appointmentId, count: result.length, resources: result });
  } catch (error) {
    next(error);
  }
}

// Smart auto-scheduling with policy engine
export async function smartAutoSchedule(req, res, next) {
  try {
    const { appointmentId } = req.params;
    const { preferredDate, preferredResourceId } = req.body;
    const result = await schedulingPolicyService.autoScheduleAppointment(appointmentId, {
      preferredDate: preferredDate ? parseISO(preferredDate) : null,
      preferredResourceId,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function batchAutoSchedule(req, res, next) {
  try {
    const { appointmentIds, preferredDate, policyId } = req.body;
    if (!appointmentIds || !Array.isArray(appointmentIds) || appointmentIds.length === 0) {
      return res.status(400).json({ error: 'appointmentIds array is required' });
    }
    const result = await schedulingPolicyService.batchScheduleAppointments(appointmentIds, {
      preferredDate: preferredDate ? parseISO(preferredDate) : null,
      policyId,
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

// Capacity planning endpoints
export async function getResourceCapacity(req, res, next) {
  try {
    const { resourceId } = req.params;
    const { startDate, endDate } = req.query;

    const start = startDate ? parseISO(startDate) : new Date();
    const end = endDate ? parseISO(endDate) : addDays(start, 7);

    const capacityPlans = await prisma.resourceCapacityPlan.findMany({
      where: {
        resourceId,
        date: { gte: start, lte: end },
      },
      orderBy: { date: 'asc' },
    });

    // If no plans exist, generate on the fly
    if (capacityPlans.length === 0) {
      const plans = [];
      let current = new Date(start);
      while (current <= end) {
        const utilization = await schedulingPolicyService.calculateResourceUtilization(resourceId, current);
        plans.push({ date: format(current, 'yyyy-MM-dd'), ...utilization });
        current = addDays(current, 1);
      }
      return res.json({ resourceId, plans });
    }

    res.json({ resourceId, plans: capacityPlans });
  } catch (error) {
    next(error);
  }
}

export async function updateResourceCapacity(req, res, next) {
  try {
    const { resourceId } = req.params;
    const { date = new Date().toISOString() } = req.body;

    await schedulingPolicyService.updateCapacityPlan(resourceId, parseISO(date));
    const utilization = await schedulingPolicyService.calculateResourceUtilization(resourceId, parseISO(date));

    res.json({ resourceId, date, ...utilization });
  } catch (error) {
    next(error);
  }
}

export async function getTeamCapacity(req, res, next) {
  try {
    const { territoryId } = req.params;
    const { date = new Date().toISOString() } = req.query;

    const memberships = await prisma.serviceTerritoryMember.findMany({
      where: { territoryId },
      include: { resource: true },
    });

    const targetDate = parseISO(date);
    const teamCapacity = [];

    for (const membership of memberships) {
      if (!membership.resource.isActive) continue;
      const utilization = await schedulingPolicyService.calculateResourceUtilization(membership.resource.id, targetDate);
      teamCapacity.push({
        resourceId: membership.resource.id,
        resourceName: membership.resource.name,
        isPrimary: membership.isPrimary,
        ...utilization,
      });
    }

    const totals = {
      totalResources: teamCapacity.length,
      totalScheduledMinutes: teamCapacity.reduce((sum, r) => sum + r.scheduledMinutes, 0),
      totalAvailableMinutes: teamCapacity.reduce((sum, r) => sum + r.availableMinutes, 0),
      totalAppointments: teamCapacity.reduce((sum, r) => sum + r.appointmentCount, 0),
      averageUtilization: teamCapacity.length > 0
        ? teamCapacity.reduce((sum, r) => sum + r.utilizationPercent, 0) / teamCapacity.length
        : 0,
    };

    res.json({
      territoryId,
      date: format(targetDate, 'yyyy-MM-dd'),
      totals,
      resources: teamCapacity.sort((a, b) => b.utilizationPercent - a.utilizationPercent),
    });
  } catch (error) {
    next(error);
  }
}
