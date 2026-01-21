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
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

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
    'https://bamboo.pandaadmin.com',
    'https://bamboo.pandaexteriors.com'
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

// One-time migration to set Sutton and Greg Young as Call Center Managers
const setCallCenterManagers = async () => {
  try {
    // First, ensure Call Center Manager role exists
    let ccManagerRole = await prisma.role.findFirst({
      where: { name: 'Call Center Manager' }
    });

    if (!ccManagerRole) {
      ccManagerRole = await prisma.role.create({
        data: {
          name: 'Call Center Manager',
          description: 'Default Call Center Manager role',
          roleType: 'call_center_manager',
          isActive: true,
          permissionsJson: {
            accounts: ['read', 'update'],
            contacts: ['create', 'read', 'update', 'export', 'assign'],
            leads: ['create', 'read', 'update', 'export', 'assign'],
            opportunities: ['read', 'update'],
            appointments: ['create', 'read', 'update', 'assign'],
            templates: ['read', 'update'],
            campaigns: ['create', 'read', 'update'],
            users: ['read'],
            reports: ['read', 'export'],
          }
        }
      });
      logger.info('Created Call Center Manager role');
    }

    // Find and update Sutton and Greg Young
    const usersToUpdate = await prisma.user.findMany({
      where: {
        OR: [
          { firstName: { contains: 'Sutton', mode: 'insensitive' } },
          { lastName: { contains: 'Sutton', mode: 'insensitive' } },
          {
            AND: [
              { firstName: { contains: 'Greg', mode: 'insensitive' } },
              { lastName: { contains: 'Young', mode: 'insensitive' } }
            ]
          }
        ]
      }
    });

    if (usersToUpdate.length > 0) {
      const updateResult = await prisma.user.updateMany({
        where: {
          id: { in: usersToUpdate.map(u => u.id) }
        },
        data: {
          roleId: ccManagerRole.id
        }
      });
      logger.info(`Set ${updateResult.count} user(s) as Call Center Manager: ${usersToUpdate.map(u => `${u.firstName} ${u.lastName}`).join(', ')}`);
    } else {
      logger.info('No users found matching Sutton or Greg Young');
    }
  } catch (error) {
    logger.error('Failed to set call center managers:', error);
  }
};

app.listen(PORT, () => {
  logger.info(`Auth service running on port ${PORT}`);
  initializePermissions();
  setCallCenterManagers();
});

export default app;
