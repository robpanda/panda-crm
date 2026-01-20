# Dockerfile for Panda CRM Migration Scripts
# Used for scheduled Salesforce sync tasks

FROM node:18-alpine

WORKDIR /app

# Install dependencies for Prisma
RUN apk add --no-cache openssl

# Copy package files
COPY shared/package*.json ./shared/
COPY scripts/migration/package*.json ./scripts/migration/

# Install shared dependencies (includes Prisma)
WORKDIR /app/shared
RUN npm ci --omit=dev

# Generate Prisma client
COPY shared/prisma ./prisma
RUN npx prisma generate

# Install migration script dependencies
WORKDIR /app/scripts/migration
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy source files
WORKDIR /app
COPY shared ./shared
COPY scripts/migration ./scripts/migration

# Set working directory for running scripts
WORKDIR /app/scripts/migration

# Default command
CMD ["node", "comprehensive-daily-sync.js"]
