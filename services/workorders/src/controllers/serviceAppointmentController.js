import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { addMinutes, startOfDay, endOfDay, format } from 'date-fns';

const prisma = new PrismaClient();

// Validation schemas
const createAppointmentSchema = z.object({
  workOrderId: z.string(),
  subject: z.string().optional(),
  description: z.string().optional(),
  earliestStart: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
  duration: z.number().int().positive().optional(), // minutes
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  resourceIds: z.array(z.string()).optional(),
});

const updateAppointmentSchema = createAppointmentSchema.partial().extend({
  status: z.enum([
    'NONE',
    'SCHEDULED',
    'DISPATCHED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANNOT_COMPLETE',
    'CANCELED',
  ]).optional(),
  actualStart: z.string().datetime().optional(),
  actualEnd: z.string().datetime().optional(),
});

// Generate appointment number
async function generateAppointmentNumber() {
  const count = await prisma.serviceAppointment.count();
  const num = count + 1;
  return `SA-${String(num).padStart(6, '0')}`;
}

// List service appointments
export async function listAppointments(req, res, next) {
  try {
    const {
      workOrderId,
      status,
      resourceId,
      dateFrom,
      dateTo,
      page = 1,
      limit = 20,
      sortBy = 'scheduledStart',
      sortOrder = 'asc',
    } = req.query;

    const where = {};

    if (workOrderId) where.workOrderId = workOrderId;
    if (status) where.status = status;

    if (resourceId) {
      where.assignedResources = {
        some: { serviceResourceId: resourceId },
      };
    }

    if (dateFrom || dateTo) {
      where.scheduledStart = {};
      if (dateFrom) where.scheduledStart.gte = new Date(dateFrom);
      if (dateTo) where.scheduledStart.lte = new Date(dateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [appointments, total] = await Promise.all([
      prisma.serviceAppointment.findMany({
        where,
        include: {
          workOrder: {
            select: {
              id: true,
              workOrderNumber: true,
              subject: true,
              account: { select: { id: true, name: true } },
              opportunity: { select: { id: true, name: true } },
            },
          },
          assignedResources: {
            include: {
              serviceResource: {
                select: { id: true, name: true, phone: true, resourceType: true },
              },
            },
          },
        },
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.serviceAppointment.count({ where }),
    ]);

    res.json({
      data: appointments,
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

// Get single appointment
export async function getAppointment(req, res, next) {
  try {
    const { id } = req.params;

    const appointment = await prisma.serviceAppointment.findUnique({
      where: { id },
      include: {
        workOrder: {
          include: {
            account: true,
            opportunity: {
              select: {
                id: true,
                name: true,
                stage: true,
                amount: true,
                contact: {
                  select: { id: true, fullName: true, phone: true, email: true },
                },
              },
            },
            workType: true,
            territory: true,
          },
        },
        assignedResources: {
          include: {
            serviceResource: {
              include: {
                skills: { include: { skill: true } },
              },
            },
          },
        },
      },
    });

    if (!appointment) {
      return res.status(404).json({ error: 'Service appointment not found' });
    }

    res.json(appointment);
  } catch (error) {
    next(error);
  }
}

// Create service appointment
export async function createAppointment(req, res, next) {
  try {
    const data = createAppointmentSchema.parse(req.body);
    const appointmentNumber = await generateAppointmentNumber();

    // Get work order for default values
    const workOrder = await prisma.workOrder.findUnique({
      where: { id: data.workOrderId },
      include: {
        account: true,
        workType: true,
      },
    });

    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    // Use work order account address if not provided
    const street = data.street || workOrder.account?.billingStreet;
    const city = data.city || workOrder.account?.billingCity;
    const state = data.state || workOrder.account?.billingState;
    const postalCode = data.postalCode || workOrder.account?.billingPostalCode;

    // Calculate scheduled end if start and duration provided
    let scheduledEnd = data.scheduledEnd ? new Date(data.scheduledEnd) : null;
    const scheduledStart = data.scheduledStart ? new Date(data.scheduledStart) : null;
    const duration = data.duration || workOrder.workType?.estimatedDuration || 120;

    if (scheduledStart && !scheduledEnd) {
      scheduledEnd = addMinutes(scheduledStart, duration);
    }

    // Create appointment
    const appointment = await prisma.serviceAppointment.create({
      data: {
        appointmentNumber,
        workOrderId: data.workOrderId,
        subject: data.subject || `Service Appointment - ${workOrder.account?.name}`,
        description: data.description,
        status: scheduledStart ? 'SCHEDULED' : 'NONE',
        street,
        city,
        state,
        postalCode,
        earliestStart: data.earliestStart ? new Date(data.earliestStart) : new Date(),
        dueDate: data.dueDate ? new Date(data.dueDate) : addMinutes(new Date(), 43200), // 30 days
        scheduledStart,
        scheduledEnd,
        duration,
      },
    });

    // Assign resources if provided
    if (data.resourceIds && data.resourceIds.length > 0) {
      const assignments = data.resourceIds.map((resourceId, index) => ({
        serviceAppointmentId: appointment.id,
        serviceResourceId: resourceId,
        isPrimaryResource: index === 0,
      }));

      await prisma.assignedResource.createMany({ data: assignments });
    }

    // Fetch complete appointment with relations
    const result = await prisma.serviceAppointment.findUnique({
      where: { id: appointment.id },
      include: {
        workOrder: {
          select: { id: true, workOrderNumber: true, subject: true },
        },
        assignedResources: {
          include: {
            serviceResource: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

// Update service appointment
export async function updateAppointment(req, res, next) {
  try {
    const { id } = req.params;
    const data = updateAppointmentSchema.parse(req.body);

    const existing = await prisma.serviceAppointment.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Service appointment not found' });
    }

    // Auto-clone on cancel (replicates CloneServiceAppointment trigger)
    if (data.status === 'CANCELED' && existing.status === 'SCHEDULED') {
      // Clone the appointment
      const clonedNumber = await generateAppointmentNumber();
      await prisma.serviceAppointment.create({
        data: {
          appointmentNumber: clonedNumber,
          workOrderId: existing.workOrderId,
          subject: existing.subject,
          description: existing.description,
          status: 'NONE',
          street: existing.street,
          city: existing.city,
          state: existing.state,
          postalCode: existing.postalCode,
          earliestStart: new Date(),
          dueDate: addMinutes(new Date(), 43200),
          duration: existing.duration,
        },
      });
    }

    const appointment = await prisma.serviceAppointment.update({
      where: { id },
      data: {
        ...data,
        scheduledStart: data.scheduledStart ? new Date(data.scheduledStart) : undefined,
        scheduledEnd: data.scheduledEnd ? new Date(data.scheduledEnd) : undefined,
        actualStart: data.actualStart ? new Date(data.actualStart) : undefined,
        actualEnd: data.actualEnd ? new Date(data.actualEnd) : undefined,
        earliestStart: data.earliestStart ? new Date(data.earliestStart) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
      include: {
        workOrder: { select: { id: true, workOrderNumber: true } },
        assignedResources: {
          include: {
            serviceResource: { select: { id: true, name: true } },
          },
        },
      },
    });

    res.json(appointment);
  } catch (error) {
    next(error);
  }
}

// Delete service appointment
export async function deleteAppointment(req, res, next) {
  try {
    const { id } = req.params;

    // Delete assigned resources first
    await prisma.assignedResource.deleteMany({
      where: { serviceAppointmentId: id },
    });

    await prisma.serviceAppointment.delete({ where: { id } });

    res.json({ message: 'Service appointment deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// Assign resource to appointment
export async function assignResource(req, res, next) {
  try {
    const { id } = req.params;
    const { resourceId, isPrimary = false } = req.body;

    // Check if already assigned
    const existing = await prisma.assignedResource.findUnique({
      where: {
        serviceAppointmentId_serviceResourceId: {
          serviceAppointmentId: id,
          serviceResourceId: resourceId,
        },
      },
    });

    if (existing) {
      return res.status(400).json({ error: 'Resource already assigned' });
    }

    // If making this primary, remove primary from others
    if (isPrimary) {
      await prisma.assignedResource.updateMany({
        where: { serviceAppointmentId: id },
        data: { isPrimaryResource: false },
      });
    }

    const assignment = await prisma.assignedResource.create({
      data: {
        serviceAppointmentId: id,
        serviceResourceId: resourceId,
        isPrimaryResource: isPrimary,
      },
      include: {
        serviceResource: { select: { id: true, name: true, phone: true } },
      },
    });

    res.status(201).json(assignment);
  } catch (error) {
    next(error);
  }
}

// Remove resource from appointment
export async function removeResource(req, res, next) {
  try {
    const { id, resourceId } = req.params;

    await prisma.assignedResource.delete({
      where: {
        serviceAppointmentId_serviceResourceId: {
          serviceAppointmentId: id,
          serviceResourceId: resourceId,
        },
      },
    });

    res.json({ message: 'Resource removed from appointment' });
  } catch (error) {
    next(error);
  }
}

// Get today's schedule for dashboard
export async function getTodaySchedule(req, res, next) {
  try {
    const { territoryId, resourceId } = req.query;
    const today = new Date();

    const where = {
      scheduledStart: {
        gte: startOfDay(today),
        lte: endOfDay(today),
      },
      status: { in: ['SCHEDULED', 'DISPATCHED', 'IN_PROGRESS'] },
    };

    if (resourceId) {
      where.assignedResources = {
        some: { serviceResourceId: resourceId },
      };
    }

    if (territoryId) {
      where.workOrder = { territoryId };
    }

    const appointments = await prisma.serviceAppointment.findMany({
      where,
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
            serviceResource: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { scheduledStart: 'asc' },
    });

    // Group by hour for timeline view
    const timeline = {};
    appointments.forEach((apt) => {
      const hour = format(apt.scheduledStart, 'HH:00');
      if (!timeline[hour]) timeline[hour] = [];
      timeline[hour].push(apt);
    });

    res.json({
      date: format(today, 'yyyy-MM-dd'),
      totalAppointments: appointments.length,
      appointments,
      timeline,
    });
  } catch (error) {
    next(error);
  }
}

// Get appointment statistics
export async function getAppointmentStats(req, res, next) {
  try {
    const { dateFrom, dateTo, territoryId } = req.query;

    const where = {};

    if (territoryId) {
      where.workOrder = { territoryId };
    }

    if (dateFrom || dateTo) {
      where.scheduledStart = {};
      if (dateFrom) where.scheduledStart.gte = new Date(dateFrom);
      if (dateTo) where.scheduledStart.lte = new Date(dateTo);
    }

    const [total, byStatus, completed] = await Promise.all([
      prisma.serviceAppointment.count({ where }),
      prisma.serviceAppointment.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      prisma.serviceAppointment.count({
        where: { ...where, status: 'COMPLETED' },
      }),
    ]);

    // Calculate average duration for completed appointments
    const completedWithDuration = await prisma.serviceAppointment.findMany({
      where: { ...where, status: 'COMPLETED', actualStart: { not: null }, actualEnd: { not: null } },
      select: { actualStart: true, actualEnd: true },
    });

    let avgDuration = 0;
    if (completedWithDuration.length > 0) {
      const totalMinutes = completedWithDuration.reduce((acc, apt) => {
        return acc + (apt.actualEnd.getTime() - apt.actualStart.getTime()) / 60000;
      }, 0);
      avgDuration = Math.round(totalMinutes / completedWithDuration.length);
    }

    res.json({
      total,
      byStatus: byStatus.reduce((acc, s) => {
        acc[s.status] = s._count.status;
        return acc;
      }, {}),
      completed,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      avgDurationMinutes: avgDuration,
    });
  } catch (error) {
    next(error);
  }
}
