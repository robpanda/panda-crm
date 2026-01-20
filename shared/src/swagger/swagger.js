// Swagger/OpenAPI Documentation Configuration
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Panda CRM API',
      version: '1.0.0',
      description: 'RESTful API for Panda Exteriors CRM system',
      contact: {
        name: 'Panda Exteriors Development',
        email: 'dev@pandaexteriors.com',
      },
      license: {
        name: 'Proprietary',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000/api',
        description: 'Development server',
      },
      {
        url: 'https://bamboo.pandaadmin.com/api',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT token from /auth/login',
        },
        cognitoAuth: {
          type: 'oauth2',
          flows: {
            password: {
              tokenUrl: 'https://cognito-idp.us-east-2.amazonaws.com',
              scopes: {},
            },
          },
        },
      },
      schemas: {
        // Common response schemas
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Validation failed' },
                details: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
        PaginatedResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                items: { type: 'array' },
                pagination: {
                  type: 'object',
                  properties: {
                    page: { type: 'integer', example: 1 },
                    limit: { type: 'integer', example: 20 },
                    total: { type: 'integer', example: 100 },
                    totalPages: { type: 'integer', example: 5 },
                  },
                },
              },
            },
          },
        },

        // Entity schemas
        Account: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'cuid' },
            salesforceId: { type: 'string', nullable: true },
            name: { type: 'string', example: 'Acme Corporation' },
            type: { type: 'string', enum: ['PROSPECT', 'CUSTOMER', 'PARTNER', 'COMPETITOR', 'OTHER'] },
            industry: { type: 'string', nullable: true },
            phone: { type: 'string', nullable: true },
            email: { type: 'string', format: 'email', nullable: true },
            website: { type: 'string', format: 'uri', nullable: true },
            billingStreet: { type: 'string', nullable: true },
            billingCity: { type: 'string', nullable: true },
            billingState: { type: 'string', nullable: true },
            billingPostalCode: { type: 'string', nullable: true },
            isActive: { type: 'boolean', default: true },
            ownerId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Contact: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'cuid' },
            salesforceId: { type: 'string', nullable: true },
            firstName: { type: 'string', example: 'John' },
            lastName: { type: 'string', example: 'Doe' },
            email: { type: 'string', format: 'email', nullable: true },
            phone: { type: 'string', nullable: true },
            mobilePhone: { type: 'string', nullable: true },
            title: { type: 'string', nullable: true },
            accountId: { type: 'string', nullable: true },
            isPrimary: { type: 'boolean', default: false },
            isActive: { type: 'boolean', default: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Lead: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'cuid' },
            salesforceId: { type: 'string', nullable: true },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            email: { type: 'string', format: 'email', nullable: true },
            phone: { type: 'string', nullable: true },
            company: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED', 'DEAD'] },
            source: { type: 'string', nullable: true },
            rating: { type: 'string', enum: ['HOT', 'WARM', 'COLD'], nullable: true },
            ownerId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Opportunity: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'cuid' },
            salesforceId: { type: 'string', nullable: true },
            name: { type: 'string', example: 'Roof Replacement - 123 Main St' },
            accountId: { type: 'string' },
            stage: { type: 'string', enum: ['LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'] },
            amount: { type: 'number', format: 'decimal', example: 15000.00 },
            probability: { type: 'integer', minimum: 0, maximum: 100, example: 75 },
            closeDate: { type: 'string', format: 'date', nullable: true },
            type: { type: 'string', nullable: true },
            source: { type: 'string', nullable: true },
            ownerId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        WorkOrder: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'cuid' },
            salesforceId: { type: 'string', nullable: true },
            workOrderNumber: { type: 'string', example: 'WO-2025-001' },
            subject: { type: 'string' },
            description: { type: 'string', nullable: true },
            status: { type: 'string', enum: ['NEW', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] },
            priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
            opportunityId: { type: 'string' },
            accountId: { type: 'string' },
            scheduledStart: { type: 'string', format: 'date-time', nullable: true },
            scheduledEnd: { type: 'string', format: 'date-time', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'cuid' },
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            role: { type: 'string', enum: ['admin', 'manager', 'sales_rep', 'technician', 'viewer'] },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      parameters: {
        pageParam: {
          name: 'page',
          in: 'query',
          description: 'Page number',
          required: false,
          schema: { type: 'integer', default: 1, minimum: 1 },
        },
        limitParam: {
          name: 'limit',
          in: 'query',
          description: 'Number of items per page',
          required: false,
          schema: { type: 'integer', default: 20, minimum: 1, maximum: 100 },
        },
        sortParam: {
          name: 'sort',
          in: 'query',
          description: 'Sort field (prefix with - for descending)',
          required: false,
          schema: { type: 'string', example: '-createdAt' },
        },
        searchParam: {
          name: 'search',
          in: 'query',
          description: 'Search query string',
          required: false,
          schema: { type: 'string' },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Accounts', description: 'Account management' },
      { name: 'Contacts', description: 'Contact management' },
      { name: 'Leads', description: 'Lead management' },
      { name: 'Opportunities', description: 'Opportunity/Deal management' },
      { name: 'Work Orders', description: 'Work order management' },
      { name: 'Quotes', description: 'Quote management' },
      { name: 'Invoices', description: 'Invoice management' },
      { name: 'Payments', description: 'Payment management' },
      { name: 'Commissions', description: 'Commission management' },
      { name: 'Search', description: 'Global search' },
      { name: 'Files', description: 'File upload and management' },
      { name: 'Reports', description: 'Analytics and reporting' },
      { name: 'Integrations', description: 'External service integrations' },
    ],
  },
  apis: [
    './src/routes/*.js',
    './services/*/src/routes/*.js',
    './shared/src/routes/*.js',
  ],
};

const swaggerSpec = swaggerJsdoc(options);

/**
 * Setup Swagger UI middleware
 */
export function setupSwagger(app, basePath = '/api-docs') {
  // Serve Swagger UI
  app.use(basePath, swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Panda CRM API Documentation',
  }));

  // Serve raw OpenAPI spec as JSON
  app.get(`${basePath}.json`, (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
  });

  console.log(`Swagger UI available at ${basePath}`);
}

export { swaggerSpec };

/**
 * JSDoc annotations for routes - examples:
 *
 * @swagger
 * /accounts:
 *   get:
 *     summary: List all accounts
 *     tags: [Accounts]
 *     parameters:
 *       - $ref: '#/components/parameters/pageParam'
 *       - $ref: '#/components/parameters/limitParam'
 *       - $ref: '#/components/parameters/searchParam'
 *     responses:
 *       200:
 *         description: List of accounts
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *
 *   post:
 *     summary: Create a new account
 *     tags: [Accounts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Account'
 *     responses:
 *       201:
 *         description: Account created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
