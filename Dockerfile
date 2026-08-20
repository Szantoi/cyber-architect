# ============================================================================
# STAGE 1: Frontend & Asset Build Stage
# ============================================================================
FROM node:22-alpine AS builder

WORKDIR /app
ENV HUSKY=0

COPY package*.json ./
RUN npm ci

# Keep backend configuration and local credentials out of the frontend builder
# entirely. The frontend build only needs these tracked sources.
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
COPY server/scripts/buildFrontend.js ./server/scripts/buildFrontend.js
RUN npm run build

# ============================================================================
# STAGE 2: Production Server Runtime (Lightweight Alpine)
# ============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV SQLITE_DB_PATH=/app/data/portfolio.sqlite

COPY package*.json ./
RUN npm pkg delete scripts.prepare \
    && apk add --no-cache --virtual .build-deps python3 make g++ \
    && npm ci --omit=dev \
    && apk del .build-deps

# Copy backend files and compiled frontend assets
COPY server ./server
COPY --from=builder /app/dist ./dist

# Create persistent storage folder for SQLite database and backups
RUN mkdir -p /app/data /app/data/backups \
    && chown -R node:node /app/data

EXPOSE 3001

USER node

CMD ["node", "server/index.js"]
