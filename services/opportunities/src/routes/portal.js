import { Router } from 'express';
import { opportunityService } from '../services/opportunityService.js';

const router = Router();

function handlePortalError(error, res, next) {
  if (error?.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.message || 'Validation failed',
      },
    });
  }

  if (error?.name === 'NotFoundError') {
    return res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: error.message || 'Portal resource not found',
      },
    });
  }

  return next(error);
}

router.get('/job/:jobId', async (req, res, next) => {
  try {
    const result = await opportunityService.getPortalProjectByJobId(req.params.jobId);
    res.json({ success: true, data: result });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token', async (req, res, next) => {
  try {
    const result = await opportunityService.getPortalProject(req.params.token);
    res.json({ success: true, data: result });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token/stages', async (req, res, next) => {
  try {
    const result = await opportunityService.getPortalStages(req.params.token);
    res.json({ success: true, data: result });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token/galleries', async (req, res, next) => {
  try {
    const result = await opportunityService.getPortalGalleries(req.params.token);
    res.json({ success: true, data: result });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.post('/:token/message', async (req, res, next) => {
  try {
    const result = await opportunityService.addPortalMessage(req.params.token, req.body || {});
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token/appointments', async (req, res, next) => {
  try {
    const result = await opportunityService.getPortalAppointments(req.params.token);
    res.json({ success: true, data: result });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token/available-slots', async (req, res, next) => {
  try {
    const result = await opportunityService.getPortalAvailableSlots(req.params.token, req.query || {});
    res.json({ success: true, data: result });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.post('/:token/book', async (req, res, next) => {
  try {
    const result = await opportunityService.bookPortalAppointment(req.params.token, req.body || {});
    res.json({ success: true, data: result });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.post('/:token/appointments/:appointmentId/reschedule', async (req, res, next) => {
  try {
    const result = await opportunityService.reschedulePortalAppointment(
      req.params.token,
      req.params.appointmentId,
      req.body || {}
    );
    res.json({ success: true, data: result });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.post('/:token/appointments/:appointmentId/cancel', async (req, res, next) => {
  try {
    const result = await opportunityService.cancelPortalAppointment(
      req.params.token,
      req.params.appointmentId,
      req.body || {}
    );
    res.json({ success: true, data: result });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token/payment-link', async (req, res, next) => {
  try {
    const result = await opportunityService.getPortalPaymentLink(req.params.token);
    res.json({ success: true, data: result });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

router.get('/:token/payments', async (req, res, next) => {
  try {
    const result = await opportunityService.getPortalPayments(req.params.token);
    res.json({ success: true, data: result });
  } catch (error) {
    handlePortalError(error, res, next);
  }
});

export default router;
