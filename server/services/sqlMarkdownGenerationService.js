import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { resolveLocalVaultRoot, localVaultService } from './localVaultService.js';
import { getOperationalFacts, normalizeSqlProjectId } from './sqlFactGateway.js';
import { sqlMarkdownTemplates } from '../templates/sqlMarkdownTemplates.js';
import { dbService } from './dbService.js';
import { projectGraphBindingService } from './projectGraphBindingService.js';
import { vaultTemplateService } from './vaultTemplateService.js';

const GENERATOR_ID = 'sql_markdown_generator';
const PROJECT_TEMPLATE_KEY = 'project_index';
const SQL_PROJECT_FOLDER = '02_SQL_Projects';
const MANAGED_PROJECT_TEMPLATE_ID = 'ca_sql_project_index';

function hasControlCharacter(value) {
  return [...String(value)].some(character => {
    const code = character.codePointAt(0);
    return code !== undefined && (code <= 0x1F || code === 0x7F);
  });
}

function isSameOrDescendant(candidatePath, parentPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function projectSlugFromSqlId(sqlProjectId) {
  const normalized = String(sqlProjectId)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `project-${normalized}`;
}

function requireSnapshotString(value, errorCode, { maxLength = 240 } = {}) {
  if (typeof value !== 'string') throw new Error(errorCode);
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || hasControlCharacter(normalized)) {
    throw new Error(errorCode);
  }
  return normalized;
}

function optionalSnapshotString(value, errorCode, options) {
  if (value === undefined || value === null || value === '') return null;
  return requireSnapshotString(value, errorCode, options);
}

function requireIsoDate(value, errorCode) {
  const normalized = requireSnapshotString(value, errorCode, { maxLength: 80 });
  if (Number.isNaN(Date.parse(normalized))) throw new Error(errorCode);
  return normalized;
}

function requirePlainObject(value, errorCode) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(errorCode);
  return value;
}

function normalizeGenerationTimestamp(value) {
  const candidate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(candidate.getTime())) throw new Error('INVALID_GENERATION_TIMESTAMP');
  return candidate.toISOString();
}

/**
 * The Vault template contains illustrative frontmatter so it can also be
 * opened directly in Obsidian. SQL generation owns the real frontmatter,
 * therefore it imports only the Markdown body after that first YAML block.
 */
export function markdownBodyFromVaultTemplate(source) {
  const normalized = String(source || '').replace(/\r\n/g, '\n');
  const frontmatter = /^---\n[\s\S]*?\n---(?:\n|$)/.exec(normalized);
  return (frontmatter ? normalized.slice(frontmatter[0].length) : normalized).trim();
}

function vaultTemplateFrontmatter(source) {
  const normalized = String(source || '').replace(/\r\n/g, '\n');
  const frontmatter = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (!frontmatter) return {};
  const parsed = yaml.load(frontmatter[1]);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function managedTemplateVersion(source, fallbackVersion) {
  const value = Number(vaultTemplateFrontmatter(source).ca_template_version);
  return Number.isInteger(value) && value >= 1 && value <= 10_000 ? value : fallbackVersion;
}

/**
 * Replaces an intentionally small, explicit placeholder vocabulary. It is
 * not a general-purpose expression engine: SQL facts remain constrained by
 * `parseProjectSnapshot`, and arbitrary code cannot enter a template.
 */
export function renderManagedProjectTemplateBody({ source, project }) {
  const status = project.status || 'nincs megadva a projekt-snapshotban';
  const values = {
    '{{project_name}}': project.name,
    '{{sql_project_id}}': project.id,
    '{{sql_created_at}}': project.createdAt,
    '{{sql_project_status}}': status
  };
  return Object.entries(values).reduce(
    (body, [placeholder, value]) => body.replaceAll(placeholder, String(value)),
    markdownBodyFromVaultTemplate(source)
  );
}

function readManagedProjectTemplate({ project, fallbackTemplate }) {
  try {
    const managed = vaultTemplateService.getTemplate(MANAGED_PROJECT_TEMPLATE_ID);
    const body = renderManagedProjectTemplateBody({ source: managed.body, project });
    if (body) {
      return {
        body,
        template: {
          id: MANAGED_PROJECT_TEMPLATE_ID,
          version: managedTemplateVersion(managed.body, fallbackTemplate.version),
          source: 'vault_catalog'
        }
      };
    }
  } catch {
    // A catalog file can be temporarily unavailable during an atomic admin
    // save. The versioned in-code template preserves create-only generation
    // rather than exposing a partial write or a filesystem implementation
    // detail to the ERP worker.
  }
  return {
    body: fallbackTemplate.renderBody({ project }),
    template: { ...fallbackTemplate, source: 'in_code_fallback' }
  };
}

/**
 * The operational gateway adapts ERP-specific columns to this narrow contract.
 * Requiring the source ID, name and creation date prevents a partial fact
 * snapshot from silently producing a plausible-but-incorrect document shell.
 */
export function parseProjectSnapshot({ sqlProjectId, snapshot }) {
  const source = requirePlainObject(snapshot, 'INVALID_SQL_PROJECT_SNAPSHOT');
  const sourceProjectId = requireSnapshotString(source.project_id, 'SQL_PROJECT_SNAPSHOT_PROJECT_ID_REQUIRED', { maxLength: 120 });
  if (sourceProjectId !== sqlProjectId) throw new Error('SQL_PROJECT_SNAPSHOT_ID_MISMATCH');

  return {
    id: sourceProjectId,
    name: requireSnapshotString(source.name, 'SQL_PROJECT_SNAPSHOT_NAME_REQUIRED'),
    createdAt: requireIsoDate(source.created_at, 'SQL_PROJECT_SNAPSHOT_CREATED_AT_REQUIRED'),
    status: optionalSnapshotString(source.status, 'INVALID_SQL_PROJECT_SNAPSHOT_STATUS', { maxLength: 120 })
  };
}

function createFrontmatter({ project, sqlProjectId, slug, source, sourceAsOf, generatedAt, template }) {
  return {
    // Keep every value in this document compatible with Obsidian's native
    // Properties UI.  In particular, do not add nested YAML maps or arrays
    // of objects here: those are displayed as "unknown" and may be coerced
    // to text by Obsidian.
    schema_version: 2,
    taxonomy_schema: 2,
    tax_industry: [],
    tax_technology: [],
    tax_audience_role: [],
    tags: [],
    ca_template_id: 'ca_sql_project_index',
    ca_template_version: template.version,
    // The project entity itself is a DB-owned `project` node. This generated
    // Markdown index is its attached document, not a duplicate project node.
    ca_node_type: 'document',
    // The graph itself stays database-owned. These flat values are merely
    // Obsidian-safe references to graph views that include this note.
    ca_graph_refs: [],
    ca_sync_version: 1,
    ca_assets_manifest: '.ca-assets.json',
    ca_asset_root: 'assets',
    document_id: `kb:project:${sqlProjectId}:index`,
    title: project.name,
    slug,
    summary: `SQL-vezérelt projektindex: ${project.name}. A strukturális mezőket az üzemi rendszer generálta.`,
    // The document is structurally identical to every other Markdown package.
    // This only selects the initial reader-facing portal view.
    presentation_profile: 'knowledge',
    category: 'SQL VEZÉRELT PROJEKTEK',
    project_id: `sql_${slug.replace(/-/g, '_')}`,
    sql_project_id: sqlProjectId,
    sql_project_name: project.name,
    sql_created_at: project.createdAt,
    ...(project.status ? { sql_project_status: project.status } : {}),
    sql_binding_provider: 'operational',
    sql_binding_entity_type: 'project',
    sql_binding_entity_id: sqlProjectId,
    sql_fact_profiles: ['project_snapshot'],
    classification: 'internal',
    visibility: 'private',
    published: false,
    rag_index: true,
    generated_by: GENERATOR_ID,
    generated_template_id: template.id,
    generated_template_version: template.version,
    generated_sql_snapshot_source: source || 'operational_gateway',
    generated_sql_snapshot_as_of: sourceAsOf || '',
    generated_at: generatedAt,
    generated_ownership: 'sql_for_structure_markdown_for_body'
  };
}

export function renderProjectIndexMarkdown({ project, sqlProjectId, source, sourceAsOf, generatedAt }) {
  const fallbackTemplate = sqlMarkdownTemplates[PROJECT_TEMPLATE_KEY];
  const managedTemplate = readManagedProjectTemplate({ project, fallbackTemplate });
  const template = managedTemplate.template;
  const slug = projectSlugFromSqlId(sqlProjectId);
  const frontmatter = createFrontmatter({
    project,
    sqlProjectId,
    slug,
    source,
    sourceAsOf,
    generatedAt,
    template
  });
  const serializedFrontmatter = yaml.dump(frontmatter, {
    noRefs: true,
    lineWidth: -1,
    quotingType: '"',
    forceQuotes: true
  });

  return {
    template,
    slug,
    frontmatter,
    markdown: `---\n${serializedFrontmatter}---\n\n${managedTemplate.body}\n`
  };
}

function getTargetPath(vaultRoot, slug) {
  // `Content` is the neutral canonical root. Legacy KnowledgeBase and Blog
  // trees remain readable but must not determine the semantic document type.
  const outputRoot = path.resolve(vaultRoot, 'Content', SQL_PROJECT_FOLDER);
  const targetPath = path.resolve(outputRoot, slug, 'index.md');
  if (!isSameOrDescendant(targetPath, outputRoot)) throw new Error('SQL_MARKDOWN_OUTPUT_PATH_INVALID');
  return { outputRoot, targetPath };
}

function relativeVaultPath(vaultRoot, targetPath) {
  return path.relative(vaultRoot, targetPath).replace(/\\/g, '/');
}

function resultBase({ sqlProjectId, rendered, vaultRoot, targetPath }) {
  return {
    operation: 'SQL_MARKDOWN_PROJECT_INDEX_GENERATION',
    generator: GENERATOR_ID,
    sql_project_id: sqlProjectId,
    template_id: rendered.template.id,
    template_version: rendered.template.version,
    document_id: rendered.frontmatter.document_id,
    slug: rendered.slug,
    target_path: relativeVaultPath(vaultRoot, targetPath)
  };
}

// The public portal workspace and project graph are projections around an
// SQL-created document, never replacements for the ERP project's identity.
// This gives `project_id` in generated frontmatter a real, queryable target.
function ensureSqlProjectWorkspace({ project, rendered }) {
  const projectId = rendered.frontmatter.project_id;
  let workspace = dbService.getKnowledgeProjectById(projectId);
  if (!workspace) {
    workspace = dbService.createKnowledgeProject({
      id: projectId,
      name: project.name,
      slug: rendered.slug,
      description: `SQL-vezérelt munkatér az üzemi ${project.id} projekthez.`,
      icon: 'folder',
      color: '#80FF00',
      visibility: 'private',
      sort_order: 0
    }, 'SQL_MARKDOWN_GENERATOR');
  }
  const graph = projectGraphBindingService.ensureProjectGraph({
    project: workspace,
    actor: 'SQL_MARKDOWN_GENERATOR_GRAPH'
  });
  return { workspace, graph: graph.graph };
}

/**
 * Creates one SQL-owned project skeleton in the canonical Obsidian vault.
 * It intentionally has no update mode: generation races and human edits are
 * resolved by preserving the first file and reporting it as already present.
 */
export async function generateSqlProjectIndex({
  sqlProjectId,
  env = process.env,
  fetchImpl = fetch,
  now = () => new Date(),
  dryRun = false,
  syncVault = true
} = {}) {
  const normalizedProjectId = normalizeSqlProjectId(sqlProjectId);
  const configuredGatewayUrl = String(env.HYBRID_SQL_FACT_GATEWAY_URL || '').trim();
  if (!configuredGatewayUrl) throw new Error('SQL_PROJECT_SOURCE_NOT_AUTHORITATIVE');
  const factsResult = await getOperationalFacts({
    sqlProjectId: normalizedProjectId,
    factProfiles: ['project_snapshot'],
    env,
    fetchImpl
  });
  if (factsResult.source === 'local_snapshot') {
    throw new Error('SQL_PROJECT_SOURCE_NOT_AUTHORITATIVE');
  }
  if (factsResult.availability !== 'available' || !factsResult.facts?.project_snapshot) {
    throw new Error('SQL_PROJECT_SNAPSHOT_UNAVAILABLE');
  }

  const project = parseProjectSnapshot({
    sqlProjectId: normalizedProjectId,
    snapshot: factsResult.facts.project_snapshot
  });
  const generatedAt = normalizeGenerationTimestamp(typeof now === 'function' ? now() : now);
  const rendered = renderProjectIndexMarkdown({
    project,
    sqlProjectId: normalizedProjectId,
    source: factsResult.source,
    sourceAsOf: factsResult.as_of,
    generatedAt
  });
  const vaultRoot = resolveLocalVaultRoot();
  const { targetPath } = getTargetPath(vaultRoot, rendered.slug);
  const base = resultBase({
    sqlProjectId: normalizedProjectId,
    rendered,
    vaultRoot,
    targetPath
  });

  if (fs.existsSync(targetPath)) {
    return { ...base, status: 'skipped_existing', created: false, sync: { status: 'not_run' } };
  }
  if (dryRun) {
    return { ...base, status: 'would_create', created: false, sync: { status: 'not_run' } };
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  try {
    fs.writeFileSync(targetPath, rendered.markdown, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error?.code === 'EEXIST') {
      return { ...base, status: 'skipped_existing', created: false, sync: { status: 'not_run' } };
    }
    throw error;
  }

  const projectWorkspace = ensureSqlProjectWorkspace({ project, rendered });

  if (!syncVault) {
    return { ...base, status: 'created', created: true, project_workspace: projectWorkspace, sync: { status: 'not_requested' } };
  }

  const syncReport = localVaultService.sync({ actor: 'SQL_MARKDOWN_GENERATOR' });
  const syncErrors = Array.isArray(syncReport.errors) ? syncReport.errors : [];
  return {
    ...base,
    status: syncErrors.length === 0 ? 'created_and_indexed' : 'created_pending_sync',
    created: true,
    project_workspace: projectWorkspace,
    sync: {
      status: syncErrors.length === 0 ? 'completed' : 'rejected',
      report: syncReport
    }
  };
}

export const sqlMarkdownGenerationService = Object.freeze({
  generateSqlProjectIndex,
  parseProjectSnapshot,
  renderProjectIndexMarkdown
});
