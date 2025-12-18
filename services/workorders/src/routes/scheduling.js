import { Router } from 'express';
import {
  autoScheduleAppointment,
  findAvailableSlots,
  getDispatchBoard,
  optimizeSchedule,
} from '../controllers/schedulingController.js';

const router = Router();

// Auto-schedule (replicates SelfGenAutoScheduler)
router.post('/auto-schedule', autoScheduleAppointment);

// Find available slots
router.post('/available-slots', findAvailableSlots);

// Dispatch board
router.get('/dispatch-board', getDispatchBoard);

// Optimize
router.post('/optimize', optimizeSchedule);

export default router;
