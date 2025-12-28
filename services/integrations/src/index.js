// Integrations Service - Entry Point
// Handles CompanyCam, Google Calendar, Five9, EagleView/GAF, Scheduling, and Mobile integrations
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import integrationRoutes from './routes/integrations.js';
import five9Routes from './routes/five9.js';
import measurementRoutes from './routes/measurements.js';
import schedulingRoutes from './routes/scheduling.js';
import mobileRoutes from './routes/mobile.js';
import fieldServiceRoutes from './routes/fieldService.js';
import { logger } from './middleware/logger.js';

dotenv.config();

const app = express();
const PORT = process.env.INTEGRATIONS_PORT || 3010;

// Error handler
function errorHandler(err, req, res, next) {
  logger.error('Integration Error:', { message: err.message, stack: err.stack });

  if (err.name === 'IntegrationError') {
    return res.status(400).json({
      success: false,
      error: { code: 'INTEGRATION_ERROR', message: err.message },
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message,
    },
  });
}

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://crm.pandaadmin.com',
    'https://crm.pandaexteriors.com'
  ],
  credentials: true,
}));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'integrations',
    timestamp: new Date().toISOString(),
    features: [
      'companycam',
      'google-calendar',
      'five9',
      'eagleview',
      'gaf-quickmeasure',
      'hover-3d',
      'scheduling',
      'mobile',
      'field-service',
    ],
  });
});

// Routes - /api/integrations/* to match ALB path-based routing
app.use('/api/integrations', integrationRoutes);

// Phase 4 Integration Routes
app.use('/api/integrations/five9', five9Routes);
app.use('/api/integrations/measurements', measurementRoutes);
app.use('/api/integrations/scheduling', schedulingRoutes);
app.use('/api/integrations/mobile', mobileRoutes);

// Field Service Routes (stub endpoints)
app.use('/api/field-service', fieldServiceRoutes);

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
  logger.info(`Integrations service running on port ${PORT}`);
});

export default app;
