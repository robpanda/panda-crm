// Opportunities Microservice Entry Point
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import opportunityRoutes from './routes/opportunities.js';
import { opportunityService } from './services/opportunityService.js';

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://crm.pandaadmin.com',
    'https://crm.pandaexteriors.com'
  ],
  credentials: true,
}));
app.use(express.json());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'opportunities', timestamp: new Date().toISOString(), buildSha: process.env.BUILD_SHA || process.env.GITHUB_SHA || 'unknown', buildTime: process.env.BUILD_TIME || process.env.GITHUB_RUN_ID || null });
});

const sendPublicPortalResponse = (handler) => async (req, res) => {
  try {
    const data = await handler(req, res);
    res.json({ success: true, data });
  } catch (error) {
    logger.error(`Public portal route failed: ${error.message}`);

    if (error.name === 'NotFoundError') {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: error.message },
      });
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: error.message },
      });
    }

    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  }
};

const publicPortalBases = ['/api/portal', '/api/opportunities/portal'];

for (const basePath of publicPortalBases) {
  app.get(
    `${basePath}/job/:jobId`,
    sendPublicPortalResponse((req) => opportunityService.getCustomerPortalProject(req.params.jobId))
  );

  app.get(
    `${basePath}/:token`,
    sendPublicPortalResponse((req) => opportunityService.getCustomerPortalProject(req.params.token))
  );

  app.get(
    `${basePath}/:token/stages`,
    sendPublicPortalResponse((req) => opportunityService.getCustomerPortalStages(req.params.token))
  );

  app.get(
    `${basePath}/:token/galleries`,
    sendPublicPortalResponse((req) => opportunityService.getCustomerPortalGalleries(req.params.token))
  );

  app.get(
    `${basePath}/:token/appointments`,
    sendPublicPortalResponse((req) => opportunityService.getCustomerPortalAppointments(req.params.token))
  );

  app.get(
    `${basePath}/:token/payment-link`,
    sendPublicPortalResponse((req) => opportunityService.getCustomerPortalPaymentLink(req.params.token))
  );

  app.get(
    `${basePath}/:token/payments`,
    sendPublicPortalResponse((req) => opportunityService.getCustomerPortalPayments(req.params.token))
  );

  app.post(
    `${basePath}/:token/message`,
    sendPublicPortalResponse((req) => opportunityService.sendCustomerPortalMessage(req.params.token, req.body))
  );
}

// Apply auth middleware to all routes below
app.use(authMiddleware);

// Routes - /api/opportunities/* to match ALB path-based routing
app.use('/api/opportunities', opportunityRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Opportunities service running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

export default app;
