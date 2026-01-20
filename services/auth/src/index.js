// Auth Service - Entry Point
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import permissionRoutes from './routes/permissions.js';
import auditRoutes from './routes/audit.js';
import helpRoutes from './routes/help.js';
import supportRoutes from './routes/support.js';
import setupRoutes from './routes/setup.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './middleware/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { permissionService } from './services/permissionService.js';

dotenv.config();

const app = express();
const PORT = process.env.AUTH_PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://crm.pandaadmin.com',
    'https://crm.pandaexteriors.com',
    'https://bamboo.pandaadmin.com'
  ],
  credentials: true,
}));
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'auth', timestamp: new Date().toISOString() });
});

// Routes - /api/auth/* to match ALB path-based routing
app.use('/api/auth', authRoutes);
app.use('/api/permissions', authMiddleware, permissionRoutes);
app.use('/api/audit', authMiddleware, auditRoutes);
app.use('/api/help', helpRoutes); // Help routes have their own auth handling (some public, some protected)
app.use('/api/support', supportRoutes); // Support ticket routes
app.use('/api/setup', authMiddleware, setupRoutes); // Setup/Object Manager routes

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` },
  });
});

// Initialize default permissions on startup
const initializePermissions = async () => {
  try {
    await permissionService.initializeDefaultPermissions();
    logger.info('Default permissions initialized');
  } catch (error) {
    logger.error('Failed to initialize permissions:', error);
  }
};

app.listen(PORT, () => {
  logger.info(`Auth service running on port ${PORT}`);
  initializePermissions();
});

export default app;
