/**
 * Champion Auth Routes
 * Authentication for champion mobile app and web portal
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { championService } from '../services/championService.js';
import { logger } from '../services/logger.js';

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'panda-champions-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// POST /api/champion-auth/login - Champion login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' },
      });
    }

    const champion = await championService.validatePassword(email, password);

    if (!champion) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    if (champion.status !== 'ACTIVE') {
      return res.status(403).json({
        success: false,
        error: { code: 'ACCOUNT_INACTIVE', message: 'Account is not active' },
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        championId: champion.id,
        email: champion.email,
        referralCode: champion.referralCode,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info('Champion logged in', { championId: champion.id });

    res.json({
      success: true,
      data: {
        token,
        champion: {
          id: champion.id,
          email: champion.email,
          firstName: champion.firstName,
          lastName: champion.lastName,
          referralCode: champion.referralCode,
          referralUrl: champion.referralUrl,
          status: champion.status,
          totalReferrals: champion.totalReferrals,
          totalEarnings: champion.totalEarnings,
          pendingEarnings: champion.pendingEarnings,
        },
      },
    });
  } catch (error) {
    logger.error('Error during login', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'LOGIN_ERROR', message: error.message },
    });
  }
});

// POST /api/champion-auth/register - Self-registration
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, city, state, zipCode } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email, password, first name, and last name are required' },
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Password must be at least 8 characters' },
      });
    }

    const champion = await championService.createChampion({
      email,
      password,
      firstName,
      lastName,
      phone,
      city,
      state,
      zipCode,
    });

    // Generate JWT token
    const token = jwt.sign(
      {
        championId: champion.id,
        email: champion.email,
        referralCode: champion.referralCode,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    logger.info('Champion registered', { championId: champion.id });

    res.status(201).json({
      success: true,
      data: {
        token,
        champion: {
          id: champion.id,
          email: champion.email,
          firstName: champion.firstName,
          lastName: champion.lastName,
          referralCode: champion.referralCode,
          referralUrl: champion.referralUrl,
          status: champion.status,
        },
      },
    });
  } catch (error) {
    logger.error('Error during registration', { error: error.message });

    const status = error.message.includes('already exists') ? 409 : 500;
    res.status(status).json({
      success: false,
      error: { code: 'REGISTER_ERROR', message: error.message },
    });
  }
});

// GET /api/champion-auth/me - Get current champion (requires auth)
router.get('/me', authenticateChampion, async (req, res) => {
  try {
    const champion = await championService.getChampionById(req.champion.championId);

    if (!champion) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Champion not found' },
      });
    }

    res.json({
      success: true,
      data: champion,
    });
  } catch (error) {
    logger.error('Error getting current champion', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'FETCH_ERROR', message: error.message },
    });
  }
});

// POST /api/champion-auth/refresh - Refresh JWT token
router.post('/refresh', authenticateChampion, async (req, res) => {
  try {
    const champion = await championService.getChampionById(req.champion.championId);

    if (!champion || champion.status !== 'ACTIVE') {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Token refresh failed' },
      });
    }

    // Generate new JWT token
    const token = jwt.sign(
      {
        championId: champion.id,
        email: champion.email,
        referralCode: champion.referralCode,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      data: { token },
    });
  } catch (error) {
    logger.error('Error refreshing token', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'REFRESH_ERROR', message: error.message },
    });
  }
});

// POST /api/champion-auth/forgot-password - Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email is required' },
      });
    }

    const champion = await championService.getChampionByEmail(email);

    // Always return success to prevent email enumeration
    if (champion) {
      // TODO: Generate reset token and send email
      logger.info('Password reset requested', { email });
    }

    res.json({
      success: true,
      message: 'If an account exists with that email, a reset link has been sent',
    });
  } catch (error) {
    logger.error('Error requesting password reset', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'RESET_ERROR', message: error.message },
    });
  }
});

// POST /api/champion-auth/change-password - Change password (requires auth)
router.post('/change-password', authenticateChampion, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Current password and new password are required' },
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'New password must be at least 8 characters' },
      });
    }

    const champion = await championService.getChampionById(req.champion.championId);

    // Verify current password
    const isValid = await championService.validatePassword(champion.email, currentPassword);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Current password is incorrect' },
      });
    }

    // Update password
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(newPassword, 12);

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    await prisma.champion.update({
      where: { id: champion.id },
      data: { passwordHash },
    });

    await championService.logActivity(champion.id, 'PASSWORD_CHANGED', 'Password was changed');

    logger.info('Champion password changed', { championId: champion.id });

    res.json({
      success: true,
      message: 'Password changed successfully',
    });
  } catch (error) {
    logger.error('Error changing password', { error: error.message });
    res.status(500).json({
      success: false,
      error: { code: 'PASSWORD_ERROR', message: error.message },
    });
  }
});

// Middleware to authenticate champion JWT
function authenticateChampion(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'NO_TOKEN', message: 'Authentication required' },
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    req.champion = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Token has expired' },
      });
    }

    return res.status(401).json({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' },
    });
  }
}

// Export middleware for use in other routes
export { authenticateChampion };

export default router;
