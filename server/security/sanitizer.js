/**
 * Sanitizes input string to prevent XSS and excessive payloads.
 * Strips script tags, trims whitespace, and limits character count.
 * @param {string} input - Raw string
 * @param {number} maxLen - Maximum allowed length
 * @returns {string} - Cleaned string
 */
export function sanitizeText(input, maxLen = 2000) {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Strip script tags
    .replace(/javascript:/gi, '') // Strip javascript pseudo protocol
    .replace(/onload|onerror|onclick|onmouseover/gi, '') // Strip inline event handlers
    .trim()
    .slice(0, maxLen);
}

/**
 * Validates and sanitizes the Uplink transmission payload.
 * Checks for Honeypot trap (if bot filled 'website' field, we silently drop).
 * @param {object} body - Request body
 * @returns {{ isValid: boolean, isBot: boolean, data: object|null, error: string|null }}
 */
export function validateUplinkPayload(body) {
  if (!body || typeof body !== 'object') {
    return { isValid: false, isBot: false, data: null, error: 'INVALID_PAYLOAD_STRUCTURE' };
  }

  // Honeypot Trap Check: Normal humans cannot see or fill this field
  const honeypot = body.website || body.hp_trap || body.url_confirm;
  if (honeypot && String(honeypot).trim().length > 0) {
    return { isValid: false, isBot: true, data: null, error: null };
  }

  const rawIdentity = body.identity;
  const rawSubject = body.subject;
  const rawMessage = body.message || '';

  if (!rawIdentity || typeof rawIdentity !== 'string' || rawIdentity.trim().length < 2) {
    return { isValid: false, isBot: false, data: null, error: 'MISSING_OR_INVALID_IDENTITY' };
  }

  if (!rawSubject || typeof rawSubject !== 'string' || rawSubject.trim().length < 2) {
    return { isValid: false, isBot: false, data: null, error: 'MISSING_OR_INVALID_SUBJECT' };
  }

  const sanitizedIdentity = sanitizeText(rawIdentity, 120);
  const sanitizedSubject = sanitizeText(rawSubject, 180);
  const sanitizedMessage = sanitizeText(rawMessage, 4000);

  return {
    isValid: true,
    isBot: false,
    data: {
      identity: sanitizedIdentity,
      subject: sanitizedSubject,
      message: sanitizedMessage
    },
    error: null
  };
}
