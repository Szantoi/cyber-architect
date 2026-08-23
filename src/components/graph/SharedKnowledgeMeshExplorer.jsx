import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  BookOpen,
  FileText,
  Focus,
  GitFork,
  Layers,
  Move,
  Network,
  PanelsTopLeft,
  RefreshCw,
  RotateCcw,
  Route,
  ShieldCheck,
  SlidersHorizontal,
  X,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import GraphNavigatorSidebar from './GraphNavigatorSidebar.jsx';
import GraphRagFilterConsole from './GraphRagFilterConsole.jsx';
import {
  ALL_FILTER,
  buildGraphFacetOptions,
  getRagTierCounts,
  graphSorters,
  groupGraphDocumentsByFolder,
  matchesGraphDimension,
  matchesGraphFacets,
  matchesSmartCollection,
  normalizeGraphDocument
} from '../../utils/graphFilters.js';
import { getTreeFolders } from '../../utils/taxonomy.js';
import { buildArchiveGraphClusters, GRAPH_GROUPING_OPTIONS } from '../../utils/graphClusters.js';
import { buildElasticClusterMembranes } from '../../utils/graphMembranes.js';
import { clampGraphNodePosition, resolveMinimumNodeSeparation } from '../../utils/graphNodeSeparation.js';
import { presentationProfileOf } from '../../utils/presentationProfile.js';
import { useAdminPreview } from '../../context/AdminPreviewContext.jsx';

const DEFAULT_ROOT_SLUG = 'hibrid-ai-tudasbazis-obsidian-sql';
const CANVAS = { width: 1000, height: 560, centerX: 500, centerY: 284 };
const SEARCH_DELAY = 180;
const NODE_POSITION_STORAGE_KEY = 'knowledge-mesh-node-offsets:v1';
const DRAG_THRESHOLD = 5;
const DIRECT_LINK_FOLLOW_STRENGTH = 0.24;
const INDIRECT_LINK_FOLLOW_STRENGTH = 0.08;
const MAX_MAGNETIC_PULL = 8;
const MIN_NODE_DISTANCE = 48;
const DEFAULT_NODE_DISTANCE = 76;
const MAX_NODE_DISTANCE = 180;
const MIN_GRAPH_ZOOM = 0.45;
const MAX_GRAPH_ZOOM = 2.5;
const GRAPH_ZOOM_STEP = 0.1;
const GRAPH_INFO_PANEL_PREFERENCE_KEY = 'knowledge-mesh-info-panel:v1';
const INFO_PANEL_CORNERS = Object.freeze(['top-right', 'top-left', 'bottom-right', 'bottom-left']);
const DEFAULT_INFO_PANEL_PREFERENCES = Object.freeze({
  title: 'ÉLŐ GRÁF-TELEMETRIA',
  visibleMetricIds: ['nodes', 'edges'],
  corner: 'top-right',
  size: 'compact',
  opacity: 'glass'
});

const TYPE_META = {
  knowledge: {
    label: 'TUDÁSTÁR',
    shortLabel: 'KB',
    color: '#00fbfb',
    className: 'border-neonCyan/55 bg-neonCyan/10 text-neonCyan',
    Icon: BookOpen
  },
  blog: {
    label: 'CIKK',
    shortLabel: 'CIKK',
    color: '#ff00ff',
    className: 'border-neonMagenta/55 bg-neonMagenta/10 text-neonMagenta',
    Icon: FileText
  }
};

// `blog` is retained only as the legacy internal selector value accepted by
// the existing search route. The actual source is presentation_profile.
const typeOf = (document) => (presentationProfileOf(document) === 'article' ? 'blog' : 'knowledge');
const typeMeta = (document) => TYPE_META[typeOf(document)];
const shortLabel = (value, maximum = 28) => {
  const label = String(value || 'Névtelen dokumentum');
  return label.length > maximum ? `${label.slice(0, maximum - 1)}…` : label;
};

const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(value, maximum));
const roundPosition = (value) => Math.round(value * 10) / 10;
const nodeOffsetKey = (layoutKey, nodeId) => `${layoutKey}:${Number(nodeId)}`;
const createUniverseCanvas = (minimumDistance) => {
  const scale = Math.max(1, Number(minimumDistance) / DEFAULT_NODE_DISTANCE);
  const width = Math.round(CANVAS.width * scale);
  const height = Math.round(CANVAS.height * scale);
  return { width, height, centerX: width / 2, centerY: height / 2 };
};
const defaultViewport = () => ({ zoom: 1, panX: 0, panY: 0 });

const readNodePositionOffsets = () => {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(NODE_POSITION_STORAGE_KEY) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
};

const getSavedOffset = (offsets, key) => {
  const value = offsets[key];
  return Number.isFinite(value?.dx) && Number.isFinite(value?.dy) ? value : { dx: 0, dy: 0 };
};

const readInfoPanelPreferences = () => {
  if (typeof window === 'undefined') return DEFAULT_INFO_PANEL_PREFERENCES;
  try {
    const stored = JSON.parse(window.localStorage.getItem(GRAPH_INFO_PANEL_PREFERENCE_KEY) || '{}');
    const allowedMetricIds = new Set(DEFAULT_INFO_PANEL_PREFERENCES.visibleMetricIds);
    const visibleMetricIds = Array.isArray(stored?.visibleMetricIds)
      ? stored.visibleMetricIds.filter(id => allowedMetricIds.has(id))
      : DEFAULT_INFO_PANEL_PREFERENCES.visibleMetricIds;
    return {
      title: typeof stored?.title === 'string' && stored.title.trim() ? stored.title.trim().slice(0, 46) : DEFAULT_INFO_PANEL_PREFERENCES.title,
      visibleMetricIds,
      corner: INFO_PANEL_CORNERS.includes(stored?.corner) ? stored.corner : DEFAULT_INFO_PANEL_PREFERENCES.corner,
      size: stored?.size === 'compact' ? 'compact' : DEFAULT_INFO_PANEL_PREFERENCES.size,
      opacity: stored?.opacity === 'solid' ? 'solid' : DEFAULT_INFO_PANEL_PREFERENCES.opacity
    };
  } catch {
    return DEFAULT_INFO_PANEL_PREFERENCES;
  }
};

function focusGraphLayout(documents, rootId, canvas = CANVAS) {
  const root = documents.find(document => Number(document.id) === Number(rootId)) || documents[0];
  if (!root) return [];
  const coordinateScale = canvas.width / CANVAS.width;
  const rings = new Map();
  documents.forEach((document) => {
    if (Number(document.id) === Number(root.id)) return;
    const depth = Math.max(1, Number(document.depth) || 1);
    const ring = rings.get(depth) || [];
    ring.push(document);
    rings.set(depth, ring);
  });

  const positioned = [{ ...root, x: canvas.centerX, y: canvas.centerY, isRoot: true }];
  [...rings.entries()].sort(([first], [second]) => first - second).forEach(([depth, ring]) => {
    const radius = Math.min(220, 100 + (depth - 1) * 84) * coordinateScale;
    ring.sort((first, second) => first.title.localeCompare(second.title, 'hu')).forEach((document, index) => {
      const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / ring.length) + (depth % 2 ? 0 : Math.PI / 8);
      positioned.push({ ...document, x: canvas.centerX + Math.cos(angle) * radius * 1.38, y: canvas.centerY + Math.sin(angle) * radius, isRoot: false });
    });
  });
  return positioned;
}

function GraphNavigationCube({
  viewMode,
  status,
  groupingMode,
  onGroupingModeChange,
  activeGroupingOption,
  depth,
  onDepthChange,
  hasCustomNodeLayout,
  onResetNodeLayout,
  onShowArchive,
  minimumNodeDistance,
  onMinimumNodeDistanceChange,
  nodeLabelMode,
  onNodeLabelModeChange,
  showClusterLabels,
  onShowClusterLabelsChange,
  graphViewport,
  onZoomChange,
  onFitView,
  clusters,
  activeCluster,
  visibleGraphDocuments,
  onClusterChange,
  onOpenWorkspacePanel,
  onOpenSearch,
  isAdminPreview
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState('view');
  const navigationRef = useRef(null);
  const stopPointer = event => event.stopPropagation();
  const openPanel = panelId => {
    onOpenWorkspacePanel?.(panelId);
    setOpen(false);
  };
  const openSearch = () => {
    onOpenSearch?.();
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    const closeOnOutsidePointer = event => {
      if (!navigationRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    window.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => {
      window.removeEventListener('keydown', closeOnEscape);
      window.removeEventListener('pointerdown', closeOnOutsidePointer);
    };
  }, [open]);

  return (
    <aside ref={navigationRef} className={`graph-navigation-cube${open ? ' is-open' : ''}`} data-testid="graph-navigation-cube-shell" aria-label="Modelltér navigációs kocka" onPointerDown={stopPointer}>
        <button
          type="button"
          data-testid="graph-navigation-cube-toggle"
          className="graph-navigation-cube__launcher"
          aria-expanded={open}
          aria-controls="graph-navigation-cube-panel"
          onClick={() => setOpen(current => !current)}
        >
          <SlidersHorizontal size={16} aria-hidden="true" />
          <span>NAV</span>
          <small>{Math.round(graphViewport.zoom * 100)}%</small>
        </button>

        {open && <section id="graph-navigation-cube-panel" data-testid="graph-navigation-cube" className="graph-navigation-cube__panel" role="dialog" aria-label="Navigációs kocka vezérlők">
          <header className="graph-navigation-cube__header">
            <div><span><Network size={13} aria-hidden="true" /> MODELTÉR</span><strong>NAVIGÁCIÓS KOCKA</strong></div>
            <button type="button" aria-label="Navigációs kocka bezárása" title="Bezárás" onClick={() => setOpen(false)}><X size={14} /></button>
          </header>

          <div className="graph-navigation-cube__tabs" role="tablist" aria-label="Navigációs kocka nézetek">
            <button type="button" role="tab" aria-selected={section === 'view'} onClick={() => setSection('view')}>NÉZET</button>
            <button type="button" role="tab" aria-selected={section === 'clusters'} onClick={() => setSection('clusters')}>HALMAZOK</button>
            <button type="button" role="tab" aria-selected={section === 'panels'} onClick={() => setSection('panels')}>MUNKATÉR</button>
          </div>

          <div className="graph-navigation-cube__body">
            {section === 'view' && <>
              <section className="graph-navigation-cube__section">
                <header><span>UNIVERZUM NÉZET</span><small>{viewMode === 'overview' ? activeGroupingOption.label : 'FÓKUSZ'}</small></header>
                {viewMode === 'overview' && <label className="graph-navigation-cube__field"><span>HALMAZOSÍTÁS</span><select value={groupingMode} onChange={event => onGroupingModeChange(event.target.value)} aria-label="Halmazosítás szerint" data-testid="graph-grouping-control">{GRAPH_GROUPING_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>}
                {viewMode === 'focus' && <label className="graph-navigation-cube__field"><span>MÉLYSÉG</span><select value={depth} onChange={event => onDepthChange(Number(event.target.value))} aria-label="Fókuszált gráf mélysége"><option value="1">1</option><option value="2">2</option></select></label>}
                <div className="graph-navigation-cube__actions">
                  <button type="button" onClick={onResetNodeLayout} disabled={!hasCustomNodeLayout} title="A jelenlegi nézet automatikus elrendezésének visszaállítása"><RotateCcw size={12} /> RENDEZÉS</button>
                  <button type="button" onClick={onShowArchive} disabled={viewMode === 'overview'}><Layers size={12} /> TELJES HÁLÓ</button>
                </div>
              </section>

              <section data-testid="graph-universe-controls" className="graph-navigation-cube__section">
                <header><span>MEGJELENÍTÉS</span><small>{minimumNodeDistance} PX</small></header>
                <label className="graph-navigation-cube__range"><span>MIN. PONTTÁV</span><input type="range" min={MIN_NODE_DISTANCE} max={MAX_NODE_DISTANCE} step="4" value={minimumNodeDistance} onChange={event => onMinimumNodeDistanceChange(Number(event.target.value))} aria-label="Csomópontok minimális távolsága" data-testid="graph-node-spacing-control" /></label>
                <label className="graph-navigation-cube__field"><span>CÍMKÉK</span><select value={nodeLabelMode} onChange={event => onNodeLabelModeChange(event.target.value)} aria-label="Csomópontcímkék megjelenítése" data-testid="graph-label-mode-control"><option value="context">KONTEXTUS</option><option value="selected">KIJELÖLT / FÓKUSZ</option><option value="all">MINDEN PONT</option><option value="hidden">REJTETT</option></select></label>
                <label className="graph-navigation-cube__check"><input type="checkbox" checked={showClusterLabels} onChange={event => onShowClusterLabelsChange(event.target.checked)} aria-label="Halmazcímkék megjelenítése" /> HALMAZCÍMKÉK</label>
              </section>

              <section className="graph-navigation-cube__section">
                <header><span>KAMERA</span><small>{Math.round(graphViewport.zoom * 100)}%</small></header>
                <div className="graph-navigation-cube__zoom"><button type="button" aria-label="Kicsinyítés" title="Kicsinyítés" onClick={() => onZoomChange(graphViewport.zoom - GRAPH_ZOOM_STEP)}><ZoomOut size={14} /></button><input type="range" min={MIN_GRAPH_ZOOM} max={MAX_GRAPH_ZOOM} step={GRAPH_ZOOM_STEP} value={graphViewport.zoom} onChange={event => onZoomChange(Number(event.target.value))} aria-label="Gráf nagyítása" data-testid="graph-zoom-control" /><button type="button" aria-label="Nagyítás" title="Nagyítás" onClick={() => onZoomChange(graphViewport.zoom + GRAPH_ZOOM_STEP)}><ZoomIn size={14} /></button><button type="button" className="graph-navigation-cube__fit" aria-label="Nézet illesztése" onClick={onFitView}>ILLESZTÉS</button></div>
              </section>
            </>}

            {section === 'clusters' && <section data-testid="graph-cluster-controls" className="graph-navigation-cube__section graph-navigation-cube__section--clusters">
              <header><span>HALMAZ INDEX</span><small>{activeCluster ? `${activeCluster.label} AKTÍV` : `${clusters.length} HALMAZ`}</small></header>
              {viewMode === 'overview' && status === 'ready' && clusters.length > 0 ? <div className="graph-navigation-cube__cluster-list" role="group" aria-label="Gráfhalmazok">
                <button type="button" onClick={() => onClusterChange(ALL_FILTER)} aria-pressed={!activeCluster} className={!activeCluster ? 'is-active' : ''}>ÖSSZES ({visibleGraphDocuments.length})</button>
                {clusters.map(cluster => {
                  const selected = activeCluster?.key === cluster.key;
                  return <button key={cluster.id} type="button" onClick={() => onClusterChange(selected ? ALL_FILTER : cluster.key)} aria-pressed={selected} title={cluster.label} className={selected ? 'is-active' : ''} style={{ '--cluster-color': cluster.color }}><i aria-hidden="true" />{cluster.displayLabel} ({cluster.count})</button>;
                })}
              </div> : <p className="graph-navigation-cube__empty">A halmazválasztó a teljes háló nézetben válik elérhetővé.</p>}
            </section>}

            {section === 'panels' && <section className="graph-navigation-cube__section graph-navigation-cube__section--panels">
              <header><span>MUNKATÉR PANELEK</span><small>DOCK / LEBEG</small></header>
              <div className="graph-navigation-cube__panel-actions">
                <button type="button" onClick={() => openPanel('graph-workspace-manager-panel')} aria-label="Munkatér panelkezelő megnyitása"><PanelsTopLeft size={13} /> PANELKEZELŐ</button>
                <button type="button" onClick={openSearch} aria-label="RAG kereső megnyitása"><Focus size={13} /> KERESŐ</button>
                <button type="button" onClick={() => openPanel('graph-explorer-panel')} aria-label="EXPLORER panel megnyitása"><GitFork size={13} /> EXPLORER</button>
                <button type="button" onClick={() => openPanel('graph-layers-panel')} aria-label="RÉTEGEK panel megnyitása"><Layers size={13} /> RÉTEGEK</button>
                <button type="button" onClick={() => openPanel('graph-properties-panel')} aria-label="INSPEKTOR panel megnyitása"><Focus size={13} /> INSPEKTOR</button>
                <button type="button" onClick={() => openPanel('graph-traversal-panel')} aria-label="ÚTVONALAK panel megnyitása"><Route size={13} /> ÚTVONALAK</button>
                {isAdminPreview && <button type="button" onClick={() => openPanel('graph-admin-panel')} aria-label="SZERKESZTŐ panel megnyitása"><Network size={13} /> SZERKESZTŐ</button>}
                <button type="button" onClick={() => openPanel('graph-ribbon-panel')} aria-label="Navigációs menü személyre szabása"><SlidersHorizontal size={13} /> MENÜ</button>
              </div>
            </section>}
          </div>
          <footer>ESC vagy a modelltér kattintása bezárja. A felső szalag parancsai személyre szabhatók.</footer>
        </section>}
    </aside>
  );
}

function GraphInfoPanel({ displayedCount, totalCount, edgeCount, viewLabel, searchActive }) {
  const [isOpen, setIsOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [preferences, setPreferences] = useState(readInfoPanelPreferences);
  const metrics = [
    { id: 'nodes', label: 'LÁTHATÓ CSOMÓPONT', value: <>{displayedCount}<small>/{totalCount}</small></>, tone: 'cyan' },
    { id: 'edges', label: 'VALÓDI KAPCSOLAT', value: edgeCount, tone: 'amber' },
    { id: 'view', label: 'AKTÍV NÉZET', value: viewLabel, tone: 'neutral' },
    { id: 'search', label: 'KERESŐ ÁLLAPOT', value: searchActive ? 'AKTÍV' : 'KÉSZ', tone: 'green' }
  ];

  useEffect(() => {
    try {
      window.localStorage.setItem(GRAPH_INFO_PANEL_PREFERENCE_KEY, JSON.stringify(preferences));
    } catch {
      // A panel gyári kiosztással indul, ha a böngésző nem ad írható tárhelyet.
    }
  }, [preferences]);

  const updateVisibleMetric = (metricId, visible) => {
    setPreferences(current => ({
      ...current,
      visibleMetricIds: visible
        ? [...new Set([...current.visibleMetricIds, metricId])]
        : current.visibleMetricIds.filter(id => id !== metricId)
    }));
  };
  const cycleCorner = () => {
    setPreferences(current => ({
      ...current,
      corner: INFO_PANEL_CORNERS[(INFO_PANEL_CORNERS.indexOf(current.corner) + 1) % INFO_PANEL_CORNERS.length]
    }));
  };

  if (!isOpen) {
    return <button type="button" data-testid="graph-info-panel-launcher" className="graph-info-panel__launcher" aria-label="Infopanel megnyitása" onClick={() => setIsOpen(true)}><Network size={13} /><span>INFO</span></button>;
  }

  return (
    <aside data-testid="graph-info-panel" data-corner={preferences.corner} data-size={preferences.size} className={`graph-info-panel graph-info-panel--${preferences.corner} graph-info-panel--${preferences.size} graph-info-panel--${preferences.opacity}`} aria-label="Szerkeszthető gráf infopanel">
      <header>
        <div>
          <span><Network size={12} aria-hidden="true" /> INFO // LIVE</span>
          {isEditing ? <input aria-label="Infopanel címe" value={preferences.title} maxLength={46} onChange={event => setPreferences(current => ({ ...current, title: event.target.value }))} /> : <strong>{preferences.title}</strong>}
        </div>
        <div>
          <button type="button" aria-label="Infopanel sarokpozíció váltása" title="Sarokpozíció váltása" onClick={cycleCorner}><Move size={13} /></button>
          <button type="button" aria-label={preferences.size === 'compact' ? 'Infopanel normál mérete' : 'Infopanel kompakt mérete'} title={preferences.size === 'compact' ? 'Normál méret' : 'Kompakt méret'} onClick={() => setPreferences(current => ({ ...current, size: current.size === 'compact' ? 'standard' : 'compact' }))}>{preferences.size === 'compact' ? <ZoomIn size={13} /> : <ZoomOut size={13} />}</button>
          <button type="button" aria-label={isEditing ? 'Infopanel szerkesztésének befejezése' : 'Infopanel szerkesztése'} aria-pressed={isEditing} onClick={() => setIsEditing(current => !current)}><SlidersHorizontal size={13} /></button>
          <button type="button" aria-label="Infopanel bezárása" onClick={() => setIsOpen(false)}><X size={13} /></button>
        </div>
      </header>
      <dl>
        {metrics.filter(metric => preferences.visibleMetricIds.includes(metric.id)).map(metric => <div key={metric.id} data-metric={metric.id} className={`graph-info-panel__metric graph-info-panel__metric--${metric.tone}`}><dt>{metric.label}</dt><dd>{metric.value}</dd></div>)}
        {!preferences.visibleMetricIds.length && <p className="graph-info-panel__empty">A szerkesztésben válaszd ki a megjelenítendő mérőszámokat.</p>}
      </dl>
      {isEditing && <section className="graph-info-panel__editor" aria-label="Infopanel beállításai">
        <p>MEGJELENÍTENDŐ MÉRŐSZÁMOK</p>
        {metrics.map(metric => <label key={metric.id}><input type="checkbox" checked={preferences.visibleMetricIds.includes(metric.id)} onChange={event => updateVisibleMetric(metric.id, event.target.checked)} /> <span>{metric.label}</span></label>)}
        <div className="graph-info-panel__editor-controls"><label>SAROK<select aria-label="Infopanel sarokpozíciója" value={preferences.corner} onChange={event => setPreferences(current => ({ ...current, corner: event.target.value }))}>{INFO_PANEL_CORNERS.map(corner => <option key={corner} value={corner}>{corner.toUpperCase()}</option>)}</select></label><label>ÁTTETSZŐSÉG<select aria-label="Infopanel áttetszősége" value={preferences.opacity} onChange={event => setPreferences(current => ({ ...current, opacity: event.target.value }))}><option value="glass">ÜVEG</option><option value="solid">ERŐS</option></select></label></div>
        <small>Méretezd a jobb alsó sarokból; a számolt értékek írásvédettek.</small>
      </section>}
    </aside>
  );
}

const SharedKnowledgeMeshExplorer = ({ onSelectDoc, onGraphNodeSelect, onGraphCanvasPointerDown, onOpenWorkspacePanel, renderCanvasOverlay, workspaceMode = false, workspaceSearchOpen = false, workspaceSearchHost = null, workspaceSearchExpanded = true, onWorkspaceSearchOpenChange, onWorkspaceSearchExpandedChange }) => {
  const { viewerFetch, isAdminPreview } = useAdminPreview();
  const markerId = useId().replace(/:/g, '');
  const glowId = `${markerId}-glow`;
  const svgRef = useRef(null);
  const dragStateRef = useRef(null);
  const panStateRef = useRef(null);
  const suppressNodeClickRef = useRef(false);
  const [availableDocs, setAvailableDocs] = useState([]);
  const [graph, setGraph] = useState(null);
  const [rootSlug, setRootSlug] = useState(DEFAULT_ROOT_SLUG);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState('loading');
  const [viewMode, setViewMode] = useState('overview');
  const [depth, setDepth] = useState(2);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState('idle');
  const [searchResultIndex, setSearchResultIndex] = useState(0);
  const [ragTier, setRagTier] = useState('all');
  const [treePivotMode, setTreePivotMode] = useState('drive');
  const [selectedFolder, setSelectedFolder] = useState(ALL_FILTER);
  const [smartFilters, setSmartFilters] = useState([]);
  const [iparag, setIparag] = useState(ALL_FILTER);
  const [technology, setTechnology] = useState(ALL_FILTER);
  const [audience, setAudience] = useState(ALL_FILTER);
  const [sortBy, setSortBy] = useState('rag');
  const [groupingMode, setGroupingMode] = useState('content_type');
  const [activeClusterKey, setActiveClusterKey] = useState(ALL_FILTER);
  const [minimumNodeDistance, setMinimumNodeDistance] = useState(DEFAULT_NODE_DISTANCE);
  const [nodeLabelMode, setNodeLabelMode] = useState('context');
  const [showClusterLabels, setShowClusterLabels] = useState(true);
  const [graphViewport, setGraphViewport] = useState(defaultViewport);
  const [nodePositionOffsets, setNodePositionOffsets] = useState(readNodePositionOffsets);
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragAnnouncement, setDragAnnouncement] = useState('');
  const [filterConsoleExpanded, setFilterConsoleExpanded] = useState(!workspaceMode);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    try {
      window.localStorage.setItem(NODE_POSITION_STORAGE_KEY, JSON.stringify(nodePositionOffsets));
    } catch {
      // A személyes elrendezés megmarad, ha a böngésző engedi a localStorage használatát.
    }
  }, [nodePositionOffsets]);

  useEffect(() => {
    let active = true;
    viewerFetch('/api/graph/documents')
      .then(response => response.ok ? response.json() : { documents: [] })
      .then((data) => {
        if (!active) return;
        const documents = Array.isArray(data?.documents) ? data.documents : (Array.isArray(data?.docs) ? data.docs : []);
        setAvailableDocs(documents.map(normalizeGraphDocument));
      })
      .catch(() => active && setAvailableDocs([]));
    return () => { active = false; };
  }, [viewerFetch]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setStatus('loading');
    const requestUrl = viewMode === 'overview'
      ? '/api/graph'
      : `/api/graph/${encodeURIComponent(rootSlug)}?depth=${depth}`;

    viewerFetch(requestUrl, { signal: controller.signal })
      .then(async response => ({ ok: response.ok, data: await response.json() }))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) {
          setStatus(data?.error === 'PUBLIC_GRAPH_NOT_FOUND' ? 'empty' : 'error');
          return;
        }
        const documents = Array.isArray(data?.documents) ? data.documents.map(normalizeGraphDocument) : [];
        setGraph({ ...data, documents, edges: Array.isArray(data?.edges) ? data.edges : [] });
        if (viewMode === 'overview') setAvailableDocs(documents);
        if (viewMode === 'focus') setSelectedId(current => current ?? data?.root?.id ?? null);
        setStatus(documents.length ? 'ready' : 'empty');
      })
      .catch((error) => {
        if (active && error?.name !== 'AbortError') setStatus('error');
      });

    return () => { active = false; controller.abort(); };
  }, [depth, rootSlug, viewMode, viewerFetch]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setSearchStatus('idle');
      setRagTier('all');
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    setSearchStatus('loading');
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query, scope: searchScope, limit: '20' });
      viewerFetch(`/api/search/unified?${params.toString()}`, { signal: controller.signal })
        .then(response => response.ok ? response.json() : { results: [] })
        .then((data) => {
          if (!active) return;
          setSearchResults(Array.isArray(data?.results) ? data.results : []);
          setSearchStatus('ready');
        })
        .catch((error) => {
          if (active && error?.name !== 'AbortError') {
            setSearchResults([]);
            setSearchStatus('error');
          }
        });
    }, SEARCH_DELAY);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [searchQuery, searchScope, viewerFetch]);

  const availableDocsById = useMemo(() => new Map(availableDocs.map(document => [Number(document.id), document])), [availableDocs]);
  const graphDocuments = useMemo(() => (graph?.documents || []).map((document) => normalizeGraphDocument({
    ...availableDocsById.get(Number(document.id)),
    ...document,
    content_type: document.content_type || availableDocsById.get(Number(document.id))?.content_type || 'knowledge',
    presentation_profile: document.presentation_profile || availableDocsById.get(Number(document.id))?.presentation_profile || ''
  })), [availableDocsById, graph]);

  const graphSearchResults = useMemo(() => searchResults.map((result) => {
    const publicDocument = availableDocsById.get(Number(result.id));
    if (!publicDocument) return null;
    return normalizeGraphDocument({
      ...publicDocument,
      content_type: publicDocument.content_type,
      presentation_profile: publicDocument.presentation_profile,
      hybridRelevanceScore: result.hybridRelevanceScore,
      scorePercentage: result.scorePercentage,
      keywordScore: result.keywordScore,
      cosineSimilarity: result.cosineSimilarity
    });
  }).filter(Boolean), [availableDocsById, searchResults]);

  const hasQuery = Boolean(searchQuery.trim());
  const knowledgeCount = useMemo(() => availableDocs.filter(document => typeOf(document) === 'knowledge').length, [availableDocs]);
  const blogCount = useMemo(() => availableDocs.filter(document => typeOf(document) === 'blog').length, [availableDocs]);
  const corpusCounts = useMemo(() => ({ all: availableDocs.length, knowledge: knowledgeCount, blog: blogCount }), [availableDocs.length, blogCount, knowledgeCount]);
  const sourceDocuments = useMemo(() => (hasQuery ? graphSearchResults : availableDocs)
    .filter(document => searchScope === 'all' || typeOf(document) === searchScope), [availableDocs, graphSearchResults, hasQuery, searchScope]);

  const smartAndRagDocuments = useMemo(() => sourceDocuments.filter(document => matchesGraphFacets(document, {
    smartFilters,
    ragTier,
    hasQuery
  })), [hasQuery, ragTier, smartFilters, sourceDocuments]);

  const folderScopedDocuments = useMemo(() => smartAndRagDocuments.filter(document => (
    selectedFolder === ALL_FILTER || getTreeFolders(document, treePivotMode).includes(selectedFolder)
  )), [selectedFolder, smartAndRagDocuments, treePivotMode]);

  const facetOptions = useMemo(() => ({
    iparag: buildGraphFacetOptions(folderScopedDocuments.filter(document => (
      matchesGraphDimension(document, 'technologia', technology)
      && matchesGraphDimension(document, 'celcsoport', audience)
    )), 'iparag'),
    technology: buildGraphFacetOptions(folderScopedDocuments.filter(document => (
      matchesGraphDimension(document, 'iparag', iparag)
      && matchesGraphDimension(document, 'celcsoport', audience)
    )), 'technologia'),
    audience: buildGraphFacetOptions(folderScopedDocuments.filter(document => (
      matchesGraphDimension(document, 'iparag', iparag)
      && matchesGraphDimension(document, 'technologia', technology)
    )), 'celcsoport')
  }), [audience, folderScopedDocuments, iparag, technology]);

  useEffect(() => {
    if (iparag !== ALL_FILTER && !facetOptions.iparag.some(option => option.value === iparag)) setIparag(ALL_FILTER);
  }, [facetOptions.iparag, iparag]);
  useEffect(() => {
    if (technology !== ALL_FILTER && !facetOptions.technology.some(option => option.value === technology)) setTechnology(ALL_FILTER);
  }, [facetOptions.technology, technology]);
  useEffect(() => {
    if (audience !== ALL_FILTER && !facetOptions.audience.some(option => option.value === audience)) setAudience(ALL_FILTER);
  }, [audience, facetOptions.audience]);

  const documentsAfterFacets = useMemo(() => smartAndRagDocuments.filter(document => (
    matchesGraphDimension(document, 'iparag', iparag)
    && matchesGraphDimension(document, 'technologia', technology)
    && matchesGraphDimension(document, 'celcsoport', audience)
  )), [audience, iparag, smartAndRagDocuments, technology]);
  const folderEntries = useMemo(() => groupGraphDocumentsByFolder(documentsAfterFacets, treePivotMode), [documentsAfterFacets, treePivotMode]);
  const visibleDocuments = useMemo(() => documentsAfterFacets.filter(document => (
    selectedFolder === ALL_FILTER || getTreeFolders(document, treePivotMode).includes(selectedFolder)
  )), [documentsAfterFacets, selectedFolder, treePivotMode]);

  useEffect(() => {
    if (selectedFolder !== ALL_FILTER && !folderEntries.some(([folder]) => folder === selectedFolder)) setSelectedFolder(ALL_FILTER);
  }, [folderEntries, selectedFolder]);

  const smartCounts = useMemo(() => ['featured', 'audio', 'video', 'specs'].reduce((counts, filter) => ({
    ...counts,
    [filter]: sourceDocuments.filter(document => matchesSmartCollection(document, filter)).length
  }), {}), [sourceDocuments]);
  const ragTierCounts = useMemo(() => hasQuery
    ? getRagTierCounts(graphSearchResults)
    : { all: sourceDocuments.length, keyword: 0, semantic: 0, hybrid: 0 }, [graphSearchResults, hasQuery, sourceDocuments.length]);
  const visibleDocumentIds = useMemo(() => new Set(visibleDocuments.map(document => Number(document.id))), [visibleDocuments]);
  const visibleSearchResultIds = useMemo(() => new Set(visibleDocuments.map(document => Number(document.id))), [visibleDocuments]);
  const sortedVisibleDocuments = useMemo(() => [...visibleDocuments].sort(graphSorters[sortBy] || graphSorters.rag), [sortBy, visibleDocuments]);
  const activeSearchResults = useMemo(() => hasQuery ? sortedVisibleDocuments : [], [hasQuery, sortedVisibleDocuments]);
  const visibleGraphDocuments = useMemo(() => graphDocuments.filter(document => (
    visibleDocumentIds.has(Number(document.id))
  )), [graphDocuments, visibleDocumentIds]);
  const universeCanvas = useMemo(() => createUniverseCanvas(minimumNodeDistance), [minimumNodeDistance]);

  const archiveLayout = useMemo(() => buildArchiveGraphClusters(visibleGraphDocuments, {
    grouping: groupingMode,
    canvas: universeCanvas
  }), [groupingMode, universeCanvas, visibleGraphDocuments]);
  const layoutKey = useMemo(() => (
    viewMode === 'overview'
      ? `overview:${groupingMode}:space-${minimumNodeDistance}`
      : `focus:${rootSlug}:${depth}:space-${minimumNodeDistance}`
  ), [depth, groupingMode, minimumNodeDistance, rootSlug, viewMode]);
  const layoutNodes = useMemo(() => viewMode === 'overview'
    ? archiveLayout.nodes
    : focusGraphLayout(graphDocuments, graph?.root?.id, universeCanvas), [archiveLayout.nodes, graph?.root?.id, graphDocuments, universeCanvas, viewMode]);
  const clusters = useMemo(() => (
    viewMode === 'overview' ? archiveLayout.clusters : []
  ), [archiveLayout.clusters, viewMode]);
  const clustersByKey = useMemo(() => new Map(clusters.map(cluster => [cluster.key, cluster])), [clusters]);
  const layoutNodesById = useMemo(() => new Map(layoutNodes.map(node => [Number(node.id), node])), [layoutNodes]);
  const nodes = useMemo(() => resolveMinimumNodeSeparation(layoutNodes.map((node) => {
    const offset = getSavedOffset(nodePositionOffsets, nodeOffsetKey(layoutKey, node.id));
    const position = clampGraphNodePosition({ x: node.x + offset.dx, y: node.y + offset.dy }, node, universeCanvas);
    return { ...node, ...position };
  }), {
    minDistance: minimumNodeDistance,
    canvas: universeCanvas
  }), [layoutKey, layoutNodes, minimumNodeDistance, nodePositionOffsets, universeCanvas]);
  const membranes = useMemo(() => (
    viewMode === 'overview'
      ? buildElasticClusterMembranes(clusters, nodes, { canvas: universeCanvas, clearance: Math.max(26, Math.min(48, minimumNodeDistance * 0.3)) })
      : []
  ), [clusters, minimumNodeDistance, nodes, universeCanvas, viewMode]);
  const nodesById = useMemo(() => new Map(nodes.map(node => [Number(node.id), node])), [nodes]);
  const activeGroupingOption = useMemo(() => (
    GRAPH_GROUPING_OPTIONS.find(option => option.id === archiveLayout.grouping) || GRAPH_GROUPING_OPTIONS[0]
  ), [archiveLayout.grouping]);
  const activeCluster = useMemo(() => (
    clusters.find(cluster => cluster.key === activeClusterKey) || null
  ), [activeClusterKey, clusters]);
  const displayedNodeIds = useMemo(() => new Set(nodes
    .filter(node => !activeCluster || node.primaryGroupKey === activeCluster.key)
    .map(node => Number(node.id))), [activeCluster, nodes]);
  const displayedGraphDocuments = useMemo(() => nodes.filter(node => (
    displayedNodeIds.has(Number(node.id))
  )), [displayedNodeIds, nodes]);
  const graphEdges = useMemo(() => (graph?.edges || []).filter(edge => (
    nodesById.has(Number(edge.source_post_id)) && nodesById.has(Number(edge.target_post_id))
  )), [graph?.edges, nodesById]);
  const displayedEdges = useMemo(() => graphEdges.filter(edge => (
    displayedNodeIds.has(Number(edge.source_post_id)) && displayedNodeIds.has(Number(edge.target_post_id))
  )), [displayedNodeIds, graphEdges]);
  const selectedNode = nodesById.get(Number(selectedId)) || null;
  const selectedConnections = selectedNode
    ? displayedEdges.filter(edge => Number(edge.source_post_id) === Number(selectedNode.id) || Number(edge.target_post_id) === Number(selectedNode.id))
    : [];
  const linkedNodeIdsById = useMemo(() => {
    const links = new Map();
    displayedEdges.forEach((edge) => {
      const sourceId = Number(edge.source_post_id);
      const targetId = Number(edge.target_post_id);
      const sourceLinks = links.get(sourceId) || new Set();
      const targetLinks = links.get(targetId) || new Set();
      sourceLinks.add(targetId);
      targetLinks.add(sourceId);
      links.set(sourceId, sourceLinks);
      links.set(targetId, targetLinks);
    });
    return links;
  }, [displayedEdges]);
  const draggingLinkedNodeIds = useMemo(() => (
    draggingNodeId === null ? new Set() : (linkedNodeIdsById.get(Number(draggingNodeId)) || new Set())
  ), [draggingNodeId, linkedNodeIdsById]);
  const hasCustomNodeLayout = useMemo(() => (
    Object.keys(nodePositionOffsets).some(key => key.startsWith(`${layoutKey}:`))
  ), [layoutKey, nodePositionOffsets]);
  const membraneTransition = prefersReducedMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 150, damping: 19, mass: 0.48 };

  useEffect(() => {
    if (activeClusterKey !== ALL_FILTER && !clusters.some(cluster => cluster.key === activeClusterKey)) {
      setActiveClusterKey(ALL_FILTER);
    }
  }, [activeClusterKey, clusters]);
  useEffect(() => {
    if (selectedId !== null && !displayedNodeIds.has(Number(selectedId))) setSelectedId(null);
  }, [displayedNodeIds, selectedId]);
  useEffect(() => {
    setSearchResultIndex(index => Math.max(0, Math.min(index, activeSearchResults.length - 1)));
  }, [activeSearchResults.length]);
  useEffect(() => {
    dragStateRef.current = null;
    setDraggingNodeId(null);
  }, [layoutKey]);
  useEffect(() => {
    panStateRef.current = null;
    setGraphViewport(current => (
      current.zoom === 1 && current.panX === 0 && current.panY === 0 ? current : defaultViewport()
    ));
  }, [minimumNodeDistance]);

  const rawCanvasPointFromEvent = (event) => {
    const rect = svgRef.current?.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return { x: event.clientX, y: event.clientY };
    return {
      x: ((event.clientX - rect.left) / rect.width) * universeCanvas.width,
      y: ((event.clientY - rect.top) / rect.height) * universeCanvas.height
    };
  };
  const graphPointFromEvent = (event) => {
    const point = rawCanvasPointFromEvent(event);
    return {
      x: (point.x - graphViewport.panX) / graphViewport.zoom,
      y: (point.y - graphViewport.panY) / graphViewport.zoom
    };
  };
  const constrainNodePosition = (node, position) => clampGraphNodePosition(position, node, universeCanvas);
  const storeNodePosition = (offsets, node, position) => {
    const constrained = constrainNodePosition(node, position);
    const dx = roundPosition(constrained.x - node.x);
    const dy = roundPosition(constrained.y - node.y);
    const key = nodeOffsetKey(layoutKey, node.id);
    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) delete offsets[key];
    else offsets[key] = { dx, dy };
    return constrained;
  };
  const setZoomAt = (requestedZoom, rawAnchor = { x: universeCanvas.centerX, y: universeCanvas.centerY }) => {
    setGraphViewport((current) => {
      const zoom = roundPosition(clamp(requestedZoom, MIN_GRAPH_ZOOM, MAX_GRAPH_ZOOM));
      if (zoom === current.zoom) return current;
      const graphAnchor = {
        x: (rawAnchor.x - current.panX) / current.zoom,
        y: (rawAnchor.y - current.panY) / current.zoom
      };
      return {
        zoom,
        panX: roundPosition(rawAnchor.x - (graphAnchor.x * zoom)),
        panY: roundPosition(rawAnchor.y - (graphAnchor.y * zoom))
      };
    });
  };
  const resetGraphViewport = () => setGraphViewport(defaultViewport());
  const handleCanvasWheel = (event) => {
    if (!event.shiftKey) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    setZoomAt(graphViewport.zoom + (direction * GRAPH_ZOOM_STEP), rawCanvasPointFromEvent(event));
  };
  const handleCanvasPointerDown = (event) => {
    if (event.target?.closest?.('[role="button"]') || (event.button !== undefined && event.button !== 0)) return;
    onGraphCanvasPointerDown?.();
    const point = rawCanvasPointFromEvent(event);
    panStateRef.current = {
      pointerId: event.pointerId,
      startPoint: point,
      startViewport: graphViewport,
      captureTarget: event.currentTarget
    };
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture only makes background panning more forgiving.
    }
  };
  const handleCanvasPointerMove = (event) => {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const point = rawCanvasPointFromEvent(event);
    event.preventDefault();
    setGraphViewport(current => ({
      ...current,
      panX: roundPosition(pan.startViewport.panX + point.x - pan.startPoint.x),
      panY: roundPosition(pan.startViewport.panY + point.y - pan.startPoint.y)
    }));
  };
  const finishCanvasPan = (event) => {
    const pan = panStateRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    try {
      pan.captureTarget?.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser can release the pointer before the cancellation event.
    }
    panStateRef.current = null;
  };
  const handleNodePointerDown = (node, event) => {
    if (!displayedNodeIds.has(Number(node.id)) || (event.button !== undefined && event.button !== 0)) return;
    const point = graphPointFromEvent(event);
    dragStateRef.current = {
      nodeId: Number(node.id),
      pointerId: event.pointerId,
      startPoint: point,
      lastPoint: point,
      moved: false
    };
    try {
      event.currentTarget?.setPointerCapture?.(event.pointerId);
    } catch {
      // A fogás a Pointer Events nélkül is működik, csak a csomóponton belül marad.
    }
  };
  const handleNodePointerMove = (node, event) => {
    const drag = dragStateRef.current;
    if (!drag || drag.nodeId !== Number(node.id) || drag.pointerId !== event.pointerId) return;
    const point = graphPointFromEvent(event);
    const distanceFromStart = Math.hypot(point.x - drag.startPoint.x, point.y - drag.startPoint.y);
    if (!drag.moved && distanceFromStart < DRAG_THRESHOLD) return;

    event.preventDefault();
    drag.moved = true;
    drag.lastPoint = point;
    setDraggingNodeId(Number(node.id));
    setNodePositionOffsets((currentOffsets) => {
      const baseNode = layoutNodesById.get(Number(node.id));
      const currentNodes = resolveMinimumNodeSeparation(layoutNodes.map((layoutNode) => {
        const offset = getSavedOffset(currentOffsets, nodeOffsetKey(layoutKey, layoutNode.id));
        const position = constrainNodePosition(layoutNode, { x: layoutNode.x + offset.dx, y: layoutNode.y + offset.dy });
        return { ...layoutNode, ...position };
      }), { minDistance: minimumNodeDistance, canvas: universeCanvas });
      const currentNodesById = new Map(currentNodes.map(currentNode => [Number(currentNode.id), currentNode]));
      const previousPosition = currentNodesById.get(Number(node.id));
      if (!baseNode || !previousPosition) return currentOffsets;

      const nextOffsets = { ...currentOffsets };
      const previousDraggedPosition = { x: previousPosition.x, y: previousPosition.y };
      const draggedPosition = constrainNodePosition(baseNode, point);
      Object.assign(previousPosition, draggedPosition);
      const dragDelta = {
        x: draggedPosition.x - previousDraggedPosition.x,
        y: draggedPosition.y - previousDraggedPosition.y
      };
      if (Math.abs(dragDelta.x) < 0.1 && Math.abs(dragDelta.y) < 0.1) return nextOffsets;

      const directNeighbours = linkedNodeIdsById.get(Number(node.id)) || new Set();
      const followStrengths = new Map();
      directNeighbours.forEach((relatedId) => {
        followStrengths.set(relatedId, DIRECT_LINK_FOLLOW_STRENGTH);
        (linkedNodeIdsById.get(relatedId) || new Set()).forEach((secondaryId) => {
          if (secondaryId !== Number(node.id) && !followStrengths.has(secondaryId)) {
            followStrengths.set(secondaryId, INDIRECT_LINK_FOLLOW_STRENGTH);
          }
        });
      });

      followStrengths.forEach((strength, relatedId) => {
        const relatedBaseNode = layoutNodesById.get(Number(relatedId));
        const previousRelatedPosition = currentNodesById.get(Number(relatedId));
        if (!relatedBaseNode || !previousRelatedPosition) return;

        let nextPosition = {
          x: previousRelatedPosition.x + (dragDelta.x * strength),
          y: previousRelatedPosition.y + (dragDelta.y * strength)
        };

        if (strength === DIRECT_LINK_FOLLOW_STRENGTH) {
          const restDistance = Math.hypot(baseNode.x - relatedBaseNode.x, baseNode.y - relatedBaseNode.y);
          const currentDistance = Math.hypot(draggedPosition.x - nextPosition.x, draggedPosition.y - nextPosition.y);
          const extension = Math.max(0, currentDistance - restDistance);
          if (currentDistance > 0 && extension > 0) {
            const pull = Math.min(MAX_MAGNETIC_PULL, extension * 0.14);
            nextPosition = {
              x: nextPosition.x + (((draggedPosition.x - nextPosition.x) / currentDistance) * pull),
              y: nextPosition.y + (((draggedPosition.y - nextPosition.y) / currentDistance) * pull)
            };
          }
        }

        Object.assign(previousRelatedPosition, constrainNodePosition(relatedBaseNode, nextPosition));
      });

      resolveMinimumNodeSeparation(currentNodes, {
        minDistance: minimumNodeDistance,
        canvas: universeCanvas,
        pinnedNodeId: node.id,
        iterations: 7
      }).forEach((resolvedNode) => {
        const layoutNode = layoutNodesById.get(Number(resolvedNode.id));
        if (layoutNode) storeNodePosition(nextOffsets, layoutNode, resolvedNode);
      });

      return nextOffsets;
    });
  };
  const finishNodeDrag = (node, event, cancelled = false) => {
    const drag = dragStateRef.current;
    if (!drag || drag.nodeId !== Number(node.id) || drag.pointerId !== event.pointerId) return;
    try {
      event.currentTarget?.releasePointerCapture?.(event.pointerId);
    } catch {
      // A böngésző már elengedte a mutatót.
    }
    dragStateRef.current = null;
    setDraggingNodeId(null);
    if (!cancelled && drag.moved) {
      suppressNodeClickRef.current = true;
      setDragAnnouncement(`${shortLabel(node.title)} áthelyezve. A kapcsolódó pontok, a minimális ${minimumNodeDistance} egységes térköz és a halmazmembrán együtt követték.`);
      window.setTimeout(() => { suppressNodeClickRef.current = false; }, 250);
    }
  };
  const handleNodeClick = (node, event) => {
    if (suppressNodeClickRef.current) {
      suppressNodeClickRef.current = false;
      return;
    }
    selectNode(node, event);
  };

  const selectNode = (node, event) => {
    if (!displayedNodeIds.has(Number(node.id))) return;
    setSelectedId(node.id);
    onGraphNodeSelect?.(node, event);
  };
  const focusNode = (node = selectedNode) => {
    if (!node) return;
    setRootSlug(node.slug);
    setSelectedId(node.id);
    setViewMode('focus');
  };
  const showArchive = () => setViewMode('overview');
  const resetToHub = () => {
    setViewMode('overview');
    setSelectedId(null);
    setSearchQuery('');
    setSearchScope('all');
    setRagTier('all');
    setTreePivotMode('drive');
    setSelectedFolder(ALL_FILTER);
    setSmartFilters([]);
    setIparag(ALL_FILTER);
    setTechnology(ALL_FILTER);
    setAudience(ALL_FILTER);
    setSortBy('rag');
    setGroupingMode('content_type');
    setActiveClusterKey(ALL_FILTER);
  };
  const resetNodeLayout = () => {
    const layoutPrefix = `${layoutKey}:`;
    setNodePositionOffsets(currentOffsets => Object.fromEntries(
      Object.entries(currentOffsets).filter(([key]) => !key.startsWith(layoutPrefix))
    ));
    setDragAnnouncement('Az automatikus csomópont-elrendezés visszaállítva.');
  };
  const openNode = (node = selectedNode) => {
    if (!node || !onSelectDoc) return;
    const query = searchQuery.trim();
    if (query) onSelectDoc(node.slug, node, query);
    else onSelectDoc(node.slug, node);
  };
  const selectSearchResult = (result) => {
    showArchive();
    selectNode(result);
  };
  const stepSearchResult = (offset) => {
    if (!activeSearchResults.length) return;
    const nextIndex = (searchResultIndex + offset + activeSearchResults.length) % activeSearchResults.length;
    setSearchResultIndex(nextIndex);
    selectSearchResult(activeSearchResults[nextIndex]);
  };
  const handleSearchKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const result = activeSearchResults[searchResultIndex] || activeSearchResults[0];
      if (result) focusNode(result);
    }
    if (event.key === 'Escape') {
      setSearchQuery('');
      setSearchResultIndex(0);
    }
  };
  const toggleSmartFilter = (filter) => setSmartFilters(current => (
    current.includes(filter) ? current.filter(item => item !== filter) : [...current, filter]
  ));
  const setPivot = (pivot) => { setTreePivotMode(pivot); setSelectedFolder(ALL_FILTER); };
  const searchMessage = !hasQuery
    ? 'CIKK KERESŐ KÉSZENLÉTBEN'
    : searchStatus === 'loading'
      ? 'RAG KERESÉS FOLYAMATBAN'
      : searchStatus === 'error'
        ? 'A KERESŐ MOST NEM ELÉRHETŐ'
        : `${activeSearchResults.length}/${searchResults.length} TALÁLAT A NYILVÁNOS GRÁFBAN`;
  const searchConsole = <GraphRagFilterConsole
    searchQuery={searchQuery}
    searchStatus={searchStatus}
    resultIndex={searchResultIndex}
    searchResultCount={activeSearchResults.length}
    onSearchQueryChange={(value) => { setSearchQuery(value); setSearchResultIndex(0); }}
    onSearchKeyDown={handleSearchKeyDown}
    onClearSearch={() => { setSearchQuery(''); setSearchResultIndex(0); }}
    onStepResult={stepSearchResult}
    searchScope={searchScope}
    onSearchScopeChange={(value) => { setSearchScope(value); setSearchResultIndex(0); }}
    corpusCounts={corpusCounts}
    ragTier={ragTier}
    onRagTierChange={setRagTier}
    ragTierCounts={ragTierCounts}
    iparag={iparag}
    onIparagChange={setIparag}
    technology={technology}
    onTechnologyChange={setTechnology}
    audience={audience}
    onAudienceChange={setAudience}
    sortBy={sortBy}
    onSortByChange={setSortBy}
    facetOptions={facetOptions}
    visibleDocumentCount={visibleDocuments.length}
    totalDocumentCount={availableDocs.length}
    compact={workspaceMode}
    expanded={workspaceMode ? workspaceSearchExpanded : filterConsoleExpanded}
    onExpandedChange={() => workspaceMode ? onWorkspaceSearchExpandedChange?.(!workspaceSearchExpanded) : setFilterConsoleExpanded(current => !current)}
  />;

  return (
    <section className={`relative overflow-hidden bg-[#050814] ${workspaceMode ? 'flex h-full min-h-0 flex-col border-0 shadow-none' : 'mb-10 border border-neonCyan/35 shadow-[0_0_0_1px_rgba(0,251,251,0.06),0_0_42px_rgba(0,0,0,0.44)]'}`} aria-labelledby={workspaceMode ? undefined : 'public-knowledge-graph-title'}>
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(0,251,251,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(0,251,251,0.035)_1px,transparent_1px)] [background-size:32px_32px]" />
      {!workspaceMode && <header className="relative border-b border-neonCyan/25 bg-[#08111f]/95 px-4 py-5 sm:px-6 lg:flex lg:items-end lg:justify-between lg:gap-10">
        <div className="max-w-3xl">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-black tracking-[0.2em] text-neonCyan"><Network size={14} /><span>KNOWLEDGE_MESH // PUBLIC_WIKILINK_TOPOLOGY</span></div>
          <h2 id="public-knowledge-graph-title" className="font-headline text-2xl font-black uppercase italic tracking-tight text-on-surface sm:text-3xl">Tudástár <span className="text-neonMagenta">+</span> Blog <span className="text-neonCyan">archívum</span></h2>
          <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-slate-400">A teljes publikus cikkarchívum egy nézetben. A vonalak kizárólag valódi Markdown wikilink-kapcsolatokat jelölnek.</p>
        </div>
        <div className="mt-5 grid grid-cols-3 border border-white/10 font-mono lg:mt-0">
          <div className="min-w-24 border-r border-white/10 px-3 py-2.5"><span className="block text-[8px] font-bold tracking-[0.14em] text-slate-500">ÖSSZES CIKK</span><strong className="mt-1 block text-lg leading-none text-white">{availableDocs.length}</strong></div>
          <div className="min-w-24 border-r border-white/10 px-3 py-2.5"><span className="block text-[8px] font-bold tracking-[0.14em] text-slate-500">TUDÁSTÁR</span><strong className="mt-1 block text-lg leading-none text-neonCyan">{knowledgeCount}</strong></div>
          <div className="min-w-24 px-3 py-2.5"><span className="block text-[8px] font-bold tracking-[0.14em] text-slate-500">CIKK</span><strong className="mt-1 block text-lg leading-none text-neonMagenta">{blogCount}</strong></div>
        </div>
      </header>}

      {!workspaceMode && <div>{searchConsole}</div>}
      {workspaceMode && workspaceSearchHost && createPortal(<div className="graph-search-panel-host__portal">{searchConsole}</div>, workspaceSearchHost)}
      {workspaceMode && workspaceSearchOpen && !workspaceSearchHost && <div data-testid="graph-workspace-search-popover" className="graph-workspace-search-popover is-open">{searchConsole}</div>}

      <div className={`relative ${workspaceMode ? 'flex min-h-0 flex-1 flex-col' : 'grid xl:grid-cols-[20rem_minmax(0,1fr)_19rem]'}`}>
        {!workspaceMode && <GraphNavigatorSidebar
          folderEntries={folderEntries}
          selectedFolder={selectedFolder}
          onFolderSelect={setSelectedFolder}
          pivotMode={treePivotMode}
          onPivotModeChange={setPivot}
          smartFilters={smartFilters}
          onToggleSmartFilter={toggleSmartFilter}
          onClearSmartFilters={() => setSmartFilters([])}
          smartCounts={smartCounts}
          documents={sortedVisibleDocuments}
          selectedId={selectedId}
          onSelectDocument={selectSearchResult}
          onShowArchive={resetToHub}
          totalDocuments={availableDocs.length}
        />}

        <div className={`relative min-w-0 ${workspaceMode ? 'flex min-h-0 flex-1 flex-col' : 'order-1 xl:order-2'}`}>
          {!workspaceMode && <div className="graph-model-view-toolbar flex flex-col gap-3 border-b border-white/10 bg-[#08101c]/92 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="graph-model-view-toolbar__identity">
              <div className="flex items-center gap-2 font-mono text-[10px] font-black tracking-[0.15em] text-slate-300"><GitFork size={13} className="text-neonCyan" />{workspaceMode ? 'XYFLOW // MODELTÉR' : viewMode === 'overview' ? 'TELJES ARCHÍVUM HÁLÓ' : 'KAPCSOLATI FÓKUSZ'}</div>
              <p className="mt-1 font-mono text-[9px] text-slate-500">{viewMode === 'overview' ? `HALMAZOSÍTVA: ${activeGroupingOption.label} // ${activeGroupingOption.detail}` : `KIINDULÓ CIKK: ${shortLabel(graph?.root?.title || rootSlug, 42)}`}</p>
            </div>
            <div className="graph-model-view-toolbar__actions flex flex-wrap gap-2">
              {viewMode === 'overview' && <label className="inline-flex min-h-10 items-center gap-2 border border-neonMagenta/45 bg-neonMagenta/[0.04] px-2.5 font-mono text-[9px] font-black tracking-[0.1em] text-neonMagenta">
                <Layers size={13} aria-hidden="true" /> HALMAZOSÍTÁS
                <select
                  value={groupingMode}
                  onChange={(event) => { setGroupingMode(event.target.value); setActiveClusterKey(ALL_FILTER); }}
                  className="min-h-7 bg-transparent text-[10px] font-black text-white outline-none"
                  aria-label="Halmazosítás szerint"
                  data-testid="graph-grouping-control"
                >
                  {GRAPH_GROUPING_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>}
              <button type="button" onClick={resetNodeLayout} disabled={!hasCustomNodeLayout} data-testid="graph-reset-layout" className="inline-flex min-h-10 items-center gap-2 border border-plasmaGreen/45 px-3 font-mono text-[9px] font-black tracking-[0.12em] text-plasmaGreen transition-colors hover:bg-plasmaGreen hover:text-slate-950 disabled:cursor-default disabled:opacity-40" title="A jelenlegi nézet automatikus elrendezésének visszaállítása"><RotateCcw size={13} /> RENDEZÉS VISSZA</button>
              <button type="button" onClick={showArchive} disabled={viewMode === 'overview'} className="inline-flex min-h-10 items-center gap-2 border border-neonCyan/45 px-3 font-mono text-[9px] font-black tracking-[0.12em] text-neonCyan transition-colors hover:bg-neonCyan hover:text-slate-950 disabled:cursor-default disabled:opacity-40"><Layers size={13} /> TELJES HÁLÓ</button>
              {viewMode === 'focus' && <label className="inline-flex min-h-10 items-center gap-2 border border-white/15 px-2 font-mono text-[9px] font-bold text-slate-400"><SlidersHorizontal size={12} /> MÉLYSÉG <select value={depth} onChange={event => setDepth(Number(event.target.value))} className="bg-transparent text-xs font-bold text-white outline-none" aria-label="Fókuszált gráf mélysége"><option value="1">1</option><option value="2">2</option></select></label>}
            </div>
          </div>}
          {!workspaceMode && <div data-testid="graph-universe-controls" className="graph-universe-controls border-b border-cyan-200/10 bg-[#050d18]/96 px-4 py-3">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="shrink-0 font-mono text-[9px] font-black tracking-[0.16em] text-neonCyan"><SlidersHorizontal className="mr-1.5 inline-block" size={12} aria-hidden="true" />UNIVERZUM NÉZET <span className="ml-1 text-slate-500">// TÉR, CÍMKÉK, NAGYÍTÁS</span></div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <label className="flex min-h-8 items-center gap-2 font-mono text-[8px] font-black tracking-[0.1em] text-slate-400">
                  <span>MIN. PONTTÁV</span>
                  <input
                    type="range"
                    min={MIN_NODE_DISTANCE}
                    max={MAX_NODE_DISTANCE}
                    step="4"
                    value={minimumNodeDistance}
                    onChange={event => setMinimumNodeDistance(Number(event.target.value))}
                    aria-label="Csomópontok minimális távolsága"
                    data-testid="graph-node-spacing-control"
                    className="h-1.5 w-24 cursor-ew-resize accent-neonCyan sm:w-32"
                  />
                  <output className="min-w-10 border border-neonCyan/30 bg-neonCyan/[0.06] px-1.5 py-1 text-center text-neonCyan">{minimumNodeDistance}</output>
                </label>
                <label className="flex min-h-8 items-center gap-2 font-mono text-[8px] font-black tracking-[0.1em] text-slate-400">
                  <span>CÍMKÉK</span>
                  <select value={nodeLabelMode} onChange={event => setNodeLabelMode(event.target.value)} aria-label="Csomópontcímkék megjelenítése" data-testid="graph-label-mode-control" className="min-h-8 border border-white/15 bg-[#08111f] px-1.5 text-[9px] font-black text-slate-200 outline-none">
                    <option value="context">KONTEXTUS</option>
                    <option value="selected">KIJELÖLT / FÓKUSZ</option>
                    <option value="all">MINDEN PONT</option>
                    <option value="hidden">REJTETT</option>
                  </select>
                </label>
                <label className="flex min-h-8 cursor-pointer items-center gap-1.5 font-mono text-[8px] font-black tracking-[0.08em] text-slate-400">
                  <input type="checkbox" checked={showClusterLabels} onChange={event => setShowClusterLabels(event.target.checked)} aria-label="Halmazcímkék megjelenítése" className="h-3 w-3 accent-neonMagenta" /> HALMAZOK
                </label>
                <div className="flex min-h-8 items-center border border-white/15 bg-[#07101c] font-mono text-[9px] font-black">
                  <button type="button" aria-label="Kicsinyítés" title="Kicsinyítés" onClick={() => setZoomAt(graphViewport.zoom - GRAPH_ZOOM_STEP)} className="grid h-8 w-8 place-items-center text-slate-300 transition-colors hover:bg-white hover:text-slate-950"><ZoomOut size={13} /></button>
                  <label className="sr-only" htmlFor="graph-zoom-control">Gráf nagyítása</label>
                  <input id="graph-zoom-control" type="range" min={MIN_GRAPH_ZOOM} max={MAX_GRAPH_ZOOM} step={GRAPH_ZOOM_STEP} value={graphViewport.zoom} onChange={event => setZoomAt(Number(event.target.value))} aria-label="Gráf nagyítása" data-testid="graph-zoom-control" className="h-1.5 w-16 cursor-ew-resize accent-neonMagenta sm:w-20" />
                  <output data-testid="graph-zoom-value" className="min-w-11 px-1 text-center text-neonMagenta">{Math.round(graphViewport.zoom * 100)}%</output>
                  <button type="button" aria-label="Nagyítás" title="Nagyítás" onClick={() => setZoomAt(graphViewport.zoom + GRAPH_ZOOM_STEP)} className="grid h-8 w-8 place-items-center text-slate-300 transition-colors hover:bg-white hover:text-slate-950"><ZoomIn size={13} /></button>
                  <button type="button" aria-label="Nézet illesztése" onClick={resetGraphViewport} className="border-l border-white/15 px-2 text-[8px] tracking-[0.08em] text-plasmaGreen transition-colors hover:bg-plasmaGreen hover:text-slate-950">ILLESZTÉS</button>
                </div>
              </div>
            </div>
            <p className="mt-2 font-mono text-[8px] font-bold tracking-[0.08em] text-slate-600">HÚZÁSKOR A PONTOK A BEÁLLÍTOTT MINIMUMNÁL KÖZELEBB NEM KERÜLHETNEK. SHIFT + GÖRGŐVEL NAGYÍTHATSZ; ÜRES HÁTTÉR HÚZÁSÁVAL MOZGATHATOD A NÉZETET.</p>
          </div>}
          {!workspaceMode && viewMode === 'overview' && status === 'ready' && clusters.length > 0 && <div className="graph-cluster-controls border-b border-white/10 bg-[#060d18]/90 px-4 py-3" data-testid="graph-cluster-controls">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-mono text-[9px] font-black tracking-[0.14em] text-slate-500"><span className="text-neonCyan">HALMAZ INDEX</span> // KATTINTS EGY HALMAZRA A RÉSZGRÁFHOZ <span className="hidden text-neonMagenta lg:inline">// +N: TOVÁBBI TAGSÁG</span></div>
              <span className="font-mono text-[9px] font-bold text-slate-500">{activeCluster ? `${activeCluster.label} AKTÍV` : `${clusters.length} HALMAZ ELÉRHETŐ`}</span>
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Gráfhalmazok">
              <button
                type="button"
                onClick={() => setActiveClusterKey(ALL_FILTER)}
                aria-pressed={!activeCluster}
                className={`shrink-0 border px-2.5 py-2 font-mono text-[9px] font-black tracking-[0.08em] transition-colors ${!activeCluster ? 'border-white bg-white text-slate-950' : 'border-white/20 bg-slate-950/60 text-slate-400 hover:border-white/60 hover:text-white'}`}
              >
                ÖSSZES ({visibleGraphDocuments.length})
              </button>
              {clusters.map(cluster => {
                const selected = activeCluster?.key === cluster.key;
                return <button
                  key={cluster.id}
                  type="button"
                  onClick={() => setActiveClusterKey(selected ? ALL_FILTER : cluster.key)}
                  aria-pressed={selected}
                  title={cluster.label}
                  style={selected ? { borderColor: cluster.color, backgroundColor: `${cluster.color}22`, color: cluster.color } : { borderColor: `${cluster.color}66` }}
                  className={`shrink-0 border px-2.5 py-2 font-mono text-[9px] font-black tracking-[0.08em] transition-colors ${selected ? '' : 'bg-slate-950/60 text-slate-300 hover:bg-slate-900'}`}
                >
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 align-middle" style={{ backgroundColor: cluster.color }} />{cluster.displayLabel} ({cluster.count})
                </button>;
              })}
            </div>
          </div>}
          <div className={`graph-model-canvas relative overflow-hidden bg-[#040a13] p-3 sm:p-5 ${workspaceMode ? 'min-h-0 flex-1' : 'min-h-[31rem]'}`}>
            <div className="knowledge-galaxy" aria-hidden="true">
              <span className="knowledge-galaxy__stars" />
              <span className="knowledge-galaxy__nebula knowledge-galaxy__nebula--cyan" />
              <span className="knowledge-galaxy__nebula knowledge-galaxy__nebula--magenta" />
              <span className="knowledge-galaxy__nebula knowledge-galaxy__nebula--green" />
            </div>
            <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(0,251,251,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(0,251,251,0.075)_1px,transparent_1px)] [background-size:28px_28px]" />
            {workspaceMode && <GraphNavigationCube
              viewMode={viewMode}
              status={status}
              groupingMode={groupingMode}
              onGroupingModeChange={mode => { setGroupingMode(mode); setActiveClusterKey(ALL_FILTER); }}
              activeGroupingOption={activeGroupingOption}
              depth={depth}
              onDepthChange={setDepth}
              hasCustomNodeLayout={hasCustomNodeLayout}
              onResetNodeLayout={resetNodeLayout}
              onShowArchive={showArchive}
              minimumNodeDistance={minimumNodeDistance}
              onMinimumNodeDistanceChange={setMinimumNodeDistance}
              nodeLabelMode={nodeLabelMode}
              onNodeLabelModeChange={setNodeLabelMode}
              showClusterLabels={showClusterLabels}
              onShowClusterLabelsChange={setShowClusterLabels}
              graphViewport={graphViewport}
              onZoomChange={setZoomAt}
              onFitView={resetGraphViewport}
              clusters={clusters}
              activeCluster={activeCluster}
              visibleGraphDocuments={visibleGraphDocuments}
              onClusterChange={setActiveClusterKey}
              onOpenWorkspacePanel={onOpenWorkspacePanel}
              onOpenSearch={() => onWorkspaceSearchOpenChange?.(true)}
              isAdminPreview={isAdminPreview}
            />}
            {workspaceMode && <GraphInfoPanel
              displayedCount={displayedGraphDocuments.length}
              totalCount={visibleGraphDocuments.length}
              edgeCount={displayedEdges.length}
              viewLabel={viewMode === 'overview' ? activeGroupingOption.label : 'FÓKUSZ'}
              searchActive={hasQuery}
            />}
            <div className="pointer-events-none absolute inset-x-4 top-4 z-20 flex justify-between font-mono text-[8px] font-bold tracking-[0.18em] text-neonCyan/45"><span>0x00 / ARCHIVE_LINKS</span><span>{viewMode === 'overview' ? `${activeGroupingOption.label} // SET_VIEW` : 'FOCUS'}</span></div>
            {status === 'loading' && <div className="relative flex min-h-[27rem] items-center justify-center gap-3 font-mono text-xs font-bold uppercase tracking-widest text-neonCyan"><RefreshCw size={18} className="animate-spin" /> GRÁF INDEX BETÖLTÉSE</div>}
            {status === 'empty' && <div className="relative flex min-h-[27rem] flex-col items-center justify-center gap-3 text-center font-mono"><Route size={34} className="text-neonMagenta" /><strong className="text-sm uppercase text-white">Ehhez a nézethez még nincs publikus gráf-adat.</strong><p className="max-w-lg text-xs leading-relaxed text-slate-400">A cikkek megjelennek, amint publikusak és RAG-indexeltek; élekhez adj hozzá valódi <code>[[hivatkozás]]</code> kapcsolatokat.</p></div>}
            {status === 'error' && <div className={`relative flex items-center justify-center font-mono text-xs font-bold uppercase tracking-widest text-neonMagenta ${workspaceMode ? 'min-h-0 h-full' : 'min-h-[27rem]'}`}>A GRÁF MOST NEM ELÉRHETŐ</div>}
            {status === 'ready' && <>
              {!visibleGraphDocuments.length && <div className="absolute inset-0 z-10 grid place-items-center p-8 text-center"><div className="border border-neonMagenta/50 bg-[#07101d]/95 p-4 font-mono"><strong className="text-sm text-neonMagenta">NINCS A SZŰRÉSNEK MEGFELELŐ CIKK</strong><p className="mt-2 text-[10px] leading-relaxed text-slate-400">Módosítsd a felső RAG-szűrőket vagy válts mappát a bal oldali navigátorban.</p></div></div>}
               <div className={`relative z-10 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] ${workspaceMode ? 'h-full' : ''}`}>
               <svg ref={svgRef} data-testid="graph-canvas" className={`relative min-w-[720px] w-full cursor-grab active:cursor-grabbing sm:min-w-0 ${workspaceMode ? 'h-full min-h-0' : 'h-[29rem]'}`} viewBox={`0 0 ${universeCanvas.width} ${universeCanvas.height}`} role="group" aria-label={`Publikus Tudástár és Blog gráf, ${viewMode === 'overview' ? `${activeGroupingOption.label} szerint halmazosítva` : 'kapcsolati fókuszban'}`} style={{ touchAction: 'pan-y' }} onWheel={handleCanvasWheel} onPointerDown={handleCanvasPointerDown} onPointerMove={handleCanvasPointerMove} onPointerUp={finishCanvasPan} onPointerCancel={finishCanvasPan}>
                <defs>
                  <marker id={`${markerId}-arrow`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#4fced0" /></marker>
                  <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
                  {clusters.map(cluster => <radialGradient key={cluster.id} id={`${markerId}-${cluster.id}-nebula`} cx="50%" cy="50%" r="72%"><stop offset="0%" stopColor={cluster.color} stopOpacity="0.22" /><stop offset="54%" stopColor={cluster.color} stopOpacity="0.075" /><stop offset="100%" stopColor={cluster.color} stopOpacity="0" /></radialGradient>)}
                </defs>
                <g data-testid="graph-viewport" data-zoom={graphViewport.zoom} transform={`translate(${graphViewport.panX} ${graphViewport.panY}) scale(${graphViewport.zoom})`}>
                <rect data-graph-pan-surface="true" data-testid="graph-pan-surface" x="0" y="0" width={universeCanvas.width} height={universeCanvas.height} fill="transparent" />
                {viewMode === 'overview' && membranes.map(({ cluster, path, innerPath, labelX, labelY, bounds, safePadding }, index) => {
                  const selected = activeCluster?.key === cluster.key;
                  const muted = Boolean(activeCluster && !selected);
                  const labelWidth = Math.min(246, Math.max(112, (cluster.displayLabel.length * 6.5) + 42));
                  const dashPattern = index % 3 === 0 ? '8 7' : index % 3 === 1 ? '3 5' : '12 5 2 5';
                  return <g key={cluster.id} data-testid="graph-cluster-boundary" data-cluster-key={cluster.key} data-membrane-min-x={bounds.minX} data-membrane-max-x={bounds.maxX} data-membrane-min-y={bounds.minY} data-membrane-max-y={bounds.maxY} data-safe-padding={safePadding} aria-hidden="true" opacity={muted ? 0.16 : 1}>
                    <motion.path d={path} animate={{ d: path }} initial={false} transition={membraneTransition} fill={`url(#${markerId}-${cluster.id}-nebula)`} />
                    <motion.path data-testid={`graph-cluster-membrane-${cluster.id}`} className="knowledge-cluster-boundary knowledge-cluster-membrane" style={{ color: cluster.color }} d={path} animate={{ d: path }} initial={false} transition={membraneTransition} fill="none" stroke={cluster.color} strokeOpacity={selected ? 0.9 : 0.66} strokeWidth={selected ? 2 : 1.35} strokeDasharray={dashPattern} />
                    <motion.path d={innerPath} animate={{ d: innerPath }} initial={false} transition={membraneTransition} fill="none" stroke={cluster.color} strokeOpacity="0.2" strokeWidth="0.8" strokeDasharray="2 5" />
                    {showClusterLabels && <g transform={`translate(${labelX}, ${labelY})`}>
                      <rect x={-labelWidth / 2} y="-13" width={labelWidth} height="29" fill="#050b15" fillOpacity="0.9" stroke={cluster.color} strokeOpacity={selected ? 0.88 : 0.52} strokeWidth="0.9" />
                      <text textAnchor="middle" y="-2" fill={cluster.color} fontSize={cluster.labelSize} fontFamily="monospace" fontWeight="900" letterSpacing="1.2">{cluster.displayLabel}</text>
                      <text textAnchor="middle" y="9" fill="#cbd5e1" fillOpacity="0.78" fontSize="6.5" fontFamily="monospace" fontWeight="700" letterSpacing="1">{cluster.count} CSOMÓPONT</text>
                    </g>}
                  </g>;
                })}
                {displayedEdges.map((edge) => {
                  const source = nodesById.get(Number(edge.source_post_id));
                  const target = nodesById.get(Number(edge.target_post_id));
                  if (!source || !target) return null;
                  const selectedEdge = Number(selectedId) === Number(source.id) || Number(selectedId) === Number(target.id);
                  const searchEdge = hasQuery && visibleSearchResultIds.has(Number(source.id)) && visibleSearchResultIds.has(Number(target.id));
                  const magneticEdge = draggingNodeId !== null && (Number(source.id) === Number(draggingNodeId) || Number(target.id) === Number(draggingNodeId));
                  return <line key={edge.id} data-testid={`graph-edge-${edge.id}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={magneticEdge ? '#80ff00' : selectedEdge ? '#00fbfb' : searchEdge ? '#ff8a00' : '#37616b'} strokeOpacity={magneticEdge || selectedEdge || searchEdge ? 0.95 : 0.6} strokeWidth={magneticEdge ? 2.2 : selectedEdge ? 2.5 : searchEdge ? 1.8 : 1.1} markerEnd={`url(#${markerId}-arrow)`} className={`knowledge-edge${magneticEdge ? ' knowledge-edge--magnetic' : ''}`} />;
                })}
                {renderCanvasOverlay?.({
                  canvas: universeCanvas,
                  markerPrefix: markerId,
                  documentNodes: displayedGraphDocuments,
                  allDocumentNodes: nodes,
                  displayedDocumentIds: displayedNodeIds,
                  selectedDocument: selectedNode,
                  viewMode
                })}
                {nodes.map((node) => {
                  const meta = typeMeta(node);
                  const selected = Number(node.id) === Number(selectedId);
                  const isDisplayed = displayedNodeIds.has(Number(node.id));
                  const isDragging = Number(node.id) === Number(draggingNodeId);
                  const isLinkedToDraggedNode = draggingLinkedNodeIds.has(Number(node.id));
                  const nodeCluster = clustersByKey.get(node.primaryGroupKey);
                  const clusterColor = nodeCluster?.color || meta.color;
                  const secondaryMembershipCount = viewMode === 'overview' ? (node.secondaryGroupMemberships?.length || 0) : 0;
                  const contextualLabel = selected || node.isRoot || isDragging || (viewMode === 'overview' && hasQuery && isDisplayed);
                  const showLabel = nodeLabelMode === 'all'
                    ? isDisplayed
                    : nodeLabelMode === 'selected'
                      ? selected || node.isRoot || isDragging
                      : nodeLabelMode === 'hidden'
                        ? false
                        : contextualLabel;
                  const radius = node.isRoot ? 18 : selected ? 15 : 10;
                  const labelWidth = Math.min(228, Math.max(148, shortLabel(node.title).length * 6.5));
                  return <g key={node.id} data-testid={`graph-node-${node.id}`} data-node-id={node.id} data-cluster-key={node.primaryGroupKey || ''} data-position-x={node.x} data-position-y={node.y} transform={`translate(${node.x}, ${node.y})`} role="button" tabIndex={isDisplayed ? 0 : -1} aria-pressed={selected} aria-describedby="graph-drag-help" aria-label={`${meta.label}: ${node.title} csomópont kijelölése és húzása`} className={`knowledge-node ${isDisplayed ? 'cursor-pointer' : 'cursor-default'}${isDragging ? ' knowledge-node--dragging' : ''}${isLinkedToDraggedNode ? ' knowledge-node--linked' : ''}`} opacity={isDisplayed ? 1 : 0.12} onPointerDown={isDisplayed ? (event) => handleNodePointerDown(node, event) : undefined} onPointerMove={isDisplayed ? (event) => handleNodePointerMove(node, event) : undefined} onPointerUp={isDisplayed ? (event) => finishNodeDrag(node, event) : undefined} onPointerCancel={isDisplayed ? (event) => finishNodeDrag(node, event, true) : undefined} onClick={event => handleNodeClick(node, event)} onKeyDown={(event) => { if (isDisplayed && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); selectNode(node); } }}>
                    <circle className="knowledge-node-focus-ring" r={radius + 11} fill="none" stroke="#ffffff" strokeOpacity="0" strokeWidth="2.5" /><circle r={radius + 7} fill="none" stroke={clusterColor} strokeOpacity={isDragging ? 1 : isLinkedToDraggedNode ? 0.78 : selected ? 0.82 : 0.28} strokeWidth={isDragging ? 2 : selected ? 1.5 : 1} strokeDasharray={selected || isDragging ? 'none' : '2 4'} /><circle r={radius} fill={selected ? '#10253d' : '#071524'} stroke={isDragging ? '#80ff00' : selected ? '#ffffff' : meta.color} strokeWidth={isDragging ? 2.7 : selected ? 2.5 : node.isRoot ? 2.1 : 1.5} filter={selected || node.isRoot || isDragging ? `url(#${glowId})` : undefined} /><circle r={Math.max(3, radius - 6)} fill={isDragging ? '#80ff00' : meta.color} fillOpacity={selected || isDragging ? 1 : 0.75} />
                    {secondaryMembershipCount > 0 && isDisplayed && <g transform={`translate(${radius + 5}, ${-(radius + 5)})`} aria-hidden="true"><circle r="6" fill="#050b15" stroke={clusterColor} strokeWidth="1" /><text textAnchor="middle" y="2.4" fill={clusterColor} fontSize="6" fontFamily="monospace" fontWeight="900">+{secondaryMembershipCount}</text></g>}
                    {showLabel && <g data-testid={`graph-node-label-${node.id}`}><rect x={-labelWidth / 2} y={radius + 12} width={labelWidth} height="30" fill="#06111e" fillOpacity="0.96" stroke={selected ? '#ffffff' : meta.color} strokeOpacity="0.75" /><text textAnchor="middle" y={radius + 25} fill="#f8fafc" fontSize="9" fontFamily="monospace" fontWeight="700">{shortLabel(node.title)}</text><text textAnchor="middle" y={radius + 36} fill={meta.color} fontSize="7" fontFamily="monospace" fontWeight="800">{meta.shortLabel}{node.isRoot ? ' / FÓKUSZ' : ''}</text></g>}
                  </g>;
                })}
                </g>
              </svg>
              </div>
              <p id="graph-drag-help" data-testid="graph-drag-status" className="relative z-10 mt-2 inline-flex items-center gap-1.5 font-mono text-[8px] font-bold tracking-[0.12em] text-plasmaGreen/80"><Move size={10} aria-hidden="true" />{draggingNodeId !== null ? 'KAPCSOLATI VONZÁS + MEMBRÁN AKTÍV // A HALMAZFAL KÖVET' : 'HÚZD A PONTOT // A KAPCSOLÓDÓK ÉS A RUGALMAS HALMAZFAL EGYÜTT MOZOGNAK'}</p>
              <p className="relative z-10 mt-1 font-mono text-[8px] font-bold tracking-[0.12em] text-slate-600 sm:hidden">← HÚZD OLDALRA A GALAXIST A TELJES HALMAZTÉRHEZ →</p>
              <span className="sr-only" aria-live="polite">{dragAnnouncement || (activeCluster ? `${activeCluster.label} halmaz fókuszban, ${displayedGraphDocuments.length} csomóponttal.` : `${activeGroupingOption.label} szerinti halmaznézet, ${clusters.length} halmazzal.`)}</span>
              {!workspaceMode && <div className="relative mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-cyan-200/15 pt-3 font-mono text-[10px]"><div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400"><span><b className="text-neonCyan">{displayedGraphDocuments.length}</b> / {visibleGraphDocuments.length} LÁTHATÓ CSOMÓPONT</span><span><b className="text-neonMagenta">{clusters.length}</b> HALMAZ</span><span><b className="text-neonCyan">{displayedEdges.length}</b> VALÓDI ÉL</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 bg-neonCyan" /> TUDÁSTÁR</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 bg-neonMagenta" /> CIKK</span></div><span className="text-slate-600">NYÍL: HIVATKOZÁS IRÁNYA</span></div>}
            </>}
          </div>
        </div>

        {!workspaceMode && <aside className="graph-model-inspector relative order-3 border-t border-white/10 bg-[#07101b]/90 xl:border-l xl:border-t-0" aria-label="Gráf elemzés és kijelölt cikk">
          <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 font-mono text-[10px] font-black tracking-[0.15em] text-neonCyan"><Network size={14} /> {workspaceMode ? 'KIJELÖLT CIKK // MODELTÉR ALATT' : 'GRÁF ANALÍZIS'}</div>
          <div className="p-4"><dl className="grid grid-cols-2 border border-white/10 font-mono"><div className="border-b border-r border-white/10 p-3"><dt className="text-[8px] font-bold tracking-[0.12em] text-slate-500">LÁTHATÓ CSOMÓPONT</dt><dd className="mt-1 text-xl font-black text-neonCyan">{displayedGraphDocuments.length}<small className="ml-1 text-[10px] text-slate-500">/{visibleGraphDocuments.length}</small></dd></div><div className="border-b border-white/10 p-3"><dt className="text-[8px] font-bold tracking-[0.12em] text-slate-500">VALÓDI KAPCSOLAT</dt><dd className="mt-1 text-xl font-black text-[#ff8a00]">{displayedEdges.length}</dd></div><div className="border-r border-white/10 p-3"><dt className="text-[8px] font-bold tracking-[0.12em] text-slate-500">AKTÍV NÉZET</dt><dd className="mt-1 text-[10px] font-black text-slate-200">{viewMode === 'overview' ? activeGroupingOption.label : 'FÓKUSZ'}</dd></div><div className="p-3"><dt className="text-[8px] font-bold tracking-[0.12em] text-slate-500">KERESŐ ÁLLAPOT</dt><dd className="mt-1 text-[10px] font-black text-plasmaGreen">{hasQuery ? 'AKTÍV' : 'KÉSZ'}</dd></div></dl>
            <div className="mt-5 border-t border-white/10 pt-5">{!selectedNode ? <div className="border border-dashed border-white/20 bg-black/20 p-4 font-mono"><span className="mb-2 flex items-center gap-2 text-[10px] font-black tracking-[0.12em] text-slate-300"><Focus size={13} className="text-neonCyan" /> CSOMÓPONT KIJELÖLÉSE</span><p className="text-[10px] leading-relaxed text-slate-500">Válassz egy cikket a hálón, a mappákból vagy a keresési találatok közül a részletekhez és a megnyitáshoz.</p></div> : (() => { const meta = typeMeta(selectedNode); const Icon = meta.Icon; return <div><span className={`mb-3 inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[9px] font-black tracking-[0.12em] ${meta.className}`}><Icon size={12} /> {meta.label}</span><h3 className="font-mono text-sm font-black leading-relaxed text-white">{selectedNode.title}</h3>{viewMode === 'overview' && <div className="mt-3 border-l-2 border-neonMagenta/60 bg-neonMagenta/[0.04] px-2.5 py-2 font-mono text-[8px] font-bold tracking-[0.08em] text-slate-300"><span className="text-neonMagenta">ELSŐDLEGES HALMAZ:</span> {selectedNode.primaryGroupLabel || 'NEM BESOROLT'}{selectedNode.secondaryGroupMemberships?.length > 0 && <div className="mt-1.5 text-slate-400"><span className="text-neonCyan">KAPCSOLÓDÓ HALMAZOK:</span> {selectedNode.secondaryGroupMemberships.slice(0, 3).join(' // ')}</div>}</div>}<div className="mt-3 flex flex-wrap gap-2 font-mono text-[9px] font-bold text-slate-400"><span className="border border-white/15 px-2 py-1">{selectedConnections.length} KAPCSOLAT</span><span className="border border-white/15 px-2 py-1">{viewMode === 'focus' ? `${selectedNode.depth ?? 0}. UGRÁS` : activeGroupingOption.label}</span></div><div className="mt-4 grid gap-2"><button type="button" onClick={() => focusNode()} className="inline-flex min-h-11 items-center justify-center gap-2 border border-neonMagenta/70 bg-neonMagenta/10 px-3 font-mono text-[10px] font-black tracking-[0.12em] text-neonMagenta transition-colors hover:bg-neonMagenta hover:text-slate-950"><Focus size={14} /> FÓKUSZÁLÁS</button><button type="button" onClick={() => openNode()} className="inline-flex min-h-11 items-center justify-center gap-2 border border-neonCyan/70 bg-neonCyan/10 px-3 font-mono text-[10px] font-black tracking-[0.12em] text-neonCyan transition-colors hover:bg-neonCyan hover:text-slate-950"><ArrowUpRight size={14} /> CIKK MEGNYITÁSA</button></div></div>; })()}</div>
          </div>
        </aside>}
      </div>
      {!workspaceMode && <footer className="relative flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#050914] px-4 py-3 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500"><ShieldCheck size={13} className="text-plasmaGreen" /> Publikus szűrés aktív — belső csomópontok, privát metaadatok és SQL-kötések kizárva <span className="hidden text-neonCyan sm:inline">// {searchMessage}</span></footer>}
    </section>
  );
};

export default SharedKnowledgeMeshExplorer;
