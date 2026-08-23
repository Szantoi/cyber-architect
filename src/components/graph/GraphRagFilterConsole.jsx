import React from 'react';
import {
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Factory,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  X,
  Zap
} from 'lucide-react';
import { CadPanelShell } from './ui/GraphCadUi.jsx';

const scopeOptions = [
  { id: 'all', label: 'ÖSSZES' },
  { id: 'knowledge', label: 'TUDÁSTÁR' },
  { id: 'blog', label: 'BLOG' }
];

const tierOptions = [
  { id: 'all', label: 'ÖSSZES', icon: BrainCircuit, className: 'border-white bg-white text-slate-950' },
  { id: 'keyword', label: '1. KULCSSZÓ', icon: Search, className: 'border-neonCyan bg-neonCyan/15 text-neonCyan' },
  { id: 'semantic', label: '2. SZEMANTIKA', icon: Sparkles, className: 'border-neonMagenta bg-neonMagenta/15 text-neonMagenta' },
  { id: 'hybrid', label: '3. RAG FÚZIÓ', icon: Zap, className: 'border-plasmaGreen bg-plasmaGreen/10 text-plasmaGreen' }
];

const FilterSelect = ({ label, icon: Icon, value, onChange, options, allLabel, accent = 'text-neonCyan', name }) => (
  <label className="block min-w-0 font-mono">
    <span className={`mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] ${accent}`}>
      {React.createElement(Icon, { size: 12, 'aria-hidden': true })} {label}
    </span>
    <select
      aria-label={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-11 w-full border border-white/20 bg-slate-950/80 px-3 font-mono text-xs font-bold uppercase tracking-wide text-slate-100 outline-none transition-colors focus:border-neonCyan focus:shadow-[0_0_14px_rgba(0,251,251,0.2)]"
    >
      <option value="ALL">{allLabel}</option>
      {options.map(({ value: optionValue, count }) => (
        <option key={optionValue} value={optionValue}>{optionValue} ({count})</option>
      ))}
    </select>
  </label>
);

const GraphRagFilterConsole = ({
  searchQuery,
  searchStatus,
  resultIndex,
  searchResultCount,
  onSearchQueryChange,
  onSearchKeyDown,
  onClearSearch,
  onStepResult,
  searchScope,
  onSearchScopeChange,
  corpusCounts,
  ragTier,
  onRagTierChange,
  ragTierCounts,
  iparag,
  onIparagChange,
  technology,
  onTechnologyChange,
  audience,
  onAudienceChange,
  sortBy,
  onSortByChange,
  facetOptions,
  visibleDocumentCount,
  totalDocumentCount,
  compact = false,
  expanded = true,
  onExpandedChange
}) => {
  const hasQuery = Boolean(searchQuery.trim());
  const displayedResultNumber = Math.min(resultIndex + 1, searchResultCount);

  return (
    <CadPanelShell scroll={false} tone="cyan" density={compact ? 'compact' : 'regular'} className={`graph-search-console relative border border-neonCyan/80 shadow-[0_0_22px_rgba(0,251,251,0.06)] ${compact ? 'border-x-0 border-t-0 px-3 py-2 sm:px-4' : 'p-3 sm:p-4'}`} data-testid="graph-search-console">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="flex min-h-11 flex-1 items-center border-2 border-neonCyan bg-[#050a14] focus-within:shadow-[0_0_18px_rgba(0,251,251,0.2)]">
          <Search size={17} className="mx-3 shrink-0 text-neonCyan" aria-hidden="true" />
          <label htmlFor="graph-article-search" className="sr-only">Cikkkeresés a Tudástárban és Blogban</label>
          <input
            id="graph-article-search"
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="INTELLIGENS RAG KERESŐ (SZÖVEG, KIFEJEZÉS, KÓD, TÉMAKÖR)..."
            className="min-w-0 flex-1 bg-transparent py-2 font-mono text-xs font-bold uppercase tracking-wide text-on-surface outline-none placeholder:text-slate-600"
          />
          {hasQuery && (
            <button type="button" onClick={onClearSearch} className="grid min-h-11 min-w-11 place-items-center border-l border-neonCyan/35 text-slate-400 transition-colors hover:bg-neonMagenta/15 hover:text-neonMagenta" aria-label="Keresés törlése">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="flex min-h-11 items-stretch border border-plasmaGreen/60 bg-[#08130f] font-mono text-[10px] font-black text-plasmaGreen">
          <span className="flex items-center px-3" aria-live="polite">{hasQuery ? `[${displayedResultNumber}/${searchResultCount} TALÁLAT]` : '[INDEX KÉSZ]'}</span>
          <button type="button" onClick={() => onStepResult(-1)} disabled={!searchResultCount} className="grid min-w-11 place-items-center border-l border-plasmaGreen/30 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-plasmaGreen hover:text-slate-950" aria-label="Előző keresési találat"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => onStepResult(1)} disabled={!searchResultCount} className="grid min-w-11 place-items-center border-l border-plasmaGreen/30 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-plasmaGreen hover:text-slate-950" aria-label="Következő keresési találat"><ChevronRight size={16} /></button>
        </div>
        {compact && <button type="button" onClick={onExpandedChange} aria-expanded={expanded} data-testid="graph-workspace-filter-toggle" className="inline-flex min-h-11 items-center justify-center gap-2 border border-white/15 bg-slate-950/70 px-3 font-mono text-[9px] font-black tracking-[.1em] text-slate-300 transition-colors hover:border-neonCyan hover:text-neonCyan"><SlidersHorizontal size={13} />{expanded ? 'SZŰRŐK ELREJTÉSE' : 'SZŰRŐK'}</button>}
      </div>

      {(!compact || expanded) && <div className="mt-3 border-t border-white/10 pt-3">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2" aria-label="XAI léptetési szintek">
            <span className="mr-1 font-mono text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">XAI LÉPTETÉSI SZINTEK:</span>
            {tierOptions.map(({ id, label, icon: Icon, className }) => (
              <button
                key={id}
                type="button"
                onClick={() => onRagTierChange(id)}
                disabled={!hasQuery && id !== 'all'}
                aria-pressed={ragTier === id}
                className={`inline-flex min-h-8 items-center gap-1.5 border px-2.5 font-mono text-[9px] font-black tracking-[0.07em] transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${ragTier === id ? className : 'border-white/15 bg-slate-950/60 text-slate-500 hover:border-white/60 hover:text-slate-200'}`}
              >
                {React.createElement(Icon, { size: 11 })} {label} ({ragTierCounts[id]})
              </button>
            ))}
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 border border-plasmaGreen/30 bg-plasmaGreen/5 px-2 py-1 font-mono text-[9px] font-bold tracking-[0.1em] text-plasmaGreen">
            <span className={`h-1.5 w-1.5 bg-plasmaGreen ${searchStatus === 'loading' ? 'animate-pulse' : ''}`} /> LIVE SERVER RAG RETRIEVAL
          </span>
        </div>

        <div className="mt-3 grid gap-3 border-t border-white/10 pt-3 sm:grid-cols-2 xl:grid-cols-4">
          <FilterSelect label="IPARÁG" icon={Factory} value={iparag} onChange={onIparagChange} options={facetOptions.iparag} allLabel="ÖSSZES IPARÁG" name="Iparág szűrő" />
          <FilterSelect label="TECHNOLÓGIA" icon={Zap} value={technology} onChange={onTechnologyChange} options={facetOptions.technology} allLabel="ÖSSZES TECHNOLÓGIA" name="Technológia szűrő" />
          <FilterSelect label="CÉLCSOPORT / SZEREPKÖR" icon={Target} value={audience} onChange={onAudienceChange} options={facetOptions.audience} allLabel="ÖSSZES SZEREPKÖR" accent="text-neonMagenta" name="Célcsoport szűrő" />
          <label className="block min-w-0 font-mono">
            <span className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.12em] text-plasmaGreen"><SlidersHorizontal size={12} aria-hidden="true" /> RENDEZÉS</span>
            <select aria-label="Rendezés" value={sortBy} onChange={(event) => onSortByChange(event.target.value)} className="min-h-11 w-full border border-plasmaGreen/60 bg-slate-950/80 px-3 font-mono text-xs font-black uppercase tracking-wide text-plasmaGreen outline-none transition-colors focus:shadow-[0_0_14px_rgba(128,255,0,0.18)]">
              <option value="rag">AJÁNLÁS SZERINT (RAG)</option>
              <option value="newest">LEGÚJABB ELŐRE</option>
              <option value="title">CÍM SZERINT (A–Z)</option>
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 font-mono text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">
          <span>MUTATVA: <b className="text-neonCyan">{visibleDocumentCount}</b> / {totalDocumentCount} CIKK</span>
          <div className="flex flex-wrap gap-1" aria-label="Tartalom típusa">
            {scopeOptions.map(({ id, label }) => (
              <button key={id} type="button" onClick={() => onSearchScopeChange(id)} aria-pressed={searchScope === id} className={`border px-2 py-1 text-[8px] font-black transition-colors ${searchScope === id ? 'border-neonCyan/70 bg-neonCyan/10 text-neonCyan' : 'border-white/10 bg-slate-950/50 text-slate-500 hover:border-white/50 hover:text-slate-200'}`}>
                {label} ({corpusCounts[id]})
              </button>
            ))}
          </div>
        </div>
      </div>}
    </CadPanelShell>
  );
};

export default GraphRagFilterConsole;
