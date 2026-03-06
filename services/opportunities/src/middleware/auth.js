// Authentication Middleware
// Validates JWT tokens from Amazon Cognito
import { logger } from './logger.js';

// In production, this will verify Cognito JWT tokens
// For development, we accept a simple API key or mock token

const PANDA_EMPLOYEE_EMAIL_DOMAINS = new Set(['pandaexteriors.com', 'panda-exteriors.com']);

function normalizeCandidate(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function buildEmailLookupCandidates(values = []) {
  const queue = Array.isArray(values) ? values : [values];
  const candidates = [];
  const seen = new Set();

  const addCandidate = (value) => {
    const candidate = normalizeCandidate(value);
    if (!candidate) return;
    const key = candidate.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  queue.forEach(addCandidate);
  queue.map((value) => normalizeCandidate(value)?.toLowerCase()).filter(Boolean).forEach(addCandidate);

  for (const rawCandidate of queue) {
    const email = normalizeCandidate(rawCandidate)?.toLowerCase();
    if (!email) continue;

    const atIndex = email.lastIndexOf('@');
    if (atIndex <= 0 || atIndex === email.length - 1) {
      continue;
    }

    const localPart = email.slice(0, atIndex);
    const domainPart = email.slice(atIndex + 1);
    addCandidate(`${localPart}@${domainPart}`);

    if (PANDA_EMPLOYEE_EMAIL_DOMAINS.has(domainPart)) {
      const dotlessLocalPart = localPart.replace(/\./g, '');
      for (const domain of PANDA_EMPLOYEE_EMAIL_DOMAINS) {
        addCandidate(`${localPart}@${domain}`);
        addCandidate(`${dotlessLocalPart}@${domain}`);
      }
    }
  }

  return candidates;
}

async function findDatabaseUser(prisma, { emailCandidates = [], cognitoCandidates = [], userIdCandidates = [] } = {}) {
  let user = null;

  for (const emailCandidate of emailCandidates) {
    user = await prisma.user.findFirst({
      where: {
        email: {
          equals: emailCandidate,
          mode: 'insensitive',
        },
      },
      include: { role: true },
    });
    if (user) return user;
  }

  for (const cognitoCandidate of cognitoCandidates) {
    user = await prisma.user.findFirst({
      where: { cognitoId: cognitoCandidate },
      include: { role: true },
    });
    if (user) return user;
  }

  for (const userIdCandidate of userIdCandidates) {
    user = await prisma.user.findFirst({
      where: {
        OR: [
          { id: userIdCandidate },
          { cognitoId: userIdCandidate },
        ],
      },
      include: { role: true },
    });
    if (user) return user;
  }

  return null;
}

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
  // TODO: Implement Cognito JWT verification
  // For now, use simple JWT decoding for development

  if (process.env.NODE_ENV === 'development' && process.env.DEV_BYPASS_AUTH === 'true') {
    // Development bypass - decode JWT without verification
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      const cognitoCandidates = [...new Set([
        payload.sub,
        payload.username,
        payload['cognito:username'],
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean))];
      const cognitoId = cognitoCandidates[0] || null;
      const emailCandidates = buildEmailLookupCandidates([
        payload.email,
        payload.username,
        payload['cognito:username'],
      ]);
      const userIdCandidates = [...new Set([
        normalizeCandidate(payload.userId),
        normalizeCandidate(payload['custom:userId']),
        normalizeCandidate(payload['custom:userid']),
      ].filter(Boolean))];

      // Look up the user in the database to get the actual database ID
      const { PrismaClient } = await import('@prisma/client');
      const prisma = new PrismaClient();
      try {
        const dbUser = await findDatabaseUser(prisma, {
          emailCandidates,
          cognitoCandidates,
          userIdCandidates,
        });

        if (dbUser) {
          return {
            id: dbUser.id, // Use database ID, not Cognito ID
            email: dbUser.email || emailCandidates[0] || null,
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
        id: cognitoId || userIdCandidates[0] || null,
        email: emailCandidates[0] || null,
        role: payload.role || 'user',
        cognitoId,
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
  const cognitoCandidates = [...new Set([
    payload.sub,
    payload.username,
    payload['cognito:username'],
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean))];
  const cognitoId = cognitoCandidates[0] || null;
  const emailCandidates = buildEmailLookupCandidates([
    payload.email,
    payload.username,
    payload['cognito:username'],
  ]);
  const userIdCandidates = [...new Set([
    normalizeCandidate(payload.userId),
    normalizeCandidate(payload['custom:userId']),
    normalizeCandidate(payload['custom:userid']),
  ].filter(Boolean))];
  logger.info('Token payload:', { sub: cognitoId, tokenUse: payload.token_use });

  // Look up user by email variants first, then by cognitoId/custom user ID claims.
  const prisma = new PrismaClient();
  try {
    const user = await findDatabaseUser(prisma, {
      emailCandidates,
      cognitoCandidates,
      userIdCandidates,
    });

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
      id: cognitoId || userIdCandidates[0] || null,
      email: emailCandidates[0] || null,
      role: payload['custom:role'] || 'user',
      cognitoId,
      groups: payload['cognito:groups'] || [],
    };
  } finally {
    await prisma.$disconnect();
  }
}

// Role-based authorization middleware factory
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    if (req.user.isSystem) {
      return next(); // System calls bypass role checks
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
