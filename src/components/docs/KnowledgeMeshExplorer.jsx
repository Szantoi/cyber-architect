import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  Filter,
  Focus,
  GitFork,
  Info,
  Layers,
  Network,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X
} from 'lucide-react';
import SharedKnowledgeMeshExplorer from '../graph/SharedKnowledgeMeshExplorer.jsx';
import { presentationProfileOf } from '../../utils/presentationProfile.js';
import { useAdminPreview } from '../../context/AdminPreviewContext.jsx';

const DEFAULT_ROOT_SLUG = 'hibrid-ai-tudasbazis-obsidian-sql';
const CANVAS = { width: 1000, height: 560, centerX: 500, centerY: 284 };
const SEARCH_DELAY = 180;

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

const typeOf = (document) => (presentationProfileOf(document) === 'article' ? 'blog' : 'knowledge');
const typeMeta = (document) => TYPE_META[typeOf(document)];

function shortLabel(value, maximum = 28) {
  const label = String(value || 'Névtelen dokumentum');
  return label.length > maximum ? `${label.slice(0, maximum - 1)}…` : label;
}

function relevanceScore(result) {
  const raw = result?.scorePercentage ?? result?.relevanceScore ?? result?.hybridRelevanceScore;
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric <= 1 ? numeric * 100 : numeric);
}

function focusGraphLayout(documents, rootId) {
  const root = documents.find(document => Number(document.id) === Number(rootId)) || documents[0];
  if (!root) return [];

  const rings = new Map();
  for (const document of documents) {
    if (Number(document.id) === Number(root.id)) continue;
    const depth = Math.max(1, Number(document.depth) || 1);
    const ring = rings.get(depth) || [];
    ring.push(document);
    rings.set(depth, ring);
  }

  const positioned = [{ ...root, x: CANVAS.centerX, y: CANVAS.centerY, isRoot: true }];
  for (const [depth, ring] of [...rings.entries()].sort(([a], [b]) => a - b)) {
    const radius = Math.min(220, 100 + (depth - 1) * 84);
    ring.sort((a, b) => a.title.localeCompare(b.title)).forEach((document, index) => {
      const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / ring.length) + (depth % 2 ? 0 : Math.PI / 8);
      positioned.push({
        ...document,
        x: CANVAS.centerX + Math.cos(angle) * radius * 1.38,
        y: CANVAS.centerY + Math.sin(angle) * radius,
        isRoot: false
      });
    });
  }
  return positioned;
}

function archiveGraphLayout(documents) {
  if (!documents.length) return [];

  const groups = {
    knowledge: documents.filter(document => typeOf(document) === 'knowledge').sort((a, b) => a.title.localeCompare(b.title)),
    blog: documents.filter(document => typeOf(document) === 'blog').sort((a, b) => a.title.localeCompare(b.title))
  };
  const clusterCenters = {
    knowledge: { x: 326, y: CANVAS.centerY },
    blog: { x: 724, y: CANVAS.centerY }
  };

  return Object.entries(groups).flatMap(([kind, entries]) => {
    if (entries.length === 0) return [];
    const center = clusterCenters[kind];
    if (entries.length === 1) return [{ ...entries[0], x: center.x, y: center.y, isRoot: false }];

    return entries.map((document, index) => {
      if (index === 0) return { ...document, x: center.x, y: center.y, isRoot: false };
      const remaining = entries.length - 1;
      const ringIndex = index - 1;
      const ring = Math.floor(ringIndex / 8);
      const ringStart = ring * 8;
      const itemsInRing = Math.min(8, remaining - ringStart);
      const angle = (-Math.PI / 2) + ((Math.PI * 2 * (ringIndex - ringStart)) / itemsInRing) + (ring * 0.28);
      const radius = 84 + (ring * 58);
      return {
        ...document,
        x: center.x + Math.cos(angle) * radius * 1.22,
        y: center.y + Math.sin(angle) * radius * 0.88,
        isRoot: false
      };
    });
  });
}

const LegacyKnowledgeMeshExplorer = ({ onSelectDoc, scope = 'knowledge' }) => {
  const { viewerFetch } = useAdminPreview();
  const isSharedGraph = scope === 'shared';
  const markerId = useId().replace(/:/g, '');
  const glowId = `${markerId}-glow`;
  const endpoints = useMemo(() => (isSharedGraph
    ? {
        list: '/api/graph/documents',
        overview: '/api/graph',
        graph: (slug, depth) => `/api/graph/${encodeURIComponent(slug)}?depth=${depth}`
      }
    : {
        list: '/api/docs',
        graph: (slug, depth) => `/api/docs/graph/${encodeURIComponent(slug)}?depth=${depth}`
      }), [isSharedGraph]);

  const [availableDocs, setAvailableDocs] = useState([]);
  const [rootSlug, setRootSlug] = useState(DEFAULT_ROOT_SLUG);
  const [graph, setGraph] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState('loading');
  const [depth, setDepth] = useState(2);
  const [viewMode, setViewMode] = useState(isSharedGraph ? 'overview' : 'focus');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchScope, setSearchScope] = useState('all');
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState('idle');
  const [searchResultIndex, setSearchResultIndex] = useState(0);

  useEffect(() => {
    let active = true;
    viewerFetch(endpoints.list)
      .then(response => response.ok ? response.json() : { docs: [] })
      .then(data => {
        if (!active) return;
        const docs = Array.isArray(data.docs) ? data.docs : (Array.isArray(data.documents) ? data.documents : []);
        setAvailableDocs(docs);
        setRootSlug(current => (
          !isSharedGraph && !docs.some(document => document.slug === current) && docs[0]?.slug
            ? docs[0].slug
            : current
        ));
      })
      .catch(() => active && setAvailableDocs([]));
    return () => { active = false; };
  }, [endpoints.list, isSharedGraph, viewerFetch]);

  useEffect(() => {
    if (!isSharedGraph && (!rootSlug || availableDocs.length === 0)) return undefined;

    let active = true;
    const controller = new AbortController();
    setStatus('loading');
    setGraph(null);

    const requestUrl = isSharedGraph && viewMode === 'overview'
      ? endpoints.overview
      : endpoints.graph(rootSlug, depth);

    viewerFetch(requestUrl, { signal: controller.signal })
      .then(async response => ({ ok: response.ok, data: await response.json() }))
      .then(({ ok, data }) => {
        if (!active) return;
        if (!ok) {
          setStatus(data?.error === 'PUBLIC_GRAPH_NOT_FOUND' ? 'empty' : 'error');
          return;
        }
        const documents = Array.isArray(data?.documents) ? data.documents : [];
        setGraph({ ...data, documents, edges: Array.isArray(data?.edges) ? data.edges : [] });
        if (isSharedGraph && viewMode === 'overview') setAvailableDocs(documents);
        if (viewMode === 'focus') setSelectedId(current => current ?? data?.root?.id ?? null);
        setStatus(documents.length ? 'ready' : 'empty');
      })
      .catch(error => {
        if (active && error?.name !== 'AbortError') setStatus('error');
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [availableDocs.length, depth, endpoints, isSharedGraph, rootSlug, viewMode, viewerFetch]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!isSharedGraph || !query) {
      setSearchResults([]);
      setSearchStatus('idle');
      return undefined;
    }

    let active = true;
    const controller = new AbortController();
    setSearchStatus('loading');
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query, scope: searchScope, limit: '20' });
      viewerFetch(`/api/search/unified?${params.toString()}`, { signal: controller.signal })
        .then(response => response.ok ? response.json() : { results: [] })
        .then(data => {
          if (!active) return;
          setSearchResults(Array.isArray(data?.results) ? data.results : []);
          setSearchStatus('ready');
        })
        .catch(error => {
          if (active && error?.name !== 'AbortError') {
            setSearchResults([]);
            setSearchStatus('error');
          }
        });
    }, SEARCH_DELAY);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [isSharedGraph, searchQuery, searchScope, viewerFetch]);

  const availableDocsById = useMemo(() => (
    new Map(availableDocs.map(document => [Number(document.id), document]))
  ), [availableDocs]);

  const graphDocuments = useMemo(() => (
    (graph?.documents || []).map(document => ({
      ...document,
      content_type: document.content_type || availableDocsById.get(Number(document.id))?.content_type || 'knowledge'
    }))
  ), [availableDocsById, graph]);

  const nodes = useMemo(() => {
    if (isSharedGraph && viewMode === 'overview') return archiveGraphLayout(graphDocuments);
    return focusGraphLayout(graphDocuments, graph?.root?.id);
  }, [graph?.root?.id, graphDocuments, isSharedGraph, viewMode]);

  const nodesById = useMemo(() => new Map(nodes.map(node => [Number(node.id), node])), [nodes]);
  const selectedNode = nodesById.get(Number(selectedId)) || null;
  const graphEdges = graph?.edges || [];
  const selectedConnections = selectedNode
    ? graphEdges.filter(edge => Number(edge.source_post_id) === Number(selectedNode.id) || Number(edge.target_post_id) === Number(selectedNode.id))
    : [];

  const graphSearchResults = useMemo(() => {
    const publicResults = searchResults.map(result => {
      const publicDocument = availableDocsById.get(Number(result.id));
      if (!publicDocument) return null;
      return { ...result, ...publicDocument, content_type: publicDocument.content_type };
    }).filter(Boolean);
    return publicResults;
  }, [availableDocsById, searchResults]);

  const searchResultIds = useMemo(() => new Set(graphSearchResults.map(result => Number(result.id))), [graphSearchResults]);
  const knowledgeCount = useMemo(() => availableDocs.filter(document => typeOf(document) === 'knowledge').length, [availableDocs]);
  const blogCount = useMemo(() => availableDocs.filter(document => typeOf(document) === 'blog').length, [availableDocs]);
  const leftRailDocuments = useMemo(() => {
    const source = searchQuery.trim() ? graphSearchResults : availableDocs;
    return source.filter(document => searchScope === 'all' || typeOf(document) === searchScope);
  }, [availableDocs, graphSearchResults, searchQuery, searchScope]);

  useEffect(() => {
    setSearchResultIndex(index => Math.max(0, Math.min(index, graphSearchResults.length - 1)));
  }, [graphSearchResults.length]);

  const selectNode = (node, { switchToArchive = false } = {}) => {
    if (switchToArchive && isSharedGraph) setViewMode('overview');
    setSelectedId(node.id);
  };

  const focusNode = (node = selectedNode) => {
    if (!node) return;
    setRootSlug(node.slug);
    setSelectedId(node.id);
    setViewMode('focus');
  };

  const showArchive = () => {
    if (!isSharedGraph) return;
    setViewMode('overview');
  };

  const openNode = (node = selectedNode) => {
    if (!node || !onSelectDoc) return;
    const query = searchQuery.trim();
    if (query) onSelectDoc(node.slug, node, query);
    else onSelectDoc(node.slug, node);
  };

  const selectSearchResult = (result) => {
    selectNode(result, { switchToArchive: true });
  };

  const stepSearchResult = (offset) => {
    if (!graphSearchResults.length) return;
    const nextIndex = (searchResultIndex + offset + graphSearchResults.length) % graphSearchResults.length;
    setSearchResultIndex(nextIndex);
    selectSearchResult(graphSearchResults[nextIndex]);
  };

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      const result = graphSearchResults[searchResultIndex] || graphSearchResults[0];
      if (result) focusNode(result);
    }
    if (event.key === 'Escape') {
      setSearchQuery('');
      setSearchResultIndex(0);
    }
  };

  const searchMessage = (() => {
    if (!searchQuery.trim()) return 'CIKK KERESŐ KÉSZENLÉTBEN';
    if (searchStatus === 'loading') return 'RAG KERESÉS FOLYAMATBAN';
    if (searchStatus === 'error') return 'A KERESŐ MOST NEM ELÉRHETŐ';
    return `${graphSearchResults.length}/${searchResults.length} TALÁLAT A NYILVÁNOS GRÁFBAN`;
  })();

  return (
    <section className="relative mb-10 overflow-hidden border border-neonCyan/35 bg-[#050814] shadow-[0_0_0_1px_rgba(0,251,251,0.06),0_0_42px_rgba(0,0,0,0.44)]" aria-labelledby="public-knowledge-graph-title">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(0,251,251,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(0,251,251,0.035)_1px,transparent_1px)] [background-size:32px_32px]" />

      <header className="relative border-b border-neonCyan/25 bg-[#08111f]/95 px-4 py-5 sm:px-6 lg:flex lg:items-end lg:justify-between lg:gap-10">
        <div className="max-w-3xl">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] font-black tracking-[0.2em] text-neonCyan"><Network size={14} aria-hidden="true" /><span>{isSharedGraph ? 'KNOWLEDGE_MESH // PUBLIC_WIKILINK_TOPOLOGY' : 'PUBLIC_KNOWLEDGE_GRAPH // WIKILINK_TOPOLOGY'}</span></div>
          <h2 id="public-knowledge-graph-title" className="font-headline text-2xl font-black uppercase italic tracking-tight text-on-surface sm:text-3xl">{isSharedGraph ? <>Tudástár <span className="text-neonMagenta">+</span> Blog <span className="text-neonCyan">archívum</span></> : 'Publikus tudásgráf'}</h2>
          <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-slate-400">{isSharedGraph ? 'A teljes publikus cikkarchívum egy nézetben. A vonalak kizárólag valódi Markdown wikilink-kapcsolatokat jelölnek.' : 'A gráf kizárólag közzétett, publikus Markdown-jegyzetek közötti valódi wikilink kapcsolatokat mutatja.'}</p>
        </div>
        {isSharedGraph && <div className="mt-5 grid grid-cols-3 border border-white/10 font-mono lg:mt-0"><div className="min-w-24 border-r border-white/10 px-3 py-2.5"><span className="block text-[8px] font-bold tracking-[0.14em] text-slate-500">ÖSSZES CIKK</span><strong className="mt-1 block text-lg leading-none text-white">{availableDocs.length}</strong></div><div className="min-w-24 border-r border-white/10 px-3 py-2.5"><span className="block text-[8px] font-bold tracking-[0.14em] text-slate-500">TUDÁSTÁR</span><strong className="mt-1 block text-lg leading-none text-neonCyan">{knowledgeCount}</strong></div><div className="min-w-24 px-3 py-2.5"><span className="block text-[8px] font-bold tracking-[0.14em] text-slate-500">BLOG</span><strong className="mt-1 block text-lg leading-none text-neonMagenta">{blogCount}</strong></div></div>}
      </header>

      {isSharedGraph ? (
        <div className="relative border-b border-neonCyan/25 bg-[#07101d]/90 p-3 sm:p-4" data-testid="graph-search-console">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="flex min-h-11 flex-1 items-center border-2 border-neonCyan bg-[#050a14] focus-within:border-plasmaGreen focus-within:shadow-[0_0_18px_rgba(128,255,0,0.18)]"><Search size={17} className="mx-3 shrink-0 text-neonCyan" aria-hidden="true" /><label htmlFor="graph-article-search" className="sr-only">Cikkkeresés a Tudástárban és Blogban</label><input id="graph-article-search" type="search" value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setSearchResultIndex(0); }} onKeyDown={handleSearchKeyDown} placeholder="KERESÉS A CIKKEK KÖZÖTT..." className="min-w-0 flex-1 bg-transparent py-2 font-mono text-xs font-bold uppercase tracking-wide text-on-surface outline-none placeholder:text-slate-600" />{searchQuery && <button type="button" onClick={() => { setSearchQuery(''); setSearchResultIndex(0); }} className="grid min-h-11 min-w-11 place-items-center border-l border-neonCyan/35 text-slate-400 transition-colors hover:bg-neonMagenta/15 hover:text-neonMagenta" aria-label="Keresés törlése"><X size={16} /></button>}</div>
            <div className="flex min-h-11 items-stretch border border-plasmaGreen/60 bg-[#08130f] font-mono text-[10px] font-black text-plasmaGreen"><span className="flex items-center px-3" aria-live="polite">{searchQuery.trim() ? `[${Math.min(searchResultIndex + 1, graphSearchResults.length)}/${graphSearchResults.length} TALÁLAT]` : '[INDEX KÉSZ]'}</span><button type="button" onClick={() => stepSearchResult(-1)} disabled={!graphSearchResults.length} className="grid min-w-11 place-items-center border-l border-plasmaGreen/30 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-plasmaGreen hover:text-slate-950" aria-label="Előző keresési találat"><ChevronLeft size={16} /></button><button type="button" onClick={() => stepSearchResult(1)} disabled={!graphSearchResults.length} className="grid min-w-11 place-items-center border-l border-plasmaGreen/30 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-plasmaGreen hover:text-slate-950" aria-label="Következő keresési találat"><ChevronRight size={16} /></button></div>
          </div>
          <div className="mt-3 flex flex-col gap-2 border-t border-white/10 pt-3 lg:flex-row lg:items-center lg:justify-between"><div className="flex flex-wrap gap-2" aria-label="Keresési hatókör">{[
            { id: 'all', label: `ÖSSZES (${availableDocs.length})`, active: 'border-white bg-white text-slate-950' },
            { id: 'knowledge', label: `TUDÁSTÁR (${knowledgeCount})`, active: 'border-neonCyan bg-neonCyan/15 text-neonCyan shadow-[0_0_12px_rgba(0,251,251,0.24)]' },
            { id: 'blog', label: `BLOG (${blogCount})`, active: 'border-neonMagenta bg-neonMagenta/15 text-neonMagenta shadow-[0_0_12px_rgba(255,0,255,0.2)]' }
          ].map(({ id, label, active }) => <button key={id} type="button" onClick={() => { setSearchScope(id); setSearchResultIndex(0); }} aria-pressed={searchScope === id} className={`inline-flex min-h-9 items-center gap-1.5 border px-2.5 font-mono text-[9px] font-black tracking-[0.08em] transition-colors ${searchScope === id ? active : 'border-white/15 bg-slate-950/60 text-slate-500 hover:border-white/60 hover:text-slate-200'}`}>{label}</button>)}</div><div className="flex flex-wrap items-center gap-2 font-mono text-[9px] font-bold tracking-[0.1em] text-slate-500"><span className="inline-flex items-center gap-1.5 border border-neonCyan/20 bg-neonCyan/5 px-2 py-1 text-neonCyan"><Filter size={11} /> HIBRID CIKKKERESŐ</span><span className="inline-flex items-center gap-1.5 border border-plasmaGreen/30 bg-plasmaGreen/5 px-2 py-1 text-plasmaGreen"><span className="h-1.5 w-1.5 bg-plasmaGreen" /> RAG_INDEX AKTÍV</span></div></div>
        </div>
      ) : (
        <div className="relative flex flex-wrap items-end gap-3 border-b border-white/10 bg-[#07101d]/90 p-4"><label className="flex min-w-0 flex-1 flex-col gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">Kiinduló dokumentum<select value={rootSlug} onChange={event => setRootSlug(event.target.value)} className="min-h-11 border border-white/20 bg-slate-950 px-3 text-xs font-bold text-white outline-none transition-colors focus:border-neonCyan" aria-label="A tudásgráf kiinduló dokumentuma">{availableDocs.map(document => <option key={document.id ?? document.slug} value={document.slug}>{document.title}</option>)}</select></label><label className="flex flex-col gap-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500"><span className="flex items-center gap-1"><SlidersHorizontal size={12} /> Mélység</span><select value={depth} onChange={event => setDepth(Number(event.target.value))} className="min-h-11 border border-white/20 bg-slate-950 px-3 text-xs font-bold text-white outline-none focus:border-neonCyan" aria-label="Gráf mélysége"><option value="1">1 ugrás</option><option value="2">2 ugrás</option></select></label></div>
      )}

      <div className="relative grid xl:grid-cols-[18rem_minmax(0,1fr)_19rem]">
        {isSharedGraph && <aside className="relative order-2 border-t border-white/10 bg-[#07101b]/90 xl:order-1 xl:border-r xl:border-t-0" aria-label="Cikk találatok és archívum index"><div className="flex items-center justify-between border-b border-white/10 px-4 py-3"><span className="flex items-center gap-2 font-mono text-[10px] font-black tracking-[0.15em] text-neonCyan"><Database size={14} /> {searchQuery.trim() ? 'CIKK TALÁLATOK' : 'ARCHÍVUM INDEX'}</span><span className="font-mono text-[10px] font-bold text-slate-500">{leftRailDocuments.length}</span></div><div className="max-h-[24rem] overflow-y-auto p-2 xl:max-h-[38rem]">{searchStatus === 'loading' && searchQuery.trim() && <div className="flex min-h-28 items-center justify-center gap-2 font-mono text-[10px] font-bold text-neonCyan"><RefreshCw size={14} className="animate-spin" /> INDEXELÉS</div>}{searchStatus !== 'loading' && leftRailDocuments.length === 0 && <div className="p-3 font-mono text-[10px] leading-relaxed text-slate-500">{searchQuery.trim() ? 'NINCS NYILVÁNOS, GRÁFRA FŰZHETŐ CIKKTALÁLAT.' : 'NINCS MEGJELENÍTHETŐ CIKK.'}</div>}{searchStatus !== 'loading' && leftRailDocuments.slice(0, searchQuery.trim() ? 20 : 12).map((document, index) => { const meta = typeMeta(document); const Icon = meta.Icon; const isActive = Number(document.id) === Number(selectedId); const score = relevanceScore(document); return <button key={document.id ?? document.slug} type="button" onClick={() => selectSearchResult(document)} className={`mb-1.5 block w-full border p-3 text-left transition-colors ${isActive ? 'border-neonCyan bg-neonCyan/10 shadow-[inset_3px_0_0_#00fbfb]' : 'border-white/10 bg-slate-950/40 hover:border-neonCyan/50 hover:bg-slate-900/75'}`}><span className="mb-1.5 flex items-center justify-between gap-2"><span className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-mono text-[8px] font-black tracking-[0.12em] ${meta.className}`}><Icon size={10} />{meta.label}</span>{score !== null && searchQuery.trim() && <span className="font-mono text-[9px] font-bold text-plasmaGreen">{score}%</span>}</span><span className="block font-mono text-[10px] font-bold leading-relaxed text-slate-200">{shortLabel(document.title, 70)}</span>{searchQuery.trim() && index === searchResultIndex && <span className="mt-2 flex items-center gap-1 font-mono text-[8px] font-black tracking-[0.13em] text-neonCyan"><Focus size={10} /> AKTÍV TALÁLAT</span>}</button>; })}</div><div className="border-t border-white/10 px-4 py-3 font-mono text-[9px] leading-relaxed text-slate-500"><Info size={11} className="mr-1 inline text-neonCyan" /> Enter: részgráf fókusz. Kattintás: kijelölés a teljes hálóban.</div></aside>}

        <div className={`relative order-1 min-w-0 ${isSharedGraph ? 'xl:order-2' : ''}`}><div className="flex flex-col gap-3 border-b border-white/10 bg-[#08101c]/92 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 font-mono text-[10px] font-black tracking-[0.15em] text-slate-300"><GitFork size={13} className="text-neonCyan" />{viewMode === 'overview' ? 'TELJES ARCHÍVUM HÁLÓ' : 'KAPCSOLATI FÓKUSZ'}</div><p className="mt-1 font-mono text-[9px] text-slate-500">{viewMode === 'overview' ? 'MINDEN PUBLIKUS, RAG-INDEXELT CIKK' : `KIINDULÓ CIKK: ${shortLabel(graph?.root?.title || rootSlug, 42)}`}</p></div><div className="flex flex-wrap gap-2">{isSharedGraph && <button type="button" onClick={showArchive} disabled={viewMode === 'overview'} className="inline-flex min-h-10 items-center gap-2 border border-neonCyan/45 px-3 font-mono text-[9px] font-black tracking-[0.12em] text-neonCyan transition-colors hover:bg-neonCyan hover:text-slate-950 disabled:cursor-default disabled:opacity-40"><Layers size={13} /> TELJES HÁLÓ</button>}{viewMode === 'focus' && <label className="inline-flex min-h-10 items-center gap-2 border border-white/15 px-2 font-mono text-[9px] font-bold text-slate-400"><SlidersHorizontal size={12} /> MÉLYSÉG <select value={depth} onChange={event => setDepth(Number(event.target.value))} className="bg-transparent text-xs font-bold text-white outline-none" aria-label="Fókuszált gráf mélysége"><option value="1">1</option><option value="2">2</option></select></label>}</div></div><div className="relative min-h-[31rem] overflow-hidden bg-[#040a13] p-3 sm:p-5"><div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(0,251,251,0.075)_1px,transparent_1px),linear-gradient(90deg,rgba(0,251,251,0.075)_1px,transparent_1px)] [background-size:28px_28px]" /><div className="pointer-events-none absolute inset-x-4 top-4 flex justify-between font-mono text-[8px] font-bold tracking-[0.18em] text-neonCyan/45"><span>0x00 / ARCHIVE_LINKS</span><span>{viewMode === 'overview' ? 'OVERVIEW' : 'FOCUS'}</span></div>{status === 'loading' && <div className="relative flex min-h-[27rem] items-center justify-center gap-3 font-mono text-xs font-bold uppercase tracking-widest text-neonCyan"><RefreshCw size={18} className="animate-spin" /> GRÁF INDEX BETÖLTÉSE</div>}{status === 'empty' && <div className="relative flex min-h-[27rem] flex-col items-center justify-center gap-3 text-center font-mono"><Route size={34} className="text-neonMagenta" /><strong className="text-sm uppercase text-white">Ehhez a nézethez még nincs publikus gráf-adat.</strong><p className="max-w-lg text-xs leading-relaxed text-slate-400">A cikkek megjelennek, amint publikusak és RAG-indexeltek; élekhez adj hozzá valódi <code>[[hivatkozás]]</code> kapcsolatokat.</p></div>}{status === 'error' && <div className="relative flex min-h-[27rem] items-center justify-center font-mono text-xs font-bold uppercase tracking-widest text-neonMagenta">A GRÁF MOST NEM ELÉRHETŐ</div>}{status === 'ready' && <><svg className="relative h-[29rem] w-full" viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} role="group" aria-label="Publikus Tudástár és Blog gráf"><defs><marker id={`${markerId}-arrow`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="#4fced0" /></marker><filter id={glowId} x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>{isSharedGraph && viewMode === 'overview' && <><text x="326" y="56" textAnchor="middle" fill="#00fbfb" fontSize="10" fontFamily="monospace" fontWeight="800" letterSpacing="2">TUDÁSTÁR CLUSTER</text><text x="724" y="56" textAnchor="middle" fill="#ff00ff" fontSize="10" fontFamily="monospace" fontWeight="800" letterSpacing="2">BLOG CLUSTER</text><line x1="500" y1="72" x2="500" y2="500" stroke="#ffffff" strokeOpacity="0.06" strokeDasharray="4 10" /></>}{graphEdges.map(edge => { const source = nodesById.get(Number(edge.source_post_id)); const target = nodesById.get(Number(edge.target_post_id)); if (!source || !target) return null; const selectedEdge = Number(selectedId) === Number(source.id) || Number(selectedId) === Number(target.id); const searchEdge = searchQuery.trim() && searchResultIds.has(Number(source.id)) && searchResultIds.has(Number(target.id)); return <line key={edge.id} x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={selectedEdge ? '#00fbfb' : searchEdge ? '#ff8a00' : '#37616b'} strokeOpacity={selectedEdge || searchEdge ? 0.95 : 0.55} strokeWidth={selectedEdge ? 2.5 : searchEdge ? 1.8 : 1.1} markerEnd={`url(#${markerId}-arrow)`} className="transition-all duration-300" />; })}{nodes.map(node => { const meta = typeMeta(node); const selected = Number(node.id) === Number(selectedId); const isSearchMatch = !searchQuery.trim() || searchResultIds.has(Number(node.id)); const hasTextLabel = selected || node.isRoot || (isSharedGraph && viewMode === 'overview' && searchQuery.trim() && isSearchMatch); const radius = node.isRoot ? 18 : selected ? 15 : 10; const labelWidth = Math.min(228, Math.max(148, shortLabel(node.title).length * 6.5)); return <g key={node.id} transform={`translate(${node.x}, ${node.y})`} role="button" tabIndex={0} aria-label={`${meta.label}: ${node.title} csomópont megnyitása`} className="knowledge-node cursor-pointer" opacity={isSearchMatch ? 1 : 0.2} onClick={() => selectNode(node)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(node); } }}><circle r={radius + 7} fill="none" stroke={meta.color} strokeOpacity={selected ? 0.75 : 0.18} strokeWidth={selected ? 1.5 : 1} strokeDasharray={selected ? 'none' : '2 4'} /><circle r={radius} fill={selected ? '#10253d' : '#071524'} stroke={selected ? '#ffffff' : meta.color} strokeWidth={selected ? 2.5 : node.isRoot ? 2.1 : 1.5} filter={selected || node.isRoot ? `url(#${glowId})` : undefined} /><circle r={Math.max(3, radius - 6)} fill={meta.color} fillOpacity={selected ? 1 : 0.75} />{hasTextLabel && <><rect x={-labelWidth / 2} y={radius + 12} width={labelWidth} height="30" fill="#06111e" fillOpacity="0.96" stroke={selected ? '#ffffff' : meta.color} strokeOpacity="0.75" /><text textAnchor="middle" y={radius + 25} fill="#f8fafc" fontSize="9" fontFamily="monospace" fontWeight="700">{shortLabel(node.title)}</text><text textAnchor="middle" y={radius + 36} fill={meta.color} fontSize="7" fontFamily="monospace" fontWeight="800">{meta.shortLabel}{node.isRoot ? ' / FÓKUSZ' : ''}</text></>}</g>; })}</svg><div className="relative mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-cyan-200/15 pt-3 font-mono text-[10px]"><div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400"><span><b className="text-neonCyan">{nodes.length}</b> CSOMÓPONT</span><span><b className="text-neonCyan">{graphEdges.length}</b> {isSharedGraph ? 'VALÓDI ÉL' : 'EXPLICIT ÉL'}</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 bg-neonCyan" /> TUDÁSTÁR</span><span className="inline-flex items-center gap-1"><span className="h-2 w-2 bg-neonMagenta" /> BLOG</span></div><span className="text-slate-600">NYÍL: HIVATKOZÁS IRÁNYA</span></div></>}</div></div>

        <aside className="relative order-3 border-t border-white/10 bg-[#07101b]/90 xl:border-l xl:border-t-0" aria-label="Gráf elemzés és kijelölt cikk"><div className="flex items-center gap-2 border-b border-white/10 px-4 py-3 font-mono text-[10px] font-black tracking-[0.15em] text-neonCyan"><Network size={14} /> GRÁF ANALÍZIS</div><div className="p-4"><dl className="grid grid-cols-2 border border-white/10 font-mono"><div className="border-b border-r border-white/10 p-3"><dt className="text-[8px] font-bold tracking-[0.12em] text-slate-500">LÁTHATÓ CSOMÓPONT</dt><dd className="mt-1 text-xl font-black text-neonCyan">{nodes.length}</dd></div><div className="border-b border-white/10 p-3"><dt className="text-[8px] font-bold tracking-[0.12em] text-slate-500">VALÓDI KAPCSOLAT</dt><dd className="mt-1 text-xl font-black text-[#ff8a00]">{graphEdges.length}</dd></div><div className="border-r border-white/10 p-3"><dt className="text-[8px] font-bold tracking-[0.12em] text-slate-500">AKTÍV NÉZET</dt><dd className="mt-1 text-[10px] font-black text-slate-200">{viewMode === 'overview' ? 'ARCHÍVUM' : 'FÓKUSZ'}</dd></div><div className="p-3"><dt className="text-[8px] font-bold tracking-[0.12em] text-slate-500">KERESŐ ÁLLAPOT</dt><dd className="mt-1 text-[10px] font-black text-plasmaGreen">{searchQuery.trim() ? 'AKTÍV' : 'KÉSZ'}</dd></div></dl><div className="mt-5 border-t border-white/10 pt-5">{!selectedNode ? <div className="border border-dashed border-white/20 bg-black/20 p-4 font-mono"><span className="mb-2 flex items-center gap-2 text-[10px] font-black tracking-[0.12em] text-slate-300"><Focus size={13} className="text-neonCyan" /> CSOMÓPONT KIJELÖLÉSE</span><p className="text-[10px] leading-relaxed text-slate-500">Válassz egy cikket a hálón vagy a keresési találatok közül a részletekhez és a megnyitáshoz.</p></div> : (() => { const meta = typeMeta(selectedNode); const Icon = meta.Icon; return <div><span className={`mb-3 inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[9px] font-black tracking-[0.12em] ${meta.className}`}><Icon size={12} /> {meta.label}</span><h3 className="font-mono text-sm font-black leading-relaxed text-white">{selectedNode.title}</h3><div className="mt-3 flex flex-wrap gap-2 font-mono text-[9px] font-bold text-slate-400"><span className="border border-white/15 px-2 py-1">{selectedConnections.length} KAPCSOLAT</span><span className="border border-white/15 px-2 py-1">{viewMode === 'focus' ? `${selectedNode.depth ?? 0}. UGRÁS` : 'ARCHÍVUM'}</span></div><div className="mt-4 grid gap-2"><button type="button" onClick={() => focusNode()} className="inline-flex min-h-11 items-center justify-center gap-2 border border-neonMagenta/70 bg-neonMagenta/10 px-3 font-mono text-[10px] font-black tracking-[0.12em] text-neonMagenta transition-colors hover:bg-neonMagenta hover:text-slate-950"><Focus size={14} /> FÓKUSZÁLÁS</button><button type="button" onClick={() => openNode()} className="inline-flex min-h-11 items-center justify-center gap-2 border border-neonCyan/70 bg-neonCyan/10 px-3 font-mono text-[10px] font-black tracking-[0.12em] text-neonCyan transition-colors hover:bg-neonCyan hover:text-slate-950"><ArrowUpRight size={14} /> {isSharedGraph ? 'CIKK MEGNYITÁSA' : 'MEGNYITÁS'}</button></div></div>; })()}</div></div></aside>
      </div>

      <footer className="relative flex flex-wrap items-center gap-2 border-t border-white/10 bg-[#050914] px-4 py-3 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500"><ShieldCheck size={13} className="text-plasmaGreen" /> Publikus szűrés aktív — belső csomópontok, privát metaadatok és SQL-kötések kizárva <span className="hidden text-neonCyan sm:inline">// {searchMessage}</span></footer>
    </section>
  );
};

const KnowledgeMeshExplorer = (props) => (
  props.scope === 'shared'
    ? <SharedKnowledgeMeshExplorer onSelectDoc={props.onSelectDoc} />
    : <LegacyKnowledgeMeshExplorer {...props} />
);

export default KnowledgeMeshExplorer;
