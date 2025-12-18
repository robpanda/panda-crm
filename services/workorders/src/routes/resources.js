import { Router } from 'express';
import {
  listResources,
  getResource,
  createResource,
  updateResource,
  deleteResource,
  getResourceAvailability,
  createAbsence,
  deleteAbsence,
  getCrews,
} from '../controllers/resourceController.js';

const router = Router();

// List resources
router.get('/', listResources);
router.get('/crews', getCrews);

// CRUD
router.get('/:id', getResource);
router.post('/', createResource);
router.put('/:id', updateResource);
router.delete('/:id', deleteResource);

// Availability
router.get('/:id/availability', getResourceAvailability);

// Absences
router.post('/absences', createAbsence);
router.delete('/absences/:id', deleteAbsence);

export default router;
