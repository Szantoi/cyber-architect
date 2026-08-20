import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ADMIN_PIN_VIOLATION, getAdminPinPolicyViolations } from './security/pinPolicy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '../.env'), quiet: true });

const DEVELOPMENT_JWT_SECRET = 'fallback_dev_jwt_secret_cyber_2026';
const DEVELOPMENT_ADMIN_PIN = '1337';

const insecureJwtSecretPatterns = [
  /^fallback_/i,
  /^replace_with_/i,
  /^cyber_architect_prod_secret/i,
  /^(change-?me|development|example|secret|test)(?:[_-]|$)/i,
];

/**
 * Return actionable production-only security configuration errors.
 * Kept side-effect free so startup validation can report the same policy.
 */
export function getProductionSecurityErrors(env = process.env) {
  if (env.NODE_ENV !== 'production') return [];

  const errors = [];
  const jwtSecret = typeof env.JWT_SECRET === 'string' ? env.JWT_SECRET.trim() : '';
  const adminPin = env.ADMIN_DEFAULT_PIN;

  if (!jwtSecret) {
    errors.push('JWT_SECRET is required in production.');
  } else {
    if (jwtSecret.length < 32) {
      errors.push('JWT_SECRET must contain at least 32 characters in production.');
    }
    if (
      insecureJwtSecretPatterns.some(pattern => pattern.test(jwtSecret)) ||
      new Set(jwtSecret).size < 8
    ) {
      errors.push('JWT_SECRET must be a high-entropy value and must not use a known placeholder.');
    }
  }

  for (const violation of getAdminPinPolicyViolations(adminPin)) {
    if (violation === ADMIN_PIN_VIOLATION.REQUIRED) {
      errors.push('ADMIN_DEFAULT_PIN is required in production.');
    } else if (violation === ADMIN_PIN_VIOLATION.LENGTH) {
      errors.push('ADMIN_DEFAULT_PIN must contain between 12 and 64 characters in production.');
    } else if (violation === ADMIN_PIN_VIOLATION.PREDICTABLE) {
      errors.push('ADMIN_DEFAULT_PIN must not be a common, repeated, or sequential value and must not be a placeholder.');
    }
  }

  return errors;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const productionSecurityErrors = getProductionSecurityErrors(process.env);

// Fail before database initialization can seed an insecure bootstrap credential.
if (productionSecurityErrors.length > 0) {
  throw new Error(`Invalid production security configuration: ${productionSecurityErrors.join(' ')}`);
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv,
  isProduction,
  
  jwt: {
    secret: process.env.JWT_SECRET || DEVELOPMENT_JWT_SECRET,
    expiresIn: '24h',
  },

  admin: {
    defaultPin: process.env.ADMIN_DEFAULT_PIN || DEVELOPMENT_ADMIN_PIN,
    saltRounds: 10,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 mins
    maxAuth: parseInt(process.env.RATE_LIMIT_MAX_AUTH || '5', 10),
    maxUplink: parseInt(process.env.RATE_LIMIT_MAX_UPLINK || '5', 10),
  },

  siteUrl: process.env.SITE_URL || 'https://www.ai.szantoi.hu',
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'https://www.ai.szantoi.hu,https://ai.szantoi.hu,https://szantoi.hu,https://www.szantoi.hu,http://localhost:5173,http://localhost:3000,http://localhost:3001,http://127.0.0.1:5173,http://127.0.0.1:3000')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
};
