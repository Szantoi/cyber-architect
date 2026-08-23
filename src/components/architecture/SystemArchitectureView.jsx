import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Code2,
  Cpu,
  Database,
  FileText,
  GitBranch,
  HardDrive,
  Layers,
  Lock,
  Network,
  Server,
  ShieldCheck,
  Sparkles,
  Workflow
} from 'lucide-react';
import { Link } from 'react-router-dom';
import CyberSEO from '../common/CyberSEO';

const PIPELINE_STEPS = [
  {
    id: 'sql',
    number: '01',
    title: 'SQL / ERP: strukturális igazság',
    subtitle: 'Stabil projektazonosító és allowlistelt tények',
    icon: Database,
    accent: 'text-neonCyan',
    border: 'border-neonCyan',
    panel: 'bg-neonCyan/10',
    description: 'A projekt üzleti azonosítója, neve, dátuma és kötelező strukturális adata az ERP-ben él. A rendszer nem kap nyers SQL-t: egy hitelesített gateway csak a szükséges, például project_snapshot szerződést adja át.',
    facts: [
      'A sql_project_id gép által kezelt, nem kézzel gépelt YAML-adat.',
      'A projekt- és dokumentumazonosság stabil, ezért auditálható.',
      'A gateway nem ad ki kapcsolatstringet, táblanevet vagy tetszőleges lekérdezést.'
    ],
    snippet: `SQL / ERP\n  project_id: PRJ-2026-884\n  fact_profile: project_snapshot\n  ↓ allowlistelt gateway`
  },
  {
    id: 'generator',
    number: '02',
    title: 'Központi Markdown-generátor',
    subtitle: 'Create-only váz, soha nem írja felül a törzset',
    icon: FileText,
    accent: 'text-plasmaGreen',
    border: 'border-plasmaGreen',
    panel: 'bg-plasmaGreen/10',
    description: 'Új SQL-projekthez a központi sablon létrehozza a projektmappa index.md fájlját. A generátor a rendszer-owned azonosítókat, láthatóságot, sablonverziót és üres gráfhivatkozás-listát tölti ki, majd létező fájlt skipped_existing eredménnyel békén hagy.',
    facts: [
      'A létrehozás create-only: a mérnök szakmai szövege nem sérül.',
      'A frontmatter kizárólag Obsidian-kompatibilis, lapos mezőket használ.',
      'A sablon verziózott, ezért a strukturális indulópont minden projektnél azonos.'
    ],
    snippet: `---\ndocument_id: kb:project:PRJ-2026-884:index\nsql_project_id: PRJ-2026-884\nca_graph_refs: []\nca_sync_version: 1\n---`
  },
  {
    id: 'vault',
    number: '03',
    title: 'Obsidian Vault: emberi kontextus',
    subtitle: 'Szabad törzs, wikilink és típusos szerzői kapcsolat',
    icon: FileText,
    accent: 'text-neonMagenta',
    border: 'border-neonMagenta',
    panel: 'bg-neonMagenta/10',
    description: 'A mérnök vagy agent a Markdown törzsben őrzi a szakmai indoklást, bizonyítékot és hagyományos wikilinkeket. A gazdag, típusos kapcsolatokat a külön CA:RELATIONS blokkban adhatja meg; a rendszer ezt a blokkot nem írja felül.',
    facts: [
      'A sima [[wikilink]] dokumentációs hivatkozás, nem feltételezett üzleti él.',
      'A CA:RELATIONS ember-owned és validálva kerül a gráfba.',
      'Nested dimensions vagy relations objektum helyett lapos property-k maradnak.'
    ],
    snippet: `<!-- CA:RELATIONS:BEGIN v1 -->\n- depends_on → [[TASK-004]] · graph: project/prj-2026-884\n<!-- CA:RELATIONS:END -->`
  },
  {
    id: 'taxonomy',
    number: '04',
    title: 'Taxonómia-registry: jelentés és nézet',
    subtitle: 'Admin által konfigurált dimenziók, ikonok és gyűjtemények',
    icon: Layers,
    accent: 'text-amber-300',
    border: 'border-amber-300',
    panel: 'bg-amber-300/10',
    description: 'A három elsődleges dimenzió — iparág, technológia és célcsoport/szerepkör — nem a felületben van beégetve. Az admin registryben kezeli a neveket, term-slugokat, ikonokat, színeket, aliasokat, szűrési és csoportosítási szabályokat, valamint a smart collectionöket.',
    facts: [
      'A fájl csak stabil tax_industry, tax_technology és tax_audience_role slugokat tárol.',
      'Az ikon és a címke a registryből jön, így központilag változtatható.',
      'A smart collection deklaratív szabály, nem futtat tetszőleges SQL-t vagy JavaScriptet.'
    ],
    snippet: `taxonomy_schema: 2\ntax_industry: [manufacturing]\ntax_technology: [obsidian, graph-rag, sql]\ntax_audience_role: [process-engineer]`
  },
  {
    id: 'projection',
    number: '05',
    title: 'Validált Vault → SQLite / RAG vetület',
    subtitle: 'Kereshető index, taxon-hozzárendelés és ellenőrzött szinkron',
    icon: HardDrive,
    accent: 'text-sky-300',
    border: 'border-sky-300',
    panel: 'bg-sky-300/10',
    description: 'A szinkron validálja a frontmattert és az azonosítókat, majd a Markdownból keresési, chunk-, wikilink- és taxonómia-vetületet épít. A SQLite és a RAG gyors keresési réteg: nem írja felül az ERP vagy a vault elsődleges igazságát.',
    facts: [
      'Hibás frontmatter, duplikált slug vagy dokumentumazonosító esetén fail-closed működés.',
      'A RAG heading-alapú chunkokat és visszakereshető bizonyítékot kap.',
      'A közös taxon lekérdezéskor képezhető, nem N² mesterséges dokumentumél.'
    ],
    snippet: `Vault sync\n  validate → index → chunk → FTS/RAG\n  ├─ taxonomy assignments\n  └─ author relation candidates`
  },
  {
    id: 'graph',
    number: '06',
    title: 'DB-first többrétegű multigráf',
    subtitle: 'Irányított élek, M:N tagság és korlátozott agent-bejárás',
    icon: Network,
    accent: 'text-fuchsia-300',
    border: 'border-fuchsia-300',
    panel: 'bg-fuchsia-300/10',
    description: 'A saját gráfok, csúcsok, éltípusok, irányok, súlyok, bizonyosságok, proveniencia és tagságok a gráf-registryben élnek. Egy csúcs több gráfba is beléphet másolás nélkül; az agent csak deklaratív, mélység- és csúcsszám-korlátos bejárást futtathat.',
    facts: [
      'Minden tárolt kapcsolat irányított ív; ↔ két párosított ív közös relation_group_id alatt.',
      'Párhuzamos, eltérő jelentésű élek megengedettek ugyanazon csúcspár között.',
      'A válasz megőrzi az útvonalat, irányt, éltípust, eredetet és bizonyítékot.'
    ],
    snippet: `e = (u, v, τ, w, c, p)\nstart_node_ids + direction + filters\nmax_depth ≤ 6 · max_nodes ≤ 250`
  },
  {
    id: 'workflow',
    number: '07',
    title: 'Workflow runtime: formális állapotgép',
    subtitle: 'Verziózott lépések, őrzött átmenetek és auditált futás',
    icon: Workflow,
    accent: 'text-rose-300',
    border: 'border-rose-300',
    panel: 'bg-rose-300/10',
    description: 'A workflow egy saját, DB-first végrehajtási modell, amely egy meglévő gráfhoz kapcsolható, de nem teszi automatikusan futtathatóvá annak összes tudásélét. A definíció kezdő- és végállapotokat, emberi, agent- vagy szolgáltatáslépéseket, valamint irányított átmeneteket ír le; egy futás minden döntése külön audit-esemény.',
    facts: [
      'Egy hurok két vagy több irányított átmenetből áll, ezért a visszalépés is ellenőrizhető szabály.',
      'A guard csak validált adat-AST lehet; nyers JavaScript, SQL vagy korlátlan rekurzió nem futtatható.',
      'Minden átmenethez engedélyezett aktortípus, bizonyítékigény és iterációs korlát rendelhető; a teljes futást külön lépésszám-plafon védi.'
    ],
    snippet: `W = (S, s₀, F, T, Γ)\nVERIFY ──approved──▶ COMPLETE\nVERIFY ──rework, max=2──▶ DRAFT\nactor: human | agent | service\ninstance: status + evidence + append-only events`
  }
];

const OWNERSHIP_LAYERS = [
  {
    name: 'SQL / ERP',
    owner: 'üzleti igazság',
    icon: Database,
    accent: 'text-neonCyan',
    border: 'border-neonCyan/35',
    details: 'Projekt, stabil ID, kötelező strukturális mezők',
    boundary: 'Nem őrzi a szakmai magyarázat szabad szövegét.'
  },
  {
    name: 'Obsidian Markdown',
    owner: 'emberi tartalom',
    icon: FileText,
    accent: 'text-neonMagenta',
    border: 'border-neonMagenta/35',
    details: 'Szakmai törzs, bizonyíték, wikilink és CA:RELATIONS',
    boundary: 'Nem tárol gazdag gráfobjektumot vagy admin-konfigurációt.'
  },
  {
    name: 'Taxonómia-registry',
    owner: 'felületi jelentés',
    icon: Layers,
    accent: 'text-amber-300',
    border: 'border-amber-300/35',
    details: 'Termek, aliasok, ikonok, színek, filterek és smart collectionök',
    boundary: 'Nem írja át a dokumentum törzsét.'
  },
  {
    name: 'Gráf-registry',
    owner: 'kapcsolati igazság',
    icon: GitBranch,
    accent: 'text-plasmaGreen',
    border: 'border-plasmaGreen/35',
    details: 'Gráfok, csúcsok, éltípusok, irányok, M:N tagság és audit',
    boundary: 'Csak a checksumos CA:SYSTEM vetületet írhatja a vaultba.'
  },
  {
    name: 'Workflow runtime',
    owner: 'folyamatállapot',
    icon: Workflow,
    accent: 'text-rose-300',
    border: 'border-rose-300/35',
    details: 'Verziók, lépések, őrzött átmenetek, futások, bizonyítékok és események',
    boundary: 'Nem következtet végrehajtható átmenetre szabad wikilinkből vagy gráfélből.'
  },
  {
    name: 'SQLite / RAG',
    owner: 'keresési vetület',
    icon: Cpu,
    accent: 'text-sky-300',
    border: 'border-sky-300/35',
    details: 'Chunkok, FTS/RAG találatok és bizonyíték-alapú kontextus',
    boundary: 'Nem szerzői és nem üzleti forrásrendszer.'
  }
];

const SAFEGUARDS = [
  {
    title: 'FORRÁSGAZDAI HATÁR',
    icon: ShieldCheck,
    accent: 'text-plasmaGreen',
    content: 'A rendszer nem versenyezteti az adatforrásokat: minden adattípusnak kijelölt tulajdonosa van, a többi réteg csak ellenőrzött vetületet kap.'
  },
  {
    title: 'OBSIDIAN-BIZTOS PROPERTY-K',
    icon: FileText,
    accent: 'text-neonCyan',
    content: 'A rendszer-owned ca_* és tax_* mezők lapos scalarok vagy listák. Nincs nested gráfobjektum, így nem alakul át [object Object] szöveggé.'
  },
  {
    title: 'BIZTONSÁGOS BEJÁRÁS',
    icon: Workflow,
    accent: 'text-neonMagenta',
    content: 'Az agent nem futtat nyers SQL-t vagy korlátlan rekurziót: a validált query-AST irányt, típust, eredetet, mélységet és csúcsszámot korlátoz.'
  },
  {
    title: 'KORLÁTOS CIKLUS',
    icon: Workflow,
    accent: 'text-rose-300',
    content: 'A visszalépés nem végtelen hurok: minden ciklushoz iterációs plafon, a teljes futáshoz lépésszám-korlát, az átmenethez pedig guard, jogosult szerepkör és szükség esetén bizonyíték tartozik.'
  },
  {
    title: 'DRIFT ÉS RÉSZLEGES ÍRÁS ELLEN',
    icon: Lock,
    accent: 'text-amber-300',
    content: 'A CA:SYSTEM blokk checksumos; kézi módosítása driftet jelez. A vault-sync hibánál fail-closed, ezért nem marad félkész index vagy néma felülírás.'
  }
];

function TacticalSectionHeading({ id, number, icon, accent, title, kicker }) {
  const headingIcon = React.createElement(icon, { size: 17 });

  return (
    <div className="mb-6 flex flex-col gap-3 border-b-2 border-slate-900 pb-3 dark:border-white/10 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 border border-current/35 p-2 ${accent}`} aria-hidden="true">{headingIcon}</span>
        <div>
          <p className={`font-mono text-[9px] font-black uppercase tracking-[.2em] ${accent}`}>SECTOR_{number} // {kicker}</p>
          <h2 id={id} className="mt-1 font-headline text-xl font-black uppercase italic tracking-wide text-slate-900 dark:text-white sm:text-2xl">{title}</h2>
        </div>
      </div>
    </div>
  );
}

function OwnershipCard({ layer, index }) {
  const Icon = layer.icon;
  return (
    <article className={`relative min-w-0 border ${layer.border} bg-slate-950/60 p-4 shadow-[3px_3px_0_#0f172a] dark:shadow-none`}>
      <span className="absolute right-3 top-3 font-mono text-[9px] font-black text-slate-600">0{index + 1}</span>
      <Icon size={17} className={layer.accent} aria-hidden="true" />
      <h3 className="mt-3 font-headline text-sm font-black uppercase text-slate-100">{layer.name}</h3>
      <p className={`mt-1 font-mono text-[9px] font-black uppercase tracking-[.14em] ${layer.accent}`}>{layer.owner}</p>
      <p className="mt-3 font-body text-xs leading-relaxed text-slate-300">{layer.details}</p>
      <p className="mt-3 border-t border-white/10 pt-3 font-mono text-[9px] leading-relaxed text-slate-500">HATÁR: {layer.boundary}</p>
    </article>
  );
}

const SystemArchitectureView = () => {
  const [selectedStepId, setSelectedStepId] = useState(PIPELINE_STEPS[0].id);
  const selectedStep = useMemo(() => (
    PIPELINE_STEPS.find(step => step.id === selectedStepId) || PIPELINE_STEPS[0]
  ), [selectedStepId]);
  const SelectedIcon = selectedStep.icon;

  return (
    <div className="min-h-screen bg-[var(--bg-main)] pb-20 pt-24 font-body text-[var(--text-main)] transition-colors duration-200">
      <CyberSEO
        title="SQL–Markdown–GraphRAG rendszerarchitektúra // Szántói Gábor"
        description="A Cyber-Architect SQL-vezérelt Markdown, konfigurálható taxonómia, RAG és adatbázis-első, irányított többrétegű gráfmodellje."
      />

      <div className="mx-auto max-w-7xl px-4 font-mono sm:px-6">
        <header className="relative mb-14 overflow-hidden border-2 border-slate-900 bg-white p-5 shadow-[6px_6px_0_#0f172a] dark:border-white/10 dark:bg-[#06111d] dark:shadow-[0_0_40px_rgba(0,255,255,0.08)] sm:p-8">
          <div className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(0,251,251,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(0,251,251,.06)_1px,transparent_1px),radial-gradient(circle_at_80%_16%,rgba(255,0,255,.2),transparent_28rem)] [background-size:28px_28px,28px_28px,auto]" aria-hidden="true" />
          <div className="relative">
            <p className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[.18em] text-neonCyan sm:text-[10px]">
              <span className="inline-block h-2.5 w-2.5 animate-pulse bg-neonCyan" aria-hidden="true" />
              CYBER-ARCHITECT // CANONICAL SYSTEM BLUEPRINT // V2
            </p>

            <h1 className="mt-4 max-w-5xl font-headline text-3xl font-black uppercase italic leading-[.93] tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl">
              SQL-vezérelt tudásrendszer.<br />
              <span className="text-neonCyan">Nem fájltár, hanem ellenőrzött kapcsolati modell.</span>
            </h1>

            <p className="mt-5 max-w-4xl font-body text-sm leading-relaxed text-slate-700 dark:text-slate-300 sm:text-base">
              Az üzleti struktúra az SQL/ERP-ben indul, a mérnöki gondolat az Obsidian vaultban marad,
              a taxonómia és a saját gráfok pedig adatbázisban karbantartott, auditálható registryk.
              A RAG és a portál ezekből épít gyors, visszakövethető vetületet.
            </p>

            <div className="mt-6 grid gap-2 border-y border-slate-300 py-4 dark:border-white/10 sm:grid-cols-2 xl:grid-cols-4">
              <div className="flex min-w-0 items-center gap-3"><Database size={15} className="shrink-0 text-neonCyan" aria-hidden="true" /><span className="text-[10px] font-black uppercase tracking-[.12em] text-slate-700 dark:text-slate-300">STRUCTURAL_TRUTH <b className="text-neonCyan">// SQL</b></span></div>
              <div className="flex min-w-0 items-center gap-3"><FileText size={15} className="shrink-0 text-neonMagenta" aria-hidden="true" /><span className="text-[10px] font-black uppercase tracking-[.12em] text-slate-700 dark:text-slate-300">HUMAN_CONTEXT <b className="text-neonMagenta">// VAULT</b></span></div>
              <div className="flex min-w-0 items-center gap-3"><GitBranch size={15} className="shrink-0 text-plasmaGreen" aria-hidden="true" /><span className="text-[10px] font-black uppercase tracking-[.12em] text-slate-700 dark:text-slate-300">RELATION_TRUTH <b className="text-plasmaGreen">// GRAPH DB</b></span></div>
              <div className="flex min-w-0 items-center gap-3"><Workflow size={15} className="shrink-0 text-rose-300" aria-hidden="true" /><span className="text-[10px] font-black uppercase tracking-[.12em] text-slate-700 dark:text-slate-300">PROCESS_TRUTH <b className="text-rose-300">// WORKFLOW DB</b></span></div>
            </div>

            <nav aria-label="Rendszerarchitektúra szakaszai" className="mt-6 flex flex-wrap gap-2 text-[10px] font-headline font-black uppercase">
              <a href="#pipeline" className="border border-neonCyan bg-neonCyan px-3 py-2 text-black transition-colors hover:bg-white">Adatút ↓</a>
              <a href="#ownership" className="border border-neonMagenta/70 px-3 py-2 text-neonMagenta transition-colors hover:bg-neonMagenta hover:text-white">Tulajdonosi rétegek ↓</a>
              <a href="#project-graph" className="border border-plasmaGreen/70 px-3 py-2 text-plasmaGreen transition-colors hover:bg-plasmaGreen hover:text-black">Projektgráf ↓</a>
              <a href="#workflows" className="border border-rose-300/70 px-3 py-2 text-rose-300 transition-colors hover:bg-rose-300 hover:text-black">Workflow ↓</a>
              <a href="#safeguards" className="border border-amber-300/70 px-3 py-2 text-amber-300 transition-colors hover:bg-amber-300 hover:text-black">Korlátok ↓</a>
              <Link to="/graph" className="border border-white/20 bg-slate-950/70 px-3 py-2 text-slate-200 transition-colors hover:border-neonCyan hover:text-neonCyan">Publikus gráfnézet →</Link>
            </nav>
          </div>
        </header>

        <section id="pipeline" aria-labelledby="pipeline-title" className="mb-20 scroll-mt-28">
          <TacticalSectionHeading id="pipeline-title" number="01" icon={Workflow} accent="text-neonCyan" kicker="ADATÚT" title="Ellenőrzött adatáramlás a létrehozástól a bejárásig" />

          <p className="mb-5 max-w-4xl font-body text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            Minden lépés megőrzi a saját adatgazdáját. A következő állomásokat válaszd ki a részletes szerződésükhöz.
          </p>

          <div aria-label="Rendszerfolyamat lépései" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
            {PIPELINE_STEPS.map(step => {
              const Icon = step.icon;
              const isSelected = selectedStep.id === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  aria-pressed={isSelected}
                  aria-controls="pipeline-inspector"
                  onClick={() => setSelectedStepId(step.id)}
                  className={`group min-h-32 border p-3 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${isSelected ? `${step.border} ${step.panel} shadow-[3px_3px_0_#0f172a]` : 'border-slate-300 bg-white hover:border-slate-500 dark:border-white/10 dark:bg-slate-950/50 dark:hover:border-white/40'}`}
                >
                  <span className="flex items-center justify-between"><span className={`font-mono text-[10px] font-black ${step.accent}`}>{step.number}</span><Icon size={15} className={step.accent} aria-hidden="true" /></span>
                  <span className="mt-4 block font-headline text-xs font-black uppercase leading-tight text-slate-900 dark:text-white">{step.title}</span>
                  <span className="mt-2 block font-mono text-[8px] font-bold uppercase leading-relaxed text-slate-500">{step.subtitle}</span>
                </button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            <motion.article
              id="pipeline-inspector"
              key={selectedStep.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18 }}
              className={`mt-5 border-2 ${selectedStep.border} bg-white p-5 shadow-[6px_6px_0_#0f172a] dark:bg-slate-950/80 dark:shadow-none sm:p-7`}
            >
              <div className="flex flex-col gap-4 border-b border-slate-300 pb-4 dark:border-white/10 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`shrink-0 border ${selectedStep.border} ${selectedStep.panel} p-3`}><SelectedIcon size={22} className={selectedStep.accent} aria-hidden="true" /></span>
                  <div>
                    <p className={`font-mono text-[9px] font-black uppercase tracking-[.18em] ${selectedStep.accent}`}>STAGE_{selectedStep.number} // {selectedStep.subtitle}</p>
                    <h3 className="mt-1 font-headline text-xl font-black uppercase text-slate-950 dark:text-white sm:text-2xl">{selectedStep.title}</h3>
                  </div>
                </div>
                <span className="w-fit border border-slate-300 bg-slate-100 px-2 py-1 font-mono text-[9px] font-bold text-slate-600 dark:border-white/15 dark:bg-black/30 dark:text-slate-400">OWNER-BOUNDARY ACTIVE</span>
              </div>

              <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,.82fr)]">
                <div>
                  <p className="font-body text-sm leading-relaxed text-slate-700 dark:text-slate-300">{selectedStep.description}</p>
                  <ul className="mt-5 space-y-2 border-l-2 border-slate-300 pl-4 font-body text-xs leading-relaxed text-slate-600 dark:border-white/15 dark:text-slate-400">
                    {selectedStep.facts.map(fact => <li key={fact} className="flex gap-2"><CheckCircle2 size={13} className={`mt-0.5 shrink-0 ${selectedStep.accent}`} aria-hidden="true" /><span>{fact}</span></li>)}
                  </ul>
                </div>
                <div className="min-w-0">
                  <p className={`mb-2 flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[.16em] ${selectedStep.accent}`}><Code2 size={13} aria-hidden="true" /> ILLUSZTRATÍV SZERZŐDÉS</p>
                  <pre className="overflow-x-auto border border-slate-800 bg-[#050814] p-4 font-mono text-[11px] leading-relaxed text-slate-200"><code>{selectedStep.snippet}</code></pre>
                </div>
              </div>
            </motion.article>
          </AnimatePresence>
        </section>

        <section id="ownership" aria-labelledby="ownership-title" className="mb-20 scroll-mt-28">
          <TacticalSectionHeading id="ownership-title" number="02" icon={Server} accent="text-neonMagenta" kicker="OWNERSHIP" title="Hat réteg, egyértelmű felelősséggel" />
          <div className="relative overflow-hidden border border-white/10 bg-[#06111d] p-4 sm:p-5">
            <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:5rem_100%]" aria-hidden="true" />
            <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {OWNERSHIP_LAYERS.map((layer, index) => <OwnershipCard key={layer.name} layer={layer} index={index} />)}
            </div>
          </div>
          <p className="mt-4 border-l-2 border-neonMagenta bg-neonMagenta/5 px-4 py-3 font-mono text-[10px] leading-relaxed text-slate-500">
            Nincs „egy nagy adatbázis”: az azonosság és a felelősség ott marad, ahol értelmezhető; a rendszer kontrolláltan épít belőle keresési vagy megjelenítési vetületet.
          </p>
        </section>

        <section id="project-graph" aria-labelledby="project-graph-title" className="mb-20 scroll-mt-28">
          <TacticalSectionHeading id="project-graph-title" number="03" icon={GitBranch} accent="text-plasmaGreen" kicker="MULTIGRAPH" title="Projekt → epic → task: nem másolat, hanem irányított kapcsolat" />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(19rem,.6fr)]">
            <article className="relative overflow-hidden border-2 border-plasmaGreen/65 bg-[#07141a] p-5 shadow-[0_0_35px_rgba(128,255,0,.08)] sm:p-6">
              <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_10%_15%,rgba(128,255,0,.17),transparent_14rem),linear-gradient(rgba(128,255,0,.07)_1px,transparent_1px),linear-gradient(90deg,rgba(128,255,0,.07)_1px,transparent_1px)] [background-size:auto,30px_30px,30px_30px]" aria-hidden="true" />
              <div className="relative">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[.18em] text-plasmaGreen"><Network size={14} aria-hidden="true" /> PROJECT STRUCTURE // ILLUSTRATIVE GRAPH LAYER</p>
                    <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-slate-300">Egy projektstruktúra a Graph Controlban saját gráfként kezelhető. A <code className="text-plasmaGreen">contains</code> éltípus akár szigorúan <code>project → epic</code> és <code>epic → task</code> párokra korlátozható.</p>
                  </div>
                  <span className="border border-plasmaGreen/40 bg-plasmaGreen/10 px-2 py-1 font-mono text-[9px] font-black text-plasmaGreen">project/prj-2026-884</span>
                </div>

                <figure data-testid="project-epic-task-model" aria-label="Példa projekt, epic és task irányított gráfkapcsolatára" className="mt-7 grid gap-3 md:grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)_5rem_minmax(0,1fr)] md:items-stretch">
                  <article className="min-w-0 border border-neonCyan/60 bg-[#07111e]/95 p-4">
                    <p className="font-mono text-[9px] font-black uppercase tracking-[.16em] text-neonCyan">GLOBAL NODE // PROJECT</p>
                    <h3 className="mt-2 font-headline text-lg font-black uppercase text-white">PRJ-2026-884</h3>
                    <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-400">SQL projektazonosító<br />+ vault index.md</p>
                  </article>
                  <div className="flex items-center justify-center gap-2 py-1 text-center md:flex-col md:py-0" aria-label="contains kapcsolat előre">
                    <span className="font-mono text-[9px] font-black uppercase text-plasmaGreen">contains</span>
                    <ArrowRight size={25} className="text-plasmaGreen" aria-hidden="true" />
                  </div>
                  <article className="min-w-0 border border-neonMagenta/60 bg-[#140817]/80 p-4">
                    <p className="font-mono text-[9px] font-black uppercase tracking-[.16em] text-neonMagenta">GLOBAL NODE // EPIC</p>
                    <h3 className="mt-2 font-headline text-lg font-black uppercase text-white">EPIC-014</h3>
                    <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-400">Mérföldkő vagy képesség<br />+ saját dokumentáció</p>
                  </article>
                  <div className="flex items-center justify-center gap-2 py-1 text-center md:flex-col md:py-0" aria-label="contains kapcsolat előre">
                    <span className="font-mono text-[9px] font-black uppercase text-plasmaGreen">contains</span>
                    <ArrowRight size={25} className="text-plasmaGreen" aria-hidden="true" />
                  </div>
                  <article className="min-w-0 border border-amber-300/65 bg-[#171207]/85 p-4">
                    <p className="font-mono text-[9px] font-black uppercase tracking-[.16em] text-amber-300">GLOBAL NODE // TASK</p>
                    <h3 className="mt-2 font-headline text-lg font-black uppercase text-white">TASK-042</h3>
                    <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-400">Végrehajtható munka<br />+ függőségek és bizonyítékok</p>
                  </article>
                </figure>

                <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3">
                  <p className="font-mono text-[9px] leading-relaxed text-slate-400"><b className="text-neonCyan">1 globális azonosság:</b> a TASK-042 nem kap új rekordot minden nézetben.</p>
                  <p className="font-mono text-[9px] leading-relaxed text-slate-400"><b className="text-neonMagenta">M:N tagság:</b> ugyanaz a task beléphet az <code>impact/production</code> gráfba is.</p>
                  <p className="font-mono text-[9px] leading-relaxed text-slate-400"><b className="text-amber-300">Párhuzamos élek:</b> a <code>contains</code> mellett <code>depends_on</code> vagy <code>blocks</code> is létezhet.</p>
                </div>
              </div>
            </article>

            <aside className="border-2 border-neonMagenta/50 bg-slate-950/80 p-5">
              <p className="font-mono text-[9px] font-black uppercase tracking-[.18em] text-neonMagenta">EDGE SEMANTICS // DIRECTION IS DATA</p>
              <dl className="mt-4 space-y-3 font-mono text-[10px] leading-relaxed">
                <div className="border-l-2 border-plasmaGreen pl-3"><dt className="font-black text-plasmaGreen">A → B</dt><dd className="mt-1 text-slate-400">Egy explicit, állított irányú kapcsolat.</dd></div>
                <div className="border-l-2 border-neonCyan pl-3"><dt className="font-black text-neonCyan">A ↔ B</dt><dd className="mt-1 text-slate-400">Két párosított ív közös relation_group_id alatt; irányonként külön bizonyosság is lehet.</dd></div>
                <div className="border-l-2 border-amber-300 pl-3"><dt className="font-black text-amber-300">INVERSE TYPE</dt><dd className="mt-1 text-slate-400">A <code>contains</code> inverz nézete lehet <code>part_of</code>, de ez nem külön, bizonyítatlan tény.</dd></div>
                <div className="border-l-2 border-neonMagenta pl-3"><dt className="font-black text-neonMagenta">EDGE METADATA</dt><dd className="mt-1 text-slate-400">Súly, bizonyosság, költség, időablak, eredet és bizonyíték a DB-ben marad.</dd></div>
              </dl>
              <Link to="/graph" className="mt-5 inline-flex min-h-10 items-center gap-2 border border-neonMagenta px-3 font-headline text-xs font-black uppercase text-neonMagenta transition-colors hover:bg-neonMagenta hover:text-white"><Network size={14} aria-hidden="true" /> Gráfrétegek megnyitása</Link>
            </aside>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <article className="border border-white/15 bg-black/20 p-4">
              <p className="flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[.16em] text-neonCyan"><FileText size={13} aria-hidden="true" /> Markdown szerzői kapcsolat</p>
              <pre className="mt-3 overflow-x-auto border border-white/10 bg-[#050814] p-3 font-mono text-[10px] leading-relaxed text-slate-200"><code>{`<!-- CA:RELATIONS:BEGIN v1 -->\n- depends_on → [[TASK-004]] · graph: project/prj-2026-884\n- related_to ↔ [[EPIC-002]] · graphs: project/prj-2026-884, impact/production\n<!-- CA:RELATIONS:END -->`}</code></pre>
            </article>
            <article className="border border-white/15 bg-black/20 p-4">
              <p className="flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[.16em] text-plasmaGreen"><Workflow size={13} aria-hidden="true" /> Agent számára biztonságos kérdés</p>
              <p className="mt-3 font-body text-xs leading-relaxed text-slate-300">„Mi blokkolja a <code>TASK-042</code> feladatot ebben a projektgráfban?” A válasz kizárólag az engedélyezett rétegben, irány- és éltípus-szűrővel, maximum 6 mélységig és 250 csúcsig járhat be.</p>
              <p className="mt-3 font-mono text-[9px] text-slate-500">A válasz útvonalat és provenienciát ad — nem kitalált relációt.</p>
            </article>
          </div>
        </section>

        <section id="workflows" aria-labelledby="workflows-title" className="mb-20 scroll-mt-28">
          <TacticalSectionHeading id="workflows-title" number="04" icon={Workflow} accent="text-rose-300" kicker="STATE MACHINE" title="Követhető emberi és agent workflow, nem automatikus gráffuttatás" />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,.55fr)]">
            <article className="relative overflow-hidden border-2 border-rose-300/60 bg-[#170d18] p-5 shadow-[0_0_35px_rgba(253,164,175,.08)] sm:p-6">
              <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_10%_15%,rgba(253,164,175,.18),transparent_14rem),linear-gradient(rgba(253,164,175,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(253,164,175,.06)_1px,transparent_1px)] [background-size:auto,30px_30px,30px_30px]" aria-hidden="true" />
              <div className="relative">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[.18em] text-rose-300"><Workflow size={14} aria-hidden="true" /> WORKFLOW DEFINITION // ATTACHED TO A GRAPH</p>
                    <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-slate-300">A workflow definíció egy kiválasztott gráfhoz kapcsolható, így projekt-, epic- és task-csúcsokkal értelmezhető. A futtatási átmenetek mégsem a gráf szabad élei: a rendszer saját, verziózott állapotgépében szerepelnek.</p>
                  </div>
                  <span className="border border-rose-300/40 bg-rose-300/10 px-2 py-1 font-mono text-[9px] font-black text-rose-300">W = (S, s₀, F, T, Γ)</span>
                </div>

                <figure data-testid="workflow-state-machine-model" aria-label="Példa emberi és agent workflow irányított állapotgépére" className="mt-7 grid gap-3 lg:grid-cols-[minmax(0,1fr)_4rem_minmax(0,1fr)_4rem_minmax(0,1fr)_4rem_minmax(0,1fr)] lg:items-stretch">
                  <article className="min-w-0 border border-neonCyan/60 bg-[#07111e]/95 p-4">
                    <p className="font-mono text-[9px] font-black uppercase tracking-[.16em] text-neonCyan">START // HUMAN</p>
                    <h3 className="mt-2 font-headline text-base font-black uppercase text-white">DRAFT</h3>
                    <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-400">bizonyíték vagy leírás előkészítése</p>
                  </article>
                  <div className="flex items-center justify-center gap-2 py-1 text-center lg:flex-col lg:py-0" aria-label="beküldés átmenet előre">
                    <span className="font-mono text-[9px] font-black uppercase text-rose-300">submit</span>
                    <ArrowRight size={23} className="text-rose-300" aria-hidden="true" />
                  </div>
                  <article className="min-w-0 border border-rose-300/60 bg-[#1c101d]/95 p-4">
                    <p className="font-mono text-[9px] font-black uppercase tracking-[.16em] text-rose-300">TASK // AGENT</p>
                    <h3 className="mt-2 font-headline text-base font-black uppercase text-white">VERIFY</h3>
                    <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-400">guard + evidence ellenőrzés</p>
                  </article>
                  <div className="flex items-center justify-center gap-2 py-1 text-center lg:flex-col lg:py-0" aria-label="jóváhagyás átmenet előre">
                    <span className="font-mono text-[9px] font-black uppercase text-plasmaGreen">approved</span>
                    <ArrowRight size={23} className="text-plasmaGreen" aria-hidden="true" />
                  </div>
                  <article className="min-w-0 border border-amber-300/65 bg-[#171207]/90 p-4">
                    <p className="font-mono text-[9px] font-black uppercase tracking-[.16em] text-amber-300">DECISION // HUMAN</p>
                    <h3 className="mt-2 font-headline text-base font-black uppercase text-white">REVIEW</h3>
                    <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-400">elfogadás vagy kontrollált visszaküldés</p>
                  </article>
                  <div className="flex items-center justify-center gap-2 py-1 text-center lg:flex-col lg:py-0" aria-label="lezárás átmenet előre">
                    <span className="font-mono text-[9px] font-black uppercase text-plasmaGreen">complete</span>
                    <ArrowRight size={23} className="text-plasmaGreen" aria-hidden="true" />
                  </div>
                  <article className="min-w-0 border border-plasmaGreen/60 bg-[#081707]/90 p-4">
                    <p className="font-mono text-[9px] font-black uppercase tracking-[.16em] text-plasmaGreen">END // TERMINAL</p>
                    <h3 className="mt-2 font-headline text-base font-black uppercase text-white">COMPLETE</h3>
                    <p className="mt-2 font-mono text-[10px] leading-relaxed text-slate-400">változtathatatlan eseménylánc és eredmény</p>
                  </article>
                </figure>

                <div className="mt-4 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3">
                  <p className="font-mono text-[9px] leading-relaxed text-slate-400"><b className="text-rose-300">Őrzött transition:</b> az <code>approved</code> csak a kijelölt source/target, szerepkör és guard mellett léphet át.</p>
                  <p className="font-mono text-[9px] leading-relaxed text-slate-400"><b className="text-amber-300">Hurok:</b> a <code>rework</code> visszalépés külön irányított transition, <code>max_iterations</code> korláttal.</p>
                  <p className="font-mono text-[9px] leading-relaxed text-slate-400"><b className="text-plasmaGreen">Követhetőség:</b> minden start, pause, transition és lezárás append-only eseményként marad meg.</p>
                </div>
              </div>
            </article>

            <aside className="border-2 border-rose-300/50 bg-slate-950/80 p-5">
              <p className="font-mono text-[9px] font-black uppercase tracking-[.18em] text-rose-300">WORKFLOW ≠ KNOWLEDGE EDGE</p>
              <dl className="mt-4 space-y-3 font-mono text-[10px] leading-relaxed">
                <div className="border-l-2 border-neonMagenta pl-3"><dt className="font-black text-neonMagenta">CA:RELATIONS</dt><dd className="mt-1 text-slate-400">Szerzői, tudásbeli állítás; importált gráfkapcsolat, nem futtatási utasítás.</dd></div>
                <div className="border-l-2 border-rose-300 pl-3"><dt className="font-black text-rose-300">TRANSITION</dt><dd className="mt-1 text-slate-400">Workflow-verzióhoz tartozó, explicit forrás- és célállapotú, jogosultság- és guard-kötött szabály.</dd></div>
                <div className="border-l-2 border-amber-300 pl-3"><dt className="font-black text-amber-300">A ↔ B</dt><dd className="mt-1 text-slate-400">A kétirányúság két külön ív/transition. A visszaút saját evidenciát és iterációs korlátot kap.</dd></div>
                <div className="border-l-2 border-plasmaGreen pl-3"><dt className="font-black text-plasmaGreen">AGENT ACCESS</dt><dd className="mt-1 text-slate-400">Az agent engedélyezett futást olvas vagy a rá kijelölt transitiont kísérli meg; külső eszközhívást ez a réteg önmagában nem indít.</dd></div>
              </dl>
            </aside>
          </div>
        </section>

        <section id="safeguards" aria-labelledby="safeguards-title" className="scroll-mt-28">
          <TacticalSectionHeading id="safeguards-title" number="05" icon={ShieldCheck} accent="text-amber-300" kicker="GUARDRAILS" title="A rugalmasságot szigorú szerződések tartják egyben" />
          <div className="grid gap-4 md:grid-cols-2">
            {SAFEGUARDS.map(item => {
              const Icon = item.icon;
              return (
                <article key={item.title} className="border-2 border-slate-900 bg-white p-5 shadow-[4px_4px_0_#0f172a] dark:border-white/10 dark:bg-slate-950/50 dark:shadow-none">
                  <Icon size={18} className={item.accent} aria-hidden="true" />
                  <h3 className={`mt-3 font-headline text-base font-black uppercase ${item.accent}`}>{item.title}</h3>
                  <p className="mt-2 font-body text-sm leading-relaxed text-slate-700 dark:text-slate-300">{item.content}</p>
                </article>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-4 border-l-4 border-neonCyan bg-neonCyan/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 font-mono text-[9px] font-black uppercase tracking-[.18em] text-neonCyan"><Sparkles size={14} aria-hidden="true" /> KÖVETKEZŐ KEZELHETŐ LÉPÉS</p>
              <p className="mt-2 max-w-3xl font-body text-sm leading-relaxed text-slate-700 dark:text-slate-300">Hozz létre egy projektgráfot, majd add hozzá az epic- és task-csúcsokat, a <code>contains</code>, <code>depends_on</code> és <code>blocks</code> éltípusokkal. Ezután a Workflow Studio-ban hozz létre külön definíciót és irányított transitionöket — a gráf jelentése és a folyamat futása így egyaránt tiszta marad.</p>
            </div>
            <Link to="/graph" className="inline-flex shrink-0 items-center justify-center gap-2 border-2 border-neonCyan bg-neonCyan px-4 py-3 font-headline text-xs font-black uppercase text-black transition-colors hover:bg-white"><Activity size={15} aria-hidden="true" /> Publikus gráfnézet <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default SystemArchitectureView;
