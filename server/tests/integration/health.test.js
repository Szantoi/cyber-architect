import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';

describe('Health & Telemetry API Integration Tests', () => {
  describe('GET /api/health', () => {
    it('returns HTTP 200 with ONLINE status and database telemetry', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'ONLINE');
      expect(res.body).toHaveProperty('timestamp');
      expect(res.body).toHaveProperty('uptimeSeconds');
      expect(typeof res.body.uptimeSeconds).toBe('number');
      expect(res.body).toHaveProperty('database');
      expect(res.body.database).toHaveProperty('status', 'HEALTHY');
      expect(res.body.database).toHaveProperty('mode', 'WAL');
    });
  });

  describe('GET /api/metrics', () => {
    it('returns system telemetry, memory usage, and db statistics', async () => {
      const res = await request(app).get('/api/metrics');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('system');
      expect(res.body.system).toHaveProperty('nodeVersion');
      expect(res.body.system).toHaveProperty('cpuCount');
      expect(res.body).toHaveProperty('memory');
      expect(res.body.memory).toHaveProperty('rssMb');
      expect(res.body.memory).toHaveProperty('heapUsedMb');
      expect(res.body).toHaveProperty('database');
      expect(res.body.database).toHaveProperty('sizeKb');
    });
  });
});
