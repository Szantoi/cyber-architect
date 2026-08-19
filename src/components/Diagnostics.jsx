import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const Diagnostics = () => {
  const [logs, setLogs] = useState([
    '[OK] CÉGES FOLYAMATOK FELTÉRKÉPEZÉSE...',
    '[OK] ADATVÉDELEM ÉS BELSŐ HOZZÁFÉRÉSEK ELLENŐRZÉSE...',
    '[OK] EGYEDI API ÉS RAG PIPELINE ÉPÍTÉSE...'
  ]);

  const logPool = [
    '[OK] MANUÁLIS_EXCEL_FOLYAMAT_KIVÁLTVA',
    '[OK] DOKUMENTUM_VEKTORIZÁLÁS_BEFEJEZVE',
    '[OK] ADATBÁZIS_SZINKRONIZÁCIÓ_AKTÍV',
    '[OK] BELSŐ_LLM_VÁLASZIDŐ_OPTIMALIZÁLVA',
    '[INFO] BIZTONSÁGOS_SZEREPKÖRALAPÚ_HOZZÁFÉRÉS',
    '[OK] MUNKATÁRSAK_BETANÍTÁSA_FOLYAMATBAN'
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setLogs(prev => {
        const nextLog = logPool[Math.floor(Math.random() * logPool.length)];
        const newLogs = [...prev.slice(-4), nextLog];
        return newLogs;
      });
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const containerVars = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2, delayChildren: 0.1 }
    }
  };

  const itemVars = {
    hidden: { opacity: 0, x: -20 },
    visible: { 
      opacity: 1, 
      x: 0,
      transition: { duration: 0.6, ease: "circOut" }
    }
  };

  return (
    <section className="py-24 bg-background relative overflow-hidden scroll-mt-24" id="diagnostics">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-0 w-[400px] h-[400px] bg-neonMagenta/5 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="container mx-auto px-6">
        <motion.div 
          className="grid lg:grid-cols-2 gap-16 items-center"
          variants={containerVars}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
        >
          <motion.div 
            variants={itemVars}
            className="relative bg-[var(--surface-panel)] border-2 dark:border-white/10 border-slate-900 rounded-none shadow-[4px_4px_0_#0f172a] dark:shadow-2xl overflow-hidden group terminal-glow"
          >
            {/* Tactical Terminal Header Bar */}
            <div className="dark:bg-slate-900 bg-slate-200 px-4 py-2 flex items-center justify-between border-b-2 dark:border-white/10 border-slate-900">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-2 h-2 rounded-full bg-neonCyan animate-flicker"></div>
                  <div className="w-2 h-2 rounded-full bg-neonMagenta"></div>
                  <div className="w-2 h-2 rounded-full bg-tertiary"></div>
                </div>
                <span className="font-mono text-[10px] dark:text-slate-400 text-slate-600 uppercase tracking-widest font-bold">FOLYAMAT_VEZÉRLŐ.LOG</span>
              </div>
              <div className="font-mono text-[9px] text-neonCyan font-bold">ÁLLAPOT: AKTÍV</div>
            </div>
            
            <div className="p-8 font-mono text-xs md:text-sm leading-relaxed relative min-h-[300px] flex flex-col">
              <div className="absolute top-2 right-4 text-neonCyan/40 text-[10px] font-bold">ÉLŐ_FOLYAMAT.NAPLÓ</div>
              
              <div className="flex-1 space-y-3">
                <AnimatePresence mode="popLayout">
                  {logs.map((log, i) => (
                    <motion.p 
                      key={`${log}-${i}`}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1 - (logs.length - 1 - i) * 0.2, x: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`${log.includes('[INFO]') ? 'text-neonMagenta' : 'text-neonCyan'} font-mono font-bold`}
                    >
                      {log}
                    </motion.p>
                  ))}
                </AnimatePresence>
                <div className="flex items-center gap-2">
                  <span className="text-neonCyan animate-pulse">&gt;</span>
                  <motion.span 
                    animate={{ opacity: [1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: "steps(2)" }}
                    className="inline-block w-2 h-4 bg-neonCyan"
                  />
                </div>
              </div>

              <div className="mt-8 pt-8 border-t dark:border-white/5 border-slate-200 grid grid-cols-2 gap-8">
                <div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="dark:text-slate-500 text-slate-500 text-[10px] uppercase tracking-wider font-bold">FELDOLGOZÁSI IDŐ</span>
                    <span className="text-tertiary font-bold animate-flicker">0.4 MP</span>
                  </div>
                  <div className="h-1 dark:bg-white/5 bg-slate-200 overflow-hidden">
                    <motion.div 
                      animate={{ width: ['40%', '45%', '42%'] }}
                      transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                      className="h-full bg-neonCyan"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-end mb-1">
                    <span className="dark:text-slate-500 text-slate-500 text-[10px] uppercase tracking-wider font-bold">ADATBIZTONSÁG</span>
                    <span className="text-tertiary font-bold">100% ZÁRT</span>
                  </div>
                  <div className="h-1 dark:bg-white/5 bg-slate-200 overflow-hidden">
                    <motion.div 
                      animate={{ width: ['70%', '75%', '72%'] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                      className="h-full bg-neonMagenta"
                    />
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          <div className="space-y-12">
            {[
              { id: '01', title: 'Megértés & Folyamatvizsgálat', color: 'var(--neon-cyan)', text: 'Nem kezdek el vakon kódolni. Először feltárjuk a céges működés szűk keresztmetszeteit, a manuális feladatokat és az összekapcsolandó rendszereket.' },
              { id: '02', title: 'Biztonságos Tervezés & Kód', color: 'var(--neon-magenta)', text: 'Python és .NET alapú megbízható megoldásokat és zárt belső AI-t építünk, így az üzleti adatok garantáltan a cégen belül maradnak.', offset: 'ml-0 md:ml-12' },
              { id: '03', title: 'Gyakorlati Bevezetés & Oktatás', color: 'var(--plasma-green)', text: 'Nem hagyom magára a csapatot az új szoftverrel. A rendszert beüzemeljük, a munkatársakat betanítjuk, és biztosítjuk a zökkenőmentes használatot.', offset: 'ml-0 md:ml-24' }
            ].map((item) => (
              <motion.div 
                key={item.id} 
                variants={itemVars}
                className={`flex items-start gap-8 ${item.offset || ''} group p-4 border border-transparent dark:hover:border-white/5 hover:border-slate-200 transition-colors cursor-default`}
              >
                <div 
                  style={{ backgroundColor: item.color }} 
                  className="text-black w-14 h-14 shrink-0 flex items-center justify-center font-black italic rounded-none relative overflow-hidden shadow-sm"
                >
                  <span className="relative z-10 font-mono text-lg">{item.id}</span>
                  <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                </div>
                <div>
                  <h3 style={{ color: item.color }} className="text-2xl font-headline font-black uppercase tracking-tight">
                    {item.title}
                  </h3>
                  <p className="dark:text-slate-400 text-slate-600 mt-2 font-body text-sm leading-relaxed max-w-sm">
                    {item.text}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default Diagnostics;
