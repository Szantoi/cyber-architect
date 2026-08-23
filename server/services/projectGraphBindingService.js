import crypto from 'node:crypto';
import { db } from '../db.js';
import { graphService } from './graphService.js';

function stableId(prefix, value) {
  const normalized = String(value || '').trim();
  const safe = normalized.replace(/[^A-Za-z0-9:._/-]/g, '_').slice(0, 130);
  return safe && /^[A-Za-z0-9]/.test(safe)
    ? `${prefix}${safe}`.slice(0, 160)
    : `${prefix}${crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 32)}`;
}

function safeSlug(value) {
  return String(value || 'project')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 100) || 'project';
}

function findNodeBySource(sourceSystem, sourceReference) {
  return db.prepare(`
    SELECT id
    FROM graph_nodes
    WHERE source_system = ? AND source_reference = ?
    LIMIT 1
  `).get(sourceSystem, sourceReference) || null;
}

function projectGraphId(projectId) {
  return stableId('project/', projectId);
}

function projectVisibility(project, post = null) {
  return project.visibility === 'public' && post?.visibility === 'public' && Number(post?.published) === 1
    ? 'public'
    : 'private';
}

function ensureContainsEdgeType(actor) {
  try {
    return graphService.getEdgeType('contains');
  } catch (error) {
    if (error?.message !== 'GRAPH_EDGE_TYPE_NOT_FOUND') throw error;
    return graphService.createEdgeType({
      id: 'contains',
      slug: 'contains',
      label: 'Tartalmaz',
      description: 'Projekt vagy epic strukturális kapcsolatot tartalmaz.',
      icon_key: 'folder-tree',
      color: '#00FBFB',
      source_node_types: ['project', 'epic'],
      target_node_types: ['project', 'document', 'epic', 'task'],
      visibility: 'private',
      metadata: { system_seed: true }
    }, actor);
  }
}

/** Ensure that a knowledge workspace has one stable, DB-owned graph layer. */
function ensureProjectGraph({ project, actor = 'PROJECT_GRAPH_BINDING' } = {}) {
  if (!project?.id) throw new Error('PROJECT_GRAPH_PROJECT_REQUIRED');
  const graphId = projectGraphId(project.id);
  let graph;
  try {
    graph = graphService.getGraph(graphId);
  } catch (error) {
    if (error?.message !== 'GRAPH_NOT_FOUND') throw error;
    graph = graphService.createGraph({
      id: graphId,
      slug: `project-${safeSlug(project.slug || project.id)}`,
      name: `${project.name} · Projektgráf`,
      description: 'A Knowledge Project és az ahhoz kötött dokumentumok DB-first irányított gráfvetülete.',
      icon_key: project.icon || 'folder',
      color: project.color || '#00FBFB',
      visibility: project.visibility === 'public' ? 'public' : 'private',
      owner_id: `knowledge_project:${project.id}`,
      metadata: { source: 'knowledge_projects', project_id: project.id, system_owned: true }
    }, actor);
  }

  const knownProjectNode = findNodeBySource('knowledge_project', String(project.id));
  const nodeVisibility = project.visibility === 'public' ? 'public' : 'private';
  const projectNode = knownProjectNode
    ? graphService.updateNode(knownProjectNode.id, {
      node_type: 'project',
      label: project.name,
      description: project.description || '',
      visibility: nodeVisibility,
      active: true,
      metadata: { source: 'knowledge_projects', project_id: project.id }
    }, actor)
    : graphService.createNode({
      id: stableId('project:', project.id),
      node_type: 'project',
      label: project.name,
      description: project.description || '',
      source_system: 'knowledge_project',
      source_reference: String(project.id),
      visibility: nodeVisibility,
      active: true,
      metadata: { source: 'knowledge_projects', project_id: project.id }
    }, actor);
  graphService.addNodeMembership({ graphId: graph.id, nodeId: projectNode.id, metadata: { system: 'project_binding' }, actor });
  ensureContainsEdgeType(actor);
  return { graph, project_node: projectNode };
}

/**
 * Projects are graph-native: every canonical document with a known
 * `project_id` receives a system-maintained `project ─contains→ document`
 * edge in that project's layer. This is a projection only; a user-created
 * edge in another graph is never read, overwritten or removed here.
 */
function syncDocumentProjectBinding({ post, documentId = '', sourcePath = '', frontmatter = {}, actor = 'PROJECT_GRAPH_BINDING' } = {}) {
  const sourceReference = String(documentId || sourcePath || '').trim();
  if (!post?.id || !sourceReference) return { status: 'skipped_missing_identity' };
  const projectionKey = `project-binding:${sourceReference}`;
  const existingEdges = db.prepare(`
    SELECT id
    FROM graph_edges
    WHERE origin = 'markdown_projection' AND projection_source_key = ?
  `).all(projectionKey);
  // Replace only this system's own projection. Ordinary author/admin edges are
  // intentionally outside this delete scope.
  db.prepare(`
    DELETE FROM graph_edges
    WHERE origin = 'markdown_projection' AND projection_source_key = ?
  `).run(projectionKey);

  const project = db.prepare(`
    SELECT * FROM knowledge_projects WHERE id = ? LIMIT 1
  `).get(String(post.project_id || '').trim());
  if (!project) return { status: 'skipped_unknown_project', removed_edge_ids: existingEdges.map(edge => edge.id) };

  const { graph, project_node } = ensureProjectGraph({ project, actor });
  const documentVisibility = projectVisibility(project, post);
  const knownDocumentNode = findNodeBySource('markdown', sourceReference);
  const documentNode = knownDocumentNode
    ? graphService.updateNode(knownDocumentNode.id, {
      node_type: String(frontmatter.ca_node_type || 'document'),
      label: post.title || sourceReference,
      description: '',
      visibility: documentVisibility,
      active: true,
      metadata: { document_id: documentId || null, source_path: sourcePath || null, post_id: post.id }
    }, actor)
    : graphService.createNode({
      id: stableId('document:', sourceReference),
      node_type: String(frontmatter.ca_node_type || 'document'),
      label: post.title || sourceReference,
      description: '',
      source_system: 'markdown',
      source_reference: sourceReference,
      visibility: documentVisibility,
      active: true,
      metadata: { document_id: documentId || null, source_path: sourcePath || null, post_id: post.id }
    }, actor);
  graphService.addNodeMembership({ graphId: graph.id, nodeId: documentNode.id, metadata: { system: 'project_binding' }, actor });
  const contains = ensureContainsEdgeType(actor);
  const created = graphService.createEdge({
    source_node_id: project_node.id,
    target_node_id: documentNode.id,
    edge_type_id: contains.id,
    graph_ids: [graph.id],
    origin: 'markdown_projection',
    projection_source_key: projectionKey,
    provenance: {
      projection: 'project_document_binding',
      project_id: project.id,
      document_id: documentId || null,
      source_path: sourcePath || null,
      post_id: post.id
    },
    metadata: { system_owned: true },
    visibility: documentVisibility,
    active: true
  }, actor);

  return {
    status: 'bound',
    graph_id: graph.id,
    project_node_id: project_node.id,
    document_node_id: documentNode.id,
    removed_edge_ids: existingEdges.map(edge => edge.id),
    edge: created.edge
  };
}

export const projectGraphBindingService = {
  projectGraphId,
  ensureProjectGraph,
  syncDocumentProjectBinding
};
