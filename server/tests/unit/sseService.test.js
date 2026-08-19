import { describe, it, expect, vi } from 'vitest';
import { sseService } from '../../services/sseService.js';

describe('Server-Sent Events (SSE) Service Unit Tests', () => {
  it('manages client subscriptions and broadcasts events', () => {
    const mockRes = {
      write: vi.fn()
    };

    sseService.addClient(mockRes);
    expect(sseService.clients.has(mockRes)).toBe(true);
    expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('SYSTEM_CONNECTED'));

    sseService.broadcast('TEST_EVENT', { payload: 'hello_cyber' });
    expect(mockRes.write).toHaveBeenCalledWith(expect.stringContaining('TEST_EVENT'));

    sseService.removeClient(mockRes);
    expect(sseService.clients.has(mockRes)).toBe(false);
  });
});
