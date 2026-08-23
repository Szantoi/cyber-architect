/**
 * Obsidian can edit scalar and list frontmatter properties, but not nested
 * mappings.  This module keeps the vault-facing taxonomy contract flat while
 * preserving the legacy dimensions object as a read-only import format.
 *
 * It intentionally does not resolve a term against the taxonomy database.
 * That lookup belongs to the registry service; this boundary lets a vault be
 * normalized safely while the registry is unavailable.
 */

export const TAXONOMY_SCHEMA_VERSION = 2;

export const CANONICAL_TAXONOMY_FIELDS = Object.freeze({
  industry: 'tax_industry',
  technology: 'tax_technology',
  audienceRole: 'tax_audience_role',
  painPoint: 'tax_pain_point'
});

export const LEGACY_DIMENSION_FIELDS = Object.freeze({
  industry: 'iparag',
  technology: 'technologia',
  audienceRole: 'celcsoport',
  painPoint: 'fajdalompont'
});

const TAXONOMY_DIMENSIONS = Object.freeze([
  Object.freeze({
    id: 'industry',
    canonicalField: CANONICAL_TAXONOMY_FIELDS.industry,
    legacyField: LEGACY_DIMENSION_FIELDS.industry,
    required: true
  }),
  Object.freeze({
    id: 'technology',
    canonicalField: CANONICAL_TAXONOMY_FIELDS.technology,
    legacyField: LEGACY_DIMENSION_FIELDS.technology,
    required: true
  }),
  Object.freeze({
    id: 'audienceRole',
    canonicalField: CANONICAL_TAXONOMY_FIELDS.audienceRole,
    legacyField: LEGACY_DIMENSION_FIELDS.audienceRole,
    required: true
  }),
  Object.freeze({
    id: 'painPoint',
    canonicalField: CANONICAL_TAXONOMY_FIELDS.painPoint,
    legacyField: LEGACY_DIMENSION_FIELDS.painPoint,
    required: false
  })
]);

export class FrontmatterTaxonomyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'FrontmatterTaxonomyError';
    this.code = code;
    this.details = details;
  }
}

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizeList(value, field, source) {
  if (!Array.isArray(value)) {
    throw new FrontmatterTaxonomyError(
      'INVALID_TAXONOMY_LIST',
      `A(z) ${field} taxonómia mező YAML-lista kell legyen.`,
      { field, source, received_type: value === null ? 'null' : typeof value }
    );
  }

  const values = [];
  const seen = new Set();
  for (const rawValue of value) {
    if (typeof rawValue !== 'string') {
      throw new FrontmatterTaxonomyError(
        'INVALID_TAXONOMY_TERM',
        `A(z) ${field} taxonómia lista csak szöveges termeket tartalmazhat.`,
        { field, source, received_type: rawValue === null ? 'null' : typeof rawValue }
      );
    }
    const normalized = rawValue.normalize('NFC').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    values.push(normalized);
  }
  return values;
}

function readList(object, field, source) {
  if (!hasOwn(object, field)) return { present: false, values: [] };
  return { present: true, values: normalizeList(object[field], field, source) };
}

function normalizeObsidianTags(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new FrontmatterTaxonomyError(
      'INVALID_OBSIDIAN_TAGS',
      'A tags mezőnek YAML-listának kell lennie, ha a migrátor taxonómia-tag vetületet egészít ki.',
      { received_type: value === null ? 'null' : typeof value }
    );
  }
  const tags = [];
  const seen = new Set();
  for (const rawTag of value) {
    if (typeof rawTag !== 'string') {
      throw new FrontmatterTaxonomyError(
        'INVALID_OBSIDIAN_TAG',
        'A tags lista csak szöveges értékeket tartalmazhat.',
        { received_type: rawTag === null ? 'null' : typeof rawTag }
      );
    }
    const tag = rawTag.normalize('NFC').trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function tagSlug(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/#/g, ' sharp ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * The taxonomy lists remain the source assignment.  These tags are a safe
 * Obsidian search/view projection only; display labels and icons still come
 * from the taxonomy registry.
 */
export function createPainPointObsidianTags(values = []) {
  const terms = normalizeList(values, CANONICAL_TAXONOMY_FIELDS.painPoint, 'tag_projection');
  const tags = [];
  const seen = new Set();
  for (const term of terms) {
    const slug = tagSlug(term);
    if (!slug) {
      throw new FrontmatterTaxonomyError(
        'INVALID_PAIN_POINT_TAG',
        'A fájdalompont termből nem képezhető biztonságos Obsidian tag.',
        { term }
      );
    }
    const tag = `ca/pain-point/${slug}`;
    if (seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function parseLegacyDimensions(rawDimensions) {
  if (rawDimensions === undefined) return { present: false, value: null, source: null };

  if (typeof rawDimensions === 'string') {
    const rawText = rawDimensions.trim();
    if (rawText === '[object Object]') {
      throw new FrontmatterTaxonomyError(
        'INVALID_LEGACY_DIMENSIONS_TEXT',
        'A dimensions mező "[object Object]" szöveggé sérült. A migrátor nem írhatja felül vakon.',
        { received_value: rawDimensions }
      );
    }
    try {
      const parsed = JSON.parse(rawText);
      if (!isPlainObject(parsed)) throw new Error('NOT_A_MAPPING');
      return { present: true, value: parsed, source: 'legacy_dimensions_json_text' };
    } catch {
      throw new FrontmatterTaxonomyError(
        'INVALID_LEGACY_DIMENSIONS_TEXT',
        'A dimensions szöveges mező csak JSON objektumként állítható helyre.',
        { received_value: rawDimensions.slice(0, 240) }
      );
    }
  }

  if (!isPlainObject(rawDimensions)) {
    throw new FrontmatterTaxonomyError(
      'INVALID_LEGACY_DIMENSIONS',
      'A legacy dimensions mező YAML-objektum kell legyen.',
      { received_type: rawDimensions === null ? 'null' : typeof rawDimensions }
    );
  }

  return { present: true, value: rawDimensions, source: 'legacy_dimensions' };
}

function assertNoUnknownLegacyDimensions(dimensions) {
  const supported = new Set(Object.values(LEGACY_DIMENSION_FIELDS));
  const unsupported = Object.keys(dimensions).filter(key => !supported.has(key));
  if (unsupported.length > 0) {
    throw new FrontmatterTaxonomyError(
      'UNSUPPORTED_LEGACY_DIMENSIONS',
      'A legacy dimensions nem ismert mezőt tartalmaz; a migrátor ezt nem törölheti automatikusan.',
      { unsupported_fields: unsupported.sort() }
    );
  }
}

function sameTerms(first, second) {
  if (first.length !== second.length) return false;
  const firstSet = new Set(first);
  return second.every(value => firstSet.has(value));
}

function chooseTerms({ dimension, canonical, legacyNested, legacyFlat }) {
  const candidates = [
    { name: 'canonical', ...canonical },
    { name: 'legacy_dimensions', ...legacyNested },
    { name: 'legacy_flat', ...legacyFlat }
  ].filter(candidate => candidate.present);

  if (candidates.length > 1) {
    const reference = candidates[0];
    const conflict = candidates.find(candidate => !sameTerms(reference.values, candidate.values));
    if (conflict) {
      throw new FrontmatterTaxonomyError(
        'FRONTMATTER_TAXONOMY_CONFLICT',
        `A(z) ${dimension.canonicalField} és a legacy taxonómiaértékek eltérnek.`,
        {
          canonical_field: dimension.canonicalField,
          legacy_field: dimension.legacyField,
          values: Object.fromEntries(candidates.map(candidate => [candidate.name, candidate.values]))
        }
      );
    }
  }

  const preferred = canonical.present
    ? canonical
    : (legacyNested.present ? legacyNested : legacyFlat);
  return {
    values: preferred.values,
    source: canonical.present
      ? 'canonical'
      : (legacyNested.present ? 'legacy_dimensions' : (legacyFlat.present ? 'legacy_flat' : 'empty'))
  };
}

/**
 * Read either the canonical flat properties or the historic nested shape and
 * return the legacy dimensions projection expected by the current portal.
 * If multiple representations occur in one note they must agree; otherwise
 * importing fails closed rather than choosing one silently.
 */
export function normalizeFrontmatterTaxonomy(frontmatter = {}) {
  if (!isPlainObject(frontmatter)) {
    throw new FrontmatterTaxonomyError(
      'INVALID_FRONTMATTER_TAXONOMY_ROOT',
      'A frontmatter taxonómiát csak YAML kulcs-érték leképezésből lehet olvasni.'
    );
  }

  const legacyDimensions = parseLegacyDimensions(frontmatter.dimensions);
  if (legacyDimensions.present) assertNoUnknownLegacyDimensions(legacyDimensions.value);

  const taxonomy = {};
  const dimensions = {};
  const sourceByDimension = {};
  const presentByDimension = {};
  let hasCanonicalTaxonomy = false;
  let hasLegacyFlatTaxonomy = false;

  for (const dimension of TAXONOMY_DIMENSIONS) {
    const canonical = readList(frontmatter, dimension.canonicalField, 'canonical');
    const legacyNested = legacyDimensions.present
      ? readList(legacyDimensions.value, dimension.legacyField, legacyDimensions.source)
      : { present: false, values: [] };
    const legacyFlat = readList(frontmatter, dimension.legacyField, 'legacy_flat');

    hasCanonicalTaxonomy ||= canonical.present;
    hasLegacyFlatTaxonomy ||= legacyFlat.present;

    const selected = chooseTerms({ dimension, canonical, legacyNested, legacyFlat });
    const isPresent = canonical.present || legacyNested.present || legacyFlat.present;
    if (dimension.required || isPresent) {
      taxonomy[dimension.canonicalField] = selected.values;
      dimensions[dimension.legacyField] = selected.values;
      sourceByDimension[dimension.id] = selected.source;
    }
    presentByDimension[dimension.id] = isPresent;
  }

  const schemaVersion = Number(frontmatter.schema_version);
  const taxonomySchemaVersion = Number(frontmatter.taxonomy_schema);
  const hasAllCanonicalFields = TAXONOMY_DIMENSIONS
    .filter(({ required }) => required)
    .every(({ canonicalField }) => hasOwn(frontmatter, canonicalField));

  return {
    taxonomy,
    dimensions,
    source_by_dimension: sourceByDimension,
    present_by_dimension: presentByDimension,
    has_canonical_taxonomy: hasCanonicalTaxonomy,
    has_legacy_dimensions: legacyDimensions.present,
    has_legacy_flat_taxonomy: hasLegacyFlatTaxonomy,
    needs_migration: legacyDimensions.present
      || hasLegacyFlatTaxonomy
      || !hasAllCanonicalFields
      || schemaVersion !== TAXONOMY_SCHEMA_VERSION
      || taxonomySchemaVersion !== TAXONOMY_SCHEMA_VERSION
  };
}

/**
 * Create the only taxonomy fields new vault files are allowed to write.
 * `dimensions` deliberately never appears here: it remains a DB projection
 * and a legacy read format only.
 */
export function createCanonicalTaxonomyFrontmatter(frontmatter = {}, { includePainPointTags = false } = {}) {
  const normalized = normalizeFrontmatterTaxonomy(frontmatter);
  const canonical = {
    schema_version: TAXONOMY_SCHEMA_VERSION,
    taxonomy_schema: TAXONOMY_SCHEMA_VERSION,
    [CANONICAL_TAXONOMY_FIELDS.industry]: normalized.taxonomy[CANONICAL_TAXONOMY_FIELDS.industry],
    [CANONICAL_TAXONOMY_FIELDS.technology]: normalized.taxonomy[CANONICAL_TAXONOMY_FIELDS.technology],
    [CANONICAL_TAXONOMY_FIELDS.audienceRole]: normalized.taxonomy[CANONICAL_TAXONOMY_FIELDS.audienceRole]
  };
  if (normalized.present_by_dimension.painPoint) {
    canonical[CANONICAL_TAXONOMY_FIELDS.painPoint] = normalized.taxonomy[CANONICAL_TAXONOMY_FIELDS.painPoint];
  }
  const painPointTerms = normalized.taxonomy[CANONICAL_TAXONOMY_FIELDS.painPoint] || [];
  if (includePainPointTags && painPointTerms.length > 0) {
    const tags = normalizeObsidianTags(frontmatter.tags);
    const generatedTags = createPainPointObsidianTags(painPointTerms);
    canonical.tags = [...new Set([...tags, ...generatedTags])];
  }
  return canonical;
}
