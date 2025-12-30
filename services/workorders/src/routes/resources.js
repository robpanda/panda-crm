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
  listTerritories,
  listSkills,
  listSchedulingPolicies,
} from '../controllers/resourceController.js';

const router = Router();

// List resources
router.get('/', listResources);
router.get('/crews', getCrews);

// Territories, Skills, and Scheduling Policies for filters
router.get('/territories', listTerritories);
router.get('/skills', listSkills);
router.get('/scheduling-policies', listSchedulingPolicies);

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
