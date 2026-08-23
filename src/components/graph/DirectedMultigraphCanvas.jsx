import React, { useMemo } from 'react';
import { ArrowRight, CircleDot, GitBranch, Layers3, Route, ScanSearch } from 'lucide-react';
import XYFlowDisplayCanvas from './XYFlowDisplayCanvas.jsx';

const EMPTY_LIST = Object.freeze([]);
const MAX_VISIBLE_NODES = 120;

const text = value => String(value ?? '').trim();
const safeColor = value => /^#[0-9a-f]{6}$/i.test(text(value)) ? value : '#80FF00';
const short = (value, length = 24) => {
  const normalized = text(value);
  return normalized.length > length ? `${normalized.slice(0, Math.max(1, length - 1))}…` : normalized;
};
const percent = value => `${Math.round(Number(value || 0) * 100)}%`;
const printableJson = value => {
  if (!value || (typeof value === 'object' && !Object.keys(value).length)) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const nodeMemberships = node => Array.isArray(node?.graph_memberships)
  ? node.graph_memberships
  : (node?.graph_ids || []).map(graph_id => ({ graph_id }));
const edgeMemberships = edge => Array.isArray(edge?.graph_memberships)
  ? edge.graph_memberships
  : (edge?.graph_ids || []).map(graph_id => ({ graph_id }));
const edgeType = edge => edge?.edge_type || {
  id: edge?.edge_type_id || '',
  label: edge?.edge_type_label || edge?.edge_type_id || 'RELATION',
  icon_key: edge?.edge_type_icon_key || 'git-branch',
  color: edge?.edge_type_color || '#80FF00'
};

function Metric({ label, value }) {
  return (
    <div className="border border-white/10 bg-black/20 px-2.5 py-2">
      <p className="font-mono text-[8px] font-black uppercase tracking-[.12em] text-slate-600">{label}</p>
      <p className="mt-1 break-all font-mono text-[10px] text-slate-200">{value || '—'}</p>
    </div>
  );
}

function MembershipChips({ memberships, graphById, accent = '#00fbfb' }) {
  if (!memberships.length) return <span className="font-mono text-[9px] text-slate-600">Nincs tagság</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {memberships.map(membership => {
        const graph = graphById.get(membership.graph_id) || membership;
        return (
          <span key={membership.graph_id} className="inline-flex max-w-full items-center gap-1 border px-1.5 py-1 font-mono text-[8px] font-black" style={{ borderColor: `${safeColor(graph.color || accent)}88`, color: safeColor(graph.color || accent) }} title={graph.name || membership.graph_id}>
            <Layers3 size={9} />{short(graph.name || membership.graph_name || membership.graph_id, 18)}
          </span>
        );
      })}
    </div>
  );
}

function NodeInspector({ node, graphById }) {
  if (!node) return null;
  const memberships = nodeMemberships(node);
  return (
    <aside data-testid="graph-node-inspector" aria-label="Kijelölt csúcs részletei" className="border border-neonCyan/35 bg-[#071522]/95 p-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-mono text-[9px] font-black uppercase tracking-[.15em] text-neonCyan">Csúcs // bejárási kezdőpont</p><h3 className="mt-1 font-headline text-lg font-black text-white">{node.label}</h3></div>
        <CircleDot size={19} className="shrink-0 text-neonCyan" />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Metric label="Stabil ID" value={node.id} />
        <Metric label="Csúcstípus" value={node.node_type} />
        <Metric label="Forrásrendszer" value={node.source_system} />
        <Metric label="Forrás hivatkozás" value={node.source_reference} />
      </div>
      {node.description && <p className="mt-3 border-l-2 border-neonCyan/50 pl-3 font-mono text-[10px] leading-relaxed text-slate-400">{node.description}</p>}
      <div className="mt-4 border-t border-white/10 pt-3"><p className="mb-2 font-mono text-[8px] font-black uppercase tracking-[.13em] text-slate-500">Gráftagság ({memberships.length}) · ugyanaz az ID, nincs klón</p><MembershipChips memberships={memberships} graphById={graphById} /></div>
    </aside>
  );
}

function EdgeInspector({ edge, graphById }) {
  if (!edge) return null;
  const type = edgeType(edge);
  const memberships = edgeMemberships(edge);
  const isPaired = Boolean(edge.relation_group_id && edge.reciprocal_edge_id);
  return (
    <aside data-testid="graph-edge-inspector" aria-label="Kijelölt él részletei" className="border border-neonMagenta/40 bg-[#180a1c]/85 p-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-mono text-[9px] font-black uppercase tracking-[.15em] text-neonMagenta">Irányított reláció</p><h3 className="mt-1 flex flex-wrap items-center gap-2 font-mono text-sm font-black text-white"><span>{short(edge.source_label || edge.source_node_id, 20)}</span><ArrowRight size={16} style={{ color: safeColor(type.color) }} /><span>{short(edge.target_label || edge.target_node_id, 20)}</span></h3></div>
        <GitBranch size={19} style={{ color: safeColor(type.color) }} />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Metric label="Él ID" value={edge.id} />
        <Metric label="Éltípus" value={`${type.label} · ${type.id}`} />
        <Metric label="Irány" value={`${edge.source_node_id} → ${edge.target_node_id}`} />
        <Metric label="Eredet" value={edge.origin} />
        <Metric label="Súly / bizonyosság / költség" value={`${Number(edge.weight ?? 1).toFixed(2)} / ${percent(edge.confidence ?? 1)} / ${edge.cost ?? 1}`} />
        <Metric label="Érvényesség" value={`${edge.valid_from || '—'} → ${edge.valid_to || '—'}`} />
      </div>
      <div className="mt-3 border border-white/10 bg-black/20 p-2.5"><p className="font-mono text-[8px] font-black uppercase tracking-[.12em] text-slate-500">Kétirányú pár</p><p className="mt-1 break-all font-mono text-[9px] text-slate-300">{isPaired ? `relation_group_id: ${edge.relation_group_id} · ${edge.reciprocal_role || 'asserted'} → ${edge.reciprocal_edge_id}` : 'Önálló irányított él'}</p></div>
      <div className="mt-3 border-t border-white/10 pt-3"><p className="mb-2 font-mono text-[8px] font-black uppercase tracking-[.13em] text-slate-500">Gráftagság ({memberships.length}) · M:N kapcsolat</p><MembershipChips memberships={memberships} graphById={graphById} accent={type.color} /></div>
      <details className="mt-3 border border-white/10 bg-black/20 p-2.5"><summary className="cursor-pointer font-mono text-[9px] font-black uppercase tracking-[.12em] text-slate-300">Provenance / bizonyíték</summary><pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[9px] leading-relaxed text-slate-400">{printableJson(edge.provenance)}</pre></details>
    </aside>
  );
}

const graphNodeVisual = (node, graph, traversedNodeIds, selectedNodeId) => {
  const metadata = node?.metadata || {};
  const memberships = nodeMemberships(node);
  const projectReference = text(metadata.sql_project_id || metadata.project_id || metadata.project || metadata.project_ref);
  const owner = text(metadata.owner || metadata.assignee || metadata.actor || metadata.responsible);
  const selected = text(node.id) === text(selectedNodeId);
  const traversed = traversedNodeIds.has(text(node.id));
  return {
    ...node,
    accent: safeColor(node.color || graph?.color || '#00fbfb'),
    highlighted: selected || traversed,
    current: Boolean(metadata.current || metadata.active_step || metadata.in_progress),
    status: text(metadata.status || metadata.state || (traversed ? 'BEJÁRÁSBAN' : node.active === false ? 'INAKTÍV' : 'AKTÍV')),
    context: owner || text(node.source_reference || node.source_system),
    metricLabel: projectReference ? 'PROJEKT' : 'RÉTEGEK',
    metric: projectReference || `${memberships.length} RÉTEG`
  };
};

const graphEdgeVisual = (edge, traversedEdgeIds, selectedEdgeId) => {
  const type = edgeType(edge);
  const selected = text(edge.id) === text(selectedEdgeId);
  const traversed = traversedEdgeIds.has(text(edge.id));
  return {
    ...edge,
    source: text(edge.source_node_id),
    target: text(edge.target_node_id),
    sourceLabel: text(edge.source_label || edge.source_node_id),
    targetLabel: text(edge.target_label || edge.target_node_id),
    label: `${text(type.label) || 'RELATION'}${edge.relation_group_id ? ' ↔' : ''}`,
    color: safeColor(type.color),
    highlighted: selected || traversed,
    loop: text(edge.source_node_id) === text(edge.target_node_id),
    ariaLabel: `${edge.source_label || edge.source_node_id} ide mutat: ${edge.target_label || edge.target_node_id}; ${type.label} reláció részletei`
  };
};

/**
 * Visual-only DB multigraph renderer. Its caller supplies graph rows from the
 * public or authenticated graph APIs; it never reads Markdown or creates
 * inferred relations.
 */
const DirectedMultigraphCanvas = ({
  graph,
  graphs = EMPTY_LIST,
  nodes = EMPTY_LIST,
  edges = EMPTY_LIST,
  selectedNodeId = '',
  selectedEdgeId = '',
  traversal = null,
  onSelectNode = () => {},
  onSelectEdge = () => {},
  displayStorageKey = '',
  viewStateStorageKey = '',
  workspaceProfileName = ''
}) => {
  const graphById = useMemo(() => new Map(graphs.map(item => [item.id, item])), [graphs]);
  const selectedNode = nodes.find(node => text(node.id) === text(selectedNodeId)) || null;
  const selectedEdge = edges.find(edge => text(edge.id) === text(selectedEdgeId)) || null;
  const traversedNodeIds = useMemo(() => new Set((traversal?.nodes || []).map(node => text(node.id))), [traversal]);
  const traversedEdgeIds = useMemo(() => new Set((traversal?.edges || []).map(edge => text(edge.id))), [traversal]);
  const visualNodes = useMemo(() => nodes.map(node => graphNodeVisual(node, graph, traversedNodeIds, selectedNodeId)), [graph, nodes, selectedNodeId, traversedNodeIds]);
  const visualEdges = useMemo(() => edges.map(edge => graphEdgeVisual(edge, traversedEdgeIds, selectedEdgeId)), [edges, selectedEdgeId, traversedEdgeIds]);
  const resolvedDisplayStorageKey = text(displayStorageKey) || `directed-multigraph-display:${graph?.id || 'draft'}:v1`;
  const resolvedViewStateStorageKey = text(viewStateStorageKey);

  if (!graph) return <section className="border border-dashed border-white/20 p-8 text-center font-mono text-xs text-slate-500">Válassz egy gráfréteget a DB-regiszterből.</section>;

  return (
    <section className="overflow-hidden border border-neonCyan/25 bg-[#040b14] shadow-[0_0_45px_rgba(0,251,251,.06)]" data-testid="directed-multigraph-viewer">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3"><span className="h-3 w-3 shrink-0 rounded-full shadow-[0_0_14px_currentColor]" style={{ backgroundColor: safeColor(graph.color), color: safeColor(graph.color) }} /><div><p className="font-mono text-[9px] font-black uppercase tracking-[.16em] text-neonCyan">DB-first // irányított többrétegű multigráf</p><h2 className="mt-0.5 truncate font-mono text-sm font-black text-white">{graph.name}</h2></div></div>
        <div className="flex flex-wrap gap-2 font-mono text-[8px] font-black uppercase tracking-[.1em]">{workspaceProfileName && <span data-testid="directed-multigraph-workspace-profile" title="A megjelenítési módot, a csomópontok helyét és a kameraállást ez a munkatérprofil külön tárolja." className="border border-amber-300/35 bg-amber-200/5 px-2 py-1 text-amber-100">{short(workspaceProfileName, 20)} PROFIL</span>}<span className="border border-white/15 px-2 py-1 text-slate-400">{graph.icon_key || 'network'}</span><span className="border border-white/15 px-2 py-1 text-slate-400">{graph.visibility || 'PUBLIC'}</span><span className="border border-neonCyan/35 bg-neonCyan/5 px-2 py-1 text-neonCyan">{nodes.length} csúcs</span><span className="border border-plasmaGreen/35 bg-plasmaGreen/5 px-2 py-1 text-plasmaGreen">{edges.length} ív</span></div>
      </header>
      <XYFlowDisplayCanvas
        key={`${resolvedDisplayStorageKey}:${resolvedViewStateStorageKey}`}
        canvasId="directed-multigraph-canvas"
        ariaLabel={`${graph.name} irányított multigráfja`}
        nodes={visualNodes}
        edges={visualEdges}
        selectedNodeId={selectedNodeId}
        selectedEdgeId={selectedEdgeId}
        onSelectNode={onSelectNode}
        onSelectEdge={onSelectEdge}
        storageKey={resolvedDisplayStorageKey}
        viewStateStorageKey={resolvedViewStateStorageKey}
        maxVisibleNodes={MAX_VISIBLE_NODES}
        emptyMessage="Ebben a gráfrétegben még nincs megjeleníthető DB-csúcs."
        className="xyflow-display-canvas--multigraph"
      />
      {nodes.length > MAX_VISIBLE_NODES && <p className="border-t border-white/10 px-4 py-2 font-mono text-[9px] text-amber-200">A vászon az első {MAX_VISIBLE_NODES} csúcsot mutatja; a kijelölt és a bejárásban szereplő csúcsok mindig látszanak.</p>}
      <div className="grid gap-3 border-t border-white/10 bg-black/15 p-3 lg:grid-cols-2"><div className="border border-white/10 bg-black/20 p-3"><p className="flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[.13em] text-slate-300"><Route size={13} className="text-plasmaGreen" /> Olvasási kulcs</p><p className="mt-2 font-mono text-[9px] leading-relaxed text-slate-500">Nyíl = adatbázisban tárolt irány. Egy párhoz tartozó két ellentétes nyíl ugyanazt a <code>relation_group_id</code>-t viseli. A pontnézet áttekintéshez, a részletes kártyanézet projekt- és feladatkövetéshez való.</p></div><div className="border border-white/10 bg-black/20 p-3"><p className="flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[.13em] text-slate-300"><ScanSearch size={13} className="text-neonCyan" /> Kijelölés</p><p className="mt-2 font-mono text-[9px] leading-relaxed text-slate-500">Csúcs: bejárási kezdőpont. Él: reláció, érvényesség és eredet részletei. A részletes kártya a projektre, felelősre és az állapotra is ad kontextust, ha az a csúcs metaadatában szerepel.</p></div></div>
      {(selectedNode || selectedEdge) && <div className="grid gap-3 border-t border-white/10 p-3 lg:grid-cols-2">{selectedNode && <NodeInspector node={selectedNode} graphById={graphById} />}{selectedEdge && <EdgeInspector edge={selectedEdge} graphById={graphById} />}</div>}
    </section>
  );
};

export default DirectedMultigraphCanvas;
