const DEFAULT_CANVAS = { width: 1000, height: 560 };

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(value, maximum));
const round = (value) => Math.round(value * 10) / 10;
const nodePadding = (node) => ({
  horizontal: node?.isRoot ? 28 : 20,
  top: 28,
  bottom: node?.isRoot ? 60 : 50
});

const deterministicDirection = (firstId, secondId) => {
  const source = `${firstId}:${secondId}`;
  const seed = [...source].reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 17);
  const angle = (seed % 360) * (Math.PI / 180);
  return { x: Math.cos(angle), y: Math.sin(angle) };
};

/**
 * Keeps a node inside the usable part of an SVG graph canvas. The padding is
 * intentionally shared by dragging and collision resolution, so a repelled
 * node never escapes the world that the user can zoom around.
 */
export const clampGraphNodePosition = (position, node, canvas = DEFAULT_CANVAS) => {
  const padding = nodePadding(node);
  return {
    x: round(clamp(Number(position?.x) || 0, padding.horizontal, canvas.width - padding.horizontal)),
    y: round(clamp(Number(position?.y) || 0, padding.top, canvas.height - padding.bottom))
  };
};

/**
 * Deterministically separates only colliding nodes. This is deliberately not
 * a continuous force simulation: manually arranged points stay where the
 * reader put them, while a dragged node can remain pinned under the pointer.
 */
export const resolveMinimumNodeSeparation = (nodes, {
  minDistance = 76,
  canvas = DEFAULT_CANVAS,
  pinnedNodeId = null,
  iterations = 5
} = {}) => {
  const requiredDistance = Math.max(0, Number(minDistance) || 0);
  const pinnedId = pinnedNodeId === null || pinnedNodeId === undefined ? null : String(pinnedNodeId);
  const resolved = (nodes || []).map(node => ({
    ...node,
    ...clampGraphNodePosition(node, node, canvas)
  }));

  if (requiredDistance <= 0 || resolved.length < 2) return resolved;

  const passCount = Math.max(1, Math.min(12, Math.round(Number(iterations) || 1)));
  for (let pass = 0; pass < passCount; pass += 1) {
    let moved = false;
    for (let firstIndex = 0; firstIndex < resolved.length - 1; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < resolved.length; secondIndex += 1) {
        const first = resolved[firstIndex];
        const second = resolved[secondIndex];
        const offsetX = second.x - first.x;
        const offsetY = second.y - first.y;
        const actualDistance = Math.hypot(offsetX, offsetY);
        if (actualDistance >= requiredDistance - 0.05) continue;

        const unit = actualDistance > 0.001
          ? { x: offsetX / actualDistance, y: offsetY / actualDistance }
          : deterministicDirection(first.id, second.id);
        const correction = requiredDistance - actualDistance;
        const firstPinned = pinnedId === String(first.id);
        const secondPinned = pinnedId === String(second.id);

        if (!firstPinned || secondPinned) {
          const distance = secondPinned ? correction : correction / 2;
          Object.assign(first, clampGraphNodePosition({
            x: first.x - (unit.x * distance),
            y: first.y - (unit.y * distance)
          }, first, canvas));
        }
        if (!secondPinned || firstPinned) {
          const distance = firstPinned ? correction : correction / 2;
          Object.assign(second, clampGraphNodePosition({
            x: second.x + (unit.x * distance),
            y: second.y + (unit.y * distance)
          }, second, canvas));
        }
        moved = true;
      }
    }
    if (!moved) break;
  }

  return resolved;
};
