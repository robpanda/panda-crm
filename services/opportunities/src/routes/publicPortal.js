import { Router } from 'express';
import { opportunityService } from '../services/opportunityService.js';

const router = Router();

function handlePortalError(error, res, next) {
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: error.message, details: error.details || [] },
    });
  }

  if (error.name === 'NotFoundError') {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: error.message || 'Invalid portal link' },
    });
  }

  return next(error);
}

router.get('/job/:jobId', async (req, res, next) => {
  try {
    const data = await opportunityService.getCustomerPortalProject(req.params.jobId);
    res.json({ success: true, data });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token', async (req, res, next) => {
  try {
    const data = await opportunityService.getCustomerPortalProject(req.params.token);
    res.json({ success: true, data });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token/stages', async (req, res, next) => {
  try {
    const data = await opportunityService.getCustomerPortalStages(req.params.token);
    res.json({ success: true, data });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token/galleries', async (req, res, next) => {
  try {
    const data = await opportunityService.getCustomerPortalGalleries(req.params.token);
    res.json({ success: true, data });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.post('/:token/message', async (req, res, next) => {
  try {
    const data = await opportunityService.sendCustomerPortalMessage(req.params.token, req.body || {});
    res.json({ success: true, data });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token/appointments', async (req, res, next) => {
  try {
    const data = await opportunityService.getCustomerPortalAppointments(req.params.token);
    res.json({ success: true, data });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token/payments', async (req, res, next) => {
  try {
    const data = await opportunityService.getCustomerPortalPayments(req.params.token);
    res.json({ success: true, data });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token/payment-link', async (req, res, next) => {
  try {
    const data = await opportunityService.getCustomerPortalPaymentLink(req.params.token);
    res.json({ success: true, data });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token/available-slots', async (req, res, next) => {
  try {
    await opportunityService.resolveOpportunityByPortalToken(req.params.token);
    res.json({ success: true, data: { slots: [] } });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.post('/:token/book', async (req, res, next) => {
  try {
    await opportunityService.resolveOpportunityByPortalToken(req.params.token);
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Self-service booking is currently unavailable. Please contact your project manager.',
      },
    });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.post('/:token/appointments/:appointmentId/reschedule', async (req, res, next) => {
  try {
    await opportunityService.resolveOpportunityByPortalToken(req.params.token);
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Self-service rescheduling is currently unavailable. Please contact your project manager.',
      },
    });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.post('/:token/appointments/:appointmentId/cancel', async (req, res, next) => {
  try {
    await opportunityService.resolveOpportunityByPortalToken(req.params.token);
    res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Self-service cancellation is currently unavailable. Please contact your project manager.',
      },
    });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

export default router;
