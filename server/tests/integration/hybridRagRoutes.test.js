import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { db, initDatabase } from '../../db.js';
import { generateAdminToken } from '../../security/auth.js';
import { hybridKnowledgeService } from '../../services/hybridKnowledgeService.js';
import { upsertLocalSqlSnapshot } from '../../services/sqlFactGateway.js';

const slug = 'hybrid-route-test-document';
const adminToken = generateAdminToken({ role: 'OVERSEER_ADMIN', sub: 'HYBRID_RAG_TEST' });

function createFixture() {
  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO blog_posts
      (project_id, content_type, slug, title, summary, content, category,
       dimensions, visibility, embedding, read_time, created_at, published)
    VALUES (?, 'knowledge', ?, ?, ?, ?, 'TEST', '{}', 'private', '[]', '1 PERC', ?, 0)
  `).run(
    'prj_rag_enterprise', slug, 'Hibrid route teszt', 'Route fixture',
    '# Készlet\n\nA BOM készlet kritikus hiányt mutat.', now
  );
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(Number(result.lastInsertRowid));
  hybridKnowledgeService.indexDocument({
    post,
    frontmatter: {
      document_id: 'kb:project:PRJ-2026:route-test',
      sql_project_id: 'PRJ-2026',
      classification: 'internal',
      rag_index: true,
      sql_bindings: [{
        entity_id: 'PRJ-2026',
        fact_profiles: ['bom_availability']
      }]
    }
  });
  upsertLocalSqlSnapshot({
    sqlProjectId: 'PRJ-2026',
    facts: { bom_availability: { shortage_count: 1 } },
    asOf: '2026-08-20T10:00:00.000Z',
    expiresAt: '2099-08-20T12:00:00.000Z'
  });
}

beforeEach(() => {
  initDatabase();
  db.prepare('DELETE FROM blog_posts WHERE slug = ?').run(slug);
  db.prepare("DELETE FROM hybrid_rag_sql_snapshots WHERE sql_project_id = 'PRJ-2026'").run();
  createFixture();
});

describe('hybrid RAG admin routes', () => {
  it('keeps hybrid context unavailable to unauthenticated callers', async () => {
    const response = await request(app)
      .post('/api/admin/hybrid-rag/context')
      .send({ query: 'BOM készlet' });

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('AUTH_REQUIRED');
  });

  it('returns document evidence and timestamped operational facts to an admin', async () => {
    const response = await request(app)
      .post('/api/admin/hybrid-rag/context')
      .set('x-admin-token', adminToken)
      .send({ query: 'BOM készlet', graph_depth: 1 });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.body.status).toBe('ok');
    expect(response.body.chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug })
    ]));
    expect(response.body.sql_context).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sql_project_id: 'PRJ-2026',
        facts: { bom_availability: { shortage_count: 1 } }
      })
    ]));
    expect(response.body.llm_context).toContain('kb://hybrid-route-test-document#chunk-1');
  });

  it('rejects raw SQL-shaped snapshot input at the request boundary', async () => {
    const response = await request(app)
      .put('/api/admin/hybrid-rag/sql-snapshots/PRJ-2026')
      .set('x-admin-token', adminToken)
      .send({
        facts: { bom_availability: { shortage_count: 1 } },
        sql: 'SELECT * FROM bom'
      });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns graph metadata only from the protected route', async () => {
    const response = await request(app)
      .get(`/api/admin/hybrid-rag/graph/${slug}`)
      .set('x-admin-token', adminToken);

    expect(response.status).toBe(200);
    expect(response.body.root).toMatchObject({ slug });
    expect(response.body.documents).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug })
    ]));
  });
});
