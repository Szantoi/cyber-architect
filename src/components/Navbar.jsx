import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import ThemeToggle from './ThemeToggle';

// 6 Tactical Items for Radial Arc Menu
const FAN_MENU_BASE = [
  {
    id: 'mcp',
    label: 'MCP UPLINK',
    to: '/mcp',
    icon: 'hub',
    textColor: 'dark:text-neonCyan text-cyan-800',
    borderColor: 'dark:border-neonCyan border-slate-900',
    glow: 'dark:shadow-[0_0_12px_rgba(0,255,255,0.5)] shadow-[3px_3px_0_#0f172a]',
    angleDeg: 6 // Degrees from vertical (straight up)
  },
  {
    id: 'method',
    label: 'MÓDSZERTAN',
    hash: '#diagnostics',
    icon: 'insights',
    textColor: 'dark:text-yellow-400 text-amber-700',
    borderColor: 'dark:border-yellow-400/80 border-slate-900',
    glow: 'dark:shadow-[0_0_12px_rgba(250,204,21,0.4)] shadow-[3px_3px_0_#0f172a]',
    angleDeg: 23
  },
  {
    id: 'arsenal',
    label: 'ESZKÖZTÁR',
    hash: '#arsenal',
    icon: 'terminal',
    textColor: 'dark:text-neonMagenta text-fuchsia-800',
    borderColor: 'dark:border-neonMagenta/80 border-slate-900',
    glow: 'dark:shadow-[0_0_12px_rgba(255,0,255,0.4)] shadow-[3px_3px_0_#0f172a]',
    angleDeg: 40
  },
  {
    id: 'arch',
    label: 'ARCHITEKTÚRA',
    to: '/architecture',
    icon: 'account_tree',
    textColor: 'dark:text-cyan-400 text-cyan-800',
    borderColor: 'dark:border-cyan-400/80 border-slate-900',
    glow: 'dark:shadow-[0_0_12px_rgba(34,211,238,0.4)] shadow-[3px_3px_0_#0f172a]',
    angleDeg: 57
  },
  {
    id: 'contact',
    label: 'KAPCSOLAT',
    hash: '#uplink',
    icon: 'send',
    textColor: 'dark:text-plasmaGreen text-emerald-800',
    borderColor: 'dark:border-plasmaGreen/80 border-slate-900',
    glow: 'dark:shadow-[0_0_12px_rgba(128,255,0,0.4)] shadow-[3px_3px_0_#0f172a]',
    angleDeg: 74
  },
  {
    id: 'admin',
    label: 'ADMIN',
    to: '/admin',
    icon: 'lock',
    textColor: 'dark:text-slate-300 text-slate-700',
    borderColor: 'dark:border-slate-400/80 border-slate-900',
    glow: 'dark:shadow-[0_0_10px_rgba(203,213,225,0.3)] shadow-[3px_3px_0_#0f172a]',
    angleDeg: 90
  }
];

const Navbar = () => {
  const location = useLocation();
  const isHome = location.pathname === '/';

  // Handedness: 'right' (default) vs 'left' (balkezes)
  const [handMode, setHandMode] = useState(() => {
    try {
      return localStorage.getItem('cyber_hand_mode') || 'right';
    } catch {
      return 'right';
    }
  });

  const toggleHandMode = () => {
    const next = handMode === 'right' ? 'left' : 'right';
    setHandMode(next);
    try {
      localStorage.setItem('cyber_hand_mode', next);
    } catch {
      // Ignored
    }
  };

  const [dialIndex, setDialIndex] = useState(0);

  const rotatePrev = () => setDialIndex((i) => (i - 1 + FAN_MENU_BASE.length) % FAN_MENU_BASE.length);
  const rotateNext = () => setDialIndex((i) => (i + 1) % FAN_MENU_BASE.length);

  // Compute rotary dial coordinates
  const dialRadius = 215;
  const rotaryItems = FAN_MENU_BASE.map((item, idx) => {
    let offset = idx - dialIndex;
    if (offset > 3) offset -= 6;
    if (offset < -2) offset += 6;

    const angleDeg = 45 + offset * 36; // 45 deg is center target
    const isVisible = angleDeg >= -5 && angleDeg <= 95;
    const isCenter = offset === 0;

    const rad = (angleDeg * Math.PI) / 180;
    const sinVal = Math.sin(rad);
    const cosVal = Math.cos(rad);

    const dy = -Math.round(dialRadius * cosVal);
    const dx = handMode === 'right'
      ? -Math.round(dialRadius * sinVal)
      : Math.round(dialRadius * sinVal);

    return {
      ...item,
      offset,
      angleDeg,
      isVisible,
      isCenter,
      dx,
      dy
    };
  });

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
          
          {/* If Left-handed: Trigger is on Column 1 */}
          {handMode === 'left' && (
            <button
              type="button"
              onClick={() => setMoreMenuOpen((v) => !v)}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative cursor-pointer z-50 ${
                moreMenuOpen
                  ? 'dark:text-neonCyan text-cyan-800 font-bold bg-neonCyan/10 shadow-[0_0_15px_rgba(0,255,255,0.4)]'
                  : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
              }`}
              aria-label={moreMenuOpen ? "Menü bezárása" : "További menüpontok megnyitása"}
            >
              {moreMenuOpen && (
                <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonCyan shadow-[0_0_8px_#00FFFF]" />
              )}
              <div className="flex items-center justify-center my-0.5 pointer-events-none">
                {moreMenuOpen ? (
                  <span className="material-symbols-outlined text-xl text-neonCyan animate-spin-once">close</span>
                ) : (
                  <div className="flex items-center gap-0.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-none bg-current" />
                    <span className="w-1.5 h-1.5 rounded-none bg-current" />
                    <span className="w-1.5 h-1.5 rounded-none bg-current" />
                  </div>
                )}
              </div>
              <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">
                {moreMenuOpen ? 'BEZÁR' : 'TOVÁBB...'}
              </span>
            </button>
          )}

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

          {/* If Right-handed: Trigger is on Column 5 */}
          {handMode === 'right' && (
            <button
              type="button"
              onClick={() => setMoreMenuOpen((v) => !v)}
              className={`flex flex-col items-center justify-center py-1.5 px-0.5 transition-all text-center rounded-none relative cursor-pointer z-50 ${
                moreMenuOpen
                  ? 'dark:text-neonCyan text-cyan-800 font-bold bg-neonCyan/10 shadow-[0_0_15px_rgba(0,255,255,0.4)]'
                  : 'dark:text-slate-400 text-slate-700 hover:dark:text-white'
              }`}
              aria-label={moreMenuOpen ? "Menü bezárása" : "További menüpontok megnyitása"}
            >
              {moreMenuOpen && (
                <span className="absolute top-0 left-2 right-2 h-[2px] bg-neonCyan shadow-[0_0_8px_#00FFFF]" />
              )}
              <div className="flex items-center justify-center my-0.5 pointer-events-none">
                {moreMenuOpen ? (
                  <span className="material-symbols-outlined text-xl text-neonCyan animate-spin-once">close</span>
                ) : (
                  <div className="flex items-center gap-0.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-none bg-current" />
                    <span className="w-1.5 h-1.5 rounded-none bg-current" />
                    <span className="w-1.5 h-1.5 rounded-none bg-current" />
                  </div>
                )}
              </div>
              <span className="font-mono text-[8px] tracking-tight uppercase font-black truncate w-full">
                {moreMenuOpen ? 'BEZÁR' : 'TOVÁBB...'}
              </span>
            </button>
          )}

        </div>
      </div>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 📱 1. MOBIL: EGYKEZES HÜVELYKUJJ FORGÓTÁRCSA (ROTARY DIAL)    */}
      {/* ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {moreMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden pointer-events-auto select-none">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 dark:bg-[#090d1d]/90 bg-slate-950/40 backdrop-blur-md"
              onClick={() => setMoreMenuOpen(false)}
            />

            {/* Handedness Switcher Button at top corner */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className={`fixed top-20 z-50 ${
                handMode === 'right' ? 'left-4' : 'right-4'
              }`}
            >
              <button
                type="button"
                onClick={toggleHandMode}
                className="flex items-center gap-1.5 py-2 px-3 border-2 dark:border-yellow-400/90 border-slate-900 dark:bg-[#070b19]/95 bg-amber-300 dark:text-yellow-400 text-slate-950 rounded-none shadow-[3px_3px_0_#0f172a] text-[10px] font-mono font-black uppercase cursor-pointer hover:dark:bg-yellow-400 hover:dark:text-black hover:bg-slate-900 hover:text-white transition-colors select-none"
                title="Kezesség váltása (Jobb / Balkezes mód)"
              >
                <span className="text-sm">✋</span>
                <span>MÓD: {handMode === 'right' ? 'JOBBKEZES' : 'BALKEZES'}</span>
              </button>
            </motion.div>

            {/* Rotary Dial Chassis & Laser Arc */}
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 0.6 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 26 }}
              className={`fixed bottom-6 w-96 h-96 border-2 border-dashed dark:border-neonCyan border-slate-900 pointer-events-none dark:shadow-[0_0_25px_rgba(0,255,255,0.25)] shadow-[0_0_25px_rgba(15,23,42,0.15)] ${
                handMode === 'right'
                  ? 'right-6 rounded-tl-full origin-bottom-right'
                  : 'left-6 rounded-tr-full origin-bottom-left'
              }`}
            >
              {/* Target Reticle at 45 degree focal point */}
              <div className={`absolute w-12 h-12 border-2 dark:border-neonCyan border-cyan-800 dark:bg-transparent bg-cyan-200/40 animate-pulse flex items-center justify-center ${
                handMode === 'right'
                  ? 'top-20 left-20 -rotate-45'
                  : 'top-20 right-20 rotate-45'
              }`}>
                <span className="w-2 h-2 dark:bg-neonCyan bg-cyan-800" />
              </div>
            </motion.div>

            {/* Stepper Rotation Buttons */}
            <div className={`fixed bottom-20 z-50 flex items-center gap-2 ${
              handMode === 'right' ? 'right-6' : 'left-6'
            }`}>
              <button
                type="button"
                onClick={rotatePrev}
                className="py-1.5 px-3 border-2 dark:border-neonCyan border-slate-900 dark:bg-[#070b19] bg-white dark:text-neonCyan text-slate-950 font-mono font-black text-xs uppercase shadow-[3px_3px_0_#0f172a] hover:dark:bg-neonCyan hover:dark:text-black hover:bg-slate-900 hover:text-white transition-colors active:scale-95 cursor-pointer"
                title="Tárcsa forgatása balra"
              >
                ◀ FORGATÁS
              </button>
              <button
                type="button"
                onClick={rotateNext}
                className="py-1.5 px-3 border-2 dark:border-neonCyan border-slate-900 dark:bg-[#070b19] bg-white dark:text-neonCyan text-slate-950 font-mono font-black text-xs uppercase shadow-[3px_3px_0_#0f172a] hover:dark:bg-neonCyan hover:dark:text-black hover:bg-slate-900 hover:text-white transition-colors active:scale-95 cursor-pointer"
                title="Tárcsa forgatása jobbra"
              >
                FORGATÁS ▶
              </button>
            </div>

            {/* Rotary Dial Items Container anchored at thumb position */}
            <div className={`fixed bottom-16 pointer-events-auto ${
              handMode === 'right' ? 'right-5' : 'left-5'
            }`}>
              {rotaryItems.map((item) => {
                if (!item.isVisible) return null;

                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{
                      scale: item.isCenter ? 1.1 : 0.88,
                      opacity: item.isCenter ? 1 : 0.8,
                      x: item.dx,
                      y: item.dy,
                      zIndex: item.isCenter ? 30 : 10
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{
                      type: 'spring',
                      stiffness: 420,
                      damping: 28
                    }}
                    className={`absolute bottom-0 ${
                      handMode === 'right' 
                        ? 'right-0 origin-bottom-right' 
                        : 'left-0 origin-bottom-left'
                    }`}
                  >
                    {item.to ? (
                      <Link
                        to={item.to}
                        onClick={() => setMoreMenuOpen(false)}
                        className={`flex items-center gap-2.5 py-2 px-3.5 border-2 rounded-none whitespace-nowrap transition-all ${
                          item.isCenter
                            ? 'dark:bg-neonCyan dark:text-black dark:border-neonCyan bg-cyan-400 text-slate-950 border-slate-950 shadow-[4px_4px_0_#0f172a] font-black'
                            : `dark:bg-[#070b19]/95 bg-white dark:text-white text-slate-950 border-slate-900 dark:border-white/20 ${item.glow}`
                        }`}
                      >
                        <span className={`material-symbols-outlined text-lg ${
                          item.isCenter ? 'text-slate-950 dark:text-black' : item.textColor
                        }`}>
                          {item.icon}
                        </span>
                        <span className="font-headline font-black text-xs uppercase tracking-wider">
                          {item.label}
                        </span>
                      </Link>
                    ) : (
                      <a
                        href={`/${item.hash}`}
                        onClick={(e) => {
                          handleNavClick(e, item.hash);
                          setMoreMenuOpen(false);
                        }}
                        className={`flex items-center gap-2.5 py-2 px-3.5 border-2 rounded-none whitespace-nowrap transition-all ${
                          item.isCenter
                            ? 'dark:bg-neonCyan dark:text-black dark:border-neonCyan bg-cyan-400 text-slate-950 border-slate-950 shadow-[4px_4px_0_#0f172a] font-black'
                            : `dark:bg-[#070b19]/95 bg-white dark:text-white text-slate-950 border-slate-900 dark:border-white/20 ${item.glow}`
                        }`}
                      >
                        <span className={`material-symbols-outlined text-lg ${
                          item.isCenter ? 'text-slate-950 dark:text-black' : item.textColor
                        }`}>
                          {item.icon}
                        </span>
                        <span className="font-headline font-black text-xs uppercase tracking-wider">
                          {item.label}
                        </span>
                      </a>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* ───────────────────────────────────────────────────────────── */}
      {/* 💻 2. ASZTALI: TOP-RIGHT DROPDOWN KÁRTYA (DESKTOP POPOVER)      */}
      {/* ───────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {moreMenuOpen && (
          <div className="hidden md:block fixed top-16 right-6 z-50 select-none">
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
                  onClick={() => setMoreMenuOpen(false)}
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
                  <span className="material-symbols-outlined text-neonCyan text-lg">hub</span>
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
                  <span className="material-symbols-outlined text-yellow-400 text-lg">insights</span>
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
                  <span className="material-symbols-outlined text-neonMagenta text-lg">terminal</span>
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
                  <span className="material-symbols-outlined text-cyan-400 text-lg">account_tree</span>
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
                  <span className="material-symbols-outlined text-plasmaGreen text-lg">send</span>
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
