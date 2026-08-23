import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';

import { app } from '../../index.js';
import { db } from '../../db.js';
import { generateAdminToken } from '../../security/auth.js';
import { dbService } from '../../services/dbService.js';
import { graphService } from '../../services/graphService.js';

const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 18);
const actor = `AUTH_PREVIEW_TEST_${suffix}`;
const privateKnowledgeSlug = `auth-preview-private-knowledge-${suffix}`;
const privateBlogSlug = `auth-preview-private-blog-${suffix}`;
const privateGraphId = `preview/private-${suffix}`;
const adminToken = generateAdminToken({ role: 'OVERSEER_ADMIN', sub: actor });
const viewerToken = generateAdminToken({ role: 'VIEWER', sub: actor });
const previewHeaders = {
  'x-ca-preview': 'admin',
  'x-admin-token': adminToken
};

const createdPostIds = [];

beforeAll(() => {
  const knowledge = dbService.createBlogPost({
    project_id: 'prj_general',
    content_type: 'knowledge',
    slug: privateKnowledgeSlug,
    title: 'Admin preview private knowledge fixture',
    summary: 'Private unpublished knowledge must remain invisible anonymously.',
    content: '# Private preview knowledge\n\nOnly a validated admin preview may read this.',
    category: 'TEST',
    visibility: 'private',
    published: 0
  }, actor);
  const blog = dbService.createBlogPost({
    project_id: 'prj_general',
    content_type: 'blog',
    slug: privateBlogSlug,
    title: 'Admin preview private blog fixture',
    summary: 'Private unpublished blog must remain invisible anonymously.',
    content: '# Private preview blog\n\nOnly a validated admin preview may read this.',
    category: 'TEST',
    visibility: 'private',
    published: 0
  }, actor);
  createdPostIds.push(knowledge.id, blog.id);

  graphService.createGraph({
    id: privateGraphId,
    slug: `preview-private-${suffix}`,
    name: 'Private preview graph fixture',
    description: 'Only available to admin preview.',
    visibility: 'private',
    active: true
  }, actor);
});

afterAll(() => {
  db.prepare('DELETE FROM graph_definitions WHERE id = ?').run(privateGraphId);
  for (const id of createdPostIds.splice(0).reverse()) {
    db.prepare('DELETE FROM blog_posts WHERE id = ?').run(id);
  }
});

describe('authenticated admin preview on public reader routes', () => {
  it('keeps anonymous, query-flagged, and merely token-bearing reads on the public projection', async () => {
    const [anonymousDocs, queryFlaggedDocs, tokenOnlyDocs, anonymousBlogs, publicContent, anonymousGraphs] = await Promise.all([
      request(app).get('/api/docs'),
      request(app).get('/api/docs').query({ preview: 'admin' }),
      request(app).get('/api/docs').set('x-admin-token', adminToken),
      request(app).get('/api/blog'),
      request(app).get('/api/content'),
      request(app).get('/api/knowledge/graphs')
    ]);

    for (const response of [anonymousDocs, queryFlaggedDocs, tokenOnlyDocs]) {
      expect(response.status).toBe(200);
      expect(response.body.docs.map(document => document.slug)).not.toContain(privateKnowledgeSlug);
    }
    expect(anonymousBlogs.status).toBe(200);
    expect(anonymousBlogs.body.map(post => post.slug)).not.toContain(privateBlogSlug);
    expect(publicContent.status).toBe(200);
    expect(publicContent.body.recentBlogs.map(post => post.slug)).not.toContain(privateBlogSlug);
    expect(anonymousGraphs.status).toBe(200);
    expect(anonymousGraphs.body.graphs.map(graph => graph.id)).not.toContain(privateGraphId);

    const privateDetail = await request(app).get(`/api/docs/${privateKnowledgeSlug}`);
    expect(privateDetail.status).toBe(404);
  });

  it('fails closed whenever an admin preview is requested without a valid admin JWT', async () => {
    const [missingToken, invalidToken, nonAdminRole, invalidMode] = await Promise.all([
      request(app).get('/api/docs').set('x-ca-preview', 'admin'),
      request(app).get('/api/docs').set('x-ca-preview', 'admin').set('x-admin-token', 'not-a-jwt'),
      request(app).get('/api/docs').set('x-ca-preview', 'admin').set('x-admin-token', viewerToken),
      request(app).get('/api/docs').set('x-ca-preview', 'all').set('x-admin-token', adminToken)
    ]);

    expect(missingToken.status).toBe(401);
    expect(missingToken.body.code).toBe('AUTH_REQUIRED');
    expect(invalidToken.status).toBe(401);
    expect(invalidToken.body.code).toBe('INVALID_TOKEN');
    expect(nonAdminRole.status).toBe(403);
    expect(nonAdminRole.body.code).toBe('ADMIN_ROLE_REQUIRED');
    expect(invalidMode.status).toBe(400);
    expect(invalidMode.body.code).toBe('INVALID_PREVIEW_MODE');
  });

  it('reveals private and unpublished content only through the authenticated header contract', async () => {
    const [docs, detail, blogs, graphs] = await Promise.all([
      request(app).get('/api/docs').set(previewHeaders),
      request(app).get(`/api/docs/${privateKnowledgeSlug}`).set(previewHeaders),
      request(app).get('/api/blog').set(previewHeaders),
      request(app).get('/api/knowledge/graphs').set(previewHeaders)
    ]);

    expect(docs.status).toBe(200);
    expect(docs.headers['cache-control']).toContain('no-store');
    expect(docs.headers['x-ca-read-scope']).toBe('admin-preview');
    expect(docs.body.docs).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: privateKnowledgeSlug, visibility: 'private', published: 0 })
    ]));
    expect(detail.status).toBe(200);
    expect(detail.body).toMatchObject({ slug: privateKnowledgeSlug, content_type: 'knowledge' });
    expect(blogs.status).toBe(200);
    expect(blogs.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: privateBlogSlug, visibility: 'private', published: 0 })
    ]));
    expect(graphs.status).toBe(200);
    expect(graphs.body.graphs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: privateGraphId, visibility: 'private' })
    ]));
  });

  it('provides a no-store session verification endpoint and preflights the preview header', async () => {
    const [session, rejected, viewerSession, preflight] = await Promise.all([
      request(app).get('/api/admin/session').set('x-admin-token', adminToken),
      request(app).get('/api/admin/session'),
      request(app).get('/api/admin/session').set('x-admin-token', viewerToken),
      request(app)
        .options('/api/docs')
        .set('Origin', 'http://127.0.0.1:5173')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'content-type,x-admin-token,x-ca-preview')
    ]);

    expect(session.status).toBe(200);
    expect(session.headers['cache-control']).toContain('no-store');
    expect(session.body).toMatchObject({
      authenticated: true,
      role: 'OVERSEER_ADMIN',
      preview: { header: 'X-CA-Preview', value: 'admin' }
    });
    expect(rejected.status).toBe(401);
    expect(viewerSession.status).toBe(403);
    expect(viewerSession.body.code).toBe('ADMIN_ROLE_REQUIRED');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-headers'].toLowerCase()).toContain('x-ca-preview');
  });
});
