import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cron from 'node-cron';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import paymentsRouter from './routes/payments.js';
import paymentLinksRouter from './routes/paymentLinks.js';
import webhooksRouter from './routes/webhooks.js';
import customersRouter from './routes/customers.js';
import quickbooksRouter from './routes/quickbooks.js';
import subscriptionsRouter from './routes/subscriptions.js';
import { paymentService } from './services/paymentService.js';
import { quickbooksService } from './services/quickbooksService.js';

const app = express();
const PORT = process.env.PORT || 3010;

// Webhooks need raw body for signature verification
app.use('/webhooks', express.raw({ type: 'application/json' }));

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'payments' });
});

// Routes
app.use('/api/payments', paymentsRouter);
app.use('/api/payment-links', paymentLinksRouter);
app.use('/api/customers', customersRouter);
app.use('/api/quickbooks', quickbooksRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/webhooks', webhooksRouter);

// Background sync cron job - runs every 4 hours
// Cron schedule: "0 */4 * * *" = at minute 0 past every 4th hour
const ENABLE_BACKGROUND_SYNC = process.env.ENABLE_BACKGROUND_SYNC !== 'false';

if (ENABLE_BACKGROUND_SYNC) {
  cron.schedule('0 */4 * * *', async () => {
    logger.info('Starting scheduled background sync (Stripe + QuickBooks)');

    try {
      // Sync Stripe payments (last 7 days for background sync)
      logger.info('Background sync: Syncing Stripe payments...');
      const stripeResult = await paymentService.syncStripePayments({ daysBack: 7, limit: 200 });
      logger.info('Background sync: Stripe payments complete', {
        created: stripeResult.created,
        updated: stripeResult.updated,
        skipped: stripeResult.skipped,
        errors: stripeResult.errors,
      });
    } catch (error) {
      logger.error('Background sync: Stripe payments failed', { error: error.message });
    }

    try {
      // Sync QuickBooks invoices (last 7 days for background sync)
      logger.info('Background sync: Syncing QuickBooks invoices...');
      const qbResult = await quickbooksService.syncInvoices({ daysBack: 7, limit: 200 });
      logger.info('Background sync: QuickBooks invoices complete', {
        created: qbResult.created,
        updated: qbResult.updated,
        skipped: qbResult.skipped,
        errors: qbResult.errors,
      });
    } catch (error) {
      logger.error('Background sync: QuickBooks invoices failed', { error: error.message });
    }

    logger.info('Background sync completed');
  });

  logger.info('Background sync cron job scheduled (every 4 hours)');
}

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Payments service running on port ${PORT}`);
});

export default app;
