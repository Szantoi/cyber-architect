// server/services/driveSyncService.js
// Safe pull-first Google Drive/local reconciliation with recursive crawling and explicit write opt-in.

import fs from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { dbService } from './dbService.js';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = path.resolve(__dirname, '../../../');
const APP_DIR = path.resolve(__dirname, '../../');
const CONFIG_DIR = path.resolve(__dirname, '../config');
const DEFAULT_CONTENT_ROOT = path.resolve(ROOT_DIR, 'CyberArchitect');
const DEFAULT_OAUTH_CLIENT_PATH = path.resolve(CONFIG_DIR, 'google-oauth-client.json');
const DEFAULT_OAUTH_TOKENS_PATH = path.resolve(CONFIG_DIR, 'drive-tokens.json');
const DEFAULT_SERVICE_ACCOUNT_PATH = path.resolve(CONFIG_DIR, 'cyberarchitect-98c3d739cc1d.json');
const LOCAL_OAUTH_REDIRECT_URI = 'http://localhost:3001/api/admin/drive/oauth2callback';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_OAUTH_STATES = 100;
const DRIVE_FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_SHORTCUT_MIME = 'application/vnd.google-apps.shortcut';
const GOOGLE_DOC_MIME = 'application/vnd.google-apps.document';
const MARKDOWN_MIME_TYPES = new Set([
  'text/markdown',
  'text/x-markdown',
  'application/markdown',
  'application/x-markdown',
  'text/plain'
]);
const MARKDOWN_FILE_PATTERN = /\.(?:md|markdown|txt)$/i;
const MAX_DRIVE_DOCUMENT_BYTES = 5 * 1024 * 1024;
const MAX_EXPORT_SLUG_LENGTH = 160;
const DRIVE_FETCH_TIMEOUT_MS = 15_000;
const DRIVE_REPAIR_METADATA_FIELDS = 'id,size,modifiedTime,version,md5Checksum,mimeType,trashed';
const pendingOAuthStates = new Map();

function pruneExpiredOAuthStates(now = Date.now()) {
  for (const [state, pending] of pendingOAuthStates) {
    if (pending.expiresAt <= now) pendingOAuthStates.delete(state);
  }
}


// Security Denylist: Never ever scan or write into internal development / architecture folders
const FORBIDDEN_DIRS = ['docs', 'server', 'src', '.git', '.agents', '.gemini', 'node_modules', 'dist', 'terminals'];

function isSameOrDescendant(candidatePath, parentPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isContentRootForbidden(candidatePath) {
  const resolvedCandidate = path.resolve(candidatePath);
  if (resolvedCandidate === path.parse(resolvedCandidate).root
    || resolvedCandidate === APP_DIR
    || resolvedCandidate === ROOT_DIR) {
    return true;
  }

  const protectedPaths = [
    ...['server', 'src', '.git', '.agents', '.gemini', 'node_modules', 'dist']
      .map(segment => path.resolve(APP_DIR, segment)),
    ...['docs', '.git', '.agents', '.gemini', 'node_modules', 'dist', 'terminals']
      .map(segment => path.resolve(ROOT_DIR, segment))
  ];
  return protectedPaths.some(protectedPath => isSameOrDescendant(resolvedCandidate, protectedPath));
}

function findExistingAncestor(candidatePath) {
  let currentPath = path.resolve(candidatePath);
  while (true) {
    if (fs.existsSync(currentPath)) return currentPath;
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) return null;
    currentPath = parentPath;
  }
}

/**
 * Resolve and validate the local content mirror root without creating it.
 * Relative explicit paths are anchored to the application root so deployment
 * configuration is independent from the process working directory.
 */
export function resolveContentRoot(env = process.env) {
  const configuredValue = typeof env.CYBER_ARCHITECT_CONTENT_ROOT === 'string'
    ? env.CYBER_ARCHITECT_CONTENT_ROOT.trim()
    : '';
  const contentRoot = configuredValue
    ? (path.isAbsolute(configuredValue)
        ? path.normalize(configuredValue)
        : path.resolve(APP_DIR, configuredValue))
    : DEFAULT_CONTENT_ROOT;

  const fail = (reason) => {
    const error = new Error('CYBER_ARCHITECT_CONTENT_ROOT_INVALID');
    error.code = 'CYBER_ARCHITECT_CONTENT_ROOT_INVALID';
    error.stage = 'CONFIGURATION';
    error.reason = reason;
    throw error;
  };

  if (isContentRootForbidden(contentRoot)) fail('FORBIDDEN_PATH');

  if (fs.existsSync(contentRoot)) {
    let contentRootStats;
    try {
      contentRootStats = fs.statSync(contentRoot);
    } catch {
      fail('UNREADABLE_PATH');
    }
    if (!contentRootStats.isDirectory()) fail('NOT_A_DIRECTORY');
    try {
      fs.accessSync(contentRoot, fs.constants.W_OK);
    } catch {
      fail('PATH_NOT_WRITABLE');
    }
  } else {
    const existingAncestor = findExistingAncestor(contentRoot);
    if (!existingAncestor) fail('NO_EXISTING_ANCESTOR');
    try {
      if (!fs.statSync(existingAncestor).isDirectory()) fail('ANCESTOR_NOT_A_DIRECTORY');
      fs.accessSync(existingAncestor, fs.constants.W_OK);
    } catch (error) {
      if (error?.code === 'CYBER_ARCHITECT_CONTENT_ROOT_INVALID') throw error;
      fail('ANCESTOR_NOT_WRITABLE');
    }
  }

  return contentRoot;
}

function resolveContentPaths(env = process.env) {
  const root = resolveContentRoot(env);
  return {
    root,
    knowledgeDir: path.resolve(root, 'KnowledgeBase'),
    blogDir: path.resolve(root, 'Blog')
  };
}

function _isPathForbidden(targetPath) {
  if (!targetPath) return false;
  const norm = path.resolve(targetPath).toLowerCase();
  for (const forbidden of FORBIDDEN_DIRS) {
    const forbiddenFull = path.resolve(ROOT_DIR, forbidden).toLowerCase();
    if (norm === forbiddenFull || norm.startsWith(forbiddenFull + path.sep)) {
      return true;
    }
  }
  return false;
}

export function resolveProjectConfigPath(configuredPath, defaultPath) {
  const normalizedPath = typeof configuredPath === 'string' ? configuredPath.trim() : '';
  if (!normalizedPath) return defaultPath;
  return path.isAbsolute(normalizedPath)
    ? path.normalize(normalizedPath)
    : path.resolve(APP_DIR, normalizedPath);
}

export function resolveOAuthRedirectUri(env = process.env) {
  let candidate = typeof env.GOOGLE_OAUTH_REDIRECT_URI === 'string'
    ? env.GOOGLE_OAUTH_REDIRECT_URI.trim()
    : '';

  if (!candidate && env.NODE_ENV === 'production') {
    const siteUrl = typeof env.SITE_URL === 'string' ? env.SITE_URL.trim() : '';
    if (!siteUrl) throw new Error('GOOGLE_OAUTH_REDIRECT_URI_REQUIRED');
    try {
      candidate = new URL('/api/admin/drive/oauth2callback', siteUrl).toString();
    } catch {
      throw new Error('INVALID_GOOGLE_OAUTH_REDIRECT_URI');
    }
  }
  if (!candidate) candidate = LOCAL_OAUTH_REDIRECT_URI;

  let redirectUrl;
  try {
    redirectUrl = new URL(candidate);
  } catch {
    throw new Error('INVALID_GOOGLE_OAUTH_REDIRECT_URI');
  }
  if (!['http:', 'https:'].includes(redirectUrl.protocol) || redirectUrl.username || redirectUrl.password) {
    throw new Error('INVALID_GOOGLE_OAUTH_REDIRECT_URI');
  }
  return redirectUrl.toString();
}

function getOAuthClientPath() {
  return resolveProjectConfigPath(process.env.GOOGLE_OAUTH_CLIENT_PATH, DEFAULT_OAUTH_CLIENT_PATH);
}

function getOAuthTokensPath() {
  return resolveProjectConfigPath(process.env.GOOGLE_OAUTH_TOKENS_PATH, DEFAULT_OAUTH_TOKENS_PATH);
}

function isRegularFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Parse standards-compliant YAML frontmatter while preserving nested objects.
 */
export function parseFrontmatter(rawContent) {
  if (!rawContent || typeof rawContent !== 'string') {
    return { metadata: {}, content: '' };
  }

  const normalized = rawContent.replace(/^\uFEFF/, '');
  const frontmatterMatch = normalized.match(/^---[\t ]*\r?\n([\s\S]*?)^---[\t ]*(?:\r?\n|$)([\s\S]*)$/m);
  if (!frontmatterMatch) {
    return { metadata: {}, content: normalized.trim() };
  }

  let metadata;
  try {
    const parsedMetadata = yaml.load(frontmatterMatch[1]);
    metadata = parsedMetadata === null || parsedMetadata === undefined ? {} : parsedMetadata;
  } catch (error) {
    throw new Error('INVALID_FRONTMATTER_YAML', { cause: error });
  }

  if (typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('INVALID_FRONTMATTER_ROOT');
  }

  const bodyContent = frontmatterMatch[2].trim();
  if (!metadata.title) {
    const titleMatch = bodyContent.match(/^#\s+(.+)$/m);
    if (titleMatch) {
      metadata.title = titleMatch[1].trim();
    }
  }

  return { metadata, content: bodyContent };
}

function normalizeIdentityText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugify(value) {
  return normalizeIdentityText(value).replace(/\s+/g, '-');
}

function canonicalizeSlug(value, maxLength = MAX_EXPORT_SLUG_LENGTH) {
  const normalized = slugify(value);
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength).replace(/-+$/g, '');
}

function appendStableSlugSuffix(baseSlug, suffix, maxLength = MAX_EXPORT_SLUG_LENGTH) {
  const normalizedSuffix = String(suffix || '').replace(/[^a-z0-9-]/g, '');
  const maxBaseLength = Math.max(1, maxLength - normalizedSuffix.length - 1);
  const shortenedBase = baseSlug.slice(0, maxBaseLength).replace(/-+$/g, '') || 'document';
  return `${shortenedBase}-${normalizedSuffix}`;
}

function stableSlugSuffix(sourceId) {
  return crypto.createHash('sha256').update(String(sourceId || '')).digest('hex');
}

function normalizeRepairDocumentKey(folderPath, fileName) {
  const normalizedFolder = String(folderPath || '')
    .normalize('NFC')
    .replace(/[\\/]+/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const normalizedFileName = String(fileName || '').normalize('NFC');
  return normalizedFolder ? `${normalizedFolder}/${normalizedFileName}` : normalizedFileName;
}

function validateLocalRepairDocument(document) {
  const rawContent = typeof document?.rawContent === 'string' ? document.rawContent : '';
  const localBytes = Buffer.byteLength(rawContent, 'utf8');
  const localSha256 = crypto.createHash('sha256').update(rawContent).digest('hex');
  const invalid = (reason, message) => ({
    valid: false,
    reason,
    message,
    localBytes,
    localSha256
  });

  if (!rawContent.trim()) {
    return invalid('LOCAL_FILE_EMPTY', 'The local repair source is empty or whitespace-only.');
  }
  if (localBytes > MAX_DRIVE_DOCUMENT_BYTES || rawContent.length > MAX_DRIVE_DOCUMENT_BYTES) {
    return invalid('LOCAL_FILE_TOO_LARGE', `The local repair source exceeds ${MAX_DRIVE_DOCUMENT_BYTES} bytes.`);
  }

  const normalized = rawContent.replace(/^\uFEFF/, '');
  const frontmatterMatch = normalized.match(/^---[\t ]*\r?\n([\s\S]*?)^---[\t ]*(?:\r?\n|$)([\s\S]*)$/m);
  if (!frontmatterMatch) {
    return invalid('FRONTMATTER_REQUIRED', 'The local repair source must contain YAML frontmatter.');
  }

  let metadata;
  try {
    metadata = yaml.load(frontmatterMatch[1]);
  } catch {
    return invalid('INVALID_FRONTMATTER_YAML', 'The local repair source has invalid YAML frontmatter.');
  }
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return invalid('INVALID_FRONTMATTER_ROOT', 'The local repair frontmatter must be a YAML mapping.');
  }

  const rawSlug = typeof metadata.slug === 'string' ? metadata.slug.trim() : '';
  const canonicalSlug = canonicalizeSlug(rawSlug);
  if (!rawSlug || canonicalSlug !== rawSlug) {
    return invalid('CANONICAL_SLUG_REQUIRED', 'The local repair source must contain a canonical slug.');
  }
  if (typeof metadata.title !== 'string' || !metadata.title.trim()) {
    return invalid('TITLE_REQUIRED', 'The local repair source must contain a non-empty title.');
  }
  if (!Object.prototype.hasOwnProperty.call(metadata, 'published') || typeof metadata.published !== 'boolean') {
    return invalid('EXPLICIT_PUBLISHED_REQUIRED', 'The local repair source must contain an explicit boolean published value.');
  }

  const folderCorpus = String(document?.folderPath || '').split(/[/\\]/).filter(Boolean)[0]?.toLowerCase();
  const contentType = metadata.content_type === undefined || metadata.content_type === null
    ? folderCorpus
    : String(metadata.content_type).trim().toLowerCase();
  if (!['blog', 'knowledge'].includes(contentType)) {
    return invalid('INVALID_CONTENT_TYPE', 'The local repair source must resolve to blog or knowledge content.');
  }
  if (!['blog', 'knowledge'].includes(folderCorpus) || contentType !== folderCorpus) {
    return invalid('CONTENT_TYPE_FOLDER_MISMATCH', 'The local repair content type must match its blog or knowledge root folder.');
  }

  return {
    valid: true,
    metadata,
    contentType,
    localBytes,
    localSha256
  };
}

function createLocalSourceId(relativePath) {
  const normalizedPath = String(relativePath || '')
    .replace(/\\/g, '/')
    .normalize('NFC');
  const readablePrefix = normalizedPath
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'document';
  const pathHash = crypto.createHash('sha256').update(normalizedPath).digest('hex').slice(0, 16);
  return `drive_file_${readablePrefix}_${pathHash}`;
}

export function deriveLegacyLocalSourceId(folderPath, fileName) {
  const normalizedPrefix = String(folderPath || '')
    .replace(/[\\/]+/g, '/')
    .replace(/^\/+|\/+$/g, '');
  const sanitizedFileName = String(fileName || '').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `drive_file_${normalizedPrefix ? `${normalizedPrefix}_` : ''}${sanitizedFileName}`;
}

function sanitizeLegacyFileName(fileName) {
  return String(fileName || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function legacyRowKey(row) {
  return row?.id !== undefined && row?.id !== null
    ? `id:${row.id}`
    : `source:${String(row?.drive_file_id || '')}`;
}

function buildLegacyIdentityPlan(documents, posts) {
  const legacyRows = (Array.isArray(posts) ? posts : []).filter(post => (
    String(post?.drive_file_id || '').startsWith('drive_file_')
  ));
  const seenSourceIds = new Set();
  const cloudEntries = (Array.isArray(documents) ? documents : []).flatMap(document => {
    const sourceId = String(document?.fileId || '').trim();
    if (!sourceId.startsWith('gdrive_') || seenSourceIds.has(sourceId)) return [];
    seenSourceIds.add(sourceId);
    return [{
      document,
      sourceId,
      fullPathSourceId: deriveLegacyLocalSourceId(document.folderPath, document.fileName),
      sanitizedFileName: sanitizeLegacyFileName(document.fileName)
    }];
  });
  const plan = new Map();
  const rowsBySourceId = new Map();
  for (const row of legacyRows) {
    const sourceId = String(row.drive_file_id);
    if (!rowsBySourceId.has(sourceId)) rowsBySourceId.set(sourceId, []);
    rowsBySourceId.get(sourceId).push(row);
  }

  const exactProposals = [];
  const exactClaims = new Map();
  for (const entry of cloudEntries) {
    const candidates = rowsBySourceId.get(entry.fullPathSourceId) || [];
    if (candidates.length > 1) {
      plan.set(entry.sourceId, {
        status: 'ambiguous',
        strategy: 'EXACT_FULL_PATH',
        reason: 'MULTIPLE_DB_EXACT_CANDIDATES',
        candidateSourceIds: candidates.map(candidate => candidate.drive_file_id)
      });
      continue;
    }
    if (candidates.length === 1) {
      const proposal = { ...entry, owner: candidates[0] };
      exactProposals.push(proposal);
      const ownerKey = legacyRowKey(proposal.owner);
      if (!exactClaims.has(ownerKey)) exactClaims.set(ownerKey, []);
      exactClaims.get(ownerKey).push(proposal);
    }
  }

  const reservedOwnerKeys = new Set();
  for (const proposal of exactProposals) {
    const ownerKey = legacyRowKey(proposal.owner);
    if (exactClaims.get(ownerKey).length === 1) {
      plan.set(proposal.sourceId, {
        status: 'adopt',
        strategy: 'EXACT_FULL_PATH',
        owner: proposal.owner,
        legacySourceId: proposal.owner.drive_file_id
      });
      reservedOwnerKeys.add(ownerKey);
    } else {
      plan.set(proposal.sourceId, {
        status: 'ambiguous',
        strategy: 'EXACT_FULL_PATH',
        reason: 'MULTIPLE_INCOMING_EXACT_CLAIMS',
        candidateSourceIds: [proposal.owner.drive_file_id]
      });
    }
  }

  const basenameProposals = [];
  const basenameClaims = new Map();
  for (const entry of cloudEntries) {
    if (plan.has(entry.sourceId)) continue;
    const suffix = `_${entry.sanitizedFileName}`;
    const candidates = legacyRows.filter(row => {
      const legacySourceId = String(row.drive_file_id);
      return legacySourceId === `drive_file_${entry.sanitizedFileName}`
        || legacySourceId.endsWith(suffix);
    });
    if (candidates.length === 0) {
      plan.set(entry.sourceId, {
        status: 'not_found',
        strategy: 'UNIQUE_BASENAME',
        reason: 'NO_LEGACY_BASENAME_CANDIDATE'
      });
      continue;
    }
    if (candidates.length > 1) {
      plan.set(entry.sourceId, {
        status: 'ambiguous',
        strategy: 'UNIQUE_BASENAME',
        reason: 'MULTIPLE_DB_BASENAME_CANDIDATES',
        candidateSourceIds: candidates.map(candidate => candidate.drive_file_id)
      });
      continue;
    }
    const ownerKey = legacyRowKey(candidates[0]);
    if (reservedOwnerKeys.has(ownerKey)) {
      plan.set(entry.sourceId, {
        status: 'ambiguous',
        strategy: 'UNIQUE_BASENAME',
        reason: 'LEGACY_TARGET_ALREADY_CLAIMED',
        candidateSourceIds: [candidates[0].drive_file_id]
      });
      continue;
    }
    const proposal = { ...entry, owner: candidates[0] };
    basenameProposals.push(proposal);
    if (!basenameClaims.has(ownerKey)) basenameClaims.set(ownerKey, []);
    basenameClaims.get(ownerKey).push(proposal);
  }

  for (const proposal of basenameProposals) {
    const ownerKey = legacyRowKey(proposal.owner);
    if (basenameClaims.get(ownerKey).length === 1) {
      plan.set(proposal.sourceId, {
        status: 'candidate',
        strategy: 'UNIQUE_BASENAME',
        owner: proposal.owner,
        legacySourceId: proposal.owner.drive_file_id,
        reason: 'INSUFFICIENT_IDENTITY_EVIDENCE'
      });
    } else {
      plan.set(proposal.sourceId, {
        status: 'ambiguous',
        strategy: 'UNIQUE_BASENAME',
        reason: 'MULTIPLE_INCOMING_BASENAME_CLAIMS',
        candidateSourceIds: [proposal.owner.drive_file_id]
      });
    }
  }

  return plan;
}

function isMarkdownLikeFile(item, alternateName = '') {
  return item?.mimeType === GOOGLE_DOC_MIME
    || MARKDOWN_MIME_TYPES.has(String(item?.mimeType || '').toLowerCase())
    || MARKDOWN_FILE_PATTERN.test(String(item?.name || ''))
    || MARKDOWN_FILE_PATTERN.test(String(alternateName || ''));
}

function createDriveIssue({
  code,
  stage,
  message,
  folderId = null,
  folderPath = '',
  fileId = null,
  fileName = null,
  status = null,
  recovered = false,
  authMode = null,
  requestedRaw = null,
  resolved = null,
  configKey = null,
  previousSourceId = null,
  legacySourceId = null,
  mismatchFields = null,
  matchStrategy = null,
  ambiguityReason = null,
  candidateSourceIds = null,
  documentKey = null,
  validationReason = null,
  localBytes = null,
  localSha256 = null,
  cloudBytes = null
}) {
  const normalizedMessage = String(message || code);
  return {
    code,
    stage,
    message: normalizedMessage,
    error: normalizedMessage,
    folder_id: folderId,
    folder: folderPath,
    file_id: fileId,
    file: fileName,
    http_status: status,
    recovered,
    auth_mode: authMode,
    ...(requestedRaw !== null ? { requested_raw: requestedRaw } : {}),
    ...(resolved !== null ? { resolved } : {}),
    ...(configKey !== null ? { config_key: configKey } : {}),
    ...(previousSourceId !== null ? { previous_source_id: previousSourceId } : {}),
    ...(legacySourceId !== null ? { legacy_source_id: legacySourceId } : {}),
    ...(mismatchFields !== null ? { mismatch_fields: mismatchFields } : {}),
    ...(matchStrategy !== null ? { match_strategy: matchStrategy } : {}),
    ...(ambiguityReason !== null ? { ambiguity_reason: ambiguityReason } : {}),
    ...(candidateSourceIds !== null ? { candidate_source_ids: candidateSourceIds } : {}),
    ...(documentKey !== null ? { document_key: documentKey } : {}),
    ...(validationReason !== null ? { validation_reason: validationReason } : {}),
    ...(localBytes !== null ? { local_bytes: localBytes } : {}),
    ...(localSha256 !== null ? { local_sha256: localSha256 } : {}),
    ...(cloudBytes !== null ? { cloud_bytes: cloudBytes } : {})
  };
}

async function readDriveError(response) {
  try {
    const payload = await response.json();
    return payload?.error?.message || payload?.error_description || response.statusText || `HTTP_${response.status}`;
  } catch {
    return response.statusText || `HTTP_${response.status}`;
  }
}

async function createDriveHttpError(code, stage, response) {
  const error = new Error(code);
  error.code = code;
  error.stage = stage;
  error.http_status = response?.status ?? null;
  error.detail = String(await readDriveError(response)).slice(0, 500);
  return error;
}

function createDriveOperationError(code, stage, detail = '') {
  const error = new Error(code);
  error.code = code;
  error.stage = stage;
  error.http_status = null;
  if (detail) error.detail = String(detail).slice(0, 500);
  return error;
}

function getExplicitConfigurationIssues() {
  const configuredFiles = [
    {
      key: 'GOOGLE_APPLICATION_CREDENTIALS',
      value: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      defaultPath: DEFAULT_SERVICE_ACCOUNT_PATH,
      code: 'GOOGLE_APPLICATION_CREDENTIALS_NOT_FOUND'
    },
    {
      key: 'GOOGLE_OAUTH_CLIENT_PATH',
      value: process.env.GOOGLE_OAUTH_CLIENT_PATH,
      defaultPath: DEFAULT_OAUTH_CLIENT_PATH,
      code: 'GOOGLE_OAUTH_CLIENT_NOT_FOUND'
    }
  ];

  return configuredFiles.flatMap(({ key, value, defaultPath, code }) => {
    const explicitValue = typeof value === 'string' ? value.trim() : '';
    if (!explicitValue || isRegularFile(resolveProjectConfigPath(explicitValue, defaultPath))) return [];
    return [createDriveIssue({
      code,
      stage: 'CONFIGURATION',
      message: `The explicitly configured ${key} file is unavailable.`,
      configKey: key
    })];
  });
}

function driveFetch(input, options = {}) {
  return fetch(input, {
    ...options,
    signal: options.signal || AbortSignal.timeout(DRIVE_FETCH_TIMEOUT_MS)
  });
}

async function fetchDriveFileMetadata(fileId, accessToken, {
  code = 'DRIVE_FILE_METADATA_READ_FAILED',
  stage = 'FILE_METADATA_READ',
  fields = 'id,modifiedTime'
} = {}) {
  const metadataUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  metadataUrl.searchParams.set('fields', fields);
  metadataUrl.searchParams.set('supportsAllDrives', 'true');
  const response = await driveFetch(metadataUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw await createDriveHttpError(code, stage, response);

  let metadata = null;
  try {
    metadata = await response.json();
  } catch {
    metadata = null;
  }
  return {
    metadata,
    etag: response.headers?.get?.('etag') || null
  };
}

function normalizeRepairMetadataSnapshot(metadata) {
  return {
    id: metadata?.id === undefined || metadata?.id === null ? null : String(metadata.id),
    version: metadata?.version === undefined || metadata?.version === null
      ? null
      : String(metadata.version),
    modifiedTime: metadata?.modifiedTime || null,
    size: metadata?.size === undefined || metadata?.size === null ? null : String(metadata.size),
    md5Checksum: metadata?.md5Checksum || null,
    mimeType: metadata?.mimeType ? String(metadata.mimeType).toLowerCase() : null,
    trashed: Boolean(metadata?.trashed)
  };
}

function repairMetadataSnapshotsEqual(left, right) {
  return ['id', 'version', 'modifiedTime', 'size', 'md5Checksum', 'mimeType', 'trashed']
    .every(field => left?.[field] === right?.[field]);
}

async function readTextResponseWithLimit(response, maxBytes = MAX_DRIVE_DOCUMENT_BYTES) {
  const contentLength = Number(response.headers?.get?.('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { tooLarge: true, bytes: contentLength, text: '' };
  }

  if (!response.body?.getReader) {
    const text = await response.text();
    const bytes = Buffer.byteLength(text, 'utf8');
    return { tooLarge: bytes > maxBytes, bytes, text: bytes > maxBytes ? '' : text };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // The size limit has already been enforced; cancellation is best-effort.
      }
      return { tooLarge: true, bytes, text: '' };
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return { tooLarge: false, bytes, text };
}

/**
 * Format a post into complete Markdown with YAML Frontmatter
 */
export function formatPostToMarkdown(post) {
  let dimensions = post?.dimensions || {};
  if (typeof dimensions === 'string') {
    try {
      dimensions = JSON.parse(dimensions || '{}');
    } catch {
      dimensions = {};
    }
  }
  if (!dimensions || typeof dimensions !== 'object' || Array.isArray(dimensions)) {
    dimensions = {};
  }

  const metadata = {
    title: post?.title || '',
    slug: post?.slug || '',
    project_id: post?.project_id || 'prj_rag_enterprise',
    content_type: post?.content_type === 'knowledge' ? 'knowledge' : 'blog',
    summary: post?.summary || '',
    category: post?.category || 'TUDÁSTÁR',
    visibility: post?.visibility === 'private' ? 'private' : 'public',
    published: Boolean(post?.published),
    read_time: post?.read_time || '4 PERC',
    ...(post?.audio_url ? { audio_url: post.audio_url } : {}),
    ...(post?.video_url ? { video_url: post.video_url } : {}),
    dimensions
  };
  const serializedMetadata = yaml.dump(metadata, {
    noRefs: true,
    sortKeys: true,
    lineWidth: -1
  });

  return `---\n${serializedMetadata}---\n\n${post?.content || ''}`;
}

const CANONICAL_EXPORT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function assertCanonicalExportSlug(slug) {
  if (typeof slug !== 'string'
    || slug.length > MAX_EXPORT_SLUG_LENGTH
    || !CANONICAL_EXPORT_SLUG_PATTERN.test(slug)) {
    const error = new Error('INVALID_EXPORT_SLUG');
    error.code = 'INVALID_EXPORT_SLUG';
    throw error;
  }
}

function resolveContainedPath(basePath, ...segments) {
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(resolvedBase, ...segments);
  const relativeTarget = path.relative(resolvedBase, resolvedTarget);
  if (!relativeTarget
    || relativeTarget.startsWith(`..${path.sep}`)
    || relativeTarget === '..'
    || path.isAbsolute(relativeTarget)
    || _isPathForbidden(resolvedTarget)) {
    const error = new Error('INVALID_EXPORT_PATH');
    error.code = 'INVALID_EXPORT_PATH';
    throw error;
  }
  return resolvedTarget;
}

/**
 * Extract Google Drive Folder ID from full URL or return plain ID
 */
function cleanFolderId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  const match = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];
  return trimmed;
}

/**
 * Determine the appropriate subfolder name based on project_id and visibility
 */
function getTargetSubfolder(projectId, visibility) {
  if (visibility === 'private') {
    return '03_Belso_Kutatasok_Privat';
  }
  if (projectId === 'prj_cad_auto') {
    return '02_CAD_Automatizacio';
  }
  return '01_Zart_Vallalati_RAG';
}

export const driveSyncService = {
  getOAuthClient() {
    const oauthClientPath = getOAuthClientPath();
    if (isRegularFile(oauthClientPath)) {
      try {
        const redirectUri = resolveOAuthRedirectUri();
        const raw = JSON.parse(fs.readFileSync(oauthClientPath, 'utf8'));
        const clientData = raw.web || raw.installed || {};
        return {
          client_id: clientData.client_id,
          client_secret: clientData.client_secret,
          redirect_uri: redirectUri
        };
      } catch (err) {
        logger.error('[DRIVE_OAUTH] Failed to read google-oauth-client.json', err);
      }
    }
    return null;
  },

  getTokens() {
    const oauthTokensPath = getOAuthTokensPath();
    if (isRegularFile(oauthTokensPath)) {
      try {
        return JSON.parse(fs.readFileSync(oauthTokensPath, 'utf8'));
      } catch (_err) {
        // ignore invalid token file
      }
    }
    return null;
  },

  saveTokens(tokens) {
    const oauthTokensPath = getOAuthTokensPath();
    const oauthTokensDir = path.dirname(oauthTokensPath);
    if (!fs.existsSync(oauthTokensDir)) {
      fs.mkdirSync(oauthTokensDir, { recursive: true });
    }
    const temporaryPath = path.join(
      oauthTokensDir,
      `.${path.basename(oauthTokensPath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
    );
    const backupPath = path.join(oauthTokensDir, `.${path.basename(oauthTokensPath)}.backup`);
    let backupCreated = false;
    let published = false;
    try {
      if (process.platform === 'win32' && fs.existsSync(backupPath)) {
        if (fs.existsSync(oauthTokensPath)) fs.unlinkSync(backupPath);
        else fs.renameSync(backupPath, oauthTokensPath);
      }
      fs.writeFileSync(temporaryPath, JSON.stringify(tokens, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx'
      });
      fs.chmodSync(temporaryPath, 0o600);
      if (process.platform === 'win32' && fs.existsSync(oauthTokensPath)) {
        fs.renameSync(oauthTokensPath, backupPath);
        backupCreated = true;
      }
      fs.renameSync(temporaryPath, oauthTokensPath);
      published = true;
      if (backupCreated && fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
        backupCreated = false;
      }
      fs.chmodSync(oauthTokensPath, 0o600);
      logger.success('[DRIVE_OAUTH] Google Drive OAuth tokens saved successfully');
    } catch (error) {
      try {
        if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
        if (backupCreated && !published && !fs.existsSync(oauthTokensPath) && fs.existsSync(backupPath)) {
          fs.renameSync(backupPath, oauthTokensPath);
          backupCreated = false;
        }
        if (backupCreated && published && fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
      } catch {
        // Preserve the primary persistence error; stale same-directory temp
        // cleanup is best effort and never exposes token contents.
      }
      throw error;
    }
  },

  createOAuthState(returnOrigin = null) {
    const now = Date.now();
    pruneExpiredOAuthStates(now);

    while (pendingOAuthStates.size >= MAX_PENDING_OAUTH_STATES) {
      const oldestState = pendingOAuthStates.keys().next().value;
      pendingOAuthStates.delete(oldestState);
    }

    const state = crypto.randomBytes(32).toString('base64url');
    pendingOAuthStates.set(state, {
      expiresAt: now + OAUTH_STATE_TTL_MS,
      returnOrigin: typeof returnOrigin === 'string' ? returnOrigin : null
    });
    return state;
  },

  consumeOAuthState(state) {
    if (typeof state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(state)) return null;

    const pending = pendingOAuthStates.get(state);
    if (!pending) return null;

    // OAuth state values are single-use, including failed or incomplete callbacks.
    pendingOAuthStates.delete(state);
    if (pending.expiresAt <= Date.now()) return null;

    return { returnOrigin: pending.returnOrigin };
  },

  getAuthUrl({ returnOrigin = null } = {}) {
    const client = this.getOAuthClient();
    if (!client || !client.client_id) {
      throw new Error('MISSING_OAUTH_CLIENT_CONFIG: google-oauth-client.json not found');
    }

    const scope = encodeURIComponent('https://www.googleapis.com/auth/drive');
    const redirectUri = encodeURIComponent(client.redirect_uri);
    const state = encodeURIComponent(this.createOAuthState(returnOrigin));
    return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(client.client_id)}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&access_type=offline&prompt=consent&state=${state}`;
  },

  async exchangeCodeForTokens(code) {
    if (typeof code !== 'string' || !code.trim()) {
      throw new Error('MISSING_OAUTH_AUTHORIZATION_CODE');
    }

    const client = this.getOAuthClient();
    if (!client) throw new Error('MISSING_OAUTH_CLIENT_CONFIG');

    const res = await driveFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code.trim(),
        client_id: client.client_id,
        client_secret: client.client_secret,
        redirect_uri: client.redirect_uri,
        grant_type: 'authorization_code'
      })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(`TOKEN_EXCHANGE_FAILED: ${data.error_description || data.error}`);
    }

    const tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || this.getTokens()?.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
      token_type: data.token_type
    };

    this.saveTokens(tokens);
    return tokens;
  },

  getServiceAccountCredentialsPath() {
    const explicitPath = typeof process.env.GOOGLE_APPLICATION_CREDENTIALS === 'string'
      ? process.env.GOOGLE_APPLICATION_CREDENTIALS.trim()
      : '';
    if (explicitPath) {
      const configuredPath = resolveProjectConfigPath(explicitPath, DEFAULT_SERVICE_ACCOUNT_PATH);
      return isRegularFile(configuredPath) ? configuredPath : null;
    }
    return isRegularFile(DEFAULT_SERVICE_ACCOUNT_PATH) ? DEFAULT_SERVICE_ACCOUNT_PATH : null;
  },

  hasUsableServiceAccountCredentials() {
    const credentialsPath = this.getServiceAccountCredentialsPath();
    if (!credentialsPath) return false;
    try {
      const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
      return Boolean(
        typeof credentials.client_email === 'string'
        && credentials.client_email.trim()
        && typeof credentials.private_key === 'string'
        && credentials.private_key.trim()
      );
    } catch {
      return false;
    }
  },

  async getServiceAccountAccessToken() {
    const finalPath = this.getServiceAccountCredentialsPath();
    if (!finalPath) return null;

    try {
      const creds = JSON.parse(fs.readFileSync(finalPath, 'utf8'));
      if (!creds.client_email || !creds.private_key) return null;

      const crypto = await import('crypto');
      const now = Math.floor(Date.now() / 1000);
      const header = { alg: 'RS256', typ: 'JWT' };
      const payload = {
        iss: creds.client_email,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
      };

      const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
      const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const signInput = b64Header + '.' + b64Payload;

      const signer = crypto.createSign('RSA-SHA256');
      signer.update(signInput);
      const signature = signer.sign(creds.private_key, 'base64url');
      const jwt = signInput + '.' + signature;

      const res = await driveFetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt
        })
      });

      const data = await res.json();
      if (data.access_token) {
        return data.access_token;
      }
    } catch (saErr) {
      logger.error('[SERVICE_ACCOUNT_AUTH_ERROR]', saErr);
    }
    return null;
  },

  async getOAuthAccessToken({ persist = true } = {}) {
    const tokens = this.getTokens();
    if (!tokens) return null;

    if (tokens.access_token && tokens.expires_at && tokens.expires_at > Date.now() + 60000) {
      return tokens.access_token;
    }

    if (!tokens.refresh_token) {
      logger.warn('[DRIVE_OAUTH] No refresh token available, re-authentication needed');
      return null;
    }

    const client = this.getOAuthClient();
    if (!client) return null;

    try {
      const res = await driveFetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: client.client_id,
          client_secret: client.client_secret,
          refresh_token: tokens.refresh_token,
          grant_type: 'refresh_token'
        })
      });

      const data = await res.json();
      if (res.ok && data.access_token) {
        const refreshedTokens = {
          ...tokens,
          access_token: data.access_token,
          expires_at: Date.now() + (data.expires_in * 1000)
        };
        if (persist) this.saveTokens(refreshedTokens);
        return refreshedTokens.access_token;
      }
      logger.warn('[DRIVE_OAUTH] Token refresh was rejected', { status: res.status });
    } catch (err) {
      logger.error('[DRIVE_OAUTH] Token refresh failed', err);
    }
    return null;
  },

  async getAccessTokenCandidates({ persistOAuthTokens = true, lazyOAuth = false } = {}) {
    const candidates = [];
    const serviceAccountToken = await this.getServiceAccountAccessToken();
    if (serviceAccountToken) {
      candidates.push({ mode: 'SERVICE_ACCOUNT', token: serviceAccountToken });
    }

    if (lazyOAuth) {
      const tokens = this.getTokens();
      if (tokens?.access_token || tokens?.refresh_token) {
        candidates.push({
          mode: 'OAUTH_USER',
          getToken: () => this.getOAuthAccessToken({ persist: persistOAuthTokens })
        });
      }
    } else {
      const oauthToken = await this.getOAuthAccessToken({ persist: persistOAuthTokens });
      if (oauthToken && oauthToken !== serviceAccountToken) {
        candidates.push({ mode: 'OAUTH_USER', token: oauthToken });
      }
    }
    return candidates;
  },

  async getValidAccessToken({ persistOAuthTokens = true } = {}) {
    const candidates = await this.getAccessTokenCandidates({ persistOAuthTokens });
    return candidates[0]?.token || null;
  },

  getStatus() {
    const rawFolderInput = process.env.GOOGLE_DRIVE_FOLDER_ID || null;
    const driveFolderId = cleanFolderId(rawFolderInput);
    const driveKnowledgeFolderId = cleanFolderId(process.env.DRIVE_KNOWLEDGE_FOLDER_ID || rawFolderInput);
    const driveBlogFolderId = cleanFolderId(process.env.DRIVE_BLOG_FOLDER_ID || null);

    const configurationErrors = getExplicitConfigurationIssues();
    let contentPaths = null;
    try {
      contentPaths = resolveContentPaths();
    } catch (error) {
      configurationErrors.push(createDriveIssue({
        code: 'CYBER_ARCHITECT_CONTENT_ROOT_INVALID',
        stage: 'CONFIGURATION',
        message: 'The configured local content root is unavailable or unsafe.',
        configKey: 'CYBER_ARCHITECT_CONTENT_ROOT',
        validationReason: error?.reason || 'INVALID_PATH'
      }));
    }
    const localKnowledgeDir = contentPaths?.knowledgeDir || null;
    const localBlogDir = contentPaths?.blogDir || null;
    const hasCloudCreds = this.hasUsableServiceAccountCredentials();
    const oauthClient = this.getOAuthClient();
    const tokens = this.getTokens();
    const hasValidOAuthAccessToken = Boolean(
      tokens?.access_token && tokens.expires_at > Date.now() + 60000
    );
    const hasRefreshableOAuthToken = Boolean(
      tokens?.refresh_token && oauthClient?.client_id && oauthClient?.client_secret
    );
    const isOAuthConnected = hasValidOAuthAccessToken || hasRefreshableOAuthToken;
    const hasCloudFolder = Boolean(
      driveFolderId || driveKnowledgeFolderId || driveBlogFolderId
    );
    const hasUsableCloudCredentials = hasCloudCreds || isOAuthConnected;

    if (configurationErrors.length === 0 && hasCloudFolder && !hasUsableCloudCredentials) {
      configurationErrors.push(createDriveIssue({
        code: 'DRIVE_CREDENTIALS_REQUIRED',
        stage: 'CONFIGURATION',
        message: 'A Drive folder is configured but no usable service-account or OAuth credential is available.'
      }));
    } else if (configurationErrors.length === 0 && !hasCloudFolder && hasUsableCloudCredentials) {
      configurationErrors.push(createDriveIssue({
        code: 'DRIVE_FOLDER_NOT_CONFIGURED',
        stage: 'CONFIGURATION',
        message: 'Google Drive credentials are configured but no Drive folder ID is available.'
      }));
    }

    const countFiles = (dir) => {
      if (!dir || !fs.existsSync(dir)) return 0;
      let count = 0;
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.isDirectory()) count += countFiles(path.join(dir, item.name));
        else if (MARKDOWN_FILE_PATTERN.test(item.name)) count++;
      }
      return count;
    };

    const knowledgeFileCount = countFiles(localKnowledgeDir);
    const blogFileCount = countFiles(localBlogDir);

    let mode = configurationErrors.length > 0 ? 'CONFIGURATION_ERROR' : 'LOCAL_DRIVE_MIRROR';
    if (configurationErrors.length === 0 && hasCloudCreds && hasCloudFolder) {
      mode = 'GOOGLE_SERVICE_ACCOUNT';
    } else if (configurationErrors.length === 0 && isOAuthConnected && hasCloudFolder) {
      mode = 'GOOGLE_OAUTH_API';
    }

    return {
      mode,
      source_of_truth: mode === 'CONFIGURATION_ERROR'
        ? 'UNAVAILABLE'
        : (mode === 'LOCAL_DRIVE_MIRROR' ? 'LOCAL_DRIVE_MIRROR' : 'GOOGLE_DRIVE_CLOUD'),
      drive_folder_id: driveFolderId,
      drive_knowledge_folder_id: driveKnowledgeFolderId,
      drive_blog_folder_id: driveBlogFolderId,
      has_oauth_client: !!oauthClient,
      is_oauth_connected: isOAuthConnected,
      has_cloud_credentials: hasCloudCreds,
      configuration_errors: configurationErrors,
      content_root: contentPaths?.root || null,
      knowledge_vault_dir: localKnowledgeDir,
      blog_vault_dir: localBlogDir,
      knowledge_files_count: knowledgeFileCount,
      blog_files_count: blogFileCount,
      local_files_detected: knowledgeFileCount + blogFileCount,
      last_sync_time: null,
      checked_at: new Date().toISOString()
    };
  },

  /**
   * The former generic recursive push path could report success after failed
   * metadata/content writes. It remains callable only as an explicit fail-closed
   * compatibility boundary; targeted repairs and single-post exports use strict
   * status-checked write paths instead.
   */
  async uploadLocalFolderRecursive() {
    throw createDriveOperationError('DRIVE_PUSH_UNSUPPORTED', 'PUSH');
  },

  /**
   * Push all local knowledge and blog files up to Google Drive
   */
  async pushLocalToDrive() {
    throw createDriveOperationError('DRIVE_PUSH_UNSUPPORTED', 'PUSH');
  },

  /**
   * Helper: Get or Create Google Drive Cloud Folder (Recursive Hierarchical Support)
   */
  async getOrCreateCloudFolder(parentFolderId, folderName, accessToken) {
    if (!parentFolderId || !folderName || !accessToken) {
      throw createDriveOperationError(
        'DRIVE_FOLDER_CONFIGURATION_INVALID',
        'FOLDER_CONFIGURATION'
      );
    }
    const cleanName = folderName.replace(/['\\]/g, '');
    if (!cleanName) {
      throw createDriveOperationError('DRIVE_FOLDER_NAME_INVALID', 'FOLDER_CONFIGURATION');
    }
    const query = `'${parentFolderId}' in parents and name = '${cleanName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const searchUrl = new URL('https://www.googleapis.com/drive/v3/files');
    searchUrl.searchParams.set('q', query);
    searchUrl.searchParams.set('fields', 'files(id,name)');
    searchUrl.searchParams.set('supportsAllDrives', 'true');
    searchUrl.searchParams.set('includeItemsFromAllDrives', 'true');

    try {
      const res = await driveFetch(searchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) {
        throw await createDriveHttpError('DRIVE_FOLDER_LOOKUP_FAILED', 'FOLDER_LOOKUP', res);
      }
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }

      // Create new folder on Google Drive
      const createUrl = new URL('https://www.googleapis.com/drive/v3/files');
      createUrl.searchParams.set('supportsAllDrives', 'true');
      const createRes = await driveFetch(createUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: cleanName,
          parents: [parentFolderId],
          mimeType: 'application/vnd.google-apps.folder'
        })
      });

      if (!createRes.ok) {
        throw await createDriveHttpError('DRIVE_FOLDER_CREATE_FAILED', 'FOLDER_CREATE', createRes);
      }
      const created = await createRes.json();
      if (!created?.id) {
        throw createDriveOperationError('DRIVE_FOLDER_CREATE_INVALID_RESPONSE', 'FOLDER_CREATE');
      }
      logger.success(`[DRIVE_FOLDER_CREATED] Created Google Drive folder: "${cleanName}" (ID: ${created.id})`);
      return created.id;
    } catch (err) {
      logger.error(`[DRIVE_FOLDER_ERROR] Failed to get or create folder: "${folderName}"`, err);
      if (err?.code) throw err;
      throw createDriveOperationError('DRIVE_FOLDER_OPERATION_FAILED', 'FOLDER_OPERATION', err?.message);
    }
  },

  /**
   * REVERSE SYNC (Web/Admin ➔ Google Drive & Local Vault):
   * Writes Markdown file back to Google Drive (with auto-versioning and dedicated subfolders) and Local Vault
   */
  async exportPostToDrive(post) {
    if (!post) {
      throw createDriveOperationError('DRIVE_EXPORT_POST_REQUIRED', 'EXPORT_VALIDATION');
    }
    assertCanonicalExportSlug(post.slug);

    const isBlog = post.content_type === 'blog';
    const fileName = `${post.slug}.md`;
    const markdownContent = formatPostToMarkdown(post);

    const status = this.getStatus();
    if (status.configuration_errors?.length > 0) {
      throw createDriveOperationError(
        'DRIVE_CONFIGURATION_INVALID',
        'CONFIGURATION',
        status.configuration_errors.map(issue => issue.code).join(',')
      );
    }
    const fallbackContentPaths = status.knowledge_vault_dir && status.blog_vault_dir
      ? null
      : resolveContentPaths();

    const subfolderName = isBlog 
      ? (post.category ? post.category.replace(/[^a-zA-Z0-9_-]/g, '_') : '01_Altalanos')
      : getTargetSubfolder(post.project_id, post.visibility);

    const targetBaseDir = isBlog
      ? (status.blog_vault_dir || fallbackContentPaths.blogDir)
      : (status.knowledge_vault_dir || fallbackContentPaths.knowledgeDir);
    const articleDir = resolveContainedPath(targetBaseDir, subfolderName, post.slug);
    const localFilePath = resolveContainedPath(targetBaseDir, subfolderName, post.slug, fileName);

    let localWritten = false;
    let localError = null;

    // 1. Write to local vault mirror (CyberArchitect/KnowledgeBase or CyberArchitect/Blog) in dedicated article folder
    try {
      if (!fs.existsSync(articleDir)) {
        fs.mkdirSync(articleDir, { recursive: true });
      }
      fs.writeFileSync(localFilePath, markdownContent, 'utf-8');
      localWritten = true;
      logger.info(`[DRIVE_EXPORT] Written to local dedicated folder ${articleDir}: ${fileName}`);
    } catch (locErr) {
      localError = 'LOCAL_MIRROR_WRITE_FAILED';
      logger.error('[DRIVE_EXPORT_LOCAL_ERROR]', locErr);
    }


    // 2. Write / Update directly on Google Drive Cloud (with Native Versioning & Hierarchical Folders)
    const targetDriveRootId = isBlog
      ? (status.drive_blog_folder_id || status.drive_folder_id)
      : (status.drive_knowledge_folder_id || status.drive_folder_id);

    const baseResult = {
      local_written: localWritten,
      local_error: localError,
      cloud_written: false,
      drive_file_id: null,
      drive_modified_time: null
    };

    const hasCloudTarget = (
      status.mode === 'GOOGLE_SERVICE_ACCOUNT'
      || status.mode === 'GOOGLE_OAUTH_API'
      || status.is_oauth_connected
      || status.has_cloud_credentials
    ) && Boolean(targetDriveRootId);

    if (!hasCloudTarget) return baseResult;

    try {
      const accessToken = await this.getValidAccessToken();
      if (!accessToken) {
        throw createDriveOperationError('DRIVE_AUTH_UNAVAILABLE', 'AUTH');
      }

      // Ensure Hierarchical Folders exist on Google Drive: [Root] ➔ [Category] ➔ [Article Folder]
      const categoryFolderId = await this.getOrCreateCloudFolder(targetDriveRootId, subfolderName, accessToken);
      const articleFolderId = await this.getOrCreateCloudFolder(categoryFolderId, post.slug, accessToken);

      const cloudFileId = post.drive_file_id
        ? String(post.drive_file_id).replace(/^gdrive_/, '')
        : null;

      // A. If file already exists on Drive ➔ update only; never create a replacement on PATCH failure.
      if (cloudFileId && !cloudFileId.startsWith('drive_file_')) {
        const revalidation = await fetchDriveFileMetadata(cloudFileId, accessToken, {
          code: 'DRIVE_FILE_REVALIDATION_FAILED',
          stage: 'FILE_REVALIDATION'
        });
        const currentEtag = revalidation.etag;
        if (!currentEtag) {
          throw createDriveOperationError('DRIVE_FILE_ETAG_MISSING', 'FILE_REVALIDATION');
        }
        const currentMetadata = revalidation.metadata;
        if (post.drive_modified_time && currentMetadata?.modifiedTime
          && new Date(post.drive_modified_time).toISOString() !== new Date(currentMetadata.modifiedTime).toISOString()) {
          throw createDriveOperationError('DRIVE_FILE_CHANGED_SINCE_SYNC', 'FILE_REVALIDATION');
        }

        const updateUrl = new URL(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(cloudFileId)}`);
        updateUrl.searchParams.set('uploadType', 'media');
        updateUrl.searchParams.set('supportsAllDrives', 'true');
        updateUrl.searchParams.set('fields', 'id,modifiedTime');
        const updateResponse = await driveFetch(updateUrl, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'text/markdown',
            'If-Match': currentEtag
          },
          body: markdownContent
        });

        if (updateResponse.status === 412) {
          throw await createDriveHttpError(
            'DRIVE_FILE_CHANGED_SINCE_READ',
            'FILE_UPDATE',
            updateResponse
          );
        }
        if (!updateResponse.ok) {
          throw await createDriveHttpError('DRIVE_FILE_UPDATE_FAILED', 'FILE_UPDATE', updateResponse);
        }
        let updatedMetadata = null;
        try {
          updatedMetadata = await updateResponse.json();
        } catch {
          // A successful media update may legally return no JSON body.
        }
        if (!updatedMetadata?.modifiedTime) {
          const reloaded = await fetchDriveFileMetadata(cloudFileId, accessToken, {
            code: 'DRIVE_FILE_METADATA_RELOAD_FAILED',
            stage: 'FILE_METADATA_RELOAD'
          });
          updatedMetadata = { ...updatedMetadata, ...reloaded.metadata };
        }
        if (!updatedMetadata?.modifiedTime) {
          throw createDriveOperationError(
            'DRIVE_FILE_MODIFIED_TIME_MISSING',
            'FILE_METADATA_RELOAD'
          );
        }
        const updatedFileId = updatedMetadata?.id || cloudFileId;
        logger.success(`[DRIVE_CLOUD_EXPORT] Updated file on Google Drive: ${fileName} in folder ${subfolderName}/${post.slug} (ID: ${updatedFileId})`);
        return {
          ...baseResult,
          cloud_written: true,
          drive_file_id: `gdrive_${updatedFileId}`,
          drive_modified_time: updatedMetadata.modifiedTime
        };
      }

      // B. A new Drive source requires both metadata creation and content upload to succeed.
      const metadataCreateUrl = new URL('https://www.googleapis.com/drive/v3/files');
      metadataCreateUrl.searchParams.set('supportsAllDrives', 'true');
      metadataCreateUrl.searchParams.set('fields', 'id,modifiedTime');
      const metadataResponse = await driveFetch(metadataCreateUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: fileName,
          parents: [articleFolderId],
          mimeType: 'text/markdown'
        })
      });

      if (!metadataResponse.ok) {
        throw await createDriveHttpError(
          'DRIVE_FILE_METADATA_CREATE_FAILED',
          'FILE_METADATA_CREATE',
          metadataResponse
        );
      }
      const createdMetadata = await metadataResponse.json();
      if (!createdMetadata?.id) {
        throw createDriveOperationError(
          'DRIVE_FILE_METADATA_CREATE_INVALID_RESPONSE',
          'FILE_METADATA_CREATE'
        );
      }
      const uploadUrl = new URL(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(createdMetadata.id)}`);
      uploadUrl.searchParams.set('uploadType', 'media');
      uploadUrl.searchParams.set('supportsAllDrives', 'true');
      uploadUrl.searchParams.set('fields', 'id,modifiedTime');
      const uploadResponse = await driveFetch(uploadUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'text/markdown'
        },
        body: markdownContent
      });

      if (!uploadResponse.ok) {
        const uploadError = await createDriveHttpError(
          'DRIVE_FILE_CONTENT_UPLOAD_FAILED',
          'FILE_CONTENT_UPLOAD',
          uploadResponse
        );
        const cleanupUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(createdMetadata.id)}`);
        cleanupUrl.searchParams.set('supportsAllDrives', 'true');
        try {
          const cleanupResponse = await driveFetch(cleanupUrl, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (cleanupResponse.ok || cleanupResponse.status === 404) {
            uploadError.cleanup = {
              attempted: true,
              succeeded: true,
              http_status: cleanupResponse.status
            };
          } else {
            uploadError.cleanup = {
              attempted: true,
              succeeded: false,
              code: 'DRIVE_ORPHAN_CLEANUP_FAILED',
              http_status: cleanupResponse.status,
              detail: String(await readDriveError(cleanupResponse)).slice(0, 500)
            };
            logger.warn('[DRIVE_ORPHAN_CLEANUP_FAILED]', {
              fileId: createdMetadata.id,
              status: cleanupResponse.status
            });
          }
        } catch (cleanupError) {
          uploadError.cleanup = {
            attempted: true,
            succeeded: false,
            code: 'DRIVE_ORPHAN_CLEANUP_FAILED',
            http_status: null,
            detail: String(cleanupError?.message || 'Cleanup request failed').slice(0, 500)
          };
          logger.warn('[DRIVE_ORPHAN_CLEANUP_FAILED]', {
            fileId: createdMetadata.id,
            status: null
          });
        }
        throw uploadError;
      }

      let uploadedMetadata = null;
      try {
        uploadedMetadata = await uploadResponse.json();
      } catch {
        // A successful media upload may legally return no JSON body.
      }
      if (!uploadedMetadata?.modifiedTime) {
        const reloaded = await fetchDriveFileMetadata(createdMetadata.id, accessToken, {
          code: 'DRIVE_FILE_METADATA_RELOAD_FAILED',
          stage: 'FILE_METADATA_RELOAD'
        });
        uploadedMetadata = { ...uploadedMetadata, ...reloaded.metadata };
      }
      if (!uploadedMetadata?.modifiedTime) {
        throw createDriveOperationError(
          'DRIVE_FILE_MODIFIED_TIME_MISSING',
          'FILE_METADATA_RELOAD'
        );
      }

      logger.success(`[DRIVE_CLOUD_EXPORT] Created new file on Google Drive: ${subfolderName}/${post.slug}/${fileName} (ID: ${createdMetadata.id})`);
      return {
        ...baseResult,
        cloud_written: true,
        drive_file_id: `gdrive_${createdMetadata.id}`,
        drive_modified_time: uploadedMetadata.modifiedTime
      };
    } catch (cloudError) {
      logger.error('[DRIVE_CLOUD_EXPORT_ERROR]', cloudError);
      if (cloudError?.code) throw cloudError;
      throw createDriveOperationError('DRIVE_EXPORT_FAILED', 'EXPORT', cloudError?.message);
    }
  },


  async resolveDriveShortcut(item, folderPath, accessToken) {
    const targetId = item?.shortcutDetails?.targetId;
    if (!targetId) {
      return {
        error: createDriveIssue({
          code: 'DRIVE_SHORTCUT_TARGET_MISSING',
          stage: 'SHORTCUT_RESOLVE',
          message: 'Shortcut does not expose a target file ID.',
          folderPath,
          fileId: item?.id,
          fileName: item?.name
        })
      };
    }

    const metadataUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(targetId)}`);
    metadataUrl.searchParams.set(
      'fields',
      'id,name,mimeType,modifiedTime,size,version,md5Checksum,trashed'
    );
    metadataUrl.searchParams.set('supportsAllDrives', 'true');

    try {
      const response = await driveFetch(metadataUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!response.ok) {
        return {
          error: createDriveIssue({
            code: 'DRIVE_SHORTCUT_RESOLVE_FAILED',
            stage: 'SHORTCUT_RESOLVE',
            message: await readDriveError(response),
            folderPath,
            fileId: targetId,
            fileName: item.name,
            status: response.status
          })
        };
      }

      const target = await response.json();
      return {
        item: {
          ...target,
          id: target.id || targetId,
          mimeType: target.mimeType || item.shortcutDetails.targetMimeType
        },
        shortcutName: item.name
      };
    } catch (error) {
      return {
        error: createDriveIssue({
          code: 'DRIVE_SHORTCUT_RESOLVE_FAILED',
          stage: 'SHORTCUT_RESOLVE',
          message: error.message,
          folderPath,
          fileId: targetId,
          fileName: item.name
        })
      };
    }
  },

  async downloadDriveDocument(item, folderPath, accessToken, { allowEmpty = false } = {}) {
    const declaredSize = Number(item.size);
    if (Number.isFinite(declaredSize) && declaredSize > MAX_DRIVE_DOCUMENT_BYTES) {
      return {
        skipped: createDriveIssue({
          code: 'DRIVE_FILE_TOO_LARGE',
          stage: 'SIZE_CHECK',
          message: `Document exceeds the ${MAX_DRIVE_DOCUMENT_BYTES} byte limit.`,
          folderPath,
          fileId: item.id,
          fileName: item.name
        })
      };
    }

    const warnings = [];
    let content;
    let etag = null;

    if (item.mimeType === GOOGLE_DOC_MIME) {
      const exportFormats = ['text/markdown', 'text/plain'];
      for (const [index, exportMime] of exportFormats.entries()) {
        const exportUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}/export`);
        exportUrl.searchParams.set('mimeType', exportMime);

        try {
          const response = await driveFetch(exportUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          if (response.ok) {
            const downloaded = await readTextResponseWithLimit(response);
            if (downloaded.tooLarge) {
              return {
                warnings,
                skipped: createDriveIssue({
                  code: 'DRIVE_FILE_TOO_LARGE',
                  stage: 'SIZE_CHECK',
                  message: `Downloaded document exceeds the ${MAX_DRIVE_DOCUMENT_BYTES} byte limit.`,
                  folderPath,
                  fileId: item.id,
                  fileName: item.name
                })
              };
            }
            content = downloaded.text;
            etag = response.headers?.get?.('etag') || null;
            break;
          }

          const message = await readDriveError(response);
          if (index === 0) {
            warnings.push(createDriveIssue({
              code: 'GOOGLE_DOC_MARKDOWN_EXPORT_FALLBACK',
              stage: 'DOWNLOAD',
              message,
              folderPath,
              fileId: item.id,
              fileName: item.name,
              status: response.status,
              recovered: true
            }));
          } else {
            return {
              warnings,
              error: createDriveIssue({
                code: 'GOOGLE_DOC_EXPORT_FAILED',
                stage: 'DOWNLOAD',
                message,
                folderPath,
                fileId: item.id,
                fileName: item.name,
                status: response.status
              })
            };
          }
        } catch (error) {
          if (index === 0) {
            warnings.push(createDriveIssue({
              code: 'GOOGLE_DOC_MARKDOWN_EXPORT_FALLBACK',
              stage: 'DOWNLOAD',
              message: error.message,
              folderPath,
              fileId: item.id,
              fileName: item.name,
              recovered: true
            }));
          } else {
            return {
              warnings,
              error: createDriveIssue({
                code: 'GOOGLE_DOC_EXPORT_FAILED',
                stage: 'DOWNLOAD',
                message: error.message,
                folderPath,
                fileId: item.id,
                fileName: item.name
              })
            };
          }
        }
      }
    } else {
      const downloadUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}`);
      downloadUrl.searchParams.set('alt', 'media');
      downloadUrl.searchParams.set('supportsAllDrives', 'true');
      try {
        const response = await driveFetch(downloadUrl, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) {
          return {
            error: createDriveIssue({
              code: 'DRIVE_DOWNLOAD_FAILED',
              stage: 'DOWNLOAD',
              message: await readDriveError(response),
              folderPath,
              fileId: item.id,
              fileName: item.name,
              status: response.status
            })
          };
        }
        const downloaded = await readTextResponseWithLimit(response);
        if (downloaded.tooLarge) {
          return {
            skipped: createDriveIssue({
              code: 'DRIVE_FILE_TOO_LARGE',
              stage: 'SIZE_CHECK',
              message: `Downloaded document exceeds the ${MAX_DRIVE_DOCUMENT_BYTES} byte limit.`,
              folderPath,
              fileId: item.id,
              fileName: item.name
            })
          };
        }
        content = downloaded.text;
        etag = response.headers?.get?.('etag') || null;
      } catch (error) {
        return {
          error: createDriveIssue({
            code: 'DRIVE_DOWNLOAD_FAILED',
            stage: 'DOWNLOAD',
            message: error.message,
            folderPath,
            fileId: item.id,
            fileName: item.name
          })
        };
      }
    }

    const downloadedBytes = Buffer.byteLength(content ?? '', 'utf8');
    if (downloadedBytes > MAX_DRIVE_DOCUMENT_BYTES || (content?.length || 0) > MAX_DRIVE_DOCUMENT_BYTES) {
      return {
        warnings,
        skipped: createDriveIssue({
          code: 'DRIVE_FILE_TOO_LARGE',
          stage: 'SIZE_CHECK',
          message: `Downloaded document exceeds the ${MAX_DRIVE_DOCUMENT_BYTES} byte limit.`,
          folderPath,
          fileId: item.id,
          fileName: item.name
        })
      };
    }

    if (!allowEmpty && !(content ?? '').trim()) {
      const emptyIssue = createDriveIssue({
        code: 'DRIVE_FILE_EMPTY',
        stage: 'CONTENT_VALIDATION',
        message: 'Drive document is empty or whitespace-only and cannot be synchronized safely.',
        folderPath,
        fileId: item.id,
        fileName: item.name,
        cloudBytes: downloadedBytes
      });
      return { warnings, error: emptyIssue, skipped: emptyIssue };
    }

    return { content: content ?? '', warnings, etag };
  },

  /**
   * Recursively crawl every page of a Google Drive folder without aborting
   * healthy siblings when one child cannot be listed or downloaded.
   */
  async crawlCloudFolder(folderId, folderPath, accessToken, {
    visitedFolderIds = new Set(),
    allowEmpty = false
  } = {}) {
    const report = {
      documents: [],
      errors: [],
      warnings: [],
      skipped: [],
      pages: 0,
      listed: 0
    };

    if (!folderId || !accessToken) {
      report.errors.push(createDriveIssue({
        code: 'DRIVE_CRAWL_CONFIGURATION_INVALID',
        stage: 'LIST',
        message: 'Folder ID and access token are required.',
        folderId,
        folderPath
      }));
      return report;
    }

    if (visitedFolderIds.has(folderId)) {
      report.skipped.push(createDriveIssue({
        code: 'DRIVE_FOLDER_ALREADY_VISITED',
        stage: 'RECURSION_GUARD',
        message: 'Folder was skipped because it was already crawled through another path.',
        folderId,
        folderPath
      }));
      return report;
    }
    visitedFolderIds.add(folderId);

    const seenPageTokens = new Set();
    let pageToken = null;

    do {
      const query = `'${folderId}' in parents and trashed = false`;
      const listUrl = new URL('https://www.googleapis.com/drive/v3/files');
      listUrl.searchParams.set('q', query);
      listUrl.searchParams.set(
        'fields',
        'nextPageToken,files(id,name,mimeType,modifiedTime,size,version,md5Checksum,trashed,shortcutDetails(targetId,targetMimeType))'
      );
      listUrl.searchParams.set('pageSize', '1000');
      listUrl.searchParams.set('supportsAllDrives', 'true');
      listUrl.searchParams.set('includeItemsFromAllDrives', 'true');
      listUrl.searchParams.set('spaces', 'drive');
      if (pageToken) listUrl.searchParams.set('pageToken', pageToken);

      let data;
      try {
        const response = await driveFetch(listUrl, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) {
          report.errors.push(createDriveIssue({
            code: 'DRIVE_LIST_FAILED',
            stage: 'LIST',
            message: await readDriveError(response),
            folderId,
            folderPath,
            status: response.status
          }));
          return report;
        }
        data = await response.json();
      } catch (error) {
        report.errors.push(createDriveIssue({
          code: 'DRIVE_LIST_FAILED',
          stage: 'LIST',
          message: error.message,
          folderId,
          folderPath
        }));
        return report;
      }

      report.pages++;
      const pageItems = Array.isArray(data.files) ? data.files : [];
      report.listed += pageItems.length;

      for (const listedItem of pageItems) {
        let item = listedItem;
        let shortcutName = '';
        if (listedItem.mimeType === DRIVE_SHORTCUT_MIME) {
          const shortcut = await this.resolveDriveShortcut(listedItem, folderPath, accessToken);
          if (shortcut.error) {
            report.errors.push(shortcut.error);
            continue;
          }
          item = shortcut.item;
          shortcutName = shortcut.shortcutName;
        }

        if (item.mimeType === DRIVE_FOLDER_MIME) {
          const displayName = shortcutName || item.name;
          const subPath = folderPath ? `${folderPath}/${displayName}` : displayName;
          const childReport = await this.crawlCloudFolder(item.id, subPath, accessToken, {
            visitedFolderIds,
            allowEmpty
          });
          report.documents.push(...childReport.documents);
          report.errors.push(...childReport.errors);
          report.warnings.push(...childReport.warnings);
          report.skipped.push(...childReport.skipped);
          report.pages += childReport.pages;
          report.listed += childReport.listed;
          continue;
        }

        if (!isMarkdownLikeFile(item, shortcutName)) {
          report.skipped.push(createDriveIssue({
            code: 'DRIVE_UNSUPPORTED_FILE_TYPE',
            stage: 'FILTER',
            message: `Unsupported Drive MIME type: ${item.mimeType || 'unknown'}`,
            folderPath,
            fileId: item.id,
            fileName: item.name || shortcutName
          }));
          continue;
        }

        const downloaded = await this.downloadDriveDocument(item, folderPath, accessToken, { allowEmpty });
        if (downloaded.warnings) report.warnings.push(...downloaded.warnings);
        if (downloaded.error) {
          report.errors.push(downloaded.error);
          if (downloaded.skipped) report.skipped.push(downloaded.skipped);
          continue;
        }
        if (downloaded.skipped) {
          report.skipped.push(downloaded.skipped);
          continue;
        }

        report.documents.push({
          fileName: item.name || shortcutName,
          folderPath: folderPath || '',
          rawContent: downloaded.content,
          modifiedTime: item.modifiedTime || null,
          fileId: `gdrive_${item.id}`,
          mimeType: item.mimeType,
          size: Buffer.byteLength(downloaded.content, 'utf8'),
          version: item.version === undefined || item.version === null ? null : String(item.version),
          md5Checksum: item.md5Checksum || null,
          trashed: Boolean(item.trashed),
          etag: downloaded.etag || null,
          shortcut: Boolean(shortcutName)
        });
      }

      const nextPageToken = typeof data.nextPageToken === 'string' && data.nextPageToken
        ? data.nextPageToken
        : null;
      if (nextPageToken && seenPageTokens.has(nextPageToken)) {
        report.errors.push(createDriveIssue({
          code: 'DRIVE_PAGINATION_LOOP',
          stage: 'LIST',
          message: 'Drive returned a repeated nextPageToken.',
          folderId,
          folderPath
        }));
        return report;
      }
      if (nextPageToken) seenPageTokens.add(nextPageToken);
      pageToken = nextPageToken;
    } while (pageToken);

    return report;
  },

  async crawlCloudSourceWithTokenFallback(
    { folderId, folderPath },
    tokenCandidates,
    { allowEmpty = false } = {}
  ) {
    if (!Array.isArray(tokenCandidates) || tokenCandidates.length === 0) {
      return {
        documents: [],
        errors: [createDriveIssue({
          code: 'DRIVE_AUTH_UNAVAILABLE',
          stage: 'AUTH',
          message: 'No Google Drive access token is available.',
          folderId,
          folderPath
        })],
        warnings: [],
        skipped: [],
        pages: 0,
        listed: 0,
        authMode: null
      };
    }

    const isSourceAccessDenied = issue => (
      [403, 404].includes(issue?.http_status)
      && ['LIST', 'SHORTCUT_RESOLVE', 'DOWNLOAD', 'EXPORT'].includes(issue?.stage)
    );
    let serviceAccountFailure = null;
    let serviceAccountDeniedIssue = null;
    let resolvedCandidateCount = 0;
    for (const candidate of tokenCandidates) {
      let accessToken = candidate.token || null;
      if (!accessToken && typeof candidate.getToken === 'function') {
        try {
          accessToken = await candidate.getToken();
        } catch (error) {
          logger.error(`[DRIVE_AUTH] ${candidate.mode} token resolution failed`, error);
        }
      }
      if (!accessToken) continue;
      candidate.token = accessToken;
      resolvedCandidateCount++;

      const report = allowEmpty
        ? await this.crawlCloudFolder(folderId, folderPath, accessToken, { allowEmpty: true })
        : await this.crawlCloudFolder(folderId, folderPath, accessToken);
      report.errors = report.errors.map(issue => ({ ...issue, auth_mode: candidate.mode }));
      report.warnings = report.warnings.map(issue => ({ ...issue, auth_mode: candidate.mode }));
      report.skipped = report.skipped.map(issue => ({ ...issue, auth_mode: candidate.mode }));
      report.authMode = candidate.mode;

      const accessDeniedIssue = [...report.errors, ...report.warnings].find(isSourceAccessDenied);
      const canRetryAsOAuth = candidate.mode === 'SERVICE_ACCOUNT'
        && Boolean(accessDeniedIssue)
        && tokenCandidates.some(nextCandidate => nextCandidate.mode === 'OAUTH_USER');

      if (canRetryAsOAuth) {
        serviceAccountFailure = report;
        serviceAccountDeniedIssue = accessDeniedIssue;
        continue;
      }

      if (candidate.mode === 'OAUTH_USER' && serviceAccountFailure) {
        const oauthAccessDenied = [...report.errors, ...report.warnings].some(isSourceAccessDenied);
        report.warnings.unshift(createDriveIssue({
          code: 'DRIVE_AUTH_FALLBACK_USED',
          stage: 'AUTH',
          message: 'Service account access was denied during the source crawl; the complete source was retried with OAuth user access.',
          folderId,
          folderPath,
          status: serviceAccountDeniedIssue?.http_status,
          recovered: !oauthAccessDenied,
          authMode: 'OAUTH_USER'
        }));
        if (oauthAccessDenied) {
          report.errors.unshift(...serviceAccountFailure.errors);
        }
      }
      return report;
    }

    if (serviceAccountFailure) {
      serviceAccountFailure.errors.push(createDriveIssue({
        code: 'DRIVE_OAUTH_FALLBACK_UNAVAILABLE',
        stage: 'AUTH',
        message: 'OAuth fallback was configured but no OAuth access token could be resolved.',
        folderId,
        folderPath,
        recovered: false,
        authMode: 'OAUTH_USER'
      }));
      return serviceAccountFailure;
    }

    return {
      documents: [],
      errors: [createDriveIssue({
        code: 'DRIVE_AUTH_UNAVAILABLE',
        stage: 'AUTH',
        message: resolvedCandidateCount === 0
          ? 'Configured Google Drive credentials did not yield an access token.'
          : 'No Google Drive access token is available.',
        folderId,
        folderPath
      })],
      warnings: [],
      skipped: [],
      pages: 0,
      listed: 0,
      authMode: null
    };
  },

  /**
   * Recursive Local Directory Crawler
   */
  crawlLocalFolder(dirPath, relativePrefix = '') {
    let documents = [];
    if (!fs.existsSync(dirPath)) return documents;

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        const subPrefix = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
        documents = documents.concat(this.crawlLocalFolder(fullPath, subPrefix));
      } else if (MARKDOWN_FILE_PATTERN.test(entry.name)) {
        const rawContent = fs.readFileSync(fullPath, 'utf-8');
        const fileStat = fs.statSync(fullPath);
        const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
        documents.push({
          fileName: entry.name,
          folderPath: relativePrefix || '',
          rawContent,
          modifiedTime: fileStat.mtime.toISOString(),
          fileId: createLocalSourceId(relativePath)
        });
      }
    }
    return documents;
  },

  async repairEmptyCloudDocumentFromLocal(cloudDocument, localContent, accessToken) {
    const issueContext = {
      folderPath: cloudDocument?.folderPath,
      fileId: cloudDocument?.fileId,
      fileName: cloudDocument?.fileName,
      documentKey: normalizeRepairDocumentKey(cloudDocument?.folderPath, cloudDocument?.fileName)
    };
    const cloudMimeType = String(cloudDocument?.mimeType || '').toLowerCase();
    if (cloudDocument?.shortcut) {
      return {
        error: createDriveIssue({
          code: 'DRIVE_REPAIR_SHORTCUT_UNSUPPORTED',
          stage: 'REPAIR_PREFLIGHT',
          message: 'Shortcut-backed files are not eligible for automatic content repair.',
          ...issueContext
        })
      };
    }
    if (cloudMimeType === GOOGLE_DOC_MIME || !MARKDOWN_MIME_TYPES.has(cloudMimeType)) {
      return {
        error: createDriveIssue({
          code: 'DRIVE_REPAIR_MIME_UNSUPPORTED',
          stage: 'REPAIR_PREFLIGHT',
          message: 'Only regular Markdown-like Drive files are eligible for automatic content repair.',
          ...issueContext
        })
      };
    }

    const sourceId = String(cloudDocument?.fileId || '');
    if (!sourceId.startsWith('gdrive_') || sourceId.length <= 'gdrive_'.length || !accessToken) {
      return {
        error: createDriveIssue({
          code: 'DRIVE_REPAIR_CONFIGURATION_INVALID',
          stage: 'REPAIR_PREFLIGHT',
          message: 'A stable Google Drive file identity and access token are required for repair.',
          ...issueContext
        })
      };
    }
    const driveFileId = sourceId.slice('gdrive_'.length);

    const readRepairMetadata = async () => {
      try {
        return await fetchDriveFileMetadata(driveFileId, accessToken, {
          code: 'DRIVE_REPAIR_METADATA_READ_FAILED',
          stage: 'REPAIR_REVALIDATION',
          fields: DRIVE_REPAIR_METADATA_FIELDS
        });
      } catch (error) {
        return {
          error: createDriveIssue({
            code: error?.code || 'DRIVE_REPAIR_METADATA_READ_FAILED',
            stage: 'REPAIR_REVALIDATION',
            message: error?.detail || error?.message,
            status: error?.http_status,
            ...issueContext
          })
        };
      }
    };

    const initialMetadataResult = await readRepairMetadata();
    if (initialMetadataResult.error) return { error: initialMetadataResult.error };
    const initialMetadata = normalizeRepairMetadataSnapshot(initialMetadataResult.metadata);
    const previewMetadata = normalizeRepairMetadataSnapshot({
      ...cloudDocument,
      id: driveFileId
    });
    if (!previewMetadata.version || !initialMetadata.version) {
      return {
        error: createDriveIssue({
          code: 'DRIVE_FILE_VERSION_MISSING',
          stage: 'REPAIR_REVALIDATION',
          message: 'Drive did not provide the monotonic file version required for safe repair.',
          ...issueContext
        })
      };
    }
    if (!repairMetadataSnapshotsEqual(previewMetadata, initialMetadata)
      || initialMetadata.id !== driveFileId
      || initialMetadata.trashed
      || !MARKDOWN_MIME_TYPES.has(initialMetadata.mimeType)) {
      return {
        error: createDriveIssue({
          code: 'CLOUD_CHANGED_SINCE_PREVIEW',
          stage: 'REPAIR_REVALIDATION',
          message: 'Drive metadata changed after inventory discovery; repair was refused.',
          ...issueContext
        })
      };
    }

    const verifyUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFileId)}`);
    verifyUrl.searchParams.set('alt', 'media');
    verifyUrl.searchParams.set('supportsAllDrives', 'true');

    let verifyResponse;
    try {
      verifyResponse = await driveFetch(verifyUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
    } catch (error) {
      return {
        error: createDriveIssue({
          code: 'DRIVE_REPAIR_REVALIDATION_FAILED',
          stage: 'REPAIR_REVALIDATION',
          message: error.message,
          ...issueContext
        })
      };
    }
    if (!verifyResponse.ok) {
      return {
        error: createDriveIssue({
          code: 'DRIVE_REPAIR_REVALIDATION_FAILED',
          stage: 'REPAIR_REVALIDATION',
          message: await readDriveError(verifyResponse),
          status: verifyResponse.status,
          ...issueContext
        })
      };
    }

    let verifiedDownload;
    try {
      verifiedDownload = await readTextResponseWithLimit(verifyResponse);
    } catch (error) {
      return {
        error: createDriveIssue({
          code: 'DRIVE_REPAIR_REVALIDATION_FAILED',
          stage: 'REPAIR_REVALIDATION',
          message: error.message,
          ...issueContext
        })
      };
    }
    if (verifiedDownload.tooLarge) {
      return {
        error: createDriveIssue({
          code: 'DRIVE_REPAIR_CLOUD_FILE_TOO_LARGE',
          stage: 'REPAIR_REVALIDATION',
          message: `The current cloud file exceeds ${MAX_DRIVE_DOCUMENT_BYTES} bytes.`,
          cloudBytes: verifiedDownload.bytes,
          ...issueContext
        })
      };
    }

    const cloudBytes = Buffer.byteLength(verifiedDownload.text, 'utf8');
    if (verifiedDownload.text.trim()) {
      return {
        error: createDriveIssue({
          code: 'CLOUD_CHANGED_SINCE_PREVIEW',
          stage: 'REPAIR_REVALIDATION',
          message: 'The cloud file changed or is no longer empty; repair was refused.',
          cloudBytes,
          ...issueContext
        })
      };
    }

    // Drive API v3 does not document ETag/If-Match for files.update. Re-read
    // the documented monotonic version and the full content fingerprint as
    // close to PATCH as possible. If Drive supplies an ETag, retain the atomic
    // HTTP precondition as an additional guard.
    const finalMetadataResult = await readRepairMetadata();
    if (finalMetadataResult.error) return { error: finalMetadataResult.error };
    const finalMetadata = normalizeRepairMetadataSnapshot(finalMetadataResult.metadata);
    if (!finalMetadata.version) {
      return {
        error: createDriveIssue({
          code: 'DRIVE_FILE_VERSION_MISSING',
          stage: 'REPAIR_REVALIDATION',
          message: 'Drive did not provide the monotonic file version required for safe repair.',
          cloudBytes,
          ...issueContext
        })
      };
    }
    const initialEtag = initialMetadataResult.etag || null;
    const finalEtag = finalMetadataResult.etag || null;
    if (!repairMetadataSnapshotsEqual(initialMetadata, finalMetadata)
      || (initialEtag && finalEtag && initialEtag !== finalEtag)) {
      return {
        error: createDriveIssue({
          code: 'CLOUD_CHANGED_SINCE_PREVIEW',
          stage: 'REPAIR_REVALIDATION',
          message: 'Drive metadata changed while the empty content was being verified; repair was refused.',
          cloudBytes,
          ...issueContext
        })
      };
    }
    const currentEtag = finalEtag || initialEtag;

    const updateUrl = new URL(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(driveFileId)}`);
    updateUrl.searchParams.set('uploadType', 'media');
    updateUrl.searchParams.set('supportsAllDrives', 'true');
    const updateHeaders = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'text/markdown; charset=utf-8'
    };
    if (currentEtag) updateHeaders['If-Match'] = currentEtag;

    let updateResponse;
    try {
      updateResponse = await driveFetch(updateUrl, {
        method: 'PATCH',
        headers: updateHeaders,
        body: localContent
      });
    } catch (error) {
      return {
        error: createDriveIssue({
          code: 'DRIVE_REPAIR_PATCH_FAILED',
          stage: 'REPAIR_PATCH',
          message: error.message,
          cloudBytes,
          ...issueContext
        })
      };
    }
    if (updateResponse.status === 412) {
      return {
        error: createDriveIssue({
          code: 'CLOUD_CHANGED_SINCE_PREVIEW',
          stage: 'REPAIR_PATCH',
          message: 'Drive rejected the repair because the file changed after revalidation.',
          status: updateResponse.status,
          cloudBytes,
          ...issueContext
        })
      };
    }
    if (!updateResponse.ok) {
      return {
        error: createDriveIssue({
          code: 'DRIVE_REPAIR_PATCH_FAILED',
          stage: 'REPAIR_PATCH',
          message: await readDriveError(updateResponse),
          status: updateResponse.status,
          cloudBytes,
          ...issueContext
        })
      };
    }

    return {
      repaired: true,
      cloudBytes,
      etagUsed: Boolean(currentEtag),
      versionUsed: true,
      preconditionWarning: currentEtag ? null : createDriveIssue({
        code: 'DRIVE_REPAIR_VERSION_RECHECK_USED',
        stage: 'REPAIR_PATCH',
        message: 'Drive supplied no ETag; two matching monotonic-version metadata snapshots guarded the write.',
        recovered: true,
        ...issueContext
      })
    };
  },

  async repairEmptyCloudFilesFromLocal({ dryRun = true } = {}) {
    const status = this.getStatus();
    const isCloudMode = status.mode === 'GOOGLE_SERVICE_ACCOUNT' || status.mode === 'GOOGLE_OAUTH_API';
    const results = {
      operation: 'REPAIR_EMPTY_CLOUD_FILES_FROM_LOCAL',
      mode: status.mode,
      dry_run: Boolean(dryRun),
      discovered: 0,
      cloud_discovered: 0,
      local_discovered: 0,
      empty_cloud: 0,
      nonempty_cloud: 0,
      matched: 0,
      eligible: 0,
      would_repair: 0,
      repaired: 0,
      processed: 0,
      skipped_count: 0,
      errors: [],
      warnings: [],
      skipped: [],
      sources: [],
      files: []
    };

    if (status.mode === 'CONFIGURATION_ERROR' || status.configuration_errors?.length > 0) {
      results.errors.push(...(status.configuration_errors || [createDriveIssue({
        code: 'DRIVE_CONFIGURATION_INVALID',
        stage: 'CONFIGURATION',
        message: 'Google Drive repair configuration is invalid.'
      })]));
      return results;
    }
    if (!isCloudMode) {
      results.errors.push(createDriveIssue({
        code: 'DRIVE_REPAIR_CLOUD_REQUIRED',
        stage: 'CONFIGURATION',
        message: 'Empty-file repair requires a configured Google Drive source.'
      }));
      return results;
    }

    const tokenCandidates = await this.getAccessTokenCandidates({
      persistOAuthTokens: !dryRun,
      lazyOAuth: true
    });
    const cloudSources = [];
    const knowledgeFolderId = status.drive_knowledge_folder_id || status.drive_folder_id;
    if (knowledgeFolderId) {
      cloudSources.push({ name: 'knowledge', folderId: knowledgeFolderId, folderPath: 'knowledge' });
    }
    if (status.drive_blog_folder_id) {
      cloudSources.push({ name: 'blog', folderId: status.drive_blog_folder_id, folderPath: 'blog' });
    }
    if (cloudSources.length === 0) {
      results.errors.push(createDriveIssue({
        code: 'DRIVE_FOLDER_NOT_CONFIGURED',
        stage: 'CONFIGURATION',
        message: 'No Drive folder is configured for empty-file repair.'
      }));
      return results;
    }

    const cloudDocuments = [];
    const cloudAuthModes = new Map();
    const successfullyCrawledRoots = new Set();
    for (const source of cloudSources) {
      let sourceReport;
      try {
        sourceReport = await this.crawlCloudSourceWithTokenFallback(source, tokenCandidates, {
          allowEmpty: true
        });
      } catch (error) {
        sourceReport = {
          documents: [],
          errors: [createDriveIssue({
            code: 'DRIVE_SOURCE_CRAWL_FAILED',
            stage: 'LIST',
            message: error.message,
            folderId: source.folderId,
            folderPath: source.folderPath
          })],
          warnings: [],
          skipped: [],
          pages: 0,
          listed: 0,
          authMode: null
        };
      }
      cloudDocuments.push(...sourceReport.documents);
      for (const document of sourceReport.documents) {
        cloudAuthModes.set(document.fileId, sourceReport.authMode);
      }
      results.errors.push(...sourceReport.errors);
      results.warnings.push(...sourceReport.warnings);
      results.skipped.push(...sourceReport.skipped);
      if (sourceReport.errors.length === 0) successfullyCrawledRoots.add(source.folderPath);
      results.sources.push({
        name: source.name,
        folder_id: source.folderId,
        auth_mode: sourceReport.authMode,
        pages: sourceReport.pages,
        listed: sourceReport.listed,
        documents: sourceReport.documents.length,
        errors: sourceReport.errors.length,
        skipped: sourceReport.skipped.length
      });
    }

    let localDocuments = [];
    try {
      const fallbackContentPaths = status.knowledge_vault_dir && status.blog_vault_dir
        ? null
        : resolveContentPaths();
      const localKnowledgeDir = status.knowledge_vault_dir || fallbackContentPaths.knowledgeDir;
      const localBlogDir = status.blog_vault_dir || fallbackContentPaths.blogDir;
      localDocuments = [
        ...this.crawlLocalFolder(localKnowledgeDir, 'knowledge'),
        ...this.crawlLocalFolder(localBlogDir, 'blog')
      ];
    } catch (error) {
      results.errors.push(createDriveIssue({
        code: 'LOCAL_DIRECTORY_SCAN_FAILED',
        stage: 'LOCAL_INVENTORY',
        message: error.message
      }));
      return results;
    }

    results.cloud_discovered = cloudDocuments.length;
    results.local_discovered = localDocuments.length;
    results.discovered = cloudDocuments.length;
    for (const skippedIssue of results.skipped) {
      results.files.push({
        file: skippedIssue.file,
        folder: skippedIssue.folder,
        file_id: skippedIssue.file_id,
        status: 'SKIPPED',
        reason: skippedIssue.code
      });
    }

    const groupByDocumentKey = documents => {
      const grouped = new Map();
      for (const document of documents) {
        const key = normalizeRepairDocumentKey(document.folderPath, document.fileName);
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(document);
      }
      return grouped;
    };
    const cloudByKey = groupByDocumentKey(cloudDocuments);
    const localByKey = groupByDocumentKey(localDocuments);
    const cloudSourceIdCounts = new Map();
    for (const document of cloudDocuments) {
      const sourceId = String(document.fileId || '');
      cloudSourceIdCounts.set(sourceId, (cloudSourceIdCounts.get(sourceId) || 0) + 1);
    }

    const addRefusal = (issue, document, statusName = 'SKIPPED') => {
      results.errors.push(issue);
      results.skipped.push(issue);
      results.files.push({
        file: document?.fileName || issue.file,
        folder: document?.folderPath || issue.folder,
        file_id: document?.fileId || issue.file_id,
        document_key: issue.document_key,
        status: statusName,
        reason: issue.code
      });
    };

    const resolveCandidateToken = async candidate => {
      if (!candidate) return null;
      if (candidate.token) return candidate.token;
      if (typeof candidate.getToken !== 'function') return null;
      try {
        const token = await candidate.getToken();
        if (token) candidate.token = token;
        return token || null;
      } catch {
        return null;
      }
    };

    for (const cloudDocument of cloudDocuments) {
      const documentKey = normalizeRepairDocumentKey(cloudDocument.folderPath, cloudDocument.fileName);
      const cloudMatches = cloudByKey.get(documentKey) || [];
      const localMatches = localByKey.get(documentKey) || [];
      const sourceIdCount = cloudSourceIdCounts.get(String(cloudDocument.fileId || '')) || 0;
      if (cloudMatches.length !== 1 || sourceIdCount !== 1) {
        addRefusal(createDriveIssue({
          code: 'REPAIR_MATCH_AMBIGUOUS',
          stage: 'REPAIR_MATCH',
          message: 'The cloud document path or file identity is not unique in the incoming inventory.',
          folderPath: cloudDocument.folderPath,
          fileId: cloudDocument.fileId,
          fileName: cloudDocument.fileName,
          documentKey,
          ambiguityReason: cloudMatches.length !== 1
            ? 'MULTIPLE_CLOUD_PATH_MATCHES'
            : 'DUPLICATE_CLOUD_FILE_ID'
        }), cloudDocument);
        continue;
      }
      if (localMatches.length === 0) {
        addRefusal(createDriveIssue({
          code: 'LOCAL_FILE_NOT_FOUND',
          stage: 'REPAIR_MATCH',
          message: 'No local document has the exact normalized relative path required for repair.',
          folderPath: cloudDocument.folderPath,
          fileId: cloudDocument.fileId,
          fileName: cloudDocument.fileName,
          documentKey
        }), cloudDocument);
        continue;
      }
      if (localMatches.length !== 1) {
        addRefusal(createDriveIssue({
          code: 'REPAIR_MATCH_AMBIGUOUS',
          stage: 'REPAIR_MATCH',
          message: 'More than one local document claims the exact repair path.',
          folderPath: cloudDocument.folderPath,
          fileId: cloudDocument.fileId,
          fileName: cloudDocument.fileName,
          documentKey,
          ambiguityReason: 'MULTIPLE_LOCAL_PATH_MATCHES'
        }), cloudDocument);
        continue;
      }

      results.matched++;
      const localDocument = localMatches[0];
      if (String(cloudDocument.rawContent || '').trim()) {
        results.nonempty_cloud++;
        const nonemptyIssue = createDriveIssue({
          code: 'CLOUD_FILE_NONEMPTY',
          stage: 'REPAIR_PREFLIGHT',
          message: 'The cloud file is non-empty and will never be overwritten by the repair operation.',
          folderPath: cloudDocument.folderPath,
          fileId: cloudDocument.fileId,
          fileName: cloudDocument.fileName,
          documentKey,
          cloudBytes: Buffer.byteLength(String(cloudDocument.rawContent || ''), 'utf8'),
          recovered: true
        });
        results.warnings.push(nonemptyIssue);
        results.skipped.push(nonemptyIssue);
        results.files.push({
          file: cloudDocument.fileName,
          folder: cloudDocument.folderPath,
          file_id: cloudDocument.fileId,
          document_key: documentKey,
          status: 'SKIPPED',
          reason: nonemptyIssue.code
        });
        continue;
      }
      results.empty_cloud++;

      const localValidation = validateLocalRepairDocument(localDocument);
      if (!localValidation.valid) {
        addRefusal(createDriveIssue({
          code: 'LOCAL_CONTENT_INVALID',
          stage: 'LOCAL_VALIDATION',
          message: localValidation.message,
          folderPath: localDocument.folderPath,
          fileName: localDocument.fileName,
          documentKey,
          validationReason: localValidation.reason,
          localBytes: localValidation.localBytes,
          localSha256: localValidation.localSha256
        }), cloudDocument);
        continue;
      }

      if (cloudDocument.shortcut || cloudDocument.mimeType === GOOGLE_DOC_MIME
        || !MARKDOWN_MIME_TYPES.has(String(cloudDocument.mimeType || '').toLowerCase())) {
        addRefusal(createDriveIssue({
          code: cloudDocument.shortcut
            ? 'DRIVE_REPAIR_SHORTCUT_UNSUPPORTED'
            : 'DRIVE_REPAIR_MIME_UNSUPPORTED',
          stage: 'REPAIR_PREFLIGHT',
          message: 'Only direct regular Markdown-like Drive files are eligible for repair.',
          folderPath: cloudDocument.folderPath,
          fileId: cloudDocument.fileId,
          fileName: cloudDocument.fileName,
          documentKey
        }), cloudDocument);
        continue;
      }

      results.eligible++;
      if (dryRun) {
        results.would_repair++;
        results.processed++;
        results.files.push({
          file: cloudDocument.fileName,
          folder: cloudDocument.folderPath,
          file_id: cloudDocument.fileId,
          document_key: documentKey,
          local_bytes: localValidation.localBytes,
          local_sha256: localValidation.localSha256,
          cloud_bytes: Number(cloudDocument.size) || 0,
          status: 'WOULD_REPAIR'
        });
        continue;
      }

      const preferredMode = cloudAuthModes.get(cloudDocument.fileId);
      const preferredCandidate = tokenCandidates.find(candidate => candidate.mode === preferredMode);
      const orderedCandidates = [
        ...(preferredCandidate ? [preferredCandidate] : tokenCandidates),
        ...(preferredMode === 'SERVICE_ACCOUNT'
          ? tokenCandidates.filter(candidate => candidate.mode === 'OAUTH_USER')
          : [])
      ].filter((candidate, index, candidates) => (
        candidate && candidates.indexOf(candidate) === index
      ));
      let repairResult = null;
      let repairMode = null;
      for (const candidate of orderedCandidates) {
        const accessToken = await resolveCandidateToken(candidate);
        if (!accessToken) continue;
        repairResult = await this.repairEmptyCloudDocumentFromLocal(
          cloudDocument,
          localDocument.rawContent,
          accessToken
        );
        repairMode = candidate.mode;
        if (repairResult.repaired) break;
        const retryableAccessFailure = candidate.mode === 'SERVICE_ACCOUNT'
          && [403, 404].includes(repairResult.error?.http_status)
          && orderedCandidates.some(nextCandidate => nextCandidate.mode === 'OAUTH_USER');
        if (!retryableAccessFailure) break;
      }

      if (repairResult?.repaired) {
        results.repaired++;
        results.processed++;
        if (repairResult.preconditionWarning) {
          results.warnings.push(repairResult.preconditionWarning);
        }
        if (repairMode !== preferredMode) {
          results.warnings.push(createDriveIssue({
            code: 'DRIVE_AUTH_FALLBACK_USED',
            stage: 'AUTH',
            message: 'The empty-file repair used OAuth after service-account write access was denied.',
            folderPath: cloudDocument.folderPath,
            fileId: cloudDocument.fileId,
            fileName: cloudDocument.fileName,
            recovered: true,
            authMode: repairMode
          }));
        }
        results.files.push({
          file: cloudDocument.fileName,
          folder: cloudDocument.folderPath,
          file_id: cloudDocument.fileId,
          document_key: documentKey,
          local_bytes: localValidation.localBytes,
          local_sha256: localValidation.localSha256,
          cloud_bytes: repairResult.cloudBytes,
          etag_precondition_used: repairResult.etagUsed,
          version_precondition_used: repairResult.versionUsed,
          auth_mode: repairMode,
          status: 'REPAIRED'
        });
      } else {
        const repairIssue = repairResult?.error || createDriveIssue({
          code: 'DRIVE_AUTH_UNAVAILABLE',
          stage: 'AUTH',
          message: 'No access token could be resolved for the repair write.',
          folderPath: cloudDocument.folderPath,
          fileId: cloudDocument.fileId,
          fileName: cloudDocument.fileName,
          documentKey
        });
        addRefusal(repairIssue, cloudDocument, 'FAILED');
      }
    }

    for (const [documentKey, localMatches] of localByKey) {
      if (cloudByKey.has(documentKey)) continue;
      const root = String(localMatches[0]?.folderPath || '').split(/[/\\]/).filter(Boolean)[0];
      if (!successfullyCrawledRoots.has(root)) continue;
      const localDocument = localMatches[0];
      addRefusal(createDriveIssue({
        code: 'CLOUD_FILE_NOT_FOUND',
        stage: 'REPAIR_MATCH',
        message: 'The local inventory contains a document with no exact cloud path match; repair will not create it.',
        folderPath: localDocument.folderPath,
        fileName: localDocument.fileName,
        documentKey
      }), localDocument);
    }

    results.skipped_count = results.files.filter(file => (
      file.status === 'SKIPPED' || file.status === 'FAILED'
    )).length;
    return results;
  },

  /**
   * Pull Drive/local documents into the database. Drive writes are opt-in via
   * pushFirst; the safe default is a read-only cloud crawl followed by DB upsert.
   */
  async syncAll(actor = 'DRIVE_SYNC_OPERATOR', { pushFirst = false, dryRun = false } = {}) {
    const status = this.getStatus();
    const isCloudMode = status.mode === 'GOOGLE_SERVICE_ACCOUNT' || status.mode === 'GOOGLE_OAUTH_API';
    const results = {
      mode: status.mode,
      source_of_truth: status.source_of_truth
        || (isCloudMode ? 'GOOGLE_DRIVE_CLOUD' : 'LOCAL_DRIVE_MIRROR'),
      dry_run: Boolean(dryRun),
      discovered: 0,
      processed: 0,
      synced: 0,
      updated: 0,
      created: 0,
      reslugged: 0,
      adopted: 0,
      skipped_count: 0,
      errors: [],
      warnings: [],
      skipped: [],
      collisions: [],
      sources: [],
      files: []
    };

    logger.info(`[DRIVE_SYNC] Initiating ${dryRun ? 'dry-run ' : ''}synchronization mode: ${status.mode}`);

    if (status.mode === 'CONFIGURATION_ERROR' || status.configuration_errors?.length > 0) {
      results.errors.push(...(status.configuration_errors || [createDriveIssue({
        code: 'DRIVE_CONFIGURATION_INVALID',
        stage: 'CONFIGURATION',
        message: 'Google Drive synchronization configuration is invalid.'
      })]));
      logger.error('[DRIVE_SYNC] Configuration errors prevent reconciliation', {
        codes: results.errors.map(issue => issue.code)
      });
      return results;
    }

    if (pushFirst && dryRun) {
      results.warnings.push(createDriveIssue({
        code: 'DRIVE_PUSH_SKIPPED_DRY_RUN',
        stage: 'PUSH',
        message: 'Drive push was skipped because dryRun forbids writes.',
        recovered: true
      }));
    } else if (pushFirst) {
      results.errors.push(createDriveIssue({
        code: 'DRIVE_PUSH_UNSUPPORTED',
        stage: 'PUSH',
        message: 'Generic recursive Drive push is disabled; use the strict targeted repair or single-post export path.'
      }));
    }

    let documentsToProcess = [];
    if (isCloudMode) {
      const tokenCandidates = await this.getAccessTokenCandidates({
        persistOAuthTokens: !dryRun,
        lazyOAuth: true
      });
      const cloudSources = [];
      const knowledgeFolderId = status.drive_knowledge_folder_id || status.drive_folder_id;
      if (knowledgeFolderId) {
        cloudSources.push({ name: 'knowledge', folderId: knowledgeFolderId, folderPath: 'knowledge' });
      }
      if (status.drive_blog_folder_id) {
        cloudSources.push({ name: 'blog', folderId: status.drive_blog_folder_id, folderPath: 'blog' });
      }

      for (const source of cloudSources) {
        let sourceReport;
        try {
          sourceReport = await this.crawlCloudSourceWithTokenFallback(source, tokenCandidates);
        } catch (error) {
          logger.error(`[DRIVE_SYNC] Cloud source failed: ${source.name}`, error);
          sourceReport = {
            documents: [],
            errors: [createDriveIssue({
              code: 'DRIVE_SOURCE_CRAWL_FAILED',
              stage: 'LIST',
              message: error.message,
              folderId: source.folderId,
              folderPath: source.folderPath
            })],
            warnings: [],
            skipped: [],
            pages: 0,
            listed: 0,
            authMode: null
          };
        }
        documentsToProcess.push(...sourceReport.documents);
        results.errors.push(...sourceReport.errors);
        results.warnings.push(...sourceReport.warnings);
        results.skipped.push(...sourceReport.skipped);
        results.sources.push({
          name: source.name,
          folder_id: source.folderId,
          auth_mode: sourceReport.authMode,
          pages: sourceReport.pages,
          listed: sourceReport.listed,
          documents: sourceReport.documents.length,
          errors: sourceReport.errors.length,
          skipped: sourceReport.skipped.length
        });
      }

      if (cloudSources.length === 0) {
        results.errors.push(createDriveIssue({
          code: 'DRIVE_FOLDER_NOT_CONFIGURED',
          stage: 'CONFIGURATION',
          message: 'No Drive folder is configured for cloud synchronization.'
        }));
      }
    } else {
      try {
        const fallbackContentPaths = status.knowledge_vault_dir && status.blog_vault_dir
          ? null
          : resolveContentPaths();
        const knowledgeDir = status.knowledge_vault_dir || fallbackContentPaths.knowledgeDir;
        const blogDir = status.blog_vault_dir || fallbackContentPaths.blogDir;
        const knowledgeDocs = this.crawlLocalFolder(knowledgeDir, 'knowledge');
        const blogDocs = this.crawlLocalFolder(blogDir, 'blog');
        documentsToProcess = [...knowledgeDocs, ...blogDocs];
        results.sources.push({ name: 'knowledge', folder: knowledgeDir, documents: knowledgeDocs.length });
        results.sources.push({ name: 'blog', folder: blogDir, documents: blogDocs.length });
      } catch (error) {
        logger.error('[DRIVE_SYNC_ERROR] Directory scan failed', error);
        results.errors.push(createDriveIssue({
          code: 'LOCAL_DIRECTORY_SCAN_FAILED',
          stage: 'LIST',
          message: error.message
        }));
      }
    }

    results.discovered = documentsToProcess.length + results.skipped.filter(issue => (
      issue.file || issue.file_id
    )).length;

    for (const skipped of results.skipped) {
      results.files.push({
        file: skipped.file,
        folder: skipped.folder,
        file_id: skipped.file_id,
        status: 'SKIPPED',
        reason: skipped.code
      });
    }

    const processedSourceIds = new Set();
    const slugOverrides = new Map();
    const lookupSlugOwner = slug => (
      slugOverrides.has(slug)
        ? slugOverrides.get(slug)
        : dbService.getBlogPostBySlug(slug, { publishedOnly: false })
    );
    const sameRecord = (left, right) => Boolean(left && right && (
      (left.id !== undefined && right.id !== undefined && String(left.id) === String(right.id))
      || (left.drive_file_id && right.drive_file_id && left.drive_file_id === right.drive_file_id)
    ));
    const hasCloudDocuments = documentsToProcess.some(document => (
      String(document.fileId || '').trim().startsWith('gdrive_')
    ));
    let legacyInventoryAvailable = true;
    let legacyInventoryHasRows = false;
    let legacyIdentityPlan = new Map();
    if (hasCloudDocuments) {
      try {
        const contentInventory = dbService.getBlogPosts({
          publishedOnly: false,
          visibility: 'all',
          contentType: 'all'
        });
        legacyInventoryHasRows = contentInventory.some(post => (
          String(post?.drive_file_id || '').startsWith('drive_file_')
        ));
        legacyIdentityPlan = buildLegacyIdentityPlan(documentsToProcess, contentInventory);
      } catch (error) {
        legacyInventoryAvailable = false;
        results.errors.push(createDriveIssue({
          code: 'LEGACY_SOURCE_INVENTORY_FAILED',
          stage: 'IDENTITY_INVENTORY',
          message: error.message
        }));
      }
    }

    for (const doc of documentsToProcess) {
      const sourceId = String(doc.fileId || '').trim();
      if (!sourceId || processedSourceIds.has(sourceId)) {
        const duplicateIssue = createDriveIssue({
          code: sourceId ? 'DUPLICATE_DRIVE_SOURCE' : 'SOURCE_ID_MISSING',
          stage: 'IDENTITY',
          message: sourceId
            ? 'The same Drive source was discovered through more than one path.'
            : 'Document has no stable source identifier.',
          folderPath: doc.folderPath,
          fileId: sourceId || null,
          fileName: doc.fileName
        });
        results.skipped.push(duplicateIssue);
        results.files.push({
          file: doc.fileName,
          folder: doc.folderPath,
          file_id: sourceId || null,
          status: 'SKIPPED',
          reason: duplicateIssue.code
        });
        continue;
      }
      processedSourceIds.add(sourceId);

      if (sourceId.startsWith('gdrive_') && !legacyInventoryAvailable) {
        const inventoryIssue = createDriveIssue({
          code: 'LEGACY_SOURCE_INVENTORY_UNAVAILABLE',
          stage: 'IDENTITY_INVENTORY',
          message: 'Cloud reconciliation was skipped because the legacy identity inventory could not be loaded.',
          folderPath: doc.folderPath,
          fileId: sourceId,
          fileName: doc.fileName
        });
        results.skipped.push(inventoryIssue);
        results.files.push({
          file: doc.fileName,
          folder: doc.folderPath,
          file_id: sourceId,
          status: 'SKIPPED',
          reason: inventoryIssue.code
        });
        continue;
      }

      try {
        const { metadata, content } = parseFrontmatter(doc.rawContent);
        const defaultContentType = doc.folderPath?.toLowerCase().includes('blog') ? 'blog' : 'knowledge';
        const content_type = String(metadata.content_type || defaultContentType).trim().toLowerCase();
        if (content_type !== 'blog' && content_type !== 'knowledge') {
          throw new Error('INVALID_CONTENT_TYPE');
        }

        let folderCategory = '';
        let articleFolder = '';
        if (doc.folderPath) {
          const parts = doc.folderPath
            .split(/[/\\]/)
            .filter(part => part && part !== 'blog' && part !== 'knowledge');
          if (parts.length >= 2) {
            [folderCategory, articleFolder] = parts;
          } else if (parts.length === 1) {
            [folderCategory] = parts;
          }
        }

        const baseFileName = doc.fileName.replace(/\.(?:md|markdown|txt)$/i, '');
        const isGenericName = ['index', 'readme', 'content', 'cikk', 'post'].includes(baseFileName.toLowerCase());
        const title = String(metadata.title || (
          isGenericName && articleFolder
            ? articleFolder.replace(/[-_]/g, ' ')
            : baseFileName.replace(/[-_]/g, ' ')
        ) || 'Untitled document');
        const hasMetadataSlug = Object.prototype.hasOwnProperty.call(metadata, 'slug');
        const rawMetadataSlug = hasMetadataSlug ? String(metadata.slug ?? '') : null;
        const requestedSlug = canonicalizeSlug(hasMetadataSlug ? rawMetadataSlug : (
          isGenericName && articleFolder ? articleFolder : baseFileName
        )) || `document-${stableSlugSuffix(sourceId).slice(0, 8)}`;
        if (hasMetadataSlug && rawMetadataSlug !== requestedSlug) {
          results.warnings.push(createDriveIssue({
            code: 'SLUG_NORMALIZED',
            stage: 'IDENTITY',
            message: 'Frontmatter slug was normalized to a canonical URL slug.',
            folderPath: doc.folderPath,
            fileId: sourceId,
            fileName: doc.fileName,
            requestedRaw: rawMetadataSlug,
            resolved: requestedSlug
          }));
        }
        const summaryText = content.slice(0, 200).replace(/^[#\s*`>]+/, '').trim();
        const summary = String(metadata.summary || (summaryText ? `${summaryText}...` : 'Üres Markdown dokumentum.'));
        const category = String(metadata.category || folderCategory || (content_type === 'blog' ? 'BLOG' : 'TUDÁSTÁR'));
        const project_id = String(metadata.project_id || 'prj_rag_enterprise');
        const visibility = metadata.visibility === 'private' ? 'private' : 'public';
        const audio_url = String(metadata.audio_url || '');
        const video_url = String(metadata.video_url || '');
        const read_time = String(metadata.read_time || '4 PERC');
        const hasDimensionsObject = metadata.dimensions
          && typeof metadata.dimensions === 'object'
          && !Array.isArray(metadata.dimensions);
        const dimensions = hasDimensionsObject ? metadata.dimensions : {
          iparag: Array.isArray(metadata.iparag) ? metadata.iparag : ['Gyártás'],
          technologia: Array.isArray(metadata.technologia) ? metadata.technologia : ['Python'],
          celcsoport: Array.isArray(metadata.celcsoport) ? metadata.celcsoport : ['COO / Operatív Vezető']
        };

        let existingPost = dbService.getBlogPostByDriveFileId(sourceId);
        let adoptedSeed = false;
        let legacySourceAdopted = false;
        const identityPlan = sourceId.startsWith('gdrive_')
          ? legacyIdentityPlan.get(sourceId)
          : null;
        if (!existingPost && identityPlan?.status === 'adopt') {
          const legacyIdentityOwner = identityPlan.owner;
          existingPost = legacyIdentityOwner;
          adoptedSeed = true;
          legacySourceAdopted = true;
          results.adopted++;
          results.warnings.push(createDriveIssue({
            code: 'LEGACY_SOURCE_ID_ADOPTED',
            stage: 'IDENTITY',
            message: 'A unique legacy inventory identity was adopted as the Google Drive source identity.',
            folderPath: doc.folderPath,
            fileId: sourceId,
            fileName: doc.fileName,
            recovered: true,
            previousSourceId: identityPlan.legacySourceId,
            legacySourceId: identityPlan.legacySourceId,
            matchStrategy: identityPlan.strategy
          }));

          const mismatchFields = [];
          if (String(legacyIdentityOwner.slug || '') !== requestedSlug) mismatchFields.push('slug');
          if (normalizeIdentityText(legacyIdentityOwner.title) !== normalizeIdentityText(title)) {
            mismatchFields.push('title');
          }
          if (String(legacyIdentityOwner.content_type || 'blog').trim().toLowerCase() !== content_type) {
            mismatchFields.push('content_type');
          }
          if (mismatchFields.length > 0) {
            results.warnings.push(createDriveIssue({
              code: 'LEGACY_SOURCE_METADATA_MISMATCH',
              stage: 'IDENTITY_SANITY_CHECK',
              message: 'The legacy inventory identity matched, but selected metadata fields differ and will be reconciled.',
              folderPath: doc.folderPath,
              fileId: sourceId,
              fileName: doc.fileName,
              recovered: true,
              previousSourceId: identityPlan.legacySourceId,
              legacySourceId: identityPlan.legacySourceId,
              mismatchFields,
              matchStrategy: identityPlan.strategy
            }));
          }
        } else if (!existingPost && identityPlan?.status === 'ambiguous') {
          results.warnings.push(createDriveIssue({
            code: 'LEGACY_SOURCE_ID_AMBIGUOUS',
            stage: 'IDENTITY_INVENTORY',
            message: 'Legacy identity adoption was refused because the candidate is not one-to-one across the DB and incoming inventory.',
            folderPath: doc.folderPath,
            fileId: sourceId,
            fileName: doc.fileName,
            recovered: false,
            legacySourceId: identityPlan.candidateSourceIds?.length === 1
              ? identityPlan.candidateSourceIds[0]
              : null,
            matchStrategy: identityPlan.strategy,
            ambiguityReason: identityPlan.reason,
            candidateSourceIds: identityPlan.candidateSourceIds || []
          }));
        } else if (!existingPost && identityPlan?.status === 'candidate') {
          results.warnings.push(createDriveIssue({
            code: 'LEGACY_SOURCE_ID_CANDIDATE',
            stage: 'IDENTITY_INVENTORY',
            message: 'A unique basename candidate exists, but basename evidence alone is insufficient for automatic adoption.',
            folderPath: doc.folderPath,
            fileId: sourceId,
            fileName: doc.fileName,
            recovered: false,
            legacySourceId: identityPlan.legacySourceId,
            matchStrategy: identityPlan.strategy,
            ambiguityReason: identityPlan.reason,
            candidateSourceIds: [identityPlan.legacySourceId]
          }));
        } else if (!existingPost && identityPlan?.status === 'not_found' && legacyInventoryHasRows) {
          results.warnings.push(createDriveIssue({
            code: 'LEGACY_SOURCE_ID_NOT_FOUND',
            stage: 'IDENTITY_INVENTORY',
            message: 'No exact or unique-basename legacy identity candidate was found; the document remains a new Drive source.',
            folderPath: doc.folderPath,
            fileId: sourceId,
            fileName: doc.fileName,
            recovered: false,
            matchStrategy: identityPlan.strategy,
            ambiguityReason: identityPlan.reason
          }));
        }

        const requestedSlugOwner = lookupSlugOwner(requestedSlug);
        if (!existingPost && requestedSlugOwner?.drive_file_id === sourceId) {
          existingPost = requestedSlugOwner;
        }
        if (!existingPost && requestedSlugOwner) {
          const previousSourceId = String(requestedSlugOwner.drive_file_id || '').trim();
          const exactLegacyLocalSourceId = deriveLegacyLocalSourceId(doc.folderPath, doc.fileName);
          const hasAdoptableSourceId = !previousSourceId
            || (!sourceId.startsWith('gdrive_') && previousSourceId === exactLegacyLocalSourceId);
          const canAdoptSeed = hasAdoptableSourceId
            && String(requestedSlugOwner.content_type || 'blog').trim().toLowerCase() === content_type
            && normalizeIdentityText(requestedSlugOwner.title) === normalizeIdentityText(title);
          if (canAdoptSeed) {
            existingPost = requestedSlugOwner;
            adoptedSeed = true;
            results.adopted++;
            if (previousSourceId.startsWith('drive_file_')) {
              results.warnings.push(createDriveIssue({
                code: 'LOCAL_SOURCE_ID_UPGRADED',
                stage: 'IDENTITY',
                message: 'A matching legacy local source identity was upgraded to the stable path-hash format.',
                folderPath: doc.folderPath,
                fileId: sourceId,
                fileName: doc.fileName,
                recovered: true,
                previousSourceId
              }));
            }
          }
        }

        let resolvedSlug = requestedSlug;
        let collision = null;
        const slugOwnerIsIncomingSource = requestedSlugOwner && (
          sameRecord(requestedSlugOwner, existingPost)
          || requestedSlugOwner.drive_file_id === sourceId
        );
        if (requestedSlugOwner && !slugOwnerIsIncomingSource) {
          const suffix = stableSlugSuffix(sourceId);
          let foundAvailableSlug = false;
          for (const suffixLength of [8, 12, 16, 24, 32, 64]) {
            const candidate = appendStableSlugSuffix(requestedSlug, suffix.slice(0, suffixLength));
            const candidateOwner = lookupSlugOwner(candidate);
            if (!candidateOwner || sameRecord(candidateOwner, existingPost) || candidateOwner.drive_file_id === sourceId) {
              resolvedSlug = candidate;
              foundAvailableSlug = true;
              break;
            }
          }
          if (!foundAvailableSlug) {
            let collisionIndex = 2;
            resolvedSlug = appendStableSlugSuffix(requestedSlug, `${suffix}-${collisionIndex}`);
            while (lookupSlugOwner(resolvedSlug)) {
              collisionIndex++;
              resolvedSlug = appendStableSlugSuffix(requestedSlug, `${suffix}-${collisionIndex}`);
            }
          }
          collision = {
            code: 'SLUG_COLLISION',
            file: doc.fileName,
            folder: doc.folderPath,
            incoming_file_id: sourceId,
            existing_file_id: requestedSlugOwner.drive_file_id || null,
            existing_post_id: requestedSlugOwner.id || null,
            requested_slug: requestedSlug,
            resolved_slug: resolvedSlug
          };
          results.collisions.push(collision);
          results.reslugged++;
        }

        let isPublished = 0;
        if (metadata.published !== undefined) {
          isPublished = metadata.published === true || metadata.published === 1 ? 1 : 0;
        } else if (metadata.status === 'published' || metadata.status === 'ACTIVE') {
          isPublished = 1;
        } else if (existingPost) {
          isPublished = existingPost.published;
        }

        const postData = {
          project_id,
          content_type,
          slug: resolvedSlug,
          title,
          summary,
          content: content === '' ? '\n' : content,
          category,
          dimensions,
          visibility,
          audio_url,
          video_url,
          drive_file_id: sourceId,
          drive_modified_time: doc.modifiedTime || '',
          read_time,
          published: isPublished
        };

        let fileStatus;
        let resultingPost;
        if (dryRun) {
          if (collision) fileStatus = 'WOULD_RESLUG';
          else fileStatus = existingPost ? 'WOULD_UPDATE' : 'WOULD_CREATE';
          resultingPost = {
            ...(existingPost || {}),
            id: existingPost?.id || `dry-run:${sourceId}`,
            ...postData
          };
        } else if (existingPost) {
          resultingPost = dbService.updateBlogPost(existingPost.id, postData, actor);
          fileStatus = 'UPDATED';
        } else {
          resultingPost = dbService.createBlogPost(postData, actor);
          fileStatus = 'CREATED';
        }

        if (existingPost) results.updated++;
        else results.created++;
        results.synced++;
        results.processed++;

        if (existingPost?.slug && existingPost.slug !== resolvedSlug) {
          slugOverrides.set(existingPost.slug, null);
        }
        slugOverrides.set(resolvedSlug, resultingPost);

        results.files.push({
          file: doc.fileName,
          folder: doc.folderPath,
          file_id: sourceId,
          slug: resolvedSlug,
          requested_slug: requestedSlug,
          published: Boolean(isPublished),
          empty: content === '',
          adopted_seed: adoptedSeed,
          legacy_source_adopted: legacySourceAdopted,
          collision: collision?.code || null,
          status: fileStatus
        });
      } catch (error) {
        logger.error(`[DRIVE_SYNC_ERROR] Error syncing file: ${doc.fileName}`, error);
        const validationCodes = new Set([
          'INVALID_FRONTMATTER_YAML',
          'INVALID_FRONTMATTER_ROOT',
          'INVALID_CONTENT_TYPE'
        ]);
        const issueCode = validationCodes.has(error.message) ? error.message : 'DOCUMENT_SYNC_FAILED';
        const issue = createDriveIssue({
          code: issueCode,
          stage: error.message?.startsWith('INVALID_FRONTMATTER')
            ? 'PARSE'
            : (error.message === 'INVALID_CONTENT_TYPE' ? 'VALIDATION' : 'UPSERT'),
          message: error.message,
          folderPath: doc.folderPath,
          fileId: sourceId,
          fileName: doc.fileName
        });
        results.errors.push(issue);
        results.skipped.push(issue);
        results.files.push({
          file: doc.fileName,
          folder: doc.folderPath,
          file_id: sourceId,
          status: 'SKIPPED',
          reason: issue.code
        });
      }
    }

    results.skipped_count = results.files.filter(file => file.status === 'SKIPPED').length;
    logger.success(`[DRIVE_SYNC_SUCCESS] ${dryRun ? 'Analyzed' : 'Synchronized'} ${results.synced} documents (${results.created} new, ${results.updated} updated, ${results.reslugged} re-slugged)`);
    return results;
  }
};
