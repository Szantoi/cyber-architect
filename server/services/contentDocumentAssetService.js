import crypto from 'node:crypto';
import path from 'node:path';
import { db, initDatabase } from '../db.js';
import { dbService } from './dbService.js';
import { contentDocumentStorageService } from './contentDocumentStorageService.js';

// Database documents may own binary material, but executable and browser-active
// formats never belong in this trusted same-origin asset surface.  The MIME
// type is derived from the allowed extension rather than trusted from a client
// header, so an uploaded `.svg` cannot masquerade as a PNG.
const ALLOWED_ASSET_TYPES = Object.freeze({
  pdf: { mimeType: 'application/pdf', kind: 'document', aliases: ['application/pdf'] },
  png: { mimeType: 'image/png', kind: 'image', aliases: ['image/png'] },
  jpg: { mimeType: 'image/jpeg', kind: 'image', aliases: ['image/jpeg'] },
  jpeg: { mimeType: 'image/jpeg', kind: 'image', aliases: ['image/jpeg'] },
  webp: { mimeType: 'image/webp', kind: 'image', aliases: ['image/webp'] },
  gif: { mimeType: 'image/gif', kind: 'image', aliases: ['image/gif'] },
  avif: { mimeType: 'image/avif', kind: 'image', aliases: ['image/avif'] },
  mp3: { mimeType: 'audio/mpeg', kind: 'audio', aliases: ['audio/mpeg', 'audio/mp3'] },
  wav: { mimeType: 'audio/wav', kind: 'audio', aliases: ['audio/wav', 'audio/x-wav'] },
  ogg: { mimeType: 'audio/ogg', kind: 'audio', aliases: ['audio/ogg'] },
  m4a: { mimeType: 'audio/mp4', kind: 'audio', aliases: ['audio/mp4', 'audio/x-m4a'] },
  mp4: { mimeType: 'video/mp4', kind: 'video', aliases: ['video/mp4'] },
  webm: { mimeType: 'video/webm', kind: 'video', aliases: ['video/webm'] },
  mov: { mimeType: 'video/quicktime', kind: 'video', aliases: ['video/quicktime'] },
  glb: { mimeType: 'model/gltf-binary', kind: 'model', aliases: ['model/gltf-binary'] },
  stl: { mimeType: 'model/stl', kind: 'model', aliases: ['model/stl', 'application/sla'] },
  dwg: { mimeType: 'application/acad', kind: 'model', aliases: ['application/acad', 'image/vnd.dwg'] },
  dxf: { mimeType: 'application/dxf', kind: 'model', aliases: ['application/dxf', 'image/vnd.dxf'] },
  step: { mimeType: 'application/step', kind: 'model', aliases: ['application/step'] },
  stp: { mimeType: 'application/step', kind: 'model', aliases: ['application/step'] },
  iges: { mimeType: 'model/iges', kind: 'model', aliases: ['model/iges', 'application/iges'] },
  igs: { mimeType: 'model/iges', kind: 'model', aliases: ['model/iges', 'application/iges'] },
  zip: { mimeType: 'application/zip', kind: 'archive', aliases: ['application/zip', 'application/x-zip-compressed'] },
  '7z': { mimeType: 'application/x-7z-compressed', kind: 'archive', aliases: ['application/x-7z-compressed'] },
  rar: { mimeType: 'application/vnd.rar', kind: 'archive', aliases: ['application/vnd.rar', 'application/x-rar-compressed'] },
  docx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    kind: 'document',
    aliases: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
  },
  xlsx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    kind: 'document',
    aliases: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
  },
  pptx: {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    kind: 'document',
    aliases: ['application/vnd.openxmlformats-officedocument.presentationml.presentation']
  }
});

const ASSET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const ASSET_KINDS = new Set(['image', 'document', 'audio', 'video', 'model', 'archive', 'other']);
const ASSET_VISIBILITIES = new Set(['public', 'private']);
export const MAX_CONTENT_DOCUMENT_ASSET_BYTES = 25 * 1024 * 1024;

initDatabase();

function assetError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function nowIso() {
  return new Date().toISOString();
}

function assertPostId(value) {
  const postId = Number(value);
  if (!Number.isSafeInteger(postId) || postId <= 0) {
    throw assetError('INVALID_CONTENT_DOCUMENT_ID');
  }
  return postId;
}

function assertAssetId(value) {
  const assetId = String(value || '').trim();
  if (!ASSET_ID_PATTERN.test(assetId)) {
    throw assetError('CONTENT_DOCUMENT_ASSET_ID_INVALID');
  }
  return assetId;
}

function generatedAssetId() {
  // The route grammar reserves an alphanumeric first character.  Base64url
  // occasionally starts with `_`/`-`, so retry rather than weakening it.
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const assetId = crypto.randomBytes(18).toString('base64url');
    if (ASSET_ID_PATTERN.test(assetId)) return assetId;
  }
  throw assetError('CONTENT_DOCUMENT_ASSET_ID_GENERATION_FAILED');
}

function normalizeRequestedMimeType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .split(';', 1)[0];
}

function resolveAssetType(relativePath, requestedMimeType = '') {
  const extension = path.posix.extname(relativePath).slice(1).toLowerCase();
  const definition = ALLOWED_ASSET_TYPES[extension];
  if (!definition) {
    throw assetError('CONTENT_DOCUMENT_ASSET_TYPE_UNSUPPORTED', { extension: extension || null });
  }

  const requested = normalizeRequestedMimeType(requestedMimeType);
  if (requested && requested !== 'application/octet-stream' && !definition.aliases.includes(requested)) {
    throw assetError('CONTENT_DOCUMENT_ASSET_MIME_MISMATCH', {
      extension,
      requested_mime_type: requested
    });
  }
  return definition;
}

function startsWithBytes(buffer, values) {
  return buffer.length >= values.length && values.every((value, index) => buffer[index] === value);
}

function asciiAt(buffer, offset, length) {
  if (buffer.length < offset + length) return '';
  return buffer.subarray(offset, offset + length).toString('ascii');
}

function assertInlineAssetSignature(type, buffer) {
  const mimeType = type.mimeType;
  const valid = (() => {
    switch (mimeType) {
      case 'application/pdf':
        return asciiAt(buffer, 0, 5) === '%PDF-';
      case 'image/png':
        return startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      case 'image/jpeg':
        return startsWithBytes(buffer, [0xff, 0xd8, 0xff]);
      case 'image/gif':
        return asciiAt(buffer, 0, 6) === 'GIF87a' || asciiAt(buffer, 0, 6) === 'GIF89a';
      case 'image/webp':
        return asciiAt(buffer, 0, 4) === 'RIFF' && asciiAt(buffer, 8, 4) === 'WEBP';
      case 'image/avif': {
        if (asciiAt(buffer, 4, 4) !== 'ftyp') return false;
        const brands = buffer.subarray(8, Math.min(buffer.length, 32)).toString('ascii');
        return brands.includes('avif') || brands.includes('avis');
      }
      case 'audio/mpeg':
        return asciiAt(buffer, 0, 3) === 'ID3'
          || (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
      case 'audio/wav':
        return asciiAt(buffer, 0, 4) === 'RIFF' && asciiAt(buffer, 8, 4) === 'WAVE';
      case 'audio/ogg':
        return asciiAt(buffer, 0, 4) === 'OggS';
      case 'audio/mp4':
      case 'video/mp4':
      case 'video/quicktime':
        return asciiAt(buffer, 4, 4) === 'ftyp';
      case 'video/webm':
        return startsWithBytes(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
      default:
        return true;
    }
  })();
  if (!valid) {
    throw assetError('CONTENT_DOCUMENT_ASSET_SIGNATURE_INVALID', {
      mime_type: mimeType
    });
  }
}

function normalizeAssetKind(value, fallback) {
  const assetKind = String(value || fallback || 'other').trim().toLowerCase();
  if (!ASSET_KINDS.has(assetKind)) {
    throw assetError('CONTENT_DOCUMENT_ASSET_KIND_INVALID');
  }
  return assetKind;
}

function normalizeVisibility(value, fallback = 'private') {
  const visibility = String(value || fallback).trim().toLowerCase();
  if (!ASSET_VISIBILITIES.has(visibility)) {
    throw assetError('CONTENT_DOCUMENT_ASSET_VISIBILITY_INVALID');
  }
  return visibility;
}

function ensureBuffer(content) {
  if (!Buffer.isBuffer(content)) {
    throw assetError('CONTENT_DOCUMENT_ASSET_BODY_INVALID');
  }
  if (content.length === 0) {
    throw assetError('CONTENT_DOCUMENT_ASSET_EMPTY');
  }
  if (content.length > MAX_CONTENT_DOCUMENT_ASSET_BYTES) {
    throw assetError('CONTENT_DOCUMENT_ASSET_TOO_LARGE', {
      max_bytes: MAX_CONTENT_DOCUMENT_ASSET_BYTES
    });
  }
  return content;
}

function rowToAsset(row) {
  if (!row) return null;
  return {
    id: row.asset_id,
    document_id: Number(row.post_id),
    relative_path: row.relative_path,
    original_name: row.original_name,
    mime_type: row.mime_type,
    byte_size: Number(row.byte_size),
    sha256: row.sha256,
    asset_kind: row.asset_kind,
    visibility: row.visibility,
    availability: row.availability,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function readAssetRow(postId, assetId, { visibility = 'all' } = {}) {
  let sql = `
    SELECT asset_id, post_id, relative_path, original_name, mime_type,
      byte_size, sha256, asset_kind, visibility, availability, created_at, updated_at
    FROM content_document_assets
    WHERE post_id = ? AND asset_id = ?
  `;
  const params = [postId, assetId];
  if (visibility === 'public' || visibility === 'private') {
    sql += ' AND visibility = ?';
    params.push(visibility);
  }
  return db.prepare(sql).get(...params) || null;
}

function assetAuditSnapshot(asset) {
  return asset && {
    id: asset.id,
    document_id: Number(asset.document_id),
    relative_path: asset.relative_path,
    mime_type: asset.mime_type,
    byte_size: Number(asset.byte_size),
    sha256: asset.sha256,
    asset_kind: asset.asset_kind,
    visibility: asset.visibility,
    availability: asset.availability
  };
}

function recordAssetAudit({ action, asset, actor }) {
  dbService.recordAuditLog({
    action,
    entity: 'content_document_asset',
    entity_id: asset.id,
    prev_state: action === 'DELETE_CONTENT_DOCUMENT_ASSET' ? assetAuditSnapshot(asset) : null,
    new_state: action === 'DELETE_CONTENT_DOCUMENT_ASSET' ? null : assetAuditSnapshot(asset),
    actor
  });
}

function removeWrittenFile(postId, relativePath) {
  try {
    contentDocumentStorageService.deleteDocumentAsset({ postId, relativePath });
  } catch (error) {
    // A registry failure must not turn into an API success.  The orphan remains
    // inside an opaque, non-public folder and is reported only in server logs.
    if (error?.code !== 'CONTENT_DOCUMENT_ASSET_NOT_FOUND') {
      // Deliberately avoid serializing paths or raw filesystem errors.
      return false;
    }
  }
  return true;
}

export const contentDocumentAssetService = {
  getDocumentAsset(postId, assetId, { visibility = 'all' } = {}) {
    const normalizedPostId = assertPostId(postId);
    const normalizedAssetId = assertAssetId(assetId);
    if (!['all', 'public', 'private'].includes(visibility)) {
      throw assetError('CONTENT_DOCUMENT_ASSET_VISIBILITY_INVALID');
    }
    return rowToAsset(readAssetRow(normalizedPostId, normalizedAssetId, { visibility }));
  },

  listDocumentAssets(postId, { visibility = 'all' } = {}) {
    const normalizedPostId = assertPostId(postId);
    if (!['all', 'public', 'private'].includes(visibility)) {
      throw assetError('CONTENT_DOCUMENT_ASSET_VISIBILITY_INVALID');
    }
    let sql = `
      SELECT asset_id, post_id, relative_path, original_name, mime_type,
        byte_size, sha256, asset_kind, visibility, availability, created_at, updated_at
      FROM content_document_assets
      WHERE post_id = ?
    `;
    const params = [normalizedPostId];
    if (visibility !== 'all') {
      sql += ' AND visibility = ?';
      params.push(visibility);
    }
    sql += ' ORDER BY created_at ASC, asset_id ASC';
    return db.prepare(sql).all(...params).map(rowToAsset);
  },

  uploadDocumentAsset({
    postId,
    relativePath,
    content,
    mimeType = '',
    assetKind = '',
    visibility = 'private',
    actor = 'SYSTEM'
  } = {}) {
    const normalizedPostId = assertPostId(postId);
    const buffer = ensureBuffer(content);
    const normalizedRelativePath = contentDocumentStorageService
      .normalizeDocumentAssetRelativePath(relativePath);
    const type = resolveAssetType(normalizedRelativePath, mimeType);
    // Every browser-inline format has a compact, deterministic file marker.
    // Check it before persistent storage so a renamed HTML/script payload can
    // never be served under an image, media, or PDF MIME type.
    assertInlineAssetSignature(type, buffer);
    const normalizedKind = normalizeAssetKind(assetKind, type.kind);
    const normalizedVisibility = normalizeVisibility(visibility);

    if (db.prepare(`
      SELECT 1 FROM content_document_assets
      WHERE post_id = ? AND relative_path = ? COLLATE NOCASE
    `).get(normalizedPostId, normalizedRelativePath)) {
      throw assetError('CONTENT_DOCUMENT_ASSET_ALREADY_EXISTS');
    }

    contentDocumentStorageService.writeDocumentAsset({
      postId: normalizedPostId,
      relativePath: normalizedRelativePath,
      content: buffer,
      actor
    });

    const timestamp = nowIso();
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const originalName = path.posix.basename(normalizedRelativePath);
    let asset = null;
    let inserted = false;
    try {
      for (let attempt = 0; attempt < 5 && !asset; attempt += 1) {
        const assetId = generatedAssetId();
        try {
          db.prepare(`
            INSERT INTO content_document_assets
              (asset_id, post_id, relative_path, original_name, mime_type,
               byte_size, sha256, asset_kind, visibility, availability, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)
          `).run(
            assetId,
            normalizedPostId,
            normalizedRelativePath,
            originalName,
            type.mimeType,
            buffer.length,
            sha256,
            normalizedKind,
            normalizedVisibility,
            timestamp,
            timestamp
          );
          inserted = true;
          asset = this.getDocumentAsset(normalizedPostId, assetId);
        } catch (error) {
          if (!String(error?.code || '').startsWith('SQLITE_CONSTRAINT')) throw error;
          const duplicatePath = db.prepare(`
            SELECT 1 FROM content_document_assets
            WHERE post_id = ? AND relative_path = ? COLLATE NOCASE
          `).get(normalizedPostId, normalizedRelativePath);
          if (duplicatePath) throw assetError('CONTENT_DOCUMENT_ASSET_ALREADY_EXISTS');
        }
      }
      if (!asset || !inserted) throw assetError('CONTENT_DOCUMENT_ASSET_CREATE_FAILED');
    } catch (error) {
      removeWrittenFile(normalizedPostId, normalizedRelativePath);
      throw error;
    }

    recordAssetAudit({ action: 'CREATE_CONTENT_DOCUMENT_ASSET', asset, actor });
    return asset;
  },

  deleteDocumentAsset({ postId, assetId, actor = 'SYSTEM' } = {}) {
    const normalizedPostId = assertPostId(postId);
    const normalizedAssetId = assertAssetId(assetId);
    const asset = this.getDocumentAsset(normalizedPostId, normalizedAssetId);
    if (!asset) throw assetError('CONTENT_DOCUMENT_ASSET_NOT_FOUND');

    let fileMissing = false;
    try {
      contentDocumentStorageService.deleteDocumentAsset({
        postId: normalizedPostId,
        relativePath: asset.relative_path
      });
    } catch (error) {
      if (error?.code === 'CONTENT_DOCUMENT_ASSET_NOT_FOUND') {
        fileMissing = true;
      } else {
        throw error;
      }
    }

    db.prepare(`
      DELETE FROM content_document_assets
      WHERE post_id = ? AND asset_id = ?
    `).run(normalizedPostId, normalizedAssetId);
    recordAssetAudit({ action: 'DELETE_CONTENT_DOCUMENT_ASSET', asset, actor });
    return { asset, file_missing: fileMissing };
  }
};

export const contentDocumentAssetValidation = Object.freeze({
  ASSET_ID_PATTERN,
  MAX_CONTENT_DOCUMENT_ASSET_BYTES,
  ALLOWED_ASSET_TYPES: Object.freeze(Object.keys(ALLOWED_ASSET_TYPES))
});
