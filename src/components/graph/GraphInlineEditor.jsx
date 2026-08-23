import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleDot, GitBranch, Layers3, LoaderCircle, Network, Plus, Save, Settings2, Sparkles } from 'lucide-react';

const GraphRelationCanvas = React.lazy(() => import('./GraphRelationCanvas.jsx'));

const EMPTY_LIST = Object.freeze([]);
const text = value => String(value ?? '').trim();
const encodePath = value => encodeURIComponent(String(value || ''));
const controlClass = 'min-h-10 border border-white/15 bg-slate-950 px-2.5 font-mono text-xs text-slate-100 outline-none transition-colors focus:border-neonCyan focus:ring-1 focus:ring-neonCyan/35 disabled:cursor-not-allowed disabled:opacity-50';

const nodeDraft = node => ({
  id: '',
  node_type: text(node?.node_type) || 'task',
  label: text(node?.label),
  description: text(node?.description),
  visibility: node?.visibility || 'private',
  active: node?.active !== false,
  metadata: JSON.stringify(node?.metadata || {}, null, 2)
});

const edgeDraft = edge => ({
  source_node_id: text(edge?.source_node_id),
  target_node_id: text(edge?.target_node_id),
  edge_type_id: text(edge?.edge_type_id || edge?.edge_type?.id),
  weight: String(edge?.weight ?? 1),
  confidence: String(edge?.confidence ?? 1),
  cost: String(edge?.cost ?? 1),
  origin: text(edge?.origin) || 'admin',
  visibility: edge?.visibility || 'private',
  active: edge?.active !== false,
  valid_from: toDateTimeInput(edge?.valid_from),
  valid_to: toDateTimeInput(edge?.valid_to),
  provenance: JSON.stringify(edge?.provenance || {}, null, 2),
  metadata: JSON.stringify(edge?.metadata || {}, null, 2),
  bidirectional: false
});

const layerDraft = graph => ({
  name: text(graph?.name),
  description: text(graph?.description),
  icon_key: text(graph?.icon_key) || 'network',
  color: text(graph?.color) || '#00FFFF',
  visibility: graph?.visibility || 'private',
  active: graph?.active !== false
});

const membershipDraft = () => ({
  kind: 'node',
  record_id: '',
  metadata: '{}'
});

function toDateTimeInput(value) {
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString().slice(0, 16) : '';
}

function parseObject(value, label) {
  try {
    const parsed = JSON.parse(text(value) || '{}');
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('NOT_OBJECT');
    return parsed;
  } catch {
    throw new Error(`${label}_ÉRVÉNYTELEN_JSON`);
  }
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function Field({ label, children }) {
  return <label className="flex min-w-0 flex-col gap-1 font-mono text-[8px] font-black uppercase tracking-[.13em] text-slate-500">{label}{children}</label>;
}

function TabButton({ active, onClick, Icon, children }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`inline-flex min-h-9 items-center gap-1.5 border px-2.5 font-mono text-[9px] font-black uppercase tracking-[.1em] transition-colors ${active ? 'border-neonCyan bg-neonCyan text-slate-950' : 'border-white/15 bg-black/20 text-slate-400 hover:border-neonCyan/60 hover:text-neonCyan'}`}>{Icon && <Icon size={12} aria-hidden="true" />}{children}</button>;
}

function EditorHeading({ children, detail }) {
  return <div className="border-b border-white/10 bg-black/20 px-4 py-3"><p className="font-mono text-[9px] font-black uppercase tracking-[.14em] text-neonCyan">{children}</p>{detail && <p className="mt-1 font-mono text-[8px] leading-relaxed text-slate-500">{detail}</p>}</div>;
}

/**
 * Direct editor for a DB graph layer. It is intentionally rendered only in
 * server-validated admin view; every mutation still travels through the
 * existing /api/admin/graphs contract and never writes Markdown directly.
 */
const GraphInlineEditor = ({
  graph,
  nodes = EMPTY_LIST,
  selectedNode,
  selectedEdge,
  adminFetch,
  onGraphChanged,
  onSelectNode = () => {},
  onSelectEdge = () => {},
  onBeginRelationship = () => {}
}) => {
  const [activeTab, setActiveTab] = useState('element');
  const [adminNodes, setAdminNodes] = useState(EMPTY_LIST);
  const [adminEdges, setAdminEdges] = useState(EMPTY_LIST);
  const [edgeTypes, setEdgeTypes] = useState(EMPTY_LIST);
  const [nodeForm, setNodeForm] = useState(() => nodeDraft(selectedNode));
  const [edgeForm, setEdgeForm] = useState(() => edgeDraft(selectedEdge));
  const [layerForm, setLayerForm] = useState(() => layerDraft(graph));
  const [membershipForm, setMembershipForm] = useState(membershipDraft);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const request = useCallback(async (url, options = {}) => {
    const response = await adminFetch(url, options);
    const payload = await readJson(response);
    if (!response.ok) throw new Error(payload.error || payload.message || `HTTP_${response.status}`);
    return payload;
  }, [adminFetch]);

  const loadEditorData = useCallback(async () => {
    if (!graph?.id) return;
    setLoading(true);
    setError('');
    try {
      const [nodeData, edgeData, typeData] = await Promise.all([
        request(`/api/admin/graphs/${encodePath(graph.id)}/nodes?limit=250`),
        request(`/api/admin/graphs/${encodePath(graph.id)}/edges?limit=250`),
        request('/api/admin/graphs/edge-types')
      ]);
      setAdminNodes(nodeData.nodes || []);
      setAdminEdges(edgeData.edges || []);
      setEdgeTypes(typeData.edge_types || []);
    } catch (requestError) {
      setError(`SZERKESZTŐ_BETÖLTÉSI_HIBA: ${requestError.message}`);
    } finally {
      setLoading(false);
    }
  }, [graph?.id, request]);

  useEffect(() => { loadEditorData(); }, [loadEditorData]);
  useEffect(() => { setLayerForm(layerDraft(graph)); }, [graph]);

  // The public snapshot deliberately redacts metadata. Only the admin record
  // may be written back, otherwise a transient public fallback could replace
  // an existing private metadata object with `{}`.
  const adminNodeRecord = useMemo(() => adminNodes.find(node => String(node.id) === String(selectedNode?.id)) || null, [adminNodes, selectedNode?.id]);
  const adminEdgeRecord = useMemo(() => adminEdges.find(edge => String(edge.id) === String(selectedEdge?.id)) || null, [adminEdges, selectedEdge?.id]);
  const editableNode = adminNodeRecord || selectedNode || null;
  const editableEdge = adminEdgeRecord || selectedEdge || null;
  const selectedNodeNeedsHydration = Boolean(selectedNode?.id && !adminNodeRecord);
  const selectedEdgeNeedsHydration = Boolean(selectedEdge?.id && !adminEdgeRecord);
  const selectableNodes = adminNodes.length ? adminNodes : nodes;

  useEffect(() => {
    setNodeForm(nodeDraft(editableNode));
    if (editableNode?.id) setActiveTab('element');
  }, [editableNode]);

  useEffect(() => {
    setEdgeForm(edgeDraft(editableEdge));
    if (editableEdge?.id) setActiveTab('relation');
  }, [editableEdge]);

  useEffect(() => {
    if (!adminNodeRecord?.id) return;
    setEdgeForm(current => current.source_node_id === editableNode.id ? current : ({ ...current, source_node_id: editableNode.id }));
  }, [adminNodeRecord?.id, editableNode]);

  useEffect(() => {
    if (!edgeTypes.length) return;
    setEdgeForm(current => current.edge_type_id ? current : ({ ...current, edge_type_id: edgeTypes[0].id }));
  }, [edgeTypes]);

  const change = setter => field => event => setter(current => ({
    ...current,
    [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value
  }));

  const mutate = async (successMessage, action) => {
    setWorking(true);
    setNotice('');
    setError('');
    try {
      await action();
      await Promise.all([onGraphChanged?.(), loadEditorData()]);
      setNotice(successMessage);
      return true;
    } catch (mutationError) {
      setError(`GRÁF_SZERKESZTÉSI_HIBA: ${mutationError.message}`);
      return false;
    } finally {
      setWorking(false);
    }
  };

  const saveNode = event => {
    event.preventDefault();
    if (!editableNode?.id) return;
    mutate('CSÚCS_BEÁLLÍTÁSAI_MENTVE', () => request(`/api/admin/graphs/nodes/${encodePath(adminNodeRecord.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        node_type: text(nodeForm.node_type),
        label: text(nodeForm.label),
        description: text(nodeForm.description),
        visibility: nodeForm.visibility,
        active: Boolean(nodeForm.active),
        metadata: parseObject(nodeForm.metadata, 'CSÚCS_METAADAT')
      })
    }));
  };

  const createNode = event => {
    event.preventDefault();
    mutate('ÚJ_CSÚCS_LÉTREHOZVA_ÉS_RÉTEGHEZ_RENDELVE', async () => {
      const payload = await request('/api/admin/graphs/nodes', {
        method: 'POST',
        body: JSON.stringify({
          ...(text(nodeForm.id) ? { id: text(nodeForm.id) } : {}),
          node_type: text(nodeForm.node_type),
          label: text(nodeForm.label),
          description: text(nodeForm.description),
          source_system: 'manual',
          source_reference: '',
          visibility: nodeForm.visibility,
          active: Boolean(nodeForm.active),
          metadata: parseObject(nodeForm.metadata, 'CSÚCS_METAADAT')
        })
      });
      await request(`/api/admin/graphs/${encodePath(graph.id)}/nodes/${encodePath(payload.node.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ metadata: {} })
      });
      setNodeForm(nodeDraft());
    });
  };

  const saveEdge = event => {
    event.preventDefault();
    if (!adminEdgeRecord?.id) return;
    mutate('IRÁNYÍTOTT_ÉL_BEÁLLÍTÁSAI_MENTVE', () => request(`/api/admin/graphs/edges/${encodePath(adminEdgeRecord.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        weight: Number(edgeForm.weight),
        confidence: Number(edgeForm.confidence),
        cost: Number(edgeForm.cost),
        valid_from: text(edgeForm.valid_from) ? new Date(edgeForm.valid_from).toISOString() : null,
        valid_to: text(edgeForm.valid_to) ? new Date(edgeForm.valid_to).toISOString() : null,
        visibility: edgeForm.visibility,
        active: Boolean(edgeForm.active),
        provenance: parseObject(edgeForm.provenance, 'PROVENIENCIA'),
        metadata: parseObject(edgeForm.metadata, 'ÉL_METAADAT')
      })
    }));
  };

  const createEdge = event => {
    event.preventDefault();
    mutate(edgeForm.bidirectional ? 'KÉT_PÁROSÍTOTT_IRÁNYÍTOTT_ÉL_LÉTREHOZVA' : 'ÚJ_IRÁNYÍTOTT_ÉL_LÉTREHOZVA', () => request('/api/admin/graphs/edges', {
      method: 'POST',
      body: JSON.stringify({
        source_node_id: edgeForm.source_node_id,
        target_node_id: edgeForm.target_node_id,
        edge_type_id: edgeForm.edge_type_id,
        graph_ids: [graph.id],
        bidirectional: Boolean(edgeForm.bidirectional),
        origin: edgeForm.origin,
        weight: Number(edgeForm.weight),
        confidence: Number(edgeForm.confidence),
        cost: Number(edgeForm.cost),
        valid_from: text(edgeForm.valid_from) ? new Date(edgeForm.valid_from).toISOString() : null,
        valid_to: text(edgeForm.valid_to) ? new Date(edgeForm.valid_to).toISOString() : null,
        visibility: edgeForm.visibility,
        active: Boolean(edgeForm.active),
        provenance: parseObject(edgeForm.provenance, 'PROVENIENCIA'),
        metadata: parseObject(edgeForm.metadata, 'ÉL_METAADAT')
      })
    }));
  };

  const saveLayer = event => {
    event.preventDefault();
    mutate('GRÁFRÉTEG_BEÁLLÍTÁSAI_MENTVE', () => request(`/api/admin/graphs/${encodePath(graph.id)}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: text(layerForm.name),
        description: text(layerForm.description),
        icon_key: text(layerForm.icon_key) || 'network',
        color: text(layerForm.color),
        visibility: layerForm.visibility,
        active: Boolean(layerForm.active)
      })
    }));
  };

  const attachExistingRecord = async event => {
    event.preventDefault();
    const recordId = text(membershipForm.record_id);
    if (!recordId) return;
    const recordLabel = membershipForm.kind === 'edge' ? 'ÉL' : 'CSÚCS';
    const attached = await mutate(`MEGLÉVŐ ${recordLabel} RÉTEGHEZ RENDELVE — AZONOS ID, NINCS KLÓN`, () => request(
      `/api/admin/graphs/${encodePath(graph.id)}/${membershipForm.kind === 'edge' ? 'edges' : 'nodes'}/${encodePath(recordId)}`,
      {
        method: 'PUT',
        body: JSON.stringify({ metadata: parseObject(membershipForm.metadata, 'TAGSÁGI_METAADAT') })
      }
    ));
    if (attached) setMembershipForm(membershipDraft());
  };

  const selectCanvasNode = useCallback(nodeId => {
    const node = selectableNodes.find(item => String(item.id) === String(nodeId));
    if (!node) return;
    onSelectNode(node);
  }, [onSelectNode, selectableNodes]);

  const selectCanvasEdge = useCallback(edgeId => {
    const edge = adminEdges.find(item => String(item.id) === String(edgeId));
    if (!edge) return;
    onSelectEdge(edge);
  }, [adminEdges, onSelectEdge]);

  const prepareVisualRelationship = useCallback(({ sourceNodeId, targetNodeId }) => {
    if (!sourceNodeId || !targetNodeId || sourceNodeId === targetNodeId) return;
    onBeginRelationship();
    setEdgeForm({
      ...edgeDraft(),
      source_node_id: String(sourceNodeId),
      target_node_id: String(targetNodeId),
      edge_type_id: edgeTypes[0]?.id || '',
      visibility: graph?.visibility || 'private',
      active: true,
      origin: 'admin'
    });
    setNotice('KAPCSOLAT ELŐKÉSZÍTVE — VÁLASSZ ÉLTÍPUST, ELLENŐRIZD A PARAMÉTEREKET, MAJD MENTSD.');
    setError('');
    setActiveTab('relation');
  }, [edgeTypes, graph?.visibility, onBeginRelationship]);

  const isNodeMode = activeTab === 'element';
  const isEdgeMode = activeTab === 'relation';
  const isCanvasMode = activeTab === 'canvas';

  return (
    <section id="graph-admin-workbench" data-testid="graph-admin-workbench" aria-labelledby="graph-admin-workbench-title" className={`graph-inline-editor relative overflow-hidden border border-neonMagenta/45 bg-[#110a1a] shadow-[0_0_42px_rgba(255,0,255,.08)]${isCanvasMode ? ' graph-inline-editor--canvas-mode' : ''}`}>
      <div className="pointer-events-none absolute inset-0 opacity-55 [background-image:radial-gradient(circle_at_88%_0%,rgba(255,0,255,.2),transparent_20rem),linear-gradient(rgba(255,0,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,0,255,.05)_1px,transparent_1px)] [background-size:auto,20px_20px,20px_20px]" />
      <div className="graph-inline-editor__header relative flex flex-col gap-4 border-b border-neonMagenta/25 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[.16em] text-neonMagenta"><Sparkles size={13} aria-hidden="true" />Admin // közvetlen gráfírás</p>
          <h2 id="graph-admin-workbench-title" className="mt-1 font-headline text-xl font-black uppercase text-white">Grafikus szerkesztői munkaállomás</h2>
          <p className="graph-inline-editor__intro mt-1 max-w-3xl font-mono text-[9px] leading-relaxed text-slate-400">Kattints csúcsra vagy élre a vásznon, vagy húzz kapcsolatot a VÁSZON fülön. Minden módosítás a kanonikus DB-rekordot kezeli; a wikilink alapháló változatlan, a relációk és rétegtagságok nem klónozódnak.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="border border-neonMagenta/35 bg-neonMagenta/10 px-2 py-1 font-mono text-[8px] font-black text-neonMagenta">{graph.name}</span>
          <span className="border border-white/15 px-2 py-1 font-mono text-[8px] text-slate-400">{adminNodes.length || nodes.length} CSÚCS · {adminEdges.length} ÉL</span>
          <button type="button" onClick={loadEditorData} disabled={loading || working} className="inline-flex min-h-8 items-center gap-1.5 border border-white/20 px-2 font-mono text-[8px] font-black text-slate-300 hover:border-neonCyan hover:text-neonCyan disabled:opacity-50"><LoaderCircle size={11} className={loading ? 'animate-spin' : ''} />FRISSÍTÉS</button>
        </div>
      </div>

      <div className="graph-inline-editor__tabs relative flex flex-wrap gap-2 border-b border-white/10 px-4 py-3">
        <TabButton active={isNodeMode} onClick={() => setActiveTab('element')} Icon={CircleDot}>CSÚCS</TabButton>
        <TabButton active={isEdgeMode} onClick={() => setActiveTab('relation')} Icon={GitBranch}>KAPCSOLAT</TabButton>
        <TabButton active={isCanvasMode} onClick={() => setActiveTab('canvas')} Icon={Network}>VÁSZON</TabButton>
        <TabButton active={activeTab === 'layer'} onClick={() => setActiveTab('layer')} Icon={Layers3}>RÉTEG</TabButton>
      </div>

      <div className="graph-inline-editor__body relative p-4">
        {notice && <p role="status" aria-live="polite" className="mb-4 border border-plasmaGreen/45 bg-plasmaGreen/10 p-2.5 font-mono text-[9px] font-black text-plasmaGreen">✓ {notice}</p>}
        {error && <p role="alert" className="mb-4 border border-neonMagenta/50 bg-neonMagenta/10 p-2.5 font-mono text-[9px] font-black text-neonMagenta">{error}</p>}

        {isNodeMode && <div className="border border-white/10 bg-black/20">
          <EditorHeading detail={editableNode ? `${editableNode.id} · ${editableNode.source_system || 'manual'} · a stabil azonosító nem módosítható` : 'A létrehozott csúcs azonnal a kiválasztott DB-réteghez kerül.'}>{editableNode ? 'Kijelölt csúcs szerkesztése' : 'Új önálló DB-csúcs'}</EditorHeading>
          <form data-testid="graph-admin-node-form" onSubmit={editableNode ? saveNode : createNode} className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {!editableNode && <Field label="Stabil ID (opcionális)"><input className={controlClass} value={nodeForm.id} onChange={change(setNodeForm)('id')} placeholder="task:TASK-104" disabled={working || loading} /></Field>}
            <Field label="Csúcstípus"><input required className={controlClass} value={nodeForm.node_type} onChange={change(setNodeForm)('node_type')} placeholder="task" disabled={working || loading} /></Field>
            <Field label="Felirat"><input required className={controlClass} value={nodeForm.label} onChange={change(setNodeForm)('label')} disabled={working || loading} /></Field>
            <Field label="Láthatóság"><select className={controlClass} value={nodeForm.visibility} onChange={change(setNodeForm)('visibility')} disabled={working || loading}><option value="private">BELSŐ</option><option value="public">PUBLIKUS</option></select></Field>
            <Field label="Leírás"><textarea className={`${controlClass} min-h-20 resize-y`} value={nodeForm.description} onChange={change(setNodeForm)('description')} disabled={working || loading} /></Field>
            <Field label="Metaadat (JSON objektum)"><textarea className={`${controlClass} min-h-20 resize-y`} value={nodeForm.metadata} onChange={change(setNodeForm)('metadata')} disabled={working || loading} /></Field>
            <div className="flex flex-wrap items-end justify-between gap-3"><label className="inline-flex items-center gap-2 font-mono text-[9px] text-slate-400"><input type="checkbox" checked={nodeForm.active} onChange={change(setNodeForm)('active')} disabled={working || loading} /> AKTÍV</label><button type="submit" data-testid="graph-admin-save-node" disabled={working || loading || selectedNodeNeedsHydration} className="inline-flex min-h-10 items-center gap-2 border border-neonCyan/65 bg-neonCyan/10 px-3 font-mono text-[9px] font-black text-neonCyan hover:bg-neonCyan hover:text-slate-950 disabled:opacity-50">{editableNode ? <Save size={12} /> : <Plus size={12} />}{editableNode ? 'CSÚCS MENTÉSE' : 'CSÚCS LÉTREHOZÁSA'}</button></div>
            {selectedNodeNeedsHydration && <p className="font-mono text-[8px] text-amber-200">A teljes admin-rekord betöltése nélkül a csúcs mentése védetten letiltott.</p>}
          </form>
        </div>}

        {isEdgeMode && <div className="border border-white/10 bg-black/20">
          <EditorHeading detail={editableEdge ? `${editableEdge.source_label || editableEdge.source_node_id} → ${editableEdge.target_label || editableEdge.target_node_id} · a végpontok és az éltípus stabilak` : 'Válassz forrás- és célcsúcsot. A kétirányú opció két külön, párosított irányított élt hoz létre.'}>{editableEdge ? 'Kijelölt irányított él szerkesztése' : 'Új irányított kapcsolat'}</EditorHeading>
          <form data-testid="graph-admin-edge-form" onSubmit={editableEdge ? saveEdge : createEdge} className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            {!editableEdge && <><Field label="Forráscsúcs"><select required className={controlClass} value={edgeForm.source_node_id} onChange={change(setEdgeForm)('source_node_id')} disabled={working || loading}><option value="">-- FORRÁS --</option>{selectableNodes.map(node => <option key={node.id} value={node.id}>{node.label} // {node.id}</option>)}</select></Field><Field label="Célcsúcs"><select required className={controlClass} value={edgeForm.target_node_id} onChange={change(setEdgeForm)('target_node_id')} disabled={working || loading}><option value="">-- CÉL --</option>{selectableNodes.map(node => <option key={node.id} value={node.id}>{node.label} // {node.id}</option>)}</select></Field><Field label="Éltípus"><select required className={controlClass} value={edgeForm.edge_type_id} onChange={change(setEdgeForm)('edge_type_id')} disabled={working || loading || !edgeTypes.length}><option value="">-- ÉLTÍPUS --</option>{edgeTypes.map(type => <option key={type.id} value={type.id}>{type.label} // {type.id}</option>)}</select></Field></>}
            <Field label="Súly 0..1"><input required type="number" min="0" max="1" step="0.01" className={controlClass} value={edgeForm.weight} onChange={change(setEdgeForm)('weight')} disabled={working || loading} /></Field>
            <Field label="Bizonyosság 0..1"><input required type="number" min="0" max="1" step="0.01" className={controlClass} value={edgeForm.confidence} onChange={change(setEdgeForm)('confidence')} disabled={working || loading} /></Field>
            <Field label="Költség"><input required type="number" min="0" step="0.01" className={controlClass} value={edgeForm.cost} onChange={change(setEdgeForm)('cost')} disabled={working || loading} /></Field>
            {!editableEdge && <Field label="Eredet"><select className={controlClass} value={edgeForm.origin} onChange={change(setEdgeForm)('origin')} disabled={working || loading}><option value="admin">admin</option><option value="agent">agent</option><option value="sql_sync">sql_sync</option><option value="wikilink_import">wikilink_import</option><option value="markdown_projection">markdown_projection</option></select></Field>}
            <Field label="Láthatóság"><select className={controlClass} value={edgeForm.visibility} onChange={change(setEdgeForm)('visibility')} disabled={working || loading}><option value="private">BELSŐ</option><option value="public">PUBLIKUS</option></select></Field>
            <Field label="Érvényes ettől"><input type="datetime-local" className={controlClass} value={edgeForm.valid_from} onChange={change(setEdgeForm)('valid_from')} disabled={working || loading} /></Field>
            <Field label="Érvényes eddig"><input type="datetime-local" className={controlClass} value={edgeForm.valid_to} onChange={change(setEdgeForm)('valid_to')} disabled={working || loading} /></Field>
            <Field label="Proveniencia (JSON objektum)"><textarea className={`${controlClass} min-h-20 resize-y`} value={edgeForm.provenance} onChange={change(setEdgeForm)('provenance')} disabled={working || loading} /></Field>
            <Field label="Metaadat (JSON objektum)"><textarea className={`${controlClass} min-h-20 resize-y`} value={edgeForm.metadata} onChange={change(setEdgeForm)('metadata')} disabled={working || loading} /></Field>
            <div className="flex flex-wrap items-end justify-between gap-3"><div className="space-y-1"><label className="inline-flex items-center gap-2 font-mono text-[9px] text-slate-400"><input type="checkbox" checked={edgeForm.active} onChange={change(setEdgeForm)('active')} disabled={working || loading} /> AKTÍV</label>{!editableEdge && <label className="block font-mono text-[9px] text-plasmaGreen"><input type="checkbox" checked={edgeForm.bidirectional} onChange={change(setEdgeForm)('bidirectional')} disabled={working || loading} /> ↔ KÉTIRÁNYÚ TÉNY</label>}</div><button type="submit" data-testid="graph-admin-save-edge" disabled={working || loading || selectedEdgeNeedsHydration || (!editableEdge && (!edgeForm.source_node_id || !edgeForm.target_node_id || !edgeForm.edge_type_id))} className="inline-flex min-h-10 items-center gap-2 border border-neonMagenta/65 bg-neonMagenta/10 px-3 font-mono text-[9px] font-black text-neonMagenta hover:bg-neonMagenta hover:text-slate-950 disabled:opacity-50">{editableEdge ? <Save size={12} /> : <Plus size={12} />}{editableEdge ? 'ÉL MENTÉSE' : 'KAPCSOLAT LÉTREHOZÁSA'}</button></div>
            {selectedEdgeNeedsHydration && <p className="font-mono text-[8px] text-amber-200">A teljes admin-rekord betöltése nélkül az él mentése védetten letiltott.</p>}
          </form>
        </div>}

        {isCanvasMode && <React.Suspense fallback={<div className="border border-neonCyan/30 bg-[#06111e] p-6 font-mono text-[9px] font-black tracking-[.12em] text-neonCyan">NODE-BASED VÁSZON BETÖLTÉSE...</div>}><GraphRelationCanvas
          nodes={selectableNodes}
          edges={adminEdges}
          selectedNodeId={editableNode?.id}
          selectedEdgeId={editableEdge?.id}
          disabled={loading || working}
          onSelectNode={selectCanvasNode}
          onSelectEdge={selectCanvasEdge}
          onPrepareConnection={prepareVisualRelationship}
        /></React.Suspense>}

        {activeTab === 'layer' && <div className="border border-white/10 bg-black/20">
          <EditorHeading detail={`${graph.id} · A rétegtagságok nem másolatok; a beállítás csak ezt a gráfdefiníciót módosítja.`}>Gráfréteg beállításai</EditorHeading>
          <form data-testid="graph-admin-layer-form" onSubmit={saveLayer} className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Név"><input required className={controlClass} value={layerForm.name} onChange={change(setLayerForm)('name')} disabled={working || loading} /></Field>
            <Field label="Láthatóság"><select className={controlClass} value={layerForm.visibility} onChange={change(setLayerForm)('visibility')} disabled={working || loading}><option value="private">BELSŐ</option><option value="public">PUBLIKUS</option></select></Field>
            <Field label="Ikon kulcs"><input required className={controlClass} value={layerForm.icon_key} onChange={change(setLayerForm)('icon_key')} disabled={working || loading} /></Field>
            <Field label="Szín"><input required pattern="^#[0-9a-fA-F]{6}$" className={controlClass} value={layerForm.color} onChange={change(setLayerForm)('color')} disabled={working || loading} /></Field>
            <Field label="Leírás"><textarea className={`${controlClass} min-h-20 resize-y`} value={layerForm.description} onChange={change(setLayerForm)('description')} disabled={working || loading} /></Field>
            <div className="flex flex-wrap items-end justify-between gap-3"><label className="inline-flex items-center gap-2 font-mono text-[9px] text-slate-400"><input type="checkbox" checked={layerForm.active} onChange={change(setLayerForm)('active')} disabled={working || loading} /> AKTÍV RÉTEG</label><button type="submit" data-testid="graph-admin-save-layer" disabled={working || loading} className="inline-flex min-h-10 items-center gap-2 border border-neonMagenta/65 bg-neonMagenta/10 px-3 font-mono text-[9px] font-black text-neonMagenta hover:bg-neonMagenta hover:text-slate-950 disabled:opacity-50"><Settings2 size={12} />RÉTEG MENTÉSE</button></div>
          </form>
          <div className="border-t border-white/10 bg-black/15 p-4">
            <p className="font-mono text-[9px] font-black uppercase tracking-[.12em] text-plasmaGreen">M:N tagság // meglévő rekord csatlakoztatása</p>
            <p className="mt-1 max-w-3xl font-mono text-[8px] leading-relaxed text-slate-500">Egy már létező globális csúcsot vagy élt ad hozzá ehhez a réteghez. Az entitás stabil azonosítója változatlan marad, ezért nem készül másolat.</p>
            <form data-testid="graph-admin-membership-form" onSubmit={attachExistingRecord} className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Rekord típusa"><select className={controlClass} value={membershipForm.kind} onChange={change(setMembershipForm)('kind')} disabled={working || loading}><option value="node">CSÚCS</option><option value="edge">ÉL</option></select></Field>
              <Field label="Meglévő rekord stabil ID"><input required className={controlClass} value={membershipForm.record_id} onChange={change(setMembershipForm)('record_id')} placeholder="task:TASK-004 vagy edge-123" disabled={working || loading} /></Field>
              <Field label="Tagsági metaadat (JSON objektum)"><textarea className={`${controlClass} min-h-20 resize-y`} value={membershipForm.metadata} onChange={change(setMembershipForm)('metadata')} disabled={working || loading} /></Field>
              <div className="flex items-end"><button type="submit" data-testid="graph-admin-attach-membership" disabled={working || loading || !text(membershipForm.record_id)} className="inline-flex min-h-10 items-center gap-2 border border-plasmaGreen/65 bg-plasmaGreen/10 px-3 font-mono text-[9px] font-black text-plasmaGreen hover:bg-plasmaGreen hover:text-slate-950 disabled:opacity-50"><Layers3 size={12} />RÉTEGHEZ ADÁS</button></div>
            </form>
          </div>
        </div>}
      </div>
    </section>
  );
};

export default GraphInlineEditor;
