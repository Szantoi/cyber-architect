import { Router } from 'express';
import { logger } from '../logger.js';
import { authMiddleware } from '../security/auth.js';
import driveSyncService from '../services/driveSyncService.js';

export const syncRouter = Router();

// 1. Get Drive Sync Status (Aliases: /admin/drive/status, /sync/drive/status, /drive/status)
const getStatusHandler = (req, res) => {
  try {
    const status = driveSyncService.getStatus();
    res.json(status);
  } catch (err) {
    logger.error('Drive status check failed', err);
    res.status(500).json({ error: 'DRIVE_STATUS_FAILED' });
  }
};
syncRouter.get('/admin/drive/status', authMiddleware, getStatusHandler);
syncRouter.get('/sync/drive/status', authMiddleware, getStatusHandler);
syncRouter.get('/drive/status', authMiddleware, getStatusHandler);

// 2. Get Drive Auth URL (Aliases: /admin/drive/auth-url, /sync/drive/auth-url, /drive/auth-url)
const getAuthUrlHandler = (req, res) => {
  try {
    const authUrl = driveSyncService.getAuthUrl();
    res.json({ success: true, auth_url: authUrl, authUrl });
  } catch (err) {
    logger.error('Failed to generate Drive auth URL', err);
    res.status(500).json({ error: 'AUTH_URL_GENERATION_FAILED', message: err.message });
  }
};
syncRouter.get('/admin/drive/auth-url', authMiddleware, getAuthUrlHandler);
syncRouter.get('/sync/drive/auth-url', authMiddleware, getAuthUrlHandler);
syncRouter.get('/drive/auth-url', authMiddleware, getAuthUrlHandler);

// 3. Drive OAuth2 Callback
syncRouter.get('/admin/drive/oauth2callback', async (req, res) => {
  try {
    const { code, error } = req.query;
    if (error) {
      return res.status(400).send(`
        <html>
          <body style="background:#090d1d;color:#FF00FF;font-family:monospace;padding:40px;text-align:center;">
            <h2>[GOOGLE_AUTH_FAILED]</h2>
            <p>${error}</p>
          </body>
        </html>
      `);
    }

    await driveSyncService.exchangeCodeForTokens(code);
    logger.success('[DRIVE_OAUTH] Google Drive OAuth authentication completed successfully');

    res.send(`
      <html>
        <head><title>Google Drive Csatlakoztatva // Cyber-Architect</title></head>
        <body style="background:#090d1d;color:#00FFFF;font-family:monospace;padding:50px;text-align:center;">
          <h1 style="color:#80FF00;font-size:24px;">✓ GOOGLE DRIVE SIKERESEN CSATLAKOZTATVA</h1>
          <p style="color:#cbd5e1;font-size:14px;margin-top:20px;">A hozzáférési tokenek elmentve. Ez az ablak automatikusan bezáródik...</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'GOOGLE_DRIVE_AUTH_SUCCESS' }, '*');
              setTimeout(() => window.close(), 1800);
            } else {
              setTimeout(() => window.location.href = 'http://localhost:5173/admin', 1800);
            }
          </script>
        </body>
      </html>
    `);
  } catch (err) {
    logger.error('OAuth callback failed', err);
    res.status(500).send(`
      <html>
        <body style="background:#090d1d;color:#FF00FF;font-family:monospace;padding:40px;text-align:center;">
          <h2>[OAUTH_EXCHANGE_ERROR]</h2>
          <p>${err.message}</p>
        </body>
      </html>
    `);
  }
});

// 4. Trigger Drive Sync (Aliases: /admin/drive/sync, /sync/drive, /sync/drive/sync, /drive/sync)
const postSyncHandler = async (req, res) => {
  try {
    logger.info('[DRIVE_SYNC] Synchronization requested via Admin API');
    const results = await driveSyncService.syncAll('ADMIN_DASHBOARD', { pushFirst: true });
    logger.success(`[DRIVE_SYNC] Complete: ${results.synced} files synced (${results.created} new, ${results.updated} updated)`);
    res.json({ success: true, report: results, ...results });
  } catch (err) {
    logger.error('Drive sync failed', err);
    res.status(500).json({ error: 'DRIVE_SYNC_FAILED', message: err.message });
  }
};
syncRouter.post('/admin/drive/sync', authMiddleware, postSyncHandler);
syncRouter.post('/sync/drive', authMiddleware, postSyncHandler);
syncRouter.post('/sync/drive/sync', authMiddleware, postSyncHandler);
syncRouter.post('/drive/sync', authMiddleware, postSyncHandler);
