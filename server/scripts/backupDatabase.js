import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { logger } from '../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Creates an atomic, point-in-time snapshot backup of the SQLite database
 * using SQLite's VACUUM INTO command (zero downtime, WAL mode compliant).
 */
export function backupDatabase(targetDir = null) {
  let dbPath = process.env.SQLITE_DB_PATH;
  if (!dbPath || !fs.existsSync(dbPath)) {
    const candidates = [
      path.resolve(__dirname, '../portfolio.db'),
      path.resolve(__dirname, '../../data/portfolio.sqlite'),
      path.resolve(__dirname, '../../portfolio.db')
    ];
    dbPath = candidates.find(c => fs.existsSync(c)) || candidates[0];
  }

  const backupFolder = targetDir || path.resolve(__dirname, '../backups');

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found at: ${dbPath}`);
  }

  if (!fs.existsSync(backupFolder)) {
    fs.mkdirSync(backupFolder, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `portfolio-snapshot-${timestamp}.sqlite`;
  const destinationPath = path.join(backupFolder, backupFileName);

  logger.info(`[BACKUP] Initiating database snapshot: ${backupFileName}...`);

  const db = new Database(dbPath, { readonly: true });
  try {
    // Perform atomic snapshot with VACUUM INTO
    db.prepare('VACUUM INTO ?').run(destinationPath);

    const stats = fs.statSync(destinationPath);
    const sizeKb = Math.round(stats.size / 1024);

    logger.success(`[BACKUP] Snapshot created successfully: ${backupFileName} (${sizeKb} KB)`);
    return {
      success: true,
      fileName: backupFileName,
      path: destinationPath,
      sizeKb,
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    logger.error('[BACKUP] Failed to create database snapshot:', err);
    throw err;
  } finally {
    db.close();
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
