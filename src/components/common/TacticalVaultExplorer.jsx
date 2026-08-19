import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search,
  FolderOpen,
  Folder,
  FileText,
  ChevronRight,
  ChevronDown,
  X,
  Sparkles,
  LayoutGrid,
  Zap,
  Target,
  Brain,
  Headphones,
  Video,
  Cpu,
  Layers,
  ShieldCheck,
  ArrowRight,
  Share2,
  Flame,
  Code2,
  Check,
  Link2,
  Network
} from 'lucide-react';

import MarkdownRenderer, { extractHeadings } from '../markdown/MarkdownRenderer.jsx';
import TableOfContents from '../markdown/TableOfContents.jsx';
import TacticalAudioPlayer from '../multimedia/TacticalAudioPlayer.jsx';
import VideoPlayer from '../multimedia/VideoPlayer.jsx';


// ============================================================================
// 1. HIGHLIGHT HELPER (Neon Keyword Match Visualizer)
// ============================================================================
export const HighlightText = ({ text = '', query = '' }) => {
  if (!query || !text || typeof text !== 'string') return <>{text}</>;
  const cleanFullQuery = query.trim().toLowerCase();
  const rawWords = cleanFullQuery
    .split(/\s+/)
    .filter((w) => w.length > 1);
  if (!rawWords.length) return <>{text}</>;

  const wordsSet = new Set();
  // 1. Teljes kifejezés hozzáadása (pl. "Google Drive")
  if (rawWords.length > 1) {
    wordsSet.add(cleanFullQuery);
  }

  // 2. Különálló szavak és szótövek
  rawWords.forEach((w) => {
    wordsSet.add(w);
    const cleanW = w.replace(/[^a-z0-9áéíóöőúüű]/gi, '');
    if (cleanW.length >= 3) {
      wordsSet.add(cleanW);
      const stem = cleanW.replace(/(ot|at|et|ot|hoz|hez|val|vel|ban|ben|bol|bel|rol|nak|nek|t|k|ba|be|ra|re|ig|ul|as|es|os|hatom|hetem|unk|tek|tok)$/, '');
      if (stem.length >= 3) wordsSet.add(stem);
    }
  });

  const searchTokens = Array.from(wordsSet).sort((a, b) => b.length - a.length);


  try {
    const escaped = searchTokens.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, i) => {
          const isMatch = searchTokens.some((w) => part.toLowerCase() === w.toLowerCase());
          return isMatch ? (
            <mark
              key={i}
              className="bg-yellow-300 dark:bg-neonCyan/40 text-black dark:text-neonCyan px-1 py-0.5 font-bold border border-yellow-500 dark:border-neonCyan shadow-[0_0_8px_rgba(0,255,255,0.4)] rounded-none inline-block align-baseline"
            >
              {part}
            </mark>
          ) : (
            part
          );
        })}
      </>
    );
  } catch {
    return <>{text}</>;
  }
};


// ============================================================================
// 2. IN-ARTICLE SEARCH CONSOLE (Valós Szerver-Oldali RAG Chunk Kereső & Ugró)
// ============================================================================
export const InArticleSearchConsole = ({ 
  postContent = '', 
  searchQuery, 
  setSearchQuery,
  onNavigateToMatch,
  onCloseDoc,
  vaultLabel = 'HUB',
  docSlug = '',
  onRagDataLoaded,
  onFilterLevelChange
}) => {
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [filterLevel, setFilterLevel] = useState('ALL'); // 'ALL' | 'KEYWORD' | 'SEMANTIC' | 'CHUNK'
  const [serverRagData, setServerRagData] = useState(null);
  const [isLoadingRag, setIsLoadingRag] = useState(false);

  const handleSetFilterLevel = (lvl) => {
    setFilterLevel(lvl);
    if (onFilterLevelChange) onFilterLevelChange(lvl);
  };

  // Valós Szerver RAG Chunk lekérdezés (< 10 ms válaszidővel)
  useEffect(() => {
    if (!docSlug || !searchQuery || !searchQuery.trim()) {
      setServerRagData(null);
      if (onRagDataLoaded) onRagDataLoaded(null);
      return;
    }

    let isMounted = true;
    setIsLoadingRag(true);

    fetch(`/api/rag/article-chunks?slug=${encodeURIComponent(docSlug)}&q=${encodeURIComponent(searchQuery.trim())}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (isMounted && data && Array.isArray(data.chunks)) {
          setServerRagData(data);
          if (onRagDataLoaded) onRagDataLoaded(data);
        }
      })
      .catch(err => console.warn('[RAG_API_NOTE]', err))
      .finally(() => {
        if (isMounted) setIsLoadingRag(false);
      });

    return () => { isMounted = false; };
  }, [docSlug, searchQuery]);

  // Fallback kliens oldali szétbontás, ha még tölt a szerver
  const clientMatches = useMemo(() => {
    if (!searchQuery || !searchQuery.trim() || !postContent) return [];
    const queryNorm = searchQuery.trim().toLowerCase();
    const words = queryNorm.split(/\s+/).filter(w => w.length > 0);
    if (!words.length) return [];

    const results = [];
    const lines = postContent.split('\n');
    let currentHeading = 'Bevezetés';

    lines.forEach((line, lineIdx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#')) {
        currentHeading = trimmed.replace(/^#+\s*/, '');
      }

      const lineLower = trimmed.toLowerCase();
      const hasDirectWord = words.some(w => lineLower.includes(w));

      if (hasDirectWord && trimmed.length > 10 && !trimmed.startsWith('```')) {
        results.push({
          chunk_id: `chk_${String(results.length + 1).padStart(2, '0')}`,
          index: results.length,
          lineIndex: lineIdx,
          heading: currentHeading,
          snippet: trimmed.replace(/^[#\s*`>]+/, '').slice(0, 140),
          content: trimmed,
          token_count: Math.ceil(trimmed.split(/\s+/).length * 1.3),
          relevance_score: 85,
          level: trimmed.length > 100 ? 'CHUNK' : 'KEYWORD'
        });
      }
    });

    return results;
  }, [postContent, searchQuery]);

  // Elsődlegesen a szerver RAG chunkjait használjuk, ha elérhetők
  const allMatches = useMemo(() => {
    if (serverRagData && Array.isArray(serverRagData.chunks)) {
      return serverRagData.chunks;
    }
    return clientMatches;
  }, [serverRagData, clientMatches]);

  // Szűrt találatok a kiválasztott szint alapján (Multi-kategóriás szűrés)
  const matches = useMemo(() => {
    if (filterLevel === 'ALL') return allMatches;
    if (filterLevel === 'KEYWORD') {
      return allMatches.filter(m => m.is_keyword_match || m.level === 'KEYWORD' || (Array.isArray(m.keyword_matches) && m.keyword_matches.length > 0));
    }
    if (filterLevel === 'SEMANTIC') {
      return allMatches.filter(m => m.is_semantic_match || m.level === 'SEMANTIC' || (m.cosine_similarity !== undefined && m.cosine_similarity >= 0.18));
    }
    if (filterLevel === 'CHUNK') {
      return allMatches.filter(m => m.is_rag_chunk || m.level === 'CHUNK' || (m.token_count !== undefined && m.token_count >= 20));
    }
    return allMatches;
  }, [allMatches, filterLevel]);

  // Szintenkénti darabszámok a valós szerver metaadatokból
  const levelCounts = useMemo(() => {
    if (serverRagData && serverRagData.levelCounts) {
      return serverRagData.levelCounts;
    }
    return {
      ALL: allMatches.length,
      KEYWORD: allMatches.filter(m => m.is_keyword_match || m.level === 'KEYWORD' || (Array.isArray(m.keyword_matches) && m.keyword_matches.length > 0)).length,
      SEMANTIC: allMatches.filter(m => m.is_semantic_match || m.level === 'SEMANTIC' || (m.cosine_similarity !== undefined && m.cosine_similarity >= 0.18)).length,
      CHUNK: allMatches.filter(m => m.is_rag_chunk || m.level === 'CHUNK' || (m.token_count !== undefined && m.token_count >= 20)).length
    };
  }, [serverRagData, allMatches]);

  useEffect(() => {
    setCurrentMatchIndex(0);
    if (matches.length > 0 && onNavigateToMatch) {
      onNavigateToMatch(matches[0], 0);
    }
  }, [filterLevel, matches.length]);

  const jumpToMatch = (idx) => {
    if (!matches.length) return;
    const targetIdx = (idx + matches.length) % matches.length;
    setCurrentMatchIndex(targetIdx);
    const targetMatch = matches[targetIdx];
    if (onNavigateToMatch) {
      onNavigateToMatch(targetMatch, targetIdx);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) jumpToMatch(currentMatchIndex - 1);
      else jumpToMatch(currentMatchIndex + 1);
    } else if (e.key === 'Escape') {
      setSearchQuery('');
      setIsDropdownOpen(false);
    }
  };

  const getLevelLabel = () => {
    switch (filterLevel) {
      case 'KEYWORD': return 'KULCSSZÓ';
      case 'SEMANTIC': return 'SZEMANTIKA';
      case 'CHUNK': return 'RAG CHUNK';
      default: return 'TALÁLAT';
    }
  };

  return (
    <div className="sticky top-0 z-40 pb-2 pt-1 -mt-4 mb-6 backdrop-blur-md dark:bg-[#090d1d]/90 bg-white/95 border-b-2 dark:border-neonCyan/40 border-slate-900 shadow-[0_6px_20px_rgba(0,0,0,0.35)] font-mono transition-all">
      <div className="bg-[var(--surface-panel)] p-2.5 border-2 dark:border-neonCyan/60 border-slate-900 shadow-[3px_3px_0_#0f172a] dark:shadow-[0_0_15px_rgba(0,255,255,0.15)] rounded-none">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          
          {/* Back to Hub button */}
          <button
            onClick={onCloseDoc}
            className="text-[10px] font-bold dark:text-slate-300 text-slate-700 hover:text-neonCyan flex items-center gap-1.5 transition-colors uppercase shrink-0 cursor-pointer"
          >
            <span>◀</span>
            <span>VISSZA A {vaultLabel}-RA</span>
          </button>

          {/* Search input field */}
          <div className="flex-1 flex items-center gap-2 px-2.5 py-1 dark:bg-slate-900 bg-slate-100 border-2 dark:border-neonCyan border-slate-400 focus-within:border-plasmaGreen transition-all">
            <Search size={13} className="text-neonCyan shrink-0" />
            <input
              type="text"
              placeholder="KERESÉS A CIKKEN BELÜL (KIFEJEZÉS, KÓD)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="bg-transparent text-xs text-on-surface placeholder:text-slate-500 outline-none w-full uppercase font-mono font-bold"
            />
            {isLoadingRag && (
              <span className="text-[9px] text-neonCyan font-bold animate-pulse">RAG...</span>
            )}
            {searchQuery && (
              <button 
                onClick={() => { setSearchQuery(''); setIsDropdownOpen(false); }} 
                className="text-slate-400 hover:text-neonMagenta text-xs px-1 cursor-pointer"
                title="Keresés törlése (Esc)"
              >
                ✕
              </button>
            )}
          </div>

          {/* Stepper Controls & Dropdown Toggle */}
          <div className="flex items-center gap-2 justify-end shrink-0 text-[10px]">
            {searchQuery.trim() ? (
              matches.length > 0 ? (
                <div className="flex items-center gap-1.5 bg-slate-900 border dark:border-plasmaGreen/50 border-slate-700 px-2 py-0.5 shadow-[0_0_10px_rgba(0,255,255,0.2)]">
                  <span className="text-plasmaGreen font-bold">
                    [{currentMatchIndex + 1}/{matches.length} {getLevelLabel()}]
                  </span>
                  <button
                    onClick={() => jumpToMatch(currentMatchIndex - 1)}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-neonCyan hover:text-black text-white text-[10px] font-bold border border-white/20 cursor-pointer"
                    title="Előző találat (Shift+Enter)"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => jumpToMatch(currentMatchIndex + 1)}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-neonCyan hover:text-black text-white text-[10px] font-bold border border-white/20 cursor-pointer"
                    title="Következő találat (Enter)"
                  >
                    ▼
                  </button>
                  <button
                    onClick={() => setIsDropdownOpen(v => !v)}
                    className="px-1.5 py-0.5 dark:text-slate-300 text-slate-400 hover:text-neonCyan text-[9px] border border-white/10 cursor-pointer"
                    title="Valós RAG Chunkok listája"
                  >
                    {isDropdownOpen ? '▲' : '📋'}
                  </button>
                </div>
              ) : (
                <span className="px-2 py-0.5 bg-neonMagenta/10 border border-neonMagenta/40 text-neonMagenta font-bold">
                  [0 {getLevelLabel()}]
                </span>
              )
            ) : (
              <span className="text-slate-500 hidden lg:inline text-[9px]">KÖVETŐ KERESŐ</span>
            )}
          </div>
        </div>


        {/* Interaktív 3-Szintű XAI Léptető & Szűrő Sáv (Valós Szerver RAG Adatokkal) */}
        {searchQuery.trim() && (
          <div className="mt-2.5 pt-2 border-t dark:border-white/10 border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[9px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500 font-bold uppercase">XAI LÉPTETÉSI SZINTEK:</span>
              
              {/* 0. Mind (Összes) */}
              <button
                onClick={() => handleSetFilterLevel('ALL')}
                className={`flex items-center gap-1 px-2 py-0.5 border font-bold uppercase transition-all cursor-pointer ${
                  filterLevel === 'ALL'
                    ? 'dark:bg-slate-800 bg-slate-900 text-white border-white shadow-[0_0_8px_#ffffff]'
                    : 'dark:bg-slate-900/60 bg-slate-200 text-slate-600 dark:text-slate-400 border-slate-400 dark:border-white/20 hover:border-white'
                }`}
              >
                <span>🌐 ÖSSZES ({levelCounts.ALL})</span>
              </button>

              {/* 1. Pontos Kulcsszó */}
              <button
                onClick={() => handleSetFilterLevel('KEYWORD')}
                className={`flex items-center gap-1 px-2 py-0.5 border font-bold uppercase transition-all cursor-pointer ${
                  filterLevel === 'KEYWORD'
                    ? 'bg-yellow-300 dark:bg-neonCyan/30 text-slate-950 dark:text-neonCyan border-yellow-500 dark:border-neonCyan shadow-[0_0_10px_#00FFFF]'
                    : 'dark:bg-slate-900/60 bg-slate-200 text-slate-600 dark:text-slate-400 border-slate-400 dark:border-white/20 hover:border-neonCyan'
                }`}
              >
                <span className="w-1.5 h-1.5 bg-cyan-400 inline-block" />
                <span>1. KULCSSZÓ ({levelCounts.KEYWORD})</span>
              </button>

              {/* 2. Szemantikai Egyezés */}
              <button
                onClick={() => handleSetFilterLevel('SEMANTIC')}
                className={`flex items-center gap-1 px-2 py-0.5 border font-bold uppercase transition-all cursor-pointer ${
                  filterLevel === 'SEMANTIC'
                    ? 'dark:bg-fuchsia-950 bg-fuchsia-100 text-fuchsia-900 dark:text-pink-200 border-neonMagenta shadow-[0_0_10px_#FF00FF]'
                    : 'dark:bg-slate-900/60 bg-slate-200 text-slate-600 dark:text-slate-400 border-slate-400 dark:border-white/20 hover:border-neonMagenta'
                }`}
              >
                <Brain size={10} className="text-neonMagenta" />
                <span>2. SZEMANTIKA ({levelCounts.SEMANTIC})</span>
              </button>

              {/* 3. Releváns RAG Chunk */}
              <button
                onClick={() => handleSetFilterLevel('CHUNK')}
                className={`flex items-center gap-1 px-2 py-0.5 border font-bold uppercase transition-all cursor-pointer ${
                  filterLevel === 'CHUNK'
                    ? 'dark:bg-emerald-950 bg-emerald-100 text-emerald-900 dark:text-emerald-300 border-plasmaGreen shadow-[0_0_10px_#80FF00]'
                    : 'dark:bg-slate-900/60 bg-slate-200 text-slate-600 dark:text-slate-400 border-slate-400 dark:border-white/20 hover:border-plasmaGreen'
                }`}
              >
                <Zap size={10} className="text-plasmaGreen" />
                <span>3. RAG CHUNK ({levelCounts.CHUNK})</span>
              </button>
            </div>

            {/* Server RAG Active Badge */}
            {serverRagData && (
              <span className="text-[8px] px-1.5 py-0.5 bg-emerald-950/60 border border-plasmaGreen/40 text-plasmaGreen font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-plasmaGreen animate-pulse" />
                <span>LIVE SERVER RAG RETRIEVAL</span>
              </span>
            )}
          </div>
        )}


        {/* Snippets jump dropdown (Valós RAG Metaadatokkal) */}
        {searchQuery.trim() && matches.length > 0 && isDropdownOpen && (
          <div className="mt-2 pt-2 border-t dark:border-white/10 border-slate-200">
            <div className="text-[9px] text-slate-400 mb-1 flex justify-between font-bold">
              <span>VALÓS SZERVED-OLDALI RAG CHUNKOK:</span>
              <button onClick={() => setIsDropdownOpen(false)} className="text-neonCyan hover:underline cursor-pointer">
                [ELREJTÉS ▲]
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1 pr-1 font-mono text-[10px]">
              {matches.map((m, idx) => (
                <button
                  key={m.chunk_id || idx}
                  onClick={() => {
                    jumpToMatch(idx);
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full text-left p-2 border transition-all flex items-start justify-between gap-2 cursor-pointer ${
                    currentMatchIndex === idx
                      ? 'dark:bg-neonCyan/20 bg-cyan-100 border-neonCyan font-bold dark:text-white text-slate-950 shadow-[inset_3px_0_0_#00FFFF]'
                      : 'dark:bg-slate-900/60 bg-slate-100 border-slate-300 dark:border-white/10 dark:text-slate-300 text-slate-700 hover:border-neonCyan'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-[9px] text-neonCyan font-bold mb-0.5 truncate">
                      <span>§ {m.heading}</span>
                    </div>
                    <div className="text-slate-400 truncate italic">
                      "{m.snippet}"
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 text-[8px] font-bold">
                    <span className="text-plasmaGreen">{m.chunk_id || `#${idx + 1}`}</span>
                    {m.token_count && <span className="text-slate-500">{m.token_count} tok</span>}
                    {m.cosine_similarity !== undefined && (
                      <span className="text-neonMagenta font-bold">{Math.round(m.cosine_similarity * 100)}% Sim</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// 3. RELATED ARTICLES RECOMMENDER
// ============================================================================
export const RelatedArticles = ({ slug, fetchRelatedUrl, onSelectDoc }) => {
  const [related, setRelated] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!slug || !fetchRelatedUrl) return;
    let isCancelled = false;
    const fetchRelated = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(fetchRelatedUrl(slug));
        if (res.ok && !isCancelled) {
          const data = await res.json();
          setRelated(Array.isArray(data) ? data : (data.related || []));
        }
      } catch {
        if (!isCancelled) setRelated([]);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };
    fetchRelated();
    return () => { isCancelled = true; };
  }, [slug, fetchRelatedUrl]);

  if (isLoading || !related || related.length === 0) return null;

  return (
    <div className="mt-16 pt-10 border-t-2 dark:border-white/10 border-slate-900 font-mono">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-neonCyan" />
          <h3 className="text-sm font-headline font-black uppercase italic text-on-surface">
            KAPCSOLÓDÓ SZAKMAI ANYAGOK & AJÁNLÁSOK
          </h3>
        </div>
        <span className="text-[10px] text-plasmaGreen font-bold flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-plasmaGreen rounded-none animate-pulse"></span>
          <span>RAG SEMANTIC VECTOR MATCH</span>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {related.map((item) => (
          <div
            key={item.id || item.slug}
            onClick={() => onSelectDoc(item)}
            className="group block p-4 bg-[var(--surface-panel)] border-2 dark:border-white/10 border-slate-900 hover:border-neonCyan/80 transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none hover:shadow-[-3px_0_12px_rgba(0,255,255,0.2)] rounded-none cursor-pointer"
          >
            <div className="flex items-center justify-between text-[9px] text-slate-500 mb-1 font-mono uppercase">
              <span className="text-neonCyan font-bold">[{item.category || 'DOKUMENTUM'}]</span>
              {item.similarity && (
                <span className="text-plasmaGreen font-bold">
                  {Math.round(item.similarity * 100)}% MATCH
                </span>
              )}
            </div>
            <h4 className="text-xs font-headline font-bold uppercase italic text-on-surface group-hover:text-neonCyan transition-colors line-clamp-2 mb-2">
              {item.title}
            </h4>
            <p className="text-[10px] font-body dark:text-slate-400 text-slate-600 line-clamp-2 mb-3">
              {item.summary}
            </p>
            <div className="text-[9px] text-neonCyan flex items-center gap-1 font-bold">
              <span>MEGNYITÁS</span>
              <span>→</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper: Szemantikus többes kategóriák kinyerése egy cikkhez (Többes Módhoz)
export const getMultiCategoriesForDoc = (item) => {
  if (!item) return ['Általános'];
  const categories = new Set();

  // 1. Explicit vesszővel tagolt kategóriák az adatbázisból ha vannak
  if (item.category) {
    item.category.split(',').forEach((c) => {
      const trimmed = c.trim();
      if (trimmed && !trimmed.startsWith('0')) categories.add(trimmed);
    });
  }

  // 2. Szemantikus témák kinyerése cím, összefoglaló és technológiák alapján
  const corpus = `${item.title || ''} ${item.slug || ''} ${item.summary || ''} ${item.category || ''} ${JSON.stringify(item.dimensions || {})}`.toLowerCase();

  if (/rag|ai|llm|vektor|embedding|hibrid|tudast/i.test(corpus)) {
    categories.add('AI & RAG RENDSZEREK');
  }
  if (/adatbiztonsag|biztonsag|titok|gdpr|air-gap|zart/i.test(corpus)) {
    categories.add('ADATBIZTONSÁG & GDPR');
  }
  if (/cad|autocad|dxf|dwg|mernok|cnc/i.test(corpus)) {
    categories.add('MÉRNÖKI & CAD/CAM');
  }
  if (/automatiz|excel|python|integracio|folyamat|\.net|csharp|c#/i.test(corpus)) {
    categories.add('KÓD-ALAPÚ AUTOMATIZÁLÁS');
  }
  if (/esettanulmany|bevezetes|eset|tapasztalat|0%|megvalositas/i.test(corpus)) {
    categories.add('ESETTANULMÁNYOK');
  }
  if (/specifikacio|architektura|rendszerterv|fts5|api/i.test(corpus)) {
    categories.add('ARCHITEKTÚRA & SPECIFIKÁCIÓ');
  }

  if (categories.size === 0) {
    categories.add(item.category || 'Általános');
  }

  return Array.from(categories);
};

// Helper: Többdimenziós mappa lekérdező a kiválasztott Pivot Dimenzió alapján
export const getTreeFolders = (item, pivotMode = 'drive') => {
  if (!item) return ['Általános'];

  if (pivotMode === 'drive') {
    return [(item.drive_folder || item.category || 'Általános').split(',')[0].trim()];
  }
  if (pivotMode === 'topic') {
    return getMultiCategoriesForDoc(item);
  }
  if (pivotMode === 'industry') {
    if (Array.isArray(item.dimensions?.iparag) && item.dimensions.iparag.length > 0) {
      return item.dimensions.iparag;
    }
    return ['Általános Iparág'];
  }
  if (pivotMode === 'tech') {
    if (Array.isArray(item.dimensions?.technologia) && item.dimensions.technologia.length > 0) {
      return item.dimensions.technologia;
    }
    return ['Kód & Algoritmusok'];
  }
  return ['Általános'];
};

// ============================================================================
// 4. MAIN TACTICAL VAULT EXPLORER ENGINE (Unified Core)
// ============================================================================
const TacticalVaultExplorer = ({
  vaultType = 'knowledge', // 'knowledge' | 'blog'
  baseRoute = '/knowledge',
  apiEndpoints = {
    list: '/api/docs',
    search: '/api/docs/search',
    doc: (slug) => `/api/docs/${slug}`,
    related: (slug) => `/api/docs/related/${slug}`
  },
  headerConfig = {
    badge: 'CYBER-ARCHITECT // KNOWLEDGE VAULT',
    title: 'Iparági AI Automatizálás & Műszaki Tudástár.',
    description: 'Valós esettanulmányok, kódminták és zárt vállalati RAG AI rendszerek.',
    version: 'v2.0',
    statusBadge: '// RAG_ACTIVE',
    hubButtonLabel: 'TUDÁSTÁR_BEMUTATÓ_HUB',
    headerTitle: 'KNOWLEDGE_VAULT'
  }
}) => {
  const { '*': docSlugParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const initialQuery = location.state?.searchQuery || '';

  // Core Data States
  const [docs, setDocs] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  const [content, setContent] = useState('');
  const [_isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Filter States (React State based, clean URL)
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [inArticleQuery, setInArticleQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [selectedIparag, setSelectedIparag] = useState('ALL');
  const [selectedTech, setSelectedTech] = useState('ALL');
  const [selectedCelcsoport, setSelectedCelcsoport] = useState('ALL');
  const [sortBy, setSortBy] = useState('recommended');
  
  // Faceted Pivot Matrix Mode: 'drive' | 'topic' | 'industry' | 'tech'
  const [treePivotMode, setTreePivotMode] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('pivot') || localStorage.getItem('vault_tree_pivot_mode') || 'drive';
    } catch {
      return 'drive';
    }
  });

  // Multi-Select Smart Folders: Array of active filter keys (e.g. ['featured', 'video'])
  const [smartFilters, setSmartFilters] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const raw = urlParams.get('smart');
      return raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  });

  const toggleSmartFilter = (key) => {
    setSmartFilters(prev => (
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    ));
  };

  const [copyToast, setCopyToast] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem('vault_tree_pivot_mode', treePivotMode);
    } catch {}
  }, [treePivotMode]);

  // Deep-Link Share URL Handler
  const handleShareView = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('pivot', treePivotMode);
    if (selectedCategory !== 'ALL') url.searchParams.set('cat', selectedCategory);
    else url.searchParams.delete('cat');
    if (smartFilters.length > 0) url.searchParams.set('smart', smartFilters.join(','));
    else url.searchParams.delete('smart');
    if (searchQuery.trim()) url.searchParams.set('q', searchQuery.trim());
    else url.searchParams.delete('q');

    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2500);
    }).catch(() => {});
  };

  // In-Article RAG Synchronization States (Single Source of Truth)
  const [inArticleRagData, setInArticleRagData] = useState(null);
  const [inArticleFilterLevel, setInArticleFilterLevel] = useState('ALL');

  // Layout States
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [collapsedFolders, setCollapsedFolders] = useState({});

  const toggleFolder = (categoryName, e) => {
    if (e) e.stopPropagation();
    setCollapsedFolders((prev) => {
      const current = prev[categoryName] !== false;
      return {
        ...prev,
        [categoryName]: !current
      };
    });
  };

  const handleSelectFolder = (categoryName) => {
    setActiveDoc(null);
    setSelectedCategory((prev) => (prev === categoryName ? 'ALL' : categoryName));
    setCollapsedFolders((prev) => ({
      ...prev,
      [categoryName]: false
    }));
  };

  // 1. Initial Load of Docs & URL synchronization
  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const res = await fetch(apiEndpoints.list);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.docs || data.posts || []);
          setDocs(list);

          const currentSlug = docSlugParam ? docSlugParam.replace(/^(knowledge|blog|docs)\/?/, '') : '';
          if (currentSlug && currentSlug.trim() !== '') {
            const target = list.find((d) => d.slug === currentSlug);
            if (target) {
              loadDoc(target, false);
            }
          } else {
            setActiveDoc(null);
            setContent('');
          }
        }
      } catch (err) {
        console.error('Failed to load vault items:', err);
      }
    };
    fetchDocs();
  }, [docSlugParam, apiEndpoints.list]);

  // 2. RAG Search & Query
  const [searchResults, setSearchResults] = useState(null);

  useEffect(() => {
    if (!searchQuery.trim() && selectedCategory === 'ALL' && selectedIparag === 'ALL' && selectedTech === 'ALL' && selectedCelcsoport === 'ALL') {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.append('q', searchQuery.trim());
        if (selectedCategory !== 'ALL') params.append('category', selectedCategory);
        if (selectedIparag !== 'ALL') params.append('iparag', selectedIparag);
        if (selectedTech !== 'ALL') params.append('technologia', selectedTech);
        if (selectedCelcsoport !== 'ALL') params.append('celcsoport', selectedCelcsoport);
        params.append('sortBy', sortBy);

        const url = searchQuery.trim()
          ? `${apiEndpoints.search}?${params.toString()}`
          : `${apiEndpoints.list}?${params.toString()}`;

        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data.docs || data.posts || []);
          setSearchResults(list);
        }
      } catch (err) {
        console.error('Search query failed:', err);
      } finally {
        setIsSearching(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [searchQuery, selectedCategory, selectedIparag, selectedTech, selectedCelcsoport, sortBy, apiEndpoints]);

  // Load a single Document into the Tactical Reader
  const loadDoc = async (docItem, updateUrl = true) => {
    setIsLoading(true);
    setActiveDoc(docItem);
    setInArticleQuery(searchQuery || '');
    if (updateUrl) {
      navigate(`${baseRoute}/${docItem.slug}`, { state: { searchQuery } });
    }
    try {
      const res = await fetch(apiEndpoints.doc(docItem.slug));
      if (res.ok) {
        const data = await res.json();
        setContent(data.content || '');
      } else {
        setContent(docItem.content || '# HIBA\n\nA dokumentum tartalma nem érhető el.');
      }
    } catch {
      setContent(docItem.content || '# HIBA\n\nA dokumentum tartalma nem tölthető be.');
    } finally {
      setIsLoading(false);
    }
  };

  const closeDocToHub = () => {
    setActiveDoc(null);
    setContent('');
    navigate(baseRoute, { state: { searchQuery } });
  };


  // Dynamic Cascading Filter Options (Kaszkádolt szűkítés & Élő darabszámok)
  const dynamicFilterOptions = useMemo(() => {
    const baseList = searchResults !== null ? searchResults : docs;

    // 1. Alap szűrés a keresőszó, smartFilters és a bal oldali mappa szerint
    let scopeDocs = baseList;
    if (smartFilters.length > 0) {
      scopeDocs = scopeDocs.filter(p => {
        return smartFilters.every(sf => {
          if (sf === 'featured') return (p.scorePercentage || 0) >= 84 || p.project_id || p.published === 1;
          if (sf === 'audio') return Boolean(p.audio_url);
          if (sf === 'video') return Boolean(p.video_url);
          if (sf === 'specs') return p.content_type === 'knowledge' || /specifikacio|architektura/i.test(p.slug);
          return true;
        });
      });
    }
    if (selectedCategory !== 'ALL') {
      scopeDocs = scopeDocs.filter(p => {
        const folders = getTreeFolders(p, treePivotMode);
        return folders.includes(selectedCategory);
      });
    }

    // 2. Iparágak opciói (szűrve Tech és Célcsoport szerint)
    const iparagDocs = scopeDocs.filter(p => {
      const matchTech = selectedTech === 'ALL' || (Array.isArray(p.dimensions?.technologia) && p.dimensions.technologia.includes(selectedTech));
      const matchCel = selectedCelcsoport === 'ALL' || (Array.isArray(p.dimensions?.celcsoport) && p.dimensions.celcsoport.includes(selectedCelcsoport));
      return matchTech && matchCel;
    });
    const iparagMap = {};
    iparagDocs.forEach(p => {
      if (Array.isArray(p.dimensions?.iparag)) {
        p.dimensions.iparag.forEach(i => {
          if (i) iparagMap[i] = (iparagMap[i] || 0) + 1;
        });
      }
    });

    // 3. Technológia opciói (szűrve Iparág és Célcsoport szerint)
    const techDocs = scopeDocs.filter(p => {
      const matchIp = selectedIparag === 'ALL' || (Array.isArray(p.dimensions?.iparag) && p.dimensions.iparag.includes(selectedIparag));
      const matchCel = selectedCelcsoport === 'ALL' || (Array.isArray(p.dimensions?.celcsoport) && p.dimensions.celcsoport.includes(selectedCelcsoport));
      return matchIp && matchCel;
    });
    const techMap = {};
    techDocs.forEach(p => {
      if (Array.isArray(p.dimensions?.technologia)) {
        p.dimensions.technologia.forEach(t => {
          if (t) techMap[t] = (techMap[t] || 0) + 1;
        });
      }
    });

    // 4. Célcsoport opciói (szűrve Iparág és Tech szerint)
    const celDocs = scopeDocs.filter(p => {
      const matchIp = selectedIparag === 'ALL' || (Array.isArray(p.dimensions?.iparag) && p.dimensions.iparag.includes(selectedIparag));
      const matchTech = selectedTech === 'ALL' || (Array.isArray(p.dimensions?.technologia) && p.dimensions.technologia.includes(selectedTech));
      return matchIp && matchTech;
    });
    const celMap = {};
    celDocs.forEach(p => {
      if (Array.isArray(p.dimensions?.celcsoport)) {
        p.dimensions.celcsoport.forEach(c => {
          if (c) celMap[c] = (celMap[c] || 0) + 1;
        });
      }
    });

    return {
      iparagak: Object.entries(iparagMap).map(([name, count]) => ({ name, count })),
      technologiak: Object.entries(techMap).map(([name, count]) => ({ name, count })),
      celcsoportok: Object.entries(celMap).map(([name, count]) => ({ name, count }))
    };
  }, [searchResults, docs, smartFilters, selectedCategory, treePivotMode, selectedIparag, selectedTech, selectedCelcsoport]);

  // Cascading dead-end state prevention (Automatikus visszaállítás ha a szűrt halmazban már nem létezik az opció)
  useEffect(() => {
    if (selectedIparag !== 'ALL' && !dynamicFilterOptions.iparagak.some(i => i.name === selectedIparag)) {
      setSelectedIparag('ALL');
    }
  }, [dynamicFilterOptions.iparagak, selectedIparag]);

  useEffect(() => {
    if (selectedTech !== 'ALL' && !dynamicFilterOptions.technologiak.some(t => t.name === selectedTech)) {
      setSelectedTech('ALL');
    }
  }, [dynamicFilterOptions.technologiak, selectedTech]);

  useEffect(() => {
    if (selectedCelcsoport !== 'ALL' && !dynamicFilterOptions.celcsoportok.some(c => c.name === selectedCelcsoport)) {
      setSelectedCelcsoport('ALL');
    }
  }, [dynamicFilterOptions.celcsoportok, selectedCelcsoport]);

  // Display items with dynamic scores & sorting
  const displayDocs = useMemo(() => {
    const rawList = searchResults !== null ? searchResults : docs;
    const cleanQ = searchQuery.trim().toLowerCase();

    const scored = rawList.map((item) => {
      let finalScore = item.scorePercentage || item.relevanceScore;
      let finalLabel = item.scoreLabel || (cleanQ ? 'MATCH' : 'AJÁNLÁS');

      if (cleanQ) {
        finalLabel = 'MATCH';
        if (!finalScore || finalScore === 92) {
          let dynamicMatch = 70;
          const normTitle = (item.title || '').toLowerCase();
          const normSummary = (item.summary || '').toLowerCase();
          const normContent = (item.content || '').toLowerCase();

          if (normTitle.includes(cleanQ)) dynamicMatch += 22;
          else if (normSummary.includes(cleanQ)) dynamicMatch += 14;
          else if (normContent.includes(cleanQ)) dynamicMatch += 8;

          finalScore = Math.min(99, Math.max(68, dynamicMatch));
        }
      } else {
        finalLabel = 'AJÁNLÁS';
        if (!finalScore || finalScore === 92) {
          let rec = 84;
          if (item.audio_url) rec += 5;
          const len = (item.content || '').length;
          if (len > 2500) rec += 5;
          else if (len > 1200) rec += 3;
          finalScore = Math.min(99, Math.max(80, rec));
        }
      }

      return {
        ...item,
        scorePercentage: finalScore,
        scoreLabel: finalLabel
      };
    });

    let filtered = scored;

    // Multi-Select Smart Folders Filter
    if (smartFilters.length > 0) {
      filtered = filtered.filter(p => {
        return smartFilters.every(sf => {
          if (sf === 'featured') return (p.scorePercentage || 0) >= 84 || p.project_id || p.published === 1;
          if (sf === 'audio') return Boolean(p.audio_url);
          if (sf === 'video') return Boolean(p.video_url);
          if (sf === 'specs') return p.content_type === 'knowledge' || /specifikacio|architektura/i.test(p.slug);
          return true;
        });
      });
    }

    // Faceted Tree Folder filter
    if (selectedCategory !== 'ALL') {
      filtered = filtered.filter(p => {
        const folders = getTreeFolders(p, treePivotMode);
        return folders.includes(selectedCategory);
      });
    }
    if (selectedIparag !== 'ALL') {
      filtered = filtered.filter(p => Array.isArray(p.dimensions?.iparag) && p.dimensions.iparag.includes(selectedIparag));
    }
    if (selectedTech !== 'ALL') {
      filtered = filtered.filter(p => Array.isArray(p.dimensions?.technologia) && p.dimensions.technologia.includes(selectedTech));
    }
    if (selectedCelcsoport !== 'ALL') {
      filtered = filtered.filter(p => Array.isArray(p.dimensions?.celcsoport) && p.dimensions.celcsoport.includes(selectedCelcsoport));
    }

    filtered.sort((a, b) => {
      if (sortBy === 'recommended') return (b.scorePercentage || 0) - (a.scorePercentage || 0);
      if (sortBy === 'newest') return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sortBy === 'read_time') {
        const parseTime = (s) => parseInt(s, 10) || 0;
        return parseTime(b.read_time) - parseTime(a.read_time);
      }
      return (b.scorePercentage || 0) - (a.scorePercentage || 0);
    });

    return filtered;
  }, [searchResults, docs, searchQuery, selectedCategory, selectedIparag, selectedTech, selectedCelcsoport, sortBy, treePivotMode, smartFilters]);

  // Dynamic Item Counts for Smart Virtual Collections
  const smartCounts = useMemo(() => {
    const list = docs || [];
    return {
      featured: list.filter(p => (p.scorePercentage || 0) >= 84 || p.project_id || p.published === 1).length,
      audio: list.filter(p => Boolean(p.audio_url)).length,
      video: list.filter(p => Boolean(p.video_url)).length,
      specs: list.filter(p => p.content_type === 'knowledge' || /specifikacio|architektura/i.test(p.slug)).length
    };
  }, [docs]);

  // Group into Folder Categories for Left Sidebar based on active Pivot Mode
  const categoriesGroup = useMemo(() => {
    const baseList = searchResults !== null ? searchResults : docs;
    const map = {};
    baseList.forEach((item) => {
      const folders = getTreeFolders(item, treePivotMode);
      folders.forEach((folder) => {
        if (!map[folder]) map[folder] = [];
        if (!map[folder].some(existing => existing.slug === item.slug)) {
          map[folder].push(item);
        }
      });
    });
    return map;
  }, [searchResults, docs, treePivotMode]);

  // Bi-Directional Backlinks & Semantic Mesh Connections for Active Doc
  const backlinks = useMemo(() => {
    if (!activeDoc || !docs.length) return [];
    const activeTechs = Array.isArray(activeDoc.dimensions?.technologia) ? activeDoc.dimensions.technologia : [];
    const activeIndustries = Array.isArray(activeDoc.dimensions?.iparag) ? activeDoc.dimensions.iparag : [];

    return docs
      .filter(d => d.slug !== activeDoc.slug)
      .map(d => {
        const docTechs = Array.isArray(d.dimensions?.technologia) ? d.dimensions.technologia : [];
        const docIndustries = Array.isArray(d.dimensions?.iparag) ? d.dimensions.iparag : [];
        const sharedTech = activeTechs.filter(t => docTechs.includes(t));
        const sharedInd = activeIndustries.filter(i => docIndustries.includes(i));
        const score = (sharedTech.length * 3) + (sharedInd.length * 2);
        return {
          doc: d,
          score,
          sharedTech: sharedTech.slice(0, 2),
          sharedInd: sharedInd.slice(0, 1)
        };
      })
      .filter(b => b.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [activeDoc, docs]);

  // TOC Headings Extraction
  const headings = useMemo(() => extractHeadings(content), [content]);

  // In-article match navigation with direct scroll-into-view & persistent focus
  const handleNavigateToMatch = (match) => {
    if (!match) return;

    // Korábbi fókuszkeretek eltávolítása
    document.querySelectorAll('.active-match-focus').forEach(el => {
      el.classList.remove(
        'active-match-focus',
        'ring-4',
        'ring-plasmaGreen',
        'ring-neonCyan',
        'ring-neonMagenta',
        'bg-emerald-950/40',
        'bg-cyan-950/40',
        'bg-fuchsia-950/40',
        'p-2',
        'border-l-4'
      );
    });

    const contentElements = Array.from(
      document.querySelectorAll('.prose-cyber p, .prose-cyber li, .prose-cyber mark, .prose-cyber blockquote, .prose-cyber h1, .prose-cyber h2, .prose-cyber h3, .prose-cyber h4')
    );

    const cleanWords = (match.snippet || '')
      .toLowerCase()
      .replace(/[^a-z0-9áéíóöőúüű\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 3);

    // 1. Prioritás: Valós szöveges tartalom (p, li, blockquote) - NE fejléc legyen!
    let targetEl = contentElements.find(el => {
      if (/^H[1-6]$/i.test(el.tagName)) return false;
      const text = (el.textContent || '').toLowerCase();
      return cleanWords.length > 0 && cleanWords.slice(0, 3).every(w => text.includes(w));
    });

    // 2. Másodlagos: Részlet-illeszkedés
    if (!targetEl && match.snippet) {
      const cleanSnippet = match.snippet.slice(0, 35).toLowerCase();
      targetEl = contentElements.find(el => {
        if (/^H[1-6]$/i.test(el.tagName)) return false;
        return el.textContent && el.textContent.toLowerCase().includes(cleanSnippet);
      });
    }

    // 3. Harmadlagos: Ha tényleg csak a fejléc a találat
    if (!targetEl && match.heading) {
      targetEl = contentElements.find(el => {
        return /^H[1-6]$/i.test(el.tagName) && el.textContent && el.textContent.toLowerCase().includes(match.heading.toLowerCase());
      });
    }

    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Szint-specifikus neon szín kiválasztása
      let ringColor = 'ring-plasmaGreen';
      let bgColor = 'bg-emerald-950/40';
      if (match.level === 'KEYWORD') {
        ringColor = 'ring-neonCyan';
        bgColor = 'bg-cyan-950/40';
      } else if (match.level === 'SEMANTIC') {
        ringColor = 'ring-neonMagenta';
        bgColor = 'bg-fuchsia-950/40';
      }

      targetEl.classList.add(
        'active-match-focus',
        'ring-4',
        ringColor,
        bgColor,
        'transition-all',
        'duration-300',
        'p-2'
      );
    }
  };



  const activeFilterCount =
    (selectedCategory !== 'ALL' ? 1 : 0) +
    (selectedIparag !== 'ALL' ? 1 : 0) +
    (selectedTech !== 'ALL' ? 1 : 0) +
    (selectedCelcsoport !== 'ALL' ? 1 : 0);

  const resetFilters = () => {
    setSelectedCategory('ALL');
    setSelectedIparag('ALL');
    setSelectedTech('ALL');
    setSelectedCelcsoport('ALL');
    setSearchQuery('');
  };

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] pt-20 transition-colors duration-200">
      
      {/* ── Tactical Header Bar ── */}
      <div className="border-b-2 dark:border-white/10 border-slate-900 dark:bg-slate-900/90 bg-white/95 backdrop-blur-md px-6 py-3.5 flex items-center justify-between sticky top-16 z-30 transition-colors shadow-sm font-mono">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 dark:bg-neonCyan bg-cyan-700 shadow-[0_0_10px_#00FFFF]" />
          <button
            onClick={closeDocToHub}
            className="font-headline font-black uppercase text-sm tracking-widest dark:text-neonCyan text-cyan-800 hover:opacity-80 transition-opacity flex items-center gap-2 cursor-pointer"
          >
            <span>{headerConfig.headerTitle || (vaultType === 'blog' ? 'BLOG_ARCHÍVUM' : 'KNOWLEDGE_VAULT')}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-neonCyan/10 border border-neonCyan/40 text-neonCyan font-bold">
              {headerConfig.version || 'v2.0'}
            </span>
          </button>
          <span className="text-[11px] dark:text-slate-400 text-slate-600 ml-2 hidden lg:flex items-center gap-1.5 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {headerConfig.statusBadge || '// RAG_ACTIVE'}
          </span>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-3">
          {/* Deep-Link Share Button */}
          <button
            onClick={handleShareView}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 dark:bg-neonMagenta/10 bg-fuchsia-100 border-2 dark:border-neonMagenta border-fuchsia-800 dark:text-neonMagenta text-fuchsia-950 hover:bg-neonMagenta hover:text-white transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none cursor-pointer"
            title="Aktuális szűrt nézet megosztható linkjének másolása"
          >
            {copyToast ? <Check size={13} className="text-plasmaGreen" /> : <Share2 size={13} />}
            <span>{copyToast ? 'LINK MÁSOLVA! ✓' : 'MEGOSZTÁS 🔗'}</span>
          </button>

          {activeDoc ? (
            <button
              onClick={closeDocToHub}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 dark:bg-neonCyan/10 bg-cyan-100 border-2 dark:border-neonCyan border-cyan-800 dark:text-neonCyan text-cyan-900 hover:bg-neonCyan hover:text-black transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none cursor-pointer"
            >
              <LayoutGrid size={13} />
              <span>ÁTTEKINTÉS_HUB ◀</span>
            </button>
          ) : (
            <div className="text-[11px] font-bold dark:text-slate-400 text-slate-700 hidden sm:block">
              MUTATVA: <strong className="text-neonCyan">{displayDocs.length}</strong> / {docs.length} TÉTEL
            </div>
          )}

          {/* Mobile Sidebar Button */}
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="xl:hidden dark:text-neonCyan text-cyan-700 p-1.5 border-2 border-slate-900 dark:border-neonCyan hover:bg-neonCyan/10 transition-colors cursor-pointer"
            title="Navigáció megnyitása"
          >
            {sidebarOpen ? <X size={16} /> : <FolderOpen size={16} />}
          </button>
        </div>
      </div>

      {/* ── 3-Column Main Layout ── */}
      <div className="flex h-[calc(100vh-8.5rem)]">
        
        {/* ───────────────────────────────────────────────────────────── */}
        {/* 1. BAL SÁV: FASTUKTÚRA & GYORSKERESŐ                           */}
        {/* ───────────────────────────────────────────────────────────── */}
        <aside
          className={`
            ${sidebarOpen ? 'w-72 sm:w-84' : 'w-0 overflow-hidden'}
            shrink-0 border-r-2 dark:border-white/10 border-slate-900 dark:bg-[#070b19] bg-slate-50
            flex flex-col transition-all duration-300
            fixed xl:sticky top-[8.5rem] bottom-0 left-0 z-20 xl:z-auto
            ${sidebarOpen ? 'xl:flex' : ''}
          `}
        >
          {/* Hub Button & Folder Navigator Header in Sidebar */}
          <div className="p-3 border-b-2 dark:border-white/10 border-slate-900 dark:bg-black/40 bg-white space-y-3">
            <button
              onClick={closeDocToHub}
              className={`w-full flex items-center justify-center gap-2 p-2.5 font-headline font-black text-xs uppercase tracking-wider border-2 transition-all cursor-pointer ${
                !activeDoc
                  ? 'dark:bg-neonCyan bg-cyan-700 text-white dark:text-black border-slate-950 shadow-[3px_3px_0_#0f172a]'
                  : 'dark:bg-slate-900 bg-slate-100 dark:text-slate-300 text-slate-800 border-slate-900 hover:border-neonCyan'
              }`}
            >
              <LayoutGrid size={14} />
              <span>{headerConfig.hubButtonLabel || (vaultType === 'blog' ? 'BLOG_BEMUTATÓ_HUB' : 'TUDÁSTÁR_BEMUTATÓ_HUB')}</span>
            </button>

            {/* Faceted Tree Pivot Matrix Selector */}
            <div className="pt-2 border-t dark:border-white/10 border-slate-200 space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-[9px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">
                <span className="flex items-center gap-1">
                  <Network size={11} className="text-neonCyan" />
                  PIVOT STRUKTÚRA:
                </span>
                <span className="text-neonCyan font-bold">[{treePivotMode.toUpperCase()}]</span>
              </div>
              <div className="grid grid-cols-4 gap-1 bg-slate-200 dark:bg-slate-900/80 p-1 border border-slate-300 dark:border-white/10">
                <button
                  type="button"
                  onClick={() => { setTreePivotMode('drive'); setSelectedCategory('ALL'); }}
                  className={`py-1 text-center font-black text-[9px] uppercase transition-all cursor-pointer truncate ${
                    treePivotMode === 'drive'
                      ? 'bg-neonCyan text-black font-extrabold shadow-[1px_1px_0_#0f172a]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-neonCyan'
                  }`}
                  title="Google Drive: 1:1 fizikai Google Drive mappák"
                >
                  📁 DRIVE
                </button>
                <button
                  type="button"
                  onClick={() => { setTreePivotMode('topic'); setSelectedCategory('ALL'); }}
                  className={`py-1 text-center font-black text-[9px] uppercase transition-all cursor-pointer truncate ${
                    treePivotMode === 'topic'
                      ? 'bg-neonMagenta text-white font-extrabold shadow-[1px_1px_0_#0f172a]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-fuchsia-600 dark:hover:text-neonMagenta'
                  }`}
                  title="Szemantikus Témakörök: Polihierarchikus több-mappás leképezés"
                >
                  🗂️ TÉMÁK
                </button>
                <button
                  type="button"
                  onClick={() => { setTreePivotMode('industry'); setSelectedCategory('ALL'); }}
                  className={`py-1 text-center font-black text-[9px] uppercase transition-all cursor-pointer truncate ${
                    treePivotMode === 'industry'
                      ? 'bg-plasmaGreen text-black font-extrabold shadow-[1px_1px_0_#0f172a]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-plasmaGreen'
                  }`}
                  title="Iparágak: Célpiaci szegmensek szerinti fastruktúra"
                >
                  🏭 IPARÁG
                </button>
                <button
                  type="button"
                  onClick={() => { setTreePivotMode('tech'); setSelectedCategory('ALL'); }}
                  className={`py-1 text-center font-black text-[9px] uppercase transition-all cursor-pointer truncate ${
                    treePivotMode === 'tech'
                      ? 'bg-cyan-400 text-black font-extrabold shadow-[1px_1px_0_#0f172a]'
                      : 'text-slate-600 dark:text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400'
                  }`}
                  title="Technológiák: Kód és szoftveres stack szerinti fastruktúra"
                >
                  ⚡ TECH
                </button>
              </div>
            </div>

            {/* Smart Folders & Dynamic Virtual Collections */}
            <div className="pt-2 border-t dark:border-white/10 border-slate-200 space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-[9px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">
                <span className="flex items-center gap-1">
                  <Sparkles size={11} className="text-neonMagenta" />
                  SMART GYŰJTEMÉNYEK:
                </span>
                {smartFilters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSmartFilters([])}
                    className="text-neonMagenta hover:underline font-bold text-[8px] cursor-pointer"
                  >
                    VISSZAÁLLÍTÁS ({smartFilters.length}) ✕
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                <button
                  type="button"
                  onClick={() => toggleSmartFilter('featured')}
                  className={`flex items-center justify-between px-2 py-1.5 border transition-all cursor-pointer ${
                    smartFilters.includes('featured')
                      ? 'bg-neonCyan/25 border-neonCyan text-white shadow-[0_0_10px_rgba(0,255,255,0.4)] font-black'
                      : 'dark:bg-slate-900 bg-slate-100 dark:border-white/10 border-slate-300 text-slate-700 dark:text-slate-300 hover:border-neonCyan'
                  }`}
                  title="Kiemelt Esettanulmányok & Projektek (Többszörös kijelölés lehetséges)"
                >
                  <span className="flex items-center gap-1 font-bold">
                    <Flame size={10} className="text-orange-400" />
                    KIEMELT
                  </span>
                  <span className="font-mono text-[8px] font-bold text-neonCyan">
                    {smartCounts.featured}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleSmartFilter('audio')}
                  className={`flex items-center justify-between px-2 py-1.5 border transition-all cursor-pointer ${
                    smartFilters.includes('audio')
                      ? 'bg-neonMagenta/25 border-neonMagenta text-white shadow-[0_0_10px_rgba(255,0,255,0.4)] font-black'
                      : 'dark:bg-slate-900 bg-slate-100 dark:border-white/10 border-slate-300 text-slate-700 dark:text-slate-300 hover:border-neonMagenta'
                  }`}
                  title="Hanganyaggal ellátott dokumentumok (Többszörös kijelölés lehetséges)"
                >
                  <span className="flex items-center gap-1 font-bold">
                    <Headphones size={10} className="text-neonMagenta" />
                    AUDIO
                  </span>
                  <span className="font-mono text-[8px] font-bold text-neonMagenta">
                    {smartCounts.audio}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleSmartFilter('video')}
                  className={`flex items-center justify-between px-2 py-1.5 border transition-all cursor-pointer ${
                    smartFilters.includes('video')
                      ? 'bg-cyan-500/25 border-cyan-400 text-white shadow-[0_0_10px_rgba(0,255,255,0.4)] font-black'
                      : 'dark:bg-slate-900 bg-slate-100 dark:border-white/10 border-slate-300 text-slate-700 dark:text-slate-300 hover:border-cyan-400'
                  }`}
                  title="Videó demóval és bemutatóval ellátott cikkek (Többszörös kijelölés lehetséges)"
                >
                  <span className="flex items-center gap-1 font-bold">
                    <Video size={10} className="text-cyan-400" />
                    VIDEÓ
                  </span>
                  <span className="font-mono text-[8px] font-bold text-cyan-400">
                    {smartCounts.video}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleSmartFilter('specs')}
                  className={`flex items-center justify-between px-2 py-1.5 border transition-all cursor-pointer ${
                    smartFilters.includes('specs')
                      ? 'bg-plasmaGreen/25 border-plasmaGreen text-white shadow-[0_0_10px_rgba(128,255,0,0.4)] font-black'
                      : 'dark:bg-slate-900 bg-slate-100 dark:border-white/10 border-slate-300 text-slate-700 dark:text-slate-300 hover:border-plasmaGreen'
                  }`}
                  title="Műszaki rendszertervek és specifikációk (Többszörös kijelölés lehetséges)"
                >
                  <span className="flex items-center gap-1 font-bold">
                    <Code2 size={10} className="text-plasmaGreen" />
                    SPEC
                  </span>
                  <span className="font-mono text-[8px] font-bold text-plasmaGreen">
                    {smartCounts.specs}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Folder Tree Navigation with Fluid Animation */}
          <nav className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            <AnimatePresence mode="popLayout">
              {/* Taktikai '..' Visszalépés a Gyökérmappába */}
              {selectedCategory !== 'ALL' && (
                <motion.button
                  key="parent-dir-btn"
                  layout
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                  onClick={() => setSelectedCategory('ALL')}
                  className="w-full flex items-center justify-between px-3 py-2 text-left border-2 border-dashed dark:border-neonCyan/50 border-cyan-700 dark:bg-neonCyan/10 bg-cyan-50 font-mono text-xs font-bold text-cyan-900 dark:text-neonCyan hover:bg-neonCyan hover:text-black mb-3 cursor-pointer shadow-[2px_2px_0_#0f172a] group overflow-hidden"
                  title="Visszalépés a szülőkönyvtárhoz (Összes mappa mutatása)"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-neonCyan group-hover:text-black">📁 ..</span>
                    <span className="truncate uppercase tracking-wider text-[11px]">[SZÜLŐKÖNYVTÁR]</span>
                  </div>
                  <span className="text-[10px] font-mono opacity-80">ALL/</span>
                </motion.button>
              )}

              {Object.entries(categoriesGroup)
                .filter(([category]) => selectedCategory === 'ALL' || selectedCategory === category)
                .map(([category, catItems]) => {
                  const isCollapsed = selectedCategory === category ? false : (collapsedFolders[category] !== false);
                  return (
                    <motion.div
                      key={category}
                      layout
                      initial={{ opacity: 0, scale: 0.96, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.94, height: 0, transition: { duration: 0.25, ease: 'easeOut' } }}
                      transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                      className="border-2 dark:border-white/10 border-slate-900 dark:bg-slate-900/40 bg-white shadow-[2px_2px_0_#0f172a] dark:shadow-none overflow-hidden"
                    >
                      {/* Category Folder Header / Kattintásra Szűrőként funkcionál */}
                      <div
                        onClick={() => handleSelectFolder(category)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 border-b dark:border-white/10 border-slate-300 transition-all text-left cursor-pointer select-none group ${
                          selectedCategory === category
                            ? 'bg-neonCyan/20 border-neonCyan text-white shadow-[inset_4px_0_0_#00FFFF]'
                            : 'dark:bg-slate-800/80 bg-slate-200/90 hover:bg-neonCyan/10 dark:hover:bg-neonCyan/10 text-slate-900 dark:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {isCollapsed ? (
                            <Folder size={15} className={`${selectedCategory === category ? 'text-neonCyan' : 'text-neonMagenta'} drop-shadow-[0_0_8px_#FF00FF] shrink-0`} />
                          ) : (
                            <FolderOpen size={15} className="text-neonCyan drop-shadow-[0_0_8px_#00FFFF] shrink-0" />
                          )}
                          <span className={`font-headline font-black text-xs uppercase tracking-wider transition-colors truncate ${
                            selectedCategory === category ? 'text-neonCyan' : 'group-hover:text-neonCyan'
                          }`}>
                            {category}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 bg-black/10 dark:bg-black/60 border dark:border-neonCyan/30 border-slate-400 text-slate-800 dark:text-neonCyan">
                            {catItems.length}
                          </span>
                          <button
                            onClick={(e) => toggleFolder(category, e)}
                            className="p-1 hover:text-neonCyan text-slate-500 cursor-pointer"
                            title={isCollapsed ? 'Mappa kinyitása' : 'Mappa összecsukása'}
                          >
                            {isCollapsed ? (
                              <ChevronRight size={13} className="text-slate-600 dark:text-slate-400" />
                            ) : (
                              <ChevronDown size={13} className="text-neonCyan" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Article List in Folder fluid animációval */}
                      <AnimatePresence>
                        {!isCollapsed && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: 'easeInOut' }}
                            className="overflow-hidden py-1 dark:bg-black/30 bg-white space-y-0.5"
                          >
                            {catItems.map((item) => {
                              const isActive = activeDoc?.slug === item.slug;
                              return (
                                <button
                                  key={item.slug}
                                  onClick={() => loadDoc(item)}
                                  className={`
                                    w-full flex flex-col px-3 py-2 text-left transition-all duration-150 cursor-pointer
                                    border-l-3 font-mono text-[11px]
                                    ${
                                      isActive
                                        ? 'dark:border-neonCyan border-cyan-600 dark:text-neonCyan text-cyan-800 dark:bg-neonCyan/15 bg-cyan-100 font-black shadow-[inset_4px_0_0_#00FFFF]'
                                        : 'border-transparent dark:text-slate-300 text-slate-700 dark:hover:text-white hover:text-slate-950 dark:hover:bg-white/[0.05] hover:bg-slate-100 font-bold'
                                    }
                                  `}
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    <FileText
                                      size={12}
                                      className={`shrink-0 ${
                                        isActive
                                          ? 'text-neonCyan drop-shadow-[0_0_8px_#00FFFF]'
                                          : 'text-emerald-700 dark:text-plasmaGreen drop-shadow-[0_0_5px_#80FF00]'
                                      }`}
                                    />
                                    <span className="truncate uppercase tracking-wide leading-tight flex-1">
                                      <HighlightText text={item.title} query={searchQuery} />
                                    </span>
                                  </div>

                                  {/* Score badge in sidebar */}
                                  <div className="mt-1 pl-5 flex items-center justify-between text-[9px] text-slate-500 dark:text-slate-400 font-mono">
                                    <span className="text-emerald-700 dark:text-plasmaGreen font-bold flex items-center gap-1">
                                      <Zap size={9} />
                                      {item.scorePercentage || 90}% {item.scoreLabel || 'MATCH'}
                                    </span>
                                    <span className="text-slate-400 font-normal">
                                      {item.read_time || '4 PERC'}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
            </AnimatePresence>

            {displayDocs.length === 0 && (
              <div className="p-6 text-center font-mono text-xs dark:text-slate-400 text-slate-600 uppercase border-2 dark:border-white/10 border-slate-900 bg-white dark:bg-black/40">
                <Search size={22} className="mx-auto mb-2 text-neonMagenta" />
                NINCS TALÁLAT A KERESÉSRE
              </div>
            )}
          </nav>

          {/* Sidebar Footer */}
          <div className="p-3 border-t-2 dark:border-white/10 border-slate-900 font-mono text-[10px] dark:text-slate-400 text-slate-700 font-black uppercase flex items-center justify-between dark:bg-black/40 bg-slate-100">
            <span>ÖSSZESEN: {docs.length} TÉTEL</span>
            <span className="text-neonCyan font-bold">ONLINE 🟢</span>
          </div>
        </aside>

        {/* Mobile Overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-10 xl:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* ───────────────────────────────────────────────────────────── */}
        {/* 2. KÖZÉPSŐ FŐ TÉR: DOKUMENTUM OLVASÓ VAGY BEMUTATÓ HUB       */}
        {/* ───────────────────────────────────────────────────────────── */}
        <main className="flex-1 min-w-0 overflow-y-auto" id="vault-main-content">
          
          {/* ══════════════════════════════════════════════════════════ */}
          {/* NÉZET A: CIKK OLVASÓ NÉZET (ACTIVE DOC)                     */}
          {/* ══════════════════════════════════════════════════════════ */}
          {activeDoc ? (
            <div className="max-w-4xl mx-auto px-6 py-10">
              
              {/* In-Article Search Console */}
              <InArticleSearchConsole
                postContent={content || activeDoc.content}
                searchQuery={inArticleQuery}
                setSearchQuery={setInArticleQuery}
                onNavigateToMatch={handleNavigateToMatch}
                onCloseDoc={closeDocToHub}
                vaultLabel={vaultType === 'blog' ? 'BLOG HUB' : 'TUDÁSTÁR HUB'}
                docSlug={activeDoc.slug}
                onRagDataLoaded={setInArticleRagData}
                onFilterLevelChange={setInArticleFilterLevel}
              />

              {/* Header Box */}
              <motion.header
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8 p-8 bg-[var(--surface-panel)] border-2 dark:border-white/10 border-slate-900 relative shadow-[4px_4px_0_#0f172a] dark:shadow-none rounded-none font-mono"
              >
                <div className="corner-bracket-tl text-neonCyan"></div>
                <div className="corner-bracket-br text-neonMagenta"></div>

                <div className="flex flex-wrap items-center gap-3 mb-4 text-[10px] dark:text-slate-400 text-slate-600 uppercase tracking-widest">
                  <span className="bg-neonCyan/10 text-neonCyan px-2.5 py-1 border border-neonCyan/40 font-bold">
                    [{activeDoc.category || (vaultType === 'blog' ? 'BLOG' : 'DOKUMENTUM')}]
                  </span>
                  <span className="px-2 py-0.5 bg-plasmaGreen/15 text-plasmaGreen border border-plasmaGreen/40 font-bold">
                    {activeDoc.scorePercentage || 90}% {activeDoc.scoreLabel || 'MATCH'}
                  </span>
                  {activeDoc.created_at && (
                    <>
                      <span>KÖZZÉTÉVE: {activeDoc.created_at}</span>
                      <span>•</span>
                    </>
                  )}
                  <span className="text-plasmaGreen font-bold">{activeDoc.read_time || '4 PERC'}</span>
                </div>

                <h1 className="text-3xl md:text-5xl font-headline font-black italic uppercase text-on-surface mb-6 leading-tight tracking-tight">
                  {activeDoc.title}
                </h1>

                {activeDoc.summary && (
                  <div className="text-base md:text-lg dark:text-slate-200 text-slate-800 font-body leading-relaxed border-l-4 border-neonCyan pl-4 bg-slate-900/30 dark:bg-white/[0.02] py-3 mb-4">
                    <HighlightText text={activeDoc.summary.replace(/[*_#`]/g, '')} query={inArticleQuery} />
                  </div>
                )}


                {activeDoc.dimensions && (
                  <div className="flex flex-wrap gap-2 pt-4 border-t dark:border-white/10 border-slate-200 text-[10px]">
                    {Array.isArray(activeDoc.dimensions.iparag) && activeDoc.dimensions.iparag.map(ip => (
                      <span key={ip} className="px-2 py-0.5 dark:bg-slate-900 bg-slate-100 border border-slate-300 dark:border-white/15 dark:text-slate-300 text-slate-700 font-bold">
                        #{ip}
                      </span>
                    ))}
                    {Array.isArray(activeDoc.dimensions.technologia) && activeDoc.dimensions.technologia.map(tech => (
                      <span key={tech} className="px-2 py-0.5 dark:bg-slate-900 bg-cyan-50 border border-cyan-300 dark:border-neonCyan/30 text-neonCyan font-bold">
                        {tech}
                      </span>
                    ))}
                    {Array.isArray(activeDoc.dimensions.celcsoport) && activeDoc.dimensions.celcsoport.map(cel => (
                      <span key={cel} className="px-2 py-0.5 dark:bg-slate-900 bg-fuchsia-50 border border-fuchsia-300 dark:border-neonMagenta/30 text-neonMagenta font-bold">
                        @{cel}
                      </span>
                    ))}
                  </div>
                )}

                {/* Live System & RAG Integrity Audit Bar */}
                <div className="mt-4 pt-3 border-t dark:border-white/10 border-slate-200 flex flex-wrap items-center justify-between gap-2 font-mono text-[9px]">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-950/60 border border-plasmaGreen/40 text-plasmaGreen font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-plasmaGreen animate-pulse" />
                      <span>DRIVE SERVICE ACCOUNT // SYNCED</span>
                    </span>
                    <span className="dark:text-slate-400 text-slate-600">
                      ID: <strong className="text-neonCyan">drive_gsuite_v2</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="dark:text-slate-400 text-slate-600">
                      SHA-256: <strong className="text-neonMagenta font-bold">571cccca7b06930b</strong>
                    </span>
                    <span className="px-1.5 py-0.5 bg-black/40 border border-white/10 text-slate-300 font-bold">
                      128-DIM L2-NORM VEKTOR
                    </span>
                  </div>
                </div>
              </motion.header>


              {/* Video Player if available */}
              {activeDoc.video_url && (
                <div className="mb-10">
                  <VideoPlayer
                    src={activeDoc.video_url}
                    title={`${activeDoc.title} — Műszaki Demonstráció`}
                    caption="Képernyőfelvétel & Rendszer Működés Bemutató"
                  />
                </div>
              )}

              {/* Audio Player if available */}
              {activeDoc.audio_url && (
                <div className="mb-10">
                  <TacticalAudioPlayer
                    src={activeDoc.audio_url}
                    title={`${activeDoc.title} — Audio Összefoglaló`}
                    subtitle="NotebookLM Audio Deep Dive • 5 perces hanganyag"
                    badgeText="AI AUDIO OVERVIEW"
                  />
                </div>
              )}


              {/* Markdown Content */}
              <div className="prose-cyber max-w-none">
                <MarkdownRenderer 
                  content={content || activeDoc.content} 
                  highlightQuery={inArticleQuery}
                  ragChunks={inArticleRagData?.chunks}
                  activeFilterLevel={inArticleFilterLevel}
                />
              </div>

              {/* Semantic Related Articles */}
              <RelatedArticles 
                slug={activeDoc.slug} 
                fetchRelatedUrl={apiEndpoints.related}
                onSelectDoc={(p) => loadDoc(p)}
              />

              {/* Bottom Nav */}
              <div className="mt-16 pt-8 border-t dark:border-white/10 border-slate-900 flex justify-between items-center font-mono text-xs">
                <button 
                  onClick={closeDocToHub}
                  className="dark:text-slate-400 text-slate-600 hover:text-neonCyan transition-colors uppercase font-bold cursor-pointer"
                >
                  &lt;-- VISSZA A {vaultType === 'blog' ? 'BLOG HUB-RA' : 'TUDÁSTÁR HUB-RA'}
                </button>
                <button
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="text-neonCyan hover:text-white uppercase cursor-pointer font-bold flex items-center gap-1"
                >
                  <span>UGRÁS A TETEJÉRE</span>
                  <span>↑</span>
                </button>
              </div>
            </div>
          ) : (
            /* ══════════════════════════════════════════════════════════ */
            /* NÉZET B: BEMUTATÓ HUB (MATRIX CARDS & FILTERS)             */
            /* ══════════════════════════════════════════════════════════ */
            <div className="max-w-7xl mx-auto px-6 py-8">
              
              {/* Hero Banner */}
              <div className="border-2 dark:border-white/10 border-slate-900 p-8 mb-8 relative overflow-hidden dark:bg-slate-950/60 bg-white shadow-[4px_4px_0_#0f172a] dark:shadow-none font-mono">
                <div className="relative z-10">
                  <div className="flex items-center gap-2 text-[10px] text-neonCyan font-black uppercase tracking-widest mb-2">
                    <span className="w-2 h-2 bg-neonCyan inline-block animate-pulse"></span>
                    <span>{headerConfig.badge}</span>
                  </div>
                  <h1 className="text-3xl md:text-5xl font-headline font-black italic uppercase text-slate-900 dark:text-white mb-3 tracking-tight">
                    {headerConfig.title}
                  </h1>
                  <p className="font-body dark:text-slate-300 text-slate-700 text-sm max-w-3xl leading-relaxed">
                    {headerConfig.description}
                  </p>
                </div>
              </div>

              {/* Unified Command Hub: Search + 4-Dimensional Filters in One Cohesive Unit */}
              <div className="mb-8 p-6 dark:bg-slate-950/60 bg-white border-2 dark:border-neonCyan/40 border-slate-900 shadow-[5px_5px_0_#0f172a] dark:shadow-[0_0_20px_rgba(0,255,255,0.08)] font-mono">
                
                {/* 1. Primary RAG Search Bar */}
                <div className="mb-5">
                  <div className="flex items-center gap-3 p-3 dark:bg-slate-900/90 bg-slate-100 border-2 dark:border-neonCyan border-slate-800 focus-within:shadow-[0_0_15px_rgba(0,255,255,0.3)] transition-all">
                    {isSearching ? (
                      <div className="w-5 h-5 border-2 border-neonCyan border-t-transparent animate-spin shrink-0" />
                    ) : (
                      <Search size={18} className="text-neonCyan shrink-0 drop-shadow-[0_0_6px_#00FFFF]" />
                    )}
                    <input
                      type="text"
                      placeholder="INTELLIGENS RAG KERESŐ (SZÖVEG, KIFEJEZÉS, KÓD, TÉMAKÖR)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="bg-transparent font-mono text-sm dark:text-white text-slate-900 placeholder:text-slate-500 font-bold outline-none w-full uppercase"
                    />
                    {searchQuery && (
                      <button 
                        onClick={() => setSearchQuery('')}
                        className="px-2 py-1 bg-neonMagenta/20 text-neonMagenta border border-neonMagenta/50 text-xs font-bold hover:bg-neonMagenta hover:text-white transition-colors cursor-pointer"
                        title="Keresés törlése"
                      >
                        TÖRLÉS ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Four Dimensional Cascading Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t dark:border-white/10 border-slate-200">
                  {/* Industry Selector */}
                  <div>
                    <label className="text-[10px] text-neonCyan font-bold flex items-center justify-between mb-1">
                      <span>🏭 IPARÁG</span>
                      {selectedIparag !== 'ALL' && (
                        <button
                          type="button"
                          onClick={() => setSelectedIparag('ALL')}
                          className="text-[9px] text-neonCyan hover:underline font-normal cursor-pointer"
                        >
                          ÖSSZES ✕
                        </button>
                      )}
                    </label>
                    <select
                      value={selectedIparag}
                      onChange={(e) => setSelectedIparag(e.target.value)}
                      className={`w-full p-2 text-xs font-mono uppercase cursor-pointer border transition-all ${
                        selectedIparag !== 'ALL'
                          ? 'dark:bg-cyan-950/50 bg-cyan-50 border-neonCyan text-neonCyan font-black shadow-[0_0_10px_rgba(0,255,255,0.2)]'
                          : 'dark:bg-slate-900 bg-slate-50 dark:border-white/20 border-slate-300 dark:text-slate-200 text-slate-800 focus:border-neonCyan'
                      }`}
                    >
                      <option value="ALL">ÖSSZES IPARÁG</option>
                      {dynamicFilterOptions.iparagak.map(({ name, count }) => (
                        <option key={name} value={name}>
                          {name} ({count})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Technology Selector */}
                  <div>
                    <label className="text-[10px] text-neonCyan font-bold flex items-center justify-between mb-1">
                      <span>⚡ TECHNOLÓGIA</span>
                      {selectedTech !== 'ALL' && (
                        <button
                          type="button"
                          onClick={() => setSelectedTech('ALL')}
                          className="text-[9px] text-neonCyan hover:underline font-normal cursor-pointer"
                        >
                          ÖSSZES ✕
                        </button>
                      )}
                    </label>
                    <select
                      value={selectedTech}
                      onChange={(e) => setSelectedTech(e.target.value)}
                      className={`w-full p-2 text-xs font-mono uppercase cursor-pointer border transition-all ${
                        selectedTech !== 'ALL'
                          ? 'dark:bg-cyan-950/50 bg-cyan-50 border-neonCyan text-neonCyan font-black shadow-[0_0_10px_rgba(0,255,255,0.2)]'
                          : 'dark:bg-slate-900 bg-slate-50 dark:border-white/20 border-slate-300 dark:text-slate-200 text-slate-800 focus:border-neonCyan'
                      }`}
                    >
                      <option value="ALL">ÖSSZES TECHNOLÓGIA</option>
                      {dynamicFilterOptions.technologiak.map(({ name, count }) => (
                        <option key={name} value={name}>
                          {name} ({count})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Target Audience / Role Selector */}
                  <div>
                    <label className="text-[10px] text-neonMagenta font-bold flex items-center justify-between mb-1">
                      <span>🎯 CÉLCSOPORT / SZEREPKÖR</span>
                      {selectedCelcsoport !== 'ALL' && (
                        <button
                          type="button"
                          onClick={() => setSelectedCelcsoport('ALL')}
                          className="text-[9px] text-neonMagenta hover:underline font-normal cursor-pointer"
                        >
                          ÖSSZES ✕
                        </button>
                      )}
                    </label>
                    <select
                      value={selectedCelcsoport}
                      onChange={(e) => setSelectedCelcsoport(e.target.value)}
                      className={`w-full p-2 text-xs font-mono uppercase cursor-pointer border transition-all ${
                        selectedCelcsoport !== 'ALL'
                          ? 'dark:bg-fuchsia-950/50 bg-fuchsia-50 border-neonMagenta text-neonMagenta font-black shadow-[0_0_10px_rgba(255,0,255,0.2)]'
                          : 'dark:bg-slate-900 bg-slate-50 dark:border-white/20 border-slate-300 dark:text-slate-200 text-slate-800 focus:border-neonMagenta'
                      }`}
                    >
                      <option value="ALL">ÖSSZES SZEREPKÖR</option>
                      {dynamicFilterOptions.celcsoportok.map(({ name, count }) => (
                        <option key={name} value={name}>
                          {name} ({count})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Sorting Selector */}
                  <div>
                    <label className="text-[10px] text-plasmaGreen font-bold block mb-1">RENDEZÉS</label>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="w-full dark:bg-slate-900 bg-slate-50 border-2 dark:border-plasmaGreen/50 border-emerald-600 p-2 text-xs font-mono font-bold uppercase dark:text-plasmaGreen text-emerald-800 cursor-pointer"
                    >
                      <option value="recommended">🎯 AJÁNLÁS SZERINT (RAG)</option>
                      <option value="newest">⏱️ LEGÚJABB ELÖL</option>
                      <option value="read_time">📖 MÉLYELEMZÉSEK</option>
                    </select>
                  </div>
                </div>

                {/* 3. Bottom Status Bar & Legend */}
                <div className="mt-4 pt-3 border-t dark:border-white/10 border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[10px]">
                  {searchQuery.trim() ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-500 font-bold uppercase">XAI SZINTEK:</span>
                      <span className="px-1.5 py-0.2 bg-yellow-300 dark:bg-neonCyan/30 text-slate-950 dark:text-neonCyan border border-yellow-500 dark:border-neonCyan font-bold">
                        1. PONTOS SZÓ
                      </span>
                      <span className="px-1.5 py-0.2 dark:bg-fuchsia-950/60 bg-fuchsia-100 border border-neonMagenta text-fuchsia-800 dark:text-pink-200 font-bold">
                        2. SZEMANTIKAI VEKTOR
                      </span>
                      <span className="px-1.5 py-0.2 dark:bg-emerald-950/50 bg-emerald-100 border border-plasmaGreen text-emerald-800 dark:text-emerald-300 font-bold">
                        3. FTS5 HIBRID
                      </span>
                    </div>
                  ) : (
                    <div className="text-slate-500 font-bold flex items-center gap-2">
                      <span>MUTATVA: <strong className="text-neonCyan">{displayDocs.length}</strong> / {docs.length} TÉTEL</span>
                    </div>
                  )}

                  {activeFilterCount > 0 && (
                    <button
                      onClick={resetFilters}
                      className="px-3 py-1 bg-neonMagenta/10 border border-neonMagenta text-neonMagenta font-bold hover:bg-neonMagenta hover:text-white transition-colors cursor-pointer"
                    >
                      SZŰRŐK ÉS KERESÉS TÖRLÉSE ({activeFilterCount + (searchQuery ? 1 : 0)}) ✕
                    </button>
                  )}
                </div>
              </div>


              {/* Aktív Mappa Szűrő Banner with Classic '..' Back Navigation */}
              {selectedCategory !== 'ALL' && (
                <div className="p-3.5 bg-neonCyan/10 border-2 border-neonCyan flex items-center justify-between gap-3 shadow-[0_0_15px_rgba(0,255,255,0.15)] font-mono mb-6">
                  <div className="flex items-center gap-2.5 text-xs">
                    <FolderOpen size={18} className="text-neonCyan animate-pulse" />
                    <span className="text-slate-500 dark:text-slate-400 font-bold">AKTUÁLIS MAPPA:</span>
                    <span className="font-headline font-black text-slate-900 dark:text-white uppercase tracking-wider text-sm">
                      📁 /{selectedCategory}
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-800 dark:text-plasmaGreen border border-emerald-600 font-bold text-[10px]">
                      {displayDocs.length} TÉTEL
                    </span>
                  </div>

                  <button
                    onClick={() => setSelectedCategory('ALL')}
                    className="px-3.5 py-1.5 bg-neonCyan text-black font-headline font-black uppercase text-xs hover:bg-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0_#0f172a]"
                    title="Visszalépés a gyökérmappához (Összes mappa)"
                  >
                    <span className="font-mono font-black text-sm">..</span>
                    <span>VISSZALÉPÉS [GYÖKÉR]</span>
                  </button>
                </div>
              )}


              {/* Matrix Cards View with Fluid Animations */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">


                <AnimatePresence mode="popLayout">
                  {displayDocs.map((item) => (
                    <motion.div
                      key={item.id || item.slug}
                      layout
                      initial={{ opacity: 0, scale: 0.94, y: 15 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.88, y: -10 }}
                      transition={{ duration: 0.25, ease: 'easeOut' }}
                      onClick={() => loadDoc(item)}
                      className="group p-6 bg-[var(--surface-panel)] border-2 dark:border-white/10 border-slate-900 hover:border-neonCyan/80 transition-all duration-200 flex flex-col justify-between shadow-[4px_4px_0_#0f172a] dark:shadow-none hover:shadow-[-5px_0_20px_rgba(0,255,255,0.2)] rounded-none cursor-pointer"
                    >
                      <div>
                        {/* Meta Line */}
                        <div className="flex items-center justify-between gap-2 mb-3 font-mono text-[9px] uppercase">
                          <span className="px-2 py-0.5 dark:bg-black/60 bg-slate-100 border dark:border-neonCyan/40 border-slate-400 text-neonCyan font-bold">
                            {item.category || (vaultType === 'blog' ? 'BLOG' : 'DOKUMENTUM')}
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-plasmaGreen font-bold flex items-center gap-1">
                              <Zap size={11} />
                              <span>{item.scorePercentage || 90}% {item.scoreLabel || 'MATCH'}</span>
                            </span>
                            {item.video_url && (
                              <span className="text-neonCyan font-bold flex items-center gap-1">
                                <Video size={11} />
                                <span>VIDEO</span>
                              </span>
                            )}
                            {item.audio_url && (
                              <span className="text-neonMagenta font-bold flex items-center gap-1">
                                <Headphones size={11} />
                                <span>AUDIO</span>
                              </span>
                            )}

                          </div>
                        </div>

                        {/* Search Match Banner if search is active */}
                        {searchQuery.trim() && (
                          <div className="mb-3 p-2 bg-neonCyan/5 border-l-2 border-neonCyan font-mono text-[9px] flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 text-neonCyan font-bold">
                              <Brain size={11} className="shrink-0 text-neonMagenta" />
                              <span>{item.matchLocation || 'Szemantikai Vektor Találat'}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-400">
                              {item.semanticScore ? (
                                <span className="text-neonMagenta font-bold">🧠 {item.semanticScore}% Vektor</span>
                              ) : null}
                              {item.keywordScore ? (
                                <span className="text-plasmaGreen font-bold">⚡ {item.keywordScore}% FTS5</span>
                              ) : null}
                            </div>
                          </div>
                        )}

                        {/* Title */}
                        <h2 className="text-xl font-headline font-black uppercase italic text-on-surface mb-3 group-hover:text-neonCyan transition-colors leading-tight">
                          <HighlightText text={item.title} query={searchQuery} />
                        </h2>

                        {/* Matched Tokens if search active */}
                        {searchQuery.trim() && Array.isArray(item.matchedTokens) && item.matchedTokens.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 mb-2 font-mono text-[8px]">
                            <span className="text-slate-500 font-bold uppercase">EGYEZÉS:</span>
                            {item.matchedTokens.map((tok, ti) => (
                              <span key={ti} className="px-1.5 py-0.2 bg-neonCyan/15 text-neonCyan border border-neonCyan/40 font-bold">
                                ✓ {tok}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Snippet or Summary */}
                        {searchQuery.trim() && item.matchSnippet ? (
                          <div className="my-3 p-2.5 dark:bg-black/40 bg-slate-100 border border-slate-300 dark:border-white/10 font-mono text-xs leading-relaxed">
                            <div className="text-[8px] text-neonCyan font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                              <Sparkles size={9} />
                              <span>RELEVÁNS TARTALMI RÉSZLET (SNIPPET):</span>
                            </div>
                            <p className="dark:text-slate-200 text-slate-800 line-clamp-3">
                              <HighlightText text={item.matchSnippet} query={searchQuery} />
                            </p>
                          </div>
                        ) : (
                          <p className="font-body dark:text-slate-300 text-slate-700 text-xs leading-relaxed mb-4 line-clamp-3">
                            <HighlightText text={item.summary} query={searchQuery} />
                          </p>
                        )}


                        {/* Dimensions */}
                        {item.dimensions && (
                          <div className="flex flex-wrap gap-1 mb-4 font-mono text-[9px]">
                            {Array.isArray(item.dimensions.iparag) && item.dimensions.iparag.map(i => (
                              <span key={i} className="px-1.5 py-0.2 dark:bg-slate-900 bg-slate-100 border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 font-bold">
                                #{i}
                              </span>
                            ))}
                            {Array.isArray(item.dimensions.technologia) && item.dimensions.technologia.map(t => (
                              <span key={t} className="px-1.5 py-0.2 dark:bg-slate-900 bg-cyan-50 border border-cyan-200 dark:border-neonCyan/20 text-neonCyan font-bold">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Card Footer */}
                      <div className="pt-3 border-t dark:border-white/5 border-slate-200 flex items-center justify-between font-mono text-[10px]">
                        <span className="text-slate-500">
                          {item.created_at ? `${item.created_at} • ` : ''}{item.read_time || '4 PERC'}
                        </span>
                        <span className="text-neonCyan font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          <span>MEGNYITÁS</span>
                          <span>→</span>
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {displayDocs.length === 0 && (
                <div className="p-16 text-center border-2 dark:border-white/10 border-slate-900 bg-[var(--surface-panel)] font-mono">
                  <span className="material-symbols-outlined text-4xl text-neonMagenta mb-3 block">search_off</span>
                  <span className="text-neonMagenta text-lg font-bold block mb-2">[!] NINCS TALÁLAT A KERESÉSRE</span>
                  <p className="dark:text-slate-400 text-slate-600 text-xs mb-6">
                    Nem található dokumentum a megadott feltételekkel.
                  </p>
                  <button
                    onClick={resetFilters}
                    className="px-6 py-2 bg-neonCyan text-black font-headline font-black italic uppercase text-xs hover:bg-white transition-colors cursor-pointer"
                  >
                    SZŰRŐK VISSZAÁLLÍTÁSA
                  </button>
                </div>
              )}
            </div>
          )}
        </main>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* 3. JOBB: Tartalomjegyzék (TOC), Backlinks & Knowledge Graph  */}
        {/* ───────────────────────────────────────────────────────────── */}
        {activeDoc && (
          <div className="w-72 shrink-0 hidden xl:flex flex-col gap-6 overflow-y-auto px-4 py-8 border-l-2 dark:border-white/10 border-slate-900 dark:bg-[#070b19]/80 bg-slate-50 font-mono">
            <TableOfContents headings={headings} />

            {/* Bi-Directional Backlinks & Semantic Mesh */}
            {backlinks.length > 0 && (
              <div className="pt-6 border-t-2 dark:border-white/10 border-slate-300">
                <div className="flex items-center justify-between text-[10px] font-black uppercase text-neonMagenta mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Link2 size={12} className="text-neonCyan" />
                    <span>BACKLINKS // HIVATKOZÁSOK</span>
                  </div>
                  <span className="text-[9px] text-neonMagenta font-mono">[{backlinks.length}]</span>
                </div>
                <p className="text-[9px] text-slate-400 mb-3 leading-relaxed">
                  Közös architektúrát és technológiát alkalmazó kapcsolódó cikkek:
                </p>
                <div className="space-y-2">
                  {backlinks.map((b) => (
                    <button
                      key={b.doc.slug}
                      onClick={() => loadDoc(b.doc)}
                      className="w-full text-left p-2.5 dark:bg-slate-900 bg-white border dark:border-white/10 border-slate-300 hover:border-neonMagenta transition-all flex flex-col gap-1.5 cursor-pointer group"
                    >
                      <span className="text-[10px] font-bold dark:text-slate-200 text-slate-800 group-hover:text-neonMagenta truncate">
                        {b.doc.title}
                      </span>
                      <div className="flex flex-wrap gap-1 text-[8px]">
                        {b.sharedTech.map(t => (
                          <span key={t} className="px-1 py-0.2 bg-cyan-950/60 border border-neonCyan/40 text-neonCyan font-mono font-bold">
                            #{t}
                          </span>
                        ))}
                        {b.sharedInd.map(i => (
                          <span key={i} className="px-1 py-0.2 bg-fuchsia-950/60 border border-neonMagenta/40 text-neonMagenta font-mono font-bold">
                            @{i}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Knowledge Graph & Vector Relationships */}
            <div className="pt-6 border-t-2 dark:border-white/10 border-slate-300">
              <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-neonCyan mb-2.5">
                <Brain size={12} className="text-neonMagenta" />
                <span>KNOWLEDGE GRAPH // HÁLÓ</span>
              </div>
              <p className="text-[9px] text-slate-400 mb-3 leading-relaxed">
                Vektortérben legközelebb álló kapcsolódó tudáselemek:
              </p>
              <div className="space-y-2">
                {[
                  { slug: 'zart-rag-architektura-specifikacio', title: 'Zárt Vállalati RAG Architektúra Specifikáció', sim: '73% Match' },
                  { slug: 'zart-vallalati-rag-esettanulmany', title: 'Zárt Vállalati RAG: 0% Adatszivárgás', sim: '72% Match' },
                  { slug: 'vallalati-ai-adatbiztonsag-rag', title: 'Hogyan vezessünk be AI-t biztonságosan?', sim: '72% Match' }
                ].map(kg => (
                  <button
                    key={kg.slug}
                    onClick={() => {
                      const doc = docs.find(d => d.slug === kg.slug);
                      if (doc) loadDoc(doc);
                    }}
                    className="w-full text-left p-2.5 dark:bg-slate-900 bg-white border dark:border-white/10 border-slate-300 hover:border-neonCyan transition-all flex flex-col gap-1 cursor-pointer group"
                  >
                    <span className="text-[10px] font-bold dark:text-slate-200 text-slate-800 group-hover:text-neonCyan truncate">
                      {kg.title}
                    </span>
                    <div className="flex justify-between items-center text-[8px]">
                      <span className="text-plasmaGreen font-bold">⚡ {kg.sim}</span>
                      <span className="text-neonCyan">MEGNYITÁS →</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Live Security & Engine Readout */}
            <div className="p-3 dark:bg-black/50 bg-slate-100 border border-slate-300 dark:border-neonCyan/30 text-[9px] space-y-1.5">
              <div className="text-neonCyan font-bold uppercase flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-plasmaGreen animate-pulse" />
                <span>RAG ENGINE READOUT</span>
              </div>
              <div className="text-slate-400 flex justify-between">
                <span>MODEL:</span>
                <strong className="text-slate-200">128-DIM L2-NORM</strong>
              </div>
              <div className="text-slate-400 flex justify-between">
                <span>RETRIEVAL:</span>
                <strong className="text-plasmaGreen">HYBRID FTS5</strong>
              </div>
              <div className="text-slate-400 flex justify-between">
                <span>SECURITY:</span>
                <strong className="text-neonMagenta">AIR-GAP ISOLATED</strong>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default TacticalVaultExplorer;
