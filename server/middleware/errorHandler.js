import { logger } from '../logger.js';

/**
 * 404 Not Found Middleware for unhandled API routes.
 */
export function notFoundHandler(req, res) {
  const requestPath = req.path || req.originalUrl?.split('?')[0] || '';

  res.status(404).json({
    success: false,
    error: `ROUTE_NOT_FOUND: ${req.method} ${requestPath}`,
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

  logger.error('[UNHANDLED_ERROR]', err, {
    path: req.path || req.originalUrl?.split('?')[0],
    method: req.method,
    ip: req.ip,
    requestId: req.id,
    statusCode
  });

  res.status(statusCode).json({
    success: false,
    error: isProd && statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : (err.message || 'INTERNAL_SERVER_ERROR'),
    code: err.code || 'SERVER_ERROR',
    timestamp: new Date().toISOString()
  });
}
