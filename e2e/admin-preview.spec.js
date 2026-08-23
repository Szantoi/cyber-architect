import { test, expect } from '@playwright/test';

const VALID_ADMIN_PIN = process.env.CYBER_ARCHITECT_E2E_ADMIN_PIN || 'E2e-Admin-Pin-2026!';

const publicDocument = {
  id: 901,
  slug: 'publikus-elonezet-fixture',
  title: 'Publikus előnézeti jegyzet',
  summary: 'Egy publikus dokumentum.',
  content_type: 'knowledge',
  presentation_profile: 'knowledge',
  visibility: 'public',
  published: 1,
  category: 'TESZT',
  dimensions: {},
  read_time: '2 PERC',
  assets: []
};

const privateDraftDocument = {
  ...publicDocument,
  id: 902,
  slug: 'privat-piszkozat-elonezet-fixture',
  title: 'Privát piszkozat előnézeti jegyzet',
  summary: 'Ezt csak a szerver által hitelesített admin előnézet adhatja ki.',
  visibility: 'private',
  published: 0
};

async function mockKnowledgeList(page, observedRequests) {
  await page.route('**/api/documents**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname !== '/api/documents') return route.fallback();

    const headers = route.request().headers();
    const preview = headers['x-ca-preview'] === 'admin';
    observedRequests.push({
      preview,
      hasAdminToken: Boolean(headers['x-admin-token'])
    });

    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ docs: preview ? [publicDocument, privateDraftDocument] : [publicDocument] })
    });
  });
}

test.describe('Authenticated admin preview', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('an anonymous deep link cannot turn the public knowledge view into a private preview', async ({ page }) => {
    const observedRequests = [];
    await mockKnowledgeList(page, observedRequests);

    await page.goto('/knowledge?preview=admin');

    await expect(page.getByText(publicDocument.title)).toBeVisible();
    await expect(page.getByText(privateDraftDocument.title)).toHaveCount(0);
    await expect(page.getByTestId('admin-view-toggle')).toHaveCount(0);
    await expect.poll(() => observedRequests.length).toBeGreaterThan(0);
    expect(observedRequests.every(request => !request.preview && !request.hasAdminToken)).toBe(true);
  });

  test('a validated admin sees the private projection by default and can deliberately switch to public', async ({ page }) => {
    const observedRequests = [];
    await mockKnowledgeList(page, observedRequests);

    await page.goto('/admin');
    await page.getByLabel('BIZTONSÁGI_PIN:~$').fill(VALID_ADMIN_PIN);
    await page.getByRole('button', { name: /KONZOL MEGNYITÁSA/i }).click();
    await expect(page.getByRole('heading', { name: /Tactical CMS Matrix/i })).toBeVisible();

    await page.goto('/knowledge');
    await expect(page).toHaveURL(/\/knowledge$/);
    await expect(page.getByTestId('admin-view-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Fő navigáció')).toHaveAttribute('data-admin-active', 'true');
    await expect(page.getByText(privateDraftDocument.title)).toBeVisible();
    await expect(page.getByTestId('admin-preview-visibility-badges').first()).toContainText('PRIVÁT');
    await expect(page.getByTestId('admin-preview-visibility-badges').first()).toContainText('PISZKOZAT');
    await expect.poll(() => observedRequests.some(request => request.preview && request.hasAdminToken)).toBe(true);
    expect(observedRequests.every(request => request.preview && request.hasAdminToken)).toBe(true);

    await page.getByTestId('admin-view-toggle').click();
    await expect(page.getByTestId('admin-view-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByLabel('Fő navigáció')).toHaveAttribute('data-admin-active', 'false');
    await expect(page.getByText(privateDraftDocument.title)).toHaveCount(0);
    await expect.poll(() => observedRequests.some(request => !request.preview && !request.hasAdminToken)).toBe(true);

    await page.getByTestId('admin-view-toggle').click();
    await expect(page.getByTestId('admin-view-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Fő navigáció')).toHaveAttribute('data-admin-active', 'true');
    await expect(page.getByText(privateDraftDocument.title)).toBeVisible();
  });
});
