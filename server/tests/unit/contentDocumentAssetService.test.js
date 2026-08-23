import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../../db.js';
import { dbService } from '../../services/dbService.js';
import { contentDocumentAssetService } from '../../services/contentDocumentAssetService.js';
import { contentDocumentStorageService } from '../../services/contentDocumentStorageService.js';

const createdPostIds = [];
const temporaryDirectories = [];
const originalAssetDirectory = process.env.CYBER_ARCHITECT_DOCUMENT_ASSET_DIR;

function unique(prefix) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '')}`;
}

function makeTemporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-db-assets-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createPost() {
  const post = dbService.createBlogPost({
    presentation_profile: 'article',
    slug: unique('document-asset-service'),
    title: 'Document asset service test',
    summary: 'Database asset registry test document.',
    content: '# Asset service test',
    visibility: 'public',
    published: 1
  }, 'TEST_SUITE');
  createdPostIds.push(post.id);
  return post;
}

afterEach(() => {
  for (const postId of createdPostIds.splice(0).reverse()) {
    db.prepare('DELETE FROM blog_posts WHERE id = ?').run(postId);
  }
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
  if (originalAssetDirectory === undefined) delete process.env.CYBER_ARCHITECT_DOCUMENT_ASSET_DIR;
  else process.env.CYBER_ARCHITECT_DOCUMENT_ASSET_DIR = originalAssetDirectory;
});

describe('database-owned document asset registry', () => {
  it('creates a non-overwritable, safe binary manifest without exposing its storage root', () => {
    const assetRoot = makeTemporaryDirectory();
    process.env.CYBER_ARCHITECT_DOCUMENT_ASSET_DIR = assetRoot;
    const post = createPost();

    const asset = contentDocumentAssetService.uploadDocumentAsset({
      postId: post.id,
      relativePath: 'evidence/review.pdf',
      content: Buffer.from('%PDF-1.7\nasset evidence'),
      mimeType: 'application/pdf',
      visibility: 'public',
      actor: 'TEST_SUITE'
    });

    expect(asset).toMatchObject({
      document_id: post.id,
      relative_path: 'evidence/review.pdf',
      original_name: 'review.pdf',
      mime_type: 'application/pdf',
      asset_kind: 'document',
      visibility: 'public',
      availability: 'available'
    });
    expect(asset.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/);
    expect(JSON.stringify(asset)).not.toContain(assetRoot);

    const storage = contentDocumentStorageService.getDocumentStorage(post.id);
    const expectedFile = path.join(assetRoot, storage.storage_key, 'evidence', 'review.pdf');
    expect(fs.readFileSync(expectedFile, 'utf8')).toContain('asset evidence');
    expect(() => contentDocumentAssetService.uploadDocumentAsset({
      postId: post.id,
      relativePath: 'evidence/review.pdf',
      content: Buffer.from('%PDF-replacement'),
      mimeType: 'application/pdf',
      visibility: 'public'
    })).toThrow('CONTENT_DOCUMENT_ASSET_ALREADY_EXISTS');
    expect(() => contentDocumentAssetService.uploadDocumentAsset({
      postId: post.id,
      relativePath: '../escape.pdf',
      content: Buffer.from('escape'),
      mimeType: 'application/pdf'
    })).toThrow('CONTENT_DOCUMENT_ASSET_PATH_INVALID');
    expect(() => contentDocumentAssetService.uploadDocumentAsset({
      postId: post.id,
      relativePath: 'active.svg',
      content: Buffer.from('<svg/>'),
      mimeType: 'image/svg+xml'
    })).toThrow('CONTENT_DOCUMENT_ASSET_TYPE_UNSUPPORTED');
  });
});
