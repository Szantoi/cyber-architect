import Database from 'better-sqlite3';
import { hashPin } from './security/auth.js';
import { config } from './config.js';
import {
  ensureDatabaseParentDirectory,
  resolveDatabaseLocation
} from './config/databasePath.js';

// Tests must opt in to an isolated database. Failing closed here prevents a
// missing or misordered test setup from ever opening the developer database.
if (process.env.NODE_ENV === 'test' && !String(process.env.SQLITE_DB_PATH || '').trim()) {
  throw new Error('[DB_SAFETY] SQLITE_DB_PATH must point to an isolated database while NODE_ENV=test.');
}

const databaseLocation = resolveDatabaseLocation();
ensureDatabaseParentDirectory(databaseLocation.path);

export const dbPath = databaseLocation.path;
export const db = new Database(dbPath);

// Enable WAL mode for high concurrent performance
db.pragma('journal_mode = WAL');
// Foreign-key enforcement is connection-local in SQLite. The taxonomy
// registry relies on it to prevent an admin action from orphaning assignments
// or smart-collection references.
db.pragma('foreign_keys = ON');

const BLOG_POSTS_FTS_MIGRATION = 'blog_posts_fts';
const BLOG_POSTS_FTS_VERSION = 1;
const TAXONOMY_REGISTRY_MIGRATION = 'taxonomy_registry';
const TAXONOMY_REGISTRY_VERSION = 1;
const DEFAULT_SMART_COLLECTIONS_MIGRATION = 'default_smart_collections';
const DEFAULT_SMART_COLLECTIONS_VERSION = 1;
const GRAPH_REGISTRY_MIGRATION = 'directed_multilayer_graph_registry';
const GRAPH_REGISTRY_VERSION = 1;
const WORKFLOW_REGISTRY_MIGRATION = 'native_workflow_registry';
const WORKFLOW_REGISTRY_VERSION = 1;
const DEFAULT_SMART_COLLECTIONS = Object.freeze([
  {
    id: 'featured',
    slug: 'featured',
    name: 'KIEMELT',
    description: 'Publikált, kiemelt tartalmak.',
    iconKey: 'flame',
    color: '#00FBFB',
    rule: { type: 'content', field: 'published', operator: 'equals', value: true },
    sortOrder: 10
  },
  {
    id: 'audio',
    slug: 'audio',
    name: 'AUDIO',
    description: 'Hanganyaggal rendelkező tartalmak.',
    iconKey: 'headphones',
    color: '#FF00FF',
    rule: { type: 'content', field: 'has_audio', operator: 'equals', value: true },
    sortOrder: 20
  },
  {
    id: 'video',
    slug: 'video',
    name: 'VIDEÓ',
    description: 'Videóval rendelkező tartalmak.',
    iconKey: 'video',
    color: '#38BDF8',
    rule: { type: 'content', field: 'has_video', operator: 'equals', value: true },
    sortOrder: 30
  },
  {
    id: 'specs',
    slug: 'specs',
    name: 'SPEC',
    description: 'Műszaki specifikációk és tudástári dokumentumok.',
    iconKey: 'code-2',
    color: '#80FF00',
    rule: { type: 'content', field: 'content_type', operator: 'equals', value: 'knowledge' },
    sortOrder: 40
  }
]);
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

/**
 * The taxonomy registry is deliberately independent from the Markdown content
 * projection.  Administrators own the vocabulary, display rules and smart
 * collection definitions here; the canonical vault remains the only writer of
 * a document's actual frontmatter/content.
 */
function ensureTaxonomyRegistrySchema() {
  const appliedMigration = db.prepare(`
    SELECT version
    FROM schema_migrations
    WHERE component = ?
  `).get(TAXONOMY_REGISTRY_MIGRATION);
  const appliedDefaultSmartCollectionsMigration = db.prepare(`
    SELECT version
    FROM schema_migrations
    WHERE component = ?
  `).get(DEFAULT_SMART_COLLECTIONS_MIGRATION);

  if (appliedMigration?.version > TAXONOMY_REGISTRY_VERSION) {
    throw new Error(
      `[DB_MIGRATION] Unsupported ${TAXONOMY_REGISTRY_MIGRATION} schema version: ${appliedMigration.version}`
    );
  }
  if (appliedDefaultSmartCollectionsMigration?.version > DEFAULT_SMART_COLLECTIONS_VERSION) {
    throw new Error(
      `[DB_MIGRATION] Unsupported ${DEFAULT_SMART_COLLECTIONS_MIGRATION} schema version: ${appliedDefaultSmartCollectionsMigration.version}`
    );
  }

  const needsDefaultSmartCollections = Number(appliedDefaultSmartCollectionsMigration?.version || 0)
    < DEFAULT_SMART_COLLECTIONS_VERSION;

  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS taxonomy_dimensions (
        id TEXT PRIMARY KEY,
        frontmatter_key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        icon_key TEXT NOT NULL DEFAULT 'tag',
        color TEXT NOT NULL DEFAULT '#00FFFF',
        multi_select INTEGER NOT NULL DEFAULT 1 CHECK (multi_select IN (0, 1)),
        filterable INTEGER NOT NULL DEFAULT 1 CHECK (filterable IN (0, 1)),
        groupable INTEGER NOT NULL DEFAULT 1 CHECK (groupable IN (0, 1)),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
        is_core INTEGER NOT NULL DEFAULT 0 CHECK (is_core IN (0, 1)),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_taxonomy_dimensions_active_sort
        ON taxonomy_dimensions(active, visibility, sort_order, label);

      CREATE TABLE IF NOT EXISTS taxonomy_terms (
        id TEXT PRIMARY KEY,
        dimension_id TEXT NOT NULL REFERENCES taxonomy_dimensions(id) ON DELETE RESTRICT,
        slug TEXT NOT NULL,
        label TEXT NOT NULL,
        normalized_label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        icon_key TEXT,
        color TEXT,
        parent_id TEXT REFERENCES taxonomy_terms(id) ON DELETE RESTRICT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(dimension_id, slug)
      );
      CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_dimension_active_sort
        ON taxonomy_terms(dimension_id, active, visibility, sort_order, label);
      CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_normalized_label
        ON taxonomy_terms(dimension_id, normalized_label);
      CREATE INDEX IF NOT EXISTS idx_taxonomy_terms_parent ON taxonomy_terms(parent_id);

      CREATE TABLE IF NOT EXISTS taxonomy_term_aliases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dimension_id TEXT NOT NULL REFERENCES taxonomy_dimensions(id) ON DELETE RESTRICT,
        term_id TEXT NOT NULL REFERENCES taxonomy_terms(id) ON DELETE CASCADE,
        alias TEXT NOT NULL,
        normalized_alias TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(dimension_id, normalized_alias),
        UNIQUE(term_id, normalized_alias)
      );
      CREATE INDEX IF NOT EXISTS idx_taxonomy_aliases_term ON taxonomy_term_aliases(term_id);

      CREATE TABLE IF NOT EXISTS taxonomy_term_relations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_term_id TEXT NOT NULL REFERENCES taxonomy_terms(id) ON DELETE RESTRICT,
        target_term_id TEXT NOT NULL REFERENCES taxonomy_terms(id) ON DELETE RESTRICT,
        relation_type TEXT NOT NULL,
        weight REAL NOT NULL DEFAULT 1 CHECK (weight >= 0 AND weight <= 1),
        bidirectional INTEGER NOT NULL DEFAULT 0 CHECK (bidirectional IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(source_term_id, target_term_id, relation_type)
      );
      CREATE INDEX IF NOT EXISTS idx_taxonomy_relations_source ON taxonomy_term_relations(source_term_id);
      CREATE INDEX IF NOT EXISTS idx_taxonomy_relations_target ON taxonomy_term_relations(target_term_id);

      -- This table is a materialized, query-friendly projection. The future
      -- vault importer owns writes through taxonomyService; no admin content
      -- mutation endpoint is exposed for it.
      CREATE TABLE IF NOT EXISTS content_taxonomy_assignments (
        post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
        term_id TEXT NOT NULL REFERENCES taxonomy_terms(id) ON DELETE RESTRICT,
        source TEXT NOT NULL DEFAULT 'vault_frontmatter',
        ordinal INTEGER NOT NULL DEFAULT 0,
        assigned_at TEXT NOT NULL,
        PRIMARY KEY(post_id, term_id)
      );
      CREATE INDEX IF NOT EXISTS idx_content_taxonomy_assignments_term_post
        ON content_taxonomy_assignments(term_id, post_id);
      CREATE INDEX IF NOT EXISTS idx_content_taxonomy_assignments_post_source
        ON content_taxonomy_assignments(post_id, source, ordinal);

      CREATE TABLE IF NOT EXISTS smart_collections (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        icon_key TEXT NOT NULL DEFAULT 'sparkles',
        color TEXT NOT NULL DEFAULT '#80FF00',
        scope TEXT NOT NULL DEFAULT 'public' CHECK (scope IN ('public', 'private', 'personal')),
        owner_id TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        rule_version INTEGER NOT NULL DEFAULT 1 CHECK (rule_version > 0),
        rule_json TEXT NOT NULL,
        group_by_json TEXT NOT NULL DEFAULT '{"type":"none"}',
        sort_by TEXT NOT NULL DEFAULT 'recommended',
        layout_json TEXT NOT NULL DEFAULT '{"view":"cards"}',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_smart_collections_scope_active_sort
        ON smart_collections(scope, active, sort_order, name);

      CREATE TABLE IF NOT EXISTS smart_collection_membership_overrides (
        collection_id TEXT NOT NULL REFERENCES smart_collections(id) ON DELETE CASCADE,
        post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
        mode TEXT NOT NULL CHECK (mode IN ('include', 'exclude')),
        created_at TEXT NOT NULL,
        PRIMARY KEY(collection_id, post_id)
      );
      CREATE INDEX IF NOT EXISTS idx_smart_collection_overrides_post
        ON smart_collection_membership_overrides(post_id);
    `);

    const now = new Date().toISOString();
    const seedDimension = db.prepare(`
      INSERT INTO taxonomy_dimensions
        (id, frontmatter_key, label, description, icon_key, color, multi_select,
         filterable, groupable, active, visibility, is_core, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'public', ?, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING
    `);
    seedDimension.run('industry', 'tax_industry', 'Iparág', 'Üzleti vagy iparági kontextus.', 'factory', '#00FFFF', 1, 1, 1, 1, 1, 10, now, now);
    seedDimension.run('technology', 'tax_technology', 'Technológia', 'Technológiai eszköz, platform vagy módszer.', 'zap', '#00FFFF', 1, 1, 1, 1, 1, 20, now, now);
    seedDimension.run('audience_role', 'tax_audience_role', 'Célcsoport / szerepkör', 'Célközönség vagy szakmai szerepkör.', 'target', '#FF00FF', 1, 1, 1, 1, 1, 30, now, now);
    seedDimension.run('pain_point', 'tax_pain_point', 'Fájdalompont', 'A dokumentált üzleti vagy műszaki probléma típusa.', 'filter', '#FFB000', 1, 0, 0, 0, 0, 40, now, now);

    if (needsDefaultSmartCollections) {
      const seedSmartCollection = db.prepare(`
        INSERT INTO smart_collections (
          id, slug, name, description, icon_key, color, scope, owner_id, active,
          rule_version, rule_json, group_by_json, sort_by, layout_json, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'public', '', 1, 1, ?, '{"type":"none"}', 'recommended', '{"view":"cards"}', ?, ?, ?)
        ON CONFLICT DO NOTHING
      `);
      for (const collection of DEFAULT_SMART_COLLECTIONS) {
        seedSmartCollection.run(
          collection.id,
          collection.slug,
          collection.name,
          collection.description,
          collection.iconKey,
          collection.color,
          JSON.stringify(collection.rule),
          collection.sortOrder,
          now,
          now
        );
      }
    }

    db.prepare(`
      INSERT INTO schema_migrations (component, version, applied_at)
      VALUES (?, ?, ?)
      ON CONFLICT(component) DO UPDATE SET
        version = excluded.version,
        applied_at = excluded.applied_at
      WHERE schema_migrations.version < excluded.version
    `).run(TAXONOMY_REGISTRY_MIGRATION, TAXONOMY_REGISTRY_VERSION, now);
    if (needsDefaultSmartCollections) {
      db.prepare(`
        INSERT INTO schema_migrations (component, version, applied_at)
        VALUES (?, ?, ?)
        ON CONFLICT(component) DO UPDATE SET
          version = excluded.version,
          applied_at = excluded.applied_at
        WHERE schema_migrations.version < excluded.version
      `).run(DEFAULT_SMART_COLLECTIONS_MIGRATION, DEFAULT_SMART_COLLECTIONS_VERSION, now);
    }
  });

  try {
    migrate();
  } catch (error) {
    throw new Error(
      `[DB_MIGRATION] Failed to migrate ${TAXONOMY_REGISTRY_MIGRATION} to version ${TAXONOMY_REGISTRY_VERSION}`,
      { cause: error }
    );
  }
}

/**
 * Database-owned directed multilayer multigraph.
 *
 * Markdown can project a small, human-readable view of a relation, but it is
 * never the authority for graph identity, edge provenance or traversal
 * semantics.  Every relationship is stored as a directed arc.  A semantic
 * two-way relationship is represented by two arcs sharing a relation group.
 */
function ensureGraphRegistrySchema() {
  const appliedMigration = db.prepare(`
    SELECT version
    FROM schema_migrations
    WHERE component = ?
  `).get(GRAPH_REGISTRY_MIGRATION);

  if (appliedMigration?.version > GRAPH_REGISTRY_VERSION) {
    throw new Error(
      `[DB_MIGRATION] Unsupported ${GRAPH_REGISTRY_MIGRATION} schema version: ${appliedMigration.version}`
    );
  }

  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS graph_definitions (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        icon_key TEXT NOT NULL DEFAULT 'network',
        color TEXT NOT NULL DEFAULT '#00FFFF',
        visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        owner_id TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_graph_definitions_visibility_active_sort
        ON graph_definitions(visibility, active, name);

      CREATE TABLE IF NOT EXISTS graph_nodes (
        id TEXT PRIMARY KEY,
        node_type TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        source_system TEXT NOT NULL DEFAULT 'manual',
        source_reference TEXT NOT NULL DEFAULT '',
        visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_graph_nodes_source_reference_unique
        ON graph_nodes(source_system, source_reference)
        WHERE source_reference <> '';
      CREATE INDEX IF NOT EXISTS idx_graph_nodes_type_visibility_active
        ON graph_nodes(node_type, visibility, active, label);

      CREATE TABLE IF NOT EXISTS graph_edge_types (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        icon_key TEXT NOT NULL DEFAULT 'git-branch',
        color TEXT NOT NULL DEFAULT '#80FF00',
        source_node_types_json TEXT NOT NULL DEFAULT '[]',
        target_node_types_json TEXT NOT NULL DEFAULT '[]',
        inverse_edge_type_id TEXT REFERENCES graph_edge_types(id) ON DELETE RESTRICT,
        allow_self_loop INTEGER NOT NULL DEFAULT 0 CHECK (allow_self_loop IN (0, 1)),
        default_weight REAL NOT NULL DEFAULT 1 CHECK (default_weight >= 0 AND default_weight <= 1),
        default_confidence REAL NOT NULL DEFAULT 1 CHECK (default_confidence >= 0 AND default_confidence <= 1),
        default_cost REAL NOT NULL DEFAULT 1 CHECK (default_cost >= 0),
        visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_graph_edge_types_visibility_active
        ON graph_edge_types(visibility, active, label);
      CREATE INDEX IF NOT EXISTS idx_graph_edge_types_inverse
        ON graph_edge_types(inverse_edge_type_id);

      -- A multigraph deliberately has no uniqueness constraint over
      -- (source, target, type): parallel arcs may carry independent evidence,
      -- validity windows, confidence or provenance.
      CREATE TABLE IF NOT EXISTS graph_edges (
        id TEXT PRIMARY KEY,
        source_node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE RESTRICT,
        target_node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE RESTRICT,
        edge_type_id TEXT NOT NULL REFERENCES graph_edge_types(id) ON DELETE RESTRICT,
        relation_group_id TEXT NOT NULL DEFAULT '',
        reciprocal_edge_id TEXT REFERENCES graph_edges(id) ON DELETE SET NULL,
        reciprocal_role TEXT NOT NULL DEFAULT 'asserted'
          CHECK (reciprocal_role IN ('asserted', 'reciprocal', 'derived_inverse')),
        origin TEXT NOT NULL DEFAULT 'admin'
          CHECK (origin IN ('admin', 'markdown_projection', 'sql_sync', 'wikilink_import', 'agent')),
        projection_source_key TEXT NOT NULL DEFAULT '',
        provenance_json TEXT NOT NULL DEFAULT '{}',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        weight REAL NOT NULL DEFAULT 1 CHECK (weight >= 0 AND weight <= 1),
        confidence REAL NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
        cost REAL NOT NULL DEFAULT 1 CHECK (cost >= 0),
        valid_from TEXT,
        valid_to TEXT,
        visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_graph_edges_source_active
        ON graph_edges(source_node_id, edge_type_id, active);
      CREATE INDEX IF NOT EXISTS idx_graph_edges_target_active
        ON graph_edges(target_node_id, edge_type_id, active);
      CREATE INDEX IF NOT EXISTS idx_graph_edges_relation_group
        ON graph_edges(relation_group_id);
      CREATE INDEX IF NOT EXISTS idx_graph_edges_projection_source
        ON graph_edges(origin, projection_source_key);
      CREATE INDEX IF NOT EXISTS idx_graph_edges_reciprocal
        ON graph_edges(reciprocal_edge_id);

      CREATE TABLE IF NOT EXISTS graph_node_memberships (
        graph_id TEXT NOT NULL REFERENCES graph_definitions(id) ON DELETE CASCADE,
        node_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(graph_id, node_id)
      );
      CREATE INDEX IF NOT EXISTS idx_graph_node_memberships_node
        ON graph_node_memberships(node_id, graph_id);

      -- An edge can appear in several graph layers.  Service-level validation
      -- guarantees that both endpoints are members of every such layer.
      CREATE TABLE IF NOT EXISTS graph_edge_memberships (
        graph_id TEXT NOT NULL REFERENCES graph_definitions(id) ON DELETE CASCADE,
        edge_id TEXT NOT NULL REFERENCES graph_edges(id) ON DELETE CASCADE,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(graph_id, edge_id)
      );
      CREATE INDEX IF NOT EXISTS idx_graph_edge_memberships_edge
        ON graph_edge_memberships(edge_id, graph_id);
    `);

    const now = new Date().toISOString();
    // Minimal shared edge vocabulary. These are normal registry records (an
    // admin can label/style/deactivate them) but make the supplied project,
    // epic, task and decision templates usable before a team invents its own
    // domain-specific edge types.
    const seedEdgeType = db.prepare(`
      INSERT INTO graph_edge_types (
        id, slug, label, description, icon_key, color, source_node_types_json, target_node_types_json,
        inverse_edge_type_id, allow_self_loop, default_weight, default_confidence, default_cost,
        visibility, active, metadata_json, created_by, created_at, updated_by, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, 1, 1, 1, 'private', 1, ?, 'CA_SYSTEM', ?, 'CA_SYSTEM', ?)
      ON CONFLICT(id) DO NOTHING
    `);
    const coreEdgeTypes = [
      ['contains', 'contains', 'Tartalmaz', 'Strukturális projekt vagy epic → elem kapcsolat.', 'folder-tree', '#00FBFB', ['project', 'epic'], ['project', 'document', 'epic', 'task']],
      ['part_of', 'part-of', 'Része ennek', 'Strukturális elem → projekt vagy epic kapcsolat.', 'git-branch', '#00FBFB', ['document', 'epic', 'task'], ['project', 'epic']],
      ['depends_on', 'depends-on', 'Függ ettől', 'A forrás csak a cél után vagy a cél feltételeivel teljesíthető.', 'arrow-right', '#80FF00', [], []],
      ['blocks', 'blocks', 'Blokkolja', 'A forrás akadályozza vagy blokkolja a cél előrehaladását.', 'octagon-alert', '#FF00FF', [], []],
      ['related_to', 'related-to', 'Kapcsolódik hozzá', 'Szemantikus, opcionálisan párosított kapcsolat.', 'link', '#A855F7', [], []],
      ['affects', 'affects', 'Hatással van rá', 'Hatás-, kockázat- vagy következménykapcsolat.', 'workflow', '#F59E0B', [], []],
      ['supports', 'supports', 'Támogatja', 'Bizonyíték, eszköz vagy dokumentum által nyújtott támogatás.', 'circle-check', '#80FF00', [], []],
      ['decides', 'decides', 'Dönt róla', 'Döntési rekord → érintett elem kapcsolat.', 'scale', '#A855F7', [], []]
    ];
    for (const [id, slug, label, description, iconKey, color, sourceTypes, targetTypes] of coreEdgeTypes) {
      seedEdgeType.run(
        id, slug, label, description, iconKey, color,
        JSON.stringify(sourceTypes), JSON.stringify(targetTypes),
        JSON.stringify({ system_seed: true }), now, now
      );
    }
    // Upgrade only the framework-provided type; a separately administered
    // `contains` type is never rewritten by startup migration.
    const containsTargetTypes = JSON.stringify(['project', 'document', 'epic', 'task']);
    db.prepare(`
      UPDATE graph_edge_types
      SET target_node_types_json = ?, updated_by = 'CA_SYSTEM', updated_at = ?
      WHERE id = 'contains' AND created_by = 'CA_SYSTEM' AND target_node_types_json <> ?
    `).run(containsTargetTypes, now, containsTargetTypes);
    db.prepare(`
      INSERT INTO schema_migrations (component, version, applied_at)
      VALUES (?, ?, ?)
      ON CONFLICT(component) DO UPDATE SET
        version = excluded.version,
        applied_at = excluded.applied_at
      WHERE schema_migrations.version < excluded.version
    `).run(GRAPH_REGISTRY_MIGRATION, GRAPH_REGISTRY_VERSION, now);
  });

  try {
    migrate();
  } catch (error) {
    throw new Error(
      `[DB_MIGRATION] Failed to migrate ${GRAPH_REGISTRY_MIGRATION} to version ${GRAPH_REGISTRY_VERSION}`,
      { cause: error }
    );
  }
}

/**
 * Native Workflow v1 registry.
 *
 * A workflow attaches to an existing graph definition for ownership and
 * visualization, but generic graph edges are intentionally not executable.
 * Version rows own their own typed steps and transitions; runtime instances
 * reference an immutable published version and keep their event history
 * append-only.  This separation prevents an ordinary graph edit from changing
 * a running business process.
 */
function ensureWorkflowRegistrySchema() {
  const appliedMigration = db.prepare(`
    SELECT version
    FROM schema_migrations
    WHERE component = ?
  `).get(WORKFLOW_REGISTRY_MIGRATION);

  if (appliedMigration?.version > WORKFLOW_REGISTRY_VERSION) {
    throw new Error(
      `[DB_MIGRATION] Unsupported ${WORKFLOW_REGISTRY_MIGRATION} schema version: ${appliedMigration.version}`
    );
  }

  const migrate = db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workflow_definitions (
        id TEXT PRIMARY KEY,
        graph_id TEXT NOT NULL REFERENCES graph_definitions(id) ON DELETE RESTRICT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        latest_version INTEGER NOT NULL DEFAULT 0 CHECK (latest_version >= 0),
        published_version INTEGER CHECK (published_version IS NULL OR published_version > 0),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_definitions_graph_active
        ON workflow_definitions(graph_id, active, name);

      CREATE TABLE IF NOT EXISTS workflow_versions (
        id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE RESTRICT,
        version_number INTEGER NOT NULL CHECK (version_number > 0),
        status TEXT NOT NULL DEFAULT 'draft'
          CHECK (status IN ('draft', 'published', 'superseded')),
        label TEXT NOT NULL DEFAULT '',
        max_total_steps INTEGER NOT NULL DEFAULT 1000
          CHECK (max_total_steps >= 1 AND max_total_steps <= 100000),
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        published_by TEXT,
        published_at TEXT,
        UNIQUE(workflow_id, version_number)
      );
      -- A workflow has at most one executable revision. Older revisions stay
      -- as immutable history and are marked superseded rather than rewritten.
      CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_versions_one_published
        ON workflow_versions(workflow_id)
        WHERE status = 'published';
      CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow_status
        ON workflow_versions(workflow_id, status, version_number DESC);

      CREATE TABLE IF NOT EXISTS workflow_steps (
        id TEXT PRIMARY KEY,
        workflow_version_id TEXT NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
        step_key TEXT NOT NULL,
        step_type TEXT NOT NULL CHECK (step_type IN ('start', 'task', 'decision', 'wait', 'end')),
        label TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        sort_order INTEGER NOT NULL DEFAULT 0,
        UNIQUE(workflow_version_id, step_key)
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_steps_version_sort
        ON workflow_steps(workflow_version_id, sort_order, step_key);

      CREATE TABLE IF NOT EXISTS workflow_transitions (
        id TEXT PRIMARY KEY,
        workflow_version_id TEXT NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
        source_step_id TEXT NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
        target_step_id TEXT NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
        label TEXT NOT NULL DEFAULT '',
        guard_json TEXT,
        allowed_actor_types_json TEXT NOT NULL DEFAULT '["human"]',
        max_iterations INTEGER CHECK (max_iterations IS NULL OR (max_iterations >= 1 AND max_iterations <= 1000)),
        evidence_required INTEGER NOT NULL DEFAULT 0 CHECK (evidence_required IN (0, 1)),
        metadata_json TEXT NOT NULL DEFAULT '{}',
        sort_order INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_transitions_source
        ON workflow_transitions(workflow_version_id, source_step_id, sort_order, id);
      CREATE INDEX IF NOT EXISTS idx_workflow_transitions_target
        ON workflow_transitions(workflow_version_id, target_step_id, id);

      -- SQLite cannot express these cross-column version memberships with a
      -- single ordinary FK. The triggers make it impossible for a raw/manual
      -- write to bind a transition to steps from another immutable revision.
      CREATE TRIGGER IF NOT EXISTS workflow_transitions_version_guard_insert
      BEFORE INSERT ON workflow_transitions
      BEGIN
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM workflow_steps
          WHERE id = NEW.source_step_id AND workflow_version_id = NEW.workflow_version_id
        ) THEN RAISE(ABORT, 'WORKFLOW_TRANSITION_SOURCE_VERSION_MISMATCH') END;
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM workflow_steps
          WHERE id = NEW.target_step_id AND workflow_version_id = NEW.workflow_version_id
        ) THEN RAISE(ABORT, 'WORKFLOW_TRANSITION_TARGET_VERSION_MISMATCH') END;
      END;
      CREATE TRIGGER IF NOT EXISTS workflow_transitions_version_guard_update
      BEFORE UPDATE OF workflow_version_id, source_step_id, target_step_id ON workflow_transitions
      BEGIN
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM workflow_steps
          WHERE id = NEW.source_step_id AND workflow_version_id = NEW.workflow_version_id
        ) THEN RAISE(ABORT, 'WORKFLOW_TRANSITION_SOURCE_VERSION_MISMATCH') END;
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM workflow_steps
          WHERE id = NEW.target_step_id AND workflow_version_id = NEW.workflow_version_id
        ) THEN RAISE(ABORT, 'WORKFLOW_TRANSITION_TARGET_VERSION_MISMATCH') END;
      END;

      CREATE TABLE IF NOT EXISTS workflow_instances (
        id TEXT PRIMARY KEY,
        workflow_definition_id TEXT NOT NULL REFERENCES workflow_definitions(id) ON DELETE RESTRICT,
        workflow_version_id TEXT NOT NULL REFERENCES workflow_versions(id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'running'
          CHECK (status IN ('running', 'paused', 'completed', 'failed')),
        current_step_id TEXT NOT NULL REFERENCES workflow_steps(id) ON DELETE RESTRICT,
        context_json TEXT NOT NULL DEFAULT '{}',
        step_count INTEGER NOT NULL DEFAULT 1 CHECK (step_count >= 1),
        started_by TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        failed_at TEXT,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_instances_definition_status
        ON workflow_instances(workflow_definition_id, status, started_at DESC);
      CREATE INDEX IF NOT EXISTS idx_workflow_instances_version_status
        ON workflow_instances(workflow_version_id, status, started_at DESC);

      CREATE TRIGGER IF NOT EXISTS workflow_instances_version_guard_insert
      BEFORE INSERT ON workflow_instances
      BEGIN
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM workflow_versions
          WHERE id = NEW.workflow_version_id AND workflow_id = NEW.workflow_definition_id
        ) THEN RAISE(ABORT, 'WORKFLOW_INSTANCE_VERSION_MISMATCH') END;
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM workflow_steps
          WHERE id = NEW.current_step_id AND workflow_version_id = NEW.workflow_version_id
        ) THEN RAISE(ABORT, 'WORKFLOW_INSTANCE_CURRENT_STEP_MISMATCH') END;
      END;
      CREATE TRIGGER IF NOT EXISTS workflow_instances_version_guard_update
      BEFORE UPDATE OF workflow_definition_id, workflow_version_id, current_step_id ON workflow_instances
      BEGIN
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM workflow_versions
          WHERE id = NEW.workflow_version_id AND workflow_id = NEW.workflow_definition_id
        ) THEN RAISE(ABORT, 'WORKFLOW_INSTANCE_VERSION_MISMATCH') END;
        SELECT CASE WHEN NOT EXISTS (
          SELECT 1 FROM workflow_steps
          WHERE id = NEW.current_step_id AND workflow_version_id = NEW.workflow_version_id
        ) THEN RAISE(ABORT, 'WORKFLOW_INSTANCE_CURRENT_STEP_MISMATCH') END;
      END;

      -- This table is event-sourced and append-only by service contract.
      -- Runtime state is a query-friendly projection, while the sequence is
      -- the durable audit trail for starts, transitions, pauses, completion
      -- and failures.
      CREATE TABLE IF NOT EXISTS workflow_instance_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        instance_id TEXT NOT NULL REFERENCES workflow_instances(id) ON DELETE RESTRICT,
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        event_type TEXT NOT NULL
          CHECK (event_type IN ('start', 'transition', 'pause', 'resume', 'complete', 'fail')),
        from_step_id TEXT REFERENCES workflow_steps(id) ON DELETE RESTRICT,
        to_step_id TEXT REFERENCES workflow_steps(id) ON DELETE RESTRICT,
        transition_id TEXT REFERENCES workflow_transitions(id) ON DELETE RESTRICT,
        actor_type TEXT NOT NULL CHECK (actor_type IN ('human', 'agent', 'service')),
        actor_id TEXT NOT NULL,
        actor_label TEXT NOT NULL DEFAULT '',
        evidence_json TEXT NOT NULL DEFAULT '[]',
        context_patch_json TEXT NOT NULL DEFAULT '{}',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        UNIQUE(instance_id, sequence)
      );
      CREATE INDEX IF NOT EXISTS idx_workflow_instance_events_instance_sequence
        ON workflow_instance_events(instance_id, sequence);
      CREATE INDEX IF NOT EXISTS idx_workflow_instance_events_transition
        ON workflow_instance_events(instance_id, transition_id, event_type);

      CREATE TRIGGER IF NOT EXISTS workflow_events_version_guard_insert
      BEFORE INSERT ON workflow_instance_events
      BEGIN
        SELECT CASE WHEN NEW.from_step_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM workflow_instances i
          JOIN workflow_steps s ON s.id = NEW.from_step_id
          WHERE i.id = NEW.instance_id AND s.workflow_version_id = i.workflow_version_id
        ) THEN RAISE(ABORT, 'WORKFLOW_EVENT_FROM_STEP_MISMATCH') END;
        SELECT CASE WHEN NEW.to_step_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM workflow_instances i
          JOIN workflow_steps s ON s.id = NEW.to_step_id
          WHERE i.id = NEW.instance_id AND s.workflow_version_id = i.workflow_version_id
        ) THEN RAISE(ABORT, 'WORKFLOW_EVENT_TO_STEP_MISMATCH') END;
        SELECT CASE WHEN NEW.transition_id IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM workflow_instances i
          JOIN workflow_transitions t ON t.id = NEW.transition_id
          WHERE i.id = NEW.instance_id AND t.workflow_version_id = i.workflow_version_id
        ) THEN RAISE(ABORT, 'WORKFLOW_EVENT_TRANSITION_MISMATCH') END;
      END;
    `);

    db.prepare(`
      INSERT INTO schema_migrations (component, version, applied_at)
      VALUES (?, ?, ?)
      ON CONFLICT(component) DO UPDATE SET
        version = excluded.version,
        applied_at = excluded.applied_at
      WHERE schema_migrations.version < excluded.version
    `).run(WORKFLOW_REGISTRY_MIGRATION, WORKFLOW_REGISTRY_VERSION, new Date().toISOString());
  });

  try {
    migrate();
  } catch (error) {
    throw new Error(
      `[DB_MIGRATION] Failed to migrate ${WORKFLOW_REGISTRY_MIGRATION} to version ${WORKFLOW_REGISTRY_VERSION}`,
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
      presentation_profile TEXT DEFAULT '',
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT DEFAULT 'SYSTEM_LOG',
      dimensions TEXT DEFAULT '{}',
      visibility TEXT DEFAULT 'public',
      audio_url TEXT DEFAULT '',
      drive_path TEXT NOT NULL DEFAULT '',
      drive_file_id TEXT DEFAULT '',
      drive_modified_time TEXT DEFAULT '',
      embedding TEXT DEFAULT '[]',
      read_time TEXT DEFAULT '4 MIN',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT '',
      published INTEGER DEFAULT 1
    );
  `);

  // Migration: Ensure new columns exist if table was already created
  try {
    const cols = db.prepare("PRAGMA table_info(blog_posts)").all().map(c => c.name);
    if (!cols.includes('content_type')) db.exec("ALTER TABLE blog_posts ADD COLUMN content_type TEXT DEFAULT 'blog'");
    if (!cols.includes('presentation_profile')) db.exec("ALTER TABLE blog_posts ADD COLUMN presentation_profile TEXT DEFAULT ''");
    if (!cols.includes('project_id')) db.exec("ALTER TABLE blog_posts ADD COLUMN project_id TEXT DEFAULT 'prj_general'");
    if (!cols.includes('dimensions')) db.exec("ALTER TABLE blog_posts ADD COLUMN dimensions TEXT DEFAULT '{}'");
    if (!cols.includes('visibility')) db.exec("ALTER TABLE blog_posts ADD COLUMN visibility TEXT DEFAULT 'public'");
    if (!cols.includes('audio_url')) db.exec("ALTER TABLE blog_posts ADD COLUMN audio_url TEXT DEFAULT ''");
    if (!cols.includes('video_url')) db.exec("ALTER TABLE blog_posts ADD COLUMN video_url TEXT DEFAULT ''");
    if (!cols.includes('drive_file_id')) db.exec("ALTER TABLE blog_posts ADD COLUMN drive_file_id TEXT DEFAULT ''");
    if (!cols.includes('drive_modified_time')) db.exec("ALTER TABLE blog_posts ADD COLUMN drive_modified_time TEXT DEFAULT ''");
    if (!cols.includes('embedding')) db.exec("ALTER TABLE blog_posts ADD COLUMN embedding TEXT DEFAULT '[]'");
    if (!cols.includes('updated_at')) db.exec("ALTER TABLE blog_posts ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
  } catch (mErr) {
    // Migration safe check
  }

  // Keep the Drive hierarchy as display metadata. This is intentionally an
  // additive migration: existing records retain an empty path until the next
  // source synchronization, and a second initialization performs no write.
  const hasDrivePathColumn = () => db.prepare('PRAGMA table_info(blog_posts)')
    .all()
    .some(column => column.name === 'drive_path');
  if (!hasDrivePathColumn()) {
    try {
      db.transaction(() => {
        db.exec("ALTER TABLE blog_posts ADD COLUMN drive_path TEXT NOT NULL DEFAULT ''");
      })();
    } catch (error) {
      // A concurrent initializer may have completed the same additive change
      // between our schema check and ALTER TABLE. Re-read before failing.
      if (!hasDrivePathColumn()) {
        throw new Error('[DB_MIGRATION] Failed to add blog_posts.drive_path', { cause: error });
      }
    }
  }

  // Every row receives an explicit canonical display profile. This is a
  // one-way, idempotent compatibility migration: `content_type` remains the
  // legacy portal projection, while profile becomes the document-model field.
  const hasPresentationProfileColumn = () => db.prepare('PRAGMA table_info(blog_posts)')
    .all()
    .some(column => column.name === 'presentation_profile');
  if (!hasPresentationProfileColumn()) {
    try {
      db.transaction(() => {
        db.exec("ALTER TABLE blog_posts ADD COLUMN presentation_profile TEXT DEFAULT ''");
      })();
    } catch (error) {
      if (!hasPresentationProfileColumn()) {
        throw new Error('[DB_MIGRATION] Failed to add blog_posts.presentation_profile', { cause: error });
      }
    }
  }
  db.prepare(`
    UPDATE blog_posts
    SET presentation_profile = CASE
      WHEN LOWER(TRIM(COALESCE(content_type, ''))) = 'knowledge' THEN 'knowledge'
      ELSE 'article'
    END
    WHERE TRIM(COALESCE(presentation_profile, '')) = ''
  `).run();

  // 5a. Database-owned folder hierarchy and stable document storage identity.
  //
  // `drive_path` remains immutable provenance for legacy Vault / Drive imports.
  // Author-selected folders live here instead, so moving a document never
  // rewrites its source identity or its binary asset directory.
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_folders (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES content_folders(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_content_folders_parent
      ON content_folders(parent_id, sort_order, name);
    -- SQLite considers NULL values distinct in ordinary UNIQUE constraints.
    -- Coalescing root parent IDs gives roots the same duplicate protection as
    -- children without manufacturing a sentinel foreign-key value.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_content_folders_parent_slug_unique
      ON content_folders(COALESCE(parent_id, ''), slug COLLATE NOCASE);

    CREATE TABLE IF NOT EXISTS content_document_storage (
      post_id INTEGER PRIMARY KEY REFERENCES blog_posts(id) ON DELETE CASCADE,
      storage_key TEXT NOT NULL UNIQUE,
      state TEXT NOT NULL DEFAULT 'ready'
        CHECK (state IN ('ready', 'missing')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- The binary stays in the document's opaque storage directory, while its
    -- safe, database-owned manifest lives here.  This deliberately does not
    -- reuse the legacy Vault/RAG asset projection: database uploads remain
    -- canonical even when no Vault exists.
    CREATE TABLE IF NOT EXISTS content_document_assets (
      asset_id TEXT PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
      relative_path TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
      sha256 TEXT NOT NULL,
      asset_kind TEXT NOT NULL DEFAULT 'other',
      visibility TEXT NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('public', 'private')),
      availability TEXT NOT NULL DEFAULT 'available'
        CHECK (availability IN ('available', 'missing')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_content_document_assets_post
      ON content_document_assets(post_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_content_document_assets_post_path_unique
      ON content_document_assets(post_id, relative_path COLLATE NOCASE);
  `);

  const contentColumns = db.prepare('PRAGMA table_info(blog_posts)').all()
    .map(column => column.name);
  if (!contentColumns.includes('folder_id')) {
    db.exec('ALTER TABLE blog_posts ADD COLUMN folder_id TEXT REFERENCES content_folders(id) ON DELETE SET NULL');
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_blog_posts_folder ON blog_posts(folder_id);
  `);
  // Older rows predate the explicit editing revision timestamp.  Preserve the
  // historical publication date as their initial revision marker.
  db.prepare(`
    UPDATE blog_posts
    SET updated_at = created_at
    WHERE TRIM(COALESCE(updated_at, '')) = ''
  `).run();


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
    CREATE INDEX IF NOT EXISTS idx_blog_posts_presentation_profile ON blog_posts(presentation_profile);
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

  // 6b. Admin-owned taxonomy registry. It has a separate migration component
  // because its vocabulary/schema evolves independently from content FTS.
  ensureTaxonomyRegistrySchema();

  // 6c. Database-owned typed, directed multilayer graph.  It is intentionally
  // independent of both the Markdown vault projection and the legacy
  // hybrid_rag_edges wikilink index.
  ensureGraphRegistrySchema();

  // 7. Hybrid Obsidian / SQL RAG index.
  //
  // `blog_posts` remains the public portal's content store.  The tables below
  // are deliberately separate so frontmatter-only operational bindings,
  // explicit wiki-link edges, and chunk-level retrieval data never have to be
  // exposed through the public content API.
  db.exec(`
    CREATE TABLE IF NOT EXISTS hybrid_rag_documents (
      post_id INTEGER PRIMARY KEY,
      document_id TEXT NOT NULL DEFAULT '',
      source_path TEXT NOT NULL DEFAULT '',
      source_hash TEXT NOT NULL DEFAULT '',
      frontmatter_json TEXT NOT NULL DEFAULT '{}',
      classification TEXT NOT NULL DEFAULT 'internal'
        CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
      rag_index INTEGER NOT NULL DEFAULT 1 CHECK (rag_index IN (0, 1)),
      indexed_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hybrid_rag_documents_document_id
      ON hybrid_rag_documents(document_id)
      WHERE document_id <> '';
    CREATE INDEX IF NOT EXISTS idx_hybrid_rag_documents_classification
      ON hybrid_rag_documents(classification, rag_index);

    CREATE TABLE IF NOT EXISTS hybrid_rag_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      ordinal INTEGER NOT NULL,
      heading TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      token_estimate INTEGER NOT NULL DEFAULT 0,
      source_start INTEGER NOT NULL DEFAULT 0,
      source_end INTEGER NOT NULL DEFAULT 0,
      chunk_hash TEXT NOT NULL,
      embedding TEXT NOT NULL DEFAULT '[]',
      UNIQUE(post_id, ordinal)
    );
    CREATE INDEX IF NOT EXISTS idx_hybrid_rag_chunks_post ON hybrid_rag_chunks(post_id, ordinal);

    CREATE TABLE IF NOT EXISTS hybrid_rag_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_post_id INTEGER NOT NULL,
      target_post_id INTEGER,
      target_reference TEXT NOT NULL,
      target_slug TEXT NOT NULL DEFAULT '',
      target_heading TEXT NOT NULL DEFAULT '',
      label TEXT NOT NULL DEFAULT '',
      relation_type TEXT NOT NULL DEFAULT 'wikilink',
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE(source_post_id, target_reference, target_heading, relation_type)
    );
    CREATE INDEX IF NOT EXISTS idx_hybrid_rag_edges_source ON hybrid_rag_edges(source_post_id);
    CREATE INDEX IF NOT EXISTS idx_hybrid_rag_edges_target ON hybrid_rag_edges(target_post_id);
    CREATE INDEX IF NOT EXISTS idx_hybrid_rag_edges_target_slug ON hybrid_rag_edges(target_slug);

    CREATE TABLE IF NOT EXISTS hybrid_rag_sql_bindings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      sql_project_id TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'operational',
      entity_type TEXT NOT NULL DEFAULT 'project',
      entity_id TEXT NOT NULL,
      fact_profiles TEXT NOT NULL DEFAULT '[]',
      classification TEXT NOT NULL DEFAULT 'internal'
        CHECK (classification IN ('public', 'internal', 'confidential', 'restricted')),
      created_at TEXT NOT NULL,
      UNIQUE(post_id, sql_project_id, provider, entity_type, entity_id)
    );
    CREATE INDEX IF NOT EXISTS idx_hybrid_rag_sql_bindings_post ON hybrid_rag_sql_bindings(post_id);
    CREATE INDEX IF NOT EXISTS idx_hybrid_rag_sql_bindings_project ON hybrid_rag_sql_bindings(sql_project_id);

    -- Binary material (DWG, model, media, PDF) remains next to its Markdown
    -- owner or at an explicit external URL. SQLite stores only a safe manifest
    -- projection: the binary is never embedded or indexed as RAG text.
    CREATE TABLE IF NOT EXISTS hybrid_rag_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      provider TEXT NOT NULL,
      file_id TEXT NOT NULL DEFAULT '',
      uri TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      asset_kind TEXT NOT NULL DEFAULT 'other',
      source_kind TEXT NOT NULL DEFAULT 'external'
        CHECK (source_kind IN ('local', 'external')),
      preview_uri TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('public', 'private')),
      availability TEXT NOT NULL DEFAULT 'available'
        CHECK (availability IN ('available', 'missing')),
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      UNIQUE(post_id, provider, uri)
    );
    CREATE INDEX IF NOT EXISTS idx_hybrid_rag_assets_post ON hybrid_rag_assets(post_id);

    -- Local snapshots make development and an air-gapped pilot runnable. In a
    -- production deployment they are replaced by the allowlisted fact gateway;
    -- no raw SQL is ever stored or accepted by this schema.
    CREATE TABLE IF NOT EXISTS hybrid_rag_sql_snapshots (
      sql_project_id TEXT PRIMARY KEY,
      facts_json TEXT NOT NULL DEFAULT '{}',
      source TEXT NOT NULL DEFAULT 'local_snapshot',
      as_of TEXT NOT NULL,
      expires_at TEXT,
      updated_at TEXT NOT NULL
    );

    -- Retrieval auditing intentionally records only identifiers and hashes,
    -- never prompt text, document bodies, or operational fact values.
    CREATE TABLE IF NOT EXISTS hybrid_rag_retrieval_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      request_id TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL,
      query_hash TEXT NOT NULL DEFAULT '',
      document_ids TEXT NOT NULL DEFAULT '[]',
      chunk_ids TEXT NOT NULL DEFAULT '[]',
      sql_project_ids TEXT NOT NULL DEFAULT '[]',
      fact_profiles TEXT NOT NULL DEFAULT '[]',
      outcome TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hybrid_rag_retrieval_audit_created
      ON hybrid_rag_retrieval_audit(created_at DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS hybrid_rag_chunks_fts USING fts5(
      content,
      heading,
      tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS hybrid_rag_chunks_ai
      AFTER INSERT ON hybrid_rag_chunks BEGIN
      INSERT INTO hybrid_rag_chunks_fts(rowid, content, heading)
      VALUES (new.id, new.content, new.heading);
    END;

    CREATE TRIGGER IF NOT EXISTS hybrid_rag_chunks_ad
      AFTER DELETE ON hybrid_rag_chunks BEGIN
      DELETE FROM hybrid_rag_chunks_fts WHERE rowid = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS hybrid_rag_chunks_au
      AFTER UPDATE ON hybrid_rag_chunks BEGIN
      DELETE FROM hybrid_rag_chunks_fts WHERE rowid = old.id;
      INSERT INTO hybrid_rag_chunks_fts(rowid, content, heading)
      VALUES (new.id, new.content, new.heading);
    END;

    CREATE TRIGGER IF NOT EXISTS hybrid_rag_blog_posts_ad
      AFTER DELETE ON blog_posts BEGIN
      DELETE FROM hybrid_rag_edges
      WHERE source_post_id = old.id OR target_post_id = old.id;
      DELETE FROM hybrid_rag_sql_bindings WHERE post_id = old.id;
      DELETE FROM hybrid_rag_assets WHERE post_id = old.id;
      DELETE FROM hybrid_rag_chunks WHERE post_id = old.id;
      DELETE FROM hybrid_rag_documents WHERE post_id = old.id;
    END;
  `);

  // Additive asset-manifest migration. Older installs only know external
  // Drive-style references; these columns let the same index describe a
  // document-folder DWG/PDF/media file without ever exposing a raw OS path.
  const hybridAssetColumns = db.prepare('PRAGMA table_info(hybrid_rag_assets)').all()
    .map(column => column.name);
  const addHybridAssetColumn = (name, sql) => {
    if (!hybridAssetColumns.includes(name)) db.exec(`ALTER TABLE hybrid_rag_assets ADD COLUMN ${sql}`);
  };
  addHybridAssetColumn('asset_kind', "asset_kind TEXT NOT NULL DEFAULT 'other'");
  addHybridAssetColumn('source_kind', "source_kind TEXT NOT NULL DEFAULT 'external'");
  addHybridAssetColumn('preview_uri', "preview_uri TEXT NOT NULL DEFAULT ''");
  addHybridAssetColumn('visibility', "visibility TEXT NOT NULL DEFAULT 'private'");
  addHybridAssetColumn('availability', "availability TEXT NOT NULL DEFAULT 'available'");
  addHybridAssetColumn('metadata_json', "metadata_json TEXT NOT NULL DEFAULT '{}'");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hybrid_rag_assets_public_post
      ON hybrid_rag_assets(post_id, visibility, availability);
  `);

  // 8. Messages Table (Uplink)
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

  // 7b. Native Workflow v1 is initialized after the general audit table: all
  // runtime mutations are both event-sourced in their own append-only stream
  // and mirrored to the global audit log.
  ensureWorkflowRegistrySchema();

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
      INSERT INTO blog_posts (project_id, content_type, presentation_profile, slug, title, summary, content, category, dimensions, visibility, audio_url, read_time, created_at, updated_at, published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        item.content_type === 'knowledge' ? 'knowledge' : 'article',
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
