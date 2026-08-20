import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';
import { dbService } from '../../services/dbService.js';
import { driveSyncService } from '../../services/driveSyncService.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const createdPostIds = [];

function uniqueSuffix() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createLegacyBlogPostsDatabase(databasePath) {
  const legacyDb = new Database(databasePath);
  try {
    legacyDb.exec(`
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
      );
    `);
    legacyDb.prepare(`
      INSERT INTO blog_posts (
        project_id, content_type, slug, title, summary, content, category,
        dimensions, visibility, drive_file_id, drive_modified_time, embedding,
        read_time, created_at, published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'prj_general',
      'knowledge',
      'legacy-drive-path-row',
      'Legacy Drive path row',
      'This row must survive the additive schema migration.',
      '# Legacy Drive path content',
      'TEST',
      '{}',
      'public',
      'drive_file_legacy_drive_path_row',
      '2026-08-20T00:00:00.000Z',
      '[]',
      '1 PERC',
      '2026-08-20',
      1
    );
  } finally {
    legacyDb.close();
  }
}

function runDatabaseInitialization(databasePath, dataDir) {
  execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      "import { db, initDatabase } from './server/db.js'; initDatabase(); db.close();"
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        NODE_ENV: 'test',
        SQLITE_DATA_DIR: dataDir,
        SQLITE_DB_PATH: databasePath
      },
      encoding: 'utf8'
    }
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  while (createdPostIds.length > 0) {
    const id = createdPostIds.pop();
    dbService.deleteBlogPost(id, 'TEST_CLEANUP');
  }
});

describe('Drive hierarchy persistence', () => {
  it('adds drive_path to legacy databases without replacing existing rows and remains idempotent', () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-drive-path-migration-'));
    const databasePath = path.join(dataDir, 'legacy.sqlite');
    createLegacyBlogPostsDatabase(databasePath);

    try {
      runDatabaseInitialization(databasePath, dataDir);
      runDatabaseInitialization(databasePath, dataDir);

      const migratedDb = new Database(databasePath, { readonly: true });
      try {
        const drivePathColumns = migratedDb.prepare('PRAGMA table_info(blog_posts)')
          .all()
          .filter(column => column.name === 'drive_path');
        const preservedRow = migratedDb.prepare(`
          SELECT id, slug, title, drive_file_id, drive_path
          FROM blog_posts
          WHERE slug = ?
        `).get('legacy-drive-path-row');

        expect(drivePathColumns).toEqual([
          expect.objectContaining({ name: 'drive_path', notnull: 1 })
        ]);
        expect(preservedRow).toEqual({
          id: 1,
          slug: 'legacy-drive-path-row',
          title: 'Legacy Drive path row',
          drive_file_id: 'drive_file_legacy_drive_path_row',
          drive_path: ''
        });
      } finally {
        migratedDb.close();
      }
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('persists normalized Drive paths through create/update and exposes them through public docs and search', async () => {
    const suffix = uniqueSuffix();
    const slug = `drive-path-public-${suffix}`;
    const searchNeedle = `drivepathneedle${suffix.replace(/-/g, '')}`;
    const created = dbService.createBlogPost({
      project_id: 'prj_general',
      content_type: 'knowledge',
      slug,
      title: `Drive path ${searchNeedle}`,
      summary: 'Public hierarchy persistence regression fixture.',
      content: `# ${searchNeedle}\n\nThe path must be visible in API responses.`,
      category: 'TEST',
      visibility: 'public',
      published: 1,
      drive_path: '//knowledge\\Initial Folder//'
    }, 'TEST_SETUP');
    createdPostIds.push(created.id);

    expect(created.drive_path).toBe('knowledge/Initial Folder');

    const updated = dbService.updateBlogPost(created.id, {
      drive_path: '//knowledge\\Architecture//Nested Folder/'
    }, 'TEST_UPDATE');
    expect(updated.drive_path).toBe('knowledge/Architecture/Nested Folder');

    const preserved = dbService.updateBlogPost(created.id, {
      summary: 'The path must remain when an unrelated field changes.'
    }, 'TEST_UPDATE');
    expect(preserved.drive_path).toBe('knowledge/Architecture/Nested Folder');

    const listResponse = await request(app).get('/api/docs');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.docs.find(document => document.slug === slug)).toMatchObject({
      drive_path: 'knowledge/Architecture/Nested Folder'
    });

    const detailResponse = await request(app).get(`/api/docs/${slug}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body).toMatchObject({
      slug,
      drive_path: 'knowledge/Architecture/Nested Folder'
    });

    const docsSearchResponse = await request(app)
      .get('/api/docs/search')
      .query({ q: searchNeedle });
    expect(docsSearchResponse.status).toBe(200);
    expect(docsSearchResponse.body.docs.find(document => document.slug === slug)).toMatchObject({
      drive_path: 'knowledge/Architecture/Nested Folder'
    });

    const knowledgeSearchResponse = await request(app)
      .get('/api/knowledge/search')
      .query({ q: searchNeedle });
    expect(knowledgeSearchResponse.status).toBe(200);
    expect(knowledgeSearchResponse.body.find(document => document.slug === slug)).toMatchObject({
      drive_path: 'knowledge/Architecture/Nested Folder'
    });

    const unifiedSearchResponse = await request(app)
      .get('/api/search/unified')
      .query({ q: searchNeedle, scope: 'knowledge' });
    expect(unifiedSearchResponse.status).toBe(200);
    expect(unifiedSearchResponse.body.results.find(document => document.slug === slug)).toMatchObject({
      drive_path: 'knowledge/Architecture/Nested Folder'
    });
  });

  it('stores the cloud crawler folderPath during sync without using Drive writes', async () => {
    const suffix = uniqueSuffix();
    const slug = `drive-path-sync-${suffix}`;
    const sourceId = `gdrive_drive_path_${suffix}`;
    const seeded = dbService.createBlogPost({
      project_id: 'prj_general',
      content_type: 'knowledge',
      slug,
      title: 'Drive path sync target',
      summary: 'Existing database record to update from a mocked Drive crawl.',
      content: '# Existing content',
      category: 'TEST',
      visibility: 'public',
      published: 1,
      drive_file_id: sourceId,
      drive_path: ''
    }, 'TEST_SETUP');
    createdPostIds.push(seeded.id);

    const document = {
      fileId: sourceId,
      fileName: `${slug}.md`,
      folderPath: 'knowledge\\Cloud Hierarchy//Nested',
      modifiedTime: '2026-08-20T12:00:00.000Z',
      rawContent: `---\nslug: ${slug}\ntitle: Drive path sync target\ncontent_type: knowledge\nsummary: Updated through a mocked cloud crawl.\npublished: true\n---\n# Synced content`
    };
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue({
      mode: 'GOOGLE_SERVICE_ACCOUNT',
      source_of_truth: 'GOOGLE_DRIVE_CLOUD',
      drive_folder_id: 'root-folder',
      drive_knowledge_folder_id: 'knowledge-folder',
      drive_blog_folder_id: null,
      configuration_errors: []
    });
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates')
      .mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'test-token' }]);
    const crawlSpy = vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback')
      .mockResolvedValue({
        documents: [document],
        errors: [],
        warnings: [],
        skipped: [],
        pages: 1,
        listed: 1,
        authMode: 'SERVICE_ACCOUNT'
      });

    const result = await driveSyncService.syncAll('TEST');
    const persisted = dbService.getBlogPostByDriveFileId(sourceId);

    expect(crawlSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'knowledge', folderPath: 'knowledge' }),
      expect.any(Array)
    );
    expect(result).toMatchObject({ created: 0, updated: 1, errors: [] });
    expect(persisted).toMatchObject({
      id: seeded.id,
      drive_path: 'knowledge/Cloud Hierarchy/Nested'
    });
  });
});
