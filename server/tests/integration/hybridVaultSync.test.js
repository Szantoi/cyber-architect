import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../db.js';
import { syncKnowledgeBase } from '../../scripts/syncLocalKnowledgeBase.js';

const temporaryRoots = [];
const previousVaultRoot = process.env.CYBER_ARCHITECT_CONTENT_ROOT;

function writeMarkdown(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
  if (previousVaultRoot === undefined) delete process.env.CYBER_ARCHITECT_CONTENT_ROOT;
  else process.env.CYBER_ARCHITECT_CONTENT_ROOT = previousVaultRoot;
});

describe('canonical Content Vault hybrid indexing', () => {
  it('retains Obsidian frontmatter, SQL bindings, and wikilinks from the configured canonical vault', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-hybrid-vault-'));
    temporaryRoots.push(root);
    process.env.CYBER_ARCHITECT_CONTENT_ROOT = root;
    const suffix = crypto.randomUUID().replace(/-/g, '');
    const sourceSlug = `vault-hybrid-source-${suffix}`;
    const firstTargetSlug = `vault-hybrid-target-a-${suffix}`;
    const secondTargetSlug = `vault-hybrid-target-b-${suffix}`;

    writeMarkdown(root, `Content/01_Test/${sourceSlug}/index.md`, `---
title: "Hybrid source"
slug: "${sourceSlug}"
content_type: knowledge
document_id: "kb:test:${suffix}"
classification: public
published: true
sql_project_id: PRJ-2026
sql_bindings:
  - sql_project_id: PRJ-2026
    fact_profiles: [project_snapshot, bom_availability]
---

# Hybrid source

[[${firstTargetSlug}]]
[[${secondTargetSlug}]]
`);
    for (const targetSlug of [firstTargetSlug, secondTargetSlug]) {
      writeMarkdown(root, `Content/01_Test/${targetSlug}/index.md`, `---
title: "${targetSlug}"
slug: "${targetSlug}"
content_type: knowledge
document_id: "kb:test:${targetSlug}"
classification: public
published: true
---

# Target
`);
    }

    await syncKnowledgeBase({ dryRun: false });

    const document = db.prepare(`
      SELECT b.id, b.slug, d.document_id, d.classification, d.source_path
      FROM blog_posts b
      JOIN hybrid_rag_documents d ON d.post_id = b.id
      WHERE b.slug = ?
    `).get(sourceSlug);
    expect(document).toMatchObject({
      slug: sourceSlug,
      document_id: `kb:test:${suffix}`,
      classification: 'public',
      source_path: `Content/01_Test/${sourceSlug}/index.md`
    });

    const binding = db.prepare(`
      SELECT sql_project_id, fact_profiles
      FROM hybrid_rag_sql_bindings
      WHERE post_id = ?
    `).get(document.id);
    expect(binding.sql_project_id).toBe('PRJ-2026');
    expect(JSON.parse(binding.fact_profiles)).toEqual(['project_snapshot', 'bom_availability']);

    const links = db.prepare(`
      SELECT target_slug, target_post_id
      FROM hybrid_rag_edges
      WHERE source_post_id = ? AND relation_type = 'wikilink'
      ORDER BY target_slug
    `).all(document.id);
    expect(links).toEqual([
      expect.objectContaining({ target_slug: firstTargetSlug, target_post_id: expect.any(Number) }),
      expect.objectContaining({ target_slug: secondTargetSlug, target_post_id: expect.any(Number) })
    ]);
  });
});
