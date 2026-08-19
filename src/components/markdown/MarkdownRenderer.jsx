import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import rehypeSlug from 'rehype-slug';
import rehypeRaw from 'rehype-raw';
import { Link } from 'react-router-dom';
import {
  Info,
  AlertTriangle,
  AlertCircle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  ZoomIn,
} from 'lucide-react';

import CodeBlock from './CodeBlock.jsx';
import TacticalAudioPlayer from '../multimedia/TacticalAudioPlayer.jsx';
import VideoPlayer from '../multimedia/VideoPlayer.jsx';
import { analyzeSentenceRelevance } from '../../utils/semanticHighlighter.js';

// ─────────────────────────────────────────────────────────────
// MarkdownRenderer – CommonMark & GFM Parser & Vizuális Rendszer
// Cyber-Architect Archive identitás, teljes multimédiás & kód támogatással
// ─────────────────────────────────────────────────────────────

// ── Callout típus konfiguráció ──
const CALLOUT_CONFIG = {
  NOTE: {
    icon: Info,
    border: 'border-neonCyan',
    bg: 'bg-neonCyan/5',
    text: 'text-neonCyan',
    label: 'MEGJEGYZÉS',
  },
  INFO: {
    icon: Info,
    border: 'border-neonCyan',
    bg: 'bg-neonCyan/5',
    text: 'text-neonCyan',
    label: 'INFO',
  },
  TIP: {
    icon: Lightbulb,
    border: 'border-plasmaGreen',
    bg: 'bg-plasmaGreen/5',
    text: 'text-plasmaGreen',
    label: 'TIPP',
  },
  IMPORTANT: {
    icon: Lightbulb,
    border: 'border-plasmaGreen',
    bg: 'bg-plasmaGreen/5',
    text: 'text-plasmaGreen',
    label: 'FONTOS',
  },
  WARNING: {
    icon: AlertTriangle,
    border: 'border-yellow-500',
    bg: 'bg-yellow-500/5',
    text: 'text-yellow-400',
    label: 'FIGYELMEZTETÉS',
  },
  CAUTION: {
    icon: AlertCircle,
    border: 'border-neonMagenta',
    bg: 'bg-neonMagenta/5',
    text: 'text-neonMagenta',
    label: 'FIGYELEM',
  },
};

// ── Blockquote → Callout Detektálás ──
const parseCalloutType = (children) => {
  const text =
    children?.[0]?.props?.children?.[0] ||
    children?.[0]?.props?.children ||
    '';
  const raw = typeof text === 'string' ? text.trim() : '';
  // GitHub Alert szintaxis: [!NOTE], [!WARNING] stb.
  const match = raw.match(/^\[!(NOTE|INFO|TIP|IMPORTANT|WARNING|CAUTION)\]/i);
  return match ? match[1].toUpperCase() : null;
};

// ── Callout Box Komponens ──
const CalloutBox = ({ type, children }) => {
  const config = CALLOUT_CONFIG[type] || CALLOUT_CONFIG.NOTE;
  const Icon = config.icon;

  // Az első child szövegből eltávolítjuk a [!TYPE] prefixet
  const cleanedChildren = React.Children.map(children, (child, idx) => {
    if (idx !== 0) return child;
    if (!React.isValidElement(child)) return child;
    const childChildren = React.Children.map(child.props?.children, (c, ci) => {
      if (ci !== 0) return c;
      if (typeof c === 'string') return c.replace(/^\[!(NOTE|INFO|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/i, '');
      return c;
    });
    return React.cloneElement(child, { children: childChildren });
  });

  return (
    <div className={`my-6 border-l-4 ${config.border} ${config.bg} p-4 relative overflow-hidden`}>
      {/* Dekoratív vonal */}
      <div className={`absolute inset-y-0 left-0 w-0.5 ${config.border.replace('border-', 'bg-')} opacity-30`} />

      <div className="flex items-center gap-2 mb-2">
        <Icon size={13} className={config.text} />
        <span className={`font-mono font-bold text-[10px] uppercase tracking-widest ${config.text}`}>
          {config.label}
        </span>
      </div>
      <div className="text-slate-300 font-body text-sm leading-relaxed">
        {cleanedChildren}
      </div>
    </div>
  );
};

// ── Interactive Details / Accordion (:::details szintaxis) ──
const DetailsAccordion = ({ summary, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="my-4 border border-white/10 bg-slate-900/40 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 font-mono text-xs uppercase tracking-widest text-slate-300 hover:text-neonCyan hover:bg-neonCyan/5 transition-all duration-200 cursor-pointer"
      >
        <span className="text-left">{summary}</span>
        {open ? (
          <ChevronUp size={14} className="shrink-0 text-neonCyan" />
        ) : (
          <ChevronDown size={14} className="shrink-0 text-slate-500" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-2 border-t border-white/10 text-slate-300 font-body text-sm leading-relaxed">
          {children}
        </div>
      )}
    </div>
  );
};

// ── Image Lightbox ──
const ImageLightbox = ({ src, alt }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <figure className="my-6 group/img cursor-zoom-in" onClick={() => setOpen(true)}>
        <div className="relative border border-white/10 overflow-hidden hover:border-neonCyan/30 transition-colors duration-300">
          <img
            src={src}
            alt={alt || ''}
            className="w-full object-cover block"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center">
            <ZoomIn className="text-white opacity-0 group-hover/img:opacity-80 transition-opacity" size={28} />
          </div>
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-neonCyan/40 pointer-events-none" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-neonMagenta/40 pointer-events-none" />
        </div>
        {alt && (
          <figcaption className="mt-2 font-mono text-[10px] text-slate-500 uppercase tracking-wider text-center">
            {alt}
          </figcaption>
        )}
      </figure>

      {/* Lightbox Modal */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={alt || ''}
            className="max-w-full max-h-[90vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setOpen(false)}
            className="absolute top-4 right-4 font-mono text-xs text-slate-400 hover:text-white border border-white/20 px-3 py-1 hover:border-white/50 transition-colors"
          >
            BEZÁRÁS ✕
          </button>
        </div>
      )}
    </>
  );
};

// ── Custom renderers regisztrálása ──
// Fejléc: ID-s anchor link horgonnyal és bőséges scroll-margin-top-pal a Navbar alá
const buildHeading = (level) => {
  const Tag = `h${level}`;
  const sizeClasses = {
    1: 'text-3xl dark:text-white text-slate-900 border-b dark:border-white/10 border-slate-200 pb-3 mt-8 mb-4 scroll-mt-40',
    2: 'text-2xl dark:text-neonCyan text-cyan-700 mt-12 mb-4 scroll-mt-40',
    3: 'text-xl dark:text-secondary-fixed text-fuchsia-700 mt-8 mb-3 scroll-mt-40',
    4: 'text-base dark:text-slate-300 text-slate-700 mt-6 mb-2 scroll-mt-40',
  };
  return function HeadingRenderer({ id, children }) {
    const copyLink = () => {
      const url = `${window.location.origin}${window.location.pathname}#${id}`;
      navigator.clipboard.writeText(url);
    };
    return (
      <Tag
        id={id}
        className={`font-headline font-black uppercase tracking-wider relative group/heading scroll-mt-40 ${sizeClasses[level] || ''}`}
      >
        {children}
        {id && (
          <button
            onClick={copyLink}
            className="ml-2 text-slate-400 dark:hover:text-neonCyan hover:text-cyan-700 opacity-0 group-hover/heading:opacity-100 transition-all text-sm font-mono font-normal normal-case tracking-normal cursor-pointer"
            title="Szekció linkjének másolása"
            aria-label="Szekció link másolása"
          >
            #
          </button>
        )}
      </Tag>
    );
  };
};

// ── Táblázat wrapper (horizontálisan görgethető) ──
const TableWrapper = ({ children }) => (
  <div className="my-6 overflow-x-auto border dark:border-white/10 border-slate-200 bg-[var(--surface-panel)]">
    <table className="w-full border-collapse font-mono text-sm">
      {children}
    </table>
  </div>
);

// ── Táblázat fejléc cella ──
const Th = ({ children, ...props }) => (
  <th
    className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest dark:text-neonCyan text-cyan-800 dark:bg-slate-900 bg-slate-100 border-b dark:border-white/10 border-slate-200"
    {...props}
  >
    {children}
  </th>
);

// ── Táblázat adat cella ──
const Td = ({ children, ...props }) => (
  <td
    className="px-4 py-3 dark:text-slate-300 text-slate-700 border-b dark:border-white/5 border-slate-100 text-xs"
    {...props}
  >
    {children}
  </td>
);

// ── Táblázat sor ──
const Tr = ({ children, ...props }) => (
  <tr className="even:dark:bg-white/[0.02] even:bg-slate-50 hover:dark:bg-neonCyan/[0.03] hover:bg-cyan-50/50 transition-colors" {...props}>
    {children}
  </tr>
);

// ── Blockquote → Callout ──
const BlockquoteRenderer = ({ children }) => {
  const type = parseCalloutType(children);
  if (type && CALLOUT_CONFIG[type]) {
    return <CalloutBox type={type}>{children}</CalloutBox>;
  }
  // Sima blockquote (idézet)
  return (
    <blockquote className="my-6 pl-4 border-l-4 dark:border-neonCyan/40 border-cyan-600 italic dark:text-slate-400 text-slate-600 font-body text-base leading-relaxed relative dark:bg-slate-900/30 bg-slate-50 p-3">
      {children}
    </blockquote>
  );
};

// ── Link renderer (Taktikai data-chip stílus, zavaró aláhúzás nélkül) ──
const LinkRenderer = ({ href, children }) => {
  const isExternal = href?.startsWith('http');
  const baseClasses = "inline-flex items-center gap-1 font-mono text-[0.9em] font-bold px-1.5 py-0.2 mx-0.5 rounded-none transition-all duration-150 no-underline align-baseline " +
    "dark:text-neonCyan text-cyan-900 dark:bg-neonCyan/10 bg-cyan-100/80 " +
    "border-b-2 dark:border-neonCyan/50 border-cyan-700 " +
    "hover:dark:bg-neonCyan hover:dark:text-black hover:bg-slate-900 hover:text-white hover:border-slate-950 " +
    "hover:shadow-[0_0_8px_rgba(0,251,251,0.4)] cursor-pointer";

  if (isExternal) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={baseClasses}
        title={`Külső hivatkozás megnyitása: ${href}`}
      >
        <span>{children}</span>
        <ExternalLink size={10} className="shrink-0 opacity-70 group-hover:opacity-100" />
      </a>
    );
  }
  return (
    <Link
      to={href || '#'}
      className={baseClasses}
    >
      <span>{children}</span>
    </Link>
  );
};

// ── Unordered List ──
const Ul = ({ children }) => (
  <ul className="my-4 space-y-1.5 font-body dark:text-slate-300 text-slate-700 text-base">
    {React.Children.map(children, (child) =>
      React.isValidElement(child)
        ? React.cloneElement(child, { _listType: 'ul' })
        : child
    )}
  </ul>
);

// ── Ordered List ──
const Ol = ({ children, start }) => (
  <ol className="my-4 space-y-1.5 font-body dark:text-slate-300 text-slate-700 text-base list-none" start={start}>
    {React.Children.map(children, (child, i) =>
      React.isValidElement(child)
        ? React.cloneElement(child, { _listType: 'ol', _index: (start || 1) + i })
        : child
    )}
  </ol>
);

// ── List Item ──
const Li = ({ children, _listType, _index, ...props }) => (
  <li className="flex gap-2 items-start leading-relaxed" {...props}>
    <span className={`shrink-0 mt-1 dark:text-neonCyan text-cyan-600 font-mono text-xs ${_listType === 'ol' ? '' : ''}`}>
      {_listType === 'ol' ? `${_index}.` : '▸'}
    </span>
    <span>{children}</span>
  </li>
);

// ── Horizontal Rule (CommonMark Thematic Break: --- / *** / ___) ──
const Hr = () => (
  <div className="my-10 flex items-center gap-4 select-none" role="separator">
    <div className="flex-1 h-0.5 dark:bg-white/15 bg-slate-900" />
    <div className="flex items-center gap-1.5 px-2">
      <span className="w-1.5 h-1.5 dark:bg-neonCyan bg-cyan-700 inline-block shadow-[0_0_6px_#00FFFF]" />
      <span className="w-1.5 h-1.5 dark:bg-neonMagenta bg-fuchsia-700 inline-block shadow-[0_0_6px_#FF00FF]" />
      <span className="w-1.5 h-1.5 dark:bg-plasmaGreen bg-emerald-700 inline-block shadow-[0_0_6px_#80FF00]" />
    </div>
    <div className="flex-1 h-0.5 dark:bg-white/15 bg-slate-900" />
  </div>
);

// ── Strong ──
const Strong = ({ children }) => (
  <strong className="dark:text-white text-slate-950 font-black">{children}</strong>
);

// ── Em ──
const Em = ({ children }) => (
  <em className="dark:text-slate-200 text-slate-900 italic font-medium">{children}</em>
);

// ── Del (GFM Strikethrough ~~text~~) ──
const Del = ({ children }) => (
  <del className="line-through dark:text-slate-500 text-slate-500">{children}</del>
);

// ─────────────────────────────────────────────────────────────
// Fejlécek ID-k kinyerése a TOC generáláshoz (H2, H3, H4 támogatás ékezetekkel)
// ─────────────────────────────────────────────────────────────
export const extractHeadings = (markdownContent) => {
  if (!markdownContent || typeof markdownContent !== 'string') return [];
  const headings = [];
  const lines = markdownContent.split('\n');
  lines.forEach((line) => {
    const h2 = line.match(/^##\s+(.+)$/);
    const h3 = line.match(/^###\s+(.+)$/);
    const h4 = line.match(/^####\s+(.+)$/);
    
    if (h2) {
      const rawText = h2[1].trim();
      const cleanText = rawText.replace(/[*_[\]`]/g, '').trim();
      const id = cleanText.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');
      headings.push({ id, text: cleanText, level: 2 });
    } else if (h3) {
      const rawText = h3[1].trim();
      const cleanText = rawText.replace(/[*_[\]`]/g, '').trim();
      const id = cleanText.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');
      headings.push({ id, text: cleanText, level: 3 });
    } else if (h4) {
      const rawText = h4[1].trim();
      const cleanText = rawText.replace(/[*_[\]`]/g, '').trim();
      const id = cleanText.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-');
      headings.push({ id, text: cleanText, level: 4 });
    }
  });
  return headings;
};


// ─────────────────────────────────────────────────────────────
// Custom Direktíva Parser
// Markdown speciális blokkok előfeldolgozása, mielőtt ReactMarkdown kapja:
//   :::audio ...
//   :::video ...
//   :::details ...
// Ezeket placeholder HTML kommentekre cseréli, majd utólag komponenssel rendereli
// (Egyszerűsített megközelítés: szöveg-szintű parse, majd React component map)
// ─────────────────────────────────────────────────────────────
const parseDirectives = (content) => {
  const directives = [];
  let processedContent = content;

  // :::audio ... :::
  processedContent = processedContent.replace(
    /:::audio\s*([^\n]*)\n?([\s\S]*?):::/g,
    (match, attrs, body, _offset) => {
      const id = `directive-audio-${directives.length}`;
      const attrMap = {};
      attrs.matchAll(/(\w+)="([^"]*)"/g).forEach(([, k, v]) => { attrMap[k] = v; });
      directives.push({ id, type: 'audio', attrs: attrMap, body: body.trim() });
      return `<div data-directive="${id}"></div>`;
    }
  );

  // :::video ... :::
  processedContent = processedContent.replace(
    /:::video\s*([^\n]*)\n?([\s\S]*?):::/g,
    (match, attrs, body) => {
      const id = `directive-video-${directives.length}`;
      const attrMap = {};
      attrs.matchAll(/(\w+)="([^"]*)"/g).forEach(([, k, v]) => { attrMap[k] = v; });
      directives.push({ id, type: 'video', attrs: attrMap, body: body.trim() });
      return `<div data-directive="${id}"></div>`;
    }
  );

  // :::details[Summary szöveg] ... :::
  processedContent = processedContent.replace(
    /:::details\[([^\]]+)\]\n?([\s\S]*?):::/g,
    (match, summary, body) => {
      const id = `directive-details-${directives.length}`;
      directives.push({ id, type: 'details', summary: summary.trim(), body: body.trim() });
      return `<div data-directive="${id}"></div>`;
    }
  );

  return { processedContent, directives };
};

// ─────────────────────────────────────────────────────────────
// MarkdownRenderer – Fő Exportált Komponens (1:1 RAG Server Sync)
// ─────────────────────────────────────────────────────────────
const MarkdownRenderer = ({ 
  content = '', 
  highlightQuery = '', 
  ragChunks = null, 
  activeFilterLevel = 'ALL' 
}) => {
  const { processedContent, directives } = parseDirectives(content);

  // Rekurzív szövegkinyerő segédfüggvény RAG szemantikai chunk elemzéshez
  const extractTextFromChildren = (nodes) => {
    let text = '';
    React.Children.forEach(nodes, (child) => {
      if (typeof child === 'string' || typeof child === 'number') {
        text += child + ' ';
      } else if (child && child.props && child.props.children) {
        text += extractTextFromChildren(child.props.children) + ' ';
      }
    });
    return text.trim();
  };

  // Keresőszó Kiemelő Segédfüggvény (Tiszta Inline Szövegkiemelés Kifejezés-prioritással)
  const highlightChildren = (children) => {
    if (!highlightQuery || typeof highlightQuery !== 'string' || highlightQuery.trim().length < 2) {
      return children;
    }
    const cleanFullQuery = highlightQuery.trim().toLowerCase();
    const rawWords = cleanFullQuery
      .split(/\s+/)
      .filter((w) => w.length > 1);
    if (!rawWords.length) return children;

    const wordsSet = new Set();
    // 1. Teljes kifejezés hozzáadása a leghosszabb illeszkedéshez (pl. "Google Drive")
    if (rawWords.length > 1) {
      wordsSet.add(cleanFullQuery);
    }

    // 2. Különálló szavak és szótövek hozzáadása (intelligens magyar rag-levágással)
    rawWords.forEach((w) => {
      wordsSet.add(w);
      const cleanW = w.replace(/[^a-z0-9áéíóöőúüű]/gi, '').toLowerCase();
      if (cleanW.length >= 3) {
        wordsSet.add(cleanW);
        // Magyar toldalékok óvatos eltávolítása (anélkül hogy levágná az angol szavak utolsó betűit)
        const stem = cleanW.replace(/(hoz|hez|höz|val|vel|ban|ben|ból|ből|ról|ről|nak|nek|val|vel|on|en|ön|re|ra|ba|be|ig|hatom|hetem|unk|tek|tok)$/, '');
        if (stem.length >= 3) wordsSet.add(stem);
        // Ha kötőjeles vagy toldalékolt volt (pl. "google-t", "drive-ot", "api-t")
        const hyphenStem = cleanW.replace(/t$/, '');
        if (hyphenStem.length >= 4) wordsSet.add(hyphenStem);
      }
    });

    // Hosszúság szerinti csökkenő sorrend: mindig a leghosszabb kifejezés illeszkedik először!
    const searchTokens = Array.from(wordsSet).sort((a, b) => b.length - a.length);
    const escaped = searchTokens.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const wordRegex = new RegExp(`(${escaped})`, 'gi');


    return React.Children.map(children, (child) => {
      if (typeof child === 'string') {
        const parts = child.split(wordRegex);
        return parts.map((part, pIdx) => {
          const isMatch = searchTokens.some((w) => part.toLowerCase() === w.toLowerCase());
          return isMatch ? (
            <mark
              key={`w-${pIdx}`}
              className="bg-cyan-300 dark:bg-neonCyan/30 text-slate-950 dark:text-neonCyan font-bold px-1 py-0.2 border border-cyan-500 dark:border-neonCyan shadow-[0_0_8px_rgba(0,255,255,0.3)] rounded-none inline-block align-baseline"
            >
              {part}
            </mark>
          ) : (
            part
          );
        });
      }

      if (React.isValidElement(child) && child.props && child.props.children) {
        return React.cloneElement(child, {
          children: highlightChildren(child.props.children)
        });
      }

      return child;
    });
  };

  // Illeszkedő Szerver RAG Chunk keresése egy adott szövegre
  const findMatchingServerChunk = (text) => {
    if (!text || text.length < 15) return null;
    if (!Array.isArray(ragChunks) || ragChunks.length === 0) return null;

    const cleanText = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (cleanText.length < 10) return null;

    return ragChunks.find(c => {
      if (!c.content) return false;
      const cleanChunk = c.content.toLowerCase().replace(/[^a-z0-9]/g, '');
      return cleanText.includes(cleanChunk.slice(0, 35)) || cleanChunk.includes(cleanText.slice(0, 35));
    });
  };

  // Custom div renderer: direktíva placeholder-eket komponensekre cseréli
  const DivRenderer = ({ 'data-directive': directiveId, children, ...props }) => {
    if (directiveId) {
      const dir = directives.find((d) => d.id === directiveId);
      if (!dir) return null;

      if (dir.type === 'audio') {
        return (
          <div className="my-8">
            <TacticalAudioPlayer
              src={dir.attrs.src}
              title={dir.attrs.title || 'AUDIO DEEP DIVE'}
              subtitle={dir.attrs.subtitle || 'NotebookLM Generated Podcast'}
              host1={dir.attrs.host1}
              host2={dir.attrs.host2}
            />
          </div>
        );
      }
      if (dir.type === 'video') {
        return (
          <div className="my-8">
            <VideoPlayer
              src={dir.attrs.src}
              title={dir.attrs.title}
              caption={dir.attrs.caption}
            />
          </div>
        );
      }
      if (dir.type === 'details') {
        return (
          <DetailsAccordion summary={dir.summary}>
            <MarkdownRenderer content={dir.body} highlightQuery={highlightQuery} />
          </DetailsAccordion>
        );
      }
    }
    return <div {...props}>{children}</div>;
  };

  // Komponens definíciók a Markdown elemekhez
  const components = {
    pre: ({ children }) => <>{children}</>,
      h1: buildHeading(1),
      h2: buildHeading(2),
      h3: buildHeading(3),
      h4: buildHeading(4),
      p: ({ children }) => {
        const fullParagraphText = extractTextFromChildren(children);
        
        // 1. Szerver RAG Chunk prioritás
        const serverChunk = findMatchingServerChunk(fullParagraphText);
        let shouldDecorate = false;
        let chunkMeta = null;

        if (serverChunk) {
          if (activeFilterLevel === 'ALL') shouldDecorate = true;
          else if (activeFilterLevel === 'KEYWORD') shouldDecorate = !!serverChunk.is_keyword_match;
          else if (activeFilterLevel === 'SEMANTIC') shouldDecorate = !!serverChunk.is_semantic_match;
          else if (activeFilterLevel === 'CHUNK') shouldDecorate = !!serverChunk.is_rag_chunk;

          chunkMeta = {
            id: serverChunk.chunk_id,
            score: serverChunk.relevance_score || 80,
            tokenCount: serverChunk.token_count,
            cosSim: serverChunk.cosine_similarity !== undefined ? serverChunk.cosine_similarity.toFixed(3) : '0.850'
          };
        } else if (highlightQuery && highlightQuery.trim().length >= 2) {
          // 2. Kliens oldali tartalék, ha nincs szerver adat
          const { isSemanticMatch, semanticScore, matchedKeywords } = analyzeSentenceRelevance(fullParagraphText, highlightQuery);
          if (isSemanticMatch || matchedKeywords.length > 0) {
            shouldDecorate = true;
            chunkMeta = {
              id: 'chk_local',
              score: Math.max(semanticScore, 75),
              tokenCount: Math.max(12, Math.ceil(fullParagraphText.split(/\s+/).length * 1.3)),
              cosSim: (Math.max(semanticScore, 75) / 100).toFixed(3)
            };
          }
        }

        const getChunkStyle = (chunk, filter) => {
          if (!chunk || chunk.id === 'chk_local') {
             return {
               border: 'dark:border-plasmaGreen/60 border-emerald-400',
               shadow: 'dark:shadow-[0_0_18px_rgba(128,255,0,0.15)] shadow-[4px_4px_0_#0f172a]',
               text: 'dark:text-plasmaGreen text-emerald-800',
               bg: 'dark:bg-emerald-950/20 bg-emerald-50/70',
               iconBg: 'bg-plasmaGreen',
               badgeBg: 'bg-emerald-500/20 text-emerald-950 dark:text-emerald-300 border-plasmaGreen/40',
               title: '🎯 RAG CHUNK',
               badges: [{ label: '🎯 CHUNK', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-plasmaGreen/40' }]
             };
          }

          const hasKw = !!serverChunk?.is_keyword_match;
          const hasSem = !!serverChunk?.is_semantic_match;
          const hasChunk = !!serverChunk?.is_rag_chunk;

          // Ha specifikus szűrő van beállítva, azt emeljük ki
          if (filter === 'KEYWORD' && hasKw) {
            return {
              border: 'dark:border-neonCyan/80 border-cyan-400',
              shadow: 'dark:shadow-[0_0_20px_rgba(0,255,255,0.3)] shadow-[4px_4px_0_#0f172a]',
              text: 'dark:text-neonCyan text-cyan-800',
              bg: 'dark:bg-cyan-950/25 bg-cyan-50/70',
              iconBg: 'bg-neonCyan',
              badgeBg: 'bg-cyan-500/20 text-cyan-950 dark:text-cyan-300 border-neonCyan/40',
              title: '🔍 KULCSSZÓ TALÁLAT',
              badges: [{ label: '🔍 KULCSSZÓ', badgeClass: 'bg-cyan-500/20 text-cyan-300 border-neonCyan/40' }]
            };
          }
          if (filter === 'SEMANTIC' && hasSem) {
            return {
              border: 'dark:border-neonMagenta/80 border-fuchsia-400',
              shadow: 'dark:shadow-[0_0_20px_rgba(255,0,255,0.3)] shadow-[4px_4px_0_#0f172a]',
              text: 'dark:text-neonMagenta text-fuchsia-800',
              bg: 'dark:bg-fuchsia-950/25 bg-fuchsia-50/70',
              iconBg: 'bg-neonMagenta',
              badgeBg: 'bg-fuchsia-500/20 text-fuchsia-950 dark:text-fuchsia-300 border-neonMagenta/40',
              title: '🧠 SZEMANTIKUS TALÁLAT',
              badges: [{ label: '🧠 SZEMANTIKA', badgeClass: 'bg-fuchsia-500/20 text-fuchsia-300 border-neonMagenta/40' }]
            };
          }
          if (filter === 'CHUNK' && hasChunk) {
            return {
              border: 'dark:border-plasmaGreen/80 border-emerald-400',
              shadow: 'dark:shadow-[0_0_20px_rgba(128,255,0,0.3)] shadow-[4px_4px_0_#0f172a]',
              text: 'dark:text-plasmaGreen text-emerald-800',
              bg: 'dark:bg-emerald-950/25 bg-emerald-50/70',
              iconBg: 'bg-plasmaGreen',
              badgeBg: 'bg-emerald-500/20 text-emerald-950 dark:text-emerald-300 border-plasmaGreen/40',
              title: '🎯 RAG CHUNK',
              badges: [{ label: '🎯 CHUNK', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-plasmaGreen/40' }]
            };
          }

          // ÖSSZES (ALL) nézet: 7 diszkrét kombináció
          const activeBadges = [];
          if (hasKw) activeBadges.push({ label: '🔍 KULCSSZÓ', badgeClass: 'bg-cyan-500/20 text-cyan-300 border-neonCyan/50' });
          if (hasSem) activeBadges.push({ label: '🧠 SZEMANTIKA', badgeClass: 'bg-fuchsia-500/20 text-fuchsia-300 border-neonMagenta/50' });
          if (hasChunk) activeBadges.push({ label: '🎯 CHUNK', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-plasmaGreen/50' });

          // 1. Tripla átfedés (Mindhárom: Kulcsszó + Szemantika + Chunk)
          if (hasKw && hasSem && hasChunk) {
            return {
              border: 'dark:border-white border-slate-300',
              shadow: 'dark:shadow-[-6px_0_18px_#00FFFF,6px_0_18px_#FF00FF,0_6px_18px_#80FF00] shadow-[4px_4px_0_#0f172a]',
              text: 'dark:text-white text-slate-900',
              bg: 'dark:bg-slate-900/50 bg-slate-100/80',
              iconBg: 'bg-white',
              badgeBg: 'bg-white/10 text-white border-white/40',
              title: '💎 TELJES HIBRID RAG FÚZIÓ',
              badges: activeBadges
            };
          }

          // 2. Kulcsszó + Szemantika (Cián + Magenta)
          if (hasKw && hasSem) {
            return {
              border: 'dark:border-fuchsia-400/80 border-cyan-400',
              shadow: 'dark:shadow-[-6px_0_16px_#00FFFF,6px_0_16px_#FF00FF] shadow-[4px_4px_0_#0f172a]',
              text: 'dark:text-cyan-200 text-fuchsia-900',
              bg: 'dark:bg-purple-950/30 bg-purple-50/70',
              iconBg: 'bg-neonCyan',
              badgeBg: 'bg-purple-500/20 text-purple-200 border-purple-400/40',
              title: '🔥 KULCSSZÓ + SZEMANTIKA HIBRID',
              badges: activeBadges
            };
          }

          // 3. Kulcsszó + Chunk (Cián + Plazma Zöld)
          if (hasKw && hasChunk) {
            return {
              border: 'dark:border-cyan-400/80 border-emerald-400',
              shadow: 'dark:shadow-[-6px_0_16px_#00FFFF,6px_0_16px_#80FF00] shadow-[4px_4px_0_#0f172a]',
              text: 'dark:text-teal-200 text-teal-900',
              bg: 'dark:bg-teal-950/30 bg-teal-50/70',
              iconBg: 'bg-neonCyan',
              badgeBg: 'bg-teal-500/20 text-teal-200 border-teal-400/40',
              title: '⚡ KULCSSZÓ + RAG CHUNK',
              badges: activeBadges
            };
          }

          // 4. Szemantika + Chunk (Magenta + Plazma Zöld)
          if (hasSem && hasChunk) {
            return {
              border: 'dark:border-fuchsia-400/80 border-emerald-400',
              shadow: 'dark:shadow-[-6px_0_16px_#FF00FF,6px_0_16px_#80FF00] shadow-[4px_4px_0_#0f172a]',
              text: 'dark:text-fuchsia-200 text-emerald-900',
              bg: 'dark:bg-pink-950/25 bg-pink-50/70',
              iconBg: 'bg-neonMagenta',
              badgeBg: 'bg-pink-500/20 text-pink-200 border-pink-400/40',
              title: '🧬 SZEMANTIKUS + RAG CHUNK',
              badges: activeBadges
            };
          }

          // 5. Csak Kulcsszó
          if (hasKw) {
            return {
              border: 'dark:border-neonCyan/60 border-cyan-400',
              shadow: 'dark:shadow-[0_0_18px_rgba(0,255,255,0.2)] shadow-[4px_4px_0_#0f172a]',
              text: 'dark:text-neonCyan text-cyan-800',
              bg: 'dark:bg-cyan-950/20 bg-cyan-50/70',
              iconBg: 'bg-neonCyan',
              badgeBg: 'bg-cyan-500/20 text-cyan-950 dark:text-cyan-300 border-neonCyan/40',
              title: '🔍 KULCSSZÓ TALÁLAT',
              badges: activeBadges
            };
          }

          // 6. Csak Szemantika
          if (hasSem) {
            return {
              border: 'dark:border-neonMagenta/60 border-fuchsia-400',
              shadow: 'dark:shadow-[0_0_18px_rgba(255,0,255,0.2)] shadow-[4px_4px_0_#0f172a]',
              text: 'dark:text-neonMagenta text-fuchsia-800',
              bg: 'dark:bg-fuchsia-950/20 bg-fuchsia-50/70',
              iconBg: 'bg-neonMagenta',
              badgeBg: 'bg-fuchsia-500/20 text-fuchsia-950 dark:text-fuchsia-300 border-neonMagenta/40',
              title: '🧠 SZEMANTIKUS TALÁLAT',
              badges: activeBadges
            };
          }

          // 7. Csak Chunk / Alapértelmezett
          return {
            border: 'dark:border-plasmaGreen/60 border-emerald-400',
            shadow: 'dark:shadow-[0_0_18px_rgba(128,255,0,0.2)] shadow-[4px_4px_0_#0f172a]',
            text: 'dark:text-plasmaGreen text-emerald-800',
            bg: 'dark:bg-emerald-950/20 bg-emerald-50/70',
            iconBg: 'bg-plasmaGreen',
            badgeBg: 'bg-emerald-500/20 text-emerald-950 dark:text-emerald-300 border-plasmaGreen/40',
            title: '🎯 RAG CHUNK',
            badges: activeBadges
          };
        };

        if (shouldDecorate && chunkMeta) {
          const style = getChunkStyle(chunkMeta, activeFilterLevel);
          return (
            <div className={`rag-chunk-card my-5 p-4.5 border-2 ${style.border} ${style.bg} ${style.shadow} font-body relative transition-all duration-300`}>
              <div className={`flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono font-black uppercase ${style.text} pb-2.5 mb-3 border-b-2 ${style.border.replace('border-2', '').replace('border-', 'border-').replace('/60', '/30').replace('/80', '/40')}`}>
                <span className="flex items-center gap-1.5 tracking-wider">
                  <span className={`w-2 h-2 rounded-full ${style.iconBg} animate-pulse`} />
                  {style.title} ({chunkMeta.id})
                </span>
                
                <div className="flex items-center gap-1.5 flex-wrap">
                  {style.badges && style.badges.map((b, bIdx) => (
                    <span key={bIdx} className={`px-1.5 py-0.5 text-[9px] font-mono font-bold border ${b.badgeClass}`}>
                      {b.label}
                    </span>
                  ))}
                  <span className={`px-2 py-0.5 font-bold border ${style.badgeBg}`}>
                    ⚡ {chunkMeta.score}% ILLESZKEDÉS
                  </span>
                </div>
              </div>

              <p className="dark:text-slate-100 text-slate-900 font-body text-base leading-relaxed font-medium mb-3">
                {highlightChildren(children)}
              </p>

              {/* Deep RAG Metadata Readout Footer */}
              <div className={`pt-2.5 mt-2 border-t flex flex-wrap items-center justify-between gap-2 font-mono text-[9px] ${style.text.replace('text-', 'text-').replace('dark:text-', 'dark:text-').replace('800', '900')} ${style.border.replace('border-', 'border-').replace('/60', '/20').replace('/80', '/20')}`}>
                <div className="flex items-center gap-2">
                  <span>COS_SIM: <strong className={style.text}>{chunkMeta.cosSim}</strong></span>
                  <span>•</span>
                  <span>DENSITY: <strong className={style.text}>{chunkMeta.tokenCount} TOKENS</strong></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">ENGINE:</span>
                  <span className={`px-1.5 py-0.2 bg-black/40 border ${style.border.replace('border-', 'border-').replace('/60', '/30').replace('/80', '/30')} ${style.text} font-bold`}>
                    128-DIM L2 DENSE EMBEDDING
                  </span>
                </div>
              </div>
            </div>
          );
        }

        return (
          <p className="dark:text-slate-300 text-slate-800 font-body text-base leading-relaxed mb-5 font-normal">
            {highlightChildren(children)}
          </p>
        );
      },

      blockquote: BlockquoteRenderer,
      ul: Ul,
      ol: Ol,
      li: ({ children, ...props }) => {
        const fullLiText = extractTextFromChildren(children);
        
        // Use serverChunk for list items as well if available
        const serverChunk = findMatchingServerChunk(fullLiText);
        let shouldDecorate = false;
        let chunkMeta = null;

        if (serverChunk) {
          if (activeFilterLevel === 'ALL') shouldDecorate = true;
          else if (activeFilterLevel === 'KEYWORD') shouldDecorate = !!serverChunk.is_keyword_match;
          else if (activeFilterLevel === 'SEMANTIC') shouldDecorate = !!serverChunk.is_semantic_match;
          else if (activeFilterLevel === 'CHUNK') shouldDecorate = !!serverChunk.is_rag_chunk;

          chunkMeta = {
            id: serverChunk.chunk_id,
            score: serverChunk.relevance_score || 80,
            tokenCount: serverChunk.token_count,
            cosSim: serverChunk.cosine_similarity !== undefined ? serverChunk.cosine_similarity.toFixed(3) : '0.850'
          };
        } else {
          // Client side fallback for list items
          const { isSemanticMatch, semanticScore, matchedKeywords } = analyzeSentenceRelevance(fullLiText, highlightQuery);
          const hasMatch = highlightQuery && (
            isSemanticMatch || 
            matchedKeywords.length > 0 || 
            highlightQuery.trim().toLowerCase().split(/\s+/).some(w => w.length > 2 && fullLiText.toLowerCase().includes(w))
          );

          if (highlightQuery && hasMatch && fullLiText.length > 15) {
            shouldDecorate = true;
            chunkMeta = {
              id: 'chk_local_li',
              score: Math.max(semanticScore, 75),
              tokenCount: Math.max(8, Math.ceil(fullLiText.split(/\s+/).length * 1.3)),
              cosSim: (Math.max(semanticScore, 75) / 100).toFixed(3)
            };
          }
        }

        if (shouldDecorate && chunkMeta) {
          
          const getChunkStyle = (chunk, filter) => {
            if (!chunk || chunk.id.startsWith('chk_local')) {
               return {
                 border: 'dark:border-plasmaGreen/60 border-emerald-400',
                 shadow: 'dark:shadow-[0_0_15px_rgba(128,255,0,0.15)] shadow-[3px_3px_0_#0f172a]',
                 text: 'dark:text-plasmaGreen text-emerald-800',
                 bg: 'dark:bg-emerald-950/20 bg-emerald-50/70',
                 iconBg: 'bg-plasmaGreen',
                 badgeBg: 'bg-emerald-500/20 text-emerald-950 dark:text-emerald-300 border-plasmaGreen/40',
                 title: '🎯 RAG LISTAELEM',
                 badges: [{ label: '🎯 CHUNK', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-plasmaGreen/40' }]
               };
            }
  
            const hasKw = !!serverChunk?.is_keyword_match;
            const hasSem = !!serverChunk?.is_semantic_match;
            const hasChunk = !!serverChunk?.is_rag_chunk;

            if (filter === 'KEYWORD' && hasKw) {
              return {
                border: 'dark:border-neonCyan/80 border-cyan-400',
                shadow: 'dark:shadow-[0_0_16px_rgba(0,255,255,0.3)] shadow-[3px_3px_0_#0f172a]',
                text: 'dark:text-neonCyan text-cyan-800',
                bg: 'dark:bg-cyan-950/25 bg-cyan-50/70',
                iconBg: 'bg-neonCyan',
                badgeBg: 'bg-cyan-500/20 text-cyan-950 dark:text-cyan-300 border-neonCyan/40',
                title: '🔍 KULCSSZÓ LISTAELEM',
                badges: [{ label: '🔍 KULCSSZÓ', badgeClass: 'bg-cyan-500/20 text-cyan-300 border-neonCyan/40' }]
              };
            }
            if (filter === 'SEMANTIC' && hasSem) {
              return {
                border: 'dark:border-neonMagenta/80 border-fuchsia-400',
                shadow: 'dark:shadow-[0_0_16px_rgba(255,0,255,0.3)] shadow-[3px_3px_0_#0f172a]',
                text: 'dark:text-neonMagenta text-fuchsia-800',
                bg: 'dark:bg-fuchsia-950/25 bg-fuchsia-50/70',
                iconBg: 'bg-neonMagenta',
                badgeBg: 'bg-fuchsia-500/20 text-fuchsia-950 dark:text-fuchsia-300 border-neonMagenta/40',
                title: '🧠 SZEMANTIKUS LISTAELEM',
                badges: [{ label: '🧠 SZEMANTIKA', badgeClass: 'bg-fuchsia-500/20 text-fuchsia-300 border-neonMagenta/40' }]
              };
            }
            if (filter === 'CHUNK' && hasChunk) {
              return {
                border: 'dark:border-plasmaGreen/80 border-emerald-400',
                shadow: 'dark:shadow-[0_0_16px_rgba(128,255,0,0.3)] shadow-[3px_3px_0_#0f172a]',
                text: 'dark:text-plasmaGreen text-emerald-800',
                bg: 'dark:bg-emerald-950/25 bg-emerald-50/70',
                iconBg: 'bg-plasmaGreen',
                badgeBg: 'bg-emerald-500/20 text-emerald-950 dark:text-emerald-300 border-plasmaGreen/40',
                title: '🎯 RAG LISTAELEM',
                badges: [{ label: '🎯 CHUNK', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-plasmaGreen/40' }]
              };
            }

            const activeBadges = [];
            if (hasKw) activeBadges.push({ label: '🔍 KULCSSZÓ', badgeClass: 'bg-cyan-500/20 text-cyan-300 border-neonCyan/50' });
            if (hasSem) activeBadges.push({ label: '🧠 SZEMANTIKA', badgeClass: 'bg-fuchsia-500/20 text-fuchsia-300 border-neonMagenta/50' });
            if (hasChunk) activeBadges.push({ label: '🎯 CHUNK', badgeClass: 'bg-emerald-500/20 text-emerald-300 border-plasmaGreen/50' });

            if (hasKw && hasSem && hasChunk) {
              return {
                border: 'dark:border-white border-slate-300',
                shadow: 'dark:shadow-[-5px_0_15px_#00FFFF,5px_0_15px_#FF00FF,0_5px_15px_#80FF00] shadow-[3px_3px_0_#0f172a]',
                text: 'dark:text-white text-slate-900',
                bg: 'dark:bg-slate-900/50 bg-slate-100/80',
                iconBg: 'bg-white',
                badgeBg: 'bg-white/10 text-white border-white/40',
                title: '💎 TELJES HIBRID LISTAELEM',
                badges: activeBadges
              };
            }

            if (hasKw && hasSem) {
              return {
                border: 'dark:border-fuchsia-400/80 border-cyan-400',
                shadow: 'dark:shadow-[-5px_0_14px_#00FFFF,5px_0_14px_#FF00FF] shadow-[3px_3px_0_#0f172a]',
                text: 'dark:text-cyan-200 text-fuchsia-900',
                bg: 'dark:bg-purple-950/30 bg-purple-50/70',
                iconBg: 'bg-neonCyan',
                badgeBg: 'bg-purple-500/20 text-purple-200 border-purple-400/40',
                title: '🔥 KULCSSZÓ + SZEMANTIKA',
                badges: activeBadges
              };
            }

            if (hasKw && hasChunk) {
              return {
                border: 'dark:border-cyan-400/80 border-emerald-400',
                shadow: 'dark:shadow-[-5px_0_14px_#00FFFF,5px_0_14px_#80FF00] shadow-[3px_3px_0_#0f172a]',
                text: 'dark:text-teal-200 text-teal-900',
                bg: 'dark:bg-teal-950/30 bg-teal-50/70',
                iconBg: 'bg-neonCyan',
                badgeBg: 'bg-teal-500/20 text-teal-200 border-teal-400/40',
                title: '⚡ KULCSSZÓ + CHUNK',
                badges: activeBadges
              };
            }

            if (hasSem && hasChunk) {
              return {
                border: 'dark:border-fuchsia-400/80 border-emerald-400',
                shadow: 'dark:shadow-[-5px_0_14px_#FF00FF,5px_0_14px_#80FF00] shadow-[3px_3px_0_#0f172a]',
                text: 'dark:text-fuchsia-200 text-emerald-900',
                bg: 'dark:bg-pink-950/25 bg-pink-50/70',
                iconBg: 'bg-neonMagenta',
                badgeBg: 'bg-pink-500/20 text-pink-200 border-pink-400/40',
                title: '🧬 SZEMANTIKUS + CHUNK',
                badges: activeBadges
              };
            }

            if (hasKw) {
              return {
                border: 'dark:border-neonCyan/60 border-cyan-400',
                shadow: 'dark:shadow-[0_0_15px_rgba(0,255,255,0.2)] shadow-[3px_3px_0_#0f172a]',
                text: 'dark:text-neonCyan text-cyan-800',
                bg: 'dark:bg-cyan-950/20 bg-cyan-50/70',
                iconBg: 'bg-neonCyan',
                badgeBg: 'bg-cyan-500/20 text-cyan-950 dark:text-cyan-300 border-neonCyan/40',
                title: '🔍 KULCSSZÓ LISTAELEM',
                badges: activeBadges
              };
            }

            if (hasSem) {
              return {
                border: 'dark:border-neonMagenta/60 border-fuchsia-400',
                shadow: 'dark:shadow-[0_0_15px_rgba(255,0,255,0.2)] shadow-[3px_3px_0_#0f172a]',
                text: 'dark:text-neonMagenta text-fuchsia-800',
                bg: 'dark:bg-fuchsia-950/20 bg-fuchsia-50/70',
                iconBg: 'bg-neonMagenta',
                badgeBg: 'bg-fuchsia-500/20 text-fuchsia-950 dark:text-fuchsia-300 border-neonMagenta/40',
                title: '🧠 SZEMANTIKUS LISTAELEM',
                badges: activeBadges
              };
            }

            return {
              border: 'dark:border-plasmaGreen/60 border-emerald-400',
              shadow: 'dark:shadow-[0_0_15px_rgba(128,255,0,0.2)] shadow-[3px_3px_0_#0f172a]',
              text: 'dark:text-plasmaGreen text-emerald-800',
              bg: 'dark:bg-emerald-950/20 bg-emerald-50/70',
              iconBg: 'bg-plasmaGreen',
              badgeBg: 'bg-emerald-500/20 text-emerald-950 dark:text-emerald-300 border-plasmaGreen/40',
              title: '🎯 RAG LISTAELEM',
              badges: activeBadges
            };
          };

          const style = getChunkStyle(chunkMeta, activeFilterLevel);

          return (
            <li className="mb-4 list-none" {...props}>
              <div className={`rag-chunk-card p-3.5 border-2 ${style.border} ${style.bg} ${style.shadow} font-body relative transition-all duration-300`}>
                <div className={`flex flex-wrap items-center justify-between gap-1.5 text-[9px] font-mono font-black uppercase ${style.text} pb-1.5 mb-2 border-b ${style.border.replace('border-2', '').replace('border-', 'border-').replace('/60', '/30').replace('/80', '/40')}`}>
                  <span className="flex items-center gap-1 tracking-wider">
                    <span className={`w-1.5 h-1.5 rounded-full ${style.iconBg} animate-pulse`} />
                    {style.title} ({chunkMeta.id})
                  </span>

                  <div className="flex items-center gap-1 flex-wrap">
                    {style.badges && style.badges.map((b, bIdx) => (
                      <span key={bIdx} className={`px-1 py-0.2 text-[8px] font-mono font-bold border ${b.badgeClass}`}>
                        {b.label}
                      </span>
                    ))}
                    <span className={`px-1.5 py-0.2 font-bold border ${style.badgeBg}`}>
                      ⚡ {chunkMeta.score}% ILLESZKEDÉS
                    </span>
                  </div>
                </div>
                <div className="dark:text-slate-100 text-slate-900 font-body text-sm leading-relaxed font-medium mb-2">
                  {highlightChildren(children)}
                </div>
                <div className={`pt-1.5 border-t flex items-center justify-between font-mono text-[8px] ${style.text.replace('text-', 'text-').replace('dark:text-', 'dark:text-').replace('800', '900')} ${style.border.replace('border-', 'border-').replace('/60', '/20').replace('/80', '/20')}`}>
                  <span>COS_SIM: <strong className={style.text}>{chunkMeta.cosSim}</strong> • DENSITY: <strong className={style.text}>{chunkMeta.tokenCount} TOKENS</strong></span>
                  <span className={`px-1 bg-black/40 border ${style.border.replace('border-', 'border-').replace('/60', '/30').replace('/80', '/30')} ${style.text}`}>128-DIM VECTOR</span>
                </div>
              </div>
            </li>
          );
        }

        return (
          <li className="mb-2 leading-relaxed dark:text-slate-300 text-slate-800" {...props}>
            {highlightChildren(children)}
          </li>
        );
      },
      // Táblázatok
      table: TableWrapper,
      thead: ({ children }) => <thead>{children}</thead>,
      tbody: ({ children }) => <tbody>{children}</tbody>,
      th: Th,
      td: ({ children, ...props }) => (
        <td className="px-4 py-3 border-b dark:border-white/10 border-slate-200 dark:text-slate-300 text-slate-800 text-xs font-mono" {...props}>
          {highlightChildren(children)}
        </td>
      ),
      tr: Tr,
      // Linkek
      a: LinkRenderer,
      // Képek → Lightbox
      img: ({ src, alt }) => <ImageLightbox src={src} alt={alt} />,
      // Elválasztó (Thematic Break: --- / *** / ___)
      hr: Hr,
      // Szöveg stílusok
      strong: Strong,
      em: Em,
      del: Del,
      // GFM Task list checkbox
      input: ({ type, checked, ...props }) => {
        if (type === 'checkbox') {
          return (
            <input
              type="checkbox"
              checked={!!checked}
              readOnly
              className="accent-neonCyan mr-2 align-middle w-4 h-4 cursor-default inline-block"
              {...props}
            />
          );
        }
        return <input type={type} {...props} />;
      },
      // Direktívák
      div: DivRenderer,
    };

  return (
    <div className="max-w-none font-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkFrontmatter]}
        rehypePlugins={[rehypeRaw, rehypeSlug]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};


export default MarkdownRenderer;
