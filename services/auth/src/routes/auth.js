// Auth Routes
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authService } from '../services/authService.js';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

const router = Router();

const INTERNAL_EMAIL_DOMAINS = ['pandaexteriors.com', 'panda-exteriors.com'];

function buildEmailCandidates(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return [];

  const normalized = email.trim().toLowerCase();
  const [localRaw, domainRaw] = normalized.split('@');
  if (!localRaw || !domainRaw) return [normalized];

  const localNoDots = localRaw.replace(/\./g, '');
  const domainCandidates = INTERNAL_EMAIL_DOMAINS.includes(domainRaw)
    ? INTERNAL_EMAIL_DOMAINS
    : [domainRaw];

  return Array.from(new Set(domainCandidates.flatMap((domain) => ([
    `${localRaw}@${domain}`,
    `${localNoDots}@${domain}`,
  ]))));
}

async function findDbUserFromCognito(cognitoUser) {
  const select = {
    id: true,
    email: true,
    firstName: true,
    lastName: true,
    fullName: true,
    phone: true,
    mobilePhone: true,
    department: true,
    division: true,
    title: true,
    officeAssignment: true,
    managerId: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
    roleId: true,
  };

  // 1) Exact + tolerant email variants
  const emailCandidates = buildEmailCandidates(cognitoUser?.email);
  for (const candidate of emailCandidates) {
    const user = await prisma.user.findUnique({
      where: { email: candidate },
      select,
    });
    if (user) return user;
  }

  // 2) Fallback by Cognito username if it happens to match local user id
  if (cognitoUser?.username) {
    const byId = await prisma.user.findUnique({
      where: { id: cognitoUser.username },
      select,
    });
    if (byId) return byId;
  }

  return null;
}

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

    // Handle NEW_PASSWORD_REQUIRED challenge (return without user)
    if (result.challengeName === 'NEW_PASSWORD_REQUIRED') {
      logger.info(`User ${email} requires password change`);
      return res.json({ success: true, data: result });
    }

    // Successful login - fetch user info from database and include in response
    // This is needed for mobile apps that expect { user, accessToken, refreshToken }
    const cognitoUser = await authService.getCurrentUser(result.accessToken);

    // Look up full user record from database by email
    const dbUser = await prisma.user.findUnique({
      where: { email: cognitoUser.email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        fullName: true,
        phone: true,
        mobilePhone: true,
        department: true,
        division: true,
        title: true,
        officeAssignment: true,
        managerId: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        // Include role info
        roleId: true,
      },
    });

    // Check if user has team members (is a manager)
    let isManager = false;
    if (dbUser?.id) {
      const teamCount = await prisma.user.count({
        where: { managerId: dbUser.id, isActive: true },
      });
      isManager = teamCount > 0;
    }

    // Merge Cognito attributes with database user
    const user = {
      id: dbUser?.id || cognitoUser.username,
      email: cognitoUser.email,
      firstName: dbUser?.firstName || cognitoUser.firstName,
      lastName: dbUser?.lastName || cognitoUser.lastName,
      fullName: dbUser?.fullName || cognitoUser.name,
      phone: dbUser?.phone || dbUser?.mobilePhone,
      department: dbUser?.department || cognitoUser.department,
      jobTitle: dbUser?.title,
      officeName: dbUser?.officeAssignment,
      division: dbUser?.division,
      role: cognitoUser.role || 'SALES_REP', // Default role
      managerId: dbUser?.managerId,
      isManager,
      isActive: dbUser?.isActive ?? true,
      createdAt: dbUser?.createdAt,
      updatedAt: dbUser?.updatedAt,
    };

    logger.info(`User logged in: ${email}`);
    res.json({
      success: true,
      data: {
        user,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        idToken: result.idToken,
        expiresIn: result.expiresIn,
      },
    });
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
    const cognitoUser = await authService.getCurrentUser(accessToken);

    const dbUser = await findDbUserFromCognito(cognitoUser);

    // Check if user has team members (is a manager)
    let isManager = false;
    if (dbUser?.id) {
      const teamCount = await prisma.user.count({
        where: { managerId: dbUser.id, isActive: true },
      });
      isManager = teamCount > 0;
    }

    // Merge Cognito attributes with database user
    const user = {
      id: dbUser?.id || cognitoUser.username,
      email: cognitoUser.email,
      firstName: dbUser?.firstName || cognitoUser.firstName,
      lastName: dbUser?.lastName || cognitoUser.lastName,
      fullName: dbUser?.fullName || cognitoUser.name,
      phone: dbUser?.phone || dbUser?.mobilePhone,
      department: dbUser?.department || cognitoUser.department,
      jobTitle: dbUser?.title,
      officeName: dbUser?.officeAssignment,
      division: dbUser?.division,
      role: cognitoUser.role || 'SALES_REP',
      managerId: dbUser?.managerId,
      isManager,
      isActive: dbUser?.isActive ?? true,
      createdAt: dbUser?.createdAt,
      updatedAt: dbUser?.updatedAt,
    };

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// Update current user profile (self-service)
router.put('/me', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Access token required' },
      });
    }

    const accessToken = authHeader.split(' ')[1];
    const cognitoUser = await authService.getCurrentUser(accessToken);
    const existingUser = await findDbUserFromCognito(cognitoUser);

    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User profile not found in database' },
      });
    }

    const {
      firstName,
      lastName,
      phone,
      department,
      title,
    } = req.body || {};

    const updateData = {};

    if (firstName !== undefined) {
      updateData.firstName = typeof firstName === 'string' ? firstName.trim() : '';
    }

    if (lastName !== undefined) {
      updateData.lastName = typeof lastName === 'string' ? lastName.trim() : '';
    }

    if (phone !== undefined) {
      const phoneValue = typeof phone === 'string' ? phone.trim() : '';
      updateData.phone = phoneValue || null;
    }

    if (department !== undefined) {
      const departmentValue = typeof department === 'string' ? department.trim() : '';
      updateData.department = departmentValue || null;
    }

    if (title !== undefined) {
      const titleValue = typeof title === 'string' ? title.trim() : '';
      updateData.title = titleValue || null;
    }

    if (Object.keys(updateData).length === 0) {
      return res.json({
        success: true,
        data: {
          id: existingUser.id,
          email: existingUser.email,
          firstName: existingUser.firstName || '',
          lastName: existingUser.lastName || '',
          fullName: existingUser.fullName || '',
          phone: existingUser.phone || existingUser.mobilePhone || '',
          department: existingUser.department || '',
          title: existingUser.title || '',
          updatedAt: existingUser.updatedAt,
        },
      });
    }

    const nextFirstName = updateData.firstName !== undefined ? updateData.firstName : (existingUser.firstName || '');
    const nextLastName = updateData.lastName !== undefined ? updateData.lastName : (existingUser.lastName || '');
    const fullName = `${nextFirstName} ${nextLastName}`.trim();
    updateData.fullName = fullName || null;
    updateData.updatedAt = new Date();

    const updated = await prisma.user.update({
      where: { id: existingUser.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        fullName: true,
        phone: true,
        mobilePhone: true,
        department: true,
        title: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      data: {
        id: updated.id,
        email: updated.email,
        firstName: updated.firstName || '',
        lastName: updated.lastName || '',
        fullName: updated.fullName || '',
        phone: updated.phone || updated.mobilePhone || '',
        department: updated.department || '',
        title: updated.title || '',
        updatedAt: updated.updatedAt,
      },
    });
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

// ============================================================================
// MOBILE APP ENDPOINTS
// ============================================================================

/**
 * POST /users/me/push-token
 * Save push notification token for current user
 * Used by mobile apps to register for push notifications
 */
router.post('/users/me/push-token', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Access token required' },
      });
    }

    const { token, platform } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Push token is required' },
      });
    }

    const accessToken = authHeader.split(' ')[1];
    const user = await authService.getCurrentUser(accessToken);

    // Save push token via authService
    await authService.savePushToken(user.id, token, platform || 'unknown');

    logger.info(`Push token saved for user: ${user.email}`);
    res.json({ success: true, message: 'Push token saved' });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /users/me/push-token
 * Remove push notification token for current user
 * Used when user logs out or disables notifications
 */
router.delete('/users/me/push-token', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Access token required' },
      });
    }

    const { token } = req.body;

    const accessToken = authHeader.split(' ')[1];
    const user = await authService.getCurrentUser(accessToken);

    // Remove push token
    await authService.removePushToken(user.id, token);

    logger.info(`Push token removed for user: ${user.email}`);
    res.json({ success: true, message: 'Push token removed' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /users/team
 * Get team members for current manager (Mobile app - Manager experience)
 */
router.get('/users/team', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Access token required' },
      });
    }

    const accessToken = authHeader.split(' ')[1];
    const currentUser = await authService.getCurrentUser(accessToken);

    // Get team members where this user is the manager
    const teamMembers = await prisma.user.findMany({
      where: {
        managerId: currentUser.id,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        department: true,
        jobTitle: true,
        officeName: true,
        avatarUrl: true,
        lastActiveAt: true,
      },
      orderBy: { firstName: 'asc' },
    });

    res.json({ success: true, data: teamMembers });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /users/me/location
 * Update current user's location (Mobile app - location tracking)
 */
router.post('/users/me/location', async (req, res, next) => {
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

    const { latitude, longitude, accuracy, activityType } = req.body;

    // Update user's last known location
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLatitude: latitude,
        lastLongitude: longitude,
        lastLocationAccuracy: accuracy,
        lastActivityType: activityType, // KNOCKING, DRIVING, STATIONARY, etc.
        lastLocationAt: new Date(),
        lastActiveAt: new Date(),
      },
    });

    res.json({ success: true, message: 'Location updated' });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /users/team/locations
 * Get team members' live locations (Mobile app - Manager team map)
 */
router.get('/users/team/locations', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Access token required' },
      });
    }

    const accessToken = authHeader.split(' ')[1];
    const currentUser = await authService.getCurrentUser(accessToken);

    // Get team members with location data
    const teamLocations = await prisma.user.findMany({
      where: {
        managerId: currentUser.id,
        isActive: true,
        lastLatitude: { not: null },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        lastLatitude: true,
        lastLongitude: true,
        lastLocationAccuracy: true,
        lastActivityType: true,
        lastLocationAt: true,
        lastActiveAt: true,
      },
      orderBy: { firstName: 'asc' },
    });

    // Transform to map-friendly format
    const locations = teamLocations.map(member => ({
      id: member.id,
      name: `${member.firstName} ${member.lastName}`,
      phone: member.phone,
      avatarUrl: member.avatarUrl,
      location: {
        latitude: member.lastLatitude,
        longitude: member.lastLongitude,
        accuracy: member.lastLocationAccuracy,
      },
      activityType: member.lastActivityType || 'UNKNOWN',
      lastUpdated: member.lastLocationAt,
      lastActive: member.lastActiveAt,
      // Calculate if online (active within last 5 minutes)
      isOnline: member.lastActiveAt && (new Date() - new Date(member.lastActiveAt)) < 5 * 60 * 1000,
    }));

    res.json({ success: true, data: locations });
  } catch (error) {
    next(error);
  }
});

export default router;
