import { test, expect, devices } from '@playwright/test';

const MOBILE_DEVICES = [
  { label: 'iPhone 16 Pro Max', width: 440, height: 956 },
  { label: 'compact touch phone', width: 375, height: 812 }
];

const WIDE_IMAGE_URL = 'https://images.example.test/e2e-ultra-wide.svg';
const ARTICLE_TAIL = Array.from(
  { length: 18 },
  (_, index) => `\n\n## Kiegészítő bekezdés ${index + 1}\n\nEz a szöveg biztosítja, hogy a cikk valóban görgethető legyen a keresősáv viselkedésének ellenőrzéséhez.`
).join('');
const MOCK_DOCUMENT = {
  id: 901,
  slug: 'e2e-reszponziv-kep',
  title: 'E2E reszponzív kép',
  summary: 'Széles Markdown-kép mobil méretezési tesztje.',
  category: 'E2E VIZUÁLIS TESZT',
  dimensions: {
    iparag: ['E2E'],
    technologia: ['E2E'],
    celcsoport: ['E2E']
  },
  read_time: '1 PERC',
  updated_at: '2026-08-20'
};

const WIDE_SVG = `
  <svg xmlns="http://www.w3.org/2000/svg" width="1600" height="420" viewBox="0 0 1600 420">
    <rect width="1600" height="420" fill="#082f49" />
    <rect x="30" y="30" width="1540" height="360" fill="none" stroke="#00ffff" stroke-width="12" />
    <text x="800" y="225" text-anchor="middle" fill="#ffffff" font-family="monospace" font-size="72">1600 PX WIDE TEST IMAGE</text>
  </svg>
`;

async function openMobileContext(browser, device) {
  const iphone = devices['iPhone 16 Pro Max'];

  return browser.newContext({
    userAgent: iphone.userAgent,
    viewport: { width: device.width, height: device.height },
    screen: { width: device.width, height: device.height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });
}

async function mockImageArticle(page) {
  await page.route(/\/api\/docs(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ docs: [MOCK_DOCUMENT] })
    });
  });

  await page.route('/api/docs/e2e-reszponziv-kep', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...MOCK_DOCUMENT,
        content: `# Reszponzív kép\n\n![1600 px széles tesztábra](${WIDE_IMAGE_URL})${ARTICLE_TAIL}`
      })
    });
  });

  await page.route(/\/api\/rag\/article-chunks(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        chunks: [
          {
            chunk_id: 'e2e_chunk_01',
            heading: 'Kiegészítő bekezdés 1',
            snippet: 'Ez a szöveg biztosítja, hogy a cikk valóban görgethető legyen',
            content: 'Ez a szöveg biztosítja, hogy a cikk valóban görgethető legyen a keresősáv viselkedésének ellenőrzéséhez.',
            relevance_score: 85,
            token_count: 20,
            level: 'KEYWORD',
            is_keyword_match: true
          },
          {
            chunk_id: 'e2e_chunk_02',
            heading: 'Kiegészítő bekezdés 2',
            snippet: 'Kiegészítő bekezdés a navigáció folytatásához',
            content: 'Kiegészítő bekezdés a navigáció folytatásához.',
            relevance_score: 80,
            token_count: 16,
            level: 'KEYWORD',
            is_keyword_match: true
          }
        ],
        levelCounts: { ALL: 2, KEYWORD: 2, SEMANTIC: 0, CHUNK: 0 }
      })
    });
  });

  await page.route(WIDE_IMAGE_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: WIDE_SVG
    });
  });
}

async function openImageArticle(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('cyber_theme', 'dark');
    window.localStorage.setItem('vault_tree_pivot_mode', 'drive');
  });
  await mockImageArticle(page);
  await page.goto('/knowledge', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('vault-result-card')).toBeVisible();
  await page.getByTestId('vault-result-card').click();
  await expect(page.getByTestId('markdown-image')).toBeVisible();
  await page.waitForFunction(() => {
    const image = document.querySelector('[data-testid="markdown-image"]');
    return image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
  });
}

async function expectInsideViewport(locator, label) {
  const box = await locator.boundingBox();
  const viewport = await locator.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));

  expect(box, `${label} must have a rendered bounding box`).not.toBeNull();
  expect(box.x, `${label} must not be clipped on the left`).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width, `${label} must not be clipped on the right`).toBeLessThanOrEqual(viewport.width + 1);
}

test.describe('Markdown images stay inside mobile article bounds', () => {
  for (const device of MOBILE_DEVICES) {
    test(`${device.label} (${device.width}×${device.height}) constrains a 1600 px article image`, async ({ browser }) => {
      const context = await openMobileContext(browser, device);
      const page = await context.newPage();
      const nestingErrors = [];
      page.on('console', (message) => {
        if (message.type() === 'error' && /cannot be a descendant of <p>/i.test(message.text())) {
          nestingErrors.push(message.text());
        }
      });

      try {
        await openImageArticle(page);

        const frame = page.getByTestId('markdown-image-frame');
        const image = page.getByTestId('markdown-image');
        const articleSearch = page.getByTestId('in-article-search-console');
        await expectInsideViewport(frame, 'Markdown image frame');
        await expectInsideViewport(image, 'Markdown image');
        await expect(articleSearch).toHaveCSS('position', 'relative');

        await page.evaluate(() => window.scrollTo({ top: 360, behavior: 'instant' }));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
        const searchBoxAfterScroll = await articleSearch.boundingBox();
        expect(searchBoxAfterScroll?.y, 'The article search must scroll away with the article').toBeLessThan(0);

        const searchInput = articleSearch.getByRole('textbox', { name: /keresés a cikken belül/i });
        await searchInput.fill('Kiegészítő');
        await expect(articleSearch).toHaveCSS('position', 'sticky');
        await expect(articleSearch.getByTitle('Következő találat (Enter)')).toBeVisible();
        await page.evaluate(() => window.scrollTo({ top: 720, behavior: 'instant' }));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(360);
        const stickySearchMetrics = await articleSearch.evaluate((element) => ({
          top: Number.parseFloat(window.getComputedStyle(element).top),
          renderedTop: element.getBoundingClientRect().top
        }));
        expect(stickySearchMetrics.renderedTop, 'An active article search must remain in view while reading').toBeGreaterThan(0);
        expect(Math.abs(stickySearchMetrics.renderedTop - stickySearchMetrics.top)).toBeLessThanOrEqual(2);

        const metrics = await image.evaluate((element) => {
          const imageRect = element.getBoundingClientRect();
          const frameRect = element.closest('[data-testid="markdown-image-frame"]')?.getBoundingClientRect();
          const figureRect = element.closest('figure')?.getBoundingClientRect();
          const root = document.scrollingElement || document.documentElement;

          return {
            naturalWidth: element.naturalWidth,
            renderedWidth: imageRect.width,
            frameWidth: frameRect?.width,
            figureWidth: figureRect?.width,
            rootScrollWidth: root.scrollWidth,
            viewportWidth: window.innerWidth
          };
        });

        expect(metrics.naturalWidth).toBeGreaterThan(device.width);
        expect(metrics.renderedWidth).toBeLessThanOrEqual((metrics.frameWidth || 0) + 1);
        expect(metrics.frameWidth).toBeLessThanOrEqual((metrics.figureWidth || 0) + 1);
        expect(metrics.rootScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth + 1);

        await image.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await expectInsideViewport(dialog.getByRole('img'), 'Expanded Markdown image');
        await page.getByRole('button', { name: /bezárás/i }).click();
        await expect(dialog).toBeHidden();
        expect(nestingErrors, 'A Markdown image must not create invalid block elements inside a paragraph').toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
