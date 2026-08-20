import { Router } from 'express';
import os from 'node:os';
import fs from 'node:fs';
import { db, dbPath } from '../db.js';
import { logger } from '../logger.js';

export const healthRouter = Router();

const startTime = Date.now();

/**
 * GET /api/health
 * Public, low-overhead liveness & readiness health probe.
 */
healthRouter.get('/health', (req, res) => {
  let dbStatus = 'HEALTHY';
  let dbLatencyMs = 0;

  try {
    const t0 = performance.now();
    db.prepare('SELECT 1').get();
    dbLatencyMs = parseFloat((performance.now() - t0).toFixed(2));
  } catch (err) {
    dbStatus = 'DISCONNECTED';
    logger.warn('[HEALTH_CHECK] Database probe failed', { error: err.message });
  }

  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  res.json({
    status: dbStatus === 'HEALTHY' ? 'ONLINE' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    uptimeSeconds,
    environment: process.env.NODE_ENV || 'development',
    database: {
      status: dbStatus,
      latencyMs: dbLatencyMs,
      mode: 'WAL'
    }
  });
});

/**
 * GET /api/metrics
 * System telemetry, resource consumption, and DB diagnostics.
 */
healthRouter.get('/metrics', (req, res) => {
  const memoryUsage = process.memoryUsage();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);

  let dbSizeBytes = 0;
  let walSizeBytes = 0;
  let terminalsCount = 0;
  let auditLogsCount = 0;
  let diagnosticsStatus = 'OK';

  try {
    const walPath = `${dbPath}-wal`;

    if (fs.existsSync(dbPath)) {
      dbSizeBytes = fs.statSync(dbPath).size;
    }
    if (fs.existsSync(walPath)) {
      walSizeBytes = fs.statSync(walPath).size;
    }

    const tRow = db.prepare('SELECT COUNT(*) as count FROM agent_terminals').get();
    terminalsCount = tRow ? tRow.count : 0;

    const aRow = db.prepare('SELECT COUNT(*) as count FROM audit_logs').get();
    auditLogsCount = aRow ? aRow.count : 0;
  } catch (err) {
    diagnosticsStatus = 'DEGRADED';
    logger.warn('[METRICS_CHECK] Database diagnostics failed', { error: err.message });
  }

  res.json({
    timestamp: new Date().toISOString(),
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
