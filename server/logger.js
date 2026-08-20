/**
 * Structured Logger for Cyber-Architect Core Backend.
 * Implements QUALITY.md logging requirements: traceability, timestamps, and severity levels.
 */

const ANSI = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  dim: '\x1b[2m',
  bold: '\x1b[1m'
};

function formatTimestamp() {
  return new Date().toISOString();
}

const REDACTED = '[REDACTED]';
const MAX_LOG_STRING_LENGTH = 8_000;

function isErrorLike(value) {
  return value instanceof Error || Boolean(
    value
    && typeof value === 'object'
    && typeof value.message === 'string'
    && (typeof value.stack === 'string' || /error$/i.test(value.name || ''))
  );
}

function isSensitiveKey(key) {
  const normalized = String(key).replace(/[-_\s]/g, '').toLowerCase();

  return normalized.includes('password')
    || normalized.includes('passwd')
    || normalized.includes('secret')
    || normalized.includes('credential')
    || normalized === 'authorization'
    || normalized === 'cookie'
    || normalized === 'setcookie'
    || normalized === 'pin'
    || normalized === 'pincode'
    || normalized === 'adminpin'
    || normalized === 'token'
    || normalized.endsWith('token')
    || normalized === 'apikey'
    || normalized.endsWith('apikey')
    || normalized === 'privatekey'
    || normalized === 'oauthcode'
    || normalized === 'authorizationcode'
    || normalized === 'oauthstate';
}

function redactString(value) {
  const redacted = String(value)
    .replace(/\b(Authorization\s*[:=]\s*)(?:Bearer|Basic)\s+[^\s,;]+/gi, `$1${REDACTED}`)
    .replace(/\b(Bearer)\s+[^\s,;]+/gi, `$1 ${REDACTED}`)
    .replace(/([?&](?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|client[_-]?secret|api[_-]?key|password|passwd|pin|code|state)=)[^&#\s]*/gi, `$1${REDACTED}`)
    .replace(/("(?:authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|api[_-]?key|password|passwd|pin(?:[_-]?code)?|oauth[_-]?(?:code|state))"\s*:\s*")[^"]*(")/gi, `$1${REDACTED}$2`)
    .replace(/\b(authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|api[_-]?key|password|passwd|pin(?:[_-]?code)?|oauth[_-]?(?:code|state))\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;&]+)/gi, `$1=${REDACTED}`)
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED_JWT]');

  if (redacted.length <= MAX_LOG_STRING_LENGTH) return redacted;
  return `${redacted.slice(0, MAX_LOG_STRING_LENGTH)}...[TRUNCATED]`;
}

function serializeError(error) {
  const serialized = {
    name: redactString(error.name || 'Error'),
    message: redactString(error.message || String(error))
  };

  if (error.code !== undefined) serialized.code = sanitizeLogValue(error.code, 'code');
  if (typeof error.stack === 'string') serialized.stack = redactString(error.stack);
  return serialized;
}

function sanitizeLogValue(value, key = '', seen = new WeakSet(), depth = 0) {
  if (isSensitiveKey(key)) return REDACTED;
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol' || typeof value === 'function') return String(value);
  if (isErrorLike(value)) return serializeError(value);
  if (value instanceof Date) return value.toISOString();
  if (depth >= 6) return '[TRUNCATED_DEPTH]';
  if (seen.has(value)) return '[CIRCULAR]';

  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 100).map(item => sanitizeLogValue(item, '', seen, depth + 1));
  }

  const sanitized = {};
  for (const property of Object.keys(value).slice(0, 100)) {
    try {
      sanitized[property] = sanitizeLogValue(value[property], property, seen, depth + 1);
    } catch {
      sanitized[property] = '[UNSERIALIZABLE]';
    }
  }
  return sanitized;
}

function formatMeta(meta) {
  if (meta === null || meta === undefined) return '';
  const sanitized = sanitizeLogValue(meta);
  if (typeof sanitized === 'object' && !Array.isArray(sanitized) && Object.keys(sanitized).length === 0) return '';
  return ` ${JSON.stringify(sanitized)}`;
}

function getErrorContext(errorOrMeta, additionalMeta) {
  const hasError = isErrorLike(errorOrMeta)
    || (errorOrMeta !== null && errorOrMeta !== undefined && typeof errorOrMeta !== 'object');
  const context = {};

  if (!hasError && errorOrMeta && typeof errorOrMeta === 'object') {
    Object.assign(context, errorOrMeta);
  }
  if (additionalMeta && typeof additionalMeta === 'object') {
    Object.assign(context, additionalMeta);
  }
  if (hasError) {
    const error = isErrorLike(errorOrMeta)
      ? errorOrMeta
      : new Error(String(errorOrMeta));
    context.error = serializeError(error);
  }

  return context;
}

export const logger = {
  info: (msg, meta = {}) => {
    console.log(`${ANSI.dim}[${formatTimestamp()}]${ANSI.reset} ${ANSI.cyan}[INFO]${ANSI.reset} ${redactString(msg)}${formatMeta(meta)}`);
  },

  success: (msg, meta = {}) => {
    console.log(`${ANSI.dim}[${formatTimestamp()}]${ANSI.reset} ${ANSI.green}[SUCCESS]${ANSI.reset} ${redactString(msg)}${formatMeta(meta)}`);
  },

  warn: (msg, meta = {}) => {
    console.warn(`${ANSI.dim}[${formatTimestamp()}]${ANSI.reset} ${ANSI.yellow}[WARN]${ANSI.reset} ${redactString(msg)}${formatMeta(meta)}`);
  },

  security: (event, meta = {}) => {
    console.warn(`${ANSI.dim}[${formatTimestamp()}]${ANSI.reset} ${ANSI.magenta}[SECURITY_AUDIT]${ANSI.reset} ${ANSI.bold}${redactString(event)}${ANSI.reset}${formatMeta(meta)}`);
  },

  error: (msg, errorOrMeta = null, meta = {}) => {
    const context = getErrorContext(errorOrMeta, meta);
    console.error(`${ANSI.dim}[${formatTimestamp()}]${ANSI.reset} ${ANSI.red}[ERROR]${ANSI.reset} ${redactString(msg)}${formatMeta(context)}`);
  }
};
