# syntax=docker/dockerfile:1
# =============================================================================
# Complicidad Backend — Dockerfile
#
# Multi-stage build:
#   1. deps:      Install all dependencies (tsx is a devDep but needed at runtime)
#   2. runtime:   Copy only what's needed (node_modules + src + tsconfig + package.json)
#
# The app runs TypeScript directly via tsx (no tsc compile step).
# TypeORM entity/migration paths use glob patterns that reference .ts source files,
# so the src/ directory must be present in the runtime image.
# =============================================================================

# ---- Stage 1: Dependencies ----
FROM node:22-alpine AS deps

WORKDIR /app

# Copy dependency manifests and install ALL deps
# tsx is listed in devDependencies but is required by the start script at runtime
COPY package*.json ./
RUN npm ci && npm cache clean --force

# ---- Stage 2: Runtime ----
FROM node:22-alpine AS runtime

WORKDIR /app

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nodeuser

# Copy node_modules (with devDeps) from the deps stage
COPY --from=deps --chown=nodeuser:nodejs /app/node_modules ./node_modules

# Copy application source code — needed at runtime for TypeORM entity glob patterns
# and tsx on-the-fly compilation
COPY --chown=nodeuser:nodejs src/ ./src/

# Copy config files that tsx and TypeORM need at runtime
COPY --chown=nodeuser:nodejs tsconfig.json package.json ./

# Switch to non-root user
USER nodeuser

# Expose the configured port
EXPOSE 3000

# Health check against the unauthenticated /health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the server (tsx compiles TypeScript on-the-fly).
# Node 20.6+ requires tsx to be loaded with --import, not --loader.
CMD ["node", "--import", "tsx", "src/server.ts"]
