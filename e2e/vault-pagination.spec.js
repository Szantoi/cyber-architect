import { test, expect } from '@playwright/test';

const PRIMARY_FOLDER = 'E2E LAPOZÁSI MINTAMAPPA';
const SECONDARY_FOLDER = 'E2E MÁSODLAGOS MAPPA';
const FILTERED_INDUSTRY = 'E2E SZŰRT IPARÁG';
const OTHER_INDUSTRY = 'E2E EGYÉB IPARÁG';

const TOTAL_DOCUMENTS = 36;
const PRIMARY_FOLDER_DOCUMENTS = 30;
const FILTERED_FOLDER_DOCUMENTS = 15;
const INITIAL_HUB_PAGE_SIZE = 12;
const HUB_PAGE_SIZE = 12;

const MOCK_DOCUMENTS = Array.from({ length: TOTAL_DOCUMENTS }, (_, index) => {
  const isInPrimaryFolder = index < PRIMARY_FOLDER_DOCUMENTS;
  const isInFilteredIndustry = index < FILTERED_FOLDER_DOCUMENTS;

  return {
    id: index + 1,
    slug: `e2e-lapozott-dokumentum-${index + 1}`,
    title: `E2E lapozott dokumentum ${index + 1}`,
    summary: 'Nagy találati halmazt reprezentáló, lapozási regressziós tesztdokumentum.',
    category: isInPrimaryFolder ? PRIMARY_FOLDER : SECONDARY_FOLDER,
    dimensions: {
      iparag: [isInFilteredIndustry ? FILTERED_INDUSTRY : OTHER_INDUSTRY],
      technologia: ['E2E technológia'],
      celcsoport: ['E2E célcsoport']
    },
    read_time: '5 PERC',
    created_at: `2026-08-${String((index % 28) + 1).padStart(2, '0')}`,
    updated_at: '2026-08-20'
  };
});

async function mockLargeKnowledgeCorpus(page) {
  // The public API-shaped mock lets the browser exercise the actual React
  // pagination state, instead of testing a local helper in isolation.
  await page.route(/\/api\/docs(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ docs: MOCK_DOCUMENTS })
    });
  });
}

async function openKnowledgeVault(page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    // A remembered non-drive tree pivot would make the category fixture
    // ambiguous. The test deliberately uses the default folder hierarchy.
    window.localStorage.clear();
  });
  await mockLargeKnowledgeCorpus(page);
  await page.goto('/knowledge?pivot=drive', { waitUntil: 'domcontentloaded' });

  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
      }
    `
  });
  await expect(page.getByTestId('vault-results')).toBeVisible();
  await expect(page.getByTestId('vault-folder-sidebar')).toBeVisible();
}

async function expectRenderedCardCount(cards, expectedCount, message) {
  await expect.poll(async () => cards.count(), { message }).toBe(expectedCount);
}

test.describe('Knowledge Vault result pagination', () => {
  test('keeps a large corpus paged and resets the visible page after folder and filter changes', async ({ page }) => {
    await openKnowledgeVault(page);

    const results = page.getByTestId('vault-results');
    const cards = results.getByTestId('vault-result-card');
    const loadMore = page.getByTestId('vault-results-load-more');

    // A 36-item API response must not become a 36-card DOM list on first
    // paint. The initial UI is deliberately limited to its first page.
    await expectRenderedCardCount(
      cards,
      INITIAL_HUB_PAGE_SIZE,
      'The initial hub view must render only its finite first result page'
    );
    expect(await cards.count()).toBeLessThan(TOTAL_DOCUMENTS);
    await expect(loadMore).toBeVisible();
    await expect(loadMore).toHaveAccessibleName(/további.*cikk.*betölt/i);

    // One interaction must append exactly one page, rather than mounting the
    // entire remaining corpus in the DOM.
    await loadMore.click();
    await expectRenderedCardCount(
      cards,
      INITIAL_HUB_PAGE_SIZE + HUB_PAGE_SIZE,
      'Loading more results must append one finite page only'
    );
    expect(await cards.count()).toBeLessThan(TOTAL_DOCUMENTS);
    await expect(loadMore).toBeVisible();

    // Folder selection changes the result set. It must not inherit the prior
    // 24-card disclosure count; the new 30-document folder begins at page one.
    const primaryFolder = page.locator(
      `[data-testid="folder-category"][data-category="${PRIMARY_FOLDER}"]`
    );
    await expect(primaryFolder).toBeVisible();
    await primaryFolder.click();
    await expectRenderedCardCount(
      cards,
      INITIAL_HUB_PAGE_SIZE,
      'Changing folders must reset the hub to its first finite page'
    );
    await expect(loadMore).toBeVisible();

    await loadMore.click();
    await expectRenderedCardCount(
      cards,
      INITIAL_HUB_PAGE_SIZE + HUB_PAGE_SIZE,
      'The selected folder must still reveal only its next page on demand'
    );
    expect(await cards.count()).toBeLessThan(PRIMARY_FOLDER_DOCUMENTS);

    // The standard industry filter is a separate stable user interaction.
    // Its 15 matching documents must reset from the prior 24 visible cards to
    // the first page, then reveal only its three-item remainder on request.
    await page.locator('#vault-industry-knowledge').selectOption(FILTERED_INDUSTRY);
    await expectRenderedCardCount(
      cards,
      INITIAL_HUB_PAGE_SIZE,
      'Changing a filter must reset the hub to its first finite page'
    );
    await expect(loadMore).toBeVisible();

    await loadMore.click();
    await expectRenderedCardCount(
      cards,
      FILTERED_FOLDER_DOCUMENTS,
      'The final partial page must render only the remaining matching cards'
    );
    await expect(loadMore).toBeHidden();
  });
});
