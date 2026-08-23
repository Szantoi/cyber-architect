import { describe, expect, it } from 'vitest';
import { buildGraphLayerEdgeGeometries, buildGraphLayerOverlayModel } from '../utils/graphLayerAdapter.js';

const documents = [
  { id: 31, slug: 'cad-alapok', title: 'CAD alapok', x: 180, y: 220 },
  { id: 32, slug: 'gyartasi-folyamat', title: 'Gyártási folyamat', x: 580, y: 320 }
];

const nodes = [
  { id: 'document:cad', label: 'CAD alapok', node_type: 'document', document_binding: { slug: 'cad-alapok' } },
  { id: 'document:flow', label: 'Gyártási folyamat', node_type: 'document', document_binding: { slug: 'gyartasi-folyamat' } },
  { id: 'task:TASK-004', label: 'CAD alapok', node_type: 'task' }
];

describe('graphLayerAdapter', () => {
  it('reuses explicitly bound Obsidian document points and keeps parallel DB arcs distinct', () => {
    const edges = [
      { id: 'depends', source_node_id: 'document:cad', target_node_id: 'document:flow' },
      { id: 'blocks', source_node_id: 'document:cad', target_node_id: 'document:flow' }
    ];
    const model = buildGraphLayerOverlayModel({ nodes: nodes.slice(0, 2), edges, documentNodes: documents });
    const geometries = buildGraphLayerEdgeGeometries(model.edges, model.positionByNodeId);

    expect(model.boundDocumentNodes.size).toBe(2);
    expect(model.satelliteNodes).toHaveLength(0);
    expect(model.positionByNodeId.get('document:cad')).toMatchObject({ x: 180, y: 220, kind: 'document', postId: 31 });
    expect(model.positionByNodeId.get('document:flow')).toMatchObject({ x: 580, y: 320, kind: 'document', postId: 32 });
    expect(geometries).toHaveLength(2);
    expect(new Set(geometries.map(item => item.path)).size).toBe(2);
  });

  it('does not guess a document binding from a matching label', () => {
    const model = buildGraphLayerOverlayModel({ nodes, edges: [], documentNodes: documents });

    expect(model.boundDocumentNodes.size).toBe(2);
    expect(model.satelliteNodes).toEqual([
      expect.objectContaining({ node: expect.objectContaining({ id: 'task:TASK-004' }) })
    ]);
    expect(model.positionByNodeId.get('task:TASK-004')).toMatchObject({ kind: 'satellite' });
  });
});
