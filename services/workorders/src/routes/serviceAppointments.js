import { Router } from 'express';
import {
  listAppointments,
  getAppointment,
  createAppointment,
  updateAppointment,
  deleteAppointment,
  assignResource,
  removeResource,
  getTodaySchedule,
  getAppointmentStats,
  getMySchedule,
  getMyAppointments,
  checkInAppointment,
  completeAppointment,
} from '../controllers/serviceAppointmentController.js';

const router = Router();

// List and stats
router.get('/', listAppointments);
router.get('/stats', getAppointmentStats);
router.get('/today', getTodaySchedule);

// Mobile app endpoints - Sales Rep schedule
router.get('/my-schedule', getMySchedule);
router.get('/mine', getMyAppointments);

// Mobile app endpoints - Check-in/Complete
router.post('/:id/check-in', checkInAppointment);
router.post('/:id/complete', completeAppointment);

// CRUD
router.get('/:id', getAppointment);
router.post('/', createAppointment);
router.put('/:id', updateAppointment);
router.delete('/:id', deleteAppointment);

// Resource assignments
router.post('/:id/resources', assignResource);
router.delete('/:id/resources/:resourceId', removeResource);

// Alias for frontend compatibility - /assign routes
router.post('/:id/assign', assignResource);
router.delete('/:id/assign/:resourceId', removeResource);

export default router;
