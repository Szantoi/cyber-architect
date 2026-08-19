import React, { useState, useEffect, useRef } from 'react';
import { ListTree, ChevronUp, Sparkles, Compass, Hash, CornerDownRight } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TableOfContents – Jobb oldali sticky Tactical TOC scrollspy-jal & Navigációval
// Támogatja a Főcímeket (H2), Alcímeket (H3) és Részletezőket (H4)
// ─────────────────────────────────────────────────────────────

/**
 * Prop: headings — tömb { id: string, text: string, level: 2 | 3 | 4 }
 */
const TableOfContents = ({ headings = [] }) => {
  const [activeId, setActiveId] = useState('');
  const observerRef = useRef(null);

  // Intersection Observer: aktív szekció figyelése görgetéskor
  useEffect(() => {
    if (!headings.length) return;

    const mainContainer = document.querySelector('main') || null;

    const handleIntersect = (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length > 0) {
        setActiveId(visible[0].target.id || '');
      }
    };

    observerRef.current = new IntersectionObserver(handleIntersect, {
      root: mainContainer,
      rootMargin: '-5% 0% -60% 0%',
      threshold: 0.1,
    });

    headings.forEach(({ id, text }) => {
      let el = document.getElementById(id);
      if (!el) {
        const allHeadings = document.querySelectorAll('h1, h2, h3, h4');
        for (const h of allHeadings) {
          if (h.textContent && h.textContent.trim().toLowerCase().includes(text.toLowerCase())) {
            el = h;
            if (!el.id) el.id = id;
            break;
          }
        }
      }
      if (el) observerRef.current.observe(el);
    });

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [headings]);

  const scrollToHeading = (id, text) => {
    setActiveId(id);

    const mainContainer = document.querySelector('main');
    const searchRoot = mainContainer || document;
    const allHeadings = Array.from(searchRoot.querySelectorAll('h1, h2, h3, h4, h5'));

    // 1. Keresés közvetlen ID alapján
    let targetEl = document.getElementById(id);

    // 2. Intelligens szövegegyezés (ékezetektől és írásjelektől függetlenül)
    if (!targetEl && allHeadings.length > 0) {
      const normalize = (s) => s ? s.toLowerCase().replace(/[\s\-_.,:#*()/\\\][<>—–?]+/g, '') : '';
      const targetNorm = normalize(text);

      // Pontos egyezés a normalizált szövegben
      targetEl = allHeadings.find(h => normalize(h.textContent) === targetNorm);

      // Részleges egyezés ha nincs pontos
      if (!targetEl) {
        targetEl = allHeadings.find(h => {
          const hNorm = normalize(h.textContent);
          return hNorm.includes(targetNorm) || targetNorm.includes(hNorm);
        });
      }
    }

    if (targetEl) {
      const mainContainer = document.querySelector('main');
      if (mainContainer && mainContainer.scrollHeight > mainContainer.clientHeight) {
        // Belső görgetés esetén: az elem relatív távolsága a tárolóban - 48px felső védőtávolság
        const containerTop = mainContainer.getBoundingClientRect().top;
        const elTop = targetEl.getBoundingClientRect().top;
        const currentScroll = mainContainer.scrollTop;
        const finalScrollTop = elTop - containerTop + currentScroll - 48;

        mainContainer.scrollTo({
          top: Math.max(0, finalScrollTop),
          behavior: 'smooth'
        });
      } else {
        // Teljes ablak görgetés esetén
        const yOffset = -140; // 140px a Navbar + Header Bar számára
        const y = targetEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }

      // Cyber-Flash felvillanás
      targetEl.classList.add('transition-all', 'duration-300', 'bg-neonCyan/20', 'border-l-4', 'border-neonCyan', 'px-3');
      setTimeout(() => {
        targetEl.classList.remove('bg-neonCyan/20', 'border-l-4', 'border-neonCyan', 'px-3');
      }, 1500);
    }
  };

  const scrollToTop = () => {
    const mainContainer = document.querySelector('main');
    if (mainContainer) {
      mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!headings.length) return null;

  return (
    <nav
      aria-label="Tartalomjegyzék"
      className="w-full font-mono select-none"
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4 pb-2.5 border-b-2 dark:border-white/10 border-slate-900">
        <div className="w-1.5 h-5 dark:bg-neonCyan bg-cyan-700 shadow-[0_0_8px_#00FFFF]" />
        <span className="font-headline font-black uppercase text-xs tracking-widest dark:text-neonCyan text-cyan-800 flex items-center gap-1.5">
          <ListTree size={14} className="text-neonCyan drop-shadow-[0_0_5px_#00FFFF]" />
          TARTALOMJEGYZÉK
        </span>
      </div>

      {/* TOC List */}
      <ul className="space-y-1 text-xs">
        {headings.map(({ id, text, level }) => {
          const isActive = activeId === id;
          const isH3 = level === 3;
          const isH4 = level === 4;

          const indentClass = isH4
            ? 'ml-6 text-[10px]'
            : isH3
            ? 'ml-3 text-[11px]'
            : 'font-bold text-xs';

          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => scrollToHeading(id, text)}
                className={`
                  w-full text-left px-2.5 py-1.5 transition-all duration-150 cursor-pointer
                  border-l-3 leading-tight flex items-start gap-1.5 rounded-none group/toc
                  ${indentClass}
                  ${
                    isActive
                      ? 'dark:border-neonCyan border-cyan-700 dark:text-neonCyan text-cyan-900 dark:bg-neonCyan/15 bg-cyan-100 font-black shadow-[inset_4px_0_0_#00FFFF]'
                      : 'dark:border-white/10 border-slate-300 dark:text-slate-300 text-slate-750 dark:hover:text-white hover:text-slate-950 dark:hover:border-neonMagenta hover:border-slate-900 dark:hover:bg-white/[0.04] hover:bg-slate-100 font-medium'
                  }
                `}
              >
                {isActive ? (
                  <span className="w-1.5 h-1.5 bg-neonCyan shadow-[0_0_8px_#00FFFF] mt-1 shrink-0 animate-pulse"></span>
                ) : (isH3 || isH4) ? (
                  <CornerDownRight size={10} className="mt-0.5 text-slate-400 dark:text-slate-500 group-hover/toc:text-neonMagenta shrink-0 transition-colors" />
                ) : (
                  <Hash size={11} className="mt-0.5 text-slate-500 group-hover/toc:text-neonCyan shrink-0 transition-colors" />
                )}

                <span className="line-clamp-2 uppercase tracking-wide">
                  {text}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Back to Top */}
      <button
        type="button"
        onClick={scrollToTop}
        className="mt-4 w-full flex items-center justify-center gap-2 font-mono text-[10px] font-black uppercase dark:text-slate-300 text-slate-800 dark:hover:text-neonCyan hover:text-cyan-800 transition-all border-2 dark:border-white/20 border-slate-900 dark:hover:border-neonCyan hover:border-cyan-700 px-3 py-2 dark:bg-slate-900/60 bg-white shadow-[2px_2px_0_#0f172a] dark:shadow-none hover:shadow-[0_0_10px_rgba(0,255,255,0.3)] cursor-pointer"
      >
        <ChevronUp size={13} className="text-neonCyan drop-shadow-[0_0_5px_#00FFFF]" />
        <span>UGRÁS A TETEJÉRE</span>
      </button>
    </nav>
  );
};

export default TableOfContents;
