import React, { useState, useEffect, useCallback } from 'react';
import { X, HelpCircle, BookOpen, ExternalLink, RefreshCw } from 'lucide-react';
import MarkdownRenderer from '../markdown/MarkdownRenderer.jsx';

// ─────────────────────────────────────────────────────────────
// HelpPanel – Szerkesztési Súgó Oldalsáv
// Markdown alapú tartalom betöltése a /api/docs/admin-help végpontról
// Szerkeszthető: docs/ADMIN_HELP.md
// ─────────────────────────────────────────────────────────────

const HELP_DOC_SLUG = 'admin-help'; // docs/ADMIN_HELP.md → slug: admin-help

const HelpPanel = ({ isOpen, onClose }) => {
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastLoaded, setLastLoaded] = useState(null);

  const loadHelp = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/docs/${HELP_DOC_SLUG}`);
      if (!res.ok) throw new Error('HELP_DOC_NOT_FOUND');
      const data = await res.json();
      setContent(data.content || '');
      setLastLoaded(new Date().toLocaleTimeString('hu-HU'));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Betöltés panel nyitásakor
  useEffect(() => {
    if (isOpen && !content) loadHelp();
  }, [isOpen, content, loadHelp]);

  // ESC billentyű → bezárás
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Slide-in Panel */}
      <aside
        className="fixed right-0 top-0 bottom-0 w-full max-w-2xl z-50 flex flex-col bg-[var(--surface-panel)] border-l-2 dark:border-white/10 border-slate-900 shadow-2xl dark:shadow-[-20px_0_60px_rgba(0,0,0,0.8)]"
        style={{ animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
        role="dialog"
        aria-label="Szerkesztési Súgó"
      >
        <style>{`
          @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b-2 dark:border-white/10 border-slate-900 dark:bg-slate-900/80 bg-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="w-2 h-2 bg-plasmaGreen inline-block" />
              <span className="w-2 h-2 dark:bg-slate-700 bg-slate-400 inline-block" />
              <span className="w-2 h-2 dark:bg-slate-700 bg-slate-400 inline-block" />
            </div>
            <BookOpen size={14} className="text-neonCyan" />
            <div>
              <div className="font-headline font-black uppercase text-xs tracking-widest text-on-surface">
                SZERKESZTÉSI SÚGÓ
              </div>
              <div className="font-mono text-[9px] dark:text-slate-500 text-slate-700 font-bold uppercase tracking-wider">
                {lastLoaded ? `BETÖLTVE: ${lastLoaded}` : 'OVERSEER CONSOLE KNOWLEDGE BASE'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Újratöltés */}
            <button
              onClick={loadHelp}
              disabled={isLoading}
              className="p-2 dark:text-slate-400 text-slate-700 hover:text-neonCyan transition-colors disabled:opacity-40"
              title="Súgó újratöltése (docs/ADMIN_HELP.md)"
            >
              <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
            </button>
            {/* Megnyitás Tudástárban */}
            <a
              href="/knowledge/admin-help"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 dark:text-slate-400 text-slate-700 hover:text-plasmaGreen transition-colors"
              title="Megnyitás a Tudástárban"
            >
              <ExternalLink size={13} />
            </a>
            {/* Bezárás */}
            <button
              onClick={onClose}
              className="p-2 dark:text-slate-400 text-slate-700 hover:text-neonMagenta transition-colors"
              title="Bezárás (ESC)"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── Tartalom ── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 text-on-surface">
          {/* Töltési állapot */}
          {isLoading && (
            <div className="flex items-center justify-center py-20 font-mono">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-neonCyan border-t-transparent animate-spin mx-auto mb-3" />
                <p className="text-neonCyan text-[10px] uppercase tracking-widest animate-pulse font-bold">
                  SÚGÓ BETÖLTÉSE...
                </p>
              </div>
            </div>
          )}

          {/* Hiba állapot */}
          {!isLoading && error && (
            <div className="p-6 border-2 border-neonMagenta/40 font-mono text-center bg-neonMagenta/5">
              <div className="text-neonMagenta text-xs uppercase tracking-widest mb-3 font-bold">
                ⚠ {error}
              </div>
              <p className="dark:text-slate-400 text-slate-700 text-[11px] mb-4">
                Ellenőrizd, hogy a <code className="text-neonCyan font-bold">docs/ADMIN_HELP.md</code> fájl létezik-e és a szerver elérhető.
              </p>
              <button
                onClick={loadHelp}
                className="text-neonCyan border-2 border-neonCyan px-4 py-2 text-[10px] font-mono uppercase hover:bg-neonCyan hover:text-black transition-colors font-bold"
              >
                ÚJRAPRÓBÁLÁS
              </button>
            </div>
          )}

          {/* Tartalom */}
          {!isLoading && !error && content && (
            <MarkdownRenderer content={content} />
          )}
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-3 border-t-2 dark:border-white/10 border-slate-900 dark:bg-slate-900/40 bg-slate-200 flex items-center justify-between font-mono text-[9px] dark:text-slate-500 text-slate-700 font-bold uppercase shrink-0">
          <span>
            FORRÁS: <span className="dark:text-slate-400 text-slate-900 font-black">docs/ADMIN_HELP.md</span>
          </span>
          <span>ESC — BEZÁRÁS</span>
        </div>
      </aside>
    </>
  );
};

// ─────────────────────────────────────────────────────────────
// HelpButton – Lebegő Súgó Gomb (beilleszthető az Admin fejlécébe)
// ─────────────────────────────────────────────────────────────
export const HelpButton = ({ onClick, className = '' }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-3 py-2 border-2 dark:border-white/10 border-slate-900 dark:bg-slate-900/80 bg-[#cad4e2] text-slate-900 dark:text-slate-300 shadow-[2px_2px_0_#0f172a] dark:shadow-none hover:bg-slate-900 hover:text-white dark:hover:border-neonCyan transition-all duration-200 font-bold ${className}`}
    title="Szerkesztési Súgó megnyitása"
  >
    <HelpCircle size={13} />
    <span className="hidden sm:inline">SÚGÓ</span>
  </button>
);

export default HelpPanel;
