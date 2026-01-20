// Authentication Middleware for Photocam Service
import { logger } from './logger.js';
import prisma from '../prisma.js';

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
      // Internal service-to-service calls
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
      const tokenUser = await verifyToken(token);

      // Look up the actual database user by cognitoId or email
      // This resolves the Cognito sub UUID to the PostgreSQL user ID
      let dbUser = null;
      try {
        dbUser = await prisma.user.findFirst({
          where: {
            OR: [
              { cognitoId: tokenUser.cognitoId },
              { email: tokenUser.email },
            ],
          },
          select: { id: true, email: true, firstName: true, lastName: true },
        });
      } catch (dbError) {
        logger.warn('Could not look up database user:', dbError.message);
      }

      req.user = {
        ...tokenUser,
        id: dbUser?.id || tokenUser.cognitoId, // Use DB user ID if found, fallback to Cognito sub
        cognitoId: tokenUser.cognitoId,
        dbUser: dbUser,
      };

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

  const { CognitoJwtVerifier } = await import('aws-jwt-verify');

  const verifier = CognitoJwtVerifier.create({
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    tokenUse: 'access',
    clientId: process.env.COGNITO_CLIENT_ID,
  });

  const payload = await verifier.verify(token);

  return {
    id: payload.sub,
    email: payload.email,
    role: payload['custom:role'] || 'user',
    cognitoId: payload.sub,
    groups: payload['cognito:groups'] || [],
  };
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
