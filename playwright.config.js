import { defineConfig, devices } from '@playwright/test';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';

function parseE2ePort(value, fallback, name) {
  const port = Number(value ?? fallback);

  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`${name} must be an integer between 1024 and 65535.`);
  }

  return port;
}

const backendPort = parseE2ePort(process.env.PLAYWRIGHT_BACKEND_PORT, 3101, 'PLAYWRIGHT_BACKEND_PORT');
const frontendPort = parseE2ePort(process.env.PLAYWRIGHT_FRONTEND_PORT, 5273, 'PLAYWRIGHT_FRONTEND_PORT');
const e2eAdminPin = process.env.CYBER_ARCHITECT_E2E_ADMIN_PIN || 'E2e-Admin-Pin-2026!';
const e2eShutdownToken = crypto.randomBytes(32).toString('hex');

if (backendPort === frontendPort) {
  throw new Error('PLAYWRIGHT_BACKEND_PORT and PLAYWRIGHT_FRONTEND_PORT must be different.');
}

const requestedE2eDatabasePath = process.env.CYBER_ARCHITECT_E2E_DB
  || path.join(os.tmpdir(), `cyber-architect-e2e-${process.pid}.sqlite`);
const e2eDatabasePath = path.resolve(requestedE2eDatabasePath);
const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`;

if (!e2eDatabasePath.startsWith(tempRoot) || !path.basename(e2eDatabasePath).startsWith('cyber-architect-e2e-')) {
  throw new Error(`E2E database must be an isolated temporary file: ${e2eDatabasePath}`);
}

process.env.CYBER_ARCHITECT_E2E_DB = e2eDatabasePath;
process.env.CYBER_ARCHITECT_E2E_ADMIN_PIN = e2eAdminPin;
process.env.CYBER_ARCHITECT_E2E_SHUTDOWN_TOKEN = e2eShutdownToken;
process.env.PLAYWRIGHT_BACKEND_PORT = String(backendPort);

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  globalTeardown: './e2e/global-teardown.js',
  use: {
    baseURL: `http://localhost:${frontendPort}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ],
  webServer: [
    {
      command: 'node e2e/server-runner.js',
      port: backendPort,
      timeout: 120 * 1000,
      reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === 'true',
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(backendPort),
        SQLITE_DB_PATH: e2eDatabasePath,
        JWT_SECRET: 'e2e-only-jwt-secret-not-for-production-2026',
        ADMIN_DEFAULT_PIN: e2eAdminPin,
        CYBER_ARCHITECT_E2E_SHUTDOWN_TOKEN: e2eShutdownToken
      }
    },
    {
      command: `npx vite --port ${frontendPort} --strictPort`,
      port: frontendPort,
      timeout: 120 * 1000,
      reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === 'true',
      env: {
        ...process.env,
        VITE_API_PROXY_TARGET: `http://localhost:${backendPort}`
      }
    }
  ]
});
