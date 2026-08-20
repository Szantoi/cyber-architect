import { test, expect } from '@playwright/test';

const PUBLIC_ROUTES = ['/', '/blog', '/knowledge', '/architecture', '/mcp'];

test.describe('Public accessibility regressions', () => {
  test.use({ reducedMotion: 'reduce' });

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  });

  test('offers landmarks, a keyboard skip link and labelled contact fields', async ({ page }) => {
    await expect(page.getByRole('navigation', { name: 'Fő navigáció' })).toBeVisible();
    await expect(page.getByRole('main')).toHaveCount(1);

    await page.evaluate(() => document.activeElement?.blur());
    await page.keyboard.press('Tab');

    const skipLink = page.getByRole('link', { name: 'Ugrás a fő tartalomra' });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();

    await expect(page.getByRole('textbox', { name: /NÉV_ÉS_EMAIL/i })).toHaveAttribute('required', '');
    await expect(page.getByRole('textbox', { name: /TÉMA/i })).toHaveAttribute('required', '');
    await expect(page.getByRole('textbox', { name: /ÜZENET/i })).toBeVisible();
  });

  test('opens and closes a project dialog entirely from the keyboard', async ({ page }) => {
    const projectTrigger = page.getByRole('button', { name: /részleteinek megnyitása/i }).first();
    await expect(projectTrigger).toBeVisible();

    await projectTrigger.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: /CYBER-ARCHITECT/i });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Bezárás', exact: true })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(projectTrigger).toBeFocused();
  });

  test('restores menu-trigger focus after Escape', async ({ page }) => {
    const menuTrigger = page.getByTitle('További menüpontok');
    await menuTrigger.focus();
    await page.keyboard.press('Enter');

    await expect(menuTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#desktop-more-menu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(menuTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(menuTrigger).toBeFocused();
  });

  test('honours reduced-motion and keeps focus visibly indicated', async ({ page }) => {
    const animation = await page.locator('.animate-flicker').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        duration: style.animationDuration,
        iterations: style.animationIterationCount
      };
    });

    expect(Number.parseFloat(animation.duration)).toBeLessThanOrEqual(0.001);
    expect(animation.iterations).toBe('1');

    const identityField = page.getByRole('textbox', { name: /NÉV_ÉS_EMAIL/i });
    await identityField.focus();
    const focusStyle = await identityField.evaluate((element) => {
      const style = getComputedStyle(element);
      return { width: style.outlineWidth, type: style.outlineStyle };
    });

    expect(focusStyle.type).not.toBe('none');
    expect(Number.parseFloat(focusStyle.width)).toBeGreaterThanOrEqual(3);
  });

  test('keeps public-route landmarks, form controls and images semantically named', async ({ page }) => {
    test.setTimeout(60_000);

    for (const route of PUBLIC_ROUTES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);

      await expect(page.getByRole('main'), `${route} must have one main landmark`).toHaveCount(1);
      await expect(page.locator('main h1').first(), `${route} must have a primary heading`).toBeVisible();

      const issues = await page.locator('main').evaluate((main) => {
        const isVisible = (element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };

        const hasLabel = (control) => {
          if (control.labels?.length) return true;
          if (control.getAttribute('aria-label')?.trim()) return true;
          const labelledBy = control.getAttribute('aria-labelledby');
          return Boolean(labelledBy && labelledBy.split(/\s+/).some((id) => document.getElementById(id)?.textContent.trim()));
        };

        const controlIssues = Array.from(main.querySelectorAll('input:not([type="hidden"]), textarea, select'))
          .filter(isVisible)
          .filter((control) => !hasLabel(control))
          .map((control) => `${control.tagName.toLowerCase()}[name="${control.getAttribute('name') || ''}"]`);

        const imageIssues = Array.from(main.querySelectorAll('img'))
          .filter(isVisible)
          .filter((image) => !image.hasAttribute('alt'))
          .map((image) => image.currentSrc || image.src);

        const keyboardIssues = Array.from(main.querySelectorAll('[role="button"]'))
          .filter(isVisible)
          .filter((element) => element.tabIndex < 0)
          .map((element) => element.textContent.trim().slice(0, 60));

        return { controlIssues, imageIssues, keyboardIssues };
      });

      expect(issues, `${route} semantic issues`).toEqual({
        controlIssues: [],
        imageIssues: [],
        keyboardIssues: []
      });
    }
  });
});
