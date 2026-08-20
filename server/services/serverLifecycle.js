const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

function toError(reason) {
  if (reason instanceof Error) return reason;
  return new Error(typeof reason === 'string' ? reason : JSON.stringify(reason));
}

/**
 * Registers process lifecycle hooks and returns an idempotent shutdown
 * coordinator. Dependencies are injected so cleanup can be regression tested
 * without opening a port or touching the developer database.
 */
export function registerServerLifecycle({
  server,
  database,
  maintenance,
  eventStream,
  log,
  processRef = process,
  shutdownTimeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
}) {
  if (!server || typeof server.close !== 'function') {
    throw new TypeError('A running HTTP server is required for lifecycle management.');
  }

  let shutdownPromise = null;
  const registeredHandlers = [];

  const dispose = () => {
    if (typeof processRef.off !== 'function') return;
    for (const [eventName, handler] of registeredHandlers) {
      processRef.off(eventName, handler);
    }
    registeredHandlers.length = 0;
  };

  const shutdown = (reason = 'SHUTDOWN', requestedExitCode = 0) => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = new Promise(resolve => {
      let finalized = false;
      let timeoutHandle;

      log.info(`[SERVER_LIFECYCLE] Graceful shutdown started (${reason}).`);

      try {
        maintenance.stopPeriodicMaintenance();
      } catch (err) {
        log.error('[SERVER_LIFECYCLE] Failed to stop database maintenance.', err);
      }

      try {
        eventStream.shutdown();
      } catch (err) {
        log.error('[SERVER_LIFECYCLE] Failed to close SSE streams.', err);
      }

      const finalize = exitCode => {
        if (finalized) return;
        finalized = true;
        if (timeoutHandle) clearTimeoutFn(timeoutHandle);

        try {
          if (database.open) {
            const checkpoint = maintenance.performCheckpoint('TRUNCATE');
            if (checkpoint?.success === false) {
              log.warn('[SERVER_LIFECYCLE] Final WAL checkpoint did not complete.', {
                error: checkpoint.error
              });
            }
          }
        } catch (err) {
          log.error('[SERVER_LIFECYCLE] Final WAL checkpoint failed.', err);
          exitCode = 1;
        }

        try {
          if (database.open) database.close();
        } catch (err) {
          log.error('[SERVER_LIFECYCLE] Database close failed.', err);
          exitCode = 1;
        }

        dispose();
        processRef.exitCode = exitCode;
        log.info(`[SERVER_LIFECYCLE] Shutdown complete with exit code ${exitCode}.`);
        resolve(exitCode);
      };

      timeoutHandle = setTimeoutFn(() => {
        log.error(`[SERVER_LIFECYCLE] Shutdown exceeded ${shutdownTimeoutMs}ms; forcing open connections closed.`);
        try {
          server.closeAllConnections?.();
        } catch (err) {
          log.error('[SERVER_LIFECYCLE] Failed to force-close HTTP connections.', err);
        }
        finalize(1);
      }, shutdownTimeoutMs);
      timeoutHandle?.unref?.();

      try {
        server.close(err => {
          if (err && err.code !== 'ERR_SERVER_NOT_RUNNING') {
            log.error('[SERVER_LIFECYCLE] HTTP server close failed.', err);
            return finalize(1);
          }
          return finalize(requestedExitCode);
        });
      } catch (err) {
        if (err.code !== 'ERR_SERVER_NOT_RUNNING') {
          log.error('[SERVER_LIFECYCLE] HTTP server close threw unexpectedly.', err);
          return finalize(1);
        }
        return finalize(requestedExitCode);
      }
    });

    return shutdownPromise;
  };

  const register = (eventName, handler) => {
    processRef.once(eventName, handler);
    registeredHandlers.push([eventName, handler]);
  };

  register('SIGINT', () => void shutdown('SIGINT', 0));
  register('SIGTERM', () => void shutdown('SIGTERM', 0));
  register('uncaughtException', error => {
    log.error('[SERVER_LIFECYCLE] Uncaught exception; shutting down.', toError(error));
    void shutdown('UNCAUGHT_EXCEPTION', 1);
  });
  register('unhandledRejection', reason => {
    log.error('[SERVER_LIFECYCLE] Unhandled promise rejection; shutting down.', toError(reason));
    void shutdown('UNHANDLED_REJECTION', 1);
  });

  return { shutdown, dispose };
}
