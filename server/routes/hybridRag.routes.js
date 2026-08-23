import { Router } from 'express';
import { authMiddleware } from '../security/auth.js';
import { logger } from '../logger.js';
import { hybridKnowledgeService } from '../services/hybridKnowledgeService.js';
import { normalizeFactProfiles, upsertLocalSqlSnapshot } from '../services/sqlFactGateway.js';
import { hybridRagContextSchema, hybridSqlSnapshotSchema } from '../schemas/hybridRag.schema.js';

export const hybridRagRouter = Router();

function parseOrRespond(schema, payload, res) {
  const parsed = schema.safeParse(payload);
  if (parsed.success) return parsed.data;
  res.status(400).json({
    error: 'INVALID_HYBRID_RAG_REQUEST',
    code: 'VALIDATION_ERROR',
    issues: parsed.error.issues.map(issue => ({ path: issue.path.join('.'), message: issue.message }))
  });
  return null;
}

function actorFromRequest(req) {
  return String(req.adminUser?.sub || req.adminUser?.role || 'OVERSEER_ADMIN').slice(0, 160);
}

function setSensitiveResponseHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
}

// This endpoint is intentionally admin-only. It can include current ERP/BOM
// facts, so it must never be mounted alongside the public knowledge search API.
hybridRagRouter.post('/admin/hybrid-rag/context', authMiddleware, async (req, res) => {
  const input = parseOrRespond(hybridRagContextSchema, req.body, res);
  if (!input) return;
  setSensitiveResponseHeaders(res);

  try {
    const context = await hybridKnowledgeService.assembleContext({
      query: input.query,
      graphDepth: input.graph_depth,
      maxChunks: input.max_chunks,
      maxGraphNodes: input.max_graph_nodes
    });
    hybridKnowledgeService.recordRetrievalAudit({
      actor: actorFromRequest(req),
      requestId: req.id,
      query: input.query,
      documentIds: context.documents.map(document => document.id),
      chunkIds: context.chunks.map(chunk => chunk.id),
      sqlProjectIds: context.sql_context.map(item => item.sql_project_id),
      factProfiles: context.sql_context.flatMap(item => Object.keys(item.facts || {})),
      outcome: context.status
    });
    return res.json(context);
  } catch (error) {
    hybridKnowledgeService.recordRetrievalAudit({
      actor: actorFromRequest(req),
      requestId: req.id,
      query: input.query,
      outcome: 'failed'
    });
    logger.error('[HYBRID_RAG_CONTEXT_FAILED]', error, { requestId: req.id });
    const knownInputError = /^(INVALID_|UNSUPPORTED_|FRONTMATTER_|HYBRID_RAG_)/.test(error.message || '');
    return res.status(knownInputError ? 400 : 500).json({
      error: knownInputError ? error.message : 'HYBRID_RAG_CONTEXT_FAILED',
      code: knownInputError ? 'VALIDATION_ERROR' : 'HYBRID_RAG_ERROR'
    });
  }
});

hybridRagRouter.get('/admin/hybrid-rag/graph/:slug', authMiddleware, (req, res) => {
  const slug = String(req.params.slug || '').trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return res.status(400).json({ error: 'INVALID_SLUG', code: 'VALIDATION_ERROR' });
  }
  const depth = Number(req.query.depth ?? 1);
  const graph = hybridKnowledgeService.getGraphBySlug(slug, { depth });
  if (!graph) return res.status(404).json({ error: 'HYBRID_RAG_DOCUMENT_NOT_FOUND' });

  setSensitiveResponseHeaders(res);
  return res.json(graph);
});

// Pilot/testing ingress for local, air-gapped fact snapshots. Production uses
// HYBRID_SQL_FACT_GATEWAY_URL and the same allowlisted profile contract.
hybridRagRouter.put('/admin/hybrid-rag/sql-snapshots/:sqlProjectId', authMiddleware, (req, res) => {
  const input = parseOrRespond(hybridSqlSnapshotSchema, req.body, res);
  if (!input) return;

  try {
    // Reject undeclared fact-profile names before writing anything. This also
    // makes the snapshot interface incapable of becoming a generic data dump.
    normalizeFactProfiles(Object.keys(input.facts));
    const snapshot = upsertLocalSqlSnapshot({
      sqlProjectId: req.params.sqlProjectId,
      facts: input.facts,
      asOf: input.as_of,
      expiresAt: input.expires_at,
      source: input.source || 'local_snapshot'
    });
    hybridKnowledgeService.recordRetrievalAudit({
      actor: actorFromRequest(req),
      requestId: req.id,
      action: 'SQL_SNAPSHOT_UPSERT',
      sqlProjectIds: [snapshot.sql_project_id],
      factProfiles: snapshot.fact_profiles,
      outcome: 'success'
    });
    setSensitiveResponseHeaders(res);
    return res.status(201).json({ success: true, snapshot });
  } catch (error) {
    logger.error('[HYBRID_SQL_SNAPSHOT_REJECTED]', error, { requestId: req.id });
    return res.status(400).json({
      error: error.message || 'INVALID_SQL_SNAPSHOT',
      code: 'VALIDATION_ERROR'
    });
  }
});
