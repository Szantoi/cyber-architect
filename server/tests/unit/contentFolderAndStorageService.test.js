import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../db.js';
import { contentDocumentStorageService } from '../../services/contentDocumentStorageService.js';
import { contentFolderService } from '../../services/contentFolderService.js';
import { dbService } from '../../services/dbService.js';

const createdPostIds = [];
const createdFolderIds = [];
const temporaryDirectories = [];
const originalAssetDirectory = process.env.CYBER_ARCHITECT_DOCUMENT_ASSET_DIR;

function unique(prefix) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`;
}

function createPost(folderId = null) {
  const post = dbService.createBlogPost({
    presentation_profile: 'knowledge',
    slug: unique('folder-storage-test'),
    title: 'Folder storage test document',
    summary: 'Test document for database-owned folders and assets.',
    content: '# Folder storage test',
    folder_id: folderId
  }, 'TEST_SUITE');
  createdPostIds.push(post.id);
  return post;
}

function makeTemporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-document-assets-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const postId of createdPostIds.splice(0).reverse()) {
    db.prepare('DELETE FROM content_document_storage WHERE post_id = ?').run(postId);
    db.prepare('DELETE FROM blog_posts WHERE id = ?').run(postId);
  }
  for (const folderId of createdFolderIds.splice(0).reverse()) {
    db.prepare('DELETE FROM content_folders WHERE id = ?').run(folderId);
  }
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  if (originalAssetDirectory === undefined) delete process.env.CYBER_ARCHITECT_DOCUMENT_ASSET_DIR;
  else process.env.CYBER_ARCHITECT_DOCUMENT_ASSET_DIR = originalAssetDirectory;
});

describe('database-owned content folders', () => {
  it('creates a nested tree, preserves a slug across rename, and rejects a cycle', () => {
    const root = contentFolderService.createFolder({ name: 'Ügyfelek', sort_order: 10 }, 'TEST_SUITE');
    const child = contentFolderService.createFolder({
      name: '2026 projektek',
      parent_id: root.id,
      slug: 'projects-2026'
    }, 'TEST_SUITE');
    createdFolderIds.push(root.id, child.id);

    expect(contentFolderService.listTree()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: root.id,
        children: [expect.objectContaining({ id: child.id, slug: 'projects-2026' })]
      })
    ]));

    const renamed = contentFolderService.updateFolder(child.id, { name: '2026 kiemelt projektek' }, 'TEST_SUITE');
    expect(renamed).toMatchObject({ id: child.id, name: '2026 kiemelt projektek', slug: 'projects-2026' });
    expect(() => contentFolderService.updateFolder(root.id, { parent_id: child.id }, 'TEST_SUITE'))
      .toThrow('CONTENT_FOLDER_CYCLE');
  });

  it('does not delete a folder that is assigned to a document', () => {
    const folder = contentFolderService.createFolder({ name: 'Nem törölhető' }, 'TEST_SUITE');
    createdFolderIds.push(folder.id);
    createPost(folder.id);

    expect(contentFolderService.listTree()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: folder.id, document_count: 1 })
    ]));
    expect(() => contentFolderService.deleteFolder(folder.id, 'TEST_SUITE'))
      .toThrow('CONTENT_FOLDER_HAS_DOCUMENTS');
  });
});

describe('database-owned document asset storage', () => {
  it('creates an opaque stable asset directory without exposing an absolute path', () => {
    const assetRoot = makeTemporaryDirectory();
    process.env.CYBER_ARCHITECT_DOCUMENT_ASSET_DIR = assetRoot;
    const post = createPost();

    const storage = contentDocumentStorageService.ensureDocumentStorage(post.id, 'TEST_SUITE');
    const repeated = contentDocumentStorageService.ensureDocumentStorage(post.id, 'TEST_SUITE');

    expect(storage).toMatchObject({
      post_id: post.id,
      asset_directory: storage.storage_key,
      state: 'ready'
    });
    expect(storage.storage_key).toMatch(/^[A-Za-z0-9_-]{24,128}$/);
    expect(JSON.stringify(storage)).not.toContain(assetRoot);
    expect(repeated.storage_key).toBe(storage.storage_key);
    expect(fs.statSync(path.join(assetRoot, storage.storage_key)).isDirectory()).toBe(true);
  });

  it('resolves only a regular in-storage asset and rejects traversal', () => {
    const assetRoot = makeTemporaryDirectory();
    process.env.CYBER_ARCHITECT_DOCUMENT_ASSET_DIR = assetRoot;
    const post = createPost();
    const storage = contentDocumentStorageService.ensureDocumentStorage(post.id, 'TEST_SUITE');
    const assetPath = path.join(assetRoot, storage.storage_key, 'diagram.pdf');
    fs.writeFileSync(assetPath, 'test-pdf');

    const resolved = contentDocumentStorageService.resolveDocumentAsset({
      postId: post.id,
      relativePath: 'diagram.pdf'
    });
    expect(resolved).toMatchObject({
      relative_path: 'diagram.pdf',
      exists: true,
      storage: expect.objectContaining({ storage_key: storage.storage_key })
    });
    expect(resolved.file_path).toBe(assetPath);
    expect(() => contentDocumentStorageService.resolveDocumentAsset({
      postId: post.id,
      relativePath: '../outside.pdf'
    })).toThrow('CONTENT_DOCUMENT_ASSET_PATH_INVALID');
  });
});
