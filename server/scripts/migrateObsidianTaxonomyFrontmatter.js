import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  CANONICAL_TAXONOMY_FIELDS,
  createCanonicalTaxonomyFrontmatter,
  FrontmatterTaxonomyError,
  normalizeFrontmatterTaxonomy
} from '../services/frontmatterTaxonomy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '../..');
const WORKSPACE_ROOT = path.resolve(APP_ROOT, '..');
const DEFAULT_VAULT_ROOT = path.resolve(WORKSPACE_ROOT, 'CyberArchitect');
const MARKDOWN_FILE_PATTERN = /\.(?:md|markdown)$/i;

const REMOVED_FRONTMATTER_FIELDS = new Set([
  'schema_version',
  'taxonomy_schema',
  'dimensions',
  'iparag',
  'technologia',
  'celcsoport',
  'fajdalompont',
  ...Object.values(CANONICAL_TAXONOMY_FIELDS)
]);

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

function collectMarkdownFiles(baseDir, vaultRoot, files = []) {
  if (!fs.existsSync(baseDir)) return files;
  const stat = fs.lstatSync(baseDir);
  if (stat.isSymbolicLink()) {
    throw createMigrationError('VAULT_SYMLINK_SKIPPED', 'A migráció nem követhet szimbolikus linket.', {
      source_path: path.relative(vaultRoot, baseDir).replace(/\\/g, '/')
    });
  }
  if (!stat.isDirectory()) {
    throw createMigrationError('VAULT_DIRECTORY_INVALID', 'A vault korpusz könyvtár kell legyen.', {
      source_path: path.relative(vaultRoot, baseDir).replace(/\\/g, '/')
    });
  }

  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const target = path.join(baseDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw createMigrationError('VAULT_SYMLINK_SKIPPED', 'A migráció nem követhet szimbolikus linket.', {
        source_path: path.relative(vaultRoot, target).replace(/\\/g, '/')
      });
    }
    if (entry.isDirectory()) {
      collectMarkdownFiles(target, vaultRoot, files);
      continue;
    }
    if (entry.isFile() && MARKDOWN_FILE_PATTERN.test(entry.name)) files.push(target);
  }
  return files;
}

function parseFrontmatter(rawContent, sourcePath) {
  const content = String(rawContent || '').replace(/^\uFEFF/, '');
  const match = /^---[\t ]*\r?\n([\s\S]*?)\r?\n---[\t ]*(\r?\n|$)/.exec(content);
  if (!match) {
    throw createMigrationError('VAULT_FRONTMATTER_REQUIRED', 'A migrációhoz minden dokumentumnak YAML frontmatterrel kell kezdődnie.', {
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
    content,
    metadata,
    yamlText: match[1],
    body: content.slice(match[0].length),
    closingNewline: match[2] || ''
  };
}

function isTopLevelProperty(line) {
  return /^([A-Za-z_][A-Za-z0-9_-]*)\s*:/.exec(line);
}

/**
 * Remove just the taxonomy blocks.  The rest of frontmatter stays verbatim,
 * including its comments and YAML formatting, so migration does not churn
 * unrelated business metadata.
 */
function stripTaxonomyProperties(yamlText, lineEnding, removedFields = REMOVED_FRONTMATTER_FIELDS) {
  const lines = yamlText.split(/\r?\n/);
  const kept = [];
  let skipping = false;

  for (const line of lines) {
    const property = isTopLevelProperty(line);
    if (property) {
      skipping = removedFields.has(property[1]);
      if (!skipping) kept.push(line);
      continue;
    }
    if (skipping && (line.trim() === '' || /^\s/.test(line))) continue;
    if (skipping) skipping = false;
    kept.push(line);
  }

  return kept.join(lineEnding).replace(/^(?:\r?\n)+|(?:\r?\n)+$/g, '');
}

function renderCanonicalTaxonomyBlock(metadata) {
  const canonical = createCanonicalTaxonomyFrontmatter(metadata, { includePainPointTags: true });
  return {
    canonical,
    yaml: yaml.dump(canonical, {
      noRefs: true,
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: true
    }).trimEnd()
  };
}

export function buildMigratedMarkdown(rawContent, { sourcePath = '' } = {}) {
  const parsed = parseFrontmatter(rawContent, sourcePath);
  let normalized;
  try {
    normalized = normalizeFrontmatterTaxonomy(parsed.metadata);
  } catch (error) {
    if (error instanceof FrontmatterTaxonomyError || error?.code) throw error;
    throw createMigrationError('VAULT_TAXONOMY_INVALID', 'A taxonómia-frontmatter nem normalizálható.', {
      source_path: sourcePath
    });
  }

  if (!normalized.needs_migration) {
    return { markdown: parsed.content, changed: false, normalized };
  }

  const lineEnding = parsed.content.includes('\r\n') ? '\r\n' : '\n';
  const renderedCanonical = renderCanonicalTaxonomyBlock(parsed.metadata);
  const canonicalBlock = renderedCanonical.yaml.replace(/\n/g, lineEnding);
  const removedFields = new Set(REMOVED_FRONTMATTER_FIELDS);
  if (Object.hasOwn(renderedCanonical.canonical, 'tags')) removedFields.add('tags');
  const remainingFrontmatter = stripTaxonomyProperties(parsed.yamlText, lineEnding, removedFields);
  const frontmatter = remainingFrontmatter
    ? `${canonicalBlock}${lineEnding}${remainingFrontmatter}`
    : canonicalBlock;
  const markdown = `---${lineEnding}${frontmatter}${lineEnding}---${parsed.closingNewline}${parsed.body}`;

  return { markdown, changed: markdown !== parsed.content, normalized };
}

function relativeVaultPath(vaultRoot, filePath) {
  return path.relative(vaultRoot, filePath).replace(/\\/g, '/');
}

function createMigrationPlan(vaultRoot) {
  const files = [
    ...collectMarkdownFiles(path.join(vaultRoot, 'KnowledgeBase'), vaultRoot),
    ...collectMarkdownFiles(path.join(vaultRoot, 'Blog'), vaultRoot)
  ].sort((first, second) => first.localeCompare(second, 'en'));

  const plan = [];
  const errors = [];
  for (const filePath of files) {
    const sourcePath = relativeVaultPath(vaultRoot, filePath);
    try {
      const rawContent = fs.readFileSync(filePath, 'utf8');
      const migrated = buildMigratedMarkdown(rawContent, { sourcePath });
      plan.push({ filePath, sourcePath, rawContent, ...migrated });
    } catch (error) {
      errors.push({
        source_path: sourcePath,
        code: error?.code || 'VAULT_TAXONOMY_MIGRATION_FAILED',
        message: error?.message || 'Ismeretlen migrációs hiba.',
        ...(error?.details ? { details: error.details } : {})
      });
    }
  }
  return { files, plan, errors };
}

function defaultBackupDirectory(vaultRoot) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(vaultRoot, '.taxonomy-frontmatter-backups', timestamp);
}

function resolveBackupDirectory(vaultRoot, backupDirectory) {
  const resolved = backupDirectory
    ? path.resolve(backupDirectory)
    : defaultBackupDirectory(vaultRoot);
  if (!isSameOrDescendant(resolved, vaultRoot) || resolved === path.resolve(vaultRoot)) {
    throw createMigrationError('BACKUP_DIRECTORY_INVALID', 'A backup könyvtárnak a vault alatt kell lennie, de nem lehet maga a vault gyökere.', {
      backup_directory: resolved
    });
  }
  return resolved;
}

function writeMigrationPlan({ vaultRoot, changes, backupDirectory }) {
  fs.mkdirSync(backupDirectory, { recursive: true });
  const temporaryFiles = [];
  const replaced = [];

  try {
    for (const change of changes) {
      const backupPath = path.join(backupDirectory, ...change.sourcePath.split('/'));
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      fs.copyFileSync(change.filePath, backupPath, fs.constants.COPYFILE_EXCL);
    }

    for (const [index, change] of changes.entries()) {
      const temporaryPath = `${change.filePath}.taxonomy-migration-${process.pid}-${index}.tmp`;
      fs.writeFileSync(temporaryPath, change.markdown, 'utf8');
      temporaryFiles.push({ ...change, temporaryPath });
    }

    for (const change of temporaryFiles) {
      fs.renameSync(change.temporaryPath, change.filePath);
      replaced.push(change);
    }
  } catch (error) {
    for (const temporary of temporaryFiles) {
      if (fs.existsSync(temporary.temporaryPath)) fs.rmSync(temporary.temporaryPath, { force: true });
    }
    for (const change of replaced) {
      const backupPath = path.join(backupDirectory, ...change.sourcePath.split('/'));
      if (fs.existsSync(backupPath)) fs.copyFileSync(backupPath, change.filePath);
    }
    throw createMigrationError('VAULT_TAXONOMY_MIGRATION_WRITE_FAILED', 'A migráció írása nem sikerült; a már módosított fájlok visszaállítása megtörtént.', {
      vault_root: vaultRoot,
      backup_directory: backupDirectory,
      cause: error?.message || String(error)
    });
  }
}

/**
 * Preview by default. `apply: true` writes only if every vault document can
 * be normalized, and first stores every changed source in a vault-local
 * backup directory.
 */
export function migrateObsidianTaxonomyFrontmatter({
  vaultRoot,
  apply = false,
  backupDirectory,
  env = process.env
} = {}) {
  const resolvedVaultRoot = resolveVaultRoot(vaultRoot, env);
  const { files, plan, errors } = createMigrationPlan(resolvedVaultRoot);
  const changes = plan.filter(item => item.changed);
  const report = {
    operation: 'OBSIDIAN_TAXONOMY_FRONTMATTER_MIGRATION',
    dry_run: !apply,
    vault_root: resolvedVaultRoot,
    discovered: files.length,
    unchanged: plan.length - changes.length,
    would_migrate: changes.length,
    migrated: 0,
    backup_directory: null,
    errors,
    files: plan.map(item => ({
      source_path: item.sourcePath,
      status: item.changed ? (apply ? 'PENDING' : 'WOULD_MIGRATE') : 'UNCHANGED',
      taxonomy_source: item.normalized.source_by_dimension
    }))
  };

  if (!apply || errors.length > 0 || changes.length === 0) return report;

  const resolvedBackupDirectory = resolveBackupDirectory(resolvedVaultRoot, backupDirectory);
  if (fs.existsSync(resolvedBackupDirectory)) {
    throw createMigrationError('BACKUP_DIRECTORY_EXISTS', 'A backup könyvtár már létezik; válassz új útvonalat.', {
      backup_directory: resolvedBackupDirectory
    });
  }
  writeMigrationPlan({
    vaultRoot: resolvedVaultRoot,
    changes,
    backupDirectory: resolvedBackupDirectory
  });
  report.migrated = changes.length;
  report.backup_directory = resolvedBackupDirectory;
  report.files = report.files.map(file => ({
    ...file,
    status: file.status === 'PENDING' ? 'MIGRATED' : file.status
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
    if (argument === '--help' || argument === '-h') {
      return { help: true };
    }
    throw createMigrationError('INVALID_ARGUMENT', `Ismeretlen paraméter: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    'Használat:',
    '  node server/scripts/migrateObsidianTaxonomyFrontmatter.js',
    '  node server/scripts/migrateObsidianTaxonomyFrontmatter.js --apply [--backup-dir <vault-alatti-mappa>]',
    '',
    'Alapértelmezésben csak dry-run riport készül. --apply előtt minden módosuló fájl',
    'vault-alatti backupba kerül. A sérült dimensions: "[object Object]" mező hibát ad,',
    'és a futás nem ír át egyetlen dokumentumot sem.'
  ].join('\n') + '\n');
}

if (process.argv[1] === __filename) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      printHelp();
    } else {
      const report = migrateObsidianTaxonomyFrontmatter(options);
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (report.errors.length > 0) process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      operation: 'OBSIDIAN_TAXONOMY_FRONTMATTER_MIGRATION',
      error: error?.code || 'VAULT_TAXONOMY_MIGRATION_FAILED',
      message: error?.message || String(error),
      ...(error?.details ? { details: error.details } : {})
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
