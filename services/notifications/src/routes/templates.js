import { Router } from 'express';
import {
  listTemplates,
  getTemplate,
  updateTemplate,
} from '../controllers/templateController.js';

const router = Router();

// Template management (admin only in production)
router.get('/', listTemplates);
router.get('/:type', getTemplate);
router.put('/:type', updateTemplate);

export default router;
