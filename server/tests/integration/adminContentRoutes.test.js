import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const driveMocks = vi.hoisted(() => ({
  exportPostToDrive: vi.fn().mockResolvedValue(null)
}));

vi.mock('../../services/driveSyncService.js', () => ({
  driveSyncService: {
    exportPostToDrive: driveMocks.exportPostToDrive
  }
}));

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
  beforeEach(() => {
    driveMocks.exportPostToDrive.mockClear();
    driveMocks.exportPostToDrive.mockResolvedValue(null);
  });

  it('lists blog and knowledge content by default', async () => {
    const response = await authenticated('get', '/api/admin/blog');

    expect(response.status).toBe(200);
    expect(response.body.some(item => item.content_type === 'blog')).toBe(true);
    expect(response.body.some(item => item.content_type === 'knowledge')).toBe(true);
  });

  it('supports a validated content_type list filter', async () => {
    const knowledgeResponse = await authenticated('get', '/api/admin/blog')
      .query({ content_type: 'knowledge' });

    expect(knowledgeResponse.status).toBe(200);
    expect(knowledgeResponse.body.length).toBeGreaterThan(0);
    expect(knowledgeResponse.body.every(item => item.content_type === 'knowledge')).toBe(true);

    const invalidResponse = await authenticated('get', '/api/admin/blog')
      .query({ content_type: 'article' });

    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error).toBe('VALIDATION_ERROR');
    expect(invalidResponse.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'content_type' })
    ]));
  });

  it('preserves knowledge type and video URL when creating content', async () => {
    const slug = `admin-created-knowledge-${crypto.randomUUID()}`;
    const videoUrl = 'https://www.youtube.com/watch?v=admin-create-test';
    const response = await authenticated('post', '/api/admin/blog')
      .send({
        content_type: 'knowledge',
        slug,
        title: 'Admin-created knowledge document',
        summary: 'Knowledge content must not silently become a blog post.',
        content: '# Knowledge document',
        category: 'TEST',
        dimensions: {
          iparag: ['Teszt'],
          technologia: ['Node.js'],
          celcsoport: ['Fejlesztő']
        },
        visibility: 'public',
        video_url: videoUrl,
        read_time: '2 PERC',
        published: 1
      });

    expect(response.status).toBe(200);
    const created = dbService.getBlogPostBySlug(slug);
    expect(created).toMatchObject({
      content_type: 'knowledge',
      video_url: videoUrl
    });
    expect(driveMocks.exportPostToDrive).toHaveBeenCalledWith(
      expect.objectContaining({ id: created.id, content_type: 'knowledge', video_url: videoUrl })
    );
  });

  it.each([
    [{ content_type: 'article' }, 'content_type'],
    [{ video_url: 'javascript:alert(1)' }, 'video_url'],
    [{ slug: '../../server/config/drive-tokens' }, 'slug']
  ])('rejects invalid create metadata %j', async (invalidMetadata, field) => {
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
    expect(driveMocks.exportPostToDrive).not.toHaveBeenCalled();
  });

  it('updates content type and video URL without losing the selected corpus', async () => {
    const stored = createStoredContent();
    const videoUrl = 'https://videos.example.com/admin-update';
    const response = await authenticated('put', `/api/admin/blog/${stored.id}`)
      .send({
        content_type: 'knowledge',
        video_url: videoUrl
      });

    expect(response.status).toBe(200);
    const updated = dbService.getBlogPostById(stored.id);
    expect(updated).toMatchObject({
      content_type: 'knowledge',
      video_url: videoUrl
    });
    expect(driveMocks.exportPostToDrive).toHaveBeenCalledWith(
      expect.objectContaining({ id: stored.id, content_type: 'knowledge', video_url: videoUrl })
    );
  });

  it('rejects invalid update metadata before changing stored content', async () => {
    const stored = createStoredContent();
    const response = await authenticated('put', `/api/admin/blog/${stored.id}`)
      .send({
        content_type: 'article',
        video_url: 'file:///private/video.mp4',
        slug: '../escape'
      });

    expect(response.status).toBe(400);
    expect(response.body.details).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: 'content_type' }),
      expect.objectContaining({ field: 'video_url' }),
      expect.objectContaining({ field: 'slug' })
    ]));
    expect(dbService.getBlogPostById(stored.id)).toMatchObject({
      content_type: 'blog',
      video_url: ''
    });
    expect(driveMocks.exportPostToDrive).not.toHaveBeenCalled();
  });

  it('waits for export and reports a Drive failure without losing the local save', async () => {
    driveMocks.exportPostToDrive.mockRejectedValueOnce(new Error('simulated cloud failure'));
    const slug = `admin-local-save-${crypto.randomUUID()}`;

    const response = await authenticated('post', '/api/admin/blog').send({
      slug,
      title: 'Locally durable document',
      summary: 'The database save must survive an export failure.',
      content: '# Local save'
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      drive_sync: { status: 'FAILED', code: 'DRIVE_EXPORT_FAILED' }
    });
    expect(dbService.getBlogPostBySlug(slug)).toMatchObject({
      title: 'Locally durable document'
    });
  });

  it('reports a cloud export with a failed local mirror as partial, not synced', async () => {
    const driveFileId = `gdrive_${crypto.randomUUID()}`;
    driveMocks.exportPostToDrive.mockResolvedValueOnce({
      drive_file_id: driveFileId,
      drive_modified_time: new Date().toISOString(),
      cloud_written: true,
      local_written: false,
      local_error: 'LOCAL_MIRROR_WRITE_FAILED'
    });

    const response = await authenticated('post', '/api/admin/blog').send({
      slug: `admin-partial-export-${crypto.randomUUID()}`,
      title: 'Partially exported document',
      summary: 'Drive succeeded while the local mirror failed.',
      content: '# Partial export'
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      drive_sync: {
        status: 'PARTIAL',
        drive_file_id: driveFileId,
        local_error: 'LOCAL_MIRROR_WRITE_FAILED'
      }
    });
    expect(dbService.getBlogPostByDriveFileId(driveFileId)).toMatchObject({
      id: response.body.id
    });
  });

  it('serializes exports for the same post and exports the newest row last', async () => {
    const stored = createStoredContent();
    let resolveFirstExport;
    driveMocks.exportPostToDrive
      .mockImplementationOnce(() => new Promise(resolve => {
        resolveFirstExport = resolve;
      }))
      .mockResolvedValueOnce(null);

    const firstResponse = authenticated('put', `/api/admin/blog/${stored.id}`)
      .send({ title: 'First queued title' })
      .then(response => response);
    await vi.waitFor(() => expect(driveMocks.exportPostToDrive).toHaveBeenCalledTimes(1));

    const secondResponse = authenticated('put', `/api/admin/blog/${stored.id}`)
      .send({ title: 'Newest queued title' })
      .then(response => response);
    await vi.waitFor(() => {
      expect(dbService.getBlogPostById(stored.id)?.title).toBe('Newest queued title');
    });
    expect(driveMocks.exportPostToDrive).toHaveBeenCalledTimes(1);

    resolveFirstExport(null);
    const [first, second] = await Promise.all([firstResponse, secondResponse]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(driveMocks.exportPostToDrive).toHaveBeenCalledTimes(2);
    expect(driveMocks.exportPostToDrive.mock.calls[1][0]).toMatchObject({
      id: stored.id,
      title: 'Newest queued title'
    });
  });
});

describe('dbService Drive source identity lookup', () => {
  it('returns the parsed content row for an exact Drive file ID', () => {
    const driveFileId = `gdrive_${crypto.randomUUID()}`;
    const stored = createStoredContent({
      content_type: 'knowledge',
      drive_file_id: driveFileId
    });

    expect(dbService.getBlogPostByDriveFileId(driveFileId)).toMatchObject({
      id: stored.id,
      slug: stored.slug,
      content_type: 'knowledge',
      drive_file_id: driveFileId,
      dimensions: expect.objectContaining({ technologia: ['Vitest'] })
    });
    expect(dbService.getBlogPostByDriveFileId('')).toBeNull();
    expect(dbService.getBlogPostByDriveFileId('gdrive_missing')).toBeNull();
  });

  it('uses the same trimmed identity semantics as the SQLite uniqueness boundary', () => {
    const driveFileId = `gdrive_${crypto.randomUUID()}`;
    const stored = createStoredContent({ drive_file_id: driveFileId });
    db.prepare('UPDATE blog_posts SET drive_file_id = ? WHERE id = ?')
      .run(`  ${driveFileId}  `, stored.id);

    expect(dbService.getBlogPostByDriveFileId(driveFileId)).toMatchObject({
      id: stored.id,
      drive_file_id: `  ${driveFileId}  `
    });
  });
});
