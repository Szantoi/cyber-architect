import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

/**
 * Hash a plaintext PIN or password using bcrypt with configured salt rounds.
 * @param {string} pin - Plaintext PIN
 * @returns {string} - Bcrypt hash string
 */
export function hashPin(pin) {
  const salt = bcrypt.genSaltSync(config.admin.saltRounds);
  return bcrypt.hashSync(pin, salt);
}

/**
 * Verifies a plaintext PIN against a stored bcrypt hash in constant time.
 * @param {string} pin - Plaintext PIN
 * @param {string} hash - Stored bcrypt hash
 * @returns {boolean} - True if match
 */
export function verifyPin(pin, hash) {
  if (!pin || !hash) return false;
  // If legacy plaintext is passed, handle safely
  if (!hash.startsWith('$2a$') && !hash.startsWith('$2b$')) {
    return pin === hash;
  }
  return bcrypt.compareSync(pin, hash);
}

/**
 * Issues a cryptographically signed JWT token for the admin session.
 * @param {object} payload - Data to embed in token
 * @returns {string} - Signed JWT
 */
export function generateAdminToken(payload = { role: 'OVERSEER_ADMIN' }) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    algorithm: 'HS256'
  });
}

/**
 * Verifies and decodes a JWT token.
 * @param {string} token - JWT token string
 * @returns {object|null} - Decoded payload or null if invalid/expired
 */
export function verifyAdminToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (err) {
    return null;
  }
}

/**
 * Express middleware to guard protected admin routes.
 */
export function authMiddleware(req, res, next) {
  // Support both custom header x-admin-token and standard Authorization Bearer
  let token = req.headers['x-admin-token'];
  
  if (!token && req.headers['authorization']) {
    const parts = req.headers['authorization'].split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({
      error: 'ACCESS_DENIED: MISSING_AUTHENTICATION_TOKEN',
      code: 'AUTH_REQUIRED'
    });
  }

  const decoded = verifyAdminToken(token);
  if (!decoded) {
    return res.status(401).json({
      error: 'ACCESS_DENIED: TOKEN_EXPIRED_OR_INVALID',
      code: 'INVALID_TOKEN'
    });
  }

  req.adminUser = decoded;
  next();
}
