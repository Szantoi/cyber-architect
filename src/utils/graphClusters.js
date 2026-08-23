import { getTreeFolders } from './taxonomy.js';
import { presentationProfileOf } from './presentationProfile.js';

export const GRAPH_GROUPING_OPTIONS = Object.freeze([
  {
    id: 'content_type',
    // The identifier is retained for saved legacy UI preferences. It now
    // groups the unified model by reader-facing presentation profile.
    label: 'MEGJELENÍTÉSI PROFIL',
    detail: 'TUDÁSTÁR / CIKK'
  },
  {
    id: 'drive',
    label: 'DRIVE MAPPÁK',
    detail: 'FORRÁSMAPPA SZERINT'
  },
  {
    id: 'topic',
    label: 'TÉMAKÖRÖK',
    detail: 'TARTALMI RÉSZHALMAZOK'
  },
  {
    id: 'industry',
    label: 'IPARÁGAK',
    detail: 'ÜZLETI KONTEXTUS'
  },
  {
    id: 'technology',
    label: 'TECHNOLÓGIÁK',
    detail: 'ESZKÖZ / MÓDSZER SZERINT'
  },
  {
    id: 'audience',
    label: 'CÉLCSOPORTOK',
    detail: 'SZEREPKÖR SZERINT'
  }
]);

const FALLBACK_GROUPING = 'content_type';
const GROUP_COLORS = ['#00fbfb', '#ff00ff', '#80ff00', '#ffad22', '#38bdf8', '#c084fc', '#fb7185', '#2dd4bf'];
const DEFAULT_CANVAS = { width: 1000, height: 560 };

const cleanText = (value) => String(value ?? '').trim();
const groupKeyFor = (value) => cleanText(value).toLocaleLowerCase('hu-HU');
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(value, maximum));

const typeOf = (document) => presentationProfileOf(document);

const groupingValues = (document, grouping) => {
  if (grouping === 'content_type') return [typeOf(document) === 'article' ? 'CIKK' : 'TUDÁSTÁR'];
  if (grouping === 'audience') {
    const values = Array.isArray(document?.dimensions?.celcsoport) ? document.dimensions.celcsoport : [];
    return values.length ? values : ['ÁLTALÁNOS CÉLCSOPORT'];
  }

  const pivotByGrouping = {
    drive: 'drive',
    topic: 'topic',
    industry: 'industry',
    technology: 'tech'
  };
  const pivot = pivotByGrouping[grouping] || 'drive';
  return getTreeFolders(document, pivot);
};

/**
 * Returns the group labels a document belongs to. The first label is the
 * visual primary group; remaining values are intentionally retained so the
 * UI can disclose overlapping taxonomy membership without duplicating nodes.
 */
export const getGraphGroupMemberships = (document, grouping = FALLBACK_GROUPING) => {
  const unique = [];
  const seen = new Set();

  for (const value of groupingValues(document, grouping)) {
    const label = cleanText(value);
    const key = groupKeyFor(label);
    if (label && !seen.has(key)) {
      seen.add(key);
      unique.push(label);
    }
  }

  return unique.length ? unique : ['NEM BESOROLT'];
};

const groupSort = (grouping) => (first, second) => {
  if (grouping === 'content_type') {
    const order = { TUDÁSTÁR: 0, CIKK: 1 };
    return (order[first.label] ?? 99) - (order[second.label] ?? 99);
  }
  return first.label.localeCompare(second.label, 'hu');
};

const getGrid = (count, canvas) => {
  const columns = count <= 2 ? Math.max(1, count) : count <= 6 ? 3 : count <= 12 ? 4 : 5;
  const rows = Math.max(1, Math.ceil(count / columns));
  const insetX = 46;
  const top = 92;
  const bottom = 44;
  const cellWidth = (canvas.width - (insetX * 2)) / columns;
  const cellHeight = (canvas.height - top - bottom) / rows;

  return { columns, rows, insetX, top, cellWidth, cellHeight };
};

const positionGroupMembers = (entries, cluster) => entries.map((entry, index) => {
  if (index === 0) {
    return {
      ...entry,
      x: cluster.x,
      y: cluster.y,
      isRoot: false
    };
  }

  const ringIndex = index - 1;
  const ring = Math.floor(ringIndex / 8);
  const ringStart = ring * 8;
  const itemsInRing = Math.min(8, entries.length - 1 - ringStart);
  const angle = (-Math.PI / 2) + ((Math.PI * 2 * (ringIndex - ringStart)) / itemsInRing) + (ring * 0.27);
  const scale = Math.min(0.82, 0.43 + (ring * 0.2));

  return {
    ...entry,
    x: cluster.x + (Math.cos(angle) * cluster.rx * scale),
    y: cluster.y + (Math.sin(angle) * cluster.ry * scale),
    isRoot: false
  };
});

/**
 * Builds an overview layout with stable, non-overlapping visual clusters.
 * Nodes with multi-value taxonomy membership retain all memberships but are
 * plotted once inside their first (primary) group for visual legibility.
 */
export const buildArchiveGraphClusters = (documents, {
  grouping = FALLBACK_GROUPING,
  canvas = DEFAULT_CANVAS
} = {}) => {
  const safeGrouping = GRAPH_GROUPING_OPTIONS.some(option => option.id === grouping)
    ? grouping
    : FALLBACK_GROUPING;
  const groups = new Map();

  for (const document of documents || []) {
    const memberships = getGraphGroupMemberships(document, safeGrouping);
    const primaryLabel = memberships[0];
    const primaryKey = groupKeyFor(primaryLabel);
    const entries = groups.get(primaryKey) || {
      key: primaryKey,
      label: primaryLabel,
      documents: []
    };
    entries.documents.push({
      ...document,
      primaryGroupKey: primaryKey,
      primaryGroupLabel: primaryLabel,
      groupMemberships: memberships,
      secondaryGroupMemberships: memberships.slice(1)
    });
    groups.set(primaryKey, entries);
  }

  const sortedGroups = [...groups.values()].sort(groupSort(safeGrouping));
  const grid = getGrid(sortedGroups.length, canvas);
  const worldScale = Math.max(1, canvas.width / DEFAULT_CANVAS.width);
  const clusters = sortedGroups.map((group, index) => {
    const column = index % grid.columns;
    const row = Math.floor(index / grid.columns);
    const x = grid.insetX + (grid.cellWidth * (column + 0.5));
    const y = grid.top + (grid.cellHeight * (row + 0.53));
    const rx = clamp(grid.cellWidth * 0.41, 42 * worldScale, 176 * worldScale);
    const ry = clamp(grid.cellHeight * 0.34, 30 * worldScale, 110 * worldScale);
    const color = safeGrouping === 'content_type'
      ? (group.label === 'CIKK' ? '#ff00ff' : '#00fbfb')
      : GROUP_COLORS[index % GROUP_COLORS.length];
    const labelLimit = grid.rows >= 4 ? 15 : grid.rows >= 3 ? 18 : 24;
    const displayLabel = group.label.length > labelLimit
      ? `${group.label.slice(0, labelLimit - 1)}…`
      : group.label;

    return {
      id: `${safeGrouping}-${index}`,
      key: group.key,
      label: group.label,
      displayLabel,
      color,
      x,
      y,
      rx,
      ry,
      labelY: Math.max(54, y - ry - 17),
      labelSize: grid.rows >= 4 ? 7 : grid.rows >= 3 ? 8 : 9,
      documents: [...group.documents].sort((first, second) => first.title.localeCompare(second.title, 'hu'))
    };
  });

  return {
    grouping: safeGrouping,
    clusters: clusters.map(cluster => ({
      ...cluster,
      count: cluster.documents.length
    })),
    nodes: clusters.flatMap(cluster => positionGroupMembers(cluster.documents, cluster))
  };
};
