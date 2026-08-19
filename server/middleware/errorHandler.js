import { logger } from '../logger.js';

/**
 * 404 Not Found Middleware for unhandled API routes.
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: `ROUTE_NOT_FOUND: ${req.method} ${req.originalUrl}`,
    code: 'NOT_FOUND',
    timestamp: new Date().toISOString()
  });
}

/**
 * Global Express Error Handling Middleware.
 * Catches unhandled exceptions, logs them with security context, and prevents stack trace leakage.
 */
export function globalErrorHandler(err, req, res, _next) {
  const statusCode = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';

  logger.error(`[UNHANDLED_ERROR] ${err.message}`, {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    stack: isProd ? undefined : err.stack
  });

  res.status(statusCode).json({
    success: false,
    error: isProd && statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : (err.message || 'INTERNAL_SERVER_ERROR'),
    code: err.code || 'SERVER_ERROR',
    timestamp: new Date().toISOString()
  });
}
