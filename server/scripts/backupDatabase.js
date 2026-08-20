import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '../..');
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

/**
 * Resolve the live database exactly like server/db.js does:
 * an explicit file wins, otherwise portfolio.sqlite lives in the configured
 * data directory (or the application's data directory by default).
 */
export function resolveDatabasePath(env = process.env, appRoot = APP_ROOT) {
  if (env.SQLITE_DB_PATH) {
    return path.resolve(env.SQLITE_DB_PATH);
  }

  const dataDir = env.SQLITE_DATA_DIR
    ? path.resolve(env.SQLITE_DATA_DIR)
    : path.join(appRoot, 'data');

  return path.join(dataDir, 'portfolio.sqlite');
}

function publishWithoutOverwrite(snapshotPath, backupFolder, baseName) {
  for (let suffix = 0; suffix < 10_000; suffix += 1) {
    const fileName = suffix === 0
      ? `${baseName}.sqlite`
      : `${baseName}-${suffix}.sqlite`;
    const destinationPath = path.join(backupFolder, fileName);

    try {
      // A same-directory hard link atomically publishes the completed snapshot.
      // linkSync fails with EEXIST instead of replacing an existing backup.
      fs.linkSync(snapshotPath, destinationPath);
      return { fileName, destinationPath };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }

  throw new Error('Unable to allocate a unique backup filename.');
}

/**
 * Creates an atomic, point-in-time snapshot backup of the SQLite database
 * using SQLite's VACUUM INTO command (zero downtime, WAL mode compliant).
 */
export function backupDatabase(targetDir = null, options = {}) {
  const dbPath = options.sourcePath
    ? path.resolve(options.sourcePath)
    : resolveDatabasePath(options.env, options.appRoot);
  const backupFolder = targetDir
    ? path.resolve(targetDir)
    : path.join(path.dirname(dbPath), 'backups');

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found at: ${dbPath}`);
  }

  if (!fs.existsSync(backupFolder)) {
    fs.mkdirSync(backupFolder, { recursive: true, mode: PRIVATE_DIRECTORY_MODE });
  }
  // Backups contain private content and authentication material. Restrict an
  // existing directory too; mkdir's mode is affected by both umask and whether
  // the directory already existed.
  fs.chmodSync(backupFolder, PRIVATE_DIRECTORY_MODE);

  const createdAt = options.now || new Date();
  const timestamp = createdAt.toISOString().replace(/[:.]/g, '-');
  const baseName = `portfolio-snapshot-${timestamp}`;
  const temporaryPath = path.join(
    backupFolder,
    `.${baseName}-${crypto.randomUUID()}.tmp`
  );

  logger.info(`[BACKUP] Initiating database snapshot from: ${dbPath}`);

  const db = new Database(dbPath, { readonly: true });
  let published = null;
  try {
    // VACUUM INTO reads a consistent SQLite snapshot, including committed WAL
    // pages, without mutating or checkpointing the source database.
    db.prepare('VACUUM INTO ?').run(temporaryPath);
    fs.chmodSync(temporaryPath, PRIVATE_FILE_MODE);
    published = publishWithoutOverwrite(temporaryPath, backupFolder, baseName);

    const stats = fs.statSync(published.destinationPath);
    const sizeKb = Math.round(stats.size / 1024);

    logger.success(`[BACKUP] Snapshot created successfully: ${published.fileName} (${sizeKb} KB)`);
    return {
      success: true,
      sourcePath: dbPath,
      fileName: published.fileName,
      path: published.destinationPath,
      sizeKb,
      timestamp: createdAt.toISOString()
    };
  } catch (err) {
    logger.error('[BACKUP] Failed to create database snapshot:', err);
    throw err;
  } finally {
    try {
      db.close();
    } catch (error) {
      logger.warn('[BACKUP] Source database close failed after snapshot operation.', {
        sourcePath: dbPath,
        error
      });
    }

    try {
      if (fs.existsSync(temporaryPath)) {
        fs.rmSync(temporaryPath, { force: true });
      }
    } catch (error) {
      // Cleanup is best-effort: never replace the completed backup result or
      // the primary VACUUM/publication error with a temporary-file error.
      logger.warn('[BACKUP] Temporary snapshot cleanup failed.', {
        temporaryPath,
        error
      });
    }
  }
}

// Run directly if invoked from CLI
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    backupDatabase();
  } catch {
    process.exit(1);
  }
}
