import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Check, ChevronDown, ChevronUp, FileText, FolderTree, Layers3, Link2, Maximize2, Minimize2, MoreHorizontal, Move, Network, Palette, PanelBottom, PanelLeft, PanelRight, PanelsTopLeft, Play, Plus, RefreshCw, Route, Save, Search, Settings2, ShieldCheck, X } from 'lucide-react';
import { DockviewReact, themeDark } from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { Link } from 'react-router-dom';
import { createCadWorkspacePanelPreferencesKey, resolveCadCompactWorkspaceRibbonGroups } from '@szantoi/cad-cui-system';
import SharedKnowledgeMeshExplorer from './SharedKnowledgeMeshExplorer.jsx';
import GraphLayerOverlay from './GraphLayerOverlay.jsx';
import GraphInlineEditor from './GraphInlineEditor.jsx';
import DirectedMultigraphCanvas from './DirectedMultigraphCanvas.jsx';
import { CadActionButton, CadDataRow, CadEmptyState, CadIconButton, CadPanelFooter, CadPanelHeader, CadPanelSection, CadPanelShell, CadSegmentTabs, CadStatGrid, CadToolButton, CadWorkspacePanelManager, CadWorkspaceProfileTabs } from './ui/GraphCadUi.jsx';
import { CAD_CONTENT_DETAILS, CAD_CONTENT_DENSITIES, DEFAULT_CAD_CONTENT_PREFERENCES, DEFAULT_RIBBON_PREFERENCES, GRAPH_CUI_SYSTEM, RIBBON_ACCENT_MODES, RIBBON_TABS, RIBBON_TOOL_OPTIONS, selectCadCuiCommands } from './ui/CadCuiSystem.jsx';
import { boundPostId } from '../../utils/graphLayerAdapter.js';
import { groupGraphDocumentsByFolder, normalizeGraphDocument } from '../../utils/graphFilters.js';
import { useAdminPreview } from '../../context/AdminPreviewContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const EMPTY_LIST = Object.freeze([]);
const GraphWorkspaceContext = React.createContext(null);
const MODEL_PANEL_ID = 'graph-model-space';
const WORKSPACE_MANAGER_PANEL_ID = 'graph-workspace-manager-panel';
const WORKSPACE_LAYOUT_PREFERENCE_KEY = 'graph-workspace-layout:v2';
const WORKSPACE_LAYOUTS_PREFERENCE_KEY = 'graph-workspace-layouts:v1';
const DEFAULT_WORKSPACE_LAYOUT_ID = 'model';
const WORKSPACE_PREFERENCE_NAMESPACE = 'graph-cad';
const WORKSPACE_PANELS = Object.freeze({
  [MODEL_PANEL_ID]: { component: 'modelSpace', title: 'MODELTÉR', locked: true, width: 960, height: 680, defaultPlacement: 'root', icon: Network, accent: '#00fbfb' },
  [WORKSPACE_MANAGER_PANEL_ID]: { component: 'workspaceManager', title: 'PANELEK', width: 486, height: 610, defaultPlacement: 'floating', icon: PanelsTopLeft, accent: '#00fbfb', utility: true },
  'graph-search-panel': { component: 'search', title: 'KERESŐ', width: 620, height: 620, defaultPlacement: 'floating', icon: Search, accent: '#80ff00' },
  'graph-ribbon-panel': { component: 'ribbonSettings', title: 'SZALAG', width: 356, height: 620, defaultPlacement: 'floating', icon: Palette, accent: '#b86dff' },
  'graph-explorer-panel': { component: 'explorer', title: 'EXPLORER', width: 304, height: 620, defaultPlacement: 'left', icon: FolderTree, accent: '#00fbfb' },
  'graph-layers-panel': { component: 'layers', title: 'RÉTEGEK', width: 318, height: 520, defaultPlacement: 'floating', icon: Layers3, accent: '#ff55d7' },
  'graph-flow-panel': { component: 'flowView', title: 'XYFLOW NÉZET', width: 860, height: 650, defaultPlacement: 'floating', icon: Network, accent: '#80ff00' },
  'graph-properties-panel': { component: 'properties', title: 'INSPEKTOR', width: 342, height: 520, defaultPlacement: 'right', icon: Settings2, accent: '#4bc8ff' },
  'graph-traversal-panel': { component: 'traversal', title: 'ÚTVONALAK', width: 430, height: 570, defaultPlacement: 'floating', icon: Route, accent: '#80ff00' },
  'graph-admin-panel': { component: 'admin', title: 'SZERKESZTŐ', width: 430, height: 660, defaultPlacement: 'floating', icon: Network, accent: '#ff00ff', adminOnly: true }
});
const WORKSPACE_PANEL_DESCRIPTIONS = Object.freeze({
  'graph-search-panel': 'Cikk- és tudástárkeresés',
  'graph-ribbon-panel': 'Szalag és tartalmi profilok',
  'graph-explorer-panel': 'Dokumentum- és projektstruktúra',
  'graph-layers-panel': 'Adatbázis-rétegek és jelölések',
  'graph-flow-panel': 'XYFlow csomópont- és kapcsolatnézet',
  'graph-properties-panel': 'Kiválasztott elem tulajdonságai',
  'graph-traversal-panel': 'Kapcsolatok és útvonalak elemzése',
  'graph-admin-panel': 'Admin szerkesztői munkapad'
});
const FLOATING_PANEL_POSITIONS = Object.freeze({
  [WORKSPACE_MANAGER_PANEL_ID]: { x: 92, y: 48 },
  'graph-search-panel': { x: 74, y: 82 },
  'graph-ribbon-panel': { x: 108, y: 78 },
  'graph-explorer-panel': { x: 24, y: 54 },
  'graph-layers-panel': { x: 20, y: 58 },
  'graph-flow-panel': { x: 52, y: 72 },
  'graph-properties-panel': { x: 118, y: 60 },
  'graph-traversal-panel': { x: 96, y: 108 },
  'graph-admin-panel': { x: 80, y: 40 }
});
const RIBBON_PREFERENCE_KEY = 'graph-workspace-ribbon-preferences:v1';
const CAD_CONTENT_PREFERENCE_KEY = 'graph-cad-content-preferences:v1';
const text = value => String(value ?? '').trim();
const safeColor = value => /^#[0-9a-f]{6}$/i.test(text(value)) ? value : '#00fbfb';
const encodePath = value => encodeURIComponent(String(value || ''));
const formatNumber = value => new Intl.NumberFormat('hu-HU').format(Number(value || 0));
const workspacePreferenceScope = isAdminPreview => isAdminPreview ? 'admin' : 'public';
const scopedWorkspacePreferenceKey = (key, scope) => scope === 'public' ? key : `${key}:${scope}`;
const workspaceLayoutPreferenceKey = scope => scopedWorkspacePreferenceKey(WORKSPACE_LAYOUTS_PREFERENCE_KEY, scope);
const ribbonPreferenceKey = scope => scopedWorkspacePreferenceKey(RIBBON_PREFERENCE_KEY, scope);
const cadContentPreferenceKey = scope => scopedWorkspacePreferenceKey(CAD_CONTENT_PREFERENCE_KEY, scope);
const workspacePanelPreferenceKey = scope => createCadWorkspacePanelPreferencesKey({
  namespace: WORKSPACE_PREFERENCE_NAMESPACE,
  scope,
  section: 'panels'
});
const workspacePanelPreferencePlacement = value => value === 'floating' || value === 'float' ? 'float' : 'dock';
const workspacePanelDockPlacement = panelId => {
  const placement = WORKSPACE_PANELS[panelId]?.defaultPlacement;
  return ['left', 'right', 'bottom'].includes(placement) ? placement : 'right';
};
const workspacePanelDockviewPlacement = (panelId, placement) => workspacePanelPreferencePlacement(placement) === 'float'
  ? 'floating'
  : workspacePanelDockPlacement(panelId);
const readWorkspacePanelPreferences = scope => {
  if (typeof window === 'undefined') return {};
  try {
    const stored = window.localStorage.getItem(workspacePanelPreferenceKey(scope));
    const value = stored ? JSON.parse(stored) : {};
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};
const defaultWorkspaceLayoutProfile = () => ({ id: DEFAULT_WORKSPACE_LAYOUT_ID, name: 'MODEL', snapshot: null, system: true });
const workspaceLayoutId = value => {
  const normalized = text(value).toLocaleLowerCase('hu-HU');
  return /^[a-z0-9-]{1,64}$/.test(normalized) ? normalized : '';
};
const normalizeWorkspaceLayouts = value => {
  const seen = new Set();
  const profiles = (Array.isArray(value?.profiles) ? value.profiles : []).reduce((items, profile, index) => {
    const id = workspaceLayoutId(profile?.id) || (index === 0 ? DEFAULT_WORKSPACE_LAYOUT_ID : '');
    if (!id || seen.has(id)) return items;
    seen.add(id);
    const name = text(profile?.name).slice(0, 32) || (id === DEFAULT_WORKSPACE_LAYOUT_ID ? 'MODEL' : `LAYOUT ${index}`);
    items.push({
      id,
      name,
      snapshot: profile?.snapshot && typeof profile.snapshot === 'object' && !Array.isArray(profile.snapshot) ? profile.snapshot : null,
      system: id === DEFAULT_WORKSPACE_LAYOUT_ID
    });
    return items;
  }, []);
  if (!profiles.some(profile => profile.id === DEFAULT_WORKSPACE_LAYOUT_ID)) profiles.unshift(defaultWorkspaceLayoutProfile());
  const activeId = profiles.some(profile => profile.id === workspaceLayoutId(value?.activeId))
    ? workspaceLayoutId(value.activeId)
    : DEFAULT_WORKSPACE_LAYOUT_ID;
  return { activeId, profiles };
};
const readWorkspaceLayouts = (scope = 'public') => {
  const fallback = normalizeWorkspaceLayouts({});
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(workspaceLayoutPreferenceKey(scope));
    if (stored) return normalizeWorkspaceLayouts(JSON.parse(stored));
    const legacy = scope === 'public' ? window.localStorage.getItem(WORKSPACE_LAYOUT_PREFERENCE_KEY) : null;
    const snapshot = legacy ? JSON.parse(legacy) : null;
    return normalizeWorkspaceLayouts({ profiles: [{ ...defaultWorkspaceLayoutProfile(), snapshot }] });
  } catch {
    return fallback;
  }
};
const workspacePanelSize = configuration => {
  const width = Number(configuration?.width) || 360;
  const height = Number(configuration?.height) || 520;
  if (typeof window === 'undefined') return { width, height };
  return {
    width: Math.max(Math.min(280, window.innerWidth - 16), Math.min(width, window.innerWidth - 16)),
    height: Math.max(Math.min(300, window.innerHeight - 24), Math.min(height, window.innerHeight - 24))
  };
};

const workspaceFloatingPosition = (panelId, size) => {
  const position = FLOATING_PANEL_POSITIONS[panelId] || { x: 76, y: 76 };
  if (typeof window === 'undefined') return position;
  return {
    x: Math.max(8, Math.min(position.x, Math.max(8, window.innerWidth - size.width - 8))),
    y: Math.max(8, Math.min(position.y, Math.max(8, window.innerHeight - size.height - 8)))
  };
};

const readRibbonPreferences = (scope = 'public') => {
  if (typeof window === 'undefined') return DEFAULT_RIBBON_PREFERENCES;
  try {
    const stored = JSON.parse(window.localStorage.getItem(ribbonPreferenceKey(scope)) || '{}');
    const allowedToolIds = new Set(RIBBON_TOOL_OPTIONS.map(tool => tool.id));
    const allowedAccentModes = new Set(RIBBON_ACCENT_MODES.map(mode => mode.id));
    return {
      hiddenToolIds: Array.isArray(stored?.hiddenToolIds) ? stored.hiddenToolIds.filter(id => allowedToolIds.has(id)) : EMPTY_LIST,
      accentMode: allowedAccentModes.has(stored?.accentMode) ? stored.accentMode : DEFAULT_RIBBON_PREFERENCES.accentMode,
      minimized: Boolean(stored?.minimized)
    };
  } catch {
    return DEFAULT_RIBBON_PREFERENCES;
  }
};

const readCadContentPreferences = (scope = 'public') => {
  if (typeof window === 'undefined') return DEFAULT_CAD_CONTENT_PREFERENCES;
  try {
    const stored = JSON.parse(window.localStorage.getItem(cadContentPreferenceKey(scope)) || '{}');
    const densities = new Set(CAD_CONTENT_DENSITIES.map(option => option.id));
    const details = new Set(CAD_CONTENT_DETAILS.map(option => option.id));
    return {
      density: densities.has(stored?.density) ? stored.density : DEFAULT_CAD_CONTENT_PREFERENCES.density,
      detail: details.has(stored?.detail) ? stored.detail : DEFAULT_CAD_CONTENT_PREFERENCES.detail
    };
  } catch {
    return DEFAULT_CAD_CONTENT_PREFERENCES;
  }
};

const initialTraversal = () => ({
  direction: 'outbound',
  max_depth: '2',
  max_nodes: '80',
  min_confidence: '0',
  edge_type_ids: [],
  origins: [],
  as_of: ''
});

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function FilterChecklist({ label, values, selected, onChange, color = 'text-neonCyan' }) {
  if (!values.length) return null;
  return (
    <fieldset className="border border-white/10 bg-black/20 p-3">
      <legend className={`px-1 font-mono text-[8px] font-black uppercase tracking-[.13em] ${color}`}>{label}</legend>
      <div className="mt-1 flex flex-wrap gap-2">
        {values.map(value => {
          const id = `${label}-${value.id || value}`;
          const selectedValue = selected.includes(value.id || value);
          const display = value.label || value.id || value;
          return <label key={value.id || value} htmlFor={id} className={`inline-flex cursor-pointer items-center gap-1.5 border px-2 py-1.5 font-mono text-[9px] transition-colors ${selectedValue ? 'border-neonCyan bg-neonCyan/10 text-neonCyan' : 'border-white/10 text-slate-500 hover:border-white/30'}`}><input id={id} type="checkbox" checked={selectedValue} onChange={() => onChange(value.id || value)} />{display}</label>;
        })}
      </div>
    </fieldset>
  );
}

function TraversalConsole({ graph, nodes, edges, selectedNodeId, traversal, query, onQueryChange, onRun, loading }) {
  const nodesById = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);
  const edgeTypes = useMemo(() => {
    const byId = new Map();
    edges.forEach(edge => {
      const type = edge.edge_type || {};
      const id = type.id || edge.edge_type_id;
      if (id) byId.set(id, { id, label: type.label || edge.edge_type_label || id });
    });
    return [...byId.values()].sort((first, second) => first.label.localeCompare(second.label));
  }, [edges]);
  const origins = useMemo(() => [...new Set(edges.map(edge => text(edge.origin)).filter(Boolean))].sort(), [edges]);
  const pathLabel = path => {
    const nodeIds = path.node_ids || [];
    const edgeIds = path.edge_ids || [];
    return nodeIds.map((nodeId, index) => {
      const node = nodesById.get(nodeId);
      const edge = edges.find(item => item.id === edgeIds[index]);
      const edgeLabel = edge?.edge_type?.label || edge?.edge_type_label || '';
      return <React.Fragment key={`${nodeId}-${index}`}><span className="text-slate-200">{node?.label || nodeId}</span>{index < nodeIds.length - 1 && <><span className="mx-1 text-neonCyan">—[{edgeLabel || edgeIds[index]}]→</span></>}</React.Fragment>;
    });
  };
  const toggle = field => value => onQueryChange(current => ({
    ...current,
    [field]: current[field].includes(value) ? current[field].filter(item => item !== value) : [...current[field], value]
  }));

  return (
    <section className="border border-plasmaGreen/30 bg-[#07131b]/90 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-mono text-[9px] font-black uppercase tracking-[.16em] text-plasmaGreen">Korlátozott bejárás // kiválasztott DB-réteg</p><h2 className="mt-1 font-headline text-lg font-black text-white">Útvonal-felderítő</h2><p className="mt-1 max-w-2xl font-mono text-[9px] leading-relaxed text-slate-500">A wikilinkek az állandó alaphálót adják. Ez a vezérlő kizárólag a kijelölt, explicit DB-réteg bejárását futtatja.</p></div><span className="border border-white/15 px-2 py-1 font-mono text-[8px] font-black text-slate-500">{graph?.id || 'NINCS GRÁF'}</span></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-1 font-mono text-[8px] font-black uppercase tracking-[.12em] text-slate-500">Irány<select aria-label="Bejárás iránya" value={query.direction} onChange={event => onQueryChange(current => ({ ...current, direction: event.target.value }))} className="min-h-10 border border-white/15 bg-slate-950 px-2 font-mono text-xs text-slate-100 outline-none focus:border-plasmaGreen"><option value="outbound">OUTBOUND · kifelé</option><option value="inbound">INBOUND · befelé</option><option value="both">BOTH · mindkét irány</option></select></label>
        <label className="flex flex-col gap-1 font-mono text-[8px] font-black uppercase tracking-[.12em] text-slate-500">Mélység (0–6)<input aria-label="Bejárás mélysége" type="number" min="0" max="6" value={query.max_depth} onChange={event => onQueryChange(current => ({ ...current, max_depth: event.target.value }))} className="min-h-10 border border-white/15 bg-slate-950 px-2 font-mono text-xs text-slate-100 outline-none focus:border-plasmaGreen" /></label>
        <label className="flex flex-col gap-1 font-mono text-[8px] font-black uppercase tracking-[.12em] text-slate-500">Max. csúcs (1–250)<input aria-label="Bejárás maximális csúcsszáma" type="number" min="1" max="250" value={query.max_nodes} onChange={event => onQueryChange(current => ({ ...current, max_nodes: event.target.value }))} className="min-h-10 border border-white/15 bg-slate-950 px-2 font-mono text-xs text-slate-100 outline-none focus:border-plasmaGreen" /></label>
        <label className="flex flex-col gap-1 font-mono text-[8px] font-black uppercase tracking-[.12em] text-slate-500">Min. bizonyosság (0–1)<input aria-label="Minimális bizonyosság" type="number" min="0" max="1" step="0.05" value={query.min_confidence} onChange={event => onQueryChange(current => ({ ...current, min_confidence: event.target.value }))} className="min-h-10 border border-white/15 bg-slate-950 px-2 font-mono text-xs text-slate-100 outline-none focus:border-plasmaGreen" /></label>
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_14rem]">
        <FilterChecklist label="Éltípusok" values={edgeTypes} selected={query.edge_type_ids} onChange={toggle('edge_type_ids')} color="text-plasmaGreen" />
        <FilterChecklist label="Eredetek" values={origins} selected={query.origins} onChange={toggle('origins')} color="text-neonMagenta" />
        <label className="flex flex-col gap-1 border border-white/10 bg-black/20 p-3 font-mono text-[8px] font-black uppercase tracking-[.12em] text-slate-500">Érvényesség ekkor<input aria-label="Bejárás érvényességi időpontja" type="datetime-local" value={query.as_of} onChange={event => onQueryChange(current => ({ ...current, as_of: event.target.value }))} className="min-h-10 border border-white/15 bg-slate-950 px-2 font-mono text-[10px] text-slate-100 outline-none focus:border-plasmaGreen" /></label>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><p className="font-mono text-[9px] text-slate-500">Kezdőcsúcs: <b className="text-slate-200">{nodesById.get(selectedNodeId)?.label || selectedNodeId || 'nincs kijelölve'}</b></p><button type="button" onClick={onRun} disabled={!selectedNodeId || loading} className="inline-flex min-h-10 items-center gap-2 border border-plasmaGreen/70 bg-plasmaGreen/10 px-3 font-mono text-[10px] font-black uppercase tracking-[.12em] text-plasmaGreen transition-colors hover:bg-plasmaGreen hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"><Play size={13} />{loading ? 'BEJÁRÁS...' : 'BEJÁRÁS INDÍTÁSA'}</button></div>
      {traversal && <div data-testid="graph-traversal-result" className="mt-4 border border-plasmaGreen/25 bg-black/20 p-3"><p className="font-mono text-[10px] font-black text-plasmaGreen">EREDMÉNY: {traversal.nodes?.length || 0} CSÚCS / {traversal.edges?.length || 0} ÉL {traversal.truncated ? '· KORLÁTOZOTT' : ''}</p><div className="mt-3 space-y-2">{(traversal.paths || []).map(path => <p key={path.node_id} className="border-l-2 border-neonCyan/50 pl-2 font-mono text-[9px] leading-relaxed text-slate-400">{pathLabel(path)}</p>)}{!(traversal.paths || []).length && <p className="font-mono text-[9px] text-slate-500">A korlátokon belül nem talált új útvonalat.</p>}</div></div>}
    </section>
  );
}

function LayerDock({ graphs, activeLayerIds, loadingLayerIds, onToggle, onRefresh, refreshing, density = 'regular' }) {
  const activeSet = new Set(activeLayerIds);
  return (
    <CadPanelShell aria-label="Gráfrétegek" className="graph-layer-dock" tone="cyan" density={density} visualStrength="quiet">
      <CadPanelHeader icon={Layers3} eyebrow="DB-RÉTEGEK" title="RÉTEGVEREM" description="A cián wikilink-alapháló állandó; a DB-rétegek explicit kötésekkel rajzolódnak rá." actions={<CadActionButton compact icon={RefreshCw} onClick={onRefresh} disabled={refreshing} aria-label="Rétegek frissítése"><span className={refreshing ? 'animate-pulse' : ''}>FRISSÍTÉS</span></CadActionButton>} />
      <CadPanelSection eyebrow="LÁTHATÓ KAPCSOLATOK" title={`${formatNumber(graphs.length)} DB-RÉTEG`} compact>
        <div className="graph-layer-dock__stack"><CadDataRow icon={Check} title="OBSIDIAN WIKILINK ALAPRÉTEG" detail="Mindig látható · valódi [[hivatkozás]]" active tone="cyan" />{graphs.map(graph => {
        const checked = activeSet.has(graph.id);
        const loading = loadingLayerIds.includes(graph.id);
        return <CadDataRow as="label" key={graph.id} data-testid={`graph-layer-toggle-${graph.id}`} icon={checked ? Check : Network} title={`${graph.icon_key || 'network'} · ${graph.name}`} detail={`${graph.node_count} csúcs / ${graph.edge_count} él${loading ? ' · BETÖLTÉS' : ''}`} active={checked} style={{ '--cad-ui-item-accent': safeColor(graph.color) }}><input aria-label={`${graph.name} DB-réteg`} type="checkbox" checked={checked} onChange={() => onToggle(graph.id)} className="sr-only" /></CadDataRow>;
      })}</div>
        {!graphs.length && <CadEmptyState icon={Layers3} title="NINCS PUBLIKÁLT DB-RÉTEG">Az alapháló ettől függetlenül működik.</CadEmptyState>}
      </CadPanelSection>
    </CadPanelShell>
  );
}

function LayerInspector({ graph, node, edge }) {
  if (!graph || (!node && !edge)) return null;
  const memberships = edge?.graph_memberships || node?.graph_memberships || [];
  const type = edge?.edge_type || {};
  return <CadPanelSection data-testid="graph-layer-inspector" className="graph-layer-inspector" style={{ '--cad-ui-accent': safeColor(type.color || graph.color || '#ff00ff') }} eyebrow="KIJELÖLT DB-RÉTEG ELEM" title={edge ? `${edge.source_label || edge.source_node_id} → ${edge.target_label || edge.target_node_id}` : (node.label || node.id)} description={edge ? `${type.label || edge.edge_type_id} · origin: ${edge.origin || '—'}${edge.relation_group_id ? ` · relation_group_id: ${edge.relation_group_id}` : ''}` : `${node.node_type} · ${node.document_binding ? `Obsidian kötés: ${node.document_binding.slug}` : 'Önálló DB-csúcs'}`}>
    {edge && <details className="mt-1 border border-white/10 bg-black/20 p-2"><summary className="cursor-pointer font-mono text-[9px] font-black text-slate-300">PROVENIENCIA</summary><pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono text-[8px] text-slate-400">{JSON.stringify(edge.provenance || {}, null, 2)}</pre></details>}
    <div className="mt-3 border-t border-white/10 pt-2 font-mono text-[8px] text-slate-500">RÉTEGTAGSÁG: {memberships.map(item => item.graph_name || item.graph_id).join(' · ') || graph.name}</div>
  </CadPanelSection>;
}

function AdminGraphWorkbench(props) {
  const { adminFetch } = useAuth();
  return <GraphInlineEditor {...props} adminFetch={adminFetch} />;
}

function useGraphWorkspace() {
  const workspace = React.useContext(GraphWorkspaceContext);
  if (!workspace) throw new Error('GRAPH_WORKSPACE_CONTEXT_MISSING');
  return workspace;
}

function GraphModelSpacePanel() {
  const workspace = useGraphWorkspace();
  return (
    <SharedKnowledgeMeshExplorer
      workspaceMode
      onGraphNodeSelect={workspace.selectBaseDocument}
      onGraphCanvasPointerDown={workspace.dismissQuickAction}
      onOpenWorkspacePanel={workspace.openWorkspacePanel}
      renderCanvasOverlay={workspace.renderCanvasOverlay}
      workspaceSearchOpen={workspace.workspaceSearchOpen}
      workspaceSearchHost={workspace.workspaceSearchHost}
      workspaceSearchExpanded={workspace.workspaceSearchExpanded}
      onWorkspaceSearchOpenChange={open => open ? workspace.openWorkspacePanel('graph-search-panel') : workspace.setWorkspaceSearchOpen(false)}
      onWorkspaceSearchExpandedChange={workspace.setWorkspaceSearchExpanded}
    />
  );
}

function GraphLayersPanel() {
  const workspace = useGraphWorkspace();
  return (
    <LayerDock
      graphs={workspace.graphs}
      activeLayerIds={workspace.activeLayerIds}
      loadingLayerIds={workspace.loadingLayerIds}
      onToggle={workspace.toggleLayer}
      onRefresh={workspace.refreshGraphData}
      refreshing={workspace.loadingCatalog}
      density={workspace.cadContentPreferences.density}
    />
  );
}

function GraphFlowPanel() {
  const workspace = useGraphWorkspace();
  const { selectedGraph, selectedSnapshot, graphs, selectedNodeId, selectedEdgeId, traversal, chooseNode, chooseEdge, activeWorkspaceLayout } = workspace;
  const workspaceProfileId = text(activeWorkspaceLayout?.id) || DEFAULT_WORKSPACE_LAYOUT_ID;
  const workspaceProfileName = text(activeWorkspaceLayout?.name) || 'MODEL';
  const displayStorageKey = selectedGraph ? `directed-multigraph-display:workspace:${workspaceProfileId}:${selectedGraph.id}:v2` : '';
  const viewStateStorageKey = displayStorageKey ? `${displayStorageKey}:canvas-state:v1` : '';
  if (!selectedGraph || !selectedSnapshot) {
    return <CadPanelShell className="graph-flow-panel" tone="green" density={workspace.cadContentPreferences.density} visualStrength="quiet"><CadPanelHeader icon={Network} eyebrow="XYFLOW PROJEKTNÉZET" title="NINCS AKTÍV DB-RÉTEG" description="Kapcsold be valamelyik DB-réteget, hogy pont- vagy részletes munkakártya-nézetben lásd a projektet." /><CadPanelSection><CadEmptyState icon={Layers3} title="RÉTEGET KÉR">A RÉTEGEK panelen válassz ki egy gráfot. A kapcsolatok továbbra is az explicit DB-élek, nem Markdownból következtetett viszonyok.</CadEmptyState></CadPanelSection></CadPanelShell>;
  }
  return <section data-testid="graph-workspace-flow-view" className="graph-flow-panel" aria-label="XYFlow projekt- és munkakártya nézet"><DirectedMultigraphCanvas graph={selectedGraph} graphs={graphs} nodes={selectedSnapshot.nodes} edges={selectedSnapshot.edges} selectedNodeId={selectedNodeId} selectedEdgeId={selectedEdgeId} traversal={traversal} onSelectNode={node => chooseNode(node, selectedGraph.id)} onSelectEdge={edge => chooseEdge(edge, selectedGraph.id)} workspaceProfileName={workspaceProfileName} displayStorageKey={displayStorageKey} viewStateStorageKey={viewStateStorageKey} /></section>;
}

function GraphDocumentExplorerPanel() {
  const workspace = useGraphWorkspace();
  const [pivot, setPivot] = useState('drive');
  const [query, setQuery] = useState('');
  const [folderOpen, setFolderOpen] = useState({});
  const documents = useMemo(() => workspace.documents.map(normalizeGraphDocument), [workspace.documents]);
  const visibleDocuments = useMemo(() => {
    const needle = text(query).toLocaleLowerCase('hu-HU');
    if (!needle) return documents;
    return documents.filter(document => `${document.title || ''} ${document.slug || ''} ${document.category || ''}`.toLocaleLowerCase('hu-HU').includes(needle));
  }, [documents, query]);
  const groups = useMemo(() => groupGraphDocumentsByFolder(visibleDocuments, pivot)
    .map(([folder, items]) => [folder, [...items].sort((first, second) => text(first.title).localeCompare(text(second.title), 'hu'))]), [pivot, visibleDocuments]);

  return (
    <CadPanelShell as="aside" data-testid="graph-document-explorer" className="graph-document-explorer" aria-label="Dokumentum explorer" tone="cyan" density={workspace.cadContentPreferences.density} visualStrength="quiet">
      <CadPanelHeader icon={FolderTree} eyebrow="PIVOT STRUKTÚRA" title="TUDÁSTÁR EXPLORER" description="Publikus tudástár és blog dokumentumok" status={`${formatNumber(documents.length)} DOK.`} actions={<CadIconButton icon={RefreshCw} label="Dokumentumok frissítése" onClick={workspace.refreshDocuments} disabled={workspace.loadingDocuments} />} />
      <CadPanelSection eyebrow="SZŰRÉS ÉS NÉZET" title="ARCHÍVUM NAVIGÁCIÓ" compact>
        <CadSegmentTabs label="Explorer nézet" activeId={pivot} onChange={setPivot} items={[{ id: 'drive', label: 'DRIVE', icon: FolderTree }, { id: 'topic', label: 'TÉMÁK', icon: Layers3 }]} />
        <label className="graph-document-explorer__search"><span className="sr-only">Dokumentum keresése</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="KERESÉS A TUDÁSTÉRBEN…" /></label>
        <CadStatGrid className="graph-document-explorer__summary" label="Dokumentum összesítő" items={[
          { id: 'all', label: 'ÖSSZES', value: formatNumber(documents.length), tone: 'cyan' },
          { id: 'knowledge', label: 'TUDÁSTÁR', value: formatNumber(documents.filter(document => String(document.content_type).toLowerCase() !== 'blog').length), tone: 'blue' },
          { id: 'blog', label: 'CIKK', value: formatNumber(documents.filter(document => String(document.content_type).toLowerCase() === 'blog').length), tone: 'magenta' }
        ]} />
      </CadPanelSection>
      <div className="graph-document-explorer__tree">
        {workspace.loadingDocuments && <p className="graph-document-explorer__state">DOKUMENTUMOK BETÖLTÉSE…</p>}
        {!workspace.loadingDocuments && !groups.length && <p className="graph-document-explorer__state">Nincs a szűrésnek megfelelő dokumentum.</p>}
        {groups.map(([folder, items], index) => <details key={folder} open={folderOpen[folder] ?? (index < 2)} onToggle={event => { const open = event.currentTarget.open; setFolderOpen(current => ({ ...current, [folder]: open })); }} className="graph-document-explorer__folder"><summary><span>{folder}</span><em>{formatNumber(items.length)}</em></summary><div>{items.map(document => {
          const isArticle = String(document.content_type).toLowerCase() === 'blog' || document.presentation_profile === 'article';
          const Icon = isArticle ? FileText : BookOpen;
          return <button key={document.id || document.slug} type="button" onClick={() => workspace.selectBaseDocument(document)} className="graph-document-explorer__document" title={document.title || document.slug}><Icon size={12} aria-hidden="true" /><span><b>{document.title || document.slug || 'Névtelen dokumentum'}</b><small>{isArticle ? 'CIKK' : 'TUDÁSTÁR'}{document.category ? ` · ${document.category}` : ''}</small></span></button>;
        })}</div></details>)}
      </div>
      <CadPanelFooter>Válassz dokumentumot a kapcsolódó gráfcsomópontok kijelöléséhez.</CadPanelFooter>
    </CadPanelShell>
  );
}

function GraphRibbonSettingsPanel() {
  const workspace = useGraphWorkspace();
  const hiddenTools = new Set(workspace.ribbonPreferences.hiddenToolIds);
  return (
    <CadPanelShell data-testid="graph-ribbon-customizer" className="graph-ribbon-customizer" aria-label="Szalag személyre szabása" tone="magenta" density={workspace.cadContentPreferences.density}>
      <CadPanelHeader icon={Palette} eyebrow="MUNKATÉR KALIBRÁLÁSA" title="SZALAG ÉS TARTALOM" description="A kiosztás, a színprofil és az információs sűrűség ebben a böngészőben megmarad." actions={<CadActionButton compact icon={RefreshCw} onClick={() => { workspace.resetRibbonPreferences(); workspace.resetCadContentPreferences(); }} aria-label="ALAPÉRTELMEZETT">ALAPÉRTELMEZETT</CadActionButton>} />
      <CadPanelSection eyebrow="VIZUÁLIS PROFIL" title="SZÍNPROFIL" description="Egy fő akcentus tartja olvashatóan a parancsokat és az állapotokat.">
        <div className="graph-ribbon-customizer__palettes">{RIBBON_ACCENT_MODES.map(mode => <CadDataRow as="button" key={mode.id} icon={workspace.ribbonPreferences.accentMode === mode.id ? Check : Palette} title={mode.label} detail={mode.detail} active={workspace.ribbonPreferences.accentMode === mode.id} aria-pressed={workspace.ribbonPreferences.accentMode === mode.id} onClick={() => workspace.setRibbonAccentMode(mode.id)} style={{ '--cad-ui-item-accent': mode.color }} status={workspace.ribbonPreferences.accentMode === mode.id ? 'AKTÍV' : null} />)}</div>
      </CadPanelSection>
      <CadPanelSection eyebrow="MUNKATÉR MAGASSÁGA" title="SZALAG ÁLLAPOTA" description="A teljes parancssor bármikor egyetlen CAD-fülsorra csukható, hogy több hely jusson a modelltérnek." compact>
        <CadDataRow as="button" icon={workspace.ribbonPreferences.minimized ? ChevronDown : ChevronUp} title={workspace.ribbonPreferences.minimized ? 'SZALAG KIBONTÁSA' : 'SZALAG ÖSSZECSUKÁSA'} detail={workspace.ribbonPreferences.minimized ? 'Csak a színes parancsfülek maradnak láthatók.' : 'A parancscsoportok látszanak a fülek alatt.'} active={workspace.ribbonPreferences.minimized} aria-pressed={workspace.ribbonPreferences.minimized} onClick={workspace.toggleRibbonMinimized} status={workspace.ribbonPreferences.minimized ? 'TÖMÖR' : 'TELJES'} />
      </CadPanelSection>
      <CadPanelSection eyebrow="TARTALMI NÉZET" title="INFORMÁCIÓS SŰRŰSÉG" description="A panelek belső szerkezete azonos marad, csak a megjelenített részletesség változik.">
        <div className="graph-ribbon-customizer__calibration">
          <div><p>SŰRŰSÉG</p><CadSegmentTabs label="Tartalmi sűrűség" activeId={workspace.cadContentPreferences.density} onChange={workspace.setCadContentDensity} items={CAD_CONTENT_DENSITIES.map(option => ({ id: option.id, label: option.label }))} /><small>{CAD_CONTENT_DENSITIES.find(option => option.id === workspace.cadContentPreferences.density)?.detail}</small></div>
          <div><p>INFORMÁCIÓS SZINT</p><CadSegmentTabs label="Információs részletesség" activeId={workspace.cadContentPreferences.detail} onChange={workspace.setCadContentDetail} items={CAD_CONTENT_DETAILS.map(option => ({ id: option.id, label: option.label }))} /><small>{CAD_CONTENT_DETAILS.find(option => option.id === workspace.cadContentPreferences.detail)?.detail}</small></div>
        </div>
      </CadPanelSection>
      <CadPanelSection eyebrow="PARANCSKIOSZTÁS" title="LÁTHATÓ PARANCSOK" description="Kapcsold ki, amire nincs szükséged; a Szalag beállító mindig elérhető marad.">
        <div className="graph-ribbon-customizer__tools">{RIBBON_TOOL_OPTIONS.map(tool => <CadDataRow as="label" key={tool.id} icon={hiddenTools.has(tool.id) ? X : Check} title={tool.label} detail={tool.detail} active={!hiddenTools.has(tool.id)} tone={!hiddenTools.has(tool.id) ? 'green' : 'neutral'} actions={<input type="checkbox" checked={!hiddenTools.has(tool.id)} onChange={() => workspace.toggleRibbonTool(tool.id)} />} />)}</div>
      </CadPanelSection>
      <CadPanelFooter>A <b>SZALAG</b> beállító parancs mindig elérhető marad, így a rejtett elemek bármikor visszakapcsolhatók.</CadPanelFooter>
    </CadPanelShell>
  );
}

function GraphPropertiesPanel() {
  const workspace = useGraphWorkspace();
  const { selectedGraph, selectedNode, selectedEdge, selectedSnapshot } = workspace;
  const [activeInspectorTab, setActiveInspectorTab] = useState('node');
  const selectedItem = selectedEdge || selectedNode;
  const inspectorTabs = [
    { id: 'node', label: 'NODE INFO' },
    { id: 'workflows', label: 'WORKFLOWS' },
    { id: 'prompts', label: 'PROMPTS' }
  ];
  return (
    <CadPanelShell data-testid="graph-workspace-properties" className="graph-workspace-properties" tone="blue" density={workspace.cadContentPreferences.density} visualStrength="quiet">
      <CadPanelHeader icon={Settings2} eyebrow="KONTEXTUS ELLENŐR" title="AKTÍV KIJELÖLÉS" description="A modelltérben kijelölt csúcs vagy kapcsolat részletes, ellenőrizhető adatai." status={selectedItem ? (selectedEdge ? 'KAPCSOLAT' : 'CSÚCS') : 'VÁRAKOZIK'} />
      <CadPanelSection eyebrow="NÉZET" title="INSPEKTOR MÓD" compact>
        <CadSegmentTabs label="Inspektor nézetek" activeId={activeInspectorTab} onChange={setActiveInspectorTab} items={inspectorTabs.map(tab => ({ id: tab.id, label: tab.label }))} />
      </CadPanelSection>
      <CadPanelSection eyebrow={activeInspectorTab === 'node' ? 'ADATOK' : activeInspectorTab === 'workflows' ? 'FOLYAMAT' : 'METAADAT'} title={activeInspectorTab === 'node' ? 'KIVÁLASZTOTT ELEM' : activeInspectorTab === 'workflows' ? 'KAPCSOLATI FOLYAMAT' : 'PROVENIENCIA'}>
        {activeInspectorTab === 'node' && (selectedGraph && selectedItem ? <LayerInspector graph={selectedGraph} node={selectedNode} edge={selectedEdge} /> : <CadEmptyState icon={Settings2} title="NINCS KIJELÖLT ELEM">Válassz DB-csomópontot vagy kapcsolatot a modelltérben a tulajdonságaihoz.</CadEmptyState>)}
        {activeInspectorTab === 'workflows' && (selectedItem ? <CadDataRow icon={Route} title={selectedGraph?.name || 'Nincs aktív gráf'} detail={selectedEdge ? `${selectedEdge.source_label || selectedEdge.source_node_id} → ${selectedEdge.target_label || selectedEdge.target_node_id}` : `${selectedNode?.label || selectedNode?.id} · ${selectedNode?.node_type || 'NODE'}`} tone="green"><small className="mt-2 block text-[9px] text-slate-500">A teljes bejárást az ÚTVONALAK panelen indíthatod.</small></CadDataRow> : <CadEmptyState icon={Route} title="NINCS FOLYAMATKONTEXTUS">Jelölj ki egy kapcsolatot vagy DB-csúcsot.</CadEmptyState>)}
        {activeInspectorTab === 'prompts' && <pre className="max-h-72 overflow-auto border border-white/10 bg-black/20 p-3 whitespace-pre-wrap break-words font-mono text-[8px] leading-relaxed text-slate-400">{JSON.stringify(selectedEdge?.provenance || selectedNode?.metadata || selectedItem?.metadata || {}, null, 2)}</pre>}
        {selectedSnapshot?.snapshot_truncated && <p className="mt-3 border-l-2 border-amber-300 bg-amber-300/5 p-3 font-mono text-[9px] text-amber-200">A kiválasztott DB-réteg pillanatképe korlátozott.</p>}
      </CadPanelSection>
      <CadPanelFooter>A panel dokkolható, lebegtethető, maximalizálható és bezárható; a kijelölés közvetlenül a modelltérből érkezik.</CadPanelFooter>
    </CadPanelShell>
  );
}

function GraphTraversalPanel() {
  const workspace = useGraphWorkspace();
  const { selectedSnapshot, selectedGraph, selectedNodeId, traversal, query, setQuery, runTraversal, runningTraversal } = workspace;
  if (!selectedSnapshot) return <CadPanelShell className="graph-traversal-panel" tone="green" density={workspace.cadContentPreferences.density} visualStrength="quiet"><CadPanelHeader icon={Route} eyebrow="GRÁF ELEMZÉS" title="ÚTVONALAK" description="Korlátozott, explicit DB-réteg bejárás." /><CadPanelSection><CadEmptyState icon={Route} title="NINCS AKTÍV DB-RÉTEG">Kapcsold be egy DB-réteget, majd jelölj ki egy csomópontot az útvonal-felderítéshez.</CadEmptyState></CadPanelSection></CadPanelShell>;
  return <CadPanelShell className="graph-traversal-panel" tone="green" density={workspace.cadContentPreferences.density} visualStrength="quiet"><CadPanelHeader icon={Route} eyebrow="GRÁF ELEMZÉS" title="ÚTVONALAK" description="A kiválasztott DB-réteg korlátozott bejárása és eredményei." status={selectedNodeId ? 'CSÚCS KIJELÖLVE' : 'VÁRAKOZIK'} /><TraversalConsole graph={selectedGraph} nodes={selectedSnapshot.nodes} edges={selectedSnapshot.edges} selectedNodeId={selectedNodeId} traversal={traversal} query={query} onQueryChange={setQuery} onRun={runTraversal} loading={runningTraversal} /><CadPanelFooter>A bejárás kizárólag a kijelölt, explicit adatbázisrétegen fut; a wikilink-alapháló változatlan marad.</CadPanelFooter></CadPanelShell>;
}

function GraphAdminPanel() {
  const workspace = useGraphWorkspace();
  const { isAdminPreview, selectedGraph, selectedSnapshot, selectedNode, selectedEdge, refreshGraphData, chooseNode, chooseEdge, beginRelationship } = workspace;
  if (!isAdminPreview) return <CadPanelShell className="graph-admin-panel" tone="magenta" density={workspace.cadContentPreferences.density} visualStrength="quiet"><CadPanelHeader icon={Network} eyebrow="ADMIN MUNKATÉR" title="SZERKESZTŐ" description="Védett, változáskövetett gráfszerkesztési környezet." /><CadPanelSection><CadEmptyState icon={ShieldCheck} title="ADMIN JOGOSULTSÁG SZÜKSÉGES">A szerkesztés kizárólag ellenőrzött admin módban érhető el.</CadEmptyState></CadPanelSection></CadPanelShell>;
  if (!selectedSnapshot || !selectedGraph) return <CadPanelShell className="graph-admin-panel" tone="magenta" density={workspace.cadContentPreferences.density} visualStrength="quiet"><CadPanelHeader icon={Network} eyebrow="ADMIN MUNKATÉR" title="SZERKESZTŐ" description="Védett, változáskövetett gráfszerkesztési környezet." status="KONTEKSTUSRA VÁR" /><CadPanelSection><CadEmptyState icon={Network} title="NINCS SZERKESZTHETŐ RÉTEG">Kapcsold be a szerkesztendő DB-réteget, majd jelölj ki csúcsot vagy kapcsolatot.</CadEmptyState></CadPanelSection></CadPanelShell>;
  return <CadPanelShell className="graph-admin-panel" tone="magenta" density={workspace.cadContentPreferences.density}><CadPanelHeader icon={Network} eyebrow="ADMIN MUNKATÉR" title="SZERKESZTŐ" description="Csúcsok és kapcsolatok validált, közvetlen szerkesztése." status="ADMIN AKTÍV" /><div className="graph-admin-panel__body"><AdminGraphWorkbench graph={selectedGraph} nodes={selectedSnapshot.nodes} selectedNode={selectedNode} selectedEdge={selectedEdge} onGraphChanged={refreshGraphData} onSelectNode={node => chooseNode(node, selectedGraph.id)} onSelectEdge={edge => chooseEdge(edge, selectedGraph.id)} onBeginRelationship={beginRelationship} /></div></CadPanelShell>;
}

function GraphSearchPanel() {
  const { setWorkspaceSearchHost, setWorkspaceSearchOpen } = useGraphWorkspace();
  const hostRef = useRef(null);

  useEffect(() => {
    const host = hostRef.current;
    setWorkspaceSearchHost(host);
    setWorkspaceSearchOpen(true);
    return () => {
      setWorkspaceSearchHost(current => current === host ? null : current);
      setWorkspaceSearchOpen(false);
    };
  }, [setWorkspaceSearchHost, setWorkspaceSearchOpen]);

  return <section className="graph-search-panel-host" aria-label="Dokkolható RAG kereső"><div ref={hostRef} data-testid="graph-workspace-search-popover" className="graph-search-panel-host__content" /></section>;
}

const normalizePanelLocation = location => typeof location === 'string' ? location : location?.type || 'closed';
const panelLocationLabel = (location, maximized) => {
  const normalizedLocation = normalizePanelLocation(location);
  if (maximized) return 'MAXIMALIZÁLT';
  if (normalizedLocation === 'floating') return 'LEBEGŐ';
  if (normalizedLocation === 'grid' || normalizedLocation === 'edge') return 'DOKKOLT';
  return 'ZÁRT';
};

function GraphWorkspaceLayoutTabs() {
  const { workspaceLayouts, activeWorkspaceLayout, switchWorkspaceLayout, createWorkspaceLayout } = useGraphWorkspace();
  return (
    <section className="graph-workspace-layout-tabs" aria-label="Munkatér elrendezések" data-testid="graph-workspace-layout-tabs">
      <CadWorkspaceProfileTabs
        className="graph-workspace-layout-tabs__rail"
        profiles={workspaceLayouts.profiles.map(profile => ({ ...profile, panelId: 'graph-workspace-dock' }))}
        activeId={activeWorkspaceLayout?.id}
        modelId={DEFAULT_WORKSPACE_LAYOUT_ID}
        modelName="MODEL"
        ariaLabel="Választható munkaterek"
        addLabel="Új munkatér létrehozása"
        addButtonProps={{ 'data-testid': 'graph-workspace-layout-add' }}
        onChange={id => switchWorkspaceLayout(id)}
        onCreate={createWorkspaceLayout}
      />
      <p><Layers3 size={11} aria-hidden="true" />{activeWorkspaceLayout?.snapshot ? 'MENTETT PANELKIOSZTÁS' : 'ALAP PANELKIOSZTÁS'}</p>
    </section>
  );
}

function GraphWorkspaceManagerPanel() {
  const workspace = useGraphWorkspace();
  const { workspacePanelStates, openWorkspacePanel, placeWorkspacePanel, resetWorkspacePanel, saveWorkspaceLayout, restoreWorkspaceLayout, resetWorkspaceLayout, hasSavedWorkspaceLayout, workspaceLayouts, activeWorkspaceLayout, switchWorkspaceLayout, createWorkspaceLayout, renameWorkspaceLayout } = workspace;
  const [layoutName, setLayoutName] = useState(activeWorkspaceLayout?.name || 'MODEL');
  const openPanels = workspacePanelStates.filter(panel => panel.isOpen);
  const dockedPanels = openPanels.filter(panel => panel.location !== 'floating');
  const floatingPanels = openPanels.filter(panel => panel.location === 'floating');
  useEffect(() => setLayoutName(activeWorkspaceLayout?.name || 'MODEL'), [activeWorkspaceLayout?.id, activeWorkspaceLayout?.name]);
  return (
    <CadPanelShell data-testid="workspace-panel-command-center" className="graph-workspace-manager" aria-label="Munkatér panelkezelő" tone="cyan" density={workspace.cadContentPreferences.density}>
      <CadPanelHeader icon={PanelsTopLeft} eyebrow="MUNKATÉR VEZÉRLŐ" title="PANELEK ÉS ELRENDEZÉSEK" description="Nyisd meg, helyezd el és mentsd a saját CAD-munkateredet." status={`${openPanels.length} NYITVA`} />
      <CadPanelSection eyebrow="ELRENDEZÉS PROFIL" title="SAJÁT MUNKATEREK" description="Minden fül saját dokkolást és nyitott ablakokat őriz ebben a böngészőben.">
        <div className="graph-workspace-manager__profile-list" role="list" aria-label="Menthető munkaterek">
          {workspaceLayouts.profiles.map(profile => <button key={profile.id} type="button" role="listitem" data-testid={`workspace-layout-profile-${profile.id}`} className={profile.id === activeWorkspaceLayout?.id ? 'is-active' : ''} aria-pressed={profile.id === activeWorkspaceLayout?.id} onClick={() => switchWorkspaceLayout(profile.id)}><span>{profile.name}</span><small>{profile.snapshot ? 'MENTETT' : 'ALAP'}</small></button>)}
          <button type="button" className="graph-workspace-manager__profile-add" onClick={createWorkspaceLayout}><Plus size={12} />ÚJ ELRENDEZÉS</button>
        </div>
        <label className="graph-workspace-manager__profile-name"><span>AKTÍV FÜL NEVE</span><div><input aria-label="Aktív munkatér neve" value={layoutName} maxLength={32} onChange={event => setLayoutName(event.target.value)} /><CadActionButton compact icon={Check} disabled={!text(layoutName)} onClick={() => renameWorkspaceLayout(activeWorkspaceLayout?.id, layoutName)} aria-label="Munkatérnév jóváhagyása">NÉV OK</CadActionButton></div></label>
        <div className="graph-workspace-manager__layout-actions" aria-label="Elrendezés parancsok">
          <CadActionButton icon={Save} onClick={saveWorkspaceLayout} aria-label="MENTÉS">MENTÉS</CadActionButton>
          <CadActionButton icon={RefreshCw} onClick={restoreWorkspaceLayout} disabled={!hasSavedWorkspaceLayout} aria-label="VISSZAÁLLÍTÁS">VISSZAÁLLÍTÁS</CadActionButton>
          <CadActionButton icon={RefreshCw} tone="magenta" className="graph-workspace-manager__reset" onClick={resetWorkspaceLayout} aria-label="GYÁRI">GYÁRI</CadActionButton>
        </div>
        <CadStatGrid className="graph-workspace-manager__stats" label="Munkatér panel összesítő" items={[{ id: 'open', label: 'NYITVA', value: formatNumber(openPanels.length), tone: 'green' }, { id: 'docked', label: 'DOKKOLT', value: formatNumber(dockedPanels.length), tone: 'cyan' }, { id: 'floating', label: 'LEBEGŐ', value: formatNumber(floatingPanels.length), tone: 'magenta' }]} />
      </CadPanelSection>
      <CadPanelSection eyebrow="ESZKÖZABLAKOK" title="PANELKATALÓGUS" description="Minden ablak csak egyszer nyílik; a fejlécben maximalizálható és átméretezhető.">
      <div className="graph-workspace-manager__panel-list">
        {workspacePanelStates.map(panel => {
          const Icon = panel.icon || PanelsTopLeft;
          const status = panelLocationLabel(panel.location, panel.maximized);
          return <article key={panel.id} data-testid={`workspace-panel-command-${panel.id}`} data-panel-location={panel.location} className={`graph-workspace-manager__panel${panel.isOpen ? ' is-open' : ''}`} style={{ '--panel-accent': panel.accent }}>
            <CadDataRow icon={Icon} title={panel.title} detail={panel.isOpen ? 'Ablak aktív a munkatérben' : 'Nincs megnyitva'} active={panel.isOpen} style={{ '--cad-ui-item-accent': panel.accent }} status={status} actions={<CadActionButton compact data-testid={`workspace-panel-focus-${panel.id}`} onClick={() => openWorkspacePanel(panel.id)} aria-label={`${panel.title} ${panel.isOpen ? 'fókuszba hozása' : 'megnyitása'}`}>{panel.isOpen ? 'FÓKUSZ' : 'NYITÁS'}</CadActionButton>} />
            <div className="graph-workspace-manager__panel-actions" aria-label={`${panel.title} elhelyezése`}>
              <CadActionButton compact icon={PanelLeft} data-testid={`workspace-panel-dock-left-${panel.id}`} onClick={() => placeWorkspacePanel(panel.id, 'left')} aria-label={`${panel.title} dokkolása balra`}>BAL</CadActionButton>
              <CadActionButton compact icon={PanelRight} data-testid={`workspace-panel-dock-right-${panel.id}`} onClick={() => placeWorkspacePanel(panel.id, 'right')} aria-label={`${panel.title} dokkolása jobbra`}>JOBB</CadActionButton>
              <CadActionButton compact icon={PanelBottom} data-testid={`workspace-panel-dock-bottom-${panel.id}`} onClick={() => placeWorkspacePanel(panel.id, 'bottom')} aria-label={`${panel.title} dokkolása alulra`}>ALUL</CadActionButton>
              <CadActionButton compact icon={Maximize2} tone="magenta" data-testid={`workspace-panel-float-${panel.id}`} onClick={() => placeWorkspacePanel(panel.id, 'floating')} aria-label={`${panel.title} lebegtetése`}>LEBEG</CadActionButton>
              <CadActionButton compact icon={RefreshCw} tone="violet" className="graph-workspace-manager__panel-reset" onClick={() => resetWorkspacePanel(panel.id)} aria-label={`${panel.title} alaphelyzetbe állítása`}>ALAP</CadActionButton>
            </div>
          </article>;
        })}
      </div>
      </CadPanelSection>
      <CadPanelFooter>A fül fejlécében is elérhető a dokkolás, lebegtetés, maximalizálás, bezárás és az egyedi méret.</CadPanelFooter>
    </CadPanelShell>
  );
}

function GraphWorkspaceTab({ api, containerApi, params = {} }) {
  const panelId = params.panelId;
  const locked = Boolean(params.locked);
  const configuration = WORKSPACE_PANELS[panelId] || {};
  const panelSize = workspacePanelSize({ ...configuration, width: params.width || configuration.width, height: params.height || configuration.height });
  const [menuOpen, setMenuOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion(current => current + 1);
  const stop = callback => event => {
    event.preventDefault();
    event.stopPropagation();
    callback();
  };
  const dock = direction => {
    const modelPanel = containerApi.getPanel(MODEL_PANEL_ID);
    if (!modelPanel || locked) return;
    api.moveTo({ group: modelPanel.api.group, position: direction });
    setMenuOpen(false);
    window.requestAnimationFrame(refresh);
  };
  const float = () => {
    if (locked) return;
    containerApi.addFloatingGroup(api.group, { ...workspaceFloatingPosition(panelId, panelSize), ...panelSize, dragHandle: 'titlebar' });
    setMenuOpen(false);
    window.requestAnimationFrame(refresh);
  };
  const toggleMaximize = () => {
    if (locked) return;
    if (api.isMaximized()) api.exitMaximized();
    else api.maximize();
    setMenuOpen(false);
    window.requestAnimationFrame(refresh);
  };
  const reset = () => {
    if (locked) return;
    api.setSize(panelSize);
    if (configuration.defaultPlacement === 'floating') float();
    else dock(configuration.defaultPlacement === 'below' ? 'bottom' : configuration.defaultPlacement || 'right');
  };
  const location = normalizePanelLocation(api.location);
  const maximized = api.isMaximized();
  const status = panelLocationLabel(location, maximized);

  return (
    <div className="graph-workspace-tab" data-testid={`graph-workspace-tab-${panelId || 'unknown'}`} data-panel-id={panelId || 'unknown'} data-panel-location={location} data-panel-maximized={maximized ? 'true' : 'false'} data-panel-revision={version}>
      <span className="graph-workspace-tab__title"><Move size={12} aria-hidden="true" /><i data-status={status} /><b>{api.title || params.title || 'PANEL'}</b><small>{locked ? 'ZÁROLT' : status}</small></span>
      {!locked && <span className="graph-workspace-tab__actions" aria-label={`${api.title || 'Panel'} elrendezése`}>
        <button type="button" title="Panel vezérlők" aria-label="Panel vezérlők" aria-expanded={menuOpen} onPointerDown={event => event.stopPropagation()} onClick={stop(() => setMenuOpen(current => !current))}><MoreHorizontal size={14} /></button>
        <button type="button" title={maximized ? 'Panel visszaállítása' : 'Panel maximalizálása'} aria-label={maximized ? 'Panel visszaállítása' : 'Panel maximalizálása'} onPointerDown={event => event.stopPropagation()} onClick={stop(toggleMaximize)}>{maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}</button>
        <button type="button" title="Panel bezárása" aria-label="Panel bezárása" onPointerDown={event => event.stopPropagation()} onClick={stop(() => api.close())}><X size={13} /></button>
        {menuOpen && <div className="graph-workspace-tab__menu" role="menu" aria-label={`${api.title || 'Panel'} vezérlők`} onPointerDown={event => event.stopPropagation()}>
          <p>ELHELYEZÉS</p>
          <div><button type="button" role="menuitem" onClick={stop(() => dock('left'))}><PanelLeft size={12} /> BALRA</button><button type="button" role="menuitem" onClick={stop(() => dock('right'))}><PanelRight size={12} /> JOBBRA</button><button type="button" role="menuitem" onClick={stop(() => dock('bottom'))}><PanelBottom size={12} /> ALULRA</button><button type="button" role="menuitem" onClick={stop(float)}><Maximize2 size={12} /> LEBEGTETÉS</button></div>
          <div className="graph-workspace-tab__menu-separator" />
          <button type="button" role="menuitem" onClick={stop(reset)}><RefreshCw size={12} /> PANEL ALAPHELYZET</button>
        </div>}
      </span>}
    </div>
  );
}

function GraphCadRibbon({ activeLayerCount, isAdminPreview, isWorkspaceFullscreen, onResetLayout, onTogglePanel, onToggleRibbonMinimized, onWorkspaceFullscreenToggle, openPanelIds = EMPTY_LIST, ribbonPreferences }) {
  const ribbonRef = useRef(null);
  const [activeRibbonTab, setActiveRibbonTab] = useState('view');
  const [compactMenuTabId, setCompactMenuTabId] = useState('');
  const [compactGroupId, setCompactGroupId] = useState('');
  const [compactMenuLeft, setCompactMenuLeft] = useState(6);
  const accentMode = RIBBON_ACCENT_MODES.find(mode => mode.id === ribbonPreferences.accentMode) || RIBBON_ACCENT_MODES[0];
  const accentFor = tab => accentMode.id === 'spectrum' ? tab.color : accentMode.color;
  const closeCompactMenu = useCallback(() => {
    setCompactMenuTabId('');
    setCompactGroupId('');
  }, []);
  useEffect(() => {
    if (!ribbonPreferences.minimized) closeCompactMenu();
  }, [closeCompactMenu, ribbonPreferences.minimized]);
  useEffect(() => {
    if (!ribbonPreferences.minimized || !compactMenuTabId || typeof document === 'undefined') return undefined;
    const dismissWhenOutside = event => {
      if (!ribbonRef.current?.contains(event.target)) closeCompactMenu();
    };
    const dismissOnEscape = event => {
      if (event.key === 'Escape') closeCompactMenu();
    };
    document.addEventListener('pointerdown', dismissWhenOutside);
    document.addEventListener('keydown', dismissOnEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissWhenOutside);
      document.removeEventListener('keydown', dismissOnEscape);
    };
  }, [closeCompactMenu, compactMenuTabId, ribbonPreferences.minimized]);
  const hiddenCommandIds = useMemo(() => GRAPH_CUI_SYSTEM.commands
    .filter(command => ribbonPreferences.hiddenToolIds.includes(command.toolId))
    .map(command => command.id), [ribbonPreferences.hiddenToolIds]);
  const visibleCommands = useMemo(() => selectCadCuiCommands(GRAPH_CUI_SYSTEM, {
    ...GRAPH_CUI_SYSTEM.defaultState,
    activeTab: activeRibbonTab,
    hiddenCommandIds
  }, {
    surface: 'ribbon',
    tabId: activeRibbonTab,
    capabilities: { admin: isAdminPreview }
  }), [activeRibbonTab, hiddenCommandIds, isAdminPreview]);
  const commandIcons = {
    panels: PanelsTopLeft,
    search: Search,
    'folder-tree': FolderTree,
    palette: Palette,
    layers: Layers3,
    settings: Settings2,
    route: Route,
    network: Network,
    link: Link2,
    maximize: Maximize2,
    refresh: RefreshCw
  };
  const panelIdForCommand = command => command.intent?.type === 'panel.open' ? text(command.intent.panelId) : '';
  const isPanelCommandOpen = command => {
    const panelId = panelIdForCommand(command);
    return Boolean(panelId && openPanelIds.includes(panelId));
  };
  const commandCallback = command => {
    const panelId = panelIdForCommand(command);
    if (panelId) return () => onTogglePanel(panelId);
    switch (command.id) {
      case 'workspace.toggle-fullscreen': return onWorkspaceFullscreenToggle;
      case 'workspace.reset-layout': return onResetLayout;
      default: return () => {};
    }
  };
  const commandLabel = command => command.id === 'workspace.toggle-fullscreen' && isWorkspaceFullscreen ? 'KILÉPÉS' : command.label;
  const commandAriaLabel = command => {
    const panelIsOpen = isPanelCommandOpen(command);
    if (command.id === 'workspace.panels') return panelIsOpen ? 'Munkatér panelkezelő bezárása' : 'Munkatér panelkezelő megnyitása';
    if (command.id === 'workspace.search') return panelIsOpen ? 'RAG kereső bezárása' : 'RAG kereső megnyitása';
    if (command.id === 'workspace.ribbon-settings') return panelIsOpen ? 'Ribbon személyre szabásának bezárása' : 'Ribbon személyre szabása';
    if (command.id === 'workspace.toggle-fullscreen') return isWorkspaceFullscreen ? 'Teljes képernyős modelltér bezárása' : 'Teljes képernyős modelltér bekapcsolása';
    if (command.id === 'workspace.reset-layout') return 'Modelltér alaphelyzet visszaállítása';
    return `${commandLabel(command)} panel ${panelIsOpen ? 'bezárása' : 'megnyitása'}`;
  };
  const activeTab = RIBBON_TABS.find(tab => tab.id === activeRibbonTab) || RIBBON_TABS[0];
  const activeAccent = accentFor(activeTab);
  const commandGroups = useMemo(() => resolveCadCompactWorkspaceRibbonGroups({
    commands: visibleCommands,
    tabId: activeRibbonTab,
    defaultGroupId: 'commands',
    defaultGroupLabel: 'PARANCSOK'
  }).map(group => ({ ...group, id: `${activeRibbonTab}-${group.id}` })), [activeRibbonTab, visibleCommands]);
  const compactMenuOpen = ribbonPreferences.minimized && compactMenuTabId === activeRibbonTab;
  const activeCompactGroup = commandGroups.find(group => group.id === compactGroupId) || null;
  useEffect(() => {
    if (compactGroupId && !commandGroups.some(group => group.id === compactGroupId)) setCompactGroupId('');
  }, [commandGroups, compactGroupId]);
  const handleRibbonTabClick = (tab, event) => {
    setActiveRibbonTab(tab.id);
    if (!ribbonPreferences.minimized) return;
    if (compactMenuTabId === tab.id) {
      closeCompactMenu();
      return;
    }
    const ribbonBounds = ribbonRef.current?.getBoundingClientRect();
    const tabBounds = event.currentTarget.getBoundingClientRect();
    const menuWidth = 352;
    const maximumLeft = Math.max(6, (ribbonBounds?.width || menuWidth) - menuWidth - 6);
    const tabLeft = Math.max(6, tabBounds.left - (ribbonBounds?.left || 0));
    setCompactMenuLeft(Math.min(tabLeft, maximumLeft));
    setCompactMenuTabId(tab.id);
    setCompactGroupId('');
  };
  const dismissCompactMenuOnBlur = event => {
    if (!compactMenuOpen || ribbonRef.current?.contains(event.relatedTarget)) return;
    closeCompactMenu();
  };
  const dismissCompactMenuOnPointerLeave = event => {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    closeCompactMenu();
  };
  const executeRibbonCommand = (command, surface) => event => {
    commandCallback(command)(event);
    if (surface === 'compact' && !event.defaultPrevented) closeCompactMenu();
  };
  const renderCommandTool = (command, surface = 'ribbon') => {
    const Icon = command.id === 'workspace.toggle-fullscreen' && isWorkspaceFullscreen ? Minimize2 : (commandIcons[command.icon] || Network);
    const label = commandLabel(command);
    const badge = command.id === 'view.layers' ? activeLayerCount : undefined;
    const panelId = panelIdForCommand(command);
    const active = panelId ? isPanelCommandOpen(command) : command.id === 'workspace.toggle-fullscreen' && isWorkspaceFullscreen;
    return <CadToolButton
      key={`${surface}-${activeRibbonTab}-${command.id}-${label}`}
      icon={Icon}
      label={label}
      shortcut={command.shortcut}
      tone={command.tone}
      badge={badge === undefined ? undefined : String(badge)}
      toggle={Boolean(panelId) || command.id === 'workspace.toggle-fullscreen'}
      active={active}
      data-ribbon-tool={command.toolId || command.id}
      data-command-id={command.id}
      data-testid={command.id === 'workspace.toggle-fullscreen' ? `graph-fullscreen-toggle${surface === 'compact' ? '-compact' : ''}` : undefined}
      onClick={executeRibbonCommand(command, surface)}
      className={`graph-cad-ribbon__tool${surface === 'compact' ? ' graph-cad-ribbon__compact-command' : ''}`}
      aria-label={commandAriaLabel(command)}
      title={command.detail || commandAriaLabel(command)}
    />;
  };
  return (
    <header ref={ribbonRef} className={`graph-cad-ribbon${ribbonPreferences.minimized ? ' is-minimized' : ''}${compactMenuOpen ? ' is-compact-menu-open' : ''}`} data-testid="graph-cad-ribbon" data-accent-mode={accentMode.id} data-minimized={ribbonPreferences.minimized ? 'true' : 'false'} data-compact-menu-open={compactMenuOpen ? 'true' : 'false'} onBlurCapture={dismissCompactMenuOnBlur} onPointerLeave={compactMenuOpen ? dismissCompactMenuOnPointerLeave : undefined}>
      <div className="graph-cad-ribbon__tabbar">
        <div className="graph-cad-ribbon__tabs" role="tablist" aria-label="Modelltér menü">{RIBBON_TABS.map(tab => <button key={tab.id} id={`graph-ribbon-tab-button-${tab.id}`} type="button" role="tab" aria-selected={tab.id === activeRibbonTab} aria-controls={ribbonPreferences.minimized ? 'graph-ribbon-compact-menu' : `graph-ribbon-commands-${tab.id}`} aria-expanded={ribbonPreferences.minimized ? compactMenuTabId === tab.id : undefined} data-testid={`graph-ribbon-tab-${tab.id}`} data-tone={tab.id} style={{ '--ribbon-accent': accentFor(tab) }} className={tab.id === activeRibbonTab ? 'is-active' : ''} onClick={event => handleRibbonTabClick(tab, event)}>{tab.id === 'view' && <Network size={10} aria-hidden="true" />}{tab.label}</button>)}</div>
        <button type="button" className="graph-cad-ribbon__minimize" aria-label={ribbonPreferences.minimized ? 'Szalag kibontása' : 'Szalag összecsukása'} aria-expanded={!ribbonPreferences.minimized} title={ribbonPreferences.minimized ? 'Szalag kibontása' : 'Szalag összecsukása'} onClick={onToggleRibbonMinimized}>{ribbonPreferences.minimized ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronUp size={12} aria-hidden="true" />}<span>{ribbonPreferences.minimized ? 'KIBONT' : 'TÖMÖR'}</span></button>
      </div>
      {compactMenuOpen && <section id="graph-ribbon-compact-menu" data-testid="graph-ribbon-compact-menu" className="graph-cad-ribbon__compact-menu" role="dialog" aria-label={`${activeTab.label} tömör parancsmenü`} style={{ '--ribbon-accent': activeAccent, '--compact-menu-left': `${compactMenuLeft}px` }}>
        <div className="graph-cad-ribbon__compact-heading">
          <span><Network size={13} aria-hidden="true" /><b>{activeTab.label}</b><small>TÖMÖR MENÜ</small></span>
          <button type="button" onClick={closeCompactMenu} aria-label={`${activeTab.label} tömör menü bezárása`} title="Menü bezárása"><X size={13} aria-hidden="true" /></button>
        </div>
        <div className="graph-cad-ribbon__compact-groups" aria-label={`${activeTab.label} parancscsoportjai`}>
          {commandGroups.map(group => {
            const expanded = group.id === compactGroupId;
            return <button key={group.id} type="button" data-testid={`graph-ribbon-compact-group-${group.id}`} data-cad-group={group.label} className={`graph-cad-ribbon__compact-group${expanded ? ' is-active' : ''}`} aria-expanded={expanded} aria-controls={`graph-ribbon-compact-commands-${group.id}`} onClick={() => setCompactGroupId(current => current === group.id ? '' : group.id)}>
              <span><i aria-hidden="true" />{group.label}</span><em>{formatNumber(group.commands.length)}</em><ChevronDown size={12} aria-hidden="true" />
            </button>;
          })}
        </div>
        {activeCompactGroup ? <section id={`graph-ribbon-compact-commands-${activeCompactGroup.id}`} data-testid="graph-ribbon-compact-commands" className="graph-cad-ribbon__compact-commands" aria-label={`${activeCompactGroup.label} parancsai`}>
          <div className="graph-cad-ribbon__compact-command-heading"><span>{activeCompactGroup.label}</span><small>{formatNumber(activeCompactGroup.commands.length)} PARANCS · UTÁNA BEZÁR</small></div>
          <div className="graph-cad-ribbon__compact-command-grid">{activeCompactGroup.commands.map(command => renderCommandTool(command, 'compact'))}</div>
        </section> : <p className="graph-cad-ribbon__compact-hint">VÁLASSZ PARANCSCSOPORTOT</p>}
      </section>}
      <div id={`graph-ribbon-commands-${activeTab.id}`} role="tabpanel" aria-labelledby={`graph-ribbon-tab-button-${activeTab.id}`} tabIndex={0} className="graph-cad-ribbon__commands" style={{ '--ribbon-accent': activeAccent }}>
        <div className="graph-cad-ribbon__identity"><Network size={15} aria-hidden="true" /><strong>GRÁF</strong></div>
        <div className="graph-cad-ribbon__groups">{commandGroups.map((group, groupIndex) => <section key={group.id} className="graph-cad-ribbon__group" data-cad-group={group.label} data-primary={groupIndex === 0 ? 'true' : 'false'} aria-label={`${group.label} parancscsoport`}>
          <div className="graph-cad-ribbon__group-tools">{group.commands.map(command => renderCommandTool(command))}</div>
          <span className="graph-cad-ribbon__group-label">{group.label}</span>
        </section>)}</div>
        <div className="graph-cad-ribbon__status" aria-label="Munkatér állapot"><span className="graph-cad-ribbon__status-primary"><i aria-hidden="true" /><b>{formatNumber(activeLayerCount)}</b> DB-RÉTEG</span><span className="graph-cad-ribbon__status-context">{activeTab.label}</span><small>SZÍNPROFIL: {accentMode.label} · PANELEK: DOKK / LEBEG / MAX · BAL KLIKK: KÖRNYEZETI PARANCSOK</small></div>
      </div>
    </header>
  );
}

function GraphWorkspacePanelMenu() {
  const workspace = useGraphWorkspace();
  const scopeLabel = workspace.preferenceScope === 'admin' ? 'ADMIN' : 'PUBLIKUS';
  return (
    <CadWorkspacePanelManager
      data-testid="graph-workspace-panel-menu"
      className="graph-application-bar__workspace-menu"
      panels={workspace.workspacePanelDefinitions}
      value={workspace.workspacePanelPreferences}
      onChange={workspace.persistWorkspacePanelPreferences}
      onPanelOpen={workspace.openWorkspacePanelFromPreferences}
      onPanelClose={panel => workspace.closeWorkspacePanel(panel.id)}
      onPanelDock={workspace.dockWorkspacePanelFromPreferences}
      onPanelFloat={workspace.floatWorkspacePanelFromPreferences}
      onPanelReset={panel => workspace.resetWorkspacePanel(panel.id)}
      onResetAll={() => workspace.resetWorkspaceLayout()}
      title="Munkatér panelek"
      description="Csak itt, közvetlenül válaszd ki a megjelenő eszközablakokat és a dokkolásukat."
      scope={scopeLabel}
      triggerLabel="Munkatér panelek"
      closeLabel="Munkatér panelmenü bezárása"
      resetAllLabel="GYÁRI MUNKATÉR"
      emptyLabel="Ebben a nézetben nincs testreszabható eszközablak."
      placement="bottom-end"
      renderTrigger={({ visibleCount, floatingCount }) => <button
        type="button"
        data-testid="workspace-panel-customizer-trigger"
        data-floating-panels={floatingCount}
        aria-label="Munkatér panelek megjelenítése és elhelyezése"
        title="Panelek közvetlen megjelenítése, dokkolása vagy lebegtetése"
        className="graph-application-bar__panel-toggle graph-application-bar__panel-customizer-trigger"
      ><PanelsTopLeft size={13} aria-hidden="true" /><span>PANELEK</span><output aria-label={`${visibleCount} nyitott munkatérpanel`}>{visibleCount}</output></button>}
    />
  );
}

function GraphApplicationBar({ canPreview, isAdminPreview, isWorkspaceManagerOpen, onTogglePreview, onOpenPanels }) {
  const isAdminActive = Boolean(canPreview && isAdminPreview);
  return (
    <header className="graph-application-bar" data-testid="graph-app-bar" data-admin-active={isAdminActive ? 'true' : 'false'} aria-label="Gráf alkalmazássáv">
      <Link to="/" data-testid="graph-app-home" aria-label="SZÁNTOI GÁBOR // AI — vissza a főoldalra" className="graph-application-bar__brand">
        <span className="graph-application-bar__brand-mark" aria-hidden="true"><Network size={14} /></span>
        <span><strong>SZÁNTOI_GÁBOR</strong><em>// AI</em></span>
        <small>FŐOLDAL</small>
      </Link>
      <div className="graph-application-bar__context" aria-hidden="true"><span />TUDÁSGRÁF <i>//</i> MODELTÉR</div>
      <div className="graph-application-bar__controls">
        <GraphWorkspacePanelMenu />
        <button type="button" data-testid="workspace-panel-launcher" aria-label={isWorkspaceManagerOpen ? 'Munkatér panelkezelő bezárása' : 'Munkatér panelkezelő megnyitása'} aria-pressed={isWorkspaceManagerOpen} title={isWorkspaceManagerOpen ? 'Haladó panelek bezárása' : 'Haladó panelek és elrendezések'} onClick={onOpenPanels} className={`graph-application-bar__panel-toggle graph-application-bar__panel-launcher${isWorkspaceManagerOpen ? ' is-active' : ''}`}><MoreHorizontal size={13} aria-hidden="true" /><span>HALADÓ</span></button>
        {canPreview && <button type="button" data-testid="admin-view-toggle" aria-pressed={isAdminActive} aria-label={isAdminActive ? 'Publikus nézetre váltás' : 'Admin nézetre váltás'} title={isAdminActive ? 'Publikus nézetre váltás' : 'Admin nézetre váltás'} onClick={onTogglePreview} className="graph-application-bar__admin-toggle">
          <ShieldCheck size={13} aria-hidden="true" />
          <span>{isAdminActive ? 'ADMIN AKTÍV' : 'PUBLIKUS'}</span>
        </button>}
      </div>
    </header>
  );
}

function GraphQuickActionMenu({ action, isAdminPreview, onClose, onOpenPanel }) {
  if (!action) return null;
  const menuId = action.kind === 'db-edge' ? 'edge' : 'node';
  const commands = selectCadCuiCommands(GRAPH_CUI_SYSTEM, GRAPH_CUI_SYSTEM.defaultState, {
    surface: 'context',
    menuId,
    capabilities: { admin: isAdminPreview }
  });
  const commandIcons = { settings: Settings2, layers: Layers3, route: Route, panels: PanelsTopLeft, network: Network };
  const open = command => {
    onOpenPanel(command.intent.panelId);
    onClose();
  };
  return (
    <CadPanelShell as="aside" data-testid="graph-cad-quick-menu" data-selection-kind={action.kind} className="graph-cad-quick-menu" role="menu" aria-label="Bal klikkes gyorsműveletek" tone="cyan" density="compact" scroll={false} style={{ left: `${action.x}px`, top: `${action.y}px` }} onPointerDown={event => event.stopPropagation()}>
      <CadPanelHeader compact eyebrow="GYORSMŰVELETEK" title={action.label} actions={<CadIconButton icon={X} label="Gyorsmenü bezárása" onClick={onClose} />} />
      <CadPanelSection compact>
        <div className="graph-cad-quick-menu__actions">
          {commands.map(command => {
            const Icon = commandIcons[command.icon] || Network;
            const ariaLabel = command.id === 'view.inspector' ? 'Tulajdonságok megnyitása'
              : command.id === 'view.layers' ? 'Rétegverem megnyitása'
                : command.id === 'analysis.traversal' ? 'Útvonalak megnyitása'
                  : command.id === 'workspace.panels' ? 'Munkatér panelkezelő megnyitása'
                    : 'Szerkesztő megnyitása';
            return <CadActionButton key={command.id} role="menuitem" icon={Icon} tone={command.tone} aria-label={ariaLabel} data-command-id={command.id} onClick={() => open(command)}>{command.label}</CadActionButton>;
          })}
        </div>
      </CadPanelSection>
      <CadPanelFooter>A kijelölés részleteit az INSPEKTOR panelben nyithatod meg.</CadPanelFooter>
    </CadPanelShell>
  );
}

const KnowledgeGraphPage = () => {
  const { viewerFetch, isAdminPreview, canPreview, enterAdminPreview, exitAdminPreview } = useAdminPreview();
  const preferenceScope = workspacePreferenceScope(isAdminPreview);
  const [graphs, setGraphs] = useState(EMPTY_LIST);
  const [activeLayerIds, setActiveLayerIds] = useState(EMPTY_LIST);
  const [snapshots, setSnapshots] = useState({});
  const [selectedGraphId, setSelectedGraphId] = useState('');
  const [selectedLayerId, setSelectedLayerId] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState('');
  const [selectedEdgeId, setSelectedEdgeId] = useState('');
  const [documentCandidates, setDocumentCandidates] = useState(EMPTY_LIST);
  const [documents, setDocuments] = useState(EMPTY_LIST);
  const [query, setQuery] = useState(initialTraversal);
  const [traversal, setTraversal] = useState(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingDocuments, setLoadingDocuments] = useState(true);
  const [loadingLayerIds, setLoadingLayerIds] = useState(EMPTY_LIST);
  const [runningTraversal, setRunningTraversal] = useState(false);
  const [error, setError] = useState('');
  const [quickAction, setQuickAction] = useState(null);
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);
  const [workspaceSearchExpanded, setWorkspaceSearchExpanded] = useState(true);
  const [workspaceSearchHost, setWorkspaceSearchHost] = useState(null);
  const [ribbonPreferences, setRibbonPreferences] = useState(() => readRibbonPreferences(preferenceScope));
  const [cadContentPreferences, setCadContentPreferences] = useState(() => readCadContentPreferences(preferenceScope));
  const [workspacePanelPreferenceState, setWorkspacePanelPreferenceState] = useState(() => readWorkspacePanelPreferences(preferenceScope));
  const [preferenceScopeHydrated, setPreferenceScopeHydrated] = useState(preferenceScope);
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [workspaceLayouts, setWorkspaceLayouts] = useState(() => readWorkspaceLayouts(preferenceScope));
  const workspaceApiRef = useRef(null);
  const workspaceLayoutsRef = useRef(workspaceLayouts);
  const workspacePanelPreferencesRef = useRef(workspacePanelPreferenceState);
  const workspaceDisposablesRef = useRef(EMPTY_LIST);
  const isRestoringWorkspaceLayoutRef = useRef(false);
  const workspaceFrameRef = useRef(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [immersiveFullscreen, setImmersiveFullscreen] = useState(false);
  const isWorkspaceFullscreen = nativeFullscreen || immersiveFullscreen;
  const activeWorkspaceLayout = useMemo(() => workspaceLayouts.profiles.find(profile => profile.id === workspaceLayouts.activeId) || workspaceLayouts.profiles[0] || defaultWorkspaceLayoutProfile(), [workspaceLayouts]);
  const hasSavedWorkspaceLayout = Boolean(activeWorkspaceLayout?.snapshot);

  const dismissQuickAction = useCallback(() => setQuickAction(null), []);
  const toggleRibbonTool = useCallback(toolId => {
    if (!RIBBON_TOOL_OPTIONS.some(tool => tool.id === toolId)) return;
    setRibbonPreferences(current => ({
      ...current,
      hiddenToolIds: current.hiddenToolIds.includes(toolId)
        ? current.hiddenToolIds.filter(id => id !== toolId)
        : [...current.hiddenToolIds, toolId]
    }));
  }, []);
  const setRibbonAccentMode = useCallback(accentMode => {
    if (!RIBBON_ACCENT_MODES.some(mode => mode.id === accentMode)) return;
    setRibbonPreferences(current => ({ ...current, accentMode }));
  }, []);
  const toggleRibbonMinimized = useCallback(() => setRibbonPreferences(current => ({ ...current, minimized: !current.minimized })), []);
  const resetRibbonPreferences = useCallback(() => setRibbonPreferences({ hiddenToolIds: EMPTY_LIST, accentMode: DEFAULT_RIBBON_PREFERENCES.accentMode, minimized: DEFAULT_RIBBON_PREFERENCES.minimized }), []);
  const setCadContentDensity = useCallback(density => {
    if (!CAD_CONTENT_DENSITIES.some(option => option.id === density)) return;
    setCadContentPreferences(current => ({ ...current, density }));
  }, []);
  const setCadContentDetail = useCallback(detail => {
    if (!CAD_CONTENT_DETAILS.some(option => option.id === detail)) return;
    setCadContentPreferences(current => ({ ...current, detail }));
  }, []);
  const resetCadContentPreferences = useCallback(() => setCadContentPreferences(DEFAULT_CAD_CONTENT_PREFERENCES), []);
  useEffect(() => {
    if (preferenceScopeHydrated !== preferenceScope) return;
    try {
      window.localStorage.setItem(ribbonPreferenceKey(preferenceScope), JSON.stringify(ribbonPreferences));
    } catch {
      // A szalag a következő látogatáskor gyári kiosztással indul, ha a böngésző nem enged tárolást.
    }
  }, [preferenceScope, preferenceScopeHydrated, ribbonPreferences]);

  useEffect(() => {
    if (preferenceScopeHydrated !== preferenceScope) return;
    try {
      window.localStorage.setItem(cadContentPreferenceKey(preferenceScope), JSON.stringify(cadContentPreferences));
    } catch {
      // A tartalmi nézet a következő látogatáskor alapértékekkel indul, ha nincs írható tárhely.
    }
  }, [cadContentPreferences, preferenceScope, preferenceScopeHydrated]);

  const persistWorkspacePanelPreferences = useCallback(nextValue => {
    const value = nextValue && typeof nextValue === 'object' && !Array.isArray(nextValue) ? nextValue : {};
    workspacePanelPreferencesRef.current = value;
    setWorkspacePanelPreferenceState(value);
    if (preferenceScopeHydrated !== preferenceScope) return value;
    try {
      window.localStorage.setItem(workspacePanelPreferenceKey(preferenceScope), JSON.stringify(value));
    } catch {
      setError('PANEL_BEÁLLÍTÁSI_HIBA: a böngésző nem adott írható tárhelyet.');
    }
    return value;
  }, [preferenceScope, preferenceScopeHydrated]);

  const patchWorkspacePanelPreference = useCallback((panelId, patch) => {
    if (!WORKSPACE_PANELS[panelId] || panelId === MODEL_PANEL_ID) return workspacePanelPreferencesRef.current;
    const current = workspacePanelPreferencesRef.current;
    return persistWorkspacePanelPreferences({
      ...current,
      [panelId]: { ...(current[panelId] || {}), ...patch }
    });
  }, [persistWorkspacePanelPreferences]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const syncFullscreenState = () => setNativeFullscreen(document.fullscreenElement === workspaceFrameRef.current);
    document.addEventListener('fullscreenchange', syncFullscreenState);
    syncFullscreenState();
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  const toggleWorkspaceFullscreen = useCallback(async () => {
    const frame = workspaceFrameRef.current;
    if (!frame || typeof document === 'undefined') return;
    const nativeActive = document.fullscreenElement === frame;
    if (nativeActive) {
      try {
        await document.exitFullscreen?.();
      } catch {
        setNativeFullscreen(false);
      }
      return;
    }
    if (immersiveFullscreen) {
      setImmersiveFullscreen(false);
      return;
    }
    if (typeof frame.requestFullscreen === 'function' && document.fullscreenEnabled !== false) {
      try {
        await frame.requestFullscreen();
        // Some embedded webviews expose a no-op fullscreen API. Keep the
        // workspace command deterministic even when no fullscreenchange event
        // follows the resolved request.
        if (document.fullscreenElement !== frame) setImmersiveFullscreen(true);
        return;
      } catch {
        // Browser or embedded contexts may reject the native API. The
        // in-app immersive mode keeps the command useful in that case.
      }
    }
    setImmersiveFullscreen(true);
  }, [immersiveFullscreen]);
  const showQuickAction = useCallback((kind, label, event) => {
    if (!event || typeof event.clientX !== 'number' || typeof window === 'undefined') return;
    const menuWidth = 244;
    const menuHeight = 286;
    const margin = 12;
    setQuickAction({
      kind,
      label: text(label) || 'Kijelölt gráfelem',
      x: Math.round(Math.max(margin, Math.min(event.clientX + 12, window.innerWidth - menuWidth - margin))),
      y: Math.round(Math.max(margin, Math.min(event.clientY + 12, window.innerHeight - menuHeight - margin)))
    });
  }, []);

  const loadDocuments = useCallback(async () => {
    setLoadingDocuments(true);
    try {
      const response = await viewerFetch('/api/graph/documents');
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || `HTTP_${response.status}`);
      const availableDocuments = Array.isArray(payload.documents) ? payload.documents : (Array.isArray(payload.docs) ? payload.docs : []);
      setDocuments(availableDocuments.map(normalizeGraphDocument));
    } catch (requestError) {
      setDocuments(EMPTY_LIST);
      setError(`DOKUMENTUMEXPLORER_HIBA: ${requestError.message}`);
    } finally {
      setLoadingDocuments(false);
    }
  }, [viewerFetch]);

  const loadCatalog = useCallback(async () => {
    setLoadingCatalog(true);
    try {
      const response = await viewerFetch('/api/knowledge/graphs');
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || `HTTP_${response.status}`);
      setGraphs(payload.graphs || []);
    } catch (requestError) {
      setError(`GRÁFREGISZTER_HIBA: ${requestError.message}`);
    } finally {
      setLoadingCatalog(false);
    }
  }, [viewerFetch]);

  const loadLayer = useCallback(async graphId => {
    setLoadingLayerIds(current => current.includes(graphId) ? current : [...current, graphId]);
    try {
      const response = await viewerFetch(`/api/knowledge/graphs/${encodePath(graphId)}`);
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || `HTTP_${response.status}`);
      setSnapshots(current => ({ ...current, [graphId]: { graph: payload.graph, nodes: payload.nodes || [], edges: payload.edges || [], snapshot_truncated: Boolean(payload.snapshot_truncated) } }));
    } catch (requestError) {
      setError(`GRÁFRÉTEG_HIBA: ${requestError.message}`);
    } finally {
      setLoadingLayerIds(current => current.filter(id => id !== graphId));
    }
  }, [viewerFetch]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);
  useEffect(() => { loadCatalog(); }, [loadCatalog]);
  useEffect(() => {
    activeLayerIds.forEach(graphId => {
      if (!snapshots[graphId] && !loadingLayerIds.includes(graphId)) loadLayer(graphId);
    });
  }, [activeLayerIds, loadLayer, loadingLayerIds, snapshots]);

  const activeSnapshots = useMemo(() => activeLayerIds.map(id => snapshots[id]).filter(Boolean), [activeLayerIds, snapshots]);
  const selectedSnapshot = snapshots[selectedGraphId] || activeSnapshots[0] || null;
  const selectedGraph = selectedSnapshot?.graph || graphs.find(graph => graph.id === selectedGraphId) || null;
  const selectedNode = selectedSnapshot?.nodes.find(node => String(node.id) === String(selectedNodeId)) || null;
  const selectedEdge = selectedSnapshot?.edges.find(edge => String(edge.id) === String(selectedEdgeId)) || null;

  const clearSelection = useCallback(() => {
    setSelectedNodeId('');
    setSelectedEdgeId('');
    setSelectedLayerId('');
    setDocumentCandidates(EMPTY_LIST);
    setTraversal(null);
    setQuery(initialTraversal());
    setQuickAction(null);
  }, []);

  const toggleLayer = useCallback(graphId => {
    setError('');
    setActiveLayerIds(current => {
      const enabled = current.includes(graphId);
      const next = enabled ? current.filter(id => id !== graphId) : [...current, graphId];
      if (!enabled) setSelectedGraphId(graphId);
      if (enabled && selectedGraphId === graphId) setSelectedGraphId(next[0] || '');
      return next;
    });
    clearSelection();
  }, [clearSelection, selectedGraphId]);

  const chooseNode = useCallback((node, graphId, event) => {
    setSelectedGraphId(graphId);
    setSelectedLayerId(graphId);
    setSelectedNodeId(node.id);
    setSelectedEdgeId('');
    setDocumentCandidates(EMPTY_LIST);
    setTraversal(null);
    showQuickAction('db-node', node?.label || node?.id, event);
  }, [showQuickAction]);

  const chooseEdge = useCallback((edge, graphId, event) => {
    setSelectedGraphId(graphId);
    setSelectedLayerId(graphId);
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(edge.source_node_id);
    setDocumentCandidates(EMPTY_LIST);
    setTraversal(null);
    showQuickAction('db-edge', `${edge?.source_label || edge?.source_node_id || ''} → ${edge?.target_label || edge?.target_node_id || ''}`, event);
  }, [showQuickAction]);

  const beginRelationship = useCallback(() => {
    setSelectedNodeId('');
    setSelectedEdgeId('');
    setSelectedLayerId('');
    setDocumentCandidates(EMPTY_LIST);
    setTraversal(null);
    setQuickAction(null);
  }, []);

  const selectBaseDocument = useCallback((document, event) => {
    const candidates = activeSnapshots.flatMap(snapshot => snapshot.nodes
      .filter(node => boundPostId(node, [document]) === Number(document.id))
      .map(node => ({ node, graph: snapshot.graph })));
    setDocumentCandidates(candidates);
    setSelectedEdgeId('');
    setTraversal(null);
    if (candidates.length === 1) chooseNode(candidates[0].node, candidates[0].graph.id);
    else if (!candidates.length) {
      setSelectedNodeId('');
      setSelectedLayerId('');
    }
    showQuickAction('document', document?.title || document?.slug, event);
  }, [activeSnapshots, chooseNode, showQuickAction]);

  const renderCanvasOverlay = useCallback(({ canvas, markerPrefix, documentNodes }) => activeSnapshots.map(snapshot => (
    <GraphLayerOverlay
      key={snapshot.graph.id}
      graph={snapshot.graph}
      nodes={snapshot.nodes}
      edges={snapshot.edges}
      documentNodes={documentNodes}
      canvas={canvas}
      markerPrefix={markerPrefix}
      selectedEdgeId={selectedLayerId === snapshot.graph.id ? selectedEdgeId : ''}
      selectedNodeId={selectedLayerId === snapshot.graph.id ? selectedNodeId : ''}
      onSelectEdge={(edge, event) => chooseEdge(edge, snapshot.graph.id, event)}
      onSelectNode={(node, event) => chooseNode(node, snapshot.graph.id, event)}
    />
  )), [activeSnapshots, chooseEdge, chooseNode, selectedEdgeId, selectedLayerId, selectedNodeId]);

  const runTraversal = useCallback(async () => {
    if (!selectedGraphId || !selectedNodeId) return;
    setRunningTraversal(true);
    setError('');
    try {
      const response = await viewerFetch(`/api/knowledge/graphs/${encodePath(selectedGraphId)}/traverse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start_node_ids: [selectedNodeId],
          direction: query.direction,
          max_depth: Number(query.max_depth),
          max_nodes: Number(query.max_nodes),
          min_confidence: Number(query.min_confidence),
          edge_type_ids: query.edge_type_ids,
          origins: query.origins,
          ...(query.as_of ? { as_of: new Date(query.as_of).toISOString() } : {})
        })
      });
      const payload = await readJson(response);
      if (!response.ok) throw new Error(payload.error || `HTTP_${response.status}`);
      setTraversal(payload);
    } catch (requestError) {
      setError(`BEJÁRÁSI_HIBA: ${requestError.message}`);
    } finally {
      setRunningTraversal(false);
    }
  }, [query, selectedGraphId, selectedNodeId, viewerFetch]);

  const refreshGraphData = useCallback(async () => {
    setError('');
    // A previously calculated path may no longer be valid after a canonical
    // node, edge, or layer mutation. Keep the current selection, but require
    // an explicit fresh traversal against the reloaded topology.
    setTraversal(null);
    await Promise.all([loadDocuments(), loadCatalog(), ...activeLayerIds.map(graphId => loadLayer(graphId))]);
  }, [activeLayerIds, loadCatalog, loadDocuments, loadLayer]);

  const syncWorkspaceState = useCallback(() => {
    const api = workspaceApiRef.current;
    if (!api) return;
    setWorkspaceRevision(current => current + 1);
  }, []);

  const addWorkspacePanel = useCallback((panelId, placement, api = workspaceApiRef.current) => {
    if (!api) return null;
    const configuration = WORKSPACE_PANELS[panelId];
    if (!configuration || (configuration.adminOnly && !isAdminPreview)) return null;
    const existing = api.getPanel(panelId);
    if (existing) {
      existing.api.setActive();
      return existing;
    }
    const resolvedPlacement = placement || configuration.defaultPlacement || 'floating';
    const size = workspacePanelSize(configuration);
    const base = {
      id: panelId,
      component: configuration.component,
      title: configuration.title,
      params: { panelId, title: configuration.title, locked: configuration.locked, width: size.width, height: size.height },
      initialWidth: size.width,
      initialHeight: size.height
    };
    if (resolvedPlacement === 'root') return api.addPanel(base);
    if (resolvedPlacement === 'floating') {
      return api.addPanel({ ...base, floating: { ...workspaceFloatingPosition(panelId, size), ...size } });
    }
    const dockDirection = resolvedPlacement === 'bottom' ? 'below' : resolvedPlacement;
    return api.addPanel({ ...base, position: { referencePanel: MODEL_PANEL_ID, direction: dockDirection } });
  }, [isAdminPreview]);

  const openWorkspacePanel = useCallback((panelId, placement) => {
    const storedPlacement = workspacePanelPreferencesRef.current?.[panelId]?.placement;
    const resolvedPlacement = placement || (storedPlacement ? workspacePanelDockviewPlacement(panelId, storedPlacement) : undefined);
    const panel = addWorkspacePanel(panelId, resolvedPlacement);
    const configuration = WORKSPACE_PANELS[panelId];
    if (panel && configuration && !configuration.utility && panelId !== MODEL_PANEL_ID) {
      patchWorkspacePanelPreference(panelId, {
        open: true,
        placement: workspacePanelPreferencePlacement(normalizePanelLocation(panel.api.location))
      });
    }
    syncWorkspaceState();
    return panel;
  }, [addWorkspacePanel, patchWorkspacePanelPreference, syncWorkspaceState]);

  const placeWorkspacePanel = useCallback((panelId, placement) => {
    const api = workspaceApiRef.current;
    const configuration = WORKSPACE_PANELS[panelId];
    if (!api || !configuration || configuration.locked || (configuration.adminOnly && !isAdminPreview)) return null;
    const existing = api.getPanel(panelId);
    const panel = existing || addWorkspacePanel(panelId, placement, api);
    if (!panel) return null;
    if (existing) {
      if (placement === 'floating') {
        const size = workspacePanelSize(configuration);
        api.addFloatingGroup(panel.api.group, { ...workspaceFloatingPosition(panelId, size), ...size, dragHandle: 'titlebar' });
      } else {
        const modelPanel = api.getPanel(MODEL_PANEL_ID);
        if (modelPanel) panel.api.moveTo({ group: modelPanel.api.group, position: placement });
      }
    }
    panel.api.setActive();
    if (!configuration.utility) {
      patchWorkspacePanelPreference(panelId, {
        open: true,
        placement: workspacePanelPreferencePlacement(normalizePanelLocation(panel.api.location))
      });
    }
    syncWorkspaceState();
    return panel;
  }, [addWorkspacePanel, isAdminPreview, patchWorkspacePanelPreference, syncWorkspaceState]);

  const resetWorkspacePanel = useCallback(panelId => {
    const configuration = WORKSPACE_PANELS[panelId];
    const panel = placeWorkspacePanel(panelId, configuration?.defaultPlacement);
    if (panel && configuration) panel.api.setSize(workspacePanelSize(configuration));
    syncWorkspaceState();
  }, [placeWorkspacePanel, syncWorkspaceState]);

  const closeWorkspacePanel = useCallback(panelId => {
    const api = workspaceApiRef.current;
    const configuration = WORKSPACE_PANELS[panelId];
    if (!api || !configuration || configuration.locked || (configuration.adminOnly && !isAdminPreview)) return false;
    const panel = api.getPanel(panelId);
    if (!panel) return false;
    panel.api.close();
    if (!configuration.utility) patchWorkspacePanelPreference(panelId, { open: false });
    syncWorkspaceState();
    return true;
  }, [isAdminPreview, patchWorkspacePanelPreference, syncWorkspaceState]);

  const toggleWorkspacePanel = useCallback((panelId, placement) => {
    const panel = workspaceApiRef.current?.getPanel(panelId);
    return panel ? closeWorkspacePanel(panelId) : openWorkspacePanel(panelId, placement);
  }, [closeWorkspacePanel, openWorkspacePanel]);

  const commitWorkspaceLayouts = useCallback(nextLayouts => {
    const normalized = normalizeWorkspaceLayouts(nextLayouts);
    workspaceLayoutsRef.current = normalized;
    setWorkspaceLayouts(normalized);
    try {
      window.localStorage.setItem(workspaceLayoutPreferenceKey(preferenceScope), JSON.stringify(normalized));
    } catch {
      setError('MUNKATÉR_MENTÉSI_HIBA: a böngésző nem adott írható tárhelyet.');
    }
    return normalized;
  }, [preferenceScope]);

  const captureWorkspaceSnapshot = useCallback(() => {
    const api = workspaceApiRef.current;
    if (!api) return null;
    try {
      return api.toJSON();
    } catch {
      setError('MUNKATÉR_MENTÉSI_HIBA: az aktuális panelkiosztás nem olvasható.');
      return null;
    }
  }, []);

  const snapshotActiveWorkspace = useCallback((layouts = workspaceLayoutsRef.current) => {
    const snapshot = captureWorkspaceSnapshot();
    if (!snapshot) return layouts;
    return {
      ...layouts,
      profiles: layouts.profiles.map(profile => profile.id === layouts.activeId ? { ...profile, snapshot } : profile)
    };
  }, [captureWorkspaceSnapshot]);

  const applyWorkspaceLayout = useCallback(snapshot => {
    const api = workspaceApiRef.current;
    if (!api) return;
    isRestoringWorkspaceLayoutRef.current = true;
    try {
      if (snapshot) api.fromJSON(snapshot, { reuseExistingPanels: false });
      else {
        api.clear();
        addWorkspacePanel(MODEL_PANEL_ID, 'root', api);
      }
      if (!api.getPanel(MODEL_PANEL_ID)) addWorkspacePanel(MODEL_PANEL_ID, 'root', api);
      if (!isAdminPreview) api.getPanel('graph-admin-panel')?.api.close();
      setQuickAction(null);
      setWorkspaceSearchOpen(false);
      setWorkspaceSearchHost(null);
    } catch {
      try {
        api.clear();
        addWorkspacePanel(MODEL_PANEL_ID, 'root', api);
      } catch {
        // Keep the original restore error visible if even the minimal model surface cannot be mounted.
      }
      setError('MUNKATÉR_BETÖLTÉSI_HIBA: a mentett kiosztás nem használható.');
    } finally {
      isRestoringWorkspaceLayoutRef.current = false;
      syncWorkspaceState();
    }
  }, [addWorkspacePanel, isAdminPreview, syncWorkspaceState]);

  useEffect(() => {
    if (preferenceScopeHydrated === preferenceScope) return;
    const nextPanelPreferences = readWorkspacePanelPreferences(preferenceScope);
    const nextLayouts = readWorkspaceLayouts(preferenceScope);
    workspacePanelPreferencesRef.current = nextPanelPreferences;
    workspaceLayoutsRef.current = nextLayouts;
    setWorkspacePanelPreferenceState(nextPanelPreferences);
    setRibbonPreferences(readRibbonPreferences(preferenceScope));
    setCadContentPreferences(readCadContentPreferences(preferenceScope));
    setWorkspaceLayouts(nextLayouts);
    setPreferenceScopeHydrated(preferenceScope);
    const activeProfile = nextLayouts.profiles.find(profile => profile.id === nextLayouts.activeId);
    applyWorkspaceLayout(activeProfile?.snapshot || null);
  }, [applyWorkspaceLayout, preferenceScope, preferenceScopeHydrated]);

  const saveWorkspaceLayout = useCallback(() => {
    const nextLayouts = snapshotActiveWorkspace();
    if (nextLayouts === workspaceLayoutsRef.current) return;
    commitWorkspaceLayouts(nextLayouts);
  }, [commitWorkspaceLayouts, snapshotActiveWorkspace]);

  const resetWorkspaceLayout = useCallback(() => {
    const layouts = workspaceLayoutsRef.current;
    const nextLayouts = {
      ...layouts,
      profiles: layouts.profiles.map(profile => profile.id === layouts.activeId ? { ...profile, snapshot: null } : profile)
    };
    commitWorkspaceLayouts(nextLayouts);
    applyWorkspaceLayout(null);
  }, [applyWorkspaceLayout, commitWorkspaceLayouts]);

  const restoreWorkspaceLayout = useCallback(() => {
    applyWorkspaceLayout(activeWorkspaceLayout?.snapshot || null);
  }, [activeWorkspaceLayout?.snapshot, applyWorkspaceLayout]);

  const switchWorkspaceLayout = useCallback(layoutId => {
    const requestedId = workspaceLayoutId(layoutId);
    const currentLayouts = workspaceLayoutsRef.current;
    const target = currentLayouts.profiles.find(profile => profile.id === requestedId);
    if (!target) return;
    if (target.id === currentLayouts.activeId) {
      saveWorkspaceLayout();
      return;
    }
    const capturedLayouts = snapshotActiveWorkspace(currentLayouts);
    const nextLayouts = { ...capturedLayouts, activeId: target.id };
    commitWorkspaceLayouts(nextLayouts);
    applyWorkspaceLayout(target.snapshot);
  }, [applyWorkspaceLayout, commitWorkspaceLayouts, saveWorkspaceLayout, snapshotActiveWorkspace]);

  const createWorkspaceLayout = useCallback(() => {
    const capturedLayouts = snapshotActiveWorkspace();
    const customCount = capturedLayouts.profiles.filter(profile => profile.id !== DEFAULT_WORKSPACE_LAYOUT_ID).length + 1;
    const id = `layout-${Date.now().toString(36)}-${customCount}`;
    const profile = { id, name: `LAYOUT ${customCount}`, snapshot: null, system: false };
    const nextLayouts = { ...capturedLayouts, activeId: id, profiles: [...capturedLayouts.profiles, profile] };
    commitWorkspaceLayouts(nextLayouts);
    applyWorkspaceLayout(null);
  }, [applyWorkspaceLayout, commitWorkspaceLayouts, snapshotActiveWorkspace]);

  const renameWorkspaceLayout = useCallback((layoutId, name) => {
    const id = workspaceLayoutId(layoutId);
    const nextName = text(name).replace(/\s+/g, ' ').slice(0, 32);
    if (!id || !nextName) return;
    const layouts = workspaceLayoutsRef.current;
    if (!layouts.profiles.some(profile => profile.id === id)) return;
    commitWorkspaceLayouts({ ...layouts, profiles: layouts.profiles.map(profile => profile.id === id ? { ...profile, name: nextName } : profile) });
  }, [commitWorkspaceLayouts]);

  const onWorkspaceReady = useCallback(({ api }) => {
    workspaceDisposablesRef.current.forEach(disposable => disposable?.dispose?.());
    workspaceApiRef.current = api;
    workspaceDisposablesRef.current = [api.onDidLayoutChange?.(() => {
      if (!isRestoringWorkspaceLayoutRef.current) syncWorkspaceState();
    })].filter(Boolean);
    const layouts = workspaceLayoutsRef.current;
    const active = layouts.profiles.find(profile => profile.id === layouts.activeId);
    applyWorkspaceLayout(active?.snapshot || null);
  }, [applyWorkspaceLayout, syncWorkspaceState]);

  useEffect(() => () => workspaceDisposablesRef.current.forEach(disposable => disposable?.dispose?.()), []);

  useEffect(() => {
    const closeTopmostOverlay = event => {
      if (event.key !== 'Escape') return;
      if (quickAction) {
        setQuickAction(null);
        return;
      }
      if (documentCandidates.length) {
        setDocumentCandidates(EMPTY_LIST);
        return;
      }
      if (workspaceSearchOpen && !workspaceSearchHost) {
        setWorkspaceSearchOpen(false);
        return;
      }
      if (immersiveFullscreen) setImmersiveFullscreen(false);
    };
    window.addEventListener('keydown', closeTopmostOverlay);
    return () => window.removeEventListener('keydown', closeTopmostOverlay);
  }, [documentCandidates.length, immersiveFullscreen, quickAction, workspaceSearchHost, workspaceSearchOpen]);

  const workspacePanelStates = useMemo(() => Object.entries(WORKSPACE_PANELS)
    .filter(([panelId, configuration]) => panelId !== MODEL_PANEL_ID && panelId !== WORKSPACE_MANAGER_PANEL_ID && !configuration.utility && (!configuration.adminOnly || isAdminPreview))
    .map(([panelId, configuration]) => {
      const panel = workspaceApiRef.current?.getPanel(panelId);
      return {
        id: panelId,
        revision: workspaceRevision,
        title: configuration.title,
        icon: configuration.icon,
        accent: configuration.accent,
        isOpen: Boolean(panel),
        location: panel ? normalizePanelLocation(panel.api.location) : 'closed',
        maximized: Boolean(panel?.api.isMaximized?.())
      };
    }), [isAdminPreview, workspaceRevision]);

  const openWorkspacePanelIds = Object.keys(WORKSPACE_PANELS)
    .filter(panelId => Boolean(workspaceApiRef.current?.getPanel(panelId)));

  const workspacePanelDefinitions = useMemo(() => workspacePanelStates.map(panel => {
    const configuration = WORKSPACE_PANELS[panel.id] || {};
    return {
      id: panel.id,
      label: panel.title,
      description: WORKSPACE_PANEL_DESCRIPTIONS[panel.id] || 'CAD eszközablak',
      icon: panel.icon ? React.createElement(panel.icon, { size: 13, 'aria-hidden': true }) : undefined,
      accent: panel.accent,
      defaultOpen: false,
      defaultPlacement: workspacePanelPreferencePlacement(configuration.defaultPlacement),
      placements: ['dock', 'float'],
      closable: true
    };
  }), [workspacePanelStates]);

  const workspacePanelPreferences = useMemo(() => workspacePanelStates.reduce((preferences, panel) => {
    const stored = workspacePanelPreferenceState[panel.id] || {};
    const configuration = WORKSPACE_PANELS[panel.id] || {};
    preferences[panel.id] = {
      ...stored,
      open: panel.isOpen,
      placement: panel.isOpen
        ? workspacePanelPreferencePlacement(panel.location)
        : workspacePanelPreferencePlacement(stored.placement || configuration.defaultPlacement)
    };
    return preferences;
  }, { ...workspacePanelPreferenceState }), [workspacePanelPreferenceState, workspacePanelStates]);

  const openWorkspacePanelFromPreferences = useCallback((panel, preference) => {
    openWorkspacePanel(panel.id, workspacePanelDockviewPlacement(panel.id, preference.placement));
  }, [openWorkspacePanel]);

  const dockWorkspacePanelFromPreferences = useCallback((panel, preference) => {
    if (preference.open) placeWorkspacePanel(panel.id, workspacePanelDockPlacement(panel.id));
  }, [placeWorkspacePanel]);

  const floatWorkspacePanelFromPreferences = useCallback((panel, preference) => {
    if (preference.open) placeWorkspacePanel(panel.id, 'floating');
  }, [placeWorkspacePanel]);

  const workspaceValue = useMemo(() => ({
    graphs,
    documents,
    activeLayerIds,
    loadingLayerIds,
    loadingCatalog,
    loadingDocuments,
    toggleLayer,
    refreshGraphData,
    refreshDocuments: loadDocuments,
    selectedGraph,
    selectedSnapshot,
    selectedNode,
    selectedEdge,
    selectedNodeId,
    traversal,
    query,
    setQuery,
    runTraversal,
    runningTraversal,
    isAdminPreview,
    workspaceSearchOpen,
    setWorkspaceSearchOpen,
    workspaceSearchExpanded,
    setWorkspaceSearchExpanded,
    workspaceSearchHost,
    setWorkspaceSearchHost,
    isWorkspaceFullscreen,
    toggleWorkspaceFullscreen,
    ribbonPreferences,
    cadContentPreferences,
    toggleRibbonTool,
    setRibbonAccentMode,
    toggleRibbonMinimized,
    resetRibbonPreferences,
    setCadContentDensity,
    setCadContentDetail,
    resetCadContentPreferences,
    selectBaseDocument,
    dismissQuickAction,
    openWorkspacePanel,
    toggleWorkspacePanel,
    placeWorkspacePanel,
    resetWorkspacePanel,
    closeWorkspacePanel,
    workspacePanelStates,
    workspacePanelDefinitions,
    workspacePanelPreferences,
    persistWorkspacePanelPreferences,
    openWorkspacePanelFromPreferences,
    dockWorkspacePanelFromPreferences,
    floatWorkspacePanelFromPreferences,
    preferenceScope,
    workspaceLayouts,
    activeWorkspaceLayout,
    saveWorkspaceLayout,
    restoreWorkspaceLayout,
    resetWorkspaceLayout,
    switchWorkspaceLayout,
    createWorkspaceLayout,
    renameWorkspaceLayout,
    hasSavedWorkspaceLayout,
    renderCanvasOverlay,
    chooseNode,
    chooseEdge,
    beginRelationship
  }), [activeLayerIds, activeWorkspaceLayout, beginRelationship, cadContentPreferences, chooseEdge, chooseNode, closeWorkspacePanel, createWorkspaceLayout, dismissQuickAction, dockWorkspacePanelFromPreferences, documents, floatWorkspacePanelFromPreferences, graphs, hasSavedWorkspaceLayout, isAdminPreview, isWorkspaceFullscreen, loadDocuments, loadingCatalog, loadingDocuments, loadingLayerIds, openWorkspacePanel, openWorkspacePanelFromPreferences, persistWorkspacePanelPreferences, placeWorkspacePanel, preferenceScope, query, refreshGraphData, renderCanvasOverlay, renameWorkspaceLayout, resetCadContentPreferences, resetRibbonPreferences, resetWorkspaceLayout, resetWorkspacePanel, restoreWorkspaceLayout, ribbonPreferences, runTraversal, runningTraversal, saveWorkspaceLayout, selectedEdge, selectedGraph, selectedNode, selectedNodeId, selectedSnapshot, selectBaseDocument, setCadContentDensity, setCadContentDetail, setRibbonAccentMode, switchWorkspaceLayout, toggleLayer, toggleRibbonMinimized, toggleRibbonTool, toggleWorkspaceFullscreen, toggleWorkspacePanel, traversal, workspaceLayouts, workspacePanelDefinitions, workspacePanelPreferences, workspacePanelStates, workspaceSearchExpanded, workspaceSearchHost, workspaceSearchOpen]);

  const workspaceComponents = useMemo(() => ({
    modelSpace: GraphModelSpacePanel,
    ribbonSettings: GraphRibbonSettingsPanel,
    workspaceManager: GraphWorkspaceManagerPanel,
    search: GraphSearchPanel,
    explorer: GraphDocumentExplorerPanel,
    layers: GraphLayersPanel,
    flowView: GraphFlowPanel,
    properties: GraphPropertiesPanel,
    traversal: GraphTraversalPanel,
    admin: GraphAdminPanel
  }), []);

  return (
    <GraphWorkspaceContext.Provider value={workspaceValue}>
      <div className="graph-workspace-page w-full">
        <section ref={workspaceFrameRef} data-testid="graph-workspace-frame" data-cad-density={cadContentPreferences.density} data-cad-detail={cadContentPreferences.detail} className={`graph-workspace-frame${immersiveFullscreen ? ' is-immersive-fullscreen' : ''}`}>
          <GraphApplicationBar canPreview={canPreview} isAdminPreview={isAdminPreview} isWorkspaceManagerOpen={openWorkspacePanelIds.includes(WORKSPACE_MANAGER_PANEL_ID)} onTogglePreview={isAdminPreview ? exitAdminPreview : enterAdminPreview} onOpenPanels={() => toggleWorkspacePanel(WORKSPACE_MANAGER_PANEL_ID)} />
          <GraphCadRibbon activeLayerCount={activeLayerIds.length} isAdminPreview={isAdminPreview} isWorkspaceFullscreen={isWorkspaceFullscreen} onResetLayout={resetWorkspaceLayout} onTogglePanel={toggleWorkspacePanel} onToggleRibbonMinimized={toggleRibbonMinimized} onWorkspaceFullscreenToggle={toggleWorkspaceFullscreen} openPanelIds={openWorkspacePanelIds} ribbonPreferences={ribbonPreferences} />
          <GraphWorkspaceLayoutTabs />
          {error && <p role="alert" className="graph-workspace-alert">{error}</p>}
          <div id="graph-workspace-dock" className="graph-workspace-dock" data-testid="graph-workspace-dock">
            <DockviewReact className="graph-workspace-dock__surface" style={{ width: '100%', height: '100%' }} theme={themeDark} components={workspaceComponents} defaultTabComponent={GraphWorkspaceTab} floatingGroupBounds="boundedWithinViewport" floatingGroupDragHandle="titlebar" dndStrategy="pointer" onReady={onWorkspaceReady} />
          </div>
          <GraphQuickActionMenu action={quickAction} isAdminPreview={isAdminPreview} onClose={dismissQuickAction} onOpenPanel={toggleWorkspacePanel} />
          {documentCandidates.length > 1 && <aside className="graph-workspace-candidate-picker" data-testid="graph-document-candidate-picker" aria-label="Több kapcsolt DB-csúcs"><header><span>DB KÖTÉSEK</span><button type="button" aria-label="DB-kötés választó bezárása" onClick={() => setDocumentCandidates(EMPTY_LIST)}><X size={13} /></button></header><p>Több adatbázis-csúcs kötődik ehhez a jegyzethez.</p><div>{documentCandidates.map(({ node, graph }) => <button key={`${graph.id}-${node.id}`} type="button" onClick={() => chooseNode(node, graph.id)} style={{ '--candidate-color': safeColor(graph.color) }}><span>{graph.name}</span><strong>{node.node_type} · {node.label}</strong></button>)}</div></aside>}
        </section>
      </div>
    </GraphWorkspaceContext.Provider>
  );
};

export default KnowledgeGraphPage;
