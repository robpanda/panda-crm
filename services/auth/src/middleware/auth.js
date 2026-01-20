// Authentication Middleware for Auth Service
// Validates JWT tokens from Amazon Cognito
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { logger } from './logger.js';

let verifier = null;

function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: process.env.COGNITO_USER_POOL_ID,
      tokenUse: 'access',
      clientId: process.env.COGNITO_CLIENT_ID,
    });
  }
  return verifier;
}

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'No authorization header provided',
      });
    }

    const [type, token] = authHeader.split(' ');

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authorization format',
      });
    }

    if (type === 'ApiKey') {
      // Simple API key auth for internal service-to-service calls
      if (token === process.env.INTERNAL_API_KEY) {
        req.user = { sub: 'system', userId: 'system', role: 'system', isSystem: true };
        return next();
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
      });
    }

    if (type === 'Bearer') {
      const user = await verifyToken(token);
      req.user = user;
      return next();
    }

    return res.status(401).json({
      success: false,
      error: 'Invalid authorization type',
    });

  } catch (error) {
    logger.error('Auth middleware error:', error.message);
    return res.status(401).json({
      success: false,
      error: 'Token verification failed',
    });
  }
}

async function verifyToken(token) {
  try {
    const cognitoVerifier = getVerifier();
    const payload = await cognitoVerifier.verify(token);

    return {
      sub: payload.sub,
      userId: payload.sub,
      email: payload.email || payload.username,
      role: payload['custom:role'] || 'user',
      cognitoId: payload.sub,
      groups: payload['cognito:groups'] || [],
    };
  } catch (error) {
    // If Cognito verification fails, try simple JWT decode for backwards compatibility
    logger.warn('Cognito verification failed, trying JWT decode:', error.message);

    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      return {
        sub: payload.sub || payload.userId,
        userId: payload.sub || payload.userId,
        email: payload.email,
        role: payload.role || payload['custom:role'] || 'user',
        cognitoId: payload.sub,
      };
    } catch {
      throw new Error('Invalid token format');
    }
  }
}

// Middleware that allows requests through without auth but populates user if token exists
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return next();
    }

    const [type, token] = authHeader.split(' ');

    if (type === 'Bearer' && token) {
      try {
        req.user = await verifyToken(token);
      } catch (error) {
        // Ignore auth errors for optional auth
        logger.debug('Optional auth failed:', error.message);
      }
    }

    next();
  } catch (error) {
    next();
  }
}

export default authMiddleware;
