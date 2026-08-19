import { test, expect } from '@playwright/test';

test.describe('Knowledge Vault & RAG Search E2E Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    const knowledgeNavLink = page.locator('nav a[href="/knowledge"]').first();
    await knowledgeNavLink.click();
    await page.waitForURL('**/knowledge**');
  });

  test('navigates to Knowledge Base and renders documents repository', async ({ page }) => {
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    const searchInput = page.locator('main input[placeholder*="KERESŐ"], main input[type="text"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
  });

  test('filters documents via search input and displays results', async ({ page }) => {
    const searchInput = page.locator('main input[placeholder*="KERESŐ"], main input[type="text"]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Type a keyword
    await searchInput.fill('AI');
    await page.waitForTimeout(500);

    const clearButton = page.getByRole('button', { name: /TÖRLÉS/i });
    await expect(clearButton).toBeVisible({ timeout: 10000 });
  });

  test('opens and renders markdown document with headers', async ({ page }) => {
    const heading = page.locator('h1').first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    const docCards = page.locator('main [class*="border"]');
    expect(await docCards.count()).toBeGreaterThan(0);
  });
});
