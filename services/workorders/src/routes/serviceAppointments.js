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
} from '../controllers/serviceAppointmentController.js';

const router = Router();

// List and stats
router.get('/', listAppointments);
router.get('/stats', getAppointmentStats);
router.get('/today', getTodaySchedule);

// CRUD
router.get('/:id', getAppointment);
router.post('/', createAppointment);
router.put('/:id', updateAppointment);
router.delete('/:id', deleteAppointment);

// Resource assignments
router.post('/:id/resources', assignResource);
router.delete('/:id/resources/:resourceId', removeResource);

export default router;
