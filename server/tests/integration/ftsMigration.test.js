import Database from 'better-sqlite3';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { db, dbPath, initDatabase } from '../../db.js';

const EXPECTED_FTS_COLUMNS = [
  'title',
  'summary',
  'content',
  'category',
  'content_type',
  'dimensions'
];

function getTotalChanges() {
  return db.prepare('SELECT total_changes() AS count').get().count;
}

function getRowCounts() {
  return {
    blogPosts: db.prepare('SELECT count(*) AS count FROM blog_posts').get().count,
    ftsEntries: db.prepare('SELECT count(*) AS count FROM blog_posts_fts').get().count
  };
}

function searchFts(query) {
  return db.prepare(`
    SELECT rowid, title
    FROM blog_posts_fts
    WHERE blog_posts_fts MATCH ?
    ORDER BY rowid
  `).all(query);
}

function expectCurrentFtsSchema() {
  const table = db.prepare(`
    SELECT sql
    FROM sqlite_schema
    WHERE type = 'table' AND name = 'blog_posts_fts'
  `).get();
  const columns = db.prepare('PRAGMA table_info(blog_posts_fts)').all().map(column => column.name);
  const triggers = db.prepare(`
    SELECT name
    FROM sqlite_schema
    WHERE type = 'trigger'
      AND name IN ('blog_posts_ai', 'blog_posts_ad', 'blog_posts_au')
    ORDER BY name
  `).all().map(trigger => trigger.name);
  const migration = db.prepare(`
    SELECT version, applied_at
    FROM schema_migrations
    WHERE component = 'blog_posts_fts'
  `).get();

  expect(table?.sql).toMatch(/CREATE VIRTUAL TABLE blog_posts_fts USING fts5/i);
  expect(columns).toEqual(EXPECTED_FTS_COLUMNS);
  expect(triggers).toEqual(['blog_posts_ad', 'blog_posts_ai', 'blog_posts_au']);
  expect(migration).toMatchObject({ version: 1 });
  expect(migration.applied_at).toEqual(expect.any(String));
  expect(getRowCounts().ftsEntries).toBe(getRowCounts().blogPosts);
}

describe.sequential('blog_posts FTS migration', () => {
  beforeAll(() => {
    const relativeToTemp = path.relative(os.tmpdir(), dbPath);

    expect(process.env.SQLITE_DB_PATH).toBe(dbPath);
    expect(relativeToTemp.startsWith('..')).toBe(false);
    expect(path.basename(dbPath)).toBe('portfolio.test.sqlite');

    initDatabase();
  });

  it('creates and synchronizes the current FTS table, triggers, and index on a fresh database', () => {
    expectCurrentFtsSchema();

    const inserted = db.prepare(`
      INSERT INTO blog_posts (slug, title, summary, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'fts-trigger-regression',
      'Insertneedle',
      'FTS trigger regression',
      'A uniquely searchable insertneedle value.',
      '2026-08-20'
    );
    const insertedId = Number(inserted.lastInsertRowid);

    expect(searchFts('insertneedle')).toEqual([
      { rowid: insertedId, title: 'Insertneedle' }
    ]);

    db.prepare(`
      UPDATE blog_posts
      SET title = ?, content = ?
      WHERE id = ?
    `).run('Updateneedle', 'A uniquely searchable updateneedle value.', insertedId);

    expect(searchFts('insertneedle')).toEqual([]);
    expect(searchFts('updateneedle')).toEqual([
      { rowid: insertedId, title: 'Updateneedle' }
    ]);

    db.prepare('DELETE FROM blog_posts WHERE id = ?').run(insertedId);

    expect(searchFts('updateneedle')).toEqual([]);
    expectCurrentFtsSchema();
  });

  it('performs no database writes when the recorded schema is already current', () => {
    const observer = new Database(dbPath, { readonly: true });

    try {
      const dataVersionBefore = observer.pragma('data_version', { simple: true });
      const totalChangesBefore = getTotalChanges();
      const rowCountsBefore = getRowCounts();
      const migrationBefore = db.prepare(`
        SELECT version, applied_at
        FROM schema_migrations
        WHERE component = 'blog_posts_fts'
      `).get();

      initDatabase();

      expect(getTotalChanges()).toBe(totalChangesBefore);
      expect(observer.pragma('data_version', { simple: true })).toBe(dataVersionBefore);
      expect(getRowCounts()).toEqual(rowCountsBefore);
      expect(db.prepare(`
        SELECT version, applied_at
        FROM schema_migrations
        WHERE component = 'blog_posts_fts'
      `).get()).toEqual(migrationBefore);
      expectCurrentFtsSchema();
    } finally {
      observer.close();
    }
  });

  it('rebuilds an unversioned legacy FTS schema once and preserves searchable content', () => {
    db.prepare(`
      INSERT INTO blog_posts (slug, title, summary, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'fts-legacy-regression',
      'Legacysearchneedle',
      'Legacy migration regression',
      'This content must remain searchable after the rebuild.',
      '2026-08-20'
    );

    db.exec(`
      DROP TRIGGER IF EXISTS blog_posts_ai;
      DROP TRIGGER IF EXISTS blog_posts_ad;
      DROP TRIGGER IF EXISTS blog_posts_au;
      DROP TABLE blog_posts_fts;
      DELETE FROM schema_migrations WHERE component = 'blog_posts_fts';

      CREATE VIRTUAL TABLE blog_posts_fts USING fts5(
        title,
        summary,
        content,
        category,
        tokenize='unicode61'
      );

      INSERT INTO blog_posts_fts(rowid, title, summary, content, category)
      SELECT id, title, summary, content, category
      FROM blog_posts;
    `);

    expect(db.prepare('PRAGMA table_info(blog_posts_fts)').all().map(column => column.name))
      .toEqual(['title', 'summary', 'content', 'category']);
    expect(searchFts('legacysearchneedle')).toHaveLength(1);

    const totalChangesBeforeMigration = getTotalChanges();
    initDatabase();

    expect(getTotalChanges()).toBeGreaterThan(totalChangesBeforeMigration);
    expectCurrentFtsSchema();
    expect(searchFts('legacysearchneedle')).toHaveLength(1);

    const totalChangesAfterMigration = getTotalChanges();
    const migrationAfter = db.prepare(`
      SELECT version, applied_at
      FROM schema_migrations
      WHERE component = 'blog_posts_fts'
    `).get();

    initDatabase();

    expect(getTotalChanges()).toBe(totalChangesAfterMigration);
    expect(db.prepare(`
      SELECT version, applied_at
      FROM schema_migrations
      WHERE component = 'blog_posts_fts'
    `).get()).toEqual(migrationAfter);
    expect(searchFts('legacysearchneedle')).toHaveLength(1);
  });
});
