import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { adminRouter } from '../../routes/admin.routes.js';
import { db } from '../../db.js';
import { dbService } from '../../services/dbService.js';
import { generateAdminToken } from '../../security/auth.js';

const app = express();
app.use(express.json());
app.use('/api', adminRouter);

const adminToken = generateAdminToken({ role: 'OVERSEER_ADMIN' });
const viewerToken = generateAdminToken({ role: 'VIEWER' });
const createdPostIds = [];

function unique(prefix) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`;
}

function authenticated(method, url) {
  return request(app)[method](url).set('x-admin-token', adminToken);
}

function createDocument() {
  const post = dbService.createBlogPost({
    presentation_profile: 'article',
    slug: unique('document-asset-route'),
    title: 'Document asset route test',
    summary: 'Historical DB asset projection test.',
    content: '# Historical DB asset projection',
    visibility: 'public',
    published: 1
  }, 'TEST_SUITE');
  createdPostIds.push(post.id);
  return post;
}

afterEach(() => {
  for (const postId of createdPostIds.splice(0).reverse()) {
    db.prepare('DELETE FROM blog_posts WHERE id = ?').run(postId);
  }
});

describe('database document asset compatibility routes', () => {
  it('keeps the old DB asset projection readable but rejects writes in favour of a Vault package', async () => {
    const document = createDocument();
    const endpoint = `/api/admin/content/documents/${document.id}/assets`;

    const list = await authenticated('get', endpoint);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({ success: true, assets: [] });

    const upload = await authenticated('post', endpoint)
      .set('content-type', 'application/octet-stream')
      .set('x-content-asset-path', 'evidence/review.pdf')
      .send(Buffer.from('%PDF-1.7\nVault-first evidence'));
    const deletion = await authenticated('delete', `${endpoint}/legacy-asset`);

    for (const response of [upload, deletion]) {
      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        error: 'VAULT_AUTHORITATIVE',
        source_of_truth: 'LOCAL_VAULT',
        vault_sync_endpoint: '/api/admin/vault/sync'
      });
    }
  });

  it('retains the admin role boundary for the legacy DB asset projection', async () => {
    const document = createDocument();
    const response = await request(app)
      .get(`/api/admin/content/documents/${document.id}/assets`)
      .set('x-admin-token', viewerToken);
    expect(response.status).toBe(403);
  });
});
