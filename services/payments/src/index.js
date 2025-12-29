import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import paymentsRouter from './routes/payments.js';
import paymentLinksRouter from './routes/paymentLinks.js';
import webhooksRouter from './routes/webhooks.js';
import customersRouter from './routes/customers.js';
import quickbooksRouter from './routes/quickbooks.js';

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
app.use('/webhooks', webhooksRouter);

// Error handling
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Payments service running on port ${PORT}`);
});

export default app;
