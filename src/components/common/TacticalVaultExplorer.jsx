import React, {
  lazy,
  Suspense,
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search,
  FolderOpen,
  Folder,
  FileText,
  ChevronRight,
  ChevronDown,
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
  Network,
  Box,
  FileImage,
  FileSpreadsheet,
  FileCode2,
  FileAudio,
  FileVideo,
  ExternalLink,
  Download,
  AlertTriangle,
} from "lucide-react";

import MarkdownRenderer from "../markdown/MarkdownRenderer.jsx";
import TableOfContents from "../markdown/TableOfContents.jsx";
import TacticalAudioPlayer from "../multimedia/TacticalAudioPlayer.jsx";
import VideoPlayer from "../multimedia/VideoPlayer.jsx";
import TaxonomyIcon from "./TaxonomyIcon.jsx";
import { extractHeadings } from "../../utils/markdownHeadings.js";
import { getTreeFolders } from "../../utils/taxonomy.js";
import {
  ALL_TAXONOMY_FILTER,
  buildTaxonomyFacetOptions,
  documentMatchesFacets,
  getDocumentDimensionValues,
  getTaxonomyTerm,
  getTaxonomyColor,
  matchesTaxonomySmartCollection,
  normalizeTaxonomyConfig,
  FALLBACK_TAXONOMY_CONFIG,
} from "../../utils/taxonomyConfig.js";
import {
  presentationProfileLabel,
  presentationProfileOf,
} from "../../utils/presentationProfile.js";
import { useAdminPreview } from "../../context/AdminPreviewContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import DocumentRelationComposer from "../graph/DocumentRelationComposer.jsx";

// Kept out of the public reader bundle until an authenticated administrator
// actually opens the contextual editor.
const AdminMarkdownEditor = lazy(() => import("./AdminMarkdownEditor.jsx"));

const preferredScrollBehavior = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ? "auto"
    : "smooth";

// ============================================================================
// 1. HIGHLIGHT HELPER (Neon Keyword Match Visualizer)
// ============================================================================
export const HighlightText = ({ text = "", query = "" }) => {
  if (!query || !text || typeof text !== "string") return <>{text}</>;
  const cleanFullQuery = query.trim().toLowerCase();
  const rawWords = cleanFullQuery.split(/\s+/).filter((w) => w.length > 1);
  if (!rawWords.length) return <>{text}</>;

  const wordsSet = new Set();
  // 1. Teljes kifejezés hozzáadása (pl. "Google Drive")
  if (rawWords.length > 1) {
    wordsSet.add(cleanFullQuery);
  }

  // 2. Különálló szavak és szótövek
  rawWords.forEach((w) => {
    wordsSet.add(w);
    const cleanW = w.replace(/[^a-z0-9áéíóöőúüű]/gi, "");
    if (cleanW.length >= 3) {
      wordsSet.add(cleanW);
      const stem = cleanW.replace(
        /(ot|at|et|ot|hoz|hez|val|vel|ban|ben|bol|bel|rol|nak|nek|t|k|ba|be|ra|re|ig|ul|as|es|os|hatom|hetem|unk|tek|tok)$/,
        "",
      );
      if (stem.length >= 3) wordsSet.add(stem);
    }
  });

  const searchTokens = Array.from(wordsSet).sort((a, b) => b.length - a.length);

  try {
    const escaped = searchTokens
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const regex = new RegExp(`(${escaped})`, "gi");
    const parts = text.split(regex);

    return (
      <>
        {parts.map((part, i) => {
          const isMatch = searchTokens.some(
            (w) => part.toLowerCase() === w.toLowerCase(),
          );
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
  postContent = "",
  searchQuery,
  setSearchQuery,
  onNavigateToMatch,
  onCloseDoc,
  vaultLabel = "HUB",
  docSlug = "",
  onRagDataLoaded,
  onFilterLevelChange,
  viewerFetch = fetch,
}) => {
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [filterLevel, setFilterLevel] = useState("ALL"); // 'ALL' | 'KEYWORD' | 'SEMANTIC' | 'CHUNK'
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

    viewerFetch(
      `/api/rag/article-chunks?slug=${encodeURIComponent(docSlug)}&q=${encodeURIComponent(searchQuery.trim())}`,
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data && Array.isArray(data.chunks)) {
          setServerRagData(data);
          if (onRagDataLoaded) onRagDataLoaded(data);
        }
      })
      .catch((err) => console.warn("[RAG_API_NOTE]", err))
      .finally(() => {
        if (isMounted) setIsLoadingRag(false);
      });

    return () => {
      isMounted = false;
    };
  }, [docSlug, searchQuery, onRagDataLoaded, viewerFetch]);

  // Fallback kliens oldali szétbontás, ha még tölt a szerver
  const clientMatches = useMemo(() => {
    if (!searchQuery || !searchQuery.trim() || !postContent) return [];
    const queryNorm = searchQuery.trim().toLowerCase();
    const words = queryNorm.split(/\s+/).filter((w) => w.length > 0);
    if (!words.length) return [];

    const results = [];
    const lines = postContent.split("\n");
    let currentHeading = "Bevezetés";

    lines.forEach((line, lineIdx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) {
        currentHeading = trimmed.replace(/^#+\s*/, "");
      }

      const lineLower = trimmed.toLowerCase();
      const hasDirectWord = words.some((w) => lineLower.includes(w));

      if (hasDirectWord && trimmed.length > 10 && !trimmed.startsWith("```")) {
        results.push({
          chunk_id: `chk_${String(results.length + 1).padStart(2, "0")}`,
          index: results.length,
          lineIndex: lineIdx,
          heading: currentHeading,
          snippet: trimmed.replace(/^[#\s*`>]+/, "").slice(0, 140),
          content: trimmed,
          token_count: Math.ceil(trimmed.split(/\s+/).length * 1.3),
          relevance_score: 85,
          level: trimmed.length > 100 ? "CHUNK" : "KEYWORD",
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
    if (filterLevel === "ALL") return allMatches;
    if (filterLevel === "KEYWORD") {
      return allMatches.filter(
        (m) =>
          m.is_keyword_match ||
          m.level === "KEYWORD" ||
          (Array.isArray(m.keyword_matches) && m.keyword_matches.length > 0),
      );
    }
    if (filterLevel === "SEMANTIC") {
      return allMatches.filter(
        (m) =>
          m.is_semantic_match ||
          m.level === "SEMANTIC" ||
          (m.cosine_similarity !== undefined && m.cosine_similarity >= 0.18),
      );
    }
    if (filterLevel === "CHUNK") {
      return allMatches.filter(
        (m) =>
          m.is_rag_chunk ||
          m.level === "CHUNK" ||
          (m.token_count !== undefined && m.token_count >= 20),
      );
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
      KEYWORD: allMatches.filter(
        (m) =>
          m.is_keyword_match ||
          m.level === "KEYWORD" ||
          (Array.isArray(m.keyword_matches) && m.keyword_matches.length > 0),
      ).length,
      SEMANTIC: allMatches.filter(
        (m) =>
          m.is_semantic_match ||
          m.level === "SEMANTIC" ||
          (m.cosine_similarity !== undefined && m.cosine_similarity >= 0.18),
      ).length,
      CHUNK: allMatches.filter(
        (m) =>
          m.is_rag_chunk ||
          m.level === "CHUNK" ||
          (m.token_count !== undefined && m.token_count >= 20),
      ).length,
    };
  }, [serverRagData, allMatches]);

  useEffect(() => {
    setCurrentMatchIndex(0);
    if (matches.length > 0 && onNavigateToMatch) {
      onNavigateToMatch(matches[0], 0);
    }
  }, [matches, onNavigateToMatch]);

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
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) jumpToMatch(currentMatchIndex - 1);
      else jumpToMatch(currentMatchIndex + 1);
    } else if (e.key === "Escape") {
      setSearchQuery("");
      setIsDropdownOpen(false);
    }
  };

  const getLevelLabel = () => {
    switch (filterLevel) {
      case "KEYWORD":
        return "KULCSSZÓ";
      case "SEMANTIC":
        return "SZEMANTIKA";
      case "CHUNK":
        return "RAG CHUNK";
      default:
        return "TALÁLAT";
    }
  };

  const isSearchActive = Boolean(searchQuery?.trim());

  return (
    <div
      data-testid="in-article-search-console"
      className={`${isSearchActive ? "sticky top-[8.5rem] z-40" : "relative z-0"} mb-6 border-b-2 border-slate-900 bg-white/95 pb-2 pt-1 font-mono shadow-[0_6px_20px_rgba(0,0,0,0.35)] backdrop-blur-md transition-all dark:border-neonCyan/40 dark:bg-[#090d1d]/90`}
    >
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
            <label htmlFor="in-article-search" className="sr-only">
              Keresés a cikken belül
            </label>
            <input
              id="in-article-search"
              type="text"
              placeholder="KERESÉS A CIKKEN BELÜL (KIFEJEZÉS, KÓD)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="bg-transparent text-xs text-on-surface placeholder:text-slate-500 outline-none w-full uppercase font-mono font-bold"
            />
            {isLoadingRag && (
              <span className="text-[9px] text-neonCyan font-bold animate-pulse">
                RAG...
              </span>
            )}
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery("");
                  setIsDropdownOpen(false);
                }}
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
                    onClick={() => setIsDropdownOpen((v) => !v)}
                    className="px-1.5 py-0.5 dark:text-slate-300 text-slate-400 hover:text-neonCyan text-[9px] border border-white/10 cursor-pointer"
                    title="Valós RAG Chunkok listája"
                  >
                    {isDropdownOpen ? "▲" : "📋"}
                  </button>
                </div>
              ) : (
                <span className="px-2 py-0.5 bg-neonMagenta/10 border border-neonMagenta/40 text-neonMagenta font-bold">
                  [0 {getLevelLabel()}]
                </span>
              )
            ) : (
              <span className="text-slate-500 hidden lg:inline text-[9px]">
                KÖVETŐ KERESŐ
              </span>
            )}
          </div>
        </div>

        {/* Interaktív 3-Szintű XAI Léptető & Szűrő Sáv (Valós Szerver RAG Adatokkal) */}
        {searchQuery.trim() && (
          <div className="mt-2.5 pt-2 border-t dark:border-white/10 border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[9px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-500 font-bold uppercase">
                XAI LÉPTETÉSI SZINTEK:
              </span>

              {/* 0. Mind (Összes) */}
              <button
                onClick={() => handleSetFilterLevel("ALL")}
                className={`flex items-center gap-1 px-2 py-0.5 border font-bold uppercase transition-all cursor-pointer ${
                  filterLevel === "ALL"
                    ? "dark:bg-slate-800 bg-slate-900 text-white border-white shadow-[0_0_8px_#ffffff]"
                    : "dark:bg-slate-900/60 bg-slate-200 text-slate-600 dark:text-slate-400 border-slate-400 dark:border-white/20 hover:border-white"
                }`}
              >
                <span>🌐 ÖSSZES ({levelCounts.ALL})</span>
              </button>

              {/* 1. Pontos Kulcsszó */}
              <button
                onClick={() => handleSetFilterLevel("KEYWORD")}
                className={`flex items-center gap-1 px-2 py-0.5 border font-bold uppercase transition-all cursor-pointer ${
                  filterLevel === "KEYWORD"
                    ? "bg-yellow-300 dark:bg-neonCyan/30 text-slate-950 dark:text-neonCyan border-yellow-500 dark:border-neonCyan shadow-[0_0_10px_#00FFFF]"
                    : "dark:bg-slate-900/60 bg-slate-200 text-slate-600 dark:text-slate-400 border-slate-400 dark:border-white/20 hover:border-neonCyan"
                }`}
              >
                <span className="w-1.5 h-1.5 bg-cyan-400 inline-block" />
                <span>1. KULCSSZÓ ({levelCounts.KEYWORD})</span>
              </button>

              {/* 2. Szemantikai Egyezés */}
              <button
                onClick={() => handleSetFilterLevel("SEMANTIC")}
                className={`flex items-center gap-1 px-2 py-0.5 border font-bold uppercase transition-all cursor-pointer ${
                  filterLevel === "SEMANTIC"
                    ? "dark:bg-fuchsia-950 bg-fuchsia-100 text-fuchsia-900 dark:text-pink-200 border-neonMagenta shadow-[0_0_10px_#FF00FF]"
                    : "dark:bg-slate-900/60 bg-slate-200 text-slate-600 dark:text-slate-400 border-slate-400 dark:border-white/20 hover:border-neonMagenta"
                }`}
              >
                <Brain size={10} className="text-neonMagenta" />
                <span>2. SZEMANTIKA ({levelCounts.SEMANTIC})</span>
              </button>

              {/* 3. Releváns RAG Chunk */}
              <button
                onClick={() => handleSetFilterLevel("CHUNK")}
                className={`flex items-center gap-1 px-2 py-0.5 border font-bold uppercase transition-all cursor-pointer ${
                  filterLevel === "CHUNK"
                    ? "dark:bg-emerald-950 bg-emerald-100 text-emerald-900 dark:text-emerald-300 border-plasmaGreen shadow-[0_0_10px_#80FF00]"
                    : "dark:bg-slate-900/60 bg-slate-200 text-slate-600 dark:text-slate-400 border-slate-400 dark:border-white/20 hover:border-plasmaGreen"
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
              <button
                onClick={() => setIsDropdownOpen(false)}
                className="text-neonCyan hover:underline cursor-pointer"
              >
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
                      ? "dark:bg-neonCyan/20 bg-cyan-100 border-neonCyan font-bold dark:text-white text-slate-950 shadow-[inset_3px_0_0_#00FFFF]"
                      : "dark:bg-slate-900/60 bg-slate-100 border-slate-300 dark:border-white/10 dark:text-slate-300 text-slate-700 hover:border-neonCyan"
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
                    <span className="text-plasmaGreen">
                      {m.chunk_id || `#${idx + 1}`}
                    </span>
                    {m.token_count && (
                      <span className="text-slate-500">
                        {m.token_count} tok
                      </span>
                    )}
                    {m.cosine_similarity !== undefined && (
                      <span className="text-neonMagenta font-bold">
                        {Math.round(m.cosine_similarity * 100)}% Sim
                      </span>
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
export const RelatedArticles = ({
  slug,
  fetchRelatedUrl,
  onSelectDoc,
  viewerFetch = fetch,
}) => {
  const [related, setRelated] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!slug || !fetchRelatedUrl) return;
    let isCancelled = false;
    const fetchRelated = async () => {
      try {
        setIsLoading(true);
        const res = await viewerFetch(fetchRelatedUrl(slug));
        if (res.ok && !isCancelled) {
          const data = await res.json();
          setRelated(Array.isArray(data) ? data : data.related || []);
        }
      } catch {
        if (!isCancelled) setRelated([]);
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };
    fetchRelated();
    return () => {
      isCancelled = true;
    };
  }, [slug, fetchRelatedUrl, viewerFetch]);

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
              <span className="text-neonCyan font-bold">
                [{item.category || "DOKUMENTUM"}]
              </span>
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

// ============================================================================
// 4. MAIN TACTICAL VAULT EXPLORER ENGINE (Unified Core)
// ============================================================================
const DEFAULT_API_ENDPOINTS = {
  list: "/api/docs",
  search: "/api/docs/search",
  doc: (slug) => `/api/docs/${slug}`,
  related: (slug) => `/api/docs/related/${slug}`,
};

const DEFAULT_HEADER_CONFIG = {
  badge: "CYBER-ARCHITECT // KNOWLEDGE VAULT",
  title: "Iparági AI Automatizálás & Műszaki Tudástár.",
  description:
    "Valós esettanulmányok, kódminták és zárt vállalati RAG AI rendszerek.",
  version: "v2.0",
  statusBadge: "// RAG_ACTIVE",
  hubButtonLabel: "TUDÁSTÁR_BEMUTATÓ_HUB",
  headerTitle: "KNOWLEDGE_VAULT",
};

// These bounded first pages keep large archives responsive. The hub/search
// grid has a larger visual page, while the narrower folder drawer stays denser.
const INITIAL_VISIBLE_FOLDER_ITEMS = 6;
const FOLDER_ITEMS_PAGE_SIZE = 6;
const INITIAL_VISIBLE_FOLDERS = 8;
const FOLDERS_PAGE_SIZE = 8;
const INITIAL_VISIBLE_HUB_RESULTS = 12;
const HUB_RESULTS_PAGE_SIZE = 12;
const ALL_PROJECT_FILTER = "ALL";

const normalizeProjectFilter = (value) => {
  const projectId = String(value || "").trim();
  return projectId && projectId.toUpperCase() !== ALL_PROJECT_FILTER
    ? projectId
    : ALL_PROJECT_FILTER;
};

const appendQueryParameters = (endpoint, params) => {
  const query = params.toString();
  if (!query) return endpoint;
  return `${endpoint}${endpoint.includes("?") ? "&" : "?"}${query}`;
};

const scoreAsPercentage = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return undefined;
  return Math.round(numericValue <= 1 ? numericValue * 100 : numericValue);
};

// The legacy public endpoints use `docs`/`posts` and camelCase relevance
// fields, while the canonical collection uses `documents` and snake_case.
// Normalize only at this reader boundary so both contracts remain usable.
const readApiDocuments = (payload) => {
  const documents = Array.isArray(payload)
    ? payload
    : payload?.documents || payload?.docs || payload?.posts || [];
  return documents.map((document) => ({
    ...document,
    relevanceScore:
      document.relevanceScore ?? scoreAsPercentage(document.relevance_score),
    semanticScore:
      document.semanticScore ?? scoreAsPercentage(document.semantic_score),
    keywordScore:
      document.keywordScore ?? scoreAsPercentage(document.keyword_score),
  }));
};

const SYSTEM_PIVOT_OPTIONS = [
  {
    id: "drive",
    label: "MAPPÁK",
    icon_key: "folder",
    color: "cyan",
    title: "A DB-ben kezelt fő- és almappák szerinti nézet.",
  },
  {
    id: "topic",
    label: "TÉMÁK",
    icon_key: "layers",
    color: "magenta",
    title: "A dokumentumtartalomból képzett szemantikus témakörök.",
  },
];

const getDimensionPivotId = (dimension) => {
  const identifiers = [dimension?.id, dimension?.frontmatter_key]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);
  if (
    identifiers.some((value) =>
      ["iparag", "industry", "tax_industry"].includes(value),
    )
  )
    return "industry";
  if (
    identifiers.some((value) =>
      ["technologia", "technology", "tax_technology"].includes(value),
    )
  )
    return "tech";
  return `dimension:${dimension.id}`;
};

const getPivotFallbackLabel = (dimension) => {
  const pivotId = getDimensionPivotId(dimension);
  return pivotId === "industry"
    ? "Általános Iparág"
    : `Nincs ${dimension.label || "besorolás"}`;
};

const readInitialFacetSelections = () => {
  if (typeof window === "undefined") return {};
  try {
    const raw = new URLSearchParams(window.location.search).get("facets");
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, value]) => typeof value === "string" && value.trim(),
      ),
    );
  } catch {
    return {};
  }
};

const DocumentTaxonomyBadges = ({
  document,
  dimensions,
  compact = false,
  className = "",
}) => {
  const badges = (dimensions || []).flatMap((dimension) =>
    getDocumentDimensionValues(document, dimension).map((value, index) => ({
      dimension,
      value,
      index,
    })),
  );
  if (!badges.length) return null;

  return (
    <div
      className={`flex flex-wrap gap-1.5 font-mono ${compact ? "text-[9px]" : "border-t border-slate-200 pt-4 text-[10px] dark:border-white/10"} ${className}`}
    >
      {badges.map(({ dimension, value, index }) => {
        const term = getTaxonomyTerm(dimension, value);
        const label = term?.label || value;
        const accent = getTaxonomyColor(term?.color || dimension.color);
        return (
          <span
            key={`${dimension.id}-${value}-${index}`}
            className={`inline-flex max-w-full items-center gap-1 border px-1.5 py-0.5 font-bold ${
              compact
                ? "bg-slate-100 dark:bg-slate-900"
                : "bg-slate-100 dark:bg-slate-900"
            }`}
            style={{ borderColor: `${accent}66`, color: accent }}
            title={`${dimension.label}: ${label}`}
          >
            <TaxonomyIcon
              iconKey={term?.icon_key || dimension.icon_key}
              size={compact ? 10 : 11}
              aria-hidden="true"
              className="shrink-0"
            />
            {!compact && (
              <span className="shrink-0 opacity-70">{dimension.label}:</span>
            )}
            <span className="truncate">{label}</span>
          </span>
        );
      })}
    </div>
  );
};

// Visibility is intentionally rendered only in authenticated preview. Public
// responses stay free of this editorial state, while an administrator can see
// precisely why a record appears in the wider preview projection.
export const AdminPreviewVisibilityBadges = ({
  document = {},
  compact = false,
}) => {
  const { isAdminPreview } = useAdminPreview();
  if (!isAdminPreview) return null;

  const labels = [];
  const visibility = String(document.visibility || "")
    .trim()
    .toLowerCase();
  const hasPublishedValue =
    Object.prototype.hasOwnProperty.call(document, "published") &&
    document.published !== null &&
    document.published !== undefined;
  const isPublished =
    document.published === true || Number(document.published) === 1;

  if (visibility && visibility !== "public") labels.push("PRIVÁT");
  if (hasPublishedValue && !isPublished) labels.push("PISZKOZAT");
  if (!labels.length) return null;

  return (
    <span
      data-testid="admin-preview-visibility-badges"
      aria-label={`Admin előnézeti állapot: ${labels.join(", ")}`}
      className={`inline-flex flex-wrap items-center gap-1 font-mono font-black uppercase tracking-[.08em] ${compact ? "text-[8px]" : "text-[9px]"}`}
    >
      {labels.map((label) => (
        <span
          key={label}
          className="border border-amber-300/70 bg-amber-300/10 px-1.5 py-0.5 text-amber-200"
        >
          {label}
        </span>
      ))}
    </span>
  );
};

// The public reader has no AuthContext dependency. This tiny adapter is only
// mounted in the authenticated admin projection, where relationship mutations
// must travel through the protected admin fetcher.
const AdminDocumentRelationWorkbench = (props) => {
  const { adminFetch } = useAuth();
  return <DocumentRelationComposer {...props} adminFetch={adminFetch} />;
};

const assetIconFor = (asset = {}) => {
  const kind = String(asset.kind || asset.asset_kind || "").toLowerCase();
  const provider = String(asset.provider || "").toLowerCase();
  const mime = String(asset.mime_type || "").toLowerCase();
  if (provider === "github" || kind === "repository") return Code2;
  if (provider === "youtube") return Video;
  if (kind === "cad" || kind === "model" || kind === "drawing") return Box;
  if (kind === "image" || mime.startsWith("image/")) return FileImage;
  if (
    kind === "spreadsheet" ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  )
    return FileSpreadsheet;
  if (kind === "video" || mime.startsWith("video/")) return FileVideo;
  if (kind === "audio" || mime.startsWith("audio/")) return FileAudio;
  if (kind === "dataset" || kind === "document" || kind === "pdf")
    return FileCode2;
  return FileText;
};

const assetKindLabel = (asset = {}) => {
  const kind = String(asset.kind || asset.asset_kind || "other").toUpperCase();
  const labels = {
    CAD: "CAD / DWG",
    MODEL: "3D MODELL",
    DRAWING: "RAJZ",
    IMAGE: "KÉP",
    VIDEO: "VIDEÓ",
    AUDIO: "HANG",
    PDF: "PDF",
    SPREADSHEET: "TÁBLÁZAT",
    DOCUMENT: "DOKUMENTUM",
    DATASET: "ADATKÉSZLET",
    REPOSITORY: "GIT REPO",
    ISSUE: "ISSUE",
    DASHBOARD: "DASHBOARD",
    URL: "KÜLSŐ FORRÁS",
    OTHER: "CSATOLMÁNY",
  };
  return labels[kind] || kind;
};

const DocumentAssetBadges = ({ assets = [], compact = false }) => {
  if (!Array.isArray(assets) || !assets.length) return null;
  const visible = assets.slice(0, compact ? 3 : 8);
  return (
    <div
      className="flex flex-wrap items-center gap-1.5 font-mono text-[9px]"
      aria-label={`${assets.length} csatolmány vagy külső forrás`}
    >
      {visible.map((asset, index) => {
        const Icon = assetIconFor(asset);
        const unavailable = asset.availability === "missing";
        return (
          <span
            key={`${asset.id || asset.file_id || asset.uri}-${index}`}
            title={`${assetKindLabel(asset)} · ${asset.title || "Csatolmány"}${unavailable ? " · jelenleg nem elérhető" : ""}`}
            className={`inline-flex items-center gap-1 border px-1.5 py-0.5 font-bold ${unavailable ? "border-amber-300/40 text-amber-300" : "border-neonCyan/35 text-neonCyan"}`}
          >
            <Icon size={compact ? 10 : 11} aria-hidden="true" />
            {!compact && (
              <span className="max-w-[10rem] truncate">
                {assetKindLabel(asset)}
              </span>
            )}
          </span>
        );
      })}
      {assets.length > visible.length && (
        <span className="border border-white/15 px-1.5 py-0.5 text-slate-500">
          +{assets.length - visible.length}
        </span>
      )}
    </div>
  );
};

const PreviewAssetLink = ({ asset, children }) => {
  const { isAdminPreview, viewerFetch } = useAdminPreview();
  const needsAuthenticatedUrl =
    isAdminPreview && asset.source_kind === "local" && Boolean(asset.uri);
  const [objectUrl, setObjectUrl] = useState("");
  const [assetStatus, setAssetStatus] = useState(
    needsAuthenticatedUrl ? "loading" : "ready",
  );

  useEffect(() => {
    if (!needsAuthenticatedUrl) {
      setObjectUrl("");
      setAssetStatus("ready");
      return undefined;
    }

    let active = true;
    let createdUrl = "";
    const controller = new AbortController();
    setAssetStatus("loading");

    viewerFetch(asset.uri, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`ASSET_${response.status}`);
        if (
          typeof response.blob !== "function" ||
          typeof URL.createObjectURL !== "function"
        ) {
          throw new Error("ASSET_OBJECT_URL_UNAVAILABLE");
        }
        const blob = await response.blob();
        createdUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL?.(createdUrl);
          return;
        }
        setObjectUrl(createdUrl);
        setAssetStatus("ready");
      })
      .catch((error) => {
        if (!active || error?.name === "AbortError") return;
        setObjectUrl("");
        setAssetStatus("error");
      });

    return () => {
      active = false;
      controller.abort();
      if (createdUrl) URL.revokeObjectURL?.(createdUrl);
    };
  }, [asset.uri, needsAuthenticatedUrl, viewerFetch]);

  if (!needsAuthenticatedUrl) {
    const external = asset.source_kind === "external";
    return (
      <a
        href={asset.uri}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer noopener" : undefined}
        className="flex items-center gap-3 p-4 outline-none focus-visible:bg-neonCyan/10 focus-visible:ring-2 focus-visible:ring-neonCyan"
      >
        {children}
      </a>
    );
  }

  if (assetStatus === "loading") {
    return (
      <div
        data-testid="admin-preview-asset-loading"
        className="flex items-center gap-3 p-4 font-mono text-[9px] font-black text-neonCyan"
      >
        <span
          className="h-3 w-3 animate-spin border-2 border-neonCyan border-t-transparent"
          aria-hidden="true"
        />
        HITELESÍTETT ELŐNÉZETI ASSET BETÖLTÉSE…
      </div>
    );
  }

  if (assetStatus === "error" || !objectUrl) {
    return (
      <div
        data-testid="admin-preview-asset-unavailable"
        role="status"
        className="flex items-center gap-3 border-l-2 border-amber-300 p-4 font-mono text-[9px] font-black text-amber-200"
      >
        ELŐNÉZETI ASSET NEM ELÉRHETŐ · A közvetlen URL nem kerül megnyitásra
      </div>
    );
  }

  return (
    <a
      href={objectUrl}
      download={asset.title || asset.file_id || undefined}
      className="flex items-center gap-3 p-4 outline-none focus-visible:bg-neonCyan/10 focus-visible:ring-2 focus-visible:ring-neonCyan"
    >
      {children}
    </a>
  );
};

const DocumentAssetsPanel = ({ assets = [] }) => {
  if (!Array.isArray(assets) || !assets.length) return null;
  return (
    <section
      aria-label="Dokumentumhoz kötött csatolmányok"
      className="mb-10 border border-amber-300/30 bg-[#100d05]/60 shadow-[inset_0_1px_0_rgba(255,255,255,.04)]"
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300/20 bg-black/25 px-4 py-3">
        <div>
          <p className="flex items-center gap-2 font-mono text-[10px] font-black uppercase tracking-[.15em] text-amber-300">
            <Box size={14} /> DOKUMENTUMMAPPÁHOZ KÖTÖTT FORRÁSOK
          </p>
          <p className="mt-1 font-mono text-[9px] text-slate-500">
            Helyi bináris, GitHub, YouTube és egyéb hivatkozás – a Markdownon
            kívüli, saját asset-manifestből.
          </p>
        </div>
        <span className="border border-amber-300/40 px-2 py-1 font-mono text-[9px] font-black text-amber-300">
          {assets.length} ASSET
        </span>
      </header>
      <ul className="divide-y divide-white/[.07]">
        {assets.map((asset, index) => {
          const Icon = assetIconFor(asset);
          const unavailable = asset.availability === "missing";
          const external = asset.source_kind === "external";
          const label =
            asset.title || asset.id || asset.file_id || "Csatolmány";
          const dependencies = Array.isArray(asset.depends_on)
            ? asset.depends_on
            : [];
          const stateClass = unavailable
            ? "border-amber-300/30 text-amber-300"
            : "border-neonCyan/35 text-neonCyan";
          const content = (
            <>
              <span
                className={`grid h-9 w-9 shrink-0 place-items-center border ${stateClass}`}
              >
                <Icon size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="break-words font-mono text-[11px] font-black uppercase tracking-[.06em] text-slate-100">
                    {label}
                  </span>
                  <span className="border border-white/10 px-1.5 py-0.5 font-mono text-[8px] font-black text-slate-500">
                    {assetKindLabel(asset)}
                  </span>
                  {asset.provider && (
                    <span className="font-mono text-[8px] uppercase text-slate-600">
                      {asset.provider}
                    </span>
                  )}
                </span>
                <span className="mt-1 block font-mono text-[9px] text-slate-500">
                  {dependencies.length
                    ? `FÜGG: ${dependencies.join(", ")}`
                    : "ÖNÁLLÓ FORRÁS"}
                </span>
              </span>
              {unavailable ? (
                <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[9px] font-black text-amber-300">
                  <AlertTriangle size={12} /> HIÁNYZIK
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[9px] font-black text-neonCyan">
                  {external ? (
                    <ExternalLink size={12} />
                  ) : (
                    <Download size={12} />
                  )}
                  {external ? "MEGNYITÁS" : "LETÖLTÉS"}
                </span>
              )}
            </>
          );
          return (
            <li
              key={`${asset.id || asset.file_id || asset.uri}-${index}`}
              className="transition-colors hover:bg-white/[.025]"
            >
              {unavailable ? (
                <div className="flex items-center gap-3 p-4 opacity-80">
                  {content}
                </div>
              ) : (
                <PreviewAssetLink asset={asset}>{content}</PreviewAssetLink>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

const TacticalVaultExplorer = ({
  // Kept as a route/view adapter name for compatibility. It never changes the
  // document schema: `blog` renders the `article` presentation profile.
  vaultType = "knowledge", // 'knowledge' | legacy 'blog'
  baseRoute = "/knowledge",
  apiEndpoints = DEFAULT_API_ENDPOINTS,
  headerConfig = DEFAULT_HEADER_CONFIG,
}) => {
  const { "*": docSlugParam } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { viewerFetch, canPreview, isAdminPreview } = useAdminPreview();

  const urlParams = new URLSearchParams(location.search);
  const urlSearchQuery = urlParams.get("q") || urlParams.get("search") || "";
  const initialQuery = urlSearchQuery || location.state?.searchQuery || "";
  const presentationProfile = vaultType === "blog" ? "article" : "knowledge";
  const isArticleView = presentationProfile === "article";
  // Project membership belongs to the common document package, not just the
  // knowledge presentation. An article can document the same project, epic
  // or task as an internal note.
  const supportsProjectWorkspaces = true;

  // Core Data States
  const [docs, setDocs] = useState([]);
  const [activeDoc, setActiveDoc] = useState(null);
  const [content, setContent] = useState("");
  const [_isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState(null);
  const [editingDocumentSlug, setEditingDocumentSlug] = useState('');

  // Filter States (React State based, clean URL)
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [inArticleQuery, setInArticleQuery] = useState(initialQuery);
  const searchQueryRef = useRef(searchQuery);
  const [selectedCategory, setSelectedCategory] = useState(
    () => urlParams.get("cat") || "ALL",
  );
  const [taxonomyConfig, setTaxonomyConfig] = useState(() =>
    normalizeTaxonomyConfig(FALLBACK_TAXONOMY_CONFIG),
  );
  const [taxonomyStatus, setTaxonomyStatus] = useState("fallback");
  const [selectedFacets, setSelectedFacets] = useState(
    readInitialFacetSelections,
  );
  const [sortBy, setSortBy] = useState("recommended");
  const [selectedProjectId, setSelectedProjectId] = useState(() =>
    normalizeProjectFilter(urlParams.get("project_id")),
  );
  const [projects, setProjects] = useState([]);
  const [projectStatus, setProjectStatus] = useState("idle");

  const filterDimensions = useMemo(
    () =>
      taxonomyConfig.dimensions
        .filter(
          (dimension) => dimension.filterable && dimension.active !== false,
        )
        .sort((first, second) => first.sort_order - second.sort_order),
    [taxonomyConfig],
  );
  const displayDimensions = useMemo(
    () =>
      taxonomyConfig.dimensions
        .filter((dimension) => dimension.active !== false)
        .sort((first, second) => first.sort_order - second.sort_order),
    [taxonomyConfig],
  );
  const pivotOptions = useMemo(
    () => [
      ...SYSTEM_PIVOT_OPTIONS,
      ...taxonomyConfig.dimensions
        .filter(
          (dimension) => dimension.groupable && dimension.active !== false,
        )
        .sort((first, second) => first.sort_order - second.sort_order)
        .map((dimension) => ({
          id: getDimensionPivotId(dimension),
          label: dimension.label,
          icon_key: dimension.icon_key,
          color: dimension.color,
          dimension,
          title: `${dimension.label} szerinti virtuális mappastruktúra.`,
        })),
    ],
    [taxonomyConfig],
  );
  const smartCollections = useMemo(
    () =>
      taxonomyConfig.smart_collections.filter(
        (collection) => collection.active !== false,
      ),
    [taxonomyConfig],
  );

  // The public taxonomy registry owns labels, allowed icons, dimensions and
  // smart collection definitions. The local registry remains a deliberate
  // compatibility fallback while older API deployments are rolling out.
  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;

    const loadTaxonomy = async () => {
      try {
        setTaxonomyStatus("loading");
        // Membership overrides are edited from the admin panel and must be
        // reflected by the next Knowledge Hub visit instead of waiting for a
        // cached taxonomy registry response to expire.
        const response = await viewerFetch("/api/knowledge/taxonomy", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`TAXONOMY_${response.status}`);
        const payload = await response.json();
        if (!isCurrent) return;
        setTaxonomyConfig(
          normalizeTaxonomyConfig(
            payload?.taxonomy ||
              payload?.registry ||
              payload?.config ||
              payload?.data ||
              payload,
          ),
        );
        setTaxonomyStatus("ready");
      } catch (error) {
        if (error?.name === "AbortError" || !isCurrent) return;
        setTaxonomyConfig(normalizeTaxonomyConfig(FALLBACK_TAXONOMY_CONFIG));
        setTaxonomyStatus("fallback");
      }
    };

    loadTaxonomy();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [viewerFetch]);

  // Project workspaces are a public, SQL-owned catalogue. The selector stays
  // in the knowledge vault, where the API independently enforces both public
  // visibility and the published-only boundary.
  useEffect(() => {
    if (!supportsProjectWorkspaces) return undefined;

    const controller = new AbortController();
    let isCurrent = true;

    const loadProjects = async () => {
      try {
        setProjectStatus("loading");
        const response = await viewerFetch("/api/knowledge/projects", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`PROJECTS_${response.status}`);
        const payload = await response.json();
        if (!isCurrent) return;
        setProjects(Array.isArray(payload) ? payload : payload?.projects || []);
        setProjectStatus("ready");
      } catch (error) {
        if (error?.name === "AbortError" || !isCurrent) return;
        setProjects([]);
        setProjectStatus("fallback");
      }
    };

    loadProjects();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [supportsProjectWorkspaces, viewerFetch]);

  // Sync searchQuery when location.search or state changes externally
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q =
      params.get("q") ||
      params.get("search") ||
      location.state?.searchQuery ||
      "";
    if (q) {
      setSearchQuery(q);
      setInArticleQuery(q);
    }
  }, [location.search, location.state]);

  useEffect(() => {
    searchQueryRef.current = searchQuery;
  }, [searchQuery]);

  // Faceted Pivot Matrix Mode: 'drive' | 'topic' | 'industry' | 'tech'
  const [treePivotMode, setTreePivotMode] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      return (
        urlParams.get("pivot") ||
        localStorage.getItem("vault_tree_pivot_mode") ||
        "drive"
      );
    } catch {
      return "drive";
    }
  });

  // Multi-Select Smart Folders: Array of active filter keys (e.g. ['featured', 'video'])
  const [smartFilters, setSmartFilters] = useState(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const raw = urlParams.get("smart");
      return raw
        ? raw
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    } catch {
      return [];
    }
  });

  const [copyToast, setCopyToast] = useState(false);

  useEffect(() => {
    if (!pivotOptions.some((option) => option.id === treePivotMode)) {
      setTreePivotMode("drive");
      setSelectedCategory("ALL");
    }
  }, [pivotOptions, treePivotMode]);

  useEffect(() => {
    try {
      localStorage.setItem("vault_tree_pivot_mode", treePivotMode);
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts.
    }
  }, [treePivotMode]);

  // Deep-Link Share URL Handler
  const handleShareView = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("pivot", treePivotMode);
    if (selectedCategory !== "ALL")
      url.searchParams.set("cat", selectedCategory);
    else url.searchParams.delete("cat");
    if (smartFilters.length > 0)
      url.searchParams.set("smart", smartFilters.join(","));
    else url.searchParams.delete("smart");
    const activeFacets = Object.fromEntries(
      Object.entries(selectedFacets).filter(
        ([, value]) => value && value !== ALL_TAXONOMY_FILTER,
      ),
    );
    if (Object.keys(activeFacets).length > 0)
      url.searchParams.set("facets", JSON.stringify(activeFacets));
    else url.searchParams.delete("facets");
    if (searchQuery.trim()) url.searchParams.set("q", searchQuery.trim());
    else url.searchParams.delete("q");
    if (supportsProjectWorkspaces && selectedProjectId !== ALL_PROJECT_FILTER) {
      url.searchParams.set("project_id", selectedProjectId);
    } else {
      url.searchParams.delete("project_id");
    }

    navigator.clipboard
      .writeText(url.toString())
      .then(() => {
        setCopyToast(true);
        setTimeout(() => setCopyToast(false), 2500);
      })
      .catch(() => {});
  };

  // In-Article RAG Synchronization States (Single Source of Truth)
  const [inArticleRagData, setInArticleRagData] = useState(null);
  const [inArticleFilterLevel, setInArticleFilterLevel] = useState("ALL");

  // Layout States
  // The desktop keeps its persistent navigator, while compact viewports start
  // with an unobtrusive, explicitly opened drawer.
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 1280;
  });
  const [collapsedFolders, setCollapsedFolders] = useState({});
  const [visibleFolderItems, setVisibleFolderItems] = useState({});
  const [visibleFolderCount, setVisibleFolderCount] = useState(
    INITIAL_VISIBLE_FOLDERS,
  );
  const [visibleHubResultCount, setVisibleHubResultCount] = useState(
    INITIAL_VISIBLE_HUB_RESULTS,
  );

  // Do not carry an expanded, potentially long listing into another search,
  // folder, or document context. The reset is shared by every entry point so
  // the DOM stays bounded even after a reader previously loaded more items.
  const resetArticleLimits = useCallback(() => {
    setVisibleFolderItems({});
    setVisibleFolderCount(INITIAL_VISIBLE_FOLDERS);
    setVisibleHubResultCount(INITIAL_VISIBLE_HUB_RESULTS);
  }, []);

  // Browser back/forward and shared URLs control the same filter as the
  // native selector. Clear stale client results while the public request for
  // the next workspace is in flight.
  useEffect(() => {
    if (!supportsProjectWorkspaces) return;
    const nextProjectId = normalizeProjectFilter(
      new URLSearchParams(location.search).get("project_id"),
    );
    setSelectedProjectId((currentProjectId) => {
      if (currentProjectId === nextProjectId) return currentProjectId;
      resetArticleLimits();
      setDocs([]);
      setSearchResults(null);
      return nextProjectId;
    });
  }, [location.search, resetArticleLimits, supportsProjectWorkspaces]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) || null,
    [projects, selectedProjectId],
  );

  const handleProjectSelection = useCallback(
    (value) => {
      const nextProjectId = normalizeProjectFilter(value);
      if (nextProjectId === selectedProjectId) return;

      resetArticleLimits();
      setDocs([]);
      setSearchResults(null);
      setSelectedCategory("ALL");
      setActiveDoc(null);
      setContent("");
      setSelectedProjectId(nextProjectId);

      const params = new URLSearchParams(location.search);
      if (nextProjectId === ALL_PROJECT_FILTER) params.delete("project_id");
      else params.set("project_id", nextProjectId);
      const query = params.toString();
      navigate(
        {
          pathname: baseRoute,
          search: query ? `?${query}` : "",
        },
        {
          state: { ...location.state, searchQuery: searchQueryRef.current },
        },
      );
    },
    [
      baseRoute,
      location.search,
      location.state,
      navigate,
      resetArticleLimits,
      selectedProjectId,
    ],
  );

  const resolveSmartCollection = useCallback(
    (key) =>
      smartCollections.find(
        (collection) => collection.id === key || collection.slug === key,
      ),
    [smartCollections],
  );

  const toggleSmartFilter = useCallback(
    (collectionOrKey) => {
      const collection =
        typeof collectionOrKey === "string"
          ? resolveSmartCollection(collectionOrKey)
          : collectionOrKey;
      const canonicalKey = collection?.id || collectionOrKey;
      const aliases = [collection?.id, collection?.slug, canonicalKey].filter(
        Boolean,
      );
      resetArticleLimits();
      setSmartFilters((prev) => {
        const hasCollection = prev.some((key) => aliases.includes(key));
        const withoutCollection = prev.filter((key) => !aliases.includes(key));
        return hasCollection
          ? withoutCollection
          : [...withoutCollection, canonicalKey];
      });
    },
    [resetArticleLimits, resolveSmartCollection],
  );

  const documentMatchesSelectedSmartFilters = useCallback(
    (document) =>
      smartFilters.every((key) => {
        const collection = resolveSmartCollection(key);
        return (
          !collection ||
          matchesTaxonomySmartCollection(
            document,
            collection,
            taxonomyConfig.dimensions,
          )
        );
      }),
    [resolveSmartCollection, smartFilters, taxonomyConfig.dimensions],
  );

  const getFoldersForPivot = useCallback(
    (document, pivotMode) => {
      const pivot = pivotOptions.find((option) => option.id === pivotMode);
      if (pivot?.dimension) {
        const values = getDocumentDimensionValues(document, pivot.dimension);
        return values.length
          ? values
          : [getPivotFallbackLabel(pivot.dimension)];
      }
      return getTreeFolders(document, pivotMode);
    },
    [pivotOptions],
  );

  const setFacetSelection = useCallback(
    (dimensionId, value) => {
      resetArticleLimits();
      setSelectedFacets((current) => {
        const next = { ...current };
        if (!value || value === ALL_TAXONOMY_FILTER) delete next[dimensionId];
        else next[dimensionId] = value;
        return next;
      });
    },
    [resetArticleLimits],
  );

  const closeMobileSidebar = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1280) {
      setSidebarOpen(false);
    }
  }, []);

  useEffect(() => {
    const closeOnCompactViewport = () => {
      if (window.innerWidth < 1280) setSidebarOpen(false);
    };

    window.addEventListener("resize", closeOnCompactViewport);
    return () => window.removeEventListener("resize", closeOnCompactViewport);
  }, []);

  const toggleFolder = (categoryName, e) => {
    if (e) e.stopPropagation();
    setCollapsedFolders((prev) => {
      const current = prev[categoryName] !== false;
      return {
        ...prev,
        [categoryName]: !current,
      };
    });
  };

  const handleSelectFolder = (categoryName) => {
    closeMobileSidebar();
    setActiveDoc(null);
    resetArticleLimits();
    setSelectedCategory((prev) =>
      prev === categoryName ? "ALL" : categoryName,
    );
    setCollapsedFolders((prev) => ({
      ...prev,
      [categoryName]: false,
    }));
  };

  const getDocumentUrl = apiEndpoints.doc;

  // Load a single Document into the Tactical Reader. The latest search query is
  // held in a ref so changing filters does not retrigger the initial document fetch.
  const loadDoc = useCallback(
    async (docItem, updateUrl = true) => {
      const currentSearchQuery = searchQueryRef.current;
      closeMobileSidebar();
      resetArticleLimits();
      setIsLoading(true);
      setActiveDoc(docItem);
      setInArticleQuery(currentSearchQuery || "");
      if (updateUrl) {
        // A cross-corpus result keeps its native reader. Knowledge records
        // remain in the research view; a public article opens in the simpler
        // editorial Blog reader rather than inheriting Knowledge navigation.
        const destinationBaseRoute = !isArticleView &&
          presentationProfileOf(docItem) === "article"
          ? "/blog"
          : baseRoute;
        const params = new URLSearchParams(location.search);
        if (
          supportsProjectWorkspaces &&
          selectedProjectId !== ALL_PROJECT_FILTER
        ) {
          params.set("project_id", selectedProjectId);
        }
        const query = params.toString();
        navigate(
          {
            pathname: `${destinationBaseRoute}/${docItem.slug}`,
            search: query ? `?${query}` : "",
          },
          { state: { ...location.state, searchQuery: currentSearchQuery } },
        );
      }
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
      }
      try {
        const res = await viewerFetch(getDocumentUrl(docItem.slug));
        if (res.ok) {
          const data = await res.json();
          setContent(data.content || "");
          // The list gives a compact asset projection; the document endpoint is
          // authoritative for the selected note's complete public manifest.
          setActiveDoc((current) =>
            current?.slug === docItem.slug ? { ...docItem, ...data } : current,
          );
        } else {
          setContent(
            docItem.content || "# HIBA\n\nA dokumentum tartalma nem érhető el.",
          );
        }
      } catch {
        setContent(
          docItem.content || "# HIBA\n\nA dokumentum tartalma nem tölthető be.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [
      baseRoute,
      closeMobileSidebar,
      getDocumentUrl,
      isArticleView,
      location.search,
      location.state,
      navigate,
      resetArticleLimits,
      selectedProjectId,
      supportsProjectWorkspaces,
      viewerFetch,
    ],
  );

  // 1. Initial Load of Docs & URL synchronization
  useEffect(() => {
    const controller = new AbortController();
    let isCurrent = true;

    const fetchDocs = async () => {
      try {
        const params = new URLSearchParams();
        if (
          supportsProjectWorkspaces &&
          selectedProjectId !== ALL_PROJECT_FILTER
        ) {
          params.set("project_id", selectedProjectId);
        }
        const res = await viewerFetch(
          appendQueryParameters(apiEndpoints.list, params),
          { signal: controller.signal },
        );
        if (res.ok) {
          const data = await res.json();
          if (!isCurrent) return;
          const list = readApiDocuments(data);
          setDocs(list);

          const currentSlug = docSlugParam
            ? docSlugParam.replace(/^(knowledge|blog|docs)\/?/, "")
            : "";
          if (currentSlug && currentSlug.trim() !== "") {
            const target = list.find((d) => d.slug === currentSlug);
            if (target) {
              loadDoc(target, false);
            }
          } else {
            setActiveDoc(null);
            setContent("");
          }
        }
      } catch (err) {
        if (err?.name === "AbortError" || !isCurrent) return;
        console.error("Failed to load vault items:", err);
      }
    };
    fetchDocs();
    return () => {
      isCurrent = false;
      controller.abort();
    };
  }, [
    docSlugParam,
    apiEndpoints.list,
    loadDoc,
    selectedProjectId,
    supportsProjectWorkspaces,
    viewerFetch,
  ]);

  // 2. RAG Search & Query
  useEffect(() => {
    const hasSelectedFacet = filterDimensions.some((dimension) => {
      const value = selectedFacets[dimension.id];
      return value && value !== ALL_TAXONOMY_FILTER;
    });
    if (
      !searchQuery.trim() &&
      selectedCategory === "ALL" &&
      !hasSelectedFacet
    ) {
      setSearchResults(null);
      setIsSearching(false);
      return;
    }

    const controller = new AbortController();
    let isCurrent = true;
    const timer = setTimeout(async () => {
      try {
        setIsSearching(true);
        const params = new URLSearchParams();
        if (searchQuery.trim()) params.append("q", searchQuery.trim());
        if (
          supportsProjectWorkspaces &&
          selectedProjectId !== ALL_PROJECT_FILTER
        ) {
          params.append("project_id", selectedProjectId);
        }
        // The navigator can group articles into display-normalized Drive
        // folders or virtual topic/industry/tech folders. Those labels do not
        // necessarily match a stored API category (especially in the Blog),
        // so applying them server-side can turn a valid folder into an empty
        // response. Keep this pivot filter local; `displayDocs` applies it
        // with getTreeFolders consistently.
        filterDimensions.forEach((dimension) => {
          const selectedValue = selectedFacets[dimension.id];
          if (selectedValue && selectedValue !== ALL_TAXONOMY_FILTER) {
            params.append(
              dimension.frontmatter_key || dimension.id,
              selectedValue,
            );
          }
        });
        // The canonical collection is the public article database. Its API
        // explicitly bounds requests at 250, which keeps a broad search
        // complete for the Hub while remaining safely capped server-side.
        if (apiEndpoints.search === "/api/documents/search") {
          params.append("limit", "250");
        }
        params.append("sortBy", sortBy);

        const url = searchQuery.trim()
          ? `${apiEndpoints.search}?${params.toString()}`
          : `${apiEndpoints.list}?${params.toString()}`;

        const res = await viewerFetch(url, { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          if (!isCurrent) return;
          const list = readApiDocuments(data);
          setSearchResults(list);
        }
      } catch (err) {
        if (err?.name === "AbortError" || !isCurrent) return;
        console.error("Search query failed:", err);
      } finally {
        if (isCurrent) setIsSearching(false);
      }
    }, 180);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    searchQuery,
    selectedCategory,
    selectedFacets,
    filterDimensions,
    sortBy,
    apiEndpoints,
    selectedProjectId,
    supportsProjectWorkspaces,
    viewerFetch,
  ]);

  const closeDocToHub = () => {
    closeMobileSidebar();
    resetArticleLimits();
    setActiveDoc(null);
    setContent("");
    const params = new URLSearchParams(location.search);
    if (supportsProjectWorkspaces && selectedProjectId !== ALL_PROJECT_FILTER) {
      params.set("project_id", selectedProjectId);
    }
    const query = params.toString();
    navigate(
      {
        pathname: baseRoute,
        search: query ? `?${query}` : "",
      },
      { state: { ...location.state, searchQuery } },
    );
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
    }
  };

  const handleEditorSaved = useCallback((payload) => {
    const savedSlug = payload?.document?.slug;
    if (!savedSlug) return;
    const refreshedDocument = docs.find((item) => item?.slug === savedSlug)
      || (activeDoc?.slug === savedSlug ? activeDoc : null);
    if (refreshedDocument) void loadDoc(refreshedDocument, false);
  }, [activeDoc, docs, loadDoc]);

  const closeEditor = useCallback(() => {
    setEditingDocumentSlug('');
  }, []);

  // Dynamic Cascading Filter Options. Each filter's options are calculated
  // from every other selected facet, so taxonomies can grow without adding
  // another hard-coded filter branch here.
  const dynamicFilterOptions = useMemo(() => {
    const baseList = searchResults !== null ? searchResults : docs;
    let scopeDocs = baseList;
    if (smartFilters.length > 0) {
      scopeDocs = scopeDocs.filter(documentMatchesSelectedSmartFilters);
    }
    if (selectedCategory !== "ALL") {
      scopeDocs = scopeDocs.filter((document) =>
        getFoldersForPivot(document, treePivotMode).includes(selectedCategory),
      );
    }
    return buildTaxonomyFacetOptions(
      scopeDocs,
      filterDimensions,
      selectedFacets,
    );
  }, [
    searchResults,
    docs,
    smartFilters,
    selectedCategory,
    treePivotMode,
    selectedFacets,
    filterDimensions,
    documentMatchesSelectedSmartFilters,
    getFoldersForPivot,
  ]);

  // Prevent a stale option from leaving the command hub in a dead-end state
  // after a parent facet, smart collection or taxonomy registry changes.
  useEffect(() => {
    setSelectedFacets((current) => {
      let changed = false;
      const next = { ...current };
      filterDimensions.forEach((dimension) => {
        const selectedValue = current[dimension.id];
        if (!selectedValue || selectedValue === ALL_TAXONOMY_FILTER) return;
        const option = (dynamicFilterOptions[dimension.id] || []).find(
          (candidate) =>
            candidate.value === selectedValue ||
            candidate.label === selectedValue ||
            candidate.term?.id === selectedValue ||
            candidate.term?.slug === selectedValue,
        );
        if (!option) {
          delete next[dimension.id];
          changed = true;
        } else if (option.value !== selectedValue) {
          next[dimension.id] = option.value;
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [dynamicFilterOptions, filterDimensions]);

  // Display items with dynamic scores & sorting
  const displayDocs = useMemo(() => {
    const rawList = searchResults !== null ? searchResults : docs;
    const cleanQ = searchQuery.trim().toLowerCase();

    const scored = rawList.map((item) => {
      let finalScore = item.scorePercentage || item.relevanceScore;
      let finalLabel = item.scoreLabel || (cleanQ ? "MATCH" : "AJÁNLÁS");

      if (cleanQ) {
        finalLabel = "MATCH";
        if (!finalScore || finalScore === 92) {
          let dynamicMatch = 70;
          const normTitle = (item.title || "").toLowerCase();
          const normSummary = (item.summary || "").toLowerCase();
          const normContent = (item.content || "").toLowerCase();

          if (normTitle.includes(cleanQ)) dynamicMatch += 22;
          else if (normSummary.includes(cleanQ)) dynamicMatch += 14;
          else if (normContent.includes(cleanQ)) dynamicMatch += 8;

          finalScore = Math.min(99, Math.max(68, dynamicMatch));
        }
      } else {
        finalLabel = "AJÁNLÁS";
        if (!finalScore || finalScore === 92) {
          let rec = 84;
          if (item.audio_url) rec += 5;
          const len = (item.content || "").length;
          if (len > 2500) rec += 5;
          else if (len > 1200) rec += 3;
          finalScore = Math.min(99, Math.max(80, rec));
        }
      }

      return {
        ...item,
        scorePercentage: finalScore,
        scoreLabel: finalLabel,
      };
    });

    let filtered = scored;

    // Multi-Select Smart Folders Filter
    if (smartFilters.length > 0) {
      filtered = filtered.filter(documentMatchesSelectedSmartFilters);
    }

    // Faceted Tree Folder filter
    if (selectedCategory !== "ALL") {
      filtered = filtered.filter((document) =>
        getFoldersForPivot(document, treePivotMode).includes(selectedCategory),
      );
    }
    filtered = filtered.filter((document) =>
      documentMatchesFacets(document, filterDimensions, selectedFacets),
    );

    filtered.sort((a, b) => {
      if (sortBy === "recommended")
        return (b.scorePercentage || 0) - (a.scorePercentage || 0);
      if (sortBy === "newest")
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      if (sortBy === "read_time") {
        const parseTime = (s) => parseInt(s, 10) || 0;
        return parseTime(b.read_time) - parseTime(a.read_time);
      }
      return (b.scorePercentage || 0) - (a.scorePercentage || 0);
    });

    return filtered;
  }, [
    searchResults,
    docs,
    searchQuery,
    selectedCategory,
    selectedFacets,
    sortBy,
    treePivotMode,
    smartFilters,
    filterDimensions,
    documentMatchesSelectedSmartFilters,
    getFoldersForPivot,
  ]);

  // Keep the hub and search result views scannable even when a broad query
  // returns many documents. A changed result set deliberately starts from the
  // compact first page again.
  useEffect(() => {
    setVisibleHubResultCount(INITIAL_VISIBLE_HUB_RESULTS);
  }, [displayDocs]);

  const visibleHubDocs = useMemo(
    () => displayDocs.slice(0, visibleHubResultCount),
    [displayDocs, visibleHubResultCount],
  );
  const remainingHubResults = Math.max(
    displayDocs.length - visibleHubDocs.length,
    0,
  );

  // Dynamic Item Counts for Smart Virtual Collections
  const smartCounts = useMemo(() => {
    const list = docs || [];
    return smartCollections.reduce((counts, collection) => {
      counts[collection.id] = list.filter((document) =>
        matchesTaxonomySmartCollection(
          document,
          collection,
          taxonomyConfig.dimensions,
        ),
      ).length;
      return counts;
    }, {});
  }, [docs, smartCollections, taxonomyConfig.dimensions]);

  // Group into Folder Categories for Left Sidebar based on active Pivot Mode.
  const categoriesGroup = useMemo(() => {
    const baseList = searchResults !== null ? searchResults : docs;
    const map = {};
    baseList.forEach((item) => {
      const folders = getFoldersForPivot(item, treePivotMode);
      folders.forEach((folder) => {
        if (!map[folder]) map[folder] = [];
        if (!map[folder].some((existing) => existing.slug === item.slug)) {
          map[folder].push(item);
        }
      });
    });
    return map;
  }, [searchResults, docs, treePivotMode, getFoldersForPivot]);

  const categoryEntries = useMemo(
    () =>
      Object.entries(categoriesGroup).filter(
        ([category]) =>
          selectedCategory === "ALL" || selectedCategory === category,
      ),
    [categoriesGroup, selectedCategory],
  );

  // Pivot/search/category changes can create an entirely new folder tree, so
  // return it to its compact first page rather than carrying stale expansion counts.
  useEffect(() => {
    setVisibleFolderItems({});
    setVisibleFolderCount(INITIAL_VISIBLE_FOLDERS);
  }, [categoriesGroup, selectedCategory]);

  const visibleCategoryEntries = useMemo(
    () => categoryEntries.slice(0, visibleFolderCount),
    [categoryEntries, visibleFolderCount],
  );
  const remainingFolderCategories = Math.max(
    categoryEntries.length - visibleCategoryEntries.length,
    0,
  );

  // Bi-Directional Backlinks & Semantic Mesh Connections for Active Doc
  const backlinks = useMemo(() => {
    if (!activeDoc || !docs.length) return [];
    const termKey = (dimension, value) =>
      getTaxonomyTerm(dimension, value)?.id ||
      String(value || "")
        .trim()
        .toLocaleLowerCase("hu-HU");

    return docs
      .filter((d) => d.slug !== activeDoc.slug)
      .map((d) => {
        const sharedTerms = displayDimensions.flatMap((dimension) => {
          const activeValues = getDocumentDimensionValues(activeDoc, dimension);
          const documentTermKeys = new Set(
            getDocumentDimensionValues(d, dimension).map((value) =>
              termKey(dimension, value),
            ),
          );
          return activeValues
            .filter((value) => documentTermKeys.has(termKey(dimension, value)))
            .map((value) => ({
              dimension,
              value,
              term: getTaxonomyTerm(dimension, value),
            }));
        });
        return {
          doc: d,
          score: sharedTerms.length,
          sharedTerms: sharedTerms.slice(0, 3),
        };
      })
      .filter((b) => b.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
  }, [activeDoc, docs, displayDimensions]);

  // TOC Headings Extraction
  const headings = useMemo(() => extractHeadings(content), [content]);

  // In-article match navigation with direct scroll-into-view & persistent focus
  const handleNavigateToMatch = useCallback((match) => {
    if (!match) return;

    // Korábbi fókuszkeretek eltávolítása
    document.querySelectorAll(".active-match-focus").forEach((el) => {
      el.classList.remove(
        "active-match-focus",
        "ring-4",
        "ring-plasmaGreen",
        "ring-neonCyan",
        "ring-neonMagenta",
        "bg-emerald-950/40",
        "bg-cyan-950/40",
        "bg-fuchsia-950/40",
        "p-2",
        "border-l-4",
      );
    });

    const contentElements = Array.from(
      document.querySelectorAll(
        ".prose-cyber p, .prose-cyber li, .prose-cyber mark, .prose-cyber blockquote, .prose-cyber h1, .prose-cyber h2, .prose-cyber h3, .prose-cyber h4",
      ),
    );

    const cleanWords = (match.snippet || "")
      .toLowerCase()
      .replace(/[^a-z0-9áéíóöőúüű\s]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3);

    // 1. Prioritás: Valós szöveges tartalom (p, li, blockquote) - NE fejléc legyen!
    let targetEl = contentElements.find((el) => {
      if (/^H[1-6]$/i.test(el.tagName)) return false;
      const text = (el.textContent || "").toLowerCase();
      return (
        cleanWords.length > 0 &&
        cleanWords.slice(0, 3).every((w) => text.includes(w))
      );
    });

    // 2. Másodlagos: Részlet-illeszkedés
    if (!targetEl && match.snippet) {
      const cleanSnippet = match.snippet.slice(0, 35).toLowerCase();
      targetEl = contentElements.find((el) => {
        if (/^H[1-6]$/i.test(el.tagName)) return false;
        return (
          el.textContent && el.textContent.toLowerCase().includes(cleanSnippet)
        );
      });
    }

    // 3. Harmadlagos: Ha tényleg csak a fejléc a találat
    if (!targetEl && match.heading) {
      targetEl = contentElements.find((el) => {
        return (
          /^H[1-6]$/i.test(el.tagName) &&
          el.textContent &&
          el.textContent.toLowerCase().includes(match.heading.toLowerCase())
        );
      });
    }

    if (targetEl) {
      targetEl.scrollIntoView({
        behavior: preferredScrollBehavior(),
        block: "center",
      });

      // Szint-specifikus neon szín kiválasztása
      let ringColor = "ring-plasmaGreen";
      let bgColor = "bg-emerald-950/40";
      if (match.level === "KEYWORD") {
        ringColor = "ring-neonCyan";
        bgColor = "bg-cyan-950/40";
      } else if (match.level === "SEMANTIC") {
        ringColor = "ring-neonMagenta";
        bgColor = "bg-fuchsia-950/40";
      }

      targetEl.classList.add(
        "active-match-focus",
        "ring-4",
        ringColor,
        bgColor,
        "transition-all",
        "duration-300",
        "p-2",
      );
    }
  }, []);

  const activeFilterCount =
    (selectedCategory !== "ALL" ? 1 : 0) +
    filterDimensions.filter((dimension) => {
      const value = selectedFacets[dimension.id];
      return value && value !== ALL_TAXONOMY_FILTER;
    }).length +
    smartFilters.length;

  const resetFilters = () => {
    resetArticleLimits();
    setSelectedCategory("ALL");
    setSelectedFacets({});
    setSmartFilters([]);
    setSearchQuery("");
  };

  return (
    <div className="min-h-screen w-full min-w-0 max-w-full bg-[var(--bg-main)] text-[var(--text-main)] pt-20 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-10 transition-colors duration-200">
      {/* ── Tactical Header Bar ── */}
      <div className="sticky top-16 z-30 flex w-full min-w-0 max-w-full items-center gap-1.5 border-b-2 border-slate-900 bg-white/95 px-2 py-2.5 shadow-sm backdrop-blur-md transition-colors dark:border-white/10 dark:bg-slate-900/90 sm:gap-3 sm:px-6 sm:py-3.5 font-mono">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
          <div className="w-1.5 h-6 shrink-0 dark:bg-neonCyan bg-cyan-700 shadow-[0_0_10px_#00FFFF]" />
          <button
            onClick={closeDocToHub}
            data-testid="vault-header-title"
            className="flex min-w-0 items-center gap-1.5 font-headline text-[10px] font-black uppercase tracking-[0.08em] text-cyan-800 transition-opacity hover:opacity-80 dark:text-neonCyan sm:gap-2 sm:text-sm sm:tracking-widest cursor-pointer"
          >
            <span className="min-w-0 truncate sm:hidden">
              {isArticleView ? "CIKKEK" : "TUDÁSTÁR"}
            </span>
            <span className="hidden min-w-0 truncate sm:inline">
              {headerConfig.headerTitle ||
                (isArticleView ? "CIKK_ARCHÍVUM" : "KNOWLEDGE_VAULT")}
            </span>
            <span className="hidden shrink-0 border border-neonCyan/40 bg-neonCyan/10 px-1.5 py-0.5 text-[10px] font-bold text-neonCyan min-[360px]:inline">
              {headerConfig.version || "v2.0"}
            </span>
          </button>
          <span className="text-[11px] dark:text-slate-400 text-slate-600 ml-2 hidden lg:flex items-center gap-1.5 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {headerConfig.statusBadge || "// RAG_ACTIVE"}
          </span>
        </div>

        {/* A single-row, persistent entry point for the folder navigator. */}
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          aria-controls="vault-folder-sidebar"
          aria-expanded={sidebarOpen}
          aria-label={`${sidebarOpen ? "Mappák és szűrők bezárása" : "Mappák és szűrők megnyitása"} (${categoryEntries.length} mappa)`}
          data-testid="vault-folder-toggle"
          className={`flex min-h-10 shrink-0 items-center gap-1.5 border-2 px-2 py-1.5 font-mono text-[10px] font-black uppercase tracking-wide transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neonCyan focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 sm:px-3 sm:text-[11px] ${
            sidebarOpen
              ? "border-cyan-800 bg-cyan-100 text-cyan-950 dark:border-neonCyan dark:bg-neonCyan/15 dark:text-neonCyan"
              : "border-cyan-800 bg-cyan-50 text-cyan-950 hover:bg-cyan-100 dark:border-neonCyan/70 dark:bg-slate-950 dark:text-neonCyan dark:hover:bg-neonCyan/15"
          }`}
          title={
            sidebarOpen
              ? "Mappa-navigátor bezárása"
              : "Mappa-navigátor megnyitása"
          }
        >
          <FolderOpen size={16} aria-hidden="true" className="shrink-0" />
          <span>MAPPÁK</span>
          <span
            className="inline-flex min-w-4 items-center justify-center border border-current/35 px-1 py-0.5 text-[9px] leading-none"
            aria-hidden="true"
          >
            {categoryEntries.length}
          </span>
          <span
            className={`h-1.5 w-1.5 rounded-full ${sidebarOpen ? "bg-plasmaGreen shadow-[0_0_6px_#80FF00]" : "bg-current/45"}`}
            aria-hidden="true"
          />
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`shrink-0 transition-transform ${sidebarOpen ? "rotate-180" : ""}`}
          />
        </button>

        {/* Right Header Actions */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          {/* Deep-Link Share Button */}
          <button
            onClick={handleShareView}
            data-testid="vault-share-view"
            aria-label={
              copyToast
                ? "Megosztható link kimásolva"
                : "Aktuális szűrt nézet megosztható linkjének másolása"
            }
            className="flex min-h-10 min-w-10 items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-bold dark:bg-neonMagenta/10 bg-fuchsia-100 border-2 dark:border-neonMagenta border-fuchsia-800 dark:text-neonMagenta text-fuchsia-950 hover:bg-neonMagenta hover:text-white transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none cursor-pointer"
            title="Aktuális szűrt nézet megosztható linkjének másolása"
          >
            {copyToast ? (
              <Check size={13} className="text-plasmaGreen" />
            ) : (
              <Share2 size={13} />
            )}
            <span className="hidden sm:inline">
              {copyToast ? "LINK MÁSOLVA! ✓" : "MEGOSZTÁS 🔗"}
            </span>
          </button>

          {activeDoc ? (
            <button
              onClick={closeDocToHub}
              aria-label="Visszatérés a Tudástár áttekintéshez"
              className="flex min-h-10 min-w-10 items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-bold dark:bg-neonCyan/10 bg-cyan-100 border-2 dark:border-neonCyan border-cyan-800 dark:text-neonCyan text-cyan-900 hover:bg-neonCyan hover:text-black transition-all shadow-[2px_2px_0_#0f172a] dark:shadow-none cursor-pointer sm:px-3"
            >
              <LayoutGrid size={13} />
              <span className="hidden sm:inline">ÁTTEKINTÉS_HUB ◀</span>
            </button>
          ) : (
            <div className="text-[11px] font-bold dark:text-slate-400 text-slate-700 hidden sm:block">
              MUTATVA:{" "}
              <strong className="text-neonCyan">{visibleHubDocs.length}</strong>{" "}
              / {displayDocs.length} CIKK
            </div>
          )}
        </div>
      </div>

      {/* ── 3-Column Main Layout ── */}
      <div
        className={`relative flex min-w-0 items-start ${
          activeDoc
            ? ""
            : "xl:h-[calc(100dvh-8.5rem)] xl:min-h-0 xl:overflow-hidden"
        }`}
      >
        {/* ───────────────────────────────────────────────────────────── */}
        {/* 1. BAL SÁV: FASTUKTÚRA & GYORSKERESŐ                           */}
        {/* ───────────────────────────────────────────────────────────── */}
        <aside
          id="vault-folder-sidebar"
          data-testid="vault-folder-sidebar"
          aria-label="Mappák és szűrők"
          aria-hidden={!sidebarOpen}
          className={`
            ${
              sidebarOpen
                ? `w-72 sm:w-84 overflow-y-auto overscroll-contain ${
                    activeDoc
                      ? "xl:overflow-visible"
                      : "xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-gutter:stable]"
                  }`
                : "w-0 overflow-hidden invisible pointer-events-none"
            }
            shrink-0 border-r-2 dark:border-white/10 border-slate-900 dark:bg-[#070b19] bg-slate-50
            flex flex-col transition-all duration-300
            fixed top-36 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-0 z-20
            ${
              activeDoc
                ? "xl:sticky xl:top-[8.5rem] xl:bottom-auto xl:left-auto xl:z-auto xl:self-start"
                : "xl:static xl:self-stretch"
            }
          `}
        >
          {/* Hub Button & Folder Navigator Header in Sidebar */}
          <div className="p-3 border-b-2 dark:border-white/10 border-slate-900 dark:bg-black/40 bg-white space-y-3">
            <div className="flex items-center justify-between gap-3 border-b dark:border-white/10 border-slate-200 pb-2.5 font-mono">
              <div className="min-w-0 flex items-center gap-2">
                <FolderOpen
                  size={15}
                  className="shrink-0 text-neonCyan"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-black uppercase tracking-wider text-slate-900 dark:text-white">
                    Mappa-navigátor
                  </p>
                  <p className="text-[9px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Kategóriák, szűrők, gyűjtemények
                  </p>
                </div>
              </div>
              <span className="shrink-0 border border-neonCyan/40 bg-neonCyan/10 px-1.5 py-0.5 text-[9px] font-black text-cyan-800 dark:text-neonCyan">
                {categoryEntries.length} MAPPA
              </span>
            </div>

            <button
              onClick={closeDocToHub}
              className={`w-full flex items-center justify-center gap-2 p-2.5 font-headline font-black text-xs uppercase tracking-wider border-2 transition-all cursor-pointer ${
                !activeDoc
                  ? "dark:bg-neonCyan bg-cyan-700 text-white dark:text-black border-slate-950 shadow-[3px_3px_0_#0f172a]"
                  : "dark:bg-slate-900 bg-slate-100 dark:text-slate-300 text-slate-800 border-slate-900 hover:border-neonCyan"
              }`}
            >
              <LayoutGrid size={14} />
              <span>
                {headerConfig.hubButtonLabel ||
                  (isArticleView
                    ? "CIKK_BEMUTATÓ_HUB"
                    : "TUDÁSTÁR_BEMUTATÓ_HUB")}
              </span>
            </button>

            {/* Faceted Tree Pivot Matrix Selector */}
            <div className="pt-2 border-t dark:border-white/10 border-slate-200 space-y-1.5 font-mono">
              <div className="flex items-center justify-between text-[9px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-wider">
                <span className="flex items-center gap-1">
                  <Network size={11} className="text-neonCyan" />
                  PIVOT STRUKTÚRA:
                </span>
                <span className="text-neonCyan font-bold">
                  [{treePivotMode.toUpperCase()}]
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1 border border-slate-300 bg-slate-200 p-1 dark:border-white/10 dark:bg-slate-900/80 sm:grid-cols-4">
                {pivotOptions.map((pivot) => {
                  const isActive = treePivotMode === pivot.id;
                  const accent = getTaxonomyColor(pivot.color);
                  return (
                    <button
                      key={pivot.id}
                      type="button"
                      onClick={() => {
                        resetArticleLimits();
                        setTreePivotMode(pivot.id);
                        setSelectedCategory("ALL");
                      }}
                      aria-pressed={isActive}
                      className={`flex min-w-0 items-center justify-center gap-1 px-1 py-1 text-center font-black text-[9px] uppercase transition-all cursor-pointer ${
                        isActive
                          ? "font-extrabold shadow-[1px_1px_0_#0f172a]"
                          : "text-slate-600 hover:text-cyan-600 dark:text-slate-400 dark:hover:text-neonCyan"
                      }`}
                      style={
                        isActive
                          ? {
                              backgroundColor: accent,
                              color: "#020617",
                              boxShadow: `0 0 10px ${accent}80`,
                            }
                          : undefined
                      }
                      title={pivot.title}
                    >
                      <TaxonomyIcon
                        iconKey={pivot.icon_key}
                        size={10}
                        aria-hidden="true"
                        className="shrink-0"
                      />
                      <span className="truncate">{pivot.label}</span>
                    </button>
                  );
                })}
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
                    onClick={() => {
                      resetArticleLimits();
                      setSmartFilters([]);
                    }}
                    className="text-neonMagenta hover:underline font-bold text-[8px] cursor-pointer"
                  >
                    VISSZAÁLLÍTÁS ({smartFilters.length}) ✕
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[9px]">
                {smartCollections.map((collection) => {
                  const isActive = smartFilters.some(
                    (key) => key === collection.id || key === collection.slug,
                  );
                  const accent = getTaxonomyColor(collection.color, "#ff00ff");
                  return (
                    <button
                      key={collection.id}
                      type="button"
                      onClick={() => toggleSmartFilter(collection)}
                      aria-pressed={isActive}
                      className={`flex min-w-0 items-center justify-between gap-1 border px-2 py-1.5 transition-all cursor-pointer ${
                        isActive
                          ? "font-black text-white shadow-[0_0_10px_rgba(0,255,255,0.35)]"
                          : "border-slate-300 bg-slate-100 text-slate-700 hover:border-neonCyan dark:border-white/10 dark:bg-slate-900 dark:text-slate-300"
                      }`}
                      style={
                        isActive
                          ? {
                              borderColor: accent,
                              backgroundColor: `${accent}33`,
                            }
                          : undefined
                      }
                      title={`${collection.label} smart gyűjtemény (többszörös kijelölés lehetséges)`}
                    >
                      <span className="flex min-w-0 items-center gap-1 font-bold">
                        <TaxonomyIcon
                          iconKey={collection.icon_key}
                          size={10}
                          aria-hidden="true"
                          style={{ color: accent }}
                          className="shrink-0"
                        />
                        <span className="truncate">{collection.label}</span>
                      </span>
                      <span
                        className="font-mono text-[8px] font-bold"
                        style={{ color: accent }}
                      >
                        {smartCounts[collection.id] || 0}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Folder Tree Navigation with Fluid Animation */}
          <nav className="p-3 space-y-3">
            <AnimatePresence mode="popLayout">
              {/* Taktikai '..' Visszalépés a Gyökérmappába */}
              {selectedCategory !== "ALL" && (
                <motion.button
                  key="parent-dir-btn"
                  layout
                  initial={{ opacity: 0, height: 0, y: -10 }}
                  animate={{ opacity: 1, height: "auto", y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -10 }}
                  transition={{ duration: 0.25, ease: [0.25, 1, 0.5, 1] }}
                  onClick={() => {
                    resetArticleLimits();
                    setSelectedCategory("ALL");
                    closeMobileSidebar();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left border-2 border-dashed dark:border-neonCyan/50 border-cyan-700 dark:bg-neonCyan/10 bg-cyan-50 font-mono text-xs font-bold text-cyan-900 dark:text-neonCyan hover:bg-neonCyan hover:text-black mb-3 cursor-pointer shadow-[2px_2px_0_#0f172a] group overflow-hidden"
                  title="Visszalépés a szülőkönyvtárhoz (Összes mappa mutatása)"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-neonCyan group-hover:text-black">
                      📁 ..
                    </span>
                    <span className="truncate uppercase tracking-wider text-[11px]">
                      [SZÜLŐKÖNYVTÁR]
                    </span>
                  </div>
                  <span className="text-[10px] font-mono opacity-80">ALL/</span>
                </motion.button>
              )}

              {visibleCategoryEntries.map(
                ([category, catItems], categoryIndex) => {
                  const isCollapsed =
                    selectedCategory === category
                      ? false
                      : collapsedFolders[category] !== false;
                  const visibleItemCount =
                    visibleFolderItems[category] ??
                    INITIAL_VISIBLE_FOLDER_ITEMS;
                  const visibleItems = catItems.slice(0, visibleItemCount);
                  const remainingItems = Math.max(
                    catItems.length - visibleItems.length,
                    0,
                  );
                  const folderListId = `vault-folder-items-${categoryIndex}`;
                  return (
                    <motion.div
                      key={category}
                      layout
                      initial={{ opacity: 0, scale: 0.96, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{
                        opacity: 0,
                        scale: 0.94,
                        height: 0,
                        transition: { duration: 0.25, ease: "easeOut" },
                      }}
                      transition={{ duration: 0.3, ease: [0.25, 1, 0.5, 1] }}
                      className="border-2 dark:border-white/10 border-slate-900 dark:bg-slate-900/40 bg-white shadow-[2px_2px_0_#0f172a] dark:shadow-none overflow-hidden"
                    >
                      {/* Category Folder Header: explicit selection and separate disclosure controls. */}
                      <div
                        className={`w-full flex items-center justify-between px-3 py-2.5 border-b dark:border-white/10 border-slate-300 transition-all text-left select-none group ${
                          selectedCategory === category
                            ? "bg-neonCyan/20 border-neonCyan text-white shadow-[inset_4px_0_0_#00FFFF]"
                            : "dark:bg-slate-800/80 bg-slate-200/90 hover:bg-neonCyan/10 dark:hover:bg-neonCyan/10 text-slate-900 dark:text-white"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectFolder(category)}
                          data-testid="folder-category"
                          data-category={category}
                          aria-current={
                            selectedCategory === category ? "page" : undefined
                          }
                          title={`${category} mappa kiválasztása`}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neonCyan"
                        >
                          {isCollapsed ? (
                            <Folder
                              size={15}
                              aria-hidden="true"
                              className={`${selectedCategory === category ? "text-neonCyan" : "text-neonMagenta"} drop-shadow-[0_0_8px_#FF00FF] shrink-0`}
                            />
                          ) : (
                            <FolderOpen
                              size={15}
                              aria-hidden="true"
                              className="text-neonCyan drop-shadow-[0_0_8px_#00FFFF] shrink-0"
                            />
                          )}
                          <span
                            className={`font-headline font-black text-xs uppercase tracking-wider transition-colors truncate ${
                              selectedCategory === category
                                ? "text-neonCyan"
                                : "group-hover:text-neonCyan"
                            }`}
                          >
                            {category}
                          </span>
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 bg-black/10 dark:bg-black/60 border dark:border-neonCyan/30 border-slate-400 text-slate-800 dark:text-neonCyan">
                            {catItems.length}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => toggleFolder(category, e)}
                            aria-controls={folderListId}
                            aria-expanded={!isCollapsed}
                            aria-label={
                              isCollapsed
                                ? `${category} mappa kinyitása`
                                : `${category} mappa összecsukása`
                            }
                            className="p-1 hover:text-neonCyan text-slate-500 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neonCyan"
                            title={
                              isCollapsed
                                ? "Mappa kinyitása"
                                : "Mappa összecsukása"
                            }
                          >
                            {isCollapsed ? (
                              <ChevronRight
                                size={13}
                                className="text-slate-600 dark:text-slate-400"
                              />
                            ) : (
                              <ChevronDown
                                size={13}
                                className="text-neonCyan"
                              />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Article List in Folder fluid animációval */}
                      <AnimatePresence>
                        {!isCollapsed && (
                          <motion.div
                            id={folderListId}
                            role="region"
                            aria-label={`${category} dokumentumok`}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25, ease: "easeInOut" }}
                            className="overflow-hidden py-1 dark:bg-black/30 bg-white space-y-0.5"
                          >
                            {visibleItems.map((item) => {
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
                                        ? "dark:border-neonCyan border-cyan-600 dark:text-neonCyan text-cyan-800 dark:bg-neonCyan/15 bg-cyan-100 font-black shadow-[inset_4px_0_0_#00FFFF]"
                                        : "border-transparent dark:text-slate-300 text-slate-700 dark:hover:text-white hover:text-slate-950 dark:hover:bg-white/[0.05] hover:bg-slate-100 font-bold"
                                    }
                                  `}
                                >
                                  <div className="flex items-center gap-2 w-full">
                                    <FileText
                                      size={12}
                                      className={`shrink-0 ${
                                        isActive
                                          ? "text-neonCyan drop-shadow-[0_0_8px_#00FFFF]"
                                          : "text-emerald-700 dark:text-plasmaGreen drop-shadow-[0_0_5px_#80FF00]"
                                      }`}
                                    />
                                    <span className="truncate uppercase tracking-wide leading-tight flex-1">
                                      <HighlightText
                                        text={item.title}
                                        query={searchQuery}
                                      />
                                    </span>
                                  </div>

                                  {/* Score badge in sidebar */}
                                  <div className="mt-1 pl-5 flex items-center justify-between text-[9px] text-slate-500 dark:text-slate-400 font-mono">
                                    <span className="text-emerald-700 dark:text-plasmaGreen font-bold flex items-center gap-1">
                                      <Zap size={9} />
                                      {item.scorePercentage || 90}%{" "}
                                      {item.scoreLabel || "MATCH"}
                                    </span>
                                    <span className="text-slate-400 font-normal">
                                      {item.read_time || "4 PERC"}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}

                            {remainingItems > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setVisibleFolderItems((prev) => ({
                                    ...prev,
                                    [category]: Math.min(
                                      catItems.length,
                                      (prev[category] ??
                                        INITIAL_VISIBLE_FOLDER_ITEMS) +
                                        FOLDER_ITEMS_PAGE_SIZE,
                                    ),
                                  }))
                                }
                                data-testid="folder-load-more"
                                data-category={category}
                                className="mx-2 my-2 flex w-[calc(100%-1rem)] items-center justify-between gap-2 border border-dashed border-cyan-700 dark:border-neonCyan/60 bg-cyan-50 px-2.5 py-2 text-left font-mono text-[10px] font-black uppercase text-cyan-900 transition-colors hover:bg-neonCyan hover:text-black dark:bg-neonCyan/10 dark:text-neonCyan cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neonCyan"
                                aria-label={`${Math.min(FOLDER_ITEMS_PAGE_SIZE, remainingItems)} további cikk betöltése a(z) ${category} mappából`}
                              >
                                <span className="min-w-0">
                                  TOVÁBBI CIKKEK BETÖLTÉSE
                                </span>
                                <span className="shrink-0 text-[9px] opacity-75">
                                  +{" "}
                                  {Math.min(
                                    FOLDER_ITEMS_PAGE_SIZE,
                                    remainingItems,
                                  )}{" "}
                                  · {remainingItems} hátra
                                </span>
                              </button>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                },
              )}

              {remainingFolderCategories > 0 && (
                <motion.button
                  key="folder-category-load-more"
                  type="button"
                  layout
                  onClick={() =>
                    setVisibleFolderCount((count) =>
                      Math.min(
                        categoryEntries.length,
                        count + FOLDERS_PAGE_SIZE,
                      ),
                    )
                  }
                  className="flex w-full items-center justify-between gap-2 border-2 border-dashed border-cyan-700 dark:border-neonCyan/60 bg-cyan-50 px-3 py-2.5 text-left font-mono text-[10px] font-black uppercase text-cyan-900 transition-colors hover:bg-neonCyan hover:text-black dark:bg-neonCyan/10 dark:text-neonCyan cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neonCyan"
                  data-testid="folder-category-load-more"
                  aria-label={`${Math.min(FOLDERS_PAGE_SIZE, remainingFolderCategories)} további mappa megjelenítése`}
                >
                  <span>
                    + {Math.min(FOLDERS_PAGE_SIZE, remainingFolderCategories)}{" "}
                    további mappa
                  </span>
                  <span className="shrink-0 text-[9px] opacity-75">
                    {remainingFolderCategories} hátra
                  </span>
                </motion.button>
              )}
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
            <span>ÖSSZESEN: {docs.length} CIKK</span>
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
        <div
          className={`flex-1 min-w-0 overflow-visible ${
            activeDoc
              ? ""
              : "xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-gutter:stable]"
          }`}
          id="vault-main-content"
        >
          {/* ══════════════════════════════════════════════════════════ */}
          {/* NÉZET A: CIKK OLVASÓ NÉZET (ACTIVE DOC)                     */}
          {/* ══════════════════════════════════════════════════════════ */}
          {activeDoc ? (
            <div className="mx-auto w-full min-w-0 max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
              {/* In-Article Search Console */}
              <InArticleSearchConsole
                postContent={content || activeDoc.content}
                searchQuery={inArticleQuery}
                setSearchQuery={setInArticleQuery}
                onNavigateToMatch={handleNavigateToMatch}
                onCloseDoc={closeDocToHub}
                vaultLabel={isArticleView ? "CIKK HUB" : "TUDÁSTÁR HUB"}
                docSlug={activeDoc.slug}
                onRagDataLoaded={setInArticleRagData}
                onFilterLevelChange={setInArticleFilterLevel}
                viewerFetch={viewerFetch}
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
                    [
                    {activeDoc.category ||
                      presentationProfileLabel(
                        presentationProfileOf(activeDoc),
                      )}
                    ]
                  </span>
                  <span className="px-2 py-0.5 bg-plasmaGreen/15 text-plasmaGreen border border-plasmaGreen/40 font-bold">
                    {activeDoc.scorePercentage || 90}%{" "}
                    {activeDoc.scoreLabel || "MATCH"}
                  </span>
                  {activeDoc.created_at && (
                    <>
                      <span>KÖZZÉTÉVE: {activeDoc.created_at}</span>
                      <span>•</span>
                    </>
                  )}
                  <span className="text-plasmaGreen font-bold">
                    {activeDoc.read_time || "4 PERC"}
                  </span>
                  <AdminPreviewVisibilityBadges document={activeDoc} />
                </div>

                <h1 className="text-3xl md:text-5xl font-headline font-black italic uppercase text-on-surface mb-6 leading-tight tracking-tight">
                  {activeDoc.title}
                </h1>

                {activeDoc.summary && (
                  <div className="text-base md:text-lg dark:text-slate-200 text-slate-800 font-body leading-relaxed border-l-4 border-neonCyan pl-4 bg-slate-900/30 dark:bg-white/[0.02] py-3 mb-4">
                    <HighlightText
                      text={activeDoc.summary.replace(/[*_#`]/g, "")}
                      query={inArticleQuery}
                    />
                  </div>
                )}

                <DocumentTaxonomyBadges
                  document={activeDoc}
                  dimensions={displayDimensions}
                />
                <div className="mt-3">
                  <DocumentAssetBadges assets={activeDoc.assets} />
                </div>

                {/* Canonical DB and index status. This is deliberately not a
                    Drive/Vault claim: article metadata and Markdown are owned
                    by the database. */}
                <div className="mt-4 pt-3 border-t dark:border-white/10 border-slate-200 flex flex-wrap items-center justify-between gap-2 font-mono text-[9px]">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-950/60 border border-plasmaGreen/40 text-plasmaGreen font-bold">
                      <span className="w-1.5 h-1.5 rounded-full bg-plasmaGreen animate-pulse" />
                      <span>VAULT // KANONIKUS</span>
                    </span>
                    <span className="dark:text-slate-400 text-slate-600">
                      ID:{" "}
                      <strong className="text-neonCyan">
                        {activeDoc.id || activeDoc.slug}
                      </strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="dark:text-slate-400 text-slate-600">
                      FORRÁS:{" "}
                      <strong className="text-neonMagenta font-bold">
                        {activeDoc.drive_path || `Content/${activeDoc.slug}/index.md`}
                      </strong>
                    </span>
                    <span className="px-1.5 py-0.5 bg-black/40 border border-white/10 text-slate-300 font-bold">
                      SQLITE/RAG VETÜLET
                    </span>
                    {canPreview && activeDoc.id && (
                      <button
                        type="button"
                        onClick={() => setEditingDocumentSlug(activeDoc.slug)}
                        data-testid="document-contextual-edit"
                        className="border border-neonCyan bg-neonCyan/10 px-2 py-0.5 font-black text-neonCyan transition-colors hover:bg-neonCyan hover:text-black"
                      >
                        SZERKESZTÉS
                      </button>
                    )}
                  </div>
                </div>
              </motion.header>

              {isAdminPreview && (
                <AdminDocumentRelationWorkbench
                  document={activeDoc}
                  documents={docs}
                  onDocumentSelect={(nextDocument) => loadDoc(nextDocument)}
                />
              )}

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

              <DocumentAssetsPanel assets={activeDoc.assets} />

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
                viewerFetch={viewerFetch}
              />

              {/* Bottom Nav */}
              <div className="mt-16 pt-8 border-t dark:border-white/10 border-slate-900 flex justify-between items-center font-mono text-xs">
                <button
                  onClick={closeDocToHub}
                  className="dark:text-slate-400 text-slate-600 hover:text-neonCyan transition-colors uppercase font-bold cursor-pointer"
                >
                  &lt;-- VISSZA A{" "}
                  {isArticleView ? "CIKK HUB-RA" : "TUDÁSTÁR HUB-RA"}
                </button>
                <button
                  onClick={() =>
                    window.scrollTo({
                      top: 0,
                      behavior: preferredScrollBehavior(),
                    })
                  }
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
            <div className="mx-auto w-full min-w-0 max-w-7xl px-4 py-8 sm:px-6">
              {/* Hero Banner */}
              <div className="relative mb-8 w-full min-w-0 max-w-full border-2 border-slate-900 bg-white p-4 font-mono shadow-[4px_4px_0_#0f172a] dark:border-white/10 dark:bg-slate-950/60 dark:shadow-none sm:p-8">
                <div className="relative z-10 min-w-0 max-w-full">
                  <div className="flex max-w-full items-center gap-2 text-[9px] sm:text-[10px] text-neonCyan font-black uppercase tracking-[0.1em] sm:tracking-widest leading-relaxed mb-2">
                    <span className="w-2 h-2 bg-neonCyan inline-block animate-pulse"></span>
                    <span className="min-w-0 max-w-full break-words [overflow-wrap:anywhere]">
                      {headerConfig.badge}
                    </span>
                  </div>
                  <h1 className="min-w-0 max-w-full break-words [overflow-wrap:anywhere] text-3xl font-headline font-black italic uppercase tracking-tight text-slate-900 dark:text-white mb-3 md:text-5xl">
                    {headerConfig.title}
                  </h1>
                  <p className="max-w-3xl min-w-0 break-words [overflow-wrap:anywhere] font-body text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                    {headerConfig.description}
                  </p>
                  {canPreview && (
                    <p data-testid="vault-first-create-hint" className="mt-5 border-l-2 border-neonCyan bg-neonCyan/10 px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-neonCyan">
                      Új {isArticleView ? "cikket" : "dokumentumot"} az Obsidian <code>ObsidianTemplates/</code> sablonjából, a <code>Content/</code> könyvtárban hozz létre, majd futtasd a Vault szinkront.
                    </p>
                  )}
                </div>
              </div>

              {/* Unified Command Hub: Search + 4-Dimensional Filters in One Cohesive Unit */}
              <div className="mb-8 w-full min-w-0 max-w-full border-2 border-slate-900 bg-white p-4 font-mono shadow-[5px_5px_0_#0f172a] dark:border-neonCyan/40 dark:bg-slate-950/60 dark:shadow-[0_0_20px_rgba(0,255,255,0.08)] sm:p-6">
                {/* 1. Primary RAG Search Bar */}
                <div className="mb-5">
                  <div className="flex min-w-0 max-w-full items-center gap-2 border-2 border-slate-800 bg-slate-100 p-3 transition-all focus-within:shadow-[0_0_15px_rgba(0,255,255,0.3)] dark:border-neonCyan dark:bg-slate-900/90 sm:gap-3">
                    {isSearching ? (
                      <div className="w-5 h-5 border-2 border-neonCyan border-t-transparent animate-spin shrink-0" />
                    ) : (
                      <Search
                        size={18}
                        className="text-neonCyan shrink-0 drop-shadow-[0_0_6px_#00FFFF]"
                      />
                    )}
                    <label
                      htmlFor={`vault-search-${vaultType}`}
                      className="sr-only"
                    >
                      Intelligens RAG kereső
                    </label>
                    <input
                      id={`vault-search-${vaultType}`}
                      type="text"
                      placeholder="INTELLIGENS RAG KERESŐ (SZÖVEG, KIFEJEZÉS, KÓD, TÉMAKÖR)..."
                      value={searchQuery}
                      onChange={(e) => {
                        resetArticleLimits();
                        setSearchQuery(e.target.value);
                      }}
                      className="min-w-0 flex-1 bg-transparent font-mono text-sm font-bold uppercase text-slate-900 outline-none placeholder:text-slate-500 dark:text-white"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => {
                          resetArticleLimits();
                          setSearchQuery("");
                        }}
                        className="shrink-0 border border-neonMagenta/50 bg-neonMagenta/20 px-2 py-1 text-xs font-bold text-neonMagenta transition-colors hover:bg-neonMagenta hover:text-white cursor-pointer"
                        title="Keresés törlése"
                      >
                        TÖRLÉS ✕
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. SQL-owned workspace + registry-defined cascading dimensions */}
                <div
                  className={`grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 dark:border-white/10 sm:grid-cols-2 ${supportsProjectWorkspaces ? "xl:grid-cols-5" : "lg:grid-cols-4"}`}
                >
                  {supportsProjectWorkspaces &&
                    (() => {
                      const selectId = `vault-project-workspace-${vaultType}`;
                      const accent = selectedProject?.color || "#00FFFF";
                      const projectDescriptionId = `${selectId}-description`;
                      return (
                        <div data-testid="vault-project-workspace-filter">
                          <div
                            className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold"
                            style={{ color: accent }}
                          >
                            <label
                              htmlFor={selectId}
                              className="flex min-w-0 items-center gap-1 uppercase"
                            >
                              <Target
                                size={12}
                                aria-hidden="true"
                                className="shrink-0"
                              />
                              <span className="truncate">
                                PROJEKT / MUNKATÉR
                              </span>
                            </label>
                            {selectedProject && (
                              <span
                                className="shrink-0 border border-current/40 px-1 py-0.5 text-[8px] font-black"
                                title={`${selectedProject.document_count || 0} publikus dokumentum`}
                              >
                                {selectedProject.document_count || 0}
                              </span>
                            )}
                          </div>
                          <select
                            id={selectId}
                            value={selectedProjectId}
                            onChange={(event) =>
                              handleProjectSelection(event.target.value)
                            }
                            aria-describedby={projectDescriptionId}
                            className={`w-full cursor-pointer border p-2 font-mono text-xs uppercase transition-all ${
                              selectedProjectId !== ALL_PROJECT_FILTER
                                ? "bg-cyan-50 font-black shadow-[0_0_10px_rgba(0,255,255,0.2)] dark:bg-cyan-950/50"
                                : "border-slate-300 bg-slate-50 text-slate-800 focus:border-neonCyan dark:border-white/20 dark:bg-slate-900 dark:text-slate-200"
                            }`}
                            style={
                              selectedProjectId !== ALL_PROJECT_FILTER
                                ? { borderColor: accent, color: accent }
                                : undefined
                            }
                          >
                            <option value={ALL_PROJECT_FILTER}>
                              ÖSSZES MUNKATÉR
                            </option>
                            {selectedProjectId !== ALL_PROJECT_FILTER &&
                              !selectedProject && (
                                <option value={selectedProjectId}>
                                  KIVÁLASZTOTT MUNKATÉR
                                </option>
                              )}
                            {projects.map((project) => (
                              <option key={project.id} value={project.id}>
                                {project.name} ({project.document_count || 0})
                              </option>
                            ))}
                          </select>
                          <p
                            id={projectDescriptionId}
                            className="mt-1 truncate font-mono text-[8px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                            title={selectedProject?.description || undefined}
                          >
                            {projectStatus === "loading"
                              ? "MUNKATÉR-KATALÓGUS BETÖLTÉSE…"
                              : selectedProject
                                ? `${selectedProject.name} · ${selectedProject.document_count || 0} PUBLIKUS CIKK`
                                : "AZ ÖSSZES PUBLIKUS MUNKATÉR TARTALMA"}
                          </p>
                        </div>
                      );
                    })()}
                  {filterDimensions.map((dimension) => {
                    const selectedValue =
                      selectedFacets[dimension.id] || ALL_TAXONOMY_FILTER;
                    const accent = getTaxonomyColor(dimension.color);
                    const selectId = `vault-taxonomy-${dimension.id}-${vaultType}`;
                    return (
                      <div key={dimension.id}>
                        <div
                          className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold"
                          style={{ color: accent }}
                        >
                          <label
                            htmlFor={selectId}
                            className="flex min-w-0 items-center gap-1 uppercase"
                          >
                            <TaxonomyIcon
                              iconKey={dimension.icon_key}
                              size={12}
                              aria-hidden="true"
                              className="shrink-0"
                            />
                            <span className="truncate">{dimension.label}</span>
                          </label>
                          {selectedValue !== ALL_TAXONOMY_FILTER && (
                            <button
                              type="button"
                              onClick={() =>
                                setFacetSelection(
                                  dimension.id,
                                  ALL_TAXONOMY_FILTER,
                                )
                              }
                              className="shrink-0 text-[9px] font-normal hover:underline cursor-pointer"
                            >
                              ÖSSZES ✕
                            </button>
                          )}
                        </div>
                        <select
                          id={selectId}
                          value={selectedValue}
                          onChange={(event) =>
                            setFacetSelection(dimension.id, event.target.value)
                          }
                          className={`w-full cursor-pointer border p-2 font-mono text-xs uppercase transition-all ${
                            selectedValue !== ALL_TAXONOMY_FILTER
                              ? "bg-cyan-50 font-black shadow-[0_0_10px_rgba(0,255,255,0.2)] dark:bg-cyan-950/50"
                              : "border-slate-300 bg-slate-50 text-slate-800 focus:border-neonCyan dark:border-white/20 dark:bg-slate-900 dark:text-slate-200"
                          }`}
                          style={
                            selectedValue !== ALL_TAXONOMY_FILTER
                              ? { borderColor: accent, color: accent }
                              : undefined
                          }
                        >
                          <option value={ALL_TAXONOMY_FILTER}>
                            ÖSSZES {dimension.label}
                          </option>
                          {(dynamicFilterOptions[dimension.id] || []).map(
                            ({ value, label, count }) => (
                              <option key={value} value={value}>
                                {label} ({count})
                              </option>
                            ),
                          )}
                        </select>
                      </div>
                    );
                  })}

                  {/* Sorting Selector */}
                  <div>
                    <label
                      htmlFor={`vault-sort-${vaultType}`}
                      className="text-[10px] text-plasmaGreen font-bold block mb-1"
                    >
                      RENDEZÉS
                    </label>
                    <select
                      id={`vault-sort-${vaultType}`}
                      value={sortBy}
                      onChange={(e) => {
                        resetArticleLimits();
                        setSortBy(e.target.value);
                      }}
                      className="w-full dark:bg-slate-900 bg-slate-50 border-2 dark:border-plasmaGreen/50 border-emerald-600 p-2 text-xs font-mono font-bold uppercase dark:text-plasmaGreen text-emerald-800 cursor-pointer"
                    >
                      <option value="recommended">
                        🎯 AJÁNLÁS SZERINT (RAG)
                      </option>
                      <option value="newest">⏱️ LEGÚJABB ELÖL</option>
                      <option value="read_time">📖 MÉLYELEMZÉSEK</option>
                    </select>
                  </div>
                </div>

                {/* 3. Bottom Status Bar & Legend */}
                <div className="mt-4 pt-3 border-t dark:border-white/10 border-slate-200 flex flex-wrap items-center justify-between gap-3 text-[10px]">
                  {searchQuery.trim() ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-slate-500 font-bold uppercase">
                        XAI SZINTEK:
                      </span>
                      <span className="px-1.5 py-0.2 bg-yellow-300 dark:bg-neonCyan/30 text-slate-950 dark:text-neonCyan border border-yellow-500 dark:border-neonCyan font-bold">
                        1. PONTOS SZÓ
                      </span>
                      <span className="px-1.5 py-0.2 dark:bg-fuchsia-950/60 bg-fuchsia-100 border border-neonMagenta text-fuchsia-800 dark:text-pink-200 font-bold">
                        2. SZEMANTIKAI VEKTOR
                      </span>
                      <span className="px-1.5 py-0.2 dark:bg-emerald-950/50 bg-emerald-100 border border-plasmaGreen text-emerald-800 dark:text-emerald-300 font-bold">
                        3. FTS5 HIBRID
                      </span>
                      <span
                        aria-live="polite"
                        className="text-slate-500 dark:text-slate-400 font-bold"
                      >
                        TALÁLAT:{" "}
                        <strong className="text-neonCyan">
                          {visibleHubDocs.length}
                        </strong>{" "}
                        / {displayDocs.length} CIKK
                      </span>
                    </div>
                  ) : (
                    <div className="text-slate-500 font-bold flex items-center gap-2">
                      <span>
                        MUTATVA:{" "}
                        <strong className="text-neonCyan">
                          {visibleHubDocs.length}
                        </strong>{" "}
                        / {displayDocs.length} CIKK
                      </span>
                    </div>
                  )}

                  <span
                    aria-live="polite"
                    className={`border px-1.5 py-0.5 font-black uppercase tracking-wide ${
                      taxonomyStatus === "ready"
                        ? "border-plasmaGreen/60 bg-plasmaGreen/10 text-plasmaGreen"
                        : "border-neonMagenta/60 bg-neonMagenta/10 text-neonMagenta"
                    }`}
                    title={
                      taxonomyStatus === "ready"
                        ? "A szűrők és smart gyűjtemények a központi taxonómia-registryből töltődtek be."
                        : "A központi taxonómia-registry épp nem elérhető, ezért a kompatibilis helyi háromdimenziós séma aktív."
                    }
                  >
                    TAXONOMY_
                    {taxonomyStatus === "ready"
                      ? "LIVE"
                      : taxonomyStatus === "loading"
                        ? "SYNC"
                        : "FALLBACK"}
                  </span>

                  {activeFilterCount > 0 && (
                    <button
                      onClick={resetFilters}
                      className="px-3 py-1 bg-neonMagenta/10 border border-neonMagenta text-neonMagenta font-bold hover:bg-neonMagenta hover:text-white transition-colors cursor-pointer"
                    >
                      SZŰRŐK ÉS KERESÉS TÖRLÉSE (
                      {activeFilterCount + (searchQuery ? 1 : 0)}) ✕
                    </button>
                  )}
                </div>
              </div>

              {/* Aktív Mappa Szűrő Banner with Classic '..' Back Navigation */}
              {selectedCategory !== "ALL" && (
                <div className="p-3.5 bg-neonCyan/10 border-2 border-neonCyan flex items-center justify-between gap-3 shadow-[0_0_15px_rgba(0,255,255,0.15)] font-mono mb-6">
                  <div className="flex items-center gap-2.5 text-xs">
                    <FolderOpen
                      size={18}
                      className="text-neonCyan animate-pulse"
                    />
                    <span className="text-slate-500 dark:text-slate-400 font-bold">
                      AKTUÁLIS MAPPA:
                    </span>
                    <span className="font-headline font-black text-slate-900 dark:text-white uppercase tracking-wider text-sm">
                      📁 /{selectedCategory}
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-800 dark:text-plasmaGreen border border-emerald-600 font-bold text-[10px]">
                      {displayDocs.length} CIKK
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      resetArticleLimits();
                      setSelectedCategory("ALL");
                    }}
                    className="px-3.5 py-1.5 bg-neonCyan text-black font-headline font-black uppercase text-xs hover:bg-white transition-colors cursor-pointer flex items-center gap-1.5 shadow-[2px_2px_0_#0f172a]"
                    title="Visszalépés a gyökérmappához (Összes mappa)"
                  >
                    <span className="font-mono font-black text-sm">..</span>
                    <span>VISSZALÉPÉS [GYÖKÉR]</span>
                  </button>
                </div>
              )}

              {/* Matrix Cards View with Fluid Animations */}
              <div
                className="grid grid-cols-1 md:grid-cols-2 gap-6"
                data-testid="vault-results"
              >
                <AnimatePresence initial={false}>
                  {visibleHubDocs.map((item) => (
                    <motion.div
                      key={item.id || item.slug}
                      initial={{ opacity: 0, scale: 0.94, y: 15 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.88, y: -10 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      onClick={() => loadDoc(item)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          loadDoc(item);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${item.title} megnyitása`}
                      data-testid="vault-result-card"
                      className="group p-6 bg-[var(--surface-panel)] border-2 dark:border-white/10 border-slate-900 hover:border-neonCyan/80 transition-all duration-200 flex flex-col justify-between shadow-[4px_4px_0_#0f172a] dark:shadow-none hover:shadow-[-5px_0_20px_rgba(0,255,255,0.2)] rounded-none cursor-pointer"
                    >
                      <div>
                        {/* Meta Line */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 font-mono text-[9px] uppercase">
                          <span className="max-w-full break-words px-2 py-0.5 dark:bg-black/60 bg-slate-100 border dark:border-neonCyan/40 border-slate-400 text-neonCyan font-bold">
                            {item.category ||
                              presentationProfileLabel(
                                presentationProfileOf(item),
                              )}
                          </span>
                          {!isArticleView && (
                            <span
                              data-testid="vault-document-source"
                              className={`border px-1.5 py-0.5 font-bold ${
                                presentationProfileOf(item) === "article"
                                  ? "border-neonMagenta/45 bg-neonMagenta/10 text-neonMagenta"
                                  : "border-plasmaGreen/45 bg-plasmaGreen/10 text-plasmaGreen"
                              }`}
                            >
                              {presentationProfileOf(item) === "article"
                                ? "BLOG CIKK"
                                : "TUDÁSTÁR"}
                            </span>
                          )}
                          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                            <span className="text-plasmaGreen font-bold flex items-center gap-1">
                              <Zap size={11} />
                              <span>
                                {item.scorePercentage || 90}%{" "}
                                {item.scoreLabel || "MATCH"}
                              </span>
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
                            <AdminPreviewVisibilityBadges
                              document={item}
                              compact
                            />
                            <DocumentAssetBadges assets={item.assets} compact />
                          </div>
                        </div>

                        {/* Search Match Banner if search is active */}
                        {searchQuery.trim() && (
                          <div className="mb-3 p-2 bg-neonCyan/5 border-l-2 border-neonCyan font-mono text-[9px] flex flex-wrap items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 text-neonCyan font-bold">
                              <Brain
                                size={11}
                                className="shrink-0 text-neonMagenta"
                              />
                              <span>
                                {item.matchLocation ||
                                  "Szemantikai Vektor Találat"}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-400">
                              {item.semanticScore ? (
                                <span className="text-neonMagenta font-bold">
                                  🧠 {item.semanticScore}% Vektor
                                </span>
                              ) : null}
                              {item.keywordScore ? (
                                <span className="text-plasmaGreen font-bold">
                                  ⚡ {item.keywordScore}% FTS5
                                </span>
                              ) : null}
                            </div>
                          </div>
                        )}

                        {/* Title */}
                        <h2 className="text-xl font-headline font-black uppercase italic text-on-surface mb-3 group-hover:text-neonCyan transition-colors leading-tight">
                          <HighlightText
                            text={item.title}
                            query={searchQuery}
                          />
                        </h2>

                        {/* Matched Tokens if search active */}
                        {searchQuery.trim() &&
                          Array.isArray(item.matchedTokens) &&
                          item.matchedTokens.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 mb-2 font-mono text-[8px]">
                              <span className="text-slate-500 font-bold uppercase">
                                EGYEZÉS:
                              </span>
                              {item.matchedTokens.map((tok, ti) => (
                                <span
                                  key={ti}
                                  className="px-1.5 py-0.2 bg-neonCyan/15 text-neonCyan border border-neonCyan/40 font-bold"
                                >
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
                              <HighlightText
                                text={item.matchSnippet}
                                query={searchQuery}
                              />
                            </p>
                          </div>
                        ) : (
                          <p className="font-body dark:text-slate-300 text-slate-700 text-xs leading-relaxed mb-4 line-clamp-3">
                            <HighlightText
                              text={item.summary}
                              query={searchQuery}
                            />
                          </p>
                        )}

                        <DocumentTaxonomyBadges
                          document={item}
                          dimensions={displayDimensions}
                          compact
                          className="mb-4"
                        />
                      </div>

                      {/* Card Footer */}
                      <div className="pt-3 border-t dark:border-white/5 border-slate-200 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px]">
                        <span className="text-slate-500">
                          {item.created_at ? `${item.created_at} • ` : ""}
                          {item.read_time || "4 PERC"}
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

              {remainingHubResults > 0 && (
                <div className="mt-8 flex flex-col items-center gap-3 border-y border-slate-300 py-5 text-center font-mono dark:border-white/10">
                  <p
                    aria-live="polite"
                    className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"
                  >
                    {visibleHubDocs.length} / {displayDocs.length} cikk
                    megjelenítve
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setVisibleHubResultCount((count) =>
                        Math.min(
                          displayDocs.length,
                          count + HUB_RESULTS_PAGE_SIZE,
                        ),
                      )
                    }
                    data-testid="vault-results-load-more"
                    className="flex items-center justify-center gap-2 border-2 border-cyan-800 bg-cyan-100 px-4 py-2.5 font-headline text-xs font-black uppercase tracking-wider text-cyan-950 shadow-[3px_3px_0_#0f172a] transition-colors hover:bg-neonCyan hover:text-black dark:border-neonCyan dark:bg-neonCyan/10 dark:text-neonCyan dark:shadow-none cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neonCyan"
                    aria-label={`${Math.min(HUB_RESULTS_PAGE_SIZE, remainingHubResults)} további cikk betöltése`}
                  >
                    <ChevronDown size={15} aria-hidden="true" />
                    <span>TOVÁBBI CIKKEK BETÖLTÉSE</span>
                    <span>
                      + {Math.min(HUB_RESULTS_PAGE_SIZE, remainingHubResults)}
                    </span>
                    <span className="text-[10px] opacity-75">
                      ({remainingHubResults} hátra)
                    </span>
                  </button>
                </div>
              )}

              {displayDocs.length === 0 && (
                <div className="p-16 text-center border-2 dark:border-white/10 border-slate-900 bg-[var(--surface-panel)] font-mono">
                  <span className="material-symbols-outlined text-4xl text-neonMagenta mb-3 block">
                    search_off
                  </span>
                  <span className="text-neonMagenta text-lg font-bold block mb-2">
                    [!] NINCS TALÁLAT A KERESÉSRE
                  </span>
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
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* 3. JOBB: Tartalomjegyzék (TOC), Backlinks & Knowledge Graph  */}
        {/* ───────────────────────────────────────────────────────────── */}
        {activeDoc && (
          <div className="w-72 shrink-0 hidden xl:flex xl:self-start xl:sticky xl:top-[8.5rem] flex-col gap-6 overflow-visible px-4 py-8 border-l-2 dark:border-white/10 border-slate-900 dark:bg-[#070b19]/80 bg-slate-50 font-mono">
            <TableOfContents headings={headings} />

            {/* Bi-Directional Backlinks & Semantic Mesh */}
            {backlinks.length > 0 && (
              <div className="pt-6 border-t-2 dark:border-white/10 border-slate-300">
                <div className="flex items-center justify-between text-[10px] font-black uppercase text-neonMagenta mb-2.5">
                  <div className="flex items-center gap-1.5">
                    <Link2 size={12} className="text-neonCyan" />
                    <span>BACKLINKS // HIVATKOZÁSOK</span>
                  </div>
                  <span className="text-[9px] text-neonMagenta font-mono">
                    [{backlinks.length}]
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 mb-3 leading-relaxed">
                  Közös aktív taxonómiai besorolás alapján kapcsolódó cikkek:
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
                        {b.sharedTerms.map(({ dimension, value, term }) => {
                          const accent = getTaxonomyColor(
                            term?.color || dimension.color,
                          );
                          return (
                            <span
                              key={`${dimension.id}-${value}`}
                              className="inline-flex items-center gap-1 border px-1 py-0.5 font-mono font-bold"
                              style={{
                                borderColor: `${accent}66`,
                                color: accent,
                              }}
                            >
                              <TaxonomyIcon
                                iconKey={term?.icon_key || dimension.icon_key}
                                size={9}
                                aria-hidden="true"
                              />
                              {term?.label || value}
                            </span>
                          );
                        })}
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
                  {
                    slug: "zart-rag-architektura-specifikacio",
                    title: "Zárt Vállalati RAG Architektúra Specifikáció",
                    sim: "73% Match",
                  },
                  {
                    slug: "zart-vallalati-rag-esettanulmany",
                    title: "Zárt Vállalati RAG: 0% Adatszivárgás",
                    sim: "72% Match",
                  },
                  {
                    slug: "vallalati-ai-adatbiztonsag-rag",
                    title: "Hogyan vezessünk be AI-t biztonságosan?",
                    sim: "72% Match",
                  },
                ].map((kg) => (
                  <button
                    key={kg.slug}
                    onClick={() => {
                      const doc = docs.find((d) => d.slug === kg.slug);
                      if (doc) loadDoc(doc);
                    }}
                    className="w-full text-left p-2.5 dark:bg-slate-900 bg-white border dark:border-white/10 border-slate-300 hover:border-neonCyan transition-all flex flex-col gap-1 cursor-pointer group"
                  >
                    <span className="text-[10px] font-bold dark:text-slate-200 text-slate-800 group-hover:text-neonCyan truncate">
                      {kg.title}
                    </span>
                    <div className="flex justify-between items-center text-[8px]">
                      <span className="text-plasmaGreen font-bold">
                        ⚡ {kg.sim}
                      </span>
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

      {canPreview && editingDocumentSlug && (
        <Suspense fallback={null}>
          <AdminMarkdownEditor
            isOpen
            documentSlug={editingDocumentSlug}
            onClose={closeEditor}
            onSaved={handleEditorSaved}
          />
        </Suspense>
      )}
    </div>
  );
};

export default TacticalVaultExplorer;
