import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { adminRouter } from '../../routes/admin.routes.js';
import { db } from '../../db.js';
import { dbService } from '../../services/dbService.js';
import { generateAdminToken } from '../../security/auth.js';

const app = express();
app.use(express.json());
app.use('/api', adminRouter);

const adminToken = generateAdminToken({ role: 'OVERSEER_ADMIN' });
const authenticated = (method, url) => request(app)[method](url).set('x-admin-token', adminToken);

const createStoredContent = (overrides = {}) => dbService.createBlogPost({
  content_type: 'blog',
  slug: `admin-content-${crypto.randomUUID()}`,
  title: 'Admin content test',
  summary: 'Admin content regression test summary.',
  content: '# Admin content regression test',
  category: 'TEST',
  dimensions: {
    iparag: ['Teszt'],
    technologia: ['Vitest'],
    celcsoport: ['Fejlesztő']
  },
  visibility: 'public',
  published: 1,
  ...overrides
}, 'TEST_SUITE');

describe('Admin CMS content routes', () => {
  it('lists blog and knowledge content by default', async () => {
    const response = await authenticated('get', '/api/admin/blog');

    expect(response.status).toBe(200);
    expect(response.body.some(item => item.content_type === 'blog')).toBe(true);
    expect(response.body.some(item => item.content_type === 'knowledge')).toBe(true);
  });

  it('supports a validated content_type list filter', async () => {
    const knowledgeResponse = await authenticated('get', '/api/admin/blog')
      .query({ content_type: 'knowledge' });
    const invalidResponse = await authenticated('get', '/api/admin/blog')
      .query({ content_type: 'article' });

    expect(knowledgeResponse.status).toBe(200);
    expect(knowledgeResponse.body.every(item => item.content_type === 'knowledge')).toBe(true);
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error).toBe('VALIDATION_ERROR');
  });

  it('keeps legacy CMS writer URLs retired in favour of the canonical Vault', async () => {
    const slug = `admin-created-${crypto.randomUUID()}`;
    const response = await authenticated('post', '/api/admin/blog').send({
      content_type: 'knowledge',
      slug,
      title: 'Competing database author',
      summary: 'This must be authored in the server-side vault instead.',
      content: '# Not persisted by CMS'
    });

    expect(response.status).toBe(410);
    expect(response.body).toMatchObject({
      error: 'VAULT_AUTHORITATIVE',
      source_of_truth: 'LOCAL_VAULT'
    });
    expect(dbService.getBlogPostBySlug(slug, { publishedOnly: false, visibility: 'all' })).toBeNull();
  });

  it('keeps legacy CMS updates and deletes retired without changing the DB record', async () => {
    const stored = createStoredContent();
    const update = await authenticated('put', `/api/admin/blog/${stored.id}`).send({
      title: 'This update must not win'
    });
    const deletion = await authenticated('delete', `/api/admin/blog/${stored.id}`);

    expect(update.status).toBe(410);
    expect(deletion.status).toBe(410);
    expect(dbService.getBlogPostById(stored.id)).toMatchObject({
      title: 'Admin content test'
    });
  });

  it.each([
    [{ content_type: 'article' }, 'content_type'],
    [{ video_url: 'javascript:alert(1)' }, 'video_url'],
    [{ slug: '../../server/config/drive-tokens' }, 'slug']
  ])('still validates malformed legacy create metadata before reporting endpoint retirement: %j', async (invalidMetadata, field) => {
    const response = await authenticated('post', '/api/admin/blog')
      .send({
        ...invalidMetadata,
        title: 'Invalid metadata document',
        summary: 'This request must be rejected before persistence.',
        content: '# Invalid metadata'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('VALIDATION_ERROR');
    expect(response.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field })
    ]));
  });

  it('rejects direct DB document creation without creating a competing content source', async () => {
    const countBefore = db.prepare('SELECT COUNT(*) AS count FROM blog_posts').get().count;
    const created = await authenticated('post', '/api/admin/content/documents').send({
      content_type: 'knowledge',
      title: 'Vault-first tudásanyag',
      summary: 'A Markdown kanonikus helye a Content Vault.',
      content: '# Vault-first\n\nA Markdown az Obsidianban él.'
    });

    expect(created.status).toBe(409);
    expect(created.body).toMatchObject({
      error: 'VAULT_AUTHORITATIVE',
      source_of_truth: 'LOCAL_VAULT'
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM blog_posts').get().count).toBe(countBefore);
  });

  it('rejects direct DB document updates and preserves the projection record', async () => {
    const stored = createStoredContent();
    const update = await authenticated('put', `/api/admin/content/documents/${stored.id}`).send({
      revision: 'a'.repeat(64),
      title: 'Frissített DB cím',
      summary: 'Frissített, adatbázisban tárolt összefoglaló.',
      content: '# Frissített\n\nEz már az új verzió.',
      folder_id: null
    });

    expect(update.status).toBe(409);
    expect(update.body).toMatchObject({
      error: 'VAULT_AUTHORITATIVE',
      source_of_truth: 'LOCAL_VAULT'
    });
    expect(dbService.getBlogPostById(stored.id)).toMatchObject({ title: 'Admin content test' });
  });

  it('rejects direct DB folder mutations so package paths stay authoritative', async () => {
    const response = await authenticated('post', '/api/admin/content-folders').send({
      name: 'Competing database folder'
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: 'VAULT_AUTHORITATIVE',
      source_of_truth: 'LOCAL_VAULT'
    });
  });

  it('requires the overseer role for document and folder authoring', async () => {
    const viewerToken = generateAdminToken({ role: 'VIEWER' });
    const response = await request(app)
      .get('/api/admin/content-folders')
      .set('x-admin-token', viewerToken);

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('ADMIN_ROLE_REQUIRED');
  });
});

describe('dbService source identity lookup', () => {
  it('returns the parsed content row for an exact source ID', () => {
    const sourceId = `vault_${crypto.randomUUID().replace(/-/g, '')}`;
    const stored = createStoredContent({
      content_type: 'knowledge',
      drive_file_id: sourceId
    });

    expect(dbService.getBlogPostByDriveFileId(sourceId)).toMatchObject({
      id: stored.id,
      slug: stored.slug,
      content_type: 'knowledge',
      drive_file_id: sourceId,
      dimensions: expect.objectContaining({ technologia: ['Vitest'] })
    });
    expect(dbService.getBlogPostByDriveFileId('')).toBeNull();
    expect(dbService.getBlogPostByDriveFileId('vault_missing')).toBeNull();
  });

  it('uses the same trimmed identity semantics as the SQLite uniqueness boundary', () => {
    const sourceId = `vault_${crypto.randomUUID().replace(/-/g, '')}`;
    const stored = createStoredContent({ drive_file_id: sourceId });
    db.prepare('UPDATE blog_posts SET drive_file_id = ? WHERE id = ?')
      .run(`  ${sourceId}  `, stored.id);

    expect(dbService.getBlogPostByDriveFileId(sourceId)).toMatchObject({
      id: stored.id,
      drive_file_id: `  ${sourceId}  `
    });
  });
});
