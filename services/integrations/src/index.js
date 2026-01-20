// Integrations Service - Entry Point
// Handles CompanyCam, Google Calendar, RingCentral, EagleView/GAF, ABC Supply, Scheduling, and Mobile integrations
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { CronJob } from 'cron';

import integrationRoutes from './routes/integrations.js';
import ringCentralRoutes from './routes/ringcentral.js';
import measurementRoutes from './routes/measurements.js';
import abcSupplyRoutes from './routes/abcSupply.js';
import schedulingRoutes from './routes/scheduling.js';
import mobileRoutes from './routes/mobile.js';
import fieldServiceRoutes from './routes/fieldService.js';
import { logger } from './middleware/logger.js';
import { measurementService } from './services/measurementService.js';
import companyCamService from './services/companyCamService.js';

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

// Test connection endpoint - attempts to get OAuth tokens from EagleView and GAF
app.get('/api/integrations/test-connection', async (req, res) => {
  const results = {
    eagleView: { status: 'unknown', error: null },
    gaf: { status: 'unknown', error: null },
  };

  // Test EagleView token acquisition
  try {
    const evClientId = process.env.EAGLEVIEW_CLIENT_ID;
    const evClientSecret = process.env.EAGLEVIEW_CLIENT_SECRET;
    const evTokenUrl = process.env.EAGLEVIEW_TOKEN_URL || 'https://apicenter.eagleview.com/oauth2/v1/token';

    if (!evClientId || !evClientSecret) {
      results.eagleView = { status: 'not_configured', error: 'Missing credentials' };
    } else {
      const requestBody = `grant_type=client_credentials&client_id=${encodeURIComponent(evClientId)}&client_secret=${encodeURIComponent(evClientSecret)}`;

      const response = await fetch(evTokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: requestBody,
      });

      if (response.ok) {
        const data = await response.json();
        results.eagleView = {
          status: 'connected',
          tokenType: data.token_type,
          expiresIn: data.expires_in,
        };
      } else {
        const errorText = await response.text();
        results.eagleView = {
          status: 'auth_failed',
          httpStatus: response.status,
          error: errorText.substring(0, 500),
        };
      }
    }
  } catch (error) {
    results.eagleView = { status: 'error', error: error.message };
  }

  // Test GAF token acquisition
  try {
    const gafClientId = process.env.GAF_CLIENT_ID;
    const gafClientSecret = process.env.GAF_CLIENT_SECRET;
    const gafTokenUrl = process.env.GAF_TOKEN_URL || 'https://ssoext.gaf.com/oauth2/ausclyogeZBNESNcI4x6/v1/token';
    const gafAudience = process.env.GAF_AUDIENCE || 'https://quickmeasureapi.gaf.com';
    const gafScope = process.env.GAF_SCOPE || 'Subscriber:GetSubscriberDetails';

    if (!gafClientId || !gafClientSecret) {
      results.gaf = { status: 'not_configured', error: 'Missing credentials' };
    } else {
      const requestBody = `grant_type=client_credentials&client_id=${encodeURIComponent(gafClientId)}&client_secret=${encodeURIComponent(gafClientSecret)}&audience=${encodeURIComponent(gafAudience)}&scope=${encodeURIComponent(gafScope)}`;

      const response = await fetch(gafTokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: requestBody,
      });

      if (response.ok) {
        const data = await response.json();
        results.gaf = {
          status: 'connected',
          tokenType: data.token_type,
          expiresIn: data.expires_in,
        };
      } else {
        const errorText = await response.text();
        results.gaf = {
          status: 'auth_failed',
          httpStatus: response.status,
          error: errorText.substring(0, 500),
        };
      }
    }
  } catch (error) {
    results.gaf = { status: 'error', error: error.message };
  }

  const allConnected = results.eagleView.status === 'connected' && results.gaf.status === 'connected';

  res.json({
    success: allConnected,
    message: allConnected ? 'All integrations connected successfully' : 'Some integrations failed',
    data: results,
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

// Scheduled job to process pending measurement reports (runs every 5 minutes)
// Replicates Salesforce "EagleView_Scheduled_Report_Retrieval" batch job
const measurementPollingJob = new CronJob('*/5 * * * *', async () => {
  try {
    logger.info('Starting scheduled measurement report polling...');

    // Process EagleView pending reports
    const eagleViewResult = await measurementService.processPendingEagleViewReports();
    if (eagleViewResult.processed > 0 || eagleViewResult.failed > 0) {
      logger.info(`EagleView polling: ${eagleViewResult.processed} completed, ${eagleViewResult.failed} failed`);
    }

    // Process GAF pending reports
    const gafResult = await measurementService.processPendingGAFReports();
    if (gafResult.processed > 0 || gafResult.failed > 0) {
      logger.info(`GAF polling: ${gafResult.processed} completed, ${gafResult.failed} failed`);
    }
  } catch (error) {
    logger.error('Measurement polling job error:', error);
  }
});

// Scheduled job to sync CompanyCam projects and photos (runs every 15 minutes)
const companyCamSyncJob = new CronJob('*/15 * * * *', async () => {
  try {
    const status = companyCamService.getSyncStatus();
    if (status.isRunning) {
      logger.info('CompanyCam sync already in progress, skipping this cycle');
      return;
    }

    logger.info('Starting scheduled CompanyCam sync...');
    const result = await companyCamService.syncAllProjects();
    logger.info(`CompanyCam sync completed: ${result.projectsSynced} projects, ${result.photosSynced} photos synced`);
  } catch (error) {
    logger.error('CompanyCam sync job error:', error);
  }
});

// Scheduled job to generate CompanyCam hourly report (runs every hour at minute 0)
const companyCamReportJob = new CronJob('0 * * * *', async () => {
  try {
    const report = companyCamService.generateHourlyReport();
    if (report.projectsSynced > 0 || report.photosSynced > 0 || report.errors > 0) {
      logger.info('CompanyCam Hourly Report:', {
        hour: report.hour,
        projectsSynced: report.projectsSynced,
        photosSynced: report.photosSynced,
        errors: report.errors,
      });
    }
  } catch (error) {
    logger.error('CompanyCam report job error:', error);
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Integrations service running on port ${PORT}`);

  // Start cron job for measurement report polling
  if (process.env.ENABLE_MEASUREMENT_POLLING !== 'false') {
    measurementPollingJob.start();
    logger.info('Measurement report polling job started (runs every 5 minutes)');
  } else {
    logger.info('Measurement report polling job disabled (ENABLE_MEASUREMENT_POLLING=false)');
  }

  // Start cron jobs for CompanyCam background sync
  if (process.env.ENABLE_COMPANYCAM_SYNC !== 'false') {
    companyCamSyncJob.start();
    companyCamReportJob.start();
    logger.info('CompanyCam sync job started (runs every 15 minutes)');
    logger.info('CompanyCam hourly report job started');
  } else {
    logger.info('CompanyCam sync disabled (ENABLE_COMPANYCAM_SYNC=false)');
  }
});

export default app;
