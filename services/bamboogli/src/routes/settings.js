import { Router } from 'express';
import {
  getSettings,
  updateSettings,
  getChannelStatus,
  getMessageStats,
  testSmsConnection,
  testEmailConnection,
  getPhoneNumbers,
  getPhoneNumber,
  updatePhoneNumber,
  addPhoneNumber,
  deletePhoneNumber,
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

// ===== Phone Number Management Routes =====

// Get all connected phone numbers
router.get('/phone-numbers', getPhoneNumbers);

// Get a single phone number by ID
router.get('/phone-numbers/:id', getPhoneNumber);

// Add a new phone number
router.post('/phone-numbers', addPhoneNumber);

// Update phone number settings
router.put('/phone-numbers/:id', updatePhoneNumber);

// Delete a phone number
router.delete('/phone-numbers/:id', deletePhoneNumber);

export default router;
