import fs from 'node:fs';
import path from 'node:path';

const MANIFEST_FILE = '.ca-assets.json';
const MAX_MANIFEST_BYTES = 256 * 1024;
const ASSET_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,119}$/i;
const SAFE_RELATIVE_PATH = /^(?![\\/])(?!(?:[A-Za-z]:))(?:(?!\.\.(?:[\\/]|$))[^\\/]+(?:[\\/]|$))+$/;
const ASSET_KINDS = new Set([
  'cad', 'model', 'drawing', 'image', 'video', 'audio', 'pdf', 'spreadsheet',
  'document', 'dataset', 'repository', 'issue', 'dashboard', 'url', 'other'
]);
const VISIBILITIES = new Set(['public', 'private']);
const SENSITIVE_QUERY_KEYS = /(?:token|secret|signature|sig|code|credential|password|key)/i;

function assetError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function asText(value, { max = 240, fallback = '' } = {}) {
  const text = String(value ?? fallback).trim();
  return text.slice(0, max);
}

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function normalizeRelativePath(value, field = 'path') {
  const raw = asText(value, { max: 700 });
  if (!raw || !SAFE_RELATIVE_PATH.test(raw)) {
    throw assetError('VAULT_ASSET_RELATIVE_PATH_INVALID', { field, value: raw });
  }
  const normalized = raw.replace(/\\/g, '/').replace(/\/+/g, '/');
  if (normalized.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw assetError('VAULT_ASSET_RELATIVE_PATH_INVALID', { field, value: raw });
  }
  return normalized;
}

function normalizeExternalUri(value, field = 'uri') {
  let parsed;
  try {
    parsed = new URL(asText(value, { max: 2_000 }));
  } catch {
    throw assetError('VAULT_ASSET_URI_INVALID', { field });
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw assetError('VAULT_ASSET_URI_INVALID', { field });
  }
  for (const key of parsed.searchParams.keys()) {
    if (SENSITIVE_QUERY_KEYS.test(key)) throw assetError('VAULT_ASSET_URI_SENSITIVE_QUERY', { field, key });
  }
  return parsed.toString();
}

function inferProvider(uri) {
  const hostname = new URL(uri).hostname.toLowerCase();
  if (hostname === 'github.com' || hostname.endsWith('.github.com')) return 'github';
  if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com') || hostname === 'youtu.be') return 'youtube';
  if (hostname === 'drive.google.com' || hostname.endsWith('.googleusercontent.com')) return 'google-drive';
  return 'web';
}

function normalizeProvider(value, uri) {
  const provider = asText(value || inferProvider(uri), { max: 40 }).toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(provider)) throw assetError('VAULT_ASSET_PROVIDER_INVALID');
  return provider;
}

function normalizeId(value, index) {
  const id = asText(value, { max: 120 });
  if (!ASSET_ID_PATTERN.test(id)) throw assetError('VAULT_ASSET_ID_INVALID', { index, id });
  return id;
}

function isWithin(candidatePath, parentPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function normalizeManifestAsset(rawAsset, { index, documentDirectory }) {
  if (!isPlainObject(rawAsset)) throw assetError('VAULT_ASSET_INVALID', { index });
  const id = normalizeId(rawAsset.id || rawAsset.file_id, index);
  const source_kind = rawAsset.source === 'local' ? 'local' : 'external';
  const asset_kind = asText(rawAsset.kind || 'other', { max: 40 }).toLowerCase();
  if (!ASSET_KINDS.has(asset_kind)) throw assetError('VAULT_ASSET_KIND_INVALID', { index, asset_kind });
  const visibility = asText(rawAsset.visibility || 'private', { max: 20 }).toLowerCase();
  if (!VISIBILITIES.has(visibility)) throw assetError('VAULT_ASSET_VISIBILITY_INVALID', { index, visibility });
  const title = asText(rawAsset.title || id, { max: 240 }) || id;
  const mime_type = asText(rawAsset.mime_type, { max: 120 });
  const dependencyIds = rawAsset.depends_on === undefined ? [] : rawAsset.depends_on;
  if (!Array.isArray(dependencyIds) || dependencyIds.some(item => !ASSET_ID_PATTERN.test(asText(item, { max: 120 })))) {
    throw assetError('VAULT_ASSET_DEPENDENCIES_INVALID', { index });
  }

  if (source_kind === 'external') {
    const uri = normalizeExternalUri(rawAsset.uri);
    return {
      provider: normalizeProvider(rawAsset.provider, uri),
      file_id: id,
      uri,
      mime_type,
      title,
      asset_kind,
      source_kind,
      preview_uri: rawAsset.preview_uri ? normalizeExternalUri(rawAsset.preview_uri, 'preview_uri') : '',
      visibility,
      availability: 'available',
      metadata: { depends_on: [...new Set(dependencyIds.map(item => String(item).trim()))] }
    };
  }

  const relative_path = normalizeRelativePath(rawAsset.path, 'path');
  const absolutePath = path.resolve(documentDirectory, relative_path);
  if (!isWithin(absolutePath, documentDirectory)) {
    throw assetError('VAULT_ASSET_ESCAPES_DOCUMENT_FOLDER', { index, relative_path });
  }
  let availability = 'missing';
  try {
    const stats = fs.lstatSync(absolutePath);
    if (stats.isSymbolicLink()) throw assetError('VAULT_ASSET_SYMLINK_FORBIDDEN', { index, relative_path });
    if (stats.isFile()) availability = 'available';
  } catch (error) {
    if (error?.code && error.code !== 'ENOENT') throw error;
  }
  const preview_path = rawAsset.preview ? normalizeRelativePath(rawAsset.preview, 'preview') : '';
  if (preview_path) {
    const previewAbsolute = path.resolve(documentDirectory, preview_path);
    if (!isWithin(previewAbsolute, documentDirectory)) throw assetError('VAULT_ASSET_ESCAPES_DOCUMENT_FOLDER', { index, preview_path });
  }
  const provider = asText(rawAsset.provider || 'vault', { max: 40 }).toLowerCase();
  if (!/^[a-z0-9_-]{1,40}$/.test(provider)) throw assetError('VAULT_ASSET_PROVIDER_INVALID');
  return {
    provider,
    file_id: id,
    uri: `ca-asset://${id}`,
    mime_type,
    title,
    asset_kind,
    source_kind,
    preview_uri: preview_path ? `ca-asset://${id}/preview` : '',
    visibility,
    availability,
    metadata: {
      relative_path,
      preview_path,
      depends_on: [...new Set(dependencyIds.map(item => String(item).trim()))]
    }
  };
}

/**
 * Reads an application-owned sidecar from the same folder as a Markdown
 * document. The JSON is deliberately outside frontmatter: Obsidian therefore
 * never coerces its nested asset/dependency objects into `[object Object]`.
 */
export function readDocumentAssetManifest({ documentFilePath }) {
  const documentDirectory = path.dirname(path.resolve(documentFilePath));
  const manifestPath = path.join(documentDirectory, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return { manifest_path: '', assets: [] };
  const stats = fs.lstatSync(manifestPath);
  if (stats.isSymbolicLink() || !stats.isFile()) throw assetError('VAULT_ASSET_MANIFEST_INVALID_TYPE');
  if (stats.size > MAX_MANIFEST_BYTES) throw assetError('VAULT_ASSET_MANIFEST_TOO_LARGE');

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    throw assetError('VAULT_ASSET_MANIFEST_INVALID_JSON');
  }
  if (!isPlainObject(parsed) || Number(parsed.schema_version) !== 1 || !Array.isArray(parsed.assets)) {
    throw assetError('VAULT_ASSET_MANIFEST_INVALID_SCHEMA');
  }
  const assets = parsed.assets.map((asset, index) => normalizeManifestAsset(asset, { index, documentDirectory }));
  const ids = new Set();
  for (const asset of assets) {
    if (ids.has(asset.file_id)) throw assetError('VAULT_ASSET_ID_DUPLICATE', { id: asset.file_id });
    ids.add(asset.file_id);
  }
  for (const asset of assets) {
    for (const dependencyId of asset.metadata.depends_on) {
      if (!ids.has(dependencyId)) throw assetError('VAULT_ASSET_DEPENDENCY_NOT_FOUND', { asset_id: asset.file_id, dependency_id: dependencyId });
      if (dependencyId === asset.file_id) throw assetError('VAULT_ASSET_DEPENDENCY_SELF_REFERENCE', { asset_id: asset.file_id });
    }
  }
  return { manifest_path: manifestPath, assets };
}

export function resolveLocalVaultAsset({ vaultRoot, sourcePath, asset }) {
  if (!asset || asset.source_kind !== 'local') return null;
  const metadata = isPlainObject(asset.metadata) ? asset.metadata : {};
  const relativePath = normalizeRelativePath(metadata.relative_path, 'metadata.relative_path');
  const documentPath = path.resolve(vaultRoot, String(sourcePath || ''));
  const documentDirectory = path.dirname(documentPath);
  if (!isWithin(documentPath, vaultRoot) || !isWithin(documentDirectory, vaultRoot)) return null;
  const filePath = path.resolve(documentDirectory, relativePath);
  if (!isWithin(filePath, documentDirectory)) return null;
  const stats = fs.lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink()) return null;
  return { filePath, relativePath, stats };
}

export const vaultAssetManifest = {
  MANIFEST_FILE,
  readDocumentAssetManifest,
  resolveLocalVaultAsset
};
