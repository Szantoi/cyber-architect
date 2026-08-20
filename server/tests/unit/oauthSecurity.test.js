import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncRouter } from '../../routes/sync.routes.js';
import { driveSyncService } from '../../services/driveSyncService.js';

const app = express();
app.use('/api', syncRouter);

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Google Drive OAuth state protection', () => {
  it('generates random single-use state values bound to the return origin', () => {
    const firstState = driveSyncService.createOAuthState('http://localhost:5173');
    const secondState = driveSyncService.createOAuthState('https://www.ai.szantoi.hu');

    expect(firstState).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(secondState).not.toBe(firstState);
    expect(driveSyncService.consumeOAuthState(firstState)).toEqual({
      returnOrigin: 'http://localhost:5173'
    });
    expect(driveSyncService.consumeOAuthState(firstState)).toBeNull();
  });

  it('rejects expired and malformed state values', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T10:00:00.000Z'));

    const state = driveSyncService.createOAuthState('http://localhost:5173');
    vi.advanceTimersByTime((10 * 60 * 1000) + 1);

    expect(driveSyncService.consumeOAuthState(state)).toBeNull();
    expect(driveSyncService.consumeOAuthState('<invalid>')).toBeNull();
  });

  it('includes the generated state in the Google authorization URL', () => {
    vi.spyOn(driveSyncService, 'getOAuthClient').mockReturnValue({
      client_id: 'test-client-id',
      redirect_uri: 'http://localhost:3001/api/admin/drive/oauth2callback'
    });

    const authUrl = new URL(driveSyncService.getAuthUrl({
      returnOrigin: 'http://localhost:5173'
    }));
    const state = authUrl.searchParams.get('state');

    expect(authUrl.origin).toBe('https://accounts.google.com');
    expect(state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(driveSyncService.consumeOAuthState(state)).toEqual({
      returnOrigin: 'http://localhost:5173'
    });
  });

  it('escapes provider errors and emits a script-free callback page', async () => {
    const state = driveSyncService.createOAuthState('http://localhost:5173');
    const providerError = '<img src=x onerror=alert(1)>';

    const response = await request(app)
      .get('/api/admin/drive/oauth2callback')
      .query({ state, error: providerError });

    expect(response.status).toBe(400);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.text).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(response.text).not.toContain(providerError);
    expect(response.text).not.toContain('<script');
    expect(response.text).toContain('href="http://localhost:5173/admin"');
  });

  it('rejects missing, unknown, and replayed callback state values', async () => {
    const missingStateResponse = await request(app)
      .get('/api/admin/drive/oauth2callback');

    expect(missingStateResponse.status).toBe(400);
    expect(missingStateResponse.text).toContain('[OAUTH_STATE_INVALID]');

    const state = driveSyncService.createOAuthState('http://localhost:5173');
    const firstResponse = await request(app)
      .get('/api/admin/drive/oauth2callback')
      .query({ state, error: 'access_denied' });
    const replayResponse = await request(app)
      .get('/api/admin/drive/oauth2callback')
      .query({ state, error: 'access_denied' });

    expect(firstResponse.status).toBe(400);
    expect(firstResponse.text).toContain('[GOOGLE_AUTH_FAILED]');
    expect(replayResponse.status).toBe(400);
    expect(replayResponse.text).toContain('[OAUTH_STATE_INVALID]');
  });
});
