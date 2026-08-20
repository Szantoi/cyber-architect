import { test, expect } from '@playwright/test';

test.describe('Public User Journey Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible();
  });

  test('loads home page with hero section, title and cyber styling', async ({ page }) => {
    await expect(page).toHaveTitle(/Cyber-Architect|Szántói Gábor/i);
    const heroTitle = page.locator('h1');
    await expect(heroTitle).toBeVisible();
    await expect(heroTitle).toContainText(/Szántói/i);
  });

  test('toggles dark and light cyber themes smoothly', async ({ page }) => {
    const themeButton = page.getByRole('button', { name: /váltás (világos|sötét) témára/i });
    await expect(themeButton).toBeVisible();

    const htmlElement = page.locator('html');
    const initialClass = await htmlElement.getAttribute('class');

    await themeButton.click();
    const newClass = await htmlElement.getAttribute('class');
    expect(newClass).not.toBe(initialClass);

    await themeButton.click();
    const revertedClass = await htmlElement.getAttribute('class');
    expect(revertedClass).toBe(initialClass);
  });

  test('scrolls to Arsenal section and displays skill cards', async ({ page }) => {
    const arsenalSection = page.locator('#arsenal, section:has-text("Arsenal")').first();
    await expect(arsenalSection).toBeVisible();

    const skillCards = page.locator('#arsenal [class*="border"]');
    expect(await skillCards.count()).toBeGreaterThan(0);
  });

  test('submits Uplink contact form and displays transmission confirmation', async ({ page }) => {
    const identityInput = page.locator('#identity, input[name="identity"]').first();
    const subjectInput = page.locator('#subject, input[name="subject"]').first();
    const messageInput = page.locator('#message, textarea[name="message"]').first();

    await identityInput.fill('Playwright E2E Tester');
    await subjectInput.fill('Automatizált E2E Rendszertisztítás');
    await messageInput.fill('Ez egy automatizált Playwright E2E tesztüzenet.');

    const submitButton = page.locator('button[type="submit"]:has-text("ÜZENET KÜLDÉSE"), button[type="submit"]:has-text("TRANSMIT")').first();
    await submitButton.click();

    // Expect confirmation feedback message
    const feedback = page.locator('text=SIKERESEN TOVÁBBÍTVA').first();
    await expect(feedback).toBeVisible({ timeout: 10000 });
  });
});
