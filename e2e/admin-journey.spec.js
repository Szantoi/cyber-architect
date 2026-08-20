import { test, expect } from '@playwright/test';

const VALID_ADMIN_PIN = process.env.CYBER_ARCHITECT_E2E_ADMIN_PIN || 'E2e-Admin-Pin-2026!';

test.describe('Admin Portal Journey E2E Suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      try {
        localStorage.clear();
      } catch {}
    });
    const adminNavLink = page.locator('nav a[href="/admin"]').first();
    await adminNavLink.click();
    await page.waitForURL('**/admin');
  });

  test('requires PIN authentication and rejects invalid credentials', async ({ page }) => {
    const pinInput = page.locator('input[type="password"]').first();
    await expect(pinInput).toBeVisible({ timeout: 10000 });

    // Enter wrong PIN
    await pinInput.fill('0000');
    const loginButton = page.getByRole('button', { name: /KONZOL MEGNYITÁSA/i });
    await loginButton.click();

    // Expect error message container
    const errorMessage = page.locator('text=HOZZÁFÉRÉS ELUTASÍTVA').first();
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
  });

  test('successfully authenticates with valid PIN and unlocks dashboard tabs', async ({ page }) => {
    const pinInput = page.locator('input[type="password"]').first();
    await expect(pinInput).toBeVisible({ timeout: 10000 });

    // Enter the isolated test PIN configured by Playwright.
    await pinInput.fill(VALID_ADMIN_PIN);
    const loginButton = page.getByRole('button', { name: /KONZOL MEGNYITÁSA/i });
    await loginButton.click();

    // Expect Admin Dashboard loaded
    const dashboardHeader = page.getByRole('heading', { name: /Tactical CMS Matrix/i });
    await expect(dashboardHeader).toBeVisible({ timeout: 10000 });

    // Verify Arsenal tab switching
    const skillsTab = page.getByRole('button', { name: /ARSENAL/i });
    await expect(skillsTab).toBeVisible({ timeout: 10000 });
    await skillsTab.click();
    await expect(page.getByRole('button', { name: /ADD_SKILL_MODULE/i })).toBeVisible({ timeout: 10000 });

    // Verify Audit tab switching
    const auditTab = page.getByRole('button', { name: /AUDIT_STREAM/i });
    await expect(auditTab).toBeVisible({ timeout: 10000 });
    await auditTab.click();
    await expect(page.locator('text=AUDIT_LOG_STREAM').first()).toBeVisible({ timeout: 10000 });
  });

  test('logs out securely and returns to PIN gate', async ({ page }) => {
    const pinInput = page.locator('input[type="password"]').first();
    await expect(pinInput).toBeVisible({ timeout: 10000 });

    await pinInput.fill(VALID_ADMIN_PIN);
    const loginButton = page.getByRole('button', { name: /KONZOL MEGNYITÁSA/i });
    await loginButton.click();

    // Verify dashboard is loaded
    await expect(page.getByRole('heading', { name: /Tactical CMS Matrix/i })).toBeVisible({ timeout: 10000 });

    // Click TERMINATE_SESSION logout button
    const logoutBtn = page.getByRole('button', { name: /TERMINATE_SESSION/i });
    await expect(logoutBtn).toBeVisible({ timeout: 10000 });
    await logoutBtn.click();

    // Verify redirected back to PIN input
    const pinInputAfterLogout = page.locator('input[type="password"]').first();
    await expect(pinInputAfterLogout).toBeVisible({ timeout: 10000 });
  });
});
