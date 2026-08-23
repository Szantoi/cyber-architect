import crypto from "node:crypto";
import { db, initDatabase } from "../db.js";
import {
  createGraphEdgeSchema,
  createGraphEdgeTypeSchema,
  createGraphNodeSchema,
  createGraphSchema,
  graphMembershipSchema,
  graphTraversalSchema,
  updateGraphEdgeSchema,
  updateGraphEdgeTypeSchema,
  updateGraphNodeSchema,
  updateGraphSchema,
} from "../schemas/graph.schema.js";

// Direct consumers include the vault synchronizer and CLI tooling.  Keep the
// service safe to import without relying on Express having started first.
initDatabase();

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{1,159}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const VISIBILITIES = new Set(["public", "private"]);

function nowIso() {
  return new Date().toISOString();
}

function asBoolean(value) {
  return Number(value) === 1;
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toJson(value) {
  return JSON.stringify(value || {});
}

function graphError(code, details = null) {
  const error = new Error(code);
  if (details !== null) error.details = details;
  return error;
}

function assertId(value, code = "INVALID_GRAPH_ID") {
  const normalized = String(value || "").trim();
  if (!ID_PATTERN.test(normalized)) throw graphError(code);
  return normalized;
}

function assertSlug(value, code = "INVALID_GRAPH_SLUG") {
  const normalized = String(value || "").trim();
  if (!SLUG_PATTERN.test(normalized)) throw graphError(code);
  return normalized;
}

function assertText(value, code, max = 160, { allowEmpty = false } = {}) {
  const normalized = String(value ?? "").trim();
  if ((!allowEmpty && !normalized) || normalized.length > max)
    throw graphError(code);
  return normalized;
}

function assertVisibility(value, fallback = "private") {
  const normalized =
    value === undefined || value === null || value === ""
      ? fallback
      : String(value).trim();
  if (!VISIBILITIES.has(normalized))
    throw graphError("INVALID_GRAPH_VISIBILITY");
  return normalized;
}

function assertColor(value, fallback = "#00FFFF") {
  const normalized =
    value === undefined || value === null || value === ""
      ? fallback
      : String(value).trim();
  if (!COLOR_PATTERN.test(normalized)) throw graphError("INVALID_GRAPH_COLOR");
  return normalized.toUpperCase();
}

function assertIcon(value, fallback) {
  const normalized =
    value === undefined || value === null || value === ""
      ? fallback
      : String(value).trim();
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(normalized))
    throw graphError("INVALID_GRAPH_ICON");
  return normalized;
}

function assertBoundedNumber(value, { fallback, min, max, code }) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < min || normalized > max)
    throw graphError(code);
  return normalized;
}

function normalizeTime(value, code) {
  if (value === undefined || value === null || value === "") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw graphError(code);
  return date.toISOString();
}

function normalizeWindow(validFrom, validTo) {
  const from = normalizeTime(validFrom, "INVALID_GRAPH_VALID_FROM");
  const to = normalizeTime(validTo, "INVALID_GRAPH_VALID_TO");
  if (from && to && Date.parse(to) < Date.parse(from))
    throw graphError("INVALID_GRAPH_VALIDITY_WINDOW");
  return { valid_from: from, valid_to: to };
}

function normalizeActor(value) {
  return (
    String(value || "SYSTEM_GRAPH")
      .trim()
      .slice(0, 160) || "SYSTEM_GRAPH"
  );
}

function unique(values = []) {
  return [
    ...new Set(
      values.map((value) => String(value || "").trim()).filter(Boolean),
    ),
  ];
}

let savepointSequence = 0;

function atomically(callback) {
  if (!db.inTransaction) return db.transaction(callback)();

  // A Vault → SQLite run can own the outer transaction.  A savepoint preserves
  // all-or-nothing graph replacement semantics even if that caller catches a
  // graph-specific error and continues processing another document.
  const savepoint = `graph_service_${++savepointSequence}`;
  db.exec(`SAVEPOINT ${savepoint}`);
  try {
    const result = callback();
    db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    try {
      db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    } finally {
      db.exec(`RELEASE SAVEPOINT ${savepoint}`);
    }
    throw error;
  }
}

function recordAudit({
  action,
  entity,
  entityId = null,
  prevState = null,
  newState = null,
  actor = "SYSTEM_GRAPH",
}) {
  db.prepare(
    `
    INSERT INTO audit_logs (action, entity, entity_id, prev_state, new_state, actor, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    String(action).slice(0, 120),
    String(entity).slice(0, 120),
    entityId === null ? null : String(entityId).slice(0, 240),
    prevState === null ? null : JSON.stringify(prevState),
    newState === null ? null : JSON.stringify(newState),
    normalizeActor(actor),
    nowIso(),
  );
}

function mapGraph(row) {
  if (!row) return null;
  return {
    ...row,
    active: asBoolean(row.active),
    metadata: parseJson(row.metadata_json, {}),
  };
}

function mapGraphMembership(membership) {
  const graph = {
    id: membership.graph_id,
    slug: membership.graph_slug,
    name: membership.graph_name,
    icon_key: membership.graph_icon_key,
    color: membership.graph_color,
    visibility: membership.graph_visibility,
    active: asBoolean(membership.graph_active),
  };
  return {
    ...membership,
    graph_active: graph.active,
    graph,
    metadata: parseJson(membership.metadata_json, {}),
  };
}

function mapNode(row, memberships = []) {
  if (!row) return null;
  return {
    ...row,
    active: asBoolean(row.active),
    metadata: parseJson(row.metadata_json, {}),
    graph_memberships: memberships.map(mapGraphMembership),
    graph_ids: memberships.map((membership) => membership.graph_id),
  };
}

function mapEdgeType(row) {
  if (!row) return null;
  return {
    ...row,
    source_node_types: parseJson(row.source_node_types_json, []),
    target_node_types: parseJson(row.target_node_types_json, []),
    allow_self_loop: asBoolean(row.allow_self_loop),
    default_weight: Number(row.default_weight),
    default_confidence: Number(row.default_confidence),
    default_cost: Number(row.default_cost),
    active: asBoolean(row.active),
    metadata: parseJson(row.metadata_json, {}),
  };
}

function mapEdge(row, memberships = []) {
  if (!row) return null;
  return {
    ...row,
    weight: Number(row.weight),
    confidence: Number(row.confidence),
    cost: Number(row.cost),
    active: asBoolean(row.active),
    provenance: parseJson(row.provenance_json, {}),
    metadata: parseJson(row.metadata_json, {}),
    source_metadata: parseJson(row.source_metadata_json, {}),
    target_metadata: parseJson(row.target_metadata_json, {}),
    graph_memberships: memberships.map(mapGraphMembership),
    graph_ids: memberships.map((membership) => membership.graph_id),
  };
}

function getGraphRow(idOrSlug) {
  const value = String(idOrSlug || "").trim();
  if (!value) return null;
  return (
    db
      .prepare(
        `
    SELECT * FROM graph_definitions
    WHERE id = ? OR slug = ?
    ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END
    LIMIT 1
  `,
      )
      .get(value, value, value) || null
  );
}

function getGraphRowById(id) {
  return (
    db
      .prepare("SELECT * FROM graph_definitions WHERE id = ?")
      .get(assertId(id)) || null
  );
}

function getNodeRow(id) {
  return (
    db
      .prepare("SELECT * FROM graph_nodes WHERE id = ?")
      .get(assertId(id, "INVALID_GRAPH_NODE_ID")) || null
  );
}

function getNodeBySource(sourceSystem, sourceReference) {
  const system = assertId(sourceSystem, "INVALID_GRAPH_SOURCE_SYSTEM");
  const reference = assertText(
    sourceReference,
    "INVALID_GRAPH_SOURCE_REFERENCE",
    1_024,
  );
  return (
    db
      .prepare(
        `
    SELECT * FROM graph_nodes
    WHERE source_system = ? AND source_reference = ?
  `,
      )
      .get(system, reference) || null
  );
}

function getEdgeTypeRow(idOrSlug) {
  const value = String(idOrSlug || "").trim();
  if (!value) return null;
  return (
    db
      .prepare(
        `
    SELECT * FROM graph_edge_types
    WHERE id = ? OR slug = ?
    ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END
    LIMIT 1
  `,
      )
      .get(value, value, value) || null
  );
}

function getEdgeRow(id) {
  return (
    db
      .prepare("SELECT * FROM graph_edges WHERE id = ?")
      .get(assertId(id, "INVALID_GRAPH_EDGE_ID")) || null
  );
}

function assertGraph(idOrSlug) {
  const row = getGraphRow(idOrSlug);
  if (!row) throw graphError("GRAPH_NOT_FOUND");
  return mapGraph(row);
}

function assertNode(id) {
  const row = getNodeRow(id);
  if (!row) throw graphError("GRAPH_NODE_NOT_FOUND");
  return mapNode(row);
}

function assertEdgeType(idOrSlug) {
  const row = getEdgeTypeRow(idOrSlug);
  if (!row) throw graphError("GRAPH_EDGE_TYPE_NOT_FOUND");
  return mapEdgeType(row);
}

function assertEdge(id) {
  const row = getEdgeRow(id);
  if (!row) throw graphError("GRAPH_EDGE_NOT_FOUND");
  return row;
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function generatePreferredId(prefix, slug, exists) {
  const base =
    `${prefix}_${String(slug || "").replace(/[^A-Za-z0-9_-]/g, "_")}`.slice(
      0,
      150,
    );
  if (ID_PATTERN.test(base) && !exists(base)) return base;
  return generateId(prefix);
}

function getMembershipRows({ entity = "node", ids = [] } = {}) {
  if (!ids.length) return new Map();
  const config =
    entity === "edge"
      ? { table: "graph_edge_memberships", entityColumn: "edge_id" }
      : { table: "graph_node_memberships", entityColumn: "node_id" };
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
    SELECT gm.graph_id, gm.${config.entityColumn}, gm.metadata_json, gm.created_by, gm.created_at,
           g.slug AS graph_slug, g.name AS graph_name, g.icon_key AS graph_icon_key,
           g.color AS graph_color, g.visibility AS graph_visibility, g.active AS graph_active
    FROM ${config.table} gm
    JOIN graph_definitions g ON g.id = gm.graph_id
    WHERE gm.${config.entityColumn} IN (${placeholders})
    ORDER BY g.name COLLATE NOCASE, gm.graph_id
  `,
    )
    .all(...ids);
  const byEntityId = new Map();
  for (const row of rows) {
    const entityId = row[config.entityColumn];
    const current = byEntityId.get(entityId) || [];
    current.push(row);
    byEntityId.set(entityId, current);
  }
  return byEntityId;
}

function getNodeMembershipRows(nodeIds) {
  return getMembershipRows({ entity: "node", ids: nodeIds });
}

function getEdgeMembershipRows(edgeIds) {
  return getMembershipRows({ entity: "edge", ids: edgeIds });
}

const EDGE_SELECT = `
  SELECT e.*,
         et.slug AS edge_type_slug,
         et.label AS edge_type_label,
         et.inverse_edge_type_id AS edge_type_inverse_edge_type_id,
         et.icon_key AS edge_type_icon_key,
         et.color AS edge_type_color,
         et.visibility AS edge_type_visibility,
         et.active AS edge_type_active,
         source.label AS source_label,
         source.node_type AS source_node_type,
         source.source_system AS source_system,
         source.source_reference AS source_reference,
         source.metadata_json AS source_metadata_json,
         target.label AS target_label,
         target.node_type AS target_node_type,
         target.source_system AS target_system,
         target.source_reference AS target_reference,
         target.metadata_json AS target_metadata_json
  FROM graph_edges e
  JOIN graph_edge_types et ON et.id = e.edge_type_id
  JOIN graph_nodes source ON source.id = e.source_node_id
  JOIN graph_nodes target ON target.id = e.target_node_id
`;

function hydrateEdgeRows(rows) {
  const memberships = getEdgeMembershipRows(rows.map((row) => row.id));
  return rows.map((row) => mapEdge(row, memberships.get(row.id) || []));
}

function hydrateNodeRows(rows) {
  const memberships = getNodeMembershipRows(rows.map((row) => row.id));
  return rows.map((row) => mapNode(row, memberships.get(row.id) || []));
}

function getHydratedNode(id) {
  const row = getNodeRow(id);
  if (!row) throw graphError("GRAPH_NODE_NOT_FOUND");
  return hydrateNodeRows([row])[0];
}

function getHydratedNodesByIds(ids) {
  if (!ids.length) return [];
  const uniqueIds = unique(ids).map((id) =>
    assertId(id, "INVALID_GRAPH_NODE_ID"),
  );
  const placeholders = uniqueIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
    SELECT n.*
    FROM graph_nodes n
    WHERE n.id IN (${placeholders})
  `,
    )
    .all(...uniqueIds);
  return hydrateNodeRows(rows);
}

/**
 * Resolves only explicit, canonical Markdown/Vault identities into public
 * document bindings.  A graph label or a slug is deliberately never used as
 * an identity here: a node must be marked as `markdown` and its stable
 * `source_reference` must exactly equal the indexed document_id, source_path,
 * or legacy `post:<id>` reference written by the Markdown projection.
 *
 * The returned projection intentionally omits source_path, frontmatter and
 * graph-node metadata.  Public route serializers can safely attach this
 * compact result to a graph node overlay.
 */
function getDocumentBindings(
  nodeIds = [],
  {
    visibility = "public",
    publishedOnly = true,
    classification = "public",
  } = {},
) {
  const ids = unique(nodeIds).map((id) =>
    assertId(id, "INVALID_GRAPH_NODE_ID"),
  );
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => "?").join(", ");
  const conditions = [
    `n.id IN (${placeholders})`,
    "n.source_system = 'markdown'",
    "n.source_reference <> ''",
    "b.content_type IN ('knowledge', 'blog')",
    "d.rag_index = 1",
  ];
  const params = [...ids];
  if (visibility !== "all") {
    conditions.push("b.visibility = ?");
    params.push(visibility);
  }
  if (publishedOnly) conditions.push("b.published = 1");
  if (classification !== "all") {
    conditions.push("d.classification = ?");
    params.push(classification);
  }
  const rows = db
    .prepare(
      `
    SELECT
      n.id AS node_id,
      MIN(d.document_id) AS document_id,
      MIN(b.slug) AS slug,
      MIN(b.content_type) AS content_type
    FROM graph_nodes n
    JOIN hybrid_rag_documents d ON (
      (d.document_id <> '' AND n.source_reference = d.document_id)
      OR (d.source_path <> '' AND n.source_reference = d.source_path)
      OR n.source_reference = ('post:' || d.post_id)
    )
    JOIN blog_posts b ON b.id = d.post_id
    WHERE ${conditions.join(" AND ")}
    GROUP BY n.id
    -- Refuse an ambiguous reference instead of selecting an arbitrary note.
    HAVING COUNT(DISTINCT b.id) = 1
  `,
    )
    .all(...params);
  return new Map(
    rows.map((row) => [
      row.node_id,
      {
        document_id: row.document_id || null,
        slug: row.slug,
        content_type: row.content_type,
      },
    ]),
  );
}

function getPublicDocumentBindings(nodeIds = []) {
  return getDocumentBindings(nodeIds);
}

function getPreviewDocumentBindings(nodeIds = []) {
  return getDocumentBindings(nodeIds, {
    visibility: "all",
    publishedOnly: false,
    classification: "all",
  });
}

function getHydratedEdge(id) {
  const row = db
    .prepare(`${EDGE_SELECT} WHERE e.id = ?`)
    .get(assertId(id, "INVALID_GRAPH_EDGE_ID"));
  if (!row) throw graphError("GRAPH_EDGE_NOT_FOUND");
  return hydrateEdgeRows([row])[0];
}

function normalizeGraphInput(input) {
  const parsed = createGraphSchema.parse(input);
  const slug = assertSlug(parsed.slug);
  const id = parsed.id
    ? assertId(parsed.id)
    : generatePreferredId("graph", slug, (candidate) =>
        Boolean(getGraphRowById(candidate)),
      );
  return {
    id,
    slug,
    name: assertText(parsed.name, "INVALID_GRAPH_NAME", 160),
    description: assertText(
      parsed.description,
      "INVALID_GRAPH_DESCRIPTION",
      2_000,
      { allowEmpty: true },
    ),
    icon_key: assertIcon(parsed.icon_key, "network"),
    color: assertColor(parsed.color),
    visibility: assertVisibility(parsed.visibility),
    active: Boolean(parsed.active),
    owner_id: assertText(parsed.owner_id, "INVALID_GRAPH_OWNER", 160, {
      allowEmpty: true,
    }),
    metadata: parsed.metadata || {},
  };
}

function normalizeNodeInput(input) {
  const parsed = createGraphNodeSchema.parse(input);
  const id = parsed.id
    ? assertId(parsed.id, "INVALID_GRAPH_NODE_ID")
    : generateId("node");
  return {
    id,
    node_type: assertId(parsed.node_type, "INVALID_GRAPH_NODE_TYPE"),
    label: assertText(parsed.label, "INVALID_GRAPH_NODE_LABEL", 240),
    description: assertText(
      parsed.description,
      "INVALID_GRAPH_NODE_DESCRIPTION",
      4_000,
      { allowEmpty: true },
    ),
    source_system: assertId(
      parsed.source_system,
      "INVALID_GRAPH_SOURCE_SYSTEM",
    ),
    source_reference: assertText(
      parsed.source_reference,
      "INVALID_GRAPH_SOURCE_REFERENCE",
      1_024,
      { allowEmpty: true },
    ),
    visibility: assertVisibility(parsed.visibility),
    active: Boolean(parsed.active),
    metadata: parsed.metadata || {},
  };
}

function normalizeNodeTypes(values = [], code) {
  return unique(values).map((value) => assertId(value, code));
}

function normalizeEdgeTypeInput(input) {
  const parsed = createGraphEdgeTypeSchema.parse(input);
  const slug = assertSlug(parsed.slug, "INVALID_GRAPH_EDGE_TYPE_SLUG");
  const id = parsed.id
    ? assertId(parsed.id, "INVALID_GRAPH_EDGE_TYPE_ID")
    : generatePreferredId("edge_type", slug, (candidate) =>
        Boolean(getEdgeTypeRow(candidate)),
      );
  return {
    id,
    slug,
    label: assertText(parsed.label, "INVALID_GRAPH_EDGE_TYPE_LABEL", 160),
    description: assertText(
      parsed.description,
      "INVALID_GRAPH_EDGE_TYPE_DESCRIPTION",
      2_000,
      { allowEmpty: true },
    ),
    icon_key: assertIcon(parsed.icon_key, "git-branch"),
    color: assertColor(parsed.color, "#80FF00"),
    source_node_types: normalizeNodeTypes(
      parsed.source_node_types,
      "INVALID_GRAPH_EDGE_SOURCE_NODE_TYPE",
    ),
    target_node_types: normalizeNodeTypes(
      parsed.target_node_types,
      "INVALID_GRAPH_EDGE_TARGET_NODE_TYPE",
    ),
    inverse_edge_type_id: parsed.inverse_edge_type_id
      ? assertId(
          parsed.inverse_edge_type_id,
          "INVALID_GRAPH_INVERSE_EDGE_TYPE_ID",
        )
      : null,
    allow_self_loop: Boolean(parsed.allow_self_loop),
    default_weight: assertBoundedNumber(parsed.default_weight, {
      fallback: 1,
      min: 0,
      max: 1,
      code: "INVALID_GRAPH_EDGE_WEIGHT",
    }),
    default_confidence: assertBoundedNumber(parsed.default_confidence, {
      fallback: 1,
      min: 0,
      max: 1,
      code: "INVALID_GRAPH_EDGE_CONFIDENCE",
    }),
    default_cost: assertBoundedNumber(parsed.default_cost, {
      fallback: 1,
      min: 0,
      max: 1_000_000,
      code: "INVALID_GRAPH_EDGE_COST",
    }),
    visibility: assertVisibility(parsed.visibility),
    active: Boolean(parsed.active),
    metadata: parsed.metadata || {},
  };
}

function assertNodeAllowed(type, node, side) {
  const allowed =
    side === "source" ? type.source_node_types : type.target_node_types;
  if (allowed.length && !allowed.includes(node.node_type)) {
    throw graphError(`GRAPH_EDGE_${side.toUpperCase()}_NODE_TYPE_NOT_ALLOWED`, {
      edge_type_id: type.id,
      node_id: node.id,
      node_type: node.node_type,
      allowed_node_types: allowed,
    });
  }
}

function assertEndpointConstraints({ edgeType, source, target }) {
  if (!edgeType.active) throw graphError("GRAPH_EDGE_TYPE_INACTIVE");
  if (!source.active || !target.active)
    throw graphError("GRAPH_EDGE_NODE_INACTIVE");
  if (source.id === target.id && !edgeType.allow_self_loop)
    throw graphError("GRAPH_EDGE_SELF_LOOP_NOT_ALLOWED");
  assertNodeAllowed(edgeType, source, "source");
  assertNodeAllowed(edgeType, target, "target");
}

function assertGraphMembership(graphId, nodeId) {
  const row = db
    .prepare(
      `
    SELECT 1
    FROM graph_node_memberships
    WHERE graph_id = ? AND node_id = ?
  `,
    )
    .get(graphId, nodeId);
  if (!row)
    throw graphError("GRAPH_EDGE_ENDPOINT_NOT_IN_GRAPH", {
      graph_id: graphId,
      node_id: nodeId,
    });
}

function insertMembership(graphId, nodeId, metadata, actor) {
  const existing =
    db
      .prepare(
        `
    SELECT metadata_json, created_by, created_at
    FROM graph_node_memberships
    WHERE graph_id = ? AND node_id = ?
  `,
      )
      .get(graphId, nodeId) || null;
  const timestamp = nowIso();
  db.prepare(
    `
    INSERT INTO graph_node_memberships (graph_id, node_id, metadata_json, created_by, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(graph_id, node_id) DO UPDATE SET metadata_json = excluded.metadata_json
  `,
  ).run(graphId, nodeId, toJson(metadata), normalizeActor(actor), timestamp);
  return existing;
}

function insertEdgeMembership(graphId, edgeId, metadata, actor) {
  db.prepare(
    `
    INSERT INTO graph_edge_memberships (graph_id, edge_id, metadata_json, created_by, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(graph_id, edge_id) DO UPDATE SET metadata_json = excluded.metadata_json
  `,
  ).run(graphId, edgeId, toJson(metadata), normalizeActor(actor), nowIso());
}

function normalizeEdgeInput(input) {
  const parsed = createGraphEdgeSchema.parse(input);
  const graphIds = unique(parsed.graph_ids).map((value) => assertId(value));
  const window = normalizeWindow(parsed.valid_from, parsed.valid_to);
  return {
    id: parsed.id
      ? assertId(parsed.id, "INVALID_GRAPH_EDGE_ID")
      : generateId("edge"),
    source_node_id: assertId(parsed.source_node_id, "INVALID_GRAPH_NODE_ID"),
    target_node_id: assertId(parsed.target_node_id, "INVALID_GRAPH_NODE_ID"),
    edge_type_id: assertId(parsed.edge_type_id, "INVALID_GRAPH_EDGE_TYPE_ID"),
    graph_ids: graphIds,
    bidirectional: Boolean(parsed.bidirectional),
    inverse_edge_type_id: parsed.inverse_edge_type_id
      ? assertId(
          parsed.inverse_edge_type_id,
          "INVALID_GRAPH_INVERSE_EDGE_TYPE_ID",
        )
      : null,
    origin: parsed.origin,
    projection_source_key: assertText(
      parsed.projection_source_key,
      "INVALID_GRAPH_PROJECTION_SOURCE_KEY",
      1_024,
      { allowEmpty: true },
    ),
    provenance: parsed.provenance || {},
    metadata: parsed.metadata || {},
    weight: parsed.weight,
    confidence: parsed.confidence,
    cost: parsed.cost,
    ...window,
    visibility: assertVisibility(parsed.visibility),
    active: Boolean(parsed.active),
  };
}

function insertEdge({
  id,
  sourceNodeId,
  targetNodeId,
  edgeTypeId,
  relationGroupId,
  reciprocalEdgeId = null,
  reciprocalRole,
  origin,
  projectionSourceKey,
  provenance,
  metadata,
  weight,
  confidence,
  cost,
  validFrom,
  validTo,
  visibility,
  active,
  actor,
}) {
  const timestamp = nowIso();
  db.prepare(
    `
    INSERT INTO graph_edges (
      id, source_node_id, target_node_id, edge_type_id, relation_group_id,
      reciprocal_edge_id, reciprocal_role, origin, projection_source_key,
      provenance_json, metadata_json, weight, confidence, cost, valid_from, valid_to,
      visibility, active, created_by, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  ).run(
    id,
    sourceNodeId,
    targetNodeId,
    edgeTypeId,
    relationGroupId,
    reciprocalEdgeId,
    reciprocalRole,
    origin,
    projectionSourceKey,
    toJson(provenance),
    toJson(metadata),
    weight,
    confidence,
    cost,
    validFrom,
    validTo,
    visibility,
    Number(active),
    normalizeActor(actor),
    timestamp,
    normalizeActor(actor),
    timestamp,
  );
}

function nodeRowFromEdge(row, side) {
  if (side === "source") {
    return {
      id: row.source_node_id,
      label: row.source_label,
      node_type: row.source_node_type,
      source_system: row.source_system,
      source_reference: row.source_reference,
    };
  }
  return {
    id: row.target_node_id,
    label: row.target_label,
    node_type: row.target_node_type,
    source_system: row.target_system,
    source_reference: row.target_reference,
  };
}

export const graphService = {
  getGraph(idOrSlug) {
    const graph = getGraphRow(idOrSlug);
    if (!graph) throw graphError("GRAPH_NOT_FOUND");
    return mapGraph(graph);
  },

  listGraphs({ visibility = "all", includeInactive = false } = {}) {
    const conditions = ["1 = 1"];
    const params = [];
    if (visibility !== "all") {
      conditions.push("g.visibility = ?");
      params.push(assertVisibility(visibility));
    }
    if (!includeInactive) conditions.push("g.active = 1");
    const graphs = db
      .prepare(
        `
      SELECT g.*
      FROM graph_definitions g
      WHERE ${conditions.join(" AND ")}
      ORDER BY g.name COLLATE NOCASE, g.id
    `,
      )
      .all(...params)
      .map(mapGraph);

    const countNodes = db.prepare(`
      SELECT COUNT(*) AS count
      FROM graph_node_memberships gm
      JOIN graph_nodes n ON n.id = gm.node_id
      WHERE gm.graph_id = ?
        AND (? = 'all' OR n.visibility = ?)
        AND (? = 1 OR n.active = 1)
    `);
    const countEdges = db.prepare(`
      SELECT COUNT(*) AS count
      FROM graph_edge_memberships gm
      JOIN graph_edges e ON e.id = gm.edge_id
      JOIN graph_nodes source ON source.id = e.source_node_id
      JOIN graph_nodes target ON target.id = e.target_node_id
      JOIN graph_edge_types et ON et.id = e.edge_type_id
      WHERE gm.graph_id = ?
        AND (? = 'all' OR (e.visibility = ? AND source.visibility = ? AND target.visibility = ? AND et.visibility = ?))
        AND (? = 1 OR (e.active = 1 AND source.active = 1 AND target.active = 1 AND et.active = 1))
    `);
    return graphs.map((graph) => ({
      ...graph,
      node_count: Number(
        countNodes.get(
          graph.id,
          visibility,
          visibility,
          Number(includeInactive),
        ).count,
      ),
      edge_count: Number(
        countEdges.get(
          graph.id,
          visibility,
          visibility,
          visibility,
          visibility,
          visibility,
          Number(includeInactive),
        ).count,
      ),
    }));
  },

  createGraph(input, actor = "SYSTEM_GRAPH") {
    return atomically(() => {
      const graph = normalizeGraphInput(input);
      if (getGraphRowById(graph.id)) throw graphError("GRAPH_ALREADY_EXISTS");
      const slugMatch = db
        .prepare("SELECT id FROM graph_definitions WHERE slug = ?")
        .get(graph.slug);
      if (slugMatch) throw graphError("GRAPH_SLUG_ALREADY_EXISTS");
      const timestamp = nowIso();
      db.prepare(
        `
        INSERT INTO graph_definitions (
          id, slug, name, description, icon_key, color, visibility, active, owner_id,
          metadata_json, created_by, created_at, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        graph.id,
        graph.slug,
        graph.name,
        graph.description,
        graph.icon_key,
        graph.color,
        graph.visibility,
        Number(graph.active),
        graph.owner_id,
        toJson(graph.metadata),
        normalizeActor(actor),
        timestamp,
        normalizeActor(actor),
        timestamp,
      );
      const created = this.getGraph(graph.id);
      recordAudit({
        action: "CREATE_GRAPH",
        entity: "graph_definitions",
        entityId: graph.id,
        newState: created,
        actor,
      });
      return created;
    });
  },

  updateGraph(idOrSlug, patch, actor = "SYSTEM_GRAPH") {
    return atomically(() => {
      const previous = this.getGraph(idOrSlug);
      const parsedPatch = updateGraphSchema.parse(patch);
      const next = normalizeGraphInput({
        id: previous.id,
        slug: parsedPatch.slug ?? previous.slug,
        name: parsedPatch.name ?? previous.name,
        description: parsedPatch.description ?? previous.description,
        icon_key: parsedPatch.icon_key ?? previous.icon_key,
        color: parsedPatch.color ?? previous.color,
        visibility: parsedPatch.visibility ?? previous.visibility,
        active: parsedPatch.active ?? previous.active,
        owner_id: parsedPatch.owner_id ?? previous.owner_id,
        metadata: parsedPatch.metadata ?? previous.metadata,
      });
      const slugMatch = db
        .prepare("SELECT id FROM graph_definitions WHERE slug = ?")
        .get(next.slug);
      if (slugMatch && slugMatch.id !== previous.id)
        throw graphError("GRAPH_SLUG_ALREADY_EXISTS");
      db.prepare(
        `
        UPDATE graph_definitions
        SET slug = ?, name = ?, description = ?, icon_key = ?, color = ?, visibility = ?, active = ?,
            owner_id = ?, metadata_json = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
      `,
      ).run(
        next.slug,
        next.name,
        next.description,
        next.icon_key,
        next.color,
        next.visibility,
        Number(next.active),
        next.owner_id,
        toJson(next.metadata),
        normalizeActor(actor),
        nowIso(),
        previous.id,
      );
      const updated = this.getGraph(previous.id);
      recordAudit({
        action: "UPDATE_GRAPH",
        entity: "graph_definitions",
        entityId: previous.id,
        prevState: previous,
        newState: updated,
        actor,
      });
      return updated;
    });
  },

  deleteGraph(idOrSlug, actor = "SYSTEM_GRAPH") {
    return atomically(() => {
      const previous = this.getGraph(idOrSlug);
      const membershipCounts = db
        .prepare(
          `
        SELECT
          (SELECT COUNT(*) FROM graph_node_memberships WHERE graph_id = ?) AS nodes,
          (SELECT COUNT(*) FROM graph_edge_memberships WHERE graph_id = ?) AS edges
      `,
        )
        .get(previous.id, previous.id);
      db.prepare("DELETE FROM graph_definitions WHERE id = ?").run(previous.id);
      const result = {
        success: true,
        deleted_id: previous.id,
        removed_memberships: {
          nodes: Number(membershipCounts.nodes),
          edges: Number(membershipCounts.edges),
        },
      };
      recordAudit({
        action: "DELETE_GRAPH",
        entity: "graph_definitions",
        entityId: previous.id,
        prevState: previous,
        newState: result,
        actor,
      });
      return result;
    });
  },

  getNode(id) {
    return getHydratedNode(id);
  },

  listNodes({
    graphId = null,
    visibility = "all",
    includeInactive = false,
    limit = 250,
  } = {}) {
    const conditions = ["1 = 1"];
    const params = [];
    if (graphId) {
      conditions.push("gm.graph_id = ?");
      params.push(assertGraph(graphId).id);
    }
    if (visibility !== "all") {
      conditions.push("n.visibility = ?");
      params.push(assertVisibility(visibility));
    }
    if (!includeInactive) conditions.push("n.active = 1");
    const safeLimit = Math.max(1, Math.min(Number(limit) || 250, 500));
    const rows = db
      .prepare(
        `
      SELECT DISTINCT n.*
      FROM graph_nodes n
      ${graphId ? "JOIN graph_node_memberships gm ON gm.node_id = n.id" : ""}
      WHERE ${conditions.join(" AND ")}
      ORDER BY n.label COLLATE NOCASE, n.id
      LIMIT ?
    `,
      )
      .all(...params, safeLimit);
    return hydrateNodeRows(rows);
  },

  // Admin-only identity resolver used by the document relation composer. It
  // deliberately follows the same three canonical bindings as the public
  // projection (document_id, source_path, legacy post:<id>), never a fuzzy
  // label or slug match. That prevents a direct-document edit from silently
  // creating a second graph node for the same Vault note.
  listNodesForDocumentPostId(postId) {
    const normalizedPostId = Number(postId);
    if (!Number.isInteger(normalizedPostId) || normalizedPostId < 1) {
      throw graphError("INVALID_GRAPH_DOCUMENT_POST_ID");
    }
    const post = db
      .prepare("SELECT id FROM blog_posts WHERE id = ?")
      .get(normalizedPostId);
    if (!post) throw graphError("GRAPH_DOCUMENT_NOT_FOUND");
    const legacyReference = `post:${normalizedPostId}`;
    const rows = db
      .prepare(
        `
      SELECT DISTINCT n.*
      FROM graph_nodes n
      WHERE n.source_system = 'markdown'
        AND (
          n.source_reference = ?
          OR EXISTS (
            SELECT 1
            FROM hybrid_rag_documents d
            WHERE d.post_id = ?
              AND (
                (d.document_id <> '' AND n.source_reference = d.document_id)
                OR (d.source_path <> '' AND n.source_reference = d.source_path)
              )
          )
        )
      ORDER BY n.label COLLATE NOCASE, n.id
    `,
      )
      .all(legacyReference, normalizedPostId);
    return hydrateNodeRows(rows);
  },

  // A document relation is allowed to introduce a document to the graph, but
  // the identity must be chosen by the server from the actual Vault/RAG row.
  // That avoids creating a transient `post:<id>` node in the browser which
  // could later diverge from the importer's document_id/source_path binding.
  ensureDocumentNodeForPostId(postId, actor = "SYSTEM_GRAPH") {
    const normalizedPostId = Number(postId);
    if (!Number.isInteger(normalizedPostId) || normalizedPostId < 1) {
      throw graphError("INVALID_GRAPH_DOCUMENT_POST_ID");
    }

    return atomically(() => {
      const post = db
        .prepare(
          `
        SELECT id, slug, title, summary, content_type, visibility
        FROM blog_posts
        WHERE id = ?
      `,
        )
        .get(normalizedPostId);
      if (!post) throw graphError("GRAPH_DOCUMENT_NOT_FOUND");

      const existing = this.listNodesForDocumentPostId(normalizedPostId);
      if (existing.length) {
        return { node: existing[0], created: false, candidates: existing };
      }

      const ragBinding = db
        .prepare(
          `
        SELECT document_id, source_path
        FROM hybrid_rag_documents
        WHERE post_id = ?
        ORDER BY document_id, source_path
        LIMIT 1
      `,
        )
        .get(normalizedPostId);
      const sourceReference = String(
        ragBinding?.document_id || ragBinding?.source_path || `post:${post.id}`,
      ).trim();
      const sameSource = getNodeBySource("markdown", sourceReference);
      if (sameSource) {
        const node = this.getNode(sameSource.id);
        return { node, created: false, candidates: [node] };
      }

      const node = this.createNode(
        {
          node_type: "document",
          label: String(post.title || `Dokumentum #${post.id}`).trim(),
          description: String(post.summary || "").trim(),
          source_system: "markdown",
          source_reference: sourceReference,
          visibility: post.visibility === "public" ? "public" : "private",
          active: true,
          metadata: {
            post_id: Number(post.id),
            slug: String(post.slug || "").trim(),
            content_type: String(post.content_type || "").trim(),
            created_via: "document_relation_composer",
          },
        },
        actor,
      );
      return { node, created: true, candidates: [node] };
    });
  },

  getPublicDocumentBindings(nodeIds = []) {
    return getPublicDocumentBindings(nodeIds);
  },

  getPreviewDocumentBindings(nodeIds = []) {
    return getPreviewDocumentBindings(nodeIds);
  },

  createNode(input, actor = "SYSTEM_GRAPH") {
    return atomically(() => {
      const node = normalizeNodeInput(input);
      if (getNodeRow(node.id)) throw graphError("GRAPH_NODE_ALREADY_EXISTS");
      if (
        node.source_reference &&
        getNodeBySource(node.source_system, node.source_reference)
      ) {
        throw graphError("GRAPH_NODE_SOURCE_CONFLICT");
      }
      const timestamp = nowIso();
      db.prepare(
        `
        INSERT INTO graph_nodes (
          id, node_type, label, description, source_system, source_reference,
          visibility, active, metadata_json, created_by, created_at, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        node.id,
        node.node_type,
        node.label,
        node.description,
        node.source_system,
        node.source_reference,
        node.visibility,
        Number(node.active),
        toJson(node.metadata),
        normalizeActor(actor),
        timestamp,
        normalizeActor(actor),
        timestamp,
      );
      const created = this.getNode(node.id);
      recordAudit({
        action: "CREATE_GRAPH_NODE",
        entity: "graph_nodes",
        entityId: node.id,
        newState: created,
        actor,
      });
      return created;
    });
  },

  updateNode(id, patch, actor = "SYSTEM_GRAPH") {
    return atomically(() => {
      const previous = this.getNode(id);
      const parsedPatch = updateGraphNodeSchema.parse(patch);
      const next = normalizeNodeInput({
        id: previous.id,
        node_type: parsedPatch.node_type ?? previous.node_type,
        label: parsedPatch.label ?? previous.label,
        description: parsedPatch.description ?? previous.description,
        source_system: previous.source_system,
        source_reference: previous.source_reference,
        visibility: parsedPatch.visibility ?? previous.visibility,
        active: parsedPatch.active ?? previous.active,
        metadata: parsedPatch.metadata ?? previous.metadata,
      });
      if (next.node_type !== previous.node_type) {
        const incidentEdges = db
          .prepare(
            `
          SELECT e.source_node_id, e.target_node_id, et.*
          FROM graph_edges e
          JOIN graph_edge_types et ON et.id = e.edge_type_id
          WHERE e.source_node_id = ? OR e.target_node_id = ?
        `,
          )
          .all(previous.id, previous.id)
          .map(mapEdgeType);
        for (const type of incidentEdges) {
          const isSource = type.source_node_id === previous.id;
          const allowed = isSource
            ? type.source_node_types
            : type.target_node_types;
          if (allowed.length && !allowed.includes(next.node_type)) {
            throw graphError("GRAPH_NODE_TYPE_CONSTRAINT_CONFLICT");
          }
        }
      }
      db.prepare(
        `
        UPDATE graph_nodes
        SET node_type = ?, label = ?, description = ?, visibility = ?, active = ?, metadata_json = ?,
            updated_by = ?, updated_at = ?
        WHERE id = ?
      `,
      ).run(
        next.node_type,
        next.label,
        next.description,
        next.visibility,
        Number(next.active),
        toJson(next.metadata),
        normalizeActor(actor),
        nowIso(),
        previous.id,
      );
      const updated = this.getNode(previous.id);
      recordAudit({
        action: "UPDATE_GRAPH_NODE",
        entity: "graph_nodes",
        entityId: previous.id,
        prevState: previous,
        newState: updated,
        actor,
      });
      return updated;
    });
  },

  deleteNode(id, actor = "SYSTEM_GRAPH") {
    return atomically(() => {
      const previous = this.getNode(id);
      const edgeCount = db
        .prepare(
          `
        SELECT COUNT(*) AS count
        FROM graph_edges
        WHERE source_node_id = ? OR target_node_id = ?
      `,
        )
        .get(previous.id, previous.id).count;
      if (Number(edgeCount) > 0) throw graphError("GRAPH_NODE_IN_USE");
      db.prepare("DELETE FROM graph_nodes WHERE id = ?").run(previous.id);
      const result = { success: true, deleted_id: previous.id };
      recordAudit({
        action: "DELETE_GRAPH_NODE",
        entity: "graph_nodes",
        entityId: previous.id,
        prevState: previous,
        newState: result,
        actor,
      });
      return result;
    });
  },

  getEdgeType(idOrSlug) {
    return assertEdgeType(idOrSlug);
  },

  listEdgeTypes({ visibility = "all", includeInactive = false } = {}) {
    const conditions = ["1 = 1"];
    const params = [];
    if (visibility !== "all") {
      conditions.push("visibility = ?");
      params.push(assertVisibility(visibility));
    }
    if (!includeInactive) conditions.push("active = 1");
    return db
      .prepare(
        `
      SELECT * FROM graph_edge_types
      WHERE ${conditions.join(" AND ")}
      ORDER BY label COLLATE NOCASE, id
    `,
      )
      .all(...params)
      .map(mapEdgeType);
  },

  createEdgeType(input, actor = "SYSTEM_GRAPH") {
    return atomically(() => {
      const type = normalizeEdgeTypeInput(input);
      if (getEdgeTypeRow(type.id))
        throw graphError("GRAPH_EDGE_TYPE_ALREADY_EXISTS");
      const slugMatch = db
        .prepare("SELECT id FROM graph_edge_types WHERE slug = ?")
        .get(type.slug);
      if (slugMatch) throw graphError("GRAPH_EDGE_TYPE_SLUG_ALREADY_EXISTS");
      if (
        type.inverse_edge_type_id &&
        !getEdgeTypeRow(type.inverse_edge_type_id)
      ) {
        throw graphError("GRAPH_INVERSE_EDGE_TYPE_NOT_FOUND");
      }
      const timestamp = nowIso();
      db.prepare(
        `
        INSERT INTO graph_edge_types (
          id, slug, label, description, icon_key, color, source_node_types_json, target_node_types_json,
          inverse_edge_type_id, allow_self_loop, default_weight, default_confidence, default_cost,
          visibility, active, metadata_json, created_by, created_at, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      ).run(
        type.id,
        type.slug,
        type.label,
        type.description,
        type.icon_key,
        type.color,
        JSON.stringify(type.source_node_types),
        JSON.stringify(type.target_node_types),
        type.inverse_edge_type_id,
        Number(type.allow_self_loop),
        type.default_weight,
        type.default_confidence,
        type.default_cost,
        type.visibility,
        Number(type.active),
        toJson(type.metadata),
        normalizeActor(actor),
        timestamp,
        normalizeActor(actor),
        timestamp,
      );
      const created = this.getEdgeType(type.id);
      recordAudit({
        action: "CREATE_GRAPH_EDGE_TYPE",
        entity: "graph_edge_types",
        entityId: type.id,
        newState: created,
        actor,
      });
      return created;
    });
  },

  updateEdgeType(idOrSlug, patch, actor = "SYSTEM_GRAPH") {
    return atomically(() => {
      const previous = this.getEdgeType(idOrSlug);
      const parsedPatch = updateGraphEdgeTypeSchema.parse(patch);
      const next = normalizeEdgeTypeInput({
        id: previous.id,
        slug: parsedPatch.slug ?? previous.slug,
        label: parsedPatch.label ?? previous.label,
        description: parsedPatch.description ?? previous.description,
        icon_key: parsedPatch.icon_key ?? previous.icon_key,
        color: parsedPatch.color ?? previous.color,
        source_node_types:
          parsedPatch.source_node_types ?? previous.source_node_types,
        target_node_types:
          parsedPatch.target_node_types ?? previous.target_node_types,
        inverse_edge_type_id:
          parsedPatch.inverse_edge_type_id === undefined
            ? previous.inverse_edge_type_id
            : parsedPatch.inverse_edge_type_id,
        allow_self_loop:
          parsedPatch.allow_self_loop ?? previous.allow_self_loop,
        default_weight: parsedPatch.default_weight ?? previous.default_weight,
        default_confidence:
          parsedPatch.default_confidence ?? previous.default_confidence,
        default_cost: parsedPatch.default_cost ?? previous.default_cost,
        visibility: parsedPatch.visibility ?? previous.visibility,
        active: parsedPatch.active ?? previous.active,
        metadata: parsedPatch.metadata ?? previous.metadata,
      });
      const slugMatch = db
        .prepare("SELECT id FROM graph_edge_types WHERE slug = ?")
        .get(next.slug);
      if (slugMatch && slugMatch.id !== previous.id)
        throw graphError("GRAPH_EDGE_TYPE_SLUG_ALREADY_EXISTS");
      if (
        next.inverse_edge_type_id &&
        !getEdgeTypeRow(next.inverse_edge_type_id)
      ) {
        throw graphError("GRAPH_INVERSE_EDGE_TYPE_NOT_FOUND");
      }
      const existingEdges = db
        .prepare(
          `
        SELECT e.source_node_id, e.target_node_id, source.node_type AS source_node_type, target.node_type AS target_node_type
        FROM graph_edges e
        JOIN graph_nodes source ON source.id = e.source_node_id
        JOIN graph_nodes target ON target.id = e.target_node_id
        WHERE e.edge_type_id = ?
      `,
        )
        .all(previous.id);
      for (const edge of existingEdges) {
        if (
          (!next.allow_self_loop &&
            edge.source_node_id === edge.target_node_id) ||
          (next.source_node_types.length &&
            !next.source_node_types.includes(edge.source_node_type)) ||
          (next.target_node_types.length &&
            !next.target_node_types.includes(edge.target_node_type))
        ) {
          throw graphError("GRAPH_EDGE_TYPE_CONSTRAINT_CONFLICT");
        }
      }
      db.prepare(
        `
        UPDATE graph_edge_types
        SET slug = ?, label = ?, description = ?, icon_key = ?, color = ?, source_node_types_json = ?,
            target_node_types_json = ?, inverse_edge_type_id = ?, allow_self_loop = ?, default_weight = ?,
            default_confidence = ?, default_cost = ?, visibility = ?, active = ?, metadata_json = ?,
            updated_by = ?, updated_at = ?
        WHERE id = ?
      `,
      ).run(
        next.slug,
        next.label,
        next.description,
        next.icon_key,
        next.color,
        JSON.stringify(next.source_node_types),
        JSON.stringify(next.target_node_types),
        next.inverse_edge_type_id,
        Number(next.allow_self_loop),
        next.default_weight,
        next.default_confidence,
        next.default_cost,
        next.visibility,
        Number(next.active),
        toJson(next.metadata),
        normalizeActor(actor),
        nowIso(),
        previous.id,
      );
      const updated = this.getEdgeType(previous.id);
      recordAudit({
        action: "UPDATE_GRAPH_EDGE_TYPE",
        entity: "graph_edge_types",
        entityId: previous.id,
        prevState: previous,
        newState: updated,
        actor,
      });
      return updated;
    });
  },

  deleteEdgeType(idOrSlug, actor = "SYSTEM_GRAPH") {
    return atomically(() => {
      const previous = this.getEdgeType(idOrSlug);
      const references = db
        .prepare(
          `
        SELECT
          (SELECT COUNT(*) FROM graph_edges WHERE edge_type_id = ?) AS edges,
          (SELECT COUNT(*) FROM graph_edge_types WHERE inverse_edge_type_id = ?) AS inverses
      `,
        )
        .get(previous.id, previous.id);
      if (Number(references.edges) || Number(references.inverses))
        throw graphError("GRAPH_EDGE_TYPE_IN_USE");
      db.prepare("DELETE FROM graph_edge_types WHERE id = ?").run(previous.id);
      const result = { success: true, deleted_id: previous.id };
      recordAudit({
        action: "DELETE_GRAPH_EDGE_TYPE",
        entity: "graph_edge_types",
        entityId: previous.id,
        prevState: previous,
        newState: result,
        actor,
      });
      return result;
    });
  },

  addNodeMembership({
    graphId,
    nodeId,
    metadata = {},
    actor = "SYSTEM_GRAPH",
  } = {}) {
    return atomically(() => {
      const graph = assertGraph(graphId);
      const node = assertNode(nodeId);
      const parsedMetadata = graphMembershipSchema.parse({ metadata }).metadata;
      const previous = insertMembership(
        graph.id,
        node.id,
        parsedMetadata,
        actor,
      );
      const membership = db
        .prepare(
          `
        SELECT * FROM graph_node_memberships WHERE graph_id = ? AND node_id = ?
      `,
        )
        .get(graph.id, node.id);
      const result = {
        ...membership,
        metadata: parseJson(membership.metadata_json, {}),
      };
      recordAudit({
        action: previous
          ? "UPDATE_GRAPH_NODE_MEMBERSHIP"
          : "CREATE_GRAPH_NODE_MEMBERSHIP",
        entity: "graph_node_memberships",
        entityId: `${graph.id}:${node.id}`,
        prevState: previous
          ? { ...previous, metadata: parseJson(previous.metadata_json, {}) }
          : null,
        newState: result,
        actor,
      });
      return result;
    });
  },

  removeNodeMembership({ graphId, nodeId, actor = "SYSTEM_GRAPH" } = {}) {
    return atomically(() => {
      const graph = assertGraph(graphId);
      const node = assertNode(nodeId);
      const previous = db
        .prepare(
          `
        SELECT * FROM graph_node_memberships WHERE graph_id = ? AND node_id = ?
      `,
        )
        .get(graph.id, node.id);
      if (!previous) throw graphError("GRAPH_NODE_MEMBERSHIP_NOT_FOUND");
      const edgeCount = db
        .prepare(
          `
        SELECT COUNT(*) AS count
        FROM graph_edge_memberships gem
        JOIN graph_edges e ON e.id = gem.edge_id
        WHERE gem.graph_id = ? AND (e.source_node_id = ? OR e.target_node_id = ?)
      `,
        )
        .get(graph.id, node.id, node.id).count;
      if (Number(edgeCount))
        throw graphError("GRAPH_NODE_MEMBERSHIP_HAS_EDGES");
      db.prepare(
        "DELETE FROM graph_node_memberships WHERE graph_id = ? AND node_id = ?",
      ).run(graph.id, node.id);
      const result = { success: true, deleted_id: `${graph.id}:${node.id}` };
      recordAudit({
        action: "DELETE_GRAPH_NODE_MEMBERSHIP",
        entity: "graph_node_memberships",
        entityId: `${graph.id}:${node.id}`,
        prevState: previous,
        newState: result,
        actor,
      });
      return result;
    });
  },

  addEdgeMembership({
    graphId,
    edgeId,
    metadata = {},
    actor = "SYSTEM_GRAPH",
  } = {}) {
    return atomically(() => {
      const graph = assertGraph(graphId);
      const edge = assertEdge(edgeId);
      assertGraphMembership(graph.id, edge.source_node_id);
      assertGraphMembership(graph.id, edge.target_node_id);
      const parsedMetadata = graphMembershipSchema.parse({ metadata }).metadata;
      insertEdgeMembership(graph.id, edge.id, parsedMetadata, actor);
      const membership = db
        .prepare(
          `
        SELECT * FROM graph_edge_memberships WHERE graph_id = ? AND edge_id = ?
      `,
        )
        .get(graph.id, edge.id);
      const result = {
        ...membership,
        metadata: parseJson(membership.metadata_json, {}),
      };
      recordAudit({
        action: "UPSERT_GRAPH_EDGE_MEMBERSHIP",
        entity: "graph_edge_memberships",
        entityId: `${graph.id}:${edge.id}`,
        newState: result,
        actor,
      });
      return result;
    });
  },

  removeEdgeMembership({ graphId, edgeId, actor = "SYSTEM_GRAPH" } = {}) {
    return atomically(() => {
      const graph = assertGraph(graphId);
      const edge = assertEdge(edgeId);
      const previous = db
        .prepare(
          `
        SELECT * FROM graph_edge_memberships WHERE graph_id = ? AND edge_id = ?
      `,
        )
        .get(graph.id, edge.id);
      if (!previous) throw graphError("GRAPH_EDGE_MEMBERSHIP_NOT_FOUND");
      db.prepare(
        "DELETE FROM graph_edge_memberships WHERE graph_id = ? AND edge_id = ?",
      ).run(graph.id, edge.id);
      const result = { success: true, deleted_id: `${graph.id}:${edge.id}` };
      recordAudit({
        action: "DELETE_GRAPH_EDGE_MEMBERSHIP",
        entity: "graph_edge_memberships",
        entityId: `${graph.id}:${edge.id}`,
        prevState: previous,
        newState: result,
        actor,
      });
      return result;
    });
  },

  createEdge(input, actor = "SYSTEM_GRAPH") {
    return atomically(() => {
      const edge = normalizeEdgeInput(input);
      if (getEdgeRow(edge.id)) throw graphError("GRAPH_EDGE_ALREADY_EXISTS");
      const source = assertNode(edge.source_node_id);
      const target = assertNode(edge.target_node_id);
      const edgeType = assertEdgeType(edge.edge_type_id);
      assertEndpointConstraints({ edgeType, source, target });
      edge.graph_ids = unique(
        edge.graph_ids.map((graphId) => assertGraph(graphId).id),
      );
      for (const graphId of edge.graph_ids) {
        const graph = assertGraph(graphId);
        if (!graph.active) throw graphError("GRAPH_INACTIVE");
        assertGraphMembership(graph.id, source.id);
        assertGraphMembership(graph.id, target.id);
      }

      const inverseTypeId = edge.bidirectional
        ? edge.inverse_edge_type_id ||
          edgeType.inverse_edge_type_id ||
          edgeType.id
        : null;
      const inverseType = inverseTypeId ? assertEdgeType(inverseTypeId) : null;
      if (inverseType)
        assertEndpointConstraints({
          edgeType: inverseType,
          source: target,
          target: source,
        });

      const weight = assertBoundedNumber(edge.weight, {
        fallback: edgeType.default_weight,
        min: 0,
        max: 1,
        code: "INVALID_GRAPH_EDGE_WEIGHT",
      });
      const confidence = assertBoundedNumber(edge.confidence, {
        fallback: edgeType.default_confidence,
        min: 0,
        max: 1,
        code: "INVALID_GRAPH_EDGE_CONFIDENCE",
      });
      const cost = assertBoundedNumber(edge.cost, {
        fallback: edgeType.default_cost,
        min: 0,
        max: 1_000_000,
        code: "INVALID_GRAPH_EDGE_COST",
      });
      const relationGroupId = edge.bidirectional ? generateId("relation") : "";
      const reciprocalId = edge.bidirectional ? generateId("edge") : null;

      insertEdge({
        id: edge.id,
        sourceNodeId: source.id,
        targetNodeId: target.id,
        edgeTypeId: edgeType.id,
        relationGroupId,
        reciprocalRole: "asserted",
        origin: edge.origin,
        projectionSourceKey: edge.projection_source_key,
        provenance: edge.provenance,
        metadata: edge.metadata,
        weight,
        confidence,
        cost,
        validFrom: edge.valid_from,
        validTo: edge.valid_to,
        visibility: edge.visibility,
        active: edge.active,
        actor,
      });
      for (const graphId of edge.graph_ids)
        insertEdgeMembership(graphId, edge.id, {}, actor);

      if (inverseType) {
        const reciprocalProvenance = {
          ...edge.provenance,
          reciprocal_of: edge.id,
          relation_group_id: relationGroupId,
          relation_mode: "actual_bidirectional",
        };
        insertEdge({
          id: reciprocalId,
          sourceNodeId: target.id,
          targetNodeId: source.id,
          edgeTypeId: inverseType.id,
          relationGroupId,
          reciprocalRole: "reciprocal",
          origin: edge.origin,
          projectionSourceKey: edge.projection_source_key,
          provenance: reciprocalProvenance,
          metadata: edge.metadata,
          weight,
          confidence,
          cost,
          validFrom: edge.valid_from,
          validTo: edge.valid_to,
          visibility: edge.visibility,
          active: edge.active,
          actor,
        });
        for (const graphId of edge.graph_ids)
          insertEdgeMembership(graphId, reciprocalId, {}, actor);
        db.prepare(
          `
          UPDATE graph_edges SET reciprocal_edge_id = ?, updated_by = ?, updated_at = ? WHERE id = ?
        `,
        ).run(reciprocalId, normalizeActor(actor), nowIso(), edge.id);
        db.prepare(
          `
          UPDATE graph_edges SET reciprocal_edge_id = ?, updated_by = ?, updated_at = ? WHERE id = ?
        `,
        ).run(edge.id, normalizeActor(actor), nowIso(), reciprocalId);
      }

      const created = getHydratedEdge(edge.id);
      const reciprocal = reciprocalId ? getHydratedEdge(reciprocalId) : null;
      const result = {
        edge: created,
        reciprocal_edge: reciprocal,
        relation_group_id: relationGroupId || null,
      };
      recordAudit({
        action: "CREATE_GRAPH_EDGE",
        entity: "graph_edges",
        entityId: edge.id,
        newState: result,
        actor,
      });
      return result;
    });
  },

  getEdge(id) {
    return getHydratedEdge(id);
  },

  listEdges({
    graphId = null,
    visibility = "all",
    includeInactive = false,
    limit = 250,
  } = {}) {
    const conditions = ["1 = 1"];
    const params = [];
    let membershipJoin = "";
    if (graphId) {
      membershipJoin =
        "JOIN graph_edge_memberships selected_membership ON selected_membership.edge_id = e.id";
      conditions.push("selected_membership.graph_id = ?");
      params.push(assertGraph(graphId).id);
    }
    if (visibility !== "all") {
      conditions.push("e.visibility = ?");
      params.push(assertVisibility(visibility));
      conditions.push(
        "source.visibility = ?",
        "target.visibility = ?",
        "et.visibility = ?",
      );
      params.push(visibility, visibility, visibility);
    }
    if (!includeInactive) {
      conditions.push(
        "e.active = 1",
        "source.active = 1",
        "target.active = 1",
        "et.active = 1",
      );
    }
    const safeLimit = Math.max(1, Math.min(Number(limit) || 250, 500));
    const rows = db
      .prepare(
        `
      ${EDGE_SELECT}
      ${membershipJoin}
      WHERE ${conditions.join(" AND ")}
      ORDER BY e.created_at DESC, e.id
      LIMIT ?
    `,
      )
      .all(...params, safeLimit);
    return hydrateEdgeRows(rows);
  },

  updateEdge(id, patch, actor = "SYSTEM_GRAPH") {
    return atomically(() => {
      const previous = this.getEdge(id);
      const parsedPatch = updateGraphEdgeSchema.parse(patch);
      const window = normalizeWindow(
        parsedPatch.valid_from === undefined
          ? previous.valid_from
          : parsedPatch.valid_from,
        parsedPatch.valid_to === undefined
          ? previous.valid_to
          : parsedPatch.valid_to,
      );
      const next = {
        provenance: parsedPatch.provenance ?? previous.provenance,
        metadata: parsedPatch.metadata ?? previous.metadata,
        weight: assertBoundedNumber(parsedPatch.weight, {
          fallback: previous.weight,
          min: 0,
          max: 1,
          code: "INVALID_GRAPH_EDGE_WEIGHT",
        }),
        confidence: assertBoundedNumber(parsedPatch.confidence, {
          fallback: previous.confidence,
          min: 0,
          max: 1,
          code: "INVALID_GRAPH_EDGE_CONFIDENCE",
        }),
        cost: assertBoundedNumber(parsedPatch.cost, {
          fallback: previous.cost,
          min: 0,
          max: 1_000_000,
          code: "INVALID_GRAPH_EDGE_COST",
        }),
        ...window,
        visibility: assertVisibility(
          parsedPatch.visibility,
          previous.visibility,
        ),
        active:
          parsedPatch.active === undefined
            ? previous.active
            : Boolean(parsedPatch.active),
      };
      db.prepare(
        `
        UPDATE graph_edges
        SET provenance_json = ?, metadata_json = ?, weight = ?, confidence = ?, cost = ?, valid_from = ?, valid_to = ?,
            visibility = ?, active = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
      `,
      ).run(
        toJson(next.provenance),
        toJson(next.metadata),
        next.weight,
        next.confidence,
        next.cost,
        next.valid_from,
        next.valid_to,
        next.visibility,
        Number(next.active),
        normalizeActor(actor),
        nowIso(),
        previous.id,
      );
      const updated = this.getEdge(previous.id);
      recordAudit({
        action: "UPDATE_GRAPH_EDGE",
        entity: "graph_edges",
        entityId: previous.id,
        prevState: previous,
        newState: updated,
        actor,
      });
      return updated;
    });
  },

  deleteEdge(id, actor = "SYSTEM_GRAPH") {
    return atomically(() => {
      const previous = this.getEdge(id);
      const related = previous.relation_group_id
        ? hydrateEdgeRows(
            db
              .prepare(`${EDGE_SELECT} WHERE e.relation_group_id = ?`)
              .all(previous.relation_group_id),
          )
        : [previous];
      if (previous.relation_group_id) {
        db.prepare("DELETE FROM graph_edges WHERE relation_group_id = ?").run(
          previous.relation_group_id,
        );
      } else {
        db.prepare("DELETE FROM graph_edges WHERE id = ?").run(previous.id);
      }
      const result = {
        success: true,
        deleted_id: previous.id,
        relation_group_id: previous.relation_group_id || null,
        deleted_edge_ids: related.map((edge) => edge.id),
        // The DB mutation is complete by the time an admin route sees this.
        // Keep enough endpoint/provenance context for best-effort Markdown
        // projection without reopening a deleted row.
        deleted_edges: related,
      };
      recordAudit({
        action: "DELETE_GRAPH_EDGE",
        entity: "graph_edges",
        entityId: previous.id,
        prevState: related,
        newState: result,
        actor,
      });
      return result;
    });
  },

  traverseGraph(graphId, query, { visibility = "private" } = {}) {
    const graph = assertGraph(graphId);
    const ast = graphTraversalSchema.parse(query);
    if (!["public", "private", "all"].includes(visibility))
      throw graphError("INVALID_GRAPH_VISIBILITY_SCOPE");
    const isPublic = visibility === "public";
    if (isPublic && (!graph.active || graph.visibility !== "public"))
      throw graphError("PUBLIC_GRAPH_NOT_FOUND");
    const asOf = normalizeTime(
      ast.as_of || nowIso(),
      "INVALID_GRAPH_TRAVERSAL_AS_OF",
    );
    const startIds = unique(ast.start_node_ids).map((value) =>
      assertId(value, "INVALID_GRAPH_NODE_ID"),
    );
    if (startIds.length > ast.max_nodes) {
      throw graphError("GRAPH_TRAVERSAL_START_LIMIT_EXCEEDED", {
        start_nodes: startIds.length,
        max_nodes: ast.max_nodes,
      });
    }
    const startNodeTypeClause = ast.node_types.length
      ? `AND n.node_type IN (${ast.node_types.map(() => "?").join(", ")})`
      : "";
    const startRows = db
      .prepare(
        `
      SELECT n.*
      FROM graph_nodes n
      JOIN graph_node_memberships gm ON gm.node_id = n.id
      WHERE gm.graph_id = ?
        AND n.id IN (${startIds.map(() => "?").join(", ")})
        ${startNodeTypeClause}
        AND (? = 0 OR (n.visibility = 'public' AND n.active = 1))
    `,
      )
      .all(graph.id, ...startIds, ...ast.node_types, Number(isPublic));
    if (startRows.length !== startIds.length) {
      throw graphError(
        isPublic
          ? "PUBLIC_GRAPH_START_NODE_NOT_FOUND"
          : "GRAPH_START_NODE_NOT_MEMBER",
      );
    }

    const nodeById = new Map(
      startRows.map((row) => [row.id, { ...mapNode(row), distance: 0 }]),
    );
    const witnessByNodeId = new Map(
      startRows.map((row) => [row.id, { node_ids: [row.id], edge_ids: [] }]),
    );
    const edgeById = new Map();
    let frontier = startRows.map((row) => row.id);
    let truncated = false;

    for (let depth = 0; depth < ast.max_depth && frontier.length; depth += 1) {
      const branchConditions = [];
      const branchParams = [];
      const placeholders = frontier.map(() => "?").join(", ");
      if (ast.direction === "outbound") {
        branchConditions.push(`e.source_node_id IN (${placeholders})`);
        branchParams.push(...frontier);
      } else if (ast.direction === "inbound") {
        branchConditions.push(`e.target_node_id IN (${placeholders})`);
        branchParams.push(...frontier);
      } else {
        branchConditions.push(
          `(e.source_node_id IN (${placeholders}) OR e.target_node_id IN (${placeholders}))`,
        );
        branchParams.push(...frontier, ...frontier);
      }
      const conditions = [
        "gem.graph_id = ?",
        "e.active = 1",
        "source.active = 1",
        "target.active = 1",
        "et.active = 1",
        "e.confidence >= ?",
        "(e.valid_from IS NULL OR datetime(e.valid_from) <= datetime(?))",
        "(e.valid_to IS NULL OR datetime(e.valid_to) >= datetime(?))",
        ...branchConditions,
      ];
      const params = [
        graph.id,
        ast.min_confidence,
        asOf,
        asOf,
        ...branchParams,
      ];
      if (ast.edge_type_ids.length) {
        conditions.push(
          `e.edge_type_id IN (${ast.edge_type_ids.map(() => "?").join(", ")})`,
        );
        params.push(...ast.edge_type_ids);
      }
      if (ast.node_types.length) {
        conditions.push(
          `source.node_type IN (${ast.node_types.map(() => "?").join(", ")})`,
        );
        conditions.push(
          `target.node_type IN (${ast.node_types.map(() => "?").join(", ")})`,
        );
        params.push(...ast.node_types, ...ast.node_types);
      }
      if (ast.origins.length) {
        conditions.push(
          `e.origin IN (${ast.origins.map(() => "?").join(", ")})`,
        );
        params.push(...ast.origins);
      }
      if (isPublic) {
        conditions.push(
          "e.visibility = 'public'",
          "source.visibility = 'public'",
          "target.visibility = 'public'",
          "et.visibility = 'public'",
        );
      }
      const rows = db
        .prepare(
          `
        ${EDGE_SELECT}
        JOIN graph_edge_memberships gem ON gem.edge_id = e.id
        WHERE ${conditions.join(" AND ")}
        ORDER BY e.created_at ASC, e.id ASC
      `,
        )
        .all(...params);
      const memberships = getEdgeMembershipRows(rows.map((row) => row.id));
      const nextFrontier = [];
      const currentFrontier = new Set(frontier);
      for (const row of rows) {
        const candidates = [];
        if (
          (ast.direction === "outbound" || ast.direction === "both") &&
          currentFrontier.has(row.source_node_id)
        ) {
          candidates.push({
            from: row.source_node_id,
            to: row.target_node_id,
            direction: "outbound",
            node: nodeRowFromEdge(row, "target"),
          });
        }
        if (
          (ast.direction === "inbound" || ast.direction === "both") &&
          currentFrontier.has(row.target_node_id)
        ) {
          candidates.push({
            from: row.target_node_id,
            to: row.source_node_id,
            direction: "inbound",
            node: nodeRowFromEdge(row, "source"),
          });
        }
        for (const candidate of candidates) {
          const known = nodeById.has(candidate.to);
          if (!known && nodeById.size >= ast.max_nodes) {
            truncated = true;
            continue;
          }
          if (!known) {
            const parentPath = witnessByNodeId.get(candidate.from);
            nodeById.set(candidate.to, {
              ...candidate.node,
              distance: depth + 1,
            });
            witnessByNodeId.set(candidate.to, {
              node_ids: [...parentPath.node_ids, candidate.to],
              edge_ids: [...parentPath.edge_ids, row.id],
            });
            nextFrontier.push(candidate.to);
          }
          const existingEdge = edgeById.get(row.id);
          const directionSet = existingEdge?.traversal_directions || new Set();
          directionSet.add(candidate.direction);
          edgeById.set(row.id, {
            ...mapEdge(row, memberships.get(row.id) || []),
            traversal_directions: directionSet,
          });
        }
      }
      frontier = unique(nextFrontier);
      if (nodeById.size >= ast.max_nodes && frontier.length) truncated = true;
    }

    // Traversal collects endpoint details cheaply while walking.  Hydrate the
    // final finite result in one batch so consumers can see every M:N graph
    // membership without turning a graph traversal into an N+1 query.
    const distanceByNodeId = new Map(
      [...nodeById.entries()].map(([id, node]) => [id, node.distance]),
    );
    const nodes = getHydratedNodesByIds([...nodeById.keys()])
      .map((node) => ({
        ...node,
        distance: distanceByNodeId.get(node.id) ?? 0,
      }))
      .sort(
        (a, b) => a.distance - b.distance || a.label.localeCompare(b.label),
      );
    const edges = [...edgeById.values()].map((edge) => ({
      ...edge,
      traversal_directions: [...edge.traversal_directions],
    }));
    const paths = [...witnessByNodeId.entries()]
      .filter(([nodeId]) => !startIds.includes(nodeId))
      .map(([node_id, witness]) => ({ node_id, ...witness }));
    return {
      graph,
      query: { ...ast, as_of: asOf, graph_id: graph.id, visibility },
      nodes,
      edges,
      paths,
      truncated,
    };
  },

  /**
   * The Markdown projection importer owns only `origin=markdown_projection`
   * rows with this source key.  It deliberately cannot delete admin, SQL or
   * ordinary wikilink-import arcs.
   *
   * `authoring_relations` accepts a normalized CA:RELATIONS input such as:
   * { graph_ids: ['project/prj-2026-884'], relation_type: 'depends_on',
   *   target_document_id: 'TASK-004', direction: 'outbound' }
   * `target_node_id` is preferred when it is known; unresolved `target` values
   * become stable `markdown_reference` nodes until a richer resolver maps them.
   */
  syncMarkdownProjectionForPost({
    post = {},
    documentId = "",
    sourcePath = "",
    frontmatter = {},
    systemRelations = [],
    authoringRelations = null,
    authoring_relations = null,
    actor = "VAULT_MARKDOWN_PROJECTION",
  } = {}) {
    return atomically(() => {
      const sourceReference = assertText(
        documentId || sourcePath || (post.id ? `post:${post.id}` : ""),
        "GRAPH_PROJECTION_SOURCE_REQUIRED",
        1_024,
      );
      const sourceLabel = assertText(
        post.title || frontmatter?.title || documentId || sourcePath,
        "GRAPH_PROJECTION_SOURCE_LABEL",
        240,
      );
      const sourceVisibility =
        post.visibility === "public" && Number(post.published ?? 1) === 1
          ? "public"
          : "private";
      const sourceNodeType = assertId(
        frontmatter?.ca_node_type || "document",
        "INVALID_GRAPH_NODE_TYPE",
      );
      const frontmatterGraphRefs = Array.isArray(frontmatter?.ca_graph_refs)
        ? frontmatter.ca_graph_refs
        : frontmatter?.ca_graph_refs
          ? [frontmatter.ca_graph_refs]
          : [];
      const defaultGraphIds = unique(frontmatterGraphRefs).map((value) =>
        assertId(value),
      );
      // `systemRelations` is retained as a compatibility alias while the vault
      // parser moves to the unambiguous CA:RELATIONS name.  CA:SYSTEM is a
      // rendered DB mirror and is intentionally never read as graph authority.
      const relations = Array.isArray(authoring_relations)
        ? authoring_relations
        : Array.isArray(authoringRelations)
          ? authoringRelations
          : Array.isArray(systemRelations)
            ? systemRelations
            : [];

      const normalizedRelations = relations.map((relation, index) => {
        if (
          !relation ||
          typeof relation !== "object" ||
          Array.isArray(relation)
        ) {
          throw graphError("INVALID_GRAPH_MARKDOWN_RELATION", { index });
        }
        const explicitGraphIds =
          relation.graph_ids ??
          relation.graphIds ??
          (relation.graph_id ? [relation.graph_id] : null);
        const relationGraphIds = unique(
          Array.isArray(explicitGraphIds)
            ? explicitGraphIds
            : explicitGraphIds
              ? [explicitGraphIds]
              : defaultGraphIds,
        ).map((value) => assertId(value));
        if (!relationGraphIds.length)
          throw graphError("GRAPH_PROJECTION_GRAPH_REQUIRED", { index });
        const relationType = String(
          relation.edge_type_id ||
            relation.edge_type ||
            relation.relation_type ||
            "",
        ).trim();
        if (!relationType)
          throw graphError("GRAPH_PROJECTION_EDGE_TYPE_REQUIRED", { index });
        const direction = String(relation.direction || "outbound").trim();
        if (!["outbound", "inbound", "both"].includes(direction))
          throw graphError("INVALID_GRAPH_MARKDOWN_DIRECTION", { index });
        const targetNodeId =
          relation.target_node_id || relation.targetNodeId || null;
        const targetDocumentId =
          relation.target_document_id || relation.targetDocumentId || null;
        const targetReference = String(
          relation.target_reference ||
            relation.target ||
            relation.wikilink ||
            "",
        ).trim();
        if (!targetNodeId && !targetDocumentId && !targetReference) {
          throw graphError("GRAPH_PROJECTION_TARGET_REQUIRED", { index });
        }
        return {
          graph_ids: relationGraphIds,
          edge_type_id: relationType,
          inverse_edge_type_id:
            relation.inverse_edge_type_id ||
            relation.inverseEdgeTypeId ||
            undefined,
          direction,
          bidirectional:
            Boolean(relation.bidirectional) || direction === "both",
          target_node_id: targetNodeId
            ? assertId(targetNodeId, "INVALID_GRAPH_NODE_ID")
            : null,
          target_document_id: targetDocumentId
            ? assertText(
                targetDocumentId,
                "INVALID_GRAPH_TARGET_DOCUMENT_ID",
                1_024,
              )
            : null,
          target_reference: targetReference,
          target_label: String(
            relation.target_label ||
              relation.targetLabel ||
              targetDocumentId ||
              targetReference ||
              "",
          ).trim(),
          target_node_type: assertId(
            relation.target_node_type || relation.targetNodeType || "document",
            "INVALID_GRAPH_NODE_TYPE",
          ),
          weight: relation.weight,
          confidence: relation.confidence,
          cost: relation.cost,
          valid_from: relation.valid_from || relation.validFrom || undefined,
          valid_to: relation.valid_to || relation.validTo || undefined,
          visibility: relation.visibility || sourceVisibility,
          provenance:
            relation.provenance &&
            typeof relation.provenance === "object" &&
            !Array.isArray(relation.provenance)
              ? relation.provenance
              : {},
          metadata:
            relation.metadata &&
            typeof relation.metadata === "object" &&
            !Array.isArray(relation.metadata)
              ? relation.metadata
              : {},
        };
      });

      // Validate all DB-owned vocabulary before removing the prior projection.
      for (const relation of normalizedRelations) {
        relation.graph_ids = unique(
          relation.graph_ids.map((graphId) => assertGraph(graphId).id),
        );
        assertEdgeType(relation.edge_type_id);
        if (relation.inverse_edge_type_id)
          assertEdgeType(relation.inverse_edge_type_id);
      }

      let source = getNodeBySource("markdown", sourceReference);
      if (!source) {
        source = this.createNode(
          {
            node_type: sourceNodeType,
            label: sourceLabel,
            description: "",
            source_system: "markdown",
            source_reference: sourceReference,
            visibility: sourceVisibility,
            active: true,
            metadata: {
              document_id: documentId || null,
              source_path: sourcePath || null,
              post_id: post.id || null,
            },
          },
          actor,
        );
      } else {
        source = this.updateNode(
          source.id,
          {
            node_type: sourceNodeType,
            label: sourceLabel,
            visibility: sourceVisibility,
            active: true,
            metadata: {
              document_id: documentId || null,
              source_path: sourcePath || null,
              post_id: post.id || null,
            },
          },
          actor,
        );
      }

      const allGraphIds = unique(
        normalizedRelations
          .flatMap((relation) => relation.graph_ids)
          .concat(defaultGraphIds),
      ).map((graphId) => assertGraph(graphId).id);
      for (const graphId of allGraphIds) {
        assertGraph(graphId);
        insertMembership(
          graphId,
          source.id,
          { origin: "markdown_projection", source_key: sourceReference },
          actor,
        );
      }

      const previousRows = db
        .prepare(
          `
        SELECT id, relation_group_id
        FROM graph_edges
        WHERE origin = 'markdown_projection' AND projection_source_key = ?
      `,
        )
        .all(sourceReference);
      // Cascading memberships are handled by the edge FK.  Since a projection
      // pair uses the same source key for both arcs, this removes its complete
      // relation group without touching manually authored arcs.
      db.prepare(
        `
        DELETE FROM graph_edges
        WHERE origin = 'markdown_projection' AND projection_source_key = ?
      `,
      ).run(sourceReference);

      const created = [];
      for (const relation of normalizedRelations) {
        let target;
        if (relation.target_node_id) {
          target = this.getNode(relation.target_node_id);
        } else {
          const targetSystem = relation.target_document_id
            ? "markdown"
            : "markdown_reference";
          const targetReference =
            relation.target_document_id || relation.target_reference;
          target = getNodeBySource(targetSystem, targetReference);
          if (!target) {
            const targetLabel =
              relation.target_label
                .replace(/^\[\[/, "")
                .replace(/\]\]$/, "")
                .split("|")[0]
                .trim() || targetReference;
            target = this.createNode(
              {
                node_type: relation.target_node_type,
                label: targetLabel,
                description: "",
                source_system: targetSystem,
                source_reference: targetReference,
                visibility: relation.visibility,
                active: true,
                metadata: {
                  projection_placeholder: targetSystem === "markdown_reference",
                },
              },
              actor,
            );
          }
        }
        for (const graphId of relation.graph_ids) {
          insertMembership(
            graphId,
            target.id,
            { origin: "markdown_projection", source_key: sourceReference },
            actor,
          );
        }
        const outbound = relation.direction !== "inbound";
        const result = this.createEdge(
          {
            source_node_id: outbound ? source.id : target.id,
            target_node_id: outbound ? target.id : source.id,
            edge_type_id: relation.edge_type_id,
            graph_ids: relation.graph_ids,
            bidirectional: relation.bidirectional,
            inverse_edge_type_id: relation.inverse_edge_type_id,
            origin: "markdown_projection",
            projection_source_key: sourceReference,
            provenance: {
              ...relation.provenance,
              projection: "ca_relations",
              document_id: documentId || null,
              source_path: sourcePath || null,
              source_post_id: post.id || null,
            },
            metadata: relation.metadata,
            weight: relation.weight,
            confidence: relation.confidence,
            cost: relation.cost,
            valid_from: relation.valid_from,
            valid_to: relation.valid_to,
            visibility: relation.visibility,
            active: true,
          },
          actor,
        );
        created.push(result);
      }
      const result = {
        source_node: this.getNode(source.id),
        source_key: sourceReference,
        removed_edge_ids: previousRows.map((row) => row.id),
        created_edges: created.flatMap((item) => [
          item.edge,
          ...(item.reciprocal_edge ? [item.reciprocal_edge] : []),
        ]),
      };
      recordAudit({
        action: "SYNC_MARKDOWN_GRAPH_PROJECTION",
        entity: "graph_edges",
        entityId: sourceReference,
        prevState: previousRows,
        newState: result,
        actor,
      });
      return result;
    });
  },

  /**
   * DB → Markdown renderer contract.  It returns every graph-owned relation
   * incident to a Markdown source node, with its direction relative to that
   * node, graph memberships and a stable target reference where available.
   */
  listMarkdownProjectionRelations({
    post = {},
    documentId = "",
    sourcePath = "",
    sourceNodeId = "",
    includeInactive = false,
  } = {}) {
    let source = null;
    if (sourceNodeId) source = this.getNode(sourceNodeId);
    if (!source) {
      const candidateReferences = unique([
        documentId,
        sourcePath,
        post.id ? `post:${post.id}` : "",
      ]);
      for (const reference of candidateReferences) {
        try {
          source = getNodeBySource("markdown", reference);
        } catch {
          source = null;
        }
        if (source) break;
      }
    }
    if (!source) return { source_node: null, relations: [] };
    const conditions = ["(e.source_node_id = ? OR e.target_node_id = ?)"];
    const params = [source.id, source.id];
    if (!includeInactive) conditions.push("e.active = 1");
    const rows = db
      .prepare(
        `
      ${EDGE_SELECT}
      WHERE ${conditions.join(" AND ")}
      ORDER BY e.created_at ASC, e.id ASC
    `,
      )
      .all(...params);
    const edges = hydrateEdgeRows(rows);
    return {
      source_node: this.getNode(source.id),
      relations: edges.map((edge) => {
        const outbound = edge.source_node_id === source.id;
        const counterpart = outbound
          ? {
              node_id: edge.target_node_id,
              label: edge.target_label,
              node_type: edge.target_node_type,
              source_system: edge.target_system,
              source_reference: edge.target_reference,
              metadata: edge.target_metadata,
            }
          : {
              node_id: edge.source_node_id,
              label: edge.source_label,
              node_type: edge.source_node_type,
              source_system: edge.source_system,
              source_reference: edge.source_reference,
              metadata: edge.source_metadata,
            };
        return {
          edge_id: edge.id,
          relation_group_id: edge.relation_group_id || null,
          reciprocal_edge_id: edge.reciprocal_edge_id || null,
          reciprocal_role: edge.reciprocal_role,
          direction: outbound ? "outbound" : "inbound",
          edge_type: {
            id: edge.edge_type_id,
            slug: edge.edge_type_slug,
            label: edge.edge_type_label,
            inverse_edge_type_id: edge.edge_type_inverse_edge_type_id || null,
            icon_key: edge.edge_type_icon_key,
            color: edge.edge_type_color,
          },
          target: counterpart,
          graph_memberships: edge.graph_memberships,
          graph_ids: edge.graph_ids,
          origin: edge.origin,
          projection_source_key: edge.projection_source_key,
          weight: edge.weight,
          confidence: edge.confidence,
          cost: edge.cost,
          valid_from: edge.valid_from,
          valid_to: edge.valid_to,
          visibility: edge.visibility,
          active: edge.active,
          provenance: edge.provenance,
          metadata: edge.metadata,
        };
      }),
    };
  },
};
