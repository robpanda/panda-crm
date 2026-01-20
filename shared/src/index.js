// Panda CRM Shared Module
// Exports all shared services, middleware, and utilities

// Services
export { searchService } from './services/searchService.js';
export { websocketService } from './services/websocketService.js';
export { fileUploadService } from './services/fileUploadService.js';

// Middleware
export {
  AppError,
  ValidationError,
  NotFoundError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  asyncHandler,
  validateRequest,
  errorHandler,
  notFoundHandler,
  requestLogger,
} from './middleware/errorHandler.js';

// Routes
export { default as searchRoutes } from './routes/search.js';
export { default as fileRoutes } from './routes/files.js';

// Swagger
export { setupSwagger, swaggerSpec } from './swagger/swagger.js';

// Re-export Prisma client for convenience
export { PrismaClient } from '@prisma/client';
