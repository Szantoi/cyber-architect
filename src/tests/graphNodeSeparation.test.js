import { describe, expect, it } from 'vitest';
import { resolveMinimumNodeSeparation } from '../utils/graphNodeSeparation.js';

const distance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y);

describe('resolveMinimumNodeSeparation', () => {
  it('keeps the pinned dragged node under the pointer and pushes a collision away', () => {
    const nodes = resolveMinimumNodeSeparation([
      { id: 1, x: 500, y: 280 },
      { id: 2, x: 500, y: 280 }
    ], {
      minDistance: 96,
      pinnedNodeId: 1,
      canvas: { width: 1000, height: 560 },
      iterations: 8
    });

    expect(nodes[0]).toMatchObject({ x: 500, y: 280 });
    expect(distance(nodes[0], nodes[1])).toBeGreaterThanOrEqual(95.9);
  });

  it('keeps repelled points inside the graph world near a canvas edge', () => {
    const canvas = { width: 240, height: 140 };
    const nodes = resolveMinimumNodeSeparation([
      { id: 1, x: 20, y: 28 },
      { id: 2, x: 20, y: 28 },
      { id: 3, x: 21, y: 29 }
    ], { minDistance: 54, canvas, iterations: 10 });

    nodes.forEach((node) => {
      expect(node.x).toBeGreaterThanOrEqual(20);
      expect(node.x).toBeLessThanOrEqual(canvas.width - 20);
      expect(node.y).toBeGreaterThanOrEqual(28);
      expect(node.y).toBeLessThanOrEqual(canvas.height - 50);
    });
  });
});
