import { afterEach, describe, it, expect, vi } from 'vitest';
import { sseService } from '../../services/sseService.js';

describe('Server-Sent Events (SSE) Service Unit Tests', () => {
  afterEach(() => {
    sseService.shutdown();
  });

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

  it('closes active streams and clears the heartbeat during shutdown', () => {
    const mockRes = {
      write: vi.fn(),
      end: vi.fn()
    };

    sseService.addClient(mockRes);
    expect(sseService.heartbeatInterval).not.toBeNull();

    sseService.shutdown();

    expect(mockRes.end).toHaveBeenCalledOnce();
    expect(sseService.clients.size).toBe(0);
    expect(sseService.heartbeatInterval).toBeNull();
  });
});
