import { motion } from 'framer-motion';
import { useContent } from '../context/ContentContext';

const Arsenal = () => {
  const { skills } = useContent();

  const containerVars = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.2 }
    }
  };

  const itemVars = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { 
      opacity: 1, 
      scale: 1,
      y: 0,
      transition: { duration: 0.5, ease: "circOut" }
    }
  };

  // Default fallback skills if database hasn't loaded
  const defaultSkills = [
    { name: 'AI & BELSŐ TUDÁSBÁZISOK (RAG)', icon: 'psychology', color: 'var(--neon-cyan)', level: '0.95', desc: 'Céges dokumentumok és PDF-ek zárt, belső keresése és feldolgozása vektoradatbázisokkal és LLM-ekkel.' },
    { name: 'EGYEDI KÓD-ALAPÚ AUTOMATIZÁCIÓ', icon: 'terminal', color: 'var(--neon-cyan)', level: '0.98', desc: 'Python és C#/.NET alapú robusztus backendek, amelyek stabilabbak és biztonságosabbak a dobozos no-code eszközöknél.' },
    { name: 'ADATELEMZÉS & DÖNTÉSTÁMOGATÁS', icon: 'query_stats', color: 'var(--neon-magenta)', level: '0.90', desc: 'SQL, Power BI és Python (Pandas) riportok és kimutatások a pontos vezetői döntések támogatásához.' },
    { name: 'MÉRNÖKI & CAD/CAM INTEGRÁCIÓ', icon: 'precision_manufacturing', color: 'var(--plasma-green)', level: '0.94', desc: 'Műszaki tervezőrendszerek (AutoCAD) és vállalatirányítási folyamatok közvetlen szoftveres összekapcsolása.' }
  ];

  const displaySkills = (skills && skills.length > 0) ? skills : defaultSkills;

  return (
    <section className="py-24 relative overflow-hidden bg-background scroll-mt-24" id="arsenal">
      <div className="container mx-auto px-6">
        <div className="mb-20 flex flex-col md:flex-row justify-between items-end gap-6">
          <div className="border-l-4 border-neonCyan pl-8">
            <span className="font-mono text-neonCyan text-xs font-black uppercase tracking-[0.5em]">// TECHNOLÓGIAI_ESZKÖZTÁR</span>
            <h2 className="text-5xl md:text-7xl font-headline font-black italic uppercase text-on-surface mt-2">Eszköztár.</h2>
          </div>
          <div className="font-mono text-[10px] text-slate-500 uppercase text-right">
            <span>SZAKMAI_FÓKUSZPONTOK</span><br />
            <span className="text-neonCyan animate-flicker">ÁLLAPOT: AKTÍV [{displaySkills.length} TERÜLET]</span>
          </div>
        </div>

        <motion.div 
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
          variants={containerVars}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          {displaySkills.map((skill) => (
            <motion.div 
              key={skill.id || skill.name}
              variants={itemVars}
              className="group relative bg-[var(--surface-panel)] p-8 border-2 dark:border-white/10 border-slate-900 transition-all duration-300 hover:shadow-[-5px_0_15px_rgba(0,251,251,0.2),5px_0_15px_rgba(255,0,255,0.2)] cursor-crosshair overflow-hidden shadow-[3px_3px_0_#0f172a] dark:shadow-none"
            >
              {/* Animated Background Pulse */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              
              {/* Corner Brackets */}
              <div className="corner-bracket-tl dark:text-white/10 text-slate-900 group-hover:text-neonCyan transition-colors"></div>
              <div className="corner-bracket-br dark:text-white/10 text-slate-900 group-hover:text-neonMagenta transition-colors"></div>
              
              <div className="flex items-start justify-between mb-8 relative z-10">
                <div className="p-3 dark:bg-white/5 bg-slate-100 group-hover:bg-neonCyan/10 transition-colors">
                  <span 
                    className="material-symbols-outlined text-4xl text-slate-400 group-hover:animate-pulse transition-all duration-700"
                    style={{ color: skill.color || 'var(--neon-cyan)' }}
                  >
                    {skill.icon || 'terminal'}
                  </span>
                </div>
                <div className="text-right font-mono">
                  <span className="block text-[10px] dark:text-slate-500 text-slate-400 uppercase font-bold">SZINT</span>
                  <span className="text-tertiary font-bold tracking-widest italic">{skill.level}</span>
                </div>
              </div>

              <h3 className="text-xl font-headline font-bold text-on-surface mb-2 uppercase tracking-wide group-hover:text-neonCyan transition-colors relative z-10">
                {skill.name}
              </h3>
              <p className="font-body text-xs dark:text-slate-400 text-slate-600 leading-relaxed mb-6 relative z-10 h-16 overflow-hidden">
                {skill.desc}
              </p>
              
              <div className="h-[1px] w-full dark:bg-white/5 bg-slate-200 relative overflow-hidden mt-auto">
                <motion.div 
                  initial={{ x: '-100%' }}
                  whileInView={{ x: '0%' }}
                  transition={{ duration: 1.5, ease: "circInOut" }}
                  className="absolute inset-0 bg-gradient-to-r from-neonCyan to-neonMagenta opacity-50"
                  style={{ width: `${parseFloat(skill.level || '0.9') * 100}%` }}
                />
              </div>

              {/* Distressed Metadata Overlays */}
              <div className="absolute bottom-2 right-2 font-mono text-[8px] opacity-0 group-hover:opacity-20 transition-opacity uppercase dark:text-slate-500 text-slate-400 pointer-events-none">
                {skill.name.split(' ')[0]} // MODUL_AKTÍV
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default Arsenal;
