import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const databasePath = path.resolve(process.env.SQLITE_DB_PATH || '');
const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;
const shutdownToken = process.env.CYBER_ARCHITECT_E2E_SHUTDOWN_TOKEN || '';
const port = Number(process.env.PORT);

if (!databasePath.startsWith(tempRoot) || !path.basename(databasePath).startsWith('cyber-architect-e2e-')) {
  throw new Error(`Refusing to start E2E server with a non-temporary database: ${databasePath}`);
}

if (!shutdownToken || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Invalid isolated E2E server configuration.');
}

const { app } = await import('../server/index.js');
const { db } = await import('../server/db.js');
let stopping = false;

function isLoopback(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function hasValidToken(candidate = '') {
  const expected = Buffer.from(shutdownToken);
  const actual = Buffer.from(candidate);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function removeTemporaryDatabase() {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

const server = http.createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/__e2e_shutdown__') {
    const token = request.headers['x-e2e-shutdown-token'];
    if (!isLoopback(request.socket.remoteAddress) || !hasValidToken(token)) {
      response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    response.writeHead(202, {
      'Connection': 'close',
      'Content-Type': 'text/plain; charset=utf-8'
    });
    response.end('Shutting down');
    setImmediate(() => shutdown(0));
    return;
  }

  app(request, response);
});

function shutdown(exitCode) {
  if (stopping) return;
  stopping = true;

  const forceExitTimer = setTimeout(() => process.exit(1), 5_000);
  forceExitTimer.unref();

  server.close((error) => {
    clearTimeout(forceExitTimer);

    try {
      if (db.open) db.close();
      removeTemporaryDatabase();
    } catch (cleanupError) {
      console.error('[E2E_CLEANUP_ERROR]', cleanupError);
      process.exit(1);
    }

    process.exit(error ? 1 : exitCode);
  });

  server.closeIdleConnections?.();
}

process.once('SIGINT', () => shutdown(0));
process.once('SIGTERM', () => shutdown(0));

server.listen(port, () => {
  console.log(`[E2E_SERVER] Listening on http://127.0.0.1:${port}`);
});
