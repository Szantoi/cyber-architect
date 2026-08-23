import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db.js';
import { dbService } from '../../services/dbService.js';
import { graphService } from '../../services/graphService.js';
import { localVaultService } from '../../services/localVaultService.js';

let vaultRoot;
let previousVaultRoot;

function markdown({
  slug,
  documentId,
  title = 'Vault document',
  contentType = 'knowledge',
  presentationProfile = undefined,
  body = '# Canonical body',
  relations = undefined
}) {
  const frontmatter = [
    '---',
    `title: "${title}"`,
    `slug: "${slug}"`,
    ...(contentType === undefined || contentType === null ? [] : [`content_type: "${contentType}"`]),
    ...(presentationProfile === undefined ? [] : [`presentation_profile: "${presentationProfile}"`]),
    `document_id: "${documentId}"`,
    'classification: internal',
    'published: false',
    ...(relations ? [`relations: ${JSON.stringify(relations)}`] : []),
    '---',
    ''
  ].join('\n');
  return `${frontmatter}\n${body}\n`;
}

function writeVaultFile(relativePath, content) {
  const target = path.join(vaultRoot, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

function clearFixtureRecords() {
  db.prepare("DELETE FROM graph_edges WHERE created_by LIKE 'TEST_LOCAL_VAULT%'").run();
  db.prepare("DELETE FROM graph_definitions WHERE created_by LIKE 'TEST_LOCAL_VAULT%'").run();
  db.prepare("DELETE FROM graph_nodes WHERE created_by LIKE 'TEST_LOCAL_VAULT%'").run();
  db.prepare("DELETE FROM graph_edge_types WHERE created_by LIKE 'TEST_LOCAL_VAULT%'").run();
  db.exec("DELETE FROM blog_posts WHERE slug LIKE 'vault-test-%'");
  db.prepare("DELETE FROM settings WHERE key = 'taxonomy_vocabulary_bootstrap_v1'").run();
}

beforeEach(() => {
  previousVaultRoot = process.env.CYBER_ARCHITECT_CONTENT_ROOT;
  vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-vault-'));
  process.env.CYBER_ARCHITECT_CONTENT_ROOT = vaultRoot;
  clearFixtureRecords();
});

afterEach(() => {
  clearFixtureRecords();
  fs.rmSync(vaultRoot, { recursive: true, force: true });
  if (previousVaultRoot === undefined) delete process.env.CYBER_ARCHITECT_CONTENT_ROOT;
  else process.env.CYBER_ARCHITECT_CONTENT_ROOT = previousVaultRoot;
});

describe('localVaultService', () => {
  it('edits a canonical Markdown source with revision protection and refreshes its projections', () => {
    const suffix = crypto.randomUUID();
    const slug = `vault-test-inline-editor-${suffix}`;
    const sourcePath = `Content/01_Test/${slug}/index.md`;
    const filePath = writeVaultFile(sourcePath, markdown({
      slug,
      documentId: `kb:test:inline-editor:${suffix}`,
      title: 'Eredeti cím',
      body: '# Eredeti törzs\n\nAz eredeti dokumentum tartalma.'
    }));

    expect(localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' }).errors).toEqual([]);
    const initial = localVaultService.getEditableDocument(slug);
    const replacement = initial.content
      .replace('Eredeti cím', 'Frissített cím')
      .replace('Az eredeti dokumentum tartalma.', 'A közvetlen szerkesztőből mentett tartalom.');

    const result = localVaultService.updateEditableDocument({
      slug,
      content: replacement,
      revision: initial.revision,
      actor: 'TEST_LOCAL_VAULT_INLINE_EDITOR'
    });

    expect(initial).toMatchObject({
      slug,
      source_path: sourcePath,
      content: expect.stringContaining('---'),
      revision: expect.stringMatching(/^[a-f0-9]{64}$/)
    });
    expect(result.sync).toMatchObject({ errors: [], processed: 1, updated: 1 });
    expect(result.document).toMatchObject({
      slug,
      source_path: sourcePath,
      content: expect.stringContaining('A közvetlen szerkesztőből mentett tartalom.'),
      revision: expect.not.stringMatching(new RegExp(`^${initial.revision}$`))
    });
    expect(result.backup_path).toMatch(/^\.cyberarchitect-backups\/inline-editor\//);
    expect(fs.readFileSync(path.join(vaultRoot, ...result.backup_path.split('/')), 'utf8')).toBe(initial.content);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(replacement);
    expect(dbService.getBlogPostBySlug(slug, { publishedOnly: false, visibility: 'all' })).toMatchObject({
      title: 'Frissített cím',
      content: expect.stringContaining('A közvetlen szerkesztőből mentett tartalom.')
    });
  });

  it('fails closed when the source changed after an editor opened it or when its identity changes', () => {
    const suffix = crypto.randomUUID();
    const slug = `vault-test-inline-conflict-${suffix}`;
    const sourcePath = `Content/01_Test/${slug}/index.md`;
    const filePath = writeVaultFile(sourcePath, markdown({
      slug,
      documentId: `kb:test:inline-conflict:${suffix}`
    }));

    expect(localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' }).errors).toEqual([]);
    const initial = localVaultService.getEditableDocument(slug);
    const externallyChanged = initial.content.replace('Canonical body', 'Obsidian módosítás');
    fs.writeFileSync(filePath, externallyChanged, 'utf8');

    expect(() => localVaultService.updateEditableDocument({
      slug,
      content: initial.content.replace('Canonical body', 'Régi böngészőváltozat'),
      revision: initial.revision,
      actor: 'TEST_LOCAL_VAULT_INLINE_EDITOR'
    })).toThrow(/időközben megváltozott/i);
    expect(fs.readFileSync(filePath, 'utf8')).toBe(externallyChanged);

    const refreshed = localVaultService.getEditableDocument(slug);
    const renamed = refreshed.content.replace(`slug: "${slug}"`, `slug: "${slug}-renamed"`);
    try {
      localVaultService.updateEditableDocument({
        slug,
        content: renamed,
        revision: refreshed.revision,
        actor: 'TEST_LOCAL_VAULT_INLINE_EDITOR'
      });
      throw new Error('Expected the inline editor to reject a slug change.');
    } catch (error) {
      expect(error.code).toBe('VAULT_DOCUMENT_IDENTITY_CHANGE_FORBIDDEN');
    }
    expect(fs.readFileSync(filePath, 'utf8')).toBe(externallyChanged);
  });

  it('reads neutral Content documents without relying on legacy folder names', () => {
    const suffix = crypto.randomUUID();
    const articleSlug = `vault-test-neutral-article-${suffix}`;
    const defaultSlug = `vault-test-neutral-default-${suffix}`;
    const explicitKnowledgeSlug = `vault-test-explicit-knowledge-${suffix}`;

    writeVaultFile(`Content/01_Test/${articleSlug}/index.md`, markdown({
      slug: articleSlug,
      documentId: `doc:test:neutral-article:${suffix}`,
      contentType: null,
      presentationProfile: 'article'
    }));
    writeVaultFile(`Content/01_Test/${defaultSlug}/index.md`, markdown({
      slug: defaultSlug,
      documentId: `doc:test:neutral-default:${suffix}`,
      contentType: null
    }));
    // The physical collection must not override the explicit profile.
    writeVaultFile(`Content/02_Cikkek/${explicitKnowledgeSlug}/index.md`, markdown({
      slug: explicitKnowledgeSlug,
      documentId: `doc:test:explicit-profile:${suffix}`,
      contentType: 'knowledge'
    }));

    const status = localVaultService.getStatus();
    const result = localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' });
    const article = dbService.getBlogPostBySlug(articleSlug, { publishedOnly: false, visibility: 'all' });
    const neutralDefault = dbService.getBlogPostBySlug(defaultSlug, { publishedOnly: false, visibility: 'all' });
    const explicitKnowledge = dbService.getBlogPostBySlug(explicitKnowledgeSlug, { publishedOnly: false, visibility: 'all' });

    expect(status).toMatchObject({
      content_vault_dir: path.join(vaultRoot, 'Content'),
      content_files_count: 3,
      local_files_detected: 3
    });
    expect(result).toMatchObject({ discovered: 3, processed: 3, created: 3, errors: [] });
    expect(article).toMatchObject({
      presentation_profile: 'article',
      content_type: 'blog',
      drive_path: `Content/01_Test/${articleSlug}/index.md`
    });
    expect(neutralDefault).toMatchObject({
      presentation_profile: 'knowledge',
      content_type: 'knowledge'
    });
    expect(explicitKnowledge).toMatchObject({
      presentation_profile: 'knowledge',
      content_type: 'knowledge',
      drive_path: `Content/02_Cikkek/${explicitKnowledgeSlug}/index.md`
    });
    expect(db.prepare('SELECT presentation_profile FROM blog_posts WHERE id = ?').get(article.id))
      .toEqual({ presentation_profile: 'article' });
  });

  it('fails closed when a legacy root remains beside otherwise valid Content packages', () => {
    const suffix = crypto.randomUUID();
    const slug = `vault-test-canonical-with-legacy-${suffix}`;
    writeVaultFile(`Content/01_Test/${slug}/index.md`, markdown({
      slug,
      documentId: `doc:test:canonical-with-legacy:${suffix}`
    }));
    writeVaultFile(
      `KnowledgeBase/01_Test/vault-test-legacy-copy-${suffix}/legacy.md`,
      '# This legacy copy must not be indexed.\n'
    );

    const status = localVaultService.getStatus();
    const result = localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' });

    expect(status.legacy_roots_detected).toEqual([
      expect.objectContaining({ path: 'KnowledgeBase', files_count: 1 })
    ]);
    expect(result).toMatchObject({ discovered: 1, processed: 0 });
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'VAULT_LEGACY_ROOT_DETECTED', source_path: 'KnowledgeBase' })
    ]));
    expect(dbService.getBlogPostBySlug(slug, { publishedOnly: false, visibility: 'all' })).toBeNull();
  });

  it('fails closed when explicit presentation_profile and legacy content_type contradict', () => {
    const suffix = crypto.randomUUID();
    const slug = `vault-test-profile-conflict-${suffix}`;
    writeVaultFile(`Content/01_Test/${slug}/index.md`, markdown({
      slug,
      documentId: `doc:test:profile-conflict:${suffix}`,
      contentType: 'knowledge',
      presentationProfile: 'article'
    }));

    const result = localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' });

    expect(result.processed).toBe(0);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'VAULT_PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT', slug })
    ]));
    expect(dbService.getBlogPostBySlug(slug, { publishedOnly: false, visibility: 'all' })).toBeNull();
  });

  it('projects canonical flat Obsidian taxonomy lists into the portal dimensions projection', () => {
    const suffix = crypto.randomUUID();
    const slug = `vault-test-taxonomy-${suffix}`;
    const documentId = `kb:test:taxonomy:${suffix}`;
    writeVaultFile(`Content/01_Test/${slug}/index.md`, `---
title: "Canonical taxonomy"
slug: "${slug}"
content_type: "knowledge"
document_id: "${documentId}"
schema_version: 2
taxonomy_schema: 2
tax_industry:
  - "manufacturing"
tax_technology:
  - "obsidian"
  - "graph-rag"
tax_audience_role:
  - "process-engineer"
classification: internal
published: false
---

# Canonical taxonomy
`);

    const result = localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' });
    const stored = dbService.getBlogPostBySlug(slug, { publishedOnly: false, visibility: 'all' });

    expect(result.errors).toEqual([]);
    expect(stored.dimensions).toEqual({
      iparag: ['manufacturing'],
      technologia: ['obsidian', 'graph-rag'],
      celcsoport: ['process-engineer']
    });
    expect(db.prepare(`
      SELECT d.id AS dimension_id, t.slug
      FROM content_taxonomy_assignments a
      JOIN taxonomy_terms t ON t.id = a.term_id
      JOIN taxonomy_dimensions d ON d.id = t.dimension_id
      WHERE a.post_id = ?
      ORDER BY d.sort_order, a.ordinal
    `).all(stored.id)).toEqual([
      { dimension_id: 'industry', slug: 'manufacturing' },
      { dimension_id: 'technology', slug: 'obsidian' },
      { dimension_id: 'technology', slug: 'graph-rag' },
      { dimension_id: 'audience_role', slug: 'process-engineer' }
    ]);
  });

  it('imports plain Obsidian notes safely and leaves wiki links in the base hybrid index', () => {
    const suffix = crypto.randomUUID();
    const sourceStem = `vault-test-obsidian-Árvíztűrő-${suffix}`;
    const targetStem = `vault-test-obsidian-Cél-${suffix}`;
    const plainStem = `vault-test-obsidian-Plain-${suffix}`;
    const sourceSlug = `vault-test-obsidian-arvizturo-${suffix}`;
    const targetSlug = `vault-test-obsidian-cel-${suffix}`;
    const sourcePath = `Content/Imported/${sourceStem}/index.md`;
    const targetPath = `Content/Imported/${targetStem}/index.md`;
    const plainPath = `Content/Imported/${plainStem}/index.md`;

    writeVaultFile(sourcePath, `# Ékezetes H1 cím

Ez egy frontmatter nélküli Obsidian jegyzet.
[[${targetStem}]]
`);
    writeVaultFile(targetPath, '# Céljegyzet\n');
    writeVaultFile(plainPath, 'Frontmatter nélküli különálló jegyzet.\n');

    const result = localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' });
    const source = dbService.getBlogPostBySlug(sourceSlug, { publishedOnly: false, visibility: 'all' });
    const target = dbService.getBlogPostBySlug(targetSlug, { publishedOnly: false, visibility: 'all' });
    const plain = dbService.getBlogPostBySlug(`vault-test-obsidian-plain-${suffix}`, { publishedOnly: false, visibility: 'all' });

    expect(result).toMatchObject({ discovered: 3, processed: 3, created: 3, errors: [] });
    expect(source).toMatchObject({
      slug: sourceSlug,
      title: 'Ékezetes H1 cím',
      content_type: 'knowledge',
      visibility: 'private',
      published: 0,
      drive_path: sourcePath,
      drive_file_id: expect.stringMatching(/^vault_[a-f0-9]{64}$/)
    });
    expect(target).toMatchObject({
      title: 'Céljegyzet',
      content_type: 'knowledge',
      visibility: 'private',
      published: 0
    });
    expect(plain).toMatchObject({
      title: plainStem,
      content_type: 'knowledge',
      visibility: 'private',
      published: 0
    });

    const indexedFrontmatter = db.prepare(`
      SELECT frontmatter_json
      FROM hybrid_rag_documents
      WHERE post_id = ?
    `).get(source.id);
    expect(JSON.parse(indexedFrontmatter.frontmatter_json)).toEqual({
      classification: 'internal',
      document_id: '',
      rag_index: true
    });
    expect(db.prepare(`
      SELECT target_slug, target_post_id, relation_type
      FROM hybrid_rag_edges
      WHERE source_post_id = ?
    `).all(source.id)).toEqual([{
      target_slug: targetSlug,
      target_post_id: target.id,
      relation_type: 'wikilink'
    }]);
    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM graph_nodes
      WHERE source_system = 'markdown' AND source_reference IN (?, ?, ?)
    `).get(sourcePath, targetPath, plainPath).count).toBe(0);
    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM graph_node_memberships membership
      JOIN graph_nodes node ON node.id = membership.node_id
      WHERE node.source_system = 'markdown' AND node.source_reference IN (?, ?, ?)
    `).get(sourcePath, targetPath, plainPath).count).toBe(0);
    expect(db.prepare(`
      SELECT COUNT(*) AS count
      FROM graph_edges
      WHERE projection_source_key IN (?, ?, ?, ?, ?, ?)
    `).get(
      sourcePath,
      targetPath,
      plainPath,
      `project-binding:${sourcePath}`,
      `project-binding:${targetPath}`,
      `project-binding:${plainPath}`
    ).count).toBe(0);
  });

  it('fails closed when canonical and legacy taxonomy representations disagree', () => {
    const suffix = crypto.randomUUID();
    const slug = `vault-test-taxonomy-conflict-${suffix}`;
    writeVaultFile(`Content/01_Test/${slug}/index.md`, `---
title: "Taxonomy conflict"
slug: "${slug}"
content_type: "knowledge"
document_id: "kb:test:taxonomy-conflict:${suffix}"
tax_industry: [manufacturing]
dimensions:
  iparag: [finance]
---

# Conflict
`);

    const result = localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' });

    expect(result.processed).toBe(0);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'FRONTMATTER_TAXONOMY_CONFLICT', slug })
    ]));
  });

  it('fails closed when an explicitly system-owned graph block has drifted', () => {
    const suffix = crypto.randomUUID();
    const slug = `vault-test-graph-drift-${suffix}`;
    writeVaultFile(`Content/01_Test/${slug}/index.md`, markdown({
      slug,
      documentId: `kb:test:graph-drift:${suffix}`,
      body: `# Emberi tartalom

<!-- CA:SYSTEM:BEGIN v1 checksum="sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" -->
## Rendszerkapcsolatok

- depends_on → [[TASK-004]]
<!-- CA:SYSTEM:END -->`
    }));

    const result = localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' });

    expect(result.processed).toBe(0);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CA_SYSTEM_BLOCK_DRIFT', slug })
    ]));
  });

  it('accepts a human-authored typed relation block as a vault graph input', () => {
    const suffix = crypto.randomUUID();
    const slug = `vault-test-graph-authoring-${suffix}`;
    const targetSlug = `vault-test-graph-target-${suffix}`;
    const graphId = `project/prj-${suffix}`;
    const edgeTypeId = `depends_on_${suffix.replace(/-/g, '')}`;
    graphService.createGraph({
      id: graphId,
      slug: `prj-${suffix.replace(/-/g, '')}`,
      name: 'Vault szerzői gráf',
      visibility: 'private'
    }, 'TEST_LOCAL_VAULT_GRAPH_SETUP');
    graphService.createEdgeType({
      id: edgeTypeId,
      slug: `depends-on-${suffix.replace(/-/g, '')}`,
      label: 'Függ ettől',
      visibility: 'private'
    }, 'TEST_LOCAL_VAULT_GRAPH_SETUP');
    writeVaultFile(`Content/01_Test/${slug}/index.md`, markdown({
      slug,
      documentId: `kb:test:graph-authoring:${suffix}`,
      body: `# Emberi tartalom

<!-- CA:RELATIONS:BEGIN v1 -->
## Saját típusos kapcsolatok

- ${edgeTypeId} → [[${targetSlug}]] · graph: ${graphId}
<!-- CA:RELATIONS:END -->`
    }));
    writeVaultFile(`Content/01_Test/${targetSlug}/index.md`, markdown({
      slug: targetSlug,
      documentId: `kb:test:graph-target:${suffix}`
    }));

    const result = localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' });

    expect(result.errors).toEqual([]);
    expect(result.processed).toBe(2);
    const graphEdges = db.prepare(`
      SELECT e.origin, e.projection_source_key, e.edge_type_id, source.source_reference AS source_ref, target.source_reference AS target_ref
      FROM graph_edges e
      JOIN graph_nodes source ON source.id = e.source_node_id
      JOIN graph_nodes target ON target.id = e.target_node_id
      WHERE e.origin = 'markdown_projection' AND e.projection_source_key = ?
    `).all(`kb:test:graph-authoring:${suffix}`);
    expect(graphEdges).toEqual([
      expect.objectContaining({
        origin: 'markdown_projection',
        edge_type_id: edgeTypeId,
        source_ref: `kb:test:graph-authoring:${suffix}`,
        target_ref: `kb:test:graph-target:${suffix}`
      })
    ]);
  });

  it('preserves inbound and paired authoring directions as directed graph arcs', () => {
    const suffix = crypto.randomUUID();
    const sourceSlug = `vault-test-graph-directions-${suffix}`;
    const targetSlug = `vault-test-graph-direction-target-${suffix}`;
    const graphId = `project/prj-directions-${suffix}`;
    const edgeTypeId = `relates_to_${suffix.replace(/-/g, '')}`;
    graphService.createGraph({
      id: graphId,
      slug: `prj-directions-${suffix.replace(/-/g, '')}`,
      name: 'Vault iránygráf',
      visibility: 'private'
    }, 'TEST_LOCAL_VAULT_GRAPH_SETUP');
    graphService.createEdgeType({
      id: edgeTypeId,
      slug: `relates-to-${suffix.replace(/-/g, '')}`,
      label: 'Kapcsolódik',
      visibility: 'private'
    }, 'TEST_LOCAL_VAULT_GRAPH_SETUP');
    const sourceDocumentId = `kb:test:graph-directions:${suffix}`;
    const targetDocumentId = `kb:test:graph-direction-target:${suffix}`;
    writeVaultFile(`Content/01_Test/${sourceSlug}/index.md`, markdown({
      slug: sourceSlug,
      documentId: sourceDocumentId,
      body: `<!-- CA:RELATIONS:BEGIN v1 -->
- ${edgeTypeId} ← [[${targetSlug}]] · graph: ${graphId}
- ${edgeTypeId} ↔ [[${targetSlug}]] · graph: ${graphId}
<!-- CA:RELATIONS:END -->`
    }));
    writeVaultFile(`Content/01_Test/${targetSlug}/index.md`, markdown({
      slug: targetSlug,
      documentId: targetDocumentId
    }));

    const result = localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' });
    expect(result.errors).toEqual([]);
    const graphEdges = db.prepare(`
      SELECT source.source_reference AS source_ref, target.source_reference AS target_ref, relation_group_id
      FROM graph_edges e
      JOIN graph_nodes source ON source.id = e.source_node_id
      JOIN graph_nodes target ON target.id = e.target_node_id
      WHERE e.origin = 'markdown_projection' AND e.projection_source_key = ?
      ORDER BY e.id
    `).all(sourceDocumentId);
    expect(graphEdges).toHaveLength(3);
    expect(graphEdges).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_ref: targetDocumentId, target_ref: sourceDocumentId, relation_group_id: '' }),
      expect.objectContaining({ source_ref: sourceDocumentId, target_ref: targetDocumentId, relation_group_id: expect.stringMatching(/^relation_/) }),
      expect.objectContaining({ source_ref: targetDocumentId, target_ref: sourceDocumentId, relation_group_id: expect.stringMatching(/^relation_/) })
    ]));
  });

  it('uses the local vault as the sole atomic source for SQLite and the hybrid index', () => {
    const suffix = crypto.randomUUID();
    const slug = `vault-test-${suffix}`;
    const documentId = `kb:test:${suffix}`;
    writeVaultFile(
      `Content/01_Test/${slug}/index.md`,
      markdown({ slug, documentId, body: '# First local body\n\n[[related-document]]' })
    );

    const first = localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' });

    expect(first).toMatchObject({
      operation: 'LOCAL_VAULT_SYNC',
      source_of_truth: 'LOCAL_VAULT',
      discovered: 1,
      processed: 1,
      created: 1,
      errors: []
    });
    const stored = dbService.getBlogPostBySlug(slug, { publishedOnly: false, visibility: 'all' });
    expect(stored).toMatchObject({
      content_type: 'knowledge',
      content: expect.stringContaining('First local body'),
      drive_path: `Content/01_Test/${slug}/index.md`,
      drive_file_id: expect.stringMatching(/^vault_[a-f0-9]{64}$/)
    });
    const indexed = db.prepare(`
      SELECT document_id, source_path, source_hash
      FROM hybrid_rag_documents
      WHERE post_id = ?
    `).get(stored.id);
    expect(indexed).toMatchObject({
      document_id: documentId,
      source_path: `Content/01_Test/${slug}/index.md`,
      source_hash: expect.any(String)
    });

    writeVaultFile(
      `Content/01_Test/${slug}/index.md`,
      markdown({ slug, documentId, body: '# Second local body\n\n[[changed-target]]' })
    );
    const second = localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' });
    const refreshed = dbService.getBlogPostBySlug(slug, { publishedOnly: false, visibility: 'all' });

    expect(second).toMatchObject({ created: 0, updated: 1, processed: 1, errors: [] });
    expect(refreshed).toMatchObject({ id: stored.id, content: expect.stringContaining('Second local body') });
    expect(db.prepare('SELECT COUNT(*) AS count FROM blog_posts WHERE slug = ?').get(slug).count).toBe(1);
  });

  it('fails closed before any write when the vault contains a duplicate slug', () => {
    const suffix = crypto.randomUUID();
    const slug = `vault-test-${suffix}`;
    writeVaultFile(
      `Content/01_Test/${slug}/index.md`,
      markdown({ slug, documentId: `kb:test:a:${suffix}` })
    );
    writeVaultFile(
      `Content/02_Test/${slug}/index.md`,
      markdown({ slug, documentId: `blog:test:b:${suffix}`, contentType: 'blog' })
    );

    const result = localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' });

    expect(result.processed).toBe(0);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'VAULT_DUPLICATE_SLUG', slug })
    ]));
    expect(dbService.getBlogPostBySlug(slug, { publishedOnly: false, visibility: 'all' })).toBeNull();
  });

  it('does not partially apply valid documents when any document is invalid', () => {
    const suffix = crypto.randomUUID();
    const validSlug = `vault-test-valid-${suffix}`;
    writeVaultFile(
      `Content/01_Test/${validSlug}/index.md`,
      markdown({ slug: validSlug, documentId: `kb:test:valid:${suffix}` })
    );
    writeVaultFile('Content/01_Test/invalid/index.md', ['---', 'title: [not valid YAML', '---', ''].join('\n'));

    const result = localVaultService.sync({ actor: 'TEST_LOCAL_VAULT' });

    expect(result.processed).toBe(0);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'VAULT_FRONTMATTER_INVALID' })
    ]));
    expect(dbService.getBlogPostBySlug(validSlug, { publishedOnly: false, visibility: 'all' })).toBeNull();
  });
});
