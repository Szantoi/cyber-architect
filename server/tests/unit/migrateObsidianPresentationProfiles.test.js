import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildPresentationProfileMigratedMarkdown,
  migrateObsidianPresentationProfiles
} from '../../scripts/migrateObsidianPresentationProfiles.js';

const temporaryRoots = [];

function makeVaultFile(root, relativePath, content) {
  const target = path.join(root, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
  return target;
}

function markdown(frontmatter) {
  return `---
${frontmatter}
---

# Teszt dokumentum
`;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('Obsidian presentation profile migration', () => {
  it.each([
    ['knowledge', 'knowledge'],
    ['blog', 'article']
  ])('projects legacy content_type %s to canonical profile %s and is idempotent', (contentType, profile) => {
    const source = markdown(`title: "Legacy"
content_type: ${contentType}`);
    const first = buildPresentationProfileMigratedMarkdown(source, {
      sourcePath: 'Content/legacy.md'
    });
    const second = buildPresentationProfileMigratedMarkdown(first.markdown, {
      sourcePath: 'Content/legacy.md'
    });

    expect(first.changed).toBe(true);
    expect(first.profile_source).toBe('LEGACY_CONTENT_TYPE');
    expect(first.markdown).toContain(`presentation_profile: "${profile}"`);
    expect(first.markdown).toContain(`content_type: ${contentType}`);
    expect(second.changed).toBe(false);
    expect(second.markdown).toBe(first.markdown);
  });

  it('derives only historical folder defaults when no explicit presentation field exists', () => {
    const source = markdown('title: "Folder legacy"');
    const knowledge = buildPresentationProfileMigratedMarkdown(source, {
      sourcePath: 'KnowledgeBase/legacy.md',
      fallbackPresentationProfile: 'knowledge'
    });
    const blog = buildPresentationProfileMigratedMarkdown(source, {
      sourcePath: 'Blog/legacy.md',
      fallbackPresentationProfile: 'article'
    });

    expect(knowledge).toMatchObject({
      changed: true,
      presentation_profile: 'knowledge',
      profile_source: 'LEGACY_FOLDER'
    });
    expect(blog).toMatchObject({
      changed: true,
      presentation_profile: 'article',
      profile_source: 'LEGACY_FOLDER'
    });
  });

  it('requires an explicit profile or legacy content_type in the neutral Content tree', () => {
    expect(() => buildPresentationProfileMigratedMarkdown(markdown('title: "Neutral"'), {
      sourcePath: 'Content/neutral.md'
    })).toThrow(expect.objectContaining({ code: 'VAULT_PRESENTATION_PROFILE_REQUIRED' }));
  });

  it('fails closed on contradictory profile and content_type values', () => {
    expect(() => buildPresentationProfileMigratedMarkdown(markdown(`title: "Conflict"
presentation_profile: article
content_type: knowledge`), {
      sourcePath: 'Content/conflict.md'
    })).toThrow(expect.objectContaining({ code: 'PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT' }));
  });

  it('defaults to dry-run, writes timestamped backups on apply, and makes a second run a no-op', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-profile-migration-'));
    temporaryRoots.push(root);
    const knowledgePath = 'KnowledgeBase/01_Test/knowledge/knowledge.md';
    const blogPath = 'Blog/01_Test/article/article.md';
    const knowledge = makeVaultFile(root, knowledgePath, markdown('title: "Knowledge"'));
    const blog = makeVaultFile(root, blogPath, markdown('title: "Article"'));

    const preview = migrateObsidianPresentationProfiles({ vaultRoot: root });
    expect(preview).toMatchObject({
      dry_run: true,
      discovered: 2,
      would_migrate: 2,
      migrated: 0,
      errors: []
    });
    expect(fs.readFileSync(knowledge, 'utf8')).not.toContain('presentation_profile:');

    const applied = migrateObsidianPresentationProfiles({ vaultRoot: root, apply: true });
    expect(applied).toMatchObject({
      dry_run: false,
      migrated: 2,
      errors: []
    });
    expect(applied.backup_directory).toContain('.presentation-profile-backups');
    expect(fs.readFileSync(knowledge, 'utf8')).toContain('presentation_profile: "knowledge"');
    expect(fs.readFileSync(blog, 'utf8')).toContain('presentation_profile: "article"');
    expect(fs.readFileSync(path.join(applied.backup_directory, ...knowledgePath.split('/')), 'utf8'))
      .not.toContain('presentation_profile:');

    const repeat = migrateObsidianPresentationProfiles({ vaultRoot: root, apply: true });
    expect(repeat).toMatchObject({
      would_migrate: 0,
      migrated: 0,
      unchanged: 2,
      errors: []
    });
    expect(repeat.backup_directory).toBeNull();
  });

  it('does not write any valid files when another document has a profile conflict', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-profile-conflict-'));
    temporaryRoots.push(root);
    const valid = makeVaultFile(root, 'KnowledgeBase/01_Test/valid/valid.md', markdown('title: "Valid"'));
    const conflict = makeVaultFile(root, 'Blog/01_Test/conflict/conflict.md', markdown(`title: "Conflict"
presentation_profile: knowledge
content_type: blog`));

    const report = migrateObsidianPresentationProfiles({ vaultRoot: root, apply: true });

    expect(report.migrated).toBe(0);
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source_path: 'Blog/01_Test/conflict/conflict.md',
        code: 'PRESENTATION_PROFILE_CONTENT_TYPE_CONFLICT'
      })
    ]));
    expect(fs.readFileSync(valid, 'utf8')).not.toContain('presentation_profile:');
    expect(fs.readFileSync(conflict, 'utf8')).toContain('presentation_profile: knowledge');
  });
});
