import { test, expect } from '@playwright/test';

const MOBILE_VIEWPORT = { width: 375, height: 812 };
const MOCK_CATEGORY = 'E2E FOLYAMATOS MAPPA';
const MOCK_DOCUMENTS = Array.from({ length: 14 }, (_, index) => ({
  id: index + 1,
  slug: `e2e-folyamatos-dokumentum-${index + 1}`,
  title: `E2E Folyamatos dokumentum ${index + 1}`,
  summary: 'Automatizált, nagy mappát reprezentáló tesztdokumentum.',
  category: MOCK_CATEGORY,
  dimensions: {
    iparag: ['Teszt iparág'],
    technologia: ['Teszt technológia'],
    celcsoport: ['Teszt célcsoport']
  },
  read_time: '5 PERC',
  updated_at: '2026-08-20'
}));

async function mockKnowledgeDocuments(page) {
  // The seeded E2E corpus is deliberately small. A routed, public-shaped
  // response lets this test exercise the real progressive-disclosure UI with
  // more records than either client-side page size.
  await page.route(/\/api\/docs(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ docs: MOCK_DOCUMENTS })
    });
  });
}

async function openKnowledgeVault(page) {
  await mockKnowledgeDocuments(page);
  await page.goto('/knowledge', { waitUntil: 'domcontentloaded' });

  await expect(page.getByTestId('vault-folder-toggle')).toBeVisible();
  await expect(page.getByTestId('vault-results')).toBeVisible();
  await expect.poll(async () => page.getByTestId('vault-result-card').count()).toBeGreaterThan(0);
}

function folderDocumentButtons(sidebar) {
  return sidebar.locator('button').filter({ hasText: /E2E Folyamatos dokumentum/i });
}

test.describe('Folder navigation discoverability and progressive disclosure', () => {
  test('the mobile Mappák control explicitly opens and closes the folder navigator', async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await openKnowledgeVault(page);

    const folderToggle = page.getByTestId('vault-folder-toggle');
    const sidebar = page.getByTestId('vault-folder-sidebar');

    await expect(folderToggle).toHaveAccessibleName(/mapp/i);
    await expect(folderToggle).toHaveAttribute('aria-controls', 'vault-folder-sidebar');
    await expect(folderToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).toBeHidden();

    await folderToggle.click();
    await expect(folderToggle).toHaveAttribute('aria-expanded', 'true');
    await expect(sidebar).toBeVisible();

    const category = sidebar.locator(`[data-testid="folder-category"][data-category="${MOCK_CATEGORY}"]`);
    await expect(category).toBeVisible();
    await category.click();

    // Selecting a folder is allowed to close the compact drawer. Reopening it
    // must retain the selected folder and make its content understandable.
    if (await folderToggle.getAttribute('aria-expanded') !== 'true') {
      await folderToggle.click();
    }
    await expect(sidebar).toBeVisible();

    const initiallyVisibleDocuments = folderDocumentButtons(sidebar);
    await expect.poll(async () => initiallyVisibleDocuments.count()).toBeGreaterThan(0);
    const initialCount = await initiallyVisibleDocuments.count();
    expect(initialCount).toBeLessThan(MOCK_DOCUMENTS.length);

    const loadMore = sidebar.getByTestId('folder-load-more');
    await expect(loadMore).toBeVisible();
    await loadMore.click();
    await expect.poll(async () => initiallyVisibleDocuments.count()).toBeGreaterThan(initialCount);
    expect(await initiallyVisibleDocuments.count()).toBeLessThanOrEqual(MOCK_DOCUMENTS.length);

    await folderToggle.click();
    await expect(folderToggle).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).toBeHidden();
  });

  test('the hub grid initially renders a finite page and reveals further items on request', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openKnowledgeVault(page);

    const results = page.getByTestId('vault-results');
    const cards = results.getByTestId('vault-result-card');
    await expect.poll(async () => cards.count()).toBeGreaterThan(0);

    const initialCount = await cards.count();
    expect(initialCount).toBeLessThan(MOCK_DOCUMENTS.length);

    const loadMore = page.getByTestId('vault-results-load-more');
    await expect(loadMore).toBeVisible();
    await loadMore.click();

    await expect.poll(async () => cards.count()).toBeGreaterThan(initialCount);
    await expect(cards).toHaveCount(MOCK_DOCUMENTS.length);
    await expect(loadMore).toBeHidden();
  });
});
