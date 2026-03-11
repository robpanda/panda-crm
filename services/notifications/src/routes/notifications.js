import { Router } from 'express';
import {
  listNotifications,
  listOutboxNotifications,
  getNotification,
  createNotification,
  markAsRead,
  markAllAsRead,
  archiveNotification,
  deleteNotification,
  getUnreadCount,
  getNotificationsByOpportunity,
  bulkUpdateStatus,
} from '../controllers/notificationController.js';
import { notificationService } from '../services/notificationService.js';

const router = Router();

function extractMentionUserId(value) {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value.userId || value.id || null;
  }
  return null;
}

// ============================================================================
// APPOINTMENT NOTIFICATION ENDPOINTS
// Called by opportunities service when appointments are booked/rescheduled/cancelled
// ============================================================================

/**
 * POST /appointment
 * Receive appointment notification request from opportunities service
 * Body: { type: 'appointment-booked' | 'appointment-rescheduled' | 'appointment-cancelled', ...data }
 */
router.post('/appointment', async (req, res, next) => {
  try {
    const { type, inspectorId, appointment, opportunity, previousTimes, reason, options } = req.body;

    let result;
    switch (type) {
      case 'appointment-booked':
        result = await notificationService.notifyAppointmentBooked(
          inspectorId,
          appointment,
          opportunity,
          options
        );
        break;

      case 'appointment-rescheduled':
        result = await notificationService.notifyAppointmentRescheduled(
          inspectorId,
          appointment,
          opportunity,
          previousTimes,
          options
        );
        break;

      case 'appointment-cancelled':
        result = await notificationService.notifyAppointmentCancelled(
          inspectorId,
          appointment,
          opportunity,
          reason,
          options
        );
        break;

      default:
        return res.status(400).json({
          success: false,
          error: { message: `Unknown appointment notification type: ${type}` },
        });
    }

    res.json({
      success: true,
      notification: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /dispatch-appointment
 * Send dispatch notifications to assigned resources when appointment is dispatched
 * Called by workorders service when status changes to DISPATCHED
 * Body: { inspectorIds: string[], appointment: object, opportunity: object, options?: object }
 */
router.post('/dispatch-appointment', async (req, res, next) => {
  try {
    const { inspectorIds, appointment, opportunity, options } = req.body;

    if (!inspectorIds || !Array.isArray(inspectorIds) || inspectorIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { message: 'inspectorIds array is required' },
      });
    }

    if (!appointment || !opportunity) {
      return res.status(400).json({
        success: false,
        error: { message: 'appointment and opportunity are required' },
      });
    }

    // Send dispatch notifications to all assigned inspectors
    const notifications = await notificationService.notifyInspectorTeam(
      inspectorIds,
      'dispatched',
      {
        appointment,
        opportunity,
        options,
      }
    );

    console.log(`Dispatch notifications sent: ${notifications.length} of ${inspectorIds.length} succeeded`);

    res.json({
      success: true,
      notificationsSent: notifications.length,
      totalRecipients: inspectorIds.length,
      notifications,
    });
  } catch (error) {
    console.error('Failed to send dispatch notifications:', error);
    next(error);
  }
});

/**
 * POST /mentions/dispatch
 * Backward-compatible mention dispatch endpoint used by leads/opportunities comment flows.
 * Accepts flexible payloads and emits in-app + channel deliveries via NotificationService.
 */
router.post('/mentions/dispatch', async (req, res, next) => {
  try {
    const payload = req.body || {};
    const candidateRecipients = [
      ...(Array.isArray(payload.recipients) ? payload.recipients : []),
      ...(Array.isArray(payload.mentions) ? payload.mentions : []),
      ...(Array.isArray(payload.userIds) ? payload.userIds : []),
      ...(Array.isArray(payload.recipientIds) ? payload.recipientIds : []),
    ];

    const recipientIds = [...new Set(candidateRecipients.map(extractMentionUserId).filter(Boolean))];
    if (recipientIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'No recipients provided' },
      });
    }

    const mentionedBy = payload.mentionedBy
      || payload.actorName
      || payload.senderName
      || payload.authorName
      || 'Someone';

    const context = payload.context
      || payload.entityName
      || payload.leadName
      || payload.opportunityName
      || payload.recordName
      || 'a record';

    const excerpt = String(
      payload.excerpt
      || payload.snippet
      || payload.bodyPreview
      || payload.messagePreview
      || payload.content
      || ''
    ).slice(0, 240);

    const inferredActionUrl = payload.actionUrl
      || payload.actionPath
      || (payload.leadId ? `/leads/${payload.leadId}` : null)
      || (payload.opportunityId ? `/jobs/${payload.opportunityId}` : null)
      || '/';

    const inferredSourceId = payload.sourceId
      || payload.noteId
      || payload.commentId
      || payload.entityId
      || payload.leadId
      || payload.opportunityId
      || null;

    const relations = {
      opportunityId: payload.opportunityId || (payload.entityType === 'OPPORTUNITY' ? payload.entityId : undefined),
      accountId: payload.accountId,
      contactId: payload.contactId,
      leadId: payload.leadId || (payload.entityType === 'LEAD' ? payload.entityId : undefined),
      workOrderId: payload.workOrderId,
      caseId: payload.caseId,
    };

    const results = await Promise.allSettled(
      recipientIds.map((userId) => notificationService.createFromTemplate(
        'MENTION',
        userId,
        {
          mentionedBy,
          context,
          excerpt,
          actionUrl: inferredActionUrl,
          actionLabel: 'View Mention',
          sourceType: payload.sourceType || 'mention',
          sourceId: inferredSourceId,
        },
        relations
      ))
    );

    const dispatched = results.filter((result) => result.status === 'fulfilled' && result.value).length;
    const failed = results
      .map((result, index) => ({ result, userId: recipientIds[index] }))
      .filter(({ result }) => result.status === 'rejected')
      .map(({ result, userId }) => ({ userId, error: result.reason?.message || 'Dispatch failed' }));

    res.json({
      success: true,
      data: {
        attempted: recipientIds.length,
        dispatched,
        failed,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// INSPECTOR ENDPOINTS
// Used to find which inspectors should receive appointment notifications
// ============================================================================

/**
 * POST /inspectors/for-notification
 * Get list of inspector user IDs to notify for a work order/opportunity
 * Body: { workOrderId?, opportunityId?, territoryId? }
 */
router.post('/inspectors/for-notification', async (req, res, next) => {
  try {
    const inspectorIds = await notificationService.getInspectorsForNotification(req.body);
    res.json({
      success: true,
      inspectorIds,
    });
  } catch (error) {
    next(error);
  }
});

// ============================================================================
// STANDARD NOTIFICATION ENDPOINTS
// ============================================================================

// Counts
router.get('/unread-count', getUnreadCount);
router.get('/outbox', listOutboxNotifications);

// By opportunity (for Opportunity Hub)
router.get('/opportunity/:opportunityId', getNotificationsByOpportunity);

// Bulk operations
router.post('/bulk-status', bulkUpdateStatus);
router.post('/mark-all-read', markAllAsRead);

// CRUD operations
router.get('/', listNotifications);
router.get('/:id', getNotification);
router.post('/', createNotification);

// Actions
router.post('/:id/read', markAsRead);
router.post('/:id/archive', archiveNotification);
router.delete('/:id', deleteNotification);

export default router;
