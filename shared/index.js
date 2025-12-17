// Shared utilities and exports for Panda CRM microservices
import { PrismaClient } from '@prisma/client';

// Singleton Prisma client
let prisma;

export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return prisma;
}

// Standard API response helpers
export function successResponse(data, meta = {}) {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

export function errorResponse(message, code = 'ERROR', statusCode = 500) {
  return {
    success: false,
    error: {
      code,
      message,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
}

export function paginatedResponse(data, page, limit, total) {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    },
  };
}

// Validation helpers
export function validateRequired(obj, fields) {
  const missing = fields.filter((field) => !obj[field]);
  if (missing.length > 0) {
    throw new ValidationError(`Missing required fields: ${missing.join(', ')}`);
  }
}

export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }
}

export function validatePhone(phone) {
  // Strip non-digits
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 11) {
    throw new ValidationError('Invalid phone number');
  }
  return digits.length === 11 && digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
}

// Format phone to E.164
export function formatPhoneE164(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// Custom error classes
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.code = 'VALIDATION_ERROR';
  }
}

export class NotFoundError extends Error {
  constructor(resource, id) {
    super(`${resource} not found: ${id}`);
    this.name = 'NotFoundError';
    this.statusCode = 404;
    this.code = 'NOT_FOUND';
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
    this.statusCode = 401;
    this.code = 'UNAUTHORIZED';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
    this.statusCode = 403;
    this.code = 'FORBIDDEN';
  }
}

// ID generation (CUID-like)
export function generateId(prefix = '') {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return prefix ? `${prefix}_${timestamp}${random}` : `${timestamp}${random}`;
}

// Salesforce ID validation
export function isValidSalesforceId(id) {
  return /^[a-zA-Z0-9]{15}$|^[a-zA-Z0-9]{18}$/.test(id);
}

// Date helpers
export function toISODate(date) {
  if (!date) return null;
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Query builder helpers for filtering
export function buildWhereClause(filters, fieldMappings = {}) {
  const where = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') continue;

    const field = fieldMappings[key] || key;

    // Handle special operators
    if (key.endsWith('_gte')) {
      const actualField = fieldMappings[key.replace('_gte', '')] || key.replace('_gte', '');
      where[actualField] = { ...where[actualField], gte: value };
    } else if (key.endsWith('_lte')) {
      const actualField = fieldMappings[key.replace('_lte', '')] || key.replace('_lte', '');
      where[actualField] = { ...where[actualField], lte: value };
    } else if (key.endsWith('_like')) {
      const actualField = fieldMappings[key.replace('_like', '')] || key.replace('_like', '');
      where[actualField] = { contains: value, mode: 'insensitive' };
    } else if (Array.isArray(value)) {
      where[field] = { in: value };
    } else {
      where[field] = value;
    }
  }

  return where;
}

// Parse pagination params
export function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

// Parse sort params
export function parseSort(query, allowedFields = []) {
  const sortBy = query.sortBy || 'createdAt';
  const sortOrder = query.sortOrder?.toLowerCase() === 'asc' ? 'asc' : 'desc';

  if (allowedFields.length > 0 && !allowedFields.includes(sortBy)) {
    return { createdAt: 'desc' };
  }

  return { [sortBy]: sortOrder };
}

export default {
  getPrismaClient,
  successResponse,
  errorResponse,
  paginatedResponse,
  validateRequired,
  validateEmail,
  validatePhone,
  formatPhoneE164,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  generateId,
  isValidSalesforceId,
  toISODate,
  addDays,
  buildWhereClause,
  parsePagination,
  parseSort,
};
