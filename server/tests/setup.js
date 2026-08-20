import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

const previousNodeEnv = process.env.NODE_ENV;
const previousDbPath = process.env.SQLITE_DB_PATH;
const previousDataDir = process.env.SQLITE_DATA_DIR;

// A fresh directory per test file keeps parallel workers independent and makes
// it impossible for a Vitest import to fall back to data/portfolio.sqlite.
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberarchitect-vitest-'));
const testDbPath = path.join(testDataDir, 'portfolio.test.sqlite');

process.env.NODE_ENV = 'test';
process.env.SQLITE_DATA_DIR = testDataDir;
process.env.SQLITE_DB_PATH = testDbPath;

afterAll(async () => {
  try {
    if (fs.existsSync(testDbPath)) {
      const databaseModule = await import('../db.js');

      if (path.resolve(databaseModule.dbPath) !== path.resolve(testDbPath)) {
        throw new Error(`[TEST_DB_SAFETY] Refusing to close unexpected database: ${databaseModule.dbPath}`);
      }

      if (databaseModule.db.open) {
        databaseModule.db.close();
      }
    }
  } finally {
    fs.rmSync(testDataDir, { recursive: true, force: true });

    restoreEnvironmentVariable('NODE_ENV', previousNodeEnv);
    restoreEnvironmentVariable('SQLITE_DB_PATH', previousDbPath);
    restoreEnvironmentVariable('SQLITE_DATA_DIR', previousDataDir);
  }
});

function restoreEnvironmentVariable(name, value) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
