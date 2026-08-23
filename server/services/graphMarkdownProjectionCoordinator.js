import fs from 'node:fs';
import path from 'node:path';
import { graphService } from './graphService.js';
import { resolveLocalVaultRoot } from './localVaultService.js';
import { writeVaultGraphProjection } from './vaultGraphProjectionWriter.js';

function isSameOrDescendant(candidatePath, parentPath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function normalizedRelativeMarkdownPath(value) {
  const normalized = String(value || '')
    .trim()
    .replace(/[\\/]+/g, path.sep);
  if (!normalized || path.isAbsolute(normalized) || path.extname(normalized).toLowerCase() !== '.md') return null;
  return normalized;
}

function resolveCanonicalMarkdownFile(relativePath, vaultRoot) {
  const normalized = normalizedRelativeMarkdownPath(relativePath);
  if (!normalized) return null;
  const root = fs.realpathSync(vaultRoot);
  const candidate = path.resolve(root, normalized);
  if (!isSameOrDescendant(candidate, root) || !fs.existsSync(candidate)) return null;
  const stat = fs.lstatSync(candidate);
  if (!stat.isFile() || stat.isSymbolicLink()) return null;
  const realFile = fs.realpathSync(candidate);
  if (!isSameOrDescendant(realFile, root)) return null;
  return { root, file_path: realFile };
}

function markdownPathFromNode(node, vaultRoot) {
  if (node?.source_system !== 'markdown') return null;
  return resolveCanonicalMarkdownFile(node.metadata?.source_path, vaultRoot);
}

function targetWikiLinkReference(target, vaultRoot) {
  // A generated system block must never invent an unresolved link from a
  // generic SQL/manual node. Only an actual, canonical Markdown target earns
  // an Obsidian wikilink projection.
  if (target?.source_system !== 'markdown') return null;
  const resolved = resolveCanonicalMarkdownFile(target.metadata?.source_path, vaultRoot);
  if (!resolved) return null;
  const relative = path.relative(resolved.root, resolved.file_path)
    .replace(/[\\/]+/g, '/')
    .replace(/\.md$/i, '');
  return relative || null;
}

function compactError(error) {
  return {
    code: String(error?.code || error?.message || 'CA_SYSTEM_PROJECTION_FAILED').slice(0, 160),
    message: String(error?.message || 'A CA:SYSTEM vetítés sikertelen.').slice(0, 500)
  };
}

function canonicalSystemRelations(relations, vaultRoot) {
  const canonical = [];
  const skipped = [];
  const dedupe = new Set();
  for (const relation of relations) {
    // `markdown_projection` is the human CA:RELATIONS import projection. It
    // must never be echoed into the DB-owned CA:SYSTEM mirror.
    if (relation.origin === 'markdown_projection') continue;
    const edgeType = String(relation.edge_type?.slug || '').trim();
    const direction = String(relation.direction || '').trim();
    const targetReference = targetWikiLinkReference(relation.target, vaultRoot);
    if (!edgeType || !targetReference || !['outbound', 'inbound', 'both'].includes(direction)) {
      skipped.push({
        edge_id: relation.edge_id,
        reason: !edgeType
          ? 'UNSAFE_EDGE_TYPE'
          : (!targetReference ? 'TARGET_WIKILINK_UNRESOLVED' : 'INVALID_RELATION_DIRECTION')
      });
      continue;
    }
    const graphRefs = [...new Set((relation.graph_ids || []).map(value => String(value || '').trim()).filter(Boolean))]
      .sort((first, second) => first.localeCompare(second));
    const key = [edgeType, direction, targetReference, ...graphRefs].join('\u0000');
    if (dedupe.has(key)) {
      skipped.push({ edge_id: relation.edge_id, reason: 'DUPLICATE_SYSTEM_RELATION' });
      continue;
    }
    dedupe.add(key);
    canonical.push({
      edge_type: edgeType,
      direction,
      target_reference: targetReference,
      graph_refs: graphRefs
    });
  }
  return { relations: canonical, skipped };
}

function summarize(results) {
  const counts = results.reduce((summary, result) => {
    summary.attempted += 1;
    if (result.status === 'UPDATED') summary.updated += 1;
    else if (result.status === 'UNCHANGED') summary.unchanged += 1;
    else if (result.status.startsWith('SKIPPED')) summary.skipped += 1;
    else if (result.status === 'FAILED') summary.failed += 1;
    return summary;
  }, { attempted: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 });
  return {
    ...counts,
    retry_node_ids: results.filter(result => result.status === 'FAILED').map(result => result.node_id),
    results
  };
}

/**
 * Coordinates the DB → Markdown direction only.  It has no transaction with
 * SQLite by design: an admin graph mutation is canonical after its DB commit;
 * a filesystem projection failure is reported for retry, never rolled back.
 */
export const graphMarkdownProjectionCoordinator = {
  projectMarkdownNode({ nodeId, vaultRoot = null, expectedSourceHash = null } = {}) {
    let node;
    try {
      node = graphService.getNode(nodeId);
    } catch (error) {
      return { node_id: String(nodeId || ''), status: 'FAILED', error: compactError(error) };
    }

    if (node.source_system !== 'markdown') {
      return { node_id: node.id, status: 'SKIPPED_NOT_MARKDOWN_NODE', relations_count: 0 };
    }

    let root;
    try {
      root = vaultRoot ? path.resolve(vaultRoot) : resolveLocalVaultRoot();
      const source = markdownPathFromNode(node, root);
      if (!source) {
        return {
          node_id: node.id,
          status: 'SKIPPED_SOURCE_FILE_UNRESOLVED',
          source_path: node.metadata?.source_path || null,
          relations_count: 0
        };
      }
      const relationResult = graphService.listMarkdownProjectionRelations({ sourceNodeId: node.id });
      const projection = canonicalSystemRelations(relationResult.relations, source.root);
      const write = writeVaultGraphProjection({
        filePath: source.file_path,
        vaultRoot: source.root,
        relations: projection.relations,
        expectedSourceHash
      });
      return {
        node_id: node.id,
        status: write.status,
        source_path: node.metadata?.source_path || null,
        file_path: write.file_path,
        backup_path: write.backup_path,
        source_hash: write.source_hash,
        updated_hash: write.updated_hash || null,
        relations_count: projection.relations.length,
        skipped_relations: projection.skipped
      };
    } catch (error) {
      return {
        node_id: node.id,
        status: 'FAILED',
        source_path: node.metadata?.source_path || null,
        error: compactError(error)
      };
    }
  },

  projectCommittedEdges({ edges = [], vaultRoot = null } = {}) {
    // An arc changes the rendered perspective at *both* endpoints: its source
    // shows an outbound relation and its target shows the corresponding
    // inbound relation.  This is also deliberately fed with hydrated deleted
    // edge rows so a deletion can clear stale CA:SYSTEM entries on both notes.
    const nodeIds = [...new Set((Array.isArray(edges) ? edges : [])
      .filter(edge => edge && edge.origin !== 'markdown_projection')
      .flatMap(edge => [edge.source_node_id, edge.target_node_id])
      .map(value => String(value || '').trim())
      .filter(Boolean))];
    return summarize(nodeIds.map(nodeId => this.projectMarkdownNode({ nodeId, vaultRoot })));
  },

  retryMarkdownNodes({ nodeIds = [], vaultRoot = null } = {}) {
    const normalizedNodeIds = [...new Set((Array.isArray(nodeIds) ? nodeIds : [])
      .map(value => String(value || '').trim())
      .filter(Boolean))];
    return summarize(normalizedNodeIds.map(nodeId => this.projectMarkdownNode({ nodeId, vaultRoot })));
  }
};
