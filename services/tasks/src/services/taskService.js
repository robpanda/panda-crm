// Task Service - CRUD operations for tasks
import { PrismaClient } from '@prisma/client';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

// Task subject options (matching Salesforce)
export const TASK_SUBJECTS = [
  'Call',
  'Send Letter/Quote',
  'Send Quote',
  'Other',
  'Meeting',
  'Site Visit',
  'Follow Up',
  'Contract Review',
  'Document Collection',
  'Schedule Appointment',
  'Insurance Follow Up',
  'Payment Follow Up',
  'Estimate Request',
  'Adjuster Meeting',
  'Project Prep',
];

// Task subtypes
export const TASK_SUBTYPES = [
  'Call',
  'Email',
  'List Email',
  'Cadence',
  'LinkedIn',
  'Other',
];

/**
 * List tasks with filters
 */
export async function listTasks(filters = {}) {
  const {
    page = 1,
    limit = 50,
    status,
    priority,
    assignedToId,
    opportunityId,
    leadId,
    accountId,
    search,
    sortBy = 'dueDate',
    sortOrder = 'asc',
    showCompleted = false,
  } = filters;

  const where = {};

  // Filter by status - by default hide completed tasks
  if (status) {
    where.status = status;
  } else if (!showCompleted) {
    where.status = { not: 'COMPLETED' };
  }

  if (priority) {
    where.priority = priority;
  }

  if (assignedToId) {
    where.assignedToId = assignedToId;
  }

  if (opportunityId) {
    where.opportunityId = opportunityId;
  }

  if (leadId) {
    where.leadId = leadId;
  }

  if (search) {
    where.OR = [
      { subject: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      include: {
        assignedTo: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        opportunity: {
          select: { id: true, name: true, stage: true },
        },
        lead: {
          select: { id: true, firstName: true, lastName: true, status: true },
        },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.task.count({ where }),
  ]);

  return {
    data: tasks,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Get a single task by ID
 */
export async function getTask(id) {
  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      assignedTo: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      opportunity: {
        select: {
          id: true,
          name: true,
          stage: true,
          account: {
            select: { id: true, name: true },
          },
        },
      },
      lead: {
        select: { id: true, firstName: true, lastName: true, status: true },
      },
    },
  });

  if (!task) {
    const error = new Error('Task not found');
    error.statusCode = 404;
    throw error;
  }

  return task;
}

/**
 * Create a new task
 */
export async function createTask(data, userId) {
  const {
    subject,
    subtype,
    description,
    status = 'NOT_STARTED',
    priority = 'NORMAL',
    dueDate,
    assignedToId,
    opportunityId,
    leadId,
  } = data;

  // Validate required fields
  if (!subject) {
    const error = new Error('Subject is required');
    error.statusCode = 400;
    throw error;
  }

  // Build task data
  const taskData = {
    subject,
    description: description || subtype ? `[${subtype || 'Task'}] ${description || ''}`.trim() : null,
    status,
    priority,
    dueDate: dueDate ? new Date(dueDate) : null,
  };

  // Set assignment - default to creator if not specified
  if (assignedToId) {
    taskData.assignedTo = { connect: { id: assignedToId } };
  } else if (userId) {
    taskData.assignedTo = { connect: { id: userId } };
  }

  // Link to opportunity or lead
  if (opportunityId) {
    taskData.opportunity = { connect: { id: opportunityId } };
  }
  if (leadId) {
    taskData.lead = { connect: { id: leadId } };
  }

  const task = await prisma.task.create({
    data: taskData,
    include: {
      assignedTo: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      opportunity: {
        select: { id: true, name: true, stage: true },
      },
      lead: {
        select: { id: true, firstName: true, lastName: true, status: true },
      },
    },
  });

  logger.info(`Task created: ${task.id} - ${task.subject}`);

  return task;
}

/**
 * Update a task
 */
export async function updateTask(id, data, userId) {
  // Verify task exists
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('Task not found');
    error.statusCode = 404;
    throw error;
  }

  const updateData = {};

  // Handle simple fields
  if (data.subject !== undefined) updateData.subject = data.subject;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.priority !== undefined) updateData.priority = data.priority;
  if (data.dueDate !== undefined) {
    updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
  }

  // Handle status change - set completedDate when marking complete
  if (data.status !== undefined) {
    updateData.status = data.status;
    if (data.status === 'COMPLETED' && existing.status !== 'COMPLETED') {
      updateData.completedDate = new Date();
    } else if (data.status !== 'COMPLETED' && existing.status === 'COMPLETED') {
      updateData.completedDate = null;
    }
  }

  // Handle assignee change
  if (data.assignedToId !== undefined) {
    if (data.assignedToId) {
      updateData.assignedTo = { connect: { id: data.assignedToId } };
    } else {
      updateData.assignedTo = { disconnect: true };
    }
  }

  const task = await prisma.task.update({
    where: { id },
    data: updateData,
    include: {
      assignedTo: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      opportunity: {
        select: { id: true, name: true, stage: true },
      },
      lead: {
        select: { id: true, firstName: true, lastName: true, status: true },
      },
    },
  });

  logger.info(`Task updated: ${task.id} - status: ${task.status}`);

  return task;
}

/**
 * Delete a task
 */
export async function deleteTask(id) {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    const error = new Error('Task not found');
    error.statusCode = 404;
    throw error;
  }

  await prisma.task.delete({ where: { id } });

  logger.info(`Task deleted: ${id}`);

  return { success: true };
}

/**
 * Mark task as completed
 */
export async function completeTask(id, userId) {
  return updateTask(id, { status: 'COMPLETED' }, userId);
}

/**
 * Get tasks for the current user's home page / dashboard
 */
export async function getMyTasks(userId, options = {}) {
  const { limit = 20, includeOverdue = true } = options;

  const where = {
    assignedToId: userId,
    status: { not: 'COMPLETED' },
  };

  // Get open tasks ordered by due date
  const tasks = await prisma.task.findMany({
    where,
    include: {
      opportunity: {
        select: { id: true, name: true },
      },
      lead: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: [
      { dueDate: 'asc' },
      { priority: 'desc' },
    ],
    take: limit,
  });

  // Categorize tasks
  const now = new Date();
  const overdue = [];
  const dueToday = [];
  const upcoming = [];
  const noDueDate = [];

  for (const task of tasks) {
    if (!task.dueDate) {
      noDueDate.push(task);
    } else {
      const dueDate = new Date(task.dueDate);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const taskDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());

      if (taskDate < today) {
        overdue.push(task);
      } else if (taskDate.getTime() === today.getTime()) {
        dueToday.push(task);
      } else {
        upcoming.push(task);
      }
    }
  }

  return {
    overdue,
    dueToday,
    upcoming,
    noDueDate,
    total: tasks.length,
  };
}

/**
 * Get tasks for an opportunity
 */
export async function getOpportunityTasks(opportunityId, options = {}) {
  const { showCompleted = false } = options;

  const where = {
    opportunityId,
  };

  if (!showCompleted) {
    where.status = { not: 'COMPLETED' };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignedTo: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: [
      { status: 'asc' },
      { dueDate: 'asc' },
      { priority: 'desc' },
    ],
  });

  return tasks;
}

/**
 * Get tasks for a lead
 */
export async function getLeadTasks(leadId, options = {}) {
  const { showCompleted = false } = options;

  const where = {
    leadId,
  };

  if (!showCompleted) {
    where.status = { not: 'COMPLETED' };
  }

  const tasks = await prisma.task.findMany({
    where,
    include: {
      assignedTo: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: [
      { status: 'asc' },
      { dueDate: 'asc' },
      { priority: 'desc' },
    ],
  });

  return tasks;
}

/**
 * Create a follow-up task
 */
export async function createFollowUpTask(sourceTaskId, data, userId) {
  // Get source task for context
  const sourceTask = await prisma.task.findUnique({
    where: { id: sourceTaskId },
    include: {
      opportunity: true,
      lead: true,
    },
  });

  if (!sourceTask) {
    const error = new Error('Source task not found');
    error.statusCode = 404;
    throw error;
  }

  // Create follow-up task with same opportunity/lead context
  const followUpData = {
    subject: data.subject || `Follow up: ${sourceTask.subject}`,
    description: data.description || `Follow up from task: ${sourceTask.subject}`,
    priority: data.priority || sourceTask.priority,
    dueDate: data.dueDate,
    assignedToId: data.assignedToId || sourceTask.assignedToId,
    opportunityId: sourceTask.opportunityId,
    leadId: sourceTask.leadId,
  };

  return createTask(followUpData, userId);
}

export default {
  listTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
  completeTask,
  getMyTasks,
  getOpportunityTasks,
  getLeadTasks,
  createFollowUpTask,
  TASK_SUBJECTS,
  TASK_SUBTYPES,
};
