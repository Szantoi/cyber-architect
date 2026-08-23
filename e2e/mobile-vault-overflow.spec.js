import { test, expect, devices } from '@playwright/test';

// These contexts deliberately use Playwright's mobile-emulation flags rather
// than resizing the desktop test page. That exercises the same viewport-meta,
// touch and device-pixel-ratio path as Chrome's Device Toolbar.
const MOBILE_DEVICES = [
  { label: 'iPhone 16 Pro Max', width: 440, height: 956 },
  { label: 'compact touch phone', width: 375, height: 812 }
];

const HORIZONTAL_TOLERANCE_PX = 1;
const VIEWPORT_TOLERANCE_PX = 1;
const COMPACT_CTA_MAX_HEIGHT_PX = 52;
const COMPACT_CTA_MAX_WIDTH_PX = 220;

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

async function visitKnowledgeVault(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('cyber_theme', 'dark');
  });

  await page.goto('/knowledge', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('vault-folder-toggle')).toBeVisible();
  await expect(page.locator('#vault-main-content')).toBeVisible();
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);

  // Wrapping can change once the web fonts have loaded. Animations are not
  // relevant to this layout assertion and would only add timing flakiness.
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    `
  });
}

async function expectRealMobileEmulation(page, device) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    devicePixelRatio: window.devicePixelRatio,
    touchPoints: navigator.maxTouchPoints,
    mobileUserAgent: /Mobile|iPhone/i.test(navigator.userAgent),
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    noHover: window.matchMedia('(hover: none)').matches
  }));

  expect(metrics.innerWidth).toBe(device.width);
  expect(metrics.innerHeight).toBe(device.height);
  expect(metrics.screenWidth).toBe(device.width);
  expect(metrics.screenHeight).toBe(device.height);
  expect(metrics.devicePixelRatio).toBe(3);
  expect(metrics.touchPoints).toBeGreaterThan(0);
  expect(metrics.mobileUserAgent).toBe(true);
  expect(metrics.coarsePointer).toBe(true);
  expect(metrics.noHover).toBe(true);
}

async function collectRootOverflowDiagnostics(page) {
  return page.evaluate((tolerance) => {
    const viewportWidth = window.innerWidth;
    const root = document.scrollingElement || document.documentElement;
    const ignoredTags = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'SVG', 'PATH', 'RECT', 'CIRCLE', 'LINE', 'POLYGON']);

    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;

      for (let current = element; current; current = current.parentElement) {
        const style = window.getComputedStyle(current);
        if (
          style.display === 'none'
          || style.visibility === 'hidden'
          || Number(style.opacity) === 0
          || current.getAttribute('aria-hidden') === 'true'
        ) {
          return false;
        }
      }

      return true;
    };

    const hasIntentionalHorizontalScroller = (element) => {
      if (element.closest('pre, code, table, .overflow-x-auto, [data-horizontal-scroll]')) return true;

      for (let current = element; current; current = current.parentElement) {
        const overflowX = window.getComputedStyle(current).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
      }

      return false;
    };

    const label = (element) => {
      const id = element.id ? `#${element.id}` : '';
      const testId = element.dataset.testid ? `[data-testid="${element.dataset.testid}"]` : '';
      const classNames = Array.from(element.classList).slice(0, 2).map((name) => `.${name}`).join('');
      return `${element.tagName.toLowerCase()}${id}${testId}${classNames}`;
    };

    const offenders = [];
    for (const element of document.body.querySelectorAll('*')) {
      if (ignoredTags.has(element.tagName) || !isVisible(element) || hasIntentionalHorizontalScroller(element)) continue;

      const style = window.getComputedStyle(element);
      if (style.position === 'absolute' || style.position === 'fixed') continue;

      const rect = element.getBoundingClientRect();
      if (rect.left < -tolerance || rect.right > viewportWidth + tolerance) {
        offenders.push({
          element: label(element),
          left: Math.round(rect.left * 10) / 10,
          right: Math.round(rect.right * 10) / 10,
          width: Math.round(rect.width * 10) / 10
        });
      }
    }

    return {
      viewportWidth,
      scrollWidths: {
        documentElement: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
        scrollingElement: root.scrollWidth
      },
      offenders: offenders.slice(0, 20),
      offenderCount: offenders.length
    };
  }, HORIZONTAL_TOLERANCE_PX);
}

async function expectFullyInsideViewport(locator, label) {
  await expect(locator, `${label} must be visible`).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = await locator.page().evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

  expect(box, `${label} must have a rendered bounding box`).not.toBeNull();
  expect(box.x, `${label} is clipped left of the viewport`).toBeGreaterThanOrEqual(-VIEWPORT_TOLERANCE_PX);
  expect(box.y, `${label} is clipped above the viewport`).toBeGreaterThanOrEqual(-VIEWPORT_TOLERANCE_PX);
  expect(box.x + box.width, `${label} is clipped right of the viewport`).toBeLessThanOrEqual(viewport.width + VIEWPORT_TOLERANCE_PX);
  expect(box.y + box.height, `${label} is clipped below the viewport`).toBeLessThanOrEqual(viewport.height + VIEWPORT_TOLERANCE_PX);
}

async function expectHorizontallyInsideViewport(locator, label) {
  await expect(locator, `${label} must be visible`).toBeVisible();
  const box = await locator.boundingBox();
  const viewportWidth = await locator.evaluate(() => window.innerWidth);

  expect(box, `${label} must have a rendered bounding box`).not.toBeNull();
  expect(box.x, `${label} is clipped left of the viewport`).toBeGreaterThanOrEqual(-VIEWPORT_TOLERANCE_PX);
  expect(box.x + box.width, `${label} is clipped right of the viewport`).toBeLessThanOrEqual(viewportWidth + VIEWPORT_TOLERANCE_PX);
}

async function expectCompactSingleRowFolderCta(folderToggle, title, share) {
  await expect(folderToggle).toHaveAccessibleName(/mapp/i);
  const [folderBox, titleBox, shareBox] = await Promise.all([
    folderToggle.boundingBox(),
    title.boundingBox(),
    share.boundingBox()
  ]);

  expect(folderBox, 'Mappák CTA needs a rendered box').not.toBeNull();
  expect(titleBox, 'Vault title needs a rendered box').not.toBeNull();
  expect(shareBox, 'Megosztás action needs a rendered box').not.toBeNull();

  // It is a discoverable labelled control, but must remain a compact member of
  // the header action row — not a full-width, two-line band which pushes the
  // content below it.
  expect(folderBox.height, 'Mappák CTA should stay compact on a phone').toBeLessThanOrEqual(COMPACT_CTA_MAX_HEIGHT_PX);
  expect(folderBox.width, 'Mappák CTA should not occupy a full mobile row').toBeLessThanOrEqual(COMPACT_CTA_MAX_WIDTH_PX);
  const folderCenter = folderBox.y + folderBox.height / 2;
  const titleCenter = titleBox.y + titleBox.height / 2;
  const shareCenter = shareBox.y + shareBox.height / 2;
  expect(Math.abs(folderCenter - titleCenter), 'Mappák CTA and vault title should share one header row').toBeLessThanOrEqual(3);
  expect(Math.abs(folderCenter - shareCenter), 'Mappák CTA and Megosztás should share one header row').toBeLessThanOrEqual(3);
}

async function expectNoHorizontalOverflow(page, device, phase) {
  const diagnostics = await collectRootOverflowDiagnostics(page);
  const maxScrollWidth = Math.max(...Object.values(diagnostics.scrollWidths));

  expect(
    maxScrollWidth,
    `${phase}: the vault frame must not horizontally scroll: ${JSON.stringify(diagnostics.scrollWidths)}`
  ).toBeLessThanOrEqual(device.width + HORIZONTAL_TOLERANCE_PX);
  expect(
    diagnostics.offenderCount,
    `${phase}: normal-flow elements outside the viewport: ${JSON.stringify(diagnostics.offenders)}`
  ).toBe(0);
}

test.describe('Knowledge Vault true mobile containment', () => {
  for (const device of MOBILE_DEVICES) {
    test(`${device.label} (${device.width}×${device.height}) keeps the vault header in frame`, async ({ browser }) => {
      const context = await openMobileContext(browser, device);
      const page = await context.newPage();

      try {
        await visitKnowledgeVault(page);
        await expectRealMobileEmulation(page, device);

        const folderToggle = page.getByTestId('vault-folder-toggle');
        const share = page.getByTestId('vault-share-view');
        const title = page.getByTestId('vault-header-title');
        const titleText = title.locator('span.truncate').first();
        const vaultMain = page.locator('#vault-main-content');

        await expectFullyInsideViewport(folderToggle, 'Mappák CTA');
        await expectFullyInsideViewport(share, 'Megosztás action');
        await expectFullyInsideViewport(title, 'Knowledge Vault title');
        await expectFullyInsideViewport(titleText, 'Knowledge Vault title text');
        await expectHorizontallyInsideViewport(vaultMain, 'Knowledge Vault main layout');
        await expectCompactSingleRowFolderCta(folderToggle, title, share);

        const titleMetrics = await titleText.evaluate((element) => ({
          renderedWidth: element.getBoundingClientRect().width,
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          text: element.textContent?.trim()
        }));
        expect(titleMetrics.text).toMatch(/^(TUDÁSTÁR|KNOWLEDGE_VAULT)$/);
        expect(
          titleMetrics.scrollWidth,
          `The vault title must not truncate its text: ${JSON.stringify(titleMetrics)}`
        ).toBeLessThanOrEqual(titleMetrics.clientWidth + HORIZONTAL_TOLERANCE_PX);
        await expectNoHorizontalOverflow(page, device, 'Initial view');

        await page.evaluate(() => window.scrollTo({ top: 360, behavior: 'instant' }));
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

        // The persistent controls must remain reachable after the sticky vault
        // header has engaged, not only at the top of the page.
        await expectFullyInsideViewport(folderToggle, 'Sticky Mappák CTA');
        await expectFullyInsideViewport(share, 'Sticky Megosztás action');
        await expectFullyInsideViewport(title, 'Sticky Knowledge Vault title');
        await expectFullyInsideViewport(titleText, 'Sticky Knowledge Vault title text');
        await expectHorizontallyInsideViewport(vaultMain, 'Scrolled Knowledge Vault main layout');
        await expectCompactSingleRowFolderCta(folderToggle, title, share);
        await expectNoHorizontalOverflow(page, device, 'Scrolled view');
      } finally {
        await context.close();
      }
    });
  }
});
