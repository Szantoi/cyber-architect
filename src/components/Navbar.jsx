import React, { useState, useEffect } from 'react';
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

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Close more menu on ESC or route change
  useEffect(() => {
    setMoreMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setMoreMenuOpen(false);
    };
    if (moreMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moreMenuOpen]);

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
            href="/#grid"
            onClick={(e) => handleNavClick(e, '#grid')}
          >
            PROJEKTEK
          </a>
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
            to="/blog"
            className={`font-mono text-[10px] uppercase tracking-[0.2em] font-black transition-all duration-300 ${
              isBlogActive 
                ? 'dark:text-neonMagenta text-fuchsia-800 underline underline-offset-8 decoration-fuchsia-800 font-bold' 
                : 'dark:text-slate-400 text-slate-800 dark:hover:text-neonMagenta hover:text-fuchsia-800'
            }`}
          >
            BLOG
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

          {/* Desktop More Menu Trigger (•••) */}
          <button
            type="button"
            onClick={() => setMoreMenuOpen((v) => !v)}
            className={`font-mono text-[10px] uppercase tracking-[0.2em] font-black flex items-center gap-1 py-1 px-2 border transition-all cursor-pointer ${
              moreMenuOpen
                ? 'border-neonCyan dark:text-neonCyan text-cyan-800 bg-neonCyan/10 shadow-[2px_2px_0_#00FFFF]'
                : 'border-transparent dark:text-slate-400 text-slate-800 hover:border-slate-400 dark:hover:text-white'
            }`}
            title="További menüpontok"
          >
            <span className="tracking-widest font-black">•••</span>
            <span>TOVÁBB</span>
          </button>
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
        <div className="grid grid-cols-5 items-center px-1">
          
          {/* 1. Kezdőlap */}
          <Link
            to="/"
            onClick={handleLogoClick}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isHome && !location.hash && !moreMenuOpen
                ? 'dark:text-neonCyan text-cyan-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isHome && !location.hash && !moreMenuOpen && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonCyan shadow-[0_0_8px_#00FFFF]" />
            )}
            <span className="material-symbols-outlined text-xl mb-0.5">home</span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">FŐOLDAL</span>
          </Link>

          {/* 2. Projektek */}
          <a
            href="/#grid"
            onClick={(e) => { handleNavClick(e, '#grid'); setMoreMenuOpen(false); }}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isHome && location.hash === '#grid' && !moreMenuOpen
                ? 'dark:text-neonCyan text-cyan-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isHome && location.hash === '#grid' && !moreMenuOpen && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonCyan shadow-[0_0_8px_#00FFFF]" />
            )}
            <span className="material-symbols-outlined text-xl mb-0.5">grid_view</span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">PROJEKTEK</span>
          </a>

          {/* 3. Tudástár */}
          <Link
            to="/knowledge"
            onClick={() => setMoreMenuOpen(false)}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isKnowledgeActive && !moreMenuOpen
                ? 'dark:text-plasmaGreen text-emerald-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isKnowledgeActive && !moreMenuOpen && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-plasmaGreen shadow-[0_0_8px_#80FF00]" />
            )}
            <span className="material-symbols-outlined text-xl mb-0.5">psychology</span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">TUDÁSTÁR</span>
          </Link>

          {/* 4. Blog */}
          <Link
            to="/blog"
            onClick={() => setMoreMenuOpen(false)}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isBlogActive && !moreMenuOpen
                ? 'dark:text-neonMagenta text-fuchsia-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isBlogActive && !moreMenuOpen && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonMagenta shadow-[0_0_8px_#FF00FF]" />
            )}
            <span className="material-symbols-outlined text-xl mb-0.5">feed</span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">BLOG</span>
          </Link>

          {/* 5. További Menüpontok (•••) */}
          <button
            type="button"
            onClick={() => setMoreMenuOpen((v) => !v)}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative cursor-pointer ${
              moreMenuOpen
                ? 'dark:text-neonCyan text-cyan-800 font-bold bg-neonCyan/10'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {moreMenuOpen && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonCyan shadow-[0_0_8px_#00FFFF]" />
            )}
            <div className="flex items-center gap-0.5 my-1 pointer-events-none">
              <span className={`w-1.5 h-1.5 rounded-none ${moreMenuOpen ? 'bg-neonCyan animate-ping' : 'bg-current'}`} />
              <span className="w-1.5 h-1.5 rounded-none bg-current" />
              <span className="w-1.5 h-1.5 rounded-none bg-current" />
            </div>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">TOVÁBB...</span>
          </button>

        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 🗂️ TOVÁBBI MENÜPONTOK MODAL / BOTTOM SHEET (••• DRAWER)         */}
      {/* ───────────────────────────────────────────────────────────── */}
      {moreMenuOpen && (
        <div className="fixed inset-0 z-[99999] flex items-end md:items-start md:justify-end md:p-6 md:pt-20 select-none">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-[#090d1d]/80 backdrop-blur-sm transition-opacity"
            onClick={() => setMoreMenuOpen(false)}
          />

          {/* Drawer / Popover Card */}
          <div className="relative w-full md:max-w-md dark:bg-[#070b19] bg-white border-2 dark:border-neonCyan border-slate-900 p-5 shadow-[-8px_0_30px_rgba(0,255,255,0.2),8px_0_30px_rgba(255,0,255,0.2)] rounded-none mb-16 md:mb-0 z-10 animate-in slide-in-from-bottom-6 md:slide-in-from-top-6 duration-200">
            
            {/* Header */}
            <div className="flex items-center justify-between pb-3 mb-4 border-b-2 dark:border-white/10 border-slate-900 font-mono">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 bg-neonCyan animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-neonCyan">
                  // TOVÁBBI MENÜPONTOK & RENDSZEREK
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMoreMenuOpen(false)}
                className="text-xs font-mono font-bold text-slate-400 hover:text-neonMagenta cursor-pointer"
              >
                [ESC ✕]
              </button>
            </div>

            {/* Menu Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono">
              
              {/* MCP Uplink */}
              <Link
                to="/mcp"
                onClick={() => setMoreMenuOpen(false)}
                className="p-3 border dark:border-white/10 border-slate-300 dark:bg-slate-900/60 bg-slate-50 hover:border-neonCyan transition-all group flex items-start gap-2.5"
              >
                <span className="material-symbols-outlined text-neonCyan text-xl group-hover:animate-pulse">hub</span>
                <div>
                  <span className="text-xs font-headline font-black uppercase text-slate-950 dark:text-white block group-hover:text-neonCyan">
                    MCP UPLINK
                  </span>
                  <span className="text-[9px] text-slate-500 block leading-tight">AI Ágens csatlakozási átjáró</span>
                </div>
              </Link>

              {/* Módszertan */}
              <a
                href="/#diagnostics"
                onClick={(e) => { handleNavClick(e, '#diagnostics'); setMoreMenuOpen(false); }}
                className="p-3 border dark:border-white/10 border-slate-300 dark:bg-slate-900/60 bg-slate-50 hover:border-neonCyan transition-all group flex items-start gap-2.5"
              >
                <span className="material-symbols-outlined text-yellow-400 text-xl">insights</span>
                <div>
                  <span className="text-xs font-headline font-black uppercase text-slate-950 dark:text-white block group-hover:text-neonCyan">
                    MÓDSZERTAN
                  </span>
                  <span className="text-[9px] text-slate-500 block leading-tight">Diagnosztika & tervezés</span>
                </div>
              </a>

              {/* Eszköztár */}
              <a
                href="/#arsenal"
                onClick={(e) => { handleNavClick(e, '#arsenal'); setMoreMenuOpen(false); }}
                className="p-3 border dark:border-white/10 border-slate-300 dark:bg-slate-900/60 bg-slate-50 hover:border-neonCyan transition-all group flex items-start gap-2.5"
              >
                <span className="material-symbols-outlined text-neonMagenta text-xl">terminal</span>
                <div>
                  <span className="text-xs font-headline font-black uppercase text-slate-950 dark:text-white block group-hover:text-neonCyan">
                    ESZKÖZTÁR
                  </span>
                  <span className="text-[9px] text-slate-500 block leading-tight">Stack & készségek (Arsenal)</span>
                </div>
              </a>

              {/* Architektúra */}
              <Link
                to="/architecture"
                onClick={() => setMoreMenuOpen(false)}
                className="p-3 border dark:border-white/10 border-slate-300 dark:bg-slate-900/60 bg-slate-50 hover:border-neonCyan transition-all group flex items-start gap-2.5"
              >
                <span className="material-symbols-outlined text-cyan-400 text-xl">account_tree</span>
                <div>
                  <span className="text-xs font-headline font-black uppercase text-slate-950 dark:text-white block group-hover:text-neonCyan">
                    ARCHITEKTÚRA
                  </span>
                  <span className="text-[9px] text-slate-500 block leading-tight">Rendszerterv & RAG spec</span>
                </div>
              </Link>

              {/* Kapcsolat */}
              <a
                href="/#uplink"
                onClick={(e) => { handleNavClick(e, '#uplink'); setMoreMenuOpen(false); }}
                className="p-3 border dark:border-white/10 border-slate-300 dark:bg-slate-900/60 bg-slate-50 hover:border-neonCyan transition-all group flex items-start gap-2.5"
              >
                <span className="material-symbols-outlined text-plasmaGreen text-xl">send</span>
                <div>
                  <span className="text-xs font-headline font-black uppercase text-slate-950 dark:text-white block group-hover:text-neonCyan">
                    KAPCSOLAT
                  </span>
                  <span className="text-[9px] text-slate-500 block leading-tight">Közvetlen üzenetküldés</span>
                </div>
              </a>

              {/* Adminisztráció */}
              <Link
                to="/admin"
                onClick={() => setMoreMenuOpen(false)}
                className="p-3 border dark:border-white/10 border-slate-300 dark:bg-slate-900/60 bg-slate-50 hover:border-neonCyan transition-all group flex items-start gap-2.5"
              >
                <span className="material-symbols-outlined text-slate-400 text-xl">lock</span>
                <div>
                  <span className="text-xs font-headline font-black uppercase text-slate-950 dark:text-white block group-hover:text-neonCyan">
                    ADMIN KONZOL
                  </span>
                  <span className="text-[9px] text-slate-500 block leading-tight">Overseer vezérlőpult</span>
                </div>
              </Link>

            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Navbar;
