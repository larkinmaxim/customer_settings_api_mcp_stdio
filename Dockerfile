# Multi-stage Dockerfile for Transporeon Company Settings MCP Server
# Implements security best practices and minimal attack surface

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install ALL dependencies for build (including devDependencies like TypeScript)
COPY package*.json ./
RUN npm ci && npm cache clean --force

# Copy source code and build
COPY . .
RUN npm run build

# Install production dependencies only for final stage
RUN npm ci --only=production && npm cache clean --force

# Production stage
FROM node:18-alpine AS production

# Create non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -S appuser -u 1001 -G appgroup

# Install security updates
RUN apk upgrade --no-cache

# Set working directory and ownership
WORKDIR /app
RUN chown appuser:appgroup /app

# Copy built application with proper ownership
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/package.json ./

# Create logs directory
RUN mkdir -p /var/log/transporeon-mcp && \
    chown appuser:appgroup /var/log/transporeon-mcp

# Switch to non-root user
USER appuser

# Set environment variables (non-sensitive only)
ENV NODE_ENV=production
ENV TP_SETTINGS_DEFAULT_ENV=pd
ENV TP_SETTINGS_TIMEOUT=30000

# Health check to verify container is running correctly
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const config = require('./dist/config.js'); config.loadConfig(); console.log('Health check passed')" || exit 1

# Expose port for HTTP MCP transport
EXPOSE 3001

# Start the MCP server with HTTP transport
CMD ["node", "dist/index.js", "--transport", "streamable-http", "--port", "3001"]
