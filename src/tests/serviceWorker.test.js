import fs from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const serviceWorkerSource = fs.readFileSync(
  'public/sw.js',
  'utf8'
);

function createServiceWorkerHarness({ cacheKeys = [], fetchResponse } = {}) {
  const listeners = new Map();
  const cache = {
    add: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined)
  };
  const caches = {
    delete: vi.fn(async () => true),
    keys: vi.fn(async () => cacheKeys),
    match: vi.fn(async () => undefined),
    open: vi.fn(async () => cache)
  };
  const self = {
    addEventListener: vi.fn((type, listener) => listeners.set(type, listener)),
    clients: { claim: vi.fn() },
    location: { origin: 'https://ai.szantoi.hu' },
    skipWaiting: vi.fn()
  };
  const fetch = vi.fn(async () => fetchResponse);
  const workerConsole = { warn: vi.fn() };

  vm.runInNewContext(serviceWorkerSource, {
    URL,
    caches,
    console: workerConsole,
    fetch,
    Promise,
    self
  });

  return { cache, caches, fetch, listeners, self, workerConsole };
}

describe('production service worker cache isolation', () => {
  it('precaches core assets independently and waits for activation', async () => {
    const harness = createServiceWorkerHarness();
    harness.cache.add.mockImplementation(async (asset) => {
      if (asset === '/manifest.json') throw new Error('simulated cache miss');
    });
    let installation;

    harness.listeners.get('install')({
      waitUntil: (promise) => { installation = promise; }
    });
    await expect(installation).resolves.toEqual([expect.any(Array), undefined]);

    expect(harness.cache.add).toHaveBeenCalledTimes(3);
    expect(harness.cache.add).toHaveBeenCalledWith('/index.html');
    expect(harness.cache.add).not.toHaveBeenCalledWith('/');
    expect(harness.self.skipWaiting).toHaveBeenCalledOnce();
    expect(harness.workerConsole.warn).toHaveBeenCalledOnce();
  });

  it('only removes outdated Cyber Architect caches during activation', async () => {
    const harness = createServiceWorkerHarness({
      cacheKeys: ['cyber-architect-v2', 'cyber-architect-v3', 'another-application-v1']
    });
    let activation;

    harness.listeners.get('activate')({
      waitUntil: (promise) => { activation = promise; }
    });
    await activation;

    expect(harness.caches.delete).toHaveBeenCalledTimes(2);
    expect(harness.caches.delete).toHaveBeenCalledWith('cyber-architect-v2');
    expect(harness.caches.delete).toHaveBeenCalledWith('cyber-architect-v3');
    expect(harness.caches.delete).not.toHaveBeenCalledWith('another-application-v1');
    expect(harness.self.clients.claim).toHaveBeenCalledOnce();
  });

  it('stores successful navigations as one shared SPA shell entry', async () => {
    const responseClone = { kind: 'clone' };
    const networkResponse = {
      clone: vi.fn(() => responseClone),
      status: 200
    };
    const harness = createServiceWorkerHarness({ fetchResponse: networkResponse });
    let responsePromise;

    harness.listeners.get('fetch')({
      request: {
        headers: { get: () => 'text/html' },
        method: 'GET',
        mode: 'navigate',
        url: 'https://ai.szantoi.hu/knowledge/example'
      },
      respondWith: (promise) => { responsePromise = promise; }
    });

    await expect(responsePromise).resolves.toBe(networkResponse);
    await Promise.resolve();

    expect(harness.cache.put).toHaveBeenCalledWith('/index.html', responseClone);
  });

  it('does not intercept cross-origin resources', () => {
    const harness = createServiceWorkerHarness();
    const respondWith = vi.fn();

    harness.listeners.get('fetch')({
      request: {
        headers: { get: () => 'font/woff2' },
        method: 'GET',
        mode: 'cors',
        url: 'https://fonts.gstatic.com/font.woff2'
      },
      respondWith
    });

    expect(respondWith).not.toHaveBeenCalled();
    expect(harness.fetch).not.toHaveBeenCalled();
  });
});
