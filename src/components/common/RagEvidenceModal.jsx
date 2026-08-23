import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap';
import { presentationProfileOf } from '../../utils/presentationProfile.js';
import { useAdminPreview } from '../../context/AdminPreviewContext.jsx';

/**
 * ============================================================================
 * RAG EVIDENCE MODAL // TACTICAL INSIGHTS & PROOF EXPLORER
 * ============================================================================
 * Élő RAG keresési találatok, hibrid relevanciapontszámok és szövegrészletek
 * megjelenítése felugró taktikai ablakban, közvetlen navigációval a két
 * megjelenítési profil kompatibilis nézeteibe.
 */
const RagEvidenceModal = ({ isOpen, onClose, topicTitle, searchQuery, initialBadge = 'RAG_EVIDENCE_GATEWAY' }) => {
  const navigate = useNavigate();
  const { viewerFetch } = useAdminPreview();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'article' | 'knowledge'
  const modalRef = useModalFocusTrap(isOpen, onClose);

  useEffect(() => {
    if (!isOpen || !searchQuery) return;

    const fetchEvidence = async () => {
      setLoading(true);
      try {
        const res = await viewerFetch(`/api/search/unified?q=${encodeURIComponent(searchQuery)}&scope=all&limit=8`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        } else {
          setResults([]);
        }
      } catch (err) {
        console.error('Failed to fetch RAG evidence:', err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEvidence();
  }, [isOpen, searchQuery, viewerFetch]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const articleResults = results.filter(result => presentationProfileOf(result) === 'article');
  const knowledgeResults = results.filter(result => presentationProfileOf(result) === 'knowledge');

  const filteredResults = activeFilter === 'all' 
    ? results 
    : (activeFilter === 'article' ? articleResults : knowledgeResults);

  const handleNavigateFullSearch = (targetType) => {
    onClose();
    const targetRoute = targetType === 'article' ? '/blog' : '/knowledge';
    navigate(`${targetRoute}?q=${encodeURIComponent(searchQuery)}`);
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-start sm:items-center justify-center p-3 sm:p-6 md:p-10 pt-20 sm:pt-28 pb-12 overflow-y-auto">
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-[#090d1d]/85 backdrop-blur-md"
        />

        {/* Modal Window Container */}
        <motion.div 
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rag-evidence-dialog-title"
          initial={{ opacity: 0, scale: 0.96, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-4xl bg-[var(--surface-panel)] border-2 border-neonCyan dark:bg-[#090d1d] bg-slate-900 text-white rounded-none shadow-[-10px_0_30px_rgba(0,255,255,0.2),10px_0_30px_rgba(255,0,255,0.2)] overflow-hidden z-10 my-auto max-h-[calc(100dvh-5rem)] sm:max-h-[82vh] flex flex-col"
        >
          {/* Tactical Terminal Header Bar */}
          <div className="bg-slate-950 px-3 sm:px-5 py-3.5 flex min-w-0 items-center justify-between gap-2 border-b-2 border-neonCyan/40 select-none">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <div className="flex gap-1.5">
                <span className="w-2.5 h-2.5 bg-plasmaGreen inline-block animate-pulse"></span>
                <span className="w-2.5 h-2.5 bg-neonCyan inline-block"></span>
                <span className="w-2.5 h-2.5 bg-neonMagenta inline-block"></span>
              </div>
              <span className="min-w-0 truncate font-mono text-[10px] sm:text-xs text-neonCyan font-bold uppercase tracking-[0.12em] sm:tracking-widest">
                // {initialBadge} // RAG_NEURAL_RECALL
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="RAG találatok bezárása"
              className="shrink-0 font-mono text-[10px] sm:text-xs text-slate-400 hover:text-neonMagenta border border-transparent hover:border-neonMagenta px-2 py-0.5 transition-colors uppercase font-bold cursor-pointer"
              title="Bezárás (ESC)"
            >
              [ESC ✕]
            </button>
          </div>

          {/* Context Header */}
          <div className="p-4 sm:p-6 pb-4 border-b border-white/10 bg-slate-950/60">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="min-w-0">
                <span className="block max-w-full break-words text-[9px] sm:text-[10px] font-mono text-neonMagenta font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] mb-1">
                  KAPCSOLÓDÓ TÉMAKÖR & SZAKMAI ÁLLÍTÁSOK
                </span>
                <h2 id="rag-evidence-dialog-title" className="break-words text-2xl font-headline font-black uppercase text-white tracking-tight">
                  {topicTitle}
                </h2>
              </div>
              <div className="w-full md:w-auto min-w-0 font-mono text-xs bg-black/80 border border-neonCyan/30 px-3 py-1.5 flex flex-wrap items-center gap-2 self-start md:self-auto">
                <span className="text-slate-400 text-[10px]">RAG KULCSSZÓ:</span>
                <span className="text-neonCyan font-bold">"{searchQuery}"</span>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 mt-5 font-mono text-[10px] sm:text-xs">
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                aria-pressed={activeFilter === 'all'}
                className={`px-3 py-1 text-xs font-bold uppercase transition-all rounded-none cursor-pointer ${
                  activeFilter === 'all'
                    ? 'bg-neonCyan text-black border-2 border-neonCyan font-black'
                    : 'bg-black/50 text-slate-400 border border-white/10 hover:text-white'
                }`}
              >
                ÖSSZES TALÁLAT ({results.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('article')}
                aria-pressed={activeFilter === 'article'}
                className={`px-3 py-1 text-xs font-bold uppercase transition-all rounded-none cursor-pointer flex items-center gap-1.5 ${
                  activeFilter === 'article'
                    ? 'bg-neonMagenta text-black border-2 border-neonMagenta font-black'
                    : 'bg-black/50 text-slate-400 border border-white/10 hover:text-white'
                }`}
              >
                <span>📰 CIKKEK / ESETTANULMÁNYOK ({articleResults.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveFilter('knowledge')}
                aria-pressed={activeFilter === 'knowledge'}
                className={`px-3 py-1 text-xs font-bold uppercase transition-all rounded-none cursor-pointer flex items-center gap-1.5 ${
                  activeFilter === 'knowledge'
                    ? 'bg-plasmaGreen text-black border-2 border-plasmaGreen font-black'
                    : 'bg-black/50 text-slate-400 border border-white/10 hover:text-white'
                }`}
              >
                <span>📚 TUDÁSTÁR CIKKEK ({knowledgeResults.length})</span>
              </button>
            </div>
          </div>

          {/* Results Scrollable Body */}
          <div className="p-6 overflow-y-auto flex-1 space-y-4 max-h-[50vh]">
            {loading ? (
              <div role="status" aria-live="polite" className="py-16 text-center font-mono">
                <div className="inline-block w-8 h-8 border-2 border-neonCyan border-t-transparent animate-spin mb-4"></div>
                <p className="text-xs text-neonCyan tracking-widest animate-pulse">
                  RAG VEKTOROS ÉS FULL-TEXT KERESÉS FOLYAMATBAN...
                </p>
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="py-12 text-center font-mono border border-white/5 bg-black/30 p-8">
                <span className="material-symbols-outlined text-4xl text-slate-600 mb-2">manage_search</span>
                <p className="text-sm text-slate-300 font-bold uppercase">Nincs közvetlen találat erre a kifejezésre</p>
                <p className="text-xs text-slate-500 mt-1">Próbáld meg a részletes keresést a tudástári vagy cikk nézetben.</p>
              </div>
            ) : (
              filteredResults.map((item, idx) => {
                const isArticle = presentationProfileOf(item) === 'article';
                const scorePct = item.relevanceScore || Math.min(99, Math.round((item.score || 0.85) * 100));

                return (
                  <Link
                    key={item.id || item.slug || idx}
                    to={(isArticle ? '/blog/' : '/knowledge/') + item.slug}
                    className="block p-4 bg-black/60 border border-white/10 hover:border-neonCyan transition-all group relative cursor-pointer"
                    onClick={onClose}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 ${
                          isArticle
                            ? 'bg-neonMagenta/20 text-neonMagenta border border-neonMagenta/40' 
                            : 'bg-plasmaGreen/20 text-plasmaGreen border border-plasmaGreen/40'
                        }`}>
                          {isArticle ? '📰 CIKK / ESETTANULMÁNY' : '📚 TUDÁSTÁR DOKUMENTUM'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          [{item.category || (isArticle ? 'ESETTANULMÁNY' : 'TUDÁSTÁR')}]
                        </span>
                      </div>

                      <div className="flex items-center gap-2 font-mono text-[11px]">
                        <span className="text-slate-500 text-[10px] uppercase">RAG ILLESZKEDÉS:</span>
                        <span className="text-tertiary font-bold">{scorePct}%</span>
                      </div>
                    </div>

                    <h4 className="text-base font-headline font-black uppercase text-white group-hover:text-neonCyan transition-colors">
                      {item.title}
                    </h4>

                    <p className="text-xs font-body text-slate-300 mt-1.5 line-clamp-2 leading-relaxed">
                      {item.matchSnippet || item.summary || item.content?.slice(0, 180)}
                    </p>

                    <div className="mt-3 pt-2 border-t border-white/5 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
                      <span className="text-slate-500 text-[10px]">
                        OLVASÁSI IDŐ: {item.read_time || '5 PERC'}
                      </span>
                      <span className="text-neonCyan group-hover:translate-x-1 transition-transform flex items-center gap-1 font-bold">
                        DOKUMENTUM MEGNYITÁSA ➔
                      </span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          {/* Modal Footer Bar with Direct Full-Search Navigation */}
          <div className="p-4 bg-slate-950 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 font-mono text-xs">
            <span className="text-slate-400 text-[11px]">
              Több találat böngészése a teljes archívumban:
            </span>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleNavigateFullSearch('article')}
                className="flex-1 sm:flex-initial px-3 py-2 bg-black border border-neonMagenta text-neonMagenta hover:bg-neonMagenta hover:text-black font-bold uppercase transition-all text-center cursor-pointer"
              >
                📰 CIKK KERESŐ MEGNYITÁSA
              </button>
              <button
                type="button"
                onClick={() => handleNavigateFullSearch('knowledge')}
                className="flex-1 sm:flex-initial px-3 py-2 bg-neonCyan text-black font-black uppercase border border-neonCyan hover:bg-black hover:text-neonCyan transition-all text-center cursor-pointer"
              >
                📚 TUDÁSTÁR KERESŐ MEGNYITÁSA
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default RagEvidenceModal;
