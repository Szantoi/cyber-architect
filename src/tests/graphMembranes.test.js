import { describe, expect, it } from 'vitest';
import { buildElasticClusterMembrane, buildElasticClusterMembranes, isInsideMembraneSupport } from '../utils/graphMembranes.js';

const knowledgeCluster = {
  id: 'content_type-0',
  key: 'tudástár',
  x: 273,
  y: 317,
  rx: 176,
  ry: 110
};

const members = [
  { id: 31, x: 273, y: 317, primaryGroupKey: 'tudástár' },
  { id: 33, x: 273, y: 266, primaryGroupKey: 'tudástár' }
];

describe('elastic graph membranes', () => {
  it('expands with a displaced member instead of projecting that member back into a static ellipse', () => {
    const initial = buildElasticClusterMembrane(knowledgeCluster, members);
    const displacedMembers = members.map(node => (
      node.id === 33 ? { ...node, x: 548, y: 266 } : node
    ));
    const displaced = buildElasticClusterMembrane(knowledgeCluster, displacedMembers);

    expect(displaced.bounds.maxX).toBeGreaterThan(initial.bounds.maxX + 100);
    expect(displaced.path).not.toBe(initial.path);
    expect(displaced.path.match(/ Q /g)).toHaveLength(16);
    displacedMembers.forEach(node => expect(isInsideMembraneSupport(displaced, node)).toBe(true));
  });

  it('keeps a readable minimum cell size for a one-node cluster', () => {
    const membrane = buildElasticClusterMembrane(
      { ...knowledgeCluster, key: 'blog', rx: 92, ry: 72 },
      [{ id: 32, x: 727, y: 317, primaryGroupKey: 'blog' }]
    );

    expect(membrane.bounds.maxX - membrane.bounds.minX).toBeGreaterThan(100);
    expect(membrane.bounds.maxY - membrane.bounds.minY).toBeGreaterThan(75);
    expect(isInsideMembraneSupport(membrane, { id: 32, x: 727, y: 317 })).toBe(true);
  });

  it('derives each membrane only from its own cluster members', () => {
    const blogCluster = { ...knowledgeCluster, id: 'content_type-1', key: 'blog', x: 727, y: 317 };
    const membranes = buildElasticClusterMembranes([knowledgeCluster, blogCluster], [
      ...members,
      { id: 32, x: 727, y: 317, primaryGroupKey: 'blog' }
    ]);

    expect(membranes).toHaveLength(2);
    expect(membranes.find(membrane => membrane.cluster.key === 'tudástár').center.x).toBe(273);
    expect(membranes.find(membrane => membrane.cluster.key === 'blog').center.x).toBe(727);
  });
});
