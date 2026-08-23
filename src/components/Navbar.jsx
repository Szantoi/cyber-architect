import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import ThemeToggle from './ThemeToggle';
import { useAdminPreview } from '../context/AdminPreviewContext.jsx';

const MORE_MENU_ITEMS = [
  {
    id: 'graph',
    label: 'TUDÁSGRÁF',
    description: 'Blog és tudástár wikilink-hálója',
    to: '/graph',
    icon: 'account_tree',
    accent: 'dark:text-neonMagenta text-fuchsia-800 dark:border-neonMagenta/60 border-fuchsia-800'
  },
  {
    id: 'mcp',
    label: 'MCP UPLINK',
    description: 'AI ágensek csatlakozási átjárója',
    to: '/mcp',
    icon: 'hub',
    accent: 'dark:text-neonCyan text-cyan-800 dark:border-neonCyan/60 border-cyan-800'
  },
  {
    id: 'method',
    label: 'MÓDSZERTAN',
    description: 'Diagnosztika és tervezés',
    hash: '#diagnostics',
    icon: 'insights',
    accent: 'dark:text-yellow-400 text-amber-800 dark:border-yellow-400/60 border-amber-800'
  },
  {
    id: 'arsenal',
    label: 'ESZKÖZTÁR',
    description: 'Stack és szakmai eszközök',
    hash: '#arsenal',
    icon: 'terminal',
    accent: 'dark:text-neonMagenta text-fuchsia-800 dark:border-neonMagenta/60 border-fuchsia-800'
  },
  {
    id: 'arch',
    label: 'ARCHITEKTÚRA',
    description: 'Rendszerterv és RAG specifikáció',
    to: '/architecture',
    icon: 'account_tree',
    accent: 'dark:text-cyan-400 text-cyan-800 dark:border-cyan-400/60 border-cyan-800'
  },
  {
    id: 'contact',
    label: 'KAPCSOLAT',
    description: 'Közvetlen üzenetküldés',
    hash: '#uplink',
    icon: 'send',
    accent: 'dark:text-plasmaGreen text-emerald-800 dark:border-plasmaGreen/60 border-emerald-800'
  },
  {
    id: 'admin',
    label: 'ADMIN',
    description: 'Overseer vezérlőpult',
    to: '/admin',
    icon: 'lock',
    accent: 'dark:text-slate-200 text-slate-700 dark:border-slate-300/60 border-slate-700'
  }
];

const preferredScrollBehavior = () => (
  typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'
);

const Navbar = () => {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const { canPreview, enterAdminPreview, exitAdminPreview, isAdminPreview } = useAdminPreview();

  // Handle hash scrolling with fixed navbar offset
  const scrollToSection = (hash) => {
    const element = document.querySelector(hash);
    if (element) {
      const navOffset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - navOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: preferredScrollBehavior()
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
        behavior: preferredScrollBehavior()
      });
    } else {
      window.scrollTo({
        top: 0,
        behavior: 'auto'
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
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [location.pathname, location.hash, isHome]);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const lastMenuTriggerRef = useRef(null);
  const mobileSheetRef = useRef(null);
  const mobileSheetCloseRef = useRef(null);

  const handleMoreMenuToggle = (event) => {
    if (!moreMenuOpen) {
      lastMenuTriggerRef.current = event.currentTarget;
    }
    setMoreMenuOpen((open) => !open);
  };

  const closeMoreMenuAndRestoreFocus = () => {
    setMoreMenuOpen(false);
    window.requestAnimationFrame(() => lastMenuTriggerRef.current?.focus());
  };

  // Close more menu on ESC or route change
  useEffect(() => {
    setMoreMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMoreMenuOpen(false);
        window.requestAnimationFrame(() => lastMenuTriggerRef.current?.focus());
      }
    };
    if (moreMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moreMenuOpen]);

  useEffect(() => {
    if (!moreMenuOpen || window.matchMedia('(min-width: 768px)').matches) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      mobileSheetCloseRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [moreMenuOpen]);

  useEffect(() => {
    if (!moreMenuOpen || window.matchMedia('(min-width: 768px)').matches) {
      return undefined;
    }

    const sheet = mobileSheetRef.current;
    const trapFocus = (event) => {
      if (event.key !== 'Tab' || !sheet) return;

      const focusable = Array.from(sheet.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !element.disabled && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', trapFocus);
    return () => document.removeEventListener('keydown', trapFocus);
  }, [moreMenuOpen]);

  useEffect(() => {
    if (!moreMenuOpen || window.matchMedia('(min-width: 768px)').matches) {
      return undefined;
    }

    const { style } = document.body;
    const previousOverflow = style.overflow;
    const previousOverscrollBehavior = style.overscrollBehavior;

    style.overflow = 'hidden';
    style.overscrollBehavior = 'none';

    return () => {
      style.overflow = previousOverflow;
      style.overscrollBehavior = previousOverscrollBehavior;
    };
  }, [moreMenuOpen]);

  const isKnowledgeActive = location.pathname.startsWith('/knowledge') || location.pathname.startsWith('/docs');
  const isBlogActive = location.pathname.startsWith('/blog');
  const isGraphActive = location.pathname.startsWith('/graph');
  const isMcpActive = location.pathname.startsWith('/mcp') || location.pathname.startsWith('/agent');

  return (
    <>
      {/* ── Top Tactical Navigation Bar (Desktop & Mobile Header) ── */}
      <nav
        aria-label="Fő navigáció"
        data-admin-active={isAdminPreview ? 'true' : 'false'}
        className={`fixed top-0 z-50 flex w-full max-w-full items-center justify-between border-b px-4 py-3 backdrop-blur-xl transition-all duration-200 md:px-6 md:py-4 select-none ${
          isAdminPreview
            ? 'border-neonMagenta/75 dark:bg-[#160a1d]/94 bg-fuchsia-100/95 shadow-[0_3px_18px_rgba(255,0,255,0.2)]'
            : 'dark:border-white/10 border-b-2 border-slate-900 dark:bg-[#090d1d]/90 bg-[#d4dce8]/95 shadow-sm dark:shadow-none'
        }`}
      >
        <Link 
          to="/" 
          onClick={handleLogoClick}
          aria-current={isHome && !location.hash ? 'page' : undefined}
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
            aria-current={isHome && location.hash === '#grid' ? 'location' : undefined}
          >
            PROJEKTEK
          </a>
          <Link 
            to="/knowledge"
            aria-current={isKnowledgeActive ? 'page' : undefined}
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
            aria-current={isBlogActive ? 'page' : undefined}
            className={`font-mono text-[10px] uppercase tracking-[0.2em] font-black transition-all duration-300 ${
              isBlogActive 
                ? 'dark:text-neonMagenta text-fuchsia-800 underline underline-offset-8 decoration-fuchsia-800 font-bold' 
                : 'dark:text-slate-400 text-slate-800 dark:hover:text-neonMagenta hover:text-fuchsia-800'
            }`}
          >
            BLOG
          </Link>
          <Link to="/graph" aria-current={isGraphActive ? 'page' : undefined} className={`font-mono text-[10px] uppercase tracking-[0.2em] font-black transition-all duration-300 ${isGraphActive ? 'dark:text-neonCyan text-cyan-800 underline underline-offset-8 decoration-cyan-800 font-bold' : 'dark:text-slate-400 text-slate-800 dark:hover:text-neonCyan hover:text-cyan-800'}`}>
            TUDÁSGRÁF
          </Link>
          <Link 
            to="/mcp"
            aria-current={isMcpActive ? 'page' : undefined}
            className={`font-mono text-[10px] uppercase tracking-[0.2em] font-black transition-all duration-300 flex items-center gap-1 ${
              isMcpActive 
                ? 'dark:text-neonCyan text-cyan-800 underline underline-offset-8 decoration-cyan-800 font-bold' 
                : 'dark:text-slate-400 text-slate-800 dark:hover:text-neonCyan hover:text-cyan-800'
            }`}
          >
            <span aria-hidden="true" className="w-1.5 h-1.5 bg-neonCyan inline-block animate-pulse" />
            <span>MCP UPLINK</span>
          </Link>

          {/* Desktop More Menu Trigger (•••) */}
          <button
            type="button"
            onClick={handleMoreMenuToggle}
            aria-expanded={moreMenuOpen}
            aria-controls="desktop-more-menu"
            aria-haspopup="true"
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
          {canPreview && <button
            type="button"
            data-testid="admin-view-toggle"
            aria-pressed={isAdminPreview}
            aria-label={isAdminPreview ? 'Publikus nézetre váltás' : 'Admin nézetre váltás'}
            title={isAdminPreview ? 'Publikus nézetre váltás' : 'Admin nézetre váltás'}
            onClick={isAdminPreview ? exitAdminPreview : enterAdminPreview}
            className={`flex items-center gap-1.5 border px-2 py-1.5 font-mono text-[8px] font-black uppercase tracking-[0.1em] transition-all sm:px-2.5 ${
              isAdminPreview
                ? 'border-neonMagenta bg-neonMagenta/18 text-neonMagenta shadow-[0_0_14px_rgba(255,0,255,0.22)] hover:bg-neonMagenta hover:text-slate-950'
                : 'border-neonCyan/60 bg-neonCyan/8 text-neonCyan hover:bg-neonCyan hover:text-slate-950'
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-base leading-none">{isAdminPreview ? 'shield' : 'visibility'}</span>
            <span className="hidden sm:inline">{isAdminPreview ? 'ADMIN AKTÍV' : 'PUBLIKUS'}</span>
          </button>}
        </div>
      </nav>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 📱 ONE-HANDED MOBILE BOTTOM NAVIGATION BAR (THUMB ZONE)        */}
      {/* ───────────────────────────────────────────────────────────── */}
      <nav aria-label="Mobil navigáció" className="fixed bottom-0 left-0 right-0 z-50 md:hidden dark:bg-[#090d1d]/95 bg-[#d4dce8]/95 backdrop-blur-xl border-t-2 dark:border-white/15 border-slate-900 shadow-[0_-5px_25px_rgba(0,0,0,0.4)] pb-[max(env(safe-area-inset-bottom),8px)] pt-1 select-none">
        <div className="grid grid-cols-5 items-center px-1">
          
          {/* 1. Kezdőlap */}
          <Link
            to="/"
            onClick={handleLogoClick}
            aria-current={isHome && !location.hash && !moreMenuOpen ? 'page' : undefined}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isHome && !location.hash && !moreMenuOpen
                ? 'dark:text-neonCyan text-cyan-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isHome && !location.hash && !moreMenuOpen && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonCyan shadow-[0_0_8px_#00FFFF]" />
            )}
            <span aria-hidden="true" className="material-symbols-outlined text-xl mb-0.5">home</span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">FŐOLDAL</span>
          </Link>

          {/* 2. Projektek */}
          <a
            href="/#grid"
            onClick={(e) => { handleNavClick(e, '#grid'); setMoreMenuOpen(false); }}
            aria-current={isHome && location.hash === '#grid' && !moreMenuOpen ? 'location' : undefined}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isHome && location.hash === '#grid' && !moreMenuOpen
                ? 'dark:text-neonCyan text-cyan-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isHome && location.hash === '#grid' && !moreMenuOpen && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonCyan shadow-[0_0_8px_#00FFFF]" />
            )}
            <span aria-hidden="true" className="material-symbols-outlined text-xl mb-0.5">grid_view</span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">PROJEKTEK</span>
          </a>

          {/* 3. Tudástár */}
          <Link
            to="/knowledge"
            onClick={() => setMoreMenuOpen(false)}
            aria-current={isKnowledgeActive && !moreMenuOpen ? 'page' : undefined}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isKnowledgeActive && !moreMenuOpen
                ? 'dark:text-plasmaGreen text-emerald-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isKnowledgeActive && !moreMenuOpen && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-plasmaGreen shadow-[0_0_8px_#80FF00]" />
            )}
            <span aria-hidden="true" className="material-symbols-outlined text-xl mb-0.5">psychology</span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">TUDÁSTÁR</span>
          </Link>

          {/* 4. Blog */}
          <Link
            to="/blog"
            onClick={() => setMoreMenuOpen(false)}
            aria-current={isBlogActive && !moreMenuOpen ? 'page' : undefined}
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative ${
              isBlogActive && !moreMenuOpen
                ? 'dark:text-neonMagenta text-fuchsia-800 font-bold'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {isBlogActive && !moreMenuOpen && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonMagenta shadow-[0_0_8px_#FF00FF]" />
            )}
            <span aria-hidden="true" className="material-symbols-outlined text-xl mb-0.5">feed</span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">BLOG</span>
          </Link>

          <button
            type="button"
            data-testid="mobile-more-trigger"
            onClick={handleMoreMenuToggle}
            aria-label={moreMenuOpen ? 'További oldalak bezárása' : 'További oldalak megnyitása'}
            aria-expanded={moreMenuOpen}
            aria-controls="mobile-more-sheet"
            aria-haspopup="dialog"
            className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative cursor-pointer ${
              moreMenuOpen
                ? 'dark:text-neonCyan text-cyan-800 font-bold bg-neonCyan/10 shadow-[0_0_15px_rgba(0,255,255,0.4)]'
                : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
            }`}
          >
            {moreMenuOpen && (
              <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonCyan shadow-[0_0_8px_#00FFFF]" />
            )}
            <span aria-hidden="true" className="material-symbols-outlined text-xl mb-0.5">
              {moreMenuOpen ? 'close' : 'more_horiz'}
            </span>
            <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">
              {moreMenuOpen ? 'BEZÁR' : 'TOVÁBB'}
            </span>
          </button>

        </div>
      </nav>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 📱 MOBIL: ÁTTEKINTHETŐ ALSÓ NAVIGÁCIÓS PANEL                  */}
      {/* ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {moreMenuOpen && (
          <div className="fixed inset-0 z-[60] md:hidden select-none">
            <motion.button
              type="button"
              tabIndex={-1}
              data-testid="mobile-more-backdrop"
              aria-label="További oldalak bezárása"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 dark:bg-[#090d1d]/90 bg-slate-950/40 backdrop-blur-md"
              onClick={closeMoreMenuAndRestoreFocus}
            />

            <motion.section
              ref={mobileSheetRef}
              id="mobile-more-sheet"
              data-testid="mobile-more-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="További oldalak"
              aria-labelledby="mobile-more-title"
              initial={{ opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: '100%' }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed inset-x-0 bottom-0 z-10 max-h-[calc(100dvh-0.5rem)] overflow-y-auto dark:bg-[#070b19] bg-[#e2e9f3] border-t-2 dark:border-neonCyan border-slate-900 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-[0_-12px_35px_rgba(0,0,0,0.45)]"
            >
              <div className="mb-2.5 flex items-center justify-between gap-3 border-b-2 dark:border-white/10 border-slate-900 pb-2">
                <div>
                  <span className="block font-mono text-[8px] font-black uppercase tracking-[0.16em] text-neonCyan">// NAVIGÁCIÓS_PANEL</span>
                  <h2 id="mobile-more-title" className="font-headline text-lg font-black uppercase text-slate-950 dark:text-white">További oldalak</h2>
                </div>
                <button
                  ref={mobileSheetCloseRef}
                  type="button"
                  onClick={closeMoreMenuAndRestoreFocus}
                  aria-label="További oldalak bezárása"
                  className="min-h-10 shrink-0 border-2 dark:border-neonCyan border-slate-900 bg-white px-2.5 dark:bg-slate-900 dark:text-neonCyan text-slate-950 font-mono text-[10px] font-black uppercase transition-colors hover:bg-slate-900 hover:text-white dark:hover:bg-neonCyan dark:hover:text-black"
                >
                  <span aria-hidden="true" className="material-symbols-outlined mr-1 align-[-3px] text-base">close</span>
                  Bezár
                </button>
              </div>

              <nav aria-label="További oldalak">
                <div className="grid grid-cols-2 gap-1.5">
                  {MORE_MENU_ITEMS.map((item) => {
                    const itemClassName = `flex min-h-[5.5rem] min-w-0 flex-col justify-between gap-1.5 border-2 p-2.5 dark:bg-slate-900/70 bg-white font-mono transition-colors hover:border-neonCyan focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${item.accent}`;
                    const content = (
                      <>
                        <span aria-hidden="true" className="material-symbols-outlined text-lg">{item.icon}</span>
                        <span className="min-w-0">
                          <span className="block break-words font-headline text-[10px] font-black uppercase leading-tight text-slate-950 dark:text-white">{item.label}</span>
                          <span className="block break-words text-[8px] leading-snug dark:text-slate-400 text-slate-700">{item.description}</span>
                        </span>
                      </>
                    );

                    return item.to ? (
                      <Link key={item.id} to={item.to} onClick={() => setMoreMenuOpen(false)} className={itemClassName}>
                        {content}
                      </Link>
                    ) : (
                      <a
                        key={item.id}
                        href={`/${item.hash}`}
                        onClick={(event) => {
                          handleNavClick(event, item.hash);
                          setMoreMenuOpen(false);
                        }}
                        className={itemClassName}
                      >
                        {content}
                      </a>
                    );
                  })}
                </div>
              </nav>
            </motion.section>
          </div>
        )}
      </AnimatePresence>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 💻 2. ASZTALI: TOP-RIGHT DROPDOWN KÁRTYA (DESKTOP POPOVER)      */}
      {/* ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {moreMenuOpen && (
          <div id="desktop-more-menu" className="hidden md:block fixed top-16 right-6 z-50 select-none">
            {/* Backdrop */}
            <div 
              className="fixed inset-0 bg-transparent"
              onClick={() => setMoreMenuOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="relative w-80 dark:bg-[#070b19] bg-white border-2 dark:border-neonCyan border-slate-900 p-4 shadow-[-8px_0_30px_rgba(0,255,255,0.2),8px_0_30px_rgba(255,0,255,0.2)] rounded-none z-10"
            >
              <div className="flex items-center justify-between pb-2.5 mb-3 border-b-2 dark:border-white/10 border-slate-900 font-mono">
                <span className="text-[10px] font-black uppercase tracking-widest text-neonCyan">
                  // TOVÁBBI MENÜPONTOK
                </span>
                <button
                  type="button"
                  onClick={closeMoreMenuAndRestoreFocus}
                  aria-label="További menüpontok bezárása"
                  className="text-xs font-mono font-bold text-slate-400 hover:text-neonMagenta cursor-pointer"
                >
                  [ESC ✕]
                </button>
              </div>

              <div className="flex flex-col gap-2 font-mono text-xs">
                <Link
                  to="/mcp"
                  onClick={() => setMoreMenuOpen(false)}
                  className="p-2.5 border dark:border-white/10 border-slate-300 dark:bg-slate-900/60 bg-slate-50 hover:border-neonCyan transition-all flex items-center gap-2.5 group"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-neonCyan text-lg">hub</span>
                  <div>
                    <span className="font-headline font-black uppercase text-slate-950 dark:text-white block group-hover:text-neonCyan">
                      MCP UPLINK
                    </span>
                    <span className="text-[9px] text-slate-500 block leading-tight">AI Ágens csatlakozási átjáró</span>
                  </div>
                </Link>

                <a
                  href="/#diagnostics"
                  onClick={(e) => { handleNavClick(e, '#diagnostics'); setMoreMenuOpen(false); }}
                  className="p-2.5 border dark:border-white/10 border-slate-300 dark:bg-slate-900/60 bg-slate-50 hover:border-neonCyan transition-all flex items-center gap-2.5 group"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-yellow-400 text-lg">insights</span>
                  <div>
                    <span className="font-headline font-black uppercase text-slate-950 dark:text-white block group-hover:text-neonCyan">
                      MÓDSZERTAN
                    </span>
                    <span className="text-[9px] text-slate-500 block leading-tight">Diagnosztika & tervezés</span>
                  </div>
                </a>

                <a
                  href="/#arsenal"
                  onClick={(e) => { handleNavClick(e, '#arsenal'); setMoreMenuOpen(false); }}
                  className="p-2.5 border dark:border-white/10 border-slate-300 dark:bg-slate-900/60 bg-slate-50 hover:border-neonCyan transition-all flex items-center gap-2.5 group"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-neonMagenta text-lg">terminal</span>
                  <div>
                    <span className="font-headline font-black uppercase text-slate-950 dark:text-white block group-hover:text-neonCyan">
                      ESZKÖZTÁR
                    </span>
                    <span className="text-[9px] text-slate-500 block leading-tight">Stack & készségek (Arsenal)</span>
                  </div>
                </a>

                <Link
                  to="/architecture"
                  onClick={() => setMoreMenuOpen(false)}
                  className="p-2.5 border dark:border-white/10 border-slate-300 dark:bg-slate-900/60 bg-slate-50 hover:border-neonCyan transition-all flex items-center gap-2.5 group"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-cyan-400 text-lg">account_tree</span>
                  <div>
                    <span className="font-headline font-black uppercase text-slate-950 dark:text-white block group-hover:text-neonCyan">
                      ARCHITEKTÚRA
                    </span>
                    <span className="text-[9px] text-slate-500 block leading-tight">Rendszerterv & RAG spec</span>
                  </div>
                </Link>

                <a
                  href="/#uplink"
                  onClick={(e) => { handleNavClick(e, '#uplink'); setMoreMenuOpen(false); }}
                  className="p-2.5 border dark:border-white/10 border-slate-300 dark:bg-slate-900/60 bg-slate-50 hover:border-neonCyan transition-all flex items-center gap-2.5 group"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-plasmaGreen text-lg">send</span>
                  <div>
                    <span className="font-headline font-black uppercase text-slate-950 dark:text-white block group-hover:text-neonCyan">
                      KAPCSOLAT
                    </span>
                    <span className="text-[9px] text-slate-500 block leading-tight">Közvetlen üzenetküldés</span>
                  </div>
                </a>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Navbar;
