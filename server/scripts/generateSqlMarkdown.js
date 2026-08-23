import { fileURLToPath } from 'node:url';
import { logger } from '../logger.js';
import { generateSqlProjectIndex } from '../services/sqlMarkdownGenerationService.js';

function usage() {
  return [
    'Használat: node server/scripts/generateSqlMarkdown.js <SQL_PROJECT_ID> [--dry-run] [--no-sync] [--json]',
    '',
    'A projekt adatait kizárólag az allowlistelt project_snapshot SQL fact gatewayből kéri le.',
    'A létrehozás create-only: meglévő index.md fájlt soha nem ír felül.'
  ].join('\n');
}

function parseArguments(argv) {
  const positional = [];
  let dryRun = false;
  let syncVault = true;
  let json = false;

  for (const argument of argv) {
    if (argument === '--dry-run') dryRun = true;
    else if (argument === '--no-sync') syncVault = false;
    else if (argument === '--json') json = true;
    else if (argument === '--help' || argument === '-h') return { help: true };
    else if (argument.startsWith('-')) throw new Error(`ISMERETLEN_OPCIO: ${argument}`);
    else positional.push(argument);
  }

  if (positional.length !== 1) throw new Error('SQL_PROJECT_ID_REQUIRED');
  return { sqlProjectId: positional[0], dryRun, syncVault, json };
}

export async function runSqlMarkdownGenerator(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) return { help: true, text: usage() };

  return generateSqlProjectIndex(options);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runSqlMarkdownGenerator()
    .then(result => {
      if (result.help) {
        process.stdout.write(`${result.text}\n`);
        return;
      }
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (result.status === 'created_pending_sync') {
        logger.warn('[SQL_MARKDOWN_GENERATOR] A fájl létrejött, de a Vault → SQLite/RAG szinkron elutasította a teljes vaultot.', {
          sqlProjectId: result.sql_project_id,
          targetPath: result.target_path
        });
        process.exitCode = 2;
      }
    })
    .catch(error => {
      logger.error('[SQL_MARKDOWN_GENERATOR] Sikertelen projektindex-generálás', error);
      process.stderr.write(`${error.message || 'SQL_MARKDOWN_GENERATION_FAILED'}\n`);
      process.exitCode = 1;
    });
}
