import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LegacyMigrationError,
  reconcileLegacyDatabase
} from './legacyDatabaseReconciler.js';

export const LEGACY_MIGRATION_USAGE = `
Usage:
  node server/scripts/migrateLegacyDatabase.js --source <legacy.sqlite> --target <current.sqlite> [options]

Required:
  --source <path>       Existing legacy SQLite database; the original is never
                        SQLite-opened and is read through a verified temp snapshot.
  --target <path>       Existing current SQLite database; never created implicitly.

Options:
  --source-id <id>      Stable operator-defined source identity. Recommended if the
                        source file may be moved or renamed; only its SHA-256 is stored.
  --apply               Create a verified pre-migration backup, then apply in one
                        SQLite transaction. Without this flag the command is dry-run.
  --dry-run             Explicitly select the default snapshot-only planning mode.
  --help, -h            Show this help.

Exit codes:
  0  completed without collisions or errors
  1  validation, backup, or transactional failure
  2  completed safely but reported one or more collisions
`.trim();

function readValue(argv, index, optionName) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} requires a value.`);
  }
  return value;
}

export function parseLegacyMigrationArgs(argv) {
  const options = {
    sourcePath: null,
    targetPath: null,
    sourceId: null,
    apply: false,
    help: false
  };
  const seen = new Set();
  let explicitDryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (argument === '--apply') {
      if (seen.has('--apply')) throw new Error('--apply was provided more than once.');
      seen.add('--apply');
      options.apply = true;
      continue;
    }
    if (argument === '--dry-run') {
      if (explicitDryRun) throw new Error('--dry-run was provided more than once.');
      explicitDryRun = true;
      continue;
    }
    if (argument === '--source' || argument === '--target' || argument === '--source-id') {
      if (seen.has(argument)) throw new Error(`${argument} was provided more than once.`);
      seen.add(argument);
      const value = readValue(argv, index, argument);
      index += 1;
      if (argument === '--source') options.sourcePath = value;
      if (argument === '--target') options.targetPath = value;
      if (argument === '--source-id') options.sourceId = value;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (options.help) return options;
  if (explicitDryRun && options.apply) {
    throw new Error('--apply and --dry-run cannot be used together.');
  }
  if (!options.sourcePath) throw new Error('--source is required.');
  if (!options.targetPath) throw new Error('--target is required.');
  return options;
}

export function runLegacyMigrationCli(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseLegacyMigrationArgs(argv);
  } catch (error) {
    console.error(`[ARGUMENT_ERROR] ${error.message}`);
    console.error(LEGACY_MIGRATION_USAGE);
    return 1;
  }

  if (options.help) {
    console.log(LEGACY_MIGRATION_USAGE);
    return 0;
  }

  try {
    const summary = reconcileLegacyDatabase(options);
    console.log(JSON.stringify(summary, null, 2));
    if (summary.errors > 0) return 1;
    return summary.collisions > 0 ? 2 : 0;
  } catch (error) {
    if (error instanceof LegacyMigrationError && error.summary) {
      console.log(JSON.stringify(error.summary, null, 2));
    }
    console.error(`[${error.code || 'LEGACY_MIGRATION_FAILED'}] ${error.message}`);
    return 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const modulePath = fileURLToPath(import.meta.url);
if (invokedPath === modulePath) {
  process.exitCode = runLegacyMigrationCli();
}
