import { Router } from 'express';
import {
  listNotifications,
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
