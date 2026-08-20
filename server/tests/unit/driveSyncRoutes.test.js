import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncRouter } from '../../routes/sync.routes.js';
import { driveSyncService } from '../../services/driveSyncService.js';
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

function postSync(body) {
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

describe('Drive synchronization route safety', () => {
  it('runs an explicitly confirmed pull-only reconciliation', async () => {
    const syncSpy = vi.spyOn(driveSyncService, 'syncAll').mockResolvedValue({
      processed: 2,
      synced: 2,
      created: 1,
      updated: 1,
      errors: []
    });

    const response = await postSync({
      dry_run: false,
      confirm: 'APPLY_DRIVE_PULL_TO_DATABASE'
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, partial: false, dry_run: false });
    expect(syncSpy).toHaveBeenCalledWith('ADMIN_DASHBOARD', {
      dryRun: false,
      pushFirst: false
    });
  });

  it('supports a write-free preview and rejects ambiguous flags', async () => {
    const syncSpy = vi.spyOn(driveSyncService, 'syncAll').mockResolvedValue({
      processed: 1,
      synced: 0,
      created: 0,
      updated: 0,
      errors: []
    });

    const previewResponse = await postSync({ dry_run: true });
    const invalidResponse = await postSync({ dry_run: 'yes' });

    expect(previewResponse.status).toBe(200);
    expect(previewResponse.body.dry_run).toBe(true);
    expect(syncSpy).toHaveBeenCalledWith('ADMIN_DASHBOARD', {
      dryRun: true,
      pushFirst: false
    });
    expect(invalidResponse.status).toBe(400);
    expect(invalidResponse.body.error).toBe('INVALID_SYNC_REQUEST');
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });

  it('defaults to preview and requires an exact confirmation before DB writes', async () => {
    const syncSpy = vi.spyOn(driveSyncService, 'syncAll').mockResolvedValue({
      processed: 1,
      created: 0,
      updated: 0,
      errors: []
    });

    const preview = await postSync({});
    const rejected = await postSync({ dry_run: false });

    expect(preview.status).toBe(200);
    expect(preview.body.dry_run).toBe(true);
    expect(rejected.status).toBe(400);
    expect(rejected.body.error).toBe('DRIVE_SYNC_CONFIRMATION_REQUIRED');
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith('ADMIN_DASHBOARD', {
      dryRun: true,
      pushFirst: false
    });
  });

  it('distinguishes partial reconciliation from a complete source failure', async () => {
    const syncSpy = vi.spyOn(driveSyncService, 'syncAll');
    syncSpy.mockResolvedValueOnce({
      processed: 1,
      synced: 1,
      created: 1,
      updated: 0,
      errors: [{ file: 'Blog', error: 'DRIVE_API_ERROR' }]
    });
    syncSpy.mockResolvedValueOnce({
      processed: 0,
      synced: 0,
      created: 0,
      updated: 0,
      errors: [{ file: 'Google Drive', error: 'DRIVE_API_ERROR' }]
    });

    const partialResponse = await postSync({});
    const failureResponse = await postSync({});

    expect(partialResponse.status).toBe(200);
    expect(partialResponse.body).toMatchObject({ success: false, partial: true });
    expect(failureResponse.status).toBe(502);
    expect(failureResponse.body).toMatchObject({ success: false, partial: false });
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

  it('rejects a concurrent Drive mutation while an apply operation is active', async () => {
    let resolveSync;
    const syncSpy = vi.spyOn(driveSyncService, 'syncAll').mockImplementationOnce(() => (
      new Promise(resolve => {
        resolveSync = resolve;
      })
    ));
    const repairSpy = vi.spyOn(driveSyncService, 'repairEmptyCloudFilesFromLocal');

    const firstRequest = postSync({
      dry_run: false,
      confirm: 'APPLY_DRIVE_PULL_TO_DATABASE'
    }).then(response => response);
    await vi.waitFor(() => expect(syncSpy).toHaveBeenCalledTimes(1));

    const concurrentResponse = await postEmptyRepair({
      dry_run: false,
      confirm: 'REPAIR_EMPTY_DRIVE_FILES'
    });
    expect(concurrentResponse.status).toBe(409);
    expect(concurrentResponse.body).toMatchObject({
      error: 'DRIVE_OPERATION_IN_PROGRESS',
      active_operation: 'DRIVE_PULL_TO_DATABASE'
    });
    expect(repairSpy).not.toHaveBeenCalled();

    resolveSync({ processed: 1, created: 1, updated: 0, errors: [] });
    expect((await firstRequest).status).toBe(200);
  });
});
