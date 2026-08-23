import React from 'react';
import {
  ChevronRight,
  Code2,
  Factory,
  FileText,
  Flame,
  Folder,
  FolderOpen,
  Headphones,
  LayoutGrid,
  Layers3,
  Network,
  Sparkles,
  Video,
  Zap
} from 'lucide-react';
import { presentationProfileLabel, presentationProfileOf } from '../../utils/presentationProfile.js';

const pivotOptions = [
  { id: 'drive', label: 'DRIVE', icon: FolderOpen, active: 'bg-neonCyan text-slate-950' },
  { id: 'topic', label: 'TÉMÁK', icon: Layers3, active: 'bg-neonMagenta text-white' },
  { id: 'industry', label: 'IPARÁG', icon: Factory, active: 'bg-plasmaGreen text-slate-950' },
  { id: 'tech', label: 'TECH', icon: Zap, active: 'bg-cyan-400 text-slate-950' }
];

const smartOptions = [
  { id: 'featured', label: 'KIEMELT', icon: Flame, tint: 'text-orange-400', active: 'border-neonCyan bg-neonCyan/15 text-neonCyan' },
  { id: 'audio', label: 'AUDIO', icon: Headphones, tint: 'text-neonMagenta', active: 'border-neonMagenta bg-neonMagenta/15 text-neonMagenta' },
  { id: 'video', label: 'VIDEÓ', icon: Video, tint: 'text-cyan-400', active: 'border-cyan-400 bg-cyan-400/10 text-cyan-200' },
  { id: 'specs', label: 'SPEC', icon: Code2, tint: 'text-plasmaGreen', active: 'border-plasmaGreen bg-plasmaGreen/10 text-plasmaGreen' }
];

const GraphNavigatorSidebar = ({
  folderEntries,
  selectedFolder,
  onFolderSelect,
  pivotMode,
  onPivotModeChange,
  smartFilters,
  onToggleSmartFilter,
  onClearSmartFilters,
  smartCounts,
  documents,
  selectedId,
  onSelectDocument,
  onShowArchive,
  totalDocuments
}) => (
  <aside className="relative order-2 border-t border-white/10 bg-[#07101b]/90 xl:order-1 xl:border-r xl:border-t-0" aria-label="Mappa-navigátor és gráfszűrők">
    <div className="max-h-[38rem] overflow-y-auto xl:max-h-[48rem]">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-3 font-mono">
          <div className="min-w-0">
            <span className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.15em] text-neonCyan"><FolderOpen size={15} /> MAPPA-NAVIGÁTOR</span>
            <p className="mt-1 text-[9px] font-bold uppercase tracking-wide text-slate-500">KATEGÓRIÁK, SZŰRŐK, GYŰJTEMÉNYEK</p>
          </div>
          <span className="shrink-0 border border-neonCyan/50 bg-neonCyan/10 px-1.5 py-1 text-[9px] font-black text-neonCyan">{folderEntries.length} MAPPA</span>
        </div>

        <button type="button" onClick={onShowArchive} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 border-2 border-neonCyan bg-neonCyan px-3 font-headline text-xs font-black uppercase tracking-[0.12em] text-slate-950 transition-colors hover:bg-white">
          <LayoutGrid size={14} /> TUDÁSGRÁF_BEMUTATÓ_HUB
        </button>

        <div className="mt-4 border-t border-white/10 pt-3 font-mono">
          <div className="mb-2 flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
            <span className="flex items-center gap-1.5"><Network size={11} className="text-neonCyan" /> PIVOT STRUKTÚRA:</span>
            <span className="text-neonCyan">[{pivotMode.toUpperCase()}]</span>
          </div>
          <div className="grid grid-cols-4 gap-1 border border-white/10 bg-slate-950/80 p-1">
            {pivotOptions.map(({ id, label, icon: Icon, active }) => (
              <button key={id} type="button" onClick={() => onPivotModeChange(id)} aria-pressed={pivotMode === id} className={`flex min-h-8 min-w-0 items-center justify-center gap-1 px-1 font-mono text-[8px] font-black uppercase transition-colors ${pivotMode === id ? active : 'text-slate-500 hover:bg-white/5 hover:text-slate-200'}`}>
                {React.createElement(Icon, { size: 10 })} <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 border-t border-white/10 pt-3 font-mono">
          <div className="mb-2 flex items-center justify-between gap-2 text-[9px] font-black uppercase tracking-[0.1em] text-slate-500">
            <span className="flex items-center gap-1.5"><Sparkles size={11} className="text-neonMagenta" /> SMART GYŰJTEMÉNYEK:</span>
            {smartFilters.length > 0 && <button type="button" onClick={onClearSmartFilters} className="text-[8px] font-black text-neonMagenta hover:underline">VISSZAÁLLÍTÁS ({smartFilters.length})</button>}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {smartOptions.map(({ id, label, icon: Icon, tint, active }) => (
              <button key={id} type="button" onClick={() => onToggleSmartFilter(id)} aria-pressed={smartFilters.includes(id)} className={`flex min-h-9 items-center justify-between border px-2 font-mono text-[9px] font-black transition-colors ${smartFilters.includes(id) ? active : 'border-white/10 bg-slate-950/65 text-slate-400 hover:border-white/50 hover:text-slate-100'}`}>
                <span className="flex items-center gap-1.5">{React.createElement(Icon, { size: 11, className: tint })}{label}</span><span className={tint}>{smartCounts[id]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <nav className="space-y-2 p-3" aria-label="Gráf mappák">
        {selectedFolder !== 'ALL' && (
          <button type="button" onClick={() => onFolderSelect('ALL')} className="flex min-h-10 w-full items-center justify-between border border-dashed border-neonCyan/55 bg-neonCyan/5 px-3 font-mono text-[10px] font-black uppercase tracking-[0.08em] text-neonCyan hover:bg-neonCyan hover:text-slate-950">
            <span className="flex items-center gap-2"><FolderOpen size={13} /> .. [SZÜLŐKÖNYVTÁR]</span><span>ALL/</span>
          </button>
        )}
        {(selectedFolder === 'ALL' ? folderEntries : folderEntries.filter(([folder]) => folder === selectedFolder)).map(([folder, folderDocs]) => {
          const active = selectedFolder === folder;
          return (
            <div key={folder} className={active ? 'border border-neonCyan/60 bg-neonCyan/[0.07] shadow-[inset_3px_0_0_#00fbfb]' : ''}>
              <button type="button" onClick={() => onFolderSelect(active ? 'ALL' : folder)} aria-pressed={active} aria-expanded={active} className={`flex min-h-12 w-full items-center justify-between gap-2 border px-3 text-left transition-colors ${active ? 'border-0 bg-neonCyan/10' : 'border-white/10 bg-slate-900/65 hover:border-neonMagenta/65 hover:bg-slate-800'}`}>
                <span className="flex min-w-0 items-center gap-2.5"><Folder size={16} className={active ? 'text-neonCyan' : 'text-neonMagenta'} /><span className="truncate font-mono text-[10px] font-black uppercase tracking-[0.06em] text-slate-100">{folder}</span></span>
                <span className="flex shrink-0 items-center gap-2"><span className="border border-neonCyan/50 px-1.5 py-0.5 font-mono text-[9px] font-black text-neonCyan">{folderDocs.length}</span><ChevronRight size={14} className={`transition-transform ${active ? 'rotate-90 text-neonCyan' : 'text-slate-500'}`} /></span>
              </button>
              {active && <div className="space-y-1.5 border-t border-neonCyan/25 p-2" aria-label={`${folder} cikkei`}>
                <div className="px-1 pb-1 font-mono text-[8px] font-black uppercase tracking-[0.12em] text-neonCyan">MAPPA TARTALMA // {folderDocs.length} CIKK</div>
                {folderDocs.map((document) => {
                  const isSelected = Number(document.id) === Number(selectedId);
                  return <button key={document.id} type="button" onClick={() => onSelectDocument(document)} className={`block w-full border p-2 text-left transition-colors ${isSelected ? 'border-neonCyan bg-neonCyan/10' : 'border-white/10 bg-slate-950/55 hover:border-neonCyan/50'}`}><span className="mb-1 flex items-center gap-1 font-mono text-[8px] font-black uppercase tracking-[0.1em] text-neonCyan"><FileText size={10} /> {presentationProfileLabel(presentationProfileOf(document))}</span><span className="block truncate font-mono text-[9px] font-bold text-slate-200">{document.title}</span></button>;
                })}
              </div>}
            </div>
          );
        })}
      </nav>

      {selectedFolder === 'ALL' && <div className="border-t border-white/10 px-3 pb-3 pt-3">
        <div className="mb-2 flex items-center justify-between font-mono text-[9px] font-black uppercase tracking-[0.12em] text-slate-500"><span>SZŰRT CIKKEK</span><span className="text-neonCyan">{documents.length}/{totalDocuments}</span></div>
        <div className="space-y-1.5">
          {documents.slice(0, 5).map((document) => {
            const isSelected = Number(document.id) === Number(selectedId);
            return <button key={document.id} type="button" onClick={() => onSelectDocument(document)} className={`block w-full border p-2 text-left transition-colors ${isSelected ? 'border-neonCyan bg-neonCyan/10' : 'border-white/10 bg-slate-950/45 hover:border-neonCyan/50'}`}><span className="mb-1 flex items-center gap-1 font-mono text-[8px] font-black uppercase tracking-[0.1em] text-neonCyan"><FileText size={10} /> {presentationProfileLabel(presentationProfileOf(document))}</span><span className="block truncate font-mono text-[9px] font-bold text-slate-200">{document.title}</span></button>;
          })}
        </div>
      </div>}
    </div>
  </aside>
);

export default GraphNavigatorSidebar;
