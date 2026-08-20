import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Cpu, 
  Database, 
  ShieldCheck, 
  Layers, 
  Network, 
  Server, 
  ArrowRight, 
  CheckCircle2, 
  Terminal, 
  FileText, 
  GitBranch, 
  Sparkles, 
  Lock, 
  Code2,
  Workflow,
  Radio,
  FolderOpen,
  Eye,
  KeyRound,
  Zap,
  Activity,
  HardDrive
} from 'lucide-react';
import { Link } from 'react-router-dom';
import CyberSEO from '../common/CyberSEO';

// ============================================================================
// 1. PIPELINE STEPS DATA (HOW CYBER-ARCHITECT PLATFORM WORKS)
// ============================================================================
const PIPELINE_STEPS = [
  {
    id: 'step-1',
    stepNumber: '01',
    title: 'Kétirányú Google Drive Szinkronizáció',
    subtitle: 'Google Service Account & Frontmatter Parser',
    icon: FolderOpen,
    color: 'text-neonCyan',
    borderColor: 'border-neonCyan',
    glowColor: 'shadow-[0_0_15px_rgba(0,255,255,0.2)]',
    description: 'A rendszer a háttérben biztonságos Google Drive Service Account API-n keresztül szinkronizálja a mérnöki cikkeket és műszaki rajzokat. A YAML frontmatter fejlécből automatikusan kinyeri a kategóriákat, metaadatokat, iparági és technológiai címkéket.',
    techBadges: ['Google Drive API v3', 'Service Account JWT', 'YAML Frontmatter', 'SHA-256 Hash'],
    codeSnippet: `// 1. Automatizált Kétirányú Drive Szinkronizáció
const syncDriveFolder = async (folderId) => {
  const files = await drive.files.list({
    q: \`'\${folderId}' in parents and mimeType = 'text/markdown'\`,
    fields: 'files(id, name, md5Checksum, modifiedTime)'
  });
  return parseMarkdownFrontmatter(files);
};`
  },
  {
    id: 'step-2',
    stepNumber: '02',
    title: 'Helyi Szövegfeldolgozás & Zero Data Leakage',
    subtitle: '100% Zárt Adatvédelem & Belső Vektorizálás',
    icon: ShieldCheck,
    color: 'text-plasmaGreen',
    borderColor: 'border-plasmaGreen',
    glowColor: 'shadow-[0_0_15px_rgba(128,255,0,0.2)]',
    description: 'A feltöltött céges dokumentumok, árajánlatok és gyártási receptek SOHA nem jutnak ki nyilvános felhőbe. A szövegek feldolgozása, szemantikai darabolása (chunking) és vektoros indexelése szigorúan a helyi elszeparált környezetben történik.',
    techBadges: ['Local Chunking', 'Air-Gap Isolation', 'Zero Cloud Leakage', 'GDPR Ready'],
    codeSnippet: `// 2. Biztonságos Helyi Szövegfeldolgozás
const processLocalChunks = (markdownContent) => {
  // Szigorúan helyi tokenizálás és darabolás
  const chunks = semanticSplit(markdownContent, { maxTokens: 512, overlap: 64 });
  return chunks.map(chunk => generateLocalEmbedding(chunk));
};`
  },
  {
    id: 'step-3',
    stepNumber: '03',
    title: 'SQLite WAL & FTS5 Hibrid Keresőmotor',
    subtitle: 'Nagysebességű Szöveges + Vektoros Keresés',
    icon: Database,
    color: 'text-neonMagenta',
    borderColor: 'border-neonMagenta',
    glowColor: 'shadow-[0_0_15px_rgba(255,0,255,0.2)]',
    description: 'A háttértároló egy optimalizált SQLite WAL (Write-Ahead Logging) motor FTS5 teljes szöveges kereséssel és 128-dimenziós vektor hasonlósági számítással. Kizárólag szigorúan típusosított, paraméterezett prepared statementek futnak (Zero Raw Query szabály).',
    techBadges: ['SQLite 3 WAL Mode', 'FTS5 BM25 Ranking', '128-Dim Vector Cosine', 'Zero Raw Query'],
    codeSnippet: `// 3. Hibrid FTS5 + Vektor Prepared Query
const searchHybrid = db.prepare(\`
  SELECT b.id, b.slug, b.title, rank
  FROM blog_posts_fts(?) fts
  JOIN blog_posts b ON b.id = fts.rowid
  ORDER BY rank MATCH LIMIT 10
\`);`
  },
  {
    id: 'step-4',
    stepNumber: '04',
    title: 'Kaszkádolt Dimenziós Taxonómia Motor',
    subtitle: 'Monohierarchia vs. Polihierarchia Pivotálás',
    icon: Network,
    color: 'dark:text-cyan-400 text-cyan-800',
    borderColor: 'border-cyan-400',
    glowColor: 'shadow-[0_0_15px_rgba(34,211,238,0.2)]',
    description: 'A felhasználó valós időben pivotálhat a monohierarchikus (Google Drive 1:1) és a polihierarchikus (több-szülős témakörök, iparágak, technológiák) fastruktúra között. A 4-dimenziós szűrők kaszkádolva csak az életképes opciókat mutatják élő darabszámokkal.',
    techBadges: ['Multi-Parent Mesh', 'Cascading Facets', 'Dead-End Prevention', 'Live Counts'],
    codeSnippet: `// 4. Kaszkádolt Taxonómia & Pivot Motor
export const getTreeFolders = (item, pivotMode) => {
  if (pivotMode === 'drive') return [item.drive_folder];
  if (pivotMode === 'topic') return getMultiCategoriesForDoc(item);
  if (pivotMode === 'industry') return item.dimensions?.iparag || ['Általános'];
  if (pivotMode === 'tech') return item.dimensions?.technologia || ['Kód'];
};`
  },
  {
    id: 'step-5',
    stepNumber: '05',
    title: 'PWA Offline Cache & Valós Idejű SSE Stream',
    subtitle: 'Progressive Web App & Server-Sent Events',
    icon: Radio,
    color: 'dark:text-yellow-400 text-amber-800',
    borderColor: 'border-yellow-400',
    glowColor: 'shadow-[0_0_15px_rgba(250,204,21,0.2)]',
    description: 'A teljes tudástár internetkapcsolat nélkül is azonnal olvasható a Service Worker intelligens cache rétegének köszönhetően. Online állapotban a Server-Sent Events (SSE) stream valós időben közvetíti az adminisztrációs és frissítési eseményeket.',
    techBadges: ['Service Worker v1', 'Cache-First Stale-While-Revalidate', 'SSE EventStream', 'Installable PWA'],
    codeSnippet: `// 5. Realtime SSE Stream & Offline Service Worker
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});`
  },
  {
    id: 'step-6',
    stepNumber: '06',
    title: 'Overseer Adminisztráció & 2FA TOTP Kapu',
    subtitle: 'RFC 6238 Időalapú Kétlépcsős Hitelesítés',
    icon: Lock,
    color: 'dark:text-rose-400 text-rose-800',
    borderColor: 'border-rose-400',
    glowColor: 'shadow-[0_0_15px_rgba(251,113,133,0.2)]',
    description: 'A belső adminisztrációs felületet szigorú PIN-kód és RFC 6238 szabványos TOTP 2FA (Google Authenticator) védi. A bejelentkezési kísérleteket Honeypot bot-csapda, brute-force védelem és strukturált biztonsági audit naplózás felügyeli.',
    techBadges: ['RFC 6238 TOTP 2FA', 'Honeypot Bot Trap', 'Security Audit Trail', 'Rate Limiting'],
    codeSnippet: `// 6. RFC 6238 TOTP 2FA Hitelesítés
const verify2FA = (secret, userToken) => {
  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: userToken,
    window: 1
  });
};`
  }
];

// ============================================================================
// SYSTEM ARCHITECTURE VIEW (DEDICATED BLUEPRINT PAGE)
// ============================================================================
const SystemArchitectureView = () => {
  const [selectedStep, setSelectedStep] = useState(PIPELINE_STEPS[0]);

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] pt-24 pb-20 font-body transition-colors duration-200">
      <CyberSEO 
        title="Rendszerarchitektúra & Működési Terv // Szántói Gábor"
        description="Részletes rendszerterv és interaktív folyamatábra: hogyan működik a zárt vállalati RAG AI és a polihierarchikus tudástár motorja."
      />

      <div className="max-w-7xl mx-auto px-6 font-mono">
        
        {/* ── Top Tactical Breadcrumb & Header ── */}
        <div className="border-2 dark:border-white/10 border-slate-900 p-8 mb-12 dark:bg-slate-950/60 bg-white shadow-[6px_6px_0_#0f172a] dark:shadow-[0_0_25px_rgba(0,255,255,0.08)] relative overflow-hidden">
          <div className="flex items-center gap-2 text-[10px] text-neonCyan font-black uppercase tracking-widest mb-3">
            <span className="w-2.5 h-2.5 bg-neonCyan inline-block animate-pulse" />
            <span>CYBER-ARCHITECT // SYSTEM ARCHITECTURE & BLUEPRINT SPECIFICATION</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-headline font-black italic uppercase text-slate-900 dark:text-white mb-4 tracking-tight leading-tight">
            Hogyan Működik a Rendszer? <br className="hidden sm:block" />
            <span className="text-neonCyan">Zárt Vállalati RAG & Architektúra Blueprint.</span>
          </h1>

          <p className="font-body dark:text-slate-300 text-slate-700 text-sm md:text-base max-w-3xl leading-relaxed">
            Ez a technikai leírás részletesen bemutatja a platform <strong>belső rétegződését, biztonsági architektúráját és adatfolyamát</strong>. A Google Drive titkosított szinkronizációjától a helyi vektoros keresőmotoron és kaszkádolt taxonómián át a kétlépcsős (2FA) védvonalig.
          </p>

          <div className="flex flex-wrap gap-4 mt-6 pt-6 border-t dark:border-white/10 border-slate-200 text-xs">
            <a href="#pipeline" className="px-4 py-2 bg-neonCyan text-black font-headline font-black uppercase hover:bg-white transition-colors cursor-pointer">
              1. RAG FOLYAMATÁBRA ↓
            </a>
            <a href="#topology" className="px-4 py-2 border-2 dark:border-neonMagenta border-fuchsia-800 dark:text-neonMagenta text-fuchsia-950 font-headline font-black uppercase hover:bg-neonMagenta hover:text-white transition-all cursor-pointer">
              2. RENDSZER-TOPOLÓGIA ↓
            </a>
            <a href="#security" className="px-4 py-2 border-2 dark:border-plasmaGreen border-emerald-800 dark:text-plasmaGreen text-emerald-900 font-headline font-black uppercase hover:bg-plasmaGreen hover:text-black transition-all cursor-pointer">
              3. BIZTONSÁGI GARANCIÁK ↓
            </a>
            <Link to="/knowledge" className="px-4 py-2 dark:bg-slate-900 bg-slate-100 border border-slate-400 font-headline font-black uppercase hover:border-neonCyan transition-all cursor-pointer">
              TUDÁSTÁR ÉLES TESZT →
            </Link>
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* SZEKCIÓ 1: INTERAKTÍV RAG ARCHITEKTÚRA FOLYAMATÁBRA           */}
        {/* ───────────────────────────────────────────────────────────── */}
        <section id="pipeline" className="mb-20 scroll-mt-28">
          <div className="flex items-center justify-between mb-6 pb-3 border-b-2 dark:border-white/10 border-slate-900">
            <div className="flex items-center gap-3">
              <Workflow size={22} className="text-neonCyan animate-pulse" />
              <h2 className="text-xl md:text-2xl font-headline font-black uppercase italic text-slate-900 dark:text-white tracking-wider">
                1. Rendszer Működési Folyamat // Pipeline
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              [INTERAKTÍV LÉPÉSEK: KATTINTS A RÉSZLETEKHEZ]
            </span>
          </div>

          {/* Pipeline Step Navigator */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            {PIPELINE_STEPS.map((step) => {
              const Icon = step.icon;
              const isSelected = selectedStep.id === step.id;
              return (
                <button
                  key={step.id}
                  onClick={() => setSelectedStep(step)}
                  className={`p-3 border-2 text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? `${step.borderColor} ${step.glowColor} dark:bg-slate-900 bg-cyan-50 shadow-[3px_3px_0_#0f172a]`
                      : 'dark:border-white/10 border-slate-300 dark:bg-slate-950/40 bg-white hover:border-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] mb-2 font-bold">
                    <span className={step.color}>{step.stepNumber}</span>
                    <Icon size={14} className={step.color} />
                  </div>
                  <span className="text-xs font-headline font-black uppercase text-slate-900 dark:text-white line-clamp-2">
                    {step.title}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Active Step Inspector Card */}
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedStep.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={`p-6 md:p-8 border-2 ${selectedStep.borderColor} dark:bg-slate-950/80 bg-white shadow-[6px_6px_0_#0f172a] dark:shadow-none`}
            >
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b dark:border-white/10 border-slate-200">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 bg-black/40 border ${selectedStep.borderColor}`}>
                    <selectedStep.icon size={22} className={selectedStep.color} />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest block">
                      LÉPÉS {selectedStep.stepNumber} // {selectedStep.subtitle}
                    </span>
                    <h3 className="text-xl md:text-2xl font-headline font-black uppercase text-slate-900 dark:text-white">
                      {selectedStep.title}
                    </h3>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  {selectedStep.techBadges.map((badge) => (
                    <span key={badge} className="px-2 py-0.5 dark:bg-slate-900 bg-slate-100 border border-slate-300 dark:border-white/15 font-bold dark:text-slate-300 text-slate-800">
                      #{badge}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-xs text-neonCyan font-bold uppercase mb-2">MŰKÖDÉSI LEÍRÁS:</h4>
                  <p className="font-body text-slate-700 dark:text-slate-300 text-sm leading-relaxed mb-6">
                    {selectedStep.description}
                  </p>

                  <div className="p-4 bg-slate-100 dark:bg-black/50 border border-slate-300 dark:border-white/10 text-xs space-y-2">
                    <div className="flex items-center gap-2 text-plasmaGreen font-bold">
                      <CheckCircle2 size={14} />
                      <span>GARANTÁLT RENDSZER-TULAJDONSÁGOK:</span>
                    </div>
                    <ul className="list-disc list-inside text-[11px] text-slate-600 dark:text-slate-400 space-y-1 font-mono">
                      <li>Nulla felhős adatszivárgás (Zero Cloud Data Leakage)</li>
                      <li>Determinisztikus, SQL injection-mentes prepared query-k</li>
                      <li>Kétlépcsős integritás-ellenőrzés SHA-256 lenyomattal</li>
                    </ul>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs text-neonMagenta font-bold uppercase mb-2 flex items-center gap-1.5">
                    <Code2 size={13} />
                    <span>IMPLEMENTÁCIÓS KÓDMINTA:</span>
                  </h4>
                  <pre className="p-4 bg-[#050814] border-2 border-slate-800 text-slate-200 text-xs font-mono overflow-x-auto leading-relaxed scrollbar-thin">
                    <code>{selectedStep.codeSnippet}</code>
                  </pre>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </section>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* SZEKCIÓ 2: RENDSZER-TOPOLÓGIA & MODULOK                       */}
        {/* ───────────────────────────────────────────────────────────── */}
        <section id="topology" className="mb-20 scroll-mt-28">
          <div className="flex items-center justify-between mb-6 pb-3 border-b-2 dark:border-white/10 border-slate-900">
            <div className="flex items-center gap-3">
              <Layers size={22} className="text-neonMagenta animate-pulse" />
              <h2 className="text-xl md:text-2xl font-headline font-black uppercase italic text-slate-900 dark:text-white tracking-wider">
                2. Rendszer-Topológia & Rétegződés
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              [CLEAN ARCHITECTURE 3-TIER MODELL]
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Presentation Layer */}
            <div className="p-6 border-2 dark:border-cyan-500/40 border-cyan-800 dark:bg-slate-950/40 bg-white shadow-[4px_4px_0_#0f172a]">
              <div className="flex items-center gap-2 text-neonCyan font-bold text-xs uppercase mb-3">
                <Activity size={16} />
                <span>1. PRESENTATION LAYER</span>
              </div>
              <h3 className="text-lg font-headline font-black uppercase dark:text-white text-slate-900 mb-2">
                React 18 & Unified Vault Engine
              </h3>
              <p className="font-body text-xs dark:text-slate-300 text-slate-700 leading-relaxed mb-4">
                A Blog és Tudástár ugyanarra a tesztelt <code className="text-neonCyan">TacticalVaultExplorer</code> magra épül. Reszponzív, fluid Framer Motion animációk, PWA offline Service Worker és dinamikusan kaszkádolt szűrőmotor.
              </p>
              <div className="flex flex-wrap gap-1 text-[9px] font-mono">
                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-white/10">React 18</span>
                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-white/10">TailwindCSS</span>
                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-white/10">Framer Motion</span>
                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-white/10">Service Worker</span>
              </div>
            </div>

            {/* Application & API Layer */}
            <div className="p-6 border-2 dark:border-fuchsia-500/40 border-fuchsia-800 dark:bg-slate-950/40 bg-white shadow-[4px_4px_0_#0f172a]">
              <div className="flex items-center gap-2 text-neonMagenta font-bold text-xs uppercase mb-3">
                <Server size={16} />
                <span>2. API & SERVICE LAYER</span>
              </div>
              <h3 className="text-lg font-headline font-black uppercase dark:text-white text-slate-900 mb-2">
                Express Backend & SSE Stream
              </h3>
              <p className="font-body text-xs dark:text-slate-300 text-slate-700 leading-relaxed mb-4">
                Szigorúan típusosított REST végpontok, valós idejű Server-Sent Events (SSE) eseményfolyam, RFC 6238 TOTP kétlépcsős hitelesítés, Honeypot botcsapda és strukturált biztonsági audit naplózás.
              </p>
              <div className="flex flex-wrap gap-1 text-[9px] font-mono">
                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-white/10">Node.js Express</span>
                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-white/10">Realtime SSE</span>
                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-white/10">TOTP 2FA</span>
                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-white/10">Security Audit</span>
              </div>
            </div>

            {/* Storage & RAG Layer */}
            <div className="p-6 border-2 dark:border-emerald-500/40 border-emerald-800 dark:bg-slate-950/40 bg-white shadow-[4px_4px_0_#0f172a]">
              <div className="flex items-center gap-2 text-plasmaGreen font-bold text-xs uppercase mb-3">
                <HardDrive size={16} />
                <span>3. DATA & RAG ENGINE</span>
              </div>
              <h3 className="text-lg font-headline font-black uppercase dark:text-white text-slate-900 mb-2">
                SQLite WAL & FTS5 Vector
              </h3>
              <p className="font-body text-xs dark:text-slate-300 text-slate-700 leading-relaxed mb-4">
                SQLite 3 Write-Ahead Logging módban. FTS5 BM25 teljes szöveges keresés és 128-dimenziós vektor hasonlósági szűrés. Kizárólag paraméterezett prepared statementek futnak (Zero Raw Query garancia).
              </p>
              <div className="flex flex-wrap gap-1 text-[9px] font-mono">
                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-white/10">SQLite WAL</span>
                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-white/10">FTS5 BM25</span>
                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-white/10">Zero Raw Query</span>
                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-900 border border-slate-300 dark:border-white/10">SHA-256 Sync</span>
              </div>
            </div>
          </div>
        </section>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* SZEKCIÓ 3: BIZTONSÁGI GARANCIÁK & QUALITY STANDARDS           */}
        {/* ───────────────────────────────────────────────────────────── */}
        <section id="security" className="mb-12 scroll-mt-28">
          <div className="flex items-center justify-between mb-6 pb-3 border-b-2 dark:border-white/10 border-slate-900">
            <div className="flex items-center gap-3">
              <ShieldCheck size={22} className="text-plasmaGreen animate-pulse" />
              <h2 className="text-xl md:text-2xl font-headline font-black uppercase italic text-slate-900 dark:text-white tracking-wider">
                3. Biztonsági & Minőségi Garanciák
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              [QUALITY.MD & ZERO RAW QUERY STANDARDS]
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 border-2 dark:border-white/10 border-slate-900 dark:bg-slate-950/40 bg-white">
              <h3 className="text-base font-headline font-black uppercase text-neonCyan mb-3 flex items-center gap-2">
                <Lock size={16} />
                <span>ADATVÉDELMI & BIZTONSÁGI VÉDVONAL</span>
              </h3>
              <ul className="space-y-2.5 text-xs font-body text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-plasmaGreen font-bold font-mono">✓</span>
                  <span><strong>Zero Cloud Data Leakage:</strong> A dokumentumok, felmérések és kódminták nem jutnak ki nyilvános LLM felhőkbe.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-plasmaGreen font-bold font-mono">✓</span>
                  <span><strong>Zero Raw Query Szabály:</strong> Tilos tetszőleges nyers SQL futtatása; minden adatbázis-művelet szigorúan típusosított prepared statement.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-plasmaGreen font-bold font-mono">✓</span>
                  <span><strong>Kétlépcsős 2FA Védelem:</strong> RFC 6238 TOTP Google Authenticator kapu védi a belső vezérlőpultot.</span>
                </li>
              </ul>
            </div>

            <div className="p-6 border-2 dark:border-white/10 border-slate-900 dark:bg-slate-950/40 bg-white">
              <h3 className="text-base font-headline font-black uppercase text-neonMagenta mb-3 flex items-center gap-2">
                <CheckCircle2 size={16} />
                <span>MINŐSÉGBIZTOSÍTÁS & TESZTELTSÉG</span>
              </h3>
              <ul className="space-y-2.5 text-xs font-body text-slate-700 dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-plasmaGreen font-bold font-mono">✓</span>
                  <span><strong>68 Vitest Automata Teszt:</strong> API, autentikáció, SSE stream, DB integritás és taxonómia 100%-os lefedettséggel.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-plasmaGreen font-bold font-mono">✓</span>
                  <span><strong>10 Playwright E2E Böngészős Teszt:</strong> Valós böngészőben ellenőrzött felhasználói élmény és keresés.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-plasmaGreen font-bold font-mono">✓</span>
                  <span><strong>PWA Offline Képesség:</strong> Hálózati kimaradás esetén is azonnal olvasható helyi tudásbázis.</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
};

export default SystemArchitectureView;
