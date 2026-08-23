import crypto from 'node:crypto';

export const CA_SYSTEM_BLOCK_VERSION = 1;

const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,179}$/;
const GRAPH_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._/-]{0,179}$/;
const EDGE_TYPE_PATTERN = /^[a-z][a-z0-9_-]{0,79}$/;
const BEGIN_MARKER = /^<!--\s*CA:SYSTEM:BEGIN\s+v(?<version>[1-9][0-9]*)(?:\s+checksum="(?<checksum>sha256:[a-f0-9]{64})")?\s*-->\s*$/i;
const END_MARKER = /^<!--\s*CA:SYSTEM:END\s*-->\s*$/i;
const AUTHOR_BEGIN_MARKER = /^<!--\s*CA:RELATIONS:BEGIN\s+v(?<version>[1-9][0-9]*)\s*-->\s*$/i;
const AUTHOR_END_MARKER = /^<!--\s*CA:RELATIONS:END\s*-->\s*$/i;
// The arrow is part of the asserted fact, not decoration.  All persisted
// records remain directed arcs: ← reverses the source/target of this note and
// ↔ creates the reciprocal pair inside one graph transaction.
const RELATION_LINE = /^\s*-\s*(?<edgeType>[a-z][a-z0-9_-]{0,79})\s*(?<arrow>→|->|←|<-|↔|<->)\s*\[\[(?<target>[^\]\r\n]+)\]\](?:\s*·\s*graphs?\s*:\s*(?<graphRefs>[A-Za-z0-9][A-Za-z0-9:._/-]{0,179}(?:\s*,\s*[A-Za-z0-9][A-Za-z0-9:._/-]{0,179})*))?\s*$/;

export class GraphMarkdownProjectionError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'GraphMarkdownProjectionError';
    this.code = code;
    this.details = details;
  }
}

function normalizeLineEndings(value) {
  return String(value || '').replace(/\r\n/g, '\n');
}

function checksumForBlockBody(body) {
  return `sha256:${crypto.createHash('sha256').update(normalizeLineEndings(body), 'utf8').digest('hex')}`;
}

function normalizeReferenceSlug(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .split('/')
    .filter(Boolean)
    .pop()
    ?.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 160) || '';
}

function parseWikiTarget(value) {
  const raw = String(value || '').trim();
  const labelIndex = raw.indexOf('|');
  const targetWithHeading = (labelIndex === -1 ? raw : raw.slice(0, labelIndex)).trim();
  const label = labelIndex === -1 ? '' : raw.slice(labelIndex + 1).trim();
  const headingIndex = targetWithHeading.indexOf('#');
  const targetReference = (headingIndex === -1 ? targetWithHeading : targetWithHeading.slice(0, headingIndex)).trim();
  const targetHeading = headingIndex === -1 ? '' : targetWithHeading.slice(headingIndex + 1).trim();
  const targetSlug = normalizeReferenceSlug(targetReference);
  if (!targetReference || !targetSlug) {
    throw new GraphMarkdownProjectionError(
      'CA_SYSTEM_RELATION_TARGET_INVALID',
      'A rendszerkapcsolat célja érvényes Obsidian wikilink legyen.',
      { value }
    );
  }
  return {
    target_reference: targetReference.slice(0, 240),
    target_slug: targetSlug,
    target_heading: targetHeading.slice(0, 240),
    target_label: label.slice(0, 240)
  };
}

function parseRelationLine(line, lineNumber) {
  const match = RELATION_LINE.exec(line);
  if (!match?.groups) {
    throw new GraphMarkdownProjectionError(
      'CA_SYSTEM_RELATION_INVALID',
      'A kapcsolat formátuma: - edge_type → [[cél]] · graph: graph-id (vagy ← / ↔).',
      { line: lineNumber, value: line }
    );
  }
  const edgeType = match.groups.edgeType;
  if (!EDGE_TYPE_PATTERN.test(edgeType)) {
    throw new GraphMarkdownProjectionError(
      'CA_SYSTEM_RELATION_TYPE_INVALID',
      'A kapcsolat típusa csak kisbetűt, számot, kötőjelet és aláhúzást tartalmazhat.',
      { line: lineNumber, edge_type: edgeType }
    );
  }
  const graphRefs = match.groups.graphRefs
    ? match.groups.graphRefs.split(',').map(value => value.trim()).filter(Boolean)
    : [];
  if (graphRefs.some(graphRef => !GRAPH_REF_PATTERN.test(graphRef))) {
    throw new GraphMarkdownProjectionError(
      'CA_SYSTEM_RELATION_GRAPH_INVALID',
      'A kapcsolat gráfazonosítója érvénytelen.',
      { line: lineNumber, graph_refs: graphRefs }
    );
  }
  if (new Set(graphRefs).size !== graphRefs.length) {
    throw new GraphMarkdownProjectionError(
      'CA_SYSTEM_RELATION_GRAPH_DUPLICATE',
      'Egy kapcsolat gráfazonosítója csak egyszer szerepelhet.',
      { line: lineNumber, graph_refs: graphRefs }
    );
  }
  const direction = {
    '→': 'outbound',
    '->': 'outbound',
    '←': 'inbound',
    '<-': 'inbound',
    '↔': 'both',
    '<->': 'both'
  }[match.groups.arrow];
  return {
    edge_type: edgeType,
    direction,
    ...parseWikiTarget(match.groups.target),
    graph_ref: graphRefs[0] || null,
    graph_refs: graphRefs,
    source_line: lineNumber
  };
}

function assertUniqueRelations(relations) {
  const found = new Set();
  for (const relation of relations) {
    const key = [
      relation.edge_type,
      relation.direction || 'outbound',
      relation.target_reference,
      relation.target_heading,
      ...(relation.graph_refs || (relation.graph_ref ? [relation.graph_ref] : []))
    ].join('\u0000');
    if (found.has(key)) {
      throw new GraphMarkdownProjectionError(
        'CA_SYSTEM_RELATION_DUPLICATE',
        'Ugyanaz a rendszerkapcsolat csak egyszer szerepelhet egy dokumentumban.',
        { relation }
      );
    }
    found.add(key);
  }
}

function parseDelimitedRelationsBlock(markdown, {
  beginMarker,
  endMarker,
  duplicateCode,
  malformedCode,
  label
}) {
  const source = normalizeLineEndings(markdown);
  const lines = source.split('\n');
  let beginIndex = -1;
  let endIndex = -1;
  let marker = null;

  for (let index = 0; index < lines.length; index++) {
    const begin = beginMarker.exec(lines[index]);
    if (begin) {
      if (beginIndex !== -1) {
        throw new GraphMarkdownProjectionError(duplicateCode, `Egy fájlban csak egy ${label} blokk lehet.`);
      }
      beginIndex = index;
      marker = begin.groups;
      continue;
    }
    if (endMarker.test(lines[index])) {
      if (beginIndex === -1 || endIndex !== -1) {
        throw new GraphMarkdownProjectionError(malformedCode, `A ${label} blokk zárójelölője hibás helyen van.`);
      }
      endIndex = index;
    }
  }

  if (beginIndex === -1 && endIndex === -1) {
    return { present: false, version: null, marker: null, body: '', relations: [], start_offset: null, end_offset: null };
  }
  if (beginIndex === -1 || endIndex === -1 || endIndex <= beginIndex) {
    throw new GraphMarkdownProjectionError(malformedCode, `A ${label} blokk kezdő- és zárójelölője kötelező.`);
  }

  const bodyLines = lines.slice(beginIndex + 1, endIndex);
  const relations = [];
  for (let index = 0; index < bodyLines.length; index++) {
    const line = bodyLines[index];
    if (!line.trim() || /^#{1,6}\s+/.test(line)) continue;
    relations.push(parseRelationLine(line, beginIndex + index + 2));
  }
  assertUniqueRelations(relations);
  return {
    present: true,
    version: Number(marker.version),
    marker,
    body: bodyLines.join('\n'),
    relations,
    start_offset: lines.slice(0, beginIndex).join('\n').length + (beginIndex > 0 ? 1 : 0),
    end_offset: lines.slice(0, endIndex + 1).join('\n').length + (endIndex + 1 < lines.length ? 1 : 0)
  };
}

/**
 * Validates the only flat, Obsidian-native graph properties admitted in a
 * canonical Markdown file. Rich graph state deliberately lives in SQLite.
 */
export function normalizeGraphFrontmatter(frontmatter = {}) {
  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    throw new GraphMarkdownProjectionError('CA_FRONTMATTER_INVALID', 'A frontmatter gyökere objektum legyen.');
  }

  const documentId = frontmatter.ca_document_id === undefined || frontmatter.ca_document_id === null
    ? ''
    : String(frontmatter.ca_document_id).trim();
  if (documentId && !DOCUMENT_ID_PATTERN.test(documentId)) {
    throw new GraphMarkdownProjectionError(
      'CA_DOCUMENT_ID_INVALID',
      'A ca_document_id formátuma nem megengedett.',
      { ca_document_id: documentId }
    );
  }
  if (documentId && frontmatter.document_id && String(frontmatter.document_id).trim() !== documentId) {
    throw new GraphMarkdownProjectionError(
      'CA_DOCUMENT_ID_CONFLICT',
      'A ca_document_id és document_id eltér; egy dokumentumnak csak egy stabil azonosítója lehet.',
      { ca_document_id: documentId, document_id: String(frontmatter.document_id).trim() }
    );
  }

  const rawGraphRefs = frontmatter.ca_graph_refs === undefined || frontmatter.ca_graph_refs === null
    ? []
    : frontmatter.ca_graph_refs;
  if (!Array.isArray(rawGraphRefs) || rawGraphRefs.some(value => typeof value !== 'string')) {
    throw new GraphMarkdownProjectionError(
      'CA_GRAPH_REFS_INVALID',
      'A ca_graph_refs lapos szöveglista legyen.'
    );
  }
  const graphRefs = rawGraphRefs.map(value => value.trim()).filter(Boolean);
  if (graphRefs.some(value => !GRAPH_REF_PATTERN.test(value))) {
    throw new GraphMarkdownProjectionError(
      'CA_GRAPH_REF_INVALID',
      'A ca_graph_refs minden eleme érvényes gráfazonosító legyen.',
      { ca_graph_refs: graphRefs }
    );
  }
  if (new Set(graphRefs).size !== graphRefs.length) {
    throw new GraphMarkdownProjectionError(
      'CA_GRAPH_REF_DUPLICATE',
      'A ca_graph_refs nem tartalmazhat ismétlődő gráfazonosítót.',
      { ca_graph_refs: graphRefs }
    );
  }

  const syncVersion = frontmatter.ca_sync_version === undefined || frontmatter.ca_sync_version === null || frontmatter.ca_sync_version === ''
    ? null
    : Number(frontmatter.ca_sync_version);
  if (syncVersion !== null && (!Number.isInteger(syncVersion) || syncVersion < 1 || syncVersion > 1_000)) {
    throw new GraphMarkdownProjectionError(
      'CA_SYNC_VERSION_INVALID',
      'A ca_sync_version 1 és 1000 közötti egész szám legyen.'
    );
  }

  if (frontmatter.ca_relations !== undefined) {
    throw new GraphMarkdownProjectionError(
      'CA_RELATIONS_DEPRECATED',
      'A ca_relations nem használható; a típusos kapcsolatok a CA:RELATIONS blokkban, valamint az adatbázisban élnek.'
    );
  }

  return {
    document_id: documentId || String(frontmatter.document_id || '').trim(),
    graph_refs: graphRefs,
    sync_version: syncVersion
  };
}

/**
 * Parses the explicitly system-owned body block. Markers themselves are HTML
 * comments, but relation lines stay normal Markdown so Obsidian recognises
 * their wikilinks and backlinks.
 */
export function parseGraphSystemBlock(markdown) {
  const parsed = parseDelimitedRelationsBlock(markdown, {
    beginMarker: BEGIN_MARKER,
    endMarker: END_MARKER,
    duplicateCode: 'CA_SYSTEM_BLOCK_DUPLICATE',
    malformedCode: 'CA_SYSTEM_BLOCK_MALFORMED',
    label: 'CA:SYSTEM'
  });
  if (!parsed.present) {
    return { present: false, version: null, checksum: null, actual_checksum: null, checksum_valid: true, relations: [] };
  }
  const actualChecksum = checksumForBlockBody(parsed.body);
  const checksum = parsed.marker.checksum || null;
  return {
    present: true,
    version: parsed.version,
    checksum,
    actual_checksum: actualChecksum,
    checksum_valid: Boolean(checksum) && checksum === actualChecksum,
    relations: parsed.relations,
    start_offset: parsed.start_offset,
    end_offset: parsed.end_offset
  };
}

/**
 * Parses the human-owned authoring block. It deliberately has no checksum:
 * a vault author may add or remove typed relationships, while the following
 * vault sync validates and reconciles the DB projection transactionally.
 */
export function parseGraphAuthoringBlock(markdown) {
  return parseDelimitedRelationsBlock(markdown, {
    beginMarker: AUTHOR_BEGIN_MARKER,
    endMarker: AUTHOR_END_MARKER,
    duplicateCode: 'CA_RELATIONS_BLOCK_DUPLICATE',
    malformedCode: 'CA_RELATIONS_BLOCK_MALFORMED',
    label: 'CA:RELATIONS'
  });
}

function canonicalRelationForRender(relation) {
  const edgeType = String(relation?.edge_type || '').trim();
  if (!EDGE_TYPE_PATTERN.test(edgeType)) {
    throw new GraphMarkdownProjectionError('CA_SYSTEM_RELATION_TYPE_INVALID', 'A kapcsolat típusa érvénytelen.', { relation });
  }
  const rawTarget = relation?.target_reference || relation?.target || '';
  const target = parseWikiTarget(rawTarget);
  const rawGraphRefs = relation?.graph_refs ?? relation?.graph_ids ?? (relation?.graph_ref ? [relation.graph_ref] : []);
  const graphRefs = (Array.isArray(rawGraphRefs) ? rawGraphRefs : [rawGraphRefs])
    .map(value => String(value || '').trim())
    .filter(Boolean);
  if (graphRefs.some(graphRef => !GRAPH_REF_PATTERN.test(graphRef))) {
    throw new GraphMarkdownProjectionError('CA_SYSTEM_RELATION_GRAPH_INVALID', 'A kapcsolat gráfazonosítója érvénytelen.', { relation });
  }
  if (new Set(graphRefs).size !== graphRefs.length) {
    throw new GraphMarkdownProjectionError('CA_SYSTEM_RELATION_GRAPH_DUPLICATE', 'A kapcsolat gráfazonosítója ismétlődik.', { relation });
  }
  const direction = String(relation?.direction || 'outbound').trim();
  if (!['outbound', 'inbound', 'both'].includes(direction)) {
    throw new GraphMarkdownProjectionError('CA_SYSTEM_RELATION_DIRECTION_INVALID', 'A kapcsolat iránya outbound, inbound vagy both lehet.', { relation });
  }
  return { edge_type: edgeType, direction, ...target, graph_ref: graphRefs[0] || null, graph_refs: graphRefs };
}

export function renderGraphSystemBlock({ relations = [], version = CA_SYSTEM_BLOCK_VERSION } = {}) {
  if (!Number.isInteger(version) || version < 1) {
    throw new GraphMarkdownProjectionError('CA_SYSTEM_VERSION_INVALID', 'A CA:SYSTEM blokk verziója pozitív egész szám legyen.');
  }
  const normalizedRelations = relations.map(canonicalRelationForRender);
  assertUniqueRelations(normalizedRelations);
  const relationLines = normalizedRelations.map(relation => {
    const label = relation.target_label ? `|${relation.target_label}` : '';
    const heading = relation.target_heading ? `#${relation.target_heading}` : '';
    const graph = relation.graph_refs.length
      ? ` · ${relation.graph_refs.length === 1 ? 'graph' : 'graphs'}: ${relation.graph_refs.join(', ')}`
      : '';
    const arrow = relation.direction === 'inbound' ? '←' : (relation.direction === 'both' ? '↔' : '→');
    return `- ${relation.edge_type} ${arrow} [[${relation.target_reference}${heading}${label}]]${graph}`;
  });
  const body = ['## Rendszerkapcsolatok', '', ...relationLines].join('\n').replace(/\n+$/, '');
  const checksum = checksumForBlockBody(body);
  return `<!-- CA:SYSTEM:BEGIN v${version} checksum="${checksum}" -->\n${body}\n<!-- CA:SYSTEM:END -->`;
}

/**
 * Produces a new note with only the system-owned span changed. Existing drift
 * is fail-closed: callers must explicitly reconcile a manually changed block.
 */
export function upsertGraphSystemBlock(markdown, options = {}) {
  const source = normalizeLineEndings(markdown);
  const parsed = parseGraphSystemBlock(source);
  if (parsed.present && !parsed.checksum_valid) {
    throw new GraphMarkdownProjectionError(
      'CA_SYSTEM_BLOCK_DRIFT',
      'A CA:SYSTEM blokk kézzel módosult; a rendszer nem írhatja felül némán.',
      { expected_checksum: parsed.checksum, actual_checksum: parsed.actual_checksum }
    );
  }
  const block = renderGraphSystemBlock(options);
  if (!parsed.present) {
    const separator = source.endsWith('\n') ? '\n' : '\n\n';
    return `${source}${separator}${block}\n`;
  }
  const suffix = source.slice(parsed.end_offset);
  // `end_offset` intentionally consumes the final newline after the marker.
  // Preserve it when the block was the final document section so repeated
  // projections are byte-stable rather than rewriting on every sync.
  const finalNewline = !suffix && source.endsWith('\n') ? '\n' : '';
  return `${source.slice(0, parsed.start_offset)}${block}${suffix || finalNewline}`;
}

export function graphSystemBlockChecksum(body) {
  return checksumForBlockBody(body);
}
