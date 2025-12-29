// Accounts Microservice Entry Point
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import accountRoutes from './routes/accounts.js';
import productRoutes from './routes/products.js';
import pricebookRoutes from './routes/pricebooks.js';
import userRoutes from './routes/users.js';
import commissionRoutes from './routes/commissions.js';
import attentionRoutes from './routes/attention.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://crm.pandaadmin.com',
    'https://crm.pandaexteriors.com',
    'https://bamboo.pandaadmin.com'
  ],
  credentials: true,
}));
app.use(express.json());
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Handle preflight OPTIONS requests before auth middleware
app.options('*', cors());

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'accounts', timestamp: new Date().toISOString() });
});

// Apply auth middleware to all routes below
app.use(authMiddleware);

// Routes - /api/* to match ALB path-based routing
app.use('/api/accounts', accountRoutes);
app.use('/api/products', productRoutes);
app.use('/api/pricebooks', pricebookRoutes);
app.use('/api/users', userRoutes);
app.use('/api/commissions', commissionRoutes);
app.use('/api/attention', attentionRoutes);

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
  logger.info(`Accounts service running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

export default app;
