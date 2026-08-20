import { afterEach, describe, expect, it, vi } from 'vitest';
import { globalErrorHandler, notFoundHandler } from '../../middleware/errorHandler.js';

const originalNodeEnv = process.env.NODE_ENV;

function createResponseDouble() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  };
}

function getStructuredPayload(consoleSpy) {
  const line = String(consoleSpy.mock.calls.at(-1)?.[0] || '');
  const payloadBoundary = line.lastIndexOf(' {');
  const payloadStart = payloadBoundary === -1 ? -1 : payloadBoundary + 1;
  if (payloadStart === -1) throw new Error(`Structured payload missing from log line: ${line}`);
  return { line, payload: JSON.parse(line.slice(payloadStart)) };
}

describe('API error middleware', () => {
  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('hides production internals while logging a redacted stack with request context', () => {
    process.env.NODE_ENV = 'production';
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const oauthCode = 'callback-code-must-not-leak';
    const requestToken = 'query-token-must-not-leak';
    const error = new Error(`OAuth exchange failed at /callback?code=${oauthCode}`);
    const req = {
      method: 'GET',
      path: '/api/admin/drive/oauth2callback',
      originalUrl: `/api/admin/drive/oauth2callback?token=${requestToken}`,
      ip: '127.0.0.1',
      id: 'req-prod-1'
    };
    const res = createResponseDouble();

    globalErrorHandler(error, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'INTERNAL_SERVER_ERROR',
      code: 'SERVER_ERROR'
    }));
    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody).not.toHaveProperty('stack');

    const { line, payload } = getStructuredPayload(consoleSpy);
    expect(line).not.toContain(oauthCode);
    expect(line).not.toContain(requestToken);
    expect(payload).toMatchObject({
      path: '/api/admin/drive/oauth2callback',
      method: 'GET',
      requestId: 'req-prod-1',
      statusCode: 500,
      error: { name: 'Error' }
    });
    expect(payload.error.stack).toContain('code=[REDACTED]');
  });

  it('preserves explicit HTTP status and application error code', () => {
    process.env.NODE_ENV = 'development';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = Object.assign(new Error('Payload is invalid'), {
      status: 422,
      code: 'VALIDATION_FAILED'
    });
    const req = {
      method: 'POST',
      path: '/api/admin/settings',
      originalUrl: '/api/admin/settings',
      ip: '127.0.0.1',
      id: 'req-dev-1'
    };
    const res = createResponseDouble();

    globalErrorHandler(error, req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'Payload is invalid',
      code: 'VALIDATION_FAILED'
    }));
  });

  it('returns a stable 404 contract without reflecting query credentials', () => {
    const req = {
      method: 'GET',
      path: '/api/missing',
      originalUrl: '/api/missing?token=secret-query-value'
    };
    const res = createResponseDouble();

    notFoundHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: 'ROUTE_NOT_FOUND: GET /api/missing',
      code: 'NOT_FOUND'
    }));
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('secret-query-value');
  });
});
