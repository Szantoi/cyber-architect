import { motion } from 'framer-motion';
import { useContent } from '../context/ContentContext';

const Hero = () => {
  const { settings } = useContent();

  const containerVars = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.5
      }
    }
  };

  const itemVars = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { ease: 'easeOut', duration: 0.8 }
    }
  };

  const statusText = settings.hero_status || 'RENDSZER: AKTÍV // AI & FOLYAMATAUTOMATIZÁCIÓ';
  const titleText = settings.hero_title || 'Szántói\nGábor.';
  const subtitleText = settings.hero_subtitle || 'Mérnöki szemléletű folyamatfejlesztő és AI integrátor. Szigetrendszerek összekötése, manuális adminisztráció kiváltása és biztonságos belső AI megoldások (RAG, API) bevezetése vállalati környezetben.';
  const btnPrimary = settings.hero_btn_primary || 'KAPCSOLATFELVÉTEL';
  const btnSecondary = settings.hero_btn_secondary || 'REFERENCIÁK MEGTEKINTÉSE';

  // Render title with linebreaks and cursor
  const titleLines = titleText.split('\n');

  return (
    <section className="min-h-screen flex items-center justify-center relative pt-20 overflow-hidden">
      {/* Background Animated Elements */}
      <div className="absolute inset-0 wireframe-grid pointer-events-none opacity-20"></div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-neonCyan/5 rounded-full blur-[120px] pointer-events-none animate-pulse"></div>
      
      <motion.div 
        className="container mx-auto px-6 relative z-10"
        variants={containerVars}
        initial="hidden"
        animate="visible"
      >
        <div className="max-w-5xl mx-auto">
          <motion.div variants={itemVars} className="mb-6 flex max-w-full items-center gap-3">
            <span className="w-12 h-[1px] bg-neonCyan"></span>
            <span className="max-w-full break-words font-mono text-[10px] sm:text-xs text-neonCyan font-black uppercase tracking-[0.16em] sm:tracking-[0.4em] leading-relaxed animate-flicker">
              {statusText}
            </span>
          </motion.div>
          
          <motion.h1 
            variants={itemVars}
            className="text-6xl sm:text-7xl md:text-9xl font-headline font-black italic uppercase leading-[0.85] text-on-surface glitch-text mb-8 tracking-tighter"
          >
            {titleLines.map((line, idx) => (
              <span key={idx}>
                {line}
                {idx < titleLines.length - 1 && <br />}
              </span>
            ))}
            <motion.span 
              animate={{ opacity: [1, 0] }}
              transition={{ repeat: Infinity, duration: 0.8, ease: "steps(2)" }}
              className="inline-block w-4 h-12 md:w-8 md:h-20 bg-neonCyan align-middle ml-2"
            />
          </motion.h1>

          <motion.p 
            variants={itemVars}
            className="max-w-2xl text-xl md:text-2xl dark:text-slate-300 text-slate-700 font-body leading-relaxed mb-12 border-l-2 border-neonMagenta/40 pl-8 whitespace-pre-line"
          >
            {subtitleText}
          </motion.p>

          <motion.div variants={itemVars} className="flex flex-col items-stretch gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-6">
            <a 
              href="#uplink"
              onClick={(e) => {
                e.preventDefault();
                const el = document.querySelector('#uplink');
                if (el) {
                  const y = el.getBoundingClientRect().top + window.pageYOffset - 80;
                  window.scrollTo({ top: y, behavior: 'smooth' });
                  window.history.pushState(null, '', '#uplink');
                }
              }}
              className="group relative w-full justify-center dark:bg-neonCyan bg-cyan-700 dark:text-black text-white font-headline font-black italic uppercase px-6 sm:w-auto sm:px-10 py-5 transition-all duration-200 border-2 border-slate-950 shadow-[4px_4px_0_#0f172a] dark:shadow-none dark:hover:shadow-[0_0_25px_rgba(0,251,251,0.5)] hover:bg-slate-950 hover:text-cyan-300 active:scale-95 overflow-hidden inline-flex items-center gap-3"
            >
              <span className="relative z-10 flex items-center gap-3">
                {btnPrimary}
                <span className="material-symbols-outlined font-bold">arrow_forward</span>
              </span>
              <div className="absolute inset-x-0 bottom-0 h-1 bg-black/20 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
            </a>
            <a 
              href="#grid"
              onClick={(e) => {
                e.preventDefault();
                const el = document.querySelector('#grid');
                if (el) {
                  const y = el.getBoundingClientRect().top + window.pageYOffset - 80;
                  window.scrollTo({ top: y, behavior: 'smooth' });
                  window.history.pushState(null, '', '#grid');
                }
              }}
              className="w-full justify-center bg-white/40 dark:bg-transparent border-2 dark:border-white/20 border-slate-950 text-on-surface font-headline font-black italic uppercase px-6 sm:w-auto sm:px-10 py-5 shadow-[4px_4px_0_#0f172a] dark:shadow-none hover:bg-slate-950 hover:text-white dark:hover:border-neonMagenta dark:hover:text-neonMagenta transition-all duration-300 flex items-center gap-3"
            >
              {btnSecondary}
              <span className="material-symbols-outlined">folder_open</span>
            </a>
          </motion.div>
        </div>
      </motion.div>

      {/* Vertical Data Stream Decorative */}
      <div className="absolute right-10 top-1/2 -translate-y-1/2 hidden lg:flex flex-col gap-8 opacity-20">
        {['FOLYAMAT_INTEGRÁCIÓ // 0x8892F', 'ADATBIZTONSÁG_RAG // 0x2241A', 'VEZETŐI_DÖNTÉSTÁMOGATÁS // 0x7701E'].map((text, i) => (
          <div key={i} className="vertical-text font-mono text-[10px] text-slate-500 tracking-[0.5em] h-32 border-r border-white/10 pr-2">
            {text}
          </div>
        ))}
      </div>
    </section>
  );
};

export default Hero;
