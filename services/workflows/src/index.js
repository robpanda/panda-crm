// Workflows Service - Entry Point
// Handles workflow automation, commissions, and messaging
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { CronJob } from 'cron';

import workflowRoutes from './routes/workflows.js';
import commissionRoutes from './routes/commissions.js';
import templateRoutes from './routes/templates.js';
import approvalRoutes from './routes/approvals.js';
import triggerRoutes from './routes/triggers.js';
import orphanedRecordsRoutes from './routes/orphanedRecords.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './middleware/logger.js';
import { messagingService } from './services/messagingService.js';
import { approvalService } from './services/approvalService.js';

dotenv.config();

const app = express();
const PORT = process.env.WORKFLOWS_PORT || 3008;

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
    service: 'workflows',
    timestamp: new Date().toISOString(),
    features: ['workflows', 'commissions', 'templates', 'messaging', 'approvals', 'triggers', 'orphaned-records'],
  });
});

// Routes - /api/workflows/* to match ALB path-based routing
app.use('/api/workflows', workflowRoutes);
app.use('/api/workflows/commissions', commissionRoutes);
app.use('/api/workflows/templates', templateRoutes);
app.use('/api/workflows/approvals', approvalRoutes);
app.use('/api/triggers', triggerRoutes);
app.use('/api/workflows/orphaned-records', orphanedRecordsRoutes);

// Webhook endpoints for external services
app.post('/api/workflows/webhooks/twilio/status', async (req, res) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;

    logger.info(`Twilio status callback: ${MessageSid} -> ${MessageStatus}`, {
      errorCode: ErrorCode,
      errorMessage: ErrorMessage,
    });

    // Update message status in database
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    await prisma.message.updateMany({
      where: { twilioSid: MessageSid },
      data: {
        status: MessageStatus.toUpperCase(),
        errorCode: ErrorCode,
        errorMessage: ErrorMessage,
      },
    });

    res.sendStatus(200);
  } catch (error) {
    logger.error('Twilio webhook error:', error);
    res.sendStatus(500);
  }
});

app.post('/api/workflows/webhooks/sendgrid/events', async (req, res) => {
  try {
    const events = req.body;

    logger.info(`SendGrid webhook: ${events.length} events`);

    // Process each event
    for (const event of events) {
      logger.debug(`SendGrid event: ${event.event} for ${event.sg_message_id}`);
      // Could update email status in database here
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error('SendGrid webhook error:', error);
    res.sendStatus(500);
  }
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
});

// Start scheduled message processor (runs every minute)
const scheduledMessageJob = new CronJob('* * * * *', async () => {
  try {
    const result = await messagingService.processScheduledMessages();
    if (result.processed > 0) {
      logger.info(`Processed ${result.processed} scheduled messages`);
    }
  } catch (error) {
    logger.error('Scheduled message processor error:', error);
  }
});

// Process expired approval requests (runs every hour)
const expiredApprovalsJob = new CronJob('0 * * * *', async () => {
  try {
    const count = await approvalService.processExpiredRequests();
    if (count > 0) {
      logger.info(`Expired ${count} approval requests`);
    }
  } catch (error) {
    logger.error('Expired approvals processor error:', error);
  }
});

// Start server
app.listen(PORT, () => {
  logger.info(`Workflows service running on port ${PORT}`);

  // Start cron jobs
  scheduledMessageJob.start();
  logger.info('Scheduled message processor started');

  expiredApprovalsJob.start();
  logger.info('Expired approvals processor started');
});

export default app;
