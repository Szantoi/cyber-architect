import React, { useMemo } from 'react';
import { buildElasticClusterMembrane } from '../../utils/graphMembranes.js';
import { buildGraphLayerEdgeGeometries, buildGraphLayerOverlayModel } from '../../utils/graphLayerAdapter.js';

const text = value => String(value ?? '').trim();
const safeColor = value => /^#[0-9a-f]{6}$/i.test(text(value)) ? value : '#80ff00';
const short = (value, maximum = 17) => {
  const label = text(value);
  return label.length > maximum ? `${label.slice(0, Math.max(1, maximum - 1))}…` : label;
};
const edgeType = edge => edge?.edge_type || {
  id: edge?.edge_type_id || 'relation',
  label: edge?.edge_type_label || edge?.edge_type_id || 'relation',
  color: edge?.edge_type_color || '#80ff00'
};

/**
 * Renders typed DB relationships directly onto the already-positioned,
 * draggable Obsidian wikilink SVG. It does not parse Markdown or infer a
 * document match: the API's explicit document_binding is the only bridge.
 */
const GraphLayerOverlay = ({
  graph,
  nodes = [],
  edges = [],
  documentNodes = [],
  canvas = { width: 1000, height: 560 },
  markerPrefix,
  selectedEdgeId = '',
  selectedNodeId = '',
  onSelectEdge = () => {},
  onSelectNode = () => {}
}) => {
  const model = useMemo(() => buildGraphLayerOverlayModel({ nodes, edges, documentNodes, canvas }), [canvas, documentNodes, edges, nodes]);
  const geometries = useMemo(() => buildGraphLayerEdgeGeometries(model.edges, model.positionByNodeId), [model.edges, model.positionByNodeId]);
  const colors = useMemo(() => [...new Set(geometries.map(({ edge }) => safeColor(edgeType(edge).color)))], [geometries]);
  const membrane = useMemo(() => {
    const points = [
      ...[...model.boundDocumentNodes.entries()].map(([postId, boundNodes]) => {
        const first = boundNodes[0];
        return model.positionByNodeId.get(String(first.id)) || { id: postId };
      }),
      ...model.satelliteNodes
    ].filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));
    if (!points.length) return null;
    return buildElasticClusterMembrane({ key: graph.id, x: canvas.width / 2, y: canvas.height / 2, rx: 82, ry: 58 }, points, { canvas, clearance: 20 });
  }, [canvas, graph.id, model.boundDocumentNodes, model.positionByNodeId, model.satelliteNodes]);

  if (!graph || (!geometries.length && !model.satelliteNodes.length && !model.boundDocumentNodes.size)) return null;

  return (
    <g data-testid={`graph-layer-overlay-${graph.id}`} data-graph-id={graph.id}>
      <defs>
        {colors.map(color => <marker key={color} id={`${markerPrefix}-layer-arrow-${graph.id.replace(/[^a-z0-9]/gi, '')}-${color.replace('#', '')}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z" fill={color} /></marker>)}
      </defs>
      {membrane && <g data-testid={`graph-layer-membrane-${graph.id}`} aria-hidden="true" pointerEvents="none">
        <path d={membrane.path} fill={safeColor(graph.color)} fillOpacity="0.035" stroke={safeColor(graph.color)} strokeOpacity="0.32" strokeWidth="1.1" strokeDasharray="5 7" />
        <path d={membrane.innerPath} fill="none" stroke={safeColor(graph.color)} strokeOpacity="0.17" strokeWidth="0.8" strokeDasharray="2 5" />
      </g>}
      {[...model.boundDocumentNodes.entries()].map(([postId, boundNodes]) => {
        const position = model.positionByNodeId.get(String(boundNodes[0]?.id));
        if (!position) return null;
        const selected = boundNodes.some(node => String(node.id) === String(selectedNodeId));
        return <g key={postId} data-testid={`graph-layer-bound-document-${graph.id}-${postId}`} pointerEvents="none" transform={`translate(${position.x}, ${position.y})`}><circle r={selected ? 23 : 18} fill="none" stroke={safeColor(graph.color)} strokeWidth={selected ? 2 : 1.2} strokeOpacity={selected ? 0.96 : 0.58} strokeDasharray={selected ? 'none' : '3 4'} /><circle r={selected ? 27 : 22} fill="none" stroke={safeColor(graph.color)} strokeWidth="0.6" strokeOpacity="0.22" /></g>;
      })}
      {geometries.map(({ edge, path, labelX, labelY }) => {
        const type = edgeType(edge);
        const color = safeColor(type.color);
        const selected = String(edge.id) === String(selectedEdgeId);
        const arrowId = `${markerPrefix}-layer-arrow-${graph.id.replace(/[^a-z0-9]/gi, '')}-${color.replace('#', '')}`;
        const label = `${short(type.label, 15)}${edge.relation_group_id ? ' ↔' : ''}`;
        const width = Math.max(48, label.length * 5.7 + 14);
        return <g key={edge.id} data-testid={`graph-layer-edge-visual-${edge.id}`}><path d={path} fill="none" stroke={color} strokeOpacity={selected ? 1 : 0.82} strokeWidth={selected ? 3.1 : 1.9} markerEnd={`url(#${arrowId})`} /><g transform={`translate(${labelX}, ${labelY})`} pointerEvents="none"><rect x={-width / 2} y="-9" width={width} height="17" rx="2" fill="#06111e" fillOpacity="0.92" stroke={color} strokeOpacity={selected ? 0.9 : 0.52} strokeWidth="0.8" /><text y="2.5" textAnchor="middle" fill={color} fontFamily="monospace" fontWeight="900" fontSize="7">{label}</text></g><path data-testid={`graph-layer-edge-${edge.id}`} d={path} fill="none" stroke="transparent" strokeWidth="16" className="cursor-pointer" role="button" tabIndex="0" aria-label={`${edge.source_label || edge.source_node_id} → ${edge.target_label || edge.target_node_id}; ${type.label} DB-réteg reláció`} onClick={event => onSelectEdge(edge, event)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectEdge(edge); } }} /></g>;
      })}
      {model.satelliteNodes.map(({ node, x, y }) => {
        const selected = String(node.id) === String(selectedNodeId);
        return <g key={node.id} data-testid={`graph-layer-node-${node.id}`} transform={`translate(${x}, ${y})`} className="cursor-pointer" role="button" tabIndex="0" aria-label={`${node.label || node.id}; önálló DB-csúcs`} onClick={event => onSelectNode(node, event)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectNode(node); } }}><path d="M 0 -13 L 13 0 L 0 13 L -13 0 Z" fill="#071524" stroke={safeColor(graph.color)} strokeWidth={selected ? 2.4 : 1.5} /><circle r="3.5" fill={safeColor(graph.color)} /><text y="-19" textAnchor="middle" fill={safeColor(graph.color)} fontFamily="monospace" fontWeight="800" fontSize="7">{short(node.label || node.id, 18)}</text></g>;
      })}
    </g>
  );
};

export default GraphLayerOverlay;
