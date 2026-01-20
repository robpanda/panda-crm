import { Router } from 'express';
import {
  listPolicies,
  getDefaultPolicy,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  findAvailableSlots,
  autoSchedule,
  checkAvailability,
  calculateDueDate,
} from '../controllers/schedulingPolicyController.js';

const router = Router();

// Policy CRUD
router.get('/', listPolicies);
router.get('/default', getDefaultPolicy);
router.get('/:id', getPolicy);
router.post('/', createPolicy);
router.put('/:id', updatePolicy);
router.delete('/:id', deletePolicy);

// Scheduling operations
router.post('/find-slots', findAvailableSlots);
router.post('/auto-schedule', autoSchedule);
router.post('/check-availability', checkAvailability);
router.post('/calculate-due-date', calculateDueDate);

export default router;
