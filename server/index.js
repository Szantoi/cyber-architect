import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { logger } from './logger.js';
import { db } from './db.js';
import { dbService } from './services/dbService.js';
import { dbMaintenance } from './services/dbMaintenance.js';
import { sseService } from './services/sseService.js';
import { registerServerLifecycle } from './services/serverLifecycle.js';
import { apiLimiter } from './security/rateLimiter.js';
import { validateEnv } from './config/envValidator.js';
import { notFoundHandler, globalErrorHandler } from './middleware/errorHandler.js';
import { correlationId } from './middleware/correlationId.js';

// Modular Route Handlers
import { contentRouter } from './routes/content.routes.js';
import { blogRouter } from './routes/blog.routes.js';
import { knowledgeRouter } from './routes/knowledge.routes.js';
import { uplinkRouter } from './routes/uplink.routes.js';
import { adminRouter } from './routes/admin.routes.js';
import { terminalsRouter } from './routes/terminals.routes.js';
import { syncRouter } from './routes/sync.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { sseRouter } from './routes/sse.routes.js';
import { mcpRouter } from './routes/mcp.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, '../dist');

// Validate environment variables on boot
validateEnv();

export const app = express();
const PORT = config.port;

logger.success('SQLite Database initialized and ready (WAL mode enabled)');

// HTTP Security Headers (Helmet)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'", 'ws:', 'wss:', ...config.allowedOrigins],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Cross-Origin Resource Sharing (Restricted to Configured Whitelist & Local Dev)
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. mobile apps, curl, MCP stdio/local CLI)
    if (!origin) return callback(null, true);
    if (config.allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error('CORS_ORIGIN_BLOCKED: Cross-Origin Request Blocked by Security Policy'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Correlation-ID'],
  credentials: true
}));

// Request Body Parser with 1MB Size Limit (DoS Prevention)
app.use(express.json({ limit: '1mb' }));

// Request Correlation ID (X-Request-ID)
app.use(correlationId);

// Global Request Logger Middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.originalUrl.startsWith('/api/')) {
      logger.info(`${req.method} ${req.originalUrl} [${res.statusCode}] (${duration}ms) [requestId=${req.id}]`, { ip: req.ip, requestId: req.id });
    }
  });
  next();
});

// Global API Rate Limiter
app.use('/api/', apiLimiter);

// Mount Modular API Routers
app.use('/api', contentRouter);
app.use('/api', blogRouter);
app.use('/api', knowledgeRouter);
app.use('/api', uplinkRouter);
app.use('/api', adminRouter);
app.use('/api', terminalsRouter);
app.use('/api', syncRouter);
app.use('/api', healthRouter);
app.use('/api', sseRouter);
app.use('/api/mcp', mcpRouter);

// Catch Unhandled API Routes (404)
app.use('/api', notFoundHandler);

// Serve the compiled frontend from the production container.
if (config.isProduction) {
  if (!fs.existsSync(path.join(distPath, 'index.html'))) {
    logger.warn(`[STATIC_ASSETS] Production bundle not found at ${distPath}`);
  } else {
    app.use(express.static(distPath, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));

    // Client-side routes fall back to the SPA entry point after API handling.
    app.use((req, res, next) => {
      if (req.method !== 'GET' || !req.accepts('html')) return next();
      return res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// Global Error Handler Middleware (500)
app.use(globalErrorHandler);

// Initial Workspace Sync
try {
  dbService.syncExistingTerminals();
} catch (syncErr) {
  logger.warn('Initial terminal sync warning:', syncErr);
}

// Importing the Express app must not open a port as a side effect. This keeps
// integration tests and operational tooling in control of the server lifecycle.
const isDirectExecution = Boolean(process.argv[1])
  && path.resolve(process.argv[1]) === __filename;

if (process.env.NODE_ENV !== 'test' && isDirectExecution) {
  dbMaintenance.startPeriodicMaintenance();
  const server = app.listen(PORT, () => {
    logger.success(`[CYBER_CORE_SERVER] Backend API running on port ${PORT} [${config.nodeEnv.toUpperCase()}]`);
  });

  registerServerLifecycle({
    server,
    database: db,
    maintenance: dbMaintenance,
    eventStream: sseService,
    log: logger
  });
}
