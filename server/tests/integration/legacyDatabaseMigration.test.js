import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LegacyMigrationError,
  legacyMigrationInternals,
  reconcileLegacyDatabase
} from '../../scripts/legacyDatabaseReconciler.js';
import { parseLegacyMigrationArgs } from '../../scripts/migrateLegacyDatabase.js';

const tempDirectories = new Set();
const fixedNow = () => new Date('2026-08-20T10:30:00.000Z');
const SQLITE_DATABASE_SUFFIXES = Object.freeze(['', '-wal', '-shm']);

function createTempDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-legacy-migration-'));
  tempDirectories.add(directory);
  return directory;
}

function openDatabase(databasePath, options = {}) {
  return new Database(databasePath, options);
}

function createLegacyDatabase(databasePath, rows) {
  const database = openDatabase(databasePath);
  try {
    database.exec(`
      CREATE TABLE blog_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'SYSTEM_LOG',
        read_time TEXT DEFAULT '4 MIN',
        created_at TEXT NOT NULL,
        published INTEGER DEFAULT 1,
        project_id TEXT DEFAULT 'prj_general',
        dimensions TEXT DEFAULT '{}',
        visibility TEXT DEFAULT 'public',
        audio_url TEXT DEFAULT '',
        drive_file_id TEXT DEFAULT '',
        drive_modified_time TEXT DEFAULT '',
        embedding TEXT DEFAULT '[]',
        content_type TEXT DEFAULT 'blog',
        video_url TEXT DEFAULT ''
      )
    `);
    const insert = database.prepare(`
      INSERT INTO blog_posts (
        slug,
        title,
        summary,
        content,
        category,
        read_time,
        created_at,
        published,
        project_id,
        dimensions,
        visibility,
        audio_url,
        video_url,
        drive_file_id,
        drive_modified_time,
        embedding,
        content_type
      ) VALUES (
        @slug,
        @title,
        @summary,
        @content,
        @category,
        @read_time,
        @created_at,
        @published,
        @project_id,
        @dimensions,
        @visibility,
        @audio_url,
        @video_url,
        @drive_file_id,
        @drive_modified_time,
        @embedding,
        @content_type
      )
    `);

    for (const row of rows) insert.run(withPostDefaults(row));
  } finally {
    database.close();
  }
}

function createTargetDatabase(databasePath, rows = [], { failOnSlug = null } = {}) {
  const database = openDatabase(databasePath);
  try {
    database.exec(`
      CREATE TABLE blog_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT DEFAULT 'prj_general',
        content_type TEXT DEFAULT 'blog',
        slug TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'SYSTEM_LOG',
        dimensions TEXT DEFAULT '{}',
        visibility TEXT DEFAULT 'public',
        audio_url TEXT DEFAULT '',
        video_url TEXT DEFAULT '',
        drive_file_id TEXT DEFAULT '',
        drive_modified_time TEXT DEFAULT '',
        embedding TEXT DEFAULT '[]',
        read_time TEXT DEFAULT '4 MIN',
        created_at TEXT NOT NULL,
        published INTEGER DEFAULT 1
      )
    `);
    const insert = database.prepare(`
      INSERT INTO blog_posts (
        project_id,
        content_type,
        slug,
        title,
        summary,
        content,
        category,
        dimensions,
        visibility,
        audio_url,
        video_url,
        drive_file_id,
        drive_modified_time,
        embedding,
        read_time,
        created_at,
        published
      ) VALUES (
        @project_id,
        @content_type,
        @slug,
        @title,
        @summary,
        @content,
        @category,
        @dimensions,
        @visibility,
        @audio_url,
        @video_url,
        @drive_file_id,
        @drive_modified_time,
        @embedding,
        @read_time,
        @created_at,
        @published
      )
    `);

    for (const row of rows) insert.run(withPostDefaults(row));
    if (failOnSlug) {
      database.exec(`
        CREATE TRIGGER reject_fixture_slug
        BEFORE INSERT ON blog_posts
        WHEN NEW.slug = '${failOnSlug.replaceAll("'", "''")}'
        BEGIN
          SELECT RAISE(ABORT, 'injected migration failure');
        END
      `);
    }
  } finally {
    database.close();
  }
}

function withPostDefaults(row) {
  return {
    project_id: 'prj_general',
    content_type: 'blog',
    slug: 'fixture',
    title: 'Fixture title',
    summary: 'Fixture summary',
    content: 'Fixture content',
    category: 'SYSTEM_LOG',
    dimensions: '{}',
    visibility: 'public',
    audio_url: '',
    video_url: '',
    drive_file_id: '',
    drive_modified_time: '',
    embedding: '[]',
    read_time: '4 MIN',
    created_at: '2026-08-20T00:00:00.000Z',
    published: 1,
    ...row
  };
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function captureDatabaseFileState(databasePath) {
  return SQLITE_DATABASE_SUFFIXES.map((suffix) => {
    const filePath = `${databasePath}${suffix}`;
    if (!fs.existsSync(filePath)) return { suffix, exists: false };

    const stats = fs.statSync(filePath, { bigint: true });
    return {
      suffix,
      exists: true,
      size: stats.size,
      mtimeNs: stats.mtimeNs,
      hash: hashFile(filePath)
    };
  });
}

function listSqliteSnapshotDirectories() {
  return fs.readdirSync(os.tmpdir(), { withFileTypes: true })
    .filter((entry) => (
      entry.isDirectory()
      && entry.name.startsWith(legacyMigrationInternals.SNAPSHOT_DIRECTORY_PREFIX)
    ))
    .map((entry) => entry.name)
    .sort();
}

function readTargetRows(databasePath) {
  const database = openDatabase(databasePath, { readonly: true, fileMustExist: true });
  try {
    return database.prepare(`
      SELECT id, slug, title, content, content_type, audio_url, drive_file_id
      FROM blog_posts
      ORDER BY id
    `).all();
  } finally {
    database.close();
  }
}

function tableExists(databasePath, tableName) {
  const database = openDatabase(databasePath, { readonly: true, fileMustExist: true });
  try {
    return Boolean(database.prepare(`
      SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?
    `).get(tableName));
  } finally {
    database.close();
  }
}

function fixturePaths() {
  const directory = createTempDirectory();
  return {
    directory,
    sourcePath: path.join(directory, 'legacy.sqlite'),
    targetPath: path.join(directory, 'target.sqlite')
  };
}

afterEach(() => {
  for (const directory of tempDirectories) {
    const relativeToTemp = path.relative(os.tmpdir(), directory);
    if (relativeToTemp.startsWith('..') || path.isAbsolute(relativeToTemp)) {
      throw new Error(`Refusing to remove non-temporary test directory: ${directory}`);
    }
    fs.rmSync(directory, { recursive: true, force: true });
  }
  tempDirectories.clear();
});

describe('legacy database reconciliation CLI arguments', () => {
  it('requires explicit source and target while keeping dry-run as the default', () => {
    expect(parseLegacyMigrationArgs([
      '--source',
      'legacy.sqlite',
      '--target',
      'target.sqlite'
    ])).toMatchObject({
      sourcePath: 'legacy.sqlite',
      targetPath: 'target.sqlite',
      apply: false
    });

    expect(() => parseLegacyMigrationArgs(['--target', 'target.sqlite']))
      .toThrow('--source is required');
    expect(() => parseLegacyMigrationArgs([
      '--source', 'legacy.sqlite', '--target', 'target.sqlite', '--apply', '--dry-run'
    ])).toThrow('cannot be used together');
  });

  it('runs as a real CLI in readonly dry-run mode by default', () => {
    const { directory, sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [{ slug: 'cli-row', title: 'CLI row' }]);
    createTargetDatabase(targetPath);
    const targetHash = hashFile(targetPath);
    const cliPath = path.resolve('server/scripts/migrateLegacyDatabase.js');

    const result = spawnSync(process.execPath, [
      cliPath,
      '--source', sourcePath,
      '--target', targetPath,
      '--source-id', 'cli-fixture'
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'dry-run',
      applied: false,
      created: 1,
      updated: 0,
      backupPath: null
    });
    expect(hashFile(targetPath)).toBe(targetHash);
    expect(fs.existsSync(path.join(directory, 'backups'))).toBe(false);
  });

  it('returns exit code 1 when dry-run reports validation errors', () => {
    const { sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [{ slug: 'invalid-title', title: '   ' }]);
    createTargetDatabase(targetPath);
    const cliPath = path.resolve('server/scripts/migrateLegacyDatabase.js');

    const result = spawnSync(process.execPath, [
      cliPath,
      '--source', sourcePath,
      '--target', targetPath,
      '--source-id', 'invalid-cli-fixture'
    ], {
      cwd: path.resolve('.'),
      encoding: 'utf8'
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'dry-run',
      applied: false,
      created: 0,
      updated: 0,
      errors: 1
    });
  });
});

describe('legacy blog post database reconciliation', () => {
  it('plans safe seed adoption and creates without changing source, target, sidecars, or backups', () => {
    const { directory, sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [
      {
        slug: 'shared-seed',
        title: '  Shared   Seed  ',
        content: 'Authoritative legacy content',
        drive_file_id: 'gdrive_shared'
      },
      { slug: 'legacy-only', title: 'Legacy only' }
    ]);
    createTargetDatabase(targetPath, [
      {
        slug: 'shared-seed',
        title: 'shared seed',
        content: 'Authoritative legacy content',
        drive_file_id: ''
      }
    ]);
    const sourceHash = hashFile(sourcePath);
    const targetHash = hashFile(targetPath);

    const summary = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'fixture-source',
      now: fixedNow
    });

    expect(summary).toMatchObject({
      mode: 'dry-run',
      applied: false,
      backupPath: null,
      examined: 2,
      created: 1,
      updated: 1,
      skipped: 0,
      collisions: 0,
      errors: 0
    });
    expect(hashFile(sourcePath)).toBe(sourceHash);
    expect(hashFile(targetPath)).toBe(targetHash);
    expect(fs.existsSync(`${targetPath}-wal`)).toBe(false);
    expect(fs.existsSync(`${targetPath}-shm`)).toBe(false);
    expect(fs.existsSync(path.join(directory, 'backups'))).toBe(false);
    expect(tableExists(targetPath, legacyMigrationInternals.MAPPING_TABLE)).toBe(false);
  });

  it('uses disposable snapshots without changing source or target main, WAL, or SHM files', () => {
    const { directory, sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [{ slug: 'main-source', title: 'Main source' }]);
    createTargetDatabase(targetPath);
    const sourceKeeper = openDatabase(sourcePath, { fileMustExist: true });
    const targetKeeper = openDatabase(targetPath, { fileMustExist: true });

    try {
      expect(sourceKeeper.pragma('journal_mode = WAL', { simple: true })).toBe('wal');
      expect(targetKeeper.pragma('journal_mode = WAL', { simple: true })).toBe('wal');
      sourceKeeper.prepare(`
        INSERT INTO blog_posts (slug, title, summary, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        'wal-source',
        'WAL source',
        'Source summary',
        'Committed source WAL content',
        '2026-08-20T00:00:00.000Z'
      );
      targetKeeper.prepare(`
        INSERT INTO blog_posts (slug, title, summary, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        'wal-target',
        'WAL target',
        'Target summary',
        'Committed target WAL content',
        '2026-08-20T00:00:00.000Z'
      );

      for (const databasePath of [sourcePath, targetPath]) {
        expect(fs.existsSync(databasePath)).toBe(true);
        expect(fs.existsSync(`${databasePath}-wal`)).toBe(true);
        expect(fs.existsSync(`${databasePath}-shm`)).toBe(true);
      }

      const sourceBefore = captureDatabaseFileState(sourcePath);
      const targetBefore = captureDatabaseFileState(targetPath);
      const snapshotDirectoriesBefore = listSqliteSnapshotDirectories();

      const summary = reconcileLegacyDatabase({
        sourcePath,
        targetPath,
        sourceId: 'wal-snapshot-fixture',
        now: fixedNow
      });

      expect(summary).toMatchObject({
        mode: 'dry-run',
        applied: false,
        examined: 2,
        created: 2,
        updated: 0,
        collisions: 0,
        errors: 0,
        backupPath: null
      });
      expect(captureDatabaseFileState(sourcePath)).toEqual(sourceBefore);
      expect(captureDatabaseFileState(targetPath)).toEqual(targetBefore);
      expect(listSqliteSnapshotDirectories()).toEqual(snapshotDirectoriesBefore);
      expect(fs.existsSync(path.join(directory, 'backups'))).toBe(false);
    } finally {
      targetKeeper.close();
      sourceKeeper.close();
    }
  });

  it('never adopts or overwrites matching identity when relevant content differs', () => {
    const { sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [{
      slug: 'same-identity',
      title: 'Same title',
      content_type: 'blog',
      content: 'Legacy authoritative content',
      drive_file_id: 'gdrive_legacy'
    }]);
    createTargetDatabase(targetPath, [{
      slug: 'same-identity',
      title: ' same   title ',
      content_type: 'BLOG',
      content: 'Target-owned different content',
      drive_file_id: ''
    }]);

    const dryRun = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'content-mismatch-source',
      now: fixedNow
    });

    expect(dryRun).toMatchObject({
      applied: false,
      created: 1,
      updated: 0,
      collisions: 1,
      errors: 0
    });
    expect(dryRun.collisionDetails[0]).toMatchObject({
      code: 'UNTRACKED_TARGET_SLUG',
      resolution: 'CREATE_WITH_STABLE_SUFFIX',
      adoptionMismatchFields: expect.arrayContaining(['content'])
    });
    const stableSlug = dryRun.collisionDetails[0].targetSlug;

    const applied = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'content-mismatch-source',
      apply: true,
      now: fixedNow
    });

    expect(applied).toMatchObject({ applied: true, created: 1, updated: 0, collisions: 1 });
    expect(readTargetRows(targetPath)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slug: 'same-identity',
        content: 'Target-owned different content',
        drive_file_id: ''
      }),
      expect.objectContaining({
        slug: stableSlug,
        content: 'Legacy authoritative content',
        drive_file_id: 'gdrive_legacy'
      })
    ]));
  });

  it('requires optional persisted fields to match before establishing an adoption mapping', () => {
    const { sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [{
      slug: 'optional-field-owner',
      title: 'Optional field owner',
      drive_file_id: 'gdrive_optional'
    }]);
    createTargetDatabase(targetPath, [{
      slug: 'optional-field-owner',
      title: 'optional field owner',
      audio_url: 'https://target.example/audio.mp3',
      drive_file_id: ''
    }]);

    const dryRun = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'optional-field-source',
      now: fixedNow
    });
    expect(dryRun).toMatchObject({ created: 1, updated: 0, collisions: 1, errors: 0 });
    expect(dryRun.collisionDetails[0].adoptionMismatchFields).toContain('audio_url');

    const applied = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'optional-field-source',
      apply: true,
      now: fixedNow
    });
    expect(applied).toMatchObject({ applied: true, created: 1, updated: 0, collisions: 1 });
    expect(readTargetRows(targetPath)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        slug: 'optional-field-owner',
        audio_url: 'https://target.example/audio.mp3',
        drive_file_id: ''
      }),
      expect.objectContaining({
        slug: dryRun.collisionDetails[0].targetSlug,
        audio_url: '',
        drive_file_id: 'gdrive_optional'
      })
    ]));
  });

  it('keeps deterministic collision slugs canonical and within the 160-character limit', () => {
    const { sourcePath, targetPath } = fixturePaths();
    const longSlug = `long-${'a'.repeat(180)}`;
    createLegacyDatabase(sourcePath, [{
      slug: longSlug,
      title: 'Long legacy slug',
      content: 'Legacy collision content'
    }]);
    createTargetDatabase(targetPath, [{
      slug: longSlug,
      title: 'Long target slug',
      content: 'Target-owned collision content'
    }]);

    const dryRun = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'long-slug-source',
      now: fixedNow
    });
    const targetSlug = dryRun.collisionDetails[0].targetSlug;

    expect(dryRun).toMatchObject({ created: 1, collisions: 1, errors: 0 });
    expect(targetSlug.length).toBeLessThanOrEqual(160);
    expect(targetSlug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(targetSlug).toMatch(/-legacy-[a-f0-9]{10}$/);

    const applied = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'long-slug-source',
      apply: true,
      now: fixedNow
    });
    expect(applied.collisionDetails[0].targetSlug).toBe(targetSlug);
    expect(readTargetRows(targetPath)).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: targetSlug, content: 'Legacy collision content' })
    ]));
  });

  it('rejects trimmed duplicate Drive IDs in the source during dry-run planning', () => {
    const { sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [
      { slug: 'drive-a', title: 'Drive A', drive_file_id: ' duplicate-drive-id ' },
      { slug: 'drive-b', title: 'Drive B', drive_file_id: 'duplicate-drive-id' }
    ]);
    createTargetDatabase(targetPath);

    const summary = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'duplicate-drive-source',
      now: fixedNow
    });

    expect(summary).toMatchObject({
      applied: false,
      examined: 2,
      created: 0,
      updated: 0,
      collisions: 0,
      errors: 2
    });
    expect(summary.errorDetails).toEqual([
      expect.objectContaining({ code: 'DUPLICATE_SOURCE_DRIVE_FILE_ID', slug: 'drive-a' }),
      expect.objectContaining({ code: 'DUPLICATE_SOURCE_DRIVE_FILE_ID', slug: 'drive-b' })
    ]);
  });

  it('reports a planned target Drive ID duplicate before apply can reach the unique index', () => {
    const { sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [{
      slug: 'new-drive-owner',
      title: 'New Drive owner',
      drive_file_id: ' shared-drive-id '
    }]);
    createTargetDatabase(targetPath, [{
      slug: 'existing-drive-owner',
      title: 'Existing Drive owner',
      drive_file_id: 'shared-drive-id'
    }]);

    const summary = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'planned-drive-conflict-source',
      now: fixedNow
    });

    expect(summary).toMatchObject({
      applied: false,
      examined: 1,
      created: 1,
      updated: 0,
      errors: 1
    });
    expect(summary.errorDetails[0]).toMatchObject({
      code: 'PLANNED_TARGET_DRIVE_FILE_ID_DUPLICATE',
      owners: expect.arrayContaining([
        expect.objectContaining({ slug: 'existing-drive-owner' }),
        expect.objectContaining({ slug: 'new-drive-owner' })
      ])
    });
  });

  it('backs up before apply, adopts matching seeds, and remains idempotent by source identity', () => {
    const { sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [
      {
        slug: 'shared-seed',
        title: 'Shared Seed',
        content: 'Authoritative legacy content',
        drive_file_id: 'gdrive_shared'
      },
      { slug: 'legacy-only', title: 'Legacy only' }
    ]);
    createTargetDatabase(targetPath, [
      {
        slug: 'shared-seed',
        title: 'shared seed',
        content: 'Authoritative legacy content'
      }
    ]);
    const sourceHash = hashFile(sourcePath);
    const originalTargetId = readTargetRows(targetPath)[0].id;

    const first = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'fixture-source',
      apply: true,
      now: fixedNow
    });

    expect(first).toMatchObject({
      mode: 'apply',
      applied: true,
      created: 1,
      updated: 1,
      skipped: 0,
      collisions: 0,
      errors: 0
    });
    expect(first.backupPath).toMatch(/backups[\\/]target-pre-legacy-migration-/);
    expect(fs.existsSync(first.backupPath)).toBe(true);
    expect(readTargetRows(first.backupPath)).toHaveLength(1);
    if (process.platform !== 'win32') {
      expect(fs.statSync(path.dirname(first.backupPath)).mode & 0o777).toBe(0o700);
      expect(fs.statSync(first.backupPath).mode & 0o777).toBe(0o600);
    }
    expect(hashFile(sourcePath)).toBe(sourceHash);

    const rowsAfterFirstApply = readTargetRows(targetPath);
    expect(rowsAfterFirstApply).toHaveLength(2);
    expect(rowsAfterFirstApply.find((row) => row.slug === 'shared-seed')).toMatchObject({
      id: originalTargetId,
      title: 'shared seed',
      content: 'Authoritative legacy content',
      drive_file_id: 'gdrive_shared'
    });

    const mappingDatabase = openDatabase(targetPath, { readonly: true, fileMustExist: true });
    try {
      expect(mappingDatabase.prepare(`
        SELECT count(*) AS count FROM ${legacyMigrationInternals.MAPPING_TABLE}
      `).get().count).toBe(2);
    } finally {
      mappingDatabase.close();
    }

    const second = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'fixture-source',
      apply: true,
      now: fixedNow
    });
    expect(second).toMatchObject({
      applied: true,
      created: 0,
      updated: 0,
      skipped: 2,
      collisions: 0,
      errors: 0
    });
    expect(second.backupPath).not.toBe(first.backupPath);
    expect(fs.existsSync(second.backupPath)).toBe(true);

    const sourceDatabase = openDatabase(sourcePath, { fileMustExist: true });
    try {
      sourceDatabase.prepare(`
        UPDATE blog_posts SET slug = ?, title = ? WHERE slug = ?
      `).run('legacy-renamed', 'Legacy renamed', 'legacy-only');
    } finally {
      sourceDatabase.close();
    }

    const targetIdBeforeUpdate = readTargetRows(targetPath)
      .find((row) => row.slug === 'legacy-only').id;
    const third = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'fixture-source',
      apply: true,
      now: fixedNow
    });
    expect(third).toMatchObject({ created: 0, updated: 1, skipped: 1, collisions: 0, errors: 0 });
    expect(readTargetRows(targetPath).find((row) => row.slug === 'legacy-renamed').id)
      .toBe(targetIdBeforeUpdate);
  });

  it('captures committed WAL content in the verified pre-apply backup', () => {
    const { sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [{ slug: 'legacy-only', title: 'Legacy only' }]);
    createTargetDatabase(targetPath);
    const walKeeper = openDatabase(targetPath, { fileMustExist: true });

    try {
      expect(walKeeper.pragma('journal_mode = WAL', { simple: true })).toBe('wal');
      walKeeper.prepare(`
        INSERT INTO blog_posts (slug, title, summary, content, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run('wal-seed', 'WAL seed', 'Seed', 'Committed in WAL', '2026-08-20T00:00:00.000Z');
      expect(fs.existsSync(`${targetPath}-wal`)).toBe(true);
      expect(fs.existsSync(`${targetPath}-shm`)).toBe(true);

      const summary = reconcileLegacyDatabase({
        sourcePath,
        targetPath,
        sourceId: 'wal-source',
        apply: true,
        now: fixedNow
      });

      expect(summary).toMatchObject({ applied: true, created: 1, updated: 0, errors: 0 });
      expect(readTargetRows(summary.backupPath)).toEqual([
        expect.objectContaining({ slug: 'wal-seed', content: 'Committed in WAL' })
      ]);
      expect(readTargetRows(targetPath)).toHaveLength(2);
    } finally {
      walKeeper.close();
    }
  });

  it('attempts every cleanup and preserves committed status if one snapshot removal fails', () => {
    const { sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [{ slug: 'committed', title: 'Committed' }]);
    createTargetDatabase(targetPath);
    const snapshotDirectoriesBefore = listSqliteSnapshotDirectories();
    const originalRmSync = fs.rmSync.bind(fs);
    let snapshotRemovalAttempts = 0;
    const removeSpy = vi.spyOn(fs, 'rmSync').mockImplementation((candidatePath, options) => {
      if (path.basename(String(candidatePath)).startsWith(
        legacyMigrationInternals.SNAPSHOT_DIRECTORY_PREFIX
      )) {
        snapshotRemovalAttempts += 1;
        if (snapshotRemovalAttempts === 1) {
          throw new Error('injected snapshot cleanup failure');
        }
      }
      return originalRmSync(candidatePath, options);
    });

    let failure;
    try {
      reconcileLegacyDatabase({
        sourcePath,
        targetPath,
        sourceId: 'cleanup-failure-source',
        apply: true,
        now: fixedNow
      });
    } catch (error) {
      failure = error;
    } finally {
      removeSpy.mockRestore();
    }

    const remainingSnapshotDirectories = listSqliteSnapshotDirectories()
      .filter((directoryName) => !snapshotDirectoriesBefore.includes(directoryName));
    try {
      expect(snapshotRemovalAttempts).toBe(3);
      expect(remainingSnapshotDirectories).toHaveLength(1);
      expect(failure).toBeInstanceOf(LegacyMigrationError);
      expect(failure).toMatchObject({ code: 'SNAPSHOT_CLEANUP_FAILED' });
      expect(failure.summary).toMatchObject({
        applied: true,
        rolledBack: false,
        created: 1,
        updated: 0,
        errors: 1
      });
      expect(failure.summary.errorDetails).toContainEqual(expect.objectContaining({
        code: 'SNAPSHOT_CLEANUP_FAILED',
        message: expect.stringContaining('injected snapshot cleanup failure')
      }));
      expect(readTargetRows(targetPath)).toEqual([
        expect.objectContaining({ slug: 'committed', title: 'Committed' })
      ]);
    } finally {
      for (const directoryName of remainingSnapshotDirectories) {
        originalRmSync(path.join(os.tmpdir(), directoryName), { recursive: true, force: true });
      }
    }
  });

  it('preserves the snapshot validation error when failed-attempt cleanup transiently fails', () => {
    const { sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [{ slug: 'valid-source', title: 'Valid source' }]);
    fs.writeFileSync(targetPath, 'not a sqlite database', 'utf8');
    const snapshotDirectoriesBefore = listSqliteSnapshotDirectories();
    const originalRmSync = fs.rmSync.bind(fs);
    let snapshotRemovalAttempts = 0;
    const removeSpy = vi.spyOn(fs, 'rmSync').mockImplementation((candidatePath, options) => {
      if (path.basename(String(candidatePath)).startsWith(
        legacyMigrationInternals.SNAPSHOT_DIRECTORY_PREFIX
      )) {
        snapshotRemovalAttempts += 1;
        if (snapshotRemovalAttempts === 1) {
          throw new Error('injected transient snapshot cleanup failure');
        }
      }
      return originalRmSync(candidatePath, options);
    });

    let failure;
    try {
      reconcileLegacyDatabase({
        sourcePath,
        targetPath,
        sourceId: 'invalid-snapshot-source',
        now: fixedNow
      });
    } catch (error) {
      failure = error;
    } finally {
      removeSpy.mockRestore();
    }

    expect(failure).toBeInstanceOf(LegacyMigrationError);
    expect(failure).toMatchObject({ code: 'SNAPSHOT_CAPTURE_FAILED' });
    expect(failure.message).toMatch(/database|file is encrypted/i);
    expect(failure.message).not.toContain('injected transient snapshot cleanup failure');
    expect(snapshotRemovalAttempts).toBeGreaterThanOrEqual(5);
    expect(listSqliteSnapshotDirectories()).toEqual(snapshotDirectoriesBefore);
  });

  it('preserves the backup publication error while retrying every partial cleanup', () => {
    const { directory, sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [{ slug: 'backup-source', title: 'Backup source' }]);
    createTargetDatabase(targetPath);
    const originalRmSync = fs.rmSync.bind(fs);
    const linkSpy = vi.spyOn(fs, 'linkSync').mockImplementation(() => {
      throw new Error('injected backup publication failure');
    });
    let partialRemovalAttempts = 0;
    const removeSpy = vi.spyOn(fs, 'rmSync').mockImplementation((candidatePath, options) => {
      if (String(candidatePath).includes('.partial-')) {
        partialRemovalAttempts += 1;
        if (partialRemovalAttempts === 1) {
          throw new Error('injected transient partial cleanup failure');
        }
      }
      return originalRmSync(candidatePath, options);
    });

    let failure;
    try {
      reconcileLegacyDatabase({
        sourcePath,
        targetPath,
        sourceId: 'backup-cleanup-source',
        apply: true,
        now: fixedNow
      });
    } catch (error) {
      failure = error;
    } finally {
      linkSpy.mockRestore();
      removeSpy.mockRestore();
    }

    expect(failure).toBeInstanceOf(LegacyMigrationError);
    expect(failure).toMatchObject({ code: 'BACKUP_FAILED' });
    expect(failure.message).toContain('injected backup publication failure');
    expect(failure.message).not.toContain('injected transient partial cleanup failure');
    expect(failure.summary).toMatchObject({ applied: false, rolledBack: true });
    expect(partialRemovalAttempts).toBe(2);
    expect(fs.readdirSync(path.join(directory, 'backups'))).toEqual([]);
    expect(readTargetRows(targetPath)).toHaveLength(0);
  });

  it('reports a conflicting owner and uses the same deterministic suffix in dry-run and apply', () => {
    const { sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [
      {
        slug: 'occupied',
        title: 'Legacy title',
        drive_file_id: 'gdrive_legacy'
      }
    ]);
    createTargetDatabase(targetPath, [
      {
        slug: 'occupied',
        title: 'Different owner',
        drive_file_id: 'gdrive_other'
      }
    ]);

    const dryRun = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'legacy-A',
      now: fixedNow
    });
    expect(dryRun).toMatchObject({ created: 1, updated: 0, collisions: 1, errors: 0 });
    expect(dryRun.collisionDetails[0]).toMatchObject({
      code: 'UNTRACKED_TARGET_SLUG',
      resolution: 'CREATE_WITH_STABLE_SUFFIX'
    });
    const stableSlug = dryRun.collisionDetails[0].targetSlug;

    const applied = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'legacy-A',
      apply: true,
      now: fixedNow
    });
    expect(applied).toMatchObject({ applied: true, created: 1, collisions: 1, errors: 0 });
    expect(applied.collisionDetails[0].targetSlug).toBe(stableSlug);
    expect(readTargetRows(targetPath)).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'occupied', title: 'Different owner', drive_file_id: 'gdrive_other' }),
      expect.objectContaining({ slug: stableSlug, title: 'Legacy title', drive_file_id: 'gdrive_legacy' })
    ]));
  });

  it('does not overwrite a mapped target row that diverged after migration', () => {
    const { sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [{ slug: 'managed', title: 'Managed source' }]);
    createTargetDatabase(targetPath);
    reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'managed-source',
      apply: true,
      now: fixedNow
    });

    const targetDatabase = openDatabase(targetPath, { fileMustExist: true });
    try {
      targetDatabase.prepare('UPDATE blog_posts SET title = ? WHERE slug = ?')
        .run('Manual target edit', 'managed');
    } finally {
      targetDatabase.close();
    }

    const result = reconcileLegacyDatabase({
      sourcePath,
      targetPath,
      sourceId: 'managed-source',
      apply: true,
      now: fixedNow
    });
    expect(result).toMatchObject({ created: 0, updated: 0, skipped: 0, collisions: 1, errors: 0 });
    expect(result.collisionDetails[0].code).toBe('TARGET_DIVERGED');
    expect(readTargetRows(targetPath)[0].title).toBe('Manual target edit');
  });

  it('rolls back every target write on an apply failure while retaining the pre-migration backup', () => {
    const { sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [
      { slug: 'first', title: 'First' },
      { slug: 'explode', title: 'Explode' }
    ]);
    createTargetDatabase(targetPath, [], { failOnSlug: 'explode' });

    let failure;
    try {
      reconcileLegacyDatabase({
        sourcePath,
        targetPath,
        sourceId: 'rollback-source',
        apply: true,
        now: fixedNow
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(LegacyMigrationError);
    expect(failure.summary).toMatchObject({
      applied: false,
      rolledBack: true,
      created: 0,
      updated: 0,
      errors: 1
    });
    expect(fs.existsSync(failure.summary.backupPath)).toBe(true);
    expect(readTargetRows(failure.summary.backupPath)).toHaveLength(0);
    expect(readTargetRows(targetPath)).toHaveLength(0);
    expect(tableExists(targetPath, legacyMigrationInternals.MAPPING_TABLE)).toBe(false);
  });

  it('refuses all target writes when the mandatory backup cannot be created', () => {
    const { directory, sourcePath, targetPath } = fixturePaths();
    createLegacyDatabase(sourcePath, [{ slug: 'safe', title: 'Safe' }]);
    createTargetDatabase(targetPath);
    fs.writeFileSync(path.join(directory, 'backups'), 'blocks backup directory creation', 'utf8');
    const targetHash = hashFile(targetPath);

    let failure;
    try {
      reconcileLegacyDatabase({
        sourcePath,
        targetPath,
        sourceId: 'backup-failure-source',
        apply: true,
        now: fixedNow
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(LegacyMigrationError);
    expect(failure.code).toBe('BACKUP_FAILED');
    expect(failure.summary).toMatchObject({
      applied: false,
      backupPath: null,
      created: 0,
      updated: 0,
      errors: 1,
      planned: { created: 1, updated: 0 }
    });
    expect(hashFile(targetPath)).toBe(targetHash);
    expect(readTargetRows(targetPath)).toHaveLength(0);
    expect(tableExists(targetPath, legacyMigrationInternals.MAPPING_TABLE)).toBe(false);
  });
});
