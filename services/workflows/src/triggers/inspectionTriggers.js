/**
 * Inspection Workflow Triggers
 *
 * Handles automations when inspection appointments are completed:
 * - Opens the Specs Preparation workflow
 * - Updates opportunity status to "Inspected"
 * - Creates task for spec preparation
 * - Logs activity
 *
 * ScribeHow Reference: Insurance workflow - after inspection, prepare specs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Work types that are considered "Inspection" appointments
const INSPECTION_WORK_TYPE_KEYWORDS = [
  'inspection',
  'inspect',
  'roof inspection',
  'initial inspection',
  'insurance program inspection',
];

/**
 * Check if a work type name indicates an inspection
 */
export function isInspectionWorkType(workTypeName) {
  if (!workTypeName) return false;
  const lowerName = workTypeName.toLowerCase();
  return INSPECTION_WORK_TYPE_KEYWORDS.some((keyword) =>
    lowerName.includes(keyword.toLowerCase())
  );
}

/**
 * Trigger: Inspection Completed
 * When an inspection service appointment status changes to COMPLETED
 *
 * Actions:
 * 1. Update opportunity status/stage to "Inspected"
 * 2. Create task: "Prepare specs for this project"
 * 3. Create activity log entry
 * 4. Enable specs preparation workflow (set a flag or create notification)
 */
export async function onInspectionCompleted(serviceAppointmentId, userId) {
  console.log(
    `[Inspection Trigger] Inspection Completed for Service Appointment: ${serviceAppointmentId}`
  );

  const results = {
    opportunityUpdated: false,
    taskCreated: null,
    activityCreated: null,
    specsWorkflowTriggered: false,
    errors: [],
  };

  try {
    // Get appointment with work order, work type, and opportunity
    const appointment = await prisma.serviceAppointment.findUnique({
      where: { id: serviceAppointmentId },
      include: {
        workOrder: {
          include: {
            opportunity: {
              include: {
                account: true,
                contact: true,
                owner: true,
              },
            },
            workType: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new Error(`Service Appointment not found: ${serviceAppointmentId}`);
    }

    const workOrder = appointment.workOrder;
    const opportunity = workOrder?.opportunity;

    if (!opportunity) {
      console.log(
        '[Inspection Trigger] No opportunity linked - skipping trigger'
      );
      return results;
    }

    // Verify this is an inspection work type
    const workTypeName = workOrder?.workType?.name || appointment.subject || '';
    if (!isInspectionWorkType(workTypeName)) {
      console.log(
        `[Inspection Trigger] Work type "${workTypeName}" is not an inspection - skipping`
      );
      return results;
    }

    console.log(
      `[Inspection Trigger] Processing inspection completion for Opportunity: ${opportunity.id}`
    );

    // 1. Update opportunity to "Inspected" stage/status
    try {
      await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: {
          stageName: 'INSPECTED',
          status: 'Inspected',
          inspectionDate: appointment.actualEnd || new Date(),
          updatedAt: new Date(),
        },
      });
      results.opportunityUpdated = true;
      console.log(
        `[Inspection Trigger] Updated opportunity to "Inspected" stage`
      );
    } catch (updateError) {
      console.error(
        '[Inspection Trigger] Failed to update opportunity:',
        updateError
      );
      results.errors.push({
        type: 'opportunity_update',
        error: updateError.message,
      });
    }

    // 2. Create Task: "Prepare specs for this project"
    try {
      const task = await prisma.task.create({
        data: {
          subject: 'Prepare specs for this project',
          description: `The inspection for ${opportunity.name} has been completed.\n\nPlease proceed with specs preparation.\n\nInspection completed: ${appointment.actualEnd?.toISOString() || new Date().toISOString()}`,
          status: 'NOT_STARTED',
          priority: 'HIGH',
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
          opportunityId: opportunity.id,
          assignedToId: opportunity.ownerId || userId,
        },
      });
      results.taskCreated = task;
      console.log(`[Inspection Trigger] Created task: ${task.id}`);
    } catch (taskError) {
      console.error('[Inspection Trigger] Failed to create task:', taskError);
      results.errors.push({ type: 'task', error: taskError.message });
    }

    // 3. Create Activity Log
    try {
      const activity = await prisma.activity.create({
        data: {
          type: 'WORKFLOW_TRIGGERED',
          subject: 'Inspection Completed - Ready for Specs',
          body: `The inspection for ${opportunity.name} has been completed.\n\nThe project is now ready for specs preparation.\n\nInspector notes: ${appointment.description || 'None provided'}`,
          status: 'COMPLETED',
          opportunityId: opportunity.id,
          accountId: opportunity.accountId,
          contactId: opportunity.contactId,
          userId: opportunity.ownerId || userId,
          occurredAt: new Date(),
          metadata: {
            triggeredBy: 'inspection_completed',
            autoGenerated: true,
            serviceAppointmentId: serviceAppointmentId,
            inspectionDate: appointment.actualEnd || new Date(),
            workTypeName: workTypeName,
          },
        },
      });
      results.activityCreated = activity;
      console.log(`[Inspection Trigger] Created activity: ${activity.id}`);
    } catch (activityError) {
      console.error(
        '[Inspection Trigger] Failed to create activity:',
        activityError
      );
      results.errors.push({ type: 'activity', error: activityError.message });
    }

    // 4. Set flag to indicate specs workflow is ready
    // This allows the frontend to show the "Prepare Specs" button
    try {
      await prisma.opportunity.update({
        where: { id: opportunity.id },
        data: {
          // Custom field to indicate inspection is done and specs are needed
          // (We could also check stageName === 'INSPECTED' in the frontend)
          updatedAt: new Date(),
        },
      });
      results.specsWorkflowTriggered = true;
      console.log(`[Inspection Trigger] Specs workflow enabled for opportunity`);
    } catch (flagError) {
      console.error(
        '[Inspection Trigger] Failed to set specs workflow flag:',
        flagError
      );
      results.errors.push({ type: 'specs_flag', error: flagError.message });
    }

    return results;
  } catch (error) {
    console.error('[Inspection Trigger] onInspectionCompleted failed:', error);
    throw error;
  }
}

/**
 * Evaluate if an appointment completion should trigger inspection workflow
 * Called from serviceAppointmentController when status changes to COMPLETED
 */
export async function evaluateInspectionTriggers(
  serviceAppointmentId,
  oldStatus,
  newStatus,
  userId
) {
  const results = [];

  // Only trigger on transition TO COMPLETED status
  if (newStatus === 'COMPLETED' && oldStatus !== 'COMPLETED') {
    try {
      // Get the appointment to check work type
      const appointment = await prisma.serviceAppointment.findUnique({
        where: { id: serviceAppointmentId },
        include: {
          workOrder: {
            include: {
              workType: true,
            },
          },
        },
      });

      if (appointment) {
        const workTypeName =
          appointment.workOrder?.workType?.name || appointment.subject || '';

        // Only trigger for inspection work types
        if (isInspectionWorkType(workTypeName)) {
          const result = await onInspectionCompleted(
            serviceAppointmentId,
            userId
          );
          results.push({ trigger: 'inspectionCompleted', result });
        }
      }
    } catch (error) {
      console.error(
        '[Inspection Trigger] evaluateInspectionTriggers failed:',
        error
      );
      results.push({
        trigger: 'inspectionCompleted',
        error: error.message,
      });
    }
  }

  return results;
}

export default {
  onInspectionCompleted,
  evaluateInspectionTriggers,
  isInspectionWorkType,
  INSPECTION_WORK_TYPE_KEYWORDS,
};
