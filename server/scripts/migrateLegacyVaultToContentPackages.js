import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '../..');
const WORKSPACE_ROOT = path.resolve(APP_ROOT, '..');
const DEFAULT_VAULT_ROOT = path.resolve(WORKSPACE_ROOT, 'CyberArchitect');
const MARKDOWN_FILE_PATTERN = /\.(?:md|markdown)$/i;
const CANONICAL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,179}$/;

const LEGACY_CORPORA = [
  {
    name: 'KnowledgeBase',
    destinationCollection: '01_Tudastar',
    fallbackProfile: 'knowledge',
    documentIdPrefix: 'kb'
  },
  {
    name: 'Blog',
    destinationCollection: '02_Cikkek',
    fallbackProfile: 'article',
    documentIdPrefix: 'article'
  }
];

const CANONICAL_FRONTMATTER_ORDER = [
  'schema_version',
  'taxonomy_schema',
  'document_id',
  'presentation_profile',
  'title',
  'slug',
  'summary',
  'project_id',
  'category',
  'visibility',
  'published',
  'read_time',
  'tax_industry',
  'tax_technology',
  'tax_audience_role',
  'tax_pain_point',
  'tags',
  'ca_template_id',
  'ca_template_version',
  'ca_node_type',
  'ca_graph_refs',
  'ca_sync_version',
  'ca_assets_manifest',
  'ca_asset_root'
];

function createMigrationError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function isSameOrDescendant(candidatePath, parentPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function toVaultPath(vaultRoot, filePath) {
  return path.relative(vaultRoot, filePath).replace(/\\/g, '/');
}

function resolveVaultRoot(vaultRoot, env = process.env) {
  const configured = typeof vaultRoot === 'string' && vaultRoot.trim()
    ? vaultRoot.trim()
    : (typeof env.CYBER_ARCHITECT_CONTENT_ROOT === 'string' && env.CYBER_ARCHITECT_CONTENT_ROOT.trim()
      ? env.CYBER_ARCHITECT_CONTENT_ROOT.trim()
      : DEFAULT_VAULT_ROOT);
  const resolved = path.isAbsolute(configured)
    ? path.normalize(configured)
    : path.resolve(APP_ROOT, configured);

  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw createMigrationError('LOCAL_VAULT_ROOT_INVALID', 'A megadott Obsidian vault gyökér nem elérhető könyvtár.', {
      vault_root: resolved
    });
  }
  return resolved;
}

function assertNoSymlink(filePath, vaultRoot) {
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    throw createMigrationError('VAULT_SYMLINK_SKIPPED', 'A migráció nem követhet szimbolikus linket.', {
      source_path: toVaultPath(vaultRoot, filePath)
    });
  }
  return stat;
}

function collectMarkdownFiles(baseDir, vaultRoot, files = []) {
  if (!fs.existsSync(baseDir)) return files;
  const baseStat = assertNoSymlink(baseDir, vaultRoot);
  if (!baseStat.isDirectory()) {
    throw createMigrationError('VAULT_DIRECTORY_INVALID', 'A legacy korpusz könyvtár kell legyen.', {
      source_path: toVaultPath(vaultRoot, baseDir)
    });
  }

  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const fullPath = path.join(baseDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw createMigrationError('VAULT_SYMLINK_SKIPPED', 'A migráció nem követhet szimbolikus linket.', {
        source_path: toVaultPath(vaultRoot, fullPath)
      });
    }
    if (entry.isDirectory()) {
      collectMarkdownFiles(fullPath, vaultRoot, files);
      continue;
    }
    if (entry.isFile() && MARKDOWN_FILE_PATTERN.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function inferSlug(value) {
  const slug = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || `note-${crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16)}`;
}

function parseFrontmatter(rawContent, sourcePath) {
  const content = String(rawContent || '').replace(/^\uFEFF/, '');
  const match = /^---[\t ]*\r?\n([\s\S]*?)\r?\n---[\t ]*(\r?\n|$)/.exec(content);
  if (!match) {
    throw createMigrationError('VAULT_FRONTMATTER_REQUIRED', 'A csomagmigrációhoz minden legacy dokumentumnak YAML frontmatterrel kell kezdődnie.', {
      source_path: sourcePath
    });
  }

  let metadata;
  try {
    metadata = yaml.load(match[1]) || {};
  } catch {
    throw createMigrationError('VAULT_FRONTMATTER_INVALID', 'A YAML frontmatter nem értelmezhető.', {
      source_path: sourcePath
    });
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw createMigrationError('VAULT_FRONTMATTER_INVALID', 'A YAML frontmatter gyökere kulcs-érték leképezés kell legyen.', {
      source_path: sourcePath
    });
  }

  return {
    metadata,
    body: content.slice(match[0].length),
    lineEnding: content.includes('\r\n') ? '\r\n' : '\n'
  };
}

function normalizePresentationProfile(metadata, fallbackProfile, sourcePath) {
  const rawProfile = String(metadata.presentation_profile || '').trim().toLowerCase();
  const rawContentType = String(metadata.content_type || '').trim().toLowerCase();
  const profile = rawProfile === 'blog' ? 'article' : (rawProfile || fallbackProfile);
  const contentTypeProfile = rawContentType === 'blog' || rawContentType === 'article'
    ? 'article'
    : (rawContentType === 'knowledge' ? 'knowledge' : '');

  if (!['knowledge', 'article'].includes(profile)) {
    throw createMigrationError('VAULT_PRESENTATION_PROFILE_INVALID', 'A presentation_profile csak knowledge vagy article lehet.', {
      source_path: sourcePath,
      presentation_profile: metadata.presentation_profile
    });
  }
  if (contentTypeProfile && contentTypeProfile !== profile) {
    throw createMigrationError('VAULT_PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT', 'A presentation_profile és a legacy content_type más megjelenítési profilt jelöl.', {
      source_path: sourcePath,
      presentation_profile: metadata.presentation_profile,
      content_type: metadata.content_type
    });
  }
  return profile;
}

function normalizeGraphRefs(value, sourcePath) {
  if (value === undefined || value === null || value === '') return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || !item.trim())) {
    throw createMigrationError('VAULT_GRAPH_REFS_INVALID', 'A ca_graph_refs nem üres sztringek listája kell legyen.', {
      source_path: sourcePath
    });
  }
  return [...new Set(value.map(item => item.trim()))];
}

function canonicalDocumentId(metadata, { prefix, slug, sourcePath }) {
  const current = typeof metadata.document_id === 'string' ? metadata.document_id.trim() : '';
  const documentId = current || `${prefix}:${slug}`;
  if (!DOCUMENT_ID_PATTERN.test(documentId)) {
    throw createMigrationError('VAULT_DOCUMENT_ID_INVALID', 'A document_id formátuma nem megengedett.', {
      source_path: sourcePath,
      document_id: documentId
    });
  }
  return documentId;
}

function packageRelativePath({ corpus, sourceRelativePath, slug }) {
  const sourceDirectory = path.dirname(sourceRelativePath);
  const normalizedDirectory = sourceDirectory === '.' ? [] : sourceDirectory.split(/[\\/]+/).filter(Boolean);
  if (normalizedDirectory.length && inferSlug(normalizedDirectory.at(-1)) === slug) {
    normalizedDirectory.pop();
  }
  const categoryPath = normalizedDirectory.length ? normalizedDirectory : ['00_Utmutatok'];
  return path.join('Content', corpus.destinationCollection, ...categoryPath, slug, 'index.md');
}

function reorderFrontmatter(metadata) {
  const ordered = {};
  for (const key of CANONICAL_FRONTMATTER_ORDER) {
    if (Object.hasOwn(metadata, key)) ordered[key] = metadata[key];
  }
  for (const [key, value] of Object.entries(metadata)) {
    if (!Object.hasOwn(ordered, key)) ordered[key] = value;
  }
  return ordered;
}

function buildMigratedMarkdown(rawContent, { corpus, sourcePath, sourceRelativePath }) {
  const parsed = parseFrontmatter(rawContent, sourcePath);
  const metadata = { ...parsed.metadata };
  const sourceStem = path.basename(sourceRelativePath).replace(MARKDOWN_FILE_PATTERN, '');
  const slug = String(metadata.slug || inferSlug(sourceStem)).trim().toLowerCase();
  if (!CANONICAL_SLUG_PATTERN.test(slug)) {
    throw createMigrationError('VAULT_SLUG_INVALID', 'A slug csak kisbetűt, számot és egyszeres kötőjelet tartalmazhat.', {
      source_path: sourcePath,
      slug
    });
  }
  if (metadata.dimensions !== undefined) {
    throw createMigrationError('VAULT_LEGACY_DIMENSIONS_PRESENT', 'A nested dimensions frontmattert előbb a taxonómia-migrációval kell lapos tax_* mezőkre alakítani.', {
      source_path: sourcePath
    });
  }

  const presentationProfile = normalizePresentationProfile(metadata, corpus.fallbackProfile, sourcePath);
  const documentId = canonicalDocumentId(metadata, {
    prefix: corpus.documentIdPrefix,
    slug,
    sourcePath
  });

  metadata.schema_version = 2;
  metadata.taxonomy_schema = 2;
  metadata.document_id = documentId;
  metadata.presentation_profile = presentationProfile;
  metadata.slug = slug;
  metadata.ca_template_id = metadata.ca_template_id || (presentationProfile === 'article' ? 'ca_public_article' : 'ca_knowledge_note');
  metadata.ca_template_version = metadata.ca_template_version || 1;
  metadata.ca_node_type = metadata.ca_node_type || 'document';
  metadata.ca_graph_refs = normalizeGraphRefs(metadata.ca_graph_refs, sourcePath);
  metadata.ca_sync_version = metadata.ca_sync_version || 1;
  metadata.ca_assets_manifest = metadata.ca_assets_manifest || '.ca-assets.json';
  metadata.ca_asset_root = metadata.ca_asset_root || 'assets';
  delete metadata.content_type;

  const renderedFrontmatter = yaml.dump(reorderFrontmatter(metadata), {
    noRefs: true,
    lineWidth: -1,
    quotingType: '"'
  }).trimEnd().replace(/\n/g, parsed.lineEnding);
  return {
    markdown: `---${parsed.lineEnding}${renderedFrontmatter}${parsed.lineEnding}---${parsed.lineEnding}${parsed.body}`,
    slug,
    documentId,
    presentationProfile
  };
}

function assetSourcePaths(filePath, slug, vaultRoot) {
  const directory = path.dirname(filePath);
  if (inferSlug(path.basename(directory)) !== slug) return [];
  const candidates = [
    path.join(directory, '.ca-assets.json'),
    path.join(directory, 'assets')
  ];
  const artifactPaths = [];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const stat = assertNoSymlink(candidate, vaultRoot);
    if (candidate.endsWith('.json') && !stat.isFile()) {
      throw createMigrationError('VAULT_ASSET_MANIFEST_INVALID', 'A .ca-assets.json normál fájl kell legyen.', {
        source_path: toVaultPath(vaultRoot, candidate)
      });
    }
    if (path.basename(candidate) === 'assets' && !stat.isDirectory()) {
      throw createMigrationError('VAULT_ASSET_DIRECTORY_INVALID', 'Az assets normál könyvtár kell legyen.', {
        source_path: toVaultPath(vaultRoot, candidate)
      });
    }
    artifactPaths.push(candidate);
  }
  return artifactPaths;
}

function copyDirectory(source, target, vaultRoot) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isSymbolicLink()) {
      throw createMigrationError('VAULT_SYMLINK_SKIPPED', 'A migráció nem követhet szimbolikus linket.', {
        source_path: toVaultPath(vaultRoot, sourcePath)
      });
    }
    if (entry.isDirectory()) copyDirectory(sourcePath, targetPath, vaultRoot);
    else if (entry.isFile()) fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
  }
}

function copyArtifact(sourcePath, targetPath, vaultRoot) {
  const stat = assertNoSymlink(sourcePath, vaultRoot);
  if (stat.isDirectory()) {
    copyDirectory(sourcePath, targetPath, vaultRoot);
  } else if (stat.isFile()) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath, fs.constants.COPYFILE_EXCL);
  }
}

function assertSafeTarget(vaultRoot, targetPath) {
  const contentRoot = path.resolve(vaultRoot, 'Content');
  if (!isSameOrDescendant(targetPath, contentRoot)) {
    throw createMigrationError('TARGET_PATH_INVALID', 'A célcsomag csak a Content könyvtár alatt lehet.', {
      target_path: toVaultPath(vaultRoot, targetPath)
    });
  }
}

export function createContentPackageMigrationPlan({ vaultRoot, env = process.env } = {}) {
  const resolvedVaultRoot = resolveVaultRoot(vaultRoot, env);
  const files = [];
  const plan = [];
  const errors = [];
  const targets = new Map();

  for (const corpus of LEGACY_CORPORA) {
    const corpusDir = path.join(resolvedVaultRoot, corpus.name);
    let corpusFiles = [];
    try {
      corpusFiles = collectMarkdownFiles(corpusDir, resolvedVaultRoot).sort((a, b) => a.localeCompare(b, 'en'));
    } catch (error) {
      errors.push({
        code: error?.code || 'VAULT_DISCOVERY_FAILED',
        message: error?.message || 'A legacy korpusz felderítése sikertelen.',
        ...(error?.details || {})
      });
      continue;
    }

    for (const filePath of corpusFiles) {
      files.push(filePath);
      const sourcePath = toVaultPath(resolvedVaultRoot, filePath);
      try {
        const sourceRelativePath = path.relative(corpusDir, filePath);
        const rawContent = fs.readFileSync(filePath, 'utf8');
        const migrated = buildMigratedMarkdown(rawContent, { corpus, sourcePath, sourceRelativePath });
        const targetRelativePath = packageRelativePath({
          corpus,
          sourceRelativePath,
          slug: migrated.slug
        });
        const targetPath = path.resolve(resolvedVaultRoot, targetRelativePath);
        assertSafeTarget(resolvedVaultRoot, targetPath);
        const targetPackageDir = path.dirname(targetPath);
        const artifacts = assetSourcePaths(filePath, migrated.slug, resolvedVaultRoot);
        const normalizedTarget = toVaultPath(resolvedVaultRoot, targetPath).toLowerCase();
        const prior = targets.get(normalizedTarget);
        if (prior) {
          throw createMigrationError('CONTENT_PACKAGE_TARGET_COLLISION', 'Két legacy dokumentum ugyanabba a Content-csomagba kerülne.', {
            source_path: sourcePath,
            target_path: toVaultPath(resolvedVaultRoot, targetPath),
            conflicting_source_path: prior.sourcePath
          });
        }
        if (fs.existsSync(targetPackageDir)) {
          throw createMigrationError('CONTENT_PACKAGE_TARGET_EXISTS', 'A cél Content-csomag már létezik; a migráció nem ír felül meglévő anyagot.', {
            source_path: sourcePath,
            target_path: toVaultPath(resolvedVaultRoot, targetPath)
          });
        }
        const item = {
          corpus: corpus.name,
          sourcePath,
          filePath,
          targetPath,
          targetPackageDir,
          targetPathRelative: toVaultPath(resolvedVaultRoot, targetPath),
          markdown: migrated.markdown,
          slug: migrated.slug,
          documentId: migrated.documentId,
          presentationProfile: migrated.presentationProfile,
          artifacts
        };
        targets.set(normalizedTarget, item);
        plan.push(item);
      } catch (error) {
        errors.push({
          source_path: sourcePath,
          code: error?.code || 'CONTENT_PACKAGE_MIGRATION_PLAN_FAILED',
          message: error?.message || 'A dokumentum csomagterve nem készíthető el.',
          ...(error?.details || {})
        });
      }
    }
  }

  return { vaultRoot: resolvedVaultRoot, files, plan, errors };
}

function defaultBackupDirectory(vaultRoot) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(vaultRoot, '.cyberarchitect-backups', 'content-package-migration', timestamp);
}

function resolveBackupDirectory(vaultRoot, backupDirectory) {
  const resolved = backupDirectory ? path.resolve(backupDirectory) : defaultBackupDirectory(vaultRoot);
  if (!isSameOrDescendant(resolved, vaultRoot) || resolved === path.resolve(vaultRoot)) {
    throw createMigrationError('BACKUP_DIRECTORY_INVALID', 'A backup könyvtárnak a vault alatt kell lennie, de nem lehet maga a vault gyökere.', {
      backup_directory: resolved
    });
  }
  return resolved;
}

function backupSourceArtifacts({ vaultRoot, plan, backupDirectory }) {
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  for (const item of plan) {
    const sourceBackup = path.join(backupDirectory, ...item.sourcePath.split('/'));
    fs.mkdirSync(path.dirname(sourceBackup), { recursive: true });
    fs.copyFileSync(item.filePath, sourceBackup, fs.constants.COPYFILE_EXCL);
    for (const artifact of item.artifacts) {
      const relativeArtifact = toVaultPath(vaultRoot, artifact);
      copyArtifact(artifact, path.join(backupDirectory, ...relativeArtifact.split('/')), vaultRoot);
    }
  }
}

function writeAtomic(filePath, content) {
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.migration-${crypto.randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporary, content, 'utf8');
    fs.renameSync(temporary, filePath);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

function removeSourceArtifacts(item) {
  fs.rmSync(item.filePath, { force: false });
  for (const artifact of item.artifacts) fs.rmSync(artifact, { recursive: true, force: false });
  const sourceDir = path.dirname(item.filePath);
  if (inferSlug(path.basename(sourceDir)) === item.slug && fs.existsSync(sourceDir) && fs.readdirSync(sourceDir).length === 0) {
    fs.rmdirSync(sourceDir);
  }
}

function pruneEmptyDirectories(directory, stopAt) {
  const resolvedStopAt = path.resolve(stopAt);
  let current = path.resolve(directory);
  while (isSameOrDescendant(current, resolvedStopAt) && !fs.existsSync(current) && current !== resolvedStopAt) {
    current = path.dirname(current);
  }
  while (isSameOrDescendant(current, resolvedStopAt) && fs.existsSync(current)) {
    if (!fs.statSync(current).isDirectory() || fs.readdirSync(current).length > 0) return;
    fs.rmdirSync(current);
    if (current === resolvedStopAt) return;
    current = path.dirname(current);
  }
}

function restoreSourcesFromBackup({ vaultRoot, plan, backupDirectory }) {
  for (const item of plan) {
    const sourceBackup = path.join(backupDirectory, ...item.sourcePath.split('/'));
    if (fs.existsSync(sourceBackup) && !fs.existsSync(item.filePath)) {
      fs.mkdirSync(path.dirname(item.filePath), { recursive: true });
      fs.copyFileSync(sourceBackup, item.filePath);
    }
    for (const artifact of item.artifacts) {
      const relativeArtifact = toVaultPath(vaultRoot, artifact);
      const artifactBackup = path.join(backupDirectory, ...relativeArtifact.split('/'));
      if (fs.existsSync(artifactBackup) && !fs.existsSync(artifact)) copyArtifact(artifactBackup, artifact, vaultRoot);
    }
  }
}

function applyMigrationPlan({ vaultRoot, plan, backupDirectory }) {
  const createdPackages = [];
  try {
    backupSourceArtifacts({ vaultRoot, plan, backupDirectory });
    for (const item of plan) {
      fs.mkdirSync(path.dirname(item.targetPackageDir), { recursive: true });
      fs.mkdirSync(item.targetPackageDir, { recursive: false });
      createdPackages.push(item.targetPackageDir);
      writeAtomic(item.targetPath, item.markdown);
      for (const artifact of item.artifacts) {
        copyArtifact(artifact, path.join(item.targetPackageDir, path.basename(artifact)), vaultRoot);
      }
    }
    for (const item of plan) removeSourceArtifacts(item);
    for (const item of plan) {
      pruneEmptyDirectories(path.dirname(item.filePath), path.join(vaultRoot, item.corpus));
    }
  } catch (error) {
    for (const packageDir of createdPackages.reverse()) {
      if (fs.existsSync(packageDir)) fs.rmSync(packageDir, { recursive: true, force: true });
    }
    try {
      restoreSourcesFromBackup({ vaultRoot, plan, backupDirectory });
    } catch (restoreError) {
      error.restore_error = restoreError?.code || restoreError?.message || 'CONTENT_PACKAGE_MIGRATION_RESTORE_FAILED';
    }
    throw createMigrationError('CONTENT_PACKAGE_MIGRATION_WRITE_FAILED', 'A Content-csomag migráció sikertelen; a létrehozott célcsomagok és az eredeti források visszaállítása megtörtént.', {
      vault_root: vaultRoot,
      backup_directory: backupDirectory,
      cause: error?.message || String(error),
      ...(error?.restore_error ? { restore_error: error.restore_error } : {})
    });
  }
}

/**
 * Move legacy KnowledgeBase/ and Blog/ Markdown into canonical Content/
 * document packages. The migration previews by default, validates every
 * source before writing, creates a vault-local backup, and refuses all
 * destination collisions instead of overwriting content.
 */
export function migrateLegacyVaultToContentPackages({
  vaultRoot,
  apply = false,
  backupDirectory,
  env = process.env
} = {}) {
  const { vaultRoot: resolvedVaultRoot, files, plan, errors } = createContentPackageMigrationPlan({ vaultRoot, env });
  const report = {
    operation: 'LEGACY_VAULT_CONTENT_PACKAGE_MIGRATION',
    dry_run: !apply,
    vault_root: resolvedVaultRoot,
    discovered: files.length,
    would_migrate: plan.length,
    migrated: 0,
    removed_legacy_sources: 0,
    backup_directory: null,
    errors,
    files: plan.map(item => ({
      source_path: item.sourcePath,
      target_path: item.targetPathRelative,
      presentation_profile: item.presentationProfile,
      document_id: item.documentId,
      status: apply ? 'PENDING' : 'WOULD_MIGRATE'
    }))
  };

  if (!apply || errors.length > 0 || plan.length === 0) return report;

  const resolvedBackupDirectory = resolveBackupDirectory(resolvedVaultRoot, backupDirectory);
  if (fs.existsSync(resolvedBackupDirectory)) {
    throw createMigrationError('BACKUP_DIRECTORY_EXISTS', 'A backup könyvtár már létezik; válassz új útvonalat.', {
      backup_directory: resolvedBackupDirectory
    });
  }
  applyMigrationPlan({
    vaultRoot: resolvedVaultRoot,
    plan,
    backupDirectory: resolvedBackupDirectory
  });
  report.migrated = plan.length;
  report.removed_legacy_sources = plan.length;
  report.backup_directory = resolvedBackupDirectory;
  report.files = report.files.map(file => ({
    ...file,
    status: 'MIGRATED'
  }));
  return report;
}

function parseArguments(argv) {
  const options = { apply: false, backupDirectory: undefined };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--apply') {
      options.apply = true;
      continue;
    }
    if (argument === '--dry-run') {
      options.apply = false;
      continue;
    }
    if (argument === '--backup-dir') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw createMigrationError('INVALID_ARGUMENT', 'A --backup-dir után útvonal szükséges.');
      options.backupDirectory = value;
      index++;
      continue;
    }
    if (argument.startsWith('--backup-dir=')) {
      options.backupDirectory = argument.slice('--backup-dir='.length);
      continue;
    }
    if (argument === '--help' || argument === '-h') return { help: true };
    throw createMigrationError('INVALID_ARGUMENT', `Ismeretlen paraméter: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    'Használat:',
    '  node server/scripts/migrateLegacyVaultToContentPackages.js',
    '  node server/scripts/migrateLegacyVaultToContentPackages.js --apply [--backup-dir <vault-alatti-mappa>]',
    '',
    'Alapértelmezésben csak dry-run riport készül. --apply előtt minden legacy',
    'forrás a vault alatti .cyberarchitect-backups/content-package-migration könyvtárba kerül.',
    'A migráció nem ír felül Content/ csomagot, és csak akkor törli a régi forrást,',
    'ha minden célcsomag biztonságosan elkészült.'
  ].join('\n') + '\n');
}

if (process.argv[1] === __filename) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      printHelp();
    } else {
      const report = migrateLegacyVaultToContentPackages(options);
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (report.errors.length > 0) process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      operation: 'LEGACY_VAULT_CONTENT_PACKAGE_MIGRATION',
      error: error?.code || 'CONTENT_PACKAGE_MIGRATION_FAILED',
      message: error?.message || String(error),
      ...(error?.details ? { details: error.details } : {})
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
