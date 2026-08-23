import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Background, Controls, Handle, MarkerType, MiniMap, Position, ReactFlow, applyNodeChanges } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { GitBranch, MousePointer2, MoveRight } from 'lucide-react';

const EMPTY_LIST = Object.freeze([]);
const MAX_VISIBLE_NODES = 250;

const text = value => String(value ?? '').trim();
const short = (value, length = 32) => {
  const normalized = text(value);
  return normalized.length > length ? `${normalized.slice(0, Math.max(1, length - 1))}…` : normalized;
};
const safeColor = value => /^#[0-9a-f]{6}$/i.test(text(value)) ? value : '#00fbfb';

function positionFor(index, count) {
  const columns = Math.max(2, Math.ceil(Math.sqrt(Math.max(count, 1) * 1.35)));
  const row = Math.floor(index / columns);
  const column = index % columns;
  const stagger = row % 2 ? 72 : 0;
  return { x: 34 + (column * 222) + stagger, y: 34 + (row * 138) };
}

function RelationNode({ data, selected }) {
  const accent = safeColor(data.color);
  return (
    <div className={`graph-relation-node${selected ? ' graph-relation-node--selected' : ''}`} style={{ '--graph-relation-accent': accent }}>
      <Handle type="target" position={Position.Left} className="graph-relation-node__handle graph-relation-node__handle--target" style={{ backgroundColor: accent }} aria-label={`${data.label} kapcsolat célpontja`} isConnectableStart={false} isConnectableEnd />
      <span className="graph-relation-node__type">{data.nodeType || 'NODE'}</span>
      <strong title={data.label}>{short(data.label, 28)}</strong>
      <small title={data.id}>{short(data.id, 22)}</small>
      <Handle type="source" position={Position.Right} className="graph-relation-node__handle graph-relation-node__handle--source" style={{ backgroundColor: accent }} aria-label={`${data.label} kapcsolat forrása`} isConnectableStart isConnectableEnd={false} />
    </div>
  );
}

const nodeTypes = Object.freeze({ relationNode: RelationNode });

/**
 * Admin-only interaction surface. A drawn connection intentionally does not
 * mutate the graph: it prepares the existing validated relation form, where
 * the operator must still choose an edge type and explicitly save.
 */
const GraphRelationCanvas = ({
  nodes = EMPTY_LIST,
  edges = EMPTY_LIST,
  selectedNodeId = '',
  selectedEdgeId = '',
  disabled = false,
  onSelectNode = () => {},
  onSelectEdge = () => {},
  onPrepareConnection = () => {}
}) => {
  const visibleNodes = useMemo(() => nodes.slice(0, MAX_VISIBLE_NODES), [nodes]);
  const initialNodes = useMemo(() => visibleNodes.map((node, index) => ({
    id: String(node.id),
    type: 'relationNode',
    position: positionFor(index, visibleNodes.length),
    selected: String(node.id) === String(selectedNodeId),
    data: {
      id: node.id,
      label: node.label || node.id,
      nodeType: node.node_type,
      color: node.color || node.graph_color || '#00fbfb'
    }
  })), [selectedNodeId, visibleNodes]);
  const [flowNodes, setFlowNodes] = useState(initialNodes);
  const connectingSourceIdRef = useRef('');
  const preparedConnectionRef = useRef('');

  useEffect(() => { setFlowNodes(initialNodes); }, [initialNodes]);

  const nodeIds = useMemo(() => new Set(visibleNodes.map(node => String(node.id))), [visibleNodes]);
  const flowEdges = useMemo(() => edges
    .filter(edge => nodeIds.has(String(edge.source_node_id)) && nodeIds.has(String(edge.target_node_id)))
    .map(edge => {
      const relation = edge.edge_type || {};
      const color = safeColor(relation.color || edge.edge_type_color || '#80ff00');
      return {
        id: String(edge.id),
        source: String(edge.source_node_id),
        target: String(edge.target_node_id),
        type: 'smoothstep',
        animated: String(edge.id) === String(selectedEdgeId),
        selected: String(edge.id) === String(selectedEdgeId),
        label: short(relation.label || edge.edge_type_label || edge.edge_type_id || 'RELATION', 18),
        markerEnd: { type: MarkerType.ArrowClosed, color },
        style: { stroke: color, strokeWidth: String(edge.id) === String(selectedEdgeId) ? 2.8 : 1.55 },
        labelStyle: { fill: color, fontSize: 10, fontWeight: 800 },
        labelBgStyle: { fill: '#07111e', fillOpacity: 0.96 },
        labelBgPadding: [5, 3],
        labelBgBorderRadius: 2
      };
    }), [edges, nodeIds, selectedEdgeId]);

  const onNodesChange = useCallback(changes => setFlowNodes(current => applyNodeChanges(changes, current)), []);
  const prepareConnection = useCallback((sourceNodeId, targetNodeId) => {
    if (disabled || !sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return;
    const key = `${sourceNodeId}::${targetNodeId}`;
    if (preparedConnectionRef.current === key) return;
    preparedConnectionRef.current = key;
    onPrepareConnection({ sourceNodeId, targetNodeId });
  }, [disabled, onPrepareConnection]);
  const onConnectStart = useCallback((_, connection) => {
    connectingSourceIdRef.current = connection?.handleType === 'source' ? String(connection.nodeId || '') : '';
    preparedConnectionRef.current = '';
  }, []);
  const onConnect = useCallback(connection => {
    prepareConnection(String(connection?.source || ''), String(connection?.target || ''));
    connectingSourceIdRef.current = '';
  }, [prepareConnection]);
  const onConnectEnd = useCallback(event => {
    const targetHandle = event.target?.closest?.('.graph-relation-node__handle--target');
    const targetNodeId = targetHandle?.dataset?.nodeid;
    prepareConnection(connectingSourceIdRef.current, String(targetNodeId || ''));
    connectingSourceIdRef.current = '';
  }, [prepareConnection]);

  if (!visibleNodes.length) {
    return <section data-testid="graph-admin-relation-canvas" className="graph-relation-canvas graph-relation-canvas--empty"><GitBranch size={18} aria-hidden="true" /><p>Ebben a DB-rétegben még nincs kapcsolat létrehozásához használható csúcs.</p></section>;
  }

  return (
    <section data-testid="graph-admin-relation-canvas" className="graph-relation-canvas" aria-labelledby="graph-relation-canvas-title">
      <header className="graph-relation-canvas__header">
        <div><p className="graph-relation-canvas__eyebrow"><GitBranch size={12} aria-hidden="true" /> XYFLOW // VIZUÁLIS RELÁCIÓ</p><h3 id="graph-relation-canvas-title">Kapcsolati munkavászon</h3></div>
        <span>{visibleNodes.length}/{nodes.length} CSÚCS · {flowEdges.length} ÉL</span>
      </header>
      <div className="graph-relation-canvas__flow" aria-describedby="graph-relation-canvas-help">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onNodeClick={(_, node) => onSelectNode(node.id)}
          onEdgeClick={(_, edge) => onSelectEdge(edge.id)}
          onConnectStart={onConnectStart}
          onConnect={onConnect}
          onConnectEnd={onConnectEnd}
          fitView
          fitViewOptions={{ padding: 0.18, maxZoom: 1.2 }}
          minZoom={0.22}
          maxZoom={2.2}
          nodesConnectable={!disabled}
          nodesDraggable={!disabled}
          elementsSelectable={!disabled}
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
          aria-label="DB-csúcsok közötti vizuális kapcsolat szerkesztő"
        >
          <Background gap={18} size={1} color="rgba(0, 251, 251, 0.22)" />
          <Controls showInteractive={false} />
          <MiniMap nodeColor={node => node.data?.color || '#00fbfb'} maskColor="rgba(4, 9, 20, .72)" style={{ width: 92, height: 62, pointerEvents: 'none' }} />
        </ReactFlow>
      </div>
      <p id="graph-relation-canvas-help" className="graph-relation-canvas__help"><MousePointer2 size={13} aria-hidden="true" /> Húzz a jobb oldali csatlakozási pontról egy másik csúcs bal oldali pontjára <MoveRight size={13} aria-hidden="true" /> válassz éltípust a következő lépésben <MoveRight size={13} aria-hidden="true" /> mentsd a kapcsolatot.</p>
    </section>
  );
};

export default GraphRelationCanvas;
