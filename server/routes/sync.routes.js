import { Router } from 'express';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { authMiddleware, requireOverseerAdmin } from '../security/auth.js';
import { driveSyncService } from '../services/driveSyncService.js';
import { localVaultService } from '../services/localVaultService.js';

export const syncRouter = Router();
let activeDriveMutation = null;
let activeVaultMutation = null;

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

async function runExclusiveVaultMutation(operation, callback) {
  if (activeVaultMutation) {
    const error = new Error('Another Vault mutation is already in progress.');
    error.code = 'VAULT_OPERATION_IN_PROGRESS';
    error.activeOperation = activeVaultMutation;
    throw error;
  }

  activeVaultMutation = operation;
  try {
    return await callback();
  } finally {
    activeVaultMutation = null;
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

// The Vault's Content/ tree is canonical. SQLite/RAG is a materialized search
// and graph projection, refreshed only from Markdown source.
const getVaultStatusHandler = (_req, res) => {
  const status = localVaultService.getStatus();
  return res.status(status.mode === 'CONFIGURATION_ERROR' ? 500 : 200).json({
    ...status,
    source_of_truth: 'LOCAL_VAULT',
    mode: status.mode,
    usage: 'CANONICAL_CONTENT'
  });
};
syncRouter.get('/admin/vault/status', authMiddleware, getVaultStatusHandler);
syncRouter.get('/vault/status', authMiddleware, getVaultStatusHandler);

function sendVaultEditorError(res, error) {
  const code = error?.code || 'VAULT_EDITOR_FAILED';
  const status = code === 'VAULT_DOCUMENT_NOT_FOUND' || code === 'VAULT_DOCUMENT_FILE_MISSING'
    ? 404
    : (code === 'VAULT_DOCUMENT_CONFLICT' ? 409 : (code === 'LOCAL_VAULT_ROOT_INVALID' ? 503 : 400));
  return res.status(status).json({
    success: false,
    error: code,
    message: error?.message || 'A kanonikus Vault-dokumentum kezelése sikertelen.',
    source_of_truth: 'LOCAL_VAULT',
    ...(error?.details ? { details: error.details } : {})
  });
}

const getVaultDocumentHandler = (req, res) => {
  try {
    return res.setHeader('Cache-Control', 'private, no-store, max-age=0').json({
      success: true,
      source_of_truth: 'LOCAL_VAULT',
      document: localVaultService.getEditableDocument(req.params.slug)
    });
  } catch (error) {
    logger.warn('[LOCAL_VAULT_EDITOR] Read rejected', { code: error?.code || error?.message, requestId: req.id });
    return sendVaultEditorError(res, error);
  }
};

const putVaultDocumentHandler = (req, res) => {
  try {
    const result = localVaultService.updateEditableDocument({
      slug: req.params.slug,
      content: req.body?.content,
      revision: req.body?.revision,
      actor: 'ADMIN_VAULT_EDITOR'
    });
    return res.setHeader('Cache-Control', 'private, no-store, max-age=0').json({
      success: true,
      source_of_truth: 'LOCAL_VAULT',
      ...result
    });
  } catch (error) {
    logger.warn('[LOCAL_VAULT_EDITOR] Update rejected', { code: error?.code || error?.message, requestId: req.id });
    return sendVaultEditorError(res, error);
  }
};
syncRouter.get('/admin/vault/documents/:slug', authMiddleware, requireOverseerAdmin, getVaultDocumentHandler);
syncRouter.put('/admin/vault/documents/:slug', authMiddleware, requireOverseerAdmin, putVaultDocumentHandler);

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

const CANONICAL_VAULT_SYNC_CONFIRMATION = 'APPLY_CANONICAL_VAULT_SYNC';

// 4. Refresh SQLite/RAG from the canonical Content/ Markdown tree. Preview
// is the safe default; apply requires an explicit acknowledgement because it
// updates searchable/indexed projections and graph metadata.
const postVaultSyncHandler = async (req, res) => {
  let dryRun;
  try {
    dryRun = parseBooleanFlag(req.body?.dry_run ?? req.query?.dry_run, true);
  } catch {
    return res.status(400).json({
      error: 'INVALID_SYNC_REQUEST',
      message: 'dry_run must be a boolean value.'
    });
  }

  if (!dryRun && req.body?.confirm !== CANONICAL_VAULT_SYNC_CONFIRMATION) {
    return res.status(400).json({
      success: false,
      error: 'VAULT_SYNC_CONFIRMATION_REQUIRED',
      message: `confirm must equal ${CANONICAL_VAULT_SYNC_CONFIRMATION}.`,
      source_of_truth: 'LOCAL_VAULT'
    });
  }

  try {
    logger.info(`[LOCAL_VAULT_SYNC] ${dryRun ? 'Preview' : 'Apply'} requested via Admin API`);
    const sync = () => localVaultService.sync({
      actor: dryRun ? 'ADMIN_VAULT_SYNC_PREVIEW' : 'ADMIN_VAULT_SYNC_APPLY',
      dryRun
    });
    const results = dryRun
      ? await sync()
      : await runExclusiveVaultMutation('CANONICAL_VAULT_SYNC', sync);
    const errors = Array.isArray(results.errors) ? results.errors : [];
    const processed = results.processed ?? 0;
    const completeFailure = errors.length > 0 && processed === 0;
    const partial = errors.length > 0 && processed > 0;

    if (completeFailure) {
      logger.error('[LOCAL_VAULT_SYNC] Sync failed before any document was processed.', {
        errorCount: errors.length,
        dryRun
      });
    } else if (partial) {
      logger.warn('[LOCAL_VAULT_SYNC] Sync completed with partial errors.', {
        processed,
        errorCount: errors.length,
        dryRun
      });
    } else {
      logger.success(`[LOCAL_VAULT_SYNC] ${dryRun ? 'Preview' : 'Apply'} complete: ${processed} files processed`);
    }

    return res.status(completeFailure ? 502 : 200).json({
      ...results,
      success: errors.length === 0,
      partial,
      dry_run: dryRun,
      source_of_truth: 'LOCAL_VAULT',
      projection_mode: 'SQLITE_RAG_FROM_VAULT',
      report: results
    });
  } catch (err) {
    if (err.code === 'VAULT_OPERATION_IN_PROGRESS') {
      return res.status(409).json({
        error: err.code,
        active_operation: err.activeOperation
      });
    }
    logger.error('Canonical vault sync failed', err);
    return res.status(500).json({ error: 'LOCAL_VAULT_SYNC_FAILED', message: err.message });
  }
};
syncRouter.post('/admin/vault/sync', authMiddleware, requireOverseerAdmin, postVaultSyncHandler);
syncRouter.post('/vault/sync', authMiddleware, requireOverseerAdmin, postVaultSyncHandler);

// Kept as explicit, fail-closed compatibility endpoints. A cloud document
// cannot enter the canonical local Vault path through an old bookmark,
// automation, or an accidentally re-enabled Drive credential.
const rejectDrivePullHandler = (_req, res) => res.status(409).json({
  error: 'CLOUD_PULL_DISABLED',
  message: 'A Google Drive csak opcionális tükör vagy helyreállítási cél; a kanonikus tartalom a helyi Content Vaultban van.',
  source_of_truth: 'LOCAL_VAULT',
  vault_sync_endpoint: '/api/admin/vault/sync'
});
syncRouter.post('/admin/drive/sync', authMiddleware, rejectDrivePullHandler);
syncRouter.post('/sync/drive', authMiddleware, rejectDrivePullHandler);
syncRouter.post('/sync/drive/sync', authMiddleware, rejectDrivePullHandler);
syncRouter.post('/drive/sync', authMiddleware, rejectDrivePullHandler);

const EMPTY_DRIVE_REPAIR_CONFIRMATION = 'REPAIR_EMPTY_DRIVE_FILES';
const OAUTH_REHOME_CONFIRMATION = 'REHOME_EMPTY_SERVICE_ACCOUNT_FILES_TO_OAUTH_USER';

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

// 6. Replace only exact, empty service-account-owned cloud placeholders with
// OAuth-user-owned replacements. The preview plan is cryptographically bound to
// the apply request so a changed Drive/local inventory cannot be applied by
// accident. Missing local-only documents remain intentionally out of scope.
const postOAuthRehomeHandler = async (req, res) => {
  let dryRun;
  try {
    dryRun = parseBooleanFlag(req.body?.dry_run ?? req.query?.dry_run, true);
  } catch {
    return res.status(400).json({
      error: 'INVALID_REHOME_REQUEST',
      message: 'dry_run must be a boolean value.'
    });
  }

  const planDigest = req.body?.plan_digest;
  const expectedRehomeCount = req.body?.expected_rehome_count;
  if (!dryRun) {
    if (req.body?.confirm !== OAUTH_REHOME_CONFIRMATION) {
      return res.status(400).json({
        error: 'DRIVE_REHOME_CONFIRMATION_REQUIRED',
        message: `confirm must equal ${OAUTH_REHOME_CONFIRMATION}.`
      });
    }
    if (typeof planDigest !== 'string' || !/^[a-f0-9]{64}$/.test(planDigest)) {
      return res.status(400).json({
        error: 'DRIVE_REHOME_PLAN_REQUIRED',
        message: 'plan_digest must be the 64-character SHA-256 digest returned by the preview.'
      });
    }
    const parsedCount = typeof expectedRehomeCount === 'number'
      ? expectedRehomeCount
      : Number(expectedRehomeCount);
    if (!Number.isSafeInteger(parsedCount) || parsedCount < 0 || String(expectedRehomeCount).trim() === '') {
      return res.status(400).json({
        error: 'DRIVE_REHOME_PLAN_REQUIRED',
        message: 'expected_rehome_count must be the non-negative integer returned by the preview.'
      });
    }
  }

  try {
    logger.info(`[DRIVE_REHOME] ${dryRun ? 'Preview' : 'Apply'} requested via Admin API`);
    const rehome = () => driveSyncService.rehomeEmptyServiceAccountFilesToOAuth({
      dryRun,
      expectedPlanDigest: dryRun ? null : planDigest,
      expectedRehomeCount: dryRun ? null : Number(expectedRehomeCount)
    });
    const results = dryRun
      ? await rehome()
      : await runExclusiveDriveMutation('REHOME_EMPTY_SERVICE_ACCOUNT_FILES_TO_OAUTH_USER', rehome);
    const errors = Array.isArray(results.errors) ? results.errors : [];
    const successful = dryRun ? (results.would_rehome ?? 0) : (results.rehomed ?? 0);
    const completeFailure = errors.length > 0 && successful === 0;
    const partial = errors.length > 0 && successful > 0;

    return res.status(completeFailure ? 502 : 200).json({
      ...results,
      success: errors.length === 0,
      partial,
      dry_run: dryRun,
      operation: 'OAUTH_EMPTY_DRIVE_REHOME',
      report: results
    });
  } catch (err) {
    if (err.code === 'DRIVE_OPERATION_IN_PROGRESS') {
      return res.status(409).json({
        error: err.code,
        active_operation: err.activeOperation
      });
    }
    logger.error('OAuth Drive rehome failed', err);
    return res.status(500).json({
      error: 'DRIVE_OAUTH_REHOME_FAILED',
      message: err.message
    });
  }
};

syncRouter.post('/admin/drive/rehome-empty-oauth', authMiddleware, postOAuthRehomeHandler);
