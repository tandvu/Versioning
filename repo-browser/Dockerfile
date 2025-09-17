# Multi-stage build for repo-browser
FROM node:18-alpine AS builder
# Install Maven for opt-soa builds
RUN apk add --no-cache maven

# Set working directory
WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Install dependencies for all workspaces (including dev dependencies for building)
RUN npm install --workspaces

# Copy source code
COPY . .

# Build the client (React app)
RUN npm run build --workspace client

# Build the server (TypeScript compilation)
RUN npm run build --workspace server

# Production stage
FROM node:18-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files for production dependencies only
COPY package*.json ./
COPY server/package*.json ./server/

# Install only production dependencies
RUN npm ci --only=production --workspaces && npm cache clean --force

# Copy built server from builder stage
COPY --from=builder /app/server/dist ./server/dist

# Copy built client from builder stage (this will be served by Express)
COPY --from=builder /app/client/dist ./client/dist

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership of the app directory to nodejs user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose the port the app runs on
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/ || exit 1

# Start the server in production mode (serving client files)
CMD ["npm", "run", "start:prod"]
