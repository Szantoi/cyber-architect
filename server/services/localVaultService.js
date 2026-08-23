// server/services/localVaultService.js
//
// The Markdown vault is the canonical content source. SQLite and the hybrid
// RAG tables are materialized indexes of these files; neither Google Drive nor
// the database is permitted to win a normal content reconciliation.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { db } from '../db.js';
import { dbService } from './dbService.js';
import { hybridKnowledgeService } from './hybridKnowledgeService.js';
import { normalizeFrontmatterTaxonomy } from './frontmatterTaxonomy.js';
import { taxonomyService } from './taxonomyService.js';
import { graphService } from './graphService.js';
import { projectGraphBindingService } from './projectGraphBindingService.js';
import { readDocumentAssetManifest } from './vaultAssetManifestService.js';
import { resolveDocumentPresentation } from './presentationProfile.js';
import {
  CA_SYSTEM_BLOCK_VERSION,
  normalizeGraphFrontmatter,
  parseGraphAuthoringBlock,
  parseGraphSystemBlock
} from './graphMarkdownProjectionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../');
const APP_ROOT = path.resolve(__dirname, '../..');
const DEFAULT_CONTENT_ROOT = path.resolve(WORKSPACE_ROOT, 'CyberArchitect');
const MARKDOWN_FILE_PATTERN = /\.(?:md|markdown)$/i;
const CANONICAL_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function createVaultIssue(code, {
  stage = 'VAULT_SYNC',
  message = code,
  sourcePath = null,
  slug = null,
  documentId = null,
  details = null
} = {}) {
  return {
    code,
    stage,
    message,
    ...(sourcePath ? { source_path: sourcePath } : {}),
    ...(slug ? { slug } : {}),
    ...(documentId ? { document_id: documentId } : {}),
    ...(details ? { details } : {})
  };
}

function createVaultEditorError(code, {
  message = code,
  details = null
} = {}) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function isSameOrDescendant(candidatePath, parentPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function isForbiddenVaultRoot(candidatePath) {
  const resolved = path.resolve(candidatePath);
  return resolved === path.parse(resolved).root
    || resolved === WORKSPACE_ROOT
    || resolved === APP_ROOT
    || [
      path.resolve(APP_ROOT, 'server'),
      path.resolve(APP_ROOT, 'src'),
      path.resolve(APP_ROOT, 'node_modules'),
      path.resolve(APP_ROOT, 'dist'),
      path.resolve(WORKSPACE_ROOT, '.git'),
      path.resolve(WORKSPACE_ROOT, 'docs'),
      path.resolve(WORKSPACE_ROOT, 'terminals')
    ].some(protectedPath => isSameOrDescendant(resolved, protectedPath));
}

function findExistingAncestor(candidatePath) {
  let current = path.resolve(candidatePath);
  while (true) {
    if (fs.existsSync(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * Resolve the only supported canonical content root. It intentionally accepts
 * a read-only existing vault: normal Obsidian ingestion is read-only, and
 * cloud mirroring must not be needed for a healthy sync.
 */
export function resolveLocalVaultRoot(env = process.env) {
  const configured = typeof env.CYBER_ARCHITECT_CONTENT_ROOT === 'string'
    ? env.CYBER_ARCHITECT_CONTENT_ROOT.trim()
    : '';
  const root = configured
    ? (path.isAbsolute(configured) ? path.normalize(configured) : path.resolve(APP_ROOT, configured))
    : DEFAULT_CONTENT_ROOT;

  const fail = (reason) => {
    const error = new Error('LOCAL_VAULT_ROOT_INVALID');
    error.code = 'LOCAL_VAULT_ROOT_INVALID';
    error.reason = reason;
    throw error;
  };

  if (isForbiddenVaultRoot(root)) fail('FORBIDDEN_PATH');
  if (fs.existsSync(root)) {
    let stats;
    try {
      stats = fs.statSync(root);
    } catch {
      fail('UNREADABLE_PATH');
    }
    if (!stats.isDirectory()) fail('NOT_A_DIRECTORY');
  } else {
    const ancestor = findExistingAncestor(root);
    if (!ancestor) fail('NO_EXISTING_ANCESTOR');
    try {
      if (!fs.statSync(ancestor).isDirectory()) fail('ANCESTOR_NOT_A_DIRECTORY');
    } catch (error) {
      if (error?.code === 'LOCAL_VAULT_ROOT_INVALID') throw error;
      fail('ANCESTOR_UNREADABLE');
    }
  }

  return root;
}

export function resolveLocalVaultPaths(env = process.env) {
  const root = resolveLocalVaultRoot(env);
  return {
    root,
    // `Content` is the only canonical document corpus. Every document lives
    // in its own <collection>/<slug>/index.md package, regardless of whether
    // its presentation profile is knowledge or article.
    contentDir: path.join(root, 'Content'),
    legacyKnowledgeDir: path.join(root, 'KnowledgeBase'),
    legacyBlogDir: path.join(root, 'Blog')
  };
}

function normalizeSourcePath(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/[\\/]+/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function stableVaultSourceId(sourcePath, documentId = '') {
  const identity = documentId ? `document:${documentId}` : `path:${sourcePath}`;
  return `vault_${crypto.createHash('sha256').update(identity).digest('hex')}`;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function inferPlainObsidianSlug(fileStem) {
  const normalized = String(fileStem || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  // A normal Hungarian/Latin Obsidian filename produces the readable branch.
  // Keep an ASCII-only fallback for filenames that contain no Latin letter or
  // number at all, so the source remains importable and its identity stable.
  return normalized || `note-${crypto.createHash('sha256')
    .update(String(fileStem || '').normalize('NFC'))
    .digest('hex')
    .slice(0, 16)}`;
}

function extractFirstMarkdownH1(markdown) {
  let fence = null;
  for (const line of String(markdown || '').split(/\r?\n/)) {
    const fenceMatch = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fence === fenceMatch[1][0]) fence = null;
      continue;
    }
    if (fence) continue;

    const heading = /^\s{0,3}#\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading?.[1]) return heading[1].trim();
  }
  return '';
}

function parseMarkdownDocument(rawContent, sourcePath) {
  const content = String(rawContent || '').replace(/^\uFEFF/, '');
  if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) {
    throw createVaultIssue('VAULT_DOCUMENT_TOO_LARGE', {
      stage: 'PARSE',
      sourcePath,
      message: `A dokumentum meghaladja a ${MAX_DOCUMENT_BYTES} bájtos korlátot.`
    });
  }

  // The closing marker intentionally starts at the beginning of a line. This
  // also accepts an explicitly empty `---\n---` property block while keeping
  // ordinary Markdown without a leading frontmatter marker completely valid.
  const match = /^---\r?\n([\s\S]*?)^---(?:\r?\n|$)/m.exec(content);
  if (!match) {
    // Preserve the strict contract for a note that explicitly begins a YAML
    // property block but never closes it. A normal Obsidian note, on the other
    // hand, is allowed to have no frontmatter at all.
    if (/^---(?:\r?\n|$)/.test(content)) {
      throw createVaultIssue('VAULT_FRONTMATTER_REQUIRED', {
        stage: 'PARSE',
        sourcePath,
        message: 'A kanonikus vault-dokumentumnak érvényes YAML frontmatterrel kell kezdődnie.'
      });
    }
    return { metadata: {}, body: content, rawContent: content, hasFrontmatter: false };
  }

  let metadata;
  try {
    metadata = yaml.load(match[1]) || {};
  } catch {
    throw createVaultIssue('VAULT_FRONTMATTER_INVALID', {
      stage: 'PARSE',
      sourcePath,
      message: 'A YAML frontmatter nem értelmezhető.'
    });
  }
  if (!isPlainObject(metadata)) {
    throw createVaultIssue('VAULT_FRONTMATTER_INVALID', {
      stage: 'PARSE',
      sourcePath,
      message: 'A YAML frontmatter gyökere kulcs-érték leképezés legyen.'
    });
  }

  return { metadata, body: content.slice(match[0].length), rawContent: content, hasFrontmatter: true };
}

function deriveCanonicalDocument({
  filePath,
  sourcePath,
  fallbackPresentationProfile,
  stat,
  rawContent: suppliedRawContent
}) {
  const rawContent = suppliedRawContent === undefined
    ? fs.readFileSync(filePath, 'utf8')
    : String(suppliedRawContent);
  const { metadata, body, hasFrontmatter } = parseMarkdownDocument(rawContent, sourcePath);
  let assetManifest;
  try {
    // Rich, nested asset/dependency records intentionally live in a hidden
    // sidecar in this document's own folder. They are application data, not
    // Obsidian Properties, so a DWG/package manifest cannot turn into
    // `[object Object]` in the note frontmatter.
    assetManifest = readDocumentAssetManifest({ documentFilePath: filePath });
  } catch (error) {
    throw createVaultIssue(error?.code || 'VAULT_ASSET_MANIFEST_INVALID', {
      stage: 'VALIDATION',
      sourcePath,
      message: error?.message || 'A dokumentumhoz tartozó asset-manifest érvénytelen.',
      details: error?.details || null
    });
  }
  const fileStem = path.basename(filePath).replace(/\.(?:md|markdown)$/i, '');
  // A Content package is named after its folder and keeps the actual note at
  // `index.md`.  Using the package directory as the fallback identity avoids
  // every property-less package collapsing into the same `index` slug, while
  // preserving the ordinary filename fallback for loose Markdown imports.
  const documentStem = /^index$/i.test(fileStem)
    ? path.basename(path.dirname(filePath))
    : fileStem;
  // A property-less (or intentionally empty-property) Obsidian note is the
  // baseline ingestion format. It receives only safe storage defaults and
  // never opts into the DB-first typed graph projection.
  const hasExplicitFrontmatter = hasFrontmatter && Object.keys(metadata).length > 0;
  const slug = hasExplicitFrontmatter
    ? String(metadata.slug || documentStem).trim().toLowerCase()
    : inferPlainObsidianSlug(documentStem);
  if (!CANONICAL_SLUG_PATTERN.test(slug)) {
    throw createVaultIssue('VAULT_SLUG_INVALID', {
      stage: 'VALIDATION',
      sourcePath,
      slug,
      message: 'A slug csak kisbetűt, számot és egyszeres kötőjelet tartalmazhat.'
    });
  }

  let presentation;
  try {
    // `Content` is neutral and legacy folders are fallbacks only. An explicit
    // frontmatter profile always wins over a physical folder, because moving
    // a file must not silently change what it means or how it is rendered.
    presentation = resolveDocumentPresentation({
      presentationProfile: metadata.presentation_profile,
      contentType: metadata.content_type,
      fallbackProfile: fallbackPresentationProfile
    });
  } catch (error) {
    const isConflict = error?.code === 'PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT';
    throw createVaultIssue(
      isConflict ? 'VAULT_PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT' : 'VAULT_PRESENTATION_PROFILE_INVALID',
      {
        stage: 'VALIDATION',
        sourcePath,
        slug,
        message: isConflict
          ? 'A presentation_profile és a legacy content_type más megjelenítési profilt jelöl.'
          : 'A presentation_profile csak knowledge vagy article lehet; blog alias is használható.',
        details: error?.details || null
      }
    );
  }

  let graphFrontmatter;
  let graphSystemBlock;
  let graphAuthoringBlock;
  try {
    graphFrontmatter = normalizeGraphFrontmatter(metadata);
    graphSystemBlock = parseGraphSystemBlock(rawContent);
    graphAuthoringBlock = parseGraphAuthoringBlock(rawContent);
    if (graphSystemBlock.present && graphSystemBlock.version !== CA_SYSTEM_BLOCK_VERSION) {
      throw new Error('CA_SYSTEM_BLOCK_VERSION_UNSUPPORTED');
    }
    if (graphAuthoringBlock.present && graphAuthoringBlock.version !== CA_SYSTEM_BLOCK_VERSION) {
      throw new Error('CA_RELATIONS_BLOCK_VERSION_UNSUPPORTED');
    }
    if (graphSystemBlock.present && !graphSystemBlock.checksum_valid) {
      const error = new Error('CA_SYSTEM_BLOCK_DRIFT');
      error.details = {
        expected_checksum: graphSystemBlock.checksum,
        actual_checksum: graphSystemBlock.actual_checksum
      };
      throw error;
    }
  } catch (error) {
    throw createVaultIssue(error?.code || error?.message || 'CA_GRAPH_PROJECTION_INVALID', {
      stage: 'VALIDATION',
      sourcePath,
      slug,
      message: error?.message || 'A CA:SYSTEM gráfvetület érvénytelen.',
      details: error?.details || null
    });
  }

  const documentId = graphFrontmatter.document_id;
  if (documentId && !/^[A-Za-z0-9][A-Za-z0-9:._/-]{0,179}$/.test(documentId)) {
    throw createVaultIssue('VAULT_DOCUMENT_ID_INVALID', {
      stage: 'VALIDATION',
      sourcePath,
      slug,
      documentId,
      message: 'A document_id formátuma nem megengedett.'
    });
  }

  const title = hasExplicitFrontmatter
    ? String(metadata.title || documentStem.replace(/[-_]/g, ' ')).trim()
    : String(extractFirstMarkdownH1(body) || documentStem || slug).trim();
  if (!title) {
    throw createVaultIssue('VAULT_TITLE_REQUIRED', {
      stage: 'VALIDATION',
      sourcePath,
      slug,
      message: 'A dokumentumnak nem üres címmel kell rendelkeznie.'
    });
  }

  const bodyForSummary = body.trim().replace(/^[#\s*`>]+/, '');
  const summary = String(metadata.summary || (bodyForSummary ? `${bodyForSummary.slice(0, 200)}...` : 'Üres Markdown dokumentum.'));
  let dimensions;
  let taxonomyAssignments;
  try {
    // New Obsidian-facing documents use flat `tax_*` list properties.  The
    // old nested `dimensions` mapping remains import-only until every vault
    // note has been migrated.  Conflicting dual representations are rejected
    // rather than allowing a silent taxonomy drift into SQLite.
    dimensions = normalizeFrontmatterTaxonomy(metadata).dimensions;
    // The frontmatter normalizer protects the historical three facets; the
    // registry extractor additionally reads every administrator-created
    // `frontmatter_key`, so a future dimension is importable without another
    // source-code change.
    taxonomyAssignments = taxonomyService.extractAssignmentsFromFrontmatter(metadata);
  } catch (error) {
    throw createVaultIssue(error?.code || 'VAULT_TAXONOMY_INVALID', {
      stage: 'VALIDATION',
      sourcePath,
      slug,
      documentId,
      message: error?.message || 'A dokumentum taxonómia-frontmattere érvénytelen.',
      details: error?.details || null
    });
  }
  const published = metadata.published === undefined
    ? (hasExplicitFrontmatter
      ? (String(metadata.status || '').toLowerCase() === 'draft' ? 0 : 1)
      : 0)
    : (metadata.published === true || metadata.published === 1 ? 1 : 0);

  return {
    sourcePath,
    sourceId: stableVaultSourceId(sourcePath, documentId),
    documentId,
    filePath,
    rawContent,
    frontmatter: metadata,
    hasExplicitFrontmatter,
    assetManifest,
    taxonomyAssignments,
    graphProjection: {
      graph_refs: graphFrontmatter.graph_refs,
      sync_version: graphFrontmatter.sync_version,
      system_relations: graphSystemBlock.relations,
      system_block_present: graphSystemBlock.present,
      system_block_version: graphSystemBlock.version,
      system_block_checksum: graphSystemBlock.actual_checksum,
      authoring_relations: graphAuthoringBlock.relations,
      authoring_block_present: graphAuthoringBlock.present
    },
    postData: {
      project_id: String(metadata.project_id || 'prj_rag_enterprise'),
      content_type: presentation.content_type,
      presentation_profile: presentation.presentation_profile,
      slug,
      title,
      summary,
      content: body === '' ? '\n' : body,
      category: String(metadata.category || (presentation.content_type === 'blog' ? 'BLOG' : 'TUDÁSTÁR')),
      dimensions,
      visibility: hasExplicitFrontmatter
        ? (metadata.visibility === 'private' ? 'private' : 'public')
        : 'private',
      audio_url: String(metadata.audio_url || ''),
      video_url: String(metadata.video_url || ''),
      read_time: String(metadata.read_time || '4 PERC'),
      published,
      drive_path: sourcePath,
      drive_file_id: stableVaultSourceId(sourcePath, documentId),
      drive_modified_time: stat.mtime.toISOString()
    }
  };
}

function crawlVaultTree(baseDir, corpusName, fallbackPresentationProfile, entries, issues, sourceBaseDir = path.dirname(baseDir)) {
  if (!fs.existsSync(baseDir)) return;
  try {
    const baseStats = fs.lstatSync(baseDir);
    if (baseStats.isSymbolicLink()) {
      issues.push(createVaultIssue('VAULT_SYMLINK_SKIPPED', {
        stage: 'DISCOVERY',
        sourcePath: corpusName,
        message: 'A kanonikus vault-korpusz nem lehet szimbolikus link.'
      }));
      return;
    }
    if (!baseStats.isDirectory()) {
      issues.push(createVaultIssue('VAULT_DIRECTORY_INVALID', {
        stage: 'DISCOVERY',
        sourcePath: corpusName,
        message: 'A kanonikus vault-korpusz könyvtár kell legyen.'
      }));
      return;
    }
  } catch (error) {
    issues.push(createVaultIssue('VAULT_DIRECTORY_UNREADABLE', {
      stage: 'DISCOVERY',
      sourcePath: corpusName,
      message: error.message
    }));
    return;
  }
  let directoryEntries;
  try {
    directoryEntries = fs.readdirSync(baseDir, { withFileTypes: true });
  } catch (error) {
    issues.push(createVaultIssue('VAULT_DIRECTORY_UNREADABLE', {
      stage: 'DISCOVERY',
      sourcePath: corpusName,
      message: error.message
    }));
    return;
  }

  for (const directoryEntry of directoryEntries) {
    const fullPath = path.join(baseDir, directoryEntry.name);
    const relative = normalizeSourcePath(path.relative(sourceBaseDir, fullPath));
    if (directoryEntry.isSymbolicLink()) {
      issues.push(createVaultIssue('VAULT_SYMLINK_SKIPPED', {
        stage: 'DISCOVERY',
        sourcePath: relative,
        message: 'Szimbolikus link nem lehet kanonikus vault-dokumentum.'
      }));
      continue;
    }
    if (directoryEntry.isDirectory()) {
      crawlVaultTree(fullPath, corpusName, fallbackPresentationProfile, entries, issues, sourceBaseDir);
      continue;
    }
    if (!directoryEntry.isFile() || !MARKDOWN_FILE_PATTERN.test(directoryEntry.name)) continue;

    try {
      const stat = fs.statSync(fullPath);
      entries.push(deriveCanonicalDocument({
        filePath: fullPath,
        sourcePath: relative,
        fallbackPresentationProfile,
        stat
      }));
    } catch (error) {
      issues.push(error?.code ? error : createVaultIssue('VAULT_DOCUMENT_READ_FAILED', {
        stage: 'DISCOVERY',
        sourcePath: relative,
        message: error.message
      }));
    }
  }
}

function collectIdentityIssues(documents) {
  const issues = [];
  const bySlug = new Map();
  const byDocumentId = new Map();
  const bySourceId = new Map();

  for (const document of documents) {
    const add = (map, key) => {
      const current = map.get(key) || [];
      current.push(document);
      map.set(key, current);
    };
    add(bySlug, document.postData.slug);
    if (document.documentId) add(byDocumentId, document.documentId);
    add(bySourceId, document.sourceId);
  }

  for (const [slug, matches] of bySlug) {
    if (matches.length < 2) continue;
    issues.push(createVaultIssue('VAULT_DUPLICATE_SLUG', {
      stage: 'IDENTITY',
      slug,
      message: 'A slug a kanonikus vault dokumentumkorpuszban globálisan egyedi kell legyen.',
      details: { source_paths: matches.map(item => item.sourcePath).sort() }
    }));
  }
  for (const [documentId, matches] of byDocumentId) {
    if (matches.length < 2) continue;
    issues.push(createVaultIssue('VAULT_DUPLICATE_DOCUMENT_ID', {
      stage: 'IDENTITY',
      documentId,
      message: 'Egy document_id csak egy kanonikus vault-fájlhoz tartozhat.',
      details: { source_paths: matches.map(item => item.sourcePath).sort() }
    }));
  }
  for (const [sourceId, matches] of bySourceId) {
    if (matches.length < 2) continue;
    issues.push(createVaultIssue('VAULT_SOURCE_ID_COLLISION', {
      stage: 'IDENTITY',
      message: 'A vault-azonosító nem egyedi.',
      details: { source_id: sourceId, source_paths: matches.map(item => item.sourcePath).sort() }
    }));
  }

  return issues;
}

function buildIdentityPlan(documents) {
  const issues = [];
  const plans = [];
  for (const document of documents) {
    const sourceOwner = dbService.getBlogPostByDriveFileId(document.sourceId);
    const slugOwner = dbService.getBlogPostBySlug(document.postData.slug, {
      publishedOnly: false,
      visibility: 'all'
    });
    if (sourceOwner && slugOwner && Number(sourceOwner.id) !== Number(slugOwner.id)) {
      issues.push(createVaultIssue('VAULT_DATABASE_IDENTITY_CONFLICT', {
        stage: 'IDENTITY',
        sourcePath: document.sourcePath,
        slug: document.postData.slug,
        documentId: document.documentId || null,
        message: 'A vault útvonal-azonosító és a slug két külön SQLite rekordhoz tartozik.',
        details: { source_owner_id: sourceOwner.id, slug_owner_id: slugOwner.id }
      }));
      continue;
    }
    plans.push({ document, existingPost: sourceOwner || slugOwner || null });
  }
  return { plans, issues };
}

function toSourcePath(document) {
  return document.sourcePath;
}

function toFileResult(document, status, post = null, indexResult = null) {
  return {
    source_path: toSourcePath(document),
    file: path.basename(document.filePath),
    slug: document.postData.slug,
    document_id: document.documentId || null,
    status,
    ...(post ? { post_id: post.id } : {}),
    ...(indexResult ? {
      indexed: Boolean(indexResult.indexed),
      chunks: indexResult.chunks || 0,
      edges: indexResult.edges || 0
    } : {})
  };
}

function toMarkdownGraphRelations(graphProjection, documentIdBySlug) {
  return (graphProjection?.authoring_relations || []).map(relation => {
    const targetDocumentId = documentIdBySlug.get(relation.target_slug) || null;
    return {
      edge_type_id: relation.edge_type,
      direction: relation.direction || 'outbound',
      target_reference: relation.target_reference,
      target_label: relation.target_label,
      target_node_type: 'document',
      ...(targetDocumentId ? { target_document_id: targetDocumentId } : {}),
      ...((relation.graph_refs || []).length ? { graph_ids: relation.graph_refs } : {})
    };
  });
}

function shouldSyncMarkdownGraphProjection(document, post) {
  if (document.graphProjection.authoring_block_present || document.graphProjection.graph_refs.length) return true;
  // A removed authoring block must also remove its prior DB projection. Avoid
  // creating global graph-node rows for otherwise graph-free legacy notes.
  return Boolean(graphService.listMarkdownProjectionRelations({
    post,
    documentId: document.documentId,
    sourcePath: document.sourcePath
  }).source_node);
}

function normalizeEditableSlug(value) {
  const slug = String(value || '').trim().toLowerCase();
  if (!CANONICAL_SLUG_PATTERN.test(slug)) {
    throw createVaultEditorError('VAULT_DOCUMENT_SLUG_INVALID', {
      message: 'A dokumentumazonosító csak kisbetűt, számot és egyszeres kötőjelet tartalmazhat.'
    });
  }
  return slug;
}

function revisionForContent(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function safeVaultDocumentPath(sourcePath, paths) {
  const normalizedSourcePath = normalizeSourcePath(sourcePath);
  const sourceSegments = normalizedSourcePath.split('/').filter(Boolean);
  const hasParentTraversal = sourceSegments.some(segment => segment === '.' || segment === '..');
  const candidatePath = path.resolve(paths.root, ...sourceSegments);
  const allowedRoots = [paths.contentDir];

  if (
    !normalizedSourcePath
    || hasParentTraversal
    || !MARKDOWN_FILE_PATTERN.test(normalizedSourcePath)
    || !isSameOrDescendant(candidatePath, paths.root)
    || !allowedRoots.some(root => isSameOrDescendant(candidatePath, root))
  ) {
    throw createVaultEditorError('VAULT_DOCUMENT_PATH_INVALID', {
      message: 'A dokumentumhoz tartozó vault-útvonal nem szerkeszthető.'
    });
  }

  return {
    sourcePath: normalizedSourcePath,
    filePath: candidatePath,
    fallbackPresentationProfile: 'knowledge'
  };
}

function resolveEditableVaultDocument(slug) {
  const canonicalSlug = normalizeEditableSlug(slug);
  const post = dbService.getBlogPostBySlug(canonicalSlug, {
    publishedOnly: false,
    visibility: 'all'
  });
  if (!post || !post.drive_path) {
    throw createVaultEditorError('VAULT_DOCUMENT_NOT_FOUND', {
      message: 'A dokumentum nem található a kanonikus vaultban.'
    });
  }

  const paths = resolveLocalVaultPaths();
  const { sourcePath, filePath, fallbackPresentationProfile } = safeVaultDocumentPath(post.drive_path, paths);

  let stat;
  try {
    stat = fs.lstatSync(filePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw createVaultEditorError('VAULT_DOCUMENT_FILE_MISSING', {
        message: 'A dokumentum fájlja nem található a kanonikus vaultban.'
      });
    }
    throw createVaultEditorError('VAULT_DOCUMENT_READ_FAILED', {
      message: 'A dokumentum fájlja nem olvasható.'
    });
  }

  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw createVaultEditorError('VAULT_DOCUMENT_FILE_INVALID', {
      message: 'A szerkeszthető dokumentumnak normál Markdown-fájlnak kell lennie.'
    });
  }

  const document = deriveCanonicalDocument({
    filePath,
    sourcePath,
    fallbackPresentationProfile,
    stat
  });
  if (document.postData.slug !== canonicalSlug) {
    throw createVaultEditorError('VAULT_DOCUMENT_STALE_IDENTITY', {
      message: 'A vault-fájl és az indexelt dokumentum azonosítója eltér. Előbb futtasd a vault szinkronizálást.',
      details: { indexed_slug: canonicalSlug, vault_slug: document.postData.slug }
    });
  }

  return {
    post,
    document,
    stat,
    vaultRoot: paths.root,
    sourcePath,
    filePath,
    fallbackPresentationProfile,
    revision: revisionForContent(document.rawContent)
  };
}

function toEditableDocumentPayload(editable) {
  return {
    slug: editable.document.postData.slug,
    source_path: editable.sourcePath,
    content: editable.document.rawContent,
    revision: editable.revision,
    bytes: Buffer.byteLength(editable.document.rawContent, 'utf8'),
    updated_at: editable.stat.mtime.toISOString()
  };
}

function assertUnchangedDocumentIdentity(current, draft) {
  const identityChanged = draft.postData.slug !== current.document.postData.slug
    || (draft.documentId || null) !== (current.document.documentId || null)
    || draft.postData.presentation_profile !== current.document.postData.presentation_profile
    || (current.document.hasExplicitFrontmatter && !draft.hasExplicitFrontmatter);
  if (identityChanged) {
    throw createVaultEditorError('VAULT_DOCUMENT_IDENTITY_CHANGE_FORBIDDEN', {
      message: 'A közvetlen szerkesztőben a slug, a document_id és a megjelenítési profil nem módosítható. Átnevezéshez vagy áthelyezéshez használd az Obsidian Vaultot.'
    });
  }
}

function assertUnchangedSystemGraphProjection(current, draft) {
  const currentProjection = current.document.graphProjection;
  const draftProjection = draft.graphProjection;
  const changed = currentProjection.system_block_present !== draftProjection.system_block_present
    || currentProjection.system_block_version !== draftProjection.system_block_version
    || currentProjection.system_block_checksum !== draftProjection.system_block_checksum;
  if (changed) {
    throw createVaultEditorError('VAULT_DOCUMENT_SYSTEM_BLOCK_FORBIDDEN', {
      message: 'A CA:SYSTEM blokk rendszerkezelt; közvetlen szerkesztésben nem módosítható.'
    });
  }
}

function atomicReplaceVaultDocument(filePath, content, mode) {
  const tempPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.ca-edit-${crypto.randomUUID()}.tmp`
  );

  try {
    fs.writeFileSync(tempPath, content, { encoding: 'utf8', mode: mode & 0o777 });
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

function createInlineEditorBackup(editable) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(
    editable.vaultRoot,
    '.cyberarchitect-backups',
    'inline-editor',
    `${timestamp}-${crypto.randomUUID()}`
  );
  const backupPath = path.resolve(backupRoot, ...editable.sourcePath.split('/'));
  if (!isSameOrDescendant(backupPath, backupRoot)) {
    throw createVaultEditorError('VAULT_DOCUMENT_BACKUP_PATH_INVALID', {
      message: 'A dokumentum biztonsági mentési útvonala érvénytelen.'
    });
  }
  fs.mkdirSync(path.dirname(backupPath), { recursive: true, mode: 0o700 });
  fs.copyFileSync(editable.filePath, backupPath, fs.constants.COPYFILE_EXCL);
  return normalizeSourcePath(path.relative(editable.vaultRoot, backupPath));
}

export const localVaultService = {
  getStatus() {
    try {
      const paths = resolveLocalVaultPaths();
      const countMarkdown = (dir) => {
        if (!fs.existsSync(dir)) return 0;
        let count = 0;
        const scan = (current) => {
          for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const target = path.join(current, entry.name);
            if (entry.isDirectory()) scan(target);
            else if (entry.isFile() && MARKDOWN_FILE_PATTERN.test(entry.name)) count++;
          }
        };
        scan(dir);
        return count;
      };
      const contentCount = countMarkdown(paths.contentDir);
      const legacyKnowledgeCount = countMarkdown(paths.legacyKnowledgeDir);
      const legacyBlogCount = countMarkdown(paths.legacyBlogDir);
      const legacyRoots = [
        legacyKnowledgeCount > 0 ? {
          path: 'KnowledgeBase',
          files_count: legacyKnowledgeCount,
          migration_command: 'node server/scripts/migrateLegacyVaultToContentPackages.js --apply'
        } : null,
        legacyBlogCount > 0 ? {
          path: 'Blog',
          files_count: legacyBlogCount,
          migration_command: 'node server/scripts/migrateLegacyVaultToContentPackages.js --apply'
        } : null
      ].filter(Boolean);
      return {
        mode: 'LOCAL_VAULT',
        source_of_truth: 'LOCAL_VAULT',
        content_root: paths.root,
        content_vault_dir: paths.contentDir,
        content_files_count: contentCount,
        local_files_detected: contentCount,
        legacy_roots_detected: legacyRoots,
        checked_at: new Date().toISOString()
      };
    } catch (error) {
      return {
        mode: 'CONFIGURATION_ERROR',
        source_of_truth: 'UNAVAILABLE',
        configuration_errors: [createVaultIssue('LOCAL_VAULT_ROOT_INVALID', {
          stage: 'CONFIGURATION',
          message: 'A kanonikus lokális vault gyökér nem elérhető vagy nem biztonságos.',
          details: { reason: error?.reason || 'INVALID_PATH' }
        })],
        checked_at: new Date().toISOString()
      };
    }
  },

  /**
   * Returns the full raw Markdown document (including YAML frontmatter) for
   * the contextual admin editor. Public reader endpoints intentionally never
   * expose this source representation.
   */
  getEditableDocument(slug) {
    const status = this.getStatus();
    if (status.mode === 'CONFIGURATION_ERROR') {
      throw createVaultEditorError('LOCAL_VAULT_ROOT_INVALID', {
        message: 'A kanonikus vault jelenleg nem elérhető.',
        details: status.configuration_errors || []
      });
    }
    return toEditableDocumentPayload(resolveEditableVaultDocument(slug));
  },

  /**
   * Updates one existing canonical vault note with optimistic concurrency,
   * validates the resulting Markdown before any disk mutation, then refreshes
   * every SQLite/RAG projection. If projection fails, the original file is
   * restored and re-synchronized before the error reaches the caller.
   */
  updateEditableDocument({ slug, content, revision, actor = 'ADMIN_INLINE_EDITOR' } = {}) {
    if (typeof content !== 'string') {
      throw createVaultEditorError('VAULT_EDITOR_CONTENT_INVALID', {
        message: 'A Markdown-tartalom szöveg kell legyen.'
      });
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) {
      throw createVaultEditorError('VAULT_DOCUMENT_TOO_LARGE', {
        message: `A dokumentum meghaladja a ${MAX_DOCUMENT_BYTES} bájtos korlátot.`
      });
    }
    if (typeof revision !== 'string' || !SHA256_PATTERN.test(revision)) {
      throw createVaultEditorError('VAULT_EDITOR_REVISION_REQUIRED', {
        message: 'A mentéshez érvényes dokumentumverzió szükséges.'
      });
    }

    const preflight = this.sync({ actor: `${actor}_PREFLIGHT`, dryRun: true });
    if (preflight.errors.length > 0) {
      throw createVaultEditorError('VAULT_SYNC_PRECONDITION_FAILED', {
        message: 'A teljes vault jelenlegi hibái miatt a dokumentum nem menthető biztonságosan.',
        details: { errors: preflight.errors }
      });
    }

    // Re-read after the preflight because a local Obsidian save can happen at
    // any time. The revision check fails closed instead of overwriting it.
    const current = resolveEditableVaultDocument(slug);
    if (current.revision !== revision) {
      throw createVaultEditorError('VAULT_DOCUMENT_CONFLICT', {
        message: 'A dokumentum időközben megváltozott. Töltsd be újra a legfrissebb verziót, mielőtt mentesz.',
        details: { current_revision: current.revision }
      });
    }

    const draft = deriveCanonicalDocument({
      filePath: current.filePath,
      sourcePath: current.sourcePath,
      fallbackPresentationProfile: current.fallbackPresentationProfile,
      stat: current.stat,
      rawContent: content
    });
    assertUnchangedDocumentIdentity(current, draft);
    assertUnchangedSystemGraphProjection(current, draft);

    let wroteDraft = false;
    try {
      const backupPath = createInlineEditorBackup(current);
      atomicReplaceVaultDocument(current.filePath, content, current.stat.mode);
      wroteDraft = true;

      const sync = this.sync({ actor, dryRun: false });
      if (sync.errors.length > 0) {
        throw createVaultEditorError('VAULT_DOCUMENT_SYNC_FAILED', {
          message: 'A dokumentum mentése után a keresési vetület frissítése nem sikerült.',
          details: { errors: sync.errors }
        });
      }

      const saved = resolveEditableVaultDocument(slug);
      return {
        document: toEditableDocumentPayload(saved),
        backup_path: backupPath,
        sync
      };
    } catch (error) {
      if (wroteDraft) {
        try {
          atomicReplaceVaultDocument(current.filePath, current.document.rawContent, current.stat.mode);
          this.sync({ actor: `${actor}_ROLLBACK`, dryRun: false });
        } catch (rollbackError) {
          error.rollback_error = rollbackError?.code || rollbackError?.message || 'VAULT_DOCUMENT_ROLLBACK_FAILED';
        }
      }
      throw error;
    }
  },

  /**
   * Read the canonical Obsidian vault and atomically refresh SQLite/RAG
   * projections. All parsing and identity validation happens before the first
   * database mutation, so a conflicted copy can never win by accident.
   */
  sync({ actor = 'LOCAL_VAULT_SYNC', dryRun = false } = {}) {
    const status = this.getStatus();
    const result = {
      operation: 'LOCAL_VAULT_SYNC',
      mode: status.mode,
      source_of_truth: 'LOCAL_VAULT',
      dry_run: Boolean(dryRun),
      discovered: 0,
      processed: 0,
      created: 0,
      updated: 0,
      indexed: 0,
      skipped_count: 0,
      errors: [],
      warnings: [],
      files: []
    };

    if (status.mode === 'CONFIGURATION_ERROR') {
      result.errors.push(...(status.configuration_errors || []));
      return result;
    }

    const documents = [];
    const discoveryIssues = [];
    crawlVaultTree(status.content_vault_dir, 'Content', 'knowledge', documents, discoveryIssues);
    for (const legacyRoot of status.legacy_roots_detected || []) {
      discoveryIssues.push(createVaultIssue('VAULT_LEGACY_ROOT_DETECTED', {
        stage: 'DISCOVERY',
        sourcePath: legacyRoot.path,
        message: 'A KnowledgeBase/ és Blog/ gyökér már nem kanonikus. Futtasd a Content-csomag migrációt, vagy távolítsd el a régi másolatot.',
        details: legacyRoot
      }));
    }
    result.discovered = documents.length;
    result.errors.push(...discoveryIssues, ...collectIdentityIssues(documents));

    if (result.errors.length > 0) {
      result.skipped_count = documents.length;
      result.files.push(...documents.map(document => toFileResult(document, 'NOT_APPLIED')));
      return result;
    }

    const { plans, issues: identityIssues } = buildIdentityPlan(documents);
    result.errors.push(...identityIssues);
    if (result.errors.length > 0) {
      result.skipped_count = documents.length;
      result.files.push(...documents.map(document => toFileResult(document, 'NOT_APPLIED')));
      return result;
    }

    if (dryRun) {
      for (const { document, existingPost } of plans) {
        result.processed++;
        if (existingPost) result.updated++;
        else result.created++;
        result.files.push(toFileResult(document, existingPost ? 'WOULD_UPDATE' : 'WOULD_CREATE'));
      }
      return result;
    }

    const applied = [];
    try {
      db.transaction(() => {
        const documentIdBySlug = new Map(plans
          .filter(({ document }) => Boolean(document.documentId))
          .map(({ document }) => [document.postData.slug, document.documentId]));
        // The first canonical-vault import creates the initial vocabulary from
        // the whole vault, even if an administrator already added an unrelated
        // term.  A durable marker then switches normal operation to strict
        // resolution: Markdown typos cannot silently create new vocabulary.
        const taxonomyBootstrapMarker = db.prepare(`
          SELECT value
          FROM settings
          WHERE key = 'taxonomy_vocabulary_bootstrap_v1'
        `).get();
        const shouldBootstrapTaxonomy = !taxonomyBootstrapMarker;
        if (shouldBootstrapTaxonomy) {
          for (const { document } of plans) {
            taxonomyService.bootstrapTermsForAssignments({
              assignments: document.taxonomyAssignments,
              actor: `${actor}_TAXONOMY_BOOTSTRAP`
            });
          }
        }

        for (const { document, existingPost } of plans) {
          const post = existingPost
            ? dbService.updateBlogPost(existingPost.id, document.postData, actor)
            : dbService.createBlogPost(document.postData, actor);
          taxonomyService.replaceAssignmentsForPost({
            postId: post.id,
            assignments: document.taxonomyAssignments,
            actor
          });
          const indexResult = hybridKnowledgeService.indexDocument({
            post,
            markdown: document.rawContent,
            frontmatter: document.frontmatter,
            sourcePath: document.sourcePath,
            asset_manifest_assets: document.assetManifest.assets
          });
          const graphProjectionResult = document.hasExplicitFrontmatter && shouldSyncMarkdownGraphProjection(document, post)
            ? graphService.syncMarkdownProjectionForPost({
              post,
              documentId: document.documentId,
              sourcePath: document.sourcePath,
              frontmatter: document.frontmatter,
              authoring_relations: toMarkdownGraphRelations(document.graphProjection, documentIdBySlug),
              actor: `${actor}_GRAPH_PROJECTION`
            })
            : null;
          const projectGraphBindingResult = document.hasExplicitFrontmatter
            ? projectGraphBindingService.syncDocumentProjectBinding({
              post,
              documentId: document.documentId,
              sourcePath: document.sourcePath,
              frontmatter: document.frontmatter,
              actor: `${actor}_PROJECT_GRAPH_BINDING`
            })
            : null;
          applied.push({ document, post, indexResult, graphProjectionResult, projectGraphBindingResult, created: !existingPost });
        }
        if (shouldBootstrapTaxonomy) {
          db.prepare(`
            INSERT INTO settings (key, value)
            VALUES ('taxonomy_vocabulary_bootstrap_v1', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
          `).run(new Date().toISOString());
        }
      })();
    } catch (error) {
      result.errors.push(createVaultIssue('LOCAL_VAULT_APPLY_FAILED', {
        stage: 'APPLY',
        message: error.message
      }));
      result.skipped_count = documents.length;
      result.files.push(...documents.map(document => toFileResult(document, 'NOT_APPLIED')));
      return result;
    }

    for (const item of applied) {
      result.processed++;
      if (item.created) result.created++;
      else result.updated++;
      if (item.indexResult.indexed) result.indexed++;
      result.files.push(toFileResult(item.document, item.created ? 'CREATED' : 'UPDATED', item.post, item.indexResult));
    }
    return result;
  }
};
