import { Router } from 'express';
import {
  handleTwilioIncoming,
  handleTwilioStatus,
  handleSendGridWebhook,
  handleSesWebhook,
  handleSendGridInbound,
} from '../controllers/webhookController.js';

const router = Router();

// Twilio SMS webhooks
router.post('/twilio/incoming', handleTwilioIncoming);
router.post('/twilio/status', handleTwilioStatus);

// Email provider webhooks
router.post('/sendgrid', handleSendGridWebhook);
router.post('/sendgrid/inbound', handleSendGridInbound); // Inbound Parse for email replies
router.post('/ses', handleSesWebhook);

export default router;
