import rateLimit from 'express-rate-limit';
import { config } from '../config.js';

/**
 * Rate limiter for Admin Login attempts to prevent Brute-Force attacks.
 * Max 5 attempts per 15 minutes per IP.
 */
export const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxAuth,
  standardHeaders: true, // Return standard RateLimit-* headers
  legacyHeaders: false,
  message: {
    error: 'SECURITY_ALERT: TOO_MANY_FAILED_ATTEMPTS. ACCESS_LOCKED_FOR_15_MINUTES.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  skipSuccessfulRequests: false,
});

/**
 * Rate limiter for public contact Uplink to prevent message flooding / spam.
 * Max 5 messages per hour per IP.
 */
export const uplinkLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: config.rateLimit.maxUplink,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TRANSMISSION_THROTTLED: MAXIMUM_HOURLY_MESSAGES_REACHED.',
    code: 'UPLINK_RATE_LIMIT_EXCEEDED'
  }
});

/**
 * General API rate limiter to protect server from excessive traffic / DoS.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 120, // 120 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS: API_THROTTLED',
    code: 'API_RATE_LIMIT'
  }
});
