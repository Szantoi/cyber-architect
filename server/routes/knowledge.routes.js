import { Router } from 'express';
import { dbService } from '../services/dbService.js';
import { hybridKnowledgeService } from '../services/hybridKnowledgeService.js';
import { taxonomyService } from '../services/taxonomyService.js';
import { graphService } from '../services/graphService.js';
import { graphTraversalSchema } from '../schemas/graph.schema.js';
import { validateBody } from '../middleware/validate.js';
import {
  adminPreviewMiddleware,
  getReadScope,
  isAdminPreview,
  setReadCacheControl
} from '../middleware/adminPreview.js';
import { logger } from '../logger.js';
import { resolveLocalVaultRoot } from '../services/localVaultService.js';
import { resolveLocalVaultAsset } from '../services/vaultAssetManifestService.js';
import { contentDocumentAssetService } from '../services/contentDocumentAssetService.js';
import { contentDocumentStorageService } from '../services/contentDocumentStorageService.js';
import {
  contentTypeFromPresentationProfile,
  normalizePresentationProfile,
  presentationProfileFromContentType,
  resolveDocumentPresentation
} from '../services/presentationProfile.js';

export const knowledgeRouter = Router();

knowledgeRouter.use(adminPreviewMiddleware);

const isPublishedPublicKnowledgeDoc = post => Boolean(
  post
  && post.content_type === 'knowledge'
  && post.visibility === 'public'
  && Number(post.published) === 1
);

const isPublishedPublicContentDocument = post => Boolean(
  post
  && ['knowledge', 'blog'].includes(post.content_type)
  && post.visibility === 'public'
  && Number(post.published) === 1
);

const isReadableKnowledgeDoc = (post, readScope) => Boolean(
  post
  && post.content_type === 'knowledge'
  && (readScope.preview || isPublishedPublicKnowledgeDoc(post))
);

const isReadableContentDocument = (post, readScope) => Boolean(
  post
  && ['knowledge', 'blog'].includes(post.content_type)
  && (readScope.preview || isPublishedPublicContentDocument(post))
);

const PUBLIC_FACET_CANDIDATE_LIMIT = 250;
const PUBLIC_GRAPH_SNAPSHOT_NODE_LIMIT = 250;
const PUBLIC_GRAPH_SNAPSHOT_EDGE_LIMIT = 500;

const safeResultLimit = (value, fallback = 30) => Math.max(
  1,
  Math.min(Number(value) || fallback, PUBLIC_FACET_CANDIDATE_LIMIT)
);

const ASSET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

const documentAssetUri = (post, assetId, assetRouteBase) => (
  `/api${assetRouteBase}/${encodeURIComponent(post.slug)}/assets/${encodeURIComponent(assetId)}`
);

const assetsForPost = (post, readScope, { assetRouteBase = '/docs' } = {}) => {
  // Database-owned files are intentionally listed independently from the
  // legacy RAG/Vault manifest.  Their opaque id, not a filesystem path, is
  // the public Markdown target.
  const databaseAssets = contentDocumentAssetService
    .listDocumentAssets(post.id, { visibility: readScope.visibility })
    .map(asset => ({
      id: asset.id,
      title: asset.original_name || asset.id || 'Csatolmány',
      kind: asset.asset_kind || 'other',
      provider: 'database',
      source_kind: 'database',
      mime_type: asset.mime_type || '',
      availability: asset.availability || 'available',
      uri: documentAssetUri(post, asset.id, assetRouteBase),
      preview_uri: '',
      depends_on: []
    }));
  const databaseAssetIds = new Set(databaseAssets.map(asset => asset.id));
  const legacyAssets = hybridKnowledgeService
    .getAssetsForPosts([post.id], { visibility: readScope.visibility })
    .filter(asset => !databaseAssetIds.has(asset.file_id))
    .map(asset => ({
      id: asset.file_id,
      title: asset.title || asset.file_id || 'Csatolmány',
      kind: asset.asset_kind || 'other',
      provider: asset.provider,
      source_kind: asset.source_kind || 'external',
      mime_type: asset.mime_type || '',
      availability: asset.availability || 'available',
      // Local folder paths never cross the API boundary. The controlled route
      // below resolves the manifest relative to this note only after public
      // document visibility has been verified.
      uri: asset.source_kind === 'local'
        ? documentAssetUri(post, asset.file_id, assetRouteBase)
        : asset.uri,
      preview_uri: asset.source_kind === 'local' ? '' : (asset.preview_uri || ''),
      depends_on: Array.isArray(asset.metadata?.depends_on) ? asset.metadata.depends_on : []
    }));
  return [...databaseAssets, ...legacyAssets]
    .sort((left, right) => String(left.title).localeCompare(String(right.title)) || String(left.id).localeCompare(String(right.id)));
};

const queryValues = (query, keys) => {
  const values = [];
  for (const key of keys) {
    const raw = query?.[key];
    for (const item of (Array.isArray(raw) ? raw : [raw])) {
      const value = String(item ?? '').trim();
      if (value && value.toUpperCase() !== 'ALL' && !values.includes(value)) values.push(value);
    }
  }
  return values;
};

function toPublicGraph(graph) {
  return {
    id: graph.id,
    slug: graph.slug,
    name: graph.name,
    description: graph.description,
    icon_key: graph.icon_key,
    color: graph.color,
    visibility: graph.visibility,
    active: Boolean(graph.active),
    node_count: Number(graph.node_count || 0),
    edge_count: Number(graph.edge_count || 0)
  };
}

function readMembershipGraph(membership = {}) {
  const graph = membership.graph || {};
  return {
    id: graph.id || membership.graph_id,
    slug: graph.slug || membership.graph_slug,
    name: graph.name || membership.graph_name,
    icon_key: graph.icon_key || membership.graph_icon_key,
    color: graph.color || membership.graph_color,
    visibility: graph.visibility || membership.graph_visibility,
    active: graph.active ?? (Number(membership.graph_active) === 1)
  };
}

function toGraphMemberships(memberships = [], readScope) {
  return memberships
    .map(readMembershipGraph)
    .filter(graph => graph.id && (
      readScope.preview
      || (graph.visibility === 'public' && graph.active)
    ))
    .map(graph => ({
      graph_id: graph.id,
      graph_slug: graph.slug,
      graph_name: graph.name,
      graph_icon_key: graph.icon_key,
      graph_color: graph.color,
      graph_visibility: graph.visibility,
      graph_active: graph.active
    }));
}

function toPublicDocumentBinding(binding) {
  if (!binding?.slug || !['knowledge', 'blog'].includes(binding.content_type)) return null;
  const basePath = binding.content_type === 'blog' ? '/blog' : '/knowledge';
  return {
    document_id: binding.document_id || null,
    slug: binding.slug,
    content_type: binding.content_type,
    presentation_profile: binding.presentation_profile
      || presentationProfileFromContentType(binding.content_type),
    href: `${basePath}/${encodeURIComponent(binding.slug)}`
  };
}

function toGraphNode(node, documentBinding = null, readScope) {
  const graph_memberships = toGraphMemberships(node.graph_memberships, readScope);
  const binding = toPublicDocumentBinding(documentBinding);
  return {
    id: node.id,
    node_type: node.node_type,
    label: node.label,
    description: node.description,
    source_system: node.source_system,
    visibility: node.visibility,
    active: Boolean(node.active),
    graph_ids: graph_memberships.map(membership => membership.graph_id),
    graph_memberships,
    // `source_reference` can be a canonical Vault path and node metadata can
    // contain the complete private frontmatter projection.  Neither belongs
    // in a public payload; the binding below is the deliberately small,
    // verified replacement for document-capable overlays.
    ...(binding ? { document_binding: binding } : {})
  };
}

function toGraphNodes(nodes = [], readScope) {
  const documentBindings = readScope.preview
    ? graphService.getPreviewDocumentBindings(nodes.map(node => node.id))
    : graphService.getPublicDocumentBindings(nodes.map(node => node.id));
  return nodes.map(node => toGraphNode(node, documentBindings.get(node.id), readScope));
}

function toGraphEdge(edge, readScope) {
  const graph_memberships = toGraphMemberships(edge.graph_memberships, readScope);
  return {
    id: edge.id,
    source_node_id: edge.source_node_id,
    target_node_id: edge.target_node_id,
    source_label: edge.source_label,
    target_label: edge.target_label,
    source_node_type: edge.source_node_type,
    target_node_type: edge.target_node_type,
    edge_type_id: edge.edge_type_id,
    edge_type: {
      id: edge.edge_type_id,
      slug: edge.edge_type_slug,
      label: edge.edge_type_label,
      icon_key: edge.edge_type_icon_key,
      color: edge.edge_type_color,
      visibility: readScope.preview ? edge.edge_type_visibility : 'public',
      active: readScope.preview ? Boolean(edge.edge_type_active) : true
    },
    relation_group_id: edge.relation_group_id || null,
    reciprocal_edge_id: edge.reciprocal_edge_id || null,
    reciprocal_role: edge.reciprocal_role,
    weight: edge.weight,
    confidence: edge.confidence,
    cost: edge.cost,
    valid_from: edge.valid_from,
    valid_to: edge.valid_to,
    origin: edge.origin,
    provenance: edge.provenance || {},
    visibility: edge.visibility,
    active: Boolean(edge.active),
    graph_ids: graph_memberships.map(membership => membership.graph_id),
    graph_memberships
  };
}

function toGraphTraversal(result, readScope) {
  return {
    graph: toPublicGraph(result.graph),
    query: result.query,
    nodes: toGraphNodes(result.nodes, readScope).map((node, index) => ({ ...node, distance: result.nodes[index].distance })),
    edges: result.edges.map(edge => ({ ...toGraphEdge(edge, readScope), traversal_directions: edge.traversal_directions })),
    paths: result.paths,
    truncated: result.truncated
  };
}

// The registry, rather than a hard-coded list of three names, determines
// which query keys are valid public facets. Legacy `iparag`/`technologia`/
// `celcsoport` links still resolve through each core dimension's compatibility
// keys during the frontmatter migration.
const readFacetAssignments = (query = {}, readScope = { visibility: 'public', includeInactive: false }) => {
  const assignments = {};
  const dimensions = taxonomyService
    .listDimensions({ visibility: readScope.visibility, includeInactive: readScope.includeInactive })
    .filter(dimension => readScope.preview || dimension.filterable);
  for (const dimension of dimensions) {
    const values = queryValues(query, [
      dimension.frontmatter_key,
      dimension.id,
      ...(dimension.legacy_frontmatter_keys || [])
    ]);
    if (values.length) assignments[dimension.id] = values;
  }
  return assignments;
};

const applyFacetAssignments = (documents, query, readScope) => {
  const assignments = readFacetAssignments(query, readScope);
  if (!Object.keys(assignments).length) return documents;
  return taxonomyService.filterDocumentsByFacets(documents, assignments, { visibility: readScope.visibility });
};

const searchKnowledgeForScope = ({
  query = '',
  projectId = 'all',
  contentType = 'knowledge',
  presentationProfile = null,
  limit = 30,
  facetQuery = {},
  readScope = { visibility: 'public', publishedOnly: true, includeInactive: false }
} = {}) => {
  const safeLimit = safeResultLimit(limit);
  const facetAssignments = readFacetAssignments(facetQuery, readScope);
  const results = dbService.searchKnowledge({
    query,
    projectId,
    visibility: readScope.visibility,
    publishedOnly: readScope.publishedOnly,
    contentType,
    presentationProfile,
    // Facet matching is assignment-aware and runs below. Pull a bounded
    // candidate pool first so matching happens before the public page limit.
    limit: Object.keys(facetAssignments).length ? PUBLIC_FACET_CANDIDATE_LIMIT : safeLimit
  });
  const filtered = Object.keys(facetAssignments).length
    ? taxonomyService.filterDocumentsByFacets(results, facetAssignments, { visibility: readScope.visibility })
    : results;
  return filtered.slice(0, safeLimit);
};

// 1. Unified Multi-Corpus RAG Search (Global Scope: all | blog | knowledge)
knowledgeRouter.get('/search/unified', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const { q = '', scope = 'all', presentation_profile, limit = 30 } = req.query;
    const results = dbService.searchUnified({
      query: String(q || '').trim(),
      scope: String(scope || 'all'),
      presentationProfile: presentation_profile,
      limit: Number(limit) || 30,
      visibility: readScope.visibility,
      publishedOnly: readScope.publishedOnly
    });
    res.json({ results, total: results.length, scope });
  } catch (err) {
    logger.error('Failed to execute unified RAG search', err);
    res.status(500).json({ error: 'UNIFIED_SEARCH_ERROR', results: [] });
  }
});

// 2. Public Knowledge Projects (Workspaces)
knowledgeRouter.get('/knowledge/projects', (req, res) => {
  try {
    const projects = dbService.getKnowledgeProjects({ visibility: getReadScope(req).visibility });
    res.json(projects);
  } catch (err) {
    logger.error('Failed to get public knowledge projects', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

// 3. Public Hybrid Knowledge Search (FTS5 + Semantic + Dimensions)
knowledgeRouter.get('/knowledge/search', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const { q, projectId, project_id, limit } = req.query;
    // `project_id` is the shareable/public URL convention. Keep the original
    // camelCase form as an agent/API compatibility alias while preferring the
    // explicit query value when both are supplied.
    const requestedProjectId = String(project_id || '').trim() || projectId;
    const results = searchKnowledgeForScope({
      query: q || '',
      projectId: requestedProjectId || 'all',
      contentType: 'knowledge',
      limit: Number(limit) || 30,
      facetQuery: req.query,
      readScope
    });
    res.json(results);
  } catch (err) {
    logger.error('Failed to execute public knowledge search', err);
    res.status(500).json({ error: 'SEARCH_QUERY_ERROR' });
  }
});

// 4. Public Dimensions Matrix
knowledgeRouter.get('/knowledge/dimensions', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const dimensions = dbService.getKnowledgeDimensions({
      visibility: readScope.visibility,
      publishedOnly: readScope.publishedOnly
    });
    res.json(dimensions);
  } catch (err) {
    logger.error('Failed to get knowledge dimensions', err);
    res.status(500).json({ error: 'DATABASE_QUERY_ERROR' });
  }
});

// Public, cacheable taxonomy projection. It carries the same dimension labels,
// icons and term identifiers that the authenticated admin registry manages,
// but never exposes inactive/private vocabulary or personal collections.
knowledgeRouter.get('/knowledge/taxonomy', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const taxonomy = taxonomyService.getRegistry({
      visibility: readScope.visibility,
      includeInactive: readScope.includeInactive,
      includeAliases: false,
      includeRelations: true,
      includeSmartCollections: true
    });
    setReadCacheControl(req, res, 'public, max-age=60, stale-while-revalidate=300');
    return res.json(taxonomy);
  } catch (error) {
    logger.error('Failed to get public taxonomy registry', error);
    return res.status(500).json({ error: 'TAXONOMY_READ_ERROR', dimensions: [], smart_collections: [] });
  }
});

knowledgeRouter.get('/knowledge/smart-collections', (req, res) => {
  try {
    const readScope = getReadScope(req);
    setReadCacheControl(req, res, 'public, max-age=60, stale-while-revalidate=300');
    return res.json({
      collections: taxonomyService.listSmartCollections({
        scope: readScope.preview ? 'all' : 'public',
        includeInactive: readScope.includeInactive
      })
    });
  } catch (error) {
    logger.error('Failed to get public smart collections', error);
    return res.status(500).json({ error: 'SMART_COLLECTIONS_READ_ERROR', collections: [] });
  }
});

knowledgeRouter.get('/knowledge/smart-collections/:slug', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 250));
    const result = taxonomyService.evaluateSmartCollection(req.params.slug, {
      visibility: readScope.visibility,
      publishedOnly: readScope.publishedOnly,
      limit
    });
    setReadCacheControl(req, res, 'public, max-age=30, stale-while-revalidate=120');
    return res.json(result);
  } catch (error) {
    if (String(error?.message || '') === 'SMART_COLLECTION_NOT_FOUND') {
      return res.status(404).json({ error: 'SMART_COLLECTION_NOT_FOUND', collection: null, documents: [] });
    }
    logger.error(`Failed to evaluate public smart collection [${req.params.slug}]`, error);
    return res.status(500).json({ error: 'SMART_COLLECTION_READ_ERROR', collection: null, documents: [] });
  }
});

// Public graph catalog and a deliberately bounded traversal AST.  This is not
// the legacy wikilink graph: only explicitly public typed graph layers, nodes,
// edge types and arcs cross this boundary.
knowledgeRouter.get('/knowledge/graphs', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const graphs = graphService
      .listGraphs({ visibility: readScope.visibility, includeInactive: readScope.includeInactive })
      .map(toPublicGraph);
    setReadCacheControl(req, res, 'public, max-age=60, stale-while-revalidate=300');
    return res.json({ graphs });
  } catch (error) {
    logger.error('Failed to list public graph definitions', error);
    return res.status(500).json({ error: 'PUBLIC_GRAPHS_READ_ERROR', graphs: [] });
  }
});

knowledgeRouter.get('/knowledge/graphs/:graphId', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const graph = graphService.getGraph(req.params.graphId);
    if (!readScope.preview && (!graph.active || graph.visibility !== 'public')) {
      return res.status(404).json({ error: 'PUBLIC_GRAPH_NOT_FOUND', graph: null });
    }
    const catalogGraph = graphService
      .listGraphs({ visibility: readScope.visibility, includeInactive: readScope.includeInactive })
      .find(item => item.id === graph.id);
    const publicGraph = toPublicGraph(catalogGraph || graph);
    // This is a graph-registry snapshot, never a Markdown/wikilink-derived
    // topology.  It stays intentionally bounded; the traversal endpoint is
    // the opt-in route for a deeper or filtered subgraph.
    const graphNodes = graphService
      .listNodes({
        graphId: graph.id,
        visibility: readScope.visibility,
        includeInactive: readScope.includeInactive,
        limit: PUBLIC_GRAPH_SNAPSHOT_NODE_LIMIT
      });
    const nodes = toGraphNodes(graphNodes, readScope);
    const edges = graphService
      .listEdges({
        graphId: graph.id,
        visibility: readScope.visibility,
        includeInactive: readScope.includeInactive,
        limit: PUBLIC_GRAPH_SNAPSHOT_EDGE_LIMIT
      })
      .map(edge => toGraphEdge(edge, readScope));
    const snapshot_truncated = publicGraph.node_count > nodes.length || publicGraph.edge_count > edges.length;
    setReadCacheControl(req, res, 'public, max-age=60, stale-while-revalidate=300');
    return res.json({ graph: publicGraph, nodes, edges, snapshot_truncated });
  } catch (error) {
    if (String(error?.message || '') === 'GRAPH_NOT_FOUND') {
      return res.status(404).json({ error: 'PUBLIC_GRAPH_NOT_FOUND', graph: null });
    }
    logger.error(`Failed to read public graph [${req.params.graphId}]`, error);
    return res.status(500).json({ error: 'PUBLIC_GRAPH_READ_ERROR', graph: null });
  }
});

knowledgeRouter.post('/knowledge/graphs/:graphId/traverse', validateBody(graphTraversalSchema), (req, res) => {
  try {
    const readScope = getReadScope(req);
    const result = graphService.traverseGraph(req.params.graphId, req.body, {
      visibility: readScope.preview ? 'all' : 'public'
    });
    return res.json(toGraphTraversal(result, readScope));
  } catch (error) {
    const code = String(error?.message || 'PUBLIC_GRAPH_TRAVERSAL_FAILED');
    if (code === 'PUBLIC_GRAPH_NOT_FOUND' || code === 'PUBLIC_GRAPH_START_NODE_NOT_FOUND') {
      return res.status(404).json({ error: code, graph: null });
    }
    if (code.startsWith('INVALID_GRAPH_') || code.startsWith('GRAPH_START_NODE_') || code.startsWith('GRAPH_TRAVERSAL_')) {
      return res.status(400).json({ error: code, graph: null });
    }
    logger.error(`Failed to traverse public graph [${req.params.graphId}]`, error);
    return res.status(500).json({ error: 'PUBLIC_GRAPH_TRAVERSAL_FAILED', graph: null });
  }
});

const publicProjectIdFromQuery = (value) => {
  const projectId = String(value || '').trim();
  return projectId && projectId.toUpperCase() !== 'ALL' ? projectId : null;
};

function resolvePublicDocumentFilter(query = {}) {
  const rawContentType = String(query.content_type ?? '').trim().toLowerCase();
  const contentType = rawContentType || 'all';
  if (!['knowledge', 'blog', 'all'].includes(contentType)) {
    const error = new Error('INVALID_CONTENT_TYPE');
    error.code = 'INVALID_CONTENT_TYPE';
    throw error;
  }

  const rawProfile = String(query.presentation_profile ?? '').trim().toLowerCase();
  if (!rawProfile || rawProfile === 'all') {
    return { contentType, presentationProfile: null };
  }

  const presentationProfile = normalizePresentationProfile(rawProfile);
  const projectedContentType = contentTypeFromPresentationProfile(presentationProfile);
  if (contentType !== 'all' && contentType !== projectedContentType) {
    const error = new Error('PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT');
    error.code = 'PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT';
    throw error;
  }

  return {
    contentType: projectedContentType,
    presentationProfile
  };
}

function isPresentationFilterError(error) {
  return /^(?:INVALID_CONTENT_TYPE|INVALID_PRESENTATION_PROFILE|PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT)/
    .test(String(error?.code || error?.message || ''));
}

function toPublicDocumentSummary(post, {
  assetRouteBase = '/docs',
  readScope = { visibility: 'public' }
} = {}) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    summary: post.summary,
    content_type: post.content_type,
    presentation_profile: post.presentation_profile,
    visibility: post.visibility,
    published: Number(post.published),
    category: post.category || 'Tudástár',
    project_id: post.project_id,
    project_name: post.project_name || 'Általános Munkatér',
    dimensions: post.dimensions || {},
    read_time: post.read_time || '5 PERC',
    updated_at: post.created_at ? post.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
    drive_path: post.drive_path || '',
    audio_url: post.audio_url,
    video_url: post.video_url || '',
    assets: assetsForPost(post, readScope, { assetRouteBase })
  };
}

function toPublicDocumentDetail(post, {
  assetRouteBase = '/documents',
  readScope = { visibility: 'public' }
} = {}) {
  return {
    ...toPublicDocumentSummary(post, { assetRouteBase, readScope }),
    content: post.content
  };
}

// 5. Docs / Knowledge Base List. Both paths deliberately use one public
// projection: `/docs` remains the long-standing UI route while
// `/knowledge/docs` makes the workspace API namespace explicit.
const listPublicKnowledgeDocs = (req, res) => {
  try {
    const readScope = getReadScope(req);
    const projectId = publicProjectIdFromQuery(req.query.project_id);
    const query = {
      publishedOnly: readScope.publishedOnly,
      visibility: readScope.visibility
    };
    if (projectId) query.projectId = projectId;
    const posts = dbService.getKnowledgeDocs(query);
    const filteredPosts = applyFacetAssignments(
      posts.filter(post => isReadableKnowledgeDoc(post, readScope)),
      req.query,
      readScope
    );
    const docs = filteredPosts.map(post => toPublicDocumentSummary(post, { readScope }));
    res.json({ docs });
  } catch (err) {
    logger.error('Failed to list knowledge docs', err);
    res.status(500).json({ error: 'KNOWLEDGE_DOCS_READ_ERROR', docs: [] });
  }
};

knowledgeRouter.get('/docs', listPublicKnowledgeDocs);
knowledgeRouter.get('/knowledge/docs', listPublicKnowledgeDocs);

// Canonical public collection: unlike the compatibility `/docs` and `/blog`
// views, it treats every Markdown-backed item as the same document and lets a
// caller optionally select only a presentation profile.
knowledgeRouter.get('/documents', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const filter = resolvePublicDocumentFilter(req.query);
    const projectId = publicProjectIdFromQuery(req.query.project_id ?? req.query.projectId);
    const query = {
      publishedOnly: readScope.publishedOnly,
      visibility: readScope.visibility,
      contentType: filter.contentType,
      presentationProfile: filter.presentationProfile
    };
    if (projectId) query.projectId = projectId;
    const documents = applyFacetAssignments(
      dbService.getBlogPosts(query).filter(post => isReadableContentDocument(post, readScope)),
      req.query,
      readScope
    ).map(post => toPublicDocumentSummary(post, { assetRouteBase: '/documents', readScope }));
    return res.json({ documents });
  } catch (error) {
    if (isPresentationFilterError(error)) {
      return res.status(400).json({ error: error.code || error.message, documents: [] });
    }
    logger.error('Failed to list canonical public documents', error);
    return res.status(500).json({ error: 'DOCUMENTS_READ_ERROR', documents: [] });
  }
});

knowledgeRouter.get('/documents/search', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const filter = resolvePublicDocumentFilter(req.query);
    const projectId = publicProjectIdFromQuery(req.query.project_id ?? req.query.projectId);
    const documents = searchKnowledgeForScope({
      query: String(req.query.q || '').trim(),
      projectId: projectId || 'all',
      contentType: filter.contentType,
      presentationProfile: filter.presentationProfile,
      limit: Number(req.query.limit) || 30,
      facetQuery: req.query,
      readScope
    }).map(post => ({
      ...toPublicDocumentSummary(post, { assetRouteBase: '/documents', readScope }),
      relevance_score: post.hybridRelevanceScore ?? null,
      semantic_score: post.cosineSimilarity ?? null,
      keyword_score: post.keywordScore ?? null
    }));
    return res.json({ count: documents.length, documents });
  } catch (error) {
    if (isPresentationFilterError(error)) {
      return res.status(400).json({ error: error.code || error.message, documents: [] });
    }
    logger.error('Failed to search canonical public documents', error);
    return res.status(500).json({ error: 'DOCUMENT_SEARCH_FAILED', documents: [] });
  }
});

// 6. Intelligens Szemantikus & Full-Text RAG Kereső Végpont
knowledgeRouter.get('/docs/search', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const { q = '', project_id, limit } = req.query;
    const cleanQ = String(q || '').trim();
    const results = searchKnowledgeForScope({
      query: cleanQ,
      projectId: project_id && project_id !== 'ALL' ? String(project_id) : 'all',
      contentType: 'knowledge',
      limit: Number(limit) || 30,
      facetQuery: req.query,
      readScope
    });

    const normalize = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const qTokens = cleanQ.split(/\s+/).filter(Boolean);
    const normQTokens = qTokens.map(normalize);

    const docs = results.map(p => {
      const fullText = `${p.title} ${p.summary || ''} ${p.content || ''}`;
      const _normFullText = normalize(fullText);

      // Keresőszavak azonosítása és egyezések helye
      const matchedTokens = [];
      let inTitle = false;
      let inSummary = false;
      let inContent = false;

      for (const token of qTokens) {
        const normTok = normalize(token);
        if (normalize(p.title).includes(normTok)) {
          matchedTokens.push(token);
          inTitle = true;
        }
        if (p.summary && normalize(p.summary).includes(normTok)) {
          if (!matchedTokens.includes(token)) matchedTokens.push(token);
          inSummary = true;
        }
        if (p.content && normalize(p.content).includes(normTok)) {
          if (!matchedTokens.includes(token)) matchedTokens.push(token);
          inContent = true;
        }
      }

      let matchLocation = 'Szemantikai Vektor Találat';
      if (inTitle && inContent) matchLocation = 'Címben & Szövegtörzsben';
      else if (inTitle) matchLocation = 'Címben';
      else if (inSummary && inContent) matchLocation = 'Összefoglalóban & Szövegben';
      else if (inContent) matchLocation = 'Szövegtörzsben';
      else if (inSummary) matchLocation = 'Összefoglalóban';

      // Releváns szövegrészlet (Snippet) keresése a tartalomból
      let matchSnippet = p.summary || '';
      if (cleanQ.length > 1 && p.content) {
        const cleanContent = p.content.replace(/[#*`_>[\]]/g, ' ');
        const normContent = normalize(cleanContent);

        let matchIdx = -1;
        for (const tok of normQTokens) {
          const idx = normContent.indexOf(tok);
          if (idx !== -1) {
            matchIdx = idx;
            break;
          }
        }

        if (matchIdx !== -1) {
          const start = Math.max(0, matchIdx - 70);
          const end = Math.min(cleanContent.length, matchIdx + 140);
          matchSnippet = (start > 0 ? '... ' : '') + cleanContent.substring(start, end).trim() + (end < cleanContent.length ? ' ...' : '');
        }
      }

      const relevancePct = Math.min(100, Math.round((p.hybridRelevanceScore || 0) * 100));
      const semanticPct = Math.min(100, Math.round((p.cosineSimilarity || 0) * 100));
      const keywordPct = Math.min(100, Math.round((p.keywordScore || 0) * 100));

      return {
        id: p.id,
        slug: p.slug,
        title: p.title,
        summary: p.summary,
        content_type: p.content_type,
        presentation_profile: p.presentation_profile,
        visibility: p.visibility,
        published: Number(p.published),
        matchSnippet,
        matchLocation,
        matchedTokens,
        relevanceScore: relevancePct,
        semanticScore: semanticPct,
        keywordScore: keywordPct,
        category: p.category || 'Tudástár',
        project_id: p.project_id,
        project_name: p.project_name || 'Általános Munkatér',
        dimensions: p.dimensions || {},
        read_time: p.read_time || '5 PERC',
        updated_at: p.created_at ? p.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
        drive_path: p.drive_path || '',
        audio_url: p.audio_url,
        video_url: p.video_url || '',
        assets: assetsForPost(p, readScope)
      };
    });

    res.json({ count: docs.length, docs });
  } catch (err) {
    logger.error('Failed to perform intelligent knowledge search', err);
    res.status(500).json({ error: 'SEARCH_FAILED', docs: [] });
  }
});

// 7. In-Article True Server RAG Chunk Retrieval Endpoint
knowledgeRouter.get('/rag/article-chunks', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const { slug, q } = req.query;
    if (!slug) {
      return res.status(400).json({ error: 'MISSING_SLUG', chunks: [] });
    }

    const result = dbService.getArticleRagChunks({
      slug: String(slug),
      query: String(q || ''),
      visibility: readScope.visibility
    });

    res.json(result);
  } catch (err) {
    logger.error('Failed to retrieve article RAG chunks', err);
    res.status(500).json({ error: 'RAG_CHUNKS_FAILED', chunks: [] });
  }
});

// 8. Related Docs (Semantic Recommendation)
knowledgeRouter.get('/docs/related/:slug', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const { limit = 3 } = req.query;
    const related = dbService.getRelatedBlogPosts(req.params.slug, Number(limit) || 3, readScope);
    res.json(related);
  } catch (err) {
    logger.error(`Failed to get related docs for: ${req.params.slug}`, err);
    res.status(500).json({ error: 'RELATED_DOCS_ERROR', related: [] });
  }
});

// Public, read-only Obsidian link graph.  This is a deliberately filtered
// projection: internal nodes, relationships, frontmatter and SQL bindings
// never cross this public boundary.
knowledgeRouter.get('/docs/graph/:slug', (req, res) => {
  const { slug } = req.params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || ''))) {
    return res.status(400).json({ error: 'INVALID_SLUG', graph: null });
  }

  try {
    const graph = (isAdminPreview(req)
      ? hybridKnowledgeService.getPreviewGraphBySlug
      : hybridKnowledgeService.getPublicGraphBySlug)(slug, {
      depth: Number(req.query.depth ?? 1)
    });
    if (!graph) return res.status(404).json({ error: 'PUBLIC_GRAPH_NOT_FOUND', graph: null });
    return res.json(graph);
  } catch (err) {
    logger.error(`Failed to retrieve public knowledge graph for: ${slug}`, err);
    return res.status(500).json({ error: 'PUBLIC_GRAPH_READ_ERROR', graph: null });
  }
});

knowledgeRouter.get('/graph/documents', (req, res) => {
  try {
    const documents = isAdminPreview(req)
      ? hybridKnowledgeService.listPreviewGraphDocuments()
      : hybridKnowledgeService.listPublicGraphDocuments();
    return res.json({ documents });
  } catch (err) {
    logger.error('Failed to list public graph documents', err);
    return res.status(500).json({ error: 'PUBLIC_GRAPH_DOCUMENTS_READ_ERROR', documents: [] });
  }
});

// Public archive view: includes every published, RAG-indexed Blog and
// Knowledge Vault document, even when it has no wikilink yet.  The edge set
// still contains only real, public-to-public relationships.
knowledgeRouter.get('/graph', (req, res) => {
  try {
    return res.json(isAdminPreview(req)
      ? hybridKnowledgeService.getPreviewGraphOverview()
      : hybridKnowledgeService.getPublicGraphOverview());
  } catch (err) {
    logger.error('Failed to retrieve public graph overview', err);
    return res.status(500).json({ error: 'PUBLIC_GRAPH_OVERVIEW_READ_ERROR', documents: [], edges: [] });
  }
});

knowledgeRouter.get('/graph/:slug', (req, res) => {
  const { slug } = req.params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || ''))) {
    return res.status(400).json({ error: 'INVALID_SLUG', graph: null });
  }
  try {
    const graph = (isAdminPreview(req)
      ? hybridKnowledgeService.getPreviewGraphBySlug
      : hybridKnowledgeService.getPublicGraphBySlug)(slug, { depth: Number(req.query.depth ?? 2) });
    if (!graph) return res.status(404).json({ error: 'PUBLIC_GRAPH_NOT_FOUND', graph: null });
    return res.json(graph);
  } catch (err) {
    logger.error(`Failed to retrieve cross-corpus public graph for: ${slug}`, err);
    return res.status(500).json({ error: 'PUBLIC_GRAPH_READ_ERROR', graph: null });
  }
});

// A local binary is always resolved relative to its owning Markdown folder.
// This helper never accepts a filesystem path, and only serves assets whose
// document and manifest record are both public.
function serveDocumentAsset(req, res, documentGuard) {
  try {
    const readScope = getReadScope(req);
    const { slug, assetId } = req.params;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(slug || '')) || !ASSET_ID_PATTERN.test(String(assetId || ''))) {
      return res.status(400).json({ error: 'INVALID_ASSET_REFERENCE' });
    }
    const post = dbService.getBlogPostBySlug(slug, {
      publishedOnly: readScope.publishedOnly,
      visibility: readScope.visibility
    });
    if (!documentGuard(post, readScope)) return res.status(404).json({ error: 'ASSET_NOT_FOUND' });

    // The DB asset registry is canonical for newly uploaded document files.
    // A private file remains available to an authenticated admin preview, but
    // cannot be discovered or fetched through the public presentation route.
    const databaseAsset = contentDocumentAssetService.getDocumentAsset(post.id, assetId);
    if (databaseAsset) {
      if (!readScope.preview && databaseAsset.visibility !== 'public') {
        return res.status(404).json({ error: 'ASSET_NOT_FOUND' });
      }
      if (databaseAsset.availability !== 'available') {
        return res.status(404).json({ error: 'ASSET_UNAVAILABLE' });
      }
      let resolved;
      try {
        resolved = contentDocumentStorageService.resolveDocumentAsset({
          postId: post.id,
          relativePath: databaseAsset.relative_path
        });
      } catch (error) {
        logger.warn('Public database asset resolution failed', {
          slug,
          asset_id: assetId,
          error: error?.code || error?.message
        });
        return res.status(404).json({ error: 'ASSET_UNAVAILABLE' });
      }
      const safeInline = /^(?:image\/(?!svg\+xml$)|audio\/|video\/|application\/pdf$)/i.test(databaseAsset.mime_type || '');
      res.type(databaseAsset.mime_type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `${safeInline ? 'inline' : 'attachment'}; filename="${databaseAsset.original_name.replace(/["\\\r\n]/g, '_')}"`);
      setReadCacheControl(req, res, 'public, max-age=300');
      return res.sendFile(resolved.file_path);
    }

    const asset = hybridKnowledgeService
      .getAssetsForPosts([post.id], { visibility: readScope.visibility })
      .find(item => item.file_id === assetId);
    if (!asset) return res.status(404).json({ error: 'ASSET_NOT_FOUND' });
    if (asset.source_kind === 'external') return res.redirect(302, asset.uri);

    let resolved;
    try {
      resolved = resolveLocalVaultAsset({
        vaultRoot: resolveLocalVaultRoot(),
        sourcePath: post.drive_path,
        asset
      });
    } catch (error) {
      logger.warn('Public local asset resolution failed', { slug, asset_id: assetId, error: error?.code || error?.message });
      return res.status(404).json({ error: 'ASSET_UNAVAILABLE' });
    }
    if (!resolved) return res.status(404).json({ error: 'ASSET_UNAVAILABLE' });
    const fallbackName = resolved.relativePath.split('/').pop() || asset.title || assetId;
    const safeInline = /^(?:image\/|audio\/|video\/|application\/pdf$)/i.test(asset.mime_type || '');
    if (asset.mime_type) res.type(asset.mime_type);
    res.setHeader('Content-Disposition', `${safeInline ? 'inline' : 'attachment'}; filename="${fallbackName.replace(/["\\\r\n]/g, '_')}"`);
    return res.sendFile(resolved.filePath);
  } catch (err) {
    logger.error(`Failed to serve local vault asset [${req.params.slug}/${req.params.assetId}]`, err);
    return res.status(500).json({ error: 'ASSET_READ_ERROR' });
  }
}

// Compatibility route: it remains scoped to the knowledge presentation.
knowledgeRouter.get('/docs/:slug/assets/:assetId', (req, res) => (
  serveDocumentAsset(req, res, isReadableKnowledgeDoc)
));

// Canonical route: all public document profiles receive the exact same asset
// containment and visibility guarantees.
knowledgeRouter.get('/documents/:slug/assets/:assetId', (req, res) => (
  serveDocumentAsset(req, res, isReadableContentDocument)
));

knowledgeRouter.get('/documents/:slug', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const filter = resolvePublicDocumentFilter(req.query);
    const post = dbService.getBlogPostBySlug(req.params.slug, {
      publishedOnly: readScope.publishedOnly,
      visibility: readScope.visibility
    });
    const presentation = post
      ? resolveDocumentPresentation({
        presentationProfile: post.presentation_profile,
        contentType: post.content_type,
        fallbackProfile: 'article'
      })
      : null;
    if (!isReadableContentDocument(post, readScope)
      || (filter.contentType !== 'all' && post.content_type !== filter.contentType)
      || (filter.presentationProfile && presentation.presentation_profile !== filter.presentationProfile)) {
      return res.status(404).json({ error: 'DOCUMENT_NOT_FOUND' });
    }
    return res.json(toPublicDocumentDetail(post, { assetRouteBase: '/documents', readScope }));
  } catch (error) {
    if (isPresentationFilterError(error)) {
      return res.status(400).json({ error: error.code || error.message });
    }
    logger.error(`Failed to read canonical document: ${req.params.slug}`, error);
    return res.status(500).json({ error: 'DOCUMENT_READ_ERROR' });
  }
});

// 9. Docs – egyedi dokumentum tartalom a Knowledge Vaultból
knowledgeRouter.get('/docs/:slug', (req, res) => {
  try {
    const readScope = getReadScope(req);
    const { slug } = req.params;
    const post = dbService.getBlogPostBySlug(slug, {
      publishedOnly: readScope.publishedOnly,
      visibility: readScope.visibility
    });

    if (!isReadableKnowledgeDoc(post, readScope)) {
      return res.status(404).json({ error: 'DOC_NOT_FOUND', content: '# HIBA 404\n\nA kért dokumentum nem található a publikus tudástárban.' });
    }

    res.json({
      slug: post.slug,
      title: post.title,
      content: post.content,
      content_type: post.content_type,
      presentation_profile: post.presentation_profile,
      category: post.category,
      project_name: post.project_name || 'Általános',
      updated_at: post.created_at ? post.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
      drive_path: post.drive_path || '',
      audio_url: post.audio_url,
      video_url: post.video_url || '',
      assets: assetsForPost(post, readScope)
    });
  } catch (err) {
    logger.error(`Failed to read doc: ${req.params.slug}`, err);
    res.status(500).json({ error: 'DOC_READ_ERROR' });
  }
});
