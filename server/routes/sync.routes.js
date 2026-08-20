import { Router } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { authMiddleware } from '../security/auth.js';
import { driveSyncService } from '../services/driveSyncService.js';

export const syncRouter = Router();
const DRIVE_PULL_CONFIRMATION = 'APPLY_DRIVE_PULL_TO_DATABASE';
let activeDriveMutation = null;

async function runExclusiveDriveMutation(operation, callback) {
  if (activeDriveMutation) {
    const error = new Error('Another Drive mutation is already in progress.');
    error.code = 'DRIVE_OPERATION_IN_PROGRESS';
    error.activeOperation = activeDriveMutation;
    throw error;
  }

  activeDriveMutation = operation;
  try {
    return await callback();
  } finally {
    activeDriveMutation = null;
  }
}

function getSingleQueryValue(value) {
  return typeof value === 'string' ? value : null;
}

function parseBooleanFlag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new TypeError('INVALID_BOOLEAN_FLAG');
}

function normalizeHttpOrigin(value) {
  if (typeof value !== 'string' || !value) return null;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

function resolveOAuthReturnOrigin(candidate) {
  const siteOrigin = normalizeHttpOrigin(config.siteUrl);
  const allowedOrigins = new Set(
    [...config.allowedOrigins, siteOrigin]
      .map(normalizeHttpOrigin)
      .filter(Boolean)
  );
  const candidateOrigin = normalizeHttpOrigin(candidate);

  if (candidateOrigin && allowedOrigins.has(candidateOrigin)) return candidateOrigin;
  return siteOrigin || allowedOrigins.values().next().value || null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function sendOAuthPage(res, { status, title, heading, message, returnUrl = null }) {
  const returnLink = returnUrl
    ? `<p><a href="${escapeHtml(returnUrl)}" rel="noopener noreferrer">Visszatérés az admin felületre</a></p>`
    : '';

  return res
    .status(status)
    .set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer'
    })
    .type('html')
    .send(`<!doctype html>
<html lang="hu">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(heading)}</h1>
      <p>${escapeHtml(message)}</p>
      ${returnLink}
      <p>Az ablak biztonságosan bezárható.</p>
    </main>
  </body>
</html>`);
}

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
    const returnOrigin = resolveOAuthReturnOrigin(req.get('origin') || req.get('referer'));
    const authUrl = driveSyncService.getAuthUrl({ returnOrigin });
    res.json({ success: true, auth_url: authUrl, authUrl });
  } catch (err) {
    logger.error('Failed to generate Drive auth URL', err);
    res.status(500).json({ error: 'AUTH_URL_GENERATION_FAILED' });
  }
};
syncRouter.get('/admin/drive/auth-url', authMiddleware, getAuthUrlHandler);
syncRouter.get('/sync/drive/auth-url', authMiddleware, getAuthUrlHandler);
syncRouter.get('/drive/auth-url', authMiddleware, getAuthUrlHandler);

// 3. Drive OAuth2 Callback
syncRouter.get('/admin/drive/oauth2callback', async (req, res) => {
  const fallbackOrigin = resolveOAuthReturnOrigin(null);
  const fallbackReturnUrl = fallbackOrigin ? new URL('/admin', fallbackOrigin).toString() : null;
  let callbackReturnUrl = fallbackReturnUrl;

  try {
    const state = getSingleQueryValue(req.query.state);
    const pendingAuthorization = driveSyncService.consumeOAuthState(state);

    if (!pendingAuthorization) {
      logger.security('DRIVE_OAUTH_STATE_REJECTED', { ip: req.ip });
      return sendOAuthPage(res, {
        status: 400,
        title: 'Érvénytelen Google Drive hitelesítés',
        heading: '[OAUTH_STATE_INVALID]',
        message: 'A hitelesítési kérés érvénytelen, lejárt vagy már fel lett használva. Indíts új csatlakoztatást az admin felületről.',
        returnUrl: fallbackReturnUrl
      });
    }

    const returnOrigin = resolveOAuthReturnOrigin(pendingAuthorization.returnOrigin);
    const returnUrl = returnOrigin ? new URL('/admin', returnOrigin).toString() : fallbackReturnUrl;
    callbackReturnUrl = returnUrl;
    const providerError = getSingleQueryValue(req.query.error);

    if (providerError) {
      const errorLabel = providerError.slice(0, 128);
      logger.warn('[DRIVE_OAUTH] Google authorization was rejected', { error: errorLabel });
      return sendOAuthPage(res, {
        status: 400,
        title: 'Google Drive hitelesítés sikertelen',
        heading: '[GOOGLE_AUTH_FAILED]',
        message: `A Google hitelesítés nem fejeződött be (${errorLabel}).`,
        returnUrl
      });
    }

    const code = getSingleQueryValue(req.query.code);
    if (!code) {
      return sendOAuthPage(res, {
        status: 400,
        title: 'Hiányos Google Drive hitelesítés',
        heading: '[OAUTH_CODE_MISSING]',
        message: 'A Google nem küldött érvényes engedélyezési kódot. Indíts új csatlakoztatást az admin felületről.',
        returnUrl
      });
    }

    await driveSyncService.exchangeCodeForTokens(code);
    logger.success('[DRIVE_OAUTH] Google Drive OAuth authentication completed successfully');

    return sendOAuthPage(res, {
      status: 200,
      title: 'Google Drive csatlakoztatva // Cyber-Architect',
      heading: 'Google Drive sikeresen csatlakoztatva',
      message: 'A hozzáférési tokenek biztonságosan elmentésre kerültek.',
      returnUrl
    });
  } catch (err) {
    logger.error('OAuth callback failed', err);
    return sendOAuthPage(res, {
      status: 500,
      title: 'Google Drive tokenhiba',
      heading: '[OAUTH_EXCHANGE_ERROR]',
      message: 'A Google Drive hozzáférés véglegesítése nem sikerült. Próbáld újra az admin felületről.',
      returnUrl: callbackReturnUrl
    });
  }
});

// 4. Trigger Drive Sync (Aliases: /admin/drive/sync, /sync/drive, /sync/drive/sync, /drive/sync)
const postSyncHandler = async (req, res) => {
  let dryRun;
  try {
    dryRun = parseBooleanFlag(req.body?.dry_run ?? req.query?.dry_run, true);
  } catch {
    return res.status(400).json({
      error: 'INVALID_SYNC_REQUEST',
      message: 'dry_run must be a boolean value.'
    });
  }

  if (!dryRun && req.body?.confirm !== DRIVE_PULL_CONFIRMATION) {
    return res.status(400).json({
      error: 'DRIVE_SYNC_CONFIRMATION_REQUIRED',
      message: `confirm must equal ${DRIVE_PULL_CONFIRMATION}.`
    });
  }

  try {
    logger.info(`[DRIVE_SYNC] ${dryRun ? 'Preview' : 'Pull'} requested via Admin API`);
    const reconcile = () => driveSyncService.syncAll('ADMIN_DASHBOARD', {
      dryRun,
      // A normal reconciliation request must never overwrite Drive content.
      pushFirst: false
    });
    const results = dryRun
      ? await reconcile()
      : await runExclusiveDriveMutation('DRIVE_PULL_TO_DATABASE', reconcile);
    const errors = Array.isArray(results.errors) ? results.errors : [];
    const processed = results.processed ?? results.synced ?? 0;
    const completeFailure = errors.length > 0 && processed === 0;
    const partial = errors.length > 0 && processed > 0;

    if (completeFailure) {
      logger.error('[DRIVE_SYNC] Reconciliation failed before any document was processed.', {
        errorCount: errors.length,
        dryRun
      });
    } else if (partial) {
      logger.warn('[DRIVE_SYNC] Reconciliation completed with partial errors.', {
        processed,
        errorCount: errors.length,
        dryRun
      });
    } else {
      logger.success(`[DRIVE_SYNC] Complete: ${processed} files processed (${results.created || 0} new, ${results.updated || 0} updated)`);
    }

    return res.status(completeFailure ? 502 : 200).json({
      ...results,
      success: errors.length === 0,
      partial,
      dry_run: dryRun,
      report: results
    });
  } catch (err) {
    if (err.code === 'DRIVE_OPERATION_IN_PROGRESS') {
      return res.status(409).json({
        error: err.code,
        active_operation: err.activeOperation
      });
    }
    logger.error('Drive sync failed', err);
    return res.status(500).json({ error: 'DRIVE_SYNC_FAILED', message: err.message });
  }
};
syncRouter.post('/admin/drive/sync', authMiddleware, postSyncHandler);
syncRouter.post('/sync/drive', authMiddleware, postSyncHandler);
syncRouter.post('/sync/drive/sync', authMiddleware, postSyncHandler);
syncRouter.post('/drive/sync', authMiddleware, postSyncHandler);

const EMPTY_DRIVE_REPAIR_CONFIRMATION = 'REPAIR_EMPTY_DRIVE_FILES';

// 5. Repair only existing, empty Drive Markdown files from their exact local counterpart.
// Preview is the safe default. Apply requires an explicit confirmation phrase and the
// service revalidates every remote file immediately before writing it.
const postEmptyDriveRepairHandler = async (req, res) => {
  let dryRun;
  try {
    dryRun = parseBooleanFlag(req.body?.dry_run ?? req.query?.dry_run, true);
  } catch {
    return res.status(400).json({
      error: 'INVALID_REPAIR_REQUEST',
      message: 'dry_run must be a boolean value.'
    });
  }

  if (!dryRun && req.body?.confirm !== EMPTY_DRIVE_REPAIR_CONFIRMATION) {
    return res.status(400).json({
      error: 'DRIVE_REPAIR_CONFIRMATION_REQUIRED',
      message: `confirm must equal ${EMPTY_DRIVE_REPAIR_CONFIRMATION}.`
    });
  }

  try {
    logger.info(`[DRIVE_REPAIR] ${dryRun ? 'Preview' : 'Apply'} requested via Admin API`);
    const repair = () => driveSyncService.repairEmptyCloudFilesFromLocal({ dryRun });
    const results = dryRun
      ? await repair()
      : await runExclusiveDriveMutation('REPAIR_EMPTY_DRIVE_FILES', repair);
    const errors = Array.isArray(results.errors) ? results.errors : [];
    const repaired = results.repaired ?? 0;
    const wouldRepair = results.would_repair ?? results.wouldRepair ?? 0;
    const successful = dryRun ? wouldRepair : repaired;
    const completeFailure = errors.length > 0 && successful === 0;
    const partial = errors.length > 0 && successful > 0;

    return res.status(completeFailure ? 502 : 200).json({
      ...results,
      success: errors.length === 0,
      partial,
      dry_run: dryRun,
      operation: 'EMPTY_DRIVE_REPAIR',
      report: results
    });
  } catch (err) {
    if (err.code === 'DRIVE_OPERATION_IN_PROGRESS') {
      return res.status(409).json({
        error: err.code,
        active_operation: err.activeOperation
      });
    }
    logger.error('Empty Drive file repair failed', err);
    return res.status(500).json({
      error: 'DRIVE_EMPTY_FILE_REPAIR_FAILED',
      message: err.message
    });
  }
};

syncRouter.post('/admin/drive/repair-empty', authMiddleware, postEmptyDriveRepairHandler);
