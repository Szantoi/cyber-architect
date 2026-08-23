import crypto from 'node:crypto';
import { ZodError } from 'zod';
import { db, initDatabase } from '../db.js';
import { smartRuleSchema } from '../schemas/taxonomy.schema.js';

// The registry deliberately permits only icon identifiers which the frontend
// can map to its local Lucide catalog. It never accepts an SVG fragment, a URL,
// or arbitrary component code from an administrator.
export const TAXONOMY_ICON_CATALOG = Object.freeze([
  'tag',
  'tags',
  'flame',
  'headphones',
  'video',
  'factory',
  'zap',
  'target',
  'users',
  'user-round',
  'layers',
  'folder',
  'folders',
  'sparkles',
  'brain-circuit',
  'network',
  'database',
  'filter',
  'boxes',
  'shield-check',
  'book-open',
  'workflow',
  'chart-no-axes-combined',
  'briefcase-business',
  'wrench',
  'code-2',
  'cpu',
  'landmark',
  'heart-pulse',
  'truck',
  'building-2',
  'package-search',
  'graduation-cap'
]);

const ICON_SET = new Set(TAXONOMY_ICON_CATALOG);
const ID_PATTERN = /^[a-z][a-z0-9_-]{1,79}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/;
const FRONTMATTER_KEY_PATTERN = /^[a-z][a-z0-9_]{1,79}$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const RELATION_TYPES = new Set([
  'related_to',
  'broader_than',
  'narrower_than',
  'recommended_with',
  'excludes'
]);
const DIMENSION_LEGACY_KEYS = Object.freeze({
  industry: ['iparag'],
  technology: ['technologia'],
  audience_role: ['celcsoport'],
  pain_point: ['fajdalompont']
});

// Direct imports of this service (CLI scripts, routes and tests) must be safe.
// initDatabase is idempotent and creates the registry before any query below.
initDatabase();

function nowIso() {
  return new Date().toISOString();
}

function asBoolean(value) {
  return Number(value) === 1;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeLabel(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('hu-HU')
    .replace(/[\s_\-/]+/g, ' ')
    .replace(/[^a-z0-9 #+.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(value) {
  const normalized = normalizeLabel(value)
    .replace(/#/g, 'sharp')
    .replace(/\+/g, 'plus')
    .replace(/\./g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/[-_]{2,}/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 96);
  return normalized || `term-${crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 10)}`;
}

function assertId(value, errorCode = 'INVALID_TAXONOMY_ID') {
  const normalized = String(value || '').trim();
  if (!ID_PATTERN.test(normalized)) throw new Error(errorCode);
  return normalized;
}

function assertSlug(value, errorCode = 'INVALID_TAXONOMY_SLUG') {
  const normalized = String(value || '').trim();
  if (!SLUG_PATTERN.test(normalized)) throw new Error(errorCode);
  return normalized;
}

function assertFrontmatterKey(value) {
  const normalized = String(value || '').trim();
  if (!FRONTMATTER_KEY_PATTERN.test(normalized)) throw new Error('INVALID_TAXONOMY_FRONTMATTER_KEY');
  return normalized;
}

function assertLabel(value, errorCode = 'INVALID_TAXONOMY_LABEL', maxLength = 160) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > maxLength) throw new Error(errorCode);
  return normalized;
}

function assertColor(value, fallback = '#00FFFF') {
  const normalized = value === undefined || value === null || value === '' ? fallback : String(value).trim();
  if (!COLOR_PATTERN.test(normalized)) throw new Error('INVALID_TAXONOMY_COLOR');
  return normalized.toUpperCase();
}

function assertIcon(value, fallback = 'tag') {
  const normalized = value === undefined || value === null || value === '' ? fallback : String(value).trim();
  if (!ICON_SET.has(normalized)) throw new Error('UNSUPPORTED_TAXONOMY_ICON');
  return normalized;
}

function assertVisibility(value, fallback = 'public') {
  const normalized = value === undefined || value === null || value === '' ? fallback : String(value).trim();
  if (!['public', 'private'].includes(normalized)) throw new Error('INVALID_TAXONOMY_VISIBILITY');
  return normalized;
}

function assertScope(value, fallback = 'public') {
  const normalized = value === undefined || value === null || value === '' ? fallback : String(value).trim();
  if (!['public', 'private', 'personal'].includes(normalized)) throw new Error('INVALID_SMART_COLLECTION_SCOPE');
  return normalized;
}

function boundedInteger(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < -10_000 || number > 10_000) throw new Error('INVALID_TAXONOMY_SORT_ORDER');
  return number;
}

function recordAudit({ action, entity, entityId = null, prevState = null, newState = null, actor = 'SYSTEM' }) {
  db.prepare(`
    INSERT INTO audit_logs (action, entity, entity_id, prev_state, new_state, actor, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(action).slice(0, 120),
    String(entity).slice(0, 120),
    entityId === null ? null : String(entityId).slice(0, 160),
    prevState === null ? null : JSON.stringify(prevState),
    newState === null ? null : JSON.stringify(newState),
    String(actor || 'SYSTEM').slice(0, 160),
    nowIso()
  );
}

function mapDimension(row) {
  if (!row) return null;
  return {
    ...row,
    multi_select: asBoolean(row.multi_select),
    filterable: asBoolean(row.filterable),
    groupable: asBoolean(row.groupable),
    active: asBoolean(row.active),
    is_core: asBoolean(row.is_core),
    legacy_frontmatter_keys: DIMENSION_LEGACY_KEYS[row.id] || []
  };
}

function mapTerm(row) {
  if (!row) return null;
  return {
    ...row,
    active: asBoolean(row.active)
  };
}

function mapRelation(row) {
  if (!row) return null;
  return {
    ...row,
    weight: Number(row.weight),
    bidirectional: asBoolean(row.bidirectional)
  };
}

function mapCollection(row) {
  if (!row) return null;
  return {
    ...row,
    active: asBoolean(row.active),
    rule_version: Number(row.rule_version),
    rule: parseJson(row.rule_json, { type: 'all', rules: [] }),
    group_by: parseJson(row.group_by_json, { type: 'none' }),
    layout: parseJson(row.layout_json, { view: 'cards' })
  };
}

function getDimensionRow(id) {
  return db.prepare('SELECT * FROM taxonomy_dimensions WHERE id = ?').get(String(id || '').trim()) || null;
}

function getDimensionByFrontmatterKey(key) {
  return db.prepare('SELECT * FROM taxonomy_dimensions WHERE frontmatter_key = ?').get(String(key || '').trim()) || null;
}

function getTermRow(id) {
  return db.prepare('SELECT * FROM taxonomy_terms WHERE id = ?').get(String(id || '').trim()) || null;
}

function getCollectionRow(id) {
  return db.prepare('SELECT * FROM smart_collections WHERE id = ?').get(String(id || '').trim()) || null;
}

function assertDimensionExists(id) {
  const dimension = getDimensionRow(assertId(id, 'INVALID_TAXONOMY_DIMENSION_ID'));
  if (!dimension) throw new Error('TAXONOMY_DIMENSION_NOT_FOUND');
  return dimension;
}

function assertTermExists(id) {
  const term = getTermRow(assertId(id, 'INVALID_TAXONOMY_TERM_ID'));
  if (!term) throw new Error('TAXONOMY_TERM_NOT_FOUND');
  return term;
}

function assertPostExists(postId) {
  const normalizedId = Number(postId);
  if (!Number.isSafeInteger(normalizedId) || normalizedId <= 0) throw new Error('INVALID_TAXONOMY_POST_ID');
  const post = db.prepare('SELECT id FROM blog_posts WHERE id = ?').get(normalizedId);
  if (!post) throw new Error('TAXONOMY_POST_NOT_FOUND');
  return normalizedId;
}

function uniqueTermSlug(dimensionId, preferredSlug, excludeTermId = null) {
  const base = assertSlug(preferredSlug);
  let candidate = base;
  let suffix = 2;
  while (true) {
    const row = db.prepare(`
      SELECT id
      FROM taxonomy_terms
      WHERE dimension_id = ? AND slug = ?
    `).get(dimensionId, candidate);
    if (!row || row.id === excludeTermId) return candidate;
    const suffixText = `-${suffix++}`;
    candidate = `${base.slice(0, Math.max(1, 100 - suffixText.length))}${suffixText}`;
  }
}

function uniqueGeneratedTermId(dimensionId, slug, rawValue = '') {
  const preferred = `${dimensionId}_${slug}`;
  if (ID_PATTERN.test(preferred) && !getTermRow(preferred)) return preferred;

  const fingerprint = crypto
    .createHash('sha256')
    .update(`${dimensionId}\u0000${slug}\u0000${rawValue}`)
    .digest('hex');
  let candidate = `term_${fingerprint.slice(0, 64)}`;
  let suffix = 2;
  while (getTermRow(candidate)) {
    const suffixText = `_${suffix++}`;
    candidate = `term_${fingerprint.slice(0, 79 - 5 - suffixText.length)}${suffixText}`;
  }
  return candidate;
}

function addAliasInternal({ term, alias, timestamp = nowIso() }) {
  const cleanAlias = assertLabel(alias, 'INVALID_TAXONOMY_ALIAS');
  const normalizedAlias = normalizeLabel(cleanAlias);
  if (!normalizedAlias) throw new Error('INVALID_TAXONOMY_ALIAS');

  const existing = db.prepare(`
    SELECT id, term_id
    FROM taxonomy_term_aliases
    WHERE dimension_id = ? AND normalized_alias = ?
  `).get(term.dimension_id, normalizedAlias);
  if (existing) {
    if (existing.term_id === term.id) return existing.id;
    throw new Error('TAXONOMY_ALIAS_CONFLICT');
  }

  return db.prepare(`
    INSERT INTO taxonomy_term_aliases (dimension_id, term_id, alias, normalized_alias, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(term.dimension_id, term.id, cleanAlias, normalizedAlias, timestamp).lastInsertRowid;
}

function normalizeTermInput(input = {}) {
  const dimensionId = assertId(input.dimension_id, 'INVALID_TAXONOMY_DIMENSION_ID');
  const label = assertLabel(input.label);
  const slug = uniqueTermSlug(dimensionId, input.slug ? assertSlug(input.slug) : slugify(label));
  const id = input.id ? assertId(input.id, 'INVALID_TAXONOMY_TERM_ID') : uniqueGeneratedTermId(dimensionId, slug, label);
  return {
    id,
    dimension_id: dimensionId,
    slug,
    label,
    normalized_label: normalizeLabel(label),
    description: String(input.description || '').trim().slice(0, 1_000),
    icon_key: input.icon_key === undefined ? null : assertIcon(input.icon_key),
    color: input.color === undefined ? null : assertColor(input.color),
    parent_id: input.parent_id ? assertId(input.parent_id, 'INVALID_TAXONOMY_PARENT_ID') : null,
    active: input.active === undefined ? true : Boolean(input.active),
    visibility: assertVisibility(input.visibility),
    sort_order: boundedInteger(input.sort_order)
  };
}

function validateParent({ termId = null, dimensionId, parentId }) {
  if (!parentId) return;
  if (parentId === termId) throw new Error('TAXONOMY_TERM_SELF_PARENT');
  const parent = assertTermExists(parentId);
  if (parent.dimension_id !== dimensionId) throw new Error('TAXONOMY_PARENT_DIMENSION_MISMATCH');
}

function validateSmartRuleReferences(rule) {
  const parsed = smartRuleSchema.parse(rule);
  const visit = (node) => {
    if (node.type === 'taxonomy') {
      const terms = node.term_ids.map(assertTermExists);
      if (node.dimension_id && terms.some(term => term.dimension_id !== node.dimension_id)) {
        throw new Error('SMART_COLLECTION_TERM_DIMENSION_MISMATCH');
      }
      return;
    }
    if (node.type === 'all' || node.type === 'any') {
      node.rules.forEach(visit);
    } else if (node.type === 'not') {
      visit(node.rule);
    }
  };
  visit(parsed);
  return parsed;
}

function validateCollectionGrouping(groupBy) {
  if (!isPlainObject(groupBy) || !groupBy.type) throw new Error('INVALID_SMART_COLLECTION_GROUP_BY');
  if (groupBy.type === 'none') return { type: 'none' };
  if (groupBy.type === 'taxonomy_dimension') {
    assertDimensionExists(groupBy.dimension_id);
    return { type: 'taxonomy_dimension', dimension_id: String(groupBy.dimension_id) };
  }
  if (groupBy.type === 'content_field' && ['presentation_profile', 'content_type', 'category', 'project_id'].includes(groupBy.field)) {
    return { type: 'content_field', field: groupBy.field };
  }
  throw new Error('INVALID_SMART_COLLECTION_GROUP_BY');
}

function validateCollectionLayout(layout) {
  if (!isPlainObject(layout)) throw new Error('INVALID_SMART_COLLECTION_LAYOUT');
  const view = String(layout.view || 'cards');
  if (!['cards', 'list', 'graph'].includes(view)) throw new Error('INVALID_SMART_COLLECTION_LAYOUT');
  const result = { view };
  if (layout.columns !== undefined) {
    const columns = Number(layout.columns);
    if (!Number.isInteger(columns) || columns < 1 || columns > 6) throw new Error('INVALID_SMART_COLLECTION_LAYOUT');
    result.columns = columns;
  }
  return result;
}

function normalizeLegacyDimensions(value) {
  const dimensions = typeof value === 'string' ? parseJson(value, {}) : value;
  return isPlainObject(dimensions) ? dimensions : {};
}

function taxonomyError(code, details = null) {
  const error = new Error(code);
  if (details !== null) error.details = details;
  return error;
}

function normalizeAssignmentList(value, { dimensionId, source }) {
  if (!Array.isArray(value)) {
    throw taxonomyError('INVALID_TAXONOMY_FRONTMATTER_LIST', {
      dimension_id: dimensionId,
      source,
      received_type: value === null ? 'null' : typeof value
    });
  }

  const values = [];
  const seen = new Set();
  for (const rawValue of value) {
    if (typeof rawValue !== 'string') {
      throw taxonomyError('INVALID_TAXONOMY_FRONTMATTER_TERM', {
        dimension_id: dimensionId,
        source,
        received_type: rawValue === null ? 'null' : typeof rawValue
      });
    }
    const value = rawValue.normalize('NFC').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function sameAssignmentValues(first, second) {
  if (first.length !== second.length) return false;
  const firstSet = new Set(first);
  return second.every(value => firstSet.has(value));
}

function parseLegacyFrontmatterDimensions(frontmatter) {
  if (!hasOwn(frontmatter, 'dimensions')) return { present: false, value: null, source: null };
  const rawDimensions = frontmatter.dimensions;
  if (typeof rawDimensions === 'string') {
    const parsed = parseJson(rawDimensions, null);
    if (!isPlainObject(parsed)) {
      throw taxonomyError('INVALID_TAXONOMY_LEGACY_DIMENSIONS', {
        received_type: 'string',
        received_value: rawDimensions.slice(0, 240)
      });
    }
    return { present: true, value: parsed, source: 'legacy_dimensions_json_text' };
  }
  if (!isPlainObject(rawDimensions)) {
    throw taxonomyError('INVALID_TAXONOMY_LEGACY_DIMENSIONS', {
      received_type: rawDimensions === null ? 'null' : typeof rawDimensions
    });
  }
  return { present: true, value: rawDimensions, source: 'legacy_dimensions' };
}

/**
 * Converts Obsidian-safe flat `tax_*` list properties into the stable DB
 * dimension IDs used by the assignment pivot. Registry dimensions are read
 * dynamically (including inactive ones), so an admin-added dimension becomes
 * importable as soon as it has a `frontmatter_key`.
 *
 * Core migration aliases remain read-only compatibility input. If a note has
 * both canonical and legacy representations, the lists must be identical;
 * choosing one silently would let the vault and SQL projection drift apart.
 */
function extractAssignmentsFromFrontmatterInternal(frontmatter) {
  if (!isPlainObject(frontmatter)) throw taxonomyError('INVALID_TAXONOMY_FRONTMATTER_ROOT');
  const legacyDimensions = parseLegacyFrontmatterDimensions(frontmatter);
  const dimensions = db.prepare(`
    SELECT *
    FROM taxonomy_dimensions
    ORDER BY sort_order ASC, label COLLATE NOCASE ASC
  `).all();
  const assignments = {};

  for (const dimension of dimensions) {
    const candidates = [];
    if (hasOwn(frontmatter, dimension.frontmatter_key)) {
      candidates.push({
        source: 'canonical',
        values: normalizeAssignmentList(frontmatter[dimension.frontmatter_key], {
          dimensionId: dimension.id,
          source: dimension.frontmatter_key
        })
      });
    }

    for (const legacyKey of DIMENSION_LEGACY_KEYS[dimension.id] || []) {
      if (legacyDimensions.present && hasOwn(legacyDimensions.value, legacyKey)) {
        candidates.push({
          source: legacyDimensions.source,
          values: normalizeAssignmentList(legacyDimensions.value[legacyKey], {
            dimensionId: dimension.id,
            source: `dimensions.${legacyKey}`
          })
        });
      }
      if (hasOwn(frontmatter, legacyKey)) {
        candidates.push({
          source: 'legacy_flat',
          values: normalizeAssignmentList(frontmatter[legacyKey], {
            dimensionId: dimension.id,
            source: legacyKey
          })
        });
      }
    }

    if (candidates.length > 1) {
      const reference = candidates[0];
      const conflict = candidates.find(candidate => !sameAssignmentValues(reference.values, candidate.values));
      if (conflict) {
        throw taxonomyError('TAXONOMY_FRONTMATTER_CONFLICT', {
          dimension_id: dimension.id,
          frontmatter_key: dimension.frontmatter_key,
          values: Object.fromEntries(candidates.map(candidate => [candidate.source, candidate.values]))
        });
      }
    }
    if (candidates.length) assignments[dimension.id] = candidates[0].values;
  }
  return assignments;
}

function normalizeRegistryAssignments(assignments) {
  if (!isPlainObject(assignments)) throw new Error('INVALID_TAXONOMY_ASSIGNMENTS');
  const normalized = [];
  for (const [dimensionReference, rawValues] of Object.entries(assignments)) {
    const dimension = getDimensionRow(dimensionReference) || getDimensionByFrontmatterKey(dimensionReference);
    if (!dimension) throw taxonomyError('TAXONOMY_DIMENSION_NOT_FOUND', { dimension: dimensionReference });
    const values = normalizeAssignmentList(rawValues, {
      dimensionId: dimension.id,
      source: dimensionReference
    });
    if (!dimension.multi_select && values.length > 1) throw new Error('TAXONOMY_DIMENSION_SINGLE_SELECT');
    normalized.push({ dimension, values });
  }
  return normalized;
}

/**
 * Return taxonomy values from an already-projected document. The durable
 * source for a fresh document is the assignment pivot, but this fallback is
 * deliberately retained while a pre-v2 vault is being migrated and synced.
 * It lets a public facet use a canonical term slug immediately, even if the
 * corresponding legacy `blog_posts.dimensions` JSON has not yet been rebuilt
 * into `content_taxonomy_assignments`.
 */
function getProjectedDocumentValues(document, dimension) {
  const projected = normalizeLegacyDimensions(document?.dimensions);
  const keys = [
    dimension.frontmatter_key,
    dimension.id,
    ...(DIMENSION_LEGACY_KEYS[dimension.id] || [])
  ];
  const values = [];

  for (const key of keys) {
    const value = document?.[key] ?? projected[key];
    const items = Array.isArray(value) ? value : (typeof value === 'string' ? [value] : []);
    for (const item of items) {
      if (typeof item !== 'string') continue;
      const normalized = item.normalize('NFC').trim();
      if (normalized && !values.includes(normalized)) values.push(normalized);
    }
  }
  return values;
}

function serializablePost(row) {
  return {
    ...row,
    dimensions: normalizeLegacyDimensions(row.dimensions)
  };
}

function compileSmartRule(rule, params) {
  switch (rule.type) {
    case 'all':
      return `(${rule.rules.map(child => compileSmartRule(child, params)).join(' AND ')})`;
    case 'any':
      return `(${rule.rules.map(child => compileSmartRule(child, params)).join(' OR ')})`;
    case 'not':
      return `(NOT ${compileSmartRule(rule.rule, params)})`;
    case 'taxonomy': {
      const ids = rule.term_ids.map(id => assertId(id, 'INVALID_SMART_COLLECTION_TERM_ID'));
      if (rule.dimension_id) {
        const dimensionId = assertId(rule.dimension_id, 'INVALID_SMART_COLLECTION_DIMENSION_ID');
        const matches = db.prepare(`
          SELECT COUNT(*) AS count
          FROM taxonomy_terms
          WHERE id IN (${ids.map(() => '?').join(', ')}) AND dimension_id = ?
        `).get(...ids, dimensionId);
        if (Number(matches.count) !== ids.length) throw new Error('SMART_COLLECTION_TERM_DIMENSION_MISMATCH');
      }
      const existsFor = (termId) => {
        params.push(termId);
        return 'EXISTS (SELECT 1 FROM content_taxonomy_assignments cta WHERE cta.post_id = b.id AND cta.term_id = ?)';
      };
      if (rule.match === 'all') return `(${ids.map(existsFor).join(' AND ')})`;
      if (rule.match === 'none') return `(NOT (${ids.map(existsFor).join(' OR ')}))`;
      params.push(...ids);
      return `EXISTS (
        SELECT 1 FROM content_taxonomy_assignments cta
        WHERE cta.post_id = b.id AND cta.term_id IN (${ids.map(() => '?').join(', ')})
      )`;
    }
    case 'content': {
      const fieldSql = {
        presentation_profile: 'b.presentation_profile',
        content_type: 'b.content_type',
        category: 'b.category',
        visibility: 'b.visibility',
        published: 'b.published',
        has_audio: "CASE WHEN TRIM(COALESCE(b.audio_url, '')) <> '' THEN 1 ELSE 0 END",
        has_video: "CASE WHEN TRIM(COALESCE(b.video_url, '')) <> '' THEN 1 ELSE 0 END"
      }[rule.field];
      if (!fieldSql) throw new Error('INVALID_SMART_COLLECTION_RULE');
      const values = Array.isArray(rule.value) ? rule.value : [rule.value];
      if (rule.field === 'published' || rule.field === 'has_audio' || rule.field === 'has_video') {
        if (values.length !== 1 || typeof values[0] !== 'boolean') throw new Error('INVALID_SMART_COLLECTION_RULE');
        params.push(values[0] ? 1 : 0);
        return `${fieldSql} = ?`;
      }
      if (values.some(value => typeof value !== 'string' || !value.trim())) throw new Error('INVALID_SMART_COLLECTION_RULE');
      if (rule.operator === 'in') {
        params.push(...values.map(value => value.trim()));
        return `${fieldSql} IN (${values.map(() => '?').join(', ')})`;
      }
      if (values.length !== 1) throw new Error('INVALID_SMART_COLLECTION_RULE');
      params.push(values[0].trim());
      return `${fieldSql} = ?`;
    }
    case 'date': {
      const date = new Date(rule.value);
      if (Number.isNaN(date.getTime())) throw new Error('INVALID_SMART_COLLECTION_RULE');
      params.push(date.toISOString());
      return rule.operator === 'after' ? 'b.created_at >= ?' : 'b.created_at <= ?';
    }
    default:
      throw new Error('INVALID_SMART_COLLECTION_RULE');
  }
}

function getCollectionBySlug(slug) {
  return db.prepare('SELECT * FROM smart_collections WHERE slug = ?').get(String(slug || '').trim()) || null;
}

function uniqueGeneratedCollectionId(slug) {
  const preferred = `collection_${slug}`;
  if (ID_PATTERN.test(preferred) && !getCollectionRow(preferred)) return preferred;
  const fingerprint = crypto.createHash('sha256').update(String(slug)).digest('hex');
  let candidate = `collection_${fingerprint.slice(0, 68)}`;
  let suffix = 2;
  while (getCollectionRow(candidate)) {
    const suffixText = `_${suffix++}`;
    candidate = `collection_${fingerprint.slice(0, 79 - 11 - suffixText.length)}${suffixText}`;
  }
  return candidate;
}

function normalizeCollectionInput(input = {}, previous = null) {
  const slug = previous ? previous.slug : assertSlug(input.slug, 'INVALID_SMART_COLLECTION_SLUG');
  const name = input.name !== undefined ? assertLabel(input.name, 'INVALID_SMART_COLLECTION_NAME') : previous?.name;
  const rule = input.rule !== undefined ? validateSmartRuleReferences(input.rule) : previous?.rule;
  if (!name || !rule) throw new Error('SMART_COLLECTION_REQUIRED_FIELD_MISSING');
  const groupBy = input.group_by !== undefined
    ? validateCollectionGrouping(input.group_by)
    : (previous?.group_by || { type: 'none' });
  const layout = input.layout !== undefined
    ? validateCollectionLayout(input.layout)
    : (previous?.layout || { view: 'cards' });
  const sortBy = input.sort_by !== undefined ? String(input.sort_by) : (previous?.sort_by || 'recommended');
  if (!['recommended', 'newest', 'title'].includes(sortBy)) throw new Error('INVALID_SMART_COLLECTION_SORT');

  return {
    id: previous?.id || (input.id ? assertId(input.id, 'INVALID_SMART_COLLECTION_ID') : uniqueGeneratedCollectionId(slug)),
    slug,
    name,
    description: input.description !== undefined ? String(input.description || '').trim().slice(0, 1_000) : (previous?.description || ''),
    icon_key: input.icon_key !== undefined ? assertIcon(input.icon_key, 'sparkles') : (previous?.icon_key || 'sparkles'),
    color: input.color !== undefined ? assertColor(input.color, '#80FF00') : (previous?.color || '#80FF00'),
    scope: input.scope !== undefined ? assertScope(input.scope) : (previous?.scope || 'public'),
    owner_id: input.owner_id !== undefined ? String(input.owner_id || '').trim().slice(0, 160) : (previous?.owner_id || ''),
    active: input.active !== undefined ? Boolean(input.active) : (previous?.active ?? true),
    rule_version: input.rule_version !== undefined ? Number(input.rule_version) : (previous?.rule_version || 1),
    rule,
    group_by: groupBy,
    sort_by: sortBy,
    layout,
    sort_order: input.sort_order !== undefined ? boundedInteger(input.sort_order) : (previous?.sort_order || 0)
  };
}

function isKnownTaxonomyError(error) {
  return error instanceof ZodError
    || /^(INVALID_|UNSUPPORTED_|TAXONOMY_|SMART_COLLECTION_)/.test(String(error?.message || ''));
}

function seedLegacyTermsInternal({ includeInactivePosts = true, actor = 'SYSTEM_TAXONOMY_SEED', audit = false } = {}) {
  const rows = db.prepare(`
    SELECT dimensions
    FROM blog_posts
    ${includeInactivePosts ? '' : 'WHERE published = 1'}
  `).all();
  const dimensions = db.prepare('SELECT id FROM taxonomy_dimensions').all();
  const dimensionIds = new Set(dimensions.map(row => row.id));
  const report = { scanned_posts: rows.length, created_terms: 0, created_aliases: 0, skipped_values: 0 };

  const seed = db.transaction(() => {
    for (const row of rows) {
      const source = normalizeLegacyDimensions(row.dimensions);
      for (const [dimensionId, legacyKeys] of Object.entries(DIMENSION_LEGACY_KEYS)) {
        if (!dimensionIds.has(dimensionId)) continue;
        const values = legacyKeys.flatMap(key => (Array.isArray(source[key]) ? source[key] : []));
        for (const value of values) {
          const label = String(value || '').trim();
          const normalized = normalizeLabel(label);
          if (!label || !normalized) {
            report.skipped_values++;
            continue;
          }
          const existing = db.prepare(`
            SELECT t.*
            FROM taxonomy_terms t
            LEFT JOIN taxonomy_term_aliases a ON a.term_id = t.id
            WHERE t.dimension_id = ?
              AND (t.normalized_label = ? OR a.normalized_alias = ?)
            ORDER BY CASE WHEN t.normalized_label = ? THEN 0 ELSE 1 END
            LIMIT 1
          `).get(dimensionId, normalized, normalized, normalized);
          if (existing) continue;

          const slug = uniqueTermSlug(dimensionId, slugify(label));
          const id = uniqueGeneratedTermId(dimensionId, slug, label);
          const timestamp = nowIso();
          db.prepare(`
            INSERT INTO taxonomy_terms
              (id, dimension_id, slug, label, normalized_label, description, icon_key,
               color, parent_id, active, visibility, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '', NULL, NULL, NULL, 1, 'public', 0, ?, ?)
          `).run(id, dimensionId, slug, label, normalized, timestamp, timestamp);
          const term = getTermRow(id);
          addAliasInternal({ term, alias: label, timestamp });
          report.created_terms++;
          report.created_aliases++;
        }
      }
    }
  });
  seed();

  if (audit && (report.created_terms || report.created_aliases)) {
    recordAudit({
      action: 'SEED_TAXONOMY_FROM_LEGACY_DIMENSIONS',
      entity: 'taxonomy_registry',
      entityId: 'legacy_dimensions',
      newState: report,
      actor
    });
  }
  return report;
}

export const taxonomyService = {
  isKnownTaxonomyError,

  seedLegacyTerms(options = {}) {
    return seedLegacyTermsInternal({ ...options, audit: options.audit ?? true });
  },

  /**
   * Return an assignment object keyed by stable DB dimension ID. This is the
   * only taxonomy value extraction the vault importer needs; it reads every
   * registry dimension, not merely the three visible facets.
   */
  extractAssignmentsFromFrontmatter(frontmatter) {
    return extractAssignmentsFromFrontmatterInternal(frontmatter);
  },

  /**
   * Explicit migration/bootstrap operation for a vault import. It makes an
   * initial import safe when historic display labels have not yet been added
   * to the SQL registry. Normal steady-state assignment sync remains strict
   * and fails for unknown terms, preserving SQL vocabulary governance.
   */
  bootstrapTermsForAssignments({ assignments = {}, actor = 'LOCAL_VAULT_TAXONOMY_BOOTSTRAP' } = {}) {
    const normalizedAssignments = normalizeRegistryAssignments(assignments);
    const report = { created_terms: [], existing_term_ids: [] };
    const bootstrap = db.transaction(() => {
      for (const { dimension, values } of normalizedAssignments) {
        for (const value of values) {
          const existing = this.resolveTerm({
            dimensionId: dimension.id,
            value,
            includeInactive: true
          });
          if (existing) {
            report.existing_term_ids.push(existing.id);
            continue;
          }

          const slug = uniqueTermSlug(dimension.id, slugify(value));
          const id = uniqueGeneratedTermId(dimension.id, slug, value);
          const timestamp = nowIso();
          db.prepare(`
            INSERT INTO taxonomy_terms
              (id, dimension_id, slug, label, normalized_label, description, icon_key,
               color, parent_id, active, visibility, sort_order, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '', NULL, NULL, NULL, 1, ?, 0, ?, ?)
          `).run(
            id,
            dimension.id,
            slug,
            value,
            normalizeLabel(value),
            assertVisibility(dimension.visibility),
            timestamp,
            timestamp
          );
          const created = getTermRow(id);
          addAliasInternal({ term: created, alias: value, timestamp });
          report.created_terms.push(mapTerm(created));
        }
      }
    });
    bootstrap();

    if (report.created_terms.length) {
      recordAudit({
        action: 'BOOTSTRAP_TAXONOMY_TERMS_FROM_VAULT',
        entity: 'taxonomy_registry',
        entityId: 'frontmatter_assignments',
        newState: {
          created_term_ids: report.created_terms.map(term => term.id),
          existing_term_ids: [...new Set(report.existing_term_ids)]
        },
        actor
      });
    }
    return {
      ...report,
      created_count: report.created_terms.length,
      existing_term_ids: [...new Set(report.existing_term_ids)]
    };
  },

  getRegistry({ visibility = 'all', includeInactive = false, includeAliases = false, includeRelations = true, includeSmartCollections = true } = {}) {
    const dimensionConditions = [];
    const dimensionParams = [];
    if (!includeInactive) dimensionConditions.push('d.active = 1');
    if (visibility === 'public') {
      dimensionConditions.push("d.visibility = 'public'");
    } else if (visibility === 'private') {
      dimensionConditions.push("d.visibility = 'private'");
    }
    const dimensionWhere = dimensionConditions.length ? `WHERE ${dimensionConditions.join(' AND ')}` : '';
    const dimensions = db.prepare(`
      SELECT d.*
      FROM taxonomy_dimensions d
      ${dimensionWhere}
      ORDER BY d.sort_order ASC, d.label COLLATE NOCASE ASC
    `).all(...dimensionParams).map(mapDimension);
    const dimensionIds = dimensions.map(dimension => dimension.id);
    const termsByDimension = new Map(dimensions.map(dimension => [dimension.id, []]));

    if (dimensionIds.length) {
      const conditions = [`t.dimension_id IN (${dimensionIds.map(() => '?').join(', ')})`];
      const params = [...dimensionIds];
      if (!includeInactive) conditions.push('t.active = 1');
      if (visibility === 'public') conditions.push("t.visibility = 'public'");
      else if (visibility === 'private') conditions.push("t.visibility = 'private'");
      const terms = db.prepare(`
        SELECT t.*
        FROM taxonomy_terms t
        WHERE ${conditions.join(' AND ')}
        ORDER BY t.dimension_id, t.sort_order ASC, t.label COLLATE NOCASE ASC
      `).all(...params).map(mapTerm);
      const aliasesByTerm = new Map();
      if (includeAliases && terms.length) {
        const aliases = db.prepare(`
          SELECT id, term_id, alias, normalized_alias, created_at
          FROM taxonomy_term_aliases
          WHERE term_id IN (${terms.map(() => '?').join(', ')})
          ORDER BY alias COLLATE NOCASE ASC
        `).all(...terms.map(term => term.id));
        aliases.forEach(alias => {
          const list = aliasesByTerm.get(alias.term_id) || [];
          list.push(alias);
          aliasesByTerm.set(alias.term_id, list);
        });
      }
      terms.forEach(term => {
        termsByDimension.get(term.dimension_id)?.push({
          ...term,
          ...(includeAliases ? { aliases: aliasesByTerm.get(term.id) || [] } : {})
        });
      });
    }

    const registry = {
      schema_version: 1,
      icon_catalog: TAXONOMY_ICON_CATALOG,
      dimensions: dimensions.map(dimension => ({
        ...dimension,
        terms: termsByDimension.get(dimension.id) || []
      }))
    };

    if (includeRelations) {
      const conditions = [];
      if (visibility === 'public') {
        conditions.push(
          "source.visibility = 'public'",
          "target.visibility = 'public'",
          "source_dimension.visibility = 'public'",
          "target_dimension.visibility = 'public'"
        );
      } else if (visibility === 'private') {
        conditions.push(
          "source.visibility = 'private'",
          "target.visibility = 'private'",
          "source_dimension.visibility = 'private'",
          "target_dimension.visibility = 'private'"
        );
      }
      if (!includeInactive) {
        conditions.push(
          'source.active = 1',
          'target.active = 1',
          'source_dimension.active = 1',
          'target_dimension.active = 1'
        );
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      registry.relations = db.prepare(`
        SELECT r.*, source.label AS source_term_label, target.label AS target_term_label
        FROM taxonomy_term_relations r
        JOIN taxonomy_terms source ON source.id = r.source_term_id
        JOIN taxonomy_terms target ON target.id = r.target_term_id
        JOIN taxonomy_dimensions source_dimension ON source_dimension.id = source.dimension_id
        JOIN taxonomy_dimensions target_dimension ON target_dimension.id = target.dimension_id
        ${where}
        ORDER BY r.relation_type ASC, source.label COLLATE NOCASE ASC, target.label COLLATE NOCASE ASC
      `).all().map(mapRelation);
    }
    if (includeSmartCollections) {
      const collections = this.listSmartCollections({
        scope: visibility === 'public' ? 'public' : 'all',
        includeInactive
      });
      // The Knowledge Hub evaluates Smart rules locally for instant filtering.
      // Publish only the overrides that can affect a public document, so that
      // the client can apply the same effective membership as the server-side
      // evaluator without leaking draft or private post identifiers.
      registry.smart_collections = visibility === 'public'
        ? collections.map(collection => ({
          ...collection,
          membership_overrides: Object.fromEntries(
            this.listSmartCollectionOverrides(collection.id, {
              visibility: 'public',
              publishedOnly: true
            }).map(override => [String(override.post_id), override.mode])
          )
        }))
        : collections;
    }
    return registry;
  },

  listDimensions({ includeInactive = true, visibility = 'all' } = {}) {
    return this.getRegistry({ visibility, includeInactive, includeAliases: false, includeRelations: false, includeSmartCollections: false }).dimensions;
  },

  createDimension(input, actor = 'SYSTEM') {
    const id = assertId(input.id, 'INVALID_TAXONOMY_DIMENSION_ID');
    const frontmatterKey = assertFrontmatterKey(input.frontmatter_key);
    if (getDimensionRow(id)) throw new Error('TAXONOMY_DIMENSION_ALREADY_EXISTS');
    if (getDimensionByFrontmatterKey(frontmatterKey)) throw new Error('TAXONOMY_FRONTMATTER_KEY_ALREADY_EXISTS');
    const timestamp = nowIso();
    const dimension = {
      id,
      frontmatter_key: frontmatterKey,
      label: assertLabel(input.label),
      description: String(input.description || '').trim().slice(0, 1_000),
      icon_key: assertIcon(input.icon_key),
      color: assertColor(input.color),
      multi_select: input.multi_select === undefined ? true : Boolean(input.multi_select),
      filterable: input.filterable === undefined ? true : Boolean(input.filterable),
      groupable: input.groupable === undefined ? true : Boolean(input.groupable),
      active: input.active === undefined ? true : Boolean(input.active),
      visibility: assertVisibility(input.visibility),
      sort_order: boundedInteger(input.sort_order)
    };
    db.prepare(`
      INSERT INTO taxonomy_dimensions
        (id, frontmatter_key, label, description, icon_key, color, multi_select,
         filterable, groupable, active, visibility, is_core, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
    `).run(
      dimension.id, dimension.frontmatter_key, dimension.label, dimension.description,
      dimension.icon_key, dimension.color, Number(dimension.multi_select), Number(dimension.filterable),
      Number(dimension.groupable), Number(dimension.active), dimension.visibility, dimension.sort_order,
      timestamp, timestamp
    );
    const created = mapDimension(getDimensionRow(id));
    recordAudit({ action: 'CREATE_TAXONOMY_DIMENSION', entity: 'taxonomy_dimensions', entityId: id, newState: created, actor });
    return created;
  },

  updateDimension(id, input, actor = 'SYSTEM') {
    const previous = mapDimension(assertDimensionExists(id));
    const next = {
      label: input.label !== undefined ? assertLabel(input.label) : previous.label,
      description: input.description !== undefined ? String(input.description || '').trim().slice(0, 1_000) : previous.description,
      icon_key: input.icon_key !== undefined ? assertIcon(input.icon_key) : previous.icon_key,
      color: input.color !== undefined ? assertColor(input.color) : previous.color,
      multi_select: input.multi_select !== undefined ? Boolean(input.multi_select) : previous.multi_select,
      filterable: input.filterable !== undefined ? Boolean(input.filterable) : previous.filterable,
      groupable: input.groupable !== undefined ? Boolean(input.groupable) : previous.groupable,
      active: input.active !== undefined ? Boolean(input.active) : previous.active,
      visibility: input.visibility !== undefined ? assertVisibility(input.visibility) : previous.visibility,
      sort_order: input.sort_order !== undefined ? boundedInteger(input.sort_order) : previous.sort_order
    };
    db.prepare(`
      UPDATE taxonomy_dimensions
      SET label = ?, description = ?, icon_key = ?, color = ?, multi_select = ?,
          filterable = ?, groupable = ?, active = ?, visibility = ?, sort_order = ?, updated_at = ?
      WHERE id = ?
    `).run(
      next.label, next.description, next.icon_key, next.color, Number(next.multi_select),
      Number(next.filterable), Number(next.groupable), Number(next.active), next.visibility,
      next.sort_order, nowIso(), previous.id
    );
    const updated = mapDimension(getDimensionRow(previous.id));
    recordAudit({ action: 'UPDATE_TAXONOMY_DIMENSION', entity: 'taxonomy_dimensions', entityId: previous.id, prevState: previous, newState: updated, actor });
    return updated;
  },

  deleteDimension(id, actor = 'SYSTEM') {
    const previous = mapDimension(assertDimensionExists(id));
    if (previous.is_core) throw new Error('TAXONOMY_CORE_DIMENSION_PROTECTED');
    const termCount = db.prepare('SELECT COUNT(*) AS count FROM taxonomy_terms WHERE dimension_id = ?').get(previous.id).count;
    if (Number(termCount) > 0) throw new Error('TAXONOMY_DIMENSION_HAS_TERMS');
    db.prepare('DELETE FROM taxonomy_dimensions WHERE id = ?').run(previous.id);
    recordAudit({ action: 'DELETE_TAXONOMY_DIMENSION', entity: 'taxonomy_dimensions', entityId: previous.id, prevState: previous, actor });
    return { success: true, deleted_id: previous.id };
  },

  createTerm(input, actor = 'SYSTEM') {
    assertDimensionExists(input.dimension_id);
    const term = normalizeTermInput(input);
    if (getTermRow(term.id)) throw new Error('TAXONOMY_TERM_ALREADY_EXISTS');
    validateParent({ termId: term.id, dimensionId: term.dimension_id, parentId: term.parent_id });
    const timestamp = nowIso();
    const aliases = [...new Set([term.label, ...(Array.isArray(input.aliases) ? input.aliases : [])])];
    const write = db.transaction(() => {
      db.prepare(`
        INSERT INTO taxonomy_terms
          (id, dimension_id, slug, label, normalized_label, description, icon_key,
           color, parent_id, active, visibility, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        term.id, term.dimension_id, term.slug, term.label, term.normalized_label,
        term.description, term.icon_key, term.color, term.parent_id, Number(term.active),
        term.visibility, term.sort_order, timestamp, timestamp
      );
      const inserted = getTermRow(term.id);
      aliases.forEach(alias => addAliasInternal({ term: inserted, alias, timestamp }));
    });
    write();
    const created = this.getTerm(term.id, { includeAliases: true });
    recordAudit({ action: 'CREATE_TAXONOMY_TERM', entity: 'taxonomy_terms', entityId: term.id, newState: created, actor });
    return created;
  },

  getTerm(id, { includeAliases = false } = {}) {
    const term = mapTerm(assertTermExists(id));
    if (!includeAliases) return term;
    const aliases = db.prepare(`
      SELECT id, term_id, alias, normalized_alias, created_at
      FROM taxonomy_term_aliases
      WHERE term_id = ?
      ORDER BY alias COLLATE NOCASE ASC
    `).all(term.id);
    return { ...term, aliases };
  },

  updateTerm(id, input, actor = 'SYSTEM') {
    const previous = this.getTerm(id, { includeAliases: true });
    const label = input.label !== undefined ? assertLabel(input.label) : previous.label;
    const next = {
      slug: input.slug !== undefined ? uniqueTermSlug(previous.dimension_id, assertSlug(input.slug), previous.id) : previous.slug,
      label,
      normalized_label: normalizeLabel(label),
      description: input.description !== undefined ? String(input.description || '').trim().slice(0, 1_000) : previous.description,
      icon_key: input.icon_key !== undefined ? assertIcon(input.icon_key) : previous.icon_key,
      color: input.color !== undefined ? assertColor(input.color) : previous.color,
      parent_id: input.parent_id !== undefined ? (input.parent_id ? assertId(input.parent_id, 'INVALID_TAXONOMY_PARENT_ID') : null) : previous.parent_id,
      active: input.active !== undefined ? Boolean(input.active) : previous.active,
      visibility: input.visibility !== undefined ? assertVisibility(input.visibility) : previous.visibility,
      sort_order: input.sort_order !== undefined ? boundedInteger(input.sort_order) : previous.sort_order
    };
    validateParent({ termId: previous.id, dimensionId: previous.dimension_id, parentId: next.parent_id });
    const timestamp = nowIso();
    const write = db.transaction(() => {
      db.prepare(`
        UPDATE taxonomy_terms
        SET slug = ?, label = ?, normalized_label = ?, description = ?, icon_key = ?, color = ?,
            parent_id = ?, active = ?, visibility = ?, sort_order = ?, updated_at = ?
        WHERE id = ?
      `).run(
        next.slug, next.label, next.normalized_label, next.description, next.icon_key, next.color,
        next.parent_id, Number(next.active), next.visibility, next.sort_order, timestamp, previous.id
      );
      if (previous.label !== next.label) {
        addAliasInternal({ term: getTermRow(previous.id), alias: previous.label, timestamp });
        addAliasInternal({ term: getTermRow(previous.id), alias: next.label, timestamp });
      }
    });
    write();
    const updated = this.getTerm(previous.id, { includeAliases: true });
    recordAudit({ action: 'UPDATE_TAXONOMY_TERM', entity: 'taxonomy_terms', entityId: previous.id, prevState: previous, newState: updated, actor });
    return updated;
  },

  deleteTerm(id, actor = 'SYSTEM') {
    const previous = this.getTerm(id, { includeAliases: true });
    const usage = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM content_taxonomy_assignments WHERE term_id = ?) AS assignments,
        (SELECT COUNT(*) FROM taxonomy_term_relations WHERE source_term_id = ? OR target_term_id = ?) AS relations,
        (SELECT COUNT(*) FROM taxonomy_terms WHERE parent_id = ?) AS children
    `).get(previous.id, previous.id, previous.id, previous.id);
    if (Number(usage.assignments) || Number(usage.relations) || Number(usage.children)) {
      throw new Error('TAXONOMY_TERM_IN_USE');
    }
    db.transaction(() => {
      db.prepare('DELETE FROM taxonomy_term_aliases WHERE term_id = ?').run(previous.id);
      db.prepare('DELETE FROM taxonomy_terms WHERE id = ?').run(previous.id);
    })();
    recordAudit({ action: 'DELETE_TAXONOMY_TERM', entity: 'taxonomy_terms', entityId: previous.id, prevState: previous, actor });
    return { success: true, deleted_id: previous.id };
  },

  createAlias(termId, alias, actor = 'SYSTEM') {
    const term = assertTermExists(termId);
    const aliasId = addAliasInternal({ term, alias });
    const created = db.prepare(`
      SELECT id, dimension_id, term_id, alias, normalized_alias, created_at
      FROM taxonomy_term_aliases
      WHERE id = ?
    `).get(aliasId);
    recordAudit({ action: 'CREATE_TAXONOMY_ALIAS', entity: 'taxonomy_term_aliases', entityId: aliasId, newState: created, actor });
    return created;
  },

  deleteAlias(aliasId, actor = 'SYSTEM') {
    const id = Number(aliasId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('INVALID_TAXONOMY_ALIAS_ID');
    const previous = db.prepare('SELECT * FROM taxonomy_term_aliases WHERE id = ?').get(id);
    if (!previous) throw new Error('TAXONOMY_ALIAS_NOT_FOUND');
    const aliasCount = db.prepare('SELECT COUNT(*) AS count FROM taxonomy_term_aliases WHERE term_id = ?').get(previous.term_id).count;
    if (Number(aliasCount) <= 1) throw new Error('TAXONOMY_PRIMARY_ALIAS_PROTECTED');
    db.prepare('DELETE FROM taxonomy_term_aliases WHERE id = ?').run(id);
    recordAudit({ action: 'DELETE_TAXONOMY_ALIAS', entity: 'taxonomy_term_aliases', entityId: id, prevState: previous, actor });
    return { success: true, deleted_id: id };
  },

  resolveTerm({ dimensionId, value, includeInactive = false } = {}) {
    const dimension = assertDimensionExists(dimensionId);
    const rawValue = String(value || '').trim();
    if (!rawValue) return null;
    const normalized = normalizeLabel(rawValue);
    const conditions = includeInactive ? '' : ' AND t.active = 1';
    const row = db.prepare(`
      SELECT t.*
      FROM taxonomy_terms t
      LEFT JOIN taxonomy_term_aliases a ON a.term_id = t.id
      WHERE t.dimension_id = ?
        AND (t.id = ? OR t.slug = ? OR t.normalized_label = ? OR a.normalized_alias = ?)
        ${conditions}
      ORDER BY
        CASE
          WHEN t.id = ? THEN 0
          WHEN t.slug = ? THEN 1
          WHEN t.normalized_label = ? THEN 2
          ELSE 3
        END
      LIMIT 1
    `).get(
      dimension.id, rawValue, rawValue, normalized, normalized,
      rawValue, rawValue, normalized
    );
    return mapTerm(row);
  },

  /**
   * Generic public/API facet matcher. A dimension is ANDed with the other
   * dimensions; multiple selected values within one dimension are ORed. The
   * lookup accepts a stable term id/slug, display label, or registered alias.
   *
   * Pivot assignments win whenever they exist. The legacy dimensions
   * projection is only a read compatibility fallback for records that have
   * not yet passed through the v2 vault sync, so no public facet silently
   * becomes a broad, unfiltered search during migration.
   */
  filterDocumentsByFacets(documents = [], facetAssignments = {}, { visibility = 'all' } = {}) {
    const source = Array.isArray(documents) ? documents : [];
    const normalized = normalizeRegistryAssignments(facetAssignments)
      .filter(({ values }) => values.length > 0);
    if (!normalized.length || !source.length) return source;

    const selections = [];
    for (const { dimension, values } of normalized) {
      const termIds = new Set();
      for (const value of values) {
        const term = this.resolveTerm({ dimensionId: dimension.id, value, includeInactive: true });
        const visibleInScope = term && (
          visibility !== 'public'
          || (term.active && term.visibility === 'public' && Number(dimension.active) === 1 && dimension.visibility === 'public')
        );
        // A stale or unknown public facet must yield no documents. Ignoring
        // it would accidentally turn a narrow navigation link into a broad
        // public search.
        if (!visibleInScope) return [];
        termIds.add(term.id);
      }
      selections.push({ dimension, termIds });
    }

    const documentIds = [...new Set(source
      .map(document => Number(document?.id))
      .filter(id => Number.isSafeInteger(id) && id > 0))];
    const assignmentsByPost = new Map();
    if (documentIds.length) {
      const dimensionIds = selections.map(selection => selection.dimension.id);
      // Keep each SQLite statement safely below the standard bind-variable
      // limit even when an administrator has added many dimensions.
      const chunkSize = Math.max(1, Math.min(400, 900 - dimensionIds.length));
      for (let index = 0; index < documentIds.length; index += chunkSize) {
        const ids = documentIds.slice(index, index + chunkSize);
        const rows = db.prepare(`
          SELECT assignment.post_id, assignment.term_id, term.dimension_id
          FROM content_taxonomy_assignments assignment
          JOIN taxonomy_terms term ON term.id = assignment.term_id
          WHERE assignment.post_id IN (${ids.map(() => '?').join(', ')})
            AND term.dimension_id IN (${dimensionIds.map(() => '?').join(', ')})
        `).all(...ids, ...dimensionIds);
        for (const row of rows) {
          const byDimension = assignmentsByPost.get(row.post_id) || new Map();
          const values = byDimension.get(row.dimension_id) || new Set();
          values.add(row.term_id);
          byDimension.set(row.dimension_id, values);
          assignmentsByPost.set(row.post_id, byDimension);
        }
      }
    }

    return source.filter((document) => {
      const byDimension = assignmentsByPost.get(Number(document?.id)) || new Map();
      return selections.every(({ dimension, termIds }) => {
        const assignedTermIds = byDimension.get(dimension.id);
        if (assignedTermIds?.size) {
          return [...assignedTermIds].some(termId => termIds.has(termId));
        }

        return getProjectedDocumentValues(document, dimension).some((value) => {
          const resolved = this.resolveTerm({ dimensionId: dimension.id, value, includeInactive: true });
          return resolved && termIds.has(resolved.id);
        });
      });
    });
  },

  replaceAssignmentsForPost({ postId, assignments = {}, source = 'vault_frontmatter', actor = 'LOCAL_VAULT_SYNC' } = {}) {
    const normalizedPostId = assertPostExists(postId);
    const normalizedSource = String(source || '').trim();
    if (!/^[a-z][a-z0-9_-]{1,79}$/.test(normalizedSource)) throw new Error('INVALID_TAXONOMY_ASSIGNMENT_SOURCE');
    const normalizedAssignments = normalizeRegistryAssignments(assignments);
    const resolved = [];
    const unknown = [];
    for (const { dimension, values } of normalizedAssignments) {
      for (const value of values) {
        // Deactivated terms may remain in historic vault notes. They stay
        // assignable so a display/filter toggle cannot erase a document link.
        const term = this.resolveTerm({ dimensionId: dimension.id, value, includeInactive: true });
        if (!term) {
          unknown.push({ dimension: dimension.id, value: String(value || '') });
          continue;
        }
        resolved.push(term);
      }
    }
    if (unknown.length) {
      const error = new Error('UNKNOWN_TAXONOMY_TERM');
      error.details = unknown;
      throw error;
    }
    const uniqueTerms = [...new Map(resolved.map(term => [term.id, term])).values()];
    const previous = this.getAssignmentsForPost(normalizedPostId);
    const timestamp = nowIso();
    db.transaction(() => {
      db.prepare('DELETE FROM content_taxonomy_assignments WHERE post_id = ? AND source = ?').run(normalizedPostId, normalizedSource);
      const insert = db.prepare(`
        INSERT INTO content_taxonomy_assignments (post_id, term_id, source, ordinal, assigned_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      uniqueTerms.forEach((term, ordinal) => insert.run(normalizedPostId, term.id, normalizedSource, ordinal, timestamp));
    })();
    const updated = this.getAssignmentsForPost(normalizedPostId);
    recordAudit({
      action: 'SYNC_CONTENT_TAXONOMY_ASSIGNMENTS',
      entity: 'content_taxonomy_assignments',
      entityId: normalizedPostId,
      prevState: previous,
      newState: updated,
      actor
    });
    return updated;
  },

  getAssignmentsForPost(postId) {
    const normalizedPostId = assertPostExists(postId);
    return db.prepare(`
      SELECT a.post_id, a.term_id, a.source, a.ordinal, a.assigned_at,
        t.slug, t.label, t.dimension_id, d.frontmatter_key, d.label AS dimension_label
      FROM content_taxonomy_assignments a
      JOIN taxonomy_terms t ON t.id = a.term_id
      JOIN taxonomy_dimensions d ON d.id = t.dimension_id
      WHERE a.post_id = ?
      ORDER BY d.sort_order ASC, a.ordinal ASC, t.sort_order ASC, t.label COLLATE NOCASE ASC
    `).all(normalizedPostId);
  },

  getSharedTaxonomyConnections(postId, { limit = 25, visibility = 'all' } = {}) {
    const normalizedPostId = assertPostExists(postId);
    const safeLimit = Math.max(1, Math.min(Number(limit) || 25, 100));
    const visibilityCondition = visibility === 'public' ? "AND b.visibility = 'public' AND b.published = 1" : '';
    return db.prepare(`
      SELECT b.id, b.slug, b.title, COUNT(DISTINCT own.term_id) AS shared_term_count,
        GROUP_CONCAT(DISTINCT own.term_id) AS shared_term_ids
      FROM content_taxonomy_assignments own
      JOIN content_taxonomy_assignments peer ON peer.term_id = own.term_id AND peer.post_id <> own.post_id
      JOIN blog_posts b ON b.id = peer.post_id
      WHERE own.post_id = ?
        ${visibilityCondition}
      GROUP BY b.id
      ORDER BY shared_term_count DESC, b.created_at DESC, b.id DESC
      LIMIT ?
    `).all(normalizedPostId, safeLimit).map(row => ({
      ...row,
      relation_type: 'shared_taxonomy',
      shared_term_ids: String(row.shared_term_ids || '').split(',').filter(Boolean)
    }));
  },

  createRelation(input, actor = 'SYSTEM') {
    const sourceTerm = assertTermExists(input.source_term_id);
    const targetTerm = assertTermExists(input.target_term_id);
    if (sourceTerm.id === targetTerm.id) throw new Error('TAXONOMY_RELATION_SELF_REFERENCE');
    const relationType = String(input.relation_type || 'related_to').trim();
    if (!RELATION_TYPES.has(relationType)) throw new Error('INVALID_TAXONOMY_RELATION_TYPE');
    const weight = input.weight === undefined ? 1 : Number(input.weight);
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error('INVALID_TAXONOMY_RELATION_WEIGHT');
    const timestamp = nowIso();
    let id;
    try {
      id = db.prepare(`
        INSERT INTO taxonomy_term_relations
          (source_term_id, target_term_id, relation_type, weight, bidirectional, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(sourceTerm.id, targetTerm.id, relationType, weight, Number(Boolean(input.bidirectional)), timestamp, timestamp).lastInsertRowid;
    } catch (error) {
      if (String(error.message || '').includes('UNIQUE')) throw new Error('TAXONOMY_RELATION_ALREADY_EXISTS');
      throw error;
    }
    const created = this.getRelation(id);
    recordAudit({ action: 'CREATE_TAXONOMY_RELATION', entity: 'taxonomy_term_relations', entityId: id, newState: created, actor });
    return created;
  },

  getRelation(id) {
    const numericId = Number(id);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) throw new Error('INVALID_TAXONOMY_RELATION_ID');
    const row = db.prepare(`
      SELECT r.*, source.label AS source_term_label, target.label AS target_term_label
      FROM taxonomy_term_relations r
      JOIN taxonomy_terms source ON source.id = r.source_term_id
      JOIN taxonomy_terms target ON target.id = r.target_term_id
      WHERE r.id = ?
    `).get(numericId);
    if (!row) throw new Error('TAXONOMY_RELATION_NOT_FOUND');
    return mapRelation(row);
  },

  updateRelation(id, input, actor = 'SYSTEM') {
    const previous = this.getRelation(id);
    const relationType = input.relation_type !== undefined ? String(input.relation_type).trim() : previous.relation_type;
    if (!RELATION_TYPES.has(relationType)) throw new Error('INVALID_TAXONOMY_RELATION_TYPE');
    const weight = input.weight !== undefined ? Number(input.weight) : previous.weight;
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new Error('INVALID_TAXONOMY_RELATION_WEIGHT');
    const bidirectional = input.bidirectional !== undefined ? Boolean(input.bidirectional) : previous.bidirectional;
    db.prepare(`
      UPDATE taxonomy_term_relations
      SET relation_type = ?, weight = ?, bidirectional = ?, updated_at = ?
      WHERE id = ?
    `).run(relationType, weight, Number(bidirectional), nowIso(), previous.id);
    const updated = this.getRelation(previous.id);
    recordAudit({ action: 'UPDATE_TAXONOMY_RELATION', entity: 'taxonomy_term_relations', entityId: previous.id, prevState: previous, newState: updated, actor });
    return updated;
  },

  deleteRelation(id, actor = 'SYSTEM') {
    const previous = this.getRelation(id);
    db.prepare('DELETE FROM taxonomy_term_relations WHERE id = ?').run(previous.id);
    recordAudit({ action: 'DELETE_TAXONOMY_RELATION', entity: 'taxonomy_term_relations', entityId: previous.id, prevState: previous, actor });
    return { success: true, deleted_id: previous.id };
  },

  listSmartCollections({ scope = 'all', includeInactive = true, ownerId = null } = {}) {
    const conditions = [];
    const params = [];
    if (scope !== 'all') {
      conditions.push('scope = ?');
      params.push(assertScope(scope));
    }
    if (!includeInactive) conditions.push('active = 1');
    if (ownerId !== null && ownerId !== undefined) {
      conditions.push('owner_id = ?');
      params.push(String(ownerId).trim());
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return db.prepare(`
      SELECT *
      FROM smart_collections
      ${where}
      ORDER BY sort_order ASC, name COLLATE NOCASE ASC
    `).all(...params).map(mapCollection);
  },

  getSmartCollection(idOrSlug, { scope = 'all', includeInactive = true, ownerId = null } = {}) {
    const reference = String(idOrSlug || '').trim();
    if (!reference) throw new Error('INVALID_SMART_COLLECTION_ID');
    const conditions = ['(id = ? OR slug = ?)'];
    const params = [reference, reference];
    if (scope !== 'all') {
      conditions.push('scope = ?');
      params.push(assertScope(scope));
    }
    if (!includeInactive) conditions.push('active = 1');
    if (ownerId !== null && ownerId !== undefined) {
      conditions.push('owner_id = ?');
      params.push(String(ownerId).trim());
    }
    const row = db.prepare(`SELECT * FROM smart_collections WHERE ${conditions.join(' AND ')}`).get(...params);
    if (!row) throw new Error('SMART_COLLECTION_NOT_FOUND');
    return mapCollection(row);
  },

  createSmartCollection(input, actor = 'SYSTEM') {
    const collection = normalizeCollectionInput(input);
    if (getCollectionRow(collection.id)) throw new Error('SMART_COLLECTION_ALREADY_EXISTS');
    if (getCollectionBySlug(collection.slug)) throw new Error('SMART_COLLECTION_SLUG_ALREADY_EXISTS');
    if (!Number.isInteger(collection.rule_version) || collection.rule_version < 1 || collection.rule_version > 100) {
      throw new Error('INVALID_SMART_COLLECTION_RULE_VERSION');
    }
    const timestamp = nowIso();
    db.prepare(`
      INSERT INTO smart_collections
        (id, slug, name, description, icon_key, color, scope, owner_id, active,
         rule_version, rule_json, group_by_json, sort_by, layout_json, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      collection.id, collection.slug, collection.name, collection.description, collection.icon_key,
      collection.color, collection.scope, collection.owner_id, Number(collection.active),
      collection.rule_version, JSON.stringify(collection.rule), JSON.stringify(collection.group_by),
      collection.sort_by, JSON.stringify(collection.layout), collection.sort_order, timestamp, timestamp
    );
    const created = this.getSmartCollection(collection.id);
    recordAudit({ action: 'CREATE_SMART_COLLECTION', entity: 'smart_collections', entityId: created.id, newState: created, actor });
    return created;
  },

  updateSmartCollection(id, input, actor = 'SYSTEM') {
    const previous = this.getSmartCollection(id);
    const collection = normalizeCollectionInput(input, previous);
    if (!Number.isInteger(collection.rule_version) || collection.rule_version < 1 || collection.rule_version > 100) {
      throw new Error('INVALID_SMART_COLLECTION_RULE_VERSION');
    }
    db.prepare(`
      UPDATE smart_collections
      SET name = ?, description = ?, icon_key = ?, color = ?, scope = ?, owner_id = ?, active = ?,
          rule_version = ?, rule_json = ?, group_by_json = ?, sort_by = ?, layout_json = ?,
          sort_order = ?, updated_at = ?
      WHERE id = ?
    `).run(
      collection.name, collection.description, collection.icon_key, collection.color,
      collection.scope, collection.owner_id, Number(collection.active), collection.rule_version,
      JSON.stringify(collection.rule), JSON.stringify(collection.group_by), collection.sort_by,
      JSON.stringify(collection.layout), collection.sort_order, nowIso(), previous.id
    );
    const updated = this.getSmartCollection(previous.id);
    recordAudit({ action: 'UPDATE_SMART_COLLECTION', entity: 'smart_collections', entityId: previous.id, prevState: previous, newState: updated, actor });
    return updated;
  },

  deleteSmartCollection(id, actor = 'SYSTEM') {
    const previous = this.getSmartCollection(id);
    db.prepare('DELETE FROM smart_collections WHERE id = ?').run(previous.id);
    recordAudit({ action: 'DELETE_SMART_COLLECTION', entity: 'smart_collections', entityId: previous.id, prevState: previous, actor });
    return { success: true, deleted_id: previous.id };
  },

  setSmartCollectionOverride({ collectionId, postId, mode, actor = 'SYSTEM' } = {}) {
    const collection = this.getSmartCollection(collectionId);
    const normalizedPostId = assertPostExists(postId);
    const normalizedMode = String(mode || '').trim();
    if (!['include', 'exclude'].includes(normalizedMode)) throw new Error('INVALID_SMART_COLLECTION_OVERRIDE_MODE');
    const previous = db.prepare(`
      SELECT collection_id, post_id, mode, created_at
      FROM smart_collection_membership_overrides
      WHERE collection_id = ? AND post_id = ?
    `).get(collection.id, normalizedPostId) || null;
    db.prepare(`
      INSERT INTO smart_collection_membership_overrides (collection_id, post_id, mode, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(collection_id, post_id) DO UPDATE SET mode = excluded.mode, created_at = excluded.created_at
    `).run(collection.id, normalizedPostId, normalizedMode, nowIso());
    const updated = db.prepare(`
      SELECT collection_id, post_id, mode, created_at
      FROM smart_collection_membership_overrides
      WHERE collection_id = ? AND post_id = ?
    `).get(collection.id, normalizedPostId);
    recordAudit({ action: 'UPSERT_SMART_COLLECTION_OVERRIDE', entity: 'smart_collection_membership_overrides', entityId: `${collection.id}:${normalizedPostId}`, prevState: previous, newState: updated, actor });
    return updated;
  },

  listSmartCollectionOverrides(collectionId, { visibility = 'all', publishedOnly = false } = {}) {
    const collection = this.getSmartCollection(collectionId);
    const conditions = ['overrides.collection_id = ?'];
    const params = [collection.id];
    if (visibility === 'public') {
      conditions.push("posts.visibility = 'public'", 'posts.published = 1');
    } else if (visibility === 'private') {
      conditions.push("posts.visibility = 'private'");
    }
    if (publishedOnly && visibility !== 'public') conditions.push('posts.published = 1');
    return db.prepare(`
      SELECT overrides.collection_id, overrides.post_id, overrides.mode, overrides.created_at
      FROM smart_collection_membership_overrides overrides
      JOIN blog_posts posts ON posts.id = overrides.post_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY overrides.created_at DESC, overrides.post_id ASC
    `).all(...params);
  },

  deleteSmartCollectionOverride({ collectionId, postId, actor = 'SYSTEM' } = {}) {
    const collection = this.getSmartCollection(collectionId);
    const normalizedPostId = assertPostExists(postId);
    const previous = db.prepare(`
      SELECT collection_id, post_id, mode, created_at
      FROM smart_collection_membership_overrides
      WHERE collection_id = ? AND post_id = ?
    `).get(collection.id, normalizedPostId);
    if (!previous) throw new Error('SMART_COLLECTION_OVERRIDE_NOT_FOUND');
    db.prepare(`
      DELETE FROM smart_collection_membership_overrides
      WHERE collection_id = ? AND post_id = ?
    `).run(collection.id, normalizedPostId);
    recordAudit({ action: 'DELETE_SMART_COLLECTION_OVERRIDE', entity: 'smart_collection_membership_overrides', entityId: `${collection.id}:${normalizedPostId}`, prevState: previous, actor });
    return { success: true, deleted_id: `${collection.id}:${normalizedPostId}` };
  },

  evaluateSmartCollection(idOrSlug, { visibility = 'all', publishedOnly = false, limit = 100, ownerId = null } = {}) {
    const scope = visibility === 'public' ? 'public' : 'all';
    const collection = this.getSmartCollection(idOrSlug, { scope, includeInactive: false, ownerId });
    const rule = validateSmartRuleReferences(collection.rule);
    const ruleParams = [];
    const ruleSql = compileSmartRule(rule, ruleParams);
    const baseConditions = ['1 = 1'];
    const baseParams = [];
    if (visibility === 'public') {
      baseConditions.push("b.visibility = 'public'", 'b.published = 1');
    } else if (visibility === 'private') {
      baseConditions.push("b.visibility = 'private'");
    }
    if (publishedOnly && visibility !== 'public') baseConditions.push('b.published = 1');
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 250));
    const orderBy = collection.sort_by === 'title'
      ? 'b.title COLLATE NOCASE ASC, b.id ASC'
      : 'b.created_at DESC, b.id DESC';
    const rows = db.prepare(`
      SELECT b.*
      FROM blog_posts b
      WHERE ${baseConditions.join(' AND ')}
        AND NOT EXISTS (
          SELECT 1 FROM smart_collection_membership_overrides excluded
          WHERE excluded.collection_id = ? AND excluded.post_id = b.id AND excluded.mode = 'exclude'
        )
        AND (
          (${ruleSql})
          OR EXISTS (
            SELECT 1 FROM smart_collection_membership_overrides included
            WHERE included.collection_id = ? AND included.post_id = b.id AND included.mode = 'include'
          )
        )
      ORDER BY ${orderBy}
      LIMIT ?
    `).all(...baseParams, collection.id, ...ruleParams, collection.id, safeLimit).map(serializablePost);
    return { collection, documents: rows };
  }
};

// Existing documents may still carry legacy display labels. Seed one stable
// registry term + alias per observed label at startup; later admin actions can
// merge terms by adding aliases instead of rewriting every vault file at once.
seedLegacyTermsInternal({ includeInactivePosts: true, audit: false });
