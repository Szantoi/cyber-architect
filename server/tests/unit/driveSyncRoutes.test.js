import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncRouter } from '../../routes/sync.routes.js';
import { driveSyncService } from '../../services/driveSyncService.js';
import { localVaultService } from '../../services/localVaultService.js';
import { generateAdminToken } from '../../security/auth.js';

const app = express();
app.use(express.json());
app.use('/api', syncRouter);

let adminToken;

beforeEach(() => {
  adminToken = generateAdminToken({ role: 'OVERSEER_ADMIN' });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function postVaultSync(body) {
  return request(app)
    .post('/api/admin/vault/sync')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);
}

function postLegacyDriveSync(body) {
  return request(app)
    .post('/api/admin/drive/sync')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);
}

function postEmptyRepair(body) {
  return request(app)
    .post('/api/admin/drive/repair-empty')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);
}

function postOAuthRehome(body) {
  return request(app)
    .post('/api/admin/drive/rehome-empty-oauth')
    .set('Authorization', `Bearer ${adminToken}`)
    .send(body);
}

function getVaultDocument(slug, token = adminToken) {
  return request(app)
    .get(`/api/admin/vault/documents/${encodeURIComponent(slug)}`)
    .set('Authorization', `Bearer ${token}`);
}

function putVaultDocument(slug, body, token = adminToken) {
  return request(app)
    .put(`/api/admin/vault/documents/${encodeURIComponent(slug)}`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('Vault and Drive synchronization route safety', () => {
  it('serves the canonical Vault editor only to an overseer administrator', async () => {
    const slug = 'inline-vault-route-test';
    const viewerToken = generateAdminToken({ role: 'VIEWER' });
    const editable = {
      slug,
      source_path: 'Content/01_Test/inline-vault-route-test/index.md',
      content: '---\ntitle: Test\nslug: inline-vault-route-test\npresentation_profile: knowledge\n---\n\n# Test\n',
      revision: 'a'.repeat(64)
    };
    const readSpy = vi.spyOn(localVaultService, 'getEditableDocument').mockReturnValue(editable);
    const updateSpy = vi.spyOn(localVaultService, 'updateEditableDocument').mockReturnValue({
      document: { ...editable, content: `${editable.content}\nFrissítve.`, revision: 'b'.repeat(64) },
      sync: { errors: [] }
    });

    const [anonymous, viewer, read, update] = await Promise.all([
      request(app).get(`/api/admin/vault/documents/${slug}`),
      getVaultDocument(slug, viewerToken),
      getVaultDocument(slug),
      putVaultDocument(slug, {
        content: '# Frissített',
        revision: 'a'.repeat(64)
      })
    ]);

    expect(anonymous.status).toBe(401);
    expect(viewer.status).toBe(403);
    expect(viewer.body.code).toBe('ADMIN_ROLE_REQUIRED');
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ success: true, source_of_truth: 'LOCAL_VAULT', document: editable });
    expect(update.status).toBe(200);
    expect(update.body).toMatchObject({ success: true, source_of_truth: 'LOCAL_VAULT' });
    expect(readSpy).toHaveBeenCalledWith(slug);
    expect(updateSpy).toHaveBeenCalledWith({
      slug,
      content: '# Frissített',
      revision: 'a'.repeat(64),
      actor: 'ADMIN_VAULT_EDITOR'
    });
  });

  it('returns the Vault validation error for malformed editor saves', async () => {
    const error = new Error('A mentéshez érvényes dokumentumverzió szükséges.');
    error.code = 'VAULT_EDITOR_REVISION_REQUIRED';
    const updateSpy = vi.spyOn(localVaultService, 'updateEditableDocument').mockImplementation(() => {
      throw error;
    });
    const response = await putVaultDocument('inline-vault-validation-test', {
      content: '# Hiányzó verzió'
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'VAULT_EDITOR_REVISION_REQUIRED',
      source_of_truth: 'LOCAL_VAULT'
    });
    expect(updateSpy).toHaveBeenCalledOnce();
  });

  it('applies an explicitly confirmed canonical Vault projection refresh', async () => {
    const syncSpy = vi.spyOn(localVaultService, 'sync').mockReturnValue({
      processed: 2,
      created: 1,
      updated: 1,
      errors: []
    });

    const response = await postVaultSync({
      dry_run: false,
      confirm: 'APPLY_CANONICAL_VAULT_SYNC'
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      dry_run: false,
      source_of_truth: 'LOCAL_VAULT',
      projection_mode: 'SQLITE_RAG_FROM_VAULT'
    });
    expect(syncSpy).toHaveBeenCalledWith({ actor: 'ADMIN_VAULT_SYNC_APPLY', dryRun: false });
  });

  it('supports a write-free preview and rejects ambiguous flags', async () => {
    const syncSpy = vi.spyOn(localVaultService, 'sync').mockReturnValue({
      processed: 1,
      created: 0,
      updated: 0,
      errors: []
    });

    const previewResponse = await postVaultSync({ dry_run: true });
    const invalidResponse = await postVaultSync({ dry_run: 'yes' });

    expect(previewResponse.status).toBe(200);
    expect(previewResponse.body.dry_run).toBe(true);
    expect(syncSpy).toHaveBeenCalledWith({
      actor: 'ADMIN_VAULT_SYNC_PREVIEW',
      dryRun: true
    });
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error).toBe('INVALID_SYNC_REQUEST');
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });

  it('defaults to preview and requires an exact confirmation before DB writes', async () => {
    const syncSpy = vi.spyOn(localVaultService, 'sync').mockReturnValue({
      processed: 1,
      created: 0,
      updated: 0,
      errors: []
    });

    const preview = await postVaultSync({});
    const rejected = await postVaultSync({ dry_run: false });

    expect(preview.status).toBe(200);
    expect(preview.body.dry_run).toBe(true);
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toBe('VAULT_SYNC_CONFIRMATION_REQUIRED');
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith({
      actor: 'ADMIN_VAULT_SYNC_PREVIEW',
      dryRun: true
    });
  });

  it('distinguishes partial reconciliation from a complete source failure', async () => {
    const syncSpy = vi.spyOn(localVaultService, 'sync');
    syncSpy.mockReturnValueOnce({
      processed: 1,
      created: 1,
      updated: 0,
      errors: [{ file: 'KnowledgeBase', error: 'VAULT_DOCUMENT_INVALID' }]
    });
    syncSpy.mockReturnValueOnce({
      processed: 0,
      created: 0,
      updated: 0,
      errors: [{ file: 'KnowledgeBase', error: 'VAULT_DOCUMENT_INVALID' }]
    });

    const partialResponse = await postVaultSync({});
    const failureResponse = await postVaultSync({});

    expect(partialResponse.status).toBe(200);
    expect(partialResponse.body).toMatchObject({ success: false, partial: true });
    expect(failureResponse.status).toBe(502);
    expect(failureResponse.body).toMatchObject({ success: false, partial: false });
  });

  it('rejects legacy Drive pull endpoints before they can call the cloud importer', async () => {
    const cloudImporter = vi.spyOn(driveSyncService, 'syncAll');

    const response = await postLegacyDriveSync({
      dry_run: false,
      confirm: 'APPLY_DRIVE_PULL_TO_DATABASE'
    });

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      error: 'CLOUD_PULL_DISABLED',
      source_of_truth: 'LOCAL_VAULT',
      vault_sync_endpoint: '/api/admin/vault/sync'
    });
    expect(cloudImporter).not.toHaveBeenCalled();
  });

  it('previews empty-file repair by default without authorizing Drive writes', async () => {
    const repairSpy = vi
      .spyOn(driveSyncService, 'repairEmptyCloudFilesFromLocal')
      .mockResolvedValue({ would_repair: 2, repaired: 0, errors: [] });

    const response = await postEmptyRepair({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      partial: false,
      dry_run: true,
      operation: 'EMPTY_DRIVE_REPAIR'
    });
    expect(repairSpy).toHaveBeenCalledWith({ dryRun: true });
  });

  it('requires an exact confirmation phrase before repairing Drive files', async () => {
    const repairSpy = vi
      .spyOn(driveSyncService, 'repairEmptyCloudFilesFromLocal')
      .mockResolvedValue({ would_repair: 0, repaired: 2, errors: [] });

    const rejected = await postEmptyRepair({ dry_run: false });
    const applied = await postEmptyRepair({
      dry_run: false,
      confirm: 'REPAIR_EMPTY_DRIVE_FILES'
    });

    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toBe('DRIVE_REPAIR_CONFIRMATION_REQUIRED');
    expect(applied.status).toBe(200);
    expect(applied.body).toMatchObject({ success: true, dry_run: false });
    expect(repairSpy).toHaveBeenCalledTimes(1);
    expect(repairSpy).toHaveBeenCalledWith({ dryRun: false });
  });

  it('returns a gateway failure when every attempted Drive repair write fails', async () => {
    vi.spyOn(driveSyncService, 'repairEmptyCloudFilesFromLocal').mockResolvedValue({
      matched: 25,
      eligible: 25,
      would_repair: 0,
      repaired: 0,
      errors: [{ code: 'DRIVE_REPAIR_UPDATE_FAILED', fileName: 'first.md' }]
    });

    const response = await postEmptyRepair({
      dry_run: false,
      confirm: 'REPAIR_EMPTY_DRIVE_FILES'
    });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ success: false, partial: false });
  });

  it('previews OAuth ownership rehome by default without an apply confirmation', async () => {
    const rehomeSpy = vi.spyOn(driveSyncService, 'rehomeEmptyServiceAccountFilesToOAuth').mockResolvedValue({
      would_rehome: 22,
      expected_rehome_count: 22,
      plan_digest: 'a'.repeat(64),
      errors: []
    });

    const response = await postOAuthRehome({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      partial: false,
      dry_run: true,
      operation: 'OAUTH_EMPTY_DRIVE_REHOME'
    });
    expect(rehomeSpy).toHaveBeenCalledWith({
      dryRun: true,
      expectedPlanDigest: null,
      expectedRehomeCount: null
    });
  });

  it('requires an exact confirmation plus the preview plan digest and count before OAuth rehome', async () => {
    const rehomeSpy = vi.spyOn(driveSyncService, 'rehomeEmptyServiceAccountFilesToOAuth').mockResolvedValue({
      rehomed: 1,
      errors: []
    });
    const confirmation = 'REHOME_EMPTY_SERVICE_ACCOUNT_FILES_TO_OAUTH_USER';
    const digest = 'b'.repeat(64);

    const noConfirmation = await postOAuthRehome({ dry_run: false });
    const noPlan = await postOAuthRehome({ dry_run: false, confirm: confirmation });
    const applied = await postOAuthRehome({
      dry_run: false,
      confirm: confirmation,
      plan_digest: digest,
      expected_rehome_count: 22
    });

    expect(noConfirmation.status).toBe(400);
    expect(noConfirmation.body.error).toBe('DRIVE_REHOME_CONFIRMATION_REQUIRED');
    expect(noPlan.status).toBe(400);
    expect(noPlan.body.error).toBe('DRIVE_REHOME_PLAN_REQUIRED');
    expect(applied.status).toBe(200);
    expect(rehomeSpy).toHaveBeenCalledTimes(1);
    expect(rehomeSpy).toHaveBeenCalledWith({
      dryRun: false,
      expectedPlanDigest: digest,
      expectedRehomeCount: 22
    });
  });

  it('accepts a confirmed zero-count verified-resume no-op without reporting a gateway failure', async () => {
    const rehomeSpy = vi.spyOn(driveSyncService, 'rehomeEmptyServiceAccountFilesToOAuth').mockResolvedValue({
      rehomed: 0,
      already_rehomed: 22,
      no_op: true,
      resume_only: true,
      database_followup_required: true,
      errors: []
    });
    const digest = 'e'.repeat(64);

    const response = await postOAuthRehome({
      dry_run: false,
      confirm: 'REHOME_EMPTY_SERVICE_ACCOUNT_FILES_TO_OAUTH_USER',
      plan_digest: digest,
      expected_rehome_count: 0
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      partial: false,
      dry_run: false,
      no_op: true,
      already_rehomed: 22,
      database_followup_required: true
    });
    expect(rehomeSpy).toHaveBeenCalledWith({
      dryRun: false,
      expectedPlanDigest: digest,
      expectedRehomeCount: 0
    });
  });

  it('returns a gateway failure when every OAuth rehome fails before a mapping is completed', async () => {
    vi.spyOn(driveSyncService, 'rehomeEmptyServiceAccountFilesToOAuth').mockResolvedValue({
      rehomed: 0,
      errors: [{ code: 'DRIVE_REHOME_OAUTH_CREATE_FAILED' }]
    });

    const response = await postOAuthRehome({
      dry_run: false,
      confirm: 'REHOME_EMPTY_SERVICE_ACCOUNT_FILES_TO_OAUTH_USER',
      plan_digest: 'c'.repeat(64),
      expected_rehome_count: 22
    });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ success: false, partial: false });
  });

  it('requires confirmation before it starts a Vault projection mutation', async () => {
    const syncSpy = vi.spyOn(localVaultService, 'sync');

    const response = await postVaultSync({
      dry_run: false,
      confirm: 'WRONG_CONFIRMATION'
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ error: 'VAULT_SYNC_CONFIRMATION_REQUIRED' });
    expect(syncSpy).not.toHaveBeenCalled();
  });
});
