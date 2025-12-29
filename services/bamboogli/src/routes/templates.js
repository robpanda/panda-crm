import { Router } from 'express';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplate,
} from '../controllers/templateController.js';

const router = Router();

// Template CRUD
router.get('/', listTemplates);
router.get('/:id', getTemplate);
router.post('/', createTemplate);
router.put('/:id', updateTemplate);
router.delete('/:id', deleteTemplate);

// Preview template with data
router.post('/:id/preview', previewTemplate);

export default router;
