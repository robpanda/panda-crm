// Authentication Middleware
// Validates JWT tokens from Amazon Cognito
import { logger } from './logger.js';

// In production, this will verify Cognito JWT tokens
// For development, we accept a simple API key or mock token

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No authorization header provided' },
      });
    }

    // Support both "Bearer <token>" and "ApiKey <key>" formats
    const [type, token] = authHeader.split(' ');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid authorization format' },
      });
    }

    if (type === 'ApiKey') {
      // Simple API key auth for internal service-to-service calls
      if (token === process.env.INTERNAL_API_KEY) {
        req.user = { id: 'system', role: 'system', isSystem: true };
        return next();
      }
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid API key' },
      });
    }

    if (type === 'Bearer') {
      // JWT token verification
      const user = await verifyToken(token);
      req.user = user;
      return next();
    }

    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid authorization type' },
    });

  } catch (error) {
    logger.error('Auth middleware error:', error);
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token verification failed' },
    });
  }
}

async function verifyToken(token) {
  const { PrismaClient } = await import('@prisma/client');

  if (process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true') {
    // Development bypass - decode JWT without verification
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const cognitoId = payload.sub;
      const email = payload.email;

      // Look up user by email first, then cognitoId
      const prisma = new PrismaClient();
      try {
        let user = null;
        if (email) {
          user = await prisma.user.findUnique({
            where: { email },
            include: { role: true },
          });
        }
        if (!user && cognitoId) {
          user = await prisma.user.findFirst({
            where: { cognitoId },
            include: { role: true },
          });
        }

        if (user) {
          return {
            id: user.id,
            email: user.email,
            role: user.role?.name || 'user',
            roleType: user.role?.roleType,
            cognitoId: cognitoId,
          };
        }
      } finally {
        await prisma.$disconnect();
      }

      return {
        id: payload.sub || payload.userId,
        email: payload.email,
        role: payload.role || 'user',
        cognitoId: payload.sub,
      };
    } catch {
      throw new Error('Invalid token format');
    }
  }

  // Production: Verify with Cognito
  const { CognitoJwtVerifier } = await import('aws-jwt-verify');

  const verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    tokenUse: 'access',
    clientId: process.env.COGNITO_CLIENT_ID,
  });

  logger.info('Verifying token...');
  const payload = await verifier.verify(token);
  const cognitoId = payload.sub;
  const email = payload.email;
  logger.info('Token payload:', { sub: cognitoId, tokenUse: payload.token_use });

  // Look up user by email first (from ID token), then by cognitoId (from access token)
  const prisma = new PrismaClient();
  try {
    let user = null;

    // Access tokens don't have email, so we primarily use cognitoId
    if (email) {
      user = await prisma.user.findUnique({
        where: { email },
        include: { role: true },
      });
    }

    if (!user && cognitoId) {
      user = await prisma.user.findFirst({
        where: { cognitoId },
        include: { role: true },
      });
    }

    if (user) {
      return {
        id: user.id,
        email: user.email,
        role: user.role?.name || payload['custom:role'] || 'user',
        roleType: user.role?.roleType,
        cognitoId: cognitoId,
        groups: payload['cognito:groups'] || [],
      };
    }

    // User not in database - return basic info
    logger.warn('User not found in database for cognitoId:', cognitoId);
    return {
      id: cognitoId,
      email: email,
      role: payload['custom:role'] || 'user',
      cognitoId: cognitoId,
      groups: payload['cognito:groups'] || [],
    };
  } finally {
    await prisma.$disconnect();
  }
}

// Role-based authorization middleware factory
// Maps database roleType to middleware role names
const ROLE_TYPE_MAP = {
  'admin': ['admin', 'super_admin'],
  'ADMIN': ['admin', 'super_admin'],
  'executive': ['admin', 'super_admin', 'executive'],
  'EXECUTIVE': ['admin', 'super_admin', 'executive'],
  'office_manager': ['office_manager'],
  'OFFICE_MANAGER': ['office_manager'],
  'sales_manager': ['sales_manager'],
  'SALES_MANAGER': ['sales_manager'],
  'project_manager': ['project_manager'],
  'PROJECT_MANAGER': ['project_manager'],
};

export function requireRole(...roles) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    if (req.user.isSystem) {
      return next(); // System calls bypass role checks
    }

    // Check direct role match first
    if (roles.includes(req.user.role)) {
      return next();
    }

    // If no direct match, look up user's roleType from database
    if (req.user.email || req.user.id) {
      try {
        const { PrismaClient } = await import('@prisma/client');
        const prisma = new PrismaClient();

        const dbUser = await prisma.user.findFirst({
          where: req.user.email ? { email: req.user.email } : { cognitoId: req.user.id },
          include: { role: true },
        });

        await prisma.$disconnect();

        if (dbUser?.role?.roleType) {
          const mappedRoles = ROLE_TYPE_MAP[dbUser.role.roleType] || [];
          // Check if any of the user's mapped roles match required roles
          if (mappedRoles.some(r => roles.includes(r))) {
            return next();
          }
          // Also check roleType directly (e.g., 'admin' role type grants 'admin' permission)
          if (roles.includes(dbUser.role.roleType.toLowerCase())) {
            return next();
          }
        }
      } catch (error) {
        logger.error('Error looking up user role from database:', error);
      }
    }

    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
    });
  };
}

export default authMiddleware;
