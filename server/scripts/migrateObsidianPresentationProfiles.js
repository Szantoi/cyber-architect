import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { resolveDocumentPresentation } from '../services/presentationProfile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '../..');
const WORKSPACE_ROOT = path.resolve(APP_ROOT, '..');
const DEFAULT_VAULT_ROOT = path.resolve(WORKSPACE_ROOT, 'CyberArchitect');
const MARKDOWN_FILE_PATTERN = /\.(?:md|markdown)$/i;

const VAULT_CORPORA = Object.freeze([
  // The neutral tree is deliberately not a semantic fallback. New documents
  // there must name a profile themselves (or retain a legacy content_type
  // that can be projected safely).
  { name: 'Content', fallbackPresentationProfile: null },
  // Folder-derived profiles exist only to migrate the historical corpus.
  { name: 'KnowledgeBase', fallbackPresentationProfile: 'knowledge' },
  { name: 'Blog', fallbackPresentationProfile: 'article' }
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

function relativeVaultPath(vaultRoot, filePath) {
  return path.relative(vaultRoot, filePath).replace(/\\/g, '/');
}

function collectMarkdownFiles(baseDir, vaultRoot, files = []) {
  if (!fs.existsSync(baseDir)) return files;
  const stat = fs.lstatSync(baseDir);
  if (stat.isSymbolicLink()) {
    throw createMigrationError('VAULT_SYMLINK_SKIPPED', 'A migráció nem követhet szimbolikus linket.', {
      source_path: relativeVaultPath(vaultRoot, baseDir)
    });
  }
  if (!stat.isDirectory()) {
    throw createMigrationError('VAULT_DIRECTORY_INVALID', 'A vault korpusz könyvtár kell legyen.', {
      source_path: relativeVaultPath(vaultRoot, baseDir)
    });
  }

  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
    const target = path.join(baseDir, entry.name);
    if (entry.isSymbolicLink()) {
      throw createMigrationError('VAULT_SYMLINK_SKIPPED', 'A migráció nem követhet szimbolikus linket.', {
        source_path: relativeVaultPath(vaultRoot, target)
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
    throw createMigrationError('VAULT_FRONTMATTER_REQUIRED', 'A presentation profile migrációhoz minden dokumentumnak YAML frontmatterrel kell kezdődnie.', {
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

function readOptionalTextField(metadata, fieldName, sourcePath) {
  if (!Object.hasOwn(metadata, fieldName)) return { present: false, value: undefined };
  const value = metadata[fieldName];
  if (typeof value !== 'string' || !value.trim()) {
    throw createMigrationError('VAULT_PRESENTATION_FIELD_INVALID', `A ${fieldName} nem üres szöveg kell legyen.`, {
      source_path: sourcePath,
      field: fieldName
    });
  }
  return { present: true, value: value.trim() };
}

function resolveMigratedProfile({ metadata, sourcePath, fallbackPresentationProfile }) {
  const presentationProfile = readOptionalTextField(metadata, 'presentation_profile', sourcePath);
  const contentType = readOptionalTextField(metadata, 'content_type', sourcePath);

  if (!presentationProfile.present && !contentType.present && !fallbackPresentationProfile) {
    throw createMigrationError('VAULT_PRESENTATION_PROFILE_REQUIRED', 'A semleges Content/ dokumentumnak explicit presentation_profile mezőre van szüksége.', {
      source_path: sourcePath
    });
  }

  try {
    const resolved = resolveDocumentPresentation({
      presentationProfile: presentationProfile.value,
      contentType: contentType.value,
      // This value is only observed if neither explicit field exists. It is
      // deliberately not a fallback for Content/.
      fallbackProfile: fallbackPresentationProfile || 'knowledge'
    });
    return {
      presentation_profile: resolved.presentation_profile,
      source: presentationProfile.present
        ? 'PRESENTATION_PROFILE'
        : (contentType.present ? 'LEGACY_CONTENT_TYPE' : 'LEGACY_FOLDER')
    };
  } catch (error) {
    if (error?.code === 'PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT') {
      throw createMigrationError('PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT', 'A presentation_profile és a legacy content_type más megjelenítési profilt jelöl.', {
        source_path: sourcePath,
        ...(error.details || {})
      });
    }
    throw createMigrationError('VAULT_PRESENTATION_PROFILE_INVALID', 'A presentation_profile csak knowledge vagy article lehet; a content_type csak knowledge vagy blog lehet.', {
      source_path: sourcePath,
      cause: error?.code || error?.message || String(error)
    });
  }
}

function renderFrontmatterWithProfile(parsed, presentationProfile) {
  const lineEnding = parsed.content.includes('\r\n') ? '\r\n' : '\n';
  const profileLine = `presentation_profile: "${presentationProfile}"`;
  const frontmatter = parsed.yamlText.trim()
    ? `${profileLine}${lineEnding}${parsed.yamlText}`
    : profileLine;
  return `---${lineEnding}${frontmatter}${lineEnding}---${parsed.closingNewline}${parsed.body}`;
}

/**
 * Build a minimal, non-destructive frontmatter update. It never removes the
 * legacy content_type field, because existing portal routes and integrations
 * can still read it while the database projects the canonical profile.
 */
export function buildPresentationProfileMigratedMarkdown(rawContent, {
  sourcePath = '',
  fallbackPresentationProfile = null
} = {}) {
  const parsed = parseFrontmatter(rawContent, sourcePath);
  const resolution = resolveMigratedProfile({
    metadata: parsed.metadata,
    sourcePath,
    fallbackPresentationProfile
  });

  if (Object.hasOwn(parsed.metadata, 'presentation_profile')) {
    return {
      markdown: parsed.content,
      changed: false,
      presentation_profile: resolution.presentation_profile,
      profile_source: resolution.source
    };
  }

  const markdown = renderFrontmatterWithProfile(parsed, resolution.presentation_profile);
  return {
    markdown,
    changed: markdown !== parsed.content,
    presentation_profile: resolution.presentation_profile,
    profile_source: resolution.source
  };
}

function createMigrationPlan(vaultRoot) {
  const files = [];
  const errors = [];

  for (const corpus of VAULT_CORPORA) {
    const corpusDir = path.join(vaultRoot, corpus.name);
    try {
      for (const filePath of collectMarkdownFiles(corpusDir, vaultRoot)) {
        files.push({
          filePath,
          sourcePath: relativeVaultPath(vaultRoot, filePath),
          corpusName: corpus.name,
          fallbackPresentationProfile: corpus.fallbackPresentationProfile
        });
      }
    } catch (error) {
      errors.push({
        source_path: corpus.name,
        code: error?.code || 'VAULT_PRESENTATION_PROFILE_MIGRATION_FAILED',
        message: error?.message || 'Ismeretlen migrációs hiba.',
        ...(error?.details ? { details: error.details } : {})
      });
    }
  }

  files.sort((first, second) => first.sourcePath.localeCompare(second.sourcePath, 'en'));
  const plan = [];
  for (const file of files) {
    try {
      const rawContent = fs.readFileSync(file.filePath, 'utf8');
      const migrated = buildPresentationProfileMigratedMarkdown(rawContent, file);
      plan.push({ ...file, rawContent, ...migrated });
    } catch (error) {
      errors.push({
        source_path: file.sourcePath,
        code: error?.code || 'VAULT_PRESENTATION_PROFILE_MIGRATION_FAILED',
        message: error?.message || 'Ismeretlen migrációs hiba.',
        ...(error?.details ? { details: error.details } : {})
      });
    }
  }
  return { files, plan, errors };
}

function defaultBackupDirectory(vaultRoot) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(vaultRoot, '.presentation-profile-backups', timestamp);
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
      const temporaryPath = `${change.filePath}.presentation-profile-migration-${process.pid}-${index}.tmp`;
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
    throw createMigrationError('VAULT_PRESENTATION_PROFILE_MIGRATION_WRITE_FAILED', 'A migráció írása nem sikerült; a már módosított fájlok visszaállítása megtörtént.', {
      vault_root: vaultRoot,
      backup_directory: backupDirectory,
      cause: error?.message || String(error)
    });
  }
}

/**
 * Preview by default. `apply: true` writes only if every selected Markdown
 * document is valid and profile-compatible. Every changed source is copied to
 * a vault-local timestamped backup tree before its atomic replacement.
 */
export function migrateObsidianPresentationProfiles({
  vaultRoot,
  apply = false,
  backupDirectory,
  env = process.env
} = {}) {
  const resolvedVaultRoot = resolveVaultRoot(vaultRoot, env);
  const { files, plan, errors } = createMigrationPlan(resolvedVaultRoot);
  const changes = plan.filter(item => item.changed);
  const report = {
    operation: 'OBSIDIAN_PRESENTATION_PROFILE_MIGRATION',
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
      corpus: item.corpusName,
      profile_source: item.profile_source,
      presentation_profile: item.presentation_profile,
      status: item.changed ? (apply ? 'PENDING' : 'WOULD_MIGRATE') : 'UNCHANGED'
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
    if (argument === '--help' || argument === '-h') return { help: true };
    throw createMigrationError('INVALID_ARGUMENT', `Ismeretlen paraméter: ${argument}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write([
    'Használat:',
    '  node server/scripts/migrateObsidianPresentationProfiles.js',
    '  node server/scripts/migrateObsidianPresentationProfiles.js --apply [--backup-dir <vault-alatti-mappa>]',
    '',
    'Alapértelmezésben csak dry-run riport készül. --apply előtt minden módosuló fájl',
    'időbélyeges, vault-alatti backupba kerül. A Content/ alatti dokumentum explicit',
    'presentation_profile vagy legacy content_type nélkül hibát ad; a rendszer nem következtet',
    'a semleges mappaszerkezetből.'
  ].join('\n') + '\n');
}

if (process.argv[1] === __filename) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      printHelp();
    } else {
      const report = migrateObsidianPresentationProfiles(options);
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (report.errors.length > 0) process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      operation: 'OBSIDIAN_PRESENTATION_PROFILE_MIGRATION',
      error: error?.code || 'VAULT_PRESENTATION_PROFILE_MIGRATION_FAILED',
      message: error?.message || String(error),
      ...(error?.details ? { details: error.details } : {})
    }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
