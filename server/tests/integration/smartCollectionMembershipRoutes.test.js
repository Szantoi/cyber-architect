import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { adminRouter } from '../../routes/admin.routes.js';
import { db } from '../../db.js';
import { dbService } from '../../services/dbService.js';
import { generateAdminToken } from '../../security/auth.js';
import { taxonomyService } from '../../services/taxonomyService.js';

const app = express();
app.use(express.json());
app.use('/api', adminRouter);

const token = generateAdminToken({ role: 'OVERSEER_ADMIN', sub: 'SMART_MEMBERSHIP_ROUTE_TEST' });
const authenticated = (method, url) => request(app)[method](url).set('x-admin-token', token);
const created = [];
const unique = (prefix) => `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`;

afterEach(() => {
  for (const item of created.splice(0).reverse()) {
    if (item.type === 'collection') {
      db.prepare('DELETE FROM smart_collection_membership_overrides WHERE collection_id = ?').run(item.id);
      db.prepare('DELETE FROM smart_collections WHERE id = ?').run(item.id);
    }
    if (item.type === 'post') db.prepare('DELETE FROM blog_posts WHERE id = ?').run(item.id);
  }
});

describe('smart collection membership admin routes', () => {
  it('returns, sets, and clears manual document membership', async () => {
    const slug = unique('smart-membership-route');
    const collection = taxonomyService.createSmartCollection({
      id: slug.replace(/-/g, '_'),
      slug,
      name: 'Route membership test',
      scope: 'public',
      rule: { type: 'content', field: 'category', operator: 'equals', value: 'TEST' },
      group_by: { type: 'none' },
      layout: { view: 'cards' }
    }, 'TEST_SUITE');
    created.push({ type: 'collection', id: collection.id });
    const post = dbService.createBlogPost({
      content_type: 'knowledge',
      slug: unique('smart-membership-route-post'),
      title: 'Route membership document',
      summary: 'Route membership test document.',
      content: '# Route membership',
      category: 'TEST',
      visibility: 'public',
      published: 1,
      dimensions: {}
    }, 'TEST_SUITE');
    created.push({ type: 'post', id: post.id });

    const set = await authenticated('put', `/api/admin/smart-collections/${collection.id}/overrides/${post.id}`)
      .send({ mode: 'exclude' });
    expect(set.status).toBe(200);
    expect(set.body.override).toMatchObject({ collection_id: collection.id, post_id: post.id, mode: 'exclude' });

    const listed = await authenticated('get', `/api/admin/smart-collections/${collection.id}/overrides`);
    expect(listed.status).toBe(200);
    expect(listed.body.overrides).toEqual([expect.objectContaining({ post_id: post.id, mode: 'exclude' })]);

    const cleared = await authenticated('delete', `/api/admin/smart-collections/${collection.id}/overrides/${post.id}`);
    expect(cleared.status).toBe(200);
    expect(cleared.body.success).toBe(true);

    const afterClear = await authenticated('get', `/api/admin/smart-collections/${collection.id}/overrides`);
    expect(afterClear.status).toBe(200);
    expect(afterClear.body.overrides).toEqual([]);
  });
});
