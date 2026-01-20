// Cognito JWT Authentication Middleware
// Validates tokens from Amazon Cognito User Pool
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { cognitoConfig } from '../config/cognito.js';

// Create verifier instance (lazy initialized)
let verifier = null;

function getVerifier() {
  if (!verifier) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: cognitoConfig.userPoolId,
      tokenUse: 'access',
      clientId: cognitoConfig.clientId,
    });
  }
  return verifier;
}

// Development bypass for local testing
const isDevelopment = process.env.NODE_ENV === 'development';
const devBypassAuth = process.env.DEV_BYPASS_AUTH === 'true';

/**
 * Main authentication middleware
 * Validates Cognito JWT tokens and attaches user info to request
 */
export async function cognitoAuthMiddleware(req, res, next) {
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

    // Support internal API key auth for service-to-service calls
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

    if (type !== 'Bearer') {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid authorization type. Use Bearer token.' },
      });
    }

    // Development bypass - decode without verification
    if (isDevelopment && devBypassAuth) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        req.user = {
          id: payload.sub || payload.userId,
          email: payload.email,
          name: payload.name,
          role: payload['custom:role'] || 'user',
          department: payload['custom:department'],
          salesforceId: payload['custom:salesforce_id'],
          cognitoId: payload.sub,
        };
        return next();
      } catch {
        return res.status(401).json({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid token format' },
        });
      }
    }

    // Production: Verify with Cognito
    const payload = await getVerifier().verify(token);

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload['custom:role'] || 'user',
      department: payload['custom:department'],
      salesforceId: payload['custom:salesforce_id'],
      cognitoId: payload.sub,
      groups: payload['cognito:groups'] || [],
    };

    return next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);

    // Provide specific error messages for common issues
    if (error.message?.includes('Token expired')) {
      return res.status(401).json({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Token has expired. Please log in again.' },
      });
    }

    if (error.message?.includes('Invalid signature')) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Token signature is invalid.' },
      });
    }

    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Token verification failed' },
    });
  }
}

/**
 * Role-based authorization middleware factory
 * @param {...string} roles - Allowed roles
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    // System calls bypass role checks
    if (req.user.isSystem) {
      return next();
    }

    // Check if user has any of the required roles
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: `Access denied. Required role: ${roles.join(' or ')}`,
        },
      });
    }

    next();
  };
}

/**
 * Optional authentication - doesn't fail if no token provided
 * Useful for endpoints that behave differently for authenticated users
 */
export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    req.user = null;
    return next();
  }

  // Try to authenticate, but don't fail if it doesn't work
  try {
    await cognitoAuthMiddleware(req, res, () => {
      next();
    });
  } catch {
    req.user = null;
    next();
  }
}

export default cognitoAuthMiddleware;
