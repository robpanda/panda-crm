import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { startOfDay, endOfDay, addDays, format, isWithinInterval, parseISO } from 'date-fns';

const prisma = new PrismaClient();

// Validation schemas
const createResourceSchema = z.object({
  name: z.string().min(1),
  resourceType: z.enum(['TECHNICIAN', 'CREW', 'DISPATCHER', 'AGENT']).default('TECHNICIAN'),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  userId: z.string().optional(),
  googleCalendarId: z.string().optional(),
  googleCalendarSyncEnabled: z.boolean().default(false),
  skillIds: z.array(z.string()).optional(),
  territoryIds: z.array(z.string()).optional(),
});

const updateResourceSchema = createResourceSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const createAbsenceSchema = z.object({
  resourceId: z.string(),
  type: z.enum(['VACATION', 'SICK', 'TRAINING', 'UNAVAILABLE']).default('UNAVAILABLE'),
  start: z.string().datetime(),
  end: z.string().datetime(),
  description: z.string().optional(),
});

// List resources
export async function listResources(req, res, next) {
  try {
    const {
      type,
      isActive,
      territoryId,
      skillId,
      page = 1,
      limit = 50,
    } = req.query;

    const where = {};

    if (type) where.resourceType = type;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    if (territoryId) {
      where.territoryMembers = {
        some: { territoryId },
      };
    }

    if (skillId) {
      where.skills = {
        some: { skillId },
      };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [resources, total] = await Promise.all([
      prisma.serviceResource.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          skills: { include: { skill: true } },
          territoryMembers: {
            include: { territory: { select: { id: true, name: true } } },
          },
        },
        skip,
        take,
        orderBy: { name: 'asc' },
      }),
      prisma.serviceResource.count({ where }),
    ]);

    res.json({
      data: resources,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / take),
      },
    });
  } catch (error) {
    next(error);
  }
}

// Get single resource with availability
export async function getResource(req, res, next) {
  try {
    const { id } = req.params;

    const resource = await prisma.serviceResource.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, fullName: true, email: true, phone: true } },
        skills: { include: { skill: true } },
        territoryMembers: {
          include: {
            territory: {
              include: {
                operatingHours: { include: { timeSlots: true } },
              },
            },
          },
        },
        absences: {
          where: {
            end: { gte: new Date() },
          },
          orderBy: { start: 'asc' },
        },
        assignments: {
          where: {
            serviceAppointment: {
              scheduledStart: { gte: new Date() },
              status: { notIn: ['COMPLETED', 'CANCELED', 'CANNOT_COMPLETE'] },
            },
          },
          include: {
            serviceAppointment: {
              select: {
                id: true,
                appointmentNumber: true,
                scheduledStart: true,
                scheduledEnd: true,
                status: true,
              },
            },
          },
          take: 10,
        },
      },
    });

    if (!resource) {
      return res.status(404).json({ error: 'Service resource not found' });
    }

    res.json(resource);
  } catch (error) {
    next(error);
  }
}

// Create resource
export async function createResource(req, res, next) {
  try {
    const data = createResourceSchema.parse(req.body);

    const resource = await prisma.serviceResource.create({
      data: {
        name: data.name,
        resourceType: data.resourceType,
        email: data.email,
        phone: data.phone,
        userId: data.userId,
        googleCalendarId: data.googleCalendarId,
        googleCalendarSyncEnabled: data.googleCalendarSyncEnabled,
        isActive: true,
      },
    });

    // Add skills
    if (data.skillIds && data.skillIds.length > 0) {
      await prisma.resourceSkill.createMany({
        data: data.skillIds.map((skillId) => ({
          resourceId: resource.id,
          skillId,
          level: 'INTERMEDIATE',
        })),
      });
    }

    // Add territory memberships
    if (data.territoryIds && data.territoryIds.length > 0) {
      await prisma.serviceTerritoryMember.createMany({
        data: data.territoryIds.map((territoryId, index) => ({
          resourceId: resource.id,
          territoryId,
          isPrimary: index === 0,
        })),
      });
    }

    // Fetch complete resource
    const result = await prisma.serviceResource.findUnique({
      where: { id: resource.id },
      include: {
        skills: { include: { skill: true } },
        territoryMembers: { include: { territory: true } },
      },
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

// Update resource
export async function updateResource(req, res, next) {
  try {
    const { id } = req.params;
    const data = updateResourceSchema.parse(req.body);

    const existing = await prisma.serviceResource.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Service resource not found' });
    }

    const resource = await prisma.serviceResource.update({
      where: { id },
      data: {
        name: data.name,
        resourceType: data.resourceType,
        email: data.email,
        phone: data.phone,
        userId: data.userId,
        googleCalendarId: data.googleCalendarId,
        googleCalendarSyncEnabled: data.googleCalendarSyncEnabled,
        isActive: data.isActive,
      },
      include: {
        skills: { include: { skill: true } },
        territoryMembers: { include: { territory: true } },
      },
    });

    res.json(resource);
  } catch (error) {
    next(error);
  }
}

// Delete resource
export async function deleteResource(req, res, next) {
  try {
    const { id } = req.params;

    // Check for existing assignments
    const assignmentCount = await prisma.assignedResource.count({
      where: { serviceResourceId: id },
    });

    if (assignmentCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete resource with existing assignments',
        assignmentCount,
      });
    }

    // Delete related records
    await prisma.resourceSkill.deleteMany({ where: { resourceId: id } });
    await prisma.serviceTerritoryMember.deleteMany({ where: { resourceId: id } });
    await prisma.resourceAbsence.deleteMany({ where: { resourceId: id } });

    await prisma.serviceResource.delete({ where: { id } });

    res.json({ message: 'Service resource deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// Get resource availability
export async function getResourceAvailability(req, res, next) {
  try {
    const { id } = req.params;
    const { dateFrom, dateTo, durationMinutes = 120 } = req.query;

    const startDate = dateFrom ? parseISO(dateFrom) : new Date();
    const endDate = dateTo ? parseISO(dateTo) : addDays(startDate, 14);

    const resource = await prisma.serviceResource.findUnique({
      where: { id },
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
        absences: {
          where: {
            OR: [
              { start: { gte: startDate, lte: endDate } },
              { end: { gte: startDate, lte: endDate } },
              { start: { lte: startDate }, end: { gte: endDate } },
            ],
          },
        },
        assignments: {
          where: {
            serviceAppointment: {
              OR: [
                { scheduledStart: { gte: startDate, lte: endDate } },
                { scheduledEnd: { gte: startDate, lte: endDate } },
              ],
              status: { notIn: ['COMPLETED', 'CANCELED', 'CANNOT_COMPLETE'] },
            },
          },
          include: {
            serviceAppointment: {
              select: {
                scheduledStart: true,
                scheduledEnd: true,
              },
            },
          },
        },
      },
    });

    if (!resource) {
      return res.status(404).json({ error: 'Service resource not found' });
    }

    // Get operating hours from primary territory
    const primaryMember = resource.territoryMembers.find((m) => m.isPrimary);
    const operatingHours = primaryMember?.territory?.operatingHours;
    const timeSlots = operatingHours?.timeSlots || [];

    // Build availability per day
    const availability = [];
    let currentDate = startOfDay(startDate);

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const daySlots = timeSlots.filter((s) => s.dayOfWeek === dayOfWeek);

      const dayAvailability = {
        date: format(currentDate, 'yyyy-MM-dd'),
        dayOfWeek,
        isWorkingDay: daySlots.length > 0,
        slots: [],
      };

      if (daySlots.length > 0) {
        // Check for absences this day
        const hasAbsence = resource.absences.some((absence) =>
          isWithinInterval(currentDate, { start: absence.start, end: absence.end })
        );

        if (!hasAbsence) {
          for (const slot of daySlots) {
            // Get existing appointments in this slot
            const [startHour, startMin] = slot.startTime.split(':').map(Number);
            const [endHour, endMin] = slot.endTime.split(':').map(Number);

            const slotStart = new Date(currentDate);
            slotStart.setHours(startHour, startMin, 0, 0);

            const slotEnd = new Date(currentDate);
            slotEnd.setHours(endHour, endMin, 0, 0);

            // Find gaps in existing appointments
            const dayAppointments = resource.assignments
              .filter((a) => {
                const aptStart = a.serviceAppointment.scheduledStart;
                return format(aptStart, 'yyyy-MM-dd') === format(currentDate, 'yyyy-MM-dd');
              })
              .map((a) => ({
                start: a.serviceAppointment.scheduledStart,
                end: a.serviceAppointment.scheduledEnd,
              }))
              .sort((a, b) => a.start.getTime() - b.start.getTime());

            // Find available time blocks
            let currentSlotStart = slotStart;
            const availableBlocks = [];

            for (const apt of dayAppointments) {
              if (apt.start > currentSlotStart) {
                const gapMinutes = (apt.start.getTime() - currentSlotStart.getTime()) / 60000;
                if (gapMinutes >= parseInt(durationMinutes)) {
                  availableBlocks.push({
                    start: format(currentSlotStart, "HH:mm"),
                    end: format(apt.start, "HH:mm"),
                    durationMinutes: gapMinutes,
                  });
                }
              }
              currentSlotStart = apt.end > currentSlotStart ? apt.end : currentSlotStart;
            }

            // Check remaining time after last appointment
            if (currentSlotStart < slotEnd) {
              const remainingMinutes = (slotEnd.getTime() - currentSlotStart.getTime()) / 60000;
              if (remainingMinutes >= parseInt(durationMinutes)) {
                availableBlocks.push({
                  start: format(currentSlotStart, "HH:mm"),
                  end: format(slotEnd, "HH:mm"),
                  durationMinutes: remainingMinutes,
                });
              }
            }

            dayAvailability.slots.push({
              operatingHours: `${slot.startTime} - ${slot.endTime}`,
              appointments: dayAppointments.length,
              availableBlocks,
            });
          }
        } else {
          dayAvailability.hasAbsence = true;
        }
      }

      availability.push(dayAvailability);
      currentDate = addDays(currentDate, 1);
    }

    res.json({
      resourceId: id,
      resourceName: resource.name,
      dateRange: {
        from: format(startDate, 'yyyy-MM-dd'),
        to: format(endDate, 'yyyy-MM-dd'),
      },
      requestedDuration: parseInt(durationMinutes),
      availability,
    });
  } catch (error) {
    next(error);
  }
}

// Create resource absence
export async function createAbsence(req, res, next) {
  try {
    const data = createAbsenceSchema.parse(req.body);

    // Check for conflicting appointments
    const conflicts = await prisma.assignedResource.count({
      where: {
        serviceResourceId: data.resourceId,
        serviceAppointment: {
          OR: [
            { scheduledStart: { gte: new Date(data.start), lte: new Date(data.end) } },
            { scheduledEnd: { gte: new Date(data.start), lte: new Date(data.end) } },
          ],
          status: { in: ['SCHEDULED', 'DISPATCHED'] },
        },
      },
    });

    if (conflicts > 0) {
      return res.status(400).json({
        error: 'Resource has appointments during this period',
        conflictingAppointments: conflicts,
      });
    }

    const absence = await prisma.resourceAbsence.create({
      data: {
        resourceId: data.resourceId,
        type: data.type,
        start: new Date(data.start),
        end: new Date(data.end),
        description: data.description,
      },
    });

    res.status(201).json(absence);
  } catch (error) {
    next(error);
  }
}

// Delete resource absence
export async function deleteAbsence(req, res, next) {
  try {
    const { id } = req.params;

    await prisma.resourceAbsence.delete({ where: { id } });

    res.json({ message: 'Absence deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// Get crews (for field service assignment)
export async function getCrews(req, res, next) {
  try {
    const { territoryId, isActive = 'true' } = req.query;

    const where = {
      resourceType: 'CREW',
      isActive: isActive === 'true',
    };

    if (territoryId) {
      where.territoryMembers = {
        some: { territoryId },
      };
    }

    const crews = await prisma.serviceResource.findMany({
      where,
      include: {
        territoryMembers: { include: { territory: true } },
        skills: { include: { skill: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json(crews);
  } catch (error) {
    next(error);
  }
}

// List all territories
export async function listTerritories(req, res, next) {
  try {
    const { isActive } = req.query;

    const where = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const territories = await prisma.serviceTerritory.findMany({
      where,
      include: {
        _count: {
          select: { members: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ data: territories });
  } catch (error) {
    next(error);
  }
}

// List all skills
export async function listSkills(req, res, next) {
  try {
    const skills = await prisma.skill.findMany({
      include: {
        _count: {
          select: { resources: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ data: skills });
  } catch (error) {
    next(error);
  }
}

// List scheduling policies (hardcoded for now, can be moved to DB later)
export async function listSchedulingPolicies(req, res, next) {
  try {
    // These match FSL scheduling policies
    const policies = [
      { id: 'panda-policy', name: 'Panda Policy', description: 'Default scheduling policy' },
      { id: 'crew-scheduling', name: 'Crew Scheduling Policy', description: 'Optimized for crew assignments' },
      { id: 'customer-first', name: 'Customer First', description: 'Prioritize customer preferences' },
      { id: 'emergency', name: 'Emergency', description: 'For urgent/emergency jobs' },
      { id: 'emergency-crew', name: 'Emergency Crew Policy', description: 'Emergency with crew optimization' },
      { id: 'high-intensity', name: 'High Intensity', description: 'For high-priority work' },
      { id: 'initial-appointment', name: 'Initial Appointment Scheduling', description: 'First-time appointments' },
      { id: 'pm-scheduling', name: 'PM Scheduling Policy', description: 'Project manager scheduling' },
      { id: 'self-gen', name: 'Self Gen Policy', description: 'Self-generated leads' },
      { id: 'soft-boundaries', name: 'Soft Boundaries', description: 'Flexible territory boundaries' },
    ];

    res.json({ data: policies });
  } catch (error) {
    next(error);
  }
}
