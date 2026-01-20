import { PrismaClient } from '@prisma/client';
import { z } from 'zod';

const prisma = new PrismaClient();

// Validation schemas
const createWorkOrderSchema = z.object({
  accountId: z.string(),
  opportunityId: z.string().optional(),
  workTypeId: z.string().optional(),
  territoryId: z.string().optional(),
  subject: z.string().optional(),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  asDraft: z.boolean().optional(), // Create as draft if true or if workTypeId/territoryId lookup fails
});

const updateWorkOrderSchema = createWorkOrderSchema.partial().extend({
  status: z.enum(['DRAFT', 'NEW', 'READY_TO_SCHEDULE', 'SCHEDULED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED', 'CANCELED']).optional(),
});

// Generate work order number
async function generateWorkOrderNumber() {
  const count = await prisma.workOrder.count();
  const num = count + 1;
  return `WO-${String(num).padStart(6, '0')}`;
}

// List work orders with filters
export async function listWorkOrders(req, res, next) {
  try {
    const {
      accountId,
      opportunityId,
      status,
      priority,
      territoryId,
      startDateFrom,
      startDateTo,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const where = {};

    if (accountId) where.accountId = accountId;
    if (opportunityId) where.opportunityId = opportunityId;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (territoryId) where.territoryId = territoryId;

    if (startDateFrom || startDateTo) {
      where.startDate = {};
      if (startDateFrom) where.startDate.gte = new Date(startDateFrom);
      if (startDateTo) where.startDate.lte = new Date(startDateTo);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [workOrders, total] = await Promise.all([
      prisma.workOrder.findMany({
        where,
        include: {
          account: { select: { id: true, name: true } },
          opportunity: { select: { id: true, name: true, stage: true } },
          workType: { select: { id: true, name: true } },
          territory: { select: { id: true, name: true } },
          serviceAppointments: {
            select: {
              id: true,
              appointmentNumber: true,
              status: true,
              scheduledStart: true,
              scheduledEnd: true,
            },
          },
        },
        skip,
        take,
        orderBy: { [sortBy]: sortOrder },
      }),
      prisma.workOrder.count({ where }),
    ]);

    res.json({
      data: workOrders,
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

// Get single work order with full details
export async function getWorkOrder(req, res, next) {
  try {
    const { id } = req.params;

    const workOrder = await prisma.workOrder.findUnique({
      where: { id },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            billingStreet: true,
            billingCity: true,
            billingState: true,
            billingPostalCode: true,
            phone: true,
            email: true,
          },
        },
        opportunity: {
          select: {
            id: true,
            name: true,
            stage: true,
            amount: true,
            workType: true,
          },
        },
        workType: true,
        territory: {
          include: {
            operatingHours: {
              include: { timeSlots: true },
            },
          },
        },
        serviceAppointments: {
          include: {
            assignedResources: {
              include: {
                serviceResource: {
                  select: { id: true, name: true, phone: true, email: true },
                },
              },
            },
          },
          orderBy: { scheduledStart: 'asc' },
        },
      },
    });

    if (!workOrder) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    res.json(workOrder);
  } catch (error) {
    next(error);
  }
}

// Create work order (replicates DraftWorkOrderController logic)
// Supports draft mode: creates as DRAFT if asDraft=true or if required data lookup fails
export async function createWorkOrder(req, res, next) {
  try {
    const data = createWorkOrderSchema.parse(req.body);
    const workOrderNumber = await generateWorkOrderNumber();

    let shouldBeDraft = data.asDraft || false;
    let draftReasons = [];

    // If opportunityId provided, fetch opportunity details
    let workTypeId = data.workTypeId;
    if (data.opportunityId && !workTypeId) {
      const opportunity = await prisma.opportunity.findUnique({
        where: { id: data.opportunityId },
        select: { workType: true },
      });

      // Map opportunity workType to WorkType record
      if (opportunity?.workType) {
        const workTypeMap = {
          'Panda Standard': 'Standard Roof Installation',
          'Panda Systems Plus': 'Standard Roof Installation',
          'Panda Gold Package': 'Gold Pledge Installation',
          'Panda Presidential': 'Gold Pledge Installation',
          'Inspection': 'Inspection',
          'Insurance Inspection': 'Inspection',
          'Retail Demo': 'Retail Demo',
        };

        const workTypeName = workTypeMap[opportunity.workType];
        if (workTypeName) {
          const wt = await prisma.workType.findFirst({
            where: { name: workTypeName },
          });
          if (wt) {
            workTypeId = wt.id;
          } else {
            shouldBeDraft = true;
            draftReasons.push(`Work type "${workTypeName}" not found in system`);
          }
        }
      }
    }

    // Get territory based on account state if not provided
    let territoryId = data.territoryId;
    if (!territoryId) {
      const account = await prisma.account.findUnique({
        where: { id: data.accountId },
        select: { billingState: true },
      });

      if (account?.billingState) {
        const territory = await prisma.serviceTerritory.findFirst({
          where: { state: account.billingState, isActive: true },
        });
        if (territory) {
          territoryId = territory.id;
        } else {
          shouldBeDraft = true;
          draftReasons.push(`No active territory found for state "${account.billingState}"`);
        }
      } else {
        shouldBeDraft = true;
        draftReasons.push('Account has no billing state for territory lookup');
      }
    }

    // Determine status: DRAFT if missing required data or explicitly requested
    const status = shouldBeDraft ? 'DRAFT' : 'NEW';

    const workOrder = await prisma.workOrder.create({
      data: {
        workOrderNumber,
        accountId: data.accountId,
        opportunityId: data.opportunityId,
        workTypeId,
        territoryId,
        subject: data.subject || `Work Order for Account`,
        description: data.description,
        priority: data.priority,
        status,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
      include: {
        account: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true } },
        workType: true,
        territory: true,
      },
    });

    // Return with draft info if applicable
    const response = {
      ...workOrder,
      isDraft: status === 'DRAFT',
      draftReasons: draftReasons.length > 0 ? draftReasons : undefined,
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

// Update work order
export async function updateWorkOrder(req, res, next) {
  try {
    const { id } = req.params;
    const data = updateWorkOrderSchema.parse(req.body);

    const existing = await prisma.workOrder.findUnique({ where: { id } });
    if (!existing) {
      return res.status(404).json({ error: 'Work order not found' });
    }

    const workOrder = await prisma.workOrder.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
      include: {
        account: { select: { id: true, name: true } },
        opportunity: { select: { id: true, name: true } },
        workType: true,
        territory: true,
      },
    });

    res.json(workOrder);
  } catch (error) {
    next(error);
  }
}

// Delete work order
export async function deleteWorkOrder(req, res, next) {
  try {
    const { id } = req.params;

    // Check for existing service appointments
    const appointmentCount = await prisma.serviceAppointment.count({
      where: { workOrderId: id },
    });

    if (appointmentCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete work order with existing service appointments',
        appointmentCount,
      });
    }

    await prisma.workOrder.delete({ where: { id } });

    res.json({ message: 'Work order deleted successfully' });
  } catch (error) {
    next(error);
  }
}

// Get work orders by opportunity (the HUB view)
export async function getWorkOrdersByOpportunity(req, res, next) {
  try {
    const { opportunityId } = req.params;

    const workOrders = await prisma.workOrder.findMany({
      where: { opportunityId },
      include: {
        workType: true,
        territory: true,
        serviceAppointments: {
          include: {
            assignedResources: {
              include: {
                serviceResource: {
                  select: { id: true, name: true, resourceType: true },
                },
              },
            },
          },
          orderBy: { scheduledStart: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate stats
    const stats = {
      total: workOrders.length,
      byStatus: {},
      totalAppointments: 0,
      scheduledAppointments: 0,
      completedAppointments: 0,
    };

    workOrders.forEach((wo) => {
      stats.byStatus[wo.status] = (stats.byStatus[wo.status] || 0) + 1;
      wo.serviceAppointments.forEach((sa) => {
        stats.totalAppointments++;
        if (sa.status === 'SCHEDULED') stats.scheduledAppointments++;
        if (sa.status === 'COMPLETED') stats.completedAppointments++;
      });
    });

    res.json({
      opportunityId,
      stats,
      workOrders,
    });
  } catch (error) {
    next(error);
  }
}

// Get work order statistics
export async function getWorkOrderStats(req, res, next) {
  try {
    const { territoryId, dateFrom, dateTo } = req.query;

    const where = {};
    if (territoryId) where.territoryId = territoryId;
    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) where.createdAt.gte = new Date(dateFrom);
      if (dateTo) where.createdAt.lte = new Date(dateTo);
    }

    const [total, byStatus, byPriority] = await Promise.all([
      prisma.workOrder.count({ where }),
      prisma.workOrder.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
      prisma.workOrder.groupBy({
        by: ['priority'],
        where,
        _count: { priority: true },
      }),
    ]);

    // Convert byStatus to friendly keys for frontend
    const statusCounts = byStatus.reduce((acc, s) => {
      acc[s.status] = s._count.status;
      return acc;
    }, {});

    res.json({
      total,
      // Friendly keys for frontend stats cards
      new: statusCounts.NEW || 0,
      readyToSchedule: statusCounts.READY_TO_SCHEDULE || 0,
      scheduled: statusCounts.SCHEDULED || 0,
      inProgress: statusCounts.IN_PROGRESS || 0,
      onHold: statusCounts.ON_HOLD || 0,
      completed: statusCounts.COMPLETED || 0,
      cancelled: (statusCounts.CANCELLED || 0) + (statusCounts.CANCELED || 0),
      // Raw data for other uses
      byStatus: statusCounts,
      byPriority: byPriority.reduce((acc, p) => {
        acc[p.priority] = p._count.priority;
        return acc;
      }, {}),
    });
  } catch (error) {
    next(error);
  }
}

// Get all work types
export async function getWorkTypes(req, res, next) {
  try {
    const workTypes = await prisma.workType.findMany({
      orderBy: { name: 'asc' },
    });

    res.json({ data: workTypes });
  } catch (error) {
    next(error);
  }
}
