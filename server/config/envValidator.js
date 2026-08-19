import { logger } from '../logger.js';

/**
 * Validates critical environment variables upon server startup.
 * Throws an error in production or logs a clear warning in development if misconfigured.
 */
export function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const warnings = [];
  const errors = [];

  // 1. JWT Secret verification
  if (!process.env.ADMIN_JWT_SECRET) {
    if (isProd) {
      errors.push('CRITICAL: ADMIN_JWT_SECRET is required in production environment.');
    } else {
      warnings.push('ADMIN_JWT_SECRET is not explicitly defined in .env; using fallback secret for development.');
    }
  }

  // 2. Database path verification
  if (!process.env.SQLITE_DB_PATH) {
    warnings.push('SQLITE_DB_PATH is not set; defaulting to data/portfolio.sqlite.');
  }

  // 3. Port verification
  if (process.env.PORT && isNaN(Number(process.env.PORT))) {
    errors.push(`Invalid PORT configuration: "${process.env.PORT}". Must be a valid integer.`);
  }

  if (warnings.length > 0) {
    warnings.forEach(w => logger.warn(`[CONFIG_CHECK] ${w}`));
  }

  if (errors.length > 0) {
    errors.forEach(e => logger.error(`[CONFIG_ERROR] ${e}`));
    if (isProd) {
      throw new Error(`Server startup aborted due to environment configuration errors: ${errors.join(', ')}`);
    }
  }

  logger.info('[CONFIG_CHECK] Environment configuration validated successfully.');
}
