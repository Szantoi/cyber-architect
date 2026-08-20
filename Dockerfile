# ============================================================================
# STAGE 1: Frontend & Asset Build Stage
# ============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
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
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
    && apk add --no-cache sqlite \
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
