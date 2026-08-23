import { authMiddleware } from '../security/auth.js';

// Preview is deliberately an opt-in, authenticated server capability.  A
// query parameter or a browser-only state flag can never widen a public read.
export const ADMIN_PREVIEW_HEADER = 'x-ca-preview';

const PUBLIC_READ_SCOPE = Object.freeze({
  preview: false,
  visibility: 'public',
  publishedOnly: true,
  includeInactive: false,
  classification: 'public'
});

const ADMIN_PREVIEW_READ_SCOPE = Object.freeze({
  preview: true,
  visibility: 'all',
  publishedOnly: false,
  includeInactive: true,
  classification: 'all'
});

function denyPreview(res, status, error, code) {
  return res.status(status).json({ error, code });
}

/**
 * Keeps public endpoints public by default, while allowing the exact same
 * reader routes to render a private/admin preview after an existing admin JWT
 * has been verified.  A requested preview fails closed: it never degrades to
 * a public response when a token is missing or invalid.
 */
export function adminPreviewMiddleware(req, res, next) {
  const requestedMode = String(req.get(ADMIN_PREVIEW_HEADER) || '').trim().toLowerCase();

  if (!requestedMode) {
    req.caReadScope = PUBLIC_READ_SCOPE;
    return next();
  }

  if (requestedMode !== 'admin') {
    return denyPreview(res, 400, 'INVALID_ADMIN_PREVIEW_MODE', 'INVALID_PREVIEW_MODE');
  }

  return authMiddleware(req, res, () => {
    if (req.adminUser?.role !== 'OVERSEER_ADMIN') {
      return denyPreview(res, 403, 'ACCESS_DENIED: ADMIN_PREVIEW_REQUIRES_ADMIN_ROLE', 'ADMIN_ROLE_REQUIRED');
    }

    req.caReadScope = ADMIN_PREVIEW_READ_SCOPE;
    // Preview payloads may contain unpublished or internal material and must
    // never enter a browser or intermediary cache.
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('X-CA-Read-Scope', 'admin-preview');
    res.vary('X-CA-Preview');
    return next();
  });
}

export function getReadScope(req) {
  return req.caReadScope || PUBLIC_READ_SCOPE;
}

export function isAdminPreview(req) {
  return getReadScope(req).preview;
}

// Public handlers with explicit cache policies call this instead of setting a
// public cache header unconditionally.
export function setReadCacheControl(req, res, publicValue) {
  if (isAdminPreview(req)) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return;
  }
  res.setHeader('Cache-Control', publicValue);
}
