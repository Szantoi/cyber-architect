import crypto from 'node:crypto';
import { db, initDatabase } from '../db.js';
import { dbService } from './dbService.js';

const FOLDER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FOLDER_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_FOLDER_NAME_LENGTH = 120;
const MAX_FOLDER_SLUG_LENGTH = 96;
const MIN_SORT_ORDER = -1_000_000;
const MAX_SORT_ORDER = 1_000_000;

// Direct imports from route handlers, CLI commands and tests must all see an
// initialized table. The initializer is explicitly idempotent.
initDatabase();

function contentFolderError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function assertFolderInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw contentFolderError('INVALID_CONTENT_FOLDER_INPUT');
  }
  return value;
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

function assertFolderId(value, errorCode = 'INVALID_CONTENT_FOLDER_ID') {
  const id = String(value || '').trim();
  if (!FOLDER_ID_PATTERN.test(id)) throw contentFolderError(errorCode);
  return id.toLowerCase();
}

function normalizeParentId(value, { allowUndefined = false } = {}) {
  if (value === undefined && allowUndefined) return undefined;
  if (value === undefined || value === null || value === '') return null;
  return assertFolderId(value, 'INVALID_CONTENT_FOLDER_PARENT_ID');
}

function normalizeName(value) {
  const name = String(value ?? '').normalize('NFC').trim();
  if (
    !name
    || name.length > MAX_FOLDER_NAME_LENGTH
    || name === '.'
    || name === '..'
    || /[\\/]/.test(name)
    || hasControlCharacters(name)
    || !/^[\p{L}\p{N}][\p{L}\p{N}\s._()&+,'#-]*$/u.test(name)
  ) {
    throw contentFolderError('INVALID_CONTENT_FOLDER_NAME');
  }
  return name;
}

function slugify(name) {
  const normalized = String(name || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_FOLDER_SLUG_LENGTH)
    .replace(/-+$/g, '');

  if (normalized && FOLDER_SLUG_PATTERN.test(normalized)) return normalized;
  return `folder-${crypto.createHash('sha256').update(String(name || '')).digest('hex').slice(0, 12)}`;
}

function normalizeSlug(value, fallbackName) {
  if (value === undefined || value === null || value === '') return slugify(fallbackName);
  const slug = String(value).trim();
  if (
    slug.length > MAX_FOLDER_SLUG_LENGTH
    || !FOLDER_SLUG_PATTERN.test(slug)
  ) {
    throw contentFolderError('INVALID_CONTENT_FOLDER_SLUG');
  }
  return slug;
}

function normalizeSortOrder(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const sortOrder = Number(value);
  if (
    !Number.isInteger(sortOrder)
    || sortOrder < MIN_SORT_ORDER
    || sortOrder > MAX_SORT_ORDER
  ) {
    throw contentFolderError('INVALID_CONTENT_FOLDER_SORT_ORDER');
  }
  return sortOrder;
}

function mapFolder(row) {
  if (!row) return null;
  const folder = {
    id: row.id,
    parent_id: row.parent_id || null,
    name: row.name,
    slug: row.slug,
    sort_order: Number(row.sort_order),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
  if (Object.prototype.hasOwnProperty.call(row, 'document_count')) {
    folder.document_count = Number(row.document_count || 0);
  }
  return folder;
}

function getFolderRow(id) {
  return db.prepare(`
    SELECT id, parent_id, name, slug, sort_order, created_at, updated_at
    FROM content_folders
    WHERE id = ?
  `).get(id) || null;
}

function assertFolderExists(id, errorCode = 'CONTENT_FOLDER_NOT_FOUND') {
  const row = getFolderRow(id);
  if (!row) throw contentFolderError(errorCode, { id });
  return row;
}

function assertParentExists(parentId) {
  if (parentId === null) return null;
  return assertFolderExists(parentId, 'CONTENT_FOLDER_PARENT_NOT_FOUND');
}

function assertUniqueSiblingSlug({ parentId, slug, excludeId = null }) {
  const duplicate = db.prepare(`
    SELECT id
    FROM content_folders
    WHERE parent_id IS ?
      AND slug = ? COLLATE NOCASE
      AND (? IS NULL OR id <> ?)
    LIMIT 1
  `).get(parentId, slug, excludeId, excludeId);
  if (duplicate) {
    throw contentFolderError('CONTENT_FOLDER_SLUG_CONFLICT', {
      parent_id: parentId,
      slug,
      conflict_id: duplicate.id
    });
  }
}

function assertParentDoesNotCreateCycle(folderId, parentId) {
  if (parentId === null) return;
  if (parentId === folderId) {
    throw contentFolderError('CONTENT_FOLDER_CYCLE', { id: folderId, parent_id: parentId });
  }

  const visited = new Set();
  let cursor = parentId;
  while (cursor !== null) {
    if (visited.has(cursor)) {
      throw contentFolderError('CONTENT_FOLDER_HIERARCHY_INVALID', { id: cursor });
    }
    if (cursor === folderId) {
      throw contentFolderError('CONTENT_FOLDER_CYCLE', { id: folderId, parent_id: parentId });
    }
    visited.add(cursor);
    const row = assertFolderExists(cursor, 'CONTENT_FOLDER_PARENT_NOT_FOUND');
    cursor = row.parent_id || null;
  }
}

function auditFolder(action, folder, previousFolder, actor) {
  // Folder labels and slugs are organizational metadata. Do not include any
  // document body, asset path, or raw user-supplied request in the audit log.
  const snapshot = value => value && ({
    id: value.id,
    parent_id: value.parent_id || null,
    slug: value.slug,
    sort_order: Number(value.sort_order)
  });
  dbService.recordAuditLog({
    action,
    entity: 'content_folder',
    entity_id: folder?.id || previousFolder?.id || null,
    prev_state: snapshot(previousFolder),
    new_state: snapshot(folder),
    actor
  });
}

function mapTree(rows) {
  const byId = new Map();
  const roots = [];

  for (const row of rows) {
    byId.set(row.id, { ...mapFolder(row), children: [] });
  }

  for (const node of byId.values()) {
    if (node.parent_id === null) {
      roots.push(node);
      continue;
    }
    const parent = byId.get(node.parent_id);
    // A foreign key normally prevents this condition. Keeping an orphan
    // readable as a root is safer than silently discarding it from the admin
    // UI if a legacy database was manually repaired.
    if (!parent || parent.id === node.id) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }

  return roots;
}

export const contentFolderService = {
  listTree() {
    const rows = db.prepare(`
      SELECT
        folder.id,
        folder.parent_id,
        folder.name,
        folder.slug,
        folder.sort_order,
        folder.created_at,
        folder.updated_at,
        COUNT(document.id) AS document_count
      FROM content_folders AS folder
      LEFT JOIN blog_posts AS document ON document.folder_id = folder.id
      GROUP BY folder.id
      ORDER BY folder.sort_order ASC, folder.name COLLATE NOCASE ASC, folder.id ASC
    `).all();
    return mapTree(rows);
  },

  getFolder(id) {
    return mapFolder(getFolderRow(assertFolderId(id)));
  },

  createFolder(input = {}, actor = 'SYSTEM') {
    input = assertFolderInput(input);
    const name = normalizeName(input.name);
    const parentId = normalizeParentId(input.parent_id);
    const slug = normalizeSlug(input.slug, name);
    const sortOrder = normalizeSortOrder(input.sort_order);
    const id = crypto.randomUUID();
    const timestamp = nowIso();

    const folder = db.transaction(() => {
      assertParentExists(parentId);
      assertUniqueSiblingSlug({ parentId, slug });
      db.prepare(`
        INSERT INTO content_folders (id, parent_id, name, slug, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, parentId, name, slug, sortOrder, timestamp, timestamp);
      return mapFolder(getFolderRow(id));
    })();

    auditFolder('CREATE_CONTENT_FOLDER', folder, null, actor);
    return folder;
  },

  updateFolder(id, input = {}, actor = 'SYSTEM') {
    input = assertFolderInput(input);
    const folderId = assertFolderId(id);
    const previous = mapFolder(assertFolderExists(folderId));
    const hasName = hasOwn(input, 'name');
    const hasSlug = hasOwn(input, 'slug');
    const hasParent = hasOwn(input, 'parent_id');
    const hasSortOrder = hasOwn(input, 'sort_order');

    if (!hasName && !hasSlug && !hasParent && !hasSortOrder) {
      throw contentFolderError('CONTENT_FOLDER_UPDATE_EMPTY');
    }

    const nextName = hasName ? normalizeName(input.name) : previous.name;
    const nextParentId = hasParent
      ? normalizeParentId(input.parent_id)
      : previous.parent_id;
    // A generated slug is a stable folder identifier, not merely a rendered
    // version of the label. Renaming a folder must not unexpectedly change it.
    const nextSlug = hasSlug
      ? normalizeSlug(input.slug, nextName)
      : previous.slug;
    const nextSortOrder = hasSortOrder
      ? normalizeSortOrder(input.sort_order)
      : previous.sort_order;

    const folder = db.transaction(() => {
      assertParentExists(nextParentId);
      assertParentDoesNotCreateCycle(folderId, nextParentId);
      assertUniqueSiblingSlug({ parentId: nextParentId, slug: nextSlug, excludeId: folderId });

      const timestamp = nowIso();
      db.prepare(`
        UPDATE content_folders
        SET parent_id = ?, name = ?, slug = ?, sort_order = ?, updated_at = ?
        WHERE id = ?
      `).run(nextParentId, nextName, nextSlug, nextSortOrder, timestamp, folderId);
      return mapFolder(getFolderRow(folderId));
    })();

    auditFolder('UPDATE_CONTENT_FOLDER', folder, previous, actor);
    return folder;
  },

  deleteFolder(id, actor = 'SYSTEM') {
    const folderId = assertFolderId(id);
    const previous = mapFolder(assertFolderExists(folderId));

    db.transaction(() => {
      const child = db.prepare('SELECT id FROM content_folders WHERE parent_id = ? LIMIT 1').get(folderId);
      if (child) {
        throw contentFolderError('CONTENT_FOLDER_HAS_CHILDREN', { id: folderId, child_id: child.id });
      }

      const assignedDocument = db.prepare('SELECT id FROM blog_posts WHERE folder_id = ? LIMIT 1').get(folderId);
      if (assignedDocument) {
        throw contentFolderError('CONTENT_FOLDER_HAS_DOCUMENTS', { id: folderId, post_id: assignedDocument.id });
      }

      const result = db.prepare('DELETE FROM content_folders WHERE id = ?').run(folderId);
      if (result.changes !== 1) {
        throw contentFolderError('CONTENT_FOLDER_NOT_FOUND', { id: folderId });
      }
    })();

    auditFolder('DELETE_CONTENT_FOLDER', null, previous, actor);
    return { id: folderId, deleted: true };
  }
};

export const contentFolderValidation = Object.freeze({
  FOLDER_ID_PATTERN,
  FOLDER_SLUG_PATTERN,
  MAX_FOLDER_NAME_LENGTH,
  MAX_FOLDER_SLUG_LENGTH
});
