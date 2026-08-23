import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { adminRouter } from '../../routes/admin.routes.js';
import { contentRouter } from '../../routes/content.routes.js';
import { dbService } from '../../services/dbService.js';
import { generateAdminToken } from '../../security/auth.js';

const app = express();
app.use(express.json());
app.use('/api', contentRouter);
app.use('/api', adminRouter);

const adminToken = generateAdminToken({ role: 'OVERSEER_ADMIN' });
const authenticated = (method, url) => request(app)[method](url).set('x-admin-token', adminToken);

describe('admin RAG tuning routes', () => {
  it('keeps the tuning config private while returning a complete default to an admin', async () => {
    const publicResponse = await request(app).get('/api/content');
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.settings.rag_config).toBeUndefined();

    const adminResponse = await authenticated('get', '/api/admin/rag-settings');
    expect(adminResponse.status).toBe(200);
    expect(adminResponse.body.config).toMatchObject({
      knowledge_semantic_weight: 0.4,
      chunk_semantic_weight: 0.6,
      embedding_title_weight: 2,
      chunk_include_heading_context: false
    });
  });

  it('persists a bounded config, audits it, and rejects malformed tuning values', async () => {
    const original = dbService.getRagSettings();
    const next = {
      ...original,
      knowledge_semantic_weight: 0.55,
      chunk_semantic_weight: 0.7,
      chunk_include_heading_context: true,
      embedding_content_char_limit: 4200
    };

    try {
      const saved = await authenticated('put', '/api/admin/rag-settings').send(next);
      expect(saved.status).toBe(200);
      expect(saved.body.config).toMatchObject(next);
      expect(dbService.getRagSettings()).toMatchObject(next);

      const invalid = await authenticated('put', '/api/admin/rag-settings').send({
        ...next,
        chunk_semantic_weight: 1.2
      });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error).toBe('VALIDATION_ERROR');
      expect(invalid.body.details).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: 'chunk_semantic_weight' })
      ]));

      const latestAudit = dbService.getAuditLogs({ limit: 1 })[0];
      expect(latestAudit).toMatchObject({ action: 'UPDATE_RAG_SETTINGS', entity: 'rag_settings' });

      const rolledBack = dbService.rollbackAuditEntry(latestAudit.id, 'TEST_SUITE');
      expect(rolledBack).toMatchObject(original);
      expect(dbService.getRagSettings()).toMatchObject(original);
    } finally {
      dbService.updateRagSettings(original, 'TEST_SUITE_RESTORE');
    }
  });

  it('requires admin authentication before returning or rebuilding RAG configuration', async () => {
    const readResponse = await request(app).get('/api/admin/rag-settings');
    expect(readResponse.status).toBe(401);

    const reindexResponse = await request(app).post('/api/admin/rag-settings/reindex');
    expect(reindexResponse.status).toBe(401);
  });

  it('rebuilds persisted document vectors through the protected endpoint', async () => {
    const original = dbService.getRagSettings();
    const post = dbService.createBlogPost({
      slug: `rag-reindex-${crypto.randomUUID()}`,
      title: 'Reindex target lexical alpha',
      summary: 'Unique vector data for the RAG reindex route.',
      content: 'A hosszabb törzsszöveg biztosítja, hogy a főcím szorzója mérhetően módosítsa a dokumentumvektort.',
      category: 'TEST'
    }, 'TEST_SUITE');
    const before = dbService.getBlogPostById(post.id).embedding;

    try {
      dbService.updateRagSettings({
        ...original,
        embedding_title_weight: original.embedding_title_weight === 5 ? 4 : 5
      }, 'TEST_SUITE');

      const response = await authenticated('post', '/api/admin/rag-settings/reindex');
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ success: true });
      expect(response.body.reindexed).toBeGreaterThan(0);
      expect(dbService.getBlogPostById(post.id).embedding).not.toBe(before);
    } finally {
      dbService.updateRagSettings(original, 'TEST_SUITE_RESTORE');
      dbService.reindexRagEmbeddings('TEST_SUITE_RESTORE');
    }
  });
});
