import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildMigratedMarkdown,
  migrateObsidianTaxonomyFrontmatter
} from '../../scripts/migrateObsidianTaxonomyFrontmatter.js';

const temporaryRoots = [];

function makeVaultFile(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

function legacyMarkdown({ dimensions = 'dimensions:\n  iparag: [Gyártás]\n  technologia: [Obsidian]\n  celcsoport: [Folyamatmérnök]' } = {}) {
  return `---
title: "Legacy note"
slug: "legacy-note"
content_type: knowledge
${dimensions}
---

# Legacy note
`;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('Obsidian taxonomy frontmatter migration', () => {
  it('converts a legacy dimensions mapping once and is idempotent afterwards', () => {
    const first = buildMigratedMarkdown(legacyMarkdown(), { sourcePath: 'KnowledgeBase/legacy.md' });
    const second = buildMigratedMarkdown(first.markdown, { sourcePath: 'KnowledgeBase/legacy.md' });

    expect(first.changed).toBe(true);
    expect(first.markdown).toContain('tax_industry:\n  - "Gyártás"');
    expect(first.markdown).toContain('tax_technology:\n  - "Obsidian"');
    expect(first.markdown).toContain('tax_audience_role:\n  - "Folyamatmérnök"');
    expect(first.markdown).not.toContain('\ndimensions:');
    expect(second.changed).toBe(false);
    expect(second.markdown).toBe(first.markdown);
  });

  it('preserves the optional pain-point taxonomy as a flat list and safe tag projection', () => {
    const source = legacyMarkdown({ dimensions: `dimensions:
  iparag: [Gyártás]
  technologia: [Obsidian]
  celcsoport: [Folyamatmérnök]
  fajdalompont:
    - "Információkeresési idő"
    - "Feketedoboz AI átláthatatlanság"` });
    const migrated = buildMigratedMarkdown(source, { sourcePath: 'KnowledgeBase/pain-point.md' });

    expect(migrated.markdown).toContain('tax_pain_point:\n  - "Információkeresési idő"');
    expect(migrated.markdown).toContain('tags:\n  - "ca/pain-point/informaciokeresesi-ido"');
    expect(migrated.markdown).toContain('  - "ca/pain-point/feketedoboz-ai-atlathatatlansag"');
    expect(migrated.markdown).not.toContain('\nfajdalompont:');
  });

  it('defaults to dry-run, then writes a vault-local backup only on explicit apply', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-taxonomy-migration-'));
    temporaryRoots.push(root);
    const relativePath = 'KnowledgeBase/01_Test/legacy-note/legacy-note.md';
    const target = makeVaultFile(root, relativePath, legacyMarkdown());

    const preview = migrateObsidianTaxonomyFrontmatter({ vaultRoot: root });
    expect(preview).toMatchObject({ dry_run: true, would_migrate: 1, migrated: 0, errors: [] });
    expect(fs.readFileSync(target, 'utf8')).toContain('dimensions:');

    const applied = migrateObsidianTaxonomyFrontmatter({ vaultRoot: root, apply: true });
    expect(applied).toMatchObject({ dry_run: false, migrated: 1, errors: [] });
    expect(fs.readFileSync(target, 'utf8')).toContain('tax_industry:');
    expect(fs.readFileSync(target, 'utf8')).not.toContain('\ndimensions:');
    const backup = path.join(applied.backup_directory, ...relativePath.split('/'));
    expect(fs.readFileSync(backup, 'utf8')).toContain('dimensions:');
  });

  it('reports a coerced [object Object] dimensions value and refuses all writes', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-taxonomy-corruption-'));
    temporaryRoots.push(root);
    const valid = makeVaultFile(root, 'KnowledgeBase/01_Test/valid/valid.md', legacyMarkdown());
    const corrupted = makeVaultFile(root, 'KnowledgeBase/01_Test/corrupted/corrupted.md', legacyMarkdown({
      dimensions: 'dimensions: "[object Object]"'
    }));

    const report = migrateObsidianTaxonomyFrontmatter({ vaultRoot: root, apply: true });

    expect(report.migrated).toBe(0);
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INVALID_LEGACY_DIMENSIONS_TEXT' })
    ]));
    expect(fs.readFileSync(valid, 'utf8')).toContain('dimensions:');
    expect(fs.readFileSync(corrupted, 'utf8')).toContain('[object Object]');
  });
});
