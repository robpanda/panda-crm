/**
 * Champions Service - Panda CRM
 * Handles Champion (referral partner) management, referrals, wallets, and payouts
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routes
import championsRoutes from './routes/champions.js';
import referralsRoutes from './routes/referrals.js';
import walletsRoutes from './routes/wallets.js';
import payoutsRoutes from './routes/payouts.js';
import settingsRoutes from './routes/settings.js';
import authRoutes from './routes/auth.js';
import reportsRoutes from './routes/reports.js';
import { logger } from './services/logger.js';

const app = express();
const PORT = process.env.PORT || 3015;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://crm.pandaadmin.com', 'http://localhost:3000'],
  credentials: true,
}));
app.use(express.json());
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
}));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'champions',
    timestamp: new Date().toISOString(),
  });
});

// API Routes
app.use('/api/champions', championsRoutes);
app.use('/api/referrals', referralsRoutes);
app.use('/api/wallets', walletsRoutes);
app.use('/api/payouts', payoutsRoutes);
app.use('/api/referral-settings', settingsRoutes);
app.use('/api/champion-auth', authRoutes);
app.use('/api/champion-reports', reportsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
    },
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Champions service running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
