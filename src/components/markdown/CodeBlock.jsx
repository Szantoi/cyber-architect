import React, { useState, useEffect, useRef, useId } from 'react';
import { Copy, Check, Terminal, Eye, Code, AlertCircle } from 'lucide-react';

let mermaidPromise;

const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid')
      .then(({ default: mermaid }) => {
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          themeVariables: {
            darkMode: true,
            background: '#090d1d',
            primaryColor: '#00fbfb',
            primaryTextColor: '#ffffff',
            primaryBorderColor: '#00fbfb',
            lineColor: '#00fbfb',
            secondaryColor: '#ff00ff',
            tertiaryColor: '#1e293b'
          },
          fontFamily: 'JetBrains Mono, monospace',
          securityLevel: 'strict',
        });

        return mermaid;
      })
      .catch((error) => {
        mermaidPromise = undefined;
        throw error;
      });
  }

  return mermaidPromise;
};

// ─────────────────────────────────────────────────────────────
// Mermaid Diagram Renderer (Biztonságos kliensoldali SVG renderelés)
// ─────────────────────────────────────────────────────────────
const MermaidDiagram = ({ code }) => {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('diagram'); // 'diagram' | 'code'
  const generatedId = useId().replace(/[^a-zA-Z0-9]/g, '_');
  const idRef = useRef(`mermaid_${generatedId}`);

  useEffect(() => {
    let isMounted = true;
    loadMermaid()
      .then((mermaid) => mermaid.render(idRef.current, code.trim()))
      .then(({ svg: renderedSvg }) => {
        if (isMounted) {
          setSvg(renderedSvg);
          setError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.warn('Mermaid render warning:', err);
          setError(err?.message || 'Diagram szintaxis hiba');
        }
      });

    return () => { isMounted = false; };
  }, [code]);

  if (error || viewMode === 'code') {
    return (
      <div className="my-6 border-2 dark:border-white/15 border-slate-900 bg-surface-panel shadow-[4px_4px_0_#0f172a] dark:shadow-none font-mono">
        <div className="flex items-center justify-between px-4 py-2 dark:bg-slate-900 bg-slate-100 border-b-2 dark:border-white/10 border-slate-900">
          <div className="flex items-center gap-2 text-xs font-bold text-neonCyan">
            <Terminal size={14} />
            <span>MERMAID_DIAGRAM_SOURCE</span>
          </div>
          {svg && (
            <button
              onClick={() => setViewMode(viewMode === 'code' ? 'diagram' : 'code')}
              className="flex items-center gap-1 text-[10px] font-bold uppercase text-neonCyan hover:underline"
            >
              <Eye size={12} />
              <span>{viewMode === 'code' ? 'DIAGRAM MEGJELENÍTÉSE' : 'FORRÁSKÓD'}</span>
            </button>
          )}
        </div>
        {error && (
          <div className="p-3 bg-neonMagenta/10 border-b border-neonMagenta/30 text-neonMagenta text-xs flex items-center gap-2">
            <AlertCircle size={14} />
            <span>Diagram renderelési figyelmeztetés. Forráskód megtekintése aktív.</span>
          </div>
        )}
        <pre className="p-4 text-xs dark:text-slate-300 text-slate-900 overflow-x-auto">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className="my-6 border-2 dark:border-neonCyan/40 border-slate-900 dark:bg-slate-950/80 bg-white p-4 relative shadow-[4px_4px_0_#0f172a] dark:shadow-[0_0_20px_rgba(0,251,251,0.1)]">
      <div className="flex items-center justify-between pb-3 mb-3 border-b-2 dark:border-white/10 border-slate-900">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-neonCyan animate-pulse"></span>
          <span className="font-headline font-black italic text-xs uppercase text-on-surface tracking-wider">
            ARCHITEKTÚRA_DIAGRAM // MERMAID
          </span>
        </div>
        <button
          onClick={() => setViewMode('code')}
          className="flex items-center gap-1 font-mono text-[10px] uppercase font-bold text-slate-500 hover:text-neonCyan transition-colors"
        >
          <Code size={12} />
          <span>KÓD</span>
        </button>
      </div>
      <div
        className="mermaid-wrapper flex justify-center overflow-x-auto py-2 [&_svg]:max-w-full [&_svg]:h-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Diff Sorok Renderer
// ─────────────────────────────────────────────────────────────
const DiffCodeBody = ({ lines }) => {
  return (
    <div className="p-3 font-mono text-xs leading-relaxed overflow-x-auto">
      {lines.map((line, idx) => {
        const isAdded = line.startsWith('+');
        const isRemoved = line.startsWith('-');
        const isHeader = line.startsWith('@');

        let bgClass = 'hover:bg-white/5';
        let textClass = 'text-slate-300';
        let linePrefix = ' ';

        if (isAdded) {
          bgClass = 'bg-emerald-950/40 text-emerald-300 border-l-2 border-emerald-400';
          textClass = 'text-emerald-300 font-bold';
          linePrefix = '+';
        } else if (isRemoved) {
          bgClass = 'bg-rose-950/40 text-rose-300 border-l-2 border-rose-500';
          textClass = 'text-rose-300 font-bold';
          linePrefix = '-';
        } else if (isHeader) {
          bgClass = 'bg-cyan-950/30 text-neonCyan font-bold';
          textClass = 'text-neonCyan';
        }

        return (
          <div key={idx} className={`px-2 py-0.5 flex gap-3 ${bgClass} transition-colors`}>
            <span className="select-none text-slate-600 w-6 shrink-0 text-right text-[10px]">
              {idx + 1}
            </span>
            <span className={`select-none font-bold w-3 shrink-0 ${textClass}`}>
              {linePrefix}
            </span>
            <span className={`whitespace-pre-wrap break-all ${textClass}`}>
              {isAdded || isRemoved ? line.substring(1) : line}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// CodeBlock – CommonMark & GFM Fenced Code / Inline Code Parser
// ─────────────────────────────────────────────────────────────
const CodeBlock = ({ inline, className, children, ...props }) => {
  const [copied, setCopied] = useState(false);
  const codeContent = String(children || '').replace(/\n$/, '');

  // Nyelv kinyerése a className-ből (pl. "language-javascript" → "JAVASCRIPT")
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1].toLowerCase() : '';

  // 1. INLINE KÓD (CommonMark backtick a szöveg közepén, nem blokk)
  // Ha inline flag aktív, vagy nincs explicit language megadva ÉS nincs benne sortörés
  const isInlineCode = inline || (!match && !codeContent.includes('\n') && codeContent.length < 120);

  if (isInlineCode) {
    return (
      <code
        className="font-mono text-[0.88em] font-bold px-1.5 py-0.5 dark:bg-slate-900 bg-slate-100 dark:text-neonCyan text-cyan-800 border-2 dark:border-white/10 border-slate-900 shadow-[1px_1px_0_#0f172a] dark:shadow-none align-baseline break-all"
        {...props}
      >
        {children}
      </code>
    );
  }

  // 2. MERMAID DIAGRAM BLOKK (```mermaid)
  if (language === 'mermaid') {
    return <MermaidDiagram code={codeContent} />;
  }

  // 3. FENCED KÓDBLOKK (CommonMark Fenced Code Block)
  const lines = codeContent.split('\n');
  const showLineNumbers = lines.length > 2 && language !== 'diff';

  const handleCopy = () => {
    navigator.clipboard.writeText(codeContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="my-6 border-2 dark:border-white/15 border-slate-900 dark:bg-slate-950 bg-[#090e1c] overflow-hidden group/codeblock shadow-[4px_4px_0_#0f172a] dark:shadow-none">
      {/* ── Tactical Header Bar ── */}
      <div className="flex items-center justify-between px-4 py-2.5 dark:bg-slate-900 bg-[#12192e] border-b-2 dark:border-white/10 border-slate-900">
        <div className="flex items-center gap-3">
          {/* Három taktikai státuszpont */}
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-plasmaGreen inline-block shadow-[0_0_6px_#80FF00]" />
            <span className="w-2.5 h-2.5 dark:bg-slate-700 bg-slate-600 inline-block" />
            <span className="w-2.5 h-2.5 dark:bg-slate-700 bg-slate-600 inline-block" />
          </div>
          {/* Nyelv badge */}
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-300 uppercase tracking-widest font-black">
            <Terminal size={12} className="text-neonCyan" />
            <span className="text-neonCyan font-black">{language.toUpperCase() || 'CODE'}</span>
          </div>
        </div>

        {/* Másolás gomb */}
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400 hover:text-white transition-colors cursor-pointer px-2 py-1 bg-white/5 border border-white/10 hover:border-neonCyan"
          title="Kód másolása vágólapra"
        >
          {copied ? (
            <>
              <Check size={12} className="text-plasmaGreen" />
              <span className="text-plasmaGreen font-black">MÁSOLVA!</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span className="font-bold">MÁSOLÁS</span>
            </>
          )}
        </button>
      </div>

      {/* ── Code Body ── */}
      <div className="overflow-x-auto">
        {language === 'diff' ? (
          <DiffCodeBody lines={lines} />
        ) : (
          <pre className="p-4 text-xs font-mono leading-relaxed m-0" style={{ background: 'transparent' }}>
            {showLineNumbers ? (
              <code className={`${className || ''} block`} {...props}>
                {lines.map((line, i) => (
                  <div key={i} className="flex group/line py-0.5">
                    <span
                      className="select-none text-slate-600 w-8 shrink-0 text-right mr-4 text-[11px] leading-relaxed group-hover/line:text-slate-400 transition-colors"
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <span className="text-slate-100 font-medium whitespace-pre-wrap break-all">{line || ' '}</span>
                  </div>
                ))}
              </code>
            ) : (
              <code className={`${className || ''} block text-slate-100 font-medium whitespace-pre-wrap break-all`} {...props}>
                {codeContent}
              </code>
            )}
          </pre>
        )}
      </div>
    </div>
  );
};

export default CodeBlock;
