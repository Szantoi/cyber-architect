import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createContentPackageMigrationPlan,
  migrateLegacyVaultToContentPackages
} from '../../scripts/migrateLegacyVaultToContentPackages.js';

const temporaryRoots = [];

function makeVaultFile(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

function legacyMarkdown({ title = 'Legacy dokumentum', slug = 'legacy-dokumentum', extra = '' } = {}) {
  return `---
title: "${title}"
slug: "${slug}"
content_type: knowledge
${extra}---

# ${title}

Ez a törzsszöveg változatlanul megmarad.
`;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('legacy Vault Content-package migration', () => {
  it('previews without writing, then moves legacy notes into canonical packages with a vault-local backup', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-content-package-migration-'));
    temporaryRoots.push(root);
    const sourcePath = 'KnowledgeBase/01_Test/legacy-dokumentum/legacy-dokumentum.md';
    const source = makeVaultFile(root, sourcePath, legacyMarkdown());
    makeVaultFile(root, 'KnowledgeBase/01_Test/legacy-dokumentum/assets/diagram.txt', 'asset body');
    makeVaultFile(root, 'KnowledgeBase/01_Test/legacy-dokumentum/.ca-assets.json', '{"assets": []}\n');

    const preview = migrateLegacyVaultToContentPackages({ vaultRoot: root });
    expect(preview).toMatchObject({
      dry_run: true,
      discovered: 1,
      would_migrate: 1,
      migrated: 0,
      errors: []
    });
    expect(preview.files[0]).toMatchObject({
      source_path: sourcePath,
      target_path: 'Content/01_Tudastar/01_Test/legacy-dokumentum/index.md',
      document_id: 'kb:legacy-dokumentum',
      presentation_profile: 'knowledge'
    });
    expect(fs.existsSync(source)).toBe(true);
    expect(fs.existsSync(path.join(root, 'Content'))).toBe(false);

    const applied = migrateLegacyVaultToContentPackages({ vaultRoot: root, apply: true });
    const target = path.join(root, 'Content', '01_Tudastar', '01_Test', 'legacy-dokumentum', 'index.md');
    expect(applied).toMatchObject({
      dry_run: false,
      migrated: 1,
      removed_legacy_sources: 1,
      errors: []
    });
    expect(fs.existsSync(source)).toBe(false);
    expect(fs.existsSync(path.join(root, 'KnowledgeBase'))).toBe(false);
    expect(fs.readFileSync(target, 'utf8')).toContain('presentation_profile: knowledge');
    expect(fs.readFileSync(target, 'utf8')).toContain('document_id: kb:legacy-dokumentum');
    expect(fs.readFileSync(target, 'utf8')).not.toContain('content_type:');
    expect(fs.readFileSync(target, 'utf8')).toContain('Ez a törzsszöveg változatlanul megmarad.');
    expect(fs.readFileSync(path.join(path.dirname(target), 'assets', 'diagram.txt'), 'utf8')).toBe('asset body');
    expect(fs.readFileSync(path.join(path.dirname(target), '.ca-assets.json'), 'utf8')).toContain('assets');
    expect(fs.readFileSync(path.join(applied.backup_directory, ...sourcePath.split('/')), 'utf8')).toContain('content_type: knowledge');
  });

  it('keeps all legacy sources untouched when a destination package already exists', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-content-package-collision-'));
    temporaryRoots.push(root);
    const sourcePath = 'Blog/01_Test/article/article.md';
    const source = makeVaultFile(root, sourcePath, legacyMarkdown({
      title: 'Article',
      slug: 'article'
    }).replace('content_type: knowledge', 'content_type: blog'));
    makeVaultFile(root, 'Content/02_Cikkek/01_Test/article/index.md', '# Existing canonical package\n');

    const plan = createContentPackageMigrationPlan({ vaultRoot: root });
    expect(plan.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source_path: sourcePath,
        code: 'CONTENT_PACKAGE_TARGET_EXISTS'
      })
    ]));

    const report = migrateLegacyVaultToContentPackages({ vaultRoot: root, apply: true });
    expect(report.migrated).toBe(0);
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'CONTENT_PACKAGE_TARGET_EXISTS' })
    ]));
    expect(fs.readFileSync(source, 'utf8')).toContain('content_type: blog');
    expect(fs.readFileSync(path.join(root, 'Content', '02_Cikkek', '01_Test', 'article', 'index.md'), 'utf8'))
      .toBe('# Existing canonical package\n');
  });

  it('fails closed when a note still has nested legacy taxonomy dimensions', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-content-package-taxonomy-'));
    temporaryRoots.push(root);
    const source = makeVaultFile(root, 'KnowledgeBase/legacy/legacy.md', legacyMarkdown({
      slug: 'legacy',
      extra: 'dimensions:\n  iparag: [Gyártás]\n'
    }));

    const report = migrateLegacyVaultToContentPackages({ vaultRoot: root, apply: true });
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'VAULT_LEGACY_DIMENSIONS_PRESENT' })
    ]));
    expect(fs.readFileSync(source, 'utf8')).toContain('dimensions:');
    expect(fs.existsSync(path.join(root, 'Content'))).toBe(false);
  });
});
