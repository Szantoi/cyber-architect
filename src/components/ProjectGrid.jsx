import React, { useState, useEffect, useEffectEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Briefcase, 
  Cpu, 
  HelpCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Lightbulb, 
  ExternalLink, 
  X, 
  Code2, 
  FolderOpen, 
  Sparkles,
  GitBranch,
  ShieldCheck,
  Zap,
  Layers,
  Terminal,
  Activity
} from 'lucide-react';
import { useContent } from '../context/ContentContext';

const TextDecrypt = ({ text, isHovered }) => {
  const [displayText, setDisplayText] = useState(text);
  const chars = '01ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ';

  const handleScramble = useEffectEvent((iterations) => {
    setDisplayText(
      text.split('').map((char, index) => {
        if (index < iterations) return text[index];
        
        const distance = index - iterations;
        if (distance < 3) {
          return chars[Math.floor(Math.random() * 10)];
        }
        if (distance < 8) {
          return chars[Math.floor(Math.random() * chars.length)];
        }
        return ".";
      }).join('')
    );
  });

  useEffect(() => {
    let interval = null;
    
    if (isHovered) {
      let iteration = 0;
      interval = setInterval(() => {
        handleScramble(iteration);
        iteration += 0.8;
        if (iteration >= text.length) {
          clearInterval(interval);
          setDisplayText(text);
        }
      }, 20);
    } else {
      setDisplayText(text);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isHovered, text]);

  return (
    <span className="inline-block relative">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">{displayText}</span>
    </span>
  );
};

const CornerBracket = ({ position = "tl", color = "text-white/20" }) => {
  const isTop = position.includes("t");
  const isLeft = position.includes("l");
  
  return (
    <div 
      className={`absolute w-3 h-3 pointer-events-none transition-colors duration-300 ${color} ${
        isTop ? "top-2" : "bottom-2"
      } ${
        isLeft ? "left-2" : "right-2"
      } ${
        isTop && isLeft ? "border-t-2 border-l-2" : ""
      } ${
        isTop && !isLeft ? "border-t-2 border-r-2" : ""
      } ${
        !isTop && isLeft ? "border-b-2 border-l-2" : ""
      } ${
        !isTop && !isLeft ? "border-b-2 border-r-2" : ""
      }`}
    />
  );
};

// ============================================================================
// 1. HR/CEO & TECH/ARCHITECT DUAL DATABASE
// ============================================================================
const ENRICHED_PROJECTS = [
  {
    id: "PRJ_01",
    title: "SZANTOI.HU // CYBER-ARCHITECT",
    humanTitle: "SpaceOS Nexus Web Motor & Zárt Vállalati AI Tudástár",
    simpleDescription: "A SpaceOS Nexus elveire épülő, élesben működő webes tudás- és RAG motor: zárt belső adatvédelem, többszintű memóriakezelés és polihierarchikus tudásháló.",
    problemSolved: "A cégek szeretnék használni a mesterséges intelligencia előnyeit, de féltik a bizalmas adataikat a nyilvános felhőtől, és a munkatársak elszórt fájlokban vesznek el.",
    businessValue: "Éles referencia-implementáció: bizonyítja a Nexus elvek gyakorlati erejét. 100%-ban helyi zárt keresés, forrásigazolt válaszadás, nulla adatvesztés és villámgyors PWA működés.",
    techDeepDive: "A SpaceOS Nexus architektúra-elvek éles webes megvalósítása: React 18 + Node.js Express Clean Architecture rétegződés. Többszintű memória és indexelés (SQLite 3 WAL módban, FTS5 BM25 teljes szöveges és 128-dimenziós vektor hasonlósági keresés, Zero Raw Query szabállyal). Kétirányú Google Drive JWT szinkronizáció SHA-256 integritással, RFC 6238 TOTP 2FA adminisztrációs kapu, valós idejű SSE eseményfolyam és Service Worker PWA offline tudásbázis.",
    targetAudience: "Vállalatvezetők, CTO-k, Mérnökök, Irodai Csapatok",
    img: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=1200&auto=format&fit=crop",
    tags: ["NEXUS ELVEK ÉLESBEN", "REACT 18", "SQLITE WAL (ZERO RAW QUERY)", "LOCAL RAG & VECTOR", "PWA OFFLINE", "TOTP 2FA"],
    status: "ÉLES RENDSZER (LIVE PRODUCTION)",
    addr: "0x01",
    sec_auth: "LIVE PRODUCTION",
    github_url: "/knowledge",
    knowledge_url: "/knowledge/szantoi-cyber-architect-zart-rag-platform",
    sort_order: 1
  },
  {
    id: "PRJ_02",
    title: "NEXUS // KNOWLEDGE-SERVICE",
    humanTitle: "SpaceOS Multi-CLI Ágens-Flotta & Autonóm Rendszermotor",
    simpleDescription: "Több önálló parancssori (CLI) AI ágenscsapat és sziget közötti kommunikációt, tudásmegosztást és autonóm végrehajtási ciklusokat (Autonomous Loops) koordináló központi infrastruktúra.",
    problemSolved: "Az AI modellek önmagukban 'feledékenyek' és hajlamosak a hallucinációra; ha több ágens dolgozik egyszerre, nem ismerik a múltbéli döntéseket, szétesik a kontextus és nincs köztük strukturált munkamegosztás.",
    businessValue: "Iparág-agnosztikus autonóm munkavégzés: a szerepkör-alapú identitások, a többszintű memóriakezelés és a szigorú minőségi elvárások (QUALITY.md) révén az AI ágensek önállóan, minimális emberi beavatkozással és nulla hallucinációval oldanak meg összetett mérnöki feladatokat.",
    techDeepDive: "Express HTTP API + MCP (JSON-RPC) szerver egyetlen processzben. Multi-CLI ágens koordináció (Claude Code terminálok, tmux) és Multi-Island (szigetek közötti) elszeparált tudásáramlás. 125 regisztrált MCP tool contract-tesztekkel. Többszintű memóriakezelés (ChromaDB vektoros RAG helyi Xenova ONNX modellel + Neo4j GraphRAG szemantikus tudásgráf a függőségek és hatáselemzések feltárására). Kanonikus SQLite task-message-box és SSE wake-up értesítés, pipeline-automatizmusok (ütemezők, watcherek, review-folyamat, epic-routing) determinisztikus megállási feltételekkel (stopping conditions).",
    targetAudience: "Cégvezetők, CTO-k, Rendszerarchitektek, AI Automatizálási Mérnökök",
    img: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=1200&auto=format&fit=crop",
    tags: ["MULTI-CLI AGENTS", "AUTONOMOUS LOOPS", "MULTI-TIER MEMORY", "MCP (125 TOOLS)", "NEO4J GRAPHRAG", "MULTI-ISLAND"],
    status: "FEJLESZTÉSI LABOR",
    addr: "0x02",
    sec_auth: "GITHUB REPO",
    github_url: "https://github.com/Szantoi/nexus-dev",
    knowledge_url: "/knowledge/nexus-knowledge-service-multi-agent-flotta",
    sort_order: 2
  },
  {
    id: "PRJ_03",
    title: "SPACECAPTURE // AI DOC MOTOR",
    humanTitle: "Intelligens Dokumentum-Befogadó & Kézirat Olvasó",
    simpleDescription: "Automatikus adatrögzítő robot: kusza Excel táblákból, PDF-ekből és kézzel írt jegyzetekből azonnal tiszta adatbázis rekordot csinál.",
    problemSolved: "Az adminisztrátorok és mérnökök naponta órákat töltenek papírlapokról, kézzel írt jegyzetekből és össze-vissza formázott táblázatokból való kézi gépeléssel.",
    businessValue: "Kiváltja a fárasztó és hibaveszélyes kézi munkát. Akár kézírást vagy szkennelt számlát is azonnal szabványos, ellenőrzött adatrekorddá alakít.",
    techDeepDive: "Python + OCR Pipeline + LLM szemantikai entitás-kinyerő és mezőnormalizáló motor. Multi-formátumú feldolgozó (Excel, CSV, digitális PDF, szkennelt kép, kézirat). Determinisztikus adatvalidáció és hibatűrő import-pipeline belső zárt hálózati működéssel.",
    targetAudience: "Pénzügy, Logisztika, Ügyfélszolgálat, Gyártáselőkészítés",
    img: "https://images.unsplash.com/photo-1618042164219-62c820f10723?q=80&w=1200&auto=format&fit=crop",
    tags: ["PYTHON", "OCR", "LLM ENTITY PARSER", "PANDAS", "FASTAPI"],
    status: "FEJLESZTÉSI LABOR",
    addr: "0x03",
    sec_auth: "GITHUB REPO",
    github_url: "https://github.com/Szantoi/spaceos-doccapture-engine",
    knowledge_url: "/knowledge/spaceos-doccapture-engine-dokumentum-normalizalo",
    sort_order: 3
  },
  {
    id: "PRJ_04",
    title: "JOINERYTECH // FAIPARI SAAS & ERP VÁZ",
    humanTitle: "Moduláris Faipari ERP & Gyorsan Adaptálható Kódalap",
    simpleDescription: "A SpaceOS alapú általános ERP vázra épülő faipari vállalatirányítási platform, amely tesztelt, moduláris kódalapot biztosít egyedi vállalati rendszerek gyors és költséghatékony kiépítéséhez.",
    problemSolved: "Egyedi gyártási szoftverek nulláról való fejlesztése drága, lassú és kockázatos. A dobozos ERP rendszerek viszont rugalmatlanok és nem illeszkednek a gyártó cégek valódi folyamataihoz.",
    businessValue: "Drasztikusan lerövidíti a piacra lépési időt: a meglévő, tesztelt .NET 8 + React 18 ERP kódalap révén egyedi ügyféligény esetén a rendszer azonnal, minimális költséggel és kockázat nélkül adaptálható.",
    techDeepDive: "SpaceOS általános ERP Core Framework + Faipari vertikális bővítmény. .NET 8 moduláris Kernel + Node.js 22 Orchestrator mikroszolgáltatás architektúra. Modulok: CRM (Lead → Order állapotgép), Kontrolling (EAC & Költségvariancia), Raktár, Karbantartás, QA, EHS, DMS. PostgreSQL Row-Level Security (RLS) több-bérlős biztonsági izolációval és React 18 TypeScript frontend OpenAPI (Orval) kliensgenerálással.",
    targetAudience: "Gyártó Cégvezetők, CTO-k, Üzemvezetők, Vállalati Rendszerintegrátorok",
    img: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=1200&auto=format&fit=crop",
    tags: ["SPACEOS ERP CORE", ".NET 8 (C#)", "GYORS ADAPTÁLHATÓSÁG", "POSTGRESQL + RLS", "REACT 18", "OPENAPI"],
    status: "FEJLESZTÉSI LABOR",
    addr: "0x04",
    sec_auth: "GITHUB REPO",
    github_url: "https://github.com/Szantoi/joinerytech-platform",
    knowledge_url: "/knowledge/joinerytech-platform-faipari-erp-vaz",
    sort_order: 4
  },
  {
    id: "PRJ_05",
    title: "JOINERYTECH // MCP SERVER (NEXUS ELŐD)",
    humanTitle: "A Nexus Elődje: JoineryTech AI Ágens-Vezérlő & MCP Szerver",
    simpleDescription: "A SpaceOS Nexus közvetlen technológiai elődje: az első dedikált Express/TypeScript MCP szerver a JoineryTech AI ágensek szerepköreinek, eszközkészletének (RBAC) és biztonsági korlátainak vezérlésére.",
    problemSolved: "Az AI ágensek ellenőrizetlenül hozzáférhettek nem nekik való eszközökhöz vagy hibás munkafolyamat-állapotba kerülhettek szabályozott jogosultságkezelés és utólagos megfelelőség-ellenőrzés nélkül.",
    businessValue: "Megbízható, korlátozott AI működés: a szerepkör-alapú RBAC szűrés, a véges állapotgép (FSM) és az automatikus Guardrail LLM megfelelőség-ellenőrzés garantálja a szigorúan felügyelt ágens-viselkedést.",
    techDeepDive: "Express + TypeScript Model Context Protocol (MCP) szerver architektúra. RbacFilter réteg (csak a szerepkörhöz engedélyezett eszközök láthatók), DocumentServer (database/ sémák és tudásanyagok), GuardrailService (post-hoc LLM biztonsági és megfelelőségi validáció), WorkflowStateTracker (SQLite-alapú véges állapotgép / FSM), ResourceTracker artifact-nyilvántartó és ChromaDB vektortár a tudásbázis indexelésére.",
    targetAudience: "AI Rendszerarchitektek, Szoftvermérnökök, IT Biztonsági Felelősök",
    img: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?q=80&w=1200&auto=format&fit=crop",
    tags: ["NEXUS ELŐD", "TYPESCRIPT", "MCP PROTOCOL", "RBAC FILTER", "GUARDRAIL LLM", "FSM STATE TRACKER"],
    status: "FEJLESZTÉSI LABOR",
    addr: "0x05",
    sec_auth: "GITHUB REPO",
    github_url: "https://github.com/Szantoi/JoineryTech.McpServer",
    knowledge_url: "/knowledge/joinerytech-mcp-server-nexus-elod",
    sort_order: 5
  },
  {
    id: "PRJ_06",
    title: "DOORSTAR // NYÍLÁSZÁRÓ OFFICE CONTROL-PLANE",
    humanTitle: "Doorstar Kft. Egyedi Nyílászáró Office & Előkészítő Rendszer",
    simpleDescription: "Ügyfélspecifikus Office és előkészítő vezérlőpult a JoineryTech ökoszisztémában: sales árajánlatok, helyszíni felmérések, műszaki tervek és szerződéses bizonyítékok (Evidence) kezelése.",
    problemSolved: "Az egyedi nyílászáróknál a helyszíni felmérési adatok, a módosított vevői igények és az üzemi gyártási rajzok elcsúszása drága hibákhoz és felesleges selejthez vezet az üzemben.",
    businessValue: "Kristálytiszta műszaki felelősségmegosztás: az Office és az előkészítés rétege ellenőrzött evidence-szerződésekkel adja át a munkacsomagokat a JoineryTech Plant üzemnek, megelőzve az elgépeléseket és selejtképződést.",
    techDeepDive: "Ügyfélspecifikus Control-Plane architektúra. Frontend (src/uzemi-tabla-web): React 18 Sales, felmérés és műszaki projektfelületek. Backend (src/production-service): Node.js + PostgreSQL + Prisma ORM elkülönített adatbázis-sémával a megőrizendő történeti és evidence rekordokhoz. MCP (src/doorstar-production-mcp): faipari search_knowledge bridge és statikus műszaki tudáskártyák.",
    targetAudience: "Nyílászáró Értékesítők, Műszaki Előkészítők, Építészek, Gyártásvezetők",
    img: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1200&auto=format&fit=crop",
    tags: ["OFFICE CONTROL-PLANE", "NODE.JS", "REACT 18", "POSTGRESQL + PRISMA", "EVIDENCE CONTRACTS", "MCP BRIDGE"],
    status: "FEJLESZTÉSI LABOR",
    addr: "0x06",
    sec_auth: "GITHUB REPO",
    github_url: "https://github.com/Szantoi/doorstar-instance",
    knowledge_url: "/knowledge/doorstar-instance-nyilaszar-office-control-plane",
    sort_order: 6
  },
  {
    id: "PRJ_07",
    title: "CABINETBUILDER // AUTOCAD 2025 PLUGIN",
    humanTitle: "AutoCAD 2025 Korpuszbútor-Tervező & CAM/CNC Generátor",
    simpleDescription: "AutoCAD 2025 beépülő modul (.NET C#), amely a 3D bútorrajzokból automatikusan kinyeri a méreteket, 2D műhelyrajzokat generál és előkészíti a CAM/CNC adatokat a lapszabász- és marógépekhez.",
    problemSolved: "A bútorgyártásban a 3D rajzok kézi méretezése, a darabjegyzékek (BOM) Excelbe gépelése és a CNC marási pontok manuális bevitele órákat visz el és állandó selejtkockázatot jelent.",
    businessValue: "1-kattintásos CAD → CAM átmenet: az automatizált blokk- és fóliakinyerés révén drasztikusan lerövidül a gyártáselőkészítés ideje és kizárhatók az emberi elgépelési hibák a CNC gépeken.",
    techDeepDive: "C# .NET / AutoCAD 2025 API & ObjectARX plugin architektúra. 4-rétegű Clean Architecture: CabinetBilder_UI (WPF kezelőfelület), CabinetBilder_Bll (geometriai és korpusz üzleti logika), CabinetBilder_Data (parametrikus bútor- és anyagsémák), CabinetBilder_AutoCad2025 (rajztér elemzés, blokk/fólia export, 2D gyártmányrajz és CAM/CNC interfész generátor).",
    targetAudience: "Bútortervezők, Faipari Mérnökök, CAM/CNC Programozók, Üzemvezetők",
    img: "https://images.unsplash.com/photo-1504307651254-35680f356dfd?q=80&w=1200&auto=format&fit=crop",
    tags: ["AUTOCAD 2025 PLUGIN", "C# .NET", "CAM/CNC ADATKINYERÉS", "3D CAD → 2D RAJZ", "KORPUSZ PARAMETRIKA"],
    status: "FEJLESZTÉSI LABOR",
    addr: "0x07",
    sec_auth: "GITHUB REPO",
    github_url: "https://github.com/Szantoi/CabinetBilder",
    knowledge_url: "/knowledge/cabinetbuilder-autocad-2025-butortervezo-cam-cnc",
    sort_order: 7
  }
];

// ============================================================================
// 2. COMPACT & TACTICAL PROJECT CARD COMPONENT
// ============================================================================
const ProjectCard = ({ project, variants, index, viewMode, onOpenModal }) => {
  const [isHovered, setIsHovered] = useState(false);
  const isWide = index % 3 === 1;

  return (
    <motion.div
      variants={variants}
      onClick={() => onOpenModal(project)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative bg-[var(--surface-panel)] border-2 dark:border-white/10 border-slate-900 hover:border-neonCyan transition-all duration-300 rounded-none flex flex-col justify-between overflow-hidden cursor-pointer ${
        isWide ? 'md:col-span-2' : 'col-span-1'
      } hover:shadow-[-5px_0_20px_rgba(0,251,251,0.2),5px_0_20px_rgba(255,0,255,0.2)] shadow-[4px_4px_0_#0f172a] dark:shadow-none`}
    >
      <CornerBracket position="tl" color={isHovered ? "text-neonCyan border-neonCyan" : "dark:text-white/20 text-slate-900"} />
      <CornerBracket position="tr" color={isHovered ? "text-neonMagenta border-neonMagenta" : "dark:text-white/20 text-slate-900"} />
      <CornerBracket position="bl" color={isHovered ? "text-neonCyan border-neonCyan" : "dark:text-white/20 text-slate-900"} />
      <CornerBracket position="br" color={isHovered ? "text-neonMagenta border-neonMagenta" : "dark:text-white/20 text-slate-900"} />

      {/* Industrial Header */}
      <div className="px-3.5 py-1.5 dark:bg-slate-950/80 bg-slate-200 border-b-2 dark:border-white/5 border-slate-900 flex items-center justify-between z-10 font-mono">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-none ${isHovered ? 'bg-neonCyan animate-ping' : 'bg-plasmaGreen'}`} />
          <span className="text-[9px] dark:text-slate-400 text-slate-800 uppercase tracking-widest font-black">
            {project.sec_auth || 'SEC_LEVEL: OMEGA'}
          </span>
        </div>
        <div className="text-[8px] dark:text-slate-500 text-slate-700 tracking-tighter font-bold">
          STATUS: {project.status} // [{project.id}]
        </div>
      </div>

      {/* Compact Banner Image */}
      <div className="relative overflow-hidden h-28 md:h-32">
        <img 
          alt={project.title} 
          className="w-full h-full object-cover opacity-35 group-hover:opacity-75 group-hover:scale-105 transition-all duration-700 grayscale group-hover:grayscale-0" 
          src={project.img}
        />
        <div className="absolute inset-0 pointer-events-none overflow-hidden mix-blend-overlay opacity-20 group-hover:opacity-40 transition-opacity">
          <motion.div 
            animate={isHovered ? { y: ['-100%', '100%'] } : { y: '-100%' }}
            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
            className="w-full h-[50%] bg-gradient-to-b from-transparent via-neonCyan/20 to-transparent"
          />
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 md:p-5 dark:bg-slate-900/70 bg-[var(--surface-panel)] relative z-10 border-t-2 dark:border-white/5 border-slate-900 flex flex-col justify-between flex-1">
        <div>
          {/* Subtitle */}
          <div className="flex items-center gap-2 mb-1 font-mono text-[9px] dark:text-slate-400 text-slate-600 uppercase tracking-widest leading-none font-bold">
            <span className="text-neonCyan">[{project.id}]</span>
            <span className="opacity-30">|</span>
            <span className="text-neonMagenta font-extrabold">{project.humanTitle}</span>
          </div>

          <h3 className="text-lg md:text-xl font-headline font-black text-on-surface uppercase italic group-hover:text-neonCyan transition-colors mb-2">
            <TextDecrypt text={project.title} isHovered={isHovered} />
          </h3>

          {/* Conditional View Mode */}
          {viewMode === 'hr' ? (
            <div className="space-y-1.5 font-body text-xs">
              <p className="dark:text-slate-200 text-slate-800 font-semibold leading-snug">
                🎯 {project.simpleDescription}
              </p>
              <div className="p-2 dark:bg-black/40 bg-slate-100 border border-slate-300 dark:border-white/10 text-[11px] space-y-1">
                <p className="dark:text-slate-400 text-slate-700 line-clamp-1">
                  <strong className="text-amber-500 dark:text-amber-400">Probléma:</strong> {project.problemSolved}
                </p>
                <p className="dark:text-slate-300 text-slate-900 font-medium line-clamp-1">
                  <strong className="text-plasmaGreen">Haszon:</strong> {project.businessValue}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5 font-body text-xs">
              <p className="dark:text-slate-300 text-slate-700 text-xs leading-relaxed line-clamp-2">
                ⚙️ {project.techDeepDive}
              </p>
              <div className="flex flex-wrap gap-1 mt-2">
                {project.tags.map(t => (
                  <span key={t} className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-950 border dark:border-white/10 border-slate-300 font-mono text-[9px] font-bold text-slate-800 dark:text-slate-300">
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Link & Action */}
        <div className="mt-3 pt-2.5 border-t dark:border-white/5 border-slate-200 flex justify-between items-center font-mono">
          <div className="text-[9px] text-plasmaGreen font-bold flex items-center gap-1">
            <Sparkles size={11} />
            <span>RÉSZLETEK</span>
          </div>
          <div className="text-[9px] text-neonCyan font-black tracking-widest uppercase flex items-center gap-1 group-hover:underline">
            MEGNYITÁS &gt;&gt;
          </div>
        </div>
      </div>
    </motion.div>
  );
};

// ============================================================================
// 3. PROJECT DETAIL MODAL (HR/CEO & TECH DEEP DIVE)
// ============================================================================
const ProjectDetailModal = ({ project, onClose }) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [onClose]);

  if (!project) return null;

  return (
    <div 
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 pt-24 pb-8 bg-black/85 backdrop-blur-md overflow-y-auto"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-3xl bg-[var(--surface-panel)] border-2 border-neonCyan p-6 md:p-8 max-h-[85vh] overflow-y-auto shadow-[0_0_50px_rgba(0,255,255,0.3)] relative font-body my-auto"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white bg-slate-900 border border-white/10 hover:border-neonCyan transition-colors cursor-pointer z-10"
          aria-label="Bezárás"
        >
          <X size={20} />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-2 font-mono text-[10px] text-neonCyan font-black uppercase tracking-widest mb-2 pr-10">
          <span>{project.status}</span>
          <span>//</span>
          <span>CÉLCSOPORT: {project.targetAudience}</span>
        </div>

        <h2 className="text-2xl md:text-3xl font-headline font-black uppercase italic dark:text-white text-slate-950 mb-1">
          {project.title}
        </h2>
        <p className="text-sm md:text-base text-neonMagenta font-headline font-bold uppercase mb-6">
          {project.humanTitle}
        </p>

        {/* HR & Business Pillars */}
        <div className="space-y-3.5 mb-6">
          <div className="p-3.5 bg-cyan-500/10 border-l-4 border-neonCyan">
            <h4 className="font-mono text-xs font-black uppercase text-neonCyan mb-1 flex items-center gap-1.5">
              <Lightbulb size={14} />
              <span>1. MI EZ A PROJEKT EGYSZERŰEN ELMAGYARÁZVA?</span>
            </h4>
            <p className="text-sm dark:text-slate-200 text-slate-800 leading-relaxed font-body">
              {project.simpleDescription}
            </p>
          </div>

          <div className="p-3.5 bg-amber-500/10 border-l-4 border-amber-500">
            <h4 className="font-mono text-xs font-black uppercase text-amber-500 mb-1 flex items-center gap-1.5">
              <AlertTriangle size={14} />
              <span>2. MILYEN VALÓS ÜZLETI PROBLÉMÁT OLD MEG?</span>
            </h4>
            <p className="text-sm dark:text-slate-200 text-slate-800 leading-relaxed font-body">
              {project.problemSolved}
            </p>
          </div>

          <div className="p-3.5 bg-emerald-500/10 border-l-4 border-plasmaGreen">
            <h4 className="font-mono text-xs font-black uppercase text-plasmaGreen mb-1 flex items-center gap-1.5">
              <CheckCircle2 size={14} />
              <span>3. MI A GYAKORLATI HASZNA ÉS ÉRTÉKE A CÉGNEK?</span>
            </h4>
            <p className="text-sm dark:text-slate-200 text-slate-800 leading-relaxed font-body">
              {project.businessValue}
            </p>
          </div>

          {/* Technical Deep Dive Box */}
          <div className="p-3.5 bg-fuchsia-500/10 border-l-4 border-neonMagenta">
            <h4 className="font-mono text-xs font-black uppercase text-neonMagenta mb-1 flex items-center gap-1.5">
              <Code2 size={14} />
              <span>4. MÉRNÖKI & TECHNIKAI SPECIFIKÁCIÓ (TECH DEEP DIVE):</span>
            </h4>
            <p className="text-xs dark:text-slate-300 text-slate-800 leading-relaxed font-mono">
              {project.techDeepDive}
            </p>
          </div>
        </div>

        {/* Tech Badges */}
        <div className="mb-6 pt-3 border-t dark:border-white/10 border-slate-300">
          <span className="font-mono text-[10px] text-slate-500 uppercase font-black block mb-2">
            TECHNOLÓGIAI STACK:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {project.tags.map(t => (
              <span key={t} className="px-2 py-0.5 dark:bg-slate-900 bg-slate-200 border dark:border-white/15 border-slate-300 font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                #{t}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3 pt-3 border-t dark:border-white/10 border-slate-300">
          {project.github_url?.startsWith('http') && (
            <a
              href={project.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-2.5 bg-neonCyan text-black font-headline font-black text-xs uppercase tracking-wider hover:bg-white transition-colors flex items-center gap-2 shadow-[2px_2px_0_#0f172a] cursor-pointer"
            >
              <span>GITHUB FORRÁSKÓD MEGNYITÁSA</span>
              <ExternalLink size={14} />
            </a>
          )}
          {project.knowledge_url ? (
            <a
              href={project.knowledge_url}
              className="px-5 py-2.5 border-2 border-neonCyan text-neonCyan font-headline font-black text-xs uppercase tracking-wider hover:bg-neonCyan hover:text-black transition-colors flex items-center gap-2 shadow-[2px_2px_0_#0f172a] cursor-pointer"
            >
              <span>TUDÁSTÁR CIKK ELOLVASÁSA</span>
              <span>→</span>
            </a>
          ) : !project.github_url?.startsWith('http') && (
            <a
              href={project.github_url}
              className="px-5 py-2.5 bg-neonCyan text-black font-headline font-black text-xs uppercase tracking-wider hover:bg-white transition-colors flex items-center gap-2 shadow-[2px_2px_0_#0f172a] cursor-pointer"
            >
              <span>ÉLES TUDÁSTÁR MEGNYITÁSA</span>
              <span>→</span>
            </a>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2.5 border-2 dark:border-white/20 border-slate-400 font-headline font-black text-xs uppercase hover:border-neonMagenta hover:text-neonMagenta transition-all cursor-pointer"
          >
            BEZÁRÁS ✕
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ============================================================================
// 4. MAIN PROJECT GRID
// ============================================================================
const ProjectGrid = () => {
  const { isLoading } = useContent();
  const [viewMode, setViewMode] = useState('hr'); // 'hr' | 'tech'
  const [activeModalProject, setActiveModalProject] = useState(null);

  const containerVars = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVars = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "circOut" } }
  };

  return (
    <section className="py-20 bg-background relative scroll-mt-24" id="grid">
      <div className="container mx-auto px-6">
        
        {/* Header with HR/CEO vs Tech/Architect Toggle */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-6 border-b-2 dark:border-white/10 border-slate-900 pb-6 font-mono">
          <div className="w-full min-w-0 md:w-auto">
            <span className="block max-w-full break-words text-[10px] sm:text-xs text-neonCyan font-black uppercase tracking-[0.18em] sm:tracking-[0.5em] leading-relaxed mb-1">
              // MÉRNÖKI_FEJLESZTÉSEK_ÉS_PROJEKTEK
            </span>
            <h2 className="break-words text-4xl md:text-5xl font-headline font-black italic uppercase text-on-surface mt-1 tracking-tighter">
              Projektek & Rendszerek.
            </h2>
            <p className="font-body dark:text-slate-400 text-slate-700 text-sm max-w-2xl mt-1.5">
              Valós üzleti problémákra adott mérnöki és szoftveres megoldások. Válts nézetet az üzleti megértés vagy a technikai specifikáció között!
            </p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full md:w-auto">
            {/* View Mode Switcher */}
            <div className="flex flex-wrap border-2 dark:border-white/15 border-slate-900 p-1 dark:bg-slate-950 bg-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('hr')}
                className={`px-3 py-1.5 text-xs font-headline font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'hr'
                    ? 'bg-neonCyan text-black shadow-[2px_2px_0_#0f172a]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-white'
                }`}
                title="Közérthető HR / CEO Nézet: mi ez, milyen problémát old meg és mi a haszna"
              >
                <Briefcase size={13} />
                <span>HR / CEO NÉZET</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('tech')}
                className={`px-3 py-1.5 text-xs font-headline font-black uppercase transition-all cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'tech'
                    ? 'bg-neonMagenta text-white shadow-[2px_2px_0_#0f172a]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-white'
                }`}
                title="Mérnöki / Tech Nézet: architektúra, protokollok, kód és stack"
              >
                <Cpu size={13} />
                <span>TECH / ARCHITECT NÉZET</span>
              </button>
            </div>

            <a 
              href="/architecture" 
              className="px-4 py-2 border-2 dark:border-plasmaGreen border-emerald-800 dark:text-plasmaGreen text-emerald-950 font-headline font-black text-xs uppercase tracking-wider hover:bg-plasmaGreen hover:text-black transition-all flex items-center justify-center gap-2 cursor-pointer shadow-[2px_2px_0_#0f172a]"
            >
              <span>ARCHITEKTÚRA BLUEPRINT →</span>
            </a>
          </div>
        </div>

        {/* Project Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="aspect-square bg-white/5 border border-white/10"></div>
            ))}
          </div>
        ) : (
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={containerVars}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
          >
            {ENRICHED_PROJECTS.map((project, index) => (
              <ProjectCard 
                key={project.id} 
                project={project} 
                variants={itemVars} 
                index={index} 
                viewMode={viewMode}
                onOpenModal={setActiveModalProject}
              />
            ))}
          </motion.div>
        )}
      </div>

      {/* Interactive Detail Modal */}
      <AnimatePresence>
        {activeModalProject && (
          <ProjectDetailModal 
            project={activeModalProject} 
            onClose={() => setActiveModalProject(null)} 
          />
        )}
      </AnimatePresence>
    </section>
  );
};

export default ProjectGrid;
