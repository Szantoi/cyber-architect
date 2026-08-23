import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CircleDot,
  GitBranch,
  Network,
  Plus,
  RefreshCw,
  Route,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2
} from 'lucide-react';
import DirectedMultigraphCanvas from '../../graph/DirectedMultigraphCanvas.jsx';

const EMPTY_LIST = Object.freeze([]);
const text = value => String(value ?? '').trim();
const csv = value => [...new Set(String(value || '').split(',').map(item => item.trim()).filter(Boolean))];
const encodePath = value => encodeURIComponent(String(value || ''));

const graphDraft = () => ({
  id: '', slug: '', name: '', description: '', icon_key: 'network', color: '#00FFFF', visibility: 'private'
});
const edgeTypeDraft = () => ({
  id: '', slug: '', label: '', description: '', icon_key: 'git-branch', color: '#80FF00',
  source_node_types: 'project,epic,task,document', target_node_types: 'project,epic,task,document',
  default_weight: '1', default_confidence: '1', default_cost: '1', allow_self_loop: false, visibility: 'private'
});
const nodeDraft = () => ({
  id: '', node_type: 'task', label: '', description: '', source_system: 'manual', source_reference: '', visibility: 'private'
});
const edgeDraft = () => ({
  source_node_id: '', target_node_id: '', edge_type_id: '', weight: '1', confidence: '1', cost: '1',
  origin: 'admin', provenance: '{}', valid_from: '', valid_to: '', bidirectional: false, visibility: 'private'
});
const traversalDraft = () => ({
  start_node_id: '', direction: 'outbound', max_depth: '2', max_nodes: '50', min_confidence: '0', edge_type_ids: [], origins: [], as_of: ''
});
const graphSettingsDraft = graph => ({
  name: text(graph?.name), description: text(graph?.description), icon_key: text(graph?.icon_key) || 'network',
  color: text(graph?.color) || '#00FFFF', visibility: graph?.visibility || 'private', active: graph?.active !== false
});
const asDateTimeInput = value => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 16) : '';
};

const parseObject = (value, label) => {
  const normalized = text(value);
  if (!normalized) return {};
  try {
    const parsed = JSON.parse(normalized);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('NOT_AN_OBJECT');
    return parsed;
  } catch {
    throw new Error(`${label}_ÉRVÉNYTELEN_JSON`);
  }
};

function Panel({ title, icon: Icon, children, accent = 'text-neonCyan' }) {
  return (
    <section className="border border-white/10 bg-[#07111e]/80 shadow-[inset_0_1px_0_rgba(255,255,255,.04)]">
      <header className="flex items-center gap-2 border-b border-white/10 bg-black/20 px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[.16em] text-slate-300">
        {React.createElement(Icon, { size: 14, className: accent })} {title}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ label, children }) {
  return <label className="flex min-w-0 flex-col gap-1 font-mono text-[9px] font-bold uppercase tracking-[.12em] text-slate-500">{label}{children}</label>;
}

const controlClass = 'min-h-10 border border-white/15 bg-slate-950 px-2.5 font-mono text-xs text-slate-100 outline-none transition-colors focus:border-neonCyan';

function SubmitButton({ children, disabled = false }) {
  return <button type="submit" disabled={disabled} className="inline-flex min-h-10 items-center justify-center gap-2 border border-neonCyan/70 bg-neonCyan/10 px-3 font-mono text-[10px] font-black uppercase tracking-[.12em] text-neonCyan transition-colors hover:bg-neonCyan hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={13} />{children}</button>;
}

function DangerButton({ onClick, label }) {
  return <button type="button" onClick={onClick} className="inline-flex min-h-8 items-center gap-1 border border-neonMagenta/40 px-2 font-mono text-[9px] font-black text-neonMagenta transition-colors hover:bg-neonMagenta hover:text-slate-950"><Trash2 size={11} />{label}</button>;
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function LegacyGraphTopologyPreview({ graph, nodes = EMPTY_LIST, edges = EMPTY_LIST, onPickNode }) {
  const visibleNodes = useMemo(() => nodes.slice(0, 80), [nodes]);
  const layout = useMemo(() => {
    const centerX = 360;
    const centerY = 170;
    const radius = Math.max(42, Math.min(128, 38 + visibleNodes.length * 2.4));
    return visibleNodes.map((node, index) => {
      const angle = (Math.PI * 2 * index / Math.max(visibleNodes.length, 1)) - Math.PI / 2;
      return { ...node, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
    });
  }, [visibleNodes]);
  const positionById = useMemo(() => new Map(layout.map(node => [node.id, node])), [layout]);
  const visibleEdges = useMemo(() => edges.filter(edge => (
    positionById.has(edge.source_node_id) && positionById.has(edge.target_node_id)
  )), [edges, positionById]);
  const shortLabel = value => text(value).slice(0, 22) || 'NÉVTELEN';

  return (
    <section className="overflow-hidden border border-neonMagenta/30 bg-[#050d17]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-4 py-3">
        <div><p className="font-mono text-[10px] font-black uppercase tracking-[.15em] text-neonMagenta">Topológiai nézet // irányított multigráf</p><p className="mt-1 font-mono text-[9px] text-slate-500">{graph.name} · {layout.length} csúcs · {visibleEdges.length} látható ív</p></div>
        <span className="font-mono text-[8px] text-slate-600">KATTINTS CSÚCSRA → BEJÁRÁSI KEZDŐPONT</span>
      </header>
      {!layout.length ? <div className="p-8 text-center font-mono text-xs text-slate-500">Az aktív gráfnak még nincs megjeleníthető csúcsa.</div> : <div className="relative min-h-[22rem] overflow-auto p-3"><div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(0,251,251,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,251,251,.06)_1px,transparent_1px)] [background-size:24px_24px]" /><svg viewBox="0 0 720 340" className="relative h-[21rem] min-w-[44rem] w-full" role="group" aria-label="Aktív gráf topológiája"><defs><marker id="graph-control-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#a3b4c6" /></marker></defs>{visibleEdges.map(edge => { const source = positionById.get(edge.source_node_id); const target = positionById.get(edge.target_node_id); return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={edge.edge_type_color || '#80FF00'} strokeWidth="1.8" strokeOpacity="0.85" markerEnd="url(#graph-control-arrow)"><title>{`${edge.source_label} → ${edge.target_label}: ${edge.edge_type_label}`}</title></line>; })}{layout.map(node => <g key={node.id} transform={`translate(${node.x}, ${node.y})`} role="button" tabIndex="0" aria-label={`${node.label} kijelölése bejárás kezdőpontjaként`} onClick={() => onPickNode(node)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPickNode(node); } }} className="cursor-pointer"><circle r="18" fill="#071829" stroke="#00fbfb" strokeWidth="1.5" /><circle r="6" fill="#00fbfb" /><text x="0" y="34" textAnchor="middle" fill="#e2e8f0" fontFamily="monospace" fontSize="9" fontWeight="700">{shortLabel(node.label)}</text><text x="0" y="45" textAnchor="middle" fill="#64748b" fontFamily="monospace" fontSize="7">{shortLabel(node.node_type)}</text></g>)}</svg>{nodes.length > visibleNodes.length && <p className="relative px-2 pb-1 font-mono text-[9px] text-amber-300">Az előnézet az első {visibleNodes.length} csúcsot mutatja; az agent-bejárás továbbra is explicit korlátokkal kérhető.</p>}</div>}
    </section>
  );
}

function GraphTopologyPreview({ graph, graphs = EMPTY_LIST, nodes = EMPTY_LIST, edges = EMPTY_LIST, selectedNodeId, selectedEdgeId, traversal, onPickNode, onPickEdge, useLegacyTopology = false }) {
  if (useLegacyTopology) return <LegacyGraphTopologyPreview graph={graph} nodes={nodes} edges={edges} onPickNode={onPickNode} />;
  return <DirectedMultigraphCanvas graph={graph} graphs={graphs} nodes={nodes} edges={edges} selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId} traversal={traversal} onSelectNode={onPickNode} onSelectEdge={onPickEdge} />;
}

function GraphSettingsPanel({ graph, form, onChange, onSubmit, working }) {
  return (
    <Panel title={`Aktív gráf beállításai // ${graph.name}`} icon={SlidersHorizontal} accent="text-neonMagenta">
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Név"><input required className={controlClass} value={form.name} onChange={onChange('name')} /></Field>
        <Field label="Láthatóság"><select className={controlClass} value={form.visibility} onChange={onChange('visibility')}><option value="private">BELSŐ</option><option value="public">PUBLIKUS</option></select></Field>
        <Field label="Ikon kulcs"><input className={controlClass} value={form.icon_key} onChange={onChange('icon_key')} /></Field>
        <Field label="Szín"><input required pattern="^#[0-9a-fA-F]{6}$" className={controlClass} value={form.color} onChange={onChange('color')} /></Field>
        <Field label="Leírás"><textarea className={`${controlClass} min-h-20 resize-y`} value={form.description} onChange={onChange('description')} /></Field>
        <div className="flex flex-wrap items-end justify-between gap-3"><label className="inline-flex items-center gap-2 font-mono text-[10px] text-slate-400"><input type="checkbox" checked={form.active} onChange={onChange('active')} /> AKTÍV GRÁFRÉTEG</label><button type="submit" disabled={working} className="inline-flex min-h-10 items-center gap-2 border border-neonMagenta/60 bg-neonMagenta/10 px-3 font-mono text-[9px] font-black text-neonMagenta hover:bg-neonMagenta hover:text-slate-950 disabled:opacity-50"><Save size={12} /> BEÁLLÍTÁSOK MENTÉSE</button></div>
      </form>
    </Panel>
  );
}

function AdminTraversalPanel({ graphNodes, edgeTypes, selectedNodeId, query, traversal, working, onSetQuery, onSelectStart, onRun }) {
  const origins = ['admin', 'markdown_projection', 'sql_sync', 'wikilink_import', 'agent'];
  const toggle = (field, value) => onSetQuery(current => ({
    ...current,
    [field]: current[field].includes(value) ? current[field].filter(item => item !== value) : [...current[field], value]
  }));
  return (
    <Panel title="Bejárás beállításai // szerveroldali AST" icon={Route} accent="text-plasmaGreen">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Field label="Kezdőcsúcs"><select aria-label="Bejárás kezdőcsúcsa" className={controlClass} value={query.start_node_id || selectedNodeId} onChange={event => onSelectStart(event.target.value)}><option value="">-- KATTINTS CSÚCSRA VAGY VÁLASSZ --</option>{graphNodes.map(node => <option key={node.id} value={node.id}>{node.label} // {node.id}</option>)}</select></Field>
        <Field label="Irány"><select aria-label="Admin bejárás iránya" className={controlClass} value={query.direction} onChange={event => onSetQuery(current => ({ ...current, direction: event.target.value }))}><option value="outbound">OUTBOUND · kifelé</option><option value="inbound">INBOUND · befelé</option><option value="both">BOTH · mindkét irány</option></select></Field>
        <Field label="Mélység 0..6"><input aria-label="Admin bejárás mélysége" type="number" min="0" max="6" className={controlClass} value={query.max_depth} onChange={event => onSetQuery(current => ({ ...current, max_depth: event.target.value }))} /></Field>
        <Field label="Maximum csúcs 1..250"><input aria-label="Admin bejárás maximum csúcs" type="number" min="1" max="250" className={controlClass} value={query.max_nodes} onChange={event => onSetQuery(current => ({ ...current, max_nodes: event.target.value }))} /></Field>
        <Field label="Min. bizonyosság"><input aria-label="Admin minimális bizonyosság" type="number" min="0" max="1" step="0.05" className={controlClass} value={query.min_confidence} onChange={event => onSetQuery(current => ({ ...current, min_confidence: event.target.value }))} /></Field>
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <fieldset className="border border-white/10 bg-black/20 p-2.5"><legend className="px-1 font-mono text-[8px] font-black uppercase tracking-[.12em] text-plasmaGreen">Éltípus-szűrő</legend><div className="mt-1 flex flex-wrap gap-2">{edgeTypes.map(type => <label key={type.id} className="inline-flex items-center gap-1 border border-white/10 px-2 py-1 font-mono text-[9px] text-slate-400"><input type="checkbox" checked={query.edge_type_ids.includes(type.id)} onChange={() => toggle('edge_type_ids', type.id)} />{type.label}</label>)}</div></fieldset>
        <fieldset className="border border-white/10 bg-black/20 p-2.5"><legend className="px-1 font-mono text-[8px] font-black uppercase tracking-[.12em] text-neonMagenta">Eredet-szűrő</legend><div className="mt-1 flex flex-wrap gap-2">{origins.map(origin => <label key={origin} className="inline-flex items-center gap-1 border border-white/10 px-2 py-1 font-mono text-[9px] text-slate-400"><input type="checkbox" checked={query.origins.includes(origin)} onChange={() => toggle('origins', origin)} />{origin}</label>)}</div></fieldset>
        <Field label="Érvényesség ekkor"><input aria-label="Admin bejárás érvényességi időpont" type="datetime-local" className={controlClass} value={query.as_of} onChange={event => onSetQuery(current => ({ ...current, as_of: event.target.value }))} /></Field>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"><p className="font-mono text-[9px] text-slate-500">A maximumok és szűrők minden bejárást explicit módon korlátoznak.</p><button type="button" onClick={onRun} disabled={working || !(query.start_node_id || selectedNodeId)} className="inline-flex min-h-10 items-center gap-2 border border-plasmaGreen/60 bg-plasmaGreen/10 px-3 font-mono text-[9px] font-black text-plasmaGreen hover:bg-plasmaGreen hover:text-slate-950 disabled:opacity-50"><Route size={13} /> BEJÁRÁS INDÍTÁSA</button></div>
      {traversal && <div className="mt-4 border border-plasmaGreen/25 bg-black/20 p-3"><p className="flex items-center gap-2 font-mono text-[10px] font-black text-plasmaGreen"><CheckCircle2 size={13} /> EREDMÉNY: {traversal.nodes?.length || 0} CSÚCS / {traversal.edges?.length || 0} ÉL {traversal.truncated ? '(KORLÁTOZOTT)' : ''}</p><div className="mt-3 space-y-2">{(traversal.paths || []).map(path => <p key={path.node_id} className="border-l-2 border-neonCyan/50 pl-2 font-mono text-[9px] text-slate-400">{path.node_ids.join('  →  ')} <span className="text-slate-600">// {path.edge_ids.join(' · ')}</span></p>)}</div></div>}
    </Panel>
  );
}

function EdgeSettingsPanel({ edge, form, onChange, onSubmit, working }) {
  if (!edge) return <Panel title="Új él metaadatai" icon={GitBranch} accent="text-neonMagenta"><p className="mb-3 font-mono text-[10px] leading-relaxed text-slate-500">Ezeket az értékeket az „ÉL LÉTREHOZÁSA” menti. Meglévő él kiválasztásakor ugyanitt szerkeszthető az auditálható konfiguráció.</p><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3"><Field label="Eredet"><select className={controlClass} value={form.origin} onChange={onChange('origin')}><option value="admin">admin</option><option value="agent">agent</option><option value="sql_sync">sql_sync</option><option value="wikilink_import">wikilink_import</option><option value="markdown_projection">markdown_projection</option></select></Field><Field label="Költség"><input required type="number" min="0" step="0.01" className={controlClass} value={form.cost} onChange={onChange('cost')} /></Field><Field label="Láthatóság"><select className={controlClass} value={form.visibility} onChange={onChange('visibility')}><option value="private">BELSŐ</option><option value="public">PUBLIKUS</option></select></Field><Field label="Érvényes ettől"><input type="datetime-local" className={controlClass} value={form.valid_from} onChange={onChange('valid_from')} /></Field><Field label="Érvényes eddig"><input type="datetime-local" className={controlClass} value={form.valid_to} onChange={onChange('valid_to')} /></Field><Field label="Provenance (JSON objektum)"><textarea className={`${controlClass} min-h-24 resize-y`} value={form.provenance} onChange={onChange('provenance')} /></Field></div></Panel>;
  return (
    <Panel title={`Él beállításai // ${edge.id}`} icon={GitBranch} accent="text-neonMagenta">
      <form onSubmit={onSubmit} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div className="border border-white/10 bg-black/20 p-2.5 font-mono text-[9px] text-slate-400"><p>{edge.source_label || edge.source_node_id} <ArrowRight className="inline text-neonMagenta" size={11} /> {edge.target_label || edge.target_node_id}</p><p className="mt-1 text-slate-600">{edge.edge_type_label || edge.edge_type_id} · origin: {edge.origin}</p></div>
        <Field label="Súly 0..1"><input required type="number" min="0" max="1" step="0.01" className={controlClass} value={form.weight} onChange={onChange('weight')} /></Field>
        <Field label="Bizonyosság 0..1"><input required type="number" min="0" max="1" step="0.01" className={controlClass} value={form.confidence} onChange={onChange('confidence')} /></Field>
        <Field label="Költség"><input required type="number" min="0" step="0.01" className={controlClass} value={form.cost} onChange={onChange('cost')} /></Field>
        <Field label="Érvényes ettől"><input type="datetime-local" className={controlClass} value={form.valid_from} onChange={onChange('valid_from')} /></Field>
        <Field label="Érvényes eddig"><input type="datetime-local" className={controlClass} value={form.valid_to} onChange={onChange('valid_to')} /></Field>
        <Field label="Láthatóság"><select className={controlClass} value={form.visibility} onChange={onChange('visibility')}><option value="private">BELSŐ</option><option value="public">PUBLIKUS</option></select></Field>
        <Field label="Provenance (JSON objektum)"><textarea className={`${controlClass} min-h-24 resize-y`} value={form.provenance} onChange={onChange('provenance')} /></Field>
        <div className="flex items-end"><button type="submit" disabled={working} className="inline-flex min-h-10 items-center gap-2 border border-neonMagenta/60 bg-neonMagenta/10 px-3 font-mono text-[9px] font-black text-neonMagenta hover:bg-neonMagenta hover:text-slate-950 disabled:opacity-50"><Save size={12} /> ÉL BEÁLLÍTÁSAINAK MENTÉSE</button></div>
      </form>
    </Panel>
  );
}

const GraphManagementTab = ({ adminFetch, onNotify }) => {
  const [graphs, setGraphs] = useState(EMPTY_LIST);
  const [edgeTypes, setEdgeTypes] = useState(EMPTY_LIST);
  const [nodes, setNodes] = useState(EMPTY_LIST);
  const [edges, setEdges] = useState(EMPTY_LIST);
  const [selectedGraphId, setSelectedGraphId] = useState('');
  const [graphNodes, setGraphNodes] = useState(EMPTY_LIST);
  const [graphEdges, setGraphEdges] = useState(EMPTY_LIST);
  const [activeView, setActiveView] = useState('graphs');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [traversal, setTraversal] = useState(null);
  const [traversalForm, setTraversalForm] = useState(traversalDraft);
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedEdgeId, setSelectedEdgeId] = useState('');
  const [graphSettingsForm, setGraphSettingsForm] = useState(graphSettingsDraft);
  const [graphForm, setGraphForm] = useState(graphDraft);
  const [edgeTypeForm, setEdgeTypeForm] = useState(edgeTypeDraft);
  const [nodeForm, setNodeForm] = useState(nodeDraft);
  const [edgeForm, setEdgeForm] = useState(edgeDraft);
  const [nodeToAttach, setNodeToAttach] = useState('');
  const [edgeToAttach, setEdgeToAttach] = useState('');

  const request = useCallback(async (url, options = {}) => {
    const response = await adminFetch(url, options);
    const payload = await readJson(response);
    if (!response.ok) throw new Error(payload.error || payload.message || `HTTP_${response.status}`);
    return payload;
  }, [adminFetch]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [graphResponse, typeResponse, nodeResponse, edgeResponse] = await Promise.all([
        request('/api/admin/graphs'),
        request('/api/admin/graphs/edge-types'),
        request('/api/admin/graphs/nodes?limit=250'),
        request('/api/admin/graphs/edges?limit=250')
      ]);
      const nextGraphs = graphResponse.graphs || [];
      setGraphs(nextGraphs);
      setEdgeTypes(typeResponse.edge_types || []);
      setNodes(nodeResponse.nodes || []);
      setEdges(edgeResponse.edges || []);
      setSelectedGraphId(current => current && nextGraphs.some(graph => graph.id === current) ? current : (nextGraphs[0]?.id || ''));
    } catch (error) {
      onNotify(`GRÁFREGISZTER_HIBA: ${error.message}`, true);
    } finally {
      setLoading(false);
    }
  }, [onNotify, request]);

  const loadGraphTopology = useCallback(async () => {
    if (!selectedGraphId) {
      setGraphNodes([]);
      setGraphEdges([]);
      return;
    }
    try {
      const [nodeData, edgeData] = await Promise.all([
        request(`/api/admin/graphs/${encodePath(selectedGraphId)}/nodes?limit=250`),
        request(`/api/admin/graphs/${encodePath(selectedGraphId)}/edges?limit=250`)
      ]);
      setGraphNodes(nodeData.nodes || []);
      setGraphEdges(edgeData.edges || []);
    } catch (error) {
      onNotify(`GRÁFTOPOLOGIA_HIBA: ${error.message}`, true);
    }
  }, [onNotify, request, selectedGraphId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadGraphTopology(); }, [loadGraphTopology]);
  useEffect(() => {
    setSelectedNodeId('');
    setSelectedEdgeId('');
    setTraversal(null);
    setTraversalForm(traversalDraft());
  }, [selectedGraphId]);

  const selectedGraph = useMemo(() => graphs.find(graph => graph.id === selectedGraphId) || null, [graphs, selectedGraphId]);
  const selectedGraphEdges = selectedGraphId ? graphEdges : edges;
  const selectedEdge = useMemo(() => selectedGraphEdges.find(edge => edge.id === selectedEdgeId) || null, [selectedEdgeId, selectedGraphEdges]);
  const currentNodes = selectedGraphId ? graphNodes : nodes;
  useEffect(() => { setGraphSettingsForm(graphSettingsDraft(selectedGraph)); }, [selectedGraph]);
  const attachableNodes = useMemo(() => {
    const memberIds = new Set(graphNodes.map(node => node.id));
    return nodes.filter(node => !memberIds.has(node.id));
  }, [graphNodes, nodes]);
  const attachableEdges = useMemo(() => (
    edges.filter(edge => !(edge.graph_ids || []).includes(selectedGraphId))
  ), [edges, selectedGraphId]);
  const graphMarkdownNodeIds = useMemo(() => graphNodes
    .filter(node => node.source_system === 'markdown')
    .map(node => node.id), [graphNodes]);

  const mutate = async (action, successMessage) => {
    setWorking(true);
    try {
      await action();
      await load();
      await loadGraphTopology();
      onNotify(successMessage);
    } catch (error) {
      onNotify(`GRÁF_MŰVELET_HIBA: ${error.message}`, true);
    } finally {
      setWorking(false);
    }
  };

  const createGraph = event => {
    event.preventDefault();
    mutate(async () => {
      const graph = await request('/api/admin/graphs', {
        method: 'POST',
        body: JSON.stringify({
          ...(text(graphForm.id) ? { id: text(graphForm.id) } : {}),
          slug: text(graphForm.slug), name: text(graphForm.name), description: text(graphForm.description),
          icon_key: text(graphForm.icon_key) || 'network', color: text(graphForm.color) || '#00FFFF',
          visibility: graphForm.visibility, active: true
        })
      });
      setGraphForm(graphDraft());
      setSelectedGraphId(graph.graph?.id || '');
    }, 'SAJÁT_GRÁF_LÉTREHOZVA');
  };

  const updateGraphSettings = event => {
    event.preventDefault();
    if (!selectedGraph) return;
    mutate(() => request(`/api/admin/graphs/${encodePath(selectedGraph.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: text(graphSettingsForm.name), description: text(graphSettingsForm.description),
        icon_key: text(graphSettingsForm.icon_key) || 'network', color: text(graphSettingsForm.color),
        visibility: graphSettingsForm.visibility, active: Boolean(graphSettingsForm.active)
      })
    }), 'GRÁFRÉTEG_BEÁLLÍTÁSAI_MENTVE');
  };

  const createEdgeType = event => {
    event.preventDefault();
    mutate(async () => {
      await request('/api/admin/graphs/edge-types', {
        method: 'POST',
        body: JSON.stringify({
          ...(text(edgeTypeForm.id) ? { id: text(edgeTypeForm.id) } : {}),
          slug: text(edgeTypeForm.slug), label: text(edgeTypeForm.label), description: text(edgeTypeForm.description),
          icon_key: text(edgeTypeForm.icon_key) || 'git-branch', color: text(edgeTypeForm.color) || '#80FF00',
          source_node_types: csv(edgeTypeForm.source_node_types), target_node_types: csv(edgeTypeForm.target_node_types),
          allow_self_loop: Boolean(edgeTypeForm.allow_self_loop), default_weight: Number(edgeTypeForm.default_weight),
          default_confidence: Number(edgeTypeForm.default_confidence), default_cost: Number(edgeTypeForm.default_cost),
          visibility: edgeTypeForm.visibility, active: true
        })
      });
      setEdgeTypeForm(edgeTypeDraft());
    }, 'ÉLTÍPUS_LÉTREHOZVA');
  };

  const createNode = event => {
    event.preventDefault();
    if (!selectedGraphId) {
      onNotify('ELŐBB_VÁLASSZ_GRÁFOT', true);
      return;
    }
    mutate(async () => {
      const response = await request('/api/admin/graphs/nodes', {
        method: 'POST',
        body: JSON.stringify({
          ...(text(nodeForm.id) ? { id: text(nodeForm.id) } : {}),
          node_type: text(nodeForm.node_type), label: text(nodeForm.label), description: text(nodeForm.description),
          source_system: text(nodeForm.source_system) || 'manual', source_reference: text(nodeForm.source_reference),
          visibility: nodeForm.visibility, active: true
        })
      });
      await request(`/api/admin/graphs/${encodePath(selectedGraphId)}/nodes/${encodePath(response.node.id)}`, {
        method: 'PUT', body: JSON.stringify({ metadata: {} })
      });
      setNodeForm(nodeDraft());
    }, 'CSÚCS_LÉTREHOZVA_ÉS_GRÁFHOZ_RENDELVE');
  };

  const createEdge = event => {
    event.preventDefault();
    if (!selectedGraphId) {
      onNotify('ELŐBB_VÁLASSZ_GRÁFOT', true);
      return;
    }
    mutate(async () => {
      await request('/api/admin/graphs/edges', {
        method: 'POST',
        body: JSON.stringify({
          source_node_id: edgeForm.source_node_id, target_node_id: edgeForm.target_node_id,
          edge_type_id: edgeForm.edge_type_id, graph_ids: [selectedGraphId], origin: edgeForm.origin,
          bidirectional: Boolean(edgeForm.bidirectional), weight: Number(edgeForm.weight),
          confidence: Number(edgeForm.confidence), cost: Number(edgeForm.cost),
          provenance: parseObject(edgeForm.provenance, 'PROVENANCE'),
          ...(text(edgeForm.valid_from) ? { valid_from: new Date(edgeForm.valid_from).toISOString() } : {}),
          ...(text(edgeForm.valid_to) ? { valid_to: new Date(edgeForm.valid_to).toISOString() } : {}),
          visibility: edgeForm.visibility, active: true
        })
      });
      setEdgeForm(edgeDraft());
    }, edgeForm.bidirectional ? 'KÉT PÁROSÍTOTT_IRÁNYÍTOTT_ÉL_LÉTREHOZVA' : 'IRÁNYÍTOTT_ÉL_LÉTREHOZVA');
  };

  const updateSelectedEdge = event => {
    event.preventDefault();
    if (!selectedEdge) return;
    mutate(() => request(`/api/admin/graphs/edges/${encodePath(selectedEdge.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        weight: Number(edgeForm.weight), confidence: Number(edgeForm.confidence), cost: Number(edgeForm.cost),
        provenance: parseObject(edgeForm.provenance, 'PROVENANCE'),
        valid_from: text(edgeForm.valid_from) ? new Date(edgeForm.valid_from).toISOString() : null,
        valid_to: text(edgeForm.valid_to) ? new Date(edgeForm.valid_to).toISOString() : null,
        visibility: edgeForm.visibility
      })
    }), 'IRÁNYÍTOTT_ÉL_BEÁLLÍTÁSAI_MENTVE');
  };

  const attachExistingNode = event => {
    event.preventDefault();
    if (!selectedGraphId || !nodeToAttach) {
      onNotify('CSÚCSOT_ÉS_CÉLGRÁFOT_KELL_VÁLASZTANI', true);
      return;
    }
    mutate(async () => {
      await request(`/api/admin/graphs/${encodePath(selectedGraphId)}/nodes/${encodePath(nodeToAttach)}`, {
        method: 'PUT', body: JSON.stringify({ metadata: {} })
      });
      setNodeToAttach('');
    }, 'MEGLÉVŐ_CSÚCS_HOZZÁRENDELVE_A_GRÁFHOZ');
  };

  const attachExistingEdge = event => {
    event.preventDefault();
    const edge = edges.find(item => item.id === edgeToAttach);
    if (!selectedGraphId || !edge) {
      onNotify('ÉLT_ÉS_CÉLGRÁFOT_KELL_VÁLASZTANI', true);
      return;
    }
    mutate(async () => {
      // Membership is a view, not a copy.  The endpoint enforces that both
      // endpoints join the layer before the already-existing arc can join it.
      await request(`/api/admin/graphs/${encodePath(selectedGraphId)}/nodes/${encodePath(edge.source_node_id)}`, {
        method: 'PUT', body: JSON.stringify({ metadata: {} })
      });
      await request(`/api/admin/graphs/${encodePath(selectedGraphId)}/nodes/${encodePath(edge.target_node_id)}`, {
        method: 'PUT', body: JSON.stringify({ metadata: {} })
      });
      await request(`/api/admin/graphs/${encodePath(selectedGraphId)}/edges/${encodePath(edge.id)}`, {
        method: 'PUT', body: JSON.stringify({ metadata: {} })
      });
      setEdgeToAttach('');
    }, 'MEGLÉVŐ_ÉL_ÚJ_GRÁFRÉTEGHEZ_RENDELVE');
  };

  const retryGraphMarkdownProjections = () => {
    if (!graphMarkdownNodeIds.length) {
      onNotify('AZ_AKTÍV_GRÁFBAN_NINCS_MARKDOWN_CSÚCS', true);
      return;
    }
    mutate(async () => {
      const response = await request('/api/admin/graphs/projections/retry', {
        method: 'POST', body: JSON.stringify({ node_ids: graphMarkdownNodeIds })
      });
      const projection = response.markdown_projection || {};
      if (projection.failed) throw new Error(`CA_SYSTEM_PROJECTION_FAILED:${projection.failed}`);
    }, 'CA_SYSTEM_VETÍTÉSEK_FRISSÍTVE');
  };

  const deleteItem = (path, message) => {
    if (!window.confirm('Biztosan törlöd? A kapcsolat- és tagsági következmények is érvényesülnek.')) return;
    mutate(() => request(path, { method: 'DELETE' }), message);
  };

  const runTraversal = () => {
    const startNodeId = traversalForm.start_node_id || selectedNodeId || edgeForm.source_node_id;
    if (!selectedGraphId || !startNodeId) {
      onNotify('BEJÁRÁSHOZ_VÁLASSZ_GRÁFOT_ÉS_KEZDŐCSÚCSOT', true);
      return;
    }
    mutate(async () => {
      const data = await request(`/api/admin/graphs/${encodePath(selectedGraphId)}/traverse`, {
        method: 'POST',
        body: JSON.stringify({
          start_node_ids: [startNodeId], direction: traversalForm.direction,
          max_depth: Number(traversalForm.max_depth), max_nodes: Number(traversalForm.max_nodes),
          min_confidence: Number(traversalForm.min_confidence), edge_type_ids: traversalForm.edge_type_ids,
          origins: traversalForm.origins,
          ...(text(traversalForm.as_of) ? { as_of: new Date(traversalForm.as_of).toISOString() } : {})
        })
      });
      setTraversal(data);
    }, 'KONFIGURÁLT_GRÁFBEJÁRÁS_KÉSZ');
  };

  const setForm = (setter, field) => event => setter(current => ({ ...current, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const pickGraphNode = node => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId('');
    setEdgeForm(current => ({ ...current, source_node_id: node.id }));
    setTraversalForm(current => ({ ...current, start_node_id: node.id }));
    setTraversal(null);
  };
  const pickGraphEdge = edge => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(current => current || edge.source_node_id);
    setEdgeForm(current => ({
      ...current,
      source_node_id: edge.source_node_id,
      target_node_id: edge.target_node_id,
      edge_type_id: edge.edge_type_id,
      weight: String(edge.weight ?? 1), confidence: String(edge.confidence ?? 1), cost: String(edge.cost ?? 1),
      provenance: JSON.stringify(edge.provenance || {}, null, 2), valid_from: asDateTimeInput(edge.valid_from),
      valid_to: asDateTimeInput(edge.valid_to), visibility: edge.visibility || 'private'
    }));
  };

  const navItems = [
    ['graphs', 'GRÁFOK', Network], ['types', 'ÉLTÍPUSOK', GitBranch], ['nodes', 'CSÚCSOK', CircleDot], ['edges', 'ÉLEK / BEJÁRÁS', Route]
  ];

  return (
    <div className="space-y-5">
      <div className="relative overflow-hidden border border-neonCyan/30 bg-[#07111e] p-5">
        <div className="pointer-events-none absolute inset-0 opacity-45 [background-image:linear-gradient(rgba(0,251,251,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(0,251,251,.07)_1px,transparent_1px)] [background-size:26px_26px]" />
        <div className="relative flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="font-mono text-[10px] font-black uppercase tracking-[.2em] text-neonCyan">Directed multilayer graph control</p>
            <h2 className="mt-1 font-headline text-2xl font-black uppercase text-white">Gráfkezelő // DB az elsődleges forrás</h2>
            <p className="mt-2 max-w-3xl font-mono text-[11px] leading-relaxed text-slate-400">Egy csúcs több gráfban szerepelhet. Egyirányú kapcsolat egy ív; a kétirányú kapcsolat két tranzakcióban párosított irányított ív. A teljes audit a DB-ben marad, az Obsidian csak lapos vetületet kap.</p>
          </div>
          <div className="flex flex-wrap gap-2 font-mono text-[10px] font-bold">
            <span className="border border-neonCyan/35 bg-neonCyan/10 px-2 py-1 text-neonCyan">{graphs.length} GRÁF</span>
            <span className="border border-plasmaGreen/35 bg-plasmaGreen/10 px-2 py-1 text-plasmaGreen">{nodes.length} CSÚCS</span>
            <span className="border border-neonMagenta/35 bg-neonMagenta/10 px-2 py-1 text-neonMagenta">{edges.length} ÉL</span>
            <button type="button" onClick={load} disabled={loading || working} className="inline-flex items-center gap-1 border border-white/20 px-2 py-1 text-slate-300 hover:border-neonCyan hover:text-neonCyan"><RefreshCw size={11} className={loading ? 'animate-spin' : ''} />FRISSÍTÉS</button>
          </div>
        </div>
      </div>

      <nav aria-label="Gráfkezelő nézetei" className="flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {navItems.map(([id, label, Icon]) => <button key={id} type="button" onClick={() => setActiveView(id)} className={`inline-flex min-h-10 items-center gap-2 border px-3 font-mono text-[10px] font-black tracking-[.12em] transition-colors ${activeView === id ? 'border-neonCyan bg-neonCyan text-slate-950' : 'border-white/15 bg-slate-950/50 text-slate-400 hover:border-neonCyan/60 hover:text-neonCyan'}`}>{React.createElement(Icon, { size: 13 })}{label}</button>)}
      </nav>

      <div className="flex flex-wrap items-center gap-3 border border-white/10 bg-black/20 px-4 py-3">
        <span className="font-mono text-[9px] font-black uppercase tracking-[.13em] text-slate-500">Aktív gráf</span>
        <select value={selectedGraphId} onChange={event => setSelectedGraphId(event.target.value)} className={`${controlClass} min-w-64`} aria-label="Aktív gráf kiválasztása">
          <option value="">-- VÁLASSZ GRÁFOT --</option>
          {graphs.map(graph => <option key={graph.id} value={graph.id}>{graph.name} // {graph.id}</option>)}
        </select>
        {selectedGraph && <span className="font-mono text-[10px] text-slate-400"><b style={{ color: selectedGraph.color }}>{selectedGraph.slug}</b> · {graphNodes.length} tagsági csúcs · {selectedGraphEdges.length} él</span>}
      </div>

      {activeView === 'graphs' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Panel title="Új saját gráf" icon={Network}>
          <form onSubmit={createGraph} className="grid gap-3 sm:grid-cols-2">
            <Field label="Stabil ID (opcionális)"><input className={controlClass} value={graphForm.id} onChange={setForm(setGraphForm, 'id')} placeholder="project/prj-2026-884" /></Field>
            <Field label="Slug"><input required className={controlClass} value={graphForm.slug} onChange={setForm(setGraphForm, 'slug')} placeholder="projekt-terv" /></Field>
            <Field label="Név"><input required className={controlClass} value={graphForm.name} onChange={setForm(setGraphForm, 'name')} placeholder="PRJ-2026-884 projektgráf" /></Field>
            <Field label="Láthatóság"><select className={controlClass} value={graphForm.visibility} onChange={setForm(setGraphForm, 'visibility')}><option value="private">BELSŐ</option><option value="public">PUBLIKUS</option></select></Field>
            <Field label="Ikon kulcs"><input className={controlClass} value={graphForm.icon_key} onChange={setForm(setGraphForm, 'icon_key')} /></Field>
            <Field label="Szín"><input className={controlClass} value={graphForm.color} onChange={setForm(setGraphForm, 'color')} pattern="^#[0-9a-fA-F]{6}$" /></Field>
            <Field label="Leírás"><textarea className={`${controlClass} min-h-20 resize-y`} value={graphForm.description} onChange={setForm(setGraphForm, 'description')} /></Field>
            <div className="flex items-end"><SubmitButton disabled={working}>GRÁF LÉTREHOZÁSA</SubmitButton></div>
          </form>
        </Panel>
        <Panel title="Tulajdonlási szerződés" icon={ShieldCheck} accent="text-plasmaGreen"><div className="space-y-3 font-mono text-[10px] leading-relaxed text-slate-400"><p><b className="text-neonCyan">CA:RELATIONS</b> = emberi, wikilink-szerű input.</p><p><b className="text-plasmaGreen">SQLite</b> = típus, irány, súly, érvényesség és audit.</p><p><b className="text-neonMagenta">CA:SYSTEM</b> = checksumos, csak rendszer által írt olvasható vetület.</p></div></Panel>
        <div className="xl:col-span-2 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {graphs.map(graph => <article key={graph.id} className={`border p-4 transition-colors ${graph.id === selectedGraphId ? 'border-neonCyan bg-neonCyan/5' : 'border-white/10 bg-slate-950/45 hover:border-white/30'}`}><button type="button" onClick={() => setSelectedGraphId(graph.id)} className="w-full text-left"><div className="flex items-center justify-between gap-3"><span className="font-mono text-[9px] font-black uppercase tracking-[.12em]" style={{ color: graph.color }}>{graph.active ? 'AKTÍV' : 'INAKTÍV'}</span><span className="font-mono text-[9px] text-slate-600">{graph.visibility}</span></div><h3 className="mt-2 font-mono text-sm font-black text-white">{graph.name}</h3><p className="mt-1 font-mono text-[10px] text-slate-500">{graph.id}</p><p className="mt-3 min-h-8 font-mono text-[10px] leading-relaxed text-slate-400">{graph.description || 'Nincs leírás.'}</p></button><div className="mt-3 flex justify-between"><span className="font-mono text-[9px] text-slate-600">{graph.node_count ?? 0} V / {graph.edge_count ?? 0} E</span><DangerButton label="TÖRLÉS" onClick={() => deleteItem(`/api/admin/graphs/${encodePath(graph.id)}`, 'GRÁF_TÖRÖLVE')} /></div></article>)}
          {!graphs.length && !loading && <div className="border border-dashed border-white/20 p-5 font-mono text-xs text-slate-500">Még nincs gráf. Hozz létre egy projekt-, folyamat- vagy hatásgráfot.</div>}
        </div>
      </div>}

      {activeView === 'graphs' && selectedGraph && <GraphSettingsPanel graph={selectedGraph} form={graphSettingsForm} onChange={field => setForm(setGraphSettingsForm, field)} onSubmit={updateGraphSettings} working={working} />}

      {activeView === 'types' && <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Új éltípus" icon={GitBranch} accent="text-plasmaGreen"><form onSubmit={createEdgeType} className="grid gap-3 sm:grid-cols-2"><Field label="Stabil ID"><input className={controlClass} value={edgeTypeForm.id} onChange={setForm(setEdgeTypeForm, 'id')} placeholder="depends_on" /></Field><Field label="Slug"><input required className={controlClass} value={edgeTypeForm.slug} onChange={setForm(setEdgeTypeForm, 'slug')} placeholder="depends-on" /></Field><Field label="Megjelenített név"><input required className={controlClass} value={edgeTypeForm.label} onChange={setForm(setEdgeTypeForm, 'label')} placeholder="Függ ettől" /></Field><Field label="Ikon"><input className={controlClass} value={edgeTypeForm.icon_key} onChange={setForm(setEdgeTypeForm, 'icon_key')} /></Field><Field label="Forrás csúcstípusok (CSV)"><input className={controlClass} value={edgeTypeForm.source_node_types} onChange={setForm(setEdgeTypeForm, 'source_node_types')} /></Field><Field label="Cél csúcstípusok (CSV)"><input className={controlClass} value={edgeTypeForm.target_node_types} onChange={setForm(setEdgeTypeForm, 'target_node_types')} /></Field><Field label="Alap súly 0..1"><input required type="number" min="0" max="1" step="0.01" className={controlClass} value={edgeTypeForm.default_weight} onChange={setForm(setEdgeTypeForm, 'default_weight')} /></Field><Field label="Alap bizonyosság 0..1"><input required type="number" min="0" max="1" step="0.01" className={controlClass} value={edgeTypeForm.default_confidence} onChange={setForm(setEdgeTypeForm, 'default_confidence')} /></Field><Field label="Szín"><input className={controlClass} value={edgeTypeForm.color} onChange={setForm(setEdgeTypeForm, 'color')} /></Field><Field label="Láthatóság"><select className={controlClass} value={edgeTypeForm.visibility} onChange={setForm(setEdgeTypeForm, 'visibility')}><option value="private">BELSŐ</option><option value="public">PUBLIKUS</option></select></Field><div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3"><label className="inline-flex items-center gap-2 font-mono text-[10px] text-slate-400"><input type="checkbox" checked={edgeTypeForm.allow_self_loop} onChange={setForm(setEdgeTypeForm, 'allow_self_loop')} /> ÖNHUROK ENGEDÉLYEZETT</label><SubmitButton disabled={working}>ÉLTÍPUS LÉTREHOZÁSA</SubmitButton></div></form></Panel>
        <Panel title="Éltípus-készlet" icon={GitBranch} accent="text-plasmaGreen"><div className="space-y-2">{edgeTypes.map(type => <div key={type.id} className="flex items-center justify-between gap-3 border border-white/10 bg-black/20 p-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className="h-2 w-2" style={{ background: type.color }} /><b className="font-mono text-xs text-slate-100">{type.label}</b></div><p className="mt-1 truncate font-mono text-[9px] text-slate-500">{type.id} · {type.source_node_types?.join(', ') || '*'} <ArrowRight className="inline" size={10} /> {type.target_node_types?.join(', ') || '*'}</p></div><DangerButton label="TÖRLÉS" onClick={() => deleteItem(`/api/admin/graphs/edge-types/${encodePath(type.id)}`, 'ÉLTÍPUS_TÖRÖLVE')} /></div>)}{!edgeTypes.length && <p className="font-mono text-xs text-slate-500">Előbb definiálj kapcsolati szemantikát, például <code>contains</code>, <code>depends_on</code> vagy <code>blocks</code>.</p>}</div></Panel>
      </div>}

      {activeView === 'nodes' && <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]"><Panel title="Új csúcs az aktív gráfba" icon={CircleDot}><form onSubmit={createNode} className="space-y-3"><Field label="Stabil ID"><input className={controlClass} value={nodeForm.id} onChange={setForm(setNodeForm, 'id')} placeholder="task:TASK-004" /></Field><Field label="Csúcstípus"><input required className={controlClass} value={nodeForm.node_type} onChange={setForm(setNodeForm, 'node_type')} placeholder="task" /></Field><Field label="Név"><input required className={controlClass} value={nodeForm.label} onChange={setForm(setNodeForm, 'label')} /></Field><Field label="Forrásrendszer"><input className={controlClass} value={nodeForm.source_system} onChange={setForm(setNodeForm, 'source_system')} /></Field><Field label="Forráshivatkozás"><input className={controlClass} value={nodeForm.source_reference} onChange={setForm(setNodeForm, 'source_reference')} placeholder="TASK-004" /></Field><SubmitButton disabled={working || !selectedGraphId}>CSÚCS LÉTREHOZÁSA</SubmitButton></form></Panel><Panel title={selectedGraph ? `${selectedGraph.name} csúcsai` : 'Csúcsok'} icon={CircleDot}><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{currentNodes.map(node => <div key={node.id} className="border border-white/10 bg-black/20 p-3"><div className="flex justify-between gap-2"><span className="font-mono text-[9px] font-black text-plasmaGreen">{node.node_type}</span><span className="font-mono text-[8px] text-slate-600">{node.source_system}</span></div><b className="mt-2 block truncate font-mono text-xs text-slate-100">{node.label}</b><p className="mt-1 truncate font-mono text-[9px] text-slate-500">{node.id}</p><div className="mt-3 flex justify-end"><DangerButton label="TÖRLÉS" onClick={() => deleteItem(`/api/admin/graphs/nodes/${encodePath(node.id)}`, 'CSÚCS_TÖRÖLVE')} /></div></div>)}{!currentNodes.length && <p className="font-mono text-xs text-slate-500">{selectedGraph ? 'Nincs csúcs ebben a gráfban.' : 'Nincs létrehozott csúcs.'}</p>}</div></Panel></div>}

      {activeView === 'edges' && (
        <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <Panel title="Új irányított kapcsolat" icon={Route} accent="text-neonMagenta">
            <form onSubmit={createEdge} className="space-y-3">
              <Field label="Forráscsúcs"><select required className={controlClass} value={edgeForm.source_node_id} onChange={setForm(setEdgeForm, 'source_node_id')}><option value="">-- FORRÁS --</option>{graphNodes.map(node => <option key={node.id} value={node.id}>{node.label} // {node.id}</option>)}</select></Field>
              <Field label="Célcsúcs"><select required className={controlClass} value={edgeForm.target_node_id} onChange={setForm(setEdgeForm, 'target_node_id')}><option value="">-- CÉL --</option>{graphNodes.map(node => <option key={node.id} value={node.id}>{node.label} // {node.id}</option>)}</select></Field>
              <Field label="Éltípus"><select required className={controlClass} value={edgeForm.edge_type_id} onChange={setForm(setEdgeForm, 'edge_type_id')}><option value="">-- TÍPUS --</option>{edgeTypes.map(type => <option key={type.id} value={type.id}>{type.label} // {type.id}</option>)}</select></Field>
              <div className="grid grid-cols-3 gap-3"><Field label="Súly"><input required type="number" min="0" max="1" step="0.01" className={controlClass} value={edgeForm.weight} onChange={setForm(setEdgeForm, 'weight')} /></Field><Field label="Bizonyosság"><input required type="number" min="0" max="1" step="0.01" className={controlClass} value={edgeForm.confidence} onChange={setForm(setEdgeForm, 'confidence')} /></Field><Field label="Költség"><input required type="number" min="0" step="0.01" className={controlClass} value={edgeForm.cost} onChange={setForm(setEdgeForm, 'cost')} /></Field></div>
              <label className="flex items-start gap-2 border border-plasmaGreen/25 bg-plasmaGreen/5 p-2.5 font-mono text-[10px] leading-relaxed text-slate-300"><input type="checkbox" className="mt-0.5" checked={edgeForm.bidirectional} onChange={setForm(setEdgeForm, 'bidirectional')} /><span><b className="text-plasmaGreen">KÉTIRÁNYÚ TÉNY</b><br />Két párosított, de továbbra is külön irányított él jön létre azonos <code>relation_group_id</code>-val.</span></label>
              <SubmitButton disabled={working || !selectedGraphId}>ÉL LÉTREHOZÁSA</SubmitButton>
            </form>
          </Panel>
          <Panel title={selectedGraph ? selectedGraph.name + ' élei' : 'Élek'} icon={GitBranch} accent="text-neonMagenta">
            <div className="space-y-2">
              {selectedGraphEdges.map(edge => <article key={edge.id} className={selectedEdgeId === edge.id ? 'flex flex-wrap items-center justify-between gap-3 border border-neonMagenta bg-neonMagenta/5 p-3 transition-colors' : 'flex flex-wrap items-center justify-between gap-3 border border-white/10 bg-black/20 p-3 transition-colors hover:border-neonMagenta/55'}><button type="button" onClick={() => pickGraphEdge(edge)} className="min-w-0 flex-1 text-left"><div className="flex min-w-0 items-center gap-2 font-mono text-[10px]"><span className="truncate text-slate-200">{edge.source_label}</span><ArrowRight size={14} className="shrink-0" style={{ color: edge.edge_type_color }} /><span className="truncate text-slate-200">{edge.target_label}</span><span className="border border-white/15 px-1.5 py-0.5 text-[8px] font-black" style={{ color: edge.edge_type_color }}>{edge.edge_type_label}</span></div><p className="mt-1 font-mono text-[8px] text-slate-600">{edge.id} · {edge.origin} · c:{edge.confidence} · {(edge.graph_ids || []).length} gráfréteg{edge.relation_group_id ? ' · ↔ ' + edge.relation_group_id : ''}</p></button><DangerButton label="TÖRLÉS" onClick={() => deleteItem('/api/admin/graphs/edges/' + encodePath(edge.id), 'ÉL_TÖRÖLVE')} /></article>)}
              {!selectedGraphEdges.length && <p className="font-mono text-xs text-slate-500">Válassz gráfot, majd add hozzá a tagsági csúcsokat és az irányított éleket.</p>}
            </div>
          </Panel>
        </div>
      )}
      {activeView === 'edges' && selectedGraph && <div className="space-y-5"><GraphTopologyPreview graph={selectedGraph} graphs={graphs} nodes={graphNodes} edges={selectedGraphEdges} selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId} traversal={traversal} onPickNode={pickGraphNode} onPickEdge={pickGraphEdge} /><AdminTraversalPanel graphNodes={graphNodes} edgeTypes={edgeTypes} selectedNodeId={selectedNodeId} query={traversalForm} traversal={traversal} working={working} onSetQuery={setTraversalForm} onSelectStart={nodeId => { setSelectedNodeId(nodeId); setTraversalForm(current => ({ ...current, start_node_id: nodeId })); setEdgeForm(current => ({ ...current, source_node_id: nodeId })); }} onRun={runTraversal} /><EdgeSettingsPanel edge={selectedEdge} form={edgeForm} onChange={field => setForm(setEdgeForm, field)} onSubmit={updateSelectedEdge} working={working} /></div>}

      {selectedGraph && <section className="border border-plasmaGreen/25 bg-plasmaGreen/[.035] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] font-black uppercase tracking-[.14em] text-plasmaGreen">Többgráfos tagság // nincs másolat</p>
            <p className="mt-1 max-w-3xl font-mono text-[10px] leading-relaxed text-slate-400">Ugyanazt a stabil csúcsot vagy irányított élt rendeld az aktív <b className="text-slate-200">{selectedGraph.name}</b> nézethez. A rendszer csak M:N tagságot ad hozzá; a csúcs, az él, a bizonyíték és az audit ugyanaz marad.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[9px] text-slate-500">{attachableNodes.length} CSÚCS / {attachableEdges.length} ÉL HOZZÁADHATÓ</span>
            <button type="button" onClick={retryGraphMarkdownProjections} disabled={working || !graphMarkdownNodeIds.length} className="min-h-8 border border-neonCyan/55 px-2 font-mono text-[8px] font-black text-neonCyan hover:bg-neonCyan hover:text-slate-950 disabled:opacity-50">CA:SYSTEM ÚJRAVETÍTÉS ({graphMarkdownNodeIds.length})</button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <form onSubmit={attachExistingNode} className="flex flex-wrap items-end gap-2 border border-white/10 bg-black/20 p-3">
            <Field label="Meglévő csúcs hozzáadása"><select value={nodeToAttach} onChange={event => setNodeToAttach(event.target.value)} className={`${controlClass} min-w-64`}><option value="">-- CSÚCS --</option>{attachableNodes.map(node => <option key={node.id} value={node.id}>{node.label} // {node.id}</option>)}</select></Field>
            <button type="submit" disabled={working || !nodeToAttach} className="min-h-10 border border-plasmaGreen/60 px-3 font-mono text-[9px] font-black text-plasmaGreen hover:bg-plasmaGreen hover:text-slate-950 disabled:opacity-50">CSÚCS HOZZÁADÁSA</button>
          </form>
          <form onSubmit={attachExistingEdge} className="flex flex-wrap items-end gap-2 border border-white/10 bg-black/20 p-3">
            <Field label="Meglévő él hozzáadása"><select value={edgeToAttach} onChange={event => setEdgeToAttach(event.target.value)} className={`${controlClass} min-w-64`}><option value="">-- ÉL --</option>{attachableEdges.map(edge => <option key={edge.id} value={edge.id}>{edge.source_label} → {edge.target_label} // {edge.edge_type_label}</option>)}</select></Field>
            <button type="submit" disabled={working || !edgeToAttach} className="min-h-10 border border-plasmaGreen/60 px-3 font-mono text-[9px] font-black text-plasmaGreen hover:bg-plasmaGreen hover:text-slate-950 disabled:opacity-50">ÉL HOZZÁADÁSA</button>
          </form>
        </div>
      </section>}
    </div>
  );
};

export default GraphManagementTab;
