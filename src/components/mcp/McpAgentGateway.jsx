import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Terminal, 
  Cpu, 
  Copy, 
  Check, 
  ExternalLink, 
  Sparkles, 
  Bot, 
  Layers, 
  ShieldCheck, 
  Code2, 
  Radio, 
  ArrowRight,
  Zap,
  Globe,
  Database
} from 'lucide-react';
import CyberSEO from '../common/CyberSEO';

// ============================================================================
// CONFIG TEMPLATES FOR VARIOUS AGENTS & CLIENTS
// ============================================================================
const MCP_CONFIGS = {
  claudeDesktop: {
    title: 'Claude Desktop (Nyilvános Keresés)',
    filename: 'claude_desktop_config.json',
    description: 'Nyisd meg a Claude Desktop beállításait és illeszd be az `mcpServers` blokkba. Hitelesítés nélkül azonnal biztosítja a keresést.',
    code: `{
  "mcpServers": {
    "cyber-architect-public": {
      "command": "node",
      "args": [
        "server/mcp/server.js"
      ]
    }
  }
}`
  },
  adminAgent: {
    title: 'Saját Autentikált Ágens (Írás / Szerkesztés)',
    filename: 'claude_desktop_config.json (Admin)',
    description: 'Saját belső vagy CI/CD ágens hitelesítése: a `PORTFOLIO_API_KEY` megadásával engedélyezi a cikkfeltöltést és szerkesztést.',
    code: `{
  "mcpServers": {
    "cyber-architect-admin": {
      "command": "node",
      "args": [
        "server/mcp/server.js"
      ],
      "env": {
        "PORTFOLIO_API_KEY": "sajat_titkos_admin_kulcsod"
      }
    }
  }
}`
  },
  claudeCode: {
    title: 'Claude Code (CLI)',
    filename: 'Terminál parancs',
    description: 'Futtasd le ezt a parancsot a terminálodban az MCP szerver azonnali regisztrálásához:',
    code: `claude mcp add cyber-architect -- node server/mcp/server.js`
  },
  cursor: {
    title: 'Cursor IDE',
    filename: '.cursor/mcp.json',
    description: 'A Cursor projekt gyökerében vagy a globális Cursor MCP beállításaiban:',
    code: `{
  "mcpServers": {
    "cyber-architect": {
      "command": "node",
      "args": ["server/mcp/server.js"]
    }
  }
}`
  },
  windsurf: {
    title: 'Windsurf / Roo Code',
    filename: 'mcp_settings.json',
    description: 'Illeszd be a Windsurf Cascade vagy Roo Code MCP konfigurációs fájljába:',
    code: `{
  "mcpServers": {
    "szantoi-cyber-architect": {
      "command": "node",
      "args": ["server/mcp/server.js"],
      "disabled": false,
      "autoApprove": ["search_knowledge", "get_knowledge_article", "list_projects"]
    }
  }
}`
  },
  promptInjection: {
    title: 'AI Prompt / Rendszerutasítás',
    filename: 'System Prompt Snippet',
    description: 'Ha bármilyen AI ágensnek csak az oldal linkjét adod meg, másold be ezt a szöveget a promptjába:',
    code: `Csatlakozz Szántói Gábor mérnöki és tudásbázis platformjához a Model Context Protocol (MCP) segítségével!
MCP Manifest & Tools végpont: https://www.ai.szantoi.hu/api/mcp/manifest és https://www.ai.szantoi.hu/api/mcp/tools
Használd a 'search_knowledge' eszközt a műszaki tudástár lekérdezéséhez és a 'list_projects' eszközt a mérnöki repók megtekintéséhez.`
  }
};

// ============================================================================
// LIVE MCP TOOLS CATALOG (STRICTLY READ-ONLY SEARCH & DISCOVERY)
// ============================================================================
const MCP_TOOLS_CATALOG = [
  {
    name: 'search_knowledge',
    category: 'RAG & TUDÁSKERESŐ',
    badge: 'READ',
    color: 'text-neonCyan',
    borderColor: 'border-neonCyan',
    description: 'Zárt vállalati tudástár és blog keresés hibrid FTS5 BM25 és 128-dimenziós vektor koszinusz-hasonlósággal.',
    params: 'query (kötelező), content_type (knowledge|blog|all), project_id, category, limit'
  },
  {
    name: 'get_knowledge_article',
    category: 'DOKUMENTUM OLVASÓ',
    badge: 'READ',
    color: 'text-plasmaGreen',
    borderColor: 'border-plasmaGreen',
    description: 'Teljes Markdown cikk lekérése YAML frontmatter dimenziókkal és metaadatokkal a slug azonosító alapján.',
    params: 'slug (kötelező)'
  },
  {
    name: 'list_knowledge_projects',
    category: 'MUNKATEREK & PROJEKTEK',
    badge: 'READ',
    color: 'text-cyan-300',
    borderColor: 'border-cyan-300',
    description: 'A platformhoz tartozó összes tudás-munkatér és projekt (SpaceOS, DocCapture, JoineryTech, Cyber-Architect) listázása.',
    params: 'nincs paraméter'
  },
  {
    name: 'list_projects',
    category: 'PORTFÓLIÓ & REPÓK',
    badge: 'READ',
    color: 'text-neonMagenta',
    borderColor: 'border-neonMagenta',
    description: 'Az összes aktív mérnöki projekt, GitHub repó, technológiai stack és éles státusz listázása.',
    params: 'nincs paraméter'
  },
  {
    name: 'list_blog_posts',
    category: 'BLOG & ESETTANULMÁNY',
    badge: 'READ',
    color: 'text-purple-400',
    borderColor: 'border-purple-400',
    description: 'Publikus mérnöki és vezetői esettanulmányok, szakmai cikkek listázása olvasási idővel és összefoglalóval.',
    params: 'published_only (opcionális)'
  },
  {
    name: 'get_architecture_blueprint',
    category: 'RENDSZERTERV & SPEC',
    badge: 'READ',
    color: 'text-cyan-400',
    borderColor: 'border-cyan-400',
    description: 'A platform 6-lépéses RAG pipeline leírása, biztonsági garanciái és rendszer-topológiája.',
    params: 'nincs paraméter'
  },
  {
    name: 'get_system_health',
    category: 'DIAGNOSZTIKA',
    badge: 'READ',
    color: 'text-rose-400',
    borderColor: 'border-rose-400',
    description: 'Valós idejű rendszer-diagnosztika: SQLite WAL állapot, adatbázis integritás és futásidő.',
    params: 'nincs paraméter'
  },
  {
    name: 'create_message_uplink',
    category: 'KÖZVETLEN MEGKERESÉS',
    badge: 'INQUIRY',
    color: 'text-yellow-400',
    borderColor: 'border-yellow-400',
    description: 'Közvetlen üzenet vagy megkeresés küldése Szántói Gábornak az AI ágens vagy megbízója nevében.',
    params: 'identity, subject, message (kötelező)'
  }
];

// ============================================================================
// MAIN COMPONENT: MCP AGENT GATEWAY
// ============================================================================
const McpAgentGateway = () => {
  const [activeTab, setActiveTab] = useState('claudeDesktop');
  const [copied, setCopied] = useState(false);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentConfig = MCP_CONFIGS[activeTab];

  return (
    <div className="min-h-screen bg-[var(--bg-main)] text-[var(--text-main)] pt-24 pb-20 font-body transition-colors duration-200">
      <CyberSEO 
        title="MCP Agent Uplink // AI Csatlakozási Átjáró // Szántói Gábor"
        description="Model Context Protocol (MCP) csatlakozási felület autonóm AI ágenseknek. Automatikus felderítés, 1-kattintásos kliens konfigurációk és éles eszköztár."
      />

      <div className="max-w-7xl mx-auto px-6 font-mono">
        
        {/* ── Top Tactical Header ── */}
        <div className="border-2 dark:border-white/10 border-slate-900 p-6 md:p-8 mb-12 dark:bg-slate-950/60 bg-white shadow-[6px_6px_0_#0f172a] dark:shadow-[0_0_25px_rgba(0,255,255,0.08)] relative overflow-hidden">
          <div className="flex items-center gap-2 text-[10px] text-neonCyan font-black uppercase tracking-widest mb-3">
            <span className="w-2.5 h-2.5 bg-neonCyan inline-block animate-pulse" />
            <span>MODEL CONTEXT PROTOCOL (MCP) // AGENT CONNECTION GATEWAY</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-headline font-black italic uppercase text-slate-900 dark:text-white mb-4 tracking-tight leading-tight">
            AI Ágens Csatlakozás <br className="hidden sm:block" />
            <span className="text-neonCyan">Model Context Protocol (MCP) Átjáró.</span>
          </h1>

          <p className="font-body dark:text-slate-300 text-slate-700 text-sm md:text-base max-w-3xl leading-relaxed">
            Ez a weboldal és tudástár <strong>natív, kizárólag olvasható (Read-Only) Model Context Protocol (MCP) szervert</strong> biztosít. Bármilyen modern AI asszisztens (Claude Desktop, Cursor, Claude Code, Windsurf, Roo Code vagy egyedi ágens) közvetlenül csatlakozhat, és szabadon kereshet a teljes nyilvános RAG tudástárban, projektlistában és mérnöki blueprintben – a belső adatok módosításának kockázata nélkül.
          </p>

          <div className="flex flex-wrap gap-4 mt-6 pt-6 border-t dark:border-white/10 border-slate-200 text-xs">
            <div className="flex items-center gap-2 text-plasmaGreen font-bold">
              <span className="w-2 h-2 rounded-none bg-plasmaGreen animate-ping" />
              <span>MCP PROTOCOL V1.0 // STRICTLY READ-ONLY SEARCH GATEWAY</span>
            </div>
            <div className="text-slate-500 dark:text-slate-400">
              100% NYILVÁNOS TUDÁSBÁZIS & RAG KERESÉS // MÓDOSÍTÁS KIZÁRVA
            </div>
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* SZEKCIÓ 1: 1-KATTINTÁSOS MCP KLIENS KONFIGURÁCIÓ              */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">
          
          {/* Left: Tab Selectors */}
          <div className="lg:col-span-4 space-y-2">
            <h3 className="text-xs font-headline font-black uppercase text-neonCyan tracking-widest mb-4 flex items-center gap-2">
              <Bot size={16} />
              <span>VÁLASSZ KLIENST VAGY ÁGENST:</span>
            </h3>

            {Object.entries(MCP_CONFIGS).map(([key, config]) => {
              const isSelected = activeTab === key;
              return (
                <button
                  key={key}
                  onClick={() => setActiveTab(key)}
                  className={`w-full p-4 border-2 text-left transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? 'border-neonCyan dark:bg-slate-900 bg-cyan-50 shadow-[4px_4px_0_#0f172a] text-slate-950 dark:text-white'
                      : 'dark:border-white/10 border-slate-300 dark:bg-slate-950/40 bg-white hover:border-slate-400 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div>
                    <span className="text-xs font-headline font-black uppercase block">
                      {config.title}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {config.filename}
                    </span>
                  </div>
                  <ArrowRight size={14} className={isSelected ? 'text-neonCyan' : 'opacity-30'} />
                </button>
              );
            })}
          </div>

          {/* Right: Code & Instruction Display */}
          <div className="lg:col-span-8">
            <div className="p-6 md:p-8 border-2 border-neonCyan dark:bg-slate-950/80 bg-white shadow-[6px_6px_0_#0f172a] relative">
              <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b dark:border-white/10 border-slate-200">
                <div>
                  <span className="text-[10px] text-neonCyan font-bold uppercase tracking-widest block">
                    KONFIGURÁCIÓS FÁJL // {currentConfig.title}
                  </span>
                  <h4 className="text-lg font-headline font-black uppercase dark:text-white text-slate-950">
                    {currentConfig.filename}
                  </h4>
                </div>

                <button
                  onClick={() => handleCopy(currentConfig.code)}
                  className={`px-4 py-2 text-xs font-headline font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-[2px_2px_0_#0f172a] ${
                    copied 
                      ? 'bg-plasmaGreen text-black' 
                      : 'bg-neonCyan text-black hover:bg-white'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check size={14} />
                      <span>KÓD MÁSOLVA!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>MÁSOLÁS VÁGÓLAPRA</span>
                    </>
                  )}
                </button>
              </div>

              <p className="font-body text-xs dark:text-slate-300 text-slate-700 mb-4 leading-relaxed">
                {currentConfig.description}
              </p>

              <div className="relative">
                <pre className="p-5 bg-[#050814] border-2 border-slate-800 text-slate-200 text-xs font-mono overflow-x-auto leading-relaxed scrollbar-thin">
                  <code>{currentConfig.code}</code>
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* SZEKCIÓ 1.5: KÉTSZINTŰ JOGOSULTSÁG ÉS BIZTONSÁG (RBAC)        */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-16 font-mono">
          <div className="p-6 border-2 border-neonCyan dark:bg-slate-950/60 bg-white shadow-[4px_4px_0_#0f172a]">
            <div className="flex items-center gap-2 text-[10px] text-neonCyan font-bold uppercase tracking-widest mb-2">
              <Globe size={14} />
              <span>1. SZINT // NYILVÁNOS VENDÉG ÁGENS (READ-ONLY)</span>
            </div>
            <h4 className="text-base font-headline font-black uppercase text-slate-900 dark:text-white mb-2">
              100% Nyilvános RAG & Tudáskeresés
            </h4>
            <p className="font-body text-xs dark:text-slate-300 text-slate-700 leading-relaxed mb-3">
              Minden külső AI asszisztens hitelesítés nélkül azonnal elérheti a teljes publikus tudástárat, a 7 mérnöki projekt leírását, a blog esettanulmányokat és a rendszertervet.
            </p>
            <div className="text-[10px] font-bold text-plasmaGreen flex items-center gap-1">
              <Check size={13} />
              <span>SZERKESZTÉS LEZÁRVA // NULLA MÓDOSÍTÁSI KOCKÁZAT</span>
            </div>
          </div>

          <div className="p-6 border-2 border-neonMagenta dark:bg-slate-950/60 bg-white shadow-[4px_4px_0_#0f172a]">
            <div className="flex items-center gap-2 text-[10px] text-neonMagenta font-bold uppercase tracking-widest mb-2">
              <ShieldCheck size={14} />
              <span>2. SZINT // SAJÁT AUTENTIKÁLT ÁGENS (ADMIN / WRITE)</span>
            </div>
            <h4 className="text-base font-headline font-black uppercase text-slate-900 dark:text-white mb-2">
              Saját Belső Ágensek & CI/CD Folyamatok
            </h4>
            <p className="font-body text-xs dark:text-slate-300 text-slate-700 leading-relaxed mb-3">
              Kizárólag a saját, hitelesített ágensünk (pl. Claude Code terminál vagy belső automatizáció) jogosult új cikkek feltöltésére és szerkesztésére a titkos <code className="text-neonMagenta">PORTFOLIO_API_KEY</code> segítségével.
            </p>
            <div className="text-[10px] font-bold text-neonMagenta flex items-center gap-1">
              <Zap size={13} />
              <span>SZIGORÚ ZERO RAW QUERY & AUDITÁLT MŰVELETEK</span>
            </div>
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* SZEKCIÓ 2: ÉLŐ MCP ESZKÖZÖK KATALÓGUSA (LIVE TOOL REGISTRY)   */}
        {/* ───────────────────────────────────────────────────────────── */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-6 pb-3 border-b-2 dark:border-white/10 border-slate-900">
            <div className="flex items-center gap-3">
              <Code2 size={22} className="text-neonMagenta animate-pulse" />
              <h2 className="text-xl md:text-2xl font-headline font-black uppercase italic text-slate-900 dark:text-white tracking-wider">
                Elérhető MCP Eszközök (Tool Registry)
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
              [{MCP_TOOLS_CATALOG.length} NYILVÁNOSAN ELÉRHETŐ KERESŐ ESZKÖZ]
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {MCP_TOOLS_CATALOG.map((tool) => (
              <div 
                key={tool.name}
                className={`p-5 border-2 ${tool.borderColor} dark:bg-slate-950/40 bg-white shadow-[4px_4px_0_#0f172a] flex flex-col justify-between`}
              >
                <div>
                  <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-widest mb-2 font-mono">
                    <span className={tool.color}>{tool.category}</span>
                    <span className={`px-2 py-0.5 text-[9px] font-black tracking-wider ${
                      tool.badge === 'READ'
                        ? 'bg-cyan-500/20 text-neonCyan border border-neonCyan/40'
                        : tool.badge === 'WRITE'
                        ? 'bg-emerald-500/20 text-plasmaGreen border border-plasmaGreen/40'
                        : 'bg-yellow-500/20 text-yellow-400 border border-yellow-400/40'
                    }`}>
                      {tool.badge}
                    </span>
                  </div>

                  <h3 className="text-base font-headline font-black uppercase text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                    <Terminal size={15} className={tool.color} />
                    <span>{tool.name}</span>
                  </h3>

                  <p className="font-body text-xs dark:text-slate-300 text-slate-700 leading-relaxed mb-4">
                    {tool.description}
                  </p>
                </div>

                <div className="pt-3 border-t dark:border-white/10 border-slate-200 font-mono text-[10px]">
                  <span className="text-slate-500 block font-bold mb-0.5">PARAMÉTEREK:</span>
                  <code className="text-slate-700 dark:text-slate-300 break-all">{tool.params}</code>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ───────────────────────────────────────────────────────────── */}
        {/* SZEKCIÓ 3: INTERAKTÍV MCP LIVE TESTER & PLAYGROUND             */}
        {/* ───────────────────────────────────────────────────────────── */}
        <McpLiveTester />

      </div>
    </div>
  );
};

// ============================================================================
// SUB-COMPONENT: INTERACTIVE MCP LIVE TESTER & CONSOLE
// ============================================================================
const McpLiveTester = () => {
  const [activeTestTool, setActiveTestTool] = useState('search_knowledge');
  const [queryInput, setQueryInput] = useState('RAG adatbiztonság és zero raw query');
  const [authKeyInput, setAuthKeyInput] = useState('');
  const [articleTitle, setArticleTitle] = useState('Új Műszaki Ágens Cikk');
  const [articleContent, setArticleContent] = useState('## Mérnöki jegyzet\n\nEz egy teszt cikk...');
  const [testContentType, setTestContentType] = useState('knowledge');
  const [isLoading, setIsLoading] = useState(false);
  const [responseJson, setResponseJson] = useState(null);

  const handleExecuteTest = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setResponseJson(null);

    try {
      if (activeTestTool === 'search_knowledge') {
        const res = await fetch(`/api/knowledge/search?q=${encodeURIComponent(queryInput)}&content_type=${testContentType}`);
        const data = await res.json();
        setResponseJson(data);
      } else if (activeTestTool === 'list_projects') {
        const res = await fetch('/api/projects');
        const data = await res.json();
        setResponseJson(data);
      } else if (activeTestTool === 'get_architecture_blueprint') {
        const res = await fetch('/api/mcp/manifest');
        const data = await res.json();
        setResponseJson(data);
      } else if (activeTestTool === 'publish_knowledge_article') {
        // Admin action test with auth key
        const res = await fetch('/api/admin/blog', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authKeyInput ? `Bearer ${authKeyInput}` : ''
          },
          body: JSON.stringify({
            title: articleTitle,
            summary: 'Automatikusan beküldött teszt cikk az MCP konzolból.',
            content: articleContent,
            content_type: testContentType,
            project_id: 'prj_spaceos',
            category: 'ZÁRT VÁLLALATI RAG',
            published: 1
          })
        });
        const data = await res.json();
        setResponseJson(data);
      }
    } catch (err) {
      setResponseJson({ error: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="border-2 border-neonCyan dark:bg-slate-950/80 bg-white p-6 md:p-8 shadow-[6px_6px_0_#0f172a] relative">
      <div className="flex items-center justify-between mb-6 pb-3 border-b dark:border-white/10 border-slate-200">
        <div className="flex items-center gap-2.5">
          <Terminal size={20} className="text-neonCyan animate-pulse" />
          <h3 className="text-lg md:text-xl font-headline font-black uppercase text-slate-900 dark:text-white tracking-wider">
            Élő MCP Tesztelő Konzol (Interactive Playground)
          </h3>
        </div>
        <span className="text-[10px] text-plasmaGreen font-bold px-2 py-0.5 bg-plasmaGreen/10 border border-plasmaGreen/40">
          LIVE PROTOCOL TESTER
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-mono text-xs">
        {/* Left: Tool Selection & Parameters */}
        <div className="lg:col-span-5 space-y-4">
          <div>
            <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
              VÁLASSZ TESZTELENDŐ MCP ESZKÖZT:
            </label>
            <select
              value={activeTestTool}
              onChange={(e) => {
                setActiveTestTool(e.target.value);
                setResponseJson(null);
              }}
              className="w-full dark:bg-slate-900 bg-slate-50 border-2 dark:border-white/20 border-slate-900 p-2.5 text-xs text-neonCyan font-bold outline-none focus:border-neonCyan"
            >
              <option value="search_knowledge">🔍 search_knowledge (Nyilvános RAG Keresés)</option>
              <option value="list_projects">🗂️ list_projects (Portfólió & Repók)</option>
              <option value="get_architecture_blueprint">📐 get_architecture_blueprint (Rendszerterv)</option>
              <option value="publish_knowledge_article">✍️ publish_knowledge_article (Cikk Feltöltés - Auth Köteles)</option>
            </select>
          </div>

          <form onSubmit={handleExecuteTest} className="space-y-4">
            {activeTestTool === 'search_knowledge' && (
              <>
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                    KERESÉSI KIFEJEZÉS (QUERY):
                  </label>
                  <input
                    type="text"
                    required
                    value={queryInput}
                    onChange={(e) => setQueryInput(e.target.value)}
                    placeholder="pl. RAG vektoros hasonlóság vagy CAD automatizáció"
                    className="w-full dark:bg-slate-900 bg-white border border-slate-700 p-2.5 text-xs text-white outline-none focus:border-neonCyan"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                    TARTALOM TÍPUSA:
                  </label>
                  <select
                    value={testContentType}
                    onChange={(e) => setTestContentType(e.target.value)}
                    className="w-full dark:bg-slate-900 bg-white border border-slate-700 p-2 text-xs text-neonCyan outline-none"
                  >
                    <option value="knowledge">📚 Tudástár (knowledge)</option>
                    <option value="blog">📰 Blog & Esettanulmányok (blog)</option>
                    <option value="all">🌐 Összes (all)</option>
                  </select>
                </div>
              </>
            )}

            {activeTestTool === 'publish_knowledge_article' && (
              <>
                <div className="p-3 bg-neonMagenta/10 border border-neonMagenta/40 text-[11px] text-neonMagenta">
                  ℹ️ Ehhez a művelethez szükséges egy érvényes <strong>PORTFOLIO_API_KEY</strong> vagy Admin PIN token!
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                    AUTH KEY / ADMIN TOKEN:
                  </label>
                  <input
                    type="password"
                    value={authKeyInput}
                    onChange={(e) => setAuthKeyInput(e.target.value)}
                    placeholder="ca_live_... vagy PIN"
                    className="w-full dark:bg-slate-900 bg-white border border-neonMagenta/50 p-2.5 text-xs text-neonMagenta font-bold outline-none focus:border-neonMagenta"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                    CIKK CÍME:
                  </label>
                  <input
                    type="text"
                    required
                    value={articleTitle}
                    onChange={(e) => setArticleTitle(e.target.value)}
                    className="w-full dark:bg-slate-900 bg-white border border-slate-700 p-2 text-xs text-white outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1">
                    MARKDOWN TARTALOM:
                  </label>
                  <textarea
                    rows={3}
                    value={articleContent}
                    onChange={(e) => setArticleContent(e.target.value)}
                    className="w-full dark:bg-slate-900 bg-white border border-slate-700 p-2 text-xs text-white outline-none"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-neonCyan hover:bg-white text-slate-950 font-headline font-black italic uppercase text-xs tracking-wider transition-all flex items-center justify-center gap-2 shadow-[3px_3px_0_#0f172a]"
            >
              {isLoading ? (
                <span>MŰVELET VÉGREHAJTÁSA...</span>
              ) : (
                <>
                  <Zap size={14} />
                  <span>ESZKÖZ HÍVÁSA (EXECUTE TOOL)</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right: Live Output Screen */}
        <div className="lg:col-span-7">
          <label className="block text-[10px] text-slate-400 font-bold uppercase mb-1 flex items-center justify-between">
            <span>VALÓS IDEJŰ PROTOKOLL VÁLASZ (RAW JSON-RPC):</span>
            {responseJson && (
              <span className="text-plasmaGreen text-[9px] font-bold">STATUS: 200 OK</span>
            )}
          </label>
          <div className="p-4 bg-[#050814] border-2 border-slate-800 min-h-[220px] max-h-[360px] overflow-y-auto text-[11px] leading-relaxed text-slate-200 scrollbar-thin">
            {isLoading ? (
              <div className="flex items-center justify-center h-48 text-neonCyan animate-pulse">
                [VÁLASZ FELDOLGOZÁSA...]
              </div>
            ) : responseJson ? (
              <pre className="overflow-x-auto text-emerald-400">
                <code>{JSON.stringify(responseJson, null, 2)}</code>
              </pre>
            ) : (
              <div className="text-slate-500 italic flex flex-col items-center justify-center h-48 text-center">
                <span>Válassz ki egy eszközt a bal oldalon és kattints az</span>
                <strong className="text-neonCyan mt-1">"ESZKÖZ HÍVÁSA"</strong>
                <span>gombra az élő MCP válasz megtekintéséhez.</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default McpAgentGateway;
