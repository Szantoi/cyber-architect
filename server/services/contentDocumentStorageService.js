import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { APP_ROOT, resolveDatabaseLocation } from '../config/databasePath.js';
import { db, initDatabase } from '../db.js';
import { dbService } from './dbService.js';

const STORAGE_KEY_PATTERN = /^[A-Za-z0-9_-]{24,128}$/;
const STORAGE_STATES = new Set(['ready', 'missing']);
const MAX_ASSET_RELATIVE_PATH_LENGTH = 600;
const WINDOWS_RESERVED_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

initDatabase();

function contentStorageError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function isWithin(candidatePath, parentPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function nowIso() {
  return new Date().toISOString();
}

function hasControlCharacters(value) {
  return Array.from(value).some(character => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function assertPostId(value) {
  const postId = Number(value);
  if (!Number.isSafeInteger(postId) || postId <= 0) {
    throw contentStorageError('INVALID_CONTENT_DOCUMENT_ID');
  }
  return postId;
}

function assertStorageKey(value) {
  const storageKey = String(value || '').trim();
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    throw contentStorageError('CONTENT_DOCUMENT_STORAGE_KEY_INVALID');
  }
  return storageKey;
}

function generateStorageKey() {
  return crypto.randomBytes(24).toString('base64url');
}

function getConfiguredAssetRoot(env = process.env) {
  const configured = String(env?.CYBER_ARCHITECT_DOCUMENT_ASSET_DIR || '').trim();
  if (!configured) {
    return path.resolve(resolveDatabaseLocation(env).directory, 'content-assets');
  }
  return path.isAbsolute(configured)
    ? path.resolve(configured)
    : path.resolve(APP_ROOT, configured);
}

function ensureAssetRoot() {
  const root = getConfiguredAssetRoot();
  fs.mkdirSync(root, { recursive: true, mode: 0o750 });
  const stats = fs.lstatSync(root);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw contentStorageError('CONTENT_DOCUMENT_ASSET_ROOT_INVALID');
  }
  return fs.realpathSync(root);
}

function ensureStorageDirectory(storageKey) {
  const key = assertStorageKey(storageKey);
  const assetRoot = ensureAssetRoot();
  const storageDirectory = path.resolve(assetRoot, key);
  if (!isWithin(storageDirectory, assetRoot) || storageDirectory === assetRoot) {
    throw contentStorageError('CONTENT_DOCUMENT_STORAGE_PATH_INVALID');
  }

  try {
    fs.mkdirSync(storageDirectory, { recursive: false, mode: 0o750 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }

  const stats = fs.lstatSync(storageDirectory);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw contentStorageError('CONTENT_DOCUMENT_STORAGE_PATH_INVALID');
  }
  return fs.realpathSync(storageDirectory);
}

function getReadyStorageDirectory(storage) {
  if (!storage || storage.state !== 'ready') {
    throw contentStorageError('CONTENT_DOCUMENT_STORAGE_UNAVAILABLE', {
      post_id: storage?.post_id ?? null
    });
  }

  const assetRoot = ensureAssetRoot();
  const storageDirectory = path.resolve(assetRoot, storage.storage_key);
  if (!isWithin(storageDirectory, assetRoot) || storageDirectory === assetRoot) {
    throw contentStorageError('CONTENT_DOCUMENT_STORAGE_PATH_INVALID');
  }

  let storageStats;
  try {
    storageStats = fs.lstatSync(storageDirectory);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw contentStorageError('CONTENT_DOCUMENT_STORAGE_UNAVAILABLE', {
        post_id: storage.post_id
      });
    }
    throw error;
  }
  if (storageStats.isSymbolicLink() || !storageStats.isDirectory()) {
    throw contentStorageError('CONTENT_DOCUMENT_STORAGE_PATH_INVALID');
  }
  return storageDirectory;
}

function normalizeRelativeAssetPath(value) {
  const raw = String(value ?? '').normalize('NFC').trim();
  if (
    !raw
    || raw.length > MAX_ASSET_RELATIVE_PATH_LENGTH
    || path.isAbsolute(raw)
    || /^[A-Za-z]:[\\/]/.test(raw)
    || raw.startsWith('/')
    || raw.startsWith('\\')
    || hasControlCharacters(raw)
  ) {
    throw contentStorageError('CONTENT_DOCUMENT_ASSET_PATH_INVALID');
  }

  const segments = raw.split(/[\\/]+/);
  if (segments.some(segment => (
    !segment
    || segment === '.'
    || segment === '..'
    || segment.length > 160
    || /[<>:"|?*]/.test(segment)
    || /[.\s]$/.test(segment)
    || WINDOWS_RESERVED_NAMES.test(segment)
  ))) {
    throw contentStorageError('CONTENT_DOCUMENT_ASSET_PATH_INVALID');
  }

  return segments.join('/');
}

function assertNoSymbolicLinks(storageDirectory, normalizedRelativePath, { allowMissing }) {
  const segments = normalizedRelativePath.split('/');
  let currentPath = storageDirectory;

  for (let index = 0; index < segments.length; index += 1) {
    currentPath = path.join(currentPath, segments[index]);
    let stats;
    try {
      stats = fs.lstatSync(currentPath);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        // Only the leaf may be absent. Letting a resolver traverse through
        // uncreated nested directories would make later upload code decide
        // how to create parent paths, outside this service's safety checks.
        if (allowMissing && index === segments.length - 1) {
          return { filePath: path.resolve(storageDirectory, ...segments), exists: false };
        }
        throw contentStorageError('CONTENT_DOCUMENT_ASSET_NOT_FOUND');
      }
      throw error;
    }

    if (stats.isSymbolicLink()) {
      throw contentStorageError('CONTENT_DOCUMENT_ASSET_SYMLINK_FORBIDDEN');
    }
    if (index < segments.length - 1 && !stats.isDirectory()) {
      throw contentStorageError('CONTENT_DOCUMENT_ASSET_PARENT_INVALID');
    }
    if (index === segments.length - 1 && !stats.isFile()) {
      throw contentStorageError('CONTENT_DOCUMENT_ASSET_NOT_FILE');
    }
  }

  return { filePath: path.resolve(storageDirectory, ...segments), exists: true };
}

function ensureSafeAssetParentDirectories(storageDirectory, normalizedRelativePath) {
  const segments = normalizedRelativePath.split('/');
  let currentPath = storageDirectory;

  for (const segment of segments.slice(0, -1)) {
    currentPath = path.join(currentPath, segment);
    let stats;
    try {
      stats = fs.lstatSync(currentPath);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      try {
        fs.mkdirSync(currentPath, { recursive: false, mode: 0o750 });
      } catch (mkdirError) {
        if (mkdirError?.code !== 'EEXIST') throw mkdirError;
      }
      stats = fs.lstatSync(currentPath);
    }

    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw contentStorageError('CONTENT_DOCUMENT_ASSET_PARENT_INVALID');
    }
  }

  const filePath = path.resolve(storageDirectory, ...segments);
  if (!isWithin(filePath, storageDirectory)) {
    throw contentStorageError('CONTENT_DOCUMENT_ASSET_PATH_INVALID');
  }
  return filePath;
}

function getStorageRow(postId) {
  return db.prepare(`
    SELECT post_id, storage_key, state, created_at, updated_at
    FROM content_document_storage
    WHERE post_id = ?
  `).get(postId) || null;
}

function mapPublicStorage(row) {
  if (!row) return null;
  const storageKey = assertStorageKey(row.storage_key);
  const state = String(row.state || '').trim();
  if (!STORAGE_STATES.has(state)) {
    throw contentStorageError('CONTENT_DOCUMENT_STORAGE_STATE_INVALID');
  }
  return {
    post_id: Number(row.post_id),
    storage_key: storageKey,
    // This is deliberately a logical relative directory name. The absolute
    // root is deployment-specific and must never become API response data.
    asset_directory: storageKey,
    state,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function assertDocumentExists(postId) {
  const row = db.prepare('SELECT id FROM blog_posts WHERE id = ?').get(postId);
  if (!row) throw contentStorageError('CONTENT_DOCUMENT_NOT_FOUND', { post_id: postId });
}

function recordStorageAudit({ action, before = null, after = null, actor }) {
  const metadata = value => value && ({
    post_id: Number(value.post_id),
    storage_key: value.storage_key,
    state: value.state
  });
  dbService.recordAuditLog({
    action,
    entity: 'content_document_storage',
    entity_id: after?.post_id ?? before?.post_id ?? null,
    prev_state: metadata(before),
    new_state: metadata(after),
    actor
  });
}

export const contentDocumentStorageService = {
  getDocumentStorage(postId) {
    return mapPublicStorage(getStorageRow(assertPostId(postId)));
  },

  ensureDocumentStorage(postId, actor = 'SYSTEM') {
    const normalizedPostId = assertPostId(postId);
    assertDocumentExists(normalizedPostId);

    let row = getStorageRow(normalizedPostId);
    const before = mapPublicStorage(row);
    let created = false;

    if (!row) {
      const timestamp = nowIso();
      // A cryptographically random key is unrelated to the post id, folder
      // name or title. It therefore remains stable and opaque even when the
      // document is moved or renamed.
      for (let attempt = 0; attempt < 5 && !row; attempt += 1) {
        const storageKey = generateStorageKey();
        try {
          db.prepare(`
            INSERT INTO content_document_storage
              (post_id, storage_key, state, created_at, updated_at)
            VALUES (?, ?, 'missing', ?, ?)
          `).run(normalizedPostId, storageKey, timestamp, timestamp);
          row = getStorageRow(normalizedPostId);
          created = true;
        } catch (error) {
          // Another request may have won the post_id race. It is safe to use
          // that stable row; a genuinely vanishingly rare key collision gets a
          // fresh random value on the next iteration.
          row = getStorageRow(normalizedPostId);
          if (!row && !String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) throw error;
        }
      }
      if (!row) throw contentStorageError('CONTENT_DOCUMENT_STORAGE_CREATE_FAILED');
    }

    const storageKey = assertStorageKey(row.storage_key);
    try {
      ensureStorageDirectory(storageKey);
    } catch (error) {
      const timestamp = nowIso();
      db.prepare(`
        UPDATE content_document_storage
        SET state = 'missing', updated_at = ?
        WHERE post_id = ?
      `).run(timestamp, normalizedPostId);
      throw error;
    }

    const timestamp = nowIso();
    if (row.state !== 'ready') {
      db.prepare(`
        UPDATE content_document_storage
        SET state = 'ready', updated_at = ?
        WHERE post_id = ?
      `).run(timestamp, normalizedPostId);
    }

    const result = mapPublicStorage(getStorageRow(normalizedPostId));
    if (created) {
      recordStorageAudit({ action: 'CREATE_CONTENT_DOCUMENT_STORAGE', before: null, after: result, actor });
    } else if (before?.state !== result.state) {
      recordStorageAudit({ action: 'RESTORE_CONTENT_DOCUMENT_STORAGE', before, after: result, actor });
    }
    return result;
  },

  normalizeDocumentAssetRelativePath(relativePath) {
    return normalizeRelativeAssetPath(relativePath);
  },

  /**
   * Writes exactly one new binary below a document's opaque directory.  The
   * exclusive file flag is intentional: uploads are append-only by path and
   * can never overwrite a previously uploaded file, including via a race.
   * Only logical metadata leaves this service; an absolute path stays private.
   */
  writeDocumentAsset({ postId, relativePath, content, actor = 'SYSTEM' } = {}) {
    const normalizedPostId = assertPostId(postId);
    if (!Buffer.isBuffer(content)) {
      throw contentStorageError('CONTENT_DOCUMENT_ASSET_BODY_INVALID');
    }
    const normalizedRelativePath = normalizeRelativeAssetPath(relativePath);
    const storage = this.ensureDocumentStorage(normalizedPostId, actor);
    const storageDirectory = getReadyStorageDirectory(storage);
    const filePath = ensureSafeAssetParentDirectories(
      storageDirectory,
      normalizedRelativePath
    );

    try {
      fs.writeFileSync(filePath, content, { encoding: undefined, mode: 0o640, flag: 'wx' });
    } catch (error) {
      if (error?.code === 'EEXIST') {
        let existing;
        try {
          existing = fs.lstatSync(filePath);
        } catch {
          throw contentStorageError('CONTENT_DOCUMENT_ASSET_WRITE_FAILED');
        }
        if (existing.isSymbolicLink()) {
          throw contentStorageError('CONTENT_DOCUMENT_ASSET_SYMLINK_FORBIDDEN');
        }
        throw contentStorageError('CONTENT_DOCUMENT_ASSET_ALREADY_EXISTS');
      }
      throw error;
    }

    const stats = fs.lstatSync(filePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw contentStorageError('CONTENT_DOCUMENT_ASSET_NOT_FILE');
    }
    return {
      post_id: normalizedPostId,
      relative_path: normalizedRelativePath,
      byte_size: stats.size,
      storage
    };
  },

  deleteDocumentAsset({ postId, relativePath } = {}) {
    const resolved = this.resolveDocumentAsset({ postId, relativePath });
    try {
      fs.unlinkSync(resolved.file_path);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw contentStorageError('CONTENT_DOCUMENT_ASSET_NOT_FOUND');
      }
      throw error;
    }
    return {
      post_id: Number(postId),
      relative_path: resolved.relative_path,
      storage: resolved.storage
    };
  },

  /**
   * Internal resolver for an authenticated download/upload route. `file_path`
   * is intentionally not part of get/ensure response objects and must never
   * be serialized to a client.
   */
  resolveDocumentAsset(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw contentStorageError('INVALID_CONTENT_DOCUMENT_ASSET_REQUEST');
    }
    const { postId, relativePath, allowMissing = false } = input;
    const normalizedPostId = assertPostId(postId);
    if (typeof allowMissing !== 'boolean') {
      throw contentStorageError('CONTENT_DOCUMENT_ASSET_ALLOW_MISSING_INVALID');
    }
    const storage = this.getDocumentStorage(normalizedPostId);
    if (!storage) throw contentStorageError('CONTENT_DOCUMENT_STORAGE_NOT_FOUND', { post_id: normalizedPostId });
    if (storage.state !== 'ready') {
      throw contentStorageError('CONTENT_DOCUMENT_STORAGE_UNAVAILABLE', { post_id: normalizedPostId });
    }

    const normalizedRelativePath = normalizeRelativeAssetPath(relativePath);
    const storageDirectory = getReadyStorageDirectory(storage);
    const resolved = assertNoSymbolicLinks(storageDirectory, normalizedRelativePath, { allowMissing });
    if (!isWithin(resolved.filePath, storageDirectory)) {
      throw contentStorageError('CONTENT_DOCUMENT_ASSET_PATH_INVALID');
    }
    return {
      file_path: resolved.filePath,
      relative_path: normalizedRelativePath,
      exists: resolved.exists,
      storage
    };
  }
};

export const contentDocumentStorageValidation = Object.freeze({
  STORAGE_KEY_PATTERN,
  MAX_ASSET_RELATIVE_PATH_LENGTH
});
