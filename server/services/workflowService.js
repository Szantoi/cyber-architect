import crypto from 'node:crypto';

import { db, initDatabase } from '../db.js';
import {
  createWorkflowDefinitionSchema,
  createWorkflowVersionSchema,
  lifecycleWorkflowInstanceSchema,
  startWorkflowInstanceSchema,
  transitionWorkflowInstanceSchema,
  workflowActorSchema,
  workflowContextSchema,
  workflowGuardSchema,
  workflowInstanceListQuerySchema,
  workflowListQuerySchema
} from '../schemas/workflow.schema.js';
import { graphService } from './graphService.js';
import { evaluateWorkflowGuard } from './workflowGuardEvaluator.js';

// Direct consumers include the admin routes and test harness. Ensure every
// service import sees the same initialized, additive schema as graphService.
initDatabase();

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{1,159}$/;

function nowIso() {
  return new Date().toISOString();
}

function workflowError(code, details = null) {
  const error = new Error(code);
  if (details !== null) error.details = details;
  return error;
}

function normalizeId(value, code = 'INVALID_WORKFLOW_ID') {
  const normalized = String(value || '').trim();
  if (!ID_PATTERN.test(normalized)) throw workflowError(code);
  return normalized;
}

function normalizeActor(actor, fallback = 'SYSTEM_WORKFLOW') {
  if (actor && typeof actor === 'object' && !Array.isArray(actor)) {
    return workflowActorSchema.parse(actor);
  }
  return workflowActorSchema.parse({
    type: 'human',
    id: String(actor || fallback).trim() || fallback,
    label: ''
  });
}

function auditActor(actor) {
  return `${actor.type}:${actor.id}`.slice(0, 160);
}

function parseJson(value, fallback = {}) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function toJson(value) {
  return JSON.stringify(value ?? {});
}

function asBoolean(value) {
  return Number(value) === 1;
}

function generateId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

let savepointSequence = 0;

function atomically(callback) {
  if (!db.inTransaction) return db.transaction(callback)();

  const savepoint = `workflow_service_${++savepointSequence}`;
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

function recordAudit({ action, entity, entityId = null, prevState = null, newState = null, actor }) {
  db.prepare(`
    INSERT INTO audit_logs (action, entity, entity_id, prev_state, new_state, actor, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(action).slice(0, 120),
    String(entity).slice(0, 120),
    entityId === null ? null : String(entityId).slice(0, 240),
    prevState === null ? null : JSON.stringify(prevState),
    newState === null ? null : JSON.stringify(newState),
    auditActor(actor),
    nowIso()
  );
}

function mapDefinition(row) {
  if (!row) return null;
  const {
    published_version: publishedVersion,
    ...definition
  } = row;
  return {
    ...definition,
    active: asBoolean(row.active),
    latest_version: Number(row.latest_version),
    published_version_number: publishedVersion === null || publishedVersion === undefined
      ? null
      : Number(publishedVersion)
  };
}

function mapVersion(row) {
  if (!row) return null;
  return {
    ...row,
    version_number: Number(row.version_number),
    max_total_steps: Number(row.max_total_steps),
    metadata: parseJson(row.metadata_json, {})
  };
}

function mapStep(row) {
  if (!row) return null;
  return {
    ...row,
    sort_order: Number(row.sort_order),
    metadata: parseJson(row.metadata_json, {})
  };
}

function mapTransition(row) {
  if (!row) return null;
  return {
    ...row,
    guard: row.guard_json ? parseJson(row.guard_json, null) : null,
    allowed_actor_types: parseJson(row.allowed_actor_types_json, []),
    max_iterations: row.max_iterations === null || row.max_iterations === undefined
      ? null
      : Number(row.max_iterations),
    evidence_required: asBoolean(row.evidence_required),
    sort_order: Number(row.sort_order),
    metadata: parseJson(row.metadata_json, {})
  };
}

function mapInstance(row) {
  if (!row) return null;
  return {
    ...row,
    step_count: Number(row.step_count),
    context: parseJson(row.context_json, {})
  };
}

function mapEvent(row) {
  if (!row) return null;
  return {
    ...row,
    sequence: Number(row.sequence),
    evidence: parseJson(row.evidence_json, []),
    context_patch: parseJson(row.context_patch_json, {}),
    metadata: parseJson(row.metadata_json, {})
  };
}

function getDefinitionRow(idOrSlug) {
  const value = String(idOrSlug || '').trim();
  if (!value) return null;
  return db.prepare(`
    SELECT *
    FROM workflow_definitions
    WHERE id = ? OR slug = ?
    ORDER BY CASE WHEN id = ? THEN 0 ELSE 1 END
    LIMIT 1
  `).get(value, value, value) || null;
}

function requireDefinition(idOrSlug) {
  const row = getDefinitionRow(idOrSlug);
  if (!row) throw workflowError('WORKFLOW_NOT_FOUND');
  return row;
}

function getVersionRow(workflowId, versionNumber) {
  return db.prepare(`
    SELECT *
    FROM workflow_versions
    WHERE workflow_id = ? AND version_number = ?
  `).get(workflowId, Number(versionNumber)) || null;
}

function requireVersion(workflowId, versionNumber) {
  const row = getVersionRow(workflowId, versionNumber);
  if (!row) throw workflowError('WORKFLOW_VERSION_NOT_FOUND');
  return row;
}

function getVersionRows(workflowId) {
  return db.prepare(`
    SELECT *
    FROM workflow_versions
    WHERE workflow_id = ?
    ORDER BY version_number DESC
  `).all(workflowId);
}

function getStepRows(versionId) {
  return db.prepare(`
    SELECT *
    FROM workflow_steps
    WHERE workflow_version_id = ?
    ORDER BY sort_order ASC, step_key ASC
  `).all(versionId);
}

function getTransitionRows(versionId) {
  return db.prepare(`
    SELECT t.*,
           source.step_key AS source_step_key,
           source.step_type AS source_step_type,
           source.label AS source_step_label,
           target.step_key AS target_step_key,
           target.step_type AS target_step_type,
           target.label AS target_step_label
    FROM workflow_transitions t
    JOIN workflow_steps source ON source.id = t.source_step_id
    JOIN workflow_steps target ON target.id = t.target_step_id
    WHERE t.workflow_version_id = ?
    ORDER BY t.sort_order ASC, t.id ASC
  `).all(versionId);
}

function getAvailableTransitions(versionId, sourceStepId) {
  return db.prepare(`
    SELECT t.*,
           source.step_key AS source_step_key,
           source.step_type AS source_step_type,
           source.label AS source_step_label,
           target.step_key AS target_step_key,
           target.step_type AS target_step_type,
           target.label AS target_step_label
    FROM workflow_transitions t
    JOIN workflow_steps source ON source.id = t.source_step_id
    JOIN workflow_steps target ON target.id = t.target_step_id
    WHERE t.workflow_version_id = ? AND t.source_step_id = ?
    ORDER BY t.sort_order ASC, t.id ASC
  `).all(versionId, sourceStepId).map(row => {
    const transition = mapTransition(row);
    return {
      ...transition,
      target_step: {
        id: transition.target_step_id,
        key: transition.target_step_key,
        type: transition.target_step_type,
        label: transition.target_step_label
      }
    };
  });
}

function hydrateVersion(versionRow) {
  const version = mapVersion(versionRow);
  return {
    ...version,
    steps: getStepRows(version.id).map(mapStep),
    transitions: getTransitionRows(version.id).map(mapTransition)
  };
}

function requireGraph(graphId) {
  const id = normalizeId(graphId, 'INVALID_WORKFLOW_GRAPH_ID');
  try {
    const graph = graphService.getGraph(id);
    if (!graph.active) throw workflowError('WORKFLOW_GRAPH_INACTIVE');
    return graph;
  } catch (error) {
    if (error?.message === 'WORKFLOW_GRAPH_INACTIVE') throw error;
    throw workflowError('WORKFLOW_GRAPH_NOT_FOUND');
  }
}

function normalizeVersionDraft(input) {
  const parsed = createWorkflowVersionSchema.parse(input);
  const seenKeys = new Set();
  const steps = parsed.steps.map((step, index) => {
    if (seenKeys.has(step.key)) {
      throw workflowError('WORKFLOW_DUPLICATE_STEP_KEY', { step_key: step.key });
    }
    seenKeys.add(step.key);
    return { ...step, sort_order: step.sort_order ?? index };
  });
  const byKey = new Map(steps.map(step => [step.key, step]));
  const starts = steps.filter(step => step.type === 'start');
  const ends = steps.filter(step => step.type === 'end');
  if (starts.length !== 1) {
    throw workflowError('WORKFLOW_START_STEP_REQUIRED', { found: starts.length });
  }
  if (!ends.length) throw workflowError('WORKFLOW_END_STEP_REQUIRED');

  const transitions = parsed.transitions.map((transition, index) => {
    if (!byKey.has(transition.source_step_key) || !byKey.has(transition.target_step_key)) {
      throw workflowError('WORKFLOW_TRANSITION_STEP_NOT_FOUND', {
        source_step_key: transition.source_step_key,
        target_step_key: transition.target_step_key
      });
    }
    return {
      ...transition,
      allowed_actor_types: [...new Set(transition.allowed_actor_types)],
      sort_order: transition.sort_order ?? index
    };
  });

  const startKey = starts[0].key;
  const incomingByKey = new Map(steps.map(step => [step.key, 0]));
  const outgoingByKey = new Map(steps.map(step => [step.key, []]));
  for (const transition of transitions) {
    incomingByKey.set(transition.target_step_key, incomingByKey.get(transition.target_step_key) + 1);
    outgoingByKey.get(transition.source_step_key).push(transition.target_step_key);
  }
  if (incomingByKey.get(startKey) > 0) {
    throw workflowError('WORKFLOW_START_HAS_INCOMING_TRANSITION');
  }
  for (const end of ends) {
    if (outgoingByKey.get(end.key).length > 0) {
      throw workflowError('WORKFLOW_END_HAS_OUTGOING_TRANSITION', { step_key: end.key });
    }
  }

  const reachable = reachableFrom(startKey, outgoingByKey);
  const reachableEnds = ends.filter(step => reachable.has(step.key));
  if (!reachableEnds.length) throw workflowError('WORKFLOW_END_UNREACHABLE');
  const unreachable = steps.filter(step => !reachable.has(step.key)).map(step => step.key);
  if (unreachable.length) throw workflowError('WORKFLOW_UNREACHABLE_STEP', { step_keys: unreachable });

  // Every edge which participates in a directed cycle must name its own
  // finite allowance. max_total_steps then supplies a second, global bound.
  for (const transition of transitions) {
    const cycleMembers = reachableFrom(transition.target_step_key, outgoingByKey);
    if (cycleMembers.has(transition.source_step_key) && transition.max_iterations === null) {
      throw workflowError('WORKFLOW_LOOP_MAX_ITERATIONS_REQUIRED', {
        source_step_key: transition.source_step_key,
        target_step_key: transition.target_step_key
      });
    }
  }

  return {
    ...parsed,
    steps,
    transitions
  };
}

function reachableFrom(start, adjacency) {
  const visited = new Set([start]);
  const pending = [start];
  while (pending.length) {
    const current = pending.shift();
    for (const next of adjacency.get(current) || []) {
      if (!visited.has(next)) {
        visited.add(next);
        pending.push(next);
      }
    }
  }
  return visited;
}

function assertStoredVersionTopology(versionRow) {
  const detail = hydrateVersion(versionRow);
  try {
    return normalizeVersionDraft({
      label: detail.label,
      max_total_steps: detail.max_total_steps,
      steps: detail.steps.map(step => ({
        key: step.step_key,
        type: step.step_type,
        label: step.label,
        description: step.description,
        metadata: step.metadata,
        sort_order: step.sort_order
      })),
      transitions: detail.transitions.map(transition => ({
        source_step_key: transition.source_step_key,
        target_step_key: transition.target_step_key,
        label: transition.label,
        guard: transition.guard,
        allowed_actor_types: transition.allowed_actor_types,
        max_iterations: transition.max_iterations,
        evidence_required: transition.evidence_required,
        metadata: transition.metadata,
        sort_order: transition.sort_order
      })),
      metadata: detail.metadata
    });
  } catch (error) {
    if (String(error?.message || '').startsWith('WORKFLOW_')) throw error;
    throw workflowError('WORKFLOW_VERSION_INVALID');
  }
}

function insertVersion(definition, draft, actor) {
  const versionNumber = Number(definition.latest_version) + 1;
  const versionId = generateId('workflow_version');
  const timestamp = nowIso();
  db.prepare(`
    INSERT INTO workflow_versions (
      id, workflow_id, version_number, status, label, max_total_steps, metadata_json,
      created_by, created_at, published_by, published_at
    ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, NULL, NULL)
  `).run(
    versionId,
    definition.id,
    versionNumber,
    draft.label,
    draft.max_total_steps,
    toJson(draft.metadata),
    auditActor(actor),
    timestamp
  );

  const insertStep = db.prepare(`
    INSERT INTO workflow_steps (
      id, workflow_version_id, step_key, step_type, label, description, metadata_json, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const stepIdByKey = new Map();
  for (const step of draft.steps) {
    const stepId = generateId('workflow_step');
    stepIdByKey.set(step.key, stepId);
    insertStep.run(
      stepId,
      versionId,
      step.key,
      step.type,
      step.label,
      step.description,
      toJson(step.metadata),
      step.sort_order
    );
  }

  const insertTransition = db.prepare(`
    INSERT INTO workflow_transitions (
      id, workflow_version_id, source_step_id, target_step_id, label, guard_json,
      allowed_actor_types_json, max_iterations, evidence_required, metadata_json, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const transition of draft.transitions) {
    insertTransition.run(
      generateId('workflow_transition'),
      versionId,
      stepIdByKey.get(transition.source_step_key),
      stepIdByKey.get(transition.target_step_key),
      transition.label,
      transition.guard === null ? null : toJson(transition.guard),
      toJson(transition.allowed_actor_types),
      transition.max_iterations,
      Number(transition.evidence_required),
      toJson(transition.metadata),
      transition.sort_order
    );
  }

  db.prepare(`
    UPDATE workflow_definitions
    SET latest_version = ?, updated_by = ?, updated_at = ?
    WHERE id = ?
  `).run(versionNumber, auditActor(actor), timestamp, definition.id);

  return hydrateVersion(requireVersion(definition.id, versionNumber));
}

function getInstanceRow(instanceId) {
  const id = normalizeId(instanceId, 'INVALID_WORKFLOW_INSTANCE_ID');
  return db.prepare(`
    SELECT i.*, d.slug AS workflow_slug, d.name AS workflow_name, d.graph_id,
           v.version_number, v.status AS workflow_version_status, v.max_total_steps,
           current.step_key AS current_step_key, current.step_type AS current_step_type,
           current.label AS current_step_label, current.description AS current_step_description,
           current.metadata_json AS current_step_metadata_json
    FROM workflow_instances i
    JOIN workflow_definitions d ON d.id = i.workflow_definition_id
    JOIN workflow_versions v ON v.id = i.workflow_version_id
    JOIN workflow_steps current ON current.id = i.current_step_id
    WHERE i.id = ?
  `).get(id) || null;
}

function requireInstance(instanceId) {
  const row = getInstanceRow(instanceId);
  if (!row) throw workflowError('WORKFLOW_INSTANCE_NOT_FOUND');
  return row;
}

function readStoredContext(instanceRow) {
  let parsed;
  try {
    parsed = JSON.parse(instanceRow.context_json);
  } catch {
    throw workflowError('WORKFLOW_INSTANCE_CONTEXT_INVALID');
  }
  try {
    return workflowContextSchema.parse(parsed);
  } catch {
    throw workflowError('WORKFLOW_INSTANCE_CONTEXT_INVALID');
  }
}

function mergeContext(current, patch) {
  // Shallow patching is deterministic and audit-friendly. Nested state can be
  // supplied as a complete named value rather than an unbounded mutation DSL.
  return workflowContextSchema.parse({ ...current, ...patch });
}

function normalizeEvidence(value) {
  if (value === undefined || value === null) return [];
  if (typeof value === 'string') {
    return [{ id: value, kind: 'reference', uri: '', note: '', metadata: {} }];
  }
  return Array.isArray(value) ? value : [value];
}

function nextEventSequence(instanceId) {
  const row = db.prepare(`
    SELECT COALESCE(MAX(sequence), 0) AS sequence
    FROM workflow_instance_events
    WHERE instance_id = ?
  `).get(instanceId);
  return Number(row.sequence) + 1;
}

function insertInstanceEvent({
  instanceId,
  eventType,
  fromStepId = null,
  toStepId = null,
  transitionId = null,
  actor,
  evidence = [],
  contextPatch = {},
  metadata = {}
}) {
  const sequence = nextEventSequence(instanceId);
  db.prepare(`
    INSERT INTO workflow_instance_events (
      instance_id, sequence, event_type, from_step_id, to_step_id, transition_id,
      actor_type, actor_id, actor_label, evidence_json, context_patch_json, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    instanceId,
    sequence,
    eventType,
    fromStepId,
    toStepId,
    transitionId,
    actor.type,
    actor.id,
    actor.label,
    toJson(evidence),
    toJson(contextPatch),
    toJson(metadata),
    nowIso()
  );
}

function getInstanceEvents(instanceId) {
  return db.prepare(`
    SELECT e.*, source.step_key AS from_step_key, source.label AS from_step_label,
           target.step_key AS to_step_key, target.label AS to_step_label,
           t.label AS transition_label
    FROM workflow_instance_events e
    LEFT JOIN workflow_steps source ON source.id = e.from_step_id
    LEFT JOIN workflow_steps target ON target.id = e.to_step_id
    LEFT JOIN workflow_transitions t ON t.id = e.transition_id
    WHERE e.instance_id = ?
    ORDER BY e.sequence ASC
  `).all(instanceId).map(mapEvent);
}

function hydrateInstance(instanceRow, { includeEvents = true } = {}) {
  const instance = mapInstance(instanceRow);
  const currentStep = {
    id: instance.current_step_id,
    key: instance.current_step_key,
    type: instance.current_step_type,
    label: instance.current_step_label,
    description: instance.current_step_description,
    metadata: parseJson(instance.current_step_metadata_json, {})
  };
  return {
    ...instance,
    workflow: {
      id: instance.workflow_definition_id,
      slug: instance.workflow_slug,
      name: instance.workflow_name,
      graph_id: instance.graph_id
    },
    workflow_version: {
      id: instance.workflow_version_id,
      version_number: Number(instance.version_number),
      status: instance.workflow_version_status,
      max_total_steps: Number(instance.max_total_steps)
    },
    current_step: currentStep,
    // This is intentionally only a topology projection for the exact version
    // bound to the instance. It does not pre-authorize an actor or evaluate a
    // guard: those checks depend on the mutation request and remain atomic in
    // transitionWorkflowInstance.
    available_transitions: getAvailableTransitions(instance.workflow_version_id, instance.current_step_id),
    ...(includeEvents ? { events: getInstanceEvents(instance.id) } : {})
  };
}

function getTransitionForInstance(instanceRow, transitionId) {
  const id = normalizeId(transitionId, 'INVALID_WORKFLOW_TRANSITION_ID');
  const row = db.prepare(`
    SELECT *
    FROM workflow_transitions
    WHERE id = ? AND workflow_version_id = ?
  `).get(id, instanceRow.workflow_version_id);
  if (!row) throw workflowError('WORKFLOW_TRANSITION_NOT_FOUND');
  return row;
}

function requireStepInVersion(stepId, versionId) {
  const row = db.prepare(`
    SELECT *
    FROM workflow_steps
    WHERE id = ? AND workflow_version_id = ?
  `).get(stepId, versionId);
  if (!row) throw workflowError('WORKFLOW_TRANSITION_TARGET_INVALID');
  return row;
}

function transitionCount(instanceId, transitionId) {
  return Number(db.prepare(`
    SELECT COUNT(*) AS count
    FROM workflow_instance_events
    WHERE instance_id = ? AND transition_id = ? AND event_type = 'transition'
  `).get(instanceId, transitionId).count);
}

function updateInstance({ instanceId, currentStepId, status, context, stepCount, completedAt = null, failedAt = null }) {
  db.prepare(`
    UPDATE workflow_instances
    SET current_step_id = ?, status = ?, context_json = ?, step_count = ?,
        completed_at = ?, failed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(
    currentStepId,
    status,
    toJson(context),
    stepCount,
    completedAt,
    failedAt,
    nowIso(),
    instanceId
  );
}

export const workflowService = {
  listWorkflows(query = {}) {
    const parsed = workflowListQuerySchema.parse(query);
    const conditions = ['1 = 1'];
    const params = [];
    let versionJoin = '';
    if (parsed.graph_id) {
      conditions.push('d.graph_id = ?');
      params.push(parsed.graph_id);
    }
    if (!parsed.include_inactive) conditions.push('d.active = 1');
    if (parsed.status) {
      versionJoin = 'JOIN workflow_versions selected_version ON selected_version.workflow_id = d.id';
      conditions.push('selected_version.status = ?');
      params.push(parsed.status);
    }
    const rows = db.prepare(`
      SELECT DISTINCT d.*
      FROM workflow_definitions d
      ${versionJoin}
      WHERE ${conditions.join(' AND ')}
      ORDER BY d.name COLLATE NOCASE, d.id
    `).all(...params);
    const countInstances = db.prepare(`
      SELECT COUNT(*) AS count
      FROM workflow_instances
      WHERE workflow_definition_id = ?
    `);
    return rows.map(row => ({
      ...mapDefinition(row),
      instance_count: Number(countInstances.get(row.id).count)
    }));
  },

  getWorkflow(idOrSlug) {
    const definitionRow = requireDefinition(idOrSlug);
    const definition = mapDefinition(definitionRow);
    const versionRows = getVersionRows(definition.id);
    const currentRow = versionRows.find(row => Number(row.version_number) === definition.latest_version) || null;
    const publishedRow = definition.published_version_number === null
      ? null
      : versionRows.find(row => Number(row.version_number) === definition.published_version_number) || null;
    return {
      ...definition,
      versions: versionRows.map(mapVersion),
      current_version: currentRow ? hydrateVersion(currentRow) : null,
      published_version: publishedRow ? hydrateVersion(publishedRow) : null
    };
  },

  createWorkflow(input, actor = 'SYSTEM_WORKFLOW') {
    return atomically(() => {
      const parsed = createWorkflowDefinitionSchema.parse(input);
      const workflowActor = normalizeActor(actor);
      const graph = requireGraph(parsed.graph_id);
      const id = parsed.id ? normalizeId(parsed.id) : generateId('workflow');
      if (getDefinitionRow(id)) throw workflowError('WORKFLOW_ALREADY_EXISTS');
      if (db.prepare('SELECT id FROM workflow_definitions WHERE slug = ?').get(parsed.slug)) {
        throw workflowError('WORKFLOW_SLUG_ALREADY_EXISTS');
      }
      const draft = normalizeVersionDraft({
        label: parsed.label,
        max_total_steps: parsed.max_total_steps,
        steps: parsed.steps,
        transitions: parsed.transitions,
        metadata: parsed.metadata
      });
      const timestamp = nowIso();
      db.prepare(`
        INSERT INTO workflow_definitions (
          id, graph_id, slug, name, description, active, latest_version, published_version,
          created_by, created_at, updated_by, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, ?, ?, ?)
      `).run(
        id,
        graph.id,
        parsed.slug,
        parsed.name,
        parsed.description,
        Number(parsed.active),
        auditActor(workflowActor),
        timestamp,
        auditActor(workflowActor),
        timestamp
      );
      const definition = requireDefinition(id);
      const version = insertVersion(definition, draft, workflowActor);
      const created = this.getWorkflow(id);
      recordAudit({
        action: 'CREATE_WORKFLOW_DEFINITION',
        entity: 'workflow_definitions',
        entityId: id,
        newState: created,
        actor: workflowActor
      });
      recordAudit({
        action: 'CREATE_WORKFLOW_VERSION',
        entity: 'workflow_versions',
        entityId: version.id,
        newState: version,
        actor: workflowActor
      });
      return created;
    });
  },

  createWorkflowVersion(workflowId, input, actor = 'SYSTEM_WORKFLOW') {
    return atomically(() => {
      const definition = requireDefinition(workflowId);
      if (!asBoolean(definition.active)) throw workflowError('WORKFLOW_INACTIVE');
      requireGraph(definition.graph_id);
      const workflowActor = normalizeActor(actor);
      const draft = normalizeVersionDraft(input);
      const version = insertVersion(definition, draft, workflowActor);
      const workflow = this.getWorkflow(definition.id);
      recordAudit({
        action: 'CREATE_WORKFLOW_VERSION',
        entity: 'workflow_versions',
        entityId: version.id,
        newState: version,
        actor: workflowActor
      });
      return { workflow, version };
    });
  },

  publishWorkflowVersion(workflowId, versionNumber, actor = 'SYSTEM_WORKFLOW') {
    return atomically(() => {
      const definition = requireDefinition(workflowId);
      if (!asBoolean(definition.active)) throw workflowError('WORKFLOW_INACTIVE');
      requireGraph(definition.graph_id);
      const workflowActor = normalizeActor(actor);
      const version = requireVersion(definition.id, versionNumber);
      if (Number(version.version_number) !== Number(definition.latest_version)) {
        throw workflowError('WORKFLOW_VERSION_NOT_LATEST');
      }
      if (version.status === 'superseded') throw workflowError('WORKFLOW_VERSION_SUPERSEDED');
      if (version.status === 'published') return this.getWorkflow(definition.id);
      if (version.status !== 'draft') throw workflowError('WORKFLOW_VERSION_NOT_DRAFT');
      assertStoredVersionTopology(version);

      const timestamp = nowIso();
      db.prepare(`
        UPDATE workflow_versions
        SET status = 'superseded'
        WHERE workflow_id = ? AND status = 'published'
      `).run(definition.id);
      db.prepare(`
        UPDATE workflow_versions
        SET status = 'published', published_by = ?, published_at = ?
        WHERE id = ?
      `).run(auditActor(workflowActor), timestamp, version.id);
      db.prepare(`
        UPDATE workflow_definitions
        SET published_version = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
      `).run(version.version_number, auditActor(workflowActor), timestamp, definition.id);
      const workflow = this.getWorkflow(definition.id);
      recordAudit({
        action: 'PUBLISH_WORKFLOW_VERSION',
        entity: 'workflow_versions',
        entityId: version.id,
        prevState: mapVersion(version),
        newState: workflow.published_version,
        actor: workflowActor
      });
      return workflow;
    });
  },

  startWorkflowInstance(workflowId, input = {}, actor = 'SYSTEM_WORKFLOW') {
    return atomically(() => {
      const parsed = startWorkflowInstanceSchema.parse(input);
      const definition = requireDefinition(workflowId);
      if (!asBoolean(definition.active)) throw workflowError('WORKFLOW_INACTIVE');
      requireGraph(definition.graph_id);
      if (definition.published_version === null || definition.published_version === undefined) {
        throw workflowError('WORKFLOW_NOT_PUBLISHED');
      }
      const version = requireVersion(definition.id, definition.published_version);
      if (version.status !== 'published') throw workflowError('WORKFLOW_NOT_PUBLISHED');
      const detail = hydrateVersion(version);
      const start = detail.steps.find(step => step.step_type === 'start');
      if (!start) throw workflowError('WORKFLOW_START_STEP_REQUIRED');
      const workflowActor = parsed.actor || normalizeActor(actor);
      const timestamp = nowIso();
      const instanceId = generateId('workflow_instance');
      db.prepare(`
        INSERT INTO workflow_instances (
          id, workflow_definition_id, workflow_version_id, status, current_step_id,
          context_json, step_count, started_by, started_at, completed_at, failed_at, updated_at
        ) VALUES (?, ?, ?, 'running', ?, ?, 1, ?, ?, NULL, NULL, ?)
      `).run(
        instanceId,
        definition.id,
        version.id,
        start.id,
        toJson(parsed.context),
        auditActor(workflowActor),
        timestamp,
        timestamp
      );
      insertInstanceEvent({
        instanceId,
        eventType: 'start',
        toStepId: start.id,
        actor: workflowActor,
        contextPatch: parsed.context
      });
      const created = this.getWorkflowInstance(instanceId);
      recordAudit({
        action: 'START_WORKFLOW_INSTANCE',
        entity: 'workflow_instances',
        entityId: instanceId,
        newState: created,
        actor: workflowActor
      });
      return created;
    });
  },

  listWorkflowInstances(query = {}) {
    const parsed = workflowInstanceListQuerySchema.parse(query);
    const conditions = ['1 = 1'];
    const params = [];
    if (parsed.workflow_id) {
      const definition = requireDefinition(parsed.workflow_id);
      conditions.push('i.workflow_definition_id = ?');
      params.push(definition.id);
    }
    if (parsed.status) {
      conditions.push('i.status = ?');
      params.push(parsed.status);
    }
    const rows = db.prepare(`
      SELECT i.*, d.slug AS workflow_slug, d.name AS workflow_name, d.graph_id,
             v.version_number, v.status AS workflow_version_status, v.max_total_steps,
             current.step_key AS current_step_key, current.step_type AS current_step_type,
             current.label AS current_step_label, current.description AS current_step_description,
             current.metadata_json AS current_step_metadata_json
      FROM workflow_instances i
      JOIN workflow_definitions d ON d.id = i.workflow_definition_id
      JOIN workflow_versions v ON v.id = i.workflow_version_id
      JOIN workflow_steps current ON current.id = i.current_step_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY i.started_at DESC, i.id DESC
      LIMIT ?
    `).all(...params, parsed.limit);
    return rows.map(row => hydrateInstance(row, { includeEvents: false }));
  },

  getWorkflowInstance(instanceId) {
    return hydrateInstance(requireInstance(instanceId));
  },

  transitionWorkflowInstance(instanceId, input, actor = 'SYSTEM_WORKFLOW') {
    return atomically(() => {
      const parsed = transitionWorkflowInstanceSchema.parse(input);
      const instance = requireInstance(instanceId);
      if (instance.status !== 'running') {
        throw workflowError('WORKFLOW_INSTANCE_NOT_RUNNING', { status: instance.status });
      }
      const workflowActor = parsed.actor || normalizeActor(actor);
      const transition = getTransitionForInstance(instance, parsed.transition_id);
      if (transition.source_step_id !== instance.current_step_id) {
        throw workflowError('WORKFLOW_TRANSITION_SOURCE_MISMATCH', {
          current_step_id: instance.current_step_id,
          transition_source_step_id: transition.source_step_id
        });
      }
      const allowedActors = parseJson(transition.allowed_actor_types_json, []);
      if (!Array.isArray(allowedActors) || !allowedActors.includes(workflowActor.type)) {
        throw workflowError('WORKFLOW_ACTOR_NOT_ALLOWED', { allowed_actor_types: allowedActors });
      }
      const evidence = normalizeEvidence(parsed.evidence);
      if (asBoolean(transition.evidence_required) && evidence.length === 0) {
        throw workflowError('WORKFLOW_EVIDENCE_REQUIRED');
      }
      const currentContext = readStoredContext(instance);
      const nextContext = mergeContext(currentContext, parsed.context_patch);
      let guard = null;
      if (transition.guard_json) {
        try {
          guard = workflowGuardSchema.parse(JSON.parse(transition.guard_json));
        } catch {
          throw workflowError('WORKFLOW_TRANSITION_GUARD_INVALID');
        }
      }
      if (!evaluateWorkflowGuard(guard, nextContext)) {
        throw workflowError('WORKFLOW_GUARD_NOT_SATISFIED');
      }
      if (transition.max_iterations !== null && transition.max_iterations !== undefined
        && transitionCount(instance.id, transition.id) >= Number(transition.max_iterations)) {
        throw workflowError('WORKFLOW_TRANSITION_ITERATION_LIMIT', {
          max_iterations: Number(transition.max_iterations)
        });
      }
      if (Number(instance.step_count) >= Number(instance.max_total_steps)) {
        throw workflowError('WORKFLOW_MAX_TOTAL_STEPS_REACHED', {
          max_total_steps: Number(instance.max_total_steps)
        });
      }
      const target = requireStepInVersion(transition.target_step_id, instance.workflow_version_id);
      let nextStatus = 'running';
      let completedAt = null;
      if (target.step_type === 'wait') nextStatus = 'paused';
      if (target.step_type === 'end') {
        nextStatus = 'completed';
        completedAt = nowIso();
      }
      updateInstance({
        instanceId: instance.id,
        currentStepId: target.id,
        status: nextStatus,
        context: nextContext,
        stepCount: Number(instance.step_count) + 1,
        completedAt,
        failedAt: instance.failed_at || null
      });
      insertInstanceEvent({
        instanceId: instance.id,
        eventType: 'transition',
        fromStepId: instance.current_step_id,
        toStepId: target.id,
        transitionId: transition.id,
        actor: workflowActor,
        evidence,
        contextPatch: parsed.context_patch
      });
      if (nextStatus === 'paused') {
        insertInstanceEvent({
          instanceId: instance.id,
          eventType: 'pause',
          fromStepId: target.id,
          toStepId: target.id,
          actor: workflowActor,
          metadata: { reason: 'wait_step_reached' }
        });
      }
      if (nextStatus === 'completed') {
        insertInstanceEvent({
          instanceId: instance.id,
          eventType: 'complete',
          fromStepId: target.id,
          toStepId: target.id,
          actor: workflowActor,
          metadata: { reason: 'end_step_reached' }
        });
      }
      const updated = this.getWorkflowInstance(instance.id);
      recordAudit({
        action: 'TRANSITION_WORKFLOW_INSTANCE',
        entity: 'workflow_instances',
        entityId: instance.id,
        prevState: hydrateInstance(instance, { includeEvents: false }),
        newState: updated,
        actor: workflowActor
      });
      // A wait or end target is a state transition and also a first-class
      // lifecycle fact. Keep a global audit entry in addition to the
      // append-only workflow event so cross-domain audit tooling can find it
      // without having to infer status from a generic transition payload.
      if (nextStatus === 'paused') {
        recordAudit({
          action: 'PAUSE_WORKFLOW_INSTANCE',
          entity: 'workflow_instances',
          entityId: instance.id,
          prevState: { status: instance.status, current_step_id: instance.current_step_id },
          newState: { status: updated.status, current_step_id: updated.current_step_id, reason: 'wait_step_reached' },
          actor: workflowActor
        });
      }
      if (nextStatus === 'completed') {
        recordAudit({
          action: 'COMPLETE_WORKFLOW_INSTANCE',
          entity: 'workflow_instances',
          entityId: instance.id,
          prevState: { status: instance.status, current_step_id: instance.current_step_id },
          newState: { status: updated.status, current_step_id: updated.current_step_id, reason: 'end_step_reached' },
          actor: workflowActor
        });
      }
      return updated;
    });
  },

  pauseWorkflowInstance(instanceId, input = {}, actor = 'SYSTEM_WORKFLOW') {
    return this.changeInstanceLifecycle({
      instanceId,
      input,
      actor,
      expectedStatuses: ['running'],
      nextStatus: 'paused',
      eventType: 'pause',
      auditAction: 'PAUSE_WORKFLOW_INSTANCE'
    });
  },

  resumeWorkflowInstance(instanceId, input = {}, actor = 'SYSTEM_WORKFLOW') {
    return this.changeInstanceLifecycle({
      instanceId,
      input,
      actor,
      expectedStatuses: ['paused'],
      nextStatus: 'running',
      eventType: 'resume',
      auditAction: 'RESUME_WORKFLOW_INSTANCE'
    });
  },

  failWorkflowInstance(instanceId, input = {}, actor = 'SYSTEM_WORKFLOW') {
    return this.changeInstanceLifecycle({
      instanceId,
      input,
      actor,
      expectedStatuses: ['running', 'paused'],
      nextStatus: 'failed',
      eventType: 'fail',
      auditAction: 'FAIL_WORKFLOW_INSTANCE'
    });
  },

  changeInstanceLifecycle({
    instanceId,
    input = {},
    actor = 'SYSTEM_WORKFLOW',
    expectedStatuses,
    nextStatus,
    eventType,
    auditAction
  }) {
    return atomically(() => {
      const parsed = lifecycleWorkflowInstanceSchema.parse(input);
      const instance = requireInstance(instanceId);
      if (!expectedStatuses.includes(instance.status)) {
        throw workflowError('WORKFLOW_INSTANCE_LIFECYCLE_STATE_INVALID', {
          status: instance.status,
          expected: expectedStatuses
        });
      }
      const workflowActor = parsed.actor || normalizeActor(actor);
      const currentContext = readStoredContext(instance);
      const nextContext = mergeContext(currentContext, parsed.context_patch);
      const timestamp = nowIso();
      updateInstance({
        instanceId: instance.id,
        currentStepId: instance.current_step_id,
        status: nextStatus,
        context: nextContext,
        stepCount: Number(instance.step_count),
        completedAt: instance.completed_at || null,
        failedAt: nextStatus === 'failed' ? timestamp : (instance.failed_at || null)
      });
      insertInstanceEvent({
        instanceId: instance.id,
        eventType,
        fromStepId: instance.current_step_id,
        toStepId: instance.current_step_id,
        actor: workflowActor,
        contextPatch: parsed.context_patch,
        metadata: parsed.reason ? { reason: parsed.reason } : {}
      });
      const updated = this.getWorkflowInstance(instance.id);
      recordAudit({
        action: auditAction,
        entity: 'workflow_instances',
        entityId: instance.id,
        prevState: hydrateInstance(instance, { includeEvents: false }),
        newState: updated,
        actor: workflowActor
      });
      return updated;
    });
  }
};
