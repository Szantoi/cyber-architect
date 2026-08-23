import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { normalizeGraphFrontmatter, upsertGraphSystemBlock } from './graphMarkdownProjectionService.js';
import { resolveLocalVaultRoot } from './localVaultService.js';

function isSameOrDescendant(candidatePath, parentPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function assertCanonicalMarkdownPath(filePath, vaultRoot) {
  const root = fs.realpathSync(vaultRoot);
  const resolved = path.resolve(filePath);
  if (!isSameOrDescendant(resolved, root)) {
    const error = new Error('CA_PROJECTION_PATH_OUTSIDE_VAULT');
    error.code = 'CA_PROJECTION_PATH_OUTSIDE_VAULT';
    throw error;
  }
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    const error = new Error('CA_PROJECTION_FILE_UNSAFE');
    error.code = 'CA_PROJECTION_FILE_UNSAFE';
    throw error;
  }
  const realFile = fs.realpathSync(resolved);
  if (!isSameOrDescendant(realFile, root)) {
    const error = new Error('CA_PROJECTION_PATH_OUTSIDE_VAULT');
    error.code = 'CA_PROJECTION_PATH_OUTSIDE_VAULT';
    throw error;
  }
  return realFile;
}

function parseFrontmatter(content) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  if (!match) {
    const error = new Error('CA_PROJECTION_FRONTMATTER_REQUIRED');
    error.code = 'CA_PROJECTION_FRONTMATTER_REQUIRED';
    throw error;
  }
  let frontmatter;
  try {
    frontmatter = yaml.load(match[1]) || {};
  } catch {
    const error = new Error('CA_PROJECTION_FRONTMATTER_INVALID');
    error.code = 'CA_PROJECTION_FRONTMATTER_INVALID';
    throw error;
  }
  normalizeGraphFrontmatter(frontmatter);
  return frontmatter;
}

function createBackupPath(vaultRoot, filePath, now) {
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const relative = path.relative(vaultRoot, filePath);
  const backupRoot = path.join(vaultRoot, '.cyberarchitect-backups', 'graph-projections', timestamp);
  const target = path.resolve(backupRoot, relative);
  if (!isSameOrDescendant(target, backupRoot)) {
    const error = new Error('CA_PROJECTION_BACKUP_PATH_INVALID');
    error.code = 'CA_PROJECTION_BACKUP_PATH_INVALID';
    throw error;
  }
  return target;
}

function atomicWrite(filePath, content) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(directory, `.${path.basename(filePath)}.ca-system-${process.pid}-${crypto.randomUUID()}.tmp`);
  fs.writeFileSync(tempPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // Preserve the original rename failure; the temporary file is harmless.
    }
    throw error;
  }
}

/**
 * Computes a safe Markdown projection update without touching the filesystem.
 * The source must remain unchanged between planning and applying; callers can
 * use source_hash to detect a competing Obsidian edit before writing.
 */
export function planVaultGraphProjection({ markdown, relations = [], sourceHash = null } = {}) {
  const source = String(markdown || '');
  parseFrontmatter(source);
  const updated = upsertGraphSystemBlock(source, { relations });
  const hash = crypto.createHash('sha256').update(source, 'utf8').digest('hex');
  if (sourceHash && sourceHash !== hash) {
    const error = new Error('CA_PROJECTION_SOURCE_CHANGED');
    error.code = 'CA_PROJECTION_SOURCE_CHANGED';
    throw error;
  }
  return {
    changed: source !== updated,
    source_hash: hash,
    markdown: updated
  };
}

/**
 * Writes only an explicit CA:SYSTEM projection block. Human Markdown and YAML
 * are never reconstructed or reordered. Existing block drift is fail-closed
 * in `upsertGraphSystemBlock` before either the backup or the write occurs.
 */
export function writeVaultGraphProjection({ filePath, relations = [], vaultRoot = resolveLocalVaultRoot(), now = new Date(), expectedSourceHash = null } = {}) {
  const safeFilePath = assertCanonicalMarkdownPath(filePath, vaultRoot);
  const original = fs.readFileSync(safeFilePath, 'utf8');
  const plan = planVaultGraphProjection({
    markdown: original,
    relations,
    sourceHash: expectedSourceHash
  });
  if (!plan.changed) {
    return { status: 'UNCHANGED', file_path: safeFilePath, backup_path: null, source_hash: plan.source_hash };
  }

  const backupPath = createBackupPath(vaultRoot, safeFilePath, now instanceof Date ? now : new Date(now));
  fs.mkdirSync(path.dirname(backupPath), { recursive: true, mode: 0o700 });
  fs.copyFileSync(safeFilePath, backupPath);
  atomicWrite(safeFilePath, plan.markdown);
  return {
    status: 'UPDATED',
    file_path: safeFilePath,
    backup_path: backupPath,
    source_hash: plan.source_hash,
    updated_hash: crypto.createHash('sha256').update(plan.markdown, 'utf8').digest('hex')
  };
}
