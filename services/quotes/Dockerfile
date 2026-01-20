# Quotes Microservice Dockerfile
FROM node:20-slim

# Install OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy shared modules
COPY shared/prisma ./shared/prisma
COPY shared/config ./shared/config
COPY shared/middleware ./shared/middleware

# Copy service files
COPY services/quotes/package*.json ./

# Install all dependencies (including prisma for generation)
RUN npm install

# Generate Prisma client
RUN npx prisma generate --schema=./shared/prisma/schema.prisma

# Remove dev dependencies after Prisma generation
RUN npm prune --omit=dev

# Copy source code
COPY services/quotes/src ./src

# Create non-root user and change ownership
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nodejs && chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3006

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3006/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the service
CMD ["node", "src/index.js"]
