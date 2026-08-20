import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../../logger.js';

function getLogLine(spy) {
  return String(spy.mock.calls.at(-1)?.[0] || '');
}

function getStructuredPayload(spy) {
  const line = getLogLine(spy);
  const payloadBoundary = line.lastIndexOf(' {');
  const payloadStart = payloadBoundary === -1 ? -1 : payloadBoundary + 1;
  if (payloadStart === -1) throw new Error(`Structured payload missing from log line: ${line}`);
  return JSON.parse(line.slice(payloadStart));
}

describe('Structured backend logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserves Error details, stack, and explicit metadata in one structured payload', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('database write failed');
    error.code = 'SQLITE_BUSY';

    logger.error('Unable to persist record', error, {
      requestId: 'req-123',
      entity: 'blog_posts',
      attempt: 2
    });

    const payload = getStructuredPayload(consoleSpy);
    expect(payload).toMatchObject({
      requestId: 'req-123',
      entity: 'blog_posts',
      attempt: 2,
      error: {
        name: 'Error',
        message: 'database write failed',
        code: 'SQLITE_BUSY'
      }
    });
    expect(payload.error.stack).toContain('Error: database write failed');
  });

  it('accepts metadata as the second argument and recursively redacts credentials', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const oauthCode = 'oauth-code-must-not-leak';
    const oauthState = 'oauth-state-must-not-leak';
    const bearerToken = 'bearer-token-must-not-leak';
    const refreshToken = 'refresh-token-must-not-leak';
    const clientSecret = 'client-secret-must-not-leak';
    const circularMeta = {
      requestId: 'req-456',
      authorization: `Bearer ${bearerToken}`,
      refreshToken,
      callbackUrl: `https://example.test/callback?code=${oauthCode}&state=${oauthState}`,
      nested: { client_secret: clientSecret }
    };
    circularMeta.self = circularMeta;

    logger.error(`Provider response: {"client_secret":"${clientSecret}"}`, circularMeta);

    const line = getLogLine(consoleSpy);
    for (const secret of [oauthCode, oauthState, bearerToken, refreshToken, clientSecret]) {
      expect(line).not.toContain(secret);
    }

    const payload = getStructuredPayload(consoleSpy);
    expect(payload).toMatchObject({
      requestId: 'req-456',
      authorization: '[REDACTED]',
      refreshToken: '[REDACTED]',
      nested: { client_secret: '[REDACTED]' }
    });
    expect(payload.callbackUrl).toContain('code=[REDACTED]&state=[REDACTED]');
    expect(payload.self.self).toBe('[CIRCULAR]');
    expect(payload).not.toHaveProperty('error');
  });
});
