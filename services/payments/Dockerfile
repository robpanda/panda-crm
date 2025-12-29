FROM node:20-alpine

WORKDIR /app

# Install OpenSSL for Prisma native binaries
RUN apk add --no-cache openssl openssl-dev

# Copy shared prisma schema
COPY shared/prisma ./prisma/

# Copy service package.json
COPY services/payments/package*.json ./

# Install dependencies
RUN npm install

# Generate Prisma client (use dummy URL for build)
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" npx prisma generate

# Copy service source
COPY services/payments/src ./src/

# Expose port
EXPOSE 3010

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3010/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start service
CMD ["node", "src/index.js"]
