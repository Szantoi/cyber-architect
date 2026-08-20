import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { backupDatabase, resolveDatabasePath } from '../../scripts/backupDatabase.js';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const temporaryDirectories = [];

function makeTemporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-backup-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

function createMarkerDatabase(filePath, marker) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const database = new Database(filePath);
  database.exec('CREATE TABLE markers (value TEXT NOT NULL)');
  database.prepare('INSERT INTO markers (value) VALUES (?)').run(marker);
  database.close();
}

function readMarkers(filePath) {
  const database = new Database(filePath, { readonly: true });
  try {
    return database.prepare('SELECT value FROM markers ORDER BY rowid').all().map(row => row.value);
  } finally {
    database.close();
  }
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('backupDatabase', () => {
  it('backs up committed rows that still reside in WAL without changing source data files', () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, 'source.sqlite');
    const backupDirectory = path.join(directory, 'backups');
    const source = new Database(sourcePath);

    try {
      source.pragma('journal_mode = WAL');
      source.pragma('wal_autocheckpoint = 0');
      source.exec('CREATE TABLE markers (value TEXT NOT NULL)');
      source.pragma('wal_checkpoint(TRUNCATE)');
      source.prepare('INSERT INTO markers (value) VALUES (?)').run('committed-in-wal');

      const walPath = `${sourcePath}-wal`;
      expect(fs.statSync(walPath).size).toBeGreaterThan(0);
      const sourceHashesBefore = {
        database: hashFile(sourcePath),
        wal: hashFile(walPath)
      };

      const result = backupDatabase(backupDirectory, { sourcePath });

      expect(readMarkers(result.path)).toEqual(['committed-in-wal']);
      expect(hashFile(sourcePath)).toBe(sourceHashesBefore.database);
      expect(hashFile(walPath)).toBe(sourceHashesBefore.wal);
      expect(source.prepare('SELECT value FROM markers').pluck().all()).toEqual(['committed-in-wal']);
      expect(fs.readdirSync(backupDirectory).filter(name => name.startsWith('.'))).toEqual([]);
    } finally {
      source.close();
    }
  });

  it('prefers the canonical data database when a legacy server database also exists', () => {
    const directory = makeTemporaryDirectory();
    const currentPath = path.join(directory, 'data', 'portfolio.sqlite');
    const legacyPath = path.join(directory, 'server', 'portfolio.db');
    const backupDirectory = path.join(directory, 'backups');
    createMarkerDatabase(currentPath, 'current');
    createMarkerDatabase(legacyPath, 'legacy');

    const result = backupDatabase(backupDirectory, {
      env: {},
      appRoot: directory
    });

    expect(result.sourcePath).toBe(currentPath);
    expect(readMarkers(result.path)).toEqual(['current']);
    expect(readMarkers(legacyPath)).toEqual(['legacy']);
  });

  it('stores default backups beside the canonical database in its persistent data directory', () => {
    const directory = makeTemporaryDirectory();
    const dataDirectory = path.join(directory, 'persistent-data');
    const sourcePath = path.join(dataDirectory, 'portfolio.sqlite');
    createMarkerDatabase(sourcePath, 'persistent-current');

    const result = backupDatabase(null, {
      env: { SQLITE_DATA_DIR: dataDirectory },
      appRoot: directory
    });

    expect(path.dirname(result.path)).toBe(path.join(dataDirectory, 'backups'));
    expect(result.sourcePath).toBe(sourcePath);
    expect(readMarkers(result.path)).toEqual(['persistent-current']);
  });

  it('lets an explicit database path win over data and legacy candidates', () => {
    const directory = makeTemporaryDirectory();
    const explicitPath = path.join(directory, 'explicit', 'chosen.sqlite');
    const currentPath = path.join(directory, 'data', 'portfolio.sqlite');
    const legacyPath = path.join(directory, 'server', 'portfolio.db');
    createMarkerDatabase(explicitPath, 'explicit');
    createMarkerDatabase(currentPath, 'current');
    createMarkerDatabase(legacyPath, 'legacy');

    const result = backupDatabase(path.join(directory, 'backups'), {
      env: { SQLITE_DB_PATH: explicitPath },
      appRoot: directory
    });

    expect(resolveDatabasePath({ SQLITE_DB_PATH: explicitPath }, directory)).toBe(explicitPath);
    expect(result.sourcePath).toBe(explicitPath);
    expect(readMarkers(result.path)).toEqual(['explicit']);
  });

  it('fails closed instead of opening a legacy database when the canonical source is missing', () => {
    const directory = makeTemporaryDirectory();
    const canonicalPath = path.join(directory, 'data', 'portfolio.sqlite');
    const legacyPath = path.join(directory, 'server', 'portfolio.db');
    createMarkerDatabase(legacyPath, 'legacy-must-not-open');

    expect(() => backupDatabase(path.join(directory, 'backups'), {
      env: {},
      appRoot: directory
    })).toThrow(`Database file not found at: ${canonicalPath}`);
    expect(readMarkers(legacyPath)).toEqual(['legacy-must-not-open']);
    expect(fs.existsSync(path.join(directory, 'backups'))).toBe(false);
  });

  it('atomically publishes unique backups without overwriting an existing file', () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, 'source.sqlite');
    const backupDirectory = path.join(directory, 'backups');
    const now = new Date('2026-08-20T12:34:56.789Z');
    createMarkerDatabase(sourcePath, 'first');

    const first = backupDatabase(backupDirectory, { sourcePath, now });
    const firstHash = hashFile(first.path);
    const source = new Database(sourcePath);
    source.prepare('INSERT INTO markers (value) VALUES (?)').run('second');
    source.close();

    const second = backupDatabase(backupDirectory, { sourcePath, now });

    expect(second.path).not.toBe(first.path);
    expect(hashFile(first.path)).toBe(firstHash);
    expect(readMarkers(first.path)).toEqual(['first']);
    expect(readMarkers(second.path)).toEqual(['first', 'second']);
  });

  it.skipIf(process.platform === 'win32')('restricts backup directory and snapshot permissions', () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, 'source.sqlite');
    const backupDirectory = path.join(directory, 'backups');
    createMarkerDatabase(sourcePath, 'private-backup');

    const result = backupDatabase(backupDirectory, { sourcePath });

    expect(fs.statSync(backupDirectory).mode & 0o777).toBe(0o700);
    expect(fs.statSync(result.path).mode & 0o777).toBe(0o600);
  });

  it('keeps a successful backup result when temporary cleanup fails', () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, 'source.sqlite');
    const backupDirectory = path.join(directory, 'backups');
    createMarkerDatabase(sourcePath, 'published-before-cleanup');
    const originalRemove = fs.rmSync.bind(fs);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(fs, 'rmSync').mockImplementation((filePath, options) => {
      if (String(filePath).endsWith('.tmp')) {
        throw new Error('injected cleanup failure');
      }
      return originalRemove(filePath, options);
    });

    const result = backupDatabase(backupDirectory, { sourcePath });

    expect(readMarkers(result.path)).toEqual(['published-before-cleanup']);
    expect(warning).toHaveBeenCalledWith(expect.stringContaining('Temporary snapshot cleanup failed'));
  });

  it('preserves the primary publication error when temporary cleanup also fails', () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, 'source.sqlite');
    const backupDirectory = path.join(directory, 'backups');
    createMarkerDatabase(sourcePath, 'primary-error');
    const publicationError = Object.assign(new Error('injected publication failure'), { code: 'EACCES' });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(fs, 'linkSync').mockImplementation(() => {
      throw publicationError;
    });
    vi.spyOn(fs, 'rmSync').mockImplementation(filePath => {
      if (String(filePath).endsWith('.tmp')) {
        throw new Error('injected cleanup failure');
      }
    });

    let failure;
    try {
      backupDatabase(backupDirectory, { sourcePath });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBe(publicationError);
  });
});

describe('portfolio CLI database telemetry', () => {
  it('shows help without importing the database service or creating a database', () => {
    const directory = makeTemporaryDirectory();
    const missingPath = path.join(directory, 'must-not-be-created.sqlite');
    const result = spawnSync(
      process.execPath,
      [path.join(APP_ROOT, 'server', 'cli', 'portfolio-cli.js'), 'help'],
      {
        cwd: APP_ROOT,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          SQLITE_DB_PATH: missingPath,
          SQLITE_DATA_DIR: directory,
          DOTENV_CONFIG_QUIET: 'true'
        },
        encoding: 'utf8'
      }
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('ELÉRHETŐ PARANCSOK');
    expect(fs.existsSync(missingPath)).toBe(false);
  });

  it('backs up a WAL database without initializing or changing the source', () => {
    const directory = makeTemporaryDirectory();
    const sourcePath = path.join(directory, 'portfolio.sqlite');
    const source = new Database(sourcePath);

    try {
      source.pragma('journal_mode = WAL');
      source.pragma('wal_autocheckpoint = 0');
      source.exec('CREATE TABLE markers (value TEXT NOT NULL)');
      source.pragma('wal_checkpoint(TRUNCATE)');
      source.prepare('INSERT INTO markers (value) VALUES (?)').run('cli-committed-in-wal');

      const walPath = `${sourcePath}-wal`;
      const hashesBefore = {
        database: hashFile(sourcePath),
        wal: hashFile(walPath)
      };
      const result = spawnSync(
        process.execPath,
        [path.join(APP_ROOT, 'server', 'cli', 'portfolio-cli.js'), 'backup', '--json'],
        {
          cwd: APP_ROOT,
          env: {
            ...process.env,
            NODE_ENV: 'development',
            SQLITE_DB_PATH: sourcePath,
            SQLITE_DATA_DIR: directory,
            DOTENV_CONFIG_QUIET: 'true'
          },
          encoding: 'utf8'
        }
      );

      expect(result.status, result.stderr).toBe(0);
      const jsonStart = result.stdout.lastIndexOf('{"success":true');
      expect(jsonStart, result.stdout).toBeGreaterThanOrEqual(0);
      const report = JSON.parse(result.stdout.slice(jsonStart));
      expect(path.dirname(report.file)).toBe(path.join(directory, 'backups'));
      expect(readMarkers(report.file)).toEqual(['cli-committed-in-wal']);
      expect(hashFile(sourcePath)).toBe(hashesBefore.database);
      expect(hashFile(walPath)).toBe(hashesBefore.wal);
      expect(source.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").pluck().all()).toEqual(['markers']);
    } finally {
      source.close();
    }
  });

  it('fails closed without creating a missing canonical database even when a legacy DB exists', () => {
    const directory = makeTemporaryDirectory();
    const dataDirectory = path.join(directory, 'canonical-data');
    const canonicalPath = path.join(dataDirectory, 'portfolio.sqlite');
    const repositoryLegacyPath = path.join(APP_ROOT, 'server', 'portfolio.db');
    expect(fs.existsSync(repositoryLegacyPath)).toBe(true);

    const result = spawnSync(
      process.execPath,
      [path.join(APP_ROOT, 'server', 'cli', 'portfolio-cli.js'), 'backup', '--json'],
      {
        cwd: APP_ROOT,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          SQLITE_DB_PATH: '',
          SQLITE_DATA_DIR: dataDirectory,
          DOTENV_CONFIG_QUIET: 'true'
        },
        encoding: 'utf8'
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Database file not found at: ${canonicalPath}`);
    expect(fs.existsSync(canonicalPath)).toBe(false);
    expect(fs.existsSync(path.join(dataDirectory, 'backups'))).toBe(false);
  });

  it('reports SQLITE_DATA_DIR/portfolio.sqlite instead of the legacy database', () => {
    const directory = makeTemporaryDirectory();
    const dataDirectory = path.join(directory, 'canonical-data');
    const expectedPath = path.join(dataDirectory, 'portfolio.sqlite');
    const result = spawnSync(
      process.execPath,
      [path.join(APP_ROOT, 'server', 'cli', 'portfolio-cli.js'), 'status', '--json'],
      {
        cwd: APP_ROOT,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          SQLITE_DB_PATH: '',
          SQLITE_DATA_DIR: dataDirectory,
          DOTENV_CONFIG_QUIET: 'true'
        },
        encoding: 'utf8'
      }
    );

    expect(result.status, result.stderr).toBe(0);
    const jsonStart = result.stdout.indexOf('{\n  "dbFilePath"');
    expect(jsonStart, result.stdout).toBeGreaterThanOrEqual(0);
    const telemetry = JSON.parse(result.stdout.slice(jsonStart));
    expect(telemetry.dbFilePath).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);
  });

  it('reports the shared 12–64 character PIN policy instead of the obsolete four-character rule', () => {
    const directory = makeTemporaryDirectory();
    const result = spawnSync(
      process.execPath,
      [path.join(APP_ROOT, 'server', 'cli', 'portfolio-cli.js'), 'set-pin', 'aB3!'],
      {
        cwd: APP_ROOT,
        env: {
          ...process.env,
          NODE_ENV: 'development',
          SQLITE_DB_PATH: path.join(directory, 'pin-policy.sqlite'),
          SQLITE_DATA_DIR: directory,
          DOTENV_CONFIG_QUIET: 'true'
        },
        encoding: 'utf8'
      }
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('12–64 karakter szükséges');
    expect(result.stderr).not.toContain('legalább 4 karakteres');
  });
});
