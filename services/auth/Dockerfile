# Auth Microservice Dockerfile
FROM node:20-slim

# Install OpenSSL for Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy service files
COPY services/auth/package*.json ./

# Copy Prisma schema from shared directory
COPY shared/prisma ./prisma

# Install dependencies (including devDependencies for prisma generate)
RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY services/auth/src ./src

# Create non-root user and change ownership
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs nodejs && chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the service
CMD ["node", "src/index.js"]
