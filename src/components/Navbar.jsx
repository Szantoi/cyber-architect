import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

import ThemeToggle from './ThemeToggle';

const Navbar = () => {
  const location = useLocation();
  const isHome = location.pathname === '/';

  // Handle hash scrolling with fixed navbar offset
  const scrollToSection = (hash) => {
    const element = document.querySelector(hash);
    if (element) {
      const navOffset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - navOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  const handleNavClick = (e, hash) => {
    if (isHome) {
      e.preventDefault();
      scrollToSection(hash);
      window.history.pushState(null, '', hash);
    }
  };

  // Cross-page hash navigation listener
  useEffect(() => {
    if (isHome && location.hash) {
      setTimeout(() => {
        scrollToSection(location.hash);
      }, 100);
    }
  }, [location, isHome]);

  return (
    <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-6 py-4 max-w-full dark:bg-[#090d1d]/90 bg-[#d4dce8]/95 backdrop-blur-xl border-b dark:border-white/10 border-b-2 border-slate-900 transition-colors duration-200 rounded-none shadow-sm dark:shadow-none">
      <Link to="/" className="text-2xl font-black italic tracking-tighter dark:text-neonCyan text-slate-950 font-headline uppercase hover:opacity-80 transition-opacity">
        SZÁNTOI_GÁBOR // AI
      </Link>

      <div className="hidden md:flex gap-8 items-center">
        <a 
          className="font-mono text-[10px] uppercase tracking-[0.2em] font-black dark:text-slate-400 text-slate-800 dark:hover:text-neonCyan hover:text-cyan-800 transition-all duration-300" 
          href="/#diagnostics"
          onClick={(e) => handleNavClick(e, '#diagnostics')}
        >
          MÓDSZERTAN
        </a>
        <a 
          className="font-mono text-[10px] uppercase tracking-[0.2em] font-black dark:text-slate-400 text-slate-800 dark:hover:text-neonCyan hover:text-cyan-800 transition-all duration-300" 
          href="/#arsenal"
          onClick={(e) => handleNavClick(e, '#arsenal')}
        >
          ESZKÖZTÁR
        </a>
        <Link 
          to="/architecture"
          className={`font-mono text-[10px] uppercase tracking-[0.2em] font-black transition-all duration-300 ${
            location.pathname.startsWith('/architecture') || location.pathname.startsWith('/rendszerterv')
              ? 'dark:text-cyan-400 text-cyan-800 underline underline-offset-8 decoration-cyan-800 font-bold' 
              : 'dark:text-slate-400 text-slate-800 dark:hover:text-cyan-400 hover:text-cyan-800'
          }`}
        >
          ARCHITEKTÚRA
        </Link>
        <a 
          className="font-mono text-[10px] uppercase tracking-[0.2em] font-black dark:text-slate-400 text-slate-800 dark:hover:text-neonCyan hover:text-cyan-800 transition-all duration-300" 
          href="/#grid"
          onClick={(e) => handleNavClick(e, '#grid')}
        >
          PROJEKTEK
        </a>
        <Link 
          to="/blog"
          className={`font-mono text-[10px] uppercase tracking-[0.2em] font-black transition-all duration-300 ${
            location.pathname.startsWith('/blog') 
              ? 'dark:text-neonCyan text-cyan-800 underline underline-offset-8 decoration-cyan-800' 
              : 'dark:text-slate-400 text-slate-800 dark:hover:text-neonCyan hover:text-cyan-800'
          }`}
        >
          BLOG
        </Link>
        <Link 
          to="/knowledge"
          className={`font-mono text-[10px] uppercase tracking-[0.2em] font-black transition-all duration-300 ${
            location.pathname.startsWith('/knowledge') || location.pathname.startsWith('/docs')
              ? 'dark:text-plasmaGreen text-emerald-800 underline underline-offset-8 decoration-emerald-800' 
              : 'dark:text-slate-400 text-slate-800 dark:hover:text-plasmaGreen hover:text-emerald-800'
          }`}
        >
          KNOWLEDGE BASE
        </Link>
        <Link 
          to="/mcp"
          className={`font-mono text-[10px] uppercase tracking-[0.2em] font-black transition-all duration-300 flex items-center gap-1 ${
            location.pathname.startsWith('/mcp') || location.pathname.startsWith('/agent')
              ? 'dark:text-neonCyan text-cyan-800 underline underline-offset-8 decoration-cyan-800 font-bold' 
              : 'dark:text-slate-400 text-slate-800 dark:hover:text-neonCyan hover:text-cyan-800'
          }`}
        >
          <span className="w-1.5 h-1.5 bg-neonCyan inline-block animate-pulse" />
          <span>MCP UPLINK</span>
        </Link>

        <a 
          className="font-mono text-[10px] uppercase tracking-[0.2em] font-black dark:text-slate-400 text-slate-800 dark:hover:text-neonCyan hover:text-cyan-800 transition-all duration-300" 
          href="/#uplink"
          onClick={(e) => handleNavClick(e, '#uplink')}
        >
          KAPCSOLAT
        </a>
      </div>

      <div className="flex gap-3 items-center">
        <ThemeToggle />

        <Link 
          to="/admin"
          title="Overseer Admin Console"
          className={`p-2 transition-all rounded-none flex items-center gap-1.5 ${
            location.pathname === '/admin'
              ? 'dark:bg-neonCyan dark:text-black bg-slate-900 text-white border-2 border-slate-900 shadow-[2px_2px_0_#0f172a]'
              : 'dark:border-transparent dark:text-neonCyan text-slate-900 border-2 border-slate-900 bg-white/40 hover:bg-slate-900 hover:text-white shadow-[2px_2px_0_#0f172a]'
          }`}
        >
          <span className="material-symbols-outlined text-xl">terminal</span>
          <span className="font-mono text-[9px] font-black hidden sm:inline uppercase">ADMIN</span>
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;
