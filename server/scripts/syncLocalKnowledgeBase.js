import { fileURLToPath } from 'node:url';
import { logger } from '../logger.js';
import { localVaultService } from '../services/localVaultService.js';

/**
 * Synchronize the canonical Content/ Vault into its SQLite/RAG projection.
 * Markdown remains the source of truth; this command never imports legacy
 * KnowledgeBase/ or Blog/ roots.
 */
export async function syncKnowledgeBase({ dryRun = true } = {}) {
  const result = localVaultService.sync({
    actor: 'LOCAL_VAULT_CLI',
    dryRun
  });

  if (result.errors.length > 0) {
    const codes = result.errors.map(issue => issue.code).join(', ');
    const error = new Error(`LOCAL_VAULT_SYNC_REJECTED: ${codes}`);
    error.code = 'LOCAL_VAULT_SYNC_REJECTED';
    error.report = result;
    throw error;
  }

  logger.success(`[LOCAL_VAULT_SYNC] ${dryRun ? 'Previewed' : 'Synchronized'} ${result.processed} documents (${result.created} new, ${result.updated} updated, ${result.indexed} indexed).`);
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argumentsList = process.argv.slice(2);
  const invalidArguments = argumentsList.filter(argument => !['--dry-run', '--apply'].includes(argument));
  if (invalidArguments.length > 0) {
    logger.error(`[LOCAL_VAULT_SYNC] Ismeretlen paraméter: ${invalidArguments.join(', ')}`);
    process.exit(1);
  }
  const dryRun = !argumentsList.includes('--apply') || argumentsList.includes('--dry-run');

  syncKnowledgeBase({ dryRun })
    .then(() => process.exit(0))
    .catch((error) => {
      logger.error('[LOCAL_VAULT_SYNC] Sync failed', error, error.report);
      process.exit(1);
    });
}
