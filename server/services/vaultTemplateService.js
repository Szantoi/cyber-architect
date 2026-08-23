import fs from 'node:fs';
import path from 'node:path';
import { resolveLocalVaultRoot } from './localVaultService.js';
import { resolveDocumentPresentation } from './presentationProfile.js';

const CATALOG_FILENAME = '.ca-template-catalog.json';
const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,79}$/;
const DOCUMENT_ROLE_PATTERN = /^[a-z][a-z0-9_-]{0,79}$/;
const MAX_TEMPLATE_BYTES = 200 * 1024;

function templateError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = details;
  return error;
}

function isWithin(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/**
 * The template catalog belongs to the active canonical Vault, not to the
 * application checkout.  With no explicit content-root configuration,
 * resolveLocalVaultRoot() retains the historical ../CyberArchitect fallback.
 *
 * Resolving this on every service operation is intentional: operational
 * scripts and isolated tests can provide a different Vault before importing
 * or invoking the service, without accidentally writing templates to another
 * workspace's catalog.
 */
export function resolveVaultTemplatePaths(env = process.env) {
  const vaultRoot = resolveLocalVaultRoot(env);
  const templateRoot = path.resolve(vaultRoot, 'ObsidianTemplates');
  if (!isWithin(templateRoot, vaultRoot)) {
    throw templateError('VAULT_TEMPLATE_PATH_INVALID', { vault_root: vaultRoot });
  }
  return {
    vaultRoot,
    templateRoot,
    catalogPath: path.join(templateRoot, CATALOG_FILENAME)
  };
}

function normalizeId(value) {
  const id = String(value || '').trim();
  if (!TEMPLATE_ID_PATTERN.test(id)) throw templateError('VAULT_TEMPLATE_ID_INVALID');
  return id;
}

function normalizeDocumentRole(value) {
  const role = String(value || 'document').trim().toLowerCase();
  if (!DOCUMENT_ROLE_PATTERN.test(role)) throw templateError('VAULT_TEMPLATE_DOCUMENT_ROLE_INVALID');
  return role;
}

function isLegacyPresentationType(value) {
  return ['knowledge', 'blog'].includes(String(value || '').trim().toLowerCase());
}

function normalizeTemplateMeta(template) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) throw templateError('VAULT_TEMPLATE_INVALID');
  const id = normalizeId(template.id);
  const title = String(template.title || '').trim().slice(0, 160);
  if (!title) throw templateError('VAULT_TEMPLATE_TITLE_REQUIRED');
  const icon_key = String(template.icon_key || 'file-text').trim().slice(0, 80);
  if (!/^[a-z][a-z0-9-]*$/.test(icon_key)) throw templateError('VAULT_TEMPLATE_ICON_INVALID');
  const color = String(template.color || '#00FBFB').trim().toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(color)) throw templateError('VAULT_TEMPLATE_COLOR_INVALID');
  const suppliedProfile = String(template.presentation_profile || '').trim();
  const historicalContentType = String(template.content_type || '').trim().toLowerCase();
  let presentation;
  try {
    // v1 catalog entries used `content_type` inconsistently: `knowledge` and
    // `blog` were old portal views, while `project`/`meeting`/`process` were
    // really document roles.  Accept both safely and write the unambiguous v2
    // pair from now on.
    presentation = resolveDocumentPresentation({
      presentationProfile: suppliedProfile || undefined,
      contentType: isLegacyPresentationType(historicalContentType) ? historicalContentType : undefined,
      fallbackProfile: 'knowledge'
    });
  } catch (error) {
    throw templateError('VAULT_TEMPLATE_PRESENTATION_PROFILE_INVALID', { cause: error?.code || error?.message });
  }
  const document_role = normalizeDocumentRole(
    template.document_role || (!suppliedProfile && historicalContentType && !isLegacyPresentationType(historicalContentType)
      ? historicalContentType
      : 'document')
  );
  const project_id = String(template.project_id || '').trim().slice(0, 160);
  if (project_id && !/^[A-Za-z0-9][A-Za-z0-9:._/-]*$/.test(project_id)) throw templateError('VAULT_TEMPLATE_PROJECT_ID_INVALID');
  return {
    id,
    title,
    description: String(template.description || '').trim().slice(0, 1_200),
    icon_key,
    color,
    presentation_profile: presentation.presentation_profile,
    document_role,
    // The old admin payloads and portal integrations can keep reading this
    // temporary projection. New consumers must use presentation_profile.
    content_type: presentation.content_type,
    project_id
  };
}

function assertTemplateBody(value) {
  const body = String(value ?? '');
  if (!body.trim() || Buffer.byteLength(body, 'utf8') > MAX_TEMPLATE_BYTES) throw templateError('VAULT_TEMPLATE_BODY_INVALID');
  return body.replace(/\r\n/g, '\n');
}

function templatePath(id, paths) {
  const filePath = path.resolve(paths.templateRoot, `${normalizeId(id)}.md`);
  if (!isWithin(filePath, paths.templateRoot)) throw templateError('VAULT_TEMPLATE_PATH_INVALID');
  return filePath;
}

function readCatalog(paths) {
  if (!fs.existsSync(paths.catalogPath)) {
    throw templateError('VAULT_TEMPLATE_CATALOG_MISSING', { path: paths.catalogPath });
  }
  const stats = fs.lstatSync(paths.catalogPath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_TEMPLATE_BYTES) throw templateError('VAULT_TEMPLATE_CATALOG_INVALID');
  let catalog;
  try {
    catalog = JSON.parse(fs.readFileSync(paths.catalogPath, 'utf8'));
  } catch {
    throw templateError('VAULT_TEMPLATE_CATALOG_INVALID_JSON');
  }
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog) || ![1, 2].includes(Number(catalog.schema_version)) || !Array.isArray(catalog.templates)) {
    throw templateError('VAULT_TEMPLATE_CATALOG_INVALID_SCHEMA');
  }
  const templates = catalog.templates.map(normalizeTemplateMeta);
  const ids = new Set();
  for (const item of templates) {
    if (ids.has(item.id)) throw templateError('VAULT_TEMPLATE_CATALOG_DUPLICATE_ID', { id: item.id });
    ids.add(item.id);
  }
  return { schema_version: 2, templates };
}

function atomicWrite(filePath, body, paths) {
  if (!isWithin(filePath, paths.templateRoot)) throw templateError('VAULT_TEMPLATE_PATH_INVALID');
  fs.mkdirSync(paths.templateRoot, { recursive: true });
  const temporary = path.join(paths.templateRoot, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(temporary, body, 'utf8');
  fs.renameSync(temporary, filePath);
}

function writeCatalog(catalog, paths) {
  atomicWrite(paths.catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, paths);
}

function readTemplateBody(id, paths) {
  const filePath = templatePath(id, paths);
  if (!fs.existsSync(filePath)) throw templateError('VAULT_TEMPLATE_FILE_MISSING', { id });
  const stats = fs.lstatSync(filePath);
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size > MAX_TEMPLATE_BYTES) throw templateError('VAULT_TEMPLATE_FILE_INVALID', { id });
  return fs.readFileSync(filePath, 'utf8');
}

function withBody(meta, paths) {
  const filePath = templatePath(meta.id, paths);
  const stats = fs.statSync(filePath);
  return {
    ...meta,
    body: readTemplateBody(meta.id, paths),
    updated_at: stats.mtime.toISOString()
  };
}

function listTemplates() {
  const paths = resolveVaultTemplatePaths();
  return readCatalog(paths).templates
    .map(meta => {
      const filePath = templatePath(meta.id, paths);
      const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
      return { ...meta, updated_at: stats?.mtime?.toISOString() || '' };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'hu-HU'));
}

function getTemplate(id, paths = resolveVaultTemplatePaths()) {
  const normalizedId = normalizeId(id);
  const meta = readCatalog(paths).templates.find(item => item.id === normalizedId);
  if (!meta) throw templateError('VAULT_TEMPLATE_NOT_FOUND');
  return withBody(meta, paths);
}

function createTemplate(input) {
  const paths = resolveVaultTemplatePaths();
  const meta = normalizeTemplateMeta(input);
  const body = assertTemplateBody(input.body);
  const catalog = readCatalog(paths);
  if (catalog.templates.some(item => item.id === meta.id)) throw templateError('VAULT_TEMPLATE_ALREADY_EXISTS');
  const filePath = templatePath(meta.id, paths);
  if (fs.existsSync(filePath)) throw templateError('VAULT_TEMPLATE_FILE_ALREADY_EXISTS');
  atomicWrite(filePath, body, paths);
  try {
    writeCatalog({ ...catalog, templates: [...catalog.templates, meta] }, paths);
  } catch (error) {
    try { fs.unlinkSync(filePath); } catch { /* best-effort rollback */ }
    throw error;
  }
  return getTemplate(meta.id, paths);
}

function updateTemplate(id, input) {
  const paths = resolveVaultTemplatePaths();
  const normalizedId = normalizeId(id);
  const catalog = readCatalog(paths);
  const index = catalog.templates.findIndex(item => item.id === normalizedId);
  if (index === -1) throw templateError('VAULT_TEMPLATE_NOT_FOUND');
  const previous = catalog.templates[index];
  const next = normalizeTemplateMeta({ ...previous, ...input, id: normalizedId });
  const filePath = templatePath(normalizedId, paths);
  const previousBody = readTemplateBody(normalizedId, paths);
  const nextBody = input.body === undefined ? previousBody : assertTemplateBody(input.body);
  atomicWrite(filePath, nextBody, paths);
  try {
    const templates = [...catalog.templates];
    templates[index] = next;
    writeCatalog({ ...catalog, templates }, paths);
  } catch (error) {
    atomicWrite(filePath, previousBody, paths);
    throw error;
  }
  return getTemplate(normalizedId, paths);
}

function deleteTemplate(id) {
  const paths = resolveVaultTemplatePaths();
  const normalizedId = normalizeId(id);
  const catalog = readCatalog(paths);
  const meta = catalog.templates.find(item => item.id === normalizedId);
  if (!meta) throw templateError('VAULT_TEMPLATE_NOT_FOUND');
  const filePath = templatePath(normalizedId, paths);
  readTemplateBody(normalizedId, paths);
  const backupPath = path.join(paths.templateRoot, `.${path.basename(filePath)}.${Date.now()}.deleted`);
  fs.renameSync(filePath, backupPath);
  try {
    writeCatalog({ ...catalog, templates: catalog.templates.filter(item => item.id !== normalizedId) }, paths);
  } catch (error) {
    fs.renameSync(backupPath, filePath);
    throw error;
  }
  // The deletion is recoverable from the filesystem only until this final
  // unlink. The audit log retains the metadata, but not potentially large body.
  try { fs.unlinkSync(backupPath); } catch { /* catalog is already consistent */ }
  return { id: normalizedId, title: meta.title };
}

export const vaultTemplateService = {
  get TEMPLATE_ROOT() {
    return resolveVaultTemplatePaths().templateRoot;
  },
  get CATALOG_PATH() {
    return resolveVaultTemplatePaths().catalogPath;
  },
  resolveVaultTemplatePaths,
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate
};
