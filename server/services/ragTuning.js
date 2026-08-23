/**
 * Canonical RAG tuning defaults and safe coercion for persisted/admin values.
 *
 * This module is intentionally standalone: consumers can opt in without
 * changing the current RAG runtime behavior.
 */

export const RAG_TUNING_LIMITS = Object.freeze({
  knowledge_semantic_weight: Object.freeze({ min: 0, max: 1 }),
  knowledge_keyword_weight: Object.freeze({ min: 0, max: 1 }),
  knowledge_title_bonus: Object.freeze({ min: 0, max: 1 }),
  knowledge_min_score: Object.freeze({ min: 0, max: 1 }),
  knowledge_min_semantic_score: Object.freeze({ min: 0, max: 1 }),
  chunk_semantic_weight: Object.freeze({ min: 0, max: 1 }),
  chunk_semantic_threshold: Object.freeze({ min: 0, max: 1 }),
  chunk_min_tokens: Object.freeze({ min: 1, max: 1000 }),
  chunk_min_relevance: Object.freeze({ min: 0, max: 100 }),
  embedding_title_weight: Object.freeze({ min: 0, max: 10 }),
  embedding_summary_weight: Object.freeze({ min: 0, max: 10 }),
  embedding_content_char_limit: Object.freeze({ min: 0, max: 10000 })
});

export const DEFAULT_RAG_TUNING = Object.freeze({
  knowledge_semantic_weight: 0.4,
  knowledge_keyword_weight: 0.5,
  knowledge_title_bonus: 0.3,
  knowledge_min_score: 0.08,
  knowledge_min_semantic_score: 0.12,
  chunk_semantic_weight: 0.6,
  chunk_semantic_threshold: 0.18,
  chunk_min_tokens: 18,
  chunk_min_relevance: 35,
  chunk_include_heading_context: false,
  embedding_title_weight: 2,
  embedding_summary_weight: 2,
  embedding_content_char_limit: 3000
});

const INTEGER_FIELDS = new Set([
  'chunk_min_tokens',
  'chunk_min_relevance',
  'embedding_title_weight',
  'embedding_summary_weight',
  'embedding_content_char_limit'
]);

function asObject(value) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function readValue(source, field) {
  try {
    return Object.prototype.hasOwnProperty.call(source, field) ? source[field] : undefined;
  } catch {
    return undefined;
  }
}

function parseNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;

  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value !== 'string') return null;

  switch (value.trim().toLowerCase()) {
    case 'true':
    case '1':
    case 'yes':
    case 'on':
      return true;
    case 'false':
    case '0':
    case 'no':
    case 'off':
      return false;
    default:
      return null;
  }
}

function normalizeNumber(source, field) {
  const fallback = DEFAULT_RAG_TUNING[field];
  const parsed = parseNumber(readValue(source, field));
  const { min, max } = RAG_TUNING_LIMITS[field];

  if (
    parsed === null
    || parsed < min
    || parsed > max
    || (INTEGER_FIELDS.has(field) && !Number.isSafeInteger(parsed))
  ) {
    return fallback;
  }

  return parsed;
}

/**
 * Return a complete, bounded configuration from an untrusted settings payload.
 * Invalid, missing, or out-of-range fields fall back to the existing behavior.
 *
 * @param {unknown} input Settings object, JSON object string, or arbitrary value.
 * @returns {typeof DEFAULT_RAG_TUNING}
 */
export function normalizeRagTuning(input) {
  const source = asObject(input);
  const normalized = {};

  for (const field of Object.keys(RAG_TUNING_LIMITS)) {
    normalized[field] = normalizeNumber(source, field);
  }

  const headingContext = parseBoolean(readValue(source, 'chunk_include_heading_context'));
  normalized.chunk_include_heading_context = headingContext === null
    ? DEFAULT_RAG_TUNING.chunk_include_heading_context
    : headingContext;

  return normalized;
}
