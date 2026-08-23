import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const APP_ROOT = path.resolve(__dirname, '../..');
export const DATABASE_FILE_NAME = 'portfolio.sqlite';

export const DATABASE_PATH_SOURCE = Object.freeze({
  EXPLICIT_PATH: 'sqlite_db_path',
  WORKSPACE_DATA_DIRECTORY: 'workspace_data_directory',
  DATA_DIRECTORY: 'sqlite_data_directory',
  LEGACY_DEFAULT: 'legacy_app_data_directory'
});

function getConfiguredValue(env, name) {
  const value = env?.[name];
  if (typeof value !== 'string') return null;

  const trimmedValue = value.trim();
  return trimmedValue || null;
}

function resolveFromAppRoot(configuredPath, appRoot) {
  return path.isAbsolute(configuredPath)
    ? path.normalize(configuredPath)
    : path.resolve(appRoot, configuredPath);
}

/**
 * Resolves the one SQLite database owned by a running Cyber Architect process.
 *
 * The workspace data directory is deliberately opt-in: content roots can be
 * read-only or remotely mounted, so merely configuring a vault must never
 * silently create a database inside it. A caller that wants a portable vault
 * supplies CYBER_ARCHITECT_WORKSPACE_DATA_DIR (normally <vault>/.cyberarchitect).
 */
export function resolveDatabaseLocation(env = process.env, appRoot = APP_ROOT) {
  const resolvedAppRoot = path.resolve(appRoot);
  const explicitPath = getConfiguredValue(env, 'SQLITE_DB_PATH');

  if (explicitPath) {
    const databasePath = resolveFromAppRoot(explicitPath, resolvedAppRoot);
    return {
      path: databasePath,
      directory: path.dirname(databasePath),
      source: DATABASE_PATH_SOURCE.EXPLICIT_PATH
    };
  }

  const workspaceDataDirectory = getConfiguredValue(env, 'CYBER_ARCHITECT_WORKSPACE_DATA_DIR');
  if (workspaceDataDirectory) {
    const directory = resolveFromAppRoot(workspaceDataDirectory, resolvedAppRoot);
    return {
      path: path.join(directory, DATABASE_FILE_NAME),
      directory,
      source: DATABASE_PATH_SOURCE.WORKSPACE_DATA_DIRECTORY
    };
  }

  const configuredDataDirectory = getConfiguredValue(env, 'SQLITE_DATA_DIR');
  if (configuredDataDirectory) {
    const directory = resolveFromAppRoot(configuredDataDirectory, resolvedAppRoot);
    return {
      path: path.join(directory, DATABASE_FILE_NAME),
      directory,
      source: DATABASE_PATH_SOURCE.DATA_DIRECTORY
    };
  }

  const directory = path.join(resolvedAppRoot, 'data');
  return {
    path: path.join(directory, DATABASE_FILE_NAME),
    directory,
    source: DATABASE_PATH_SOURCE.LEGACY_DEFAULT
  };
}

export function resolveDatabasePath(env = process.env, appRoot = APP_ROOT) {
  return resolveDatabaseLocation(env, appRoot).path;
}

/**
 * Creates only the parent directory of the resolved SQLite file. Keeping this
 * separate from resolution lets backup/status commands remain read-only.
 */
export function ensureDatabaseParentDirectory(databasePath) {
  if (typeof databasePath !== 'string' || !databasePath.trim()) {
    throw new TypeError('A non-empty SQLite database path is required.');
  }

  const resolvedDatabasePath = path.resolve(databasePath);
  if (fs.existsSync(resolvedDatabasePath) && fs.statSync(resolvedDatabasePath).isDirectory()) {
    throw new Error(`SQLite database path is a directory: ${resolvedDatabasePath}`);
  }

  const directory = path.dirname(resolvedDatabasePath);

  if (fs.existsSync(directory)) {
    if (!fs.statSync(directory).isDirectory()) {
      throw new Error(`SQLite database parent path is not a directory: ${directory}`);
    }
    return directory;
  }

  fs.mkdirSync(directory, { recursive: true });
  return directory;
}
