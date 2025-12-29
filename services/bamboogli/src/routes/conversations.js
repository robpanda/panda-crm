import { Router } from 'express';
import {
  listConversations,
  getConversation,
  getConversationByIdentifier,
  getConversationsByContact,
  getConversationsByOpportunity,
  updateConversation,
  assignConversation,
  closeConversation,
  archiveConversation,
  markAsRead,
  getAttentionQueue,
  getConversationStats,
} from '../controllers/conversationController.js';

const router = Router();

// Stats & Attention Queue
router.get('/stats', getConversationStats);
router.get('/attention-queue', getAttentionQueue);

// By related records
router.get('/contact/:contactId', getConversationsByContact);
router.get('/opportunity/:opportunityId', getConversationsByOpportunity);

// By identifier (phone or email)
router.get('/identifier/:identifier', getConversationByIdentifier);

// CRUD
router.get('/', listConversations);
router.get('/:id', getConversation);
router.put('/:id', updateConversation);

// Actions
router.post('/:id/assign', assignConversation);
router.post('/:id/close', closeConversation);
router.post('/:id/archive', archiveConversation);
router.post('/:id/read', markAsRead);

export default router;
