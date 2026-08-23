import { getTreeFolders } from './taxonomy.js';
import { presentationProfileOf } from './presentationProfile.js';

export const ALL_FILTER = 'ALL';

export const normalizeGraphDimensions = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const normalizeGraphDocument = (document) => ({
  ...document,
  dimensions: normalizeGraphDimensions(document?.dimensions)
});

export const getRagTier = (result) => {
  const hasKeyword = Number(result?.keywordScore) > 0;
  const hasSemantic = Number(result?.cosineSimilarity) >= 0.08;

  if (hasKeyword && hasSemantic) return 'hybrid';
  if (hasKeyword) return 'keyword';
  if (hasSemantic) return 'semantic';
  return 'hybrid';
};

export const getRagTierCounts = (results = []) => {
  const counts = { all: results.length, keyword: 0, semantic: 0, hybrid: 0 };
  results.forEach((result) => {
    counts[getRagTier(result)] += 1;
  });
  return counts;
};

export const matchesSmartCollection = (document, filter) => {
  const corpus = `${document?.title || ''} ${document?.slug || ''} ${document?.summary || ''} ${document?.category || ''}`;

  if (filter === 'featured') {
    return presentationProfileOf(document) === 'article' || /esettanulmány|bemutató|kiemelt/i.test(corpus);
  }
  if (filter === 'audio') return Boolean(document?.audio_url);
  if (filter === 'video') return Boolean(document?.video_url);
  if (filter === 'specs') {
    return presentationProfileOf(document) === 'knowledge' && /spec|specifikáció|architektúra|rendszerterv/i.test(corpus);
  }
  return true;
};

export const matchesGraphDimension = (document, dimension, value) => {
  if (value === ALL_FILTER) return true;
  const normalized = normalizeGraphDocument(document);
  return Array.isArray(normalized.dimensions?.[dimension])
    && normalized.dimensions[dimension].includes(value);
};

export const matchesGraphFacets = (document, {
  pivotMode = 'drive',
  folder = ALL_FILTER,
  smartFilters = [],
  iparag = ALL_FILTER,
  technology = ALL_FILTER,
  audience = ALL_FILTER,
  ragTier = 'all',
  hasQuery = false
} = {}) => {
  const normalized = normalizeGraphDocument(document);
  const dimensions = normalized.dimensions;

  if (hasQuery && ragTier !== 'all' && getRagTier(normalized) !== ragTier) return false;
  if (smartFilters.some((filter) => !matchesSmartCollection(normalized, filter))) return false;
  if (folder !== ALL_FILTER && !getTreeFolders(normalized, pivotMode).includes(folder)) return false;
  if (iparag !== ALL_FILTER && !dimensions.iparag?.includes(iparag)) return false;
  if (technology !== ALL_FILTER && !dimensions.technologia?.includes(technology)) return false;
  if (audience !== ALL_FILTER && !dimensions.celcsoport?.includes(audience)) return false;
  return true;
};

export const groupGraphDocumentsByFolder = (documents = [], pivotMode = 'drive') => {
  const grouped = new Map();
  documents.forEach((source) => {
    const document = normalizeGraphDocument(source);
    getTreeFolders(document, pivotMode).forEach((folder) => {
      if (!grouped.has(folder)) grouped.set(folder, []);
      grouped.get(folder).push(document);
    });
  });
  return [...grouped.entries()].sort(([first], [second]) => first.localeCompare(second, 'hu'));
};

export const buildGraphFacetOptions = (documents = [], dimension) => {
  const counts = new Map();
  documents.forEach((source) => {
    const document = normalizeGraphDocument(source);
    const values = Array.isArray(document.dimensions?.[dimension]) ? document.dimensions[dimension] : [];
    values.forEach((value) => {
      if (!value) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });
  });
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((first, second) => first.value.localeCompare(second.value, 'hu'));
};

export const graphSorters = {
  rag: (first, second) => (
    Number(second.hybridRelevanceScore ?? second.scorePercentage ?? 0)
    - Number(first.hybridRelevanceScore ?? first.scorePercentage ?? 0)
    || first.title.localeCompare(second.title, 'hu')
  ),
  newest: (first, second) => String(second.created_at || '').localeCompare(String(first.created_at || ''))
    || first.title.localeCompare(second.title, 'hu'),
  title: (first, second) => first.title.localeCompare(second.title, 'hu')
};
