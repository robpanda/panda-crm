// Integrations Service - Entry Point
// Handles CompanyCam, Google Calendar, RingCentral, EagleView/GAF, ABC Supply, Scheduling, and Mobile integrations
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import integrationRoutes from './routes/integrations.js';
import ringCentralRoutes from './routes/ringcentral.js';
import measurementRoutes from './routes/measurements.js';
import abcSupplyRoutes from './routes/abcSupply.js';
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

  // Provide meaningful error messages for common integration failures
  let userMessage = 'An error occurred';
  let errorCode = err.code || 'INTERNAL_ERROR';

  if (err.message?.includes('credentials not configured')) {
    userMessage = 'Integration not configured. Please contact support.';
    errorCode = 'INTEGRATION_NOT_CONFIGURED';
  } else if (err.message?.includes('authentication failed')) {
    userMessage = 'Integration authentication failed. Please contact support.';
    errorCode = 'INTEGRATION_AUTH_FAILED';
  } else if (err.message?.includes('API error')) {
    userMessage = 'External service error. Please try again later.';
    errorCode = 'EXTERNAL_API_ERROR';
  } else if (err.message?.includes('not found')) {
    userMessage = err.message;
    errorCode = 'NOT_FOUND';
  } else if (err.message?.includes('PrismaClient')) {
    userMessage = 'Database connection error. Please try again.';
    errorCode = 'DATABASE_ERROR';
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message: userMessage,
      // Include details in non-production for debugging
      ...(process.env.NODE_ENV !== 'production' && { details: err.message }),
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
      'ringcentral',
      'eagleview',
      'gaf-quickmeasure',
      'abc-supply',
      'hover-3d',
      'scheduling',
      'mobile',
      'field-service',
    ],
  });
});

// Diagnostic endpoint to check integration configuration
app.get('/api/integrations/diagnostics', (req, res) => {
  // Check if key environment variables are set (without revealing values)
  const checkEnv = (name) => process.env[name] ? 'configured' : 'missing';

  res.json({
    success: true,
    data: {
      eagleView: {
        clientId: checkEnv('EAGLEVIEW_CLIENT_ID'),
        clientSecret: checkEnv('EAGLEVIEW_CLIENT_SECRET'),
        apiUrl: checkEnv('EAGLEVIEW_API_URL'),
        tokenUrl: checkEnv('EAGLEVIEW_TOKEN_URL'),
      },
      gaf: {
        clientId: checkEnv('GAF_CLIENT_ID'),
        clientSecret: checkEnv('GAF_CLIENT_SECRET'),
        apiUrl: checkEnv('GAF_API_URL'),
        tokenUrl: checkEnv('GAF_TOKEN_URL'),
        audience: checkEnv('GAF_AUDIENCE'),
        scope: checkEnv('GAF_SCOPE'),
      },
      hover: {
        clientId: checkEnv('HOVER_CLIENT_ID'),
        clientSecret: checkEnv('HOVER_CLIENT_SECRET'),
      },
      database: {
        url: checkEnv('DATABASE_URL'),
      },
      cognito: {
        userPoolId: checkEnv('COGNITO_USER_POOL_ID'),
        clientId: checkEnv('COGNITO_CLIENT_ID'),
      },
    },
  });
});

// Routes - /api/integrations/* to match ALB path-based routing
app.use('/api/integrations', integrationRoutes);

// Phase 4 Integration Routes
app.use('/api/integrations/ringcentral', ringCentralRoutes);
app.use('/api/integrations/measurements', measurementRoutes);
app.use('/api/integrations/abc-supply', abcSupplyRoutes);
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
