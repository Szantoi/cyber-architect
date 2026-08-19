import React, { useState } from 'react';
import { ExternalLink, Play, Maximize2 } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// VideoPlayer – YouTube / MP4 / Loom beágyazás
// Reszponzív 16:9, CRT scanline overlay, éles szélű ipari keret
// ─────────────────────────────────────────────────────────────

// YouTube URL → embed URL konverter
const toYouTubeEmbed = (url) => {
  const match =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/) ||
    url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
  if (match) return `https://www.youtube.com/embed/${match[1]}?rel=0&color=white&controls=1`;
  return null;
};

// Loom URL → embed URL konverter
const toLoomEmbed = (url) => {
  const match = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
  if (match) return `https://www.loom.com/embed/${match[1]}?hide_owner=true&hide_share=true&hideEmbedTopBar=true`;
  return null;
};

// Videó típus detektálás
const detectType = (src) => {
  if (!src) return null;
  if (src.includes('youtube') || src.includes('youtu.be')) return 'youtube';
  if (src.includes('loom.com')) return 'loom';
  if (/\.(mp4|webm|ogg)$/i.test(src)) return 'native';
  return 'unknown';
};

const VideoPlayer = ({
  src,
  title = 'VIDEO READOUT',
  caption,
  crtOverlay = true,
  startTime = 0,
}) => {
  const [crtActive, setCrtActive] = useState(crtOverlay);
  const [isExpanded, setIsExpanded] = useState(false);

  const type = detectType(src);

  const embedSrc =
    type === 'youtube'
      ? `${toYouTubeEmbed(src)}${startTime ? `&start=${startTime}` : ''}`
      : type === 'loom'
      ? toLoomEmbed(src)
      : null;

  // Ismeretlen/hibás forrás
  if (!src || type === 'unknown') {
    return (
      <div className="my-6 p-6 border border-neonMagenta/30 bg-slate-950 font-mono text-neonMagenta text-xs uppercase text-center">
        ⚠ ÉRVÉNYTELEN VIDEO FORRÁS — YouTube, Loom vagy MP4 URL szükséges
      </div>
    );
  }

  return (
    <figure className="my-8">
      {/* Wrapper */}
      <div className={`border dark:border-white/10 border-slate-300 bg-[var(--surface-panel)] overflow-hidden group hover:border-neonCyan/40 transition-colors duration-300 shadow-sm dark:shadow-none ${isExpanded ? 'fixed inset-4 z-50 flex flex-col' : ''}`}>
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-2 dark:bg-slate-900/80 bg-slate-100 border-b dark:border-white/10 border-slate-200">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-plasmaGreen inline-block" />
            <span className="w-2 h-2 dark:bg-slate-700 bg-slate-300 inline-block" />
            <span className="w-2 h-2 dark:bg-slate-700 bg-slate-300 inline-block" />
            <span className="font-headline font-black uppercase text-[10px] tracking-widest text-on-surface ml-2 flex items-center gap-1 font-bold">
              <Play size={10} className="text-neonCyan" />
              {title}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* CRT Toggle */}
            <button
              onClick={() => setCrtActive((v) => !v)}
              className={`font-mono text-[9px] uppercase tracking-wider px-2 py-0.5 border transition-colors ${crtActive ? 'border-neonCyan/50 text-neonCyan bg-neonCyan/10' : 'border-white/10 text-slate-500'}`}
              title="CRT Overlay kapcsoló"
            >
              CRT
            </button>
            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsExpanded((v) => !v)}
              className="text-slate-400 hover:text-neonCyan transition-colors"
              title="Nagyítás"
            >
              <Maximize2 size={12} />
            </button>
            {/* External link */}
            <a
              href={src}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-400 hover:text-plasmaGreen transition-colors"
              title="Megnyitás új lapon"
            >
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Video Wrapper – 16:9 */}
        <div className={`relative w-full ${isExpanded ? 'flex-1' : 'aspect-video'} bg-black`}>
          {/* CRT Scanline Overlay */}
          {crtActive && (
            <div
              className="absolute inset-0 pointer-events-none z-10"
              style={{
                background: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.18) 2px, rgba(0,0,0,0.18) 4px)`,
                mixBlendMode: 'multiply',
              }}
            />
          )}

          {/* Iframe embed (YouTube / Loom) */}
          {embedSrc && (
            <iframe
              src={embedSrc}
              title={title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 w-full h-full border-0"
              loading="lazy"
            />
          )}

          {/* Native Video (MP4 / WebM) */}
          {type === 'native' && (
            <video
              src={src}
              controls
              className="absolute inset-0 w-full h-full object-contain"
              style={{ background: '#000' }}
            />
          )}

          {/* Corner brackets */}
          <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-neonCyan/50 pointer-events-none z-20" />
          <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-neonMagenta/50 pointer-events-none z-20" />
        </div>

        {/* Expanded backdrop */}
        {isExpanded && (
          <button
            onClick={() => setIsExpanded(false)}
            className="fixed inset-0 bg-black/80 z-40 cursor-zoom-out"
            style={{ zIndex: 49 }}
          />
        )}
      </div>

      {/* Caption */}
      {caption && (
        <figcaption className="mt-2 font-mono text-[10px] text-slate-500 uppercase tracking-wider text-center">
          {caption}
        </figcaption>
      )}
    </figure>
  );
};

export default VideoPlayer;
