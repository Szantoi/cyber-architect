import React from 'react';

const CyberLoadingFallback = () => {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 relative overflow-hidden bg-background text-on-surface">
      <div className="absolute inset-0 wireframe-grid opacity-10 pointer-events-none"></div>

      <div className="p-8 bg-[var(--surface-panel)] border-2 dark:border-neonCyan border-slate-900 relative shadow-[8px_8px_0_#0f172a] dark:shadow-[0_0_40px_rgba(0,251,251,0.2)] max-w-sm w-full text-center font-mono">
        <div className="corner-bracket-tl text-neonCyan"></div>
        <div className="corner-bracket-br text-neonMagenta"></div>

        <div className="inline-flex p-3 bg-neonCyan/10 border-2 border-neonCyan text-neonCyan mb-4 animate-bounce">
          <span className="material-symbols-outlined text-2xl">memory</span>
        </div>

        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="w-2 h-2 bg-plasmaGreen animate-ping"></span>
          <span className="text-xs uppercase tracking-[0.3em] font-black text-neonCyan">
            LOADING_MODULE //
          </span>
        </div>

        <h3 className="text-sm font-headline font-black uppercase text-on-surface tracking-wider mb-4">
          DECRYPTING ARTIFACT DATA...
        </h3>

        <div className="w-full bg-slate-900 dark:bg-black/80 h-2 border border-neonCyan/40 overflow-hidden relative">
          <div className="h-full bg-gradient-to-r from-neonCyan via-neonMagenta to-plasmaGreen animate-pulse w-3/4"></div>
        </div>

        <div className="mt-3 text-[10px] text-slate-500 font-bold uppercase">
          CYBER_ARCHITECT // OS v4.2
        </div>
      </div>
    </div>
  );
};

export default CyberLoadingFallback;
