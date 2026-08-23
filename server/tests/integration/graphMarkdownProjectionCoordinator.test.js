import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '../../db.js';
import { adminRouter } from '../../routes/admin.routes.js';
import { generateAdminToken } from '../../security/auth.js';
import { graphMarkdownProjectionCoordinator } from '../../services/graphMarkdownProjectionCoordinator.js';
import { graphService } from '../../services/graphService.js';

const app = express();
app.use(express.json());
app.use('/api', adminRouter);

let vaultRoot;
let previousVaultRoot;
const actors = [];

function unique() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 20);
}

function writeNote(relativePath, { title, documentId, graphId }) {
  const filePath = path.join(vaultRoot, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const markdown = [
    '---',
    `title: "${title}"`,
    `slug: "${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"`,
    'content_type: knowledge',
    `document_id: "${documentId}"`,
    'ca_graph_refs:',
    `  - "${graphId}"`,
    '---',
    '',
    '# Emberi jegyzet',
    ''
  ].join('\n');
  fs.writeFileSync(filePath, markdown, 'utf8');
  return filePath;
}

function createFixture() {
  const suffix = unique();
  const actor = `GRAPH_COORD_TEST_${suffix}`;
  actors.push(actor);
  const graph = graphService.createGraph({
    id: `project/prj-${suffix}`,
    slug: `projection-project-${suffix}`,
    name: 'Projection graph',
    visibility: 'private'
  }, actor);
  const edgeType = graphService.createEdgeType({
    id: `depends_on_${suffix}`,
    slug: `depends-on-${suffix}`,
    label: 'Depends on',
    visibility: 'private'
  }, actor);
  const sourceRelativePath = `KnowledgeBase/01_Test/source-${suffix}.md`;
  const targetRelativePath = `KnowledgeBase/01_Test/target-${suffix}.md`;
  const sourceFile = writeNote(sourceRelativePath, {
    title: `Source ${suffix}`,
    documentId: `doc:source:${suffix}`,
    graphId: graph.id
  });
  const targetFile = writeNote(targetRelativePath, {
    title: `Target ${suffix}`,
    documentId: `doc:target:${suffix}`,
    graphId: graph.id
  });
  const source = graphService.createNode({
    id: `markdown-source-${suffix}`,
    node_type: 'document',
    label: 'Source document',
    source_system: 'markdown',
    source_reference: `doc:source:${suffix}`,
    visibility: 'private',
    metadata: { source_path: sourceRelativePath, document_id: `doc:source:${suffix}` }
  }, actor);
  const target = graphService.createNode({
    id: `markdown-target-${suffix}`,
    node_type: 'document',
    label: 'Target document',
    source_system: 'markdown',
    source_reference: `doc:target:${suffix}`,
    visibility: 'private',
    metadata: { source_path: targetRelativePath, document_id: `doc:target:${suffix}` }
  }, actor);
  graphService.addNodeMembership({ graphId: graph.id, nodeId: source.id, actor });
  graphService.addNodeMembership({ graphId: graph.id, nodeId: target.id, actor });
  return { actor, graph, edgeType, source, target, sourceFile, targetFile, sourceRelativePath, targetRelativePath };
}

function cleanupActor(actor) {
  db.prepare('DELETE FROM graph_edges WHERE created_by = ?').run(actor);
  db.prepare('DELETE FROM graph_definitions WHERE created_by = ?').run(actor);
  db.prepare('DELETE FROM graph_nodes WHERE created_by = ?').run(actor);
  db.prepare('DELETE FROM graph_edge_types WHERE created_by = ?').run(actor);
}

beforeEach(() => {
  previousVaultRoot = process.env.CYBER_ARCHITECT_CONTENT_ROOT;
  vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ca-graph-coordinator-'));
  process.env.CYBER_ARCHITECT_CONTENT_ROOT = vaultRoot;
});

afterEach(() => {
  for (const actor of actors.splice(0).reverse()) cleanupActor(actor);
  fs.rmSync(vaultRoot, { recursive: true, force: true });
  if (previousVaultRoot === undefined) delete process.env.CYBER_ARCHITECT_CONTENT_ROOT;
  else process.env.CYBER_ARCHITECT_CONTENT_ROOT = previousVaultRoot;
});

describe('DB to Markdown graph projection coordinator', () => {
  it('projects committed admin arcs, retains the DB mutation through a filesystem drift, and exposes retry', async () => {
    const fixture = createFixture();
    const token = generateAdminToken({ role: 'OVERSEER_ADMIN', sub: fixture.actor });
    const authenticated = (method, url) => request(app)[method](url).set('x-admin-token', token);

    const created = await authenticated('post', '/api/admin/graphs/edges').send({
      source_node_id: fixture.source.id,
      target_node_id: fixture.target.id,
      edge_type_id: fixture.edgeType.id,
      graph_ids: [fixture.graph.id],
      visibility: 'private'
    });
    expect(created.status).toBe(201);
    expect(created.body.markdown_projection).toMatchObject({ updated: 2, failed: 0 });
    const afterCreate = fs.readFileSync(fixture.sourceFile, 'utf8');
    const targetAfterCreate = fs.readFileSync(fixture.targetFile, 'utf8');
    expect(afterCreate).toContain('<!-- CA:SYSTEM:BEGIN v1 checksum="sha256:');
    expect(afterCreate).toContain(`- ${fixture.edgeType.slug} → [[${fixture.targetRelativePath.replace(/\.md$/, '')}]]`);
    expect(targetAfterCreate).toContain(`- ${fixture.edgeType.slug} ← [[${fixture.sourceRelativePath.replace(/\.md$/, '')}]]`);

    // Make only the generated block drift. The retry must report an error yet
    // leave the committed DB edge untouched for later reconciliation.
    fs.writeFileSync(fixture.sourceFile, afterCreate.replace(fixture.edgeType.slug, 'manually_changed'), 'utf8');
    const retry = await authenticated('post', '/api/admin/graphs/projections/retry').send({
      node_ids: [fixture.source.id]
    });
    expect(retry.status).toBe(200);
    expect(retry.body.success).toBe(false);
    expect(retry.body.markdown_projection).toMatchObject({ failed: 1, retry_node_ids: [fixture.source.id] });
    expect(graphService.getEdge(created.body.edge.id)).toMatchObject({ id: created.body.edge.id });

    const deleted = await authenticated('delete', `/api/admin/graphs/edges/${created.body.edge.id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.markdown_projection).toMatchObject({ updated: 1, failed: 1 });
    // The manually drifted source is left untouched, while the non-drifted
    // target must still receive the post-delete inbound relation cleanup.
    expect(fs.readFileSync(fixture.targetFile, 'utf8')).not.toContain(
      `- ${fixture.edgeType.slug} ← [[${fixture.sourceRelativePath.replace(/\.md$/, '')}]]`
    );
    expect(() => graphService.getEdge(created.body.edge.id)).toThrow('GRAPH_EDGE_NOT_FOUND');
  });

  it('never echoes a human CA:RELATIONS projection edge into CA:SYSTEM', () => {
    const fixture = createFixture();
    const created = graphService.createEdge({
      source_node_id: fixture.source.id,
      target_node_id: fixture.target.id,
      edge_type_id: fixture.edgeType.id,
      graph_ids: [fixture.graph.id],
      origin: 'markdown_projection',
      projection_source_key: `doc:source:${fixture.source.id}`,
      visibility: 'private'
    }, fixture.actor);

    const result = graphMarkdownProjectionCoordinator.projectCommittedEdges({
      edges: [created.edge],
      vaultRoot
    });
    expect(result).toMatchObject({ attempted: 0, updated: 0, failed: 0 });
    expect(fs.readFileSync(fixture.sourceFile, 'utf8')).not.toContain('CA:SYSTEM:BEGIN');
  });
});
