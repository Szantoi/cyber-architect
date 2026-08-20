import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createHealthRouter } from '../../routes/health.routes.js';

describe('Operational health probes', () => {
  it('returns 503 readiness while keeping liveness online when SQLite is unavailable', async () => {
    const database = {
      prepare: vi.fn(() => {
        throw new Error('database connection is not open');
      })
    };
    const log = { warn: vi.fn() };
    const probeApp = express();
    probeApp.use('/api', createHealthRouter({
      database,
      databasePath: 'not-used.sqlite',
      log,
      environment: 'test'
    }));

    const [legacyHealth, readiness, liveness] = await Promise.all([
      request(probeApp).get('/api/health'),
      request(probeApp).get('/api/health/ready'),
      request(probeApp).get('/api/health/live')
    ]);

    for (const response of [legacyHealth, readiness]) {
      expect(response.status).toBe(503);
      expect(response.body).toMatchObject({
        status: 'DEGRADED',
        ready: false,
        database: { status: 'DISCONNECTED', mode: 'WAL' }
      });
      expect(response.headers['cache-control']).toBe('no-store');
    }

    expect(liveness.status).toBe(200);
    expect(liveness.body).toMatchObject({ status: 'ONLINE', alive: true });
    expect(database.prepare).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledTimes(2);
  });
});
