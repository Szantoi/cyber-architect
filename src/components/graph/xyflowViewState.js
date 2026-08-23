export const XYFLOW_VIEW_STATE_VERSION = 1;
export const XYFLOW_MIN_ZOOM = 0.12;
export const XYFLOW_MAX_ZOOM = 2.5;

const MAX_POSITION_ENTRIES = 300;
const MAX_COORDINATE = 1000000;

const text = value => String(value ?? '').trim();
const isRecord = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const finiteCoordinate = value => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && Math.abs(numeric) <= MAX_COORDINATE ? numeric : null;
};

export const normalizeXYFlowPosition = position => {
  if (!isRecord(position)) return null;
  const x = finiteCoordinate(position.x);
  const y = finiteCoordinate(position.y);
  return x === null || y === null ? null : { x, y };
};

export const normalizeXYFlowViewport = viewport => {
  if (!isRecord(viewport)) return null;
  const x = finiteCoordinate(viewport.x);
  const y = finiteCoordinate(viewport.y);
  const zoom = Number(viewport.zoom);
  if (x === null || y === null || !Number.isFinite(zoom)) return null;
  return { x, y, zoom: Math.max(XYFLOW_MIN_ZOOM, Math.min(XYFLOW_MAX_ZOOM, zoom)) };
};

export const emptyXYFlowViewState = () => ({
  version: XYFLOW_VIEW_STATE_VERSION,
  positions: {},
  viewport: null
});

export const normalizeXYFlowViewState = value => {
  if (!isRecord(value) || value.version !== XYFLOW_VIEW_STATE_VERSION) return null;
  const positions = Object.entries(isRecord(value.positions) ? value.positions : {})
    .slice(0, MAX_POSITION_ENTRIES)
    .reduce((result, [id, position]) => {
      const normalizedId = text(id);
      const normalizedPosition = normalizeXYFlowPosition(position);
      if (normalizedId && normalizedPosition) result[normalizedId] = normalizedPosition;
      return result;
    }, {});
  return {
    version: XYFLOW_VIEW_STATE_VERSION,
    positions,
    viewport: normalizeXYFlowViewport(value.viewport)
  };
};

export const readXYFlowViewState = storageKey => {
  const key = text(storageKey);
  if (!key || typeof window === 'undefined') return emptyXYFlowViewState();
  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) return emptyXYFlowViewState();
    return normalizeXYFlowViewState(JSON.parse(stored)) || emptyXYFlowViewState();
  } catch {
    return emptyXYFlowViewState();
  }
};

export const writeXYFlowViewState = (storageKey, state) => {
  const key = text(storageKey);
  const normalized = normalizeXYFlowViewState(state);
  if (!key || !normalized || typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
};
