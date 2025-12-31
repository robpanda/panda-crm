import { Router } from 'express';
import {
  getSettings,
  updateSettings,
  getChannelStatus,
  getMessageStats,
  testSmsConnection,
  testEmailConnection,
} from '../controllers/settingsController.js';

const router = Router();

// Get all Bamboogli settings
router.get('/', getSettings);

// Update settings
router.put('/', updateSettings);

// Get channel connection status (Twilio, SendGrid)
router.get('/channel-status', getChannelStatus);

// Get message statistics
router.get('/stats', getMessageStats);

// Test SMS connection
router.post('/test-sms', testSmsConnection);

// Test Email connection
router.post('/test-email', testEmailConnection);

export default router;
