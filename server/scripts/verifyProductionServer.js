import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function findAvailablePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });

  const address = probe.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  assert(Number.isInteger(port), 'Failed to allocate a production smoke-test port.');
  return port;
}

async function waitForHealthyServer(url, child, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Production smoke server exited prematurely with code ${child.exitCode}.`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return response;
    } catch (error) {
      lastError = error;
    }

    await delay(100);
  }

  throw new Error(`Production smoke server did not become healthy: ${lastError?.message || 'timeout'}`);
}

async function waitForExit(child, timeoutMs = 10_000) {
  if (child.exitCode !== null) return child.exitCode;

  return Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(timeoutMs).then(() => {
      throw new Error('Production smoke server shutdown timed out.');
    })
  ]);
}

const port = await findAvailablePort();
const baseUrl = `http://127.0.0.1:${port}`;
const shutdownToken = crypto.randomBytes(32).toString('hex');
const databasePath = path.join(
  os.tmpdir(),
  `cyber-architect-e2e-production-smoke-${process.pid}.sqlite`
);
const databaseFiles = ['', '-wal', '-shm'].map((suffix) => `${databasePath}${suffix}`);

const child = spawn(process.execPath, ['e2e/server-runner.js'], {
  cwd: path.resolve('.'),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    SQLITE_DB_PATH: databasePath,
    JWT_SECRET: crypto.randomBytes(48).toString('base64url'),
    ADMIN_DEFAULT_PIN: `Smoke-${crypto.randomBytes(12).toString('base64url')}!9`,
    SITE_URL: baseUrl,
    ALLOWED_ORIGINS: baseUrl,
    CYBER_ARCHITECT_E2E_SHUTDOWN_TOKEN: shutdownToken
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

let childOutput = '';
for (const stream of [child.stdout, child.stderr]) {
  stream.on('data', (chunk) => {
    childOutput = `${childOutput}${chunk}`.slice(-12_000);
  });
}

try {
  await waitForHealthyServer(`${baseUrl}/api/health/ready`, child);

  const [rootResponse, spaResponse, healthResponse] = await Promise.all([
    fetch(`${baseUrl}/`, { headers: { Accept: 'text/html' } }),
    fetch(`${baseUrl}/knowledge/production-smoke`, { headers: { Accept: 'text/html' } }),
    fetch(`${baseUrl}/api/health/ready`)
  ]);
  const [rootHtml, spaHtml, health] = await Promise.all([
    rootResponse.text(),
    spaResponse.text(),
    healthResponse.json()
  ]);

  assert(rootResponse.status === 200 && rootHtml.includes('id="root"'), 'Production root shell is unavailable.');
  assert(spaResponse.status === 200 && spaHtml.includes('id="root"'), 'Production SPA fallback is unavailable.');
  assert(healthResponse.status === 200 && health.ready === true, 'Production readiness probe is not healthy.');
  assert(healthResponse.headers.get('cache-control') === 'no-store', 'Readiness response must not be cached.');

  const contentSecurityPolicy = rootResponse.headers.get('content-security-policy') || '';
  const scriptDirective = contentSecurityPolicy
    .split(';')
    .map((directive) => directive.trim())
    .find((directive) => directive.startsWith('script-src '));
  assert(scriptDirective, 'Production response is missing a script-src CSP directive.');
  assert(!scriptDirective.includes("'unsafe-inline'"), 'Production script-src allows unsafe-inline.');
  assert(!scriptDirective.includes("'unsafe-eval'"), 'Production script-src allows unsafe-eval.');

  const assetPath = rootHtml.match(/src="(?<path>\/assets\/[^"]+\.js)"/)?.groups?.path;
  assert(assetPath, 'Production shell does not reference a compiled JavaScript asset.');
  const assetResponse = await fetch(`${baseUrl}${assetPath}`);
  assert(assetResponse.ok, 'Compiled JavaScript asset is unavailable.');
  assert(
    assetResponse.headers.get('cache-control') === 'public, max-age=31536000, immutable',
    'Hashed production assets must use immutable caching.'
  );

  const shutdownResponse = await fetch(`${baseUrl}/__e2e_shutdown__`, {
    method: 'POST',
    headers: { 'x-e2e-shutdown-token': shutdownToken }
  });
  assert(shutdownResponse.status === 202, 'Production smoke server rejected its authenticated shutdown request.');
  assert(await waitForExit(child) === 0, `Production smoke server failed during shutdown.\n${childOutput}`);
  assert(databaseFiles.every((filePath) => !fs.existsSync(filePath)), 'Production smoke database was not cleaned up.');

  console.log(`PRODUCTION_SMOKE_OK port=${port}`);
} catch (error) {
  if (child.exitCode === null) child.kill('SIGTERM');
  await waitForExit(child).catch(() => undefined);
  throw new Error(`${error.message}\n${childOutput}`);
}
