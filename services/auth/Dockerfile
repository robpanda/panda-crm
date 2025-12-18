# Auth Microservice Dockerfile
FROM node:20-slim

WORKDIR /app

# Copy service files
COPY services/auth/package*.json ./

# Install dependencies
RUN npm install --omit=dev

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
