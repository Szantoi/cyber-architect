import { Router } from 'express';
import os from 'node:os';
import fs from 'node:fs';
import { db, dbPath } from '../db.js';
import { logger } from '../logger.js';

function getUptimeSeconds(startTime, now) {
  return Math.max(0, Math.floor((now() - startTime) / 1000));
}

/**
 * Creates the operational probe router. Dependency injection keeps degraded
 * database behaviour testable without closing or replacing the real database.
 */
export function createHealthRouter({
  database = db,
  databasePath = dbPath,
  log = logger,
  now = Date.now,
  environment = process.env.NODE_ENV || 'development'
} = {}) {
  const router = Router();
  const startTime = now();

  const setProbeHeaders = res => {
    // Probe results are point-in-time operational state and must not be cached
    // by browsers, reverse proxies, or orchestrators.
    res.setHeader('Cache-Control', 'no-store');
  };

  const getReadiness = () => {
    let status = 'HEALTHY';
    let latencyMs = 0;

    try {
      const t0 = performance.now();
      database.prepare('SELECT 1').get();
      latencyMs = parseFloat((performance.now() - t0).toFixed(2));
    } catch (err) {
      status = 'DISCONNECTED';
      log.warn('[HEALTH_CHECK] Database readiness probe failed', { error: err.message });
    }

    return {
      ready: status === 'HEALTHY',
      database: {
        status,
        latencyMs,
        mode: 'WAL'
      }
    };
  };

  const readinessHandler = (req, res) => {
    setProbeHeaders(res);
    const readiness = getReadiness();

    return res.status(readiness.ready ? 200 : 503).json({
      status: readiness.ready ? 'ONLINE' : 'DEGRADED',
      ready: readiness.ready,
      timestamp: new Date(now()).toISOString(),
      uptimeSeconds: getUptimeSeconds(startTime, now),
      environment,
      database: readiness.database
    });
  };

  /**
   * Backwards-compatible readiness endpoint plus explicit orchestrator route.
   * A failed dependency returns 503 so traffic is not routed to an unusable
   * instance.
   */
  router.get('/health', readinessHandler);
  router.get('/health/ready', readinessHandler);

  /**
   * Process-only liveness probe. It deliberately avoids the database so an
   * orchestrator can distinguish restart-worthy process failure from a
   * temporarily unavailable dependency.
   */
  router.get('/health/live', (req, res) => {
    setProbeHeaders(res);
    return res.json({
      status: 'ONLINE',
      alive: true,
      timestamp: new Date(now()).toISOString(),
      uptimeSeconds: getUptimeSeconds(startTime, now),
      environment
    });
  });

  /**
   * GET /api/metrics
   * System telemetry, resource consumption, and DB diagnostics.
   */
  router.get('/metrics', (req, res) => {
    setProbeHeaders(res);
    const memoryUsage = process.memoryUsage();
    const uptimeSeconds = getUptimeSeconds(startTime, now);

    let dbSizeBytes = 0;
    let walSizeBytes = 0;
    let terminalsCount = 0;
    let auditLogsCount = 0;
    let diagnosticsStatus = 'OK';

    try {
      const walPath = `${databasePath}-wal`;

      if (fs.existsSync(databasePath)) {
        dbSizeBytes = fs.statSync(databasePath).size;
      }
      if (fs.existsSync(walPath)) {
        walSizeBytes = fs.statSync(walPath).size;
      }

      const tRow = database.prepare('SELECT COUNT(*) as count FROM agent_terminals').get();
      terminalsCount = tRow ? tRow.count : 0;

      const aRow = database.prepare('SELECT COUNT(*) as count FROM audit_logs').get();
      auditLogsCount = aRow ? aRow.count : 0;
    } catch (err) {
      diagnosticsStatus = 'DEGRADED';
      log.warn('[METRICS_CHECK] Database diagnostics failed', { error: err.message });
    }

    return res.json({
      timestamp: new Date(now()).toISOString(),
      system: {
        uptimeSeconds,
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        cpuCount: os.cpus().length,
        loadAvg: os.loadavg()
      },
      memory: {
        rssMb: parseFloat((memoryUsage.rss / 1024 / 1024).toFixed(2)),
        heapTotalMb: parseFloat((memoryUsage.heapTotal / 1024 / 1024).toFixed(2)),
        heapUsedMb: parseFloat((memoryUsage.heapUsed / 1024 / 1024).toFixed(2)),
        externalMb: parseFloat((memoryUsage.external / 1024 / 1024).toFixed(2))
      },
      database: {
        diagnosticsStatus,
        sizeKb: parseFloat((dbSizeBytes / 1024).toFixed(2)),
        walSizeKb: parseFloat((walSizeBytes / 1024).toFixed(2)),
        terminalsCount,
        auditLogsCount
      }
    });
  });

  return router;
}

export const healthRouter = createHealthRouter();
