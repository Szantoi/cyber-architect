import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DATABASE_FILE_NAME,
  DATABASE_PATH_SOURCE,
  ensureDatabaseParentDirectory,
  resolveDatabaseLocation,
  resolveDatabasePath
} from '../../config/databasePath.js';

const temporaryDirectories = [];

function makeTemporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-db-path-test-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('workspace database path resolution', () => {
  it('resolves an explicit SQLite path against the application root and gives it highest precedence', () => {
    const appRoot = makeTemporaryDirectory();
    const location = resolveDatabaseLocation({
      SQLITE_DB_PATH: 'runtime/custom.sqlite',
      CYBER_ARCHITECT_WORKSPACE_DATA_DIR: 'vault/.cyberarchitect',
      SQLITE_DATA_DIR: 'legacy-data'
    }, appRoot);

    expect(location).toEqual({
      path: path.join(appRoot, 'runtime', 'custom.sqlite'),
      directory: path.join(appRoot, 'runtime'),
      source: DATABASE_PATH_SOURCE.EXPLICIT_PATH
    });
  });

  it('uses the opt-in workspace data directory before the legacy data directory', () => {
    const appRoot = makeTemporaryDirectory();
    const location = resolveDatabaseLocation({
      CYBER_ARCHITECT_WORKSPACE_DATA_DIR: 'vault/.cyberarchitect',
      SQLITE_DATA_DIR: 'legacy-data'
    }, appRoot);

    expect(location).toEqual({
      path: path.join(appRoot, 'vault', '.cyberarchitect', DATABASE_FILE_NAME),
      directory: path.join(appRoot, 'vault', '.cyberarchitect'),
      source: DATABASE_PATH_SOURCE.WORKSPACE_DATA_DIRECTORY
    });
    expect(resolveDatabasePath({
      CYBER_ARCHITECT_WORKSPACE_DATA_DIR: 'vault/.cyberarchitect'
    }, appRoot)).toBe(location.path);
  });

  it('uses SQLITE_DATA_DIR when no explicit workspace location is configured', () => {
    const appRoot = makeTemporaryDirectory();
    const location = resolveDatabaseLocation({ SQLITE_DATA_DIR: 'persistent-data' }, appRoot);

    expect(location).toEqual({
      path: path.join(appRoot, 'persistent-data', DATABASE_FILE_NAME),
      directory: path.join(appRoot, 'persistent-data'),
      source: DATABASE_PATH_SOURCE.DATA_DIRECTORY
    });
  });

  it('keeps the app data directory as the legacy fallback and ignores blank overrides', () => {
    const appRoot = makeTemporaryDirectory();
    const location = resolveDatabaseLocation({
      SQLITE_DB_PATH: '   ',
      CYBER_ARCHITECT_WORKSPACE_DATA_DIR: '',
      SQLITE_DATA_DIR: ' '
    }, appRoot);

    expect(location).toEqual({
      path: path.join(appRoot, 'data', DATABASE_FILE_NAME),
      directory: path.join(appRoot, 'data'),
      source: DATABASE_PATH_SOURCE.LEGACY_DEFAULT
    });
  });

  it('creates the final SQLite parent directory without creating a database file', () => {
    const root = makeTemporaryDirectory();
    const databasePath = path.join(root, 'vault', '.cyberarchitect', DATABASE_FILE_NAME);

    const directory = ensureDatabaseParentDirectory(databasePath);

    expect(directory).toBe(path.dirname(databasePath));
    expect(fs.statSync(directory).isDirectory()).toBe(true);
    expect(fs.existsSync(databasePath)).toBe(false);
  });

  it('fails clearly when the resolved SQLite parent is a file', () => {
    const root = makeTemporaryDirectory();
    const parentFile = path.join(root, 'not-a-directory');
    fs.writeFileSync(parentFile, 'file');

    expect(() => ensureDatabaseParentDirectory(path.join(parentFile, DATABASE_FILE_NAME)))
      .toThrow(`SQLite database parent path is not a directory: ${parentFile}`);
  });

  it('fails closed when the SQLite database path itself is an existing directory', () => {
    const root = makeTemporaryDirectory();
    const databaseDirectory = path.join(root, 'vault', '.cyberarchitect');
    fs.mkdirSync(databaseDirectory, { recursive: true });

    expect(() => ensureDatabaseParentDirectory(databaseDirectory))
      .toThrow(`SQLite database path is a directory: ${databaseDirectory}`);
  });
});
