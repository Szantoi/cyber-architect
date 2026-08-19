import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Download, Radio } from 'lucide-react';

// ─────────────────────────────────────────────────────────────
// TacticalAudioPlayer – NotebookLM Audio Deep Dive Component
// Cyber-Architect Archive vizuális identitás
// ─────────────────────────────────────────────────────────────

const SPEED_OPTIONS = [1, 1.25, 1.5, 1.75, 2];

const formatTime = (seconds) => {
  if (isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

// Faux Waveform Bars
const WaveformBar = ({ isPlaying, index }) => {
  const baseHeight = 20 + Math.sin(index * 1.7) * 15 + Math.cos(index * 0.9) * 10;
  return (
    <div
      className="w-1 rounded-none origin-bottom transition-all duration-75"
      style={{
        height: `${baseHeight}px`,
        minHeight: '4px',
        maxHeight: '40px',
        background: isPlaying
          ? `hsl(${180 + index * 4}, 100%, ${50 + (index % 3) * 10}%)`
          : '#1e293b',
        animation: isPlaying
          ? `waveform-bounce ${0.4 + (index % 5) * 0.08}s ease-in-out infinite alternate`
          : 'none',
        animationDelay: `${index * 0.03}s`,
      }}
    />
  );
};

const TacticalAudioPlayer = ({
  src,
  title = 'AUDIO DEEP DIVE',
  subtitle = 'NotebookLM Generated Podcast',
  host1 = 'AI HOST 01',
  host2 = 'AI HOST 02',
  downloadable = true,
}) => {
  const audioRef = useRef(null);
  const progressRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Audio event handlers
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => { setDuration(audio.duration); setIsLoading(false); };
    const onEnded = () => setIsPlaying(false);
    const onError = () => { setError('AUDIO_STREAM_ERROR'); setIsLoading(false); };
    const onCanPlay = () => setIsLoading(false);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    audio.addEventListener('canplay', onCanPlay);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('canplay', onCanPlay);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) { audio.pause(); setIsPlaying(false); }
    else { audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false)); }
  };

  const skip = (secs) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(audio.currentTime + secs, 0), duration);
  };

  const handleProgressClick = (e) => {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar) return;
    const rect = bar.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * duration;
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolume = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (audioRef.current) audioRef.current.volume = v;
  };

  const cycleSpeed = () => {
    const next = (speedIdx + 1) % SPEED_OPTIONS.length;
    setSpeedIdx(next);
    if (audioRef.current) audioRef.current.playbackRate = SPEED_OPTIONS[next];
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const barCount = 48;

  return (
    <>
      {/* Waveform Animation Keyframes */}
      <style>{`
        @keyframes waveform-bounce {
          0% { transform: scaleY(0.6); }
          100% { transform: scaleY(1.4); }
        }
      `}</style>

      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="my-8 border dark:border-white/10 border-slate-300 bg-[var(--surface-panel)] overflow-hidden group hover:border-neonCyan/40 transition-colors duration-300 shadow-sm dark:shadow-none">
        {/* ── Header Bar ── */}
        <div className="flex items-center justify-between px-5 py-3 dark:bg-slate-900/80 bg-slate-100 border-b dark:border-white/10 border-slate-200">
          <div className="flex items-center gap-3">
            <Radio size={14} className={isPlaying ? 'text-neonCyan animate-pulse' : 'text-slate-500'} />
            <div>
              <div className="font-headline font-black uppercase text-xs tracking-widest text-on-surface">
                {title}
              </div>
              <div className="font-mono text-[10px] dark:text-slate-500 text-slate-500 uppercase tracking-wider mt-0.5 font-bold">
                {subtitle}
              </div>
            </div>
          </div>
          {/* Hosts */}
          <div className="hidden sm:flex items-center gap-3 font-mono text-[10px]">
            <span className="text-neonCyan px-2 py-0.5 border border-neonCyan/30 bg-neonCyan/10">{host1}</span>
            <span className="text-slate-500">&</span>
            <span className="text-neonMagenta px-2 py-0.5 border border-neonMagenta/30 bg-neonMagenta/10">{host2}</span>
          </div>
        </div>

        {/* ── Waveform Visualizer ── */}
        <div className="px-5 pt-5 pb-2">
          <div className="flex items-end gap-[2px] h-12 mb-4 cursor-pointer" onClick={togglePlay}>
            {Array.from({ length: barCount }).map((_, i) => (
              <WaveformBar key={i} isPlaying={isPlaying} index={i} />
            ))}
          </div>

          {/* Progress Bar */}
          <div
            ref={progressRef}
            className="relative h-1 bg-slate-800 cursor-pointer mb-3 group/bar"
            onClick={handleProgressClick}
          >
            <div
              className="absolute left-0 top-0 h-full bg-neonCyan transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-neonCyan opacity-0 group-hover/bar:opacity-100 transition-opacity"
              style={{ left: `${progress}%`, transform: 'translateX(-50%) translateY(-50%)' }}
            />
          </div>

          {/* Time Display */}
          <div className="flex justify-between font-mono text-[10px] text-slate-500 mb-4">
            <span className="text-neonCyan">{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* ── Controls Row ── */}
          <div className="flex items-center justify-between">
            {/* Left: Playback Controls */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => skip(-15)}
                className="text-slate-400 hover:text-neonCyan transition-colors font-mono text-[10px] flex flex-col items-center gap-0.5"
                title="-15s"
              >
                <SkipBack size={16} />
                <span>-15</span>
              </button>

              <button
                onClick={togglePlay}
                disabled={isLoading}
                className="w-10 h-10 flex items-center justify-center border border-neonCyan text-neonCyan hover:bg-neonCyan hover:text-black transition-all duration-200 disabled:opacity-40"
              >
                {isLoading ? (
                  <span className="w-3 h-3 border border-neonCyan border-t-transparent animate-spin" />
                ) : isPlaying ? (
                  <Pause size={16} />
                ) : (
                  <Play size={16} className="ml-0.5" />
                )}
              </button>

              <button
                onClick={() => skip(15)}
                className="text-slate-400 hover:text-neonCyan transition-colors font-mono text-[10px] flex flex-col items-center gap-0.5"
                title="+15s"
              >
                <SkipForward size={16} />
                <span>+15</span>
              </button>
            </div>

            {/* Right: Volume + Speed + Download */}
            <div className="flex items-center gap-4">
              {/* Speed */}
              <button
                onClick={cycleSpeed}
                className="font-mono text-[10px] text-slate-400 hover:text-neonCyan transition-colors px-2 py-1 border border-white/10 hover:border-neonCyan/40 min-w-[44px] text-center"
              >
                {SPEED_OPTIONS[speedIdx]}×
              </button>

              {/* Mute + Volume */}
              <div className="hidden sm:flex items-center gap-2">
                <button onClick={toggleMute} className="text-slate-400 hover:text-neonCyan transition-colors">
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolume}
                  className="w-16 h-px accent-[#00FFFF] cursor-pointer"
                />
              </div>

              {/* Download */}
              {downloadable && src && (
                <a
                  href={src}
                  download
                  className="text-slate-400 hover:text-plasmaGreen transition-colors"
                  title="Letöltés"
                >
                  <Download size={14} />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="px-5 py-3 border-t border-neonMagenta/30 font-mono text-[10px] text-neonMagenta uppercase">
            ⚠ {error} — Ellenőrizd az audio forrást.
          </div>
        )}
      </div>
    </>
  );
};

export default TacticalAudioPlayer;
