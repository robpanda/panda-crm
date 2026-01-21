import { Router } from 'express';
import {
  listAutomations,
  getAutomation,
  updateAutomation,
  testAutomation,
  triggerAppointmentAutomation,
  getAutomationHistory,
  triggerDocumentSigningAutomation,
  sendDocumentSigningLinkSms,
} from '../controllers/automationController.js';

const router = Router();

// ============================================
// AUTOMATION CONFIGURATION ENDPOINTS
// ============================================

// List all automation configurations
// GET /api/automations
router.get('/', listAutomations);

// Get single automation configuration
// GET /api/automations/:type (e.g., appointment_confirmation)
router.get('/:type', getAutomation);

// Update automation configuration
// PUT /api/automations/:type
router.put('/:type', updateAutomation);

// ============================================
// AUTOMATION TESTING
// ============================================

// Send test message for an automation
// POST /api/automations/:type/test
router.post('/:type/test', testAutomation);

// ============================================
// AUTOMATION TRIGGERING
// ============================================

// Trigger an automation for an appointment/opportunity
// POST /api/automations/trigger
// Body: { automationType, appointmentId?, resourceId?, opportunityId? }
router.post('/trigger', triggerAppointmentAutomation);

// ============================================
// DOCUMENT SIGNING AUTOMATIONS
// ============================================

// Trigger document signing automation
// POST /api/automations/document/trigger
// Body: { automationType, agreementId, opportunityId? }
router.post('/document/trigger', triggerDocumentSigningAutomation);

// Send signing link via SMS (quick action)
// POST /api/automations/document/send-sms
// Body: { agreementId, phoneNumber }
router.post('/document/send-sms', sendDocumentSigningLinkSms);

// ============================================
// AUTOMATION HISTORY
// ============================================

// Get automation execution history
// GET /api/automations/history?type=appointment_confirmation&limit=50&offset=0
router.get('/history', getAutomationHistory);

// Get history for specific automation type
router.get('/:type/history', getAutomationHistory);

export default router;
