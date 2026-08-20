import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { db, dbPath, initDatabase } from '../../db.js';

describe('Database initialization safety', () => {
  it('uses an isolated test database and preserves partially populated user tables', () => {
    const relativeToTemp = path.relative(os.tmpdir(), dbPath);

    expect(relativeToTemp.startsWith('..')).toBe(false);
    expect(path.basename(dbPath)).toBe('portfolio.test.sqlite');
    expect(fs.existsSync(dbPath)).toBe(true);

    initDatabase();

    expect(db.prepare('SELECT count(*) AS count FROM projects').get().count).toBeGreaterThan(0);
    expect(db.prepare('SELECT count(*) AS count FROM blog_posts').get().count).toBeGreaterThan(0);

    // Simulate a legitimate, partially populated database. These rows use IDs
    // that overlap defaults as well as user-defined IDs to catch both deletion
    // and replacement regressions.
    db.exec('DELETE FROM projects');
    const insertProject = db.prepare(`
      INSERT INTO projects (id, title, desc, img, tags, status, addr, sec_auth, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertProject.run('PRJ_01', 'Felhasználói projekt', 'Megőrzendő tartalom', '/user.png', '[]', 'ACTIVE', '0xUSER', 'PRIVATE', 1);
    insertProject.run('USER_PROJECT', 'Egyedi projekt', 'Szintén megőrzendő', '/custom.png', '[]', 'DRAFT', '0xCUSTOM', 'PRIVATE', 2);

    db.exec('DELETE FROM blog_posts');
    const insertPost = db.prepare(`
      INSERT INTO blog_posts
        (project_id, content_type, slug, title, summary, content, category, dimensions, visibility, read_time, created_at, published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertPost.run('prj_rag_enterprise', 'blog', 'vallalati-ai-adatbiztonsag-rag', 'Felhasználói cikk', 'Saját összefoglaló', 'Saját tartalom', 'USER', '{}', 'public', '1 PERC', '2026-01-01', 1);
    insertPost.run('prj_general', 'blog', 'egyedi-felhasznaloi-cikk', 'Egyedi cikk', 'Megőrzendő összefoglaló', 'Megőrzendő tartalom', 'USER', '{}', 'private', '2 PERC', '2026-01-02', 0);

    initDatabase();

    const projects = db.prepare('SELECT id, title FROM projects ORDER BY id').all();
    const posts = db.prepare('SELECT slug, title FROM blog_posts ORDER BY slug').all();

    expect(projects).toEqual([
      { id: 'PRJ_01', title: 'Felhasználói projekt' },
      { id: 'USER_PROJECT', title: 'Egyedi projekt' }
    ]);
    expect(posts).toEqual([
      { slug: 'egyedi-felhasznaloi-cikk', title: 'Egyedi cikk' },
      { slug: 'vallalati-ai-adatbiztonsag-rag', title: 'Felhasználói cikk' }
    ]);
  });
});
