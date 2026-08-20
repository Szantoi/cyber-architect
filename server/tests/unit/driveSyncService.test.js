import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dbService } from '../../services/dbService.js';
import {
  deriveLocalPathHashSourceId,
  deriveLegacyLocalSourceId,
  driveSyncService,
  formatPostToMarkdown,
  parseFrontmatter,
  resolveContentRoot,
  resolveOAuthRedirectUri,
  resolveProjectConfigPath
} from '../../services/driveSyncService.js';

const originalOAuthClientPath = process.env.GOOGLE_OAUTH_CLIENT_PATH;
const originalOAuthTokensPath = process.env.GOOGLE_OAUTH_TOKENS_PATH;
const originalOAuthRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
const originalGoogleCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const originalNodeEnv = process.env.NODE_ENV;
const originalSiteUrl = process.env.SITE_URL;
const originalDriveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
const originalKnowledgeFolderId = process.env.DRIVE_KNOWLEDGE_FOLDER_ID;
const originalBlogFolderId = process.env.DRIVE_BLOG_FOLDER_ID;
const originalContentRoot = process.env.CYBER_ARCHITECT_CONTENT_ROOT;
const temporaryDirectories = [];

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function textResponse(body, status = 200) {
  return new Response(body, { status });
}

function emptyCrawlReport(overrides = {}) {
  return {
    documents: [],
    errors: [],
    warnings: [],
    skipped: [],
    pages: 1,
    listed: 0,
    authMode: 'SERVICE_ACCOUNT',
    ...overrides
  };
}

function cloudStatus(overrides = {}) {
  return {
    mode: 'GOOGLE_SERVICE_ACCOUNT',
    drive_folder_id: 'root-folder',
    drive_knowledge_folder_id: 'knowledge-folder',
    drive_blog_folder_id: 'blog-folder',
    is_oauth_connected: true,
    ...overrides
  };
}

function validRepairMarkdown({
  slug = 'repair-target',
  title = 'Repair target',
  published = true,
  contentType = null,
  body = '# Repaired content'
} = {}) {
  return `---\ntitle: ${title}\nslug: ${slug}\npublished: ${published}${
    contentType ? `\ncontent_type: ${contentType}` : ''
  }\n---\n${body}`;
}

function repairCloudDocument(overrides = {}) {
  return {
    fileId: 'gdrive_repair-target',
    fileName: 'repair-target.md',
    folderPath: 'knowledge/Repair Folder',
    modifiedTime: '2026-08-20T10:00:00.000Z',
    rawContent: '',
    mimeType: 'text/markdown',
    size: 0,
    version: '7',
    md5Checksum: 'd41d8cd98f00b204e9800998ecf8427e',
    trashed: false,
    etag: '"repair-etag"',
    shortcut: false,
    ...overrides
  };
}

function repairMetadataResponse(document, overrides = {}, etag = null) {
  const metadata = {
    id: String(document.fileId).replace(/^gdrive_/, ''),
    size: String(document.size),
    modifiedTime: document.modifiedTime,
    version: String(document.version),
    md5Checksum: document.md5Checksum,
    mimeType: document.mimeType,
    trashed: Boolean(document.trashed),
    ...overrides
  };
  const headers = { 'Content-Type': 'application/json' };
  if (etag) headers.ETag = etag;
  return new Response(JSON.stringify(metadata), { status: 200, headers });
}

function repairLocalDocument(overrides = {}) {
  return {
    fileId: 'drive_file_repair-target',
    fileName: 'repair-target.md',
    folderPath: 'knowledge/Repair Folder',
    modifiedTime: '2026-08-20T09:00:00.000Z',
    rawContent: validRepairMarkdown(),
    ...overrides
  };
}

function restoreEnvironmentVariable(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  restoreEnvironmentVariable('GOOGLE_OAUTH_CLIENT_PATH', originalOAuthClientPath);
  restoreEnvironmentVariable('GOOGLE_OAUTH_TOKENS_PATH', originalOAuthTokensPath);
  restoreEnvironmentVariable('GOOGLE_OAUTH_REDIRECT_URI', originalOAuthRedirectUri);
  restoreEnvironmentVariable('GOOGLE_APPLICATION_CREDENTIALS', originalGoogleCredentials);
  restoreEnvironmentVariable('NODE_ENV', originalNodeEnv);
  restoreEnvironmentVariable('SITE_URL', originalSiteUrl);
  restoreEnvironmentVariable('GOOGLE_DRIVE_FOLDER_ID', originalDriveFolderId);
  restoreEnvironmentVariable('DRIVE_KNOWLEDGE_FOLDER_ID', originalKnowledgeFolderId);
  restoreEnvironmentVariable('DRIVE_BLOG_FOLDER_ID', originalBlogFolderId);
  restoreEnvironmentVariable('CYBER_ARCHITECT_CONTENT_ROOT', originalContentRoot);
  while (temporaryDirectories.length > 0) {
    fs.rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe('Drive cloud crawler', () => {
  it('follows every nextPageToken, accepts case-insensitive Markdown extensions, and reports empty files', async () => {
    const listUrls = [];
    const fetchMock = vi.fn(async input => {
      const url = new URL(String(input));
      if (url.pathname === '/drive/v3/files') {
        listUrls.push(url);
        if (!url.searchParams.has('pageToken')) {
          return jsonResponse({
            nextPageToken: 'page-2',
            files: [{
              id: 'empty-file',
              name: 'EMPTY.MD',
              mimeType: 'application/octet-stream',
              modifiedTime: '2026-08-20T08:00:00.000Z',
              size: '0'
            }]
          });
        }
        return jsonResponse({
          files: [{
            id: 'markdown-file',
            name: 'notes.Markdown',
            mimeType: 'application/octet-stream',
            modifiedTime: '2026-08-20T09:00:00.000Z',
            size: '4',
            version: '42',
            md5Checksum: '841a2d689ad86bd1611447453c22c6fc'
          }]
        });
      }
      if (url.pathname.endsWith('/empty-file')) return textResponse('');
      if (url.pathname.endsWith('/markdown-file')) return textResponse('body');
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await driveSyncService.crawlCloudFolder('root', 'knowledge', 'token');

    expect(report.pages).toBe(2);
    expect(report.documents).toEqual([
      expect.objectContaining({
        fileName: 'notes.Markdown',
        rawContent: 'body',
        version: '42',
        md5Checksum: '841a2d689ad86bd1611447453c22c6fc'
      })
    ]);
    expect(report.errors).toEqual([
      expect.objectContaining({ code: 'DRIVE_FILE_EMPTY', file: 'EMPTY.MD', cloud_bytes: 0 })
    ]);
    expect(report.skipped).toEqual([
      expect.objectContaining({ code: 'DRIVE_FILE_EMPTY', file: 'EMPTY.MD' })
    ]);
    expect(listUrls[0].searchParams.get('supportsAllDrives')).toBe('true');
    expect(listUrls[0].searchParams.get('includeItemsFromAllDrives')).toBe('true');
    expect(listUrls[0].searchParams.get('pageSize')).toBe('1000');
    expect(listUrls[0].searchParams.get('fields')).toContain('version');
    expect(listUrls[0].searchParams.get('fields')).toContain('md5Checksum');
    expect(listUrls[1].searchParams.get('pageToken')).toBe('page-2');
  });

  it('resolves file and folder shortcuts while preventing shortcut cycles', async () => {
    const fetchMock = vi.fn(async input => {
      const url = new URL(String(input));
      if (url.pathname === '/drive/v3/files' && url.searchParams.get('q')?.includes("'root' in parents")) {
        return jsonResponse({ files: [
          {
            id: 'file-shortcut',
            name: 'guide shortcut',
            mimeType: 'application/vnd.google-apps.shortcut',
            shortcutDetails: { targetId: 'target-file', targetMimeType: 'application/octet-stream' }
          },
          {
            id: 'folder-shortcut',
            name: 'child shortcut',
            mimeType: 'application/vnd.google-apps.shortcut',
            shortcutDetails: { targetId: 'child', targetMimeType: 'application/vnd.google-apps.folder' }
          }
        ] });
      }
      if (url.pathname === '/drive/v3/files' && url.searchParams.get('q')?.includes("'child' in parents")) {
        return jsonResponse({ files: [{
          id: 'back-shortcut',
          name: 'back to root',
          mimeType: 'application/vnd.google-apps.shortcut',
          shortcutDetails: { targetId: 'root', targetMimeType: 'application/vnd.google-apps.folder' }
        }] });
      }
      if (url.pathname.endsWith('/target-file') && url.searchParams.get('alt') === 'media') {
        return textResponse('# Shortcut target');
      }
      if (url.pathname.endsWith('/target-file')) {
        return jsonResponse({ id: 'target-file', name: 'guide.md', mimeType: 'application/octet-stream', size: '17' });
      }
      if (url.pathname.endsWith('/child')) {
        return jsonResponse({ id: 'child', name: 'child', mimeType: 'application/vnd.google-apps.folder' });
      }
      if (url.pathname.endsWith('/root')) {
        return jsonResponse({ id: 'root', name: 'root', mimeType: 'application/vnd.google-apps.folder' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await driveSyncService.crawlCloudFolder('root', 'knowledge', 'token');

    expect(report.documents).toEqual([
      expect.objectContaining({ fileId: 'gdrive_target-file', fileName: 'guide.md', rawContent: '# Shortcut target' })
    ]);
    expect(report.skipped).toEqual([
      expect.objectContaining({ code: 'DRIVE_FOLDER_ALREADY_VISITED', stage: 'RECURSION_GUARD' })
    ]);
    expect(report.pages).toBe(2);
  });

  it('exports Google Docs as Markdown first and reports a recovered plain-text fallback', async () => {
    const requestedFormats = [];
    const fetchMock = vi.fn(async input => {
      const url = new URL(String(input));
      if (url.pathname === '/drive/v3/files') {
        return jsonResponse({ files: [{
          id: 'google-doc',
          name: 'Architecture',
          mimeType: 'application/vnd.google-apps.document'
        }] });
      }
      if (url.pathname.endsWith('/google-doc/export')) {
        const format = url.searchParams.get('mimeType');
        requestedFormats.push(format);
        return format === 'text/markdown'
          ? jsonResponse({ error: { message: 'Markdown export unavailable' } }, 406)
          : textResponse('Plain fallback');
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await driveSyncService.crawlCloudFolder('root', 'knowledge', 'token');

    expect(requestedFormats).toEqual(['text/markdown', 'text/plain']);
    expect(report.documents[0].rawContent).toBe('Plain fallback');
    expect(report.warnings).toEqual([
      expect.objectContaining({ code: 'GOOGLE_DOC_MARKDOWN_EXPORT_FALLBACK', recovered: true, http_status: 406 })
    ]);
  });

  it('keeps healthy siblings when a subfolder fails and skips oversized documents before and after download', async () => {
    const overLimitContent = 'x'.repeat((5 * 1024 * 1024) + 1);
    const fetchMock = vi.fn(async input => {
      const url = new URL(String(input));
      if (url.pathname === '/drive/v3/files' && url.searchParams.get('q')?.includes("'root' in parents")) {
        return jsonResponse({ files: [
          { id: 'blocked', name: 'blocked', mimeType: 'application/vnd.google-apps.folder' },
          { id: 'good', name: 'good.md', mimeType: 'text/markdown', size: '4' },
          { id: 'declared-huge', name: 'huge.md', mimeType: 'text/markdown', size: String((5 * 1024 * 1024) + 1) },
          { id: 'downloaded-huge', name: 'surprise.md', mimeType: 'text/markdown', size: '1' }
        ] });
      }
      if (url.pathname === '/drive/v3/files' && url.searchParams.get('q')?.includes("'blocked' in parents")) {
        return jsonResponse({ error: { message: 'Folder not shared' } }, 403);
      }
      if (url.pathname.endsWith('/good')) return textResponse('good');
      if (url.pathname.endsWith('/downloaded-huge')) return textResponse(overLimitContent);
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await driveSyncService.crawlCloudFolder('root', 'knowledge', 'token');

    expect(report.documents).toEqual([
      expect.objectContaining({ fileId: 'gdrive_good', rawContent: 'good' })
    ]);
    expect(report.errors).toEqual([
      expect.objectContaining({ code: 'DRIVE_LIST_FAILED', http_status: 403, folder_id: 'blocked' })
    ]);
    expect(report.skipped.filter(issue => issue.code === 'DRIVE_FILE_TOO_LARGE')).toHaveLength(2);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes('declared-huge'))).toBe(false);
  });

  it('retries a service-account 403 once with OAuth without exposing either token', async () => {
    const usedAuthorizationHeaders = [];
    const fetchMock = vi.fn(async (input, options) => {
      const url = new URL(String(input));
      const authorization = options.headers.Authorization;
      usedAuthorizationHeaders.push(authorization);
      if (url.pathname === '/drive/v3/files') {
        if (authorization === 'Bearer service-account-secret') {
          return jsonResponse({ error: { message: 'Not shared with service account' } }, 403);
        }
        return jsonResponse({ files: [{ id: 'oauth-file', name: 'oauth.md', mimeType: 'text/markdown' }] });
      }
      if (url.pathname.endsWith('/oauth-file')) return textResponse('OAuth content');
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await driveSyncService.crawlCloudSourceWithTokenFallback(
      { folderId: 'root', folderPath: 'knowledge' },
      [
        { mode: 'SERVICE_ACCOUNT', token: 'service-account-secret' },
        { mode: 'OAUTH_USER', token: 'oauth-user-secret' }
      ]
    );

    expect(report.authMode).toBe('OAUTH_USER');
    expect(report.documents[0]).toMatchObject({ fileId: 'gdrive_oauth-file', rawContent: 'OAuth content' });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([
      expect.objectContaining({ code: 'DRIVE_AUTH_FALLBACK_USED', recovered: true, http_status: 403 })
    ]);
    expect(usedAuthorizationHeaders).toContain('Bearer service-account-secret');
    expect(usedAuthorizationHeaders).toContain('Bearer oauth-user-secret');
    expect(JSON.stringify(report)).not.toContain('service-account-secret');
    expect(JSON.stringify(report)).not.toContain('oauth-user-secret');
  });

  it('retries the complete source with OAuth after shortcut, download or Docs export access denial', async () => {
    const serviceAccountPaths = [];
    let rootListCount = 0;
    const fetchMock = vi.fn(async (input, options) => {
      const url = new URL(String(input));
      const isServiceAccount = options.headers.Authorization === 'Bearer service-account-secret';
      if (isServiceAccount) serviceAccountPaths.push(`${url.pathname}?${url.searchParams.toString()}`);

      if (url.pathname === '/drive/v3/files') {
        rootListCount++;
        return jsonResponse({ files: [{
          id: 'shortcut',
          name: 'shortcut.md',
          mimeType: 'application/vnd.google-apps.shortcut',
          shortcutDetails: {
            targetId: 'shortcut-target',
            targetMimeType: 'text/markdown'
          }
        }, {
          id: 'regular',
          name: 'regular.md',
          mimeType: 'text/markdown'
        }, {
          id: 'doc',
          name: 'native-doc',
          mimeType: 'application/vnd.google-apps.document'
        }] });
      }

      if (isServiceAccount) {
        return jsonResponse({ error: { message: 'Source item is not shared' } }, 403);
      }
      if (url.pathname.endsWith('/shortcut-target') && !url.searchParams.has('alt')) {
        return jsonResponse({ id: 'shortcut-target', name: 'target.md', mimeType: 'text/markdown', size: '8' });
      }
      if (url.pathname.endsWith('/shortcut-target')) return textResponse('shortcut');
      if (url.pathname.endsWith('/regular')) return textResponse('regular');
      if (url.pathname.endsWith('/doc/export')) return textResponse('native doc');
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await driveSyncService.crawlCloudSourceWithTokenFallback(
      { folderId: 'root', folderPath: 'knowledge' },
      [{ mode: 'SERVICE_ACCOUNT', token: 'service-account-secret' }, {
        mode: 'OAUTH_USER',
        getToken: vi.fn().mockResolvedValue('oauth-user-secret')
      }]
    );

    expect(rootListCount).toBe(2);
    expect(report.authMode).toBe('OAUTH_USER');
    expect(report.documents.map(document => document.rawContent)).toEqual([
      'shortcut',
      'regular',
      'native doc'
    ]);
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([
      expect.objectContaining({ code: 'DRIVE_AUTH_FALLBACK_USED', recovered: true, http_status: 403 })
    ]);
    expect(serviceAccountPaths.some(requestPath => requestPath.includes('/shortcut-target?'))).toBe(true);
    expect(serviceAccountPaths.some(requestPath => requestPath.includes('/regular?alt=media'))).toBe(true);
    expect(serviceAccountPaths.some(requestPath => requestPath.includes('/doc/export?mimeType=text%2Fmarkdown'))).toBe(true);
    expect(JSON.stringify(report)).not.toContain('service-account-secret');
    expect(JSON.stringify(report)).not.toContain('oauth-user-secret');
  });

  it('retries with OAuth when a service-account Docs Markdown export denial was locally recoverable', async () => {
    const fetchMock = vi.fn(async (input, options) => {
      const url = new URL(String(input));
      const isServiceAccount = options.headers.Authorization === 'Bearer service-account-secret';
      if (url.pathname === '/drive/v3/files') {
        return jsonResponse({ files: [{
          id: 'doc',
          name: 'native-doc',
          mimeType: 'application/vnd.google-apps.document'
        }] });
      }
      if (url.pathname.endsWith('/doc/export')) {
        const isMarkdown = url.searchParams.get('mimeType') === 'text/markdown';
        if (isServiceAccount && isMarkdown) {
          return jsonResponse({ error: { message: 'Markdown export not shared' } }, 403);
        }
        if (isServiceAccount) return textResponse('degraded plain text');
        return textResponse('# Full OAuth Markdown');
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await driveSyncService.crawlCloudSourceWithTokenFallback(
      { folderId: 'root', folderPath: 'knowledge' },
      [{ mode: 'SERVICE_ACCOUNT', token: 'service-account-secret' }, {
        mode: 'OAUTH_USER',
        token: 'oauth-user-secret'
      }]
    );

    expect(report.authMode).toBe('OAUTH_USER');
    expect(report.documents).toEqual([
      expect.objectContaining({ rawContent: '# Full OAuth Markdown' })
    ]);
    expect(report.warnings).toEqual([
      expect.objectContaining({ code: 'DRIVE_AUTH_FALLBACK_USED', recovered: true, http_status: 403 })
    ]);
  });

  it('uses finite abort signals and turns list, metadata, download and export timeouts into structured issues', async () => {
    const signals = [];
    const fetchMock = vi.fn(async (_input, options) => {
      signals.push(options.signal);
      const error = new Error('Drive request timed out');
      error.name = 'TimeoutError';
      throw error;
    });
    vi.stubGlobal('fetch', fetchMock);

    const listReport = await driveSyncService.crawlCloudFolder('root', 'knowledge', 'token');
    const shortcutResult = await driveSyncService.resolveDriveShortcut({
      id: 'shortcut',
      name: 'shortcut',
      shortcutDetails: { targetId: 'target' }
    }, 'knowledge', 'token');
    const downloadResult = await driveSyncService.downloadDriveDocument({
      id: 'binary',
      name: 'binary.md',
      mimeType: 'text/markdown'
    }, 'knowledge', 'token');
    const exportResult = await driveSyncService.downloadDriveDocument({
      id: 'doc',
      name: 'doc',
      mimeType: 'application/vnd.google-apps.document'
    }, 'knowledge', 'token');

    expect(listReport.errors[0]).toMatchObject({ code: 'DRIVE_LIST_FAILED', message: 'Drive request timed out' });
    expect(shortcutResult.error).toMatchObject({ code: 'DRIVE_SHORTCUT_RESOLVE_FAILED', message: 'Drive request timed out' });
    expect(downloadResult.error).toMatchObject({ code: 'DRIVE_DOWNLOAD_FAILED', message: 'Drive request timed out' });
    expect(exportResult.warnings[0]).toMatchObject({ code: 'GOOGLE_DOC_MARKDOWN_EXPORT_FALLBACK' });
    expect(exportResult.error).toMatchObject({ code: 'GOOGLE_DOC_EXPORT_FAILED', message: 'Drive request timed out' });
    expect(signals).toHaveLength(5);
    expect(signals.every(signal => signal && typeof signal.addEventListener === 'function')).toBe(true);
  });

  it('hashes normalized local relative paths so sanitized-name collisions keep distinct identities', () => {
    const localDir = fs.mkdtempSync(path.join(process.cwd(), '.drive-local-id-test-'));
    temporaryDirectories.push(localDir);
    fs.writeFileSync(path.join(localDir, 'a b.md'), 'first');
    fs.writeFileSync(path.join(localDir, 'a_b.md'), 'second');

    const documents = driveSyncService.crawlLocalFolder(localDir, 'knowledge');
    const sourceIds = documents.map(document => document.fileId);

    expect(sourceIds).toHaveLength(2);
    expect(new Set(sourceIds).size).toBe(2);
    expect(sourceIds.every(sourceId => /^drive_file_knowledge_a_b_md_[a-f0-9]{16}$/.test(sourceId))).toBe(true);
    expect(deriveLegacyLocalSourceId('knowledge\\Folder Name', 'index.md')).toBe(
      deriveLegacyLocalSourceId('knowledge/Folder Name', 'index.md')
    );
    expect(deriveLegacyLocalSourceId('knowledge/Folder Name', 'index.md')).toBe(
      'drive_file_knowledge/Folder Name_index_md'
    );
  });
});

describe('Local mirror source cardinality', () => {
  it('keeps distinct local paths as distinct rows when their slug and title match', async () => {
    const documents = [{
      fileId: 'drive_file_knowledge_first_same_md_1111111111111111',
      fileName: 'same.md',
      folderPath: 'knowledge/first',
      modifiedTime: '2026-08-20T10:00:00.000Z',
      rawContent: '---\nslug: same\ntitle: Same document\ncontent_type: knowledge\npublished: true\n---\nFirst body'
    }, {
      fileId: 'drive_file_knowledge_second_same_md_2222222222222222',
      fileName: 'same.md',
      folderPath: 'knowledge/second',
      modifiedTime: '2026-08-20T10:01:00.000Z',
      rawContent: '---\nslug: same\ntitle: Same document\ncontent_type: knowledge\npublished: true\n---\nSecond body'
    }];
    const rows = [{
      id: 1,
      slug: 'same',
      title: 'Same document',
      content_type: 'knowledge',
      drive_file_id: '',
      published: 1
    }];

    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue({
      mode: 'LOCAL_DRIVE_MIRROR',
      source_of_truth: 'LOCAL_DRIVE_MIRROR',
      knowledge_vault_dir: 'knowledge-root',
      blog_vault_dir: 'blog-root',
      configuration_errors: []
    });
    vi.spyOn(driveSyncService, 'crawlLocalFolder').mockImplementation((_dir, prefix) => (
      prefix === 'knowledge' ? documents : []
    ));
    vi.spyOn(dbService, 'getBlogPostByDriveFileId').mockImplementation(sourceId => (
      rows.find(row => row.drive_file_id === sourceId) || null
    ));
    vi.spyOn(dbService, 'getBlogPostBySlug').mockImplementation(slug => (
      rows.find(row => row.slug === slug) || null
    ));
    vi.spyOn(dbService, 'updateBlogPost').mockImplementation((id, data) => {
      const index = rows.findIndex(row => row.id === id);
      rows[index] = { ...rows[index], ...data };
      return rows[index];
    });
    vi.spyOn(dbService, 'createBlogPost').mockImplementation(data => {
      const row = { id: rows.length + 1, ...data };
      rows.push(row);
      return row;
    });

    const result = await driveSyncService.syncAll('TEST');
    const sourceOwnedRows = rows.filter(row => row.drive_file_id);

    expect(result).toMatchObject({
      discovered: 2,
      processed: 2,
      synced: 2,
      updated: 1,
      created: 1,
      adopted: 1,
      reslugged: 1,
      errors: []
    });
    expect(result.collisions).toEqual([
      expect.objectContaining({
        incoming_file_id: documents[1].fileId,
        existing_file_id: documents[0].fileId,
        requested_slug: 'same'
      })
    ]);
    expect(sourceOwnedRows).toHaveLength(2);
    expect(new Set(sourceOwnedRows.map(row => row.drive_file_id))).toEqual(new Set(documents.map(doc => doc.fileId)));
    expect(new Set(sourceOwnedRows.map(row => row.slug)).size).toBe(2);
  });

  it('still upgrades an exact pre-hash local identity for the same path', async () => {
    const document = {
      fileId: 'drive_file_knowledge_legacy_exact_md_3333333333333333',
      fileName: 'exact.md',
      folderPath: 'knowledge/legacy',
      modifiedTime: '2026-08-20T10:00:00.000Z',
      rawContent: '---\nslug: exact\ntitle: Exact legacy document\ncontent_type: knowledge\npublished: true\n---\nBody'
    };
    const legacyRow = {
      id: 7,
      slug: 'exact',
      title: 'Exact legacy document',
      content_type: 'knowledge',
      drive_file_id: deriveLegacyLocalSourceId(document.folderPath, document.fileName),
      published: 1
    };

    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue({
      mode: 'LOCAL_DRIVE_MIRROR',
      source_of_truth: 'LOCAL_DRIVE_MIRROR',
      knowledge_vault_dir: 'knowledge-root',
      blog_vault_dir: 'blog-root',
      configuration_errors: []
    });
    vi.spyOn(driveSyncService, 'crawlLocalFolder').mockImplementation((_dir, prefix) => (
      prefix === 'knowledge' ? [document] : []
    ));
    vi.spyOn(dbService, 'getBlogPostByDriveFileId').mockReturnValue(null);
    vi.spyOn(dbService, 'getBlogPostBySlug').mockImplementation(slug => (
      slug === legacyRow.slug ? legacyRow : null
    ));
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost').mockImplementation((id, data) => ({
      ...legacyRow,
      ...data,
      id
    }));

    const result = await driveSyncService.syncAll('TEST');

    expect(updateSpy).toHaveBeenCalledWith(legacyRow.id, expect.objectContaining({
      drive_file_id: document.fileId,
      slug: 'exact'
    }), 'TEST');
    expect(result).toMatchObject({ updated: 1, created: 0, adopted: 1, reslugged: 0, errors: [] });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'LOCAL_SOURCE_ID_UPGRADED',
        previous_source_id: legacyRow.drive_file_id
      })
    ]);
  });
});

describe('Empty Drive file protection and targeted repair', () => {
  function arrangeRepair({
    cloudDocuments = [repairCloudDocument()],
    localDocuments = [repairLocalDocument()],
    candidates = [{ mode: 'SERVICE_ACCOUNT', token: 'service-token' }],
    authMode = 'SERVICE_ACCOUNT'
  } = {}) {
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    const tokenSpy = vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue(candidates);
    const cloudSpy = vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback')
      .mockResolvedValue(emptyCrawlReport({ documents: cloudDocuments, authMode }));
    const localSpy = vi.spyOn(driveSyncService, 'crawlLocalFolder').mockImplementation((_dir, prefix) => (
      localDocuments.filter(document => document.folderPath.split(/[/\\]/)[0] === prefix)
    ));
    return { tokenSpy, cloudSpy, localSpy };
  }

  it('refuses whitespace-only cloud documents during normal pull and performs no DB upsert', async () => {
    const fetchMock = vi.fn(async input => {
      const url = new URL(String(input));
      if (url.pathname === '/drive/v3/files' && !url.searchParams.has('alt')) {
        return jsonResponse({ files: [{
          id: 'empty-cloud',
          name: 'empty-cloud.md',
          mimeType: 'text/markdown',
          size: '3'
        }] });
      }
      if (url.pathname === '/drive/v3/files/empty-cloud' && url.searchParams.get('alt') === 'media') {
        return textResponse(' \n\t');
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([
      { mode: 'SERVICE_ACCOUNT', token: 'service-token' }
    ]);
    const createSpy = vi.spyOn(dbService, 'createBlogPost');
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost');

    const result = await driveSyncService.syncAll('TEST');

    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ discovered: 1, processed: 0, synced: 0, skipped_count: 1 });
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'DRIVE_FILE_EMPTY', stage: 'CONTENT_VALIDATION', cloud_bytes: 3 })
    ]);
    expect(result.files).toEqual([
      expect.objectContaining({ file: 'empty-cloud.md', status: 'SKIPPED', reason: 'DRIVE_FILE_EMPTY' })
    ]);
  });

  it('previews an exact one-to-one repair without Drive, DB, token-file, or local writes', async () => {
    const contentRoot = fs.mkdtempSync(path.join(process.cwd(), '.drive-repair-content-root-test-'));
    temporaryDirectories.push(contentRoot);
    process.env.CYBER_ARCHITECT_CONTENT_ROOT = contentRoot;
    const { tokenSpy, cloudSpy, localSpy } = arrangeRepair({
      cloudDocuments: [repairCloudDocument({ folderPath: 'knowledge\\Repair Folder' })]
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const saveTokensSpy = vi.spyOn(driveSyncService, 'saveTokens');
    const createSpy = vi.spyOn(dbService, 'createBlogPost');
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost');
    const writeSpy = vi.spyOn(fs, 'writeFileSync');

    const result = await driveSyncService.repairEmptyCloudFilesFromLocal();

    expect(tokenSpy).toHaveBeenCalledWith({ persistOAuthTokens: false, lazyOAuth: true });
    expect(cloudSpy).toHaveBeenCalledWith(
      expect.objectContaining({ folderPath: 'knowledge' }),
      expect.any(Array),
      { allowEmpty: true }
    );
    expect(localSpy.mock.calls).toEqual([
      [path.join(contentRoot, 'KnowledgeBase'), 'knowledge'],
      [path.join(contentRoot, 'Blog'), 'blog']
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saveTokensSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      dry_run: true,
      cloud_discovered: 1,
      local_discovered: 1,
      empty_cloud: 1,
      matched: 1,
      eligible: 1,
      would_repair: 1,
      repaired: 0,
      errors: []
    });
    expect(result.files).toEqual([
      expect.objectContaining({
        document_key: 'knowledge/Repair Folder/repair-target.md',
        status: 'WOULD_REPAIR',
        local_sha256: expect.stringMatching(/^[a-f0-9]{64}$/)
      })
    ]);
  });

  it('revalidates an empty target and PATCHes the exact file with an ETag precondition', async () => {
    const cloudDocument = repairCloudDocument();
    const localDocument = repairLocalDocument();
    arrangeRepair({ cloudDocuments: [cloudDocument], localDocuments: [localDocument] });
    const requests = [];
    const fetchMock = vi.fn(async (input, options = {}) => {
      const url = new URL(String(input));
      requests.push({ url, options });
      if (url.hostname === 'www.googleapis.com'
        && url.pathname === '/drive/v3/files/repair-target'
        && url.searchParams.get('alt') === 'media') {
        return new Response('', { status: 200 });
      }
      if (url.hostname === 'www.googleapis.com' && url.pathname === '/drive/v3/files/repair-target') {
        return repairMetadataResponse(cloudDocument, {}, '"repair-etag"');
      }
      if (url.hostname === 'www.googleapis.com' && url.pathname === '/upload/drive/v3/files/repair-target') {
        return jsonResponse({ id: 'repair-target' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    const createSpy = vi.spyOn(dbService, 'createBlogPost');
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost');

    const result = await driveSyncService.repairEmptyCloudFilesFromLocal({ dryRun: false });

    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(requests).toHaveLength(4);
    expect(requests[0].options.method).toBeUndefined();
    expect(requests[0].url.searchParams.get('fields')).toContain('version');
    expect(requests[1].url.searchParams.get('alt')).toBe('media');
    expect(requests[2].url.searchParams.get('fields')).toContain('md5Checksum');
    expect(requests[3].options).toMatchObject({
      method: 'PATCH',
      body: localDocument.rawContent,
      headers: expect.objectContaining({
        'Content-Type': 'text/markdown; charset=utf-8',
        'If-Match': '"repair-etag"'
      })
    });
    expect(requests[3].url.searchParams.get('uploadType')).toBe('media');
    expect(requests[3].url.searchParams.get('supportsAllDrives')).toBe('true');
    expect(requests.every(request => !['POST', 'DELETE'].includes(request.options.method))).toBe(true);
    expect(result).toMatchObject({
      dry_run: false,
      matched: 1,
      eligible: 1,
      would_repair: 0,
      repaired: 1,
      processed: 1,
      errors: []
    });
    expect(result.files[0]).toMatchObject({
      status: 'REPAIRED',
      etag_precondition_used: true,
      version_precondition_used: true
    });
  });

  it('never overwrites a non-empty cloud match', async () => {
    arrangeRepair({ cloudDocuments: [repairCloudDocument({ rawContent: '# Existing cloud content', size: 24 })] });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await driveSyncService.repairEmptyCloudFilesFromLocal({ dryRun: false });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      matched: 1,
      empty_cloud: 0,
      nonempty_cloud: 1,
      eligible: 0,
      repaired: 0,
      errors: []
    });
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'CLOUD_FILE_NONEMPTY' })]);
    expect(result.files[0]).toMatchObject({ status: 'SKIPPED', reason: 'CLOUD_FILE_NONEMPTY' });
  });

  it('refuses ambiguous exact-path matches and invalid local frontmatter', async () => {
    const duplicateLocal = repairLocalDocument({ fileId: 'drive_file_duplicate' });
    arrangeRepair({ localDocuments: [repairLocalDocument(), duplicateLocal] });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const ambiguousResult = await driveSyncService.repairEmptyCloudFilesFromLocal({ dryRun: false });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(ambiguousResult.errors).toEqual([
      expect.objectContaining({
        code: 'REPAIR_MATCH_AMBIGUOUS',
        ambiguity_reason: 'MULTIPLE_LOCAL_PATH_MATCHES'
      })
    ]);
    expect(ambiguousResult).toMatchObject({ matched: 0, eligible: 0, repaired: 0 });

    vi.restoreAllMocks();
    arrangeRepair({
      localDocuments: [repairLocalDocument({
        rawContent: '---\ntitle: Repair target\nslug: repair-target\n---\nMissing explicit publication state'
      })]
    });
    const invalidFetchMock = vi.fn();
    vi.stubGlobal('fetch', invalidFetchMock);

    const invalidResult = await driveSyncService.repairEmptyCloudFilesFromLocal({ dryRun: false });

    expect(invalidFetchMock).not.toHaveBeenCalled();
    expect(invalidResult.errors).toEqual([
      expect.objectContaining({
        code: 'LOCAL_CONTENT_INVALID',
        validation_reason: 'EXPLICIT_PUBLISHED_REQUIRED'
      })
    ]);
    expect(invalidResult).toMatchObject({ matched: 1, eligible: 0, repaired: 0 });
  });

  it('reports PATCH failures without aborting or creating replacement files', async () => {
    const cloudDocument = repairCloudDocument();
    arrangeRepair({ cloudDocuments: [cloudDocument] });
    const requests = [];
    const fetchMock = vi.fn(async (input, options = {}) => {
      const url = new URL(String(input));
      requests.push({ url, options });
      if (url.pathname === '/drive/v3/files/repair-target' && url.searchParams.get('alt') === 'media') {
        return new Response('', { status: 200 });
      }
      if (url.pathname === '/drive/v3/files/repair-target') {
        return repairMetadataResponse(cloudDocument, {}, '"repair-etag"');
      }
      if (url.pathname === '/upload/drive/v3/files/repair-target') {
        return jsonResponse({ error: { message: 'simulated upload failure' } }, 500);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await driveSyncService.repairEmptyCloudFilesFromLocal({ dryRun: false });

    expect(requests).toHaveLength(4);
    expect(requests.every(request => !['POST', 'DELETE'].includes(request.options.method))).toBe(true);
    expect(result).toMatchObject({ eligible: 1, repaired: 0, processed: 0 });
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'DRIVE_REPAIR_PATCH_FAILED',
        stage: 'REPAIR_PATCH',
        http_status: 500
      })
    ]);
    expect(result.files[0]).toMatchObject({ status: 'FAILED', reason: 'DRIVE_REPAIR_PATCH_FAILED' });
  });

  it('uses two stable monotonic-version snapshots when Drive omits ETag', async () => {
    const cloudDocument = repairCloudDocument({ etag: null });
    arrangeRepair({ cloudDocuments: [cloudDocument] });
    const requests = [];
    const fetchMock = vi.fn(async (input, options = {}) => {
      const url = new URL(String(input));
      requests.push({ url, options });
      if (url.pathname === '/drive/v3/files/repair-target' && url.searchParams.get('alt') === 'media') {
        return new Response('', { status: 200 });
      }
      if (url.pathname === '/drive/v3/files/repair-target') {
        return repairMetadataResponse(cloudDocument);
      }
      if (url.pathname === '/upload/drive/v3/files/repair-target') {
        return jsonResponse({ id: 'repair-target' });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await driveSyncService.repairEmptyCloudFilesFromLocal({ dryRun: false });

    expect(requests).toHaveLength(4);
    expect(requests[3].options).toMatchObject({ method: 'PATCH' });
    expect(requests[3].options.headers).not.toHaveProperty('If-Match');
    expect(result).toMatchObject({ eligible: 1, repaired: 1, processed: 1, errors: [] });
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: 'DRIVE_REPAIR_VERSION_RECHECK_USED', recovered: true })
    ]);
    expect(result.files[0]).toMatchObject({
      status: 'REPAIRED',
      etag_precondition_used: false,
      version_precondition_used: true
    });
  });

  it('refuses the PATCH when the monotonic Drive version changes during content verification', async () => {
    const cloudDocument = repairCloudDocument({ etag: null });
    arrangeRepair({ cloudDocuments: [cloudDocument] });
    const requests = [];
    let metadataReads = 0;
    const fetchMock = vi.fn(async (input, options = {}) => {
      const url = new URL(String(input));
      requests.push({ url, options });
      if (url.pathname === '/drive/v3/files/repair-target' && url.searchParams.get('alt') === 'media') {
        return new Response('', { status: 200 });
      }
      if (url.pathname === '/drive/v3/files/repair-target') {
        metadataReads++;
        return repairMetadataResponse(cloudDocument, {
          version: metadataReads === 1 ? '7' : '8'
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await driveSyncService.repairEmptyCloudFilesFromLocal({ dryRun: false });

    expect(requests).toHaveLength(3);
    expect(requests.some(({ options }) => options.method === 'PATCH')).toBe(false);
    expect(result).toMatchObject({ eligible: 1, repaired: 0, processed: 0 });
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'CLOUD_CHANGED_SINCE_PREVIEW',
        stage: 'REPAIR_REVALIDATION'
      })
    ]);
  });

  it('refuses TOCTOU changes detected by content or the If-Match precondition', async () => {
    const cloudDocuments = [
      repairCloudDocument({ fileId: 'gdrive_changed-content', fileName: 'changed-content.md', etag: '"first"' }),
      repairCloudDocument({ fileId: 'gdrive_changed-etag', fileName: 'changed-etag.md', etag: '"second"' })
    ];
    const localDocuments = [
      repairLocalDocument({
        fileId: 'drive_file_changed-content',
        fileName: 'changed-content.md',
        rawContent: validRepairMarkdown({ slug: 'changed-content', title: 'Changed content' })
      }),
      repairLocalDocument({
        fileId: 'drive_file_changed-etag',
        fileName: 'changed-etag.md',
        rawContent: validRepairMarkdown({ slug: 'changed-etag', title: 'Changed ETag' })
      })
    ];
    arrangeRepair({ cloudDocuments, localDocuments });
    const requests = [];
    const fetchMock = vi.fn(async (input, options = {}) => {
      const url = new URL(String(input));
      requests.push({ url, options });
      if (url.pathname === '/drive/v3/files/changed-content' && url.searchParams.get('alt') === 'media') {
        return new Response('# someone repaired this', { status: 200 });
      }
      if (url.pathname === '/drive/v3/files/changed-content') {
        return repairMetadataResponse(cloudDocuments[0], {}, '"first"');
      }
      if (url.pathname === '/drive/v3/files/changed-etag' && url.searchParams.get('alt') === 'media') {
        return new Response('', { status: 200 });
      }
      if (url.pathname === '/drive/v3/files/changed-etag') {
        return repairMetadataResponse(cloudDocuments[1], {}, '"second"');
      }
      if (url.pathname === '/upload/drive/v3/files/changed-etag') {
        return jsonResponse({ error: { message: 'precondition failed' } }, 412);
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await driveSyncService.repairEmptyCloudFilesFromLocal({ dryRun: false });

    expect(requests).toHaveLength(6);
    expect(result).toMatchObject({ matched: 2, eligible: 2, repaired: 0 });
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'CLOUD_CHANGED_SINCE_PREVIEW', stage: 'REPAIR_REVALIDATION' }),
      expect.objectContaining({ code: 'CLOUD_CHANGED_SINCE_PREVIEW', stage: 'REPAIR_PATCH', http_status: 412 })
    ]);
  });

  it('keeps every generic recursive push entry point fail-closed before network access', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(driveSyncService.pushLocalToDrive()).rejects.toMatchObject({ code: 'DRIVE_PUSH_UNSUPPORTED' });
    await expect(driveSyncService.uploadLocalFolderRecursive()).rejects.toMatchObject({ code: 'DRIVE_PUSH_UNSUPPORTED' });
    expect(fetchMock).not.toHaveBeenCalled();

    for (const scriptName of [
      'fullSyncToDrive.js',
      'uploadRootGuides.js',
      'cleanDriveRootDuplicates.js'
    ]) {
      expect(fs.existsSync(path.resolve(process.cwd(), 'server/scripts', scriptName))).toBe(false);
    }

    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([
      { mode: 'SERVICE_ACCOUNT', token: 'service-token' }
    ]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport());
    const pushSpy = vi.spyOn(driveSyncService, 'pushLocalToDrive');

    const result = await driveSyncService.syncAll('TEST', { pushFirst: true });

    expect(pushSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.errors).toEqual([expect.objectContaining({ code: 'DRIVE_PUSH_UNSUPPORTED' })]);
  });
});

describe('Drive parsing, configuration and safe synchronization', () => {
  it('uses js-yaml mapping frontmatter and preserves nested dimensions', () => {
    const parsed = parseFrontmatter(`---
title: Nested metadata
published: true
dimensions:
  iparag:
    - Gyártás
  technologia:
    - Node.js
    - SQLite
---
# Body`);

    expect(parsed.metadata).toMatchObject({
      title: 'Nested metadata',
      published: true,
      dimensions: {
        iparag: ['Gyártás'],
        technologia: ['Node.js', 'SQLite']
      }
    });
    expect(parsed.content).toBe('# Body');
    expect(parseFrontmatter('---\n---\nempty metadata').metadata).toEqual({});
    expect(() => parseFrontmatter('---\n- invalid\n- root\n---\nbody')).toThrow('INVALID_FRONTMATTER_ROOT');
    expect(() => parseFrontmatter('---\nscalar\n---\nbody')).toThrow('INVALID_FRONTMATTER_ROOT');
    expect(() => parseFrontmatter('---\nfalse\n---\nbody')).toThrow('INVALID_FRONTMATTER_ROOT');
  });

  it('round-trips YAML-safe Unicode, quotes, newlines, URLs and nested dimensions', () => {
    const post = {
      title: 'Árvíztűrő "tükör"\nMásodik \\ sor',
      slug: 'yaml-round-trip',
      project_id: 'prj_rag_enterprise',
      content_type: 'knowledge',
      summary: 'Rövid "összefoglaló"\núj sorral.',
      category: 'TUDÁSTÁR',
      visibility: 'private',
      published: true,
      read_time: '7 PERC',
      audio_url: 'https://example.test/audio?q="ő"&path=C:\\media\\file.mp3',
      video_url: 'https://example.test/video?q="ű"&path=C:\\media\\file.mp4',
      dimensions: {
        iparag: ['Gyártás'],
        technologia: ['Node.js', 'SQLite'],
        context: { emoji: '🔒', multiline: 'első\nmásodik' }
      },
      content: '# Unicode tartalom\n\nMűködik.'
    };

    const markdown = formatPostToMarkdown(post);
    const parsed = parseFrontmatter(markdown);

    expect(formatPostToMarkdown(post)).toBe(markdown);
    expect(parsed.metadata).toEqual(expect.objectContaining({
      title: post.title,
      slug: post.slug,
      project_id: post.project_id,
      content_type: post.content_type,
      summary: post.summary,
      category: post.category,
      visibility: post.visibility,
      published: post.published,
      read_time: post.read_time,
      audio_url: post.audio_url,
      video_url: post.video_url,
      dimensions: post.dimensions
    }));
    expect(parsed.content).toBe(post.content);
    expect(parseFrontmatter(formatPostToMarkdown({
      ...post,
      dimensions: '{not-json'
    })).metadata.dimensions).toEqual({});
  });

  it('resolves OAuth paths relative to the app root and reports honest status timestamps', () => {
    const configDir = fs.mkdtempSync(path.join(process.cwd(), '.drive-oauth-test-'));
    temporaryDirectories.push(configDir);
    const clientPath = path.join(configDir, 'client.json');
    const tokensPath = path.join(configDir, 'tokens.json');
    fs.writeFileSync(clientPath, JSON.stringify({ web: { client_id: 'client', client_secret: 'secret' } }));
    fs.writeFileSync(tokensPath, JSON.stringify({ access_token: 'access', refresh_token: 'refresh', expires_at: Date.now() + 120000 }));
    process.env.GOOGLE_OAUTH_CLIENT_PATH = path.relative(process.cwd(), clientPath);
    process.env.GOOGLE_OAUTH_TOKENS_PATH = tokensPath;

    expect(driveSyncService.getOAuthClient()).toMatchObject({ client_id: 'client', client_secret: 'secret' });
    expect(driveSyncService.getTokens()).toMatchObject({ refresh_token: 'refresh' });
    driveSyncService.saveTokens({ access_token: 'updated', refresh_token: 'refresh', expires_at: Date.now() + 120000 });
    expect(JSON.parse(fs.readFileSync(tokensPath, 'utf8')).access_token).toBe('updated');

    const status = driveSyncService.getStatus();
    expect(status.last_sync_time).toBeNull();
    expect(new Date(status.checked_at).toISOString()).toBe(status.checked_at);
  });

  it('resolves a validated content root dynamically from absolute, relative, and local-default configuration', () => {
    const parentDir = fs.mkdtempSync(path.join(process.cwd(), '.drive-content-root-test-'));
    temporaryDirectories.push(parentDir);
    const existingRoot = path.join(parentDir, 'existing-content');
    fs.mkdirSync(existingRoot);

    expect(resolveContentRoot({ CYBER_ARCHITECT_CONTENT_ROOT: existingRoot })).toBe(existingRoot);
    expect(resolveContentRoot({
      CYBER_ARCHITECT_CONTENT_ROOT: path.relative(process.cwd(), existingRoot)
    })).toBe(existingRoot);
    expect(resolveContentRoot({ CYBER_ARCHITECT_CONTENT_ROOT: '  ' }))
      .toBe(path.resolve(process.cwd(), '..', 'CyberArchitect'));

    const futureRoot = path.join(parentDir, 'future-volume', 'content');
    expect(resolveContentRoot({ CYBER_ARCHITECT_CONTENT_ROOT: futureRoot })).toBe(futureRoot);
    expect(fs.existsSync(futureRoot)).toBe(false);
  });

  it('fails closed on unsafe or non-directory content roots before crawl or export writes', async () => {
    const parentDir = fs.mkdtempSync(path.join(process.cwd(), '.drive-content-root-invalid-test-'));
    temporaryDirectories.push(parentDir);
    const filePath = path.join(parentDir, 'not-a-directory');
    fs.writeFileSync(filePath, 'file');
    process.env.CYBER_ARCHITECT_CONTENT_ROOT = filePath;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GOOGLE_OAUTH_CLIENT_PATH;
    delete process.env.GOOGLE_OAUTH_TOKENS_PATH;
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    delete process.env.DRIVE_KNOWLEDGE_FOLDER_ID;
    delete process.env.DRIVE_BLOG_FOLDER_ID;

    expect(() => resolveContentRoot()).toThrow('CYBER_ARCHITECT_CONTENT_ROOT_INVALID');
    const status = driveSyncService.getStatus();
    expect(status).toMatchObject({
      mode: 'CONFIGURATION_ERROR',
      source_of_truth: 'UNAVAILABLE',
      content_root: null,
      knowledge_vault_dir: null,
      blog_vault_dir: null,
      configuration_errors: [expect.objectContaining({
        code: 'CYBER_ARCHITECT_CONTENT_ROOT_INVALID',
        config_key: 'CYBER_ARCHITECT_CONTENT_ROOT',
        validation_reason: 'NOT_A_DIRECTORY'
      })]
    });

    const crawlSpy = vi.spyOn(driveSyncService, 'crawlLocalFolder');
    const writeSpy = vi.spyOn(fs, 'writeFileSync');
    const syncResult = await driveSyncService.syncAll('TEST', { dryRun: true });
    expect(crawlSpy).not.toHaveBeenCalled();
    expect(syncResult.errors).toEqual([
      expect.objectContaining({ code: 'CYBER_ARCHITECT_CONTENT_ROOT_INVALID' })
    ]);
    await expect(driveSyncService.exportPostToDrive({
      slug: 'safe-slug',
      title: 'Safe title',
      content_type: 'knowledge',
      content: 'Body'
    })).rejects.toMatchObject({ code: 'DRIVE_CONFIGURATION_INVALID' });
    expect(writeSpy).not.toHaveBeenCalled();

    process.env.CYBER_ARCHITECT_CONTENT_ROOT = path.resolve(process.cwd(), 'server');
    expect(() => resolveContentRoot()).toThrow('CYBER_ARCHITECT_CONTENT_ROOT_INVALID');
  });

  it('uses only the configured content mirror paths for local synchronization', async () => {
    const contentRoot = fs.mkdtempSync(path.join(process.cwd(), '.drive-content-root-sync-test-'));
    temporaryDirectories.push(contentRoot);
    process.env.CYBER_ARCHITECT_CONTENT_ROOT = contentRoot;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GOOGLE_OAUTH_CLIENT_PATH;
    delete process.env.GOOGLE_OAUTH_TOKENS_PATH;
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    delete process.env.DRIVE_KNOWLEDGE_FOLDER_ID;
    delete process.env.DRIVE_BLOG_FOLDER_ID;
    vi.spyOn(driveSyncService, 'hasUsableServiceAccountCredentials').mockReturnValue(false);
    vi.spyOn(driveSyncService, 'getTokens').mockReturnValue(null);
    const crawlSpy = vi.spyOn(driveSyncService, 'crawlLocalFolder').mockReturnValue([]);

    const result = await driveSyncService.syncAll('TEST', { dryRun: true });

    expect(result).toMatchObject({ mode: 'LOCAL_DRIVE_MIRROR', errors: [] });
    expect(crawlSpy.mock.calls).toEqual([
      [path.join(contentRoot, 'KnowledgeBase'), 'knowledge'],
      [path.join(contentRoot, 'Blog'), 'blog']
    ]);
  });

  it('atomically replaces OAuth tokens in the same directory with mode 0600', () => {
    const tokenDir = fs.mkdtempSync(path.join(process.cwd(), '.drive-token-atomic-test-'));
    temporaryDirectories.push(tokenDir);
    const tokensPath = path.join(tokenDir, 'tokens.json');
    fs.writeFileSync(tokensPath, JSON.stringify({ access_token: 'old' }));
    fs.chmodSync(tokensPath, 0o666);
    process.env.GOOGLE_OAUTH_TOKENS_PATH = tokensPath;
    const originalRenameSync = fs.renameSync.bind(fs);
    const renameSpy = vi.spyOn(fs, 'renameSync').mockImplementation(originalRenameSync);
    const originalChmodSync = fs.chmodSync.bind(fs);
    const chmodSpy = vi.spyOn(fs, 'chmodSync').mockImplementation(originalChmodSync);

    driveSyncService.saveTokens({ access_token: 'new', refresh_token: 'refresh' });

    expect(JSON.parse(fs.readFileSync(tokensPath, 'utf8'))).toMatchObject({ access_token: 'new' });
    if (process.platform !== 'win32') {
      expect(fs.statSync(tokensPath).mode & 0o777).toBe(0o600);
    }
    expect(chmodSpy).toHaveBeenCalledWith(tokensPath, 0o600);
    const publishCall = renameSpy.mock.calls.find(([sourcePath, destinationPath]) => (
      String(sourcePath).endsWith('.tmp') && destinationPath === tokensPath
    ));
    expect(publishCall).toBeTruthy();
    const [temporaryPath, destinationPath] = publishCall;
    expect(path.dirname(temporaryPath)).toBe(tokenDir);
    expect(destinationPath).toBe(tokensPath);
    expect(fs.readdirSync(tokenDir)).toEqual(['tokens.json']);
  });

  it('preserves the previous token file and cleans temporary data after write or rename failure', () => {
    const tokenDir = fs.mkdtempSync(path.join(process.cwd(), '.drive-token-failure-test-'));
    temporaryDirectories.push(tokenDir);
    const tokensPath = path.join(tokenDir, 'tokens.json');
    const oldTokens = JSON.stringify({ access_token: 'old' });
    fs.writeFileSync(tokensPath, oldTokens);
    process.env.GOOGLE_OAUTH_TOKENS_PATH = tokensPath;
    const originalWriteFileSync = fs.writeFileSync.bind(fs);

    vi.spyOn(fs, 'writeFileSync').mockImplementation((targetPath, ...args) => {
      if (String(targetPath).endsWith('.tmp')) {
        originalWriteFileSync(targetPath, 'partial-token-data');
        throw new Error('simulated token write crash');
      }
      return originalWriteFileSync(targetPath, ...args);
    });
    expect(() => driveSyncService.saveTokens({ access_token: 'write-failure' }))
      .toThrow('simulated token write crash');
    expect(fs.readFileSync(tokensPath, 'utf8')).toBe(oldTokens);
    expect(fs.readdirSync(tokenDir)).toEqual(['tokens.json']);

    vi.restoreAllMocks();
    vi.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('simulated token rename failure');
    });
    expect(() => driveSyncService.saveTokens({ access_token: 'rename-failure' }))
      .toThrow('simulated token rename failure');
    expect(fs.readFileSync(tokensPath, 'utf8')).toBe(oldTokens);
    expect(fs.readdirSync(tokenDir)).toEqual(['tokens.json']);
  });

  it('leaves a complete 0600 token file after a post-rename interruption', () => {
    const tokenDir = fs.mkdtempSync(path.join(process.cwd(), '.drive-token-post-rename-test-'));
    temporaryDirectories.push(tokenDir);
    const tokensPath = path.join(tokenDir, 'tokens.json');
    fs.writeFileSync(tokensPath, JSON.stringify({ access_token: 'old' }));
    process.env.GOOGLE_OAUTH_TOKENS_PATH = tokensPath;
    const originalChmodSync = fs.chmodSync.bind(fs);
    const chmodSpy = vi.spyOn(fs, 'chmodSync').mockImplementation((targetPath, mode) => {
      if (path.resolve(String(targetPath)) === path.resolve(tokensPath)) {
        throw new Error('simulated post-rename interruption');
      }
      return originalChmodSync(targetPath, mode);
    });

    expect(() => driveSyncService.saveTokens({ access_token: 'new-complete-token' }))
      .toThrow('simulated post-rename interruption');

    expect(JSON.parse(fs.readFileSync(tokensPath, 'utf8')).access_token).toBe('new-complete-token');
    if (process.platform !== 'win32') {
      expect(fs.statSync(tokensPath).mode & 0o777).toBe(0o600);
    }
    expect(chmodSpy).toHaveBeenCalledWith(tokensPath, 0o600);
    expect(fs.readdirSync(tokenDir)).toEqual(['tokens.json']);
  });

  it('resolves relative and absolute service-account credential paths from the app root', () => {
    const credentialsDir = fs.mkdtempSync(path.join(process.cwd(), '.drive-credentials-test-'));
    temporaryDirectories.push(credentialsDir);
    const relativeCredentialsPath = path.join(credentialsDir, 'relative-service-account.json');
    const absoluteCredentialsPath = path.join(credentialsDir, 'absolute-service-account.json');
    const usableCredentials = JSON.stringify({
      client_email: 'service-account@example.test',
      private_key: 'test-private-key'
    });
    fs.writeFileSync(relativeCredentialsPath, usableCredentials);
    fs.writeFileSync(absoluteCredentialsPath, usableCredentials);

    const relativeValue = path.relative(process.cwd(), relativeCredentialsPath);
    process.env.GOOGLE_APPLICATION_CREDENTIALS = relativeValue;
    expect(resolveProjectConfigPath(relativeValue, 'unused')).toBe(relativeCredentialsPath);
    expect(driveSyncService.getServiceAccountCredentialsPath()).toBe(relativeCredentialsPath);
    expect(driveSyncService.getStatus().has_cloud_credentials).toBe(true);

    process.env.GOOGLE_APPLICATION_CREDENTIALS = absoluteCredentialsPath;
    expect(resolveProjectConfigPath(absoluteCredentialsPath, 'unused')).toBe(absoluteCredentialsPath);
    expect(driveSyncService.getServiceAccountCredentialsPath()).toBe(absoluteCredentialsPath);

    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(credentialsDir, 'explicitly-missing.json');
    expect(driveSyncService.getServiceAccountCredentialsPath()).toBeNull();
    expect(driveSyncService.getStatus()).toMatchObject({
      mode: 'CONFIGURATION_ERROR',
      source_of_truth: 'UNAVAILABLE',
      has_cloud_credentials: false,
      configuration_errors: [expect.objectContaining({
        code: 'GOOGLE_APPLICATION_CREDENTIALS_NOT_FOUND',
        config_key: 'GOOGLE_APPLICATION_CREDENTIALS'
      })]
    });
  });

  it('fails closed with structured issues when explicit credential paths are absent', async () => {
    const configDir = fs.mkdtempSync(path.join(process.cwd(), '.drive-missing-config-test-'));
    temporaryDirectories.push(configDir);
    process.env.NODE_ENV = 'production';
    delete process.env.SITE_URL;
    delete process.env.GOOGLE_OAUTH_REDIRECT_URI;
    process.env.GOOGLE_OAUTH_CLIENT_PATH = path.join(configDir, 'missing-client.json');
    process.env.GOOGLE_OAUTH_TOKENS_PATH = path.join(configDir, 'missing-tokens.json');
    process.env.GOOGLE_APPLICATION_CREDENTIALS = path.join(configDir, 'missing-service-account.json');

    expect(driveSyncService.getOAuthClient()).toBeNull();
    const status = driveSyncService.getStatus();
    expect(status.mode).toBe('CONFIGURATION_ERROR');
    expect(status.source_of_truth).toBe('UNAVAILABLE');
    expect(status.has_cloud_credentials).toBe(false);
    expect(status.last_sync_time).toBeNull();
    expect(status.configuration_errors.map(issue => issue.code)).toEqual([
      'GOOGLE_APPLICATION_CREDENTIALS_NOT_FOUND',
      'GOOGLE_OAUTH_CLIENT_NOT_FOUND'
    ]);

    const localCrawlSpy = vi.spyOn(driveSyncService, 'crawlLocalFolder');
    const result = await driveSyncService.syncAll('TEST', { dryRun: true });
    expect(localCrawlSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      mode: 'CONFIGURATION_ERROR',
      source_of_truth: 'UNAVAILABLE',
      processed: 0,
      discovered: 0
    });
    expect(result.errors.map(issue => issue.code)).toEqual(status.configuration_errors.map(issue => issue.code));
  });

  it('requires credentials for configured cloud folders and never falls back to local crawling', async () => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GOOGLE_OAUTH_CLIENT_PATH;
    delete process.env.GOOGLE_OAUTH_TOKENS_PATH;
    process.env.GOOGLE_DRIVE_FOLDER_ID = 'configured-cloud-folder';
    delete process.env.DRIVE_KNOWLEDGE_FOLDER_ID;
    delete process.env.DRIVE_BLOG_FOLDER_ID;
    vi.spyOn(driveSyncService, 'hasUsableServiceAccountCredentials').mockReturnValue(false);
    vi.spyOn(driveSyncService, 'getTokens').mockReturnValue(null);
    const localCrawlSpy = vi.spyOn(driveSyncService, 'crawlLocalFolder');

    const status = driveSyncService.getStatus();
    expect(status).toMatchObject({
      mode: 'CONFIGURATION_ERROR',
      source_of_truth: 'UNAVAILABLE',
      configuration_errors: [expect.objectContaining({ code: 'DRIVE_CREDENTIALS_REQUIRED' })]
    });
    const result = await driveSyncService.syncAll('TEST', { dryRun: true });
    expect(localCrawlSpy).not.toHaveBeenCalled();
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'DRIVE_CREDENTIALS_REQUIRED' })
    ]);
  });

  it('requires a Drive folder for configured credentials and reserves local mode for no-cloud config', () => {
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GOOGLE_OAUTH_CLIENT_PATH;
    delete process.env.GOOGLE_OAUTH_TOKENS_PATH;
    delete process.env.GOOGLE_DRIVE_FOLDER_ID;
    delete process.env.DRIVE_KNOWLEDGE_FOLDER_ID;
    delete process.env.DRIVE_BLOG_FOLDER_ID;
    const credentialSpy = vi.spyOn(driveSyncService, 'hasUsableServiceAccountCredentials').mockReturnValue(true);
    vi.spyOn(driveSyncService, 'getTokens').mockReturnValue(null);

    expect(driveSyncService.getStatus()).toMatchObject({
      mode: 'CONFIGURATION_ERROR',
      source_of_truth: 'UNAVAILABLE',
      configuration_errors: [expect.objectContaining({ code: 'DRIVE_FOLDER_NOT_CONFIGURED' })]
    });

    credentialSpy.mockReturnValue(false);
    expect(driveSyncService.getStatus()).toMatchObject({
      mode: 'LOCAL_DRIVE_MIRROR',
      source_of_truth: 'LOCAL_DRIVE_MIRROR',
      configuration_errors: []
    });
  });

  it('allows a configured OAuth token output path to be absent before first authorization', () => {
    const tokenDir = fs.mkdtempSync(path.join(process.cwd(), '.drive-token-output-test-'));
    temporaryDirectories.push(tokenDir);
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.GOOGLE_OAUTH_CLIENT_PATH;
    process.env.GOOGLE_OAUTH_TOKENS_PATH = path.join(tokenDir, 'future-tokens.json');
    process.env.GOOGLE_DRIVE_FOLDER_ID = 'configured-cloud-folder';
    delete process.env.DRIVE_KNOWLEDGE_FOLDER_ID;
    delete process.env.DRIVE_BLOG_FOLDER_ID;
    vi.spyOn(driveSyncService, 'hasUsableServiceAccountCredentials').mockReturnValue(true);

    expect(driveSyncService.getStatus()).toMatchObject({
      mode: 'GOOGLE_SERVICE_ACCOUNT',
      source_of_truth: 'GOOGLE_DRIVE_CLOUD',
      configuration_errors: []
    });
  });

  it('validates explicit OAuth redirects and derives the production callback from SITE_URL', () => {
    expect(resolveOAuthRedirectUri({
      NODE_ENV: 'development',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://auth.example.test/custom/callback'
    })).toBe('https://auth.example.test/custom/callback');
    expect(resolveOAuthRedirectUri({
      NODE_ENV: 'production',
      SITE_URL: 'https://portfolio.example.test/base'
    })).toBe('https://portfolio.example.test/api/admin/drive/oauth2callback');
    expect(() => resolveOAuthRedirectUri({
      NODE_ENV: 'production',
      GOOGLE_OAUTH_REDIRECT_URI: 'javascript:alert(1)'
    })).toThrow('INVALID_GOOGLE_OAUTH_REDIRECT_URI');
    expect(() => resolveOAuthRedirectUri({ NODE_ENV: 'production' }))
      .toThrow('GOOGLE_OAUTH_REDIRECT_URI_REQUIRED');
  });

  it('rejects non-canonical export slugs before any local or Drive write', async () => {
    const writeSpy = vi.spyOn(fs, 'writeFileSync');
    const statusSpy = vi.spyOn(driveSyncService, 'getStatus');

    await expect(driveSyncService.exportPostToDrive({
      slug: '../../server/config/stolen',
      title: 'Traversal',
      content_type: 'knowledge',
      content: 'unsafe'
    })).rejects.toMatchObject({ code: 'INVALID_EXPORT_SLUG' });
    await expect(driveSyncService.exportPostToDrive({
      slug: 'a'.repeat(161),
      title: 'Too long',
      content_type: 'knowledge',
      content: 'unsafe'
    })).rejects.toMatchObject({ code: 'INVALID_EXPORT_SLUG' });

    expect(writeSpy).not.toHaveBeenCalled();
    expect(statusSpy).not.toHaveBeenCalled();
  });

  it('reports a successful local-only export without pretending a cloud write occurred', async () => {
    const contentRoot = fs.mkdtempSync(path.join(process.cwd(), '.drive-export-content-root-test-'));
    temporaryDirectories.push(contentRoot);
    process.env.CYBER_ARCHITECT_CONTENT_ROOT = contentRoot;
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    const writeSpy = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue({
      mode: 'LOCAL_DRIVE_MIRROR',
      source_of_truth: 'LOCAL_DRIVE_MIRROR',
      drive_folder_id: null,
      drive_knowledge_folder_id: null,
      drive_blog_folder_id: null,
      is_oauth_connected: false,
      has_cloud_credentials: false,
      configuration_errors: []
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await driveSyncService.exportPostToDrive({
      slug: 'a'.repeat(160),
      title: 'Local only',
      summary: 'Summary',
      content_type: 'knowledge',
      content: 'Body'
    });

    expect(writeSpy).toHaveBeenCalledOnce();
    expect(writeSpy.mock.calls[0][0]).toBe(path.join(
      contentRoot,
      'KnowledgeBase',
      '01_Zart_Vallalati_RAG',
      'a'.repeat(160),
      `${'a'.repeat(160)}.md`
    ));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      local_written: true,
      local_error: null,
      cloud_written: false,
      drive_file_id: null,
      drive_modified_time: null
    });
  });

  it('does not create a folder when the Drive folder lookup itself fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: 'Folder lookup denied' } }, 403)
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(driveSyncService.getOrCreateCloudFolder(
      'parent-folder',
      'safe-folder',
      'access-token'
    )).rejects.toMatchObject({
      code: 'DRIVE_FOLDER_LOOKUP_FAILED',
      stage: 'FOLDER_LOOKUP',
      http_status: 403
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });

  it('uses Shared Drive flags for folder lookup and creation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ files: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 'created-folder' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(driveSyncService.getOrCreateCloudFolder(
      'shared-parent',
      'safe-folder',
      'access-token'
    )).resolves.toBe('created-folder');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const lookupUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const createUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(lookupUrl.pathname).toBe('/drive/v3/files');
    expect(lookupUrl.searchParams.get('supportsAllDrives')).toBe('true');
    expect(lookupUrl.searchParams.get('includeItemsFromAllDrives')).toBe('true');
    expect(fetchMock.mock.calls[0][1]?.method).toBeUndefined();
    expect(createUrl.pathname).toBe('/drive/v3/files');
    expect(createUrl.searchParams.get('supportsAllDrives')).toBe('true');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('POST');
  });

  it('fails closed on an existing Drive PATCH error without creating a replacement file', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ configuration_errors: [] }));
    vi.spyOn(driveSyncService, 'getValidAccessToken').mockResolvedValue('access-token');
    vi.spyOn(driveSyncService, 'getOrCreateCloudFolder')
      .mockResolvedValueOnce('category-folder')
      .mockResolvedValueOnce('article-folder');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'existing-file',
        modifiedTime: '2026-08-20T10:00:00.000Z'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"existing-etag"' }
      }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'Update denied' } }, 403));
    vi.stubGlobal('fetch', fetchMock);

    await expect(driveSyncService.exportPostToDrive({
      slug: 'existing-export',
      title: 'Existing',
      summary: 'Summary',
      content_type: 'knowledge',
      content: 'Body',
      drive_file_id: 'gdrive_existing-file'
    })).rejects.toMatchObject({
      code: 'DRIVE_FILE_UPDATE_FAILED',
      stage: 'FILE_UPDATE',
      http_status: 403
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'PATCH',
      headers: expect.objectContaining({ 'If-Match': '"existing-etag"' })
    });
    expect(fetchMock.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false);
  });

  it('fails closed when an existing Drive export changes between re-read and PATCH', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ configuration_errors: [] }));
    vi.spyOn(driveSyncService, 'getValidAccessToken').mockResolvedValue('access-token');
    vi.spyOn(driveSyncService, 'getOrCreateCloudFolder')
      .mockResolvedValueOnce('category-folder')
      .mockResolvedValueOnce('article-folder');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'existing-file' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"fresh-etag"' }
      }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'precondition failed' } }, 412));
    vi.stubGlobal('fetch', fetchMock);

    await expect(driveSyncService.exportPostToDrive({
      slug: 'existing-export',
      title: 'Existing',
      summary: 'Summary',
      content_type: 'knowledge',
      content: 'Body',
      drive_file_id: 'gdrive_existing-file'
    })).rejects.toMatchObject({
      code: 'DRIVE_FILE_CHANGED_SINCE_READ',
      stage: 'FILE_UPDATE',
      http_status: 412
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'PATCH',
      headers: expect.objectContaining({ 'If-Match': '"fresh-etag"' })
    });
    expect(fetchMock.mock.calls.some(([, options]) => ['POST', 'DELETE'].includes(options?.method))).toBe(false);
  });

  it('stores exact Drive modifiedTime so two consecutive conditional exports do not self-conflict', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ configuration_errors: [] }));
    vi.spyOn(driveSyncService, 'getValidAccessToken').mockResolvedValue('access-token');
    vi.spyOn(driveSyncService, 'getOrCreateCloudFolder').mockResolvedValue('article-folder');
    const firstModifiedTime = '2026-08-20T10:20:00.000Z';
    const secondModifiedTime = '2026-08-20T10:21:00.000Z';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'existing-file',
        modifiedTime: '2026-08-20T10:19:00.000Z'
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"etag-1"' }
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 'existing-file', modifiedTime: firstModifiedTime }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'existing-file',
        modifiedTime: firstModifiedTime
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"etag-2"' }
      }))
      .mockResolvedValueOnce(jsonResponse({ id: 'existing-file', modifiedTime: secondModifiedTime }));
    vi.stubGlobal('fetch', fetchMock);
    const basePost = {
      slug: 'existing-export',
      title: 'Existing',
      summary: 'Summary',
      content_type: 'knowledge',
      content: 'First body',
      drive_file_id: 'gdrive_existing-file'
    };

    const firstResult = await driveSyncService.exportPostToDrive(basePost);
    const secondResult = await driveSyncService.exportPostToDrive({
      ...basePost,
      content: 'Second body',
      drive_modified_time: firstResult.drive_modified_time
    });

    expect(firstResult.drive_modified_time).toBe(firstModifiedTime);
    expect(secondResult.drive_modified_time).toBe(secondModifiedTime);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[1][1].headers['If-Match']).toBe('"etag-1"');
    expect(fetchMock.mock.calls[3][1].headers['If-Match']).toBe('"etag-2"');
  });

  it('reloads exact modifiedTime after a successful new-file content upload when PATCH omits it', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ configuration_errors: [] }));
    vi.spyOn(driveSyncService, 'getValidAccessToken').mockResolvedValue('access-token');
    vi.spyOn(driveSyncService, 'getOrCreateCloudFolder').mockResolvedValue('article-folder');
    const exactModifiedTime = '2026-08-20T10:25:00.000Z';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'created-file' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'created-file' }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'created-file',
        modifiedTime: exactModifiedTime
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ETag: '"created-etag"' }
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await driveSyncService.exportPostToDrive({
      slug: 'new-export-success',
      title: 'New export',
      summary: 'Summary',
      content_type: 'knowledge',
      content: 'Body'
    });

    expect(result).toMatchObject({
      cloud_written: true,
      drive_file_id: 'gdrive_created-file',
      drive_modified_time: exactModifiedTime
    });
    expect(fetchMock.mock.calls.map(([, options]) => options?.method || 'GET'))
      .toEqual(['POST', 'PATCH', 'GET']);
    const metadataCreateUrl = new URL(String(fetchMock.mock.calls[0][0]));
    const contentUploadUrl = new URL(String(fetchMock.mock.calls[1][0]));
    expect(metadataCreateUrl.pathname).toBe('/drive/v3/files');
    expect(metadataCreateUrl.searchParams.get('supportsAllDrives')).toBe('true');
    expect(contentUploadUrl.pathname).toBe('/upload/drive/v3/files/created-file');
    expect(contentUploadUrl.searchParams.get('uploadType')).toBe('media');
    expect(contentUploadUrl.searchParams.get('supportsAllDrives')).toBe('true');
  });

  it('rejects failed metadata creation and failed content upload as distinct cloud errors', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ configuration_errors: [] }));
    vi.spyOn(driveSyncService, 'getValidAccessToken').mockResolvedValue('access-token');
    vi.spyOn(driveSyncService, 'getOrCreateCloudFolder').mockResolvedValue('article-folder');

    const metadataFailureFetch = vi.fn().mockResolvedValue(
      jsonResponse({ error: { message: 'Metadata denied' } }, 403)
    );
    vi.stubGlobal('fetch', metadataFailureFetch);
    const post = {
      slug: 'new-export',
      title: 'New',
      summary: 'Summary',
      content_type: 'knowledge',
      content: 'Body'
    };

    await expect(driveSyncService.exportPostToDrive(post)).rejects.toMatchObject({
      code: 'DRIVE_FILE_METADATA_CREATE_FAILED',
      stage: 'FILE_METADATA_CREATE',
      http_status: 403
    });
    expect(metadataFailureFetch).toHaveBeenCalledOnce();

    const uploadFailureFetch = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'created-file' }))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'Upload failed' } }, 500))
      .mockResolvedValueOnce(jsonResponse({ error: { message: 'Cleanup denied' } }, 403));
    vi.stubGlobal('fetch', uploadFailureFetch);

    await expect(driveSyncService.exportPostToDrive(post)).rejects.toMatchObject({
      code: 'DRIVE_FILE_CONTENT_UPLOAD_FAILED',
      stage: 'FILE_CONTENT_UPLOAD',
      http_status: 500,
      cleanup: {
        attempted: true,
        succeeded: false,
        code: 'DRIVE_ORPHAN_CLEANUP_FAILED',
        http_status: 403,
        detail: 'Cleanup denied'
      }
    });
    expect(uploadFailureFetch).toHaveBeenCalledTimes(3);
    expect(uploadFailureFetch.mock.calls.map(([, options]) => options.method)).toEqual(['POST', 'PATCH', 'DELETE']);
  });

  it('dry-runs create, update, seed adoption, collision re-slug and skipped reports without writes', async () => {
    const existingBySource = {
      id: 10,
      slug: 'existing',
      title: 'Existing',
      content_type: 'knowledge',
      drive_file_id: 'gdrive_existing',
      published: 1
    };
    const adoptableSeed = {
      id: 11,
      slug: 'seed',
      title: 'Árvíz Tűrő Tükörfúrógép',
      content_type: 'knowledge',
      drive_file_id: '',
      published: 1
    };
    const conflictingOwner = {
      id: 12,
      slug: 'taken',
      title: 'Other source',
      content_type: 'knowledge',
      drive_file_id: 'gdrive_other',
      published: 1
    };
    const documents = [
      { fileId: 'gdrive_new', fileName: 'new.md', folderPath: 'knowledge', rawContent: 'new', modifiedTime: null },
      { fileId: 'gdrive_existing', fileName: 'existing.md', folderPath: 'knowledge', rawContent: '---\nslug: existing\n---\nupdated', modifiedTime: null },
      { fileId: 'gdrive_seed', fileName: 'seed.md', folderPath: 'knowledge', rawContent: '---\nslug: seed\ntitle: Arviz turo tukorfurogep\n---\nseed body', modifiedTime: null },
      { fileId: 'gdrive_collision', fileName: 'taken.md', folderPath: 'knowledge', rawContent: '---\nslug: taken\n---\ncollision', modifiedTime: null }
    ];

    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus());
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockImplementation(async source => (
      source.name === 'knowledge'
        ? emptyCrawlReport({
            documents,
            skipped: [{ code: 'DRIVE_UNSUPPORTED_FILE_TYPE', file: 'image.png', folder: 'knowledge', file_id: 'image', stage: 'FILTER' }]
          })
        : emptyCrawlReport({
            errors: [{ code: 'DRIVE_LIST_FAILED', stage: 'LIST', message: 'Blog denied', folder: 'blog', http_status: 403 }]
          })
    ));
    const pushSpy = vi.spyOn(driveSyncService, 'pushLocalToDrive').mockResolvedValue(true);
    vi.spyOn(dbService, 'getBlogPostByDriveFileId').mockImplementation(fileId => (
      fileId === 'gdrive_existing' ? existingBySource : null
    ));
    vi.spyOn(dbService, 'getBlogPostBySlug').mockImplementation(slug => ({
      existing: existingBySource,
      seed: adoptableSeed,
      taken: conflictingOwner
    })[slug] || null);
    const createSpy = vi.spyOn(dbService, 'createBlogPost');
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost');

    const result = await driveSyncService.syncAll('TEST', { dryRun: true, pushFirst: true });

    expect(pushSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(result.sources).toHaveLength(2);
    expect(result).toMatchObject({ discovered: 5, processed: 4, skipped_count: 1 });
    expect(result.errors).toEqual([expect.objectContaining({ message: 'Blog denied' })]);
    expect(result.warnings).toEqual([expect.objectContaining({ code: 'DRIVE_PUSH_SKIPPED_DRY_RUN' })]);
    expect(result.adopted).toBe(1);
    expect(result.collisions).toEqual([
      expect.objectContaining({ requested_slug: 'taken', resolved_slug: expect.stringMatching(/^taken-[a-f0-9]{8}$/) })
    ]);
    expect(result.files.map(file => file.status)).toEqual([
      'SKIPPED',
      'WOULD_CREATE',
      'WOULD_UPDATE',
      'WOULD_UPDATE',
      'WOULD_RESLUG'
    ]);
  });

  it('refreshes OAuth in memory only during dry-run and resolves it lazily', async () => {
    const expiredTokens = {
      access_token: 'expired-access',
      refresh_token: 'refresh-secret',
      expires_at: 1
    };
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getServiceAccountAccessToken').mockResolvedValue(null);
    vi.spyOn(driveSyncService, 'getTokens').mockReturnValue(expiredTokens);
    vi.spyOn(driveSyncService, 'getOAuthClient').mockReturnValue({
      client_id: 'client',
      client_secret: 'secret',
      redirect_uri: 'https://example.test/callback'
    });
    const saveSpy = vi.spyOn(driveSyncService, 'saveTokens');
    const oauthTokenSpy = vi.spyOn(driveSyncService, 'getOAuthAccessToken');
    const crawlSpy = vi.spyOn(driveSyncService, 'crawlCloudFolder').mockResolvedValue(emptyCrawlReport());
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      access_token: 'memory-only-access',
      expires_in: 3600
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await driveSyncService.syncAll('TEST', { dryRun: true });

    expect(result.errors).toEqual([]);
    expect(oauthTokenSpy).toHaveBeenCalledOnce();
    expect(oauthTokenSpy).toHaveBeenCalledWith({ persist: false });
    expect(crawlSpy).toHaveBeenCalledWith('knowledge-folder', 'knowledge', 'memory-only-access');
    expect(saveSpy).not.toHaveBeenCalled();
    expect(expiredTokens).toEqual({
      access_token: 'expired-access',
      refresh_token: 'refresh-secret',
      expires_at: 1
    });
  });

  it('previews exact legacy path adoption against the isolated real database without changing the row', async () => {
    const slug = `temp-db-preview-${Date.now()}`;
    const folderPath = 'knowledge';
    const fileName = `${slug}.md`;
    const syntheticSourceId = deriveLegacyLocalSourceId(folderPath, fileName);
    const seed = dbService.createBlogPost({
      slug,
      title: 'Temp DB Preview',
      summary: 'Original summary',
      content: 'Original content',
      content_type: 'knowledge',
      drive_file_id: syntheticSourceId,
      published: 1
    }, 'TEST_SETUP');
    const document = {
      fileId: `gdrive_${slug}`,
      fileName,
      folderPath,
      modifiedTime: '2026-08-20T12:00:00.000Z',
      rawContent: `---\nslug: ${slug}\ntitle: Temp DB Preview\ncontent_type: knowledge\nsummary: Cloud summary\n---\nCloud content`
    };
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport({ documents: [document] }));

    const result = await driveSyncService.syncAll('TEST', { dryRun: true });
    const unchanged = dbService.getBlogPostBySlug(slug, { publishedOnly: false });

    expect(result).toMatchObject({ dry_run: true, created: 0, updated: 1, adopted: 1 });
    expect(result.files[0]).toMatchObject({ status: 'WOULD_UPDATE', adopted_seed: true });
    expect(unchanged).toMatchObject({
      id: seed.id,
      drive_file_id: syntheticSourceId,
      summary: 'Original summary',
      content: 'Original content'
    });
  });

  it('adopts the exact path-hash local identity after Drive rehome without creating a duplicate row', async () => {
    const folderPath = 'knowledge\\Rehomed Folder';
    const fileName = 'rehomed.md';
    const pathHashSourceId = deriveLocalPathHashSourceId('knowledge/Rehomed Folder', fileName);
    expect(deriveLocalPathHashSourceId(folderPath, fileName)).toBe(pathHashSourceId);

    const document = {
      fileId: 'gdrive_rehomed-path-hash',
      fileName,
      folderPath,
      modifiedTime: '2026-08-20T12:15:00.000Z',
      rawContent: '---\nslug: rehomed\ntitle: Rehomed document\ncontent_type: knowledge\nsummary: Cloud summary\n---\nCloud content'
    };
    const rows = [{
      id: 701,
      slug: 'rehomed',
      title: 'Rehomed document',
      content_type: 'knowledge',
      drive_file_id: pathHashSourceId,
      published: 1
    }];

    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport({ documents: [document] }));
    vi.spyOn(dbService, 'getBlogPosts').mockImplementation(() => rows);
    vi.spyOn(dbService, 'getBlogPostByDriveFileId').mockImplementation(sourceId => (
      rows.find(row => row.drive_file_id === sourceId) || null
    ));
    vi.spyOn(dbService, 'getBlogPostBySlug').mockImplementation(slug => (
      rows.find(row => row.slug === slug) || null
    ));
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost').mockImplementation((id, data) => {
      const rowIndex = rows.findIndex(row => row.id === id);
      rows[rowIndex] = { ...rows[rowIndex], ...data };
      return rows[rowIndex];
    });
    const createSpy = vi.spyOn(dbService, 'createBlogPost').mockImplementation(data => {
      const row = { id: rows.length + 1, ...data };
      rows.push(row);
      return row;
    });

    const preview = await driveSyncService.syncAll('TEST', { dryRun: true });

    expect(preview).toMatchObject({ dry_run: true, created: 0, updated: 1, adopted: 1, errors: [] });
    expect(preview.files).toEqual([
      expect.objectContaining({ status: 'WOULD_UPDATE', legacy_source_adopted: true })
    ]);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(rows).toEqual([
      expect.objectContaining({ id: 701, drive_file_id: pathHashSourceId })
    ]);

    const applied = await driveSyncService.syncAll('TEST');

    expect(applied).toMatchObject({ dry_run: false, created: 0, updated: 1, adopted: 1, errors: [] });
    expect(updateSpy).toHaveBeenCalledWith(701, expect.objectContaining({
      drive_file_id: document.fileId,
      slug: 'rehomed'
    }), 'TEST');
    expect(createSpy).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 701, drive_file_id: document.fileId });

    const rerun = await driveSyncService.syncAll('TEST');

    expect(rerun).toMatchObject({ created: 0, updated: 1, adopted: 0, errors: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 701, drive_file_id: document.fileId });
  });

  it('skips an exact path-hash rehome when its hash and historic aliases own different rows', async () => {
    const folderPath = 'knowledge/Conflicting Migration';
    const fileName = 'conflict.md';
    const pathHashSourceId = deriveLocalPathHashSourceId(folderPath, fileName);
    const historicSourceId = deriveLegacyLocalSourceId(folderPath, fileName);
    const document = {
      fileId: 'gdrive_path-alias-conflict',
      fileName,
      folderPath,
      modifiedTime: '2026-08-20T12:16:00.000Z',
      rawContent: '---\nslug: conflict\ntitle: Conflicting migration\ncontent_type: knowledge\n---\nCloud content'
    };
    const rows = [{
      id: 702,
      slug: 'path-hash-owner',
      title: 'Path hash owner',
      content_type: 'knowledge',
      drive_file_id: pathHashSourceId,
      published: 1
    }, {
      id: 703,
      slug: 'historic-owner',
      title: 'Historic owner',
      content_type: 'knowledge',
      drive_file_id: historicSourceId,
      published: 1
    }];

    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport({ documents: [document] }));
    vi.spyOn(dbService, 'getBlogPosts').mockReturnValue(rows);
    vi.spyOn(dbService, 'getBlogPostByDriveFileId').mockReturnValue(null);
    vi.spyOn(dbService, 'getBlogPostBySlug').mockReturnValue(null);
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost');
    const createSpy = vi.spyOn(dbService, 'createBlogPost');

    const result = await driveSyncService.syncAll('TEST');

    expect(result).toMatchObject({ created: 0, updated: 0, adopted: 0, processed: 0, synced: 0, skipped_count: 1 });
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'LEGACY_SOURCE_ID_AMBIGUOUS',
        match_strategy: 'EXACT_PATH_ALIASES',
        ambiguity_reason: 'MULTIPLE_DB_EXACT_CANDIDATES',
        candidate_source_ids: [pathHashSourceId, historicSourceId]
      })
    ]);
    expect(result.files).toEqual([
      expect.objectContaining({ file_id: document.fileId, status: 'SKIPPED', reason: 'LEGACY_SOURCE_ID_AMBIGUOUS' })
    ]);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(rows).toHaveLength(2);
    expect(rows.map(row => row.drive_file_id)).toEqual([pathHashSourceId, historicSourceId]);
  });

  it('skips a rehomed source already owned by a different record than its exact path-hash owner', async () => {
    const folderPath = 'knowledge/Existing Target Conflict';
    const fileName = 'existing-target.md';
    const pathHashSourceId = deriveLocalPathHashSourceId(folderPath, fileName);
    const document = {
      fileId: 'gdrive_existing-target-conflict',
      fileName,
      folderPath,
      modifiedTime: '2026-08-20T12:17:00.000Z',
      rawContent: '---\nslug: incoming\ntitle: Incoming document\ncontent_type: knowledge\n---\nCloud content'
    };
    const legacyOwner = {
      id: 704,
      slug: 'local-owner',
      title: 'Local mirror owner',
      content_type: 'knowledge',
      drive_file_id: pathHashSourceId,
      published: 1
    };
    const existingDriveOwner = {
      id: 705,
      slug: 'drive-owner',
      title: 'Existing Drive owner',
      content_type: 'knowledge',
      drive_file_id: document.fileId,
      published: 1
    };
    const rows = [legacyOwner, existingDriveOwner];

    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport({ documents: [document] }));
    vi.spyOn(dbService, 'getBlogPosts').mockReturnValue(rows);
    vi.spyOn(dbService, 'getBlogPostByDriveFileId').mockImplementation(sourceId => (
      rows.find(row => row.drive_file_id === sourceId) || null
    ));
    vi.spyOn(dbService, 'getBlogPostBySlug').mockReturnValue(null);
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost');
    const createSpy = vi.spyOn(dbService, 'createBlogPost');

    const result = await driveSyncService.syncAll('TEST');

    expect(result).toMatchObject({ created: 0, updated: 0, adopted: 0, processed: 0, synced: 0, skipped_count: 1 });
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'LEGACY_SOURCE_ID_TARGET_CONFLICT',
        previous_source_id: document.fileId,
        legacy_source_id: pathHashSourceId,
        match_strategy: 'EXACT_NORMALIZED_PATH_HASH',
        candidate_source_ids: [pathHashSourceId]
      })
    ]);
    expect(result.files).toEqual([
      expect.objectContaining({ file_id: document.fileId, status: 'SKIPPED', reason: 'LEGACY_SOURCE_ID_TARGET_CONFLICT' })
    ]);
    expect(updateSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(rows).toEqual([legacyOwner, existingDriveOwner]);
  });

  it('bridges an exact legacy path identity in the real temp DB despite metadata drift', async () => {
    const unique = Date.now();
    const legacySlug = `legacy-path-owner-${unique}`;
    const requestedSlug = `occupied-cloud-slug-${unique}`;
    const folderPath = 'knowledge/Migrated Section';
    const fileName = `document-${unique}.md`;
    const legacySourceId = `drive_file_knowledge/Migrated Section_document-${unique}_md`;
    expect(deriveLegacyLocalSourceId(folderPath, fileName)).toBe(legacySourceId);
    const legacyOwner = dbService.createBlogPost({
      slug: legacySlug,
      title: 'Legacy migrated title',
      summary: 'Legacy summary',
      content: 'Legacy content',
      content_type: 'blog',
      drive_file_id: legacySourceId,
      published: 1
    }, 'TEST_SETUP');
    const slugOwner = dbService.createBlogPost({
      slug: requestedSlug,
      title: 'Unrelated cloud owner',
      summary: 'Unrelated summary',
      content: 'Unrelated content',
      content_type: 'knowledge',
      drive_file_id: `gdrive_unrelated_${unique}`,
      published: 1
    }, 'TEST_SETUP');
    const cloudSourceId = `gdrive_exact_legacy_bridge_${unique}`;
    const document = {
      fileId: cloudSourceId,
      fileName,
      folderPath,
      modifiedTime: '2026-08-20T12:30:00.000Z',
      rawContent: `---\nslug: ${requestedSlug}\ntitle: Completely changed cloud title\ncontent_type: knowledge\nsummary: Cloud summary\n---\nCloud content`
    };
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport({ documents: [document] }));

    const result = await driveSyncService.syncAll('TEST');
    const adopted = dbService.getBlogPostByDriveFileId(cloudSourceId);
    const untouchedSlugOwner = dbService.getBlogPostBySlug(requestedSlug, { publishedOnly: false });

    expect(result).toMatchObject({ created: 0, updated: 1, adopted: 1, reslugged: 1 });
    expect(adopted).toMatchObject({
      id: legacyOwner.id,
      drive_file_id: cloudSourceId,
      title: 'Completely changed cloud title',
      content_type: 'knowledge'
    });
    expect(adopted.slug).toMatch(new RegExp(`^${requestedSlug}-[a-f0-9]{8}$`));
    expect(untouchedSlugOwner.id).toBe(slugOwner.id);
    expect(dbService.getBlogPostByDriveFileId(legacySourceId)).toBeNull();
    expect(result.files[0]).toMatchObject({
      status: 'UPDATED',
      adopted_seed: true,
      legacy_source_adopted: true,
      collision: 'SLUG_COLLISION'
    });
    expect(result.warnings).toEqual([
      expect.objectContaining({
        code: 'LEGACY_SOURCE_ID_ADOPTED',
        legacy_source_id: legacySourceId,
        previous_source_id: legacySourceId
      }),
      expect.objectContaining({
        code: 'LEGACY_SOURCE_METADATA_MISMATCH',
        mismatch_fields: ['slug', 'title', 'content_type']
      })
    ]);
  });

  it('reports frontmatter slug normalization without warning for filename-derived slugs', async () => {
    const documents = [{
      fileId: 'gdrive_normalized',
      fileName: 'ignored-name.md',
      folderPath: 'knowledge',
      modifiedTime: null,
      rawContent: '---\nslug: Árvíz_ Path/Slug\n---\nBody'
    }, {
      fileId: 'gdrive_filename',
      fileName: 'File_Name.MD',
      folderPath: 'knowledge',
      modifiedTime: null,
      rawContent: 'Body'
    }];
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport({ documents }));
    vi.spyOn(dbService, 'getBlogPostByDriveFileId').mockReturnValue(null);
    vi.spyOn(dbService, 'getBlogPostBySlug').mockReturnValue(null);

    const result = await driveSyncService.syncAll('TEST', { dryRun: true });

    expect(result.warnings.filter(issue => issue.code === 'SLUG_NORMALIZED')).toEqual([{
      code: 'SLUG_NORMALIZED',
      stage: 'IDENTITY',
      message: 'Frontmatter slug was normalized to a canonical URL slug.',
      error: 'Frontmatter slug was normalized to a canonical URL slug.',
      folder_id: null,
      folder: 'knowledge',
      file_id: 'gdrive_normalized',
      file: 'ignored-name.md',
      http_status: null,
      recovered: false,
      auth_mode: null,
      requested_raw: 'Árvíz_ Path/Slug',
      resolved: 'arviz-path-slug'
    }]);
    expect(result.files).toEqual([
      expect.objectContaining({ slug: 'arviz-path-slug', status: 'WOULD_CREATE' }),
      expect.objectContaining({ slug: 'file-name', status: 'WOULD_CREATE' })
    ]);
  });

  it('truncates requested and collision slugs to the shared 160-character limit', async () => {
    const rawSlug = 'a'.repeat(200);
    const requestedSlug = 'a'.repeat(160);
    const document = {
      fileId: 'gdrive_long_slug',
      fileName: 'long.md',
      folderPath: 'knowledge',
      modifiedTime: null,
      rawContent: `---\nslug: ${rawSlug}\ntitle: Long slug\n---\nBody`
    };
    const conflictingOwner = {
      id: 41,
      slug: requestedSlug,
      title: 'Different owner',
      content_type: 'knowledge',
      drive_file_id: 'gdrive_other_source'
    };
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport({ documents: [document] }));
    vi.spyOn(dbService, 'getBlogPostByDriveFileId').mockReturnValue(null);
    vi.spyOn(dbService, 'getBlogPostBySlug').mockImplementation(slug => (
      slug === requestedSlug ? conflictingOwner : null
    ));

    const result = await driveSyncService.syncAll('TEST', { dryRun: true });
    const resolvedSlug = result.files[0].slug;

    expect(result.warnings.filter(issue => issue.code === 'SLUG_NORMALIZED')).toEqual([
      expect.objectContaining({
        code: 'SLUG_NORMALIZED',
        requested_raw: rawSlug,
        resolved: requestedSlug
      })
    ]);
    expect(result.collisions).toEqual([
      expect.objectContaining({ requested_slug: requestedSlug, resolved_slug: resolvedSlug })
    ]);
    expect(resolvedSlug).toHaveLength(160);
    expect(resolvedSlug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(resolvedSlug).toMatch(/-[a-f0-9]{8}$/);
    expect(result.files[0].status).toBe('WOULD_RESLUG');
  });

  it('rejects unsupported content_type values as a structured validation skip without DB writes', async () => {
    const invalidDocument = {
      fileId: 'gdrive_invalid_type',
      fileName: 'invalid.md',
      folderPath: 'knowledge',
      modifiedTime: null,
      rawContent: '---\ncontent_type: page\n---\nInvalid type'
    };
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport({ documents: [invalidDocument] }));
    const createSpy = vi.spyOn(dbService, 'createBlogPost');
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost');

    const result = await driveSyncService.syncAll('TEST');

    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({ discovered: 1, processed: 0, skipped_count: 1, synced: 0 });
    expect(result.errors).toEqual([
      expect.objectContaining({ code: 'INVALID_CONTENT_TYPE', stage: 'VALIDATION' })
    ]);
    expect(result.files).toEqual([
      expect.objectContaining({ file: 'invalid.md', status: 'SKIPPED', reason: 'INVALID_CONTENT_TYPE' })
    ]);
  });

  it('adopts a matching seed by normalized title, preserves dimensions and prefers Drive ID identity', async () => {
    const seed = {
      id: 21,
      slug: 'nested',
      title: 'Nested Metadata',
      content_type: 'knowledge',
      drive_file_id: '',
      published: 1
    };
    const document = {
      fileId: 'gdrive_nested',
      fileName: 'nested.md',
      folderPath: 'knowledge',
      modifiedTime: '2026-08-20T10:00:00.000Z',
      rawContent: `---
slug: nested
title: nested metadata
dimensions:
  iparag: [Gyártás]
  technologia: [Node.js, SQLite]
---
Nested body`
    };

    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport({ documents: [document] }));
    const pushSpy = vi.spyOn(driveSyncService, 'pushLocalToDrive').mockResolvedValue(true);
    vi.spyOn(dbService, 'getBlogPostByDriveFileId').mockReturnValue(null);
    vi.spyOn(dbService, 'getBlogPostBySlug').mockImplementation(slug => slug === 'nested' ? seed : null);
    const createSpy = vi.spyOn(dbService, 'createBlogPost');
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost').mockImplementation((id, data) => ({ id, ...data }));

    const result = await driveSyncService.syncAll('TEST');

    expect(pushSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledWith(21, expect.objectContaining({
      drive_file_id: 'gdrive_nested',
      dimensions: {
        iparag: ['Gyártás'],
        technologia: ['Node.js', 'SQLite']
      }
    }), 'TEST');
    expect(result).toMatchObject({ synced: 1, updated: 1, created: 0, adopted: 1 });
    expect(result.files[0]).toMatchObject({ status: 'UPDATED', adopted_seed: true });
  });

  it('reports a unique basename-only legacy candidate without adopting or overwriting it', async () => {
    const legacyRow = {
      id: 25,
      slug: 'legacy-source',
      title: 'Árvíztűrő Tükörfúrógép',
      content_type: 'knowledge',
      drive_file_id: 'drive_file_old_folder_legacy-source_md',
      published: 1
    };
    const document = {
      fileId: 'gdrive_cloud-source',
      fileName: 'legacy-source.md',
      folderPath: 'knowledge',
      modifiedTime: '2026-08-20T11:00:00.000Z',
      rawContent: '---\nslug: legacy-source\ntitle: Arvizturo Tukorfurogep\ncontent_type: knowledge\n---\nCloud body'
    };

    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport({ documents: [document] }));
    vi.spyOn(dbService, 'getBlogPosts').mockReturnValue([legacyRow]);
    vi.spyOn(dbService, 'getBlogPostByDriveFileId').mockReturnValue(null);
    vi.spyOn(dbService, 'getBlogPostBySlug').mockImplementation(slug => slug === 'legacy-source' ? legacyRow : null);
    const createSpy = vi.spyOn(dbService, 'createBlogPost').mockImplementation(data => ({ id: 99, ...data }));
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost');

    const result = await driveSyncService.syncAll('TEST');

    expect(updateSpy).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      drive_file_id: 'gdrive_cloud-source'
    }), 'TEST');
    expect(result).toMatchObject({ created: 1, updated: 0, adopted: 0, reslugged: 1 });
    expect(result.files[0]).toMatchObject({ status: 'CREATED', adopted_seed: false });
    expect(result.files[0].slug).toMatch(/^legacy-source-[a-f0-9]{8}$/);
    expect(result.warnings.filter(issue => issue.code.startsWith('LEGACY_SOURCE_ID_'))).toEqual([
      expect.objectContaining({
        code: 'LEGACY_SOURCE_ID_CANDIDATE',
        file_id: 'gdrive_cloud-source',
        legacy_source_id: 'drive_file_old_folder_legacy-source_md',
        match_strategy: 'UNIQUE_BASENAME',
        ambiguity_reason: 'INSUFFICIENT_IDENTITY_EVIDENCE',
        recovered: false
      })
    ]);
  });

  it('refuses a legacy basename owner claimed by multiple incoming documents', async () => {
    const legacyRow = {
      id: 26,
      slug: 'shared-legacy',
      title: 'Shared legacy owner',
      content_type: 'knowledge',
      drive_file_id: 'drive_file_old_inventory_shared_md',
      published: 1
    };
    const documents = [{
      fileId: 'gdrive_shared_a',
      fileName: 'shared.md',
      folderPath: 'knowledge/first',
      modifiedTime: null,
      rawContent: '---\nslug: first-cloud-document\ntitle: First cloud document\n---\nFirst'
    }, {
      fileId: 'gdrive_shared_b',
      fileName: 'shared.md',
      folderPath: 'knowledge/second',
      modifiedTime: null,
      rawContent: '---\nslug: second-cloud-document\ntitle: Second cloud document\n---\nSecond'
    }];

    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport({ documents }));
    vi.spyOn(dbService, 'getBlogPosts').mockReturnValue([legacyRow]);
    vi.spyOn(dbService, 'getBlogPostByDriveFileId').mockReturnValue(null);
    vi.spyOn(dbService, 'getBlogPostBySlug').mockReturnValue(null);
    const createSpy = vi.spyOn(dbService, 'createBlogPost').mockImplementation((data, actor) => ({
      id: actor === 'TEST' ? 100 : 101,
      ...data
    }));
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost');

    const result = await driveSyncService.syncAll('TEST');

    expect(updateSpy).not.toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ created: 2, updated: 0, adopted: 0 });
    expect(result.files).toEqual([
      expect.objectContaining({ file_id: 'gdrive_shared_a', status: 'CREATED' }),
      expect.objectContaining({ file_id: 'gdrive_shared_b', status: 'CREATED' })
    ]);
    expect(result.warnings.filter(issue => issue.code === 'LEGACY_SOURCE_ID_AMBIGUOUS')).toEqual([
      expect.objectContaining({
        file_id: 'gdrive_shared_a',
        match_strategy: 'UNIQUE_BASENAME',
        ambiguity_reason: 'MULTIPLE_INCOMING_BASENAME_CLAIMS',
        candidate_source_ids: ['drive_file_old_inventory_shared_md']
      }),
      expect.objectContaining({
        file_id: 'gdrive_shared_b',
        match_strategy: 'UNIQUE_BASENAME',
        ambiguity_reason: 'MULTIPLE_INCOMING_BASENAME_CLAIMS',
        candidate_source_ids: ['drive_file_old_inventory_shared_md']
      })
    ]);
  });

  it('skips exact legacy path duplicate claims instead of creating duplicate records', async () => {
    const legacySourceId = 'drive_file_knowledge/duplicate-folder_duplicate_md';
    const legacyRow = {
      id: 27,
      slug: 'duplicate-legacy',
      title: 'Duplicate legacy owner',
      content_type: 'knowledge',
      drive_file_id: legacySourceId,
      published: 1
    };
    const documents = [{
      fileId: 'gdrive_exact_duplicate_a',
      fileName: 'duplicate.md',
      folderPath: 'knowledge/duplicate-folder',
      modifiedTime: null,
      rawContent: '---\nslug: exact-duplicate-a\ntitle: Exact duplicate A\n---\nFirst'
    }, {
      fileId: 'gdrive_exact_duplicate_b',
      fileName: 'duplicate.md',
      folderPath: 'knowledge\\duplicate-folder',
      modifiedTime: null,
      rawContent: '---\nslug: exact-duplicate-b\ntitle: Exact duplicate B\n---\nSecond'
    }];

    expect(deriveLegacyLocalSourceId(documents[0].folderPath, documents[0].fileName)).toBe(legacySourceId);
    expect(deriveLegacyLocalSourceId(documents[1].folderPath, documents[1].fileName)).toBe(legacySourceId);
    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport({ documents }));
    vi.spyOn(dbService, 'getBlogPosts').mockReturnValue([legacyRow]);
    vi.spyOn(dbService, 'getBlogPostByDriveFileId').mockReturnValue(null);
    vi.spyOn(dbService, 'getBlogPostBySlug').mockReturnValue(null);
    const createSpy = vi.spyOn(dbService, 'createBlogPost').mockImplementation(data => ({ id: 102, ...data }));
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost');

    const result = await driveSyncService.syncAll('TEST');

    expect(updateSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      created: 0,
      updated: 0,
      adopted: 0,
      processed: 0,
      synced: 0,
      skipped_count: 2
    });
    expect(result.files).toEqual([
      expect.objectContaining({ file_id: 'gdrive_exact_duplicate_a', status: 'SKIPPED', reason: 'LEGACY_SOURCE_ID_AMBIGUOUS' }),
      expect.objectContaining({ file_id: 'gdrive_exact_duplicate_b', status: 'SKIPPED', reason: 'LEGACY_SOURCE_ID_AMBIGUOUS' })
    ]);
    expect(result.errors).toEqual([
      expect.objectContaining({
        file_id: 'gdrive_exact_duplicate_a',
        match_strategy: 'EXACT_FULL_PATH',
        ambiguity_reason: 'MULTIPLE_INCOMING_EXACT_CLAIMS',
        candidate_source_ids: [legacySourceId]
      }),
      expect.objectContaining({
        file_id: 'gdrive_exact_duplicate_b',
        match_strategy: 'EXACT_FULL_PATH',
        ambiguity_reason: 'MULTIPLE_INCOMING_EXACT_CLAIMS',
        candidate_source_ids: [legacySourceId]
      })
    ]);
  });

  it('updates the Drive-ID owner and re-slugs it instead of overwriting a different slug owner', async () => {
    const sourceOwner = {
      id: 31,
      slug: 'old-source-slug',
      title: 'Incoming source',
      content_type: 'knowledge',
      drive_file_id: 'gdrive_incoming',
      published: 1
    };
    const slugOwner = {
      id: 32,
      slug: 'shared-slug',
      title: 'Different source',
      content_type: 'knowledge',
      drive_file_id: 'gdrive_different',
      published: 1
    };
    const document = {
      fileId: 'gdrive_incoming',
      fileName: 'incoming.md',
      folderPath: 'knowledge',
      modifiedTime: null,
      rawContent: '---\nslug: shared-slug\ntitle: Incoming source\n---\nBody'
    };

    vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(cloudStatus({ drive_blog_folder_id: null }));
    vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([{ mode: 'SERVICE_ACCOUNT', token: 'token' }]);
    vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockResolvedValue(emptyCrawlReport({ documents: [document] }));
    vi.spyOn(dbService, 'getBlogPostByDriveFileId').mockReturnValue(sourceOwner);
    vi.spyOn(dbService, 'getBlogPostBySlug').mockImplementation(slug => (
      slug === 'shared-slug' ? slugOwner : null
    ));
    const updateSpy = vi.spyOn(dbService, 'updateBlogPost').mockImplementation((id, data) => ({ id, ...data }));

    const result = await driveSyncService.syncAll('TEST');

    expect(updateSpy).toHaveBeenCalledWith(31, expect.objectContaining({
      slug: expect.stringMatching(/^shared-slug-[a-f0-9]{8}$/),
      drive_file_id: 'gdrive_incoming'
    }), 'TEST');
    expect(result).toMatchObject({ updated: 1, created: 0, reslugged: 1 });
    expect(result.collisions[0]).toMatchObject({
      existing_post_id: 32,
      incoming_file_id: 'gdrive_incoming',
      requested_slug: 'shared-slug'
    });
  });
});
