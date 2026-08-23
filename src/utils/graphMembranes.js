const DEFAULT_CANVAS = { width: 1000, height: 560 };
const DEFAULT_SIDE_COUNT = 16;
const DEFAULT_CLEARANCE = 26;
const INNER_MEMBRANE_INSET = 10;

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(value, maximum));
const round = (value) => Math.round(value * 10) / 10;
const isPoint = (point) => Number.isFinite(point?.x) && Number.isFinite(point?.y);
const dot = (point, normal) => (point.x * normal.x) + (point.y * normal.y);
const midpoint = (first, second) => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2
});

const nodeVisualRadius = (node) => (node?.isRoot ? 30 : 20);

const smoothClosedPath = (points) => {
  if (!points.length) return '';
  const start = midpoint(points[points.length - 1], points[0]);
  let path = `M ${round(start.x)} ${round(start.y)}`;
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const end = midpoint(point, next);
    path += ` Q ${round(point.x)} ${round(point.y)} ${round(end.x)} ${round(end.y)}`;
  });
  return `${path} Z`;
};

const getCenter = (points, fallback) => {
  if (!points.length) return { x: fallback.x, y: fallback.y };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
};

const getMinimumSupport = (normal, cluster) => {
  const minRx = clamp((cluster?.rx || 92) * 0.38, 54, 96);
  const minRy = clamp((cluster?.ry || 62) * 0.56, 40, 76);
  return Math.sqrt(((minRx * normal.x) ** 2) + ((minRy * normal.y) ** 2));
};

const buildDirections = (sideCount) => Array.from({ length: sideCount }, (_, index) => {
  const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / sideCount);
  return { x: Math.cos(angle), y: Math.sin(angle) };
});

const intersectSupportLines = (first, firstSupport, second, secondSupport) => {
  const determinant = (first.x * second.y) - (first.y * second.x);
  if (Math.abs(determinant) < 0.0001) {
    return {
      x: (first.x * firstSupport) + (second.x * secondSupport),
      y: (first.y * firstSupport) + (second.y * secondSupport)
    };
  }
  return {
    x: ((firstSupport * second.y) - (first.y * secondSupport)) / determinant,
    y: ((first.x * secondSupport) - (firstSupport * second.x)) / determinant
  };
};

const supportVertices = (center, directions, supports) => directions.map((normal, index) => {
  const nextIndex = (index + 1) % directions.length;
  const vertex = intersectSupportLines(normal, supports[index], directions[nextIndex], supports[nextIndex]);
  return { x: center.x + vertex.x, y: center.y + vertex.y };
});

const getBounds = (points) => ({
  minX: Math.min(...points.map(point => point.x)),
  maxX: Math.max(...points.map(point => point.x)),
  minY: Math.min(...points.map(point => point.y)),
  maxY: Math.max(...points.map(point => point.y))
});

/**
 * Derives a fixed-command, padded support polygon from a cluster's current
 * node positions. The support lines contain every member, so the outline can
 * expand with a dragged point instead of projecting that point back into a
 * static ellipse.
 */
export const buildElasticClusterMembrane = (cluster, nodes, {
  canvas = DEFAULT_CANVAS,
  sideCount = DEFAULT_SIDE_COUNT,
  clearance = DEFAULT_CLEARANCE
} = {}) => {
  const members = (nodes || []).filter(isPoint);
  const fallbackCenter = { x: cluster?.x || canvas.width / 2, y: cluster?.y || canvas.height / 2 };
  const center = getCenter(members, fallbackCenter);
  const directions = buildDirections(Math.max(8, sideCount));
  const supports = directions.map((normal) => Math.max(
    getMinimumSupport(normal, cluster),
    ...members.map((node) => dot({ x: node.x - center.x, y: node.y - center.y }, normal) + nodeVisualRadius(node) + clearance)
  ));
  const outerPoints = supportVertices(center, directions, supports).map(point => ({
    x: clamp(point.x, 4, canvas.width - 4),
    y: clamp(point.y, 4, canvas.height - 4)
  }));
  const innerSupports = supports.map(support => Math.max(12, support - INNER_MEMBRANE_INSET));
  const innerPoints = supportVertices(center, directions, innerSupports).map(point => ({
    x: clamp(point.x, 6, canvas.width - 6),
    y: clamp(point.y, 6, canvas.height - 6)
  }));
  const bounds = getBounds(outerPoints);

  return {
    key: cluster?.key,
    center: { x: round(center.x), y: round(center.y) },
    outerPoints,
    innerPoints,
    path: smoothClosedPath(outerPoints),
    innerPath: smoothClosedPath(innerPoints),
    bounds: Object.fromEntries(Object.entries(bounds).map(([key, value]) => [key, round(value)])),
    labelX: round(center.x),
    labelY: round(clamp(bounds.minY - 22, 40, canvas.height - 22)),
    safePadding: clearance
  };
};

export const buildElasticClusterMembranes = (clusters, nodes, options) => (clusters || []).map((cluster) => ({
  cluster,
  ...buildElasticClusterMembrane(
    cluster,
    (nodes || []).filter(node => node.primaryGroupKey === cluster.key),
    options
  )
}));

export const isInsideMembraneSupport = (membrane, node) => {
  if (!membrane || !isPoint(node)) return false;
  const directions = buildDirections(membrane.outerPoints?.length || DEFAULT_SIDE_COUNT);
  const point = { x: node.x - membrane.center.x, y: node.y - membrane.center.y };
  const supports = directions.map((normal, index) => {
    const vertex = membrane.outerPoints[index];
    return dot({ x: vertex.x - membrane.center.x, y: vertex.y - membrane.center.y }, normal);
  });
  return directions.every((normal, index) => dot(point, normal) + nodeVisualRadius(node) <= supports[index] + 0.5);
};
