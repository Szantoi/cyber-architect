import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export default async function globalTeardown() {
  const configuredPath = process.env.CYBER_ARCHITECT_E2E_DB;
  if (!configuredPath) return;

  const databasePath = path.resolve(configuredPath);
  const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
  const expectedPrefix = 'cyber-architect-e2e-';

  if (!databasePath.startsWith(tempRoot) || !path.basename(databasePath).startsWith(expectedPrefix)) {
    throw new Error(`Refusing to remove non-temporary E2E database: ${databasePath}`);
  }

  const shutdownToken = process.env.CYBER_ARCHITECT_E2E_SHUTDOWN_TOKEN;
  const backendPort = Number(process.env.PLAYWRIGHT_BACKEND_PORT);
  if (!shutdownToken || !Number.isInteger(backendPort)) {
    throw new Error('Missing isolated E2E server shutdown configuration.');
  }

  try {
    const response = await fetch(`http://127.0.0.1:${backendPort}/__e2e_shutdown__`, {
      method: 'POST',
      headers: {
        'x-e2e-shutdown-token': shutdownToken
      },
      signal: AbortSignal.timeout(5_000)
    });

    if (response.status !== 202) {
      throw new Error(`E2E server rejected the shutdown request with status ${response.status}.`);
    }
  } catch (error) {
    // If the server already exited, the database can still be removed safely.
    if (error.cause?.code !== 'ECONNREFUSED') throw error;
  }

  const databaseFiles = ['', '-wal', '-shm'].map((suffix) => `${databasePath}${suffix}`);
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    for (const filePath of databaseFiles) {
      try {
        fs.rmSync(filePath, { force: true });
      } catch (error) {
        if (error.code !== 'EPERM' && error.code !== 'EBUSY') throw error;
      }
    }

    if (databaseFiles.every((filePath) => !fs.existsSync(filePath))) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const remainingFiles = databaseFiles.filter((filePath) => fs.existsSync(filePath));
  if (remainingFiles.length > 0) {
    throw new Error(`E2E database cleanup timed out: ${remainingFiles.join(', ')}`);
  }
}
