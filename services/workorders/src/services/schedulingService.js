import { PrismaClient } from '@prisma/client';
import { addDays, addHours, addMinutes, startOfDay, endOfDay, setHours, setMinutes, isWeekend, isBefore, isAfter, format } from 'date-fns';

const prisma = new PrismaClient();

/**
 * Scheduling Service - Implements FSL-like scheduling logic
 *
 * This service handles:
 * 1. Scheduling policy management
 * 2. Auto-calculation of due dates based on earliest start
 * 3. Finding available time slots for appointments
 * 4. Resource availability checking
 */

// Default scheduling configuration
const DEFAULT_CONFIG = {
  businessHoursStart: 8, // 8 AM
  businessHoursEnd: 18, // 6 PM
  searchWindowDays: 14, // Look forward 14 days for available slots
  defaultDueDateDays: 30, // Due date is earliest start + 30 days by default
  defaultDuration: 120, // 2 hours default appointment duration
  bufferMinutes: 15, // Buffer between appointments
};

/**
 * Get all scheduling policies
 */
export async function getSchedulingPolicies() {
  return prisma.schedulingPolicy.findMany({
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
}

/**
 * Get the default scheduling policy
 */
export async function getDefaultPolicy() {
  let policy = await prisma.schedulingPolicy.findFirst({
    where: { isDefault: true, isActive: true },
  });

  // If no default, get any active policy
  if (!policy) {
    policy = await prisma.schedulingPolicy.findFirst({
      where: { isActive: true },
    });
  }

  // If still no policy, create the Panda default
  if (!policy) {
    policy = await createDefaultPolicy();
  }

  return policy;
}

/**
 * Create the default "Panda" scheduling policy
 */
export async function createDefaultPolicy() {
  return prisma.schedulingPolicy.create({
    data: {
      name: 'Panda',
      description: 'Default scheduling policy for Panda Exteriors. Prioritizes customer preference and skill matching.',
      isDefault: true,
      isActive: true,
      weightCustomerPreference: 80,
      weightSkillMatch: 90,
      weightTravelDistance: 70,
      weightResourceUtilization: 60,
      weightSameDayCompletion: 50,
      weightPriority: 85,
      requireExactSkillMatch: false,
      requireSameTerritory: true,
      allowOvertimeScheduling: false,
      maxTravelTimeMinutes: 60,
      maxAppointmentsPerDay: 8,
      minBufferMinutes: 15,
    },
  });
}

/**
 * Create or update a scheduling policy
 */
export async function upsertSchedulingPolicy(data) {
  const { id, ...policyData } = data;

  // If setting as default, clear other defaults first
  if (policyData.isDefault) {
    await prisma.schedulingPolicy.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  if (id) {
    return prisma.schedulingPolicy.update({
      where: { id },
      data: policyData,
    });
  }

  return prisma.schedulingPolicy.create({
    data: policyData,
  });
}

/**
 * Calculate due date based on earliest start and policy
 *
 * FSL Logic: Due date is typically EarliestStart + X days
 * The default is 30 days, but can be configured per work type
 */
export function calculateDueDate(earliestStart, workType = null, policy = null) {
  const startDate = new Date(earliestStart);

  // Work type may override default days
  let dueDays = DEFAULT_CONFIG.defaultDueDateDays;

  if (workType?.dueDays) {
    dueDays = workType.dueDays;
  }

  // Add days to earliest start
  return addDays(startDate, dueDays);
}

/**
 * Calculate due date using the formula from Salesforce:
 * DueDate = EarliestStartTime + 22 hours (same-day logic)
 * OR
 * DueDate = EarliestStartTime + 30 days (default window)
 *
 * @param {Date} earliestStart
 * @param {string} mode - 'same_day' or 'default'
 */
export function calculateDueDateFromEarliestStart(earliestStart, mode = 'default') {
  const startDate = new Date(earliestStart);

  if (mode === 'same_day') {
    // Add 22 hours (same day completion requirement)
    return addHours(startDate, 22);
  }

  // Default: Add 30 days
  return addDays(startDate, 30);
}

/**
 * Find available time slots for an appointment
 *
 * This implements the core FSL slot-finding logic:
 * 1. Search from earliest start to due date
 * 2. Only during business hours
 * 3. Skip weekends (configurable)
 * 4. Avoid conflicts with existing appointments
 * 5. Respect resource absences
 *
 * @param {Object} params
 * @param {string} params.resourceId - Service resource to check
 * @param {Date} params.earliestStart - Earliest permitted start
 * @param {Date} params.dueDate - Must be scheduled by this date
 * @param {number} params.duration - Required duration in minutes
 * @param {Object} params.policy - Scheduling policy to use
 * @returns {Array} Available time slots with grades
 */
export async function findAvailableSlots({
  resourceId,
  earliestStart,
  dueDate,
  duration = DEFAULT_CONFIG.defaultDuration,
  policy = null,
  includeWeekends = false,
  maxSlots = 20,
}) {
  const slots = [];
  const startDate = new Date(earliestStart);
  const endDate = new Date(dueDate);
  const bufferMinutes = policy?.minBufferMinutes || DEFAULT_CONFIG.bufferMinutes;

  // Get existing appointments for this resource in the window
  const existingAppointments = await prisma.serviceAppointment.findMany({
    where: {
      assignedResources: {
        some: { serviceResourceId: resourceId },
      },
      status: { notIn: ['CANCELED', 'CANNOT_COMPLETE'] },
      scheduledStart: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      scheduledStart: true,
      scheduledEnd: true,
    },
    orderBy: { scheduledStart: 'asc' },
  });

  // Get resource absences (PTO, etc.)
  const absences = await prisma.resourceAbsence.findMany({
    where: {
      serviceResourceId: resourceId,
      startTime: { lte: endDate },
      endTime: { gte: startDate },
    },
  });

  // Iterate through each day in the search window
  let currentDate = startOfDay(startDate);

  while (isBefore(currentDate, endDate) && slots.length < maxSlots) {
    // Skip weekends unless explicitly included
    if (!includeWeekends && isWeekend(currentDate)) {
      currentDate = addDays(currentDate, 1);
      continue;
    }

    // Business hours for this day
    const dayStart = setMinutes(setHours(currentDate, DEFAULT_CONFIG.businessHoursStart), 0);
    const dayEnd = setMinutes(setHours(currentDate, DEFAULT_CONFIG.businessHoursEnd), 0);

    // Start from the later of dayStart or earliestStart
    let slotStart = isBefore(dayStart, startDate) ? startDate : dayStart;

    // If slotStart is before business hours, move to business hours
    if (slotStart.getHours() < DEFAULT_CONFIG.businessHoursStart) {
      slotStart = setMinutes(setHours(slotStart, DEFAULT_CONFIG.businessHoursStart), 0);
    }

    // Find available slots during business hours
    while (isBefore(slotStart, dayEnd)) {
      const slotEnd = addMinutes(slotStart, duration);

      // Check if slot fits within business hours
      if (isAfter(slotEnd, dayEnd)) {
        break;
      }

      // Check for conflicts with existing appointments
      const hasConflict = existingAppointments.some(apt => {
        const aptStart = new Date(apt.scheduledStart);
        const aptEnd = addMinutes(new Date(apt.scheduledEnd), bufferMinutes);

        return (
          (slotStart >= aptStart && slotStart < aptEnd) ||
          (slotEnd > aptStart && slotEnd <= aptEnd) ||
          (slotStart <= aptStart && slotEnd >= aptEnd)
        );
      });

      // Check for conflicts with absences
      const hasAbsence = absences.some(absence => {
        const absStart = new Date(absence.startTime);
        const absEnd = new Date(absence.endTime);

        return (
          (slotStart >= absStart && slotStart < absEnd) ||
          (slotEnd > absStart && slotEnd <= absEnd)
        );
      });

      if (!hasConflict && !hasAbsence) {
        // Calculate slot grade (higher = better)
        const grade = calculateSlotGrade(slotStart, startDate, policy);

        slots.push({
          start: slotStart,
          end: slotEnd,
          duration,
          grade,
          formattedStart: format(slotStart, "EEE, MMM d 'at' h:mm a"),
          formattedEnd: format(slotEnd, "h:mm a"),
        });

        if (slots.length >= maxSlots) break;
      }

      // Move to next potential slot (current end + buffer)
      slotStart = addMinutes(slotEnd, bufferMinutes);
    }

    currentDate = addDays(currentDate, 1);
  }

  // Sort by grade (highest first) then by date (earliest first)
  return slots.sort((a, b) => {
    if (b.grade !== a.grade) return b.grade - a.grade;
    return a.start - b.start;
  });
}

/**
 * Calculate a grade/score for a time slot
 * Higher grades are better. Factors in:
 * - How soon the slot is (earlier = better for urgent jobs)
 * - Time of day preference (mid-morning often preferred)
 */
function calculateSlotGrade(slotStart, earliestStart, policy) {
  let grade = 100;

  // Deduct points for how far in the future (max 20 points)
  const daysOut = Math.floor((slotStart - earliestStart) / (1000 * 60 * 60 * 24));
  grade -= Math.min(daysOut * 2, 20);

  // Prefer mid-morning (10 AM - 12 PM gets bonus)
  const hour = slotStart.getHours();
  if (hour >= 10 && hour < 12) {
    grade += 5;
  } else if (hour >= 8 && hour < 10) {
    grade += 3;
  } else if (hour >= 14 && hour < 16) {
    grade += 2;
  }

  // Monday-Thursday preferred over Friday
  const dayOfWeek = slotStart.getDay();
  if (dayOfWeek === 5) { // Friday
    grade -= 3;
  }

  return Math.max(grade, 0);
}

/**
 * Auto-schedule an appointment
 *
 * Finds the best available slot and assigns the resource
 *
 * @param {Object} params
 * @param {string} params.appointmentId - Service appointment to schedule
 * @param {string} params.resourceId - Preferred resource (optional)
 * @param {Object} params.policy - Scheduling policy to use
 */
export async function autoScheduleAppointment({
  appointmentId,
  resourceId = null,
  policyId = null,
}) {
  // Get the appointment
  const appointment = await prisma.serviceAppointment.findUnique({
    where: { id: appointmentId },
    include: {
      workOrder: {
        include: {
          territory: {
            include: {
              members: {
                include: {
                  serviceResource: true,
                },
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
    throw new Error('Appointment not found');
  }

  // Get scheduling policy
  const policy = policyId
    ? await prisma.schedulingPolicy.findUnique({ where: { id: policyId } })
    : await getDefaultPolicy();

  // Determine resource(s) to check
  let resourcesToCheck = [];

  if (resourceId) {
    resourcesToCheck = [resourceId];
  } else if (appointment.workOrder?.territory?.members) {
    // Get all resources in the territory
    resourcesToCheck = appointment.workOrder.territory.members
      .filter(m => m.serviceResource.isActive)
      .map(m => m.serviceResource.id);
  }

  if (resourcesToCheck.length === 0) {
    throw new Error('No available resources found');
  }

  // Get duration from work type or default
  const duration = appointment.workOrder?.workType?.estimatedDuration || DEFAULT_CONFIG.defaultDuration;

  // Find slots for each resource and pick the best
  let bestSlot = null;
  let bestResource = null;

  for (const resId of resourcesToCheck) {
    const slots = await findAvailableSlots({
      resourceId: resId,
      earliestStart: appointment.earliestStart,
      dueDate: appointment.dueDate,
      duration,
      policy,
      maxSlots: 5,
    });

    if (slots.length > 0 && (!bestSlot || slots[0].grade > bestSlot.grade)) {
      bestSlot = slots[0];
      bestResource = resId;
    }
  }

  if (!bestSlot) {
    throw new Error('No available slots found within the scheduling window');
  }

  // Update the appointment with the scheduled times
  const updatedAppointment = await prisma.serviceAppointment.update({
    where: { id: appointmentId },
    data: {
      scheduledStart: bestSlot.start,
      scheduledEnd: bestSlot.end,
      status: 'SCHEDULED',
      duration,
    },
  });

  // Assign the resource if not already assigned
  const existingAssignment = await prisma.assignedResource.findFirst({
    where: {
      serviceAppointmentId: appointmentId,
      serviceResourceId: bestResource,
    },
  });

  if (!existingAssignment) {
    await prisma.assignedResource.create({
      data: {
        serviceAppointmentId: appointmentId,
        serviceResourceId: bestResource,
        isPrimaryResource: true,
      },
    });
  }

  return {
    appointment: updatedAppointment,
    slot: bestSlot,
    resourceId: bestResource,
  };
}

/**
 * Check resource availability for a specific time slot
 */
export async function checkResourceAvailability(resourceId, start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  // Check for conflicting appointments
  const conflicts = await prisma.serviceAppointment.findMany({
    where: {
      assignedResources: {
        some: { serviceResourceId: resourceId },
      },
      status: { notIn: ['CANCELED', 'CANNOT_COMPLETE'] },
      OR: [
        {
          scheduledStart: { gte: startDate, lt: endDate },
        },
        {
          scheduledEnd: { gt: startDate, lte: endDate },
        },
        {
          AND: [
            { scheduledStart: { lte: startDate } },
            { scheduledEnd: { gte: endDate } },
          ],
        },
      ],
    },
    select: {
      id: true,
      appointmentNumber: true,
      scheduledStart: true,
      scheduledEnd: true,
    },
  });

  // Check for absences
  const absences = await prisma.resourceAbsence.findMany({
    where: {
      serviceResourceId: resourceId,
      startTime: { lte: endDate },
      endTime: { gte: startDate },
    },
  });

  return {
    isAvailable: conflicts.length === 0 && absences.length === 0,
    conflicts,
    absences,
  };
}

export default {
  getSchedulingPolicies,
  getDefaultPolicy,
  createDefaultPolicy,
  upsertSchedulingPolicy,
  calculateDueDate,
  calculateDueDateFromEarliestStart,
  findAvailableSlots,
  autoScheduleAppointment,
  checkResourceAvailability,
};
