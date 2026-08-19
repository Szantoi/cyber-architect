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

  const handleLogoClick = (e) => {
    if (isHome) {
      e.preventDefault();
      if (location.hash) {
        window.history.pushState(null, '', '/');
      }
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    } else {
      window.scrollTo({
        top: 0,
        behavior: 'instant'
      });
    }
  };

  // Cross-page hash navigation & scroll to top listener
  useEffect(() => {
    if (isHome && location.hash) {
      setTimeout(() => {
        scrollToSection(location.hash);
      }, 100);
    } else if (!location.hash) {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [location.pathname, location.hash, isHome]);

  const isKnowledgeActive = location.pathname.startsWith('/knowledge') || location.pathname.startsWith('/docs');
  const isBlogActive = location.pathname.startsWith('/blog');
  const isMcpActive = location.pathname.startsWith('/mcp') || location.pathname.startsWith('/agent');
  const isArchActive = location.pathname.startsWith('/architecture') || location.pathname.startsWith('/rendszerterv');

  return (
    <>
      {/* ── Top Tactical Navigation Bar (Desktop & Mobile Header) ── */}
      <nav className="fixed top-0 w-full z-50 flex justify-between items-center px-4 md:px-6 py-3 md:py-4 max-w-full dark:bg-[#090d1d]/90 bg-[#d4dce8]/95 backdrop-blur-xl border-b dark:border-white/10 border-b-2 border-slate-900 transition-colors duration-200 rounded-none shadow-sm dark:shadow-none select-none">
        <Link 
          to="/" 
          onClick={handleLogoClick}
          className="text-xl sm:text-2xl font-black italic tracking-tighter dark:text-neonCyan text-slate-950 font-headline uppercase hover:opacity-80 transition-opacity"
        >
          SZÁNTOI_GÁBOR <span className="text-[11px] font-mono text-neonMagenta dark:text-neonMagenta">// AI</span>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex gap-6 lg:gap-8 items-center">
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
              isArchActive
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
              isBlogActive 
                ? 'dark:text-neonCyan text-cyan-800 underline underline-offset-8 decoration-cyan-800 font-bold' 
                : 'dark:text-slate-400 text-slate-800 dark:hover:text-neonCyan hover:text-cyan-800'
            }`}
          >
            BLOG
          </Link>
          <Link 
            to="/knowledge"
            className={`font-mono text-[10px] uppercase tracking-[0.2em] font-black transition-all duration-300 ${
              isKnowledgeActive 
                ? 'dark:text-plasmaGreen text-emerald-800 underline underline-offset-8 decoration-emerald-800 font-bold' 
                : 'dark:text-slate-400 text-slate-800 dark:hover:text-plasmaGreen hover:text-emerald-800'
            }`}
          >
            TUDÁSTÁR
          </Link>
          <Link 
            to="/mcp"
            className={`font-mono text-[10px] uppercase tracking-[0.2em] font-black transition-all duration-300 flex items-center gap-1 ${
              isMcpActive 
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

        {/* Right Header Actions */}
        <div className="flex gap-2.5 items-center">
          <ThemeToggle />

          <Link 
            to="/admin"
            title="Overseer Admin Console"
            className={`p-1.5 sm:p-2 transition-all rounded-none flex items-center gap-1.5 ${
              location.pathname === '/admin'
                ? 'dark:bg-neonCyan dark:text-black bg-slate-900 text-white border-2 border-slate-900 shadow-[2px_2px_0_#0f172a]'
                : 'dark:border-transparent dark:text-neonCyan text-slate-900 border-2 border-slate-900 bg-white/40 hover:bg-slate-900 hover:text-white shadow-[2px_2px_0_#0f172a]'
            }`}
          >
            <span className="material-symbols-outlined text-lg sm:text-xl">terminal</span>
            <span className="font-mono text-[9px] font-black hidden sm:inline uppercase">ADMIN</span>
          </Link>
        </div>
      </nav>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 📱 ONE-HANDED MOBILE BOTTOM NAVIGATION BAR (THUMB ZONE)        */}
      {/* ───────────────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden dark:bg-[#090d1d]/95 bg-[#d4dce8]/95 backdrop-blur-xl border-t-2 dark:border-white/15 border-slate-900 shadow-[0_-5px_25px_rgba(0,0,0,0.4)] pb-[max(env(safe-area-inset-bottom),8px)] pt-1 select-none">
        <div className="grid grid-cols-6 items-center px-1">
          
          {/* 1. Kezdőlap */}
          <Link
            to="/"
            onClick={handleLogoClick}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isHome && !location.hash
                ? 'dark:text-neonCyan text-cyan-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isHome && !location.hash && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonCyan shadow-[0_0_8px_#00FFFF]" />
            )}
            <span className="material-symbols-outlined text-xl mb-0.5">home</span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">FŐOLDAL</span>
          </Link>

          {/* 2. Projektek */}
          <a
            href="/#grid"
            onClick={(e) => handleNavClick(e, '#grid')}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isHome && location.hash === '#grid'
                ? 'dark:text-neonCyan text-cyan-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isHome && location.hash === '#grid' && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonCyan shadow-[0_0_8px_#00FFFF]" />
            )}
            <span className="material-symbols-outlined text-xl mb-0.5">grid_view</span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">PROJEKTEK</span>
          </a>

          {/* 3. Tudástár */}
          <Link
            to="/knowledge"
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isKnowledgeActive
                ? 'dark:text-plasmaGreen text-emerald-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isKnowledgeActive && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-plasmaGreen shadow-[0_0_8px_#80FF00]" />
            )}
            <span className="material-symbols-outlined text-xl mb-0.5">psychology</span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">TUDÁSTÁR</span>
          </Link>

          {/* 4. Blog */}
          <Link
            to="/blog"
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isBlogActive
                ? 'dark:text-neonMagenta text-fuchsia-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isBlogActive && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonMagenta shadow-[0_0_8px_#FF00FF]" />
            )}
            <span className="material-symbols-outlined text-xl mb-0.5">feed</span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">BLOG</span>
          </Link>

          {/* 5. MCP Uplink */}
          <Link
            to="/mcp"
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isMcpActive
                ? 'dark:text-neonCyan text-cyan-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isMcpActive && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonCyan shadow-[0_0_8px_#00FFFF]" />
            )}
            <div className="relative">
              <span className="material-symbols-outlined text-xl mb-0.5">hub</span>
              <span className="w-1.5 h-1.5 rounded-none bg-neonCyan absolute -top-0.5 -right-1 animate-ping" />
            </div>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">MCP</span>
          </Link>

          {/* 6. Kapcsolat */}
          <a
            href="/#uplink"
            onClick={(e) => handleNavClick(e, '#uplink')}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isHome && location.hash === '#uplink'
                ? 'dark:text-neonCyan text-cyan-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isHome && location.hash === '#uplink' && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonCyan shadow-[0_0_8px_#00FFFF]" />
            )}
            <span className="material-symbols-outlined text-xl mb-0.5">send</span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">KAPCSOLAT</span>
          </a>

        </div>
      </div>
    </>
  );
};

export default Navbar;
