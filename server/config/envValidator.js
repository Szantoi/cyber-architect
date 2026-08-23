import { logger } from '../logger.js';
import { getProductionSecurityErrors } from '../config.js';
import {
  DATABASE_PATH_SOURCE,
  resolveDatabaseLocation
} from './databasePath.js';

/**
 * Validates critical environment variables upon server startup.
 * Rejects invalid settings while allowing explicit development-only credential fallbacks.
 */
export function validateEnv() {
  const isProd = process.env.NODE_ENV === 'production';
  const warnings = [];
  const errors = getProductionSecurityErrors(process.env);

  // 1. JWT Secret verification
  if (!isProd && !process.env.JWT_SECRET) {
    warnings.push('JWT_SECRET is not explicitly defined; using the development-only fallback secret.');
  }

  // 2. Bootstrap admin credential verification
  if (!isProd && !process.env.ADMIN_DEFAULT_PIN) {
    warnings.push('ADMIN_DEFAULT_PIN is not explicitly defined; using the development-only bootstrap PIN.');
  }

  // 3. Database path verification
  const databaseLocation = resolveDatabaseLocation(process.env);
  if (databaseLocation.source === DATABASE_PATH_SOURCE.LEGACY_DEFAULT) {
    warnings.push('No SQLite workspace path is configured; defaulting to data/portfolio.sqlite.');
  } else if (
    databaseLocation.source === DATABASE_PATH_SOURCE.WORKSPACE_DATA_DIRECTORY
    && String(process.env.SQLITE_DATA_DIR || '').trim()
  ) {
    warnings.push('CYBER_ARCHITECT_WORKSPACE_DATA_DIR overrides SQLITE_DATA_DIR for this process.');
  }

  // 4. Port verification
  if (process.env.PORT && (!Number.isInteger(Number(process.env.PORT)) || Number(process.env.PORT) < 1 || Number(process.env.PORT) > 65535)) {
    errors.push(`Invalid PORT configuration: "${process.env.PORT}". Must be an integer from 1 to 65535.`);
  }

  if (warnings.length > 0) {
    warnings.forEach(w => logger.warn(`[CONFIG_CHECK] ${w}`));
  }

  if (errors.length > 0) {
    errors.forEach(e => logger.error(`[CONFIG_ERROR] ${e}`));
    throw new Error(`Server startup aborted due to environment configuration errors: ${errors.join(', ')}`);
  }

  logger.info('[CONFIG_CHECK] Environment configuration validated successfully.');
}
