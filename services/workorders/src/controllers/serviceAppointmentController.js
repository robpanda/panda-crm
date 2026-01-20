import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { addMinutes, addDays, startOfDay, endOfDay, format } from 'date-fns';
import schedulingService from '../services/schedulingService.js';

const prisma = new PrismaClient();

// Workflows service URL for trigger calls
const WORKFLOWS_SERVICE_URL = process.env.WORKFLOWS_SERVICE_URL || 'http://workflows-service:3008';

// Notification service URL - deployed as separate service
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://notifications-service:3011';

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

    // Calculate earliest start and due date using scheduling service
    const earliestStart = data.earliestStart ? new Date(data.earliestStart) : new Date();

    // Auto-calculate due date from earliest start (FSL logic: default 30 days)
    let dueDate;
    if (data.dueDate) {
      dueDate = new Date(data.dueDate);
    } else {
      // Use scheduling service to calculate due date based on earliest start
      dueDate = schedulingService.calculateDueDateFromEarliestStart(earliestStart, 'default');
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
        earliestStart,
        dueDate,
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

    const existing = await prisma.serviceAppointment.findUnique({
      where: { id },
      include: {
        assignedResources: {
          include: {
            serviceResource: {
              include: { user: true },
            },
          },
        },
      },
    });
    if (!existing) {
      return res.status(404).json({ error: 'Service appointment not found' });
    }

    // Track if this is a dispatch action (status changing to DISPATCHED)
    const isDispatchAction = data.status === 'DISPATCHED' && existing.status !== 'DISPATCHED';

    // Auto-clone on cancel (replicates CloneServiceAppointment trigger)
    if (data.status === 'CANCELED' && existing.status === 'SCHEDULED') {
      // Clone the appointment
      const clonedNumber = await generateAppointmentNumber();
      const newEarliestStart = new Date();
      const newDueDate = schedulingService.calculateDueDateFromEarliestStart(newEarliestStart, 'default');

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
          earliestStart: newEarliestStart,
          dueDate: newDueDate,
          duration: existing.duration,
        },
      });
    }

    // Auto-recalculate due date when earliest start changes (replicates Trigger_SA_Earliest_Start_Permitted_Change)
    if (data.earliestStart && data.earliestStart !== existing.earliestStart?.toISOString() && !data.dueDate) {
      data.dueDate = schedulingService.calculateDueDateFromEarliestStart(
        new Date(data.earliestStart),
        'default'
      ).toISOString();
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
        workOrder: {
          select: {
            id: true,
            workOrderNumber: true,
            opportunityId: true,
            opportunity: {
              include: {
                account: true,
                contact: true,
              },
            },
            workType: true,
          },
        },
        assignedResources: {
          include: {
            serviceResource: {
              include: { user: true },
            },
          },
        },
      },
    });

    // Send dispatch notifications to assigned resources when status changes to DISPATCHED
    if (isDispatchAction && appointment.assignedResources?.length > 0) {
      const opportunity = appointment.workOrder?.opportunity;
      if (opportunity) {
        // Get user IDs of assigned resources to notify
        const inspectorIds = appointment.assignedResources
          .filter(ar => ar.serviceResource?.userId)
          .map(ar => ar.serviceResource.userId);

        if (inspectorIds.length > 0) {
          // Send dispatch notifications asynchronously (don't block the response)
          sendDispatchNotifications(inspectorIds, appointment, opportunity, req.user?.fullName)
            .catch(err => console.error('Failed to send dispatch notifications:', err));
        }
      }
    }

    // Trigger inspection completion workflow when status changes to COMPLETED
    const isCompletionAction = data.status === 'COMPLETED' && existing.status !== 'COMPLETED';
    if (isCompletionAction) {
      // Call workflows service to evaluate inspection triggers asynchronously
      evaluateInspectionCompletion(appointment.id, existing.status, data.status, req.user?.id)
        .catch(err => console.error('Failed to evaluate inspection triggers:', err));
    }

    // Trigger SMS notifications when status changes to CANCELED
    // This replicates the Salesforce SMS_Appt_Canceled flow
    const isCancellationAction = data.status === 'CANCELED' && existing.status !== 'CANCELED';
    if (isCancellationAction) {
      // Call workflows service to evaluate SMS triggers asynchronously
      evaluateAppointmentSMSTriggers(
        appointment.id,
        { status: data.status, subject: appointment.subject, scheduledStart: appointment.scheduledStart },
        { status: existing.status },
        req.user?.id
      ).catch(err => console.error('Failed to evaluate SMS triggers:', err));
    }

    res.json(appointment);
  } catch (error) {
    next(error);
  }
}

/**
 * Send dispatch notifications to assigned resources via the notification service
 * This is called asynchronously when an appointment is dispatched
 */
async function sendDispatchNotifications(inspectorIds, appointment, opportunity, dispatchedByName) {
  try {
    const response = await fetch(`${NOTIFICATION_SERVICE_URL}/api/notifications/dispatch-appointment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inspectorIds,
        appointment: {
          id: appointment.id,
          appointmentNumber: appointment.appointmentNumber,
          scheduledStart: appointment.scheduledStart,
          scheduledEnd: appointment.scheduledEnd,
          description: appointment.description,
          workOrderId: appointment.workOrderId,
          workType: appointment.workOrder?.workType,
        },
        opportunity: {
          id: opportunity.id,
          name: opportunity.name,
          account: opportunity.account,
          contact: opportunity.contact,
        },
        options: {
          dispatchedByName: dispatchedByName || 'Call Center',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Notification service error:', error);
    } else {
      console.log(`Dispatch notifications sent to ${inspectorIds.length} resource(s)`);
    }
  } catch (error) {
    console.error('Failed to call notification service:', error);
    // Don't throw - notification failure shouldn't break the dispatch
  }
}

/**
 * Evaluate inspection completion triggers via the workflows service
 * This is called asynchronously when an appointment status changes to COMPLETED
 */
async function evaluateInspectionCompletion(appointmentId, oldStatus, newStatus, userId) {
  try {
    const response = await fetch(`${WORKFLOWS_SERVICE_URL}/api/workflows/triggers/inspection-completed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceAppointmentId: appointmentId,
        oldStatus,
        newStatus,
        userId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Workflows service error:', error);
    } else {
      const result = await response.json();
      console.log(`Inspection completion triggers evaluated:`, result);
    }
  } catch (error) {
    console.error('Failed to call workflows service for inspection triggers:', error);
    // Don't throw - workflow failure shouldn't break the status update
  }
}

/**
 * Evaluate SMS triggers when a service appointment status changes
 * This calls the workflows service which handles the actual SMS sending via Bamboogli
 * Replicates the Salesforce SMS_Appt_Canceled flow functionality
 */
async function evaluateAppointmentSMSTriggers(appointmentId, newValues, oldValues, userId) {
  try {
    const response = await fetch(`${WORKFLOWS_SERVICE_URL}/api/workflows/triggers/sms/evaluate-service-appointment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        serviceAppointmentId: appointmentId,
        newValues,
        oldValues,
        eventType: 'update',
        userId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Workflows service SMS trigger error:', error);
    } else {
      const result = await response.json();
      console.log(`Service appointment SMS triggers evaluated:`, result);
    }
  } catch (error) {
    console.error('Failed to call workflows service for SMS triggers:', error);
    // Don't throw - SMS failure shouldn't break the status update
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

// Mobile: Get my schedule for a specific date
// Used by Panda Mobile app - Sales Rep experience
// Helper function to flatten appointment data for mobile app
function flattenAppointmentForMobile(appointment) {
  const workOrder = appointment.workOrder;
  const account = workOrder?.account;
  const opportunity = workOrder?.opportunity;
  const workType = workOrder?.workType;
  const contact = workOrder?.contact;

  return {
    id: appointment.id,
    appointmentNumber: appointment.appointmentNumber,
    status: appointment.status,
    scheduledStart: appointment.scheduledStart,
    scheduledEnd: appointment.scheduledEnd,
    actualStart: appointment.actualStart,
    actualEnd: appointment.actualEnd,
    subject: appointment.subject,
    description: appointment.description,
    notes: appointment.notes,
    // Flattened work order fields
    workOrderId: workOrder?.id,
    workOrderNumber: workOrder?.workOrderNumber,
    // Flattened opportunity fields
    opportunityId: opportunity?.id,
    opportunityName: opportunity?.name,
    jobId: opportunity?.jobId,
    stageName: opportunity?.stageName,
    // Flattened work type fields
    workTypeId: workType?.id,
    workTypeName: workType?.name,
    // Flattened account/address fields
    accountId: account?.id,
    accountName: account?.name,
    accountPhone: account?.phone,
    street: account?.billingStreet,
    city: account?.billingCity,
    state: account?.billingState,
    postalCode: account?.billingPostalCode,
    // Flattened contact fields
    contactId: contact?.id,
    contactName: contact ? `${contact.firstName || ''} ${contact.lastName || ''}`.trim() : null,
    contactPhone: contact?.phone,
    contactEmail: contact?.email,
    // Assigned resources (keep as array for multiple assignments)
    assignedResources: appointment.assignedResources?.map(ar => ({
      id: ar.serviceResource?.id,
      name: ar.serviceResource?.name,
      phone: ar.serviceResource?.phone,
    })) || [],
    // Keep original nested data for backward compatibility
    workOrder: appointment.workOrder,
  };
}

export async function getMySchedule(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: { message: 'Authentication required' } });
    }

    const { date } = req.query;
    const targetDate = date ? new Date(date) : new Date();

    // Find service resource for this user
    const serviceResource = await prisma.serviceResource.findFirst({
      where: { userId },
    });

    if (!serviceResource) {
      // Return empty array if user has no service resource (not a field rep)
      return res.json({ success: true, data: [] });
    }

    const appointments = await prisma.serviceAppointment.findMany({
      where: {
        scheduledStart: {
          gte: startOfDay(targetDate),
          lte: endOfDay(targetDate),
        },
        assignedResources: {
          some: { serviceResourceId: serviceResource.id },
        },
      },
      include: {
        workOrder: {
          include: {
            account: { select: { id: true, name: true, phone: true, billingStreet: true, billingCity: true, billingState: true, billingPostalCode: true } },
            opportunity: { select: { id: true, name: true, jobId: true, stageName: true } },
            workType: { select: { id: true, name: true } },
            contact: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
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

    // Flatten appointments for mobile app compatibility
    const flattenedAppointments = appointments.map(flattenAppointmentForMobile);

    res.json({ success: true, data: flattenedAppointments });
  } catch (error) {
    next(error);
  }
}

// Mobile: Get my appointments with date range and status filter
// Used by Panda Mobile app - Sales Rep experience
export async function getMyAppointments(req, res, next) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, error: { message: 'Authentication required' } });
    }

    const { startDate, endDate, status } = req.query;

    // Find service resource for this user
    const serviceResource = await prisma.serviceResource.findFirst({
      where: { userId },
    });

    if (!serviceResource) {
      return res.json({ success: true, data: [] });
    }

    const where = {
      assignedResources: {
        some: { serviceResourceId: serviceResource.id },
      },
    };

    // Date range filter
    if (startDate || endDate) {
      where.scheduledStart = {};
      if (startDate) where.scheduledStart.gte = new Date(startDate);
      if (endDate) where.scheduledStart.lte = endOfDay(new Date(endDate));
    }

    // Status filter
    if (status) {
      where.status = status;
    }

    const appointments = await prisma.serviceAppointment.findMany({
      where,
      include: {
        workOrder: {
          include: {
            account: { select: { id: true, name: true, phone: true, billingStreet: true, billingCity: true, billingState: true, billingPostalCode: true } },
            opportunity: { select: { id: true, name: true, jobId: true, stageName: true } },
            workType: { select: { id: true, name: true } },
            contact: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
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

    // Flatten appointments for mobile app compatibility
    const flattenedAppointments = appointments.map(flattenAppointmentForMobile);

    res.json({ success: true, data: flattenedAppointments });
  } catch (error) {
    next(error);
  }
}

// Mobile: Check-in to appointment (start work)
export async function checkInAppointment(req, res, next) {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const appointment = await prisma.serviceAppointment.update({
      where: { id },
      data: {
        status: 'IN_PROGRESS',
        actualStart: new Date(),
      },
      include: {
        workOrder: {
          include: {
            account: { select: { id: true, name: true, phone: true, billingStreet: true, billingCity: true, billingState: true, billingPostalCode: true } },
            opportunity: { select: { id: true, name: true, jobId: true, stageName: true } },
            workType: { select: { id: true, name: true } },
            contact: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
          },
        },
        assignedResources: {
          include: {
            serviceResource: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    });

    // Flatten for mobile app compatibility
    const flattenedAppointment = flattenAppointmentForMobile(appointment);

    res.json({ success: true, data: flattenedAppointment });
  } catch (error) {
    next(error);
  }
}

// Mobile: Complete appointment
export async function completeAppointment(req, res, next) {
  try {
    const { id } = req.params;
    const { notes } = req.body;

    const appointment = await prisma.serviceAppointment.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        actualEnd: new Date(),
        description: notes ? notes : undefined,
      },
      include: {
        workOrder: {
          include: {
            account: { select: { id: true, name: true, phone: true, billingStreet: true, billingCity: true, billingState: true, billingPostalCode: true } },
            opportunity: { select: { id: true, name: true, jobId: true, stageName: true } },
            workType: { select: { id: true, name: true } },
            contact: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
          },
        },
        assignedResources: {
          include: {
            serviceResource: { select: { id: true, name: true, phone: true } },
          },
        },
      },
    });

    // Flatten for mobile app compatibility
    const flattenedAppointment = flattenAppointmentForMobile(appointment);

    res.json({ success: true, data: flattenedAppointment });
  } catch (error) {
    next(error);
  }
}
