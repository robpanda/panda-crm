// Leads Microservice Entry Point
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { logger } from './middleware/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import leadRoutes from './routes/leads.js';
import leadAssignmentRoutes from './routes/leadAssignment.js';
import callCenterRoutes from './routes/callCenter.js';
import callListRoutes from './routes/callLists.js';

const app = express();
const PORT = process.env.PORT || 3003;

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
  res.json({ status: 'healthy', service: 'leads', timestamp: new Date().toISOString() });
});

// Apply auth middleware to all routes below
app.use(authMiddleware);

// Routes - /api/leads/* to match ALB path-based routing
// IMPORTANT: More specific routes MUST come before generic /:id routes
app.use('/api/leads/assignment', leadAssignmentRoutes);
app.use('/api/leads/call-center', callCenterRoutes);
app.use('/api/leads/call-lists', callListRoutes);
app.use('/api/leads', leadRoutes);  // Has /:id route - must be LAST

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
  logger.info(`Leads service running on port ${PORT}`);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

export default app;
