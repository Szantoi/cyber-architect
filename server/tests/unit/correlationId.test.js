import { describe, it, expect, vi } from 'vitest';
import { correlationId } from '../../middleware/correlationId.js';

describe('Correlation ID Middleware Unit Tests', () => {
  it('generates a new UUID X-Request-ID when none is provided in headers', () => {
    const req = { headers: {} };
    const res = { setHeader: vi.fn() };
    const next = vi.fn();

    correlationId(req, res, next);

    expect(req.id).toBeDefined();
    expect(typeof req.id).toBe('string');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', req.id);
    expect(next).toHaveBeenCalled();
  });

  it('preserves and propagates an existing incoming X-Request-ID header', () => {
    const customTraceId = 'client-trace-id-12345';
    const req = { headers: { 'x-request-id': customTraceId } };
    const res = { setHeader: vi.fn() };
    const next = vi.fn();

    correlationId(req, res, next);

    expect(req.id).toBe(customTraceId);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-ID', customTraceId);
    expect(next).toHaveBeenCalled();
  });
});
