import crypto from 'crypto';

/**
 * Request Correlation ID Middleware
 * Assigns or propagates a unique X-Request-ID header to trace every HTTP transaction
 * through frontend, network, logs, and database audit trails.
 */
export function correlationId(req, res, next) {
  const incomingId = req.headers['x-request-id'];
  const requestId = (typeof incomingId === 'string' && incomingId.trim()) 
    ? incomingId.trim() 
    : crypto.randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}
