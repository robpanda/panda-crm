// Field Service Routes - Placeholder endpoints for CRM frontend
// These provide stub responses until full implementation
import { Router } from 'express';
import { logger } from '../middleware/logger.js';

const router = Router();

// Helper for stub responses
const stubList = (entityName) => (req, res) => {
  logger.info(`Field Service ${entityName} list requested (stub)`);
  res.json({
    success: true,
    data: [],
    pagination: {
      page: 1,
      limit: parseInt(req.query.limit) || 20,
      total: 0,
      totalPages: 0,
    },
  });
};

const stubGet = (entityName) => (req, res) => {
  logger.info(`Field Service ${entityName} get requested (stub): ${req.params.id}`);
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `${entityName} not found` },
  });
};

const stubCreate = (entityName) => (req, res) => {
  logger.info(`Field Service ${entityName} create requested (stub)`);
  res.status(501).json({
    success: false,
    error: { code: 'NOT_IMPLEMENTED', message: `${entityName} creation not yet implemented` },
  });
};

const stubUpdate = (entityName) => (req, res) => {
  logger.info(`Field Service ${entityName} update requested (stub): ${req.params.id}`);
  res.status(501).json({
    success: false,
    error: { code: 'NOT_IMPLEMENTED', message: `${entityName} update not yet implemented` },
  });
};

// ==========================================
// Territories
// ==========================================
router.get('/territories', stubList('Territory'));
router.get('/territories/:id', stubGet('Territory'));
router.post('/territories', stubCreate('Territory'));
router.put('/territories/:id', stubUpdate('Territory'));
router.delete('/territories/:id', (req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Territory deletion not yet implemented' } });
});

// ==========================================
// Operating Hours
// ==========================================
router.get('/operating-hours', stubList('Operating Hours'));
router.get('/operating-hours/:id', stubGet('Operating Hours'));
router.post('/operating-hours', stubCreate('Operating Hours'));
router.put('/operating-hours/:id', stubUpdate('Operating Hours'));

// ==========================================
// Work Types
// ==========================================
router.get('/work-types', stubList('Work Type'));
router.get('/work-types/:id', stubGet('Work Type'));
router.post('/work-types', stubCreate('Work Type'));
router.put('/work-types/:id', stubUpdate('Work Type'));

// ==========================================
// Service Resources (Crews/Technicians)
// ==========================================
router.get('/resources', stubList('Service Resource'));
router.get('/resources/:id', stubGet('Service Resource'));
router.post('/resources', stubCreate('Service Resource'));
router.put('/resources/:id', stubUpdate('Service Resource'));
router.get('/resources/:resourceId/territories', (req, res) => {
  res.json({ success: true, data: [] });
});
router.post('/resources/:resourceId/territories', stubCreate('Territory Membership'));
router.delete('/resources/:resourceId/territories/:membershipId', (req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Territory membership deletion not yet implemented' } });
});
router.get('/resources/:resourceId/skills', (req, res) => {
  res.json({ success: true, data: [] });
});
router.post('/resources/:resourceId/skills', stubCreate('Resource Skill'));

// ==========================================
// Scheduling Policies
// ==========================================
router.get('/scheduling-policies', stubList('Scheduling Policy'));
router.get('/scheduling-policies/:id', stubGet('Scheduling Policy'));
router.post('/scheduling-policies', stubCreate('Scheduling Policy'));
router.put('/scheduling-policies/:id', stubUpdate('Scheduling Policy'));
router.get('/scheduling-policies/:policyId/work-rules', (req, res) => {
  res.json({ success: true, data: [] });
});

// ==========================================
// Work Rules
// ==========================================
router.get('/work-rules', stubList('Work Rule'));
router.get('/work-rules/:id', stubGet('Work Rule'));

// ==========================================
// Service Objectives
// ==========================================
router.get('/objectives', stubList('Service Objective'));
router.get('/objectives/:id', stubGet('Service Objective'));

// ==========================================
// Skills
// ==========================================
router.get('/skills', stubList('Skill'));
router.get('/skills/:id', stubGet('Skill'));
router.post('/skills', stubCreate('Skill'));
router.put('/skills/:id', stubUpdate('Skill'));

// ==========================================
// Service Appointments
// ==========================================
router.get('/appointments', stubList('Service Appointment'));
router.get('/appointments/:id', stubGet('Service Appointment'));
router.put('/appointments/:id', stubUpdate('Service Appointment'));
router.post('/appointments/:id/schedule', (req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Appointment scheduling not yet implemented' } });
});
router.post('/appointments/:id/dispatch', (req, res) => {
  res.status(501).json({ success: false, error: { code: 'NOT_IMPLEMENTED', message: 'Appointment dispatching not yet implemented' } });
});

// ==========================================
// Sync
// ==========================================
router.post('/sync', (req, res) => {
  logger.info('Field Service sync requested (stub)');
  res.json({
    success: true,
    message: 'Sync not yet implemented. Data is managed in Salesforce.',
    syncedAt: null,
  });
});

router.get('/sync/status', (req, res) => {
  res.json({
    success: true,
    data: {
      lastSyncAt: null,
      status: 'NOT_CONFIGURED',
      message: 'Field Service sync is not yet implemented',
    },
  });
});

export default router;
