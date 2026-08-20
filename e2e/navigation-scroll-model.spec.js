import { test, expect } from '@playwright/test';

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const VERTICAL_SCROLL_TOLERANCE_PX = 2;

const SECONDARY_MOBILE_MENU_ITEMS = [
  /MCP\s*UPLINK/i,
  /MÓDSZERTAN/i,
  /ESZKÖZTÁR/i,
  /ARCHITEKTÚRA/i,
  /KAPCSOLAT/i,
  /ADMIN/i
];

const VAULT_ROUTES = [
  { path: '/blog', label: 'Blog' },
  { path: '/knowledge', label: 'Tudástár' }
];

async function settlePublicPage(page, route) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#root > *').first()).toBeVisible();
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);

  // This suite checks layout and semantics, not animation frames. Stabilising
  // motion also makes the in-viewport assertion deterministic.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    `
  });
  await page.evaluate(async () => {
    await document.fonts?.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
}

async function openMobileMoreSheet(page) {
  const trigger = page.getByTestId('mobile-more-trigger');
  await expect(trigger).toBeVisible();
  await trigger.click();

  const sheet = page.getByTestId('mobile-more-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('role', 'dialog');
  await expect(sheet).toHaveAttribute('aria-modal', 'true');

  // Playwright considers a transformed element visible before Framer Motion's
  // entrance animation reaches its final position. Wait for the sheet itself
  // to be fully inside the viewport before measuring its touch targets.
  await expect.poll(async () => {
    const box = await sheet.boundingBox();
    return box ? box.y + box.height : Number.POSITIVE_INFINITY;
  }, {
    message: 'The mobile navigation sheet must finish entering the viewport'
  }).toBeLessThanOrEqual(MOBILE_VIEWPORT.height);

  return sheet;
}

async function collectVaultScrollDiagnostics(page) {
  return page.evaluate((tolerance) => {
    const root = document.scrollingElement || document.documentElement;
    const vaultMain = document.querySelector('#vault-main-content');

    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;

      for (let current = element; current; current = current.parentElement) {
        const style = window.getComputedStyle(current);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
      }

      return true;
    };

    const hasIntentionalLocalScroll = (element) => {
      if (element.closest('pre, code, table')) return true;
      if (element.closest('[role="dialog"], [aria-modal="true"], [data-testid*="sheet"], [data-testid*="drawer"]')) return true;

      // Drawers and modals are allowed to manage their own scroll while open;
      // a fixed-position ancestor makes this an overlay, not a second page.
      for (let current = element; current; current = current.parentElement) {
        if (window.getComputedStyle(current).position === 'fixed') return true;
      }

      return false;
    };

    const describe = (element) => {
      const classNames = Array.from(element.classList).slice(0, 3).map((name) => `.${name}`).join('');
      return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${classNames}`;
    };

    const nestedVerticalScrollers = [];
    for (const element of document.body.querySelectorAll('*')) {
      if (element === document.body || element === document.documentElement || element === root) continue;
      if (!isVisible(element) || hasIntentionalLocalScroll(element)) continue;

      const style = window.getComputedStyle(element);
      const enablesVerticalScroll = style.overflowY === 'auto' || style.overflowY === 'scroll';
      if (enablesVerticalScroll && element.scrollHeight > element.clientHeight + tolerance) {
        nestedVerticalScrollers.push({
          element: describe(element),
          overflowY: style.overflowY,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight
        });
      }
    }

    return {
      root: {
        clientHeight: root.clientHeight,
        scrollHeight: root.scrollHeight,
        overflowY: window.getComputedStyle(root).overflowY
      },
      vaultMain: vaultMain && {
        overflowY: window.getComputedStyle(vaultMain).overflowY,
        clientHeight: vaultMain.clientHeight,
        scrollHeight: vaultMain.scrollHeight,
        scrollTop: vaultMain.scrollTop
      },
      nestedVerticalScrollers
    };
  }, VERTICAL_SCROLL_TOLERANCE_PX);
}

test.describe('Mobile navigation and single-scroll regression', () => {
  test.use({
    viewport: MOBILE_VIEWPORT,
    colorScheme: 'light'
  });

  test('the Tovább bottom sheet exposes every secondary destination and closes consistently', async ({ page }) => {
    await settlePublicPage(page, '/');

    const sheet = await openMobileMoreSheet(page);
    for (const itemName of SECONDARY_MOBILE_MENU_ITEMS) {
      const item = sheet.getByRole('link', { name: itemName });
      await expect(item, `${itemName} must be reachable from the mobile Tovább menu`).toBeVisible();

      const box = await item.boundingBox();
      expect(box, `${itemName} must have an on-screen touch target`).not.toBeNull();
      expect(box.y, `${itemName} is clipped above the viewport`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${itemName} is clipped below the viewport`).toBeLessThanOrEqual(MOBILE_VIEWPORT.height);
    }

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    const reopenedSheet = await openMobileMoreSheet(page);
    await page.getByTestId('mobile-more-backdrop').click({ position: { x: 8, y: 8 } });
    await expect(reopenedSheet).toBeHidden();
  });

  for (const route of VAULT_ROUTES) {
    test(`${route.label} uses the document as its only normal-flow vertical scroller`, async ({ page }) => {
      await settlePublicPage(page, route.path);
      await expect(page.locator('#vault-main-content')).toBeVisible();

      const diagnostics = await collectVaultScrollDiagnostics(page);
      expect(diagnostics.vaultMain, `${route.label} must expose its primary content region`).not.toBeNull();
      expect(
        diagnostics.vaultMain.overflowY,
        `${route.label} must not make #vault-main-content a nested scroll container`
      ).not.toMatch(/auto|scroll/);
      expect(
        diagnostics.root.scrollHeight,
        `${route.label} should flow through the document-level scrollbar`
      ).toBeGreaterThan(diagnostics.root.clientHeight + VERTICAL_SCROLL_TOLERANCE_PX);
      expect(
        diagnostics.nestedVerticalScrollers,
        `${route.label} has an unintended normal-flow nested vertical scroller: ${JSON.stringify(diagnostics.nestedVerticalScrollers)}`
      ).toEqual([]);

      const pageScroll = await page.evaluate(() => {
        window.scrollTo({ top: 360, behavior: 'instant' });
        return {
          top: window.scrollY,
          mainTop: document.querySelector('#vault-main-content')?.scrollTop ?? 0
        };
      });
      expect(pageScroll.top, `${route.label} content must scroll via the document`).toBeGreaterThan(0);
      expect(pageScroll.mainTop, `${route.label} must not accumulate a separate main-content scroll position`).toBe(0);
    });
  }
});
