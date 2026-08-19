import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { generateAdminToken } from '../../security/auth.js';
import { config } from '../../config.js';

describe('Express API Supertest Integration Suite', () => {
  const adminToken = generateAdminToken({ role: 'OVERSEER_ADMIN' });

  describe('Public API Endpoints', () => {
    it('GET /api/content returns aggregated portfolio data', async () => {
      const res = await request(app).get('/api/content');
      expect(res.status).toBe(200);
      expect(res.body).toBeDefined();
      expect(res.body.settings).toBeDefined();
      expect(Array.isArray(res.body.skills)).toBe(true);
      expect(Array.isArray(res.body.projects)).toBe(true);
      expect(Array.isArray(res.body.recentBlogs)).toBe(true);
    });

    it('GET /api/blog returns public blog list', async () => {
      const res = await request(app).get('/api/blog');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/blog/categories returns categories and counts', async () => {
      const res = await request(app).get('/api/blog/categories');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/docs returns knowledge base docs list', async () => {
      const res = await request(app).get('/api/docs');
      expect(res.status).toBe(200);
      expect(res.body.docs).toBeDefined();
      expect(Array.isArray(res.body.docs)).toBe(true);
    });

    it('POST /api/uplink accepts valid contact transmission', async () => {
      const res = await request(app)
        .post('/api/uplink')
        .send({
          identity: 'Kovács Péter',
          subject: 'AI Pipeline Koncepció',
          message: 'Kérnénk egy részletes árajánlatot folyamatfejlesztésre.',
          website: '' // Clean honeypot
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('POST /api/uplink silently intercepts bot submissions via honeypot', async () => {
      const res = await request(app)
        .post('/api/uplink')
        .send({
          identity: 'Spam Bot',
          subject: 'Crypto Offer',
          message: 'Buy now',
          website: 'http://evil-spam.com' // Bot caught in honeypot
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('GET /api/non-existent-route returns standard 404 JSON response', async () => {
      const res = await request(app).get('/api/non-existent-route');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.code).toBe('NOT_FOUND');
      expect(res.body.error).toContain('ROUTE_NOT_FOUND');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('Admin Protected API Endpoints & Auth Gate', () => {
    it('POST /api/admin/login authenticates valid admin PIN', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ pin: config.admin.defaultPin });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
    });

    it('POST /api/admin/login rejects invalid PIN', async () => {
      const res = await request(app)
        .post('/api/admin/login')
        .send({ pin: '000000000000' });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain('SECURITY_AUTH_FAILED');
    });

    it('GET /api/admin/settings rejects unauthenticated request', async () => {
      const res = await request(app).get('/api/admin/settings');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('AUTH_REQUIRED');
    });

    it('GET /api/admin/messages retrieves inbox when authenticated', async () => {
      const res = await request(app)
        .get('/api/admin/messages')
        .set('x-admin-token', adminToken);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/admin/audit retrieves security audit trail', async () => {
      const res = await request(app)
        .get('/api/admin/audit')
        .set('x-admin-token', adminToken);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /api/admin/terminals returns matrix and org chart', async () => {
      const res = await request(app)
        .get('/api/admin/terminals')
        .set('x-admin-token', adminToken);

      expect(res.status).toBe(200);
      expect(res.body.terminals).toBeDefined();
      expect(res.body.orgChart).toBeDefined();
    });
  });
});
