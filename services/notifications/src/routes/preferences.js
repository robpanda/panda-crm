import { Router } from 'express';
import {
  getPreferences,
  updatePreferences,
  resetPreferences,
} from '../controllers/preferenceController.js';

const router = Router();

// User preferences (uses userId from request or auth)
router.get('/', getPreferences);
router.get('/:userId', getPreferences);
router.put('/', updatePreferences);
router.put('/:userId', updatePreferences);
router.post('/reset', resetPreferences);
router.post('/:userId/reset', resetPreferences);

export default router;
