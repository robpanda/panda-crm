// Authentication Middleware for Integrations Service
import { logger } from './logger.js';

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'No authorization header provided' },
      });
    }

    const [type, token] = authHeader.split(' ');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid authorization format' },
      });
    }

    if (type === 'ApiKey') {
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
  if (process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true') {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const cognitoId = payload.sub;

      // Look up the user in the database to get the actual database ID
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      try {
        const dbUser = await prisma.user.findFirst({
          where: { cognitoId },
          select: { id: true, email: true, roleId: true, role: { select: { name: true, roleType: true } } },
        });

        if (dbUser) {
          return {
            id: dbUser.id, // Use database ID, not Cognito ID
            email: dbUser.email || payload.email,
            role: dbUser.role?.name || payload.role || 'user',
            roleType: dbUser.role?.roleType,
            cognitoId: cognitoId,
          };
        }
      } finally {
        await prisma.$disconnect();
      }

      // Fallback to payload values
      return {
        id: payload.userId || payload.sub,
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
  const { PrismaClient } = await import('@prisma/client');

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

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    if (req.user.isSystem) {
      return next();
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
    }

    next();
  };
}

export default authMiddleware;
