/**
 * Scheduling Policy Engine - FSL-equivalent scheduling logic
 * Implements weighted scoring for appointment scheduling decisions
 */

import { PrismaClient } from '@prisma/client';
import { haversineDistance, getCachedDistance, optimizeResourceRoute } from './routeOptimizationService.js';

const prisma = new PrismaClient();

/**
 * Default scheduling policy weights
 */
const DEFAULT_POLICY = {
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
};

/**
 * Get the active scheduling policy
 * @returns {Promise<Object>} The active policy or default
 */
export async function getActivePolicy() {
  const policy = await prisma.schedulingPolicy.findFirst({
    where: { isActive: true, isDefault: true },
  });

  return policy || DEFAULT_POLICY;
}

/**
 * Get all scheduling policies
 */
export async function getAllPolicies() {
  return prisma.schedulingPolicy.findMany({
    orderBy: { name: 'asc' },
  });
}

/**
 * Create or update a scheduling policy
 */
export async function upsertPolicy(policyData) {
  const { id, ...data } = policyData;

  if (data.isDefault) {
    // Clear default from other policies
    await prisma.schedulingPolicy.updateMany({
      where: { isDefault: true },
      data: { isDefault: false },
    });
  }

  if (id) {
    return prisma.schedulingPolicy.update({
      where: { id },
      data,
    });
  }

  return prisma.schedulingPolicy.create({ data });
}

/**
 * Check if a resource has required skills for a work type
 * @param {string} resourceId - ServiceResource ID
 * @param {string} workTypeId - WorkType ID
 * @param {boolean} exactMatch - Require exact skill match
 * @returns {Promise<{matches: boolean, score: number, skills: Array}>}
 */
export async function checkSkillMatch(resourceId, workTypeId, exactMatch = false) {
  // Get work type's required skills (if work type has skill requirements)
  const workType = await prisma.workType.findUnique({
    where: { id: workTypeId },
    include: {
      skillRequirements: {
        include: { skill: true },
      },
    },
  });

  if (!workType || !workType.skillRequirements || workType.skillRequirements.length === 0) {
    // No skill requirements, perfect match
    return { matches: true, score: 100, skills: [], reason: 'No skills required' };
  }

  // Get resource's skills
  const resourceSkills = await prisma.resourceSkill.findMany({
    where: { resourceId },
    include: { skill: true },
  });

  const resourceSkillMap = new Map(resourceSkills.map((rs) => [rs.skill.name, rs]));

  const results = [];
  let matchedCount = 0;

  for (const requirement of workType.skillRequirements) {
    const hasSkill = resourceSkillMap.has(requirement.skill.name);
    results.push({
      skill: requirement.skill.name,
      required: true,
      hasSkill,
      level: hasSkill ? resourceSkillMap.get(requirement.skill.name).level : null,
    });

    if (hasSkill) matchedCount++;
  }

  const requiredCount = workType.skillRequirements.length;
  const score = requiredCount > 0 ? (matchedCount / requiredCount) * 100 : 100;

  const matches = exactMatch ? matchedCount === requiredCount : matchedCount > 0 || requiredCount === 0;

  return {
    matches,
    score,
    skills: results,
    reason: matches ? 'Skills match' : 'Missing required skills',
  };
}

/**
 * Check if a resource serves a territory
 * @param {string} resourceId - ServiceResource ID
 * @param {string} territoryId - ServiceTerritory ID
 * @returns {Promise<{inTerritory: boolean, isPrimary: boolean}>}
 */
export async function checkTerritoryMatch(resourceId, territoryId) {
  if (!territoryId) {
    return { inTerritory: true, isPrimary: false, reason: 'No territory requirement' };
  }

  const membership = await prisma.serviceTerritoryMember.findUnique({
    where: {
      territoryId_resourceId: {
        territoryId,
        resourceId,
      },
    },
  });

  if (!membership) {
    return { inTerritory: false, isPrimary: false, reason: 'Resource not in territory' };
  }

  // Check if membership is currently effective
  const now = new Date();
  if (membership.effectiveStartDate && membership.effectiveStartDate > now) {
    return { inTerritory: false, isPrimary: false, reason: 'Membership not yet effective' };
  }
  if (membership.effectiveEndDate && membership.effectiveEndDate < now) {
    return { inTerritory: false, isPrimary: false, reason: 'Membership expired' };
  }

  return {
    inTerritory: true,
    isPrimary: membership.isPrimary,
    reason: membership.isPrimary ? 'Primary territory' : 'Secondary territory',
  };
}

/**
 * Calculate resource utilization for a date
 * @param {string} resourceId - ServiceResource ID
 * @param {Date} date - The date to check
 * @returns {Promise<{utilizationPercent: number, scheduledMinutes: number, availableMinutes: number}>}
 */
export async function calculateResourceUtilization(resourceId, date) {
  // Check for existing capacity plan
  let capacityPlan = await prisma.resourceCapacityPlan.findUnique({
    where: {
      resourceId_date: {
        resourceId,
        date: new Date(date.toISOString().split('T')[0]),
      },
    },
  });

  const workdayMinutes = 480; // 8 hours

  if (!capacityPlan) {
    // Calculate from appointments
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const appointments = await prisma.serviceAppointment.findMany({
      where: {
        assignedResources: {
          some: { serviceResourceId: resourceId },
        },
        scheduledStart: {
          gte: startOfDay,
          lte: endOfDay,
        },
        status: {
          notIn: ['CANCELED', 'CANNOT_COMPLETE'],
        },
      },
    });

    const scheduledMinutes = appointments.reduce((sum, apt) => sum + (apt.duration || 60), 0);
    const travelMinutes = appointments.reduce((sum, apt) => sum + (apt.travelTimeMinutes || 0), 0);

    capacityPlan = {
      scheduledMinutes,
      travelMinutes,
      plannedCapacity: workdayMinutes,
      appointmentCount: appointments.length,
    };
  }

  const totalOccupied = capacityPlan.scheduledMinutes + (capacityPlan.travelMinutes || 0);
  const utilizationPercent = (totalOccupied / capacityPlan.plannedCapacity) * 100;

  return {
    utilizationPercent: Math.min(utilizationPercent, 100),
    scheduledMinutes: capacityPlan.scheduledMinutes,
    travelMinutes: capacityPlan.travelMinutes || 0,
    availableMinutes: Math.max(0, capacityPlan.plannedCapacity - totalOccupied),
    appointmentCount: capacityPlan.appointmentCount || 0,
  };
}

/**
 * Score a candidate resource for an appointment
 * @param {Object} resource - The ServiceResource
 * @param {Object} appointment - The appointment to schedule
 * @param {Object} policy - The scheduling policy
 * @param {Date} targetDate - The target date
 * @returns {Promise<{score: number, breakdown: Object, eligible: boolean, reason: string}>}
 */
export async function scoreResourceCandidate(resource, appointment, policy, targetDate) {
  const breakdown = {
    skillMatch: 0,
    territory: 0,
    travelDistance: 0,
    utilization: 0,
    priority: 0,
    customerPreference: 0,
  };

  // 1. Check skills
  const skillResult = await checkSkillMatch(resource.id, appointment.work_type_id, policy.requireExactSkillMatch);
  if (!skillResult.matches && policy.requireExactSkillMatch) {
    return {
      score: 0,
      breakdown,
      eligible: false,
      reason: 'Missing required skills',
      details: { skills: skillResult },
    };
  }
  breakdown.skillMatch = skillResult.score;

  // 2. Check territory
  const territoryResult = await checkTerritoryMatch(resource.id, appointment.workOrder?.account?.territoryId);
  if (!territoryResult.inTerritory && policy.requireSameTerritory) {
    return {
      score: 0,
      breakdown,
      eligible: false,
      reason: 'Not in required territory',
      details: { territory: territoryResult },
    };
  }
  breakdown.territory = territoryResult.inTerritory ? (territoryResult.isPrimary ? 100 : 75) : 50;

  // 3. Calculate travel distance/time
  if (appointment.latitude && appointment.longitude) {
    // Get resource's last appointment location or base
    const lastApt = await prisma.serviceAppointment.findFirst({
      where: {
        assignedResources: {
          some: { serviceResourceId: resource.id },
        },
        scheduledStart: {
          lt: appointment.scheduledStart || new Date(),
        },
        latitude: { not: null },
      },
      orderBy: { scheduledStart: 'desc' },
    });

    if (lastApt) {
      const distance = await getCachedDistance(
        lastApt.latitude,
        lastApt.longitude,
        appointment.latitude,
        appointment.longitude
      );

      // Reject if over max travel time
      if (distance.durationMinutes > policy.maxTravelTimeMinutes) {
        return {
          score: 0,
          breakdown,
          eligible: false,
          reason: `Travel time ${distance.durationMinutes}min exceeds max ${policy.maxTravelTimeMinutes}min`,
          details: { travel: distance },
        };
      }

      // Score: 100 for 0 travel, 0 for max travel
      breakdown.travelDistance = Math.max(0, 100 - (distance.durationMinutes / policy.maxTravelTimeMinutes) * 100);
    } else {
      breakdown.travelDistance = 75; // No previous appointment, neutral score
    }
  } else {
    breakdown.travelDistance = 50; // No coordinates, neutral score
  }

  // 4. Check utilization
  const utilization = await calculateResourceUtilization(resource.id, targetDate);

  // Reject if at max appointments
  if (utilization.appointmentCount >= policy.maxAppointmentsPerDay) {
    return {
      score: 0,
      breakdown,
      eligible: false,
      reason: `Already at max ${policy.maxAppointmentsPerDay} appointments for day`,
      details: { utilization },
    };
  }

  // Reject if in overtime and not allowed
  if (utilization.utilizationPercent >= 100 && !policy.allowOvertimeScheduling) {
    return {
      score: 0,
      breakdown,
      eligible: false,
      reason: 'Resource fully utilized, overtime not allowed',
      details: { utilization },
    };
  }

  // Score: prefer 75% utilization (optimal efficiency)
  const utilizationTarget = 75;
  const utilizationDiff = Math.abs(utilization.utilizationPercent - utilizationTarget);
  breakdown.utilization = Math.max(0, 100 - utilizationDiff);

  // 5. Priority score (based on resource priority if defined)
  breakdown.priority = resource.priority ? (resource.priority / 10) * 100 : 50;

  // 6. Customer preference (check if customer preferred this resource before)
  // This would check historical data - for now, neutral score
  breakdown.customerPreference = 50;

  // Calculate weighted total score
  const weights = {
    skillMatch: policy.weightSkillMatch,
    territory: 50, // Territory is pass/fail primarily
    travelDistance: policy.weightTravelDistance,
    utilization: policy.weightResourceUtilization,
    priority: policy.weightPriority,
    customerPreference: policy.weightCustomerPreference,
  };

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const weightedScore = Object.entries(breakdown).reduce((sum, [key, score]) => {
    return sum + (score * weights[key]) / totalWeight;
  }, 0);

  return {
    score: Math.round(weightedScore * 100) / 100,
    breakdown,
    eligible: true,
    reason: 'Eligible',
    details: {
      skills: skillResult,
      territory: territoryResult,
      utilization,
    },
  };
}

/**
 * Find the best resources for an appointment
 * @param {string} appointmentId - ServiceAppointment ID
 * @param {Object} options - Scheduling options
 * @returns {Promise<Array<{resource: Object, score: number, breakdown: Object}>>}
 */
export async function findBestResources(appointmentId, options = {}) {
  const { limit = 5, policyId = null } = options;

  // Get the appointment
  const appointment = await prisma.serviceAppointment.findUnique({
    where: { id: appointmentId },
    include: {
      workOrder: {
        include: {
          account: true,
        },
      },
      work_types: true,
    },
  });

  if (!appointment) {
    throw new Error(`Appointment not found: ${appointmentId}`);
  }

  // Get the policy
  let policy;
  if (policyId) {
    policy = await prisma.schedulingPolicy.findUnique({ where: { id: policyId } });
  }
  if (!policy) {
    policy = await getActivePolicy();
  }

  const targetDate = appointment.scheduledStart || new Date();

  // Get candidate resources from the account's territory or all active
  const territoryId = appointment.workOrder?.account?.territoryId;

  let candidateResources;
  if (territoryId && policy.requireSameTerritory) {
    const memberships = await prisma.serviceTerritoryMember.findMany({
      where: { territoryId },
      include: { resource: true },
    });
    candidateResources = memberships.map((m) => m.resource).filter((r) => r.isActive);
  } else {
    candidateResources = await prisma.serviceResource.findMany({
      where: { isActive: true },
    });
  }

  // Score each resource
  const scoredResources = [];

  for (const resource of candidateResources) {
    const result = await scoreResourceCandidate(resource, appointment, policy, targetDate);

    scoredResources.push({
      resource: {
        id: resource.id,
        name: resource.name,
        resourceType: resource.resourceType,
      },
      ...result,
    });
  }

  // Sort by score (eligible first, then by score)
  scoredResources.sort((a, b) => {
    if (a.eligible && !b.eligible) return -1;
    if (!a.eligible && b.eligible) return 1;
    return b.score - a.score;
  });

  return scoredResources.slice(0, limit);
}

/**
 * Auto-schedule an appointment to the best available resource and time
 * @param {string} appointmentId - ServiceAppointment ID
 * @param {Object} options - Scheduling options
 * @returns {Promise<{success: boolean, resource: Object, scheduledStart: Date, scheduledEnd: Date}>}
 */
export async function autoScheduleAppointment(appointmentId, options = {}) {
  const { preferredDate = null, preferredResourceId = null } = options;

  const appointment = await prisma.serviceAppointment.findUnique({
    where: { id: appointmentId },
    include: {
      workOrder: { include: { account: true } },
      work_types: true,
    },
  });

  if (!appointment) {
    throw new Error(`Appointment not found: ${appointmentId}`);
  }

  // Find best resources
  const bestResources = await findBestResources(appointmentId, { limit: 3 });

  // Filter to eligible only
  const eligibleResources = bestResources.filter((r) => r.eligible);

  if (eligibleResources.length === 0) {
    return {
      success: false,
      reason: 'No eligible resources found',
      candidates: bestResources,
    };
  }

  // Use preferred resource if provided and eligible
  let selectedResource = eligibleResources[0];
  if (preferredResourceId) {
    const preferred = eligibleResources.find((r) => r.resource.id === preferredResourceId);
    if (preferred) {
      selectedResource = preferred;
    }
  }

  const duration = appointment.duration || 60;
  const targetDate = preferredDate || appointment.earliestStart || new Date();

  // Find available time slot
  // Import the function from route optimization
  const { suggestOptimalTimeSlot } = await import('./routeOptimizationService.js');

  const slots = await suggestOptimalTimeSlot(
    { lat: appointment.latitude, lng: appointment.longitude },
    selectedResource.resource.id,
    targetDate,
    duration
  );

  if (!slots || slots.length === 0) {
    return {
      success: false,
      reason: 'No available time slots found',
      resource: selectedResource.resource,
    };
  }

  const bestSlot = slots[0];

  // Update the appointment
  await prisma.serviceAppointment.update({
    where: { id: appointmentId },
    data: {
      scheduledStart: bestSlot.startTime,
      scheduledEnd: bestSlot.endTime,
      travelTimeMinutes: bestSlot.additionalTravelMinutes,
      travelDistanceMiles: bestSlot.additionalTravelMiles,
      status: 'SCHEDULED',
    },
  });

  // Create the resource assignment
  await prisma.assignedResource.upsert({
    where: {
      serviceAppointmentId_serviceResourceId: {
        serviceAppointmentId: appointmentId,
        serviceResourceId: selectedResource.resource.id,
      },
    },
    update: { isPrimaryResource: true },
    create: {
      serviceAppointmentId: appointmentId,
      serviceResourceId: selectedResource.resource.id,
      isPrimaryResource: true,
    },
  });

  // Update capacity plan
  await updateCapacityPlan(selectedResource.resource.id, targetDate);

  return {
    success: true,
    resource: selectedResource.resource,
    scheduledStart: bestSlot.startTime,
    scheduledEnd: bestSlot.endTime,
    travelTime: bestSlot.additionalTravelMinutes,
    score: selectedResource.score,
  };
}

/**
 * Update or create capacity plan for a resource on a date
 */
export async function updateCapacityPlan(resourceId, date) {
  const dateOnly = new Date(date.toISOString().split('T')[0]);
  const utilization = await calculateResourceUtilization(resourceId, date);

  await prisma.resourceCapacityPlan.upsert({
    where: {
      resourceId_date: {
        resourceId,
        date: dateOnly,
      },
    },
    update: {
      scheduledMinutes: utilization.scheduledMinutes,
      travelMinutes: utilization.travelMinutes,
      availableMinutes: utilization.availableMinutes,
      appointmentCount: utilization.appointmentCount,
      actualUtilization: utilization.utilizationPercent / 100,
    },
    create: {
      resourceId,
      date: dateOnly,
      plannedCapacity: 480,
      scheduledMinutes: utilization.scheduledMinutes,
      travelMinutes: utilization.travelMinutes,
      availableMinutes: utilization.availableMinutes,
      targetUtilization: 0.75,
      actualUtilization: utilization.utilizationPercent / 100,
      appointmentCount: utilization.appointmentCount,
      completedCount: 0,
    },
  });
}

/**
 * Batch schedule multiple appointments
 * @param {Array<string>} appointmentIds - Array of appointment IDs
 * @param {Object} options - Scheduling options
 */
export async function batchScheduleAppointments(appointmentIds, options = {}) {
  const results = {
    scheduled: [],
    failed: [],
    total: appointmentIds.length,
  };

  for (const appointmentId of appointmentIds) {
    try {
      const result = await autoScheduleAppointment(appointmentId, options);

      if (result.success) {
        results.scheduled.push({
          appointmentId,
          ...result,
        });
      } else {
        results.failed.push({
          appointmentId,
          reason: result.reason,
        });
      }
    } catch (error) {
      results.failed.push({
        appointmentId,
        reason: error.message,
      });
    }
  }

  return results;
}

export default {
  getActivePolicy,
  getAllPolicies,
  upsertPolicy,
  checkSkillMatch,
  checkTerritoryMatch,
  calculateResourceUtilization,
  scoreResourceCandidate,
  findBestResources,
  autoScheduleAppointment,
  updateCapacityPlan,
  batchScheduleAppointments,
};
