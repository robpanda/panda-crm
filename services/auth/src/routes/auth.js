// Auth Routes
import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authService } from '../services/authService.js';
import { logger } from '../middleware/logger.js';

const prisma = new PrismaClient();

const router = Router();
const PANDA_EMPLOYEE_EMAIL_DOMAINS = new Set(['pandaexteriors.com', 'panda-exteriors.com']);

function normalizePandaEmployeeEmail(email) {
  if (typeof email !== 'string') return email;
  const trimmed = email.trim();
  if (!trimmed) return trimmed;

  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === trimmed.length - 1) {
    return trimmed;
  }

  const localPart = trimmed.slice(0, atIndex);
  const domainPart = trimmed.slice(atIndex + 1).toLowerCase();
  if (!PANDA_EMPLOYEE_EMAIL_DOMAINS.has(domainPart)) {
    return trimmed;
  }

  return `${localPart.replace(/\./g, '').toLowerCase()}@${domainPart}`;
}

function buildEmailLookupCandidates(email) {
  if (typeof email !== 'string') return [];

  const trimmed = email.trim();
  if (!trimmed) return [];

  const candidates = [];
  const seen = new Set();

  const addCandidate = (value) => {
    const candidate = String(value || '').trim();
    if (!candidate) return;
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  const lowerEmail = trimmed.toLowerCase();
  addCandidate(trimmed);
  addCandidate(lowerEmail);

  const atIndex = lowerEmail.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === lowerEmail.length - 1) {
    return candidates;
  }

  const localPart = lowerEmail.slice(0, atIndex);
  const domainPart = lowerEmail.slice(atIndex + 1);
  addCandidate(`${localPart}@${domainPart}`);

  if (PANDA_EMPLOYEE_EMAIL_DOMAINS.has(domainPart)) {
    const dotlessLocalPart = localPart.replace(/\./g, '');
    for (const domain of PANDA_EMPLOYEE_EMAIL_DOMAINS) {
      addCandidate(`${localPart}@${domain}`);
      addCandidate(`${dotlessLocalPart}@${domain}`);
    }
  }

  return candidates;
}

function pickBestEmailMatch(users, emailCandidates) {
  if (!Array.isArray(users) || !users.length) return null;
  const rankedCandidates = emailCandidates.map((candidate) => candidate.toLowerCase());

  return [...users].sort((a, b) => {
    const aEmail = String(a.email || '').toLowerCase();
    const bEmail = String(b.email || '').toLowerCase();
    const aRank = rankedCandidates.indexOf(aEmail);
    const bRank = rankedCandidates.indexOf(bEmail);
    const safeARank = aRank === -1 ? Number.MAX_SAFE_INTEGER : aRank;
    const safeBRank = bRank === -1 ? Number.MAX_SAFE_INTEGER : bRank;

    if (safeARank !== safeBRank) return safeARank - safeBRank;
    if (a.isActive !== b.isActive) return Number(b.isActive) - Number(a.isActive);

    const aUpdatedAt = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    const bUpdatedAt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    return bUpdatedAt - aUpdatedAt;
  })[0];
}

async function getDatabaseUserProfile(email) {
  if (!email) {
    logger.warn('Skipping DB user enrichment: Cognito user has no email attribute');
    return { dbUser: null, isManager: false };
  }

  try {
    const emailCandidates = buildEmailLookupCandidates(email);
    if (!emailCandidates.length) {
      return { dbUser: null, isManager: false };
    }

    const dbUsers = await prisma.user.findMany({
      where: {
        OR: emailCandidates.map((candidate) => ({
          email: {
            equals: candidate,
            mode: 'insensitive',
          },
        })),
      },
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
      roleId: true,
      role: {
        select: {
          id: true,
          name: true,
          roleType: true,
          permissionsJson: true,
        },
      },
    },
  });

    const dbUser = pickBestEmailMatch(dbUsers, emailCandidates);
    let isManager = false;
    if (dbUser?.id) {
      const teamCount = await prisma.user.count({
        where: { managerId: dbUser.id, isActive: true },
      });
      isManager = teamCount > 0;
    }

    return { dbUser, isManager };
  } catch (error) {
    logger.warn(`Failed DB user enrichment for ${email}: ${error.message}`);
    return { dbUser: null, isManager: false };
  }
}

function buildUserResponse(cognitoUser, dbUser, isManager) {
  const fullName = dbUser?.fullName
    || cognitoUser.name
    || `${dbUser?.firstName || cognitoUser.firstName || ''} ${dbUser?.lastName || cognitoUser.lastName || ''}`.trim()
    || null;

  return {
    id: dbUser?.id || cognitoUser.username,
    email: cognitoUser.email || dbUser?.email || null,
    firstName: dbUser?.firstName || cognitoUser.firstName,
    lastName: dbUser?.lastName || cognitoUser.lastName,
    fullName,
    name: fullName,
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
}

function normalizeRoleString(value) {
  return String(value || '').trim().toLowerCase();
}

function hasAdminAccess(dbUser) {
  if (!dbUser) return false;

  const roleName = normalizeRoleString(dbUser.role?.name);
  const roleType = normalizeRoleString(dbUser.role?.roleType);
  if (roleType === 'admin' || roleType === 'system' || roleType === 'super_admin') {
    return true;
  }
  if (roleName.includes('admin')) {
    return true;
  }

  const permissionsJson = dbUser.role?.permissionsJson;
  if (!permissionsJson) return false;

  let permissions = permissionsJson;
  if (typeof permissionsJson === 'string') {
    try {
      permissions = JSON.parse(permissionsJson);
    } catch {
      permissions = {};
    }
  }

  const pages = permissions?.pages && typeof permissions.pages === 'object' ? permissions.pages : {};
  return Boolean(
    pages.admin === true
    || pages.users === true
    || pages.userManagement === true
    || pages.adminUsers === true
    || pages['/admin/users'] === true
  );
}

async function requireAdminAccess(req, res, next) {
  try {
    const apiKey = req.headers['x-api-key'];
    if (apiKey === process.env.INTERNAL_API_KEY) {
      req.adminAccess = { isSystem: true };
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Invalid API key' },
      });
    }

    const accessToken = authHeader.split(' ')[1];
    const cognitoUser = await authService.getCurrentUser(accessToken);
    const { dbUser } = await getDatabaseUserProfile(cognitoUser.email);

    if (!hasAdminAccess(dbUser)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
    }

    req.adminAccess = { cognitoUser, dbUser };
    return next();
  } catch (error) {
    logger.warn(`Admin access check failed: ${error.message}`);
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Invalid API key' },
    });
  }
}

function normalizeAdminCreatePayload(body = {}) {
  const normalizedEmail = normalizePandaEmployeeEmail(body.email);
  const suppliedName = typeof body.name === 'string' ? body.name.trim() : '';
  let firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
  let lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';

  if ((!firstName || !lastName) && suppliedName) {
    const nameParts = suppliedName.split(/\s+/).filter(Boolean);
    if (!firstName && nameParts.length > 0) {
      firstName = nameParts[0];
    }
    if (!lastName && nameParts.length > 1) {
      lastName = nameParts.slice(1).join(' ');
    }
  }

  if (!firstName && normalizedEmail) {
    firstName = normalizedEmail.split('@')[0] || '';
  }
  if (!lastName) {
    lastName = 'User';
  }

  return {
    email: normalizedEmail,
    firstName,
    lastName,
    fullName: suppliedName || `${firstName} ${lastName}`.trim(),
    temporaryPassword: body.temporaryPassword || body.password,
    roleId: body.roleId || null,
    role: body.role || null,
    department: body.department || null,
    title: body.title || null,
    officeAssignment: body.officeAssignment || null,
    phone: body.phone || null,
    mobilePhone: body.mobilePhone || null,
    managerId: body.managerId || null,
    salesforceId: body.salesforceId || null,
    isActive: body.isActive !== false,
  };
}

async function resolveRoleForAdminCreate(roleId, roleName) {
  if (roleId) {
    const role = await prisma.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, roleType: true },
    });
    if (!role) {
      const error = new Error('Selected role was not found');
      error.code = 'VALIDATION_ERROR';
      throw error;
    }
    return role;
  }

  if (roleName) {
    return prisma.role.findFirst({
      where: {
        name: {
          equals: String(roleName).trim(),
          mode: 'insensitive',
        },
      },
      select: { id: true, name: true, roleType: true },
    });
  }

  return null;
}

async function upsertCrmUserRecordFromAdminPayload(payload, cognitoUsername) {
  const role = await resolveRoleForAdminCreate(payload.roleId, payload.role);
  const fullName = payload.fullName || `${payload.firstName || ''} ${payload.lastName || ''}`.trim() || payload.email;

  return prisma.user.upsert({
    where: { email: payload.email },
    update: {
      cognitoId: cognitoUsername || undefined,
      firstName: payload.firstName,
      lastName: payload.lastName,
      fullName,
      roleId: role?.id || null,
      department: payload.department,
      title: payload.title,
      officeAssignment: payload.officeAssignment,
      phone: payload.phone,
      mobilePhone: payload.mobilePhone,
      managerId: payload.managerId,
      salesforceId: payload.salesforceId,
      isActive: payload.isActive,
      status: payload.isActive ? 'ACTIVE' : 'INACTIVE',
    },
    create: {
      email: payload.email,
      cognitoId: cognitoUsername || null,
      firstName: payload.firstName,
      lastName: payload.lastName,
      fullName,
      roleId: role?.id || null,
      department: payload.department,
      title: payload.title,
      officeAssignment: payload.officeAssignment,
      phone: payload.phone,
      mobilePhone: payload.mobilePhone,
      managerId: payload.managerId,
      salesforceId: payload.salesforceId,
      isActive: payload.isActive,
      status: payload.isActive ? 'ACTIVE' : 'INACTIVE',
    },
    include: {
      role: {
        select: { id: true, name: true, roleType: true },
      },
      manager: {
        select: { id: true, fullName: true, firstName: true, lastName: true },
      },
    },
  });
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

    const { dbUser, isManager } = await getDatabaseUserProfile(cognitoUser.email);
    const user = buildUserResponse(cognitoUser, dbUser, isManager);

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

    const { dbUser, isManager } = await getDatabaseUserProfile(cognitoUser.email);
    const user = buildUserResponse(cognitoUser, dbUser, isManager);

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
// Admin: Create user
router.post('/admin/users', requireAdminAccess, async (req, res, next) => {
  try {
    const payload = normalizeAdminCreatePayload(req.body);

    if (!payload.email || !payload.firstName || !payload.lastName || !payload.temporaryPassword) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Email, first name, last name, and temporaryPassword are required' },
      });
    }

    const result = await authService.adminCreateUser(payload.email, payload.fullName, payload.temporaryPassword, {
      role: payload.role,
      department: payload.department,
      salesforceId: payload.salesforceId,
      firstName: payload.firstName,
      lastName: payload.lastName,
    });
    const crmUser = await upsertCrmUserRecordFromAdminPayload(payload, result.username);

    logger.info(`Admin created user: ${payload.email}`);
    res.json({
      success: true,
      data: {
        ...result,
        user: crmUser,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Admin: Get user
router.get('/admin/users/:email', requireAdminAccess, async (req, res, next) => {
  try {
    const user = await authService.adminGetUser(normalizePandaEmployeeEmail(req.params.email));
    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
});

// Admin: Update user attributes
router.patch('/admin/users/:email', requireAdminAccess, async (req, res, next) => {
  try {
    const normalizedEmail = normalizePandaEmployeeEmail(req.params.email);
    const result = await authService.adminUpdateUserAttributes(normalizedEmail, req.body);
    logger.info(`Admin updated user: ${normalizedEmail}`);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Admin: Set user password
router.post('/admin/users/:email/password', requireAdminAccess, async (req, res, next) => {
  try {
    const password = req.body.password || req.body.newPassword;

    if (!password) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Password is required' },
      });
    }

    const normalizedEmail = normalizePandaEmployeeEmail(req.params.email);
    const result = await authService.adminSetPassword(normalizedEmail, password);
    logger.info(`Admin set password for: ${normalizedEmail}`);
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
