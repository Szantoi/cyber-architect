import { afterEach, describe, expect, it, vi } from 'vitest';
import { driveSyncService } from '../../services/driveSyncService.js';

function jsonResponse(body, status = 200, etag = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (etag) headers.ETag = etag;
  return new Response(JSON.stringify(body), { status, headers });
}

function textResponse(body, status = 200) {
  return new Response(body, { status });
}

function status(overrides = {}) {
  return {
    mode: 'GOOGLE_SERVICE_ACCOUNT',
    configuration_errors: [],
    drive_folder_id: 'knowledge-root',
    drive_knowledge_folder_id: 'knowledge-root',
    drive_blog_folder_id: null,
    knowledge_vault_dir: 'knowledge-root',
    blog_vault_dir: 'blog-root',
    ...overrides
  };
}

function markdown({ slug = 'rehome-target', title = 'OAuth rehome target', body = '# Verified local body' } = {}) {
  return `---\ntitle: ${title}\nslug: ${slug}\npublished: true\ncontent_type: knowledge\n---\n${body}`;
}

function cloudDocument(overrides = {}) {
  return {
    fileId: 'gdrive_old-file',
    fileName: 'rehome-target.md',
    folderPath: 'knowledge/Rehome',
    rawContent: '',
    modifiedTime: '2026-08-20T10:00:00.000Z',
    mimeType: 'text/plain',
    parents: ['parent-1'],
    size: 0,
    version: '7',
    md5Checksum: 'd41d8cd98f00b204e9800998ecf8427e',
    trashed: false,
    properties: { keep: 'yes' },
    shortcut: false,
    ...overrides
  };
}

function localDocument(overrides = {}) {
  return {
    fileId: 'drive_file_rehome-target',
    fileName: 'rehome-target.md',
    folderPath: 'knowledge/Rehome',
    rawContent: markdown(),
    modifiedTime: '2026-08-20T09:00:00.000Z',
    ...overrides
  };
}

function completedRehomeProperties(overrides = {}) {
  return {
    keep: 'yes',
    'cyberarchitect.sync_state': 'oauth-rehome-complete-v1',
    'cyberarchitect.rehome_run_id': 'a'.repeat(24),
    ...overrides
  };
}

function completedCloudDocument(local, overrides = {}) {
  return cloudDocument({
    fileId: 'gdrive_complete-file',
    fileName: local.fileName,
    folderPath: local.folderPath,
    rawContent: local.rawContent,
    parents: ['parent-2'],
    size: Buffer.byteLength(local.rawContent, 'utf8'),
    version: '9',
    md5Checksum: 'content-md5',
    properties: completedRehomeProperties(),
    ...overrides
  });
}

function completedOAuthFile(local, overrides = {}) {
  return {
    id: 'complete-file',
    name: local.fileName,
    parentId: 'parent-2',
    mimeType: 'text/plain',
    content: local.rawContent,
    properties: completedRehomeProperties(),
    version: 9,
    modifiedTime: '2026-08-20T10:00:00.000Z',
    ...overrides
  };
}

function crawlReport(documents) {
  return {
    documents,
    errors: [],
    warnings: [],
    skipped: [],
    pages: 1,
    listed: documents.length,
    authMode: 'SERVICE_ACCOUNT'
  };
}

function arrange({ cloudDocuments = [cloudDocument()], localDocuments = [localDocument()] } = {}) {
  vi.spyOn(driveSyncService, 'getStatus').mockReturnValue(status());
  vi.spyOn(driveSyncService, 'getAccessTokenCandidates').mockResolvedValue([
    { mode: 'SERVICE_ACCOUNT', token: 'service-token' },
    { mode: 'OAUTH_USER', token: 'oauth-token' }
  ]);
  vi.spyOn(driveSyncService, 'crawlCloudSourceWithTokenFallback').mockImplementation(async source => (
    source.folderPath === 'knowledge' ? crawlReport(cloudDocuments) : crawlReport([])
  ));
  vi.spyOn(driveSyncService, 'crawlLocalFolder').mockImplementation((_directory, prefix) => (
    localDocuments.filter(document => document.folderPath.split(/[/\\]/)[0] === prefix)
  ));
}

function makeMetadata(file, ownedByMe = file?.ownedByMe !== false) {
  return {
    id: file.id,
    name: file.name,
    parents: [file.parentId],
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    size: String(Buffer.byteLength(file.content, 'utf8')),
    version: String(file.version),
    md5Checksum: file.content ? 'content-md5' : 'd41d8cd98f00b204e9800998ecf8427e',
    trashed: false,
    ownedByMe,
    capabilities: {
      canEdit: true,
      canModifyContent: true,
      canRename: true
    },
    properties: { ...file.properties }
  };
}

function createDriveMock({
  localContent,
  archiveResponseMismatch = false,
  archiveTimeoutAfterMutation = false,
  finalContent = null,
  failCreate = false,
  canonicalConflict = false,
  markedCanonicalConflict = false,
  foreignCanonicalAfterFinalization = false,
  foreignCanonicalDuringRecovery = false,
  failCanonicalListDuringRecovery = false,
  foreignCanonicalAfterRestore = false,
  failCanonicalListAfterRestore = false,
  restoreTimeoutAfterMutation = false,
  moveOldParentAfterArchive = false,
  emptyFinalCanonicalListResponses = 0,
  incompleteFinalCanonicalList = false,
  stagingMetadataReadStatusSequence = [],
  additionalServiceFiles = [],
  additionalOAuthFiles = []
} = {}) {
  const pendingStagingMetadataReadStatuses = [...stagingMetadataReadStatusSequence];
  const state = {
    old: {
      id: 'old-file',
      name: 'rehome-target.md',
      parentId: 'parent-1',
      mimeType: 'text/plain',
      content: '',
      properties: { keep: 'yes' },
      version: 7,
      modifiedTime: '2026-08-20T10:00:00.000Z'
    },
    replacement: null,
    additionalServiceFiles: additionalServiceFiles.map(file => ({
      content: '',
      properties: { keep: 'yes' },
      version: 7,
      modifiedTime: '2026-08-20T10:00:00.000Z',
      mimeType: 'text/plain',
      ...file
    })),
    additionalOAuthFiles: additionalOAuthFiles.map(file => ({
      content: '',
      properties: {},
      version: 1,
      modifiedTime: '2026-08-20T10:00:00.000Z',
      mimeType: 'text/plain',
      ...file
    })),
    calls: [],
    newMediaReads: 0,
    foreignCanonicalActive: false,
    serviceMetadataReads: 0,
    moveOldParentOnServiceMetadataRead: null,
    moveOldParentTo: 'parent-2',
    moveOldParentAfterArchivePending: false,
    finalCanonicalListCalls: 0,
    stagingMetadataReadCalls: 0,
    stagingMetadataReadFailureStatuses: []
  };

  const metadataResponse = file => jsonResponse(makeMetadata(file), 200, `"${file.id}-${file.version}"`);
  const rehomeState = file => file?.properties?.['cyberarchitect.sync_state'];
  const canonicalListItem = file => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    trashed: false,
    properties: { ...file.properties }
  });
  const fetchMock = vi.fn(async (input, options = {}) => {
    const url = new URL(String(input));
    const method = options.method || 'GET';
    state.calls.push({ url, options, method });
    const auth = options.headers?.Authorization;

    if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
      expect(auth).toBe('Bearer oauth-token');
      if (failCreate) return jsonResponse({ error: { message: 'quota denied' } }, 403);
      const multipart = Buffer.from(options.body).toString('utf8');
      expect(multipart).toContain('Content-Type: text/plain; charset=utf-8');
      expect(multipart).toContain('cyberarchitect.sync_state');
      state.replacement = {
        id: 'oauth-new-file',
        name: multipart.match(/"name":"([^"]*staging[^"]*)"/)?.[1] || 'staging.tmp',
        parentId: 'parent-1',
        mimeType: 'text/plain',
        content: localContent,
        properties: {
          'cyberarchitect.sync_state': 'oauth-rehome-staging-v1',
          'cyberarchitect.rehome_run_id': multipart.match(/"cyberarchitect.rehome_run_id":"([a-f0-9]+)"/)?.[1] || 'run'
        },
        version: 1,
        modifiedTime: '2026-08-20T11:00:00.000Z'
      };
      return metadataResponse(state.replacement);
    }

    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      expect(auth).toBe('Bearer oauth-token');
      const query = url.searchParams.get('q') || '';
      const requestedName = query.match(/name = '((?:\\'|[^'])*)'/)?.[1]?.replace(/\\'/g, "'") || '';
      const requestedParentId = query.match(/'((?:\\'|[^'])*)' in parents/)?.[1]?.replace(/\\'/g, "'") || '';
      const finalCanonicalLookup = requestedName === 'rehome-target.md'
        && state.replacement?.name === 'rehome-target.md'
        && rehomeState(state.replacement) === 'oauth-rehome-complete-v1';
      if (finalCanonicalLookup) {
        state.finalCanonicalListCalls++;
        if (state.finalCanonicalListCalls <= emptyFinalCanonicalListResponses) {
          return jsonResponse({ files: [] });
        }
      }
      if (foreignCanonicalAfterFinalization
        && rehomeState(state.replacement) === 'oauth-rehome-complete-v1') {
        state.foreignCanonicalActive = true;
      }
      if (foreignCanonicalDuringRecovery
        && rehomeState(state.replacement) === 'oauth-rehome-failed-staging-v1') {
        state.foreignCanonicalActive = true;
      }
      if (foreignCanonicalAfterRestore
        && state.old.name === 'rehome-target.md'
        && !rehomeState(state.old)) {
        state.foreignCanonicalActive = true;
      }
      if (failCanonicalListDuringRecovery
        && rehomeState(state.replacement) === 'oauth-rehome-failed-staging-v1') {
        return jsonResponse({ error: { message: 'canonical namespace unavailable' } }, 503);
      }
      if (failCanonicalListAfterRestore
        && state.old.name === 'rehome-target.md'
        && !rehomeState(state.old)) {
        return jsonResponse({ error: { message: 'canonical namespace unavailable after restore' } }, 503);
      }
      const files = [
        state.old,
        ...state.additionalServiceFiles,
        state.replacement,
        ...state.additionalOAuthFiles
      ]
        .filter(file => file?.parentId === requestedParentId
          && file.name === requestedName)
        .map(canonicalListItem);
      if ((canonicalConflict || state.foreignCanonicalActive) && requestedName === 'rehome-target.md') {
        files.push({
          id: 'other-active-file',
          name: 'rehome-target.md',
          mimeType: 'text/plain',
          trashed: false,
          properties: {}
        });
      }
      if (markedCanonicalConflict && requestedName === 'rehome-target.md') {
        files.push({
          id: 'marked-canonical-file',
          name: 'rehome-target.md',
          mimeType: 'text/plain',
          trashed: false,
          properties: { 'cyberarchitect.sync_state': 'oauth-rehome-staging-v1' }
        });
      }
      return jsonResponse({
        files,
        ...(finalCanonicalLookup && incompleteFinalCanonicalList ? { incompleteSearch: true } : {})
      });
    }

    const parentId = url.pathname.match(/^\/drive\/v3\/files\/(parent-[^/]+)$/)?.[1];
    if (parentId && method === 'GET') {
      expect(auth).toBe('Bearer oauth-token');
      return jsonResponse({
        id: parentId,
        mimeType: 'application/vnd.google-apps.folder',
        trashed: false,
        capabilities: { canAddChildren: true }
      });
    }

    const fileId = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/)?.[1];
    const uploadFileId = url.pathname.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/)?.[1];
    const requestedFileId = fileId || uploadFileId;
    const serviceFile = [state.old, ...state.additionalServiceFiles]
      .find(file => file.id === requestedFileId) || null;
    const oauthFile = [state.replacement, ...state.additionalOAuthFiles]
      .find(file => file?.id === requestedFileId) || null;
    const active = serviceFile || oauthFile;
    if (!active) throw new Error(`Unexpected Drive request: ${method} ${url}`);
    const serviceOwned = Boolean(serviceFile);

    if (method === 'GET' && url.searchParams.get('alt') === 'media') {
      expect(auth).toBe(serviceOwned ? 'Bearer service-token' : 'Bearer oauth-token');
      if (active === state.replacement) {
        state.newMediaReads++;
        if (finalContent !== null && state.newMediaReads > 1) return textResponse(finalContent);
      }
      return textResponse(active.content);
    }
    if (method === 'GET') {
      expect(auth).toBe(serviceOwned ? 'Bearer service-token' : 'Bearer oauth-token');
      if (active === state.replacement) {
        state.stagingMetadataReadCalls++;
        const stagedMetadataStatus = pendingStagingMetadataReadStatuses.shift();
        if (Number.isInteger(stagedMetadataStatus) && stagedMetadataStatus >= 400) {
          state.stagingMetadataReadFailureStatuses.push(stagedMetadataStatus);
          return jsonResponse({ error: { message: `simulated staging metadata ${stagedMetadataStatus}` } }, stagedMetadataStatus);
        }
      }
      if (serviceOwned && active === state.old) {
        if (state.moveOldParentAfterArchivePending) {
          state.old.parentId = state.moveOldParentTo;
          state.moveOldParentAfterArchivePending = false;
        }
        if (state.moveOldParentOnServiceMetadataRead !== null
          && state.serviceMetadataReads >= state.moveOldParentOnServiceMetadataRead) {
          state.old.parentId = state.moveOldParentTo;
        }
        state.serviceMetadataReads++;
      }
      return metadataResponse(active);
    }
    if (method === 'PATCH') {
      expect(auth).toBe(serviceOwned ? 'Bearer service-token' : 'Bearer oauth-token');
      const payload = JSON.parse(options.body);
      if (payload.name !== undefined) active.name = payload.name;
      if (payload.properties !== undefined) {
        for (const [key, value] of Object.entries(payload.properties)) {
          if (value === null) delete active.properties[key];
          else active.properties[key] = value;
        }
      }
      active.version += 1;
      active.modifiedTime = `2026-08-20T11:00:0${active.version}.000Z`;
      const response = makeMetadata(active);
      if (active === state.old && archiveResponseMismatch
        && payload.properties?.['cyberarchitect.sync_state'] === 'oauth-rehome-archive-v1') {
        response.name = 'rehome-target.md';
      }
      if (active === state.old && archiveTimeoutAfterMutation
        && payload.properties?.['cyberarchitect.sync_state'] === 'oauth-rehome-archive-v1') {
        throw new Error('simulated archive timeout');
      }
      if (active === state.old && moveOldParentAfterArchive
        && payload.properties?.['cyberarchitect.sync_state'] === 'oauth-rehome-archive-v1') {
        // Keep the successful PATCH response stable, then simulate an external
        // parent move immediately before the required pre-finalization readback.
        state.moveOldParentAfterArchivePending = true;
      }
      if (active === state.old && restoreTimeoutAfterMutation
        && payload.name === 'rehome-target.md'
        && payload.properties?.['cyberarchitect.sync_state'] === null) {
        throw new Error('simulated restore timeout');
      }
      return jsonResponse(response, 200, `"${active.id}-${active.version}"`);
    }
    throw new Error(`Unexpected Drive request: ${method} ${url}`);
  });
  return { fetchMock, state };
}

async function previewWithDriveMock(options) {
  const drive = createDriveMock(options);
  vi.stubGlobal('fetch', drive.fetchMock);
  return {
    ...drive,
    preview: await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth()
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OAuth ownership rehome', () => {
  it('skips public-marked archive and staging artifacts before MIME filtering or download', async () => {
    const fetchMock = vi.fn(async input => {
      const url = new URL(String(input));
      if (url.pathname === '/drive/v3/files') {
        expect(url.searchParams.get('fields')).toContain('properties');
        return jsonResponse({
          files: [{
            id: 'archive-file',
            name: 'rehome-target.md.__cyberarchitect-oauth-rehome-archive',
            mimeType: 'text/markdown',
            properties: { 'cyberarchitect.sync_state': 'oauth-rehome-archive-v1' }
          }, {
            id: 'staging-file',
            name: 'rehome-target.md.__cyberarchitect-oauth-rehome-staging',
            mimeType: 'text/markdown',
            properties: { 'cyberarchitect.sync_state': 'oauth-rehome-staging-v1' }
          }]
        });
      }
      throw new Error(`Unexpected artifact download: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const report = await driveSyncService.crawlCloudFolder('parent-1', 'knowledge', 'token', { allowEmpty: true });

    expect(report.documents).toEqual([]);
    expect(report.skipped).toEqual([
      expect.objectContaining({ code: 'DRIVE_REHOME_ARTIFACT_SKIPPED', resolved: 'oauth-rehome-archive-v1' }),
      expect.objectContaining({ code: 'DRIVE_REHOME_ARTIFACT_SKIPPED', resolved: 'oauth-rehome-staging-v1' })
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('previews only exact empty pairs, fingerprints the remote inventory, and skips missing-cloud creation', async () => {
    const exact = cloudDocument();
    const localOnly = localDocument({ fileId: 'drive_file_local-only', fileName: 'local-only.md', rawContent: markdown({ slug: 'local-only' }) });
    arrange({ cloudDocuments: [exact], localDocuments: [localDocument(), localOnly] });
    const { fetchMock, preview: result } = await previewWithDriveMock({ localContent: localDocument().rawContent });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      dry_run: true,
      exact_pairs: 1,
      expected_rehome_count: 1,
      would_rehome: 1,
      missing_cloud: 1,
      preflight_passed: true,
      errors: []
    });
    expect(result.plan_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.plan[0].cloud_fingerprint).toMatchObject({
      parent_ids: ['parent-1'],
      version: '7',
      mime_type: 'text/plain',
      observed_bytes: 0
    });
    expect(result.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'CREATE_MISSING_SKIPPED', reason: 'REHOME_CREATE_MISSING_SKIPPED' })
    ]));
  });

  it('creates a verified OAuth-owned replacement, archives the owned empty original, and returns an exact ID mapping', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({ localContent: local.rawContent });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: preview.expected_rehome_count
    });

    expect(result).toMatchObject({
      rehomed: 1,
      processed: 1,
      database_followup_required: true,
      errors: []
    });
    expect(result.mappings).toEqual([expect.objectContaining({
      old_file_id: 'gdrive_old-file',
      new_file_id: 'gdrive_oauth-new-file',
      database_followup_required: true,
      old_auth_mode: 'SERVICE_ACCOUNT',
      new_auth_mode: 'OAUTH_USER'
    })]);
    expect(state.old.name).toContain('oauth-rehome-archive-');
    expect(state.old.properties).toMatchObject({
      keep: 'yes',
      'cyberarchitect.sync_state': 'oauth-rehome-archive-v1'
    });
    expect(state.replacement.name).toBe('rehome-target.md');
    expect(state.replacement.mimeType).toBe('text/plain');
    expect(state.replacement.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-complete-v1');
    expect(state.calls.filter(call => (
      call.method === 'GET' && call.url.pathname === '/drive/v3/files/parent-1'
    ))).toHaveLength(2);
    expect(state.calls.some(call => (
      call.method === 'POST'
      && call.url.pathname === '/upload/drive/v3/files'
      && call.options.headers.Authorization === 'Bearer service-token'
    ))).toBe(false);
  });

  it('retries a transient staging metadata 404 with the same OAuth replacement before archival', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      stagingMetadataReadStatusSequence: [404]
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result).toMatchObject({ rehomed: 1, errors: [] });
    expect(state.stagingMetadataReadFailureStatuses).toEqual([404]);
    expect(state.calls.filter(call => (
      call.method === 'POST' && call.url.pathname === '/upload/drive/v3/files'
    ))).toHaveLength(1);
    const initialStagingReads = state.calls.filter(call => (
      call.method === 'GET'
      && call.url.pathname === '/drive/v3/files/oauth-new-file'
      && call.url.searchParams.get('alt') !== 'media'
    )).slice(0, 2);
    expect(initialStagingReads).toHaveLength(2);
    const archivePatchIndex = state.calls.findIndex(call => (
      call.method === 'PATCH'
      && call.url.pathname === '/drive/v3/files/old-file'
      && JSON.parse(call.options.body).properties?.['cyberarchitect.sync_state'] === 'oauth-rehome-archive-v1'
    ));
    expect(archivePatchIndex).toBeGreaterThan(state.calls.indexOf(initialStagingReads[1]));
  });

  it('retries a transient final staging metadata read before archival', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      // Initial staging metadata succeeds; the final pre-archive metadata
      // read gets a transient failure and must be retried before old-file work.
      stagingMetadataReadStatusSequence: [null, 503]
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result).toMatchObject({ rehomed: 1, errors: [] });
    expect(state.stagingMetadataReadFailureStatuses).toEqual([503]);
    const archivePatchIndex = state.calls.findIndex(call => (
      call.method === 'PATCH'
      && call.url.pathname === '/drive/v3/files/old-file'
      && JSON.parse(call.options.body).properties?.['cyberarchitect.sync_state'] === 'oauth-rehome-archive-v1'
    ));
    const replacementMetadataReadsBeforeArchive = state.calls
      .slice(0, archivePatchIndex)
      .filter(call => (
        call.method === 'GET'
        && call.url.pathname === '/drive/v3/files/oauth-new-file'
        && call.url.searchParams.get('alt') !== 'media'
      ));
    expect(replacementMetadataReadsBeforeArchive).toHaveLength(3);
  });

  it('fails closed after bounded retryable staging metadata errors, marks the replacement failed, and leaves the old file unchanged', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      // Initial read plus all four bounded retries fail. The next metadata
      // read is the safe cleanup verification that marks this staging object.
      stagingMetadataReadStatusSequence: [503, 503, 503, 503, 503]
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result).toMatchObject({ rehomed: 0, aborted_after_failure: true });
    expect(result.errors).toEqual([expect.objectContaining({
      code: 'DRIVE_REHOME_STAGING_METADATA_READ_FAILED',
      http_status: 503,
      details: { staging_metadata_retry_attempts: 4 }
    })]);
    expect(state.stagingMetadataReadFailureStatuses).toEqual([503, 503, 503, 503, 503]);
    expect(state.replacement.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-failed-staging-v1');
    expect(state.old).toMatchObject({
      name: 'rehome-target.md',
      properties: { keep: 'yes' }
    });
    expect(state.calls.some(call => (
      call.method === 'PATCH'
      && call.url.pathname === '/drive/v3/files/old-file'
      && JSON.parse(call.options.body).properties?.['cyberarchitect.sync_state'] === 'oauth-rehome-archive-v1'
    ))).toBe(false);
  });

  it('does not retry a staging metadata 403 and never archives the old file', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      stagingMetadataReadStatusSequence: [403]
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result).toMatchObject({ rehomed: 0, aborted_after_failure: true });
    expect(result.errors).toEqual([expect.objectContaining({
      code: 'DRIVE_REHOME_STAGING_METADATA_READ_FAILED',
      http_status: 403,
      details: { staging_metadata_retry_attempts: 0 }
    })]);
    // One rejected verify read plus one safe cleanup read: no retry loop.
    expect(state.stagingMetadataReadCalls).toBe(2);
    expect(state.stagingMetadataReadFailureStatuses).toEqual([403]);
    expect(state.replacement.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-failed-staging-v1');
    expect(state.calls.some(call => (
      call.method === 'PATCH'
      && call.url.pathname === '/drive/v3/files/old-file'
    ))).toBe(false);
  });

  it('preserves a UTF-8 BOM while verifying the staged and finalized replacement hashes', async () => {
    const local = localDocument({ rawContent: `\uFEFF${markdown()}` });
    arrange({ localDocuments: [local] });
    const { preview } = await previewWithDriveMock({ localContent: local.rawContent });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result).toMatchObject({ rehomed: 1, errors: [] });
    expect(result.mappings[0]).toMatchObject({ local_sha256: expect.any(String) });
  });

  it('treats a verified OAuth complete-state file as already rehomed and plans only the remaining empty original', async () => {
    const remainingLocal = localDocument();
    const completedLocal = localDocument({
      fileId: 'drive_file_complete',
      fileName: 'complete.md',
      folderPath: 'knowledge/Complete',
      rawContent: markdown({ slug: 'complete', title: 'Completed' })
    });
    const completedCloud = completedCloudDocument(completedLocal);
    arrange({
      cloudDocuments: [cloudDocument(), completedCloud],
      localDocuments: [remainingLocal, completedLocal]
    });
    const { preview } = await previewWithDriveMock({
      localContent: remainingLocal.rawContent,
      additionalOAuthFiles: [completedOAuthFile(completedLocal)]
    });

    expect(preview).toMatchObject({
      exact_pairs: 1,
      expected_rehome_count: 1,
      would_rehome: 1,
      already_rehomed: 1,
      database_followup_required: true,
      preflight_passed: true,
      errors: []
    });
    expect(preview.plan).toEqual([expect.objectContaining({ old_file_id: 'gdrive_old-file' })]);
    expect(preview.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'complete.md', status: 'ALREADY_REHOMED', new_file_id: 'gdrive_complete-file' })
    ]));
  });

  it('treats an all-complete verified inventory as a successful resume-only no-op', async () => {
    const completedLocal = localDocument({
      fileId: 'drive_file_complete',
      fileName: 'complete.md',
      folderPath: 'knowledge/Complete',
      rawContent: markdown({ slug: 'complete', title: 'Completed' })
    });
    arrange({
      cloudDocuments: [completedCloudDocument(completedLocal)],
      localDocuments: [completedLocal]
    });
    const { preview, fetchMock } = await previewWithDriveMock({
      localContent: completedLocal.rawContent,
      additionalOAuthFiles: [completedOAuthFile(completedLocal)]
    });

    expect(preview).toMatchObject({
      exact_pairs: 0,
      expected_rehome_count: 0,
      would_rehome: 0,
      already_rehomed: 1,
      preflight_passed: true,
      no_op: true,
      resume_only: true,
      database_followup_required: true,
      errors: []
    });
    fetchMock.mockClear();

    const applied = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 0
    });

    expect(applied).toMatchObject({
      rehomed: 0,
      already_rehomed: 1,
      preflight_passed: true,
      no_op: true,
      resume_only: true,
      database_followup_required: true,
      errors: []
    });
    expect(fetchMock.mock.calls.some(([, options = {}]) => (
      options.method === 'POST' || options.method === 'PATCH'
    ))).toBe(false);
  });

  it('warns and skips ordinary nonempty and non-service-owned files while retaining the exact empty service-account plan', async () => {
    const remainingLocal = localDocument();
    const normalLocal = localDocument({
      fileId: 'drive_file_normal',
      fileName: 'normal.md',
      folderPath: 'knowledge/Normal',
      rawContent: markdown({ slug: 'normal', title: 'Normal' })
    });
    const oauthEmptyLocal = localDocument({
      fileId: 'drive_file_oauth-empty',
      fileName: 'oauth-empty.md',
      folderPath: 'knowledge/OAuth',
      rawContent: markdown({ slug: 'oauth-empty', title: 'OAuth empty' })
    });
    arrange({
      cloudDocuments: [
        cloudDocument(),
        cloudDocument({
          fileId: 'gdrive_normal-file',
          fileName: 'normal.md',
          folderPath: 'knowledge/Normal',
          parents: ['parent-3'],
          rawContent: '# Normal cloud document',
          size: Buffer.byteLength('# Normal cloud document', 'utf8')
        }),
        cloudDocument({
          fileId: 'gdrive_oauth-empty-file',
          fileName: 'oauth-empty.md',
          folderPath: 'knowledge/OAuth',
          parents: ['parent-4']
        })
      ],
      localDocuments: [remainingLocal, normalLocal, oauthEmptyLocal]
    });
    const { preview } = await previewWithDriveMock({
      localContent: remainingLocal.rawContent,
      additionalServiceFiles: [{
        id: 'oauth-empty-file',
        name: 'oauth-empty.md',
        parentId: 'parent-4',
        ownedByMe: false
      }]
    });

    expect(preview).toMatchObject({ exact_pairs: 1, expected_rehome_count: 1, errors: [], preflight_passed: true });
    expect(preview.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'REHOME_CLOUD_FILE_NONEMPTY' }),
      expect.objectContaining({ code: 'REHOME_CLOUD_FILE_NOT_SERVICE_OWNED' })
    ]));
    expect(preview.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'normal.md', status: 'NONEMPTY_SKIPPED' }),
      expect.objectContaining({ file: 'oauth-empty.md', status: 'NON_SERVICE_OWNED_SKIPPED' })
    ]));
  });

  it('refuses a complete-state file whose OAuth ownership cannot be proven', async () => {
    const remainingLocal = localDocument();
    const completedLocal = localDocument({
      fileId: 'drive_file_complete',
      fileName: 'complete.md',
      folderPath: 'knowledge/Complete',
      rawContent: markdown({ slug: 'complete', title: 'Completed' })
    });
    arrange({
      cloudDocuments: [cloudDocument(), completedCloudDocument(completedLocal)],
      localDocuments: [remainingLocal, completedLocal]
    });
    const { preview } = await previewWithDriveMock({
      localContent: remainingLocal.rawContent,
      additionalOAuthFiles: [completedOAuthFile(completedLocal, { ownedByMe: false })]
    });

    expect(preview.preflight_passed).toBe(false);
    expect(preview.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DRIVE_REHOME_COMPLETE_INVALID', validation_reason: 'OAUTH_USER_NOT_OWNER' })
    ]));
    expect(preview.files).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'complete.md', status: 'ALREADY_REHOMED' })
    ]));
  });

  it('refuses a complete-state file with an invalid rehome property contract', async () => {
    const remainingLocal = localDocument();
    const completedLocal = localDocument({
      fileId: 'drive_file_complete',
      fileName: 'complete.md',
      folderPath: 'knowledge/Complete',
      rawContent: markdown({ slug: 'complete', title: 'Completed' })
    });
    const invalidProperties = completedRehomeProperties({ 'cyberarchitect.rehome_run_id': 'invalid' });
    arrange({
      cloudDocuments: [cloudDocument(), completedCloudDocument(completedLocal, { properties: invalidProperties })],
      localDocuments: [remainingLocal, completedLocal]
    });
    const { preview } = await previewWithDriveMock({
      localContent: remainingLocal.rawContent,
      additionalOAuthFiles: [completedOAuthFile(completedLocal, { properties: invalidProperties })]
    });

    expect(preview.preflight_passed).toBe(false);
    expect(preview.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DRIVE_REHOME_COMPLETE_PROPERTY_INVALID', validation_reason: 'REHOME_RUN_ID_INVALID' })
    ]));
  });

  it('demotes a bad final replacement before restoring the original, preventing duplicate canonical paths', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      finalContent: 'tampered final content'
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result).toMatchObject({ rehomed: 0, aborted_after_failure: true });
    expect(result.errors).toEqual([expect.objectContaining({ code: 'DRIVE_REHOME_FINAL_HASH_MISMATCH', recovered: true })]);
    expect(result.files[0].compensation).toMatchObject({
      replacement_demotion: { succeeded: true },
      original_restore: { succeeded: true }
    });
    expect(state.old.name).toBe('rehome-target.md');
    expect(state.old.properties).toEqual({ keep: 'yes' });
    expect(state.replacement.name).toContain('oauth-rehome-staging-');
    expect(state.replacement.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-failed-staging-v1');
    const replacementDemotionIndex = state.calls.findIndex(call => (
      call.method === 'PATCH'
      && call.url.pathname === '/drive/v3/files/oauth-new-file'
      && JSON.parse(call.options.body).properties?.['cyberarchitect.sync_state'] === 'oauth-rehome-failed-staging-v1'
    ));
    const originalRestoreIndex = state.calls.findIndex(call => (
      call.method === 'PATCH'
      && call.url.pathname === '/drive/v3/files/old-file'
      && JSON.parse(call.options.body).name === 'rehome-target.md'
    ));
    expect(replacementDemotionIndex).toBeGreaterThan(-1);
    expect(originalRestoreIndex).toBeGreaterThan(replacementDemotionIndex);
    const restorePayload = JSON.parse(state.calls[originalRestoreIndex].options.body);
    expect(restorePayload.properties).toMatchObject({
      keep: 'yes',
      'cyberarchitect.sync_state': null,
      'cyberarchitect.rehome_run_id': null
    });
  });

  it('verifies a restore timeout by service-account readback and OAuth sole-canonical proof before reporting recovery', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      finalContent: 'tampered final content',
      restoreTimeoutAfterMutation: true
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result.errors).toEqual([expect.objectContaining({
      code: 'DRIVE_REHOME_FINAL_HASH_MISMATCH',
      recovered: true
    })]);
    expect(result.files[0].compensation.original_restore).toMatchObject({
      succeeded: true,
      recovered_from_patch_error: true,
      verified_by: 'SERVICE_ACCOUNT_READBACK_AND_OAUTH_NAMESPACE'
    });
    expect(state.old).toMatchObject({ name: 'rehome-target.md', properties: { keep: 'yes' } });
  });

  it('does not report recovery when an old-file restore timeout readback finds a non-unique canonical namespace', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      finalContent: 'tampered final content',
      restoreTimeoutAfterMutation: true,
      foreignCanonicalAfterRestore: true
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result.errors).toEqual([expect.objectContaining({
      code: 'DRIVE_REHOME_FINAL_HASH_MISMATCH',
      recovered: false
    })]);
    expect(result.files[0].compensation.original_restore).toMatchObject({
      attempted: true,
      succeeded: false,
      code: 'DRIVE_REHOME_RESTORE_NAMESPACE_UNVERIFIED',
      canonical_file_ids: expect.arrayContaining(['old-file', 'other-active-file'])
    });
    expect(state.old.properties).toEqual({ keep: 'yes' });
  });

  it('does not restore the original when a foreign canonical file appears during recovery', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      finalContent: 'tampered final content',
      foreignCanonicalDuringRecovery: true
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result.errors).toEqual([expect.objectContaining({
      code: 'DRIVE_REHOME_FINAL_HASH_MISMATCH',
      recovered: false
    })]);
    expect(result.files[0].compensation).toMatchObject({
      replacement_demotion: { succeeded: true },
      original_restore: {
        attempted: true,
        succeeded: false,
        code: 'DRIVE_REHOME_RESTORE_CANONICAL_CONFLICT',
        conflicting_file_ids: ['other-active-file']
      }
    });
    expect(state.old.name).toContain('oauth-rehome-archive-');
    expect(state.old.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-archive-v1');
    expect(state.replacement.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-failed-staging-v1');
    expect(state.calls.some(call => (
      call.method === 'PATCH'
      && call.url.pathname === '/drive/v3/files/old-file'
      && JSON.parse(call.options.body).name === 'rehome-target.md'
    ))).toBe(false);
  });

  it('does not restore the original when the canonical namespace cannot be read during recovery', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      finalContent: 'tampered final content',
      failCanonicalListDuringRecovery: true
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result.errors).toEqual([expect.objectContaining({
      code: 'DRIVE_REHOME_FINAL_HASH_MISMATCH',
      recovered: false
    })]);
    expect(result.files[0].compensation).toMatchObject({
      replacement_demotion: { succeeded: true },
      original_restore: {
        attempted: true,
        succeeded: false,
        code: 'DRIVE_REHOME_RESTORE_NAMESPACE_UNKNOWN'
      }
    });
    expect(state.old.name).toContain('oauth-rehome-archive-');
    expect(state.calls.some(call => (
      call.method === 'PATCH'
      && call.url.pathname === '/drive/v3/files/old-file'
      && JSON.parse(call.options.body).name === 'rehome-target.md'
    ))).toBe(false);
  });

  it('reads back and restores an archive when Drive returns mismatched archive metadata', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({ localContent: local.rawContent, archiveResponseMismatch: true });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result.errors).toEqual([expect.objectContaining({ code: 'DRIVE_REHOME_ARCHIVE_INVALID', recovered: true })]);
    expect(state.old.name).toBe('rehome-target.md');
    expect(state.old.properties).toEqual({ keep: 'yes' });
    expect(state.replacement.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-failed-staging-v1');
    expect(state.calls.some(call => (
      call.method === 'PATCH' && call.url.pathname === '/drive/v3/files/oauth-new-file'
      && JSON.parse(call.options.body).name === 'rehome-target.md'
    ))).toBe(false);
  });

  it('reads back and restores the original if an archive PATCH times out after Drive applied it', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({ localContent: local.rawContent, archiveTimeoutAfterMutation: true });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result.errors).toEqual([expect.objectContaining({ code: 'DRIVE_REHOME_ARCHIVE_FAILED', recovered: true })]);
    expect(result.files[0].compensation).toMatchObject({
      archive_readback: { state: 'oauth-rehome-archive-v1' },
      original_restore: { succeeded: true }
    });
    expect(state.old.name).toBe('rehome-target.md');
    expect(state.old.properties).toEqual({ keep: 'yes' });
    expect(state.replacement.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-failed-staging-v1');
  });

  it('fails closed when the archived original moves parent before OAuth finalization', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      moveOldParentAfterArchive: true
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result.errors).toEqual([expect.objectContaining({
      code: 'CLOUD_CHANGED_SINCE_ARCHIVE',
      recovered: false,
      details: expect.objectContaining({ validation_reason: 'PARENT_MISMATCH' })
    })]);
    expect(result.files[0].compensation).toMatchObject({
      original_restore: { attempted: true, succeeded: false, code: 'PARENT_MISMATCH' }
    });
    expect(state.old.parentId).toBe('parent-2');
    expect(state.old.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-archive-v1');
    expect(state.replacement.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-staging-v1');
    expect(state.calls.some(call => (
      call.method === 'PATCH'
      && call.url.pathname === '/drive/v3/files/oauth-new-file'
      && JSON.parse(call.options.body).name === 'rehome-target.md'
    ))).toBe(false);
  });

  it('refuses finalization when another active canonical file appears and retains only safe artifacts', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({ localContent: local.rawContent, canonicalConflict: true });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result.errors).toEqual([expect.objectContaining({ code: 'DRIVE_REHOME_CANONICAL_NAME_CONFLICT' })]);
    expect(result.files[0].compensation).toMatchObject({
      original_restore: { attempted: false, code: 'ACTIVE_CANONICAL_CONFLICT' },
      conflicting_file_ids: ['other-active-file']
    });
    expect(state.old.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-archive-v1');
    expect(state.replacement.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-staging-v1');
    expect(state.calls.some(call => (
      call.method === 'PATCH' && call.url.pathname === '/drive/v3/files/oauth-new-file'
      && JSON.parse(call.options.body).name === 'rehome-target.md'
    ))).toBe(false);
  });

  it('treats a marker-tagged exact canonical filename as a namespace conflict', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      markedCanonicalConflict: true
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result.errors).toEqual([expect.objectContaining({ code: 'DRIVE_REHOME_CANONICAL_NAME_CONFLICT' })]);
    expect(result.files[0].compensation).toMatchObject({
      conflicting_file_ids: ['marked-canonical-file']
    });
    expect(state.replacement.name).not.toBe('rehome-target.md');
  });

  it('requires the finalized OAuth replacement to be the sole active canonical file', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      foreignCanonicalAfterFinalization: true
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result.errors).toEqual([expect.objectContaining({
      code: 'DRIVE_REHOME_FINAL_CANONICAL_NAMESPACE_UNVERIFIED',
      recovered: false,
      details: expect.objectContaining({
        canonical_file_ids: expect.arrayContaining(['oauth-new-file', 'other-active-file'])
      })
    })]);
    expect(result.files[0].compensation).toMatchObject({
      replacement_demotion: { succeeded: true },
      original_restore: {
        attempted: true,
        succeeded: false,
        code: 'DRIVE_REHOME_RESTORE_CANONICAL_CONFLICT',
        conflicting_file_ids: ['other-active-file']
      }
    });
    expect(state.old.name).toContain('oauth-rehome-archive-');
    expect(state.replacement.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-failed-staging-v1');
    expect(state.calls.some(call => (
      call.method === 'PATCH'
      && call.url.pathname === '/drive/v3/files/old-file'
      && JSON.parse(call.options.body).name === 'rehome-target.md'
    ))).toBe(false);
    // A non-empty, conflicting exact-name result must never enter the retry
    // path; it is an immediate safety failure.
    expect(state.finalCanonicalListCalls).toBe(1);
  });

  it('retries only a temporarily empty final canonical search after direct OAuth metadata and hash verification', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      emptyFinalCanonicalListResponses: 1
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result).toMatchObject({ rehomed: 1, errors: [] });
    expect(state.finalCanonicalListCalls).toBe(2);
    const finalPatchIndex = state.calls.findIndex(call => (
      call.method === 'PATCH'
      && call.url.pathname === '/drive/v3/files/oauth-new-file'
      && JSON.parse(call.options.body).name === 'rehome-target.md'
    ));
    const directFinalMetadataReadIndex = state.calls.findIndex((call, index) => (
      index > finalPatchIndex
      && call.method === 'GET'
      && call.url.pathname === '/drive/v3/files/oauth-new-file'
      && call.url.searchParams.get('alt') !== 'media'
    ));
    const directFinalContentReadIndex = state.calls.findIndex((call, index) => (
      index > finalPatchIndex
      && call.method === 'GET'
      && call.url.pathname === '/drive/v3/files/oauth-new-file'
      && call.url.searchParams.get('alt') === 'media'
    ));
    const firstFinalListIndex = state.calls.findIndex((call, index) => (
      index > finalPatchIndex
      && call.method === 'GET'
      && call.url.pathname === '/drive/v3/files'
    ));
    expect(directFinalMetadataReadIndex).toBeGreaterThan(finalPatchIndex);
    expect(directFinalContentReadIndex).toBeGreaterThan(directFinalMetadataReadIndex);
    expect(firstFinalListIndex).toBeGreaterThan(directFinalContentReadIndex);
  });

  it('fails closed and restores the original when every bounded final canonical list retry is empty', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      emptyFinalCanonicalListResponses: Number.POSITIVE_INFINITY
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result.errors).toEqual([expect.objectContaining({
      code: 'DRIVE_REHOME_FINAL_CANONICAL_NAMESPACE_UNVERIFIED',
      recovered: true,
      details: expect.objectContaining({ canonical_file_ids: [], empty_list_retries: 5 })
    })]);
    expect(state.finalCanonicalListCalls).toBe(6);
    expect(state.old).toMatchObject({ name: 'rehome-target.md', properties: { keep: 'yes' } });
    expect(state.replacement.properties['cyberarchitect.sync_state']).toBe('oauth-rehome-failed-staging-v1');
  });

  it('fails closed without retrying when Drive marks the final canonical search incomplete', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({
      localContent: local.rawContent,
      incompleteFinalCanonicalList: true
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result.errors).toEqual([expect.objectContaining({
      code: 'DRIVE_REHOME_FINAL_CANONICAL_CHECK_FAILED',
      recovered: true,
      details: expect.objectContaining({ cause: 'DRIVE_REHOME_CANONICAL_CONFLICT_CHECK_INCOMPLETE' })
    })]);
    expect(state.finalCanonicalListCalls).toBe(1);
    const finalCanonicalQuery = state.calls.find(call => (
      call.method === 'GET'
      && call.url.pathname === '/drive/v3/files'
      && call.url.searchParams.get('q')?.includes("name = 'rehome-target.md'")
      && call.url.searchParams.get('fields')?.includes('incompleteSearch')
    ));
    expect(finalCanonicalQuery).toBeDefined();
  });

  it('refuses an apply when a fresh remote fingerprint no longer matches the approved preview', async () => {
    const cloud = cloudDocument();
    arrange({ cloudDocuments: [cloud] });
    const { preview, fetchMock, state } = await previewWithDriveMock({ localContent: localDocument().rawContent });
    fetchMock.mockClear();
    cloud.version = '8';
    state.old.version = 8;

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(state.calls.some(call => call.method === 'POST' || call.method === 'PATCH')).toBe(false);
    expect(result).toMatchObject({ plan_drift: true, rehomed: 0, preflight_passed: false });
    expect(result.errors).toEqual([expect.objectContaining({ code: 'DRIVE_REHOME_PLAN_DRIFT' })]);
  });

  it('fails before staging when the original moves after the fresh plan is built', async () => {
    const local = localDocument();
    arrange({ localDocuments: [local] });
    const { preview, state } = await previewWithDriveMock({ localContent: local.rawContent });
    // The fresh apply planner performs two owner metadata reads; move the file
    // immediately after them, before the per-item rehome revalidation begins.
    state.moveOldParentOnServiceMetadataRead = state.serviceMetadataReads + 2;

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 1
    });

    expect(result.errors).toEqual([expect.objectContaining({ code: 'CLOUD_CHANGED_SINCE_PREVIEW' })]);
    expect(state.old.parentId).toBe('parent-2');
    expect(state.calls.some(call => (
      call.method === 'POST' && call.url.pathname === '/upload/drive/v3/files'
    ))).toBe(false);
  });

  it('stops the batch at the first failed rehome and never starts the next file', async () => {
    const firstCloud = cloudDocument();
    const secondCloud = cloudDocument({
      fileId: 'gdrive_second-file',
      fileName: 'second.md',
      folderPath: 'knowledge/Second',
      parents: ['parent-2']
    });
    const firstLocal = localDocument();
    const secondLocal = localDocument({
      fileId: 'drive_file_second',
      fileName: 'second.md',
      folderPath: 'knowledge/Second',
      rawContent: markdown({ slug: 'second', title: 'Second' })
    });
    arrange({ cloudDocuments: [firstCloud, secondCloud], localDocuments: [firstLocal, secondLocal] });
    const { preview, state } = await previewWithDriveMock({
      localContent: firstLocal.rawContent,
      failCreate: true,
      additionalServiceFiles: [{
        id: 'second-file',
        name: 'second.md',
        parentId: 'parent-2'
      }]
    });

    const result = await driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun: false,
      expectedPlanDigest: preview.plan_digest,
      expectedRehomeCount: 2
    });

    expect(result).toMatchObject({ rehomed: 0, aborted_after_failure: true });
    expect(state.calls.filter(call => call.method === 'POST')).toHaveLength(1);
    expect(result.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'second.md', status: 'NOT_ATTEMPTED_AFTER_FAILURE' })
    ]));
  });
});
