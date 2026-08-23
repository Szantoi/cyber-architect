import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  applyNodeChanges,
  getBezierPath
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CircleDot, LayoutGrid, Maximize2, Network, PanelsTopLeft } from 'lucide-react';
import {
  normalizeXYFlowPosition,
  normalizeXYFlowViewport,
  readXYFlowViewState,
  writeXYFlowViewState
} from './xyflowViewState';

const EMPTY_LIST = Object.freeze([]);
const DEFAULT_MODE = 'compact';

const text = value => String(value ?? '').trim();
const short = (value, maximum = 42) => {
  const normalized = text(value);
  return normalized.length > maximum ? `${normalized.slice(0, Math.max(1, maximum - 1))}…` : normalized;
};
const safeColor = value => /^#[0-9a-f]{6}$/i.test(text(value)) ? text(value) : '#00fbfb';
const safeMode = value => value === 'detailed' ? 'detailed' : DEFAULT_MODE;

const readMode = (storageKey, fallback) => {
  if (!storageKey || typeof window === 'undefined') return fallback;
  try {
    return safeMode(window.localStorage.getItem(storageKey));
  } catch {
    return fallback;
  }
};

const progressValue = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const normalized = numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(0, Math.min(100, Math.round(normalized)));
};

const nodeProgress = node => progressValue(
  node?.progress
  ?? node?.metadata?.progress
  ?? node?.metadata?.progress_percent
  ?? node?.metadata?.completion
);

function radialPosition(index, count) {
  if (count <= 1) return { x: 430, y: 250 };
  const ring = Math.floor(index / 12);
  const positionInRing = index % 12;
  const slots = Math.min(12, Math.max(1, count - (ring * 12)));
  const angle = ((Math.PI * 2 * positionInRing) / slots) - (Math.PI / 2) + (ring % 2 ? 0.11 : 0);
  const radius = 156 + (ring * 112);
  return { x: 430 + Math.cos(angle) * radius, y: 250 + Math.sin(angle) * radius };
}

function gridPosition(index, count, detailed, workflow) {
  const minimumColumns = workflow ? (detailed ? 3 : 5) : (detailed ? 3 : 5);
  const columns = Math.max(minimumColumns, Math.ceil(Math.sqrt(Math.max(count, 1) * (detailed ? 1.05 : 1.35))));
  const row = Math.floor(index / columns);
  const column = index % columns;
  const stepX = detailed ? 332 : 170;
  const stepY = detailed ? 202 : 132;
  return {
    x: 42 + (column * stepX) + (workflow && row % 2 ? Math.round(stepX * 0.14) : 0),
    y: 46 + (row * stepY)
  };
}

function positionFor(index, count, { mode, layout }) {
  if (mode === 'compact' && layout === 'constellation') return radialPosition(index, count);
  return gridPosition(index, count, mode === 'detailed', layout === 'workflow');
}

function CompactDisplayNode({ data, selected }) {
  const accent = safeColor(data.accent);
  const active = Boolean(data.active || selected);
  return (
    <button
      type="button"
      data-testid={`graph-node-${data.id}`}
      className={`xyflow-display-point${active ? ' is-active' : ''}${data.current ? ' is-current' : ''}`}
      style={{ '--xyflow-node-accent': accent }}
      aria-label={`${data.label}; ${data.type || 'csomópont'} kijelölése`}
      onClick={event => {
        event.stopPropagation();
        data.onSelect?.(event);
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          data.onSelect?.(event);
        }
      }}
    >
      <Handle type="target" id="target" position={Position.Left} isConnectable={false} className="xyflow-display-node__handle" />
      <span className="xyflow-display-point__halo" aria-hidden="true" />
      <span className="xyflow-display-point__core" aria-hidden="true" />
      <span className="xyflow-display-point__label">{short(data.label, 28)}</span>
      {data.status && <span className="xyflow-display-point__status">{short(data.status, 16)}</span>}
      <Handle type="source" id="source" position={Position.Right} isConnectable={false} className="xyflow-display-node__handle" />
    </button>
  );
}

function DetailedDisplayNode({ data, selected }) {
  const accent = safeColor(data.accent);
  const active = Boolean(data.active || selected);
  const progress = progressValue(data.progress);
  return (
    <article
      data-testid={`graph-node-${data.id}`}
      className={`xyflow-display-card${active ? ' is-active' : ''}${data.current ? ' is-current' : ''}`}
      style={{ '--xyflow-node-accent': accent }}
      role="button"
      tabIndex="0"
      aria-pressed={active}
      aria-label={`${data.label}; ${data.type || 'csomópont'} részletes adatai`}
      onClick={event => {
        event.stopPropagation();
        data.onSelect?.(event);
      }}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          data.onSelect?.(event);
        }
      }}
    >
      <Handle type="target" id="target" position={Position.Left} isConnectable={false} className="xyflow-display-node__handle" />
      <header>
        <span>{short(data.type || 'NODE', 20)}</span>
        {data.status && <b>{short(data.status, 20)}</b>}
      </header>
      <strong title={data.label}>{short(data.label, 52)}</strong>
      {data.description && <p>{short(data.description, 118)}</p>}
      <dl>
        <div><dt>KONTEXTUS</dt><dd title={data.context || data.source}>{short(data.context || data.source || '—', 28)}</dd></div>
        <div><dt>{data.metricLabel || 'MÉRŐSZÁM'}</dt><dd>{short(data.metric || data.id, 24)}</dd></div>
      </dl>
      {progress !== null && <div className="xyflow-display-card__progress" aria-label={`${data.label} készültsége: ${progress}%`}><span><i style={{ width: `${progress}%` }} /></span><b>{progress}%</b></div>}
      {data.current && <footer>AKTUÁLIS ÁLLOMÁS</footer>}
      <Handle type="source" id="source" position={Position.Right} isConnectable={false} className="xyflow-display-node__handle" />
    </article>
  );
}

function DisplayEdge({ id, sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, markerEnd, data, selected }) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: data?.loop ? 0.52 : 0.24
  });
  const color = safeColor(data?.color);
  const active = Boolean(selected || data?.active);
  const select = event => {
    event?.stopPropagation?.();
    data?.onSelect?.(event);
  };
  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={{ stroke: color, strokeWidth: active ? 2.9 : 1.45, strokeOpacity: active ? 1 : 0.72 }} />
      <path
        data-testid={`graph-edge-path-${id}`}
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth="20"
        className="xyflow-display-edge__hit-area"
        role="button"
        tabIndex="0"
        aria-label={data?.ariaLabel || `${data?.sourceLabel || 'Forrás'} → ${data?.targetLabel || 'cél'} kapcsolat`}
        onClick={select}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            select(event);
          }
        }}
      />
      {data?.label && <EdgeLabelRenderer>
        <button
          type="button"
          className={`xyflow-display-edge__label${active ? ' is-active' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, '--xyflow-edge-accent': color }}
          onClick={select}
          tabIndex={-1}
        >
          {short(data.label, 22)}{data.loop ? ' ↻' : ''}
        </button>
      </EdgeLabelRenderer>}
    </>
  );
}

const nodeTypes = Object.freeze({ compactDisplay: CompactDisplayNode, detailedDisplay: DetailedDisplayNode });
const edgeTypes = Object.freeze({ displayEdge: DisplayEdge });

/**
 * Read-only, reusable XYFlow renderer for both graph registry layers and
 * versioned workflow definitions. The presentation switch changes only the
 * visual density; graph and workflow mutations remain in their dedicated
 * validated forms.
 */
const XYFlowDisplayCanvas = ({
  canvasId,
  ariaLabel,
  nodes = EMPTY_LIST,
  edges = EMPTY_LIST,
  selectedNodeId = '',
  selectedEdgeId = '',
  onSelectNode = () => {},
  onSelectEdge = () => {},
  layout = 'constellation',
  storageKey = '',
  viewStateStorageKey = '',
  emptyMessage = 'Ebben a nézetben még nincs megjeleníthető elem.',
  maxVisibleNodes = 120,
  className = ''
}) => {
  const [mode, setMode] = useState(() => readMode(storageKey, DEFAULT_MODE));
  const [initialViewState] = useState(() => readXYFlowViewState(viewStateStorageKey));
  const instanceRef = useRef(null);
  const viewStateRef = useRef(initialViewState);
  const selectedNodeKey = text(selectedNodeId);
  const selectedEdgeKey = text(selectedEdgeId);
  const selectedOrHighlightedIds = useMemo(() => new Set(nodes
    .filter(node => text(node?.id) === selectedNodeKey || Boolean(node?.highlighted))
    .map(node => text(node.id))), [nodes, selectedNodeKey]);
  const visibleNodes = useMemo(() => {
    const initial = nodes.slice(0, maxVisibleNodes);
    const included = new Map(initial.map(node => [text(node.id), node]));
    nodes.forEach(node => {
      const id = text(node?.id);
      if (selectedOrHighlightedIds.has(id)) included.set(id, node);
    });
    return [...included.values()];
  }, [maxVisibleNodes, nodes, selectedOrHighlightedIds]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(node => text(node.id))), [visibleNodes]);

  const chooseNode = useCallback((node, event) => onSelectNode(node, event), [onSelectNode]);
  const chooseEdge = useCallback((edge, event) => onSelectEdge(edge, event), [onSelectEdge]);
  const initialNodes = useMemo(() => visibleNodes.map((node, index) => {
    const id = text(node.id);
    const progress = nodeProgress(node);
    const highlighted = Boolean(node.highlighted || id === selectedNodeKey);
    const accent = safeColor(node.accent || node.color || node.graph_color || '#00fbfb');
    return {
      id,
      type: mode === 'detailed' ? 'detailedDisplay' : 'compactDisplay',
      position: initialViewState.positions[id] || positionFor(index, visibleNodes.length, { mode, layout }),
      selected: highlighted,
      data: {
        id,
        label: text(node.label || node.title || node.id) || 'Névtelen elem',
        type: text(node.type || node.node_type || node.kind) || 'NODE',
        description: text(node.description || node.summary),
        context: text(node.context || node.owner || node.actor || node.source_reference || node.source_system),
        source: text(node.source_system),
        status: text(node.status || node.state || node.metadata?.status || (node.current ? 'FUTÁSBAN' : node.active === false ? 'INAKTÍV' : 'AKTÍV')),
        metric: text(node.metric || node.metric_value || node.source_reference || node.id),
        metricLabel: text(node.metricLabel || node.metric_label) || 'AZONOSÍTÓ',
        progress,
        accent,
        active: highlighted,
        current: Boolean(node.current),
        onSelect: event => chooseNode(node, event)
      }
    };
  }), [chooseNode, initialViewState, layout, mode, selectedNodeKey, visibleNodes]);
  const [flowNodes, setFlowNodes] = useState(initialNodes);

  useEffect(() => {
    setFlowNodes(current => {
      const positions = new Map(current.map(node => [node.id, node.position]));
      return initialNodes.map(node => ({ ...node, position: positions.get(node.id) || node.position }));
    });
  }, [initialNodes]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      window.localStorage.setItem(storageKey, mode);
    } catch {
      // The view still works with its in-memory selection when storage is unavailable.
    }
  }, [mode, storageKey]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (viewStateRef.current.viewport) return;
      instanceRef.current?.fitView({ padding: mode === 'detailed' ? 0.28 : 0.16, maxZoom: mode === 'detailed' ? 1.05 : 1.4 });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode, visibleNodes.length]);

  const flowEdges = useMemo(() => edges
    .filter(edge => visibleNodeIds.has(text(edge.source)) && visibleNodeIds.has(text(edge.target)))
    .map(edge => {
      const id = text(edge.id);
      const color = safeColor(edge.color || edge.edge_type_color || edge.edge_type?.color || '#80ff00');
      const active = Boolean(edge.highlighted || id === selectedEdgeKey);
      return {
        id,
        source: text(edge.source),
        target: text(edge.target),
        sourceHandle: 'source',
        targetHandle: 'target',
        type: 'displayEdge',
        selected: active,
        animated: Boolean(edge.highlighted),
        markerEnd: { type: MarkerType.ArrowClosed, color },
        data: {
          color,
          label: text(edge.label || edge.edge_type_label || edge.edge_type?.label || edge.type),
          loop: Boolean(edge.loop || text(edge.source) === text(edge.target)),
          active,
          sourceLabel: text(edge.sourceLabel || edge.source_label || edge.source),
          targetLabel: text(edge.targetLabel || edge.target_label || edge.target),
          ariaLabel: text(edge.ariaLabel),
          onSelect: event => chooseEdge(edge, event)
        }
      };
    }), [chooseEdge, edges, selectedEdgeKey, visibleNodeIds]);

  const persistNodePositions = useCallback(draggedNodes => {
    if (!viewStateStorageKey) return;
    const positions = (Array.isArray(draggedNodes) ? draggedNodes : []).reduce((result, node) => {
      const id = text(node?.id);
      const position = normalizeXYFlowPosition(node?.position);
      if (id && position) result[id] = position;
      return result;
    }, {});
    if (!Object.keys(positions).length) return;
    const nextState = {
      ...viewStateRef.current,
      positions: { ...viewStateRef.current.positions, ...positions }
    };
    viewStateRef.current = nextState;
    writeXYFlowViewState(viewStateStorageKey, nextState);
  }, [viewStateStorageKey]);

  const persistViewport = useCallback(viewport => {
    if (!viewStateStorageKey) return;
    const normalizedViewport = normalizeXYFlowViewport(viewport);
    if (!normalizedViewport) return;
    const nextState = { ...viewStateRef.current, viewport: normalizedViewport };
    viewStateRef.current = nextState;
    writeXYFlowViewState(viewStateStorageKey, nextState);
  }, [viewStateStorageKey]);

  const onNodesChange = useCallback(changes => setFlowNodes(current => applyNodeChanges(changes, current)), []);
  const onNodeDragStop = useCallback((_event, node, draggedNodes) => {
    persistNodePositions(Array.isArray(draggedNodes) && draggedNodes.length ? draggedNodes : [node]);
  }, [persistNodePositions]);
  const onMoveEnd = useCallback((event, viewport) => {
    if (event) persistViewport(viewport);
  }, [persistViewport]);
  const selectMode = nextMode => setMode(safeMode(nextMode));

  return (
    <section data-testid={canvasId} className={`xyflow-display-canvas ${className}`} aria-label={ariaLabel}>
      <header className="xyflow-display-canvas__header">
        <div>
          <p><Network size={12} aria-hidden="true" /> XYFLOW // ÉLŐ TOPOGRÁFIA</p>
          <small>{visibleNodes.length}/{nodes.length} CSOMÓPONT · {flowEdges.length}/{edges.length} KAPCSOLAT</small>
        </div>
        <div className="xyflow-display-canvas__mode" role="tablist" aria-label="Gráf megjelenítési módja" data-testid={`${canvasId}-mode-switcher`}>
          <button type="button" role="tab" aria-selected={mode === 'compact'} aria-controls={`${canvasId}-surface`} onClick={() => selectMode('compact')}><CircleDot size={12} /> PONT</button>
          <button type="button" role="tab" aria-selected={mode === 'detailed'} aria-controls={`${canvasId}-surface`} onClick={() => selectMode('detailed')}><PanelsTopLeft size={12} /> RÉSZLETES</button>
        </div>
      </header>
      {!visibleNodes.length ? <div className="xyflow-display-canvas__empty"><LayoutGrid size={18} aria-hidden="true" /><p>{emptyMessage}</p></div> : <div id={`${canvasId}-surface`} className={`xyflow-display-canvas__surface xyflow-display-canvas__surface--${mode}`}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={onNodeDragStop}
          onMoveEnd={onMoveEnd}
          onNodeClick={(event, node) => chooseNode(visibleNodes.find(item => text(item.id) === node.id) || node, event)}
          onEdgeClick={(event, edge) => chooseEdge(edges.find(item => text(item.id) === edge.id) || edge, event)}
          onInit={instance => { instanceRef.current = instance; }}
          defaultViewport={initialViewState.viewport || undefined}
          fitView={!initialViewState.viewport}
          fitViewOptions={{ padding: mode === 'detailed' ? 0.28 : 0.16, maxZoom: mode === 'detailed' ? 1.05 : 1.4 }}
          minZoom={0.12}
          maxZoom={2.5}
          nodesConnectable={false}
          nodesDraggable
          elementsSelectable
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
          colorMode="dark"
          aria-label={ariaLabel}
        >
          <Background gap={mode === 'detailed' ? 20 : 16} size={1} color="rgba(0, 251, 251, 0.22)" />
          <Controls showInteractive={false} />
          <MiniMap nodeColor={node => node.data?.accent || '#00fbfb'} maskColor="rgba(2, 8, 16, .76)" style={{ width: 94, height: 64 }} />
        </ReactFlow>
      </div>}
      {!!flowEdges.length && <nav className="xyflow-display-canvas__edge-list" aria-label="Látható kapcsolatok">
        {flowEdges.map(edge => <button key={edge.id} type="button" data-testid={`graph-edge-${edge.id}`} aria-label={edge.data.ariaLabel || `${edge.data.sourceLabel} → ${edge.data.targetLabel}`} className={edge.selected ? 'is-active' : ''} style={{ '--xyflow-edge-accent': edge.data.color }} onClick={event => edge.data.onSelect(event)}><span>{short(edge.data.sourceLabel, 16)}</span><i>→</i><span>{short(edge.data.targetLabel, 16)}</span><b>{short(edge.data.label, 14)}{edge.data.loop ? ' ↻' : ''}</b></button>)}
      </nav>}
      <footer><Maximize2 size={11} aria-hidden="true" />{mode === 'compact' ? 'Gyors hálótérkép — húzható pontok, fókuszálható kapcsolatok.' : 'Munkakártyák — állapot, kontextus és operatív mérőszám egy vásznon.'}</footer>
    </section>
  );
};

export default XYFlowDisplayCanvas;
