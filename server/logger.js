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

export const logger = {
  info: (msg, meta = {}) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    console.log(`${ANSI.dim}[${formatTimestamp()}]${ANSI.reset} ${ANSI.cyan}[INFO]${ANSI.reset} ${msg}${metaStr}`);
  },

  success: (msg, meta = {}) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    console.log(`${ANSI.dim}[${formatTimestamp()}]${ANSI.reset} ${ANSI.green}[SUCCESS]${ANSI.reset} ${msg}${metaStr}`);
  },

  warn: (msg, meta = {}) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    console.warn(`${ANSI.dim}[${formatTimestamp()}]${ANSI.reset} ${ANSI.yellow}[WARN]${ANSI.reset} ${msg}${metaStr}`);
  },

  security: (event, meta = {}) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    console.warn(`${ANSI.dim}[${formatTimestamp()}]${ANSI.reset} ${ANSI.magenta}[SECURITY_AUDIT]${ANSI.reset} ${ANSI.bold}${event}${ANSI.reset}${metaStr}`);
  },

  error: (msg, err = null, meta = {}) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    const errDetail = err ? ` | Error: ${err.message || err}` : '';
    console.error(`${ANSI.dim}[${formatTimestamp()}]${ANSI.reset} ${ANSI.red}[ERROR]${ANSI.reset} ${msg}${errDetail}${metaStr}`);
  }
};
