import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { registerServerLifecycle } from '../../services/serverLifecycle.js';

function createProcessDouble() {
  const processDouble = new EventEmitter();
  processDouble.exitCode = undefined;
  return processDouble;
}

function createLogDouble() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

describe('HTTP server lifecycle management', () => {
  it('performs ordered, idempotent cleanup after a termination signal', async () => {
    const calls = [];
    const processRef = createProcessDouble();
    const database = {
      open: true,
      close: vi.fn(() => {
        calls.push('database.close');
        database.open = false;
      })
    };
    const server = {
      close: vi.fn(callback => {
        calls.push('server.close');
        callback();
      }),
      closeAllConnections: vi.fn()
    };
    const maintenance = {
      stopPeriodicMaintenance: vi.fn(() => calls.push('maintenance.stop')),
      performCheckpoint: vi.fn(() => {
        calls.push('maintenance.checkpoint');
        return { success: true };
      })
    };
    const eventStream = {
      shutdown: vi.fn(() => calls.push('eventStream.shutdown'))
    };

    const lifecycle = registerServerLifecycle({
      server,
      database,
      maintenance,
      eventStream,
      log: createLogDouble(),
      processRef,
      shutdownTimeoutMs: 100
    });

    processRef.emit('SIGTERM');
    const firstShutdown = lifecycle.shutdown('DUPLICATE_REQUEST');
    const secondShutdown = lifecycle.shutdown('DUPLICATE_REQUEST');

    expect(firstShutdown).toBe(secondShutdown);
    await expect(firstShutdown).resolves.toBe(0);
    expect(calls).toEqual([
      'maintenance.stop',
      'eventStream.shutdown',
      'server.close',
      'maintenance.checkpoint',
      'database.close'
    ]);
    expect(server.close).toHaveBeenCalledTimes(1);
    expect(server.closeAllConnections).not.toHaveBeenCalled();
    expect(processRef.exitCode).toBe(0);
    expect(processRef.listenerCount('SIGTERM')).toBe(0);
    expect(processRef.listenerCount('unhandledRejection')).toBe(0);
  });

  it('uses a non-zero exit code for an unhandled promise rejection', async () => {
    const processRef = createProcessDouble();
    const database = {
      open: true,
      close: vi.fn(() => {
        database.open = false;
      })
    };
    const server = { close: vi.fn(callback => callback()) };
    const maintenance = {
      stopPeriodicMaintenance: vi.fn(),
      performCheckpoint: vi.fn(() => ({ success: true }))
    };
    const eventStream = { shutdown: vi.fn() };
    const log = createLogDouble();
    const lifecycle = registerServerLifecycle({
      server,
      database,
      maintenance,
      eventStream,
      log,
      processRef,
      shutdownTimeoutMs: 100
    });

    processRef.emit('unhandledRejection', new Error('background task failed'));

    await expect(lifecycle.shutdown()).resolves.toBe(1);
    expect(processRef.exitCode).toBe(1);
    expect(log.error).toHaveBeenCalledWith(
      '[SERVER_LIFECYCLE] Unhandled promise rejection; shutting down.',
      expect.objectContaining({ message: 'background task failed' })
    );
  });

  it('force-closes connections and the database after the shutdown deadline', async () => {
    const processRef = createProcessDouble();
    let runTimeout;
    const timeoutHandle = { unref: vi.fn() };
    const setTimeoutFn = vi.fn(callback => {
      runTimeout = callback;
      return timeoutHandle;
    });
    const clearTimeoutFn = vi.fn();
    const database = {
      open: true,
      close: vi.fn(() => {
        database.open = false;
      })
    };
    const server = {
      close: vi.fn(),
      closeAllConnections: vi.fn()
    };
    const maintenance = {
      stopPeriodicMaintenance: vi.fn(),
      performCheckpoint: vi.fn(() => ({ success: true }))
    };
    const eventStream = { shutdown: vi.fn() };
    const lifecycle = registerServerLifecycle({
      server,
      database,
      maintenance,
      eventStream,
      log: createLogDouble(),
      processRef,
      shutdownTimeoutMs: 25,
      setTimeoutFn,
      clearTimeoutFn
    });

    const shutdown = lifecycle.shutdown('SIGTERM');
    runTimeout();

    await expect(shutdown).resolves.toBe(1);
    expect(timeoutHandle.unref).toHaveBeenCalledOnce();
    expect(server.closeAllConnections).toHaveBeenCalledOnce();
    expect(database.close).toHaveBeenCalledOnce();
    expect(processRef.exitCode).toBe(1);
  });
});
