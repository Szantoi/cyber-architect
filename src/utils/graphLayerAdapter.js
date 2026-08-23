const DEFAULT_CANVAS = Object.freeze({ width: 1000, height: 560 });

const text = value => String(value ?? '').trim();
const numericId = value => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

function hash(value) {
  let output = 0;
  for (const character of text(value)) output = ((output << 5) - output) + character.charCodeAt(0);
  return Math.abs(output);
}

function centerOf(points, canvas) {
  if (!points.length) return { x: canvas.width / 2, y: canvas.height / 2 };
  const total = points.reduce((current, point) => ({ x: current.x + point.x, y: current.y + point.y }), { x: 0, y: 0 });
  return { x: total.x / points.length, y: total.y / points.length };
}

function fallbackPosition(node, index, count, basePositions, canvas) {
  const center = centerOf(basePositions, canvas);
  const slots = Math.max(1, count);
  const angle = ((Math.PI * 2 * index) / slots) - (Math.PI / 2) + ((hash(node.id) % 11) - 5) * 0.035;
  const radius = 118 + (Math.floor(index / 10) * 54);
  return {
    x: Math.max(28, Math.min(canvas.width - 28, center.x + Math.cos(angle) * radius)),
    y: Math.max(32, Math.min(canvas.height - 42, center.y + Math.sin(angle) * radius))
  };
}

/**
 * A DB graph node may explicitly bind to an imported Markdown post. This
 * adapter deliberately accepts only that server-validated binding; it never
 * guesses from a title, slug, or a source path in the browser.
 */
export function boundPostId(node, documentNodes = []) {
  const directPostId = numericId(node?.document_binding?.post_id);
  if (directPostId) return directPostId;
  const bindingSlug = text(node?.document_binding?.slug);
  if (!bindingSlug) return null;
  const document = documentNodes.find(item => text(item?.slug) === bindingSlug);
  return numericId(document?.id);
}

/**
 * Adapts a typed graph layer onto the physical positions of the currently
 * visible Obsidian wikilink canvas. Markdown-bound graph nodes reuse the one
 * document point; independent DB entities become small satellite nodes.
 */
export function buildGraphLayerOverlayModel({
  nodes = [],
  edges = [],
  documentNodes = [],
  canvas = DEFAULT_CANVAS
} = {}) {
  const documentPositions = new Map();
  for (const document of documentNodes) {
    const postId = numericId(document?.id);
    if (!postId || !Number.isFinite(document?.x) || !Number.isFinite(document?.y)) continue;
    documentPositions.set(postId, { x: Number(document.x), y: Number(document.y), document });
  }

  const nodeById = new Map(nodes.map(node => [String(node.id), node]));
  const bound = [];
  const satellites = [];
  for (const node of nodes) {
    const postId = boundPostId(node, documentNodes);
    const documentPosition = postId ? documentPositions.get(postId) : null;
    if (documentPosition) bound.push({ node, postId, ...documentPosition });
    else if (!postId) satellites.push(node);
  }

  const positionByNodeId = new Map();
  const boundDocumentNodes = new Map();
  for (const item of bound) {
    positionByNodeId.set(String(item.node.id), { x: item.x, y: item.y, kind: 'document', postId: item.postId });
    const current = boundDocumentNodes.get(item.postId) || [];
    current.push(item.node);
    boundDocumentNodes.set(item.postId, current);
  }

  const basePositions = [...documentPositions.values()];
  const satelliteNodes = satellites.map((node, index) => {
    const position = fallbackPosition(node, index, satellites.length, basePositions, canvas);
    const item = { node, ...position, kind: 'satellite' };
    positionByNodeId.set(String(node.id), item);
    return item;
  });

  const visibleEdges = edges.filter(edge => (
    positionByNodeId.has(String(edge.source_node_id))
    && positionByNodeId.has(String(edge.target_node_id))
  ));

  return {
    nodeById,
    positionByNodeId,
    boundDocumentNodes,
    satelliteNodes,
    edges: visibleEdges,
    hiddenBoundNodeCount: nodes.length - bound.length - satellites.length
  };
}

function pathPoint(source, target, curvature) {
  const samePoint = Math.hypot(source.x - target.x, source.y - target.y) < 2;
  if (samePoint) {
    const loop = 44 + Math.abs(curvature);
    return {
      path: `M ${source.x + 12} ${source.y - 7} C ${source.x + loop} ${source.y - loop}, ${source.x - loop} ${source.y - loop}, ${source.x - 12} ${source.y - 7}`,
      labelX: source.x,
      labelY: source.y - loop - 8
    };
  }
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const unitX = deltaX / distance;
  const unitY = deltaY / distance;
  const startX = source.x + unitX * 15;
  const startY = source.y + unitY * 15;
  const endX = target.x - unitX * 18;
  const endY = target.y - unitY * 18;
  const controlX = (startX + endX) / 2 - unitY * curvature;
  const controlY = (startY + endY) / 2 + unitX * curvature;
  return {
    path: `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`,
    labelX: (startX + (2 * controlX) + endX) / 4,
    labelY: (startY + (2 * controlY) + endY) / 4
  };
}

/** Keeps parallel arcs separate even if two DB nodes share one visual note. */
export function buildGraphLayerEdgeGeometries(edges = [], positionByNodeId = new Map()) {
  const byPair = new Map();
  for (const edge of edges) {
    const pairKey = [String(edge.source_node_id), String(edge.target_node_id)].sort().join('::');
    const group = byPair.get(pairKey) || [];
    group.push(edge);
    byPair.set(pairKey, group);
  }

  const geometries = [];
  for (const group of byPair.values()) {
    const ordered = [...group].sort((first, second) => text(first.id).localeCompare(text(second.id)));
    const center = (ordered.length - 1) / 2;
    ordered.forEach((edge, index) => {
      const source = positionByNodeId.get(String(edge.source_node_id));
      const target = positionByNodeId.get(String(edge.target_node_id));
      if (!source || !target) return;
      const direction = text(edge.source_node_id).localeCompare(text(edge.target_node_id)) <= 0 ? 1 : -1;
      const curvature = (index - center || (ordered.length > 1 ? 0.5 : 0)) * 34 * direction;
      geometries.push({ edge, source, target, ...pathPoint(source, target, curvature) });
    });
  }
  return geometries;
}
