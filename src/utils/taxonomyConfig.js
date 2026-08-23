import { presentationProfileOf } from './presentationProfile.js';

export const ALL_TAXONOMY_FILTER = 'ALL';

export const TAXONOMY_COLOR_TOKENS = Object.freeze([
  { id: 'cyan', label: 'NEON CYAN', hex: '#00FBFB' },
  { id: 'magenta', label: 'NEON MAGENTA', hex: '#FF00FF' },
  { id: 'green', label: 'PLASMA GREEN', hex: '#80FF00' },
  { id: 'amber', label: 'SIGNAL AMBER', hex: '#FFAD22' },
  { id: 'blue', label: 'ELECTRIC BLUE', hex: '#38BDF8' }
]);

const fallbackDimensions = [
  {
    id: 'iparag',
    frontmatter_key: 'iparag',
    label: 'IPARÁG',
    icon_key: 'factory',
    color: 'cyan',
    filterable: true,
    groupable: true,
    multi_select: true,
    sort_order: 10,
    terms: []
  },
  {
    id: 'technologia',
    frontmatter_key: 'technologia',
    label: 'TECHNOLÓGIA',
    icon_key: 'zap',
    color: 'cyan',
    filterable: true,
    groupable: true,
    multi_select: true,
    sort_order: 20,
    terms: []
  },
  {
    id: 'celcsoport',
    frontmatter_key: 'celcsoport',
    label: 'CÉLCSOPORT / SZEREPKÖR',
    icon_key: 'target',
    color: 'magenta',
    filterable: true,
    groupable: false,
    multi_select: true,
    sort_order: 30,
    terms: []
  }
];

const fallbackSmartCollections = [
  { id: 'featured', slug: 'featured', label: 'KIEMELT', icon_key: 'flame', color: 'cyan', sort_order: 10, rule_version: 1, legacy_key: 'featured' },
  { id: 'audio', slug: 'audio', label: 'AUDIO', icon_key: 'headphones', color: 'magenta', sort_order: 20, rule_version: 1, legacy_key: 'audio' },
  { id: 'video', slug: 'video', label: 'VIDEÓ', icon_key: 'video', color: 'blue', sort_order: 30, rule_version: 1, legacy_key: 'video' },
  { id: 'specs', slug: 'specs', label: 'SPEC', icon_key: 'code', color: 'green', sort_order: 40, rule_version: 1, legacy_key: 'specs' }
];

export const FALLBACK_TAXONOMY_CONFIG = Object.freeze({
  schema_version: 1,
  dimensions: fallbackDimensions,
  smart_collections: fallbackSmartCollections,
  relationships: []
});

const asArray = (value) => (Array.isArray(value) ? value : []);
const text = (value) => String(value ?? '').trim();
const textKey = (value) => text(value).toLocaleLowerCase('hu-HU');
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const isRecord = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const cloneFallback = () => JSON.parse(JSON.stringify(FALLBACK_TAXONOMY_CONFIG));

export const normalizeTaxonomyColor = (value, fallback = '#00FBFB') => {
  const raw = text(value);
  if (HEX_COLOR_PATTERN.test(raw)) return raw.toUpperCase();
  const tokenColor = TAXONOMY_COLOR_TOKENS.find(color => color.id === raw.toLowerCase());
  if (tokenColor) return tokenColor.hex;
  return HEX_COLOR_PATTERN.test(fallback) ? fallback.toUpperCase() : '#00FBFB';
};

export const getTaxonomyColor = (token, fallback = '#00FBFB') => (
  normalizeTaxonomyColor(token, fallback)
);

export const getTaxonomyColorToken = (value, fallback = 'cyan') => {
  const hex = normalizeTaxonomyColor(value);
  return TAXONOMY_COLOR_TOKENS.find(color => color.hex === hex)?.id || fallback;
};

const normalizeTerm = (term, dimension, index) => {
  const label = text(term?.label || term?.name || term?.slug || term?.id) || `CÍMKE ${index + 1}`;
  const slug = text(term?.slug || term?.id || label)
    .toLocaleLowerCase('hu-HU')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return {
    ...term,
    id: text(term?.id || `${dimension.id}:${slug || index + 1}`),
    slug: slug || `term-${index + 1}`,
    label,
    icon_key: text(term?.icon_key || dimension.icon_key || 'tag'),
    color: normalizeTaxonomyColor(term?.color || dimension.color || 'cyan'),
    parent_id: term?.parent_id ? text(term.parent_id) : '',
    sort_order: Number(term?.sort_order ?? index * 10) || 0,
    active: term?.active !== false
  };
};

const normalizeDimension = (dimension, index) => {
  const fallback = fallbackDimensions[index] || fallbackDimensions[0];
  const hasOwn = (key) => Object.hasOwn(dimension || {}, key);
  const id = text(dimension?.id || dimension?.frontmatter_key || fallback.id);
  const normalized = {
    ...fallback,
    ...dimension,
    id,
    frontmatter_key: text(dimension?.frontmatter_key || id || fallback.frontmatter_key),
    label: text(dimension?.label || dimension?.name || fallback.label),
    icon_key: text(dimension?.icon_key || fallback.icon_key),
    color: normalizeTaxonomyColor(dimension?.color || fallback.color),
    filterable: hasOwn('filterable') ? dimension.filterable !== false : fallback.filterable,
    groupable: hasOwn('groupable') ? dimension.groupable === true : fallback.groupable,
    multi_select: hasOwn('multi_select') ? dimension.multi_select !== false : fallback.multi_select,
    sort_order: Number(dimension?.sort_order ?? fallback.sort_order) || fallback.sort_order
  };
  normalized.terms = asArray(dimension?.terms).map((term, termIndex) => normalizeTerm(term, normalized, termIndex))
    .sort((first, second) => first.sort_order - second.sort_order || first.label.localeCompare(second.label, 'hu'));
  return normalized;
};

const normalizeSmartCollection = (collection, index) => {
  const fallback = fallbackSmartCollections[index] || fallbackSmartCollections[0];
  const label = text(collection?.label || collection?.name || fallback.label);
  const slug = text(collection?.slug || collection?.id || fallback.slug);
  const legacyRules = asArray(collection?.rules || collection?.criteria);
  const rawRule = isRecord(collection?.rule) ? collection.rule : null;
  const rule = rawRule || (legacyRules.length ? {
    type: text(collection?.rule_logic || collection?.logic).toLowerCase() === 'or' ? 'any' : 'all',
    rules: legacyRules
  } : null);
  const rules = legacyRules.length
    ? legacyRules
    : asArray(rawRule?.rules).length
      ? rawRule.rules
      : rawRule
        ? [rawRule]
        : [];
  const groupBy = isRecord(collection?.group_by)
    ? collection.group_by
    : text(collection?.group_by)
      ? { type: 'taxonomy_dimension', dimension_id: text(collection.group_by) }
      : { type: 'none' };
  const rawOverrides = collection?.membership_overrides || collection?.membershipOverrides;
  const membership_overrides = Array.isArray(rawOverrides)
    ? Object.fromEntries(rawOverrides
      .filter(item => item && ['include', 'exclude'].includes(text(item.mode).toLowerCase()))
      .map(item => [text(item.post_id ?? item.postId), text(item.mode).toLowerCase()])
      .filter(([postId]) => postId))
    : isRecord(rawOverrides)
      ? Object.fromEntries(Object.entries(rawOverrides)
        .filter(([postId, mode]) => postId && ['include', 'exclude'].includes(text(mode).toLowerCase()))
        .map(([postId, mode]) => [postId, text(mode).toLowerCase()]))
      : {};
  return {
    ...fallback,
    ...collection,
    id: text(collection?.id || slug || `smart-${index + 1}`),
    slug: slug || `smart-${index + 1}`,
    label,
    icon_key: text(collection?.icon_key || fallback.icon_key),
    color: normalizeTaxonomyColor(collection?.color || fallback.color),
    sort_order: Number(collection?.sort_order ?? fallback.sort_order) || fallback.sort_order,
    active: collection?.active !== false,
    name: text(collection?.name || label),
    rule,
    rules,
    rule_logic: rawRule?.type === 'any' ? 'or' : 'and',
    group_by: groupBy,
    membership_overrides,
    legacy_key: text(collection?.legacy_key || collection?.slug || collection?.id || fallback.legacy_key)
  };
};

/**
 * Turns a partial/old server payload into a safe client registry. The public
 * explorer can therefore keep working while a deployment is between the old
 * dimensions JSON and the new taxonomy API.
 */
export const normalizeTaxonomyConfig = (payload) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  const fallback = cloneFallback();
  const receivedDimensions = asArray(source.dimensions);
  const receivedTerms = asArray(source.terms);
  const receivedCollections = asArray(source.smart_collections || source.smartCollections);
  const hasSmartCollectionsField = Array.isArray(source.smart_collections) || Array.isArray(source.smartCollections);
  const dimensionsSource = receivedDimensions.length ? receivedDimensions : fallback.dimensions;

  return {
    schema_version: Number(source.schema_version || source.version || fallback.schema_version) || fallback.schema_version,
    config_version: text(source.config_version || source.version_id || ''),
    dimensions: dimensionsSource
      .map((dimension) => {
        // The public endpoint nests terms under each dimension. The admin
        // endpoint may return the same data as a normalized `terms` array;
        // accept both shapes without creating a second client registry model.
        if (asArray(dimension?.terms).length || !receivedTerms.length) return dimension;
        const dimensionId = text(dimension?.id || dimension?.frontmatter_key);
        return {
          ...dimension,
          terms: receivedTerms.filter((term) => (
            text(term?.dimension_id || term?.dimensionId) === dimensionId
          ))
        };
      })
      .map(normalizeDimension)
      .filter(dimension => dimension.id),
    smart_collections: (hasSmartCollectionsField ? receivedCollections : fallback.smart_collections)
      .map(normalizeSmartCollection)
      .filter(collection => collection.id)
      .sort((first, second) => first.sort_order - second.sort_order || first.label.localeCompare(second.label, 'hu')),
    relationships: asArray(source.relationships || source.relations || source.term_relations)
  };
};

const parseDimensions = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const dimensionKeys = (dimension) => {
  const identity = [dimension?.id, dimension?.frontmatter_key]
    .map(textKey)
    .filter(Boolean);
  const aliases = [];
  if (identity.some(key => ['iparag', 'industry', 'tax_industry'].includes(key))) {
    aliases.push('iparag', 'industry', 'tax_industry');
  }
  if (identity.some(key => ['technologia', 'technology', 'tax_technology'].includes(key))) {
    aliases.push('technologia', 'technology', 'tax_technology');
  }
  if (identity.some(key => ['celcsoport', 'audience', 'audience_role', 'tax_audience'].includes(key))) {
    aliases.push('celcsoport', 'audience', 'audience_role', 'tax_audience');
  }
  return [...new Set([
    text(dimension?.frontmatter_key),
    text(dimension?.id),
    ...aliases
  ].filter(Boolean))];
};

export const getDocumentDimensionValues = (document, dimension) => {
  const dimensions = parseDimensions(document?.dimensions);
  for (const key of dimensionKeys(dimension)) {
    const candidate = dimensions[key] ?? document?.[key];
    if (Array.isArray(candidate)) return candidate.map(text).filter(Boolean);
    if (candidate !== undefined && candidate !== null && text(candidate)) return [text(candidate)];
  }
  return [];
};

export const getTaxonomyTerm = (dimension, value) => {
  const comparable = textKey(value);
  if (!comparable) return null;
  return asArray(dimension?.terms).find((term) => [term.id, term.slug, term.label]
    .some(candidate => textKey(candidate) === comparable)) || null;
};

const comparableTermKey = (dimension, value) => {
  const term = getTaxonomyTerm(dimension, value);
  return textKey(term?.id || term?.slug || term?.label || value);
};

export const documentMatchesFacetValue = (document, dimension, selectedValue) => {
  if (!selectedValue || selectedValue === ALL_TAXONOMY_FILTER) return true;
  const selectedKey = comparableTermKey(dimension, selectedValue);
  return getDocumentDimensionValues(document, dimension)
    .some(value => comparableTermKey(dimension, value) === selectedKey);
};

export const documentMatchesFacets = (document, dimensions, selectedValues = {}) => (
  asArray(dimensions).every((dimension) => (
    !dimension.filterable || documentMatchesFacetValue(document, dimension, selectedValues[dimension.id])
  ))
);

export const buildTaxonomyFacetOptions = (documents, dimensions, selectedValues = {}) => {
  const result = {};
  const filterable = asArray(dimensions).filter(dimension => dimension.filterable);

  for (const dimension of filterable) {
    const counts = new Map();
    for (const document of asArray(documents)) {
      const matchesOtherFacets = filterable
        .filter(other => other.id !== dimension.id)
        .every(other => documentMatchesFacetValue(document, other, selectedValues[other.id]));
      if (!matchesOtherFacets) continue;
      for (const value of getDocumentDimensionValues(document, dimension)) {
        const term = getTaxonomyTerm(dimension, value);
        const key = comparableTermKey(dimension, value);
        // Keep the UI/API value canonical when the registry knows this term.
        // Legacy vault records may still contain a human label, but filters are
        // exchanged with the API as term id/slug rather than mutable labels.
        const current = counts.get(key) || {
          value: term?.id || term?.slug || value,
          label: term?.label || value,
          term,
          count: 0
        };
        current.count += 1;
        counts.set(key, current);
      }
    }
    result[dimension.id] = [...counts.values()]
      .sort((first, second) => first.label.localeCompare(second.label, 'hu'));
  }
  return result;
};

const legacySmartMatch = (document, key) => {
  const corpus = `${document?.title || ''} ${document?.slug || ''} ${document?.summary || ''} ${document?.category || ''}`;
  if (key === 'featured') return (document?.scorePercentage || 0) >= 84 || Boolean(document?.project_id) || Number(document?.published) === 1;
  if (key === 'audio') return Boolean(document?.audio_url);
  if (key === 'video') return Boolean(document?.video_url);
  if (key === 'specs') return presentationProfileOf(document) === 'knowledge' || /specifikacio|specification|architektura|architecture/i.test(corpus);
  return true;
};

const readRuleValue = (document, field, dimensions = []) => {
  const key = text(field);
  if (key === 'has_audio') return Boolean(document?.audio_url);
  if (key === 'has_video') return Boolean(document?.video_url);
  if (key === 'published') return Number(document?.published) === 1;
  if (key.startsWith('dimensions.')) {
    const dimensionKey = key.slice('dimensions.'.length);
    const dimension = dimensions.find(item => item.id === dimensionKey || item.frontmatter_key === dimensionKey)
      || { id: dimensionKey, frontmatter_key: dimensionKey };
    return getDocumentDimensionValues(document, dimension);
  }
  return document?.[key];
};

const valueMatchesTerm = (dimension, documentValue, requestedId) => {
  const documentTerm = getTaxonomyTerm(dimension, documentValue);
  const requestedTerm = getTaxonomyTerm(dimension, requestedId);
  const candidates = [
    documentValue,
    documentTerm?.id,
    documentTerm?.slug,
    documentTerm?.label
  ];
  const requested = [requestedId, requestedTerm?.id, requestedTerm?.slug, requestedTerm?.label];
  return candidates.some(candidate => requested.some(target => textKey(candidate) === textKey(target)));
};

const evaluateRule = (document, rule, dimensions = []) => {
  if (!rule || typeof rule !== 'object') return true;
  if (rule.type === 'all' || rule.type === 'any') {
    const children = asArray(rule.rules);
    return rule.type === 'any'
      ? children.some(child => evaluateRule(document, child, dimensions))
      : children.every(child => evaluateRule(document, child, dimensions));
  }
  if (rule.type === 'not') return !evaluateRule(document, rule.rule, dimensions);
  if (rule.type === 'taxonomy') {
    const dimension = asArray(dimensions).find(item => item.id === rule.dimension_id || item.frontmatter_key === rule.dimension_id);
    if (!dimension) return false;
    const values = getDocumentDimensionValues(document, dimension);
    const requested = asArray(rule.term_ids).filter(Boolean);
    const matched = requested.map(termId => values.some(value => valueMatchesTerm(dimension, value, termId)));
    if (rule.match === 'all') return matched.length > 0 && matched.every(Boolean);
    if (rule.match === 'none') return !matched.some(Boolean);
    return matched.some(Boolean);
  }
  if (rule.type === 'date') {
    const actual = new Date(document?.created_at || '');
    const expected = new Date(rule.value || '');
    if (Number.isNaN(actual.getTime()) || Number.isNaN(expected.getTime())) return false;
    return rule.operator === 'before' ? actual <= expected : actual >= expected;
  }
  const nestedRules = asArray(rule.rules || rule.conditions || rule.children);
  if (nestedRules.length) {
    const mode = text(rule.logic || rule.combinator || rule.operator).toLowerCase();
    return mode === 'or' || mode === 'any'
      ? nestedRules.some(child => evaluateRule(document, child, dimensions))
      : nestedRules.every(child => evaluateRule(document, child, dimensions));
  }

  const actual = readRuleValue(document, rule.field || rule.property || rule.dimension, dimensions);
  const operator = text(rule.operator || rule.op || 'equals').toLowerCase();
  const wanted = rule.value ?? rule.values ?? '';
  const actualValues = Array.isArray(actual) ? actual : [actual];
  const wantedValues = Array.isArray(wanted) ? wanted : [wanted];
  const hasComparableValue = actualValues.some(value => wantedValues.some(target => textKey(value) === textKey(target)));
  const textMatch = actualValues.some(value => wantedValues.some(target => textKey(value).includes(textKey(target))));

  if (operator === 'exists') return actualValues.some(value => Boolean(value));
  if (operator === 'not_exists') return !actualValues.some(value => Boolean(value));
  if (operator === 'not_equals' || operator === 'not_in') return !hasComparableValue;
  if (operator === 'contains' || operator === 'includes') return textMatch;
  if (operator === 'greater_than' || operator === 'gt') return Number(actual) > Number(wanted);
  if (operator === 'greater_or_equal' || operator === 'gte') return Number(actual) >= Number(wanted);
  if (operator === 'less_than' || operator === 'lt') return Number(actual) < Number(wanted);
  if (operator === 'less_or_equal' || operator === 'lte') return Number(actual) <= Number(wanted);
  return hasComparableValue;
};

export const matchesTaxonomySmartCollection = (document, collection, dimensions = []) => {
  const override = collection?.membership_overrides?.[String(document?.id ?? '')]
    || collection?.membershipOverrides?.[String(document?.id ?? '')];
  if (override === 'include') return true;
  if (override === 'exclude') return false;
  if (isRecord(collection?.rule)) return evaluateRule(document, collection.rule, dimensions);
  const rules = asArray(collection?.rules);
  if (rules.length) {
    const logic = text(collection?.rule_logic || collection?.logic).toLowerCase();
    return logic === 'or' || logic === 'any'
      ? rules.some(rule => evaluateRule(document, rule, dimensions))
      : rules.every(rule => evaluateRule(document, rule, dimensions));
  }
  const legacyKey = collection?.legacy_key || collection?.slug || collection?.id;
  if (!['featured', 'audio', 'video', 'specs'].includes(legacyKey)) return false;
  return legacySmartMatch(document, legacyKey);
};

export const normalizeTaxonomySlug = (value) => text(value)
  .toLocaleLowerCase('hu-HU')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '');
