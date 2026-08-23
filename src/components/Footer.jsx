import React from 'react';

const Footer = () => {
  return (
    <footer className="w-full py-12 pb-28 md:pb-12 px-8 flex flex-col md:flex-row justify-between items-start border-t dark:border-white/10 border-t-2 border-slate-900 dark:bg-[#090d1d] bg-[#cad4e2] transition-colors duration-200 rounded-none">
      <div className="mb-8 md:mb-0">
        <div className="text-sm font-black dark:text-neonCyan text-slate-950 font-headline mb-2 tracking-[0.2em] uppercase italic">SZÁNTOI GÁBOR // AI & FOLYAMATAUTOMATIZÁCIÓ</div>
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] dark:text-slate-500 text-slate-700 font-bold">© 2026 SZÁNTOI GÁBOR // MINDEN JOG FENNTARTVA // BUDAPEST</p>
      </div>
      <div className="flex flex-wrap gap-8">
        <a className="font-mono text-[10px] uppercase tracking-widest dark:text-slate-400 text-slate-800 font-bold dark:hover:text-neonCyan hover:text-cyan-800 hover:tracking-[0.2em] transition-all duration-300" href="/#diagnostics">MÓDSZERTAN</a>
        <a className="font-mono text-[10px] uppercase tracking-widest dark:text-slate-400 text-slate-800 font-bold dark:hover:text-neonCyan hover:text-cyan-800 hover:tracking-[0.2em] transition-all duration-300" href="/#arsenal">ESZKÖZTÁR</a>
        <a className="font-mono text-[10px] uppercase tracking-widest dark:text-slate-400 text-slate-800 font-bold dark:hover:text-cyan-400 hover:text-cyan-800 hover:tracking-[0.2em] transition-all duration-300" href="/architecture">ARCHITEKTÚRA</a>
        <a className="font-mono text-[10px] uppercase tracking-widest dark:text-slate-400 text-slate-800 font-bold dark:hover:text-neonCyan hover:text-cyan-800 hover:tracking-[0.2em] transition-all duration-300" href="/#grid">PROJEKTEK</a>
        <a className="font-mono text-[10px] uppercase tracking-widest dark:text-slate-400 text-slate-800 font-bold dark:hover:text-neonCyan hover:text-cyan-800 hover:tracking-[0.2em] transition-all duration-300" href="/blog">BLOG</a>
        <a className="font-mono text-[10px] uppercase tracking-widest dark:text-slate-400 text-slate-800 font-bold dark:hover:text-plasmaGreen hover:text-emerald-800 hover:tracking-[0.2em] transition-all duration-300" href="/knowledge">TUDÁSTÁR</a>
        <a className="font-mono text-[10px] uppercase tracking-widest dark:text-slate-400 text-slate-800 font-bold dark:hover:text-neonMagenta hover:text-fuchsia-800 hover:tracking-[0.2em] transition-all duration-300" href="/graph">TUDÁSGRÁF</a>
        <a className="font-mono text-[10px] uppercase tracking-widest dark:text-slate-400 text-slate-800 font-bold dark:hover:text-neonCyan hover:text-cyan-800 hover:tracking-[0.2em] transition-all duration-300" href="/mcp">MCP UPLINK</a>
        <a className="font-mono text-[10px] uppercase tracking-[0.3em] dark:text-neonMagenta text-fuchsia-900 font-bold underline underline-offset-8 decoration-current/30 hover:decoration-current hover:tracking-[0.4em] transition-all duration-300" href="/#uplink">KAPCSOLAT</a>
      </div>
    </footer>
  );
};

export default Footer;
