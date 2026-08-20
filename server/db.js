import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashPin } from './security/auth.js';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standardized Database directory (data/)
const dataDir = process.env.SQLITE_DATA_DIR || path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const defaultDbPath = path.join(dataDir, 'portfolio.sqlite');

// Tests must opt in to an isolated database. Failing closed here prevents a
// missing or misordered test setup from ever opening the developer database.
if (process.env.NODE_ENV === 'test' && !process.env.SQLITE_DB_PATH) {
  throw new Error('[DB_SAFETY] SQLITE_DB_PATH must point to an isolated database while NODE_ENV=test.');
}

export const dbPath = process.env.SQLITE_DB_PATH || defaultDbPath;
export const db = new Database(dbPath);

// Enable WAL mode for high concurrent performance
db.pragma('journal_mode = WAL');

const BLOG_POSTS_FTS_MIGRATION = 'blog_posts_fts';
const BLOG_POSTS_FTS_VERSION = 1;
const BLOG_POSTS_FTS_COLUMNS = [
  'title',
  'summary',
  'content',
  'category',
  'content_type',
  'dimensions'
];

const BLOG_POSTS_FTS_TABLE_SQL = `
  CREATE VIRTUAL TABLE blog_posts_fts USING fts5(
    title,
    summary,
    content,
    category,
    content_type,
    dimensions,
    tokenize='unicode61'
  )
`;

const BLOG_POSTS_FTS_TRIGGER_SQL = {
  blog_posts_ai: `
    CREATE TRIGGER blog_posts_ai AFTER INSERT ON blog_posts BEGIN
      INSERT INTO blog_posts_fts(rowid, title, summary, content, category, content_type, dimensions)
      VALUES (new.id, new.title, new.summary, new.content, new.category, new.content_type, new.dimensions);
    END
  `,
  blog_posts_ad: `
    CREATE TRIGGER blog_posts_ad AFTER DELETE ON blog_posts BEGIN
      DELETE FROM blog_posts_fts WHERE rowid = old.id;
    END
  `,
  blog_posts_au: `
    CREATE TRIGGER blog_posts_au AFTER UPDATE ON blog_posts BEGIN
      DELETE FROM blog_posts_fts WHERE rowid = old.id;
      INSERT INTO blog_posts_fts(rowid, title, summary, content, category, content_type, dimensions)
      VALUES (new.id, new.title, new.summary, new.content, new.category, new.content_type, new.dimensions);
    END
  `
};

function normalizeSchemaSql(sql) {
  return String(sql || '')
    .trim()
    .replace(/;$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function hasCurrentBlogPostsFtsSchema() {
  const table = db.prepare(`
    SELECT sql
    FROM sqlite_schema
    WHERE type = 'table' AND name = 'blog_posts_fts'
  `).get();

  if (normalizeSchemaSql(table?.sql) !== normalizeSchemaSql(BLOG_POSTS_FTS_TABLE_SQL)) {
    return false;
  }

  const columns = db.prepare('PRAGMA table_info(blog_posts_fts)').all().map(column => column.name);
  if (columns.length !== BLOG_POSTS_FTS_COLUMNS.length
      || columns.some((column, index) => column !== BLOG_POSTS_FTS_COLUMNS[index])) {
    return false;
  }

  const triggers = new Map(db.prepare(`
    SELECT name, sql
    FROM sqlite_schema
    WHERE type = 'trigger'
      AND name IN ('blog_posts_ai', 'blog_posts_ad', 'blog_posts_au')
  `).all().map(trigger => [trigger.name, normalizeSchemaSql(trigger.sql)]));

  return Object.entries(BLOG_POSTS_FTS_TRIGGER_SQL).every(([name, sql]) => (
    triggers.get(name) === normalizeSchemaSql(sql)
  ));
}

function ensureBlogPostsFtsSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      component TEXT PRIMARY KEY,
      version INTEGER NOT NULL CHECK (version > 0),
      applied_at TEXT NOT NULL
    );
  `);

  const appliedMigration = db.prepare(`
    SELECT version
    FROM schema_migrations
    WHERE component = ?
  `).get(BLOG_POSTS_FTS_MIGRATION);

  if (appliedMigration?.version > BLOG_POSTS_FTS_VERSION) {
    throw new Error(
      `[DB_MIGRATION] Unsupported ${BLOG_POSTS_FTS_MIGRATION} schema version: ${appliedMigration.version}`
    );
  }

  if (appliedMigration?.version === BLOG_POSTS_FTS_VERSION && hasCurrentBlogPostsFtsSchema()) {
    return;
  }

  const migrate = db.transaction(() => {
    db.exec(`
      DROP TRIGGER IF EXISTS blog_posts_ai;
      DROP TRIGGER IF EXISTS blog_posts_ad;
      DROP TRIGGER IF EXISTS blog_posts_au;
      DROP TABLE IF EXISTS blog_posts_fts;

      ${BLOG_POSTS_FTS_TABLE_SQL};
      ${BLOG_POSTS_FTS_TRIGGER_SQL.blog_posts_ai};
      ${BLOG_POSTS_FTS_TRIGGER_SQL.blog_posts_ad};
      ${BLOG_POSTS_FTS_TRIGGER_SQL.blog_posts_au};

      INSERT INTO blog_posts_fts(rowid, title, summary, content, category, content_type, dimensions)
      SELECT id, title, summary, content, category, content_type, dimensions
      FROM blog_posts;
    `);

    db.prepare(`
      INSERT INTO schema_migrations (component, version, applied_at)
      VALUES (?, ?, ?)
      ON CONFLICT(component) DO UPDATE SET
        version = excluded.version,
        applied_at = excluded.applied_at
    `).run(BLOG_POSTS_FTS_MIGRATION, BLOG_POSTS_FTS_VERSION, new Date().toISOString());
  });

  try {
    migrate();
  } catch (error) {
    throw new Error(
      `[DB_MIGRATION] Failed to migrate ${BLOG_POSTS_FTS_MIGRATION} to version ${BLOG_POSTS_FTS_VERSION}`,
      { cause: error }
    );
  }
}

export function initDatabase() {
  // 1. Settings Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // 2. Skills Table (Arsenal)
  db.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      icon TEXT NOT NULL,
      color TEXT NOT NULL,
      level TEXT NOT NULL,
      desc TEXT NOT NULL,
      query TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    );
  `);
  try {
    db.exec('ALTER TABLE skills ADD COLUMN query TEXT DEFAULT ""');
  } catch {
    // Column already exists on initialized databases.
  }

  // 3. Projects Table (The Grid)
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      desc TEXT DEFAULT '',
      img TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      status TEXT DEFAULT 'ARCHIVED',
      addr TEXT DEFAULT '0x00',
      sec_auth TEXT DEFAULT 'OMEGA',
      sort_order INTEGER DEFAULT 0
    );
  `);

  // 4. Knowledge Projects Table (Workspaces - Claude/ChatGPT style)
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT DEFAULT '',
      icon TEXT DEFAULT 'folder',
      color TEXT DEFAULT '#00FFFF',
      visibility TEXT DEFAULT 'public',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_projects_visibility ON knowledge_projects(visibility);
  `);

  // 5. Blog Posts & Knowledge Documents Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT DEFAULT 'prj_general',
      content_type TEXT DEFAULT 'blog',
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'SYSTEM_LOG',
      dimensions TEXT DEFAULT '{}',
      visibility TEXT DEFAULT 'public',
      audio_url TEXT DEFAULT '',
      drive_file_id TEXT DEFAULT '',
      drive_modified_time TEXT DEFAULT '',
      embedding TEXT DEFAULT '[]',
      read_time TEXT DEFAULT '4 MIN',
      created_at TEXT NOT NULL,
      published INTEGER DEFAULT 1
    );
  `);

  // Migration: Ensure new columns exist if table was already created
  try {
    const cols = db.prepare("PRAGMA table_info(blog_posts)").all().map(c => c.name);
    if (!cols.includes('content_type')) db.exec("ALTER TABLE blog_posts ADD COLUMN content_type TEXT DEFAULT 'blog'");
    if (!cols.includes('project_id')) db.exec("ALTER TABLE blog_posts ADD COLUMN project_id TEXT DEFAULT 'prj_general'");
    if (!cols.includes('dimensions')) db.exec("ALTER TABLE blog_posts ADD COLUMN dimensions TEXT DEFAULT '{}'");
    if (!cols.includes('visibility')) db.exec("ALTER TABLE blog_posts ADD COLUMN visibility TEXT DEFAULT 'public'");
    if (!cols.includes('audio_url')) db.exec("ALTER TABLE blog_posts ADD COLUMN audio_url TEXT DEFAULT ''");
    if (!cols.includes('video_url')) db.exec("ALTER TABLE blog_posts ADD COLUMN video_url TEXT DEFAULT ''");
    if (!cols.includes('drive_file_id')) db.exec("ALTER TABLE blog_posts ADD COLUMN drive_file_id TEXT DEFAULT ''");
    if (!cols.includes('drive_modified_time')) db.exec("ALTER TABLE blog_posts ADD COLUMN drive_modified_time TEXT DEFAULT ''");
    if (!cols.includes('embedding')) db.exec("ALTER TABLE blog_posts ADD COLUMN embedding TEXT DEFAULT '[]'");
  } catch (mErr) {
    // Migration safe check
  }


  // Create blog_posts indexes after migration
  const duplicateDriveSource = db.prepare(`
    SELECT TRIM(drive_file_id) AS normalized_drive_file_id, COUNT(*) AS duplicate_count
    FROM blog_posts
    WHERE TRIM(COALESCE(drive_file_id, '')) <> ''
    GROUP BY TRIM(drive_file_id)
    HAVING COUNT(*) > 1
    LIMIT 1
  `).get();
  if (duplicateDriveSource) {
    throw new Error('[DB_INTEGRITY] Duplicate non-empty drive_file_id values must be reconciled before startup.');
  }

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_blog_posts_content_type ON blog_posts(content_type);
    CREATE INDEX IF NOT EXISTS idx_blog_posts_project ON blog_posts(project_id);
    CREATE INDEX IF NOT EXISTS idx_blog_posts_visibility ON blog_posts(visibility);
    CREATE INDEX IF NOT EXISTS idx_blog_posts_published ON blog_posts(published);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_drive_file_id_unique
      ON blog_posts(TRIM(drive_file_id))
      WHERE TRIM(COALESCE(drive_file_id, '')) <> '';
  `);

  // 6. SQLite FTS5 Full-Text Search Virtual Table
  // Rebuild only for an unapplied version or when the recorded schema is damaged.
  ensureBlogPostsFtsSchema();

  // 7. Messages Table (Uplink)
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identity TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      read_status INTEGER DEFAULT 0
    );
  `);

  // 6. Admin Auth Table & Registered Agent API Keys
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      pin_code TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      role TEXT DEFAULT 'AGENT_EDITOR',
      permissions TEXT DEFAULT '["READ","WRITE","PUBLISH"]',
      status TEXT DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      last_used_at TEXT DEFAULT ''
    );
  `);

  // 7. Audit Logs Table (Change Tracking & Rollback Trail)
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      prev_state TEXT,
      new_state TEXT,
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // 8. Agent Messages & Handoff Table (Fast, Audited Multi-Agent Communication)
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      message_type TEXT DEFAULT 'handoff',
      status TEXT DEFAULT 'unread',
      related_link TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      read_at TEXT,
      archived_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_messages_recipient ON agent_messages(recipient);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_sender ON agent_messages(sender);
    CREATE INDEX IF NOT EXISTS idx_agent_messages_status ON agent_messages(status);
  `);

  // 9. Agent Terminals & Organizational Matrix Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_terminals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pod TEXT NOT NULL,
      lead_id TEXT,
      icon TEXT DEFAULT 'terminal',
      color TEXT DEFAULT 'var(--neon-cyan)',
      role_description TEXT NOT NULL,
      responsibilities TEXT DEFAULT '[]',
      delegates_to TEXT DEFAULT '[]',
      status TEXT DEFAULT 'ACTIVE',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_terminals_pod ON agent_terminals(pod);
    CREATE INDEX IF NOT EXISTS idx_agent_terminals_lead ON agent_terminals(lead_id);
  `);

  seedData();
}

function seedData() {
  // Bcrypt Hashed PIN: default 1337 or from config
  const authRow = db.prepare('SELECT * FROM auth WHERE id = 1').get();
  if (!authRow) {
    const hashedPin = hashPin(config.admin.defaultPin);
    db.prepare('INSERT INTO auth (id, pin_code) VALUES (1, ?)').run(hashedPin);
  } else if (!authRow.pin_code.startsWith('$2a$') && !authRow.pin_code.startsWith('$2b$')) {
    // Migration: upgrade plain text PIN to bcrypt hash
    const hashedPin = hashPin(authRow.pin_code);
    db.prepare('UPDATE auth SET pin_code = ? WHERE id = 1').run(hashedPin);
  }

  // Seed Settings
  const defaultSettings = {
    hero_status: 'RENDSZER: AKTÍV // AI & FOLYAMATAUTOMATIZÁCIÓ',
    hero_title: 'Szántói\nGábor.',
    hero_subtitle: 'Mérnöki szemléletű folyamatfejlesztő és AI integrátor. Szigetrendszerek összekötése, manuális adminisztráció kiváltása és biztonságos belső AI megoldások (RAG, API) bevezetése vállalati környezetben.',
    hero_btn_primary: 'KAPCSOLATFELVÉTEL',
    hero_btn_secondary: 'PROJEKTEK MEGTEKINTÉSE',
    diagnostics_title: 'Módszertan & Folyamat',
    diagnostics_subtitle: 'A technológia csak eszköz: először a vállalati működést és a szűk keresztmetszeteket vizsgáljuk meg, majd stabil, kód-alapú architektúrát építünk.',
    diagnostics_steps: JSON.stringify([
      { 
        id: '01', 
        title: 'Megértés & Folyamatvizsgálat', 
        color: '#00FFFF', 
        query: 'szigetrendszerek excel folyamatautomatizálás',
        blogHint: 'Szigetrendszerek & Excel kiváltása',
        docHint: 'Folyamatoptimalizálás Esettanulmány',
        text: 'Nem kezdek el vakon kódolni. Először feltárjuk a céges működés szűk keresztmetszeteit, a manuális feladatokat és az összekapcsolandó rendszereket.' 
      },
      { 
        id: '02', 
        title: 'Biztonságos Tervezés & Kód', 
        color: '#FF00FF', 
        query: 'zárt vállalati RAG adatbiztonság vektoros',
        blogHint: 'Vállalati AI & Adatbiztonság RAG',
        docHint: 'Hibrid RAG Vektoros Keresés & XAI',
        text: 'Python és .NET alapú megbízható megoldásokat és zárt belső AI-t építünk, így az üzleti adatok garantáltan a cégen belül maradnak.',
        offset: 'ml-0 md:ml-6'
      },
      { 
        id: '03', 
        title: 'Gyakorlati Bevezetés & Oktatás', 
        color: '#80FF00', 
        query: 'AutoCAD adatkinyerés automatizáció oktatás',
        blogHint: 'CAD automatizáció mérnöki szemmel',
        docHint: 'AutoCAD .NET C# Adatkinyerés',
        text: 'Nem hagyom magára a csapatot az új szoftverrel. A rendszert beüzemeljük, a munkatársakat betanítjuk, és biztosítjuk a zökkenőmentes használatot.',
        offset: 'ml-0 md:ml-12'
      }
    ]),
    uplink_title: 'Kapcsolat.',
    uplink_subtitle: 'Konzultáljunk a vállalati folyamatok automatizálásáról vagy egy zárt AI pilot indításáról.'
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');

  for (const [key, value] of Object.entries(defaultSettings)) {
    insertSetting.run(key, value);
  }

  // Seed / Refresh Skills
  const existingSkillsCount = db.prepare('SELECT count(*) as count FROM skills').get().count;
  if (existingSkillsCount === 0) {
    const insertSkill = db.prepare(`
      INSERT INTO skills (name, icon, color, level, desc, query, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const initialSkills = [
      { name: 'AI & BELSŐ TUDÁSBÁZISOK (RAG)', icon: 'psychology', color: 'var(--neon-cyan)', level: '0.95', desc: 'Céges dokumentumok és PDF-ek zárt, belső keresése és feldolgozása vektoradatbázisokkal és LLM-ekkel.', query: 'zárt vállalati RAG vektoros keresés embeddings', sort_order: 1 },
      { name: 'EGYEDI KÓD-ALAPÚ AUTOMATIZÁCIÓ', icon: 'terminal', color: 'var(--neon-cyan)', level: '0.98', desc: 'Python és C#/.NET alapú robusztus backendek, amelyek stabilabbak és biztonságosabbak a dobozos no-code eszközöknél.', query: 'folyamatautomatizálás python net sqlite', sort_order: 2 },
      { name: 'ADATELEMZÉS & DÖNTÉSTÁMOGATÁS', icon: 'query_stats', color: 'var(--neon-magenta)', level: '0.90', desc: 'SQL, Power BI és Python (Pandas) riportok és kimutatások a pontos vezetői döntések támogatásához.', query: 'adatbázis adatelemzés döntéstámogatás sqlite riport', sort_order: 3 },
      { name: 'MÉRNÖKI & CAD/CAM INTEGRÁCIÓ', icon: 'precision_manufacturing', color: 'var(--plasma-green)', level: '0.94', desc: 'Műszaki tervezőrendszerek (AutoCAD) és vállalatirányítási folyamatok közvetlen szoftveres összekapcsolása.', query: 'AutoCAD C# adatkinyerés mérnöki automatizáció', sort_order: 4 }
    ];

    for (const s of initialSkills) {
      insertSkill.run(s.name, s.icon, s.color, s.level, s.desc, s.query, s.sort_order);
    }
  }

  // Seed projects only for a brand-new/empty database. Initialization must
  // never replace records subsequently maintained through the admin UI.
  const existingProjectsCount = db.prepare('SELECT count(*) as count FROM projects').get().count;
  if (existingProjectsCount === 0) {
    const insertProject = db.prepare(`
      INSERT INTO projects (id, title, desc, img, tags, status, addr, sec_auth, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const initialProjects = [
    {
      id: "PRJ_01",
      title: "DOCCAPTURE // BELSŐ RAG",
      desc: "Céges belső dokumentumok és szerződések zárt kereső- és feldolgozó motorja, szigorú adatvédelemmel és pontos forrásmegjelöléssel.",
      img: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=1000&auto=format&fit=crop",
      tags: JSON.stringify(["PYTHON", "RAG MOTOR", "CHROMA DB", "LLM"]),
      status: "ÉLES RENDSZER",
      addr: "0x7F",
      sec_auth: "ZÁRT BELSŐ HÁLÓZAT",
      sort_order: 1
    },
    {
      id: "PRJ_02",
      title: "JOINERYTECH // CAD INTEGRÁCIÓ",
      desc: "Parametrikus CAD modellek, AutoCAD rajzok és gyártáselőkészítés összekapcsolása modern AI agent és MCP felülettel.",
      img: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?q=80&w=1000&auto=format&fit=crop",
      tags: JSON.stringify(["C# / .NET", "TYPESCRIPT", "MCP", "AUTOCAD"]),
      status: "ÉLES RENDSZER",
      addr: "0x8E",
      sec_auth: "MÉRNÖKI HÁTTÉR",
      sort_order: 2
    },
    {
      id: "PRJ_03",
      title: "ERP & CRM // FOLYAMATAUTOMATIZÁLÁS",
      desc: "Szigetrendszerek és Excel táblázatok közötti kézi adatrögzítést kiváltó, hibatűrő szinkronizációs backend.",
      img: "https://images.unsplash.com/photo-1509228468518-180dd4864904?q=80&w=1000&auto=format&fit=crop",
      tags: JSON.stringify(["PYTHON", "REST API", "POSTGRESQL", "SZINKRON"]),
      status: "BEVEZETVE",
      addr: "0x9D",
      sec_auth: "KÓD-ALAPÚ BIZTONSÁG",
      sort_order: 3
    },
    {
      id: "PRJ_04",
      title: "VEZETŐI DASHBOARD & ADATPIPELINE",
      desc: "Gyártási és üzleti adatok automatikus feldolgozása, tisztítása és élő döntéstámogató vezetői riportok építése.",
      img: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop",
      tags: JSON.stringify(["SQL", "POWER BI", "PANDAS", "ANALITIKA"]),
      status: "OPTIMALIZÁLVA",
      addr: "0xFA",
      sec_auth: "DÖNTÉSTÁMOGATÁS",
      sort_order: 4
    }
    ];

    for (const p of initialProjects) {
      insertProject.run(p.id, p.title, p.desc, p.img, p.tags, p.status, p.addr, p.sec_auth, p.sort_order);
    }
  }

  // Seed Knowledge Projects (Workspaces)
  const prjCount = db.prepare('SELECT count(*) as count FROM knowledge_projects').get().count;
  if (prjCount === 0) {
    const insertKp = db.prepare(`
      INSERT INTO knowledge_projects (id, name, slug, description, icon, color, visibility, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();

    const initialKps = [
      {
        id: 'prj_rag_enterprise',
        name: 'Zárt Vállalati RAG & AI Tudásbázis',
        slug: 'zart-vallalati-rag',
        description: 'Szigorúan belső hálózaton működő, adatvédelmi garanciákkal ellátott helyi nyelvi modellek és szemantikus keresőrendszerek.',
        icon: 'psychology',
        color: '#00FFFF',
        visibility: 'public',
        sort_order: 1
      },
      {
        id: 'prj_cad_auto',
        name: 'CAD / AutoCAD & Folyamatautomatizáció',
        slug: 'cad-folyamatautomatizacio',
        description: 'AutoCAD, DXF/DWG és gyártási dokumentáció kötegelt feldolgozása, C#/.NET és Python API integrációk.',
        icon: 'architecture',
        color: '#FF00FF',
        visibility: 'public',
        sort_order: 2
      },
      {
        id: 'prj_internal_notes',
        name: 'Belső Kutatási Jegyzetek & Kódminták',
        slug: 'belso-kutatas-kodmintak',
        description: 'Privát mérnöki jegyzetek, zárt kódminták, belső architektúra tervek és kísérleti algoritmusok.',
        icon: 'lock',
        color: '#80FF00',
        visibility: 'private',
        sort_order: 3
      }
    ];

    for (const kp of initialKps) {
      insertKp.run(kp.id, kp.name, kp.slug, kp.description, kp.icon, kp.color, kp.visibility, kp.sort_order, now, now);
    }
  }

  // Seed blog/knowledge content only when the table is completely empty.
  // Even a partially populated table belongs to the user and is preserved.
  const blogCount = db.prepare('SELECT count(*) as count FROM blog_posts').get().count;
  if (blogCount === 0) {
    const insertBlog = db.prepare(`
      INSERT INTO blog_posts (project_id, content_type, slug, title, summary, content, category, dimensions, visibility, audio_url, read_time, created_at, published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const initialItems = [
      // 1. DEDICATED BLOG POSTS (content_type: 'blog')
      {
        project_id: 'prj_rag_enterprise',
        content_type: 'blog',
        slug: 'vallalati-ai-adatbiztonsag-rag',
        title: 'Hogyan vezessünk be AI-t anélkül, hogy kiszivárognának a céges adatok?',
        summary: 'A zárt RAG (Retrieval-Augmented Generation) architektúra lényege: miért nem jutnak ki az üzleti titkok, árajánlatok és szerződések a nyilvános felhőbe, és hogyan építhető megbízható belső tudásbázis.',
        category: 'ADATBIZTONSÁG, ARCHITEKTÚRA & AI',
        dimensions: JSON.stringify({
          iparag: ['Gyártás', 'Pénzügy', 'KKV Iroda', 'Kereskedelem'],
          technologia: ['Local LLM', 'RAG', 'Python', 'SQLite FTS5', 'Vektoradatbázis'],
          celcsoport: ['COO / Operatív Vezető', 'IT Vezető', 'CEO / Ügyvezető'],
          fajdalompont: ['Adatbiztonság', 'GDPR', 'Tudásmenedzsment', 'Hallucináció']
        }),
        visibility: 'public',
        audio_url: 'https://actions.google.com/sounds/v1/ambiences/coffee_shop.ogg',
        read_time: '7 PERC',
        created_at: new Date().toISOString().split('T')[0],
        published: 1,
        content: `# Hogyan vezessünk be AI-t anélkül, hogy kiszivárognának a céges adatok?

A mesterséges intelligencia vállalati alkalmazásakor a legtöbb cégvezető és operatív vezető (COO) ugyanazzal a dilemmával szembesül: **hatalmas a nyomás a hatékonyságnövelésre**, ugyanakkor **valós és súlyos az adatszivárgás veszélye**.

Amikor a munkatársak saját szakállukra kezdenek el nyilvános AI eszközöket (pl. ingyenes webes ChatGPT-t vagy online fordítókat) használni, bizalmas árajánlatok, vevői szerződések, gyártási receptek vagy pénzügyi kimutatások kerülhetnek ki harmadik felek szervereire.

> [!WARNING]
> **A "Shadow AI" Kockázata:** Ha a vállalat nem biztosít hivatalos, biztonságos és ellenőrzött belső AI megoldást, a munkatársak titokban a nyilvános felhős eszközökhöz fognak nyúlni a napi feladatok gyorsítására. Ez azonnali GDPR-sértést és üzleti titokvesztést jelenthet.

---

## Mi a megoldás? A Zárt RAG Architektúra

A **RAG (Retrieval-Augmented Generation - Visszakereséssel Bővített Generálás)** a modern vállalati AI legbiztonságosabb és legpontosabb módszere. 

A RAG lényege, hogy a nagy nyelvi modellt (LLM) **nem tanítjuk újra** a céges adatokkal (ami drága és kockázatos lenne), hanem a kérdés pillanatában egy szigorúan elzárt, helyi belső adatbázisból keressük ki a releváns információkat, és kizárólag ezek alapján generálunk választ.

\`\`\`mermaid
graph TD
    A[Belső Céges Dokumentumok\\nPDF, Word, Excel, Szabályzatok] -->|Titkosított Beolvasás| B[Helyi Szövegfeldolgozó & Vektorizáló]
    B -->|Vektor Index & Szerepkörök| C[(Zárt Vállalati Tudástár\\nSQLite FTS5 + Vektortár)]
    
    D[Munkatárs Kérdése] -->|Jogosultság Ellenőrzés| E[Belső Keresőmotor]
    C -->|Pontos Szövegrészletek| E
    E -->|Csak a megtalált források| F[Zárt / Helyi Nyelvi Modell]
    F -->|Pontos válasz + Forráshivatkozás| G[Hiteles Válasz Munkatársnak\\npl. Szerződés_2025.pdf, 4. oldal]

    style A fill:#1e293b,stroke:#00FFFF,stroke-width:2px,color:#fff
    style C fill:#0f172a,stroke:#80FF00,stroke-width:2px,color:#fff
    style G fill:#090d1d,stroke:#FF00FF,stroke-width:2px,color:#fff
\`\`\`

---

## A Zárt RAG 4 Legfontosabb Üzleti Előnye

### 1. Garantált Adatvédelem (Zero Data Leakage)
A dokumentumok és kérdések nem kerülnek fel nyilvános modelltanítási adatbázisokba. A rendszer futhat teljesen helyi hálózaton (On-Premise) vagy szigorúan zárt, dedikált európai felhős környezetben.

### 2. Zéró Hallucináció (Forrás-visszakövethetőség)
A nyilvános AI-k egyik legnagyobb hibája, hogy magabiztosan kitalálnak nem létező tényeket. A RAG architektúrában a modell **csak a megtalált belső forrásokból válaszolhat**, és minden mondat mellé odatűzi a forrásdokumentum nevét és oldalszámát.

### 3. Szerepkör-alapú Hozzáférés-vezérlés (RBAC)
Nem minden munkatárs láthat mindent. A rendszer integrálódik a meglévő céges jogosultsági struktúrával: a pénzügyi adatokhoz csak a vezetés fér hozzá, míg a gyártási utasításokat az üzemmérnökök érik el.

### 4. Azonnali Frissíthetőség
Ha módosul egy munkajogi szabályzat vagy egy termék műszaki adatlapja, nem kell hetekig újratanítani az AI-t: elegendő az új PDF-et feltölteni a mappába, és a rendszer másodperceken belül az új adatok alapján válaszol.`
      },
      {
        project_id: 'prj_cad_auto',
        content_type: 'blog',
        slug: 'szigetrendszerek-es-excel-kivaltasa',
        title: 'Miért éri meg egyedi kód-alapú integrációval kiváltani a kézi Excel másolgatást?',
        summary: 'Hogyan spórolhat heti 20-40 munkaórát egy megbízható Python vagy C#/.NET alapú szinkronizációs háttérrendszer az ERP, CRM és mérnöki szoftverek között.',
        category: 'FOLYAMATAUTOMATIZÁLÁS',
        dimensions: JSON.stringify({
          iparag: ['Építőipar', 'Gyártás', 'Logisztika', 'Mérnöki Iroda'],
          technologia: ['Python', 'C# / .NET', 'AutoCAD', 'REST API', 'SQLite'],
          celcsoport: ['COO / Operatív Vezető', 'Műszaki Vezető', 'Pénzügyi Vezető'],
          fajdalompont: ['Adatduplikáció', 'Excel hiba', 'Kapacitáshiány', 'Monoton munka']
        }),
        visibility: 'public',
        audio_url: '',
        read_time: '6 PERC',
        created_at: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
        published: 1,
        content: `# Miért éri meg egyedi kód-alapú integrációval kiváltani a kézi Excel másolgatást?

A legtöbb 50-150 fős gyártó, mérnöki vagy logisztikai középvállalatnál a legnagyobb időveszteséget és hibalehetőséget nem a szoftverek hiánya okozza, hanem az úgynevezett **szigetrendszerek**.

A cég általában több kiváló szoftverrel rendelkezik:
* Modern vállalatirányítási rendszer (**ERP**)
* Ügyfélkezelő rendszer (**CRM**)
* Tervező- és mérnöki szoftverek (**AutoCAD, Inventor, CAD/CAM**)
* Raktárkezelő és számlázó programok

A probléma ott kezdődik, hogy ezek a rendszerek **nem beszélnek egymással**. A "híd" a szoftverek között szinte mindig egy munkatárs, aki naponta órákat tölt azzal, hogy az egyik rendszerből kiexportál egy Excel táblázatot, átalakítja, majd kézzel bemásolja egy másik programba.

---

## Mennyibe kerül valójában az "Excel-ragasztó"?

Nézzünk egy tipikus középvállalati példát:

\`\`\`mermaid
graph LR
    A[Műszaki Tervezés\\nAutoCAD / CAD] -->|1. Kézi Export| B[Excel Darabjegyzék\\n'vegleges_v3_javitott.xlsx']
    B -->|2. Kézi Másolás| C[ERP Rendszer\\nBeszerzés & Gyártás]
    C -->|3. Újabb Export| D[Pénzügy & Számlázás]
    
    style B fill:#7f1d1d,stroke:#ff0055,stroke-width:2px,color:#fff
    style A fill:#0f172a,stroke:#00FFFF,stroke-width:1px,color:#fff
    style C fill:#0f172a,stroke:#80FF00,stroke-width:1px,color:#fff
\`\`\`

### A rejtett veszteségek:
1. **Bérköltség-pazarlás:** Napi 2 óra kézi adatmásolás munkatársonként havi 40+ munkaórát visz el. Három kollégánál ez évente több mint 1400 felesleges munkaóra!
2. **Emberi hiba faktor:** Elég egy elgépelt cikkszám vagy egy elcsúszott oszlop, és rossz alapanyag érkezik a beszállítótól, vagy hibás darabjegyzék kerül a gyártósorra.
3. **Kapacitási plafon:** Ahogy növekszik a cég forgalma, a kézi adminisztráció miatt újabb irodai embereket kellene felvenni csupán adatmásolásra.

---

## Miért a kód-alapú integráció (Python, .NET) a tartós megoldás?

Sokan megpróbálkoznak dobozos no-code eszközökkel (pl. Zapier, Make), ám összetett gyártási vagy mérnöki logikánál ezek hamar elvéreznek: nem bírják a nagy adatmennyiséget, hiányzik a hibatűrés, és nincs mély hozzáférésük a helyi SQL adatbázisokhoz vagy CAD fájlokhoz.`
      },
      {
        project_id: 'prj_cad_auto',
        content_type: 'blog',
        slug: 'cad-automatizacio-mernoki-szemmel',
        title: 'CAD automatizáció mérnöki szemmel: Gyártáselőkészítés gyorsítása szoftveresen',
        summary: 'Hogyan csökkenthető akár 80%-kal a műszaki rajzok manuális ellenőrzése és exportálása C# .NET pluginok, AutoCAD API és kötegelt adatkinyerés segítségével.',
        category: 'MÉRNÖKI CAD/CAM',
        dimensions: JSON.stringify({
          iparag: ['Gépipar', 'Faipar', 'Építészet', 'Gyártás'],
          technologia: ['C# / .NET', 'AutoCAD API', 'DXF/DWG', 'Parametrikus CAD'],
          celcsoport: ['Műszaki Vezető', 'Főkonstruktőr', 'Üzemvezető'],
          fajdalompont: ['Hosszú átfutási idő', 'Rajzi hibák', 'Gyártáselőkészítés']
        }),
        visibility: 'public',
        audio_url: '',
        read_time: '7 PERC',
        created_at: new Date(Date.now() - 86400000 * 4).toISOString().split('T')[0],
        published: 1,
        content: `# CAD automatizáció mérnöki szemmel: Gyártáselőkészítés gyorsítása szoftveresen

A gépipari, faipari és építészeti tervezőirodákban a legértékesebb erőforrás a **tapasztalt mérnök és konstruktőr**. Ennek ellenére a tervezők munkaidejük jelentős részét nem innovatív mérnöki tervezéssel, hanem monoton műszaki adminisztrációval töltik.

---

## A Tervezőirodák Legnagyobb Időrablói

1. **Darabjegyzék (BOM) kézi kimásolása:** A rajzon szereplő alkatrészek, profilok és szerelvények kézi átszámolása és Excelbe gépelése.
2. **Kötegelt DXF / PDF exportálás:** Több tucat vagy száz rajzlap egyenkénti megnyitása, rétegkapcsolása és elmentése a CNC gépek számára.
3. **Rajzi szabványok ellenőrzése:** Rétegnevek, vonalvastagságok, blokk-attribútumok és revíziós pecsétek kézi átnézése.`
      },

      // 2. DEDICATED KNOWLEDGE VAULT DOCS (content_type: 'knowledge')
      {
        project_id: 'prj_rag_enterprise',
        content_type: 'knowledge',
        slug: 'zart-rag-architektura-specifikacio',
        title: 'Zárt Vállalati RAG Architektúra & Vektorindexelés Műszaki Specifikáció',
        summary: 'Részletes rendszerterv: SQLite FTS5 és Hashing-alapú Dense Vector Hybrid keresési architektúra vállalati belső hálózatokon, szigorú adatbiztonsági protokollal.',
        category: 'TUDÁSTÁR_SPEC, ARCHITEKTÚRA & AI',
        dimensions: JSON.stringify({
          iparag: ['Szoftverfejlesztés', 'Vállalati IT', 'Biztonságtechnika'],
          technologia: ['SQLite WAL', 'Dense Embeddings', 'Vector Search', 'Node.js', 'FTS5'],
          celcsoport: ['Rendszertervező', 'Senior Fejlesztő', 'IT Biztonsági Vezető'],
          fajdalompont: ['Alacsony késleltetés', 'Zero Data Leakage', 'Hibrid Keresés']
        }),
        visibility: 'public',
        audio_url: '',
        read_time: '8 PERC',
        created_at: new Date().toISOString().split('T')[0],
        published: 1,
        content: `# Zárt Vállalati RAG Architektúra & Vektorindexelés Műszaki Specifikáció

A **Cyber-Architect RAG Core** egy teljesen autonóm, helyi hálózaton működő, nulla adat-kiszivárgást garantáló szemantikus tudástár motor.

---

## 1. Rendszerarchitektúra és Adatáramlás

\`\`\`mermaid
graph TD
    subgraph Ingestion Pipeline
        A[Nyers Dokumentumok\\nPDF / DOCX / MD / TXT] --> B[Strukturált Chunking Engine\\n500-800 token átfedéssel]
        B --> C[Determinisztikus 128-dim Vektorizáló]
        B --> D[FTS5 Lexikális Indexelő]
    end
    
    subgraph Storage Layer
        C --> E[(SQLite WAL Adatbázis\\n'blog_posts' + JSON Vektormező)]
        D --> F[(SQLite FTS5 Virtuális Tábla\\n'blog_posts_fts')]
    end
    
    subgraph Retrieval & Reranking
        G[Beérkező Lekérdezés] --> H[Szemantikus Vektor & Q-Tokenizáció]
        E --> I[Dense Cosine Similarity Scorer]
        F --> J[BM25 Lexikális Scorer]
        H --> I
        H --> J
        I --> K[Hybrid RRF Fusion Motor\\nScore = 0.6*Cosine + 0.4*BM25]
        J --> K
        K --> L[Végleges Top-K Releváns Kontextus]
    end

    style E fill:#0f172a,stroke:#00FFFF,stroke-width:2px,color:#fff
    style F fill:#0f172a,stroke:#80FF00,stroke-width:2px,color:#fff
    style K fill:#090d1d,stroke:#FF00FF,stroke-width:2px,color:#fff
\`\`\``
      },
      {
        project_id: 'prj_internal_notes',
        content_type: 'knowledge',
        slug: 'belso-cad-api-fejlesztesi-naplo',
        title: '[PRIVÁT] AutoCAD .NET Plugin Architektúra és C# Dll Injection Minták',
        summary: 'Belső fejlesztési jegyzet: aszinkron IPC kommunikáció és memóriakezelt DWG adatextrakció.',
        category: 'BELSŐ_KUTATÁS',
        dimensions: JSON.stringify({
          iparag: ['Mérnöki Iroda', 'Szoftverfejlesztés'],
          technologia: ['C# / .NET', 'AutoCAD API', 'IPC', 'SQLite'],
          celcsoport: ['Belső AI Ágensek', 'Szántói Gábor'],
          fajdalompont: ['Belső Kutatás', 'Algoritmus Tervezés']
        }),
        visibility: 'private',
        audio_url: '',
        read_time: '8 PERC',
        created_at: new Date().toISOString().split('T')[0],
        published: 1,
        content: `# [PRIVÁT] AutoCAD .NET Plugin Architektúra és C# Minták

Ez a dokumentum **szigorúan belső kutatási célokat szolgál**, a nyilvános portfólió felületén nem jelenik meg.

## Architektúra Vázlat
* AutoCAD Process ➔ C# Managed Plugin (\`accoremgd.dll\`)
* Named Pipes IPC ➔ Helyi Node.js háttérszolgáltatás`
      }
    ];

    for (const item of initialItems) {
      insertBlog.run(
        item.project_id,
        item.content_type || 'blog',
        item.slug,
        item.title,
        item.summary,
        item.content,
        item.category,
        item.dimensions,
        item.visibility,
        item.audio_url,
        item.read_time,
        item.created_at,
        item.published
      );
    }
  }

  // Seed / Refresh Agent Terminals & Organizational Matrix
  const termCount = db.prepare('SELECT count(*) as count FROM agent_terminals').get().count;
  if (termCount === 0) {
    const insertTerm = db.prepare(`
      INSERT INTO agent_terminals (id, name, pod, lead_id, icon, color, role_description, responsibilities, delegates_to, status, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const initialTerminals = [
      // Executive Pod
      {
        id: 'root',
        name: 'Rendszerarchitekt & Főirányító (CEO/Strategist)',
        pod: 'Executive',
        lead_id: null,
        icon: 'diamond',
        color: '#00FFFF',
        role_description: 'Stratégiai irányvonal kijelölése, végső döntéshozatal (ADR), minőségi kapuk és release jóváhagyás.',
        responsibilities: JSON.stringify(['Stratégiai döntések és ADR', 'Quality.md és minőségi kapuk védelme', 'Release authority']),
        delegates_to: JSON.stringify(['conductor', 'tech-lead', 'marketing-lead', 'agentic']),
        sort_order: 1
      },
      {
        id: 'conductor',
        name: 'Task Orchestrator & Koordinátor (COO/Dispatcher)',
        pod: 'Executive',
        lead_id: 'root',
        icon: 'alt_route',
        color: '#00FFFF',
        role_description: 'Feladatok lebontása (tasks.yaml), sprint tervezés, keresztcsapat-koordináció és handoff diszpečelés.',
        responsibilities: JSON.stringify(['Epicek bontása taskokra', 'Handoffok továbbítása és nyomonkövetése', 'Blokkolók feloldása']),
        delegates_to: JSON.stringify(['tech-lead', 'marketing-lead', 'agentic', 'frontend', 'backend', 'qa']),
        sort_order: 2
      },

      // Engineering Pod
      {
        id: 'tech-lead',
        name: 'Mérnöki Vezető (Engineering Lead)',
        pod: 'Engineering',
        lead_id: 'conductor',
        icon: 'architecture',
        color: '#00FFFF',
        role_description: 'Mérnöki csapat irányítása, architektúra felügyelete, API szerződések és kódminőségi szabványok.',
        responsibilities: JSON.stringify(['Technikai architektúra', 'Frontend-backend szerződések', 'Kódminőség és review']),
        delegates_to: JSON.stringify(['frontend', 'backend', 'qa']),
        sort_order: 3
      },
      {
        id: 'frontend',
        name: 'Cyber-Architect UI/UX Specialista',
        pod: 'Engineering',
        lead_id: 'tech-lead',
        icon: 'dashboard',
        color: '#FF00FF',
        role_description: 'The Cyber-Architect Archive vizuális identitás, React komponensek, Tailwind CSS, 0px border-radius, duál neon glow.',
        responsibilities: JSON.stringify(['React UI komponensek', 'Tailwind styling & animációk', 'Reszponzivitás és UX']),
        delegates_to: JSON.stringify(['qa', 'backend']),
        sort_order: 4
      },
      {
        id: 'backend',
        name: 'Fullstack, SQLite Service & MCP Mérnök',
        pod: 'Engineering',
        lead_id: 'tech-lead',
        icon: 'dns',
        color: '#00FFFF',
        role_description: 'Express API, SQLite adatbázis Service layer, Zero Raw SQL elv, Portfolio CLI, MCP Szerver eszközök, PIN Auth.',
        responsibilities: JSON.stringify(['Express API & Middleware', 'SQLite Service Layer & Migrációk', 'Zero Raw SQL & Biztonság']),
        delegates_to: JSON.stringify(['qa', 'frontend']),
        sort_order: 5
      },
      {
        id: 'qa',
        name: 'Független Verifikáció & QA Specialista',
        pod: 'Engineering',
        lead_id: 'tech-lead',
        icon: 'verified',
        color: '#80FF00',
        role_description: 'Független ellenőrzés (Készítő ≠ Ellenőr), Playwright E2E tesztek, regresszió- és kapuvédelem.',
        responsibilities: JSON.stringify(['Playwright E2E tesztek', 'Regressziós vizsgálatok', 'Audit napló verifikáció']),
        delegates_to: JSON.stringify(['tech-lead', 'frontend', 'backend']),
        sort_order: 6
      },

      // Marketing & Growth Pod
      {
        id: 'marketing-lead',
        name: 'Marketing & Tartalmi Stratéga (Growth Lead)',
        pod: 'Marketing',
        lead_id: 'conductor',
        icon: 'campaign',
        color: '#FF00FF',
        role_description: 'Szakmai pozicionálás, célcsoport-fókuszú kommunikációs stratégia és konverzióoptimalizálás.',
        responsibilities: JSON.stringify(['Tartalmi stratégia', 'Célcsoport fókusz', 'Lead generálás']),
        delegates_to: JSON.stringify(['copywriter', 'content']),
        sort_order: 7
      },
      {
        id: 'copywriter',
        name: 'B2B Szakmai Szövegíró & Copywriter',
        pod: 'Marketing',
        lead_id: 'marketing-lead',
        icon: 'edit_note',
        color: '#FF00FF',
        role_description: 'Döntéshozókra kalibrált mérnöki szövegezés, szakmai profil és értékajánlat megfogalmazása.',
        responsibilities: JSON.stringify(['Weboldal szövegezése', 'C-Level értékajánlatok', 'SEO metaleírások']),
        delegates_to: JSON.stringify(['marketing-lead', 'frontend']),
        sort_order: 8
      },
      {
        id: 'content',
        name: 'Tudástár & Esettanulmány Felelős',
        pod: 'Marketing',
        lead_id: 'marketing-lead',
        icon: 'menu_book',
        color: '#FF00FF',
        role_description: 'Gyakorlati esettanulmányok, RAG és automatizációs cikkek írása a szakmai blogba.',
        responsibilities: JSON.stringify(['Blog cikkek írása', 'Esettanulmányok', 'Tudástár menedzsment']),
        delegates_to: JSON.stringify(['copywriter', 'frontend']),
        sort_order: 9
      },

      // AI Agent Operations Pod
      {
        id: 'agentic',
        name: 'Ágens Rendszer & ACI Specialista',
        pod: 'AgentOps',
        lead_id: 'root',
        icon: 'psychology',
        color: '#80FF00',
        role_description: 'Ágens szabályzatok (.agents/rules/), promptok, Zod tool sémák, multi-agent egészség és token-takarékosság.',
        responsibilities: JSON.stringify(['Ágens szabályok karbantartása', 'Zod sémák és tool leírások', 'Postaláda és ACI felügyelet']),
        delegates_to: JSON.stringify(['antigravity', 'mcp']),
        sort_order: 10
      },
      {
        id: 'antigravity',
        name: 'Pair Programming & AI Fullstack Mérnök',
        pod: 'AgentOps',
        lead_id: 'agentic',
        icon: 'smart_toy',
        color: '#80FF00',
        role_description: 'Közvetlen pair programming a fejlesztővel, autonóm feature implementáció és Antigravity IDE integráció.',
        responsibilities: JSON.stringify(['Pair programming', 'Fullstack implementáció', 'Kódgenerálás és refaktor']),
        delegates_to: JSON.stringify(['qa', 'backend', 'frontend']),
        sort_order: 11
      },
      {
        id: 'mcp',
        name: 'Model Context Protocol (MCP) Core',
        pod: 'AgentOps',
        lead_id: 'agentic',
        icon: 'extension',
        color: '#80FF00',
        role_description: 'MCP protokoll végpontok, STDIO szerver, kliens integrációk (Claude Desktop, Cursor, Antigravity).',
        responsibilities: JSON.stringify(['MCP szerver karbantartása', 'Zod sémák szinkronizálása', 'Kliens konfigurációk']),
        delegates_to: JSON.stringify(['backend', 'agentic']),
        sort_order: 12
      }
    ];

    for (const t of initialTerminals) {
      insertTerm.run(
        t.id,
        t.name,
        t.pod,
        t.lead_id,
        t.icon,
        t.color,
        t.role_description,
        t.responsibilities,
        t.delegates_to,
        'ACTIVE',
        t.sort_order,
        now,
        now
      );
    }
  }
}
