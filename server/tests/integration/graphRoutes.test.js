import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { db } from '../../db.js';
import { adminRouter } from '../../routes/admin.routes.js';
import { knowledgeRouter } from '../../routes/knowledge.routes.js';
import { generateAdminToken } from '../../security/auth.js';
import { graphService } from '../../services/graphService.js';

const app = express();
app.use(express.json());
app.use('/api', knowledgeRouter);
app.use('/api', adminRouter);

const actors = [];
const documentPostIds = [];

function suffix() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 18);
}

function actorFor(testSuffix) {
  const actor = `GRAPH_TEST_${testSuffix}`;
  actors.push(actor);
  return actor;
}

function createIndexedVaultDocument({
  visibility = 'public',
  published = 1,
  classification = 'public',
  ragIndex = 1,
  withRag = true
} = {}) {
  const testSuffix = suffix();
  const now = new Date().toISOString();
  const slug = `graph-binding-${testSuffix}`;
  const documentId = `kb:graph:${testSuffix}`;
  const sourcePath = `KnowledgeBase/private-vault-location/${testSuffix}.md`;
  const title = `Kanonikus Vault jegyzet ${testSuffix}`;
  const result = db.prepare(`
    INSERT INTO blog_posts
      (project_id, content_type, slug, title, summary, content, category,
       dimensions, visibility, embedding, read_time, created_at, published)
    VALUES (?, 'knowledge', ?, ?, ?, ?, 'TEST', '{}', ?, '[]', '1 PERC', ?, ?)
  `).run(
    'prj_graph_test', slug, title, 'Gráf dokumentumkötés teszt.', '# Vault dokumentum',
    visibility, now, Number(published)
  );
  const postId = Number(result.lastInsertRowid);
  documentPostIds.push(postId);
  if (withRag) {
    db.prepare(`
      INSERT INTO hybrid_rag_documents
        (post_id, document_id, source_path, source_hash, frontmatter_json, classification, rag_index, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      postId,
      documentId,
      sourcePath,
      `hash-${testSuffix}`,
      JSON.stringify({ source_path: sourcePath, private_overlay_key: 'must-not-leak' }),
      classification,
      Number(ragIndex),
      now
    );
  }
  return { postId, slug, title, documentId, sourcePath };
}

function createFixture({ visibility = 'public' } = {}) {
  const testSuffix = suffix();
  const actor = actorFor(testSuffix);
  const graph = graphService.createGraph({
    id: `project/prj-${testSuffix}`,
    slug: `project-prj-${testSuffix}`,
    name: 'Projekt gráf teszt',
    visibility
  }, actor);
  const edgeType = graphService.createEdgeType({
    id: `depends_on_${testSuffix}`,
    slug: `depends-on-${testSuffix}`,
    label: 'Függ ettől',
    source_node_types: ['task'],
    target_node_types: ['task'],
    visibility
  }, actor);
  const genericType = graphService.createEdgeType({
    id: `references_${testSuffix}`,
    slug: `references-${testSuffix}`,
    label: 'Hivatkozik rá',
    visibility
  }, actor);
  const first = graphService.createNode({
    id: `task-a-${testSuffix}`,
    node_type: 'task',
    label: 'A feladat',
    visibility
  }, actor);
  const second = graphService.createNode({
    id: `task-b-${testSuffix}`,
    node_type: 'task',
    label: 'B feladat',
    visibility
  }, actor);
  graphService.addNodeMembership({ graphId: graph.id, nodeId: first.id, actor });
  graphService.addNodeMembership({ graphId: graph.id, nodeId: second.id, actor });
  return { actor, graph, edgeType, genericType, first, second };
}

afterEach(() => {
  for (const postId of documentPostIds.splice(0).reverse()) {
    db.prepare('DELETE FROM hybrid_rag_documents WHERE post_id = ?').run(postId);
    db.prepare('DELETE FROM blog_posts WHERE id = ?').run(postId);
  }
  for (const actor of actors.splice(0).reverse()) {
    db.prepare('DELETE FROM graph_edges WHERE created_by = ?').run(actor);
    db.prepare('DELETE FROM graph_definitions WHERE created_by = ?').run(actor);
    db.prepare('DELETE FROM graph_nodes WHERE created_by = ?').run(actor);
    db.prepare('DELETE FROM graph_edge_types WHERE created_by = ?').run(actor);
  }
});

describe('directed multilayer graph API', () => {
  it('stores an actual bidirectional relationship as two directed arcs and bounds a public traversal', () => {
    const fixture = createFixture();
    const created = graphService.createEdge({
      source_node_id: fixture.first.id,
      target_node_id: fixture.second.id,
      edge_type_id: fixture.edgeType.id,
      graph_ids: [fixture.graph.id],
      bidirectional: true,
      visibility: 'public',
      confidence: 0.85
    }, fixture.actor);

    expect(created.edge.relation_group_id).toBeTruthy();
    expect(created.reciprocal_edge).toMatchObject({
      source_node_id: fixture.second.id,
      target_node_id: fixture.first.id,
      reciprocal_edge_id: created.edge.id,
      reciprocal_role: 'reciprocal'
    });
    expect(created.edge.reciprocal_edge_id).toBe(created.reciprocal_edge.id);
    expect(db.prepare('SELECT COUNT(*) AS count FROM graph_edges WHERE relation_group_id = ?')
      .get(created.relation_group_id).count).toBe(2);

    const traversal = graphService.traverseGraph(fixture.graph.id, {
      start_node_ids: [fixture.first.id],
      direction: 'outbound',
      max_depth: 2,
      max_nodes: 10,
      min_confidence: 0.8
    }, { visibility: 'public' });
    expect(traversal.nodes.map(node => node.id)).toEqual(expect.arrayContaining([fixture.first.id, fixture.second.id]));
    expect(traversal.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.edge.id, traversal_directions: ['outbound'] })
    ]));

    expect(() => graphService.createEdge({
      source_node_id: fixture.first.id,
      target_node_id: fixture.second.id,
      edge_type_id: fixture.edgeType.id,
      graph_ids: [fixture.graph.id],
      direction: 'not-a-query-field'
    }, fixture.actor)).toThrow();
  });

  it('keeps Markdown projection replacement scoped to its own origin and source key inside an outer transaction', () => {
    const fixture = createFixture();
    const manual = graphService.createEdge({
      source_node_id: fixture.first.id,
      target_node_id: fixture.second.id,
      edge_type_id: fixture.edgeType.id,
      graph_ids: [fixture.graph.id],
      visibility: 'public'
    }, fixture.actor);

    db.transaction(() => {
      graphService.syncMarkdownProjectionForPost({
        post: { id: 991, title: 'Forrás jegyzet', visibility: 'public', published: 1 },
        documentId: `DOC-${fixture.graph.id}`,
        sourcePath: 'Knowledge/forras.md',
        frontmatter: { ca_graph_refs: [fixture.graph.id], ca_node_type: 'document' },
        systemRelations: [{
          relation_type: fixture.genericType.id,
          target_document_id: `TARGET-${fixture.graph.id}`,
          direction: 'both',
          visibility: 'public'
        }],
        actor: fixture.actor
      });
    })();

    const firstProjection = graphService.listMarkdownProjectionRelations({
      documentId: `DOC-${fixture.graph.id}`
    });
    expect(firstProjection.relations).toHaveLength(2);
    expect(firstProjection.relations.every(relation => relation.origin === 'markdown_projection')).toBe(true);

    // The outer Vault transaction may choose to record a bad note and continue
    // with the rest of a batch.  The graph service must still restore its own
    // prior projection rather than leaving a half-deleted edge set behind.
    db.transaction(() => {
      expect(() => graphService.syncMarkdownProjectionForPost({
        post: { id: 991, title: 'Forrás jegyzet', visibility: 'public', published: 1 },
        documentId: `DOC-${fixture.graph.id}`,
        frontmatter: { ca_graph_refs: [fixture.graph.id], ca_node_type: 'document' },
        authoring_relations: [{
          relation_type: fixture.genericType.id,
          target_document_id: `INVALID-${fixture.graph.id}`,
          visibility: 'not-visible'
        }],
        actor: fixture.actor
      })).toThrow();
      expect(graphService.listMarkdownProjectionRelations({ documentId: `DOC-${fixture.graph.id}` }).relations).toHaveLength(2);
    })();

    graphService.syncMarkdownProjectionForPost({
      post: { id: 991, title: 'Forrás jegyzet', visibility: 'public', published: 1 },
      documentId: `DOC-${fixture.graph.id}`,
      frontmatter: { ca_graph_refs: [fixture.graph.id], ca_node_type: 'document' },
      systemRelations: [],
      actor: fixture.actor
    });
    expect(graphService.listMarkdownProjectionRelations({ documentId: `DOC-${fixture.graph.id}` }).relations).toHaveLength(0);
    expect(graphService.getEdge(manual.edge.id)).toMatchObject({ id: manual.edge.id, origin: 'admin' });
  });

  it('hydrates M:N memberships and serves a public directed multigraph snapshot without private layers', async () => {
    const fixture = createFixture();
    const publicLayer = graphService.createGraph({
      id: `impact/production-${suffix()}`,
      slug: `impact-production-${suffix()}`,
      name: 'Éles hatásgráf',
      icon_key: 'orbit',
      color: '#FF00FF',
      visibility: 'public'
    }, fixture.actor);
    const privateLayer = graphService.createGraph({
      id: `internal/review-${suffix()}`,
      slug: `internal-review-${suffix()}`,
      name: 'Belső ellenőrzési gráf',
      icon_key: 'lock-keyhole',
      color: '#FF8800',
      visibility: 'private'
    }, fixture.actor);
    const inactiveLayer = graphService.createGraph({
      id: `impact/archived-${suffix()}`,
      slug: `impact-archived-${suffix()}`,
      name: 'Archivált hatásgráf',
      icon_key: 'archive',
      color: '#447799',
      visibility: 'public',
      active: false
    }, fixture.actor);

    for (const graphId of [publicLayer.id, privateLayer.id, inactiveLayer.id]) {
      graphService.addNodeMembership({ graphId, nodeId: fixture.first.id, actor: fixture.actor });
      graphService.addNodeMembership({ graphId, nodeId: fixture.second.id, actor: fixture.actor });
    }

    const created = graphService.createEdge({
      source_node_id: fixture.first.id,
      target_node_id: fixture.second.id,
      edge_type_id: fixture.edgeType.id,
      graph_ids: [fixture.graph.id],
      bidirectional: true,
      origin: 'agent',
      provenance: { source: 'integration-test', evidence_id: 'E-42' },
      weight: 0.75,
      confidence: 0.91,
      cost: 7,
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_to: '2026-12-31T23:59:59.000Z',
      visibility: 'public'
    }, fixture.actor);
    for (const graphId of [publicLayer.id, privateLayer.id, inactiveLayer.id]) {
      for (const edgeId of [created.edge.id, created.reciprocal_edge.id]) {
        graphService.addEdgeMembership({ graphId, edgeId, actor: fixture.actor });
      }
    }

    const hydratedNode = graphService.getNode(fixture.first.id);
    expect(hydratedNode.graph_ids).toEqual(expect.arrayContaining([
      fixture.graph.id,
      publicLayer.id,
      privateLayer.id,
      inactiveLayer.id
    ]));
    expect(hydratedNode.graph_memberships).toEqual(expect.arrayContaining([
      expect.objectContaining({
        graph_id: publicLayer.id,
        graph_name: publicLayer.name,
        graph_slug: publicLayer.slug,
        graph_color: '#FF00FF',
        graph_icon_key: 'orbit',
        graph_visibility: 'public'
      })
    ]));

    const snapshot = await request(app).get(`/api/knowledge/graphs/${encodeURIComponent(fixture.graph.id)}`);
    expect(snapshot.status).toBe(200);
    expect(snapshot.body).toMatchObject({
      graph: expect.objectContaining({ id: fixture.graph.id, visibility: 'public', active: true }),
      snapshot_truncated: false
    });
    const publicNode = snapshot.body.nodes.find(node => node.id === fixture.first.id);
    expect(publicNode).toMatchObject({
      id: fixture.first.id,
      label: fixture.first.label,
      node_type: 'task'
    });
    expect(publicNode.graph_ids).toEqual(expect.arrayContaining([fixture.graph.id, publicLayer.id]));
    expect(publicNode.graph_ids).not.toContain(privateLayer.id);
    expect(publicNode.graph_ids).not.toContain(inactiveLayer.id);
    expect(publicNode.graph_memberships).toEqual(expect.arrayContaining([
      expect.objectContaining({
        graph_id: publicLayer.id,
        graph_name: publicLayer.name,
        graph_slug: publicLayer.slug,
        graph_color: '#FF00FF',
        graph_icon_key: 'orbit',
        graph_visibility: 'public',
        graph_active: true
      })
    ]));

    const publicEdge = snapshot.body.edges.find(edge => edge.id === created.edge.id);
    expect(publicEdge).toMatchObject({
      id: created.edge.id,
      source_node_id: fixture.first.id,
      target_node_id: fixture.second.id,
      source_label: fixture.first.label,
      target_label: fixture.second.label,
      edge_type_id: fixture.edgeType.id,
      edge_type: expect.objectContaining({ id: fixture.edgeType.id, label: fixture.edgeType.label }),
      relation_group_id: created.relation_group_id,
      reciprocal_edge_id: created.reciprocal_edge.id,
      reciprocal_role: 'asserted',
      origin: 'agent',
      provenance: { source: 'integration-test', evidence_id: 'E-42' },
      weight: 0.75,
      confidence: 0.91,
      cost: 7,
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_to: '2026-12-31T23:59:59.000Z'
    });
    expect(publicEdge.graph_ids).toEqual(expect.arrayContaining([fixture.graph.id, publicLayer.id]));
    expect(publicEdge.graph_ids).not.toContain(privateLayer.id);
    expect(publicEdge.graph_ids).not.toContain(inactiveLayer.id);

    const traversal = await request(app)
      .post(`/api/knowledge/graphs/${encodeURIComponent(fixture.graph.id)}/traverse`)
      .send({ start_node_ids: [fixture.first.id], direction: 'outbound', max_depth: 1, max_nodes: 10 });
    expect(traversal.status).toBe(200);
    expect(traversal.body.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: fixture.second.id,
        graph_ids: expect.arrayContaining([fixture.graph.id, publicLayer.id])
      })
    ]));
    const traversalNode = traversal.body.nodes.find(node => node.id === fixture.second.id);
    expect(traversalNode.graph_ids).not.toContain(privateLayer.id);
    expect(traversalNode.graph_ids).not.toContain(inactiveLayer.id);
    expect(traversal.body.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: created.edge.id,
        edge_type_id: fixture.edgeType.id,
        origin: 'agent',
        provenance: { source: 'integration-test', evidence_id: 'E-42' },
        graph_ids: expect.arrayContaining([fixture.graph.id, publicLayer.id])
      })
    ]));
    const traversalEdge = traversal.body.edges.find(edge => edge.id === created.edge.id);
    expect(traversalEdge.graph_ids).not.toContain(privateLayer.id);
    expect(traversalEdge.graph_ids).not.toContain(inactiveLayer.id);
  });

  it('exposes a safe document binding only for explicit public Markdown node identities', async () => {
    const fixture = createFixture();
    const byDocumentId = createIndexedVaultDocument();
    const bySourcePath = createIndexedVaultDocument();
    const byPostReference = createIndexedVaultDocument();
    const privatePost = createIndexedVaultDocument({ visibility: 'private' });
    const draftPost = createIndexedVaultDocument({ published: 0 });
    const unindexedPost = createIndexedVaultDocument({ ragIndex: 0 });
    const internalRagPost = createIndexedVaultDocument({ classification: 'internal' });
    const publicNodes = [
      {
        id: `vault-document-id-${suffix()}`,
        label: byDocumentId.title,
        source_system: 'markdown',
        source_reference: byDocumentId.documentId,
        metadata: { source_path: byDocumentId.sourcePath, private_overlay_key: 'must-not-leak' }
      },
      {
        id: `vault-source-path-${suffix()}`,
        label: bySourcePath.title,
        source_system: 'markdown',
        source_reference: bySourcePath.sourcePath,
        metadata: { source_path: bySourcePath.sourcePath }
      },
      {
        id: `vault-post-reference-${suffix()}`,
        label: byPostReference.title,
        source_system: 'markdown',
        source_reference: `post:${byPostReference.postId}`
      },
      {
        id: `vault-private-${suffix()}`,
        label: privatePost.title,
        source_system: 'markdown',
        source_reference: privatePost.documentId
      },
      {
        id: `vault-draft-${suffix()}`,
        label: draftPost.title,
        source_system: 'markdown',
        source_reference: draftPost.documentId
      },
      {
        id: `vault-unindexed-${suffix()}`,
        label: unindexedPost.title,
        source_system: 'markdown',
        source_reference: unindexedPost.documentId
      },
      {
        id: `vault-internal-rag-${suffix()}`,
        label: internalRagPost.title,
        source_system: 'markdown',
        source_reference: internalRagPost.documentId
      },
      {
        // A matching label/slug must never become an implicit document link.
        id: `manual-lookalike-${suffix()}`,
        label: byDocumentId.title,
        source_system: 'manual',
        source_reference: byDocumentId.slug
      }
    ].map(node => graphService.createNode({
      ...node,
      node_type: 'document',
      visibility: 'public'
    }, fixture.actor));
    for (const node of publicNodes) {
      graphService.addNodeMembership({ graphId: fixture.graph.id, nodeId: node.id, actor: fixture.actor });
    }

    const snapshot = await request(app).get(`/api/knowledge/graphs/${encodeURIComponent(fixture.graph.id)}`);
    expect(snapshot.status).toBe(200);
    const nodeById = new Map(snapshot.body.nodes.map(node => [node.id, node]));

    expect(nodeById.get(publicNodes[0].id)).toMatchObject({
      document_binding: {
        document_id: byDocumentId.documentId,
        slug: byDocumentId.slug,
        content_type: 'knowledge',
        href: `/knowledge/${byDocumentId.slug}`
      }
    });
    expect(nodeById.get(publicNodes[1].id)).toMatchObject({
      document_binding: expect.objectContaining({
        document_id: bySourcePath.documentId,
        slug: bySourcePath.slug,
        href: `/knowledge/${bySourcePath.slug}`
      })
    });
    expect(nodeById.get(publicNodes[2].id)).toMatchObject({
      document_binding: expect.objectContaining({
        document_id: byPostReference.documentId,
        slug: byPostReference.slug,
        href: `/knowledge/${byPostReference.slug}`
      })
    });

    for (const node of publicNodes.slice(3)) {
      expect(nodeById.get(node.id)).not.toHaveProperty('document_binding');
    }
    const publicPayload = JSON.stringify(snapshot.body);
    expect(publicPayload).not.toContain(bySourcePath.sourcePath);
    expect(publicPayload).not.toContain('must-not-leak');
    expect(nodeById.get(publicNodes[0].id)).not.toHaveProperty('source_reference');
    expect(nodeById.get(publicNodes[0].id)).not.toHaveProperty('metadata');

    const traversal = await request(app)
      .post(`/api/knowledge/graphs/${encodeURIComponent(fixture.graph.id)}/traverse`)
      .send({ start_node_ids: [publicNodes[0].id], direction: 'both', max_depth: 1, max_nodes: 10 });
    expect(traversal.status).toBe(200);
    expect(traversal.body.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: publicNodes[0].id,
        document_binding: expect.objectContaining({
          document_id: byDocumentId.documentId,
          href: `/knowledge/${byDocumentId.slug}`
        })
      })
    ]));
  });

  it('protects exact document graph bindings and never resolves a label lookalike', async () => {
    const fixture = createFixture();
    const document = createIndexedVaultDocument({ visibility: 'private' });
    const canonicalByDocumentId = graphService.createNode({
      id: `document-id-binding-${suffix()}`,
      node_type: 'document',
      label: document.title,
      source_system: 'markdown',
      source_reference: document.documentId,
      visibility: 'private'
    }, fixture.actor);
    const canonicalBySourcePath = graphService.createNode({
      id: `source-path-binding-${suffix()}`,
      node_type: 'document',
      label: `${document.title} (útvonal)`,
      source_system: 'markdown',
      source_reference: document.sourcePath,
      visibility: 'private'
    }, fixture.actor);
    const lookalike = graphService.createNode({
      id: `lookalike-binding-${suffix()}`,
      node_type: 'document',
      // Same human-facing text must not be enough to form a binding.
      label: document.title,
      source_system: 'manual',
      source_reference: document.slug,
      visibility: 'private'
    }, fixture.actor);
    const token = generateAdminToken({ role: 'OVERSEER_ADMIN', sub: fixture.actor });
    const viewerToken = generateAdminToken({ role: 'VIEWER', sub: fixture.actor });
    const url = `/api/admin/graphs/document-bindings/${document.postId}`;

    expect((await request(app).get(url)).status).toBe(401);

    const viewer = await request(app)
      .get(url)
      .set('x-admin-token', viewerToken);
    expect(viewer.status).toBe(403);
    expect(viewer.body.code).toBe('ADMIN_ROLE_REQUIRED');

    const admin = await request(app).get(url).set('x-admin-token', token);
    expect(admin.status).toBe(200);
    expect(admin.body.nodes.map(node => node.id)).toEqual(expect.arrayContaining([
      canonicalByDocumentId.id,
      canonicalBySourcePath.id
    ]));
    expect(admin.body.nodes.map(node => node.id)).not.toContain(lookalike.id);
    expect(admin.body.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: canonicalByDocumentId.id,
        source_reference: document.documentId
      }),
      expect.objectContaining({
        id: canonicalBySourcePath.id,
        source_reference: document.sourcePath
      })
    ]));
  });

  it('ensures one server-owned canonical document node using RAG identity or the legacy post fallback', async () => {
    const fixture = createFixture();
    const ragDocument = createIndexedVaultDocument({ visibility: 'private' });
    const noRagDocument = createIndexedVaultDocument({
      visibility: 'private',
      withRag: false
    });
    const token = generateAdminToken({ role: 'OVERSEER_ADMIN', sub: fixture.actor });
    const ensure = postId => request(app)
      .post(`/api/admin/graphs/document-bindings/${postId}/ensure`)
      .set('x-admin-token', token)
      // The route intentionally has no client-controlled identity body.
      .send({ label: 'Ignored browser label', source_reference: 'unsafe:client-value' });

    const ragCreated = await ensure(ragDocument.postId);
    expect(ragCreated.status).toBe(201);
    expect(ragCreated.body).toMatchObject({
      success: true,
      created: true,
      node: {
        node_type: 'document',
        label: ragDocument.title,
        source_system: 'markdown',
        source_reference: ragDocument.documentId,
        visibility: 'private',
        metadata: expect.objectContaining({
          post_id: ragDocument.postId,
          slug: ragDocument.slug,
          created_via: 'document_relation_composer'
        })
      }
    });
    expect(ragCreated.body.node.source_reference).not.toBe('unsafe:client-value');

    const ragAgain = await ensure(ragDocument.postId);
    expect(ragAgain.status).toBe(200);
    expect(ragAgain.body).toMatchObject({
      success: true,
      created: false,
      node: { id: ragCreated.body.node.id, source_reference: ragDocument.documentId }
    });

    const fallback = await ensure(noRagDocument.postId);
    expect(fallback.status).toBe(201);
    expect(fallback.body).toMatchObject({
      success: true,
      created: true,
      node: {
        node_type: 'document',
        source_system: 'markdown',
        source_reference: `post:${noRagDocument.postId}`,
        metadata: expect.objectContaining({ post_id: noRagDocument.postId })
      }
    });
    const resolvedFallback = await request(app)
      .get(`/api/admin/graphs/document-bindings/${noRagDocument.postId}`)
      .set('x-admin-token', token);
    expect(resolvedFallback.body.nodes).toEqual([
      expect.objectContaining({ id: fallback.body.node.id })
    ]);
  });

  it('returns a bounded, direction-aware incident relation view for a document node', async () => {
    const fixture = createFixture();
    const outgoing = graphService.createEdge({
      source_node_id: fixture.first.id,
      target_node_id: fixture.second.id,
      edge_type_id: fixture.edgeType.id,
      graph_ids: [fixture.graph.id],
      origin: 'admin',
      weight: 0.8,
      confidence: 0.91,
      provenance: { editor: 'document_relation_composer' },
      metadata: { relationship: 'outgoing' },
      visibility: 'private'
    }, fixture.actor);
    const inbound = graphService.createEdge({
      source_node_id: fixture.second.id,
      target_node_id: fixture.first.id,
      edge_type_id: fixture.genericType.id,
      graph_ids: [fixture.graph.id],
      origin: 'markdown_projection',
      active: false,
      visibility: 'private'
    }, fixture.actor);
    const token = generateAdminToken({ role: 'OVERSEER_ADMIN', sub: fixture.actor });
    const baseUrl = `/api/admin/graphs/nodes/${encodeURIComponent(fixture.first.id)}/relations`;

    const activeOnly = await request(app)
      .get(`${baseUrl}?include_inactive=false`)
      .set('x-admin-token', token);
    expect(activeOnly.status).toBe(200);
    expect(activeOnly.body.source_node).toMatchObject({ id: fixture.first.id });
    expect(activeOnly.body.relations).toEqual([
      expect.objectContaining({
        edge_id: outgoing.edge.id,
        direction: 'outbound',
        target: expect.objectContaining({ node_id: fixture.second.id, label: fixture.second.label }),
        edge_type: expect.objectContaining({ id: fixture.edgeType.id, label: fixture.edgeType.label }),
        graph_ids: [fixture.graph.id],
        origin: 'admin',
        confidence: 0.91,
        provenance: { editor: 'document_relation_composer' },
        metadata: { relationship: 'outgoing' }
      })
    ]);

    const includingInactive = await request(app)
      .get(`${baseUrl}?include_inactive=true`)
      .set('x-admin-token', token);
    expect(includingInactive.status).toBe(200);
    expect(includingInactive.body.relations).toEqual(expect.arrayContaining([
      expect.objectContaining({ edge_id: outgoing.edge.id, direction: 'outbound' }),
      expect.objectContaining({
        edge_id: inbound.edge.id,
        direction: 'inbound',
        target: expect.objectContaining({ node_id: fixture.second.id }),
        origin: 'markdown_projection',
        active: false
      })
    ]));
  });

  it('serves public graph catalog/traversal and protects mutation endpoints', async () => {
    const fixture = createFixture();
    const edge = graphService.createEdge({
      source_node_id: fixture.first.id,
      target_node_id: fixture.second.id,
      edge_type_id: fixture.edgeType.id,
      graph_ids: [fixture.graph.id],
      visibility: 'public'
    }, fixture.actor);
    const token = generateAdminToken({ role: 'OVERSEER_ADMIN', sub: fixture.actor });
    const viewerToken = generateAdminToken({ role: 'VIEWER', sub: fixture.actor });
    const authenticated = (method, url) => request(app)[method](url).set('x-admin-token', token);

    const denied = await request(app).get('/api/admin/graphs');
    expect(denied.status).toBe(401);

    const viewerDenied = await request(app)
      .put(`/api/admin/graphs/nodes/${encodeURIComponent(fixture.first.id)}`)
      .set('x-admin-token', viewerToken)
      .send({ label: 'A viewer must not mutate this node' });
    expect(viewerDenied.status).toBe(403);
    expect(viewerDenied.body.code).toBe('ADMIN_ROLE_REQUIRED');

    const catalog = await request(app).get('/api/knowledge/graphs');
    expect(catalog.status).toBe(200);
    expect(catalog.body.graphs).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: fixture.graph.id, node_count: 2, edge_count: 1 })
    ]));

    const traversal = await request(app)
      .post(`/api/knowledge/graphs/${encodeURIComponent(fixture.graph.id)}/traverse`)
      .send({ start_node_ids: [fixture.first.id], direction: 'outbound', max_depth: 2, max_nodes: 10 });
    expect(traversal.status).toBe(200);
    expect(traversal.body.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: fixture.second.id })
    ]));
    expect(traversal.body.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: edge.edge.id, source_node_id: fixture.first.id })
    ]));

    const adminRead = await authenticated('get', `/api/admin/graphs/${encodeURIComponent(fixture.graph.id)}/edges`);
    expect(adminRead.status).toBe(200);
    expect(adminRead.body.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: edge.edge.id, graph_ids: [fixture.graph.id] })
    ]));

    const invalidAst = await request(app)
      .post(`/api/knowledge/graphs/${encodeURIComponent(fixture.graph.id)}/traverse`)
      .send({ start_node_ids: [fixture.first.id], sql: 'DROP TABLE graph_edges' });
    expect(invalidAst.status).toBe(400);
    expect(invalidAst.body.error).toBe('VALIDATION_ERROR');
  });
});
