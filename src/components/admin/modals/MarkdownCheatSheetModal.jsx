import React from 'react';

const MarkdownCheatSheetModal = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4 lg:p-8 font-mono">
      <div className="w-full max-w-4xl max-h-[90vh] bg-[var(--surface-panel)] border-2 dark:border-plasmaGreen border-slate-900 p-6 relative flex flex-col shadow-[8px_8px_0_#0f172a] dark:shadow-[0_0_40px_rgba(128,255,0,0.25)]">
        <div className="corner-bracket-tl text-plasmaGreen"></div>
        <div className="corner-bracket-br text-neonCyan"></div>

        <div className="flex items-center justify-between pb-4 mb-4 border-b-2 dark:border-white/10 border-slate-900">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-plasmaGreen text-2xl">menu_book</span>
            <h3 className="text-lg font-headline font-black italic uppercase text-on-surface">
              CYBER-ARCHITECT // SZERKESZTŐI SÚGÓ & MD CHEAT SHEET
            </h3>
          </div>
          <button
            onClick={onClose}
            className="dark:text-slate-400 text-slate-800 hover:text-neonMagenta text-lg font-bold"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-6 text-xs text-on-surface">
          {/* Section 1: Callouts */}
          <div className="p-4 dark:bg-slate-900/80 bg-white border-2 dark:border-white/10 border-slate-900 shadow-sm dark:shadow-none">
            <h4 className="text-neonCyan font-bold uppercase mb-2 flex items-center gap-2">
              <span>1. FIGYELMEZTETŐ DOBOZOK (CALLOUTS)</span>
            </h4>
            <p className="text-[11px] dark:text-slate-400 text-slate-700 font-bold mb-2">Másold be közvetlenül a szövegbe a kiemelésekhez:</p>
            <pre className="p-3 dark:bg-black bg-slate-950 text-plasmaGreen border border-white/10 overflow-x-auto text-[11px] leading-relaxed">
{`> [!NOTE]
> Ez egy általános technikai megjegyzés vagy háttérinformáció.

> [!TIP]
> Teljesítmény-optimalizálási javaslat vagy bevált gyakorlat.

> [!IMPORTANT]
> Kritikus követelmény vagy kiemelten fontos biztonsági lépés.

> [!WARNING]
> Figyelmeztetés nem kompatibilis beállításra vagy lehetséges hibára.

> [!CAUTION]
> Magas kockázatú művelet (pl. adatvesztés vagy jogosultsági hiba).`}
            </pre>
          </div>

          {/* Section 2: Audio Player & Media */}
          <div className="p-4 dark:bg-slate-900/80 bg-white border-2 dark:border-white/10 border-slate-900 shadow-sm dark:shadow-none">
            <h4 className="text-neonMagenta font-bold uppercase mb-2 flex items-center gap-2">
              <span>2. MULTIMÉDIA // NOTEBOOKLM HANGANYAG & VIDEÓ BEÁGYAZÁS</span>
            </h4>
            <pre className="p-3 dark:bg-black bg-slate-950 text-neonCyan border border-white/10 overflow-x-auto text-[11px] leading-relaxed">
{`<!-- HANGANYAG BEÁGYAZÁSA A SZÖVEGBE -->
<audio src="https://example.com/deep_dive_podcast.mp3" title="NotebookLM Deep Dive"></audio>

<!-- YOUTUBE VAGY MP4 VIDEÓ -->
https://www.youtube.com/watch?v=dQw4w9WgXcQ`}
            </pre>
          </div>

          {/* Section 3: Tables & Code */}
          <div className="p-4 dark:bg-slate-900/80 bg-white border-2 dark:border-white/10 border-slate-900 shadow-sm dark:shadow-none">
            <h4 className="text-plasmaGreen font-bold uppercase mb-2 flex items-center gap-2">
              <span>3. TÁBLÁZATOK ÉS KÓD RÉSZLETEK (SYNTAX HIGHLIGHTING)</span>
            </h4>
            <pre className="p-3 dark:bg-black bg-slate-950 text-slate-200 border border-white/10 overflow-x-auto text-[11px] leading-relaxed">
{`| Modul | Verzió | Státusz |
| :--- | :---: | ---: |
| SQLite WAL | 3.45 | ÉLES |
| RAG Vectorizer | v2.1 | AKTÍV |

\`\`\`python
def execute_query(sql, params=()):
    return db.execute(sql, params).fetchall()
\`\`\``}
            </pre>
          </div>
        </div>

        <div className="pt-4 mt-4 border-t-2 dark:border-white/10 border-slate-900 flex justify-end">
          <button
            onClick={onClose}
            className="dark:bg-plasmaGreen bg-emerald-700 text-white dark:text-black font-headline font-black italic uppercase px-6 py-2 border-2 border-slate-950 shadow-[3px_3px_0_#0f172a] hover:bg-slate-950 hover:text-white transition-all text-xs"
          >
            BEZÁRÁS
          </button>
        </div>
      </div>
    </div>
  );
};

export default MarkdownCheatSheetModal;
