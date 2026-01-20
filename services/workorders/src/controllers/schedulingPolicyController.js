import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import schedulingService from '../services/schedulingService.js';

const prisma = new PrismaClient();

// Validation schemas
const policySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  weightCustomerPreference: z.number().int().min(0).max(100).optional(),
  weightSkillMatch: z.number().int().min(0).max(100).optional(),
  weightTravelDistance: z.number().int().min(0).max(100).optional(),
  weightResourceUtilization: z.number().int().min(0).max(100).optional(),
  weightSameDayCompletion: z.number().int().min(0).max(100).optional(),
  weightPriority: z.number().int().min(0).max(100).optional(),
  requireExactSkillMatch: z.boolean().optional(),
  requireSameTerritory: z.boolean().optional(),
  allowOvertimeScheduling: z.boolean().optional(),
  maxTravelTimeMinutes: z.number().int().positive().optional(),
  maxAppointmentsPerDay: z.number().int().positive().optional(),
  minBufferMinutes: z.number().int().min(0).optional(),
});

const findSlotsSchema = z.object({
  resourceId: z.string(),
  earliestStart: z.string().datetime(),
  dueDate: z.string().datetime(),
  duration: z.number().int().positive().optional(),
  includeWeekends: z.boolean().optional(),
  maxSlots: z.number().int().positive().optional(),
});

const autoScheduleSchema = z.object({
  appointmentId: z.string(),
  resourceId: z.string().optional(),
  policyId: z.string().optional(),
});

const checkAvailabilitySchema = z.object({
  resourceId: z.string(),
  start: z.string().datetime(),
  end: z.string().datetime(),
});

/**
 * List all scheduling policies
 */
export async function listPolicies(req, res, next) {
  try {
    const policies = await schedulingService.getSchedulingPolicies();
    res.json({ data: policies });
  } catch (error) {
    next(error);
  }
}

/**
 * Get the default scheduling policy
 */
export async function getDefaultPolicy(req, res, next) {
  try {
    const policy = await schedulingService.getDefaultPolicy();
    res.json(policy);
  } catch (error) {
    next(error);
  }
}

/**
 * Get a single scheduling policy
 */
export async function getPolicy(req, res, next) {
  try {
    const { id } = req.params;

    const policy = await prisma.schedulingPolicy.findUnique({
      where: { id },
    });

    if (!policy) {
      return res.status(404).json({ error: 'Scheduling policy not found' });
    }

    res.json(policy);
  } catch (error) {
    next(error);
  }
}

/**
 * Create a new scheduling policy
 */
export async function createPolicy(req, res, next) {
  try {
    const data = policySchema.parse(req.body);

    // If setting as default, clear other defaults first
    if (data.isDefault) {
      await prisma.schedulingPolicy.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    const policy = await prisma.schedulingPolicy.create({
      data,
    });

    res.status(201).json(policy);
  } catch (error) {
    next(error);
  }
}

/**
 * Update a scheduling policy
 */
export async function updatePolicy(req, res, next) {
  try {
    const { id } = req.params;
    const data = policySchema.partial().parse(req.body);

    const existing = await prisma.schedulingPolicy.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: 'Scheduling policy not found' });
    }

    // If setting as default, clear other defaults first
    if (data.isDefault) {
      await prisma.schedulingPolicy.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      });
    }

    const policy = await prisma.schedulingPolicy.update({
      where: { id },
      data,
    });

    res.json(policy);
  } catch (error) {
    next(error);
  }
}

/**
 * Delete a scheduling policy
 */
export async function deletePolicy(req, res, next) {
  try {
    const { id } = req.params;

    const policy = await prisma.schedulingPolicy.findUnique({
      where: { id },
    });

    if (!policy) {
      return res.status(404).json({ error: 'Scheduling policy not found' });
    }

    if (policy.isDefault) {
      return res.status(400).json({
        error: 'Cannot delete the default scheduling policy. Set another policy as default first.',
      });
    }

    await prisma.schedulingPolicy.delete({
      where: { id },
    });

    res.json({ message: 'Scheduling policy deleted successfully' });
  } catch (error) {
    next(error);
  }
}

/**
 * Find available time slots for a resource
 */
export async function findAvailableSlots(req, res, next) {
  try {
    const params = findSlotsSchema.parse(req.body);

    // Get the default policy if none specified
    const policy = await schedulingService.getDefaultPolicy();

    const slots = await schedulingService.findAvailableSlots({
      ...params,
      earliestStart: new Date(params.earliestStart),
      dueDate: new Date(params.dueDate),
      policy,
    });

    res.json({
      policy: {
        id: policy.id,
        name: policy.name,
      },
      slots,
      totalSlots: slots.length,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Auto-schedule an appointment
 */
export async function autoSchedule(req, res, next) {
  try {
    const params = autoScheduleSchema.parse(req.body);

    const result = await schedulingService.autoScheduleAppointment(params);

    res.json({
      success: true,
      message: 'Appointment scheduled successfully',
      ...result,
    });
  } catch (error) {
    if (error.message.includes('not found') || error.message.includes('No available')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
}

/**
 * Check resource availability for a time range
 */
export async function checkAvailability(req, res, next) {
  try {
    const params = checkAvailabilitySchema.parse(req.body);

    const result = await schedulingService.checkResourceAvailability(
      params.resourceId,
      params.start,
      params.end
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
}

/**
 * Calculate due date from earliest start
 */
export async function calculateDueDate(req, res, next) {
  try {
    const { earliestStart, mode = 'default' } = req.body;

    if (!earliestStart) {
      return res.status(400).json({ error: 'earliestStart is required' });
    }

    const dueDate = schedulingService.calculateDueDateFromEarliestStart(
      new Date(earliestStart),
      mode
    );

    res.json({
      earliestStart,
      dueDate: dueDate.toISOString(),
      mode,
      dueDays: mode === 'same_day' ? 0 : 30,
    });
  } catch (error) {
    next(error);
  }
}
