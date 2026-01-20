import { Router } from 'express';
import {
  listMessages,
  getMessage,
  sendMessage,
  sendSms,
  sendEmail,
  replyToMessage,
  getMessagesByConversation,
  getMessageThread,
  retryMessage,
  deleteMessage,
} from '../controllers/messageController.js';

const router = Router();

// Send messages (unified endpoint)
router.post('/send', sendMessage);

// Channel-specific send endpoints
router.post('/send/sms', sendSms);
router.post('/send/email', sendEmail);

// By conversation
router.get('/conversation/:conversationId', getMessagesByConversation);

// Thread (for email)
router.get('/thread/:threadId', getMessageThread);

// CRUD
router.get('/', listMessages);
router.get('/:id', getMessage);
router.delete('/:id', deleteMessage);

// Actions
router.post('/:id/reply', replyToMessage);
router.post('/:id/retry', retryMessage);

export default router;
