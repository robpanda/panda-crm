import { logger } from './logger.js';

export function errorHandler(err, req, res, next) {
  logger.error('Payment Error:', {
    message: err.message,
    stack: err.stack,
    type: err.type,
    code: err.code
  });

  // Stripe errors
  if (err.type === 'StripeCardError') {
    return res.status(400).json({
      success: false,
      error: { code: 'CARD_ERROR', message: err.message },
    });
  }

  if (err.type === 'StripeInvalidRequestError') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_REQUEST', message: err.message },
    });
  }

  if (err.type === 'StripeAPIError') {
    return res.status(502).json({
      success: false,
      error: { code: 'STRIPE_API_ERROR', message: 'Payment service temporarily unavailable' },
    });
  }

  if (err.type === 'StripeAuthenticationError') {
    return res.status(500).json({
      success: false,
      error: { code: 'CONFIG_ERROR', message: 'Payment configuration error' },
    });
  }

  // Generic errors
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
    },
  });
}

export default errorHandler;
