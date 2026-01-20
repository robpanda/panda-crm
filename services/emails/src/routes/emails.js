import { Router } from 'express';
import {
  listEmails,
  getEmail,
  createEmail,
  updateEmail,
  deleteEmail,
  sendEmail,
  getEmailsByContact,
  getEmailsByOpportunity,
  getEmailThread,
  replyToEmail,
  forwardEmail,
  getEmailStats,
  handleEmailWebhook,
} from '../controllers/emailController.js';

const router = Router();

// Statistics (before :id to avoid conflicts)
router.get('/stats', getEmailStats);

// Webhooks (for email provider callbacks)
router.post('/webhook', handleEmailWebhook);

// By contact
router.get('/contact/:contactId', getEmailsByContact);

// By opportunity
router.get('/opportunity/:opportunityId', getEmailsByOpportunity);

// Thread
router.get('/thread/:threadId', getEmailThread);

// CRUD operations
router.get('/', listEmails);
router.get('/:id', getEmail);
router.post('/', createEmail);
router.put('/:id', updateEmail);
router.delete('/:id', deleteEmail);

// Actions
router.post('/:id/send', sendEmail);
router.post('/:id/reply', replyToEmail);
router.post('/:id/forward', forwardEmail);

export default router;
