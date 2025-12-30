// Auth Routes
import { Router } from 'express';
import { authService } from '../services/authService.js';
import { logger } from '../middleware/logger.js';

const router = Router();

// Login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email and password are required' },
      });
    }

    const result = await authService.login(email, password);
    logger.info(`User logged in: ${email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Login failed for ${req.body.email}: ${error.message}`);
    next(error);
  }
});

// Complete new password challenge
router.post('/complete-new-password', async (req, res, next) => {
  try {
    const { email, newPassword, session } = req.body;

    if (!email || !newPassword || !session) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email, newPassword, and session are required' },
      });
    }

    const result = await authService.completeNewPasswordChallenge(email, newPassword, session);
    logger.info(`Password changed for: ${email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Refresh token
router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken, email } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Refresh token is required' },
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email is required for token refresh' },
      });
    }

    const result = await authService.refreshToken(refreshToken, email);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Sign up (self-registration)
router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, name, role, department } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email, password, and name are required' },
      });
    }

    const result = await authService.signUp(email, password, name, { role, department });
    logger.info(`New user signed up: ${email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Confirm sign up (email verification)
router.post('/confirm-signup', async (req, res, next) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email and verification code are required' },
      });
    }

    const result = await authService.confirmSignUp(email, code);
    logger.info(`Email verified for: ${email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Forgot password - initiate
router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email is required' },
      });
    }

    const result = await authService.forgotPassword(email);
    logger.info(`Password reset requested for: ${email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Forgot password - confirm with new password
router.post('/reset-password', async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email, code, and new password are required' },
      });
    }

    const result = await authService.confirmForgotPassword(email, code, newPassword);
    logger.info(`Password reset completed for: ${email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Get current user (requires access token in header)
router.get('/me', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Access token required' },
      });
    }

    const accessToken = authHeader.split(' ')[1];
    const user = await authService.getCurrentUser(accessToken);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// Sign out
router.post('/logout', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Access token required' },
      });
    }

    const accessToken = authHeader.split(' ')[1];
    const result = await authService.signOut(accessToken);
    logger.info('User signed out');
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Admin routes (protected by API key)
const requireApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.INTERNAL_API_KEY) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Invalid API key' },
    });
  }
  next();
};

// Admin: Create user
router.post('/admin/users', requireApiKey, async (req, res, next) => {
  try {
    const { email, name, temporaryPassword, role, department, salesforceId } = req.body;

    if (!email || !name || !temporaryPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email, name, and temporaryPassword are required' },
      });
    }

    const result = await authService.adminCreateUser(email, name, temporaryPassword, {
      role,
      department,
      salesforceId,
    });
    logger.info(`Admin created user: ${email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Admin: Get user
router.get('/admin/users/:email', requireApiKey, async (req, res, next) => {
  try {
    const user = await authService.adminGetUser(req.params.email);
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// Admin: Update user attributes
router.patch('/admin/users/:email', requireApiKey, async (req, res, next) => {
  try {
    const result = await authService.adminUpdateUserAttributes(req.params.email, req.body);
    logger.info(`Admin updated user: ${req.params.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Admin: Set user password
router.post('/admin/users/:email/password', requireApiKey, async (req, res, next) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Password is required' },
      });
    }

    const result = await authService.adminSetPassword(req.params.email, password);
    logger.info(`Admin set password for: ${req.params.email}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
